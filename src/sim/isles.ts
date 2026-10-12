/**
 * The atoll's isles (iteration 95): the land components of the terrain, and which of them are settled. Derived from the
 * saved terrain, so no state is kept and an old save has nothing to migrate. A bridge is a road on water: it joins no two
 * isles here, since the census asks where folk live, not where a road runs.
 */
import { BUILDING_BY_KEY } from './catalog';
import { MAP_H, MAP_W, Terrain, idx, isWater, type GameState } from './types';

/** An islet smaller than this is a rock, not an isle. */
export const MIN_ISLE = 24;
/** Zone buildings (standing) an isle needs to count as settled, and how many settled isles the Atoll's goal asks. */
export const SETTLED_BUILDINGS = 6;
export const ATOLL_ISLES = 4;

export interface IsleMap {
  /** The isle of each tile, or -1 (water, or a rock under MIN_ISLE). */
  of: Int16Array;
  /** Land tiles of each isle, biggest first. */
  size: number[];
  /** Mean tile of each isle. */
  centre: { x: number; y: number }[];
}

const cache = new WeakMap<Uint8Array, IsleMap>();

export function isleMap(terrain: Uint8Array): IsleMap {
  const hit = cache.get(terrain);
  if (hit) return hit;
  const comp = new Int16Array(MAP_W * MAP_H).fill(-1);
  const found: { tiles: number[]; sx: number; sy: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < comp.length; start++) {
    if (comp[start] !== -1 || isWater(terrain[start]) || terrain[start] === Terrain.Marsh) continue;
    const tiles: number[] = [];
    let sx = 0, sy = 0;
    comp[start] = found.length;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      tiles.push(i);
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      sx += x; sy += y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const j = idx(nx, ny);
        if (comp[j] !== -1 || isWater(terrain[j]) || terrain[j] === Terrain.Marsh) continue;
        comp[j] = found.length;
        stack.push(j);
      }
    }
    found.push({ tiles, sx, sy });
  }
  const order = found.map((f, k) => k).filter((k) => found[k].tiles.length >= MIN_ISLE).sort((a, b) => found[b].tiles.length - found[a].tiles.length || a - b);
  const remap = new Map(order.map((k, n) => [k, n]));
  const of = new Int16Array(MAP_W * MAP_H).fill(-1);
  for (const [k, n] of remap) for (const i of found[k].tiles) of[i] = n;
  const out: IsleMap = { of, size: order.map((k) => found[k].tiles.length), centre: order.map((k) => ({ x: Math.round(found[k].sx / found[k].tiles.length), y: Math.round(found[k].sy / found[k].tiles.length) })) };
  cache.set(terrain, out);
  return out;
}

/** Standing zone buildings on each isle. */
export function isleBuildings(s: GameState): number[] {
  const m = isleMap(s.terrain);
  const n = new Array<number>(m.size.length).fill(0);
  for (const b of s.buildings) {
    if (!b || b.state !== 'ok' || BUILDING_BY_KEY[b.kind]?.category !== 'zone') continue;
    const k = m.of[idx(b.x, b.y)];
    if (k >= 0) n[k]++;
  }
  return n;
}

/** How many isles hold SETTLED_BUILDINGS standing zone buildings. */
export function settledIsles(s: GameState): number {
  return isleBuildings(s).filter((c) => c >= SETTLED_BUILDINGS).length;
}
