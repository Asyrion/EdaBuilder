/** Iteration 60 (M16 part 2, the water): bodies of water and the lake, shoals that regrow and can be fished out, fish that
 *  spoil in two days unless a market or a smokehouse takes them, reeds and thatch, the lake's land and wells, the Water
 *  Garden on its shore, fords that close at high water unless a Weir holds them, the spawning run, old saves, sprites and
 *  a water that is the same twice. */
import { describe, expect, it } from 'vitest';
import { createGame, canPlaceBuilding, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTrade, happinessTerms } from '../src/sim/growth';
import { landValueTerms } from '../src/sim/services';
import { waterCapAt } from '../src/sim/networks';
import { findPath, bumpRoadVersion } from '../src/sim/agents';
import { roadTileCost } from '../src/sim/actions';
import { tickCreatures } from '../src/sim/creatures';
import { EVENTS } from '../src/sim/events';
import { deserialize, serialize } from '../src/sim/save';
import { distanceMap } from '../src/sim/terrain';
import { generateSprites } from '../src/render/sprites';
import { BUILDINGS } from '../src/sim/catalog';
import { AgentKind, RoadType, Terrain, idx, isWater, type Building, type GameState } from '../src/sim/types';
import {
  FISH_HAPPY, FISH_PRICE, FORD_COST, SHOAL_REGROW, THATCH_DAYS, THATCH_HAPPY, bodyOf, catchOf, dailyFish, dailyFords, dailyReeds, dailyShoals, dailyWater,
  ensureShoals, fishedOut, reedBeds, fordClosed, forgetWaters, isFordTile, lakeDistAt, shoalCap, syncBoats, thatched, watersOf,
} from '../src/sim/water';
import { flatten } from './helpers';

/** A clean valley: grass, a lake east of the stake (open water, a deep middle, a shore), a 2-wide river west of it. */
function valley(seed: number): { s: GameState; lake: { x: number; y: number }; river: number } {
  const s = createGame(seed, 'Fishwick');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 30, f.x + 30, f.y + 30);
  s.sectors.fill(1);
  const L = { x: f.x + 14, y: f.y + 14 };
  for (let y = L.y - 6; y <= L.y + 6; y++) for (let x = L.x - 6; x <= L.x + 6; x++) s.terrain[idx(x, y)] = Math.abs(x - L.x) <= 3 && Math.abs(y - L.y) <= 3 ? Terrain.DeepWater : Terrain.Water;
  for (let y = L.y - 7; y <= L.y + 7; y++) for (let x = L.x - 7; x <= L.x + 7; x++) if (!isWater(s.terrain[idx(x, y)])) s.terrain[idx(x, y)] = Terrain.Shore;
  const rx = f.x - 14;
  for (let y = f.y - 25; y <= f.y + 25; y++) { s.terrain[idx(rx, y)] = Terrain.Water; s.terrain[idx(rx + 1, y)] = Terrain.Water; s.terrain[idx(rx - 1, y)] = Terrain.Shore; s.terrain[idx(rx + 2, y)] = Terrain.Shore; }
  s.waterDist = distanceMap((i) => isWater(s.terrain[i]), 15);
  forgetWaters(s);
  s.water.fish = [];
  s.wild.herds = [];
  s.agents = s.agents.filter((a) => a.herdId === undefined);
  recomputeAll(s);
  return { s, lake: L, river: rx };
}
function hut(s: GameState, x: number, y: number, crew = 4): Building {
  const b = placeBuildingRaw(s, 'fishershut', x, y);
  b.state = 'ok';
  b.workers = crew;
  return b;
}

describe('The waters and the lake', () => {
  it('a lake has open water and the river has none; bodies, caps and the lake shore', () => {
    const { s, lake, river } = valley(1);
    const w = watersOf(s);
    const lb = w.body[idx(lake.x, lake.y)];
    const rb = w.body[idx(river, s.founding.y)];
    expect(lb).toBeGreaterThanOrEqual(0);
    expect(rb).toBeGreaterThanOrEqual(0);
    expect(lb).not.toBe(rb);
    expect(w.tiles[lb]).toBe(169);
    expect(shoalCap(w, lb)).toBeCloseTo((169 - 49) * 0.6 + 49, 5);
    expect(w.open[idx(lake.x, lake.y)]).toBe(1);
    for (let k = 0; k < w.open.length; k++) if (w.open[k]) expect(w.body[k]).not.toBe(rb); // 2 wide: no open water in the river
    expect(lakeDistAt(s, lake.x + 7, lake.y)).toBe(3); // the shore: open water ends 4 in from the lake's edge
    expect(lakeDistAt(s, lake.x + 8, lake.y)).toBe(4);
    expect(lakeDistAt(s, river + 3, s.founding.y)).toBeGreaterThan(4);
  });

  it('the Water Garden stands on the lake shore only; the lake lifts the land and feeds its wells', () => {
    const { s, lake, river } = valley(2);
    const f = s.founding;
    s.road[idx(lake.x - 9, lake.y)] = RoadType.Track;
    s.road[idx(river + 5, f.y)] = RoadType.Track;
    expect(canPlaceBuilding(s, 'watergarden', lake.x - 8, lake.y - 2)).toBeNull();
    expect(canPlaceBuilding(s, 'watergarden', river + 3, f.y - 1)).toMatch(/lake/);
    const lv = landValueTerms(s, idx(lake.x - 8, lake.y), new Float32Array(s.terrain.length));
    expect(lv.some((t) => t.label === 'by the lake' && t.v === 6)).toBe(true);
    const near = placeBuildingRaw(s, 'well', lake.x - 7, lake.y + 3);
    const far = placeBuildingRaw(s, 'well', f.x, f.y - 20);
    expect(waterCapAt(s, near)).toBe(45);
    expect(waterCapAt(s, far)).toBe(30);
  });
});

describe('Fish', () => {
  it('a shoal regrows in Bloom, not in the Hush, and twice as fast below a Weir', () => {
    const { s, lake } = valley(3);
    const w = ensureShoals(s);
    const b = watersOf(s).body[idx(lake.x, lake.y)];
    const cap = shoalCap(w, b);
    s.water.fish[b] = cap / 2;
    s.day = 35;
    dailyShoals(s);
    const grew = s.water.fish[b] - cap / 2;
    expect(grew).toBeCloseTo(SHOAL_REGROW[1] * (cap / 2) * 0.5, 5);
    s.water.fish[b] = cap / 2;
    s.day = 95;
    dailyShoals(s);
    expect(s.water.fish[b]).toBe(cap / 2);
    const weir = placeBuildingRaw(s, 'weir', lake.x - 7, lake.y);
    weir.state = 'ok';
    s.day = 35;
    dailyShoals(s);
    expect(s.water.fish[b] - cap / 2).toBeCloseTo(2 * grew, 5);
  });

  it('two huts on one small water fish it out, and a fished-out shoal gives almost nothing', () => {
    const { s, river } = valley(4);
    const f = s.founding;
    const a = hut(s, river + 2, f.y - 4);
    hut(s, river + 2, f.y + 4);
    const b = bodyOf(s, a);
    expect(b).toBeGreaterThanOrEqual(0);
    s.day = 65; // the Ember
    const first = catchOf(s, a);
    expect(first).toBeGreaterThan(2);
    for (let d = 0; d < 120 && !fishedOut(s, b); d++) { dailyShoals(s); dailyFish(s); }
    expect(fishedOut(s, b)).toBe(true);
    expect(catchOf(s, a)).toBeLessThan(first * 0.25);
  });

  it('one hut alone holds its lake: the shoal settles well above fished out', () => {
    const { s, lake } = valley(15);
    const h = hut(s, lake.x - 7, lake.y);
    const b = bodyOf(s, h);
    s.day = 65;
    for (let d = 0; d < 300; d++) { dailyShoals(s); dailyFish(s); }
    expect(fishedOut(s, b)).toBe(false);
    expect(s.water.fish[b] / shoalCap(ensureShoals(s), b)).toBeGreaterThan(0.4);
  });

  it('fish spoil on the third day with no market or smokehouse; a market within 12 takes them and lifts the hearths near it', () => {
    const { s, lake } = valley(5);
    const h = hut(s, lake.x - 7, lake.y);
    s.day = 65;
    dailyFish(s);
    const first = h.fish ?? 0;
    expect(first).toBeGreaterThan(0);
    dailyFish(s);
    expect(h.fishOld).toBe(first);
    expect(s.stats.fishSpoiled).toBe(0);
    dailyFish(s);
    expect(s.stats.fishSpoiled).toBe(first);
    // a market within reach
    const m = placeBuildingRaw(s, 'market', lake.x - 12, lake.y);
    m.state = 'ok';
    const home = placeBuildingRaw(s, 'hearth', lake.x - 14, lake.y + 2);
    home.state = 'ok';
    home.residents = 4;
    dailyFish(s);
    expect(m.fish).toBeGreaterThan(0);
    expect(s.water.fishAt).toEqual([m.x, m.y]);
    expect(happinessTerms(s, home).some((t) => t.label === 'fish on the shelves' && t.v === FISH_HAPPY)).toBe(true);
  });

  it('a smokehouse within 6 takes what the shelves cannot, and the depot sells smoked fish over ten', () => {
    const { s, lake } = valley(6);
    const f = s.founding;
    const h = hut(s, lake.x - 7, lake.y);
    const sm = placeBuildingRaw(s, 'smokehouse', lake.x - 9, lake.y + 1);
    sm.state = 'ok';
    sm.workers = 2;
    s.day = 65;
    for (let d = 0; d < 6; d++) dailyFish(s);
    expect(s.stats.fishSpoiled).toBe(0);
    expect(s.stats.fishSmoked).toBeGreaterThan(0);
    void h;
    sm.stock = 30;
    placeBuildingRaw(s, 'depot', f.x - 10, f.y - 10).state = 'ok';
    const t0 = s.treasury;
    dailyTrade(s);
    expect(s.trade.fishSold).toBe(8); // the carts' budget of a depot
    expect(sm.stock).toBe(22);
    expect(s.treasury - t0).toBeCloseTo(8 * FISH_PRICE[2], 5);
  });

  it('the Close Season keeps the huts off in Bloom and off a shoal under a third', () => {
    const { s, lake } = valley(7);
    const h = hut(s, lake.x - 7, lake.y);
    s.edicts.closeseason = true;
    s.day = 35;
    expect(catchOf(s, h)).toBe(0);
    s.day = 65;
    expect(catchOf(s, h)).toBeGreaterThan(0);
    const b = bodyOf(s, h);
    s.water.fish[b] = shoalCap(ensureShoals(s), b) * 0.3;
    expect(catchOf(s, h)).toBe(0);
  });

  it('boats put out from a crewed hut and stay on its water', () => {
    const { s, lake } = valley(8);
    const h = hut(s, lake.x - 7, lake.y);
    s.day = 65;
    syncBoats(s);
    const boats = s.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'boat');
    expect(boats.length).toBe(2);
    const body = bodyOf(s, h);
    for (let t = 0; t < 900; t++) { s.tick = 900 * 65 + 200 + t; tickCreatures(s); }
    for (const a of boats) expect(watersOf(s).body[idx(Math.floor(a.x), Math.floor(a.y))]).toBe(body);
    h.workers = 0;
    syncBoats(s);
    expect(s.agents.some((a) => a.species === 'boat')).toBe(false);
  });
});

describe('Reeds and thatch', () => {
  it('the cutters thatch the level-1 homes near them: +3, and thatch catches fire; none cut in the Hush', () => {
    const { s, lake } = valley(9);
    const c = placeBuildingRaw(s, 'reedcutters', lake.x - 8, lake.y + 3);
    c.state = 'ok';
    c.workers = 3;
    const homes = [0, 1, 2].map((k) => { const b = placeBuildingRaw(s, 'hearth', lake.x - 12, lake.y + k * 2); b.state = 'ok'; b.residents = 3; return b; });
    s.day = 10;
    c.stock = 1;
    dailyReeds(s);
    expect(c.caught).toBe(Math.min(3, Math.floor(reedBeds(s, c) / 5)));
    expect(c.caught).toBeGreaterThanOrEqual(2);
    expect(homes.every((b) => thatched(s, b))).toBe(true);
    expect(homes[0].thatchUntil).toBe(10 + THATCH_DAYS);
    expect(s.stats.homesThatched).toBe(3);
    expect(happinessTerms(s, homes[0]).some((t) => t.label === 'a new thatch' && t.v === THATCH_HAPPY)).toBe(true);
    homes[0].level = 2;
    expect(thatched(s, homes[0])).toBe(false); // a level-2 home has a proper roof
    s.day = 95;
    c.stock = 0;
    dailyReeds(s);
    expect(c.caught).toBe(0);
  });
});

describe('The ford and the weir', () => {
  it('a track over the narrow river is a ford at a third of a bridge; a cobble road or the wide lake is a bridge', () => {
    const { s, lake, river } = valley(10);
    const i = idx(river, s.founding.y);
    expect(roadTileCost(s, RoadType.Track, i)).toBe(10 * FORD_COST);
    expect(roadTileCost(s, RoadType.Cobble, i)).toBe(45 * 4);
    expect(roadTileCost(s, RoadType.Track, idx(lake.x, lake.y - 5))).toBe(10 * 4);
  });

  it('high water closes a ford for the Thaw\'s first ten days; the paths go round; a Weir within 6 holds it', () => {
    const { s, river } = valley(11);
    const y = s.founding.y;
    for (let x = river - 3; x <= river + 4; x++) s.road[idx(x, y)] = RoadType.Track;
    bumpRoadVersion();
    expect(isFordTile(s, idx(river, y))).toBe(true);
    s.day = 3; // the charter's first Thaw: no Hush came before it, no high water
    dailyFords(s);
    expect(fordClosed(s, idx(river, y))).toBe(false);
    s.day = 122; // the second year's Thaw
    dailyFords(s);
    expect(fordClosed(s, idx(river, y))).toBe(true);
    expect(findPath(s, idx(river - 3, y), idx(river + 4, y))).toBeNull();
    expect(s.stats.fordDaysClosed).toBe(1);
    s.day = 132;
    dailyFords(s);
    expect(fordClosed(s, idx(river, y))).toBe(false);
    expect(findPath(s, idx(river - 3, y), idx(river + 4, y))).not.toBeNull();
    const weir = placeBuildingRaw(s, 'weir', river + 2, y + 3);
    weir.state = 'ok';
    s.day = 243; // the next Thaw, day 3
    dailyFords(s);
    expect(fordClosed(s, idx(river, y))).toBe(false);
  });
});

describe('The spawning run', () => {
  it('comes in Bloom to a hut on a full shoal; netting it pays and thins the shoal, letting it spawn doubles the regrowth', () => {
    const { s, lake } = valley(12);
    const h = hut(s, lake.x - 7, lake.y);
    const e = EVENTS.find((x) => x.id === 'spawnrun')!;
    s.day = 70;
    expect(e.when(s)).toBe(false);
    s.day = 40;
    expect(e.when(s)).toBe(true);
    const t0 = s.treasury;
    e.choices[0].apply(s);
    expect(s.treasury - t0).toBe(300);
    const b = bodyOf(s, h);
    expect(s.water.fish[b]).toBeCloseTo(shoalCap(ensureShoals(s), b) * 0.4, 5);
    e.choices[1].apply(s);
    expect(s.water.spawnUntil).toBe(100);
  });
});

describe('Saves, sprites and determinism', () => {
  it('a save from before the water loads with every shoal full', () => {
    const s = createGame(13, 'Fishwick');
    const o = JSON.parse(serialize(s));
    delete o.water;
    const t = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(t.water.fish).toEqual([]);
    const w = ensureShoals(t);
    expect(t.water.fish.length).toBe(w.tiles.length);
    for (let b = 0; b < w.tiles.length; b++) expect(t.water.fish[b]).toBe(shoalCap(w, b));
  });
  it('every water building has a sprite, and the boat two frames', () => {
    const names = new Set(generateSprites().map((d) => d.name));
    for (const k of ['fishershut', 'smokehouse', 'reedcutters', 'weir', 'watergarden']) {
      expect(BUILDINGS.some((b) => b.key === k), k).toBe(true);
      expect(names.has(`b_${k}`), k).toBe(true);
    }
    expect(names.has('boat_0') && names.has('boat_1')).toBe(true);
  });
  it('the water is the same twice for one seed', () => {
    const run = () => {
      const { s, lake } = valley(14);
      hut(s, lake.x - 7, lake.y);
      const c = placeBuildingRaw(s, 'reedcutters', lake.x - 8, lake.y + 3);
      c.state = 'ok';
      c.workers = 3;
      for (let t = 0; t < 900 * 4; t++) { s.tick++; tickCreatures(s); if (s.tick % 900 === 0) { s.day++; dailyWater(s); } }
      return JSON.stringify({ fish: s.water.fish, caught: s.stats.fishCaught, spoiled: s.stats.fishSpoiled, boats: s.agents.filter((a) => a.species === 'boat').map((a) => `${a.x.toFixed(3)},${a.y.toFixed(3)}`) });
    };
    expect(run()).toBe(run());
  });
});
