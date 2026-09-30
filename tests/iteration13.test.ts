import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, canPlaceBuilding } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, Terrain, idx } from '../src/sim/types';
import { findPath, bumpRoadVersion, portalGates, tickAgents } from '../src/sim/agents';
import { updateCoverage } from '../src/sim/services';
import { dailyBuildings, treeStage, TREE_LEISURE_RADIUS, delveActive } from '../src/sim/growth';
import { maybeFireEvent, resolveEvent, ALL_EVENTS } from '../src/sim/events';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function base(seed = 9) {
  const s = createGame(seed, 'Arch');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 6, f.x + 30, f.y + 12);
  s.milestone = 7;
  s.treasury = 200000;
  return { s, f };
}

describe('Ruins of Lukuku', () => {
  it('seeds one flagstone cluster away from the founding node on most maps', () => {
    let maps = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(seed, 'R');
      let n = 0;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Ruins) { n++; cx += i % s.w; cy += (i / s.w) | 0; }
      if (!n) continue;
      maps++;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(Math.hypot(cx / n - s.founding.x, cy / n - s.founding.y)).toBeGreaterThan(24);
    }
    expect(maps).toBeGreaterThanOrEqual(6);
  });

  it('a Ruin Delve stands only on ruins, brings up relics and lifts artifact income', () => {
    const { s, f } = base();
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    expect(canPlaceBuilding(s, 'ruindelve', f.x, f.y + 4)).toMatch(/flagstones/);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.terrain[idx(f.x + dx, f.y + 4 + dy)] = Terrain.Ruins;
    expect(placeBuilding(s, 'ruindelve', f.x, f.y + 4).ok).toBe(true);
    expect(delveActive(s)).toBe(true);
    const a = placeBuildingRaw(s, 'arcane', f.x + 4, f.y + 4, 2);
    a.workers = 8; a.stock = 20; a.lit = true;
    recomputeAll(s);
    a.workers = 8; a.stock = 20; a.lit = true;
    dailyBuildings(s);
    expect(s.stats.relics).toBe(1);
    expect(s.artifactsSold).toBeCloseTo(8 * 0.25 * 5 * 1.15, 3);
    // the chain: first fall, then the door
    const d = s.buildings.find((b) => b && b.kind === 'ruindelve')!;
    d.age = 10;
    s.lastEventDay = -100;
    const first = ALL_EVENTS.find((e) => e.id === 'lukuku_first')!;
    expect(first.when(s)).toBe(true);
    s.pendingEvent = { id: 'lukuku_first', title: first.title, text: first.text, choices: [] };
    s.firedEvents.push('lukuku_first:?');
    resolveEvent(s, 0);
    expect(s.firedEvents).toContain('lukuku_first:0');
    s.lastEventDay = s.day - 20;
    expect(ALL_EVENTS.find((e) => e.id === 'lukuku_door')!.when(s)).toBe(true);
  });
});

describe('Portal Arches', () => {
  it('two lit arches let carts step across the map; a path jumps and the agent teleports', () => {
    const { s, f } = base();
    // two separate road segments, each with an arch beside it
    buildRoad(s, RoadType.Track, roadPath(f.x - 28, f.y + 3, f.x - 18, f.y + 3, false));
    buildRoad(s, RoadType.Track, roadPath(f.x + 18, f.y + 3, f.x + 28, f.y + 3, false));
    expect(placeBuilding(s, 'portalarch', f.x - 20, f.y + 4).ok).toBe(true);
    expect(placeBuilding(s, 'portalarch', f.x + 20, f.y + 4).ok).toBe(true);
    expect(placeBuilding(s, 'portalarch', f.x + 24, f.y + 4).ok).toBe(false); // only two
    const start = idx(f.x - 26, f.y + 3);
    const goal = idx(f.x + 26, f.y + 3);
    for (const b of s.buildings) if (b && b.kind === 'portalarch') b.lit = false;
    bumpRoadVersion();
    expect(findPath(s, start, goal)).toBeNull();
    for (const b of s.buildings) if (b && b.kind === 'portalarch') b.lit = true;
    bumpRoadVersion();
    expect(portalGates(s)).not.toBeNull();
    const path = findPath(s, start, goal)!;
    expect(path).not.toBeNull();
    let jumps = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1];
      const b = path[k];
      const d = Math.abs((a % s.w) - (b % s.w)) + Math.abs(((a / s.w) | 0) - ((b / s.w) | 0));
      if (d > 1) jumps++;
    }
    expect(jumps).toBe(1);
    // an agent walking that path teleports once
    s.agents.push({ id: 900, kind: AgentKind.Citizen, x: (start % s.w) + 0.5, y: ((start / s.w) | 0) + 0.5, path, pathIdx: 1, speed: 1, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0 });
    for (let k = 0; k < 600 && s.stats.portalTrips === 0; k++) { tickAgents(s); s.tick++; }
    expect(s.stats.portalTrips).toBe(1);
    const a = s.agents.find((x) => x.id === 900)!;
    expect(a.x).toBeGreaterThan(f.x + 10);
  });
});

describe('World Tree Sapling', () => {
  it('grows a stage each season, widening leisure and holding the Gloam under its shade', () => {
    const { s, f } = base();
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    expect(placeBuilding(s, 'worldtree', f.x, f.y + 4).ok).toBe(true);
    const t = s.buildings.find((b) => b && b.kind === 'worldtree')!;
    expect(treeStage(t)).toBe(0);
    updateCoverage(s, 'leisure');
    updateCoverage(s, 'ward');
    expect(s.coverage.leisure[idx(f.x + 1, f.y + 5 + 5)]).toBeGreaterThan(0);
    expect(s.coverage.leisure[idx(f.x + 1, f.y + 5 + 10)]).toBe(0);
    expect(s.coverage.ward[idx(f.x + 1, f.y + 5 + 3)]).toBeGreaterThan(0);
    t.age = 90;
    expect(treeStage(t)).toBe(3);
    expect(TREE_LEISURE_RADIUS[3]).toBe(24);
    updateCoverage(s, 'leisure');
    updateCoverage(s, 'ward');
    expect(s.coverage.leisure[idx(f.x + 1, f.y + 5 + 20)]).toBeGreaterThan(0);
    expect(s.coverage.ward[idx(f.x + 1, f.y + 5 + 18)]).toBeGreaterThan(0);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.buildings.find((x) => x && x.kind === 'worldtree')!.age).toBe(90);
    run(b, 10);
  });
});
