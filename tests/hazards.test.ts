/** The hazards: the restless dead, the Gloam and its pressure, wild surges, fire, a full bot-run town, and the losses each
 *  named by its cause. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, TICKS_PER_DAY, Zone, idx } from '../src/sim/types';
import { dailyDeath, dailyGloam, dailySurge, dailyFire, computeGloamPressure, dailyGloamPressure } from '../src/sim/hazards';
import { updateMana } from '../src/sim/networks';
import { deserialize, serialize } from '../src/sim/save';
import { flatten } from './helpers';

describe('restless dead', () => {
  it('rise when the dead are not quieted, and the Watch lays them down', () => {
    const s = createGame(11, 'Grave');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 4, f.x + 12, f.y + 12);
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    for (let x = f.x - 9; x <= f.x + 9; x++) {
      const b = placeBuildingRaw(s, 'hearth', x, f.y + 4, 3);
      b.residents = 14;
    }
    s.population = 19 * 14;
    recomputeAll(s);
    // no deathcare at all: simulate deaths directly
    s.unquieted = 45;
    dailyDeath(s);
    const restless = s.agents.filter((a) => a.kind === AgentKind.Restless).length;
    expect(restless).toBeGreaterThanOrEqual(2);
    expect(s.stats.restlessTotal).toBe(restless);
    // strong watch coverage everywhere -> they get cleared over a few days
    s.coverage.watch.fill(255);
    for (let d = 0; d < 12; d++) dailyDeath(s);
    expect(s.agents.filter((a) => a.kind === AgentKind.Restless).length).toBeLessThan(restless);
  });
  it('ends the game in the Long Night at 40 restless', () => {
    const s = createGame(12, 'Night');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 4, f.x + 12, f.y + 12);
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    const b = placeBuildingRaw(s, 'hearth', f.x, f.y + 4, 1);
    b.residents = 4;
    s.unquieted = 20 * 45;
    dailyDeath(s);
    expect(s.gameOver).toMatch(/Long Night/);
  });
});

describe('gloam', () => {
  it('creeps over unwarded land and is burned back by a lit ward lantern', () => {
    const s = createGame(13, 'Grey');
    const before = s.stats.gloamTiles || s.gloam.reduce((a, b) => a + b, 0);
    s.day = 40;
    for (let d = 0; d < 8; d++) {
      s.day++;
      dailyGloam(s);
    }
    const after = s.gloam.reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before);
    // put a lit ward lantern on a gloam pocket
    let gi = -1;
    for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i]) { gi = i; break; }
    const gx = gi % s.w;
    const gy = (gi / s.w) | 0;
    const b = placeBuildingRaw(s, 'wardlantern', Math.min(s.w - 2, gx + 1), Math.min(s.h - 2, gy + 1));
    b.lit = true;
    s.gloam[idx(b.x, b.y)] = 0;
    const count = () => { let n = 0; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = b.x + dx, y = b.y + dy; if (x >= 0 && y >= 0 && x < s.w && y < s.h && dx * dx + dy * dy <= 36) n += s.gloam[idx(x, y)]; } return n; };
    const n0 = count();
    s.day = 101; // not a creep day
    dailyGloam(s);
    expect(n0 - count()).toBe(Math.min(n0, 12)); // twelve a day, the nearest first
    for (let d = 0; d < 30; d++) { s.day += 1; if (s.day % 4 === 0) s.day++; dailyGloam(s); }
    let near = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (x >= 0 && y >= 0 && x < s.w && y < s.h && dx * dx + dy * dy <= 36) near += s.gloam[idx(x, y)];
    }
    expect(near).toBe(0);
  });
  it('loses the game when gloam reaches the founding node', () => {
    const s = createGame(14, 'Lost');
    const f = s.founding;
    s.gloam[idx(f.x + 2, f.y)] = 1;
    dailyGloam(s);
    expect(s.gameOver).toMatch(/light goes out/);
  });
});

describe('wild surge', () => {
  it('warps buildings after five days of heavy overdraw, then grants a grace period', () => {
    const s = createGame(15, 'Surge');
    const f = s.founding;
    flatten(s, f.x - 32, f.y - 4, f.x + 32, f.y + 8);
    s.nodes = [s.nodes[0]];
    buildRoad(s, RoadType.Track, roadPath(f.x - 30, f.y + 3, f.x + 30, f.y + 3, false));
    for (let x = f.x - 29; x <= f.x + 29; x++) placeBuildingRaw(s, 'arcane', x, f.y + 2, 3);
    updateMana(s);
    expect(s.manaDemand).toBeGreaterThan(s.manaSupply * 1.25);
    for (let d = 0; d < 4; d++) dailySurge(s);
    expect(s.stats.surgesTotal).toBe(0);
    dailySurge(s);
    expect(s.stats.surgesTotal).toBe(1);
    expect(s.buildings.filter((b) => b && b.state === 'ruin').length).toBeGreaterThanOrEqual(2);
    expect(s.overdrawDays).toBeLessThan(0);
  });
});

describe('fire', () => {
  it('spreads without a brigade and is put out with full coverage', () => {
    const s = createGame(16, 'Burn');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 4, f.x + 12, f.y + 12);
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    const houses = [];
    for (let x = f.x - 9; x <= f.x + 9; x++) houses.push(placeBuildingRaw(s, 'hearth', x, f.y + 4, 1));
    houses[9].state = 'burning';
    s.coverage.fire.fill(0);
    for (let d = 0; d < 6; d++) dailyFire(s);
    const damaged = houses.filter((h) => h.state !== 'ok').length;
    expect(damaged).toBeGreaterThan(1);
    // with coverage, a fresh fire is put out within a few days almost surely
    const s2 = createGame(16, 'Safe');
    flatten(s2, f.x - 12, f.y - 4, f.x + 12, f.y + 12);
    const h = placeBuildingRaw(s2, 'hearth', f.x, f.y + 4, 1);
    h.state = 'burning';
    s2.coverage.fire.fill(255);
    for (let d = 0; d < 3 && h.state === 'burning'; d++) dailyFire(s2);
    expect(h.state).not.toBe('ruin');
  });
});

describe('a full bot-run town', () => {
  it('reaches Township within 60 days and never produces NaN', async () => {
    const { Bot } = await import('../src/sim/bot');
    const s = createGame(21, 'Bot');
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 60, { onDay: () => bot.step() });
    expect(s.milestone).toBeGreaterThanOrEqual(4);
    expect(s.gameOver).toBeNull();
    for (const k of ['treasury', 'happiness', 'health', 'unrest', 'educated', 'manaDemand', 'unquieted'] as const) expect(Number.isFinite(s[k])).toBe(true);
    for (const b of s.buildings) if (b) { expect(Number.isFinite(b.progress)).toBe(true); expect(b.residents).toBeGreaterThanOrEqual(0); }
    for (const a of s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
  }, 60000);
});

// The Gloam's pressure.
describe('Gloam pressure', () => {
  it('pressure rises with the dead and with overdraw', () => {
    const s = createGame(41, 'Press');
    const base = computeGloamPressure(s);
    s.unquieted = 80;
    expect(computeGloamPressure(s)).toBeGreaterThan(base);
    s.unquieted = 0;
    s.overdrawDays = 2;
    expect(computeGloamPressure(s)).toBeCloseTo(base + 0.15, 5);
    dailyGloamPressure(s);
    expect(s.gloamPressure).toBeGreaterThan(0);
  });
});

/** Every loss names its cause (DESIGN 4.101); old saves load. The wyrm's razing and the hounds' Hush siege were parked in the
 *  scope reset (phase 1b); the causes left are the Gloam, the restless and the Crown. A cause survives a save since phase 1d. */
describe('Causes and old saves', () => {
  it('a loss cause survives a save (it did not before phase 1d: createGame never set the field, so the load skipped it)', () => {
    const s = createGame(70, 'Losswick');
    s.gameOver = 'The restless overran the city.';
    s.lostTo = 'restless';
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'x'));
    expect(back.lostTo).toBe('restless');
    expect(back.gameOver).toBe(s.gameOver);
  });

  it('a save without a loss cause loads with none', () => {
    const s = createGame(70, 'Losswick');
    s.lostTo = 'restless';
    const o = JSON.parse(serialize(s));
    delete o.lostTo;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'x'));
    expect(old.lostTo).toBeUndefined();
  });
});
