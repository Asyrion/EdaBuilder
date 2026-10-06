// The marsh (iteration 85, DESIGN §17.1 and §4.116): reed beds and standing pools beside slow water. Nothing is built on it,
// a road crosses it as a causeway at a bridge's price (actions.ts), it breeds miasma (services.ts) and the reed-cutters cut
// it (water.ts). The Drainage edict turns the marsh nearest the city to meadow, a few tiles a day, for a daily cost.
import { MAP_W, Terrain, type GameState } from './types';
import { forEachBuilding, markDirtyAround, pushMessage } from './world';

/** Marsh tiles the Drainage edict turns to meadow each day. */
export const DRAIN_PER_DAY = 3;
/** The edict's price: a base, and a little more for every ten marsh tiles left on the map. */
export const DRAIN_BASE = 30;
export const DRAIN_PER_TEN = 2;

export function marshCount(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Marsh) n++;
  return n;
}

export function drainageCost(s: GameState): number {
  return DRAIN_BASE + DRAIN_PER_TEN * Math.floor(marshCount(s) / 10);
}

/** The marsh tiles nearest the city: by the squared distance to the nearest building's footprint, ties by tile index. */
export function nearestMarsh(s: GameState, n: number): number[] {
  const sites: { x0: number; y0: number; x1: number; y1: number }[] = [];
  forEachBuilding(s, (b) => { sites.push({ x0: b.x, y0: b.y, x1: b.x + b.w - 1, y1: b.y + b.h - 1 }); });
  if (!sites.length) return [];
  const cands: { i: number; d: number }[] = [];
  for (let i = 0; i < s.terrain.length; i++) {
    if (s.terrain[i] !== Terrain.Marsh) continue;
    const x = i % MAP_W; const y = (i / MAP_W) | 0;
    let best = Infinity;
    for (const b of sites) {
      const dx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
      const dy = y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    cands.push({ i, d: best });
  }
  cands.sort((a, b) => a.d - b.d || a.i - b.i);
  return cands.slice(0, n).map((c) => c.i);
}

/** The day's drainage: while the edict stands, the nearest marsh becomes meadow. No rng is drawn. */
export function dailyDrainage(s: GameState): void {
  if (!s.edicts.drainage) return; // a city-wide edict (read directly: edicts.ts imports this module's prices)
  const tiles = nearestMarsh(s, DRAIN_PER_DAY);
  for (const i of tiles) {
    s.terrain[i] = Terrain.Meadow;
    markDirtyAround(s, i % MAP_W, (i / MAP_W) | 0);
  }
  s.stats.marshDrained = (s.stats.marshDrained ?? 0) + tiles.length;
  if (tiles.length && marshCount(s) === 0) pushMessage(s, 'The last of the marsh is drained. The reeds are gone with it.', 'info');
}
