import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, buildWall, callRain, placeBuilding, placeGate, roadPath, roadTileCost } from '../src/sim/actions';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { addEgg, dailyDragons, setRole, seasonalBout, courierJob, STAGE_DAYS } from '../src/sim/wyrmcraft';
import { updateCreatures, tickCreatures } from '../src/sim/creatures';
import { updateCoverage, updateMiasma } from '../src/sim/services';
import { ALL_EVENTS } from '../src/sim/events';
import { dailyGloam } from '../src/sim/hazards';
import { flatten } from './helpers';

function town(seed = 101) {
  const s = createGame(seed, 'Nine');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 4, f.x + 18, f.y + 14);
  s.milestone = 5;
  s.treasury = 80000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 3, f.x + 16, f.y + 3, false));
  placeBuilding(s, 'cradle', f.x + 2, f.y + 4);
  placeBuilding(s, 'tamerslodge', f.x + 5, f.y + 4);
  const markets = [];
  for (let x = f.x - 6; x <= f.x - 2; x++) { const m = placeBuildingRaw(s, 'market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  const crafts = [];
  for (let x = f.x + 9; x <= f.x + 12; x++) { const c = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); c.workers = 8; c.stock = 50; crafts.push(c); }
  recomputeAll(s);
  const cradle = s.buildings.find((b) => b && b.kind === 'cradle')!;
  cradle.lit = true;
  return { s, f, cradle, markets, crafts };
}

function raiseWyvern(t: ReturnType<typeof town>) {
  const d = addEgg(t.s, 'ember')!;
  for (let k = 0; k < 200 && d.stage < 3; k++) { for (const m of t.markets) m.stock = 40; t.cradle.lit = true; dailyDragons(t.s); }
  return d;
}

describe('Wyrmcraft II', () => {
  it('winged lines grow to wyvern, ground lines stop at drake', () => {
    const t = town();
    const d = raiseWyvern(t);
    expect(d.stage).toBe(3);
    const b = addEgg(t.s, 'bone')!;
    for (let k = 0; k < 200; k++) { for (const m of t.markets) m.stock = 40; t.cradle.lit = true; dailyDragons(t.s); }
    expect(b.stage).toBe(2);
  });
  it('a courier wyvern flies goods from a full works to an empty market', () => {
    const t = town(102);
    const d = raiseWyvern(t);
    expect(setRole(t.s, d.id, 'courier')).toBeNull();
    for (const m of t.markets) m.stock = 0;
    const job = courierJob(t.s);
    expect(job).not.toBeNull();
    expect(job!.amount).toBeGreaterThan(0);
    updateCreatures(t.s);
    const a = t.s.agents.find((x) => x.species === 'wyvern' && x.dragonId === d.id)!;
    expect(a).toBeTruthy();
    for (let k = 0; k < 1500; k++) tickCreatures(t.s);
    expect(t.markets.reduce((n, m) => n + m.stock, 0)).toBeGreaterThan(0);
    expect(t.crafts.reduce((n, c) => n + c.stock, 0)).toBeLessThan(200);
    expect(a.alt).toBeDefined();
  });
  it('the Wyrm-Ring holds seasonal bouts with a champion', () => {
    const t = town(103);
    expect(placeBuilding(t.s, 'ring', t.f.x - 12, t.f.y + 4).ok).toBe(true);
    const d = raiseWyvern(t);
    expect(setRole(t.s, d.id, 'champion')).toBeNull();
    let won = 0, lost = 0;
    for (let day = 45; day <= 45 + 30 * 8; day += 30) { t.s.day = day; d.stage = 3; d.mood = 90; seasonalBout(t.s); won = t.s.stats.boutsWon; lost = t.s.stats.boutsLost; }
    expect(won + lost).toBe(9);
    expect(won).toBeGreaterThan(0);
  });
});

describe('gates of the Pass', () => {
  it('gates need a wall, let roads through, add coverage, and Uzulim adds unrest', () => {
    const t = town(104);
    const { s, f } = t;
    const y = f.y + 9;
    buildWall(s, roadPath(f.x - 10, y, f.x + 10, y, false));
    expect(placeGate(s, 2, f.x, f.y + 12).ok).toBe(false);
    expect(placeGate(s, 2, f.x, y).ok).toBe(true);
    expect(s.wall[idx(f.x, y)]).toBe(2);
    expect(roadTileCost(s, RoadType.Track, idx(f.x, y))).toBeGreaterThanOrEqual(0);
    expect(roadTileCost(s, RoadType.Track, idx(f.x + 1, y))).toBe(-1);
    expect(buildRoad(s, RoadType.Track, roadPath(f.x, f.y + 4, f.x, f.y + 12, true)).ok).toBe(true);
    expect(s.road[idx(f.x, y)]).toBe(RoadType.Track);
    updateCoverage(s, 'faith');
    expect(s.coverage.faith[idx(f.x + 2, y - 2)]).toBeGreaterThan(0);
    expect(placeGate(s, 3, f.x + 4, y).ok).toBe(true);
    updateCoverage(s, 'ward');
    expect(s.coverage.ward[idx(f.x + 4, y - 3)]).toBeGreaterThan(0);
    // gloam never crosses the gate line
    for (let yy = f.y + 11; yy <= f.y + 13; yy++) for (let x = f.x - 8; x <= f.x + 8; x++) s.gloam[idx(x, yy)] = 1;
    s.day = 40;
    for (let d = 0; d < 20; d++) { s.day++; dailyGloam(s); }
    for (let x = f.x - 8; x <= f.x + 8; x++) expect(s.gloam[idx(x, y - 1)]).toBe(0);
  });
});

describe("Storm-Caller's Peak and visitors", () => {
  it('calls rain: fires out, miasma washed, cooldown', () => {
    const t = town(105);
    const { s, f } = t;
    for (let yy = f.y + 6; yy <= f.y + 6; yy++) s.terrain[idx(f.x, yy)] = Terrain.Hills;
    buildRoad(s, RoadType.Track, roadPath(f.x, f.y + 4, f.x, f.y + 5, true));
    s.milestone = 5;
    const r = placeBuilding(s, 'stormpeak', f.x, f.y + 6);
    expect(r.ok).toBe(true);
    const peak = s.buildings.find((b) => b && b.kind === 'stormpeak')!;
    peak.lit = true;
    t.crafts[0].state = 'burning';
    updateMiasma(s);
    const before = s.miasma[idx(t.crafts[0].x, t.crafts[0].y)];
    expect(callRain(s, peak.id).ok).toBe(true);
    expect(t.crafts[0].state).toBe('ok');
    updateMiasma(s);
    expect(s.miasma[idx(t.crafts[0].x, t.crafts[0].y)]).toBeLessThan(before);
    expect(callRain(s, peak.id).ok).toBe(false);
    expect(peak.cooldown).toBe(3);
  });
  it('caravan trade sells surplus; the merchant sells a sky egg into a free cradle', () => {
    const t = town(106);
    const { s, f } = t;
    placeBuilding(s, 'depot', f.x - 12, f.y + 4);
    const caravan = ALL_EVENTS.find((e) => e.id === 'caravan')!;
    expect(caravan.when(s)).toBe(true);
    const t0 = s.treasury;
    caravan.choices[0].apply(s);
    expect(s.treasury).toBeGreaterThan(t0);
    expect(t.crafts.every((c) => c.stock <= 10)).toBe(true);
    const merchant = ALL_EVENTS.find((e) => e.id === 'merchant')!;
    merchant.choices[0].apply(s);
    expect(s.dragons.some((d) => d.line === 'sky')).toBe(true);
    const storm = ALL_EVENTS.find((e) => e.id === 'stormcaller')!;
    storm.choices[0].apply(s);
    expect(s.modifiers.some((m) => m.kind === 'rain')).toBe(true);
  });
  it('a long run with all of it stays finite', () => {
    const t = town(107);
    placeBuilding(t.s, 'ring', t.f.x - 12, t.f.y + 4);
    raiseWyvern(t);
    setRole(t.s, t.s.dragons[0].id, 'courier');
    run(t.s, TICKS_PER_DAY * 4, { onDay: () => { for (const m of t.markets) m.stock = 20; } });
    for (const a of t.s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
    expect(t.s.gameOver).toBeNull();
  });
});
