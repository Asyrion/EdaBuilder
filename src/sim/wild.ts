/**
 * The wild (M16 part 1, iteration 58; DESIGN §16 and §4.89). Herds of deer and elk on the meadows, boar in the woods,
 * otters and herons on the banks, goats on the hills and wolves that come out of the forest in the Hush. A herd has a
 * home, a head count and a cap: the habitat within HERD_RANGE of its home that the city has not taken. Herds breed by
 * the season, thin where the city spreads, and recover where a Glimhouse or a ward holds the ground. A Hunters' Lodge
 * hunts a chosen quarry for hides, meat and trophies; the meat goes to the markets' shelves, the rest to the Gloam road.
 *
 * Everything here draws from side streams keyed by the seed (as the weather and the fox audit do), so the wild adds no
 * roll to the main stream; the city feels it only through what it does (goods, happiness, a hen taken).
 */
import { Rng, hashString } from '../core/rng';
import { BUILDING_BY_KEY } from './catalog';
import { capacityOf } from './growth';
import { edictOn } from './edicts';
import { AgentKind, DAYS_PER_SEASON, MAP_H, MAP_W, Terrain, Zone, idx, inBounds, isWater, type Agent, type Building, type GameState, type Herd, type WildSpecies } from './types';
import { forEachBuilding, pushMessage, seasonOf } from './world';

export const HERD_RANGE = 6; // a herd's cap counts the habitat within this many tiles of its home
export const HUNT_REACH = 16; // a lodge's hunting grounds
export const MEAT_REACH = 16; // a lodge carts its meat to the markets within this many tiles
export const MARKET_MEAT_CAP = 8; // meat a market's shelves hold
export const MEAT_HAPPY_REACH = 10; // a hearth within this of a market with meat: +MEAT_HAPPY
export const MEAT_HAPPY = 4;
export const LODGE_MEAT_KEEP = 20; // meat over this is salted and sent down the Gloam road
export const LODGE_MEAT_CAP = 30; // and over this it spoils
export const CLOSE_FLOOR = 6; // the Close Season: no lodge takes a herd below this
export const TROPHIES_PER_DAY = 2; // the Crown's buyers take this many trophies a day at the depot
export const HEN_DAYS = 5; // a hearth the wolves took a hen from is unhappy this long
export const HEN_HAPPY = -6;
export const WOLF_REACH = 14; // a Hush pack stalks the hearths within this of its den
export const WOLF_PREY_REACH = 12; // and the deer, elk and goats within this
export const BUILT_RANGE = 2; // a tile within this of a building is no longer wild

export interface WildDef {
  name: string; // one
  plural: string;
  group: string; // a herd, a sounder, a pack
  tilesPerHead: number;
  max: number; // the most head a herd holds
  minSeed: number; // the least cap a new herd needs
  target: number; // herds of it the map holds at most
  meat: number; // per head taken
  hides: number;
  trophy: number; // chance of a trophy per head taken
  trophyName: string;
  take: number; // a lodge's chance a day of taking one, at full crew
  walk: number; // speeds (tiles a second)
  run: number;
}

export const WILD: Record<WildSpecies, WildDef> = {
  deer: { name: 'deer', plural: 'deer', group: 'herd', tilesPerHead: 6, max: 8, minSeed: 4, target: 7, meat: 2, hides: 1, trophy: 0, trophyName: '', take: 0.5, walk: 0.6, run: 2.2 },
  elk: { name: 'elk', plural: 'elk', group: 'herd', tilesPerHead: 8, max: 5, minSeed: 3, target: 3, meat: 4, hides: 2, trophy: 0.2, trophyName: 'antlers', take: 0.35, walk: 0.5, run: 1.8 },
  boar: { name: 'boar', plural: 'boar', group: 'sounder', tilesPerHead: 10, max: 4, minSeed: 3, target: 4, meat: 3, hides: 1, trophy: 0.1, trophyName: 'tusks', take: 0.45, walk: 0.5, run: 1.4 },
  goat: { name: 'goat', plural: 'goats', group: 'band', tilesPerHead: 8, max: 5, minSeed: 3, target: 3, meat: 2, hides: 1, trophy: 0, trophyName: '', take: 0.45, walk: 0.5, run: 1.5 },
  otter: { name: 'otter', plural: 'otters', group: 'holt', tilesPerHead: 6, max: 2, minSeed: 2, target: 3, meat: 0, hides: 2, trophy: 0, trophyName: '', take: 0.4, walk: 0.7, run: 1.4 },
  heron: { name: 'heron', plural: 'herons', group: 'stand', tilesPerHead: 6, max: 2, minSeed: 1, target: 3, meat: 1, hides: 0, trophy: 0.3, trophyName: 'plumes', take: 0.4, walk: 0.3, run: 1.2 },
  wolf: { name: 'wolf', plural: 'wolves', group: 'pack', tilesPerHead: 12, max: 5, minSeed: 3, target: 3, meat: 0, hides: 2, trophy: 0.25, trophyName: 'a wolf head', take: 0.35, walk: 0.6, run: 1.3 },
};
export const WILD_SPECIES = Object.keys(WILD) as WildSpecies[];
export function isWild(sp: string | undefined): sp is WildSpecies {
  return !!sp && sp in WILD;
}

/** Breeding by the season: the young come in Bloom, a little in the Thaw and the Ember, none in the Hush. */
export const BREED = [0.03, 0.06, 0.03, 0];

/** Tiles within BUILT_RANGE of a building, or under a road: no longer wild. */
export function builtGrid(state: GameState): Uint8Array {
  const g = new Uint8Array(MAP_W * MAP_H);
  for (let i = 0; i < g.length; i++) if (state.road[i]) g[i] = 1;
  forEachBuilding(state, (b) => {
    for (let y = b.y - BUILT_RANGE; y < b.y + b.h + BUILT_RANGE; y++)
      for (let x = b.x - BUILT_RANGE; x < b.x + b.w + BUILT_RANGE; x++) if (inBounds(x, y)) g[idx(x, y)] = 1;
  });
  return g;
}

function near(state: GameState, x: number, y: number, r: number, t: Terrain): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(x + dx, y + dy) && state.terrain[idx(x + dx, y + dy)] === t) return true;
  return false;
}
function nearWater(state: GameState, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(x + dx, y + dy) && isWater(state.terrain[idx(x + dx, y + dy)])) return true;
  return false;
}
function nearLand(state: GameState, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(x + dx, y + dy) && !isWater(state.terrain[idx(x + dx, y + dy)])) return true;
  return false;
}

/** Whether a tile is habitat for a species: its ground, no Gloam, no building or road within BUILT_RANGE. */
export function habitat(state: GameState, sp: WildSpecies, x: number, y: number, built: Uint8Array): boolean {
  if (!inBounds(x, y)) return false;
  const i = idx(x, y);
  if (built[i] || state.gloam[i]) return false;
  const t = state.terrain[i];
  switch (sp) {
    case 'deer': return t === Terrain.Meadow || t === Terrain.Grass;
    case 'elk': return (t === Terrain.Meadow || t === Terrain.Grass || t === Terrain.Forest) && near(state, x, y, 3, Terrain.Forest) && (near(state, x, y, 3, Terrain.Meadow) || near(state, x, y, 3, Terrain.Grass)); // the woods' edge
    case 'boar':
    case 'wolf': return t === Terrain.Forest;
    case 'goat': return t === Terrain.Hills;
    case 'otter': return (t === Terrain.Shore && nearWater(state, x, y)) || (t === Terrain.Water && nearLand(state, x, y));
    case 'heron': return t === Terrain.Shore || (t === Terrain.Water && nearLand(state, x, y));
  }
}

/** The head a herd's land holds: habitat within HERD_RANGE, a head per tilesPerHead, at most max. */
export function herdCap(state: GameState, sp: WildSpecies, x: number, y: number, built: Uint8Array): number {
  let n = 0;
  for (let dy = -HERD_RANGE; dy <= HERD_RANGE; dy++)
    for (let dx = -HERD_RANGE; dx <= HERD_RANGE; dx++) if (dx * dx + dy * dy <= HERD_RANGE * HERD_RANGE && habitat(state, sp, x + dx, y + dy, built)) n++;
  return Math.min(WILD[sp].max, Math.floor(n / WILD[sp].tilesPerHead));
}

/** Where deer and elk bed down at night: the nearest forest tile within 8 of home, else home. */
function bedOf(state: GameState, sp: WildSpecies, x: number, y: number): { x: number; y: number } {
  if (sp !== 'deer' && sp !== 'elk') return { x, y };
  let best = { x, y };
  let bd = Infinity;
  for (let dy = -8; dy <= 8; dy++)
    for (let dx = -8; dx <= 8; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty) || state.terrain[idx(tx, ty)] !== Terrain.Forest || state.bIndex[idx(tx, ty)] >= 0) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: tx, y: ty }; }
    }
  return best;
}

function sideRng(state: GameState, tag: string): Rng {
  return new Rng(hashString(`${state.seed}:${state.day}:${tag}`));
}

/** Seed herds where the land holds them: the whole map at the start (full herds), a pair wandering in each season after. */
export function seedHerds(state: GameState, built: Uint8Array, initial: boolean): number {
  const rng = sideRng(state, initial ? 'wildseed' : 'wildreturn');
  const w = state.wild;
  const f = state.founding;
  let added = 0;
  for (const sp of WILD_SPECIES) {
    const def = WILD[sp];
    let have = w.herds.filter((h) => h.sp === sp).length;
    const want = initial ? def.target : Math.min(def.target, have + 1);
    for (let tries = 0; tries < (initial ? 900 : 300) && have < want; tries++) {
      const i = rng.int(MAP_W * MAP_H);
      const x = i % MAP_W;
      const y = (i / MAP_W) | 0;
      if (Math.hypot(x - f.x, y - f.y) < (initial ? 10 : 16)) continue;
      if (!habitat(state, sp, x, y, built)) continue;
      if (w.herds.some((h) => Math.hypot(h.x - x, h.y - y) < (h.sp === sp ? 14 : 5))) continue;
      const cap = herdCap(state, sp, x, y, built);
      if (cap < def.minSeed) continue;
      const head = initial ? (sp === 'wolf' ? Math.min(cap, 3 + rng.int(3)) : cap) : Math.min(cap, sp === 'heron' ? 1 : 2);
      const bed = bedOf(state, sp, x, y);
      w.herds.push({ id: w.nextId++, sp, x, y, head, cap, bx: bed.x, by: bed.y, taken: -1, prey: -1 });
      have++;
      added++;
    }
  }
  return added;
}

/** A herd's breeding rate today. */
export function breedRate(state: GameState, h: Herd): number {
  let r = BREED[seasonOf(state)];
  if (heldGround(state, h)) r *= 2;
  if (edictOn(state, 'closeseason')) r *= 1.25;
  if (state.wild.thriveUntil > state.day) r *= 1.5;
  return r;
}

/** The ground is held: a ward covers the herd's home, or a lit Glimhouse stands within 8 (DESIGN §16). */
export function heldGround(state: GameState, h: Herd): boolean {
  if (state.coverage.ward[idx(h.x, h.y)] > 0) return true;
  return state.buildings.some((g) => g && g.kind === 'glimhouse' && g.state === 'ok' && g.lit && Math.abs(g.x - h.x) <= 8 && Math.abs(g.y - h.y) <= 8);
}

/** The agents a herd shows. */
export function agentsWanted(h: Herd): number {
  if (h.head < 1) return 0;
  if (h.sp === 'wolf') return Math.min(5, Math.round(h.head));
  if (h.sp === 'otter' || h.sp === 'heron') return Math.min(2, Math.ceil(h.head));
  return Math.min(6, Math.ceil(h.head / 1.4));
}

function spawnWild(state: GameState, h: Herd, rng: Rng, built: Uint8Array): void {
  let x = h.x;
  let y = h.y;
  for (let k = 0; k < 8; k++) {
    const tx = h.x + rng.int(5) - 2;
    const ty = h.y + rng.int(5) - 2;
    if (habitat(state, h.sp, tx, ty, built)) { x = tx; y = ty; break; }
  }
  const a: Agent = {
    id: state.nextAgentId++,
    kind: AgentKind.Creature,
    x: x + 0.5,
    y: y + 0.5,
    path: [],
    pathIdx: 0,
    speed: WILD[h.sp].walk,
    homeId: -1,
    targetId: -1,
    timer: rng.int(40),
    variant: rng.int(3),
    dir: rng.chance(0.5) ? 0 : 2,
    load: 0,
    species: h.sp,
    anchorId: -1,
    ax: h.x + 0.5,
    ay: h.y + 0.5,
    herdId: h.id,
  };
  state.agents.push(a);
}

/** Keep each herd's agents in step with its head; agents of a herd that is gone leave the map. */
export function syncWildAgents(state: GameState, built?: Uint8Array): void {
  const g = built ?? builtGrid(state);
  const rng = sideRng(state, `wildagents:${state.tick}`);
  const byHerd = new Map<number, Agent[]>();
  for (const a of state.agents) if (a.kind === AgentKind.Creature && a.herdId !== undefined) {
    const l = byHerd.get(a.herdId);
    if (l) l.push(a); else byHerd.set(a.herdId, [a]);
  }
  const drop = new Set<Agent>();
  const live = new Set(state.wild.herds.map((h) => h.id));
  for (const [id, list] of byHerd) if (!live.has(id)) for (const a of list) drop.add(a);
  for (const h of state.wild.herds) {
    const list = byHerd.get(h.id) ?? [];
    const want = agentsWanted(h);
    for (let k = want; k < list.length; k++) drop.add(list[k]);
    for (let k = list.length; k < want; k++) spawnWild(state, h, rng, g);
  }
  if (drop.size) state.agents = state.agents.filter((a) => !drop.has(a));
}

/** Seed the wild on a new map (createGame) or on a save made before the wild. */
export function seedWild(state: GameState): void {
  const built = builtGrid(state);
  seedHerds(state, built, true);
  state.wild.seeded = true;
  syncWildAgents(state, built);
}

function lodgesOf(state: GameState): Building[] {
  const out: Building[] = [];
  forEachBuilding(state, (b) => { if (b.kind === 'hunterslodge' && b.state === 'ok') out.push(b); });
  return out;
}

/** The centre of a lodge (2×2). */
function centre(b: Building): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** The herds of a species inside a lodge's grounds. */
export function herdsInGrounds(state: GameState, l: Building, sp?: WildSpecies): Herd[] {
  const c = centre(l);
  return state.wild.herds.filter((h) => (!sp || h.sp === sp) && Math.hypot(h.x + 0.5 - c.x, h.y + 0.5 - c.y) <= HUNT_REACH);
}

/** A lodge's quarry: the one chosen, else the game of the fullest herd in its grounds, else none (the Gloam-hounds it once
 *  guarded against are parked, scope reset phase 1b). */
export function quarryOf(state: GameState, l: Building): WildSpecies | null {
  if (l.quarry) return l.quarry;
  let best: Herd | null = null;
  for (const h of herdsInGrounds(state, l)) if (!best || h.head > best.head) best = h;
  return best ? best.sp : null;
}

/** The floor below which no lodge takes a herd. */
export function huntFloor(state: GameState): number {
  return edictOn(state, 'closeseason') ? CLOSE_FLOOR : 0;
}

/** Set a lodge's quarry (the panel's choice; the bot's too). */
export function setQuarry(state: GameState, b: Building, q: WildSpecies | null): boolean {
  if (b.kind !== 'hunterslodge') return false;
  if (!q) delete b.quarry; else b.quarry = q; // none: the fullest herd in the grounds
  void state;
  return true;
}

/** Whether a lodge can hunt game today, and if not, why (for the panel). */
export function huntBlock(state: GameState, l: Building): string | null {
  const q = quarryOf(state, l);
  if (!q) return `no game within ${HUNT_REACH} tiles`;
  if (edictOn(state, 'closeseason') && seasonOf(state) === 1) return 'the Close Season: no game is taken in Bloom';
  const herds = herdsInGrounds(state, l, q);
  if (!herds.length) return `no ${WILD[q].plural} within ${HUNT_REACH} tiles`;
  if (!herds.some((h) => h.head >= huntFloor(state) + 1)) return `every ${WILD[q].group} in reach is at the Close Season's floor of ${CLOSE_FLOOR}`;
  return null;
}

/** Daily: each lodge on game takes one head from the fullest herd of its quarry in its grounds. */
export function dailyGame(state: GameState): number {
  const rng = sideRng(state, 'hunt');
  let taken = 0;
  for (const l of lodgesOf(state)) {
    const q = quarryOf(state, l);
    if (!q || huntBlock(state, l)) continue;
    const floor = huntFloor(state);
    let best: Herd | null = null;
    for (const h of herdsInGrounds(state, l, q)) if (h.head >= floor + 1 && (!best || h.head > best.head)) best = h;
    if (!best) continue;
    const crew = Math.max(0.25, Math.min(1, l.workers / Math.max(1, capacityOf(l, state))));
    if (!rng.chance(WILD[q].take * crew)) continue;
    const def = WILD[q];
    best.head -= 1;
    best.taken = state.day;
    l.stock += def.hides;
    l.meat = Math.min(LODGE_MEAT_CAP, (l.meat ?? 0) + def.meat);
    state.stats.hides += def.hides;
    state.stats.meat += def.meat;
    if (def.trophy > 0 && rng.chance(def.trophy)) {
      l.trophies = (l.trophies ?? 0) + 1;
      state.stats.trophies++;
      pushMessage(state, `The hunters of the lodge at (${l.x},${l.y}) bring back ${def.trophyName}: a trophy for the Gloam road.`, 'good');
    }
    l.took = state.day;
    l.tookSp = q;
    taken++;
  }
  return taken;
}

/** Daily: the wolves in the Hush. They thin the deer, elk and goats near their den and stalk a hearth. */
export function dailyWolves(state: GameState): number {
  const w = state.wild;
  const hush = seasonOf(state) === 3;
  let hens = 0;
  const rng = sideRng(state, 'wolves');
  for (const p of w.herds) {
    if (p.sp !== 'wolf') continue;
    p.prey = -1;
    if (!hush || p.head < 2) continue;
    // the pack's kill: the nearest deer, elk or goats
    let prey: Herd | null = null;
    let pd = WOLF_PREY_REACH;
    for (const h of w.herds) {
      if (h.sp !== 'deer' && h.sp !== 'elk' && h.sp !== 'goat') continue;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d <= pd && h.head > 0) { pd = d; prey = h; }
    }
    if (prey) prey.head -= 0.15;
    // the hearth it stalks: the nearest level-1 hearth in reach with no Watch or ward over it
    let best: Building | null = null;
    let bd = WOLF_REACH;
    forEachBuilding(state, (b) => {
      if (BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.state !== 'ok' || b.level !== 1 || b.residents <= 0) return;
      const i = idx(b.x, b.y);
      if (state.coverage.watch[i] >= 90 || state.coverage.ward[i] > 0) return;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bd) { bd = d; best = b; }
    });
    if (!best) continue;
    const b = best as Building;
    p.prey = b.id;
    if (w.foldsUntil > state.day) continue; // lamps on the folds
    // a dark hearth loses a hen one night in two; a lit one, one in five
    if (rng.chance(b.lit ? 0.2 : 0.5)) {
      b.wolfDay = state.day;
      state.stats.hensTaken++;
      w.hensDay = state.day;
      hens++;
      if (hens === 1) pushMessage(state, `Wolves out of the forest took a hen from the hearth at (${b.x},${b.y}) in the night. A Watch post, a ward or a lodge hunting wolves keeps them off.`, 'warn', false);
    }
  }
  return hens;
}

/** Daily: the lodges cart their meat to the markets in reach; the markets sell a meat a day. */
export function dailyMeat(state: GameState): void {
  const markets: Building[] = [];
  forEachBuilding(state, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok') markets.push(b); });
  for (const m of markets) if ((m.meat ?? 0) > 0) m.meat = Math.max(0, (m.meat ?? 0) - 1);
  for (const l of lodgesOf(state)) {
    if ((l.meat ?? 0) < 1) continue;
    const c = centre(l);
    const near = markets.filter((m) => Math.hypot(m.x + 0.5 - c.x, m.y + 0.5 - c.y) <= MEAT_REACH).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y) || a.id - b.id);
    for (const m of near) {
      const put = Math.min(Math.floor(l.meat ?? 0), MARKET_MEAT_CAP - (m.meat ?? 0));
      if (put <= 0) continue;
      m.meat = (m.meat ?? 0) + put;
      l.meat = (l.meat ?? 0) - put;
    }
  }
  const at: number[] = [];
  for (const m of markets) if ((m.meat ?? 0) >= 1) at.push(m.x, m.y);
  state.wild.meatAt = at;
}

/** Whether a hearth has a market with meat within MEAT_HAPPY_REACH (yesterday's shelves). */
export function meatNear(state: GameState, x: number, y: number): boolean {
  const at = state.wild.meatAt;
  for (let k = 0; k < at.length; k += 2) if (Math.hypot(at[k] - x, at[k + 1] - y) <= MEAT_HAPPY_REACH) return true;
  return false;
}

/** Daily: the wild's day. Called after the hunt for hounds. */
export function dailyWild(state: GameState): void {
  const w = state.wild;
  const built = builtGrid(state);
  if (!w.seeded) { seedHerds(state, built, true); w.seeded = true; }
  else if (state.day % DAYS_PER_SEASON === 0) seedHerds(state, built, false); // a pair wanders in where the land holds more
  for (const h of w.herds) {
    h.cap = herdCap(state, h.sp, h.x, h.y, built);
    if (h.head < h.cap) h.head += breedRate(state, h) * h.head * (1 - h.head / Math.max(1, h.cap));
    else if (h.head > h.cap) h.head -= Math.max(0.2, (h.head - h.cap) * 0.1); // the land no longer holds them
  }
  dailyWolves(state);
  dailyGame(state);
  // herds under one head are gone
  const gone = w.herds.filter((h) => h.head < 1);
  for (const h of gone) {
    const def = WILD[h.sp];
    if (h.taken >= 0 && state.day - h.taken <= 3) {
      state.stats.herdsHunted++;
      pushMessage(state, `The hunters took the last of the ${def.plural} at (${h.x},${h.y}). The ${def.group} is gone; the Close Season edict keeps a floor under the herds.`, 'warn', true, { x: h.x, y: h.y });
    } else if (h.cap < def.minSeed) {
      state.stats.herdsLost++;
      pushMessage(state, `The ${def.plural} have left the ground at (${h.x},${h.y}): the city stands where they ${h.sp === 'otter' || h.sp === 'heron' ? 'fished' : h.sp === 'wolf' ? 'denned' : 'grazed'}.`, 'info', true, { x: h.x, y: h.y });
    } else state.stats.herdsLost++; // wolves or the winter
  }
  if (gone.length) w.herds = w.herds.filter((h) => h.head >= 1);
  dailyMeat(state);
  syncWildAgents(state, built);
}

/** Per tick: a wild animal's movement (called from tickCreatures with a per-tick side stream). */
export function tickWildAgent(state: GameState, a: Agent, rng: Rng, night: boolean, dt: number): void {
  const sp = a.species as WildSpecies;
  const h = state.wild.herds.find((x) => x.id === a.herdId);
  if (!h) return;
  const def = WILD[sp];
  const fx = Math.floor(a.x);
  const fy = Math.floor(a.y);
  // deer and elk flee lit ground: on it or within 2 of it, they run away from the light
  if ((sp === 'deer' || sp === 'elk') && (state.tick + a.id) % 5 === 0 && a.load === 0) {
    let lx = 0;
    let ly = 0;
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inBounds(fx + dx, fy + dy) && state.lit[idx(fx + dx, fy + dy)]) { lx += dx; ly += dy; n++; }
    if (n > 0) {
      const d = Math.hypot(lx, ly) || 1;
      let ux = -lx / d;
      let uy = -ly / d;
      if (lx === 0 && ly === 0) { ux = Math.sign(h.x - fx) || 1; uy = Math.sign(h.y - fy); }
      const tx = Math.max(0, Math.min(MAP_W - 1, Math.floor(a.x + ux * 5)));
      const ty = Math.max(0, Math.min(MAP_H - 1, Math.floor(a.y + uy * 5)));
      a.path = [idx(tx, ty)];
      a.load = 1; // running
      a.timer = 0;
    }
  }
  if (a.timer > 0) { a.timer--; return; }
  if (a.path.length === 0) {
    a.load = 0;
    const hush = seasonOf(state) === 3;
    let target = -1;
    if (sp === 'wolf' && night && hush && h.prey >= 0 && state.wild.foldsUntil <= state.day) {
      const b = state.buildings.find((o) => o && o.id === h.prey);
      if (b) target = idx(b.x + 1 < MAP_W ? b.x + 1 : b.x, b.y);
    } else if ((sp === 'deer' || sp === 'elk') && night) {
      const tx = h.bx + rng.int(3) - 1;
      const ty = h.by + rng.int(3) - 1;
      if (inBounds(tx, ty) && state.bIndex[idx(tx, ty)] < 0 && !isWater(state.terrain[idx(tx, ty)])) target = idx(tx, ty);
    } else {
      const r = sp === 'heron' ? 2 : sp === 'wolf' ? 3 : sp === 'otter' ? 4 : 5;
      for (let k = 0; k < 6 && target < 0; k++) {
        const tx = h.x + rng.int(2 * r + 1) - r;
        const ty = h.y + rng.int(2 * r + 1) - r;
        if (!inBounds(tx, ty)) continue;
        const i = idx(tx, ty);
        if (state.bIndex[i] >= 0 || state.road[i] || state.gloam[i]) continue;
        const t = state.terrain[i];
        const ok = sp === 'otter' || sp === 'heron' ? t === Terrain.Shore || t === Terrain.Water
          : sp === 'goat' ? t === Terrain.Hills
          : sp === 'boar' || sp === 'wolf' ? t === Terrain.Forest
          : (t === Terrain.Meadow || t === Terrain.Grass || (sp === 'elk' && t === Terrain.Forest)) && !state.lit[i];
        if (ok) target = i;
      }
    }
    if (target < 0) { a.timer = 30 + rng.int(30); return; }
    a.path = [target];
  }
  const tx = (a.path[0] % MAP_W) + 0.5;
  const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
  const dx = tx - a.x;
  const dy = ty - a.y;
  const dist = Math.hypot(dx, dy);
  const speed = (a.load === 1 ? def.run : sp === 'wolf' && night ? def.run : def.walk) * dt;
  if (dist <= speed) {
    a.x = tx;
    a.y = ty;
    a.path = [];
    a.load = 0;
    a.timer = sp === 'heron' ? 120 + rng.int(200) : sp === 'wolf' && !night ? 80 + rng.int(160) : 30 + rng.int(90);
    return;
  }
  const nx = a.x + (dx / dist) * speed;
  const ny = a.y + (dy / dist) * speed;
  const ni = idx(Math.max(0, Math.min(MAP_W - 1, Math.floor(nx))), Math.max(0, Math.min(MAP_H - 1, Math.floor(ny))));
  const swims = sp === 'otter' || sp === 'heron';
  if (state.bIndex[ni] >= 0 || (!swims && isWater(state.terrain[ni]))) { a.path = []; a.timer = 10; return; }
  a.x = nx;
  a.y = ny;
  a.dir = dx > 0 ? 0 : 2;
}

/** For the panels and the balance line: head and herds by species. */
export function wildCensus(state: GameState): Record<WildSpecies, { herds: number; head: number }> {
  const out = {} as Record<WildSpecies, { herds: number; head: number }>;
  for (const sp of WILD_SPECIES) out[sp] = { herds: 0, head: 0 };
  for (const h of state.wild.herds) { out[h.sp].herds++; out[h.sp].head += h.head; }
  return out;
}
