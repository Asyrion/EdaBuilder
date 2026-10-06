/** Iteration 86 (M17 part 2, DESIGN §17.1 and §4.117): the marsh-wyrms. Eel-like wyrms come up the water in Bloom and go
 *  with the Ember; one may lair under a bridge, where the carts crawl; the Veshari Hall's coverage drives it off and no wyrm
 *  lairs within a Quay's ward; a nest by a Quay gives a tide egg. Every roll is a side stream: the main stream never moves. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { dailyMarshWyrms, isBridge, lairFor, NEST_DAY, NEST_EGG_PRICE, QUAY_WARD, WYRM_CRAWL, WYRM_MAX, WYRM_MIN_BODY, WYRM_TILES } from '../src/sim/marshwyrms';
import { roadSpeedAt } from '../src/sim/roads';
import { watersOf } from '../src/sim/water';
import { deserialize, serialize } from '../src/sim/save';
import { DAYS_PER_SEASON, MAP_W, RoadType, Terrain, idx, isWater, type GameState, type MarshWyrm } from '../src/sim/types';

const BLOOM = DAYS_PER_SEASON; // the first day of Bloom in year one
/** A cobbled bridge: a water tile with land beside it, the road on it (a cobble is never a ford). */
function bridge(s: GameState): number {
  for (let i = 0; i < s.terrain.length; i++) {
    if (s.terrain[i] !== Terrain.Water || s.gloam[i] || s.bIndex[i] >= 0) continue;
    const x = i % MAP_W; const y = (i / MAP_W) | 0;
    if (x < 15 || y < 15 || x > MAP_W - 15 || y > MAP_W - 15) continue;
    s.road[i] = RoadType.Cobble;
    return i;
  }
  return -1;
}
const wyrmAt = (i: number): MarshWyrm => ({ id: 1, x: i % MAP_W, y: (i / MAP_W) | 0, lair: -1, nest: -1 });

describe('M17 part 2: the marsh-wyrms', () => {
  it('come with Bloom, by the size of each water, and go with the Ember', () => {
    const s = createGame(42, 'Eel');
    s.day = BLOOM;
    dailyMarshWyrms(s);
    const w = watersOf(s);
    const want = w.tiles.filter((t) => t >= WYRM_MIN_BODY).reduce((n, t) => n + Math.min(WYRM_MAX, 1 + Math.floor(t / WYRM_TILES)), 0);
    expect(want).toBeGreaterThan(0);
    expect(s.marshWyrms!.length).toBe(want);
    for (const m of s.marshWyrms!) expect(isWater(s.terrain[idx(m.x, m.y)])).toBe(true);
    s.day = 2 * DAYS_PER_SEASON; // the Ember
    dailyMarshWyrms(s);
    expect(s.marshWyrms!.length).toBe(0);
  });
  it('a wyrm lairs under a bridge, and the carts on it crawl at a quarter of their speed', () => {
    const s = createGame(42, 'Eel');
    const i = bridge(s);
    expect(isBridge(s, i)).toBe(true);
    const free = roadSpeedAt(s, i);
    const w = wyrmAt(i);
    expect(lairFor(s, w)).toBe(i);
    w.lair = i; s.marshWyrms = [w];
    expect(roadSpeedAt(s, i)).toBeCloseTo(free * WYRM_CRAWL);
    expect(WYRM_CRAWL).toBe(0.25);
  });
  it('the Veshari Hall drives it off; a Quay keeps them away and ends a lair in its ward', () => {
    const s = createGame(42, 'Eel');
    const i = bridge(s); s.day = BLOOM + 3;
    const w = wyrmAt(i); w.lair = i; s.marshWyrms = [w];
    s.coverage.fire[i] = 255;
    dailyMarshWyrms(s);
    expect(w.lair).toBe(-1);
    expect(s.stats.wyrmsDriven).toBe(1);
    expect(lairFor(s, wyrmAt(i))).toBe(-1); // covered: no lair here
    s.coverage.fire[i] = 0;
    const qx = (i % MAP_W) + 3; const qy = ((i / MAP_W) | 0) + 3;
    const q = placeBuildingRaw(s, 'quay', qx, qy); q.state = 'ok';
    expect(lairFor(s, wyrmAt(i))).toBe(-1); // within the Quay's ward
    const w2 = wyrmAt(i); w2.lair = i; s.marshWyrms = [w2];
    dailyMarshWyrms(s);
    expect(w2.lair).toBe(-1);
    expect(s.stats.wyrmsDriven).toBe(2);
    expect(QUAY_WARD).toBe(10);
  });
  it('a nest by a Quay gives a tide egg, or the Crown\'s price; a nest away from a Quay gives nothing', () => {
    const s = createGame(42, 'Eel');
    const i = s.terrain.findIndex((t, j) => isWater(t) && (j % MAP_W) > 20 && (j % MAP_W) < MAP_W - 20 && j / MAP_W > 20 && j / MAP_W < MAP_W - 20);
    const x = i % MAP_W; const y = (i / MAP_W) | 0;
    s.terrain[idx(x + 2, y)] = Terrain.Marsh;
    s.day = BLOOM + NEST_DAY;
    const lone = wyrmAt(i); s.marshWyrms = [lone];
    dailyMarshWyrms(s);
    expect(lone.nest).toBeGreaterThanOrEqual(0);
    expect(s.stats.tideNests ?? 0).toBe(0);
    const q = placeBuildingRaw(s, 'quay', x + 4, y + 1); q.state = 'ok';
    const treasury = s.treasury; const dragons = s.dragons.length;
    const w = wyrmAt(i); s.marshWyrms = [w];
    dailyMarshWyrms(s);
    expect(s.stats.tideNests).toBe(1);
    const egg = s.dragons.length > dragons;
    if (egg) expect(s.dragons[s.dragons.length - 1].line).toBe('tide');
    else expect(s.treasury).toBe(treasury + NEST_EGG_PRICE);
  });
  it('the main stream never moves for the wyrms, and an old save loads without them', () => {
    const s = createGame(42, 'Eel');
    s.day = BLOOM;
    const before = s.rngState;
    for (let d = 0; d < 10; d++) { dailyMarshWyrms(s); s.day++; }
    expect(s.rngState).toBe(before);
    const json = JSON.parse(serialize(s));
    delete json.marshWyrms;
    const back = deserialize(JSON.stringify(json), (seed) => createGame(seed));
    expect(back.marshWyrms).toBeUndefined();
    back.day = 3 * DAYS_PER_SEASON;
    dailyMarshWyrms(back);
    expect(back.marshWyrms ?? []).toEqual([]);
  });
});
