// The marsh-wyrms (iteration 86, DESIGN §17.1 item 2, §8.1 and §8.6): eel-like wyrms of the rivers and lakes, out in Bloom.
// One may lair under a bridge, and the carts on it crawl (roads.ts reads the lair). The Veshari Hall's coverage drives it
// off, and no wyrm lairs within a Quay's ward. In Bloom a wyrm by marsh makes a nest, and a nest by a Quay gives the city a
// tide egg (the bargemen bring it in). Every roll comes from a side stream keyed by the seed and the day: the main stream
// never moves for them, only their effects do.
import { Rng, hashString } from '../core/rng';
import { coverageAt } from './services';
import { isFordTile, watersOf } from './water';
import { addEgg } from './wyrmcraft';
import { DAYS_PER_SEASON, MAP_W, Terrain, idx, inBounds, isWater, type GameState, type MarshWyrm } from './types';
import { markDirtyAround, pushMessage } from './world';

/** A body of water this large holds a wyrm in Bloom, one more for every WYRM_TILES tiles, at most WYRM_MAX. */
export const WYRM_MIN_BODY = 60;
export const WYRM_TILES = 400;
export const WYRM_MAX = 3;
/** Tiles a wyrm swims in a day. */
export const WYRM_SWIM = 6;
/** The chance a day that a wyrm without a lair takes one under a bridge within WYRM_LAIR_REACH. */
export const WYRM_LAIR_CHANCE = 0.2;
export const WYRM_LAIR_REACH = 12;
/** A cart on a lair tile runs at this share of its speed (roads.ts applies it). */
export { WYRM_CRAWL_SPEED as WYRM_CRAWL } from './roads';
/** The Veshari Hall's fire coverage (0..1) at a lair that drives the wyrm off. */
export const WYRM_DRIVE = 0.3;
/** No wyrm lairs within this many tiles of a Quay. */
export const QUAY_WARD = 10;
/** On this day of Bloom a wyrm by marsh nests; a nest within NEST_QUAY_REACH of a Quay gives a tide egg (one a Bloom). */
export const NEST_DAY = 20;
export const NEST_MARSH_REACH = 4;
export const NEST_QUAY_REACH = 8;
/** What the Crown's assessor pays for a tide egg no cradle can take. */
export const NEST_EGG_PRICE = 1500;

function sideRng(s: GameState): Rng {
  return new Rng(hashString(`${s.seed}:${s.day}:marshwyrm`));
}

const BLOOM = 1;
const seasonDay = (s: GameState) => s.day % DAYS_PER_SEASON;
const season = (s: GameState) => Math.floor(s.day / DAYS_PER_SEASON) % 4;

/** A bridge: a road on water that is not a ford. */
export function isBridge(s: GameState, i: number): boolean {
  return !!s.road[i] && isWater(s.terrain[i]) && !isFordTile(s, i);
}

/** Whether a wyrm lairs under this tile today (roads.ts reads it for the crawl). */
export function lairAt(s: GameState, i: number): boolean {
  const ws = s.marshWyrms;
  if (!ws || !ws.length) return false;
  for (const w of ws) if (w.lair === i) return true;
  return false;
}

function quaysOf(s: GameState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const b of s.buildings) if (b && b.kind === 'quay' && b.state === 'ok') out.push({ x: b.x, y: b.y });
  return out;
}

/** Inside a Quay's ward: no wyrm lairs here. */
export function inQuayWard(s: GameState, x: number, y: number, quays = quaysOf(s)): boolean {
  return quays.some((q) => Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) <= QUAY_WARD);
}

/** The Bloom's wyrms: by the size of each body of water, each on a tile of its body. */
export function wyrmsFor(s: GameState, rng: Rng): MarshWyrm[] {
  const w = watersOf(s);
  const out: MarshWyrm[] = [];
  let id = 1;
  const byBody: number[][] = w.tiles.map(() => []);
  for (let i = 0; i < s.terrain.length; i++) if (w.body[i] >= 0) byBody[w.body[i]].push(i);
  for (let b = 0; b < w.tiles.length; b++) {
    if (w.tiles[b] < WYRM_MIN_BODY) continue;
    const n = Math.min(WYRM_MAX, 1 + Math.floor(w.tiles[b] / WYRM_TILES));
    for (let k = 0; k < n; k++) {
      const i = byBody[b][rng.int(byBody[b].length)];
      out.push({ id: id++, x: i % MAP_W, y: (i / MAP_W) | 0, lair: -1, nest: -1 });
    }
  }
  return out;
}

/** A day's swim: up to WYRM_SWIM steps through water of the same body. */
function swim(s: GameState, wy: MarshWyrm, rng: Rng): void {
  const w = watersOf(s);
  const body = w.body[idx(wy.x, wy.y)];
  for (let k = 0; k < WYRM_SWIM; k++) {
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][rng.int(4)];
    const nx = wy.x + d[0]; const ny = wy.y + d[1];
    if (inBounds(nx, ny) && w.body[idx(nx, ny)] === body) { wy.x = nx; wy.y = ny; }
  }
}

/** The bridge a wyrm would lair under: the nearest in reach, outside a Quay's ward, not covered by the Veshari Hall. */
export function lairFor(s: GameState, wy: MarshWyrm, quays = quaysOf(s)): number {
  let best = -1; let bd = Infinity;
  for (let dy = -WYRM_LAIR_REACH; dy <= WYRM_LAIR_REACH; dy++) for (let dx = -WYRM_LAIR_REACH; dx <= WYRM_LAIR_REACH; dx++) {
    const x = wy.x + dx; const y = wy.y + dy;
    if (!inBounds(x, y)) continue;
    const i = idx(x, y);
    if (!isBridge(s, i) || lairAt(s, i)) continue;
    if (inQuayWard(s, x, y, quays) || coverageAt(s, 'fire', x, y) >= WYRM_DRIVE) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** The nearest marsh within NEST_MARSH_REACH of a wyrm, or -1. */
function nestFor(s: GameState, wy: MarshWyrm): number {
  let best = -1; let bd = Infinity;
  for (let dy = -NEST_MARSH_REACH; dy <= NEST_MARSH_REACH; dy++) for (let dx = -NEST_MARSH_REACH; dx <= NEST_MARSH_REACH; dx++) {
    const x = wy.x + dx; const y = wy.y + dy;
    if (!inBounds(x, y) || s.terrain[idx(x, y)] !== Terrain.Marsh) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = idx(x, y); }
  }
  return best;
}

function leaveLair(s: GameState, wy: MarshWyrm, why: string): void {
  const i = wy.lair;
  wy.lair = -1;
  s.stats.wyrmsDriven = (s.stats.wyrmsDriven ?? 0) + 1;
  markDirtyAround(s, i % MAP_W, (i / MAP_W) | 0);
  pushMessage(s, `The marsh-wyrm under the bridge is gone: ${why}. The carts cross at speed again.`, 'good', true, { x: i % MAP_W, y: (i / MAP_W) | 0 });
}

/** The day's wyrms: they come with Bloom and go with Ember; between, they swim, lair, are driven off and nest. */
export function dailyMarshWyrms(s: GameState): void {
  const sd = seasonDay(s);
  if (season(s) !== BLOOM) {
    if (s.marshWyrms && s.marshWyrms.length) {
      for (const w of s.marshWyrms) if (w.lair >= 0) markDirtyAround(s, w.lair % MAP_W, (w.lair / MAP_W) | 0);
      s.marshWyrms = [];
      pushMessage(s, 'The marsh-wyrms go back down to the deep water with the Ember. The bridges are clear.', 'info');
    }
    return;
  }
  const rng = sideRng(s);
  if (sd === 0 || !s.marshWyrms) {
    s.marshWyrms = wyrmsFor(s, rng);
    if (s.marshWyrms.length) pushMessage(s, `Bloom brings the marsh-wyrms up the river: ${s.marshWyrms.length} in the valley's water. They lair under bridges, where the carts crawl; a Veshari Hall drives them off, and none comes near a Quay.`, 'info');
  }
  const quays = quaysOf(s);
  for (const wy of s.marshWyrms) {
    if (wy.lair >= 0) {
      const lx = wy.lair % MAP_W; const ly = (wy.lair / MAP_W) | 0;
      if (!isBridge(s, wy.lair)) { wy.lair = -1; continue; } // the bridge is gone
      if (coverageAt(s, 'fire', lx, ly) >= WYRM_DRIVE) { leaveLair(s, wy, 'the Veshari Hall\'s water-mages drove it off'); swim(s, wy, rng); continue; }
      if (inQuayWard(s, lx, ly, quays)) { leaveLair(s, wy, 'the Quay\'s bargemen poled it out'); swim(s, wy, rng); continue; }
      continue;
    }
    swim(s, wy, rng);
    if (rng.chance(WYRM_LAIR_CHANCE)) {
      const i = lairFor(s, wy, quays);
      if (i >= 0) {
        wy.lair = i; wy.x = i % MAP_W; wy.y = (i / MAP_W) | 0;
        s.stats.wyrmsLaired = (s.stats.wyrmsLaired ?? 0) + 1;
        markDirtyAround(s, wy.x, wy.y);
        pushMessage(s, 'A marsh-wyrm lairs under a bridge: carts crawl across it. A Veshari Hall that covers the bridge drives it off; none lairs within ten tiles of a Quay.', 'bad', true, { x: wy.x, y: wy.y });
      }
    }
  }
  if (sd === NEST_DAY) {
    let egg = false;
    for (const wy of s.marshWyrms) {
      wy.nest = nestFor(s, wy);
      if (wy.nest < 0 || egg) continue;
      const nx = wy.nest % MAP_W; const ny = (wy.nest / MAP_W) | 0;
      if (!quays.some((q) => Math.max(Math.abs(q.x - nx), Math.abs(q.y - ny)) <= NEST_QUAY_REACH)) continue;
      egg = true;
      s.stats.tideNests = (s.stats.tideNests ?? 0) + 1;
      const d = addEgg(s, 'tide');
      if (d) pushMessage(s, `The bargemen bring in a tide egg from a marsh-wyrm's nest by the Quay. The tamers call it ${d.name}.`, 'milestone', true, { x: nx, y: ny });
      else { s.treasury += NEST_EGG_PRICE; pushMessage(s, `The bargemen bring in a tide egg from a marsh-wyrm's nest by the Quay. No cradle has room: the Crown's assessor pays ${NEST_EGG_PRICE.toLocaleString('en')} crowns.`, 'good', true, { x: nx, y: ny }); }
    }
  }
}
