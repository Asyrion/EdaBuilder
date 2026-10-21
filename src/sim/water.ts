/**
 * The water (M16 part 2, iteration 60; DESIGN §16 and §4.91). Every body of water holds a shoal of fish that Fishers'
 * Huts net from boats; fish spoil in two days unless a market's shelf or a Smokehouse takes them. Reed-cutters cut the
 * shore's reeds into thatch for the level-1 homes (comfort, and a roof that burns). The lake, the open water the river
 * does not have, lifts the land around it and feeds its wells; a Water Garden must stand on its shore. A Dirt Track over
 * a narrow river tile is a ford: cheap, but closed at high water unless a Weir holds the river.
 *
 * Like the wild, the fishing draws from side streams keyed by the seed, so a city with no hut adds no roll to the main
 * stream. The fords change the roads' paths, and so the main stream, only where a track crosses the river.
 */
import { GALE_HOLD, galeClosed, galeOn, galeToday } from './gales';
import { Rng, hashString } from '../core/rng';
import { BUILDING_BY_KEY } from './catalog';
import { bumpRoadVersion } from './agents';
import { capacityOf } from './growth';
import { edictOn } from './edicts';
import { AgentKind, DAYS_PER_SEASON, MAP_H, MAP_W, RoadType, Terrain, Zone, idx, inBounds, isWater, type Agent, type Building, type GameState } from './types';
import { forEachBuilding, markDirty, pushMessage, seasonOf } from './world';

export const FISH_REACH = 8; // a hut fishes the water of its body within this many tiles
export const FISH_MARKET_REACH = 12; // and carries its catch to the markets within this
export const MARKET_FISH_CAP = 6; // fish a market's shelf holds
export const MARKET_FISH_SOLD = 2; // a market sells this many a day
export const FISH_HAPPY_REACH = 10; // a hearth within this of a market with fish: +FISH_HAPPY
export const FISH_HAPPY = 3;
export const SMOKE_REACH = 6; // a smokehouse takes the fish of the huts within this
export const SMOKE_RATE = 10; // fish a smokehouse smokes a day at full crew
export const SMOKE_KEEP = 10; // smoked fish over this goes down the Gloam road
export const FISH_PRICE = [2, 2, 2.5, 3]; // smoked fish on the Gloam road by season
export const SHOAL_PER_TILE = 0.6; // a shoal's cap: this a water tile, 1.0 a deep tile
export const SHOAL_REGROW = [0.1, 0.15, 0.1, 0]; // by season: the spawn is in Bloom, none in the Hush (one full hut holds a shoal of 100 at about half; two take it down)
export const FISHED_OUT = 0.2; // a shoal under this share of its cap is fished out
export const CLOSE_SHOAL = 1 / 3; // the Close Season: no hut takes a shoal under this share
export const OTTER_EATS = 0.3; // fish an otter of a holt in the body eats a day
export const REED_REACH = 6; // reed beds: open shore within this of the cutters
export const THATCH_REACH = 10; // homes within this of the cutters are thatched
export const THATCH_DAYS = 60;
export const THATCH_HAPPY = 3;
export const THATCH_FIRE = 1.5; // a thatched roof catches 1.5× as easily
export const LAKE_LAND = 6; // land within LAKE_LAND_REACH of open water
export const LAKE_LAND_REACH = 4;
export const LAKE_WELL_REACH = 3; // a well within this of open water serves LAKE_WELL_CAP × its cap
export const LAKE_WELL_CAP = 1.5;
export const WEIR_REACH = 6; // a Weir holds the fords within this, and doubles its body's regrowth
export const HIGH_WATER_DAYS = 10; // the Thaw's first days: the fords are under water
export const FORD_COST = 1.5; // a ford's cost against a plain track (a bridge is 4×)

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

/** A shoal's cap: 0.6 a water tile, 1.0 a deep one. */
export function shoalCap(w: Waters, b: number): number {
  return (w.tiles[b] - w.deep[b]) * SHOAL_PER_TILE + w.deep[b];
}

/** The tile's distance to the lake's open water (capped at 9). */
export function lakeDistAt(state: GameState, x: number, y: number): number {
  return inBounds(x, y) ? watersOf(state).lakeDist[idx(x, y)] : 9;
}

/** The shoals, made whole for the map: a body with no shoal yet (a new map, an old save) starts full. */
export function ensureShoals(state: GameState): Waters {
  const w = watersOf(state);
  const f = state.water.fish;
  for (let b = f.length; b < w.tiles.length; b++) f.push(shoalCap(w, b));
  if (f.length > w.tiles.length) f.length = w.tiles.length;
  return w;
}

function sideRng(state: GameState, tag: string): Rng {
  return new Rng(hashString(`${state.seed}:${state.day}:${tag}`));
}

function okOf(state: GameState, kind: string): Building[] {
  const out: Building[] = [];
  forEachBuilding(state, (b) => { if (b.kind === kind && b.state === 'ok') out.push(b); });
  return out;
}

function crewOf(state: GameState, b: Building): number {
  return Math.max(0, Math.min(1, b.workers / Math.max(1, capacityOf(b, state))));
}

/** The body a building fishes: the body of the first water tile in its ring (the one its boats put out on), -1. */
export function bodyOf(state: GameState, b: Building): number {
  const w = watersOf(state);
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (inBounds(x, y) && w.body[idx(x, y)] >= 0) return w.body[idx(x, y)];
    }
  return -1;
}

/** Water tiles of a body within FISH_REACH of a building. */
export function fishingWater(state: GameState, b: Building, body = bodyOf(state, b)): number {
  if (body < 0) return 0;
  const w = watersOf(state);
  let n = 0;
  for (let dy = -FISH_REACH; dy <= FISH_REACH; dy++)
    for (let dx = -FISH_REACH; dx <= FISH_REACH; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (dx * dx + dy * dy <= FISH_REACH * FISH_REACH && inBounds(x, y) && w.body[idx(x, y)] === body) n++;
    }
  return n;
}

/** Why a hut takes no fish today (for the panel), or null. */
export function fishBlock(state: GameState, b: Building): string | null {
  const body = bodyOf(state, b);
  if (body < 0) return 'no water at its door';
  if (edictOn(state, 'closeseason') && seasonOf(state) === 1) return 'the Close Season: no fishing in Bloom';
  const w = ensureShoals(state);
  if (edictOn(state, 'closeseason') && state.water.fish[body] < shoalCap(w, body) * CLOSE_SHOAL) return 'the Close Season: the shoal is under a third';
  if (b.workers <= 0) return 'no crew';
  return null;
}

/** What a hut would land today: crew × 1.2 × the shoal's share, at most its water ÷ 6, half in the Hush on a river that does not freeze. */
export function catchOf(state: GameState, b: Building): number {
  if (fishBlock(state, b)) return 0;
  const body = bodyOf(state, b);
  const w = ensureShoals(state);
  const share = Math.max(0, state.water.fish[body] / Math.max(1, shoalCap(w, body)));
  let c = b.workers * 1.2 * share;
  c = Math.min(c, fishingWater(state, b, body) / 6);
  if (seasonOf(state) === 3) c *= 0.5;
  return c;
}

/** Daily: the shoals regrow (twice as fast in a body with a Weir, or after the spawning run let go), the otters eat. */
export function dailyShoals(state: GameState): void {
  const w = ensureShoals(state);
  const f = state.water.fish;
  const weirBodies = new Set(okOf(state, 'weir').map((b) => bodyOf(state, b)));
  let r = SHOAL_REGROW[seasonOf(state)];
  if (state.water.spawnUntil > state.day) r *= 2;
  for (let b = 0; b < f.length; b++) {
    const cap = shoalCap(w, b);
    const rate = r * (weirBodies.has(b) ? 2 : 1);
    f[b] += rate * f[b] * (1 - f[b] / Math.max(1, cap));
    f[b] = Math.min(cap, f[b]);
  }
  // the otters' holts eat from the body beside them (the wild's otters, iteration 58)
  for (const h of state.wild.herds) {
    if (h.sp !== 'otter') continue;
    let body = -1;
    for (let dy = -1; dy <= 1 && body < 0; dy++) for (let dx = -1; dx <= 1 && body < 0; dx++) if (inBounds(h.x + dx, h.y + dy)) body = w.body[idx(h.x + dx, h.y + dy)];
    if (body >= 0) f[body] = Math.max(0, f[body] - OTTER_EATS * h.head);
  }
}

/** Daily: the markets sell, then the huts carry yesterday's catch and today's to the shelves, the smokehouses take the rest,
 *  what is two days old spoils, and today's catch comes in. */
export function dailyFish(state: GameState): void {
  const w = ensureShoals(state);
  const rng = sideRng(state, 'fish');
  const markets: Building[] = [];
  forEachBuilding(state, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok') markets.push(b); });
  for (const m of markets) if ((m.fish ?? 0) > 0) m.fish = Math.max(0, (m.fish ?? 0) - MARKET_FISH_SOLD);
  const huts = okOf(state, 'fishershut');
  const smokers = okOf(state, 'smokehouse').map((s) => ({ s, room: SMOKE_RATE * Math.max(0.25, crewOf(state, s)) * (s.workers > 0 ? 1 : 0) }));
  const shelve = (h: Building, lot: 'fishOld' | 'fish') => {
    const near = markets.filter((m) => Math.hypot(m.x - h.x, m.y - h.y) <= FISH_MARKET_REACH).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y) || a.id - b.id);
    for (const m of near) {
      const put = Math.min(Math.floor(h[lot] ?? 0), MARKET_FISH_CAP - (m.fish ?? 0));
      if (put <= 0) continue;
      m.fish = (m.fish ?? 0) + put;
      h[lot] = (h[lot] ?? 0) - put;
    }
  };
  const smoke = (h: Building, lot: 'fishOld' | 'fish') => {
    for (const sm of smokers) {
      if (sm.room <= 0 || (h[lot] ?? 0) <= 0 || Math.hypot(sm.s.x - h.x, sm.s.y - h.y) > SMOKE_REACH) continue;
      const take = Math.min(h[lot] ?? 0, sm.room);
      sm.room -= take;
      h[lot] = (h[lot] ?? 0) - take;
      sm.s.stock += take;
      state.stats.fishSmoked += take;
    }
  };
  for (const h of huts) { shelve(h, 'fishOld'); shelve(h, 'fish'); }
  for (const h of huts) { smoke(h, 'fishOld'); smoke(h, 'fish'); }
  // smoked fish fills what shelf room is left
  for (const sm of smokers) {
    if (sm.s.stock < 1) continue;
    for (const m of markets) {
      if (Math.hypot(m.x - sm.s.x, m.y - sm.s.y) > FISH_MARKET_REACH) continue;
      const put = Math.min(Math.floor(sm.s.stock), MARKET_FISH_CAP - (m.fish ?? 0));
      if (put <= 0) continue;
      m.fish = (m.fish ?? 0) + put;
      sm.s.stock -= put;
    }
  }
  let spoiledAll = 0;
  for (const h of huts) {
    const spoiled = h.fishOld ?? 0;
    h.spoiled = spoiled;
    spoiledAll += spoiled;
    state.stats.fishSpoiled += spoiled;
    h.fishOld = h.fish ?? 0;
    // today's catch
    const c = catchOf(state, h);
    const body = bodyOf(state, h);
    let got = Math.floor(c) + (rng.chance(c - Math.floor(c)) ? 1 : 0);
    if (body >= 0) got = Math.min(got, Math.floor(state.water.fish[body]));
    if (body >= 0) state.water.fish[body] -= got;
    h.caught = got;
    h.fish = got;
    state.stats.fishCaught += got;
  }
  if (spoiledAll >= 6 && state.day % 5 === 0) pushMessage(state, `${Math.round(spoiledAll)} fish spoiled on the huts' racks last night: a market within ${FISH_MARKET_REACH} tiles or a Smokehouse within ${SMOKE_REACH} would take them.`, 'warn', false);
  const at: number[] = [];
  for (const m of markets) if ((m.fish ?? 0) >= 1) at.push(m.x, m.y);
  state.water.fishAt = at;
  void w;
}

/** Whether a hearth has a market with fish within FISH_HAPPY_REACH (yesterday's shelves). */
export function fishNear(state: GameState, x: number, y: number): boolean {
  const at = state.water.fishAt;
  for (let k = 0; k < at.length; k += 2) if (Math.hypot(at[k] - x, at[k + 1] - y) <= FISH_HAPPY_REACH) return true;
  return false;
}

/** Whether a shoal is fished out (under a fifth of its cap). */
export function fishedOut(state: GameState, body: number): boolean {
  const w = ensureShoals(state);
  return body >= 0 && state.water.fish[body] < shoalCap(w, body) * FISHED_OUT;
}

// ---------- reeds and thatch ----------
/** Reed beds: open shore within REED_REACH of the cutters, no building and no road on it; a marsh tile is all reeds and
 *  counts twice (iteration 85). */
export function reedBeds(state: GameState, b: Building): number {
  let n = 0;
  for (let dy = -REED_REACH; dy <= REED_REACH; dy++)
    for (let dx = -REED_REACH; dx <= REED_REACH; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (!inBounds(x, y) || dx * dx + dy * dy > REED_REACH * REED_REACH) continue;
      const i = idx(x, y);
      if (state.bIndex[i] >= 0 || state.road[i]) continue;
      if (state.terrain[i] === Terrain.Shore) n++;
      else if (state.terrain[i] === Terrain.Marsh) n += 2;
    }
  return n;
}

/** Whether a home stands thatched today. */
export function thatched(state: GameState, b: Building): boolean {
  return b.level === 1 && (b.thatchUntil ?? -1) > state.day && BUILDING_BY_KEY[b.kind].zone === Zone.Hearth;
}

/** Daily: the cutters cut (not in the Hush) and thatch the nearest level-1 homes whose thatch is missing or wearing out. */
export function dailyReeds(state: GameState): void {
  const hush = seasonOf(state) === 3;
  const homes: Building[] = [];
  forEachBuilding(state, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Hearth && b.state === 'ok' && b.level === 1 && b.residents > 0) homes.push(b); });
  for (const c of okOf(state, 'reedcutters')) {
    c.caught = 0;
    if (!hush && c.workers > 0) {
      const cut = Math.min(c.workers, Math.floor(reedBeds(state, c) / 5));
      c.stock = Math.min(20, c.stock + cut);
      c.caught = cut;
    }
    if (c.stock < 1) continue;
    const want = homes.filter((h) => (h.thatchUntil ?? -1) <= state.day + 10 && Math.hypot(h.x - c.x, h.y - c.y) <= THATCH_REACH).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y) || a.id - b.id);
    for (const h of want) {
      if (c.stock < 1) break;
      c.stock -= 1;
      h.thatchUntil = state.day + THATCH_DAYS;
      state.stats.homesThatched++;
    }
  }
}

// ---------- the fords ----------
/** A ford: a Dirt Track on a narrow river tile (land on both opposite sides within two). */
export function isFordTile(state: GameState, i: number): boolean {
  return state.terrain[i] === Terrain.Water && fordable(state, i) && state.road[i] === RoadType.Track;
}
/** A shallow water tile narrow enough to ford: land within two on both sides, across x or across y. */
export function fordable(state: GameState, i: number): boolean {
  if (state.terrain[i] !== Terrain.Water) return false;
  const x = i % MAP_W;
  const y = (i / MAP_W) | 0;
  const land = (tx: number, ty: number) => inBounds(tx, ty) && !isWater(state.terrain[idx(tx, ty)]);
  const across = (dx: number, dy: number) => (land(x + dx, y + dy) || land(x + 2 * dx, y + 2 * dy)) && (land(x - dx, y - dy) || land(x - 2 * dx, y - 2 * dy));
  return across(1, 0) || across(0, 1);
}

/** High water: the Thaw's first days, when the Hush's snow comes down the river (so not in the charter's first Thaw, which no Hush came before). */
export function highWater(state: GameState): boolean {
  return seasonOf(state) === 0 && state.day >= DAYS_PER_SEASON * 4 && state.day % DAYS_PER_SEASON < HIGH_WATER_DAYS;
}

/** Whether a ford tile is under water today: high water or a flood reaches it, the river is not frozen, and no Weir holds it. */
export function fordClosedToday(state: GameState, i: number): boolean {
  const x = i % MAP_W;
  const y = (i / MAP_W) | 0;
  if (!highWater(state)) return false;
  return !weirHolds(state, i);
}

/** Whether a standing Weir within WEIR_REACH holds the ford at tile i open at high water. */
export function weirHolds(state: GameState, i: number): boolean {
  const x = i % MAP_W;
  const y = (i / MAP_W) | 0;
  return state.buildings.some((b) => b && b.kind === 'weir' && b.state === 'ok' && Math.hypot(b.x - x, b.y - y) <= WEIR_REACH);
}

const closedSets = new WeakMap<GameState, Set<number>>();
/** Whether a road tile is a ford closed today (read by the road A*). */
export function fordClosed(state: GameState, i: number): boolean {
  const c = state.water?.closed;
  if (!c || !c.length) return false;
  if (state.road[i] !== RoadType.Track) return false; // a bridge cobbled mid-gale (or a ford raised to a road) is open at once (iteration 95)
  let set = closedSets.get(state);
  if (!set || set.size !== c.length) { set = new Set(c); closedSets.set(state, set); }
  return set.has(i);
}

/** Daily: which fords stand closed today; the roads' paths are worked again when that changes. */
export function dailyFords(state: GameState): void {
  const closed: number[] = [];
  let fords = 0;
  for (let i = 0; i < state.road.length; i++) {
    if (!state.road[i]) continue;
    const ford = isFordTile(state, i);
    if (ford) fords++;
    if ((ford && fordClosedToday(state, i)) || galeClosed(state, i)) closed.push(i); // a gale also shuts the plain bridges (iteration 95)
  }
  const before = state.water.closed;
  const same = before.length === closed.length && before.every((v, k) => v === closed[k]);
  state.water.closed = closed;
  closedSets.delete(state);
  if (!same) {
    bumpRoadVersion();
    for (const i of new Set([...before, ...closed])) markDirty(state, i % MAP_W, (i / MAP_W) | 0); // the ground redraws the ford under water or above it
    // agents mid-crossing turn back: a path through a closed ford is dropped and worked again
    if (closed.length) {
      const set = new Set(closed);
      for (const a of state.agents) if ((a.kind === AgentKind.Citizen || a.kind === AgentKind.Cart || a.kind === AgentKind.Builder) && a.path.some((t, k) => k >= a.pathIdx && set.has(t))) { a.path = []; a.pathIdx = 0; a.timer = Math.max(a.timer, 20); }
      if (!before.length && galeToday(state)) pushMessage(state, `A sea-gale blows in: ${closed.length} plain track bridge${closed.length === 1 ? ' is' : 's are'} under the surf and the barges stay in port. Cobbled bridges hold, and so do bridges within ${GALE_HOLD} tiles of a Quay or a Weir.`, 'warn', true, { x: closed[0] % MAP_W, y: (closed[0] / MAP_W) | 0 });
      else if (!before.length) pushMessage(state, `High water: ${closed.length} ford${closed.length === 1 ? ' is' : 's are'} under the river. Carts and folk go round by a bridge, if there is one; a Weir within ${WEIR_REACH} tiles holds a ford.`, 'warn', true, { x: closed[0] % MAP_W, y: (closed[0] / MAP_W) | 0 });
    } else if (before.length) pushMessage(state, galeToday(state) ? 'The gale blows on, but the bridges you cobbled hold.' : galeOn(state, state.day - 1) ? 'The gale blows itself out: the bridges are open again.' : 'The river falls: the fords are open again.', 'info', false);
  }
  if (closed.length) state.stats.fordDaysClosed++;
  if (galeToday(state)) state.stats.galeDays++;
  void fords;
}

// ---------- boats ----------
/** The boats a hut puts out: one, two with a full crew; none while it takes no fish. */
export function boatsWanted(state: GameState, b: Building): number {
  if (b.state !== 'ok' || fishBlock(state, b)) return 0;
  return b.workers >= 4 ? 2 : 1;
}

/** Keep each hut's boats in step with it; a hut gone takes its boats with it. */
export function syncBoats(state: GameState): void {
  const rng = sideRng(state, `boats:${state.tick}`);
  const huts = new Map<number, Building>();
  for (const h of okOf(state, 'fishershut')) huts.set(h.id, h);
  const byHut = new Map<number, Agent[]>();
  const drop = new Set<Agent>();
  for (const a of state.agents) {
    if (a.kind !== AgentKind.Creature || a.species !== 'boat') continue;
    const id = a.anchorId ?? -1;
    if (!huts.has(id)) { drop.add(a); continue; }
    const l = byHut.get(id);
    if (l) l.push(a); else byHut.set(id, [a]);
  }
  for (const [id, h] of huts) {
    const list = byHut.get(id) ?? [];
    const want = boatsWanted(state, h);
    for (let k = want; k < list.length; k++) drop.add(list[k]);
    const moor = mooringOf(state, h);
    for (let k = list.length; k < want && moor >= 0; k++) {
      state.agents.push({ id: state.nextAgentId++, kind: AgentKind.Creature, x: (moor % MAP_W) + 0.5, y: ((moor / MAP_W) | 0) + 0.5, path: [], pathIdx: 0, speed: 0.5, homeId: -1, targetId: -1, timer: rng.int(60), variant: rng.int(2), dir: 0, load: 0, species: 'boat', anchorId: id, ax: h.x + 0.5, ay: h.y + 0.5 });
    }
  }
  if (drop.size) state.agents = state.agents.filter((a) => !drop.has(a));
}

/** A hut's mooring: the first water tile in its ring. */
export function mooringOf(state: GameState, b: Building): number {
  const w = watersOf(state);
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (inBounds(x, y) && w.body[idx(x, y)] >= 0) return idx(x, y);
    }
  return -1;
}

/** Per tick: a boat rows to a spot of its hut's water by day and back to the mooring at night (a per-tick side stream). */
export function tickBoat(state: GameState, a: Agent, rng: Rng, night: boolean, dt: number): void {
  const h = state.buildings.find((b) => b && b.id === a.anchorId);
  if (!h) return;
  const w = watersOf(state);
  const moor = mooringOf(state, h);
  if (moor < 0) return;
  const body = w.body[moor];
  if (a.timer > 0) { a.timer--; return; }
  if (a.path.length === 0) {
    let target = -1;
    if (night) {
      if (Math.floor(a.x) + Math.floor(a.y) * MAP_W === moor) { a.timer = 60; return; }
      target = moor;
    } else {
      for (let k = 0; k < 8 && target < 0; k++) {
        const tx = h.x + rng.int(2 * FISH_REACH + 1) - FISH_REACH;
        const ty = h.y + rng.int(2 * FISH_REACH + 1) - FISH_REACH;
        if (inBounds(tx, ty) && w.body[idx(tx, ty)] === body && !state.road[idx(tx, ty)]) target = idx(tx, ty);
      }
    }
    if (target < 0) { a.timer = 40; return; }
    a.path = [target];
  }
  const tx = (a.path[0] % MAP_W) + 0.5;
  const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
  const dx = tx - a.x;
  const dy = ty - a.y;
  const dist = Math.hypot(dx, dy);
  const speed = 0.5 * dt;
  if (dist <= speed) { a.x = tx; a.y = ty; a.path = []; a.timer = night ? 60 : 120 + rng.int(240); return; } // the nets go out
  const nx = a.x + (dx / dist) * speed;
  const ny = a.y + (dy / dist) * speed;
  const ni = idx(Math.max(0, Math.min(MAP_W - 1, Math.floor(nx))), Math.max(0, Math.min(MAP_H - 1, Math.floor(ny))));
  if (w.body[ni] !== body) { a.path = []; a.timer = 10; return; } // the bank: row another way
  a.x = nx;
  a.y = ny;
  a.dir = dx > 0 ? 0 : 2;
}

/** Daily: the water's day (after the wild's: the otters eat from the shoals the hunters left). */
export function dailyWater(state: GameState): void {
  dailyShoals(state);
  dailyFish(state);
  dailyReeds(state);
  dailyFords(state);
  syncBoats(state);
}

/** For the panels and the balance line. */
export function waterCensus(state: GameState): { bodies: number; lakes: number; shoal: number; cap: number; out: number } {
  const w = ensureShoals(state);
  let shoal = 0;
  let cap = 0;
  let out = 0;
  const lakes = new Set<number>();
  for (let i = 0; i < w.open.length; i++) if (w.open[i]) lakes.add(w.body[i]);
  for (let b = 0; b < w.tiles.length; b++) { shoal += state.water.fish[b]; cap += shoalCap(w, b); if (fishedOut(state, b)) out++; }
  return { bodies: w.tiles.length, lakes: lakes.size, shoal, cap, out };
}
