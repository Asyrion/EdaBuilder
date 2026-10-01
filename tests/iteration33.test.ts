import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { AgentKind, RoadType, Terrain, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { WALKER_JOBS, dailyWalkers, tickWalkers, walkersOf, walkerBonus } from '../src/sim/walkers';
import { dailyRelics } from '../src/sim/relics';
import { addEgg, dailyDragons } from '../src/sim/wyrmcraft';
import { activeQuests } from '../src/sim/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Walkers3');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x + 8, f.y - 8, f.x + 8, f.y + 12, false));
  return s;
}

function walkUntil(s: ReturnType<typeof town>, test: () => boolean, max = 3000): number {
  let t = 0;
  for (; t < max && !test(); t++) tickWalkers(s);
  return t;
}

describe('Scholars', () => {
  it('carry relic pieces from the delve home and name them; the book no longer catalogues by itself', () => {
    const s = town();
    const f = s.founding;
    const ac = placeBuildingRaw(s, 'academy', f.x + 4, f.y + 3);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.terrain[idx(f.x - 8 + dx, f.y + 3 + dy)] = Terrain.Ruins;
    const dv = placeBuildingRaw(s, 'ruindelve', f.x - 8, f.y + 3);
    recomputeAll(s);
    expect(ac.lit).toBe(true);
    dailyWalkers(s);
    const w = walkersOf(s, ac)[0];
    expect(w?.job).toBe('scholar');
    w.timer = 0;
    s.relics.uncatalogued = 2;
    s.stats.relics = 24; s.relics.lastRelics = 24;
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(2); // a scholar is fielded: the book waits for her
    expect(walkUntil(s, () => w.load === 1)).toBeLessThan(3000);
    expect(s.relics.uncatalogued).toBe(1);
    expect(w.phase).toBe(1);
    expect(walkUntil(s, () => w.load === 0 && s.stats.scholarTrips === 1)).toBeLessThan(3000);
    expect(Object.values(s.relics.pieces).reduce((a, b) => a + b, 0)).toBe(1);
    expect(w.log!.some((l) => l.includes('Named the piece'))).toBe(true);
    expect(activeQuests(s, 100).some((q) => q.id === 'w_scholar')).toBe(false);
    // a carrying scholar keeps her piece over the day, and gives it back if dismissed
    expect(walkUntil(s, () => w.load === 1)).toBeLessThan(3000);
    dailyWalkers(s);
    expect(walkersOf(s, ac)[0].load).toBe(1);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.agents.find((a) => a.kind === AgentKind.Walker && a.job === 'scholar')!.load).toBe(1);
    ac.state = 'ruin';
    dailyWalkers(s);
    expect(walkersOf(s, ac).length).toBe(0);
    expect(s.relics.uncatalogued).toBe(1);
    void dv;
  });
});

describe('Tamers', () => {
  it('visit each cradle with dragons within ten tiles: mood +2, growth a tenth faster that day, three visits a day', () => {
    const s = town();
    const f = s.founding;
    const lodge = placeBuildingRaw(s, 'tamerslodge', f.x + 4, f.y + 3);
    const c1 = placeBuildingRaw(s, 'cradle', f.x - 3, f.y + 3);
    const c2 = placeBuildingRaw(s, 'cradle', f.x + 10, f.y + 5);
    recomputeAll(s);
    const d1 = addEgg(s, 'ember')!;
    expect(d1.cradleId).toBe(c1.id);
    dailyWalkers(s);
    const w = walkersOf(s, lodge)[0];
    expect(w.job).toBe('tamer');
    w.timer = 0;
    expect(WALKER_JOBS.tamer.target!(s, w, lodge)).not.toBeNull(); // c1 has a dragon
    d1.mood = 50;
    expect(walkUntil(s, () => c1.visited === s.day)).toBeLessThan(3000);
    expect(d1.mood).toBe(52);
    expect(s.stats.tamerVisits).toBe(1);
    expect(w.log![0]).toMatch(/Worked the 1 dragon/);
    expect(WALKER_JOBS.tamer.target!(s, w, lodge)).not.toBeNull(); // the way home
    expect(walkUntil(s, () => w.phase === 0)).toBeLessThan(3000);
    expect(WALKER_JOBS.tamer.target!(s, w, lodge)).toBeNull(); // c1 visited, c2 empty: nothing to do (falls back to patrol)
    // growth a tenth faster on a visited day
    d1.stage = 1; d1.days = 0; d1.mood = 90; c1.lit = true;
    for (const m of s.buildings) if (m && m.kind === 'market') m.stock = 50;
    placeBuildingRaw(s, 'market', f.x - 3, f.y + 6, 2).stock = 40;
    dailyDragons(s);
    const gained = d1.days;
    c1.visited = -1; d1.days = 0;
    dailyDragons(s);
    expect(gained / d1.days).toBeCloseTo(1.1, 2);
    w.load = 3;
    expect(WALKER_JOBS.tamer.target!(s, w, lodge)).toBeNull();
    expect(activeQuests(s, 100).some((q) => q.id === 'w_tamer')).toBe(false);
    void c2;
  });
});

describe('Pilgrims', () => {
  it('walk shrine to temple and back, paint faith on the road and pray where they arrive', () => {
    const s = town();
    const f = s.founding;
    const sh = placeBuildingRaw(s, 'shrine', f.x - 6, f.y + 3);
    const tp = placeBuildingRaw(s, 'temple', f.x + 4, f.y + 3);
    recomputeAll(s);
    dailyWalkers(s);
    expect(walkersOf(s, sh).length).toBe(1);
    expect(walkersOf(s, tp).length).toBe(2);
    const w = walkersOf(s, sh)[0];
    w.timer = 0;
    for (const o of s.agents) if (o.kind === AgentKind.Walker && o.id !== w.id) o.timer = 9999;
    expect(walkUntil(s, () => s.stats.pilgrimPrayers > 0)).toBeLessThan(3000);
    expect(w.log![0]).toMatch(/Prayed at the Temple/);
    expect(w.phase).toBe(1);
    const faith = walkerBonus(s, 'faith');
    let painted = 0;
    for (let i = 0; i < faith.length; i++) if (faith[i] > 0) painted++;
    expect(painted).toBeGreaterThan(3);
    expect(walkUntil(s, () => w.phase === 0)).toBeLessThan(3000);
    expect(activeQuests(s, 100).some((q) => q.id === 'w_pilgrim')).toBe(false);
  });
});
