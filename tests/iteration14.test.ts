import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind, Terrain, idx } from '../src/sim/types';
import { dailyBeasts, boundGolems, wildGolems, foundryMana, raysLured, surgeMaddensGolems, GOLEM_LABOUR } from '../src/sim/beasts';
import { tickCreatures, dailyHunt, updateCreatures } from '../src/sim/creatures';
import { workforceOf, computeBuildingHappiness } from '../src/sim/growth';
import { updateCoverage } from '../src/sim/services';
import { updateMana } from '../src/sim/networks';
import { wyrmTribute } from '../src/sim/wyrm';
import { ALL_EVENTS } from '../src/sim/events';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 13) {
  const s = createGame(seed, 'Beasts');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 8, f.x + 20, f.y + 12);
  s.milestone = 6;
  s.treasury = 100000;
  return { s, f };
}

describe('Concord Wardens and the Golem Foundry', () => {
  it('mines wake wardens in the hills; a lit foundry binds them into labour that drinks mana', () => {
    const { s, f } = town();
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) s.terrain[idx(f.x + 8 + dx, f.y + 2 + dy)] = Terrain.Hills;
    const mine = placeBuildingRaw(s, 'mine', f.x + 8, f.y + 2);
    mine.age = 10;
    let woke = 0;
    for (let d = 0; d < 400 && !woke; d++) { dailyBeasts(s); woke = s.stats.golemsWoken; }
    expect(woke).toBeGreaterThan(0);
    expect(wildGolems(s)).toBeGreaterThan(0);
    const g = s.agents.find((a) => a.kind === AgentKind.Creature && a.species === 'golem')!;
    // a wild warden frightens the hearths near it
    const h = placeBuildingRaw(s, 'hearth', Math.floor(g.x), Math.floor(g.y) + 1);
    h.residents = 3;
    recomputeAll(s);
    const scared = computeBuildingHappiness(s, h);
    g.x += 20;
    const calm = computeBuildingHappiness(s, h);
    expect(calm - scared).toBeCloseTo(10, 5);
    g.x -= 20;
    // bind it
    const fd = placeBuildingRaw(s, 'golemfoundry', Math.floor(g.x) + 3, Math.floor(g.y) + 3);
    fd.lit = false;
    dailyBeasts(s);
    expect(boundGolems(s)).toBe(0);
    fd.lit = true;
    const wf = workforceOf(s);
    dailyBeasts(s);
    expect(boundGolems(s)).toBeGreaterThan(0);
    expect(workforceOf(s) - wf).toBe(boundGolems(s) * GOLEM_LABOUR);
    expect(foundryMana(s)).toBe(boundGolems(s) * 10);
    updateMana(s);
    expect(s.manaDemand).toBeGreaterThanOrEqual(foundryMana(s));
    // a surge sets them loose
    expect(surgeMaddensGolems(s)).toBe(boundGolems(s) + 0 || 1);
    expect(boundGolems(s)).toBe(0);
    // wardens walk and never despawn
    for (let k = 0; k < 300; k++) { tickCreatures(s); s.tick++; }
    expect(wildGolems(s)).toBeGreaterThan(0);
    dailyHunt(s);
    expect(wildGolems(s)).toBeGreaterThan(0);
    s.stats.golemsBound = 3;
    expect(ALL_EVENTS.find((e) => e.id === 'egg_grey')!.when(s)).toBe(true);
  });
});

describe('Skyrays and the Ley Beacon', () => {
  it('a school crosses in Bloom; a lit beacon lures it to circle, shedding rayscale and lifting happiness', () => {
    const { s, f } = town();
    s.day = 35; // Bloom
    let schools = 0;
    for (let d = 0; d < 200 && !schools; d++) { s.day = 35 + (d % 15); dailyBeasts(s); schools = s.stats.skyraySchools; }
    expect(schools).toBe(1);
    const rays = s.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'skyray');
    expect(rays.length).toBe(5);
    // with no beacon they cross and leave
    for (let k = 0; k < 2500 && s.agents.some((a) => a.species === 'skyray' && a.timer >= 0); k++) tickCreatures(s);
    updateCreatures(s);
    expect(s.agents.some((a) => a.species === 'skyray')).toBe(false);
    // a lit beacon near their path keeps the next school
    const bc = placeBuildingRaw(s, 'leybeacon', f.x, f.y + 4);
    bc.lit = true;
    s.stats.skyraySchools = 0;
    for (let d = 0; d < 300 && !s.stats.skyraySchools; d++) { s.day = 35 + (d % 15); dailyBeasts(s); }
    for (const a of s.agents) if (a.species === 'skyray') { a.x = f.x + 10; a.y = f.y + 10; }
    for (let k = 0; k < 40; k++) tickCreatures(s);
    expect(raysLured(s)).toBe(true);
    const h = placeBuildingRaw(s, 'hearth', f.x + 3, f.y + 6);
    h.residents = 2;
    recomputeAll(s);
    const withRays = computeBuildingHappiness(s, h);
    dailyBeasts(s);
    expect(s.materials.rayscale).toBeGreaterThan(0);
    expect(ALL_EVENTS.find((e) => e.id === 'egg_sky')!.when(s)).toBe(true);
    for (const a of s.agents) if (a.species === 'skyray') a.phase = 0;
    expect(withRays - computeBuildingHappiness(s, h)).toBeCloseTo(3, 5);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.materials.rayscale).toBeCloseTo(s.materials.rayscale, 6);
    run(b, 10);
  });
});

describe('Drake Mews and the taming edicts', () => {
  it('a lit mews doubles Watch House reach; Wyrm-Peace halves the tribute', () => {
    const { s, f } = town();
    const wh = placeBuildingRaw(s, 'watchhouse', f.x, f.y + 4);
    wh.lit = true;
    updateCoverage(s, 'watch');
    const far = idx(f.x + 1, f.y + 5 + 16);
    expect(s.coverage.watch[far]).toBe(0);
    const mews = placeBuildingRaw(s, 'drakemews', f.x + 4, f.y + 4);
    mews.lit = true;
    updateCoverage(s, 'watch');
    expect(s.coverage.watch[far]).toBeGreaterThan(0);
    const t0 = wyrmTribute(s);
    s.edicts.wyrmpeace = true;
    expect(wyrmTribute(s)).toBe(Math.round(t0 / 2));
  });
});
