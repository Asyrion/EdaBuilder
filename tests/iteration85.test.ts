/** Iteration 85 (M17 part 1, DESIGN §17.1 and §4.116): marsh terrain beside slow water. Nothing is built on it, a road
 *  crosses it as a causeway at a bridge's price, it breeds miasma, its reeds count twice, and the Drainage edict turns the
 *  marsh nearest the city to meadow, three tiles a day, for a daily cost. Old saves load without marsh. */
import { describe, expect, it } from 'vitest';
import { createGame, canPlaceBuilding } from '../src/sim/world';
import { generateTerrain, MARSH_FOUNDING } from '../src/sim/terrain';
import { MARSH_CAUSEWAY, paintZone, roadTileCost } from '../src/sim/actions';
import { updateMiasma } from '../src/sim/services';
import { reedBeds } from '../src/sim/water';
import { DRAIN_PER_DAY, dailyDrainage, drainageCost, marshCount, nearestMarsh } from '../src/sim/marsh';
import { edictUpkeep } from '../src/sim/edicts';
import { deserialize, serialize } from '../src/sim/save';
import { ROAD_BY_TYPE } from '../src/sim/catalog';
import { MAP_H, MAP_W, RoadType, Terrain, Zone, idx, inBounds, isWater, type Building, type GameState } from '../src/sim/types';

const marshTiles = (t: Uint8Array) => { const out: number[] = []; t.forEach((v, i) => { if (v === Terrain.Marsh) out.push(i); }); return out; };
function openMarsh(s: GameState): number {
  return marshTiles(s.terrain).find((i) => !s.gloam[i] && s.bIndex[i] < 0 && !s.road[i]) ?? -1;
}

describe('M17 part 1: the marsh', () => {
  it('lies beside water on every map, a few in a hundred land tiles, never near the founding, and the same every time', () => {
    for (const seed of [42, 43, 44, 45, 46, 47]) {
      const r = generateTerrain(seed);
      const m = marshTiles(r.terrain);
      let land = 0; r.terrain.forEach((v) => { if (!isWater(v)) land++; });
      expect(m.length / land, `seed ${seed}`).toBeGreaterThan(0.02);
      expect(m.length / land, `seed ${seed}`).toBeLessThan(0.06);
      for (const i of m) {
        const x = i % MAP_W; const y = (i / MAP_W) | 0;
        expect(Math.hypot(x - r.founding.x, y - r.founding.y), `seed ${seed} tile ${i}`).toBeGreaterThan(MARSH_FOUNDING);
        let wet = false; // water within three tiles
        for (let dy = -3; dy <= 3 && !wet; dy++) for (let dx = -3; dx <= 3; dx++) if (inBounds(x + dx, y + dy) && isWater(r.terrain[idx(x + dx, y + dy)])) { wet = true; break; }
        expect(wet, `seed ${seed} tile ${i}`).toBe(true);
      }
      expect(Array.from(generateTerrain(seed).terrain)).toEqual(Array.from(r.terrain));
    }
  });
  it('nothing is built or zoned on it; a road crosses it at a bridge\'s price', () => {
    const s = createGame(42, 'Fen');
    s.sectors.fill(1); s.milestone = 8; s.treasury = 1e6;
    const i = openMarsh(s); expect(i).toBeGreaterThanOrEqual(0);
    const x = i % MAP_W; const y = (i / MAP_W) | 0;
    expect(canPlaceBuilding(s, 'well', x, y)).not.toBeNull();
    paintZone(s, Zone.Hearth, x, y, x, y);
    expect(s.zone[i]).toBe(0);
    expect(MARSH_CAUSEWAY).toBe(4);
    expect(roadTileCost(s, RoadType.Track, i)).toBe(ROAD_BY_TYPE[RoadType.Track].cost * 4);
    expect(roadTileCost(s, RoadType.Cobble, i)).toBe(ROAD_BY_TYPE[RoadType.Cobble].cost * 4);
  });
  it('breeds miasma where nothing else does', () => {
    const s = createGame(42, 'Fen');
    const i = openMarsh(s);
    updateMiasma(s);
    expect(s.miasma[i]).toBeGreaterThan(0);
    s.terrain.forEach((v, j) => { if (v === Terrain.Marsh) s.terrain[j] = Terrain.Meadow; });
    updateMiasma(s);
    expect(s.miasma[i]).toBe(0);
  });
  it('its reeds count twice for the cutters, open shore once', () => {
    const s = createGame(42, 'Fen');
    for (let j = 0; j < s.terrain.length; j++) if (s.terrain[j] === Terrain.Shore || s.terrain[j] === Terrain.Marsh) s.terrain[j] = Terrain.Grass;
    const c = { x: 64, y: 20, w: 1, h: 1 } as Building;
    const free = (x: number, y: number) => s.bIndex[idx(x, y)] < 0 && !s.road[idx(x, y)];
    expect(free(65, 20) && free(66, 20)).toBe(true);
    const base = reedBeds(s, c);
    s.terrain[idx(65, 20)] = Terrain.Shore;
    expect(reedBeds(s, c)).toBe(base + 1);
    s.terrain[idx(66, 20)] = Terrain.Marsh;
    expect(reedBeds(s, c)).toBe(base + 3);
  });
  it('the Drainage edict drains the marsh nearest the city, three tiles a day, and bills for it; off, nothing moves', () => {
    const s = createGame(42, 'Fen');
    const before = marshCount(s);
    dailyDrainage(s);
    expect(marshCount(s)).toBe(before);
    expect(edictUpkeep(s)).toBe(0);
    s.edicts.drainage = true;
    expect(edictUpkeep(s)).toBe(drainageCost(s));
    expect(drainageCost(s)).toBe(30 + 2 * Math.floor(before / 10));
    const next = nearestMarsh(s, DRAIN_PER_DAY);
    dailyDrainage(s);
    expect(marshCount(s)).toBe(before - DRAIN_PER_DAY);
    for (const i of next) expect(s.terrain[i]).toBe(Terrain.Meadow);
    expect(s.stats.marshDrained).toBe(DRAIN_PER_DAY);
    // the nearest are nearer than any marsh left
    const stake = s.buildings.find((b) => b && b.kind === 'stake')!;
    const d = (i: number) => Math.hypot((i % MAP_W) - stake.x, ((i / MAP_W) | 0) - stake.y);
    const left = marshTiles(s.terrain);
    expect(Math.max(...next.map(d))).toBeLessThanOrEqual(Math.min(...left.map(d)) + 2);
  });
  it('an old save, from before the marsh, loads without marsh and with the edict off', () => {
    const s = createGame(42, 'Old');
    s.terrain.forEach((v, j) => { if (v === Terrain.Marsh) s.terrain[j] = Terrain.Grass; });
    const json = JSON.parse(serialize(s));
    delete json.edicts.drainage;
    const back = deserialize(JSON.stringify(json), (seed) => createGame(seed));
    expect(marshCount(back)).toBe(0);
    expect(back.edicts.drainage).toBeFalsy();
    expect(back.terrain.length).toBe(MAP_W * MAP_H);
  });
});
