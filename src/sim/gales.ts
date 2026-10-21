/**
 * Sea-gales in the Hush (iteration 95, DESIGN §4.126): the Patagoi Atoll's own hazard. Twice each Hush a gale blows for two
 * days. While it blows the barges stay in port, and every plain Track laid over water (a bridge, a ford) is under the surf,
 * so folk and carts go round or wait. Cobbled and better bridges hold, and so does any bridge within GALE_HOLD tiles of a
 * Quay, a Landing, a Weir or a Great Weir.
 *
 * The spells are a pure function of the seed and the year (their own hashed stream), so the main stream never moves and the
 * Observatory can read them ahead. The closed tiles ride on `state.water.closed`, the set the roads' A* already refuses.
 */
import { Rng, hashString } from '../core/rng';
import { MOORINGS } from './catalog';
import { modifierSum } from './edicts';
import { DAYS_PER_SEASON, MAP_W, RoadType, Terrain, type GameState } from './types';

export const GALES_PER_HUSH = 2;
export const GALE_DAYS = 2;
/** A Quay, a Landing, a Weir or a Great Weir within this many tiles holds the bridges round it. */
export const GALE_HOLD = 6;
const HOLDERS = [...MOORINGS, 'weir'];

/** The first day (within the Hush, 0..29) of each gale of the Hush of the given year: one in each half, two days apart at least. */
export function galeStarts(seed: number, year: number): number[] {
  const rng = new Rng(hashString(`${seed}:${year}:gale`));
  const first = 3 + rng.int(9); // days 3..11
  const second = 16 + rng.int(12); // days 16..27
  return [first, second];
}

/** Whether a gale blows on this day, in a game of this charter. Only the atoll has gales (the dev panel may force one). */
export function galeOn(s: GameState, day: number): boolean {
  const hush = Math.floor(day / DAYS_PER_SEASON) % 4 === 3;
  if (hush && s.scenario === 'atoll') {
    const year = Math.floor(day / (DAYS_PER_SEASON * 4));
    const d = day % DAYS_PER_SEASON;
    for (const start of galeStarts(s.seed, year)) if (d >= start && d < start + GALE_DAYS) return true;
  }
  return false;
}

/** A gale blows today (or the dev panel has forced one). */
export function galeToday(s: GameState): boolean {
  return galeOn(s, s.day) || modifierSum(s, 'gale') > 0;
}

/** Whether a standing Quay, Landing, Weir or Great Weir within GALE_HOLD of tile i holds the bridge there. */
export function galeHeld(s: GameState, i: number): boolean {
  const x = i % MAP_W, y = (i / MAP_W) | 0;
  return s.buildings.some((b) => b && b.state === 'ok' && HOLDERS.includes(b.kind) && Math.hypot(b.x - x, b.y - y) <= GALE_HOLD);
}

/** A plain Track over shallow water that today's gale closes. */
export function galeClosed(s: GameState, i: number): boolean {
  return s.terrain[i] === Terrain.Water && s.road[i] === RoadType.Track && galeToday(s) && !galeHeld(s, i);
}

/** The next gale day within `ahead` days from today (not today), or null: for the Observatory's forecast. */
export function galeIn(s: GameState, ahead: number): number | null {
  for (let k = 1; k <= ahead; k++) if (galeOn(s, s.day + k) && !galeOn(s, s.day + k - 1)) return k;
  return null;
}
