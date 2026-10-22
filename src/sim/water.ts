/**
 * The water's lake (M16 part 2, iteration 60; DESIGN §16 and §4.91). The lake, the open water the river does not have,
 * lifts the land around it and feeds its wells. The fishing, the reeds and thatch, the fords and the Weir are parked
 * (scope reset phase 1c); `docs/PARKED.md` says how they come back.
 */
import { MAP_H, MAP_W, Terrain, idx, inBounds, isWater, type GameState } from './types';

export const LAKE_LAND = 6; // land within LAKE_LAND_REACH of open water
export const LAKE_LAND_REACH = 4;
export const LAKE_WELL_REACH = 3; // a well within this of open water serves LAKE_WELL_CAP × its cap
export const LAKE_WELL_CAP = 1.5;

// ---------- the waters: bodies, open water, the lake ----------
export interface Waters {
  body: Int16Array; // each tile's body of water, -1 on land
  tiles: number[]; // water tiles a body has
  deep: number[]; // deep tiles a body has
  open: Uint8Array; // open water: the lake (a 5×5 block of water), which the 2–3-wide river does not have
  lakeDist: Uint8Array; // Chebyshev distance to open water, capped at 9
}
const cache = new WeakMap<Uint8Array, Waters>();

/** The waters of a map, worked out from its terrain once (the terrain's water never changes in play). */
export function watersOf(state: GameState): Waters {
  const t = state.terrain;
  const hit = cache.get(t);
  if (hit) return hit;
  const n = MAP_W * MAP_H;
  const body = new Int16Array(n).fill(-1);
  const tiles: number[] = [];
  const deep: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (body[i] >= 0 || !isWater(t[i])) continue;
    const id = tiles.length;
    tiles.push(0);
    deep.push(0);
    body[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      tiles[id]++;
      if (t[j] === Terrain.DeepWater) deep[id]++;
      const x = j % MAP_W;
      const y = (j / MAP_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const k = idx(nx, ny);
        if (body[k] < 0 && isWater(t[k])) { body[k] = id; stack.push(k); }
      }
    }
  }
  const open = new Uint8Array(n);
  for (let y = 2; y < MAP_H - 2; y++)
    for (let x = 2; x < MAP_W - 2; x++) {
      let all = true;
      for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2 && all; dx++) if (!isWater(t[idx(x + dx, y + dy)])) all = false;
      if (all) open[idx(x, y)] = 1;
    }
  // Chebyshev distance to open water (a BFS over the 8-neighbourhood)
  const lakeDist = new Uint8Array(n).fill(9);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (open[i]) { lakeDist[i] = 0; queue.push(i); }
  for (let h = 0; h < queue.length; h++) {
    const j = queue[h];
    const d = lakeDist[j] + 1;
    if (d >= 9) continue;
    const x = j % MAP_W;
    const y = (j / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const k = idx(nx, ny);
        if (lakeDist[k] > d) { lakeDist[k] = d; queue.push(k); }
      }
  }
  const w: Waters = { body, tiles, deep, open, lakeDist };
  cache.set(t, w);
  return w;
}

/** Forget a map's waters after its terrain was painted (the tests and the dev panel; play never changes the water). */
export function forgetWaters(state: GameState): void {
  cache.delete(state.terrain);
}

/** The tile's distance to the lake's open water (capped at 9). */
export function lakeDistAt(state: GameState, x: number, y: number): number {
  return inBounds(x, y) ? watersOf(state).lakeDist[idx(x, y)] : 9;
}
