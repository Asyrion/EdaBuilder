import { FACTIONS, factionOf, type FactionId, milestonesOf } from '../data/factions';
import { buildTicks, construction } from './construction';
import { initialSectors, inCharter } from './sectors';
import { Rng, hashString } from '../core/rng';
import { lakeDistAt } from './water';
import { BUILDING_BY_KEY, NODE_MANA, START_TREASURY, WONDER_HALLS, type BuildingDef } from './catalog';
import { distanceMap, generateTerrain } from './terrain';
import {
  DAYS_PER_SEASON,
  DISTRICT_NAMES,
  MAP_H,
  MAP_W,
  RoadType,
  SAVE_VERSION,
  SERVICE_TYPES,
  Terrain,
  Zone,
  idx,
  inBounds,
  isWater,
  type Building,
  type GameState,
  type Message,
  type ServiceType,
} from './types';

export const CITY_NAMES = ['Thornwick', 'Ashmere', 'Glimford', 'Hollowmoor', 'Candlecross', 'Wickholm', 'Sablemere', 'Morrowford'];

/** A new charter in the valley (the other scenarios are parked, scope reset phase 1c). */
export function createGame(seed: number, cityName?: string, faction: FactionId = 'vellish'): GameState {
  const t = generateTerrain(seed);
  const n = MAP_W * MAP_H;
  const coverage = {} as Record<ServiceType, Uint8Array>;
  for (const s of SERVICE_TYPES) coverage[s] = new Uint8Array(n);
  const rng = new Rng(seed);
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    cityName: cityName ?? CITY_NAMES[seed % CITY_NAMES.length],
    tick: 0,
    day: 0,
    w: MAP_W,
    h: MAP_H,
    terrain: t.terrain,
    gloam: t.gloam,
    zone: new Uint8Array(n),
    road: new Uint8Array(n),
    district: new Uint8Array(n),
    bIndex: new Int32Array(n).fill(-1),
    lit: new Uint8Array(n),
    watered: new Uint8Array(n),
    landValue: new Uint8Array(n),
    coverage,
    miasma: new Uint8Array(n),
    traffic: new Uint16Array(n),
    trafficSmooth: new Uint8Array(n),
    waterDist: distanceMap((i) => isWater(t.terrain[i]), 15),
    gloamDist: distanceMap((i) => t.gloam[i] === 1, 15),
    nodes: t.nodes,
    founding: t.founding,
    buildings: [],
    nextBuildingId: 1,
    agents: [],
    nextAgentId: 1,
    treasury: START_TREASURY + (FACTIONS[faction]?.rules.startCrowns ?? 0),
    taxRates: { hearth: 10, market: 10, craft: 10, arcane: 10 },
    ledger: emptyLedger(),
    ledgerHistory: [],
    bankruptDays: 0,
    crownFavour: 50,
    loan: 0,
    population: 0,
    jobs: 0,
    employed: 0,
    educated: 0.05,
    happiness: 60,
    health: 0.6,
    unrest: 0.1,
    manaSupply: 0,
    manaDemand: 0,
    manaStorage: 0,
    manaStorageMax: 0,
    overdrawDays: 0,
    brownout: 0,
    nodeLinked: [],
    roadsDim: false,
    waterSupply: 0,
    waterDemand: 0,
    unquieted: 0,
    deathsToday: 0,
    quietCap: 0,
    quietedToday: 0,
    waitingDead: 0,
    demand: { hearth: 0.5, market: 0.1, craft: 0.3, arcane: 0 },
    milestone: 0,
    messages: [],
    chronicle: [],
    questsDone: [],
    edicts: {},
    districtEdicts: {},
    districtNames: {},
    districtQuarters: {},
    trade: { exported: 0, imported: 0, importCost: 0, priceGoods: 2, priceLeystone: 3 },
    edictSince: {},
    quarterSince: {},
    remembranceDead: 0,
    faction,
    sectors: initialSectors(t.founding),
    gloamPressure: 0.3,
    artifactsSold: 0,
    tradeIncomeToday: 0,
    modifiers: [],
    lessonsSeen: [],
    goodsProduced: 0,
    goodsSold: 0,
    goodsShort: 0,
    gameOver: null,
    stats: { goodsDelivered: 0, gloamBurned: 0, restlessLaid: 0, firesTotal: 0, surgesTotal: 0, restlessTotal: 0, fullDays: 0, brownoutsSurvived: 0, brownoutOpen: 0, sectorsBought: 0, quietHush: 0, hushPressureBreaks: 0, gloamTiles: 0, peakPopulation: 0, devUses: 0, quarterDays: 0, goodsStolen: 0, levies: 0, levied: 0 },
    dirtyChunks: new Set(),
    zoneListDirty: true,
    zoneList: [],
  };
  // Founding stake next to the founding node, with a short road stub.
  const f = t.founding;
  const sx = f.x + 2;
  const sy = f.y - 1;
  placeBuildingRaw(state, 'stake', sx, sy);
  for (let d = -2; d <= 3; d++) {
    const x = sx + d;
    const y = sy + 2;
    if (inBounds(x, y) && !isWater(state.terrain[idx(x, y)]) && state.bIndex[idx(x, y)] < 0) state.road[idx(x, y)] = RoadType.Track;
  }
  markAllDirty(state);
  pushMessage(state, `The Charter of ${state.cityName} is signed. Draw a road from the Founding Stake and zone some hearths.`, 'milestone');
  commitRng(state, rng);
  return state;
}

export function emptyLedger() {
  return { taxHearth: 0, taxMarket: 0, taxCraft: 0, taxArcane: 0, artifacts: 0, trade: 0, upkeepRoads: 0, upkeepBuildings: 0, upkeepEdicts: 0, upkeepCharters: 0, charterTithe: 0, interest: 0, levy: 0, grants: 0, net: 0 };
}

export function seedFromName(name: string): number {
  return hashString(name.trim().toLowerCase()) || 1;
}

export function rngOf(state: GameState): Rng {
  const r = new Rng(0);
  r.state = state.rngState;
  return r;
}
export function commitRng(state: GameState, r: Rng): void {
  state.rngState = r.state;
}

/**
 * Ticker message. Milestone and bad messages, or any message flagged `world`, are real
 * in-world events and also go to the Chronicle; chatter and tips never do.
 */
export function pushMessage(state: GameState, text: string, kind: Message['kind'] = 'info', world = false, at?: { x: number; y: number }): void {
  state.messages.push({ tick: state.tick, text, kind });
  if (state.messages.length > 60) state.messages.splice(0, state.messages.length - 60);
  if (world || kind === 'milestone' || kind === 'bad') pushChronicle(state, text, kind, at);
}

export function pushChronicle(state: GameState, text: string, kind: Message['kind'], at?: { x: number; y: number }): void {
  if (!state.chronicle) state.chronicle = [];
  const m = text.match(/\((\d+),(\d+)\)/);
  const x = at?.x ?? (m ? Number(m[1]) : undefined);
  const y = at?.y ?? (m ? Number(m[2]) : undefined);
  state.chronicle.push({ day: state.day, kind, text, x, y });
  if (state.chronicle.length > 200) state.chronicle.splice(0, state.chronicle.length - 200);
}

export const CHUNK = 8;
export const CHUNKS_X = MAP_W / CHUNK;
export const CHUNKS_Y = MAP_H / CHUNK;

export function markDirty(state: GameState, x: number, y: number): void {
  if (!state.dirtyChunks) state.dirtyChunks = new Set();
  const cx = (x / CHUNK) | 0;
  const cy = (y / CHUNK) | 0;
  state.dirtyChunks.add(cy * CHUNKS_X + cx);
}
/** Dirty a tile and its 4 neighbours: autotiles (roads, walls) of neighbours change with it. */
export function markDirtyAround(state: GameState, x: number, y: number): void {
  markDirty(state, x, y);
  if (x > 0) markDirty(state, x - 1, y);
  if (x < MAP_W - 1) markDirty(state, x + 1, y);
  if (y > 0) markDirty(state, x, y - 1);
  if (y < MAP_H - 1) markDirty(state, x, y + 1);
}

export function markAllDirty(state: GameState): void {
  if (!state.dirtyChunks) state.dirtyChunks = new Set();
  for (let i = 0; i < CHUNKS_X * CHUNKS_Y; i++) state.dirtyChunks.add(i);
}

export function buildingAt(state: GameState, x: number, y: number): Building | null {
  if (!inBounds(x, y)) return null;
  const bi = state.bIndex[idx(x, y)];
  return bi >= 0 ? state.buildings[bi] : null;
}

export function isBuildableTerrain(t: number): boolean {
  return t === Terrain.Grass || t === Terrain.Meadow || t === Terrain.Forest || t === Terrain.Shore;
}

/** Can a building of size w×h be placed with origin (x,y)? Returns reason or null.
 *  With `clearing`, a 1×1 zone building on a footprint tile is not a blocker (the bot's clear mode asks
 *  before it bulldozes); every other rule still applies. */
export function canPlaceBuilding(state: GameState, key: string, x: number, y: number, clearing = false): string | null {
  const def = BUILDING_BY_KEY[key];
  if (!def) return 'Unknown building';
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) return 'Off the map';
      const i = idx(tx, ty);
      if (def.onHills) {
        if (state.terrain[i] !== Terrain.Hills) return 'Must be dug into hills';
      } else if (def.onRuins) {
        if (state.terrain[i] !== Terrain.Ruins) return 'Must stand on the ruin flagstones';
      } else if (!isBuildableTerrain(state.terrain[i]) && !(state.terrain[i] === Terrain.Hills && factionOf(state).rules.hillBuildable)) return 'Cannot build on this terrain';
      if (state.road[i]) return 'A road is in the way';
      if (def.onHills === false) { /* no-op */ }
      if (state.bIndex[i] >= 0) {
        const other = state.buildings[state.bIndex[i]];
        if (!clearing || !other || other.w !== 1 || BUILDING_BY_KEY[other.kind].category !== 'zone') return 'Something is already built here';
      }
      if (state.gloam[i]) return 'The Gloam holds this ground';
      if (!inCharter(state, tx, ty)) return 'Beyond the Charter: buy this sector first';
    }
  if (def.category !== 'zone' && def.key !== 'stake' && !touchesRoad(state, x, y, def.w, def.h)) return 'Must touch a road (a corner counts)';
  if (def.maxCount && state.buildings.filter((b) => b && b.kind === key).length >= def.maxCount) return `Only ${def.maxCount} may stand`;
  if (def.nearHills && !touchesTerrain(state, x, y, def.w, def.h, (t) => t === Terrain.Hills)) return 'Must be built against hills';
  if (def.nearWater && !touchesTerrain(state, x, y, def.w, def.h, (t) => t === Terrain.Water)) return 'Must touch river or lake water';
  if (def.nearShore && !touchesTerrain(state, x, y, def.w, def.h, (t) => t === Terrain.Shore || t === Terrain.Water)) return 'Must touch the shore or the water';
  if (def.nearLake && !footprintNearLake(state, x, y, def.w, def.h)) return "Must stand on the lake's shore (within 3 of open water)";
  return null;
}

/** A footprint tile within 3 of the lake's open water (water.ts, iteration 60). */
function footprintNearLake(state: GameState, x: number, y: number, w: number, h: number): boolean {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (lakeDistAt(state, x + dx, y + dy) <= 3) return true;
  return false;
}

export function touchesTerrain(state: GameState, x: number, y: number, w: number, h: number, test: (t: number) => boolean): boolean {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const edge = dx === -1 || dy === -1 || dx === w || dy === h;
      if (!edge) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty) && test(state.terrain[idx(tx, ty)])) return true;
    }
  return false;
}

/** A road anywhere in the 8-ring around the footprint: a corner counts (iteration 49). */
export function touchesRoad(state: GameState, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const edge = dx === -1 || dy === -1 || dx === w || dy === h;
      if (!edge) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty) && state.road[idx(tx, ty)]) return true;
    }
  return false;
}

/** The 1×1 case: a zone tile grows with a road on any of its eight neighbours. */
export function roadInRing(state: GameState, x: number, y: number): boolean {
  return touchesRoad(state, x, y, 1, 1);
}

export function placeBuildingRaw(state: GameState, key: string, x: number, y: number, level = 1, construct = false): Building {
  const def = BUILDING_BY_KEY[key];
  const rng = rngOf(state);
  const b: Building = {
    id: state.nextBuildingId++,
    kind: key,
    x,
    y,
    w: def.w,
    h: def.h,
    level,
    variant: rng.int(4),
    residents: 0,
    workers: 0,
    happiness: 60,
    lit: false,
    watered: false,
    state: construct && !construction.instant ? 'building' : 'ok',
    stateDays: 0,
    progress: 0,
    work: construct && !construction.instant ? buildTicks(def) : 0,
    workTotal: construct && !construction.instant ? buildTicks(def) : 0,
    age: 0,
    unhappyDays: 0,
    dryDays: 0,
    stock: 0,
    problemDays: 0,
  };
  commitRng(state, rng);
  let slot = state.buildings.indexOf(null);
  if (slot < 0) {
    slot = state.buildings.length;
    state.buildings.push(b);
  } else state.buildings[slot] = b;
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) {
      state.bIndex[idx(x + dx, y + dy)] = slot;
      markDirty(state, x + dx, y + dy);
    }
  return b;
}

export function removeBuilding(state: GameState, b: Building): void {
  const slot = state.buildings.indexOf(b);
  if (slot < 0) return;
  for (let dy = 0; dy < b.h; dy++)
    for (let dx = 0; dx < b.w; dx++) {
      const i = idx(b.x + dx, b.y + dy);
      if (state.bIndex[i] === slot) state.bIndex[i] = -1;
      markDirty(state, b.x + dx, b.y + dy);
    }
  state.buildings[slot] = null;
  // agents tied to this building lose it
  for (const a of state.agents) {
    if (a.homeId === b.id) a.homeId = -1;
    if (a.targetId === b.id) a.targetId = -1;
  }
}

export function forEachBuilding(state: GameState, fn: (b: Building) => void): void {
  for (const b of state.buildings) if (b) fn(b);
}

export function buildingCenter(b: Building): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function zoneOfKey(key: string): Zone {
  switch (key) {
    case 'hearth': return Zone.Hearth;
    case 'market': return Zone.Market;
    case 'craft': return Zone.Craft;
    case 'arcane': return Zone.Arcane;
    default: return Zone.None;
  }
}

export function refreshZoneList(state: GameState): number[] {
  if (!state.zoneList || state.zoneListDirty) {
    const list: number[] = [];
    for (let i = 0; i < state.zone.length; i++) if (state.zone[i]) list.push(i);
    state.zoneList = list;
    state.zoneListDirty = false;
  }
  return state.zoneList;
}

export function seasonOf(state: GameState): number {
  return Math.floor(state.day / DAYS_PER_SEASON) % 4;
}

export function timeOfDay(state: GameState): number {
  // 0..1, 0 = midnight. Start the game at dawn-ish. The Hush stretches the night.
  const TICKS_PER_DAY = 900;
  const t = ((state.tick + TICKS_PER_DAY * 0.3) % TICKS_PER_DAY) / TICKS_PER_DAY;
  const season = seasonOf(state);
  const dayShare = season === 3 ? 0.36 : season === 1 ? 0.6 : 0.5; // fraction of the day that is light
  // remap so that daylight (0.25..0.75 in the ramp) covers dayShare of the cycle
  const half = dayShare / 2;
  if (t >= 0.5 - half && t <= 0.5 + half) return 0.25 + ((t - (0.5 - half)) / dayShare) * 0.5;
  if (t < 0.5 - half) return (t / (0.5 - half)) * 0.25;
  return 0.75 + ((t - (0.5 + half)) / (0.5 - half)) * 0.25;
}

/** The radius a building reaches: its service, its water, or its light (spires read the people's reach). */
export function influenceRadius(state: GameState, def: BuildingDef, b?: Building): number {
  if (def.service) return def.service.radius;
  if (def.waterRadius) return b ? waterRadiusOf(state, b) : def.waterRadius;
  if (def.key === 'spire') return 5 + factionOf(state).rules.spireReach;
  if (def.key === 'nexus' || WONDER_HALLS.includes(def.key)) return 9;
  return 0;
}

/** The reach of the buildings a new one of this kind would join: for a ley member, the link reach of every node and lit relay (place the new spire inside one and it links); for a service, the coverage of every building of that service; for a well, every well's water. */
export function kinReach(state: GameState, def: BuildingDef): { cx: number; cy: number; r: number }[] {
  const out: { cx: number; cy: number; r: number }[] = [];
  const ley = def.key === 'spire' || def.key === 'nexus' || WONDER_HALLS.includes(def.key);
  if (ley) {
    const reach = factionOf(state).rules.spireReach;
    for (const n of state.nodes) out.push({ cx: n.x, cy: n.y, r: 6 + reach });
    forEachBuilding(state, (b) => {
      if (!b.lit || b.state !== 'ok') return;
      const link = b.kind === 'spire' ? 6 + reach : b.kind === 'nexus' || WONDER_HALLS.includes(b.kind) ? 9 : b.kind === 'stake' ? 4 : 0;
      if (link > 0) out.push({ cx: b.x + (b.w - 1) / 2, cy: b.y + (b.h - 1) / 2, r: link });
    });
    return out;
  }
  if (def.service) {
    forEachBuilding(state, (b) => {
      const od = BUILDING_BY_KEY[b.kind];
      if (!od.service || od.service.type !== def.service!.type || b.state !== 'ok') return;
      out.push({ cx: b.x + (b.w - 1) / 2, cy: b.y + (b.h - 1) / 2, r: influenceRadius(state, od, b) });
    });
    return out;
  }
  if (def.waterRadius) {
    forEachBuilding(state, (b) => {
      const od = BUILDING_BY_KEY[b.kind];
      if (!od.waterRadius || b.state !== 'ok') return;
      const r = waterReachOf(state, b);
      if (r > 0) out.push({ cx: b.x + (b.w - 1) / 2, cy: b.y + (b.h - 1) / 2, r });
    });
  }
  return out;
}

/** The Founding Stake's hall grows with the city (iteration 49): the milestone index at which each stage begins. */
export const STAKE_STAGE_AT = [0, 3, 6, 7];
export function stakeStage(state: GameState): number {
  let st = 0;
  for (let k = 0; k < STAKE_STAGE_AT.length; k++) if (state.milestone >= STAKE_STAGE_AT[k]) st = k;
  return st;
}
/** A hall that grows with the city: `b_<kind>_s<stage>`, else the highest lower stage the atlas holds, else the plain sprite. */
export function stagedSpriteName(kind: string, stage: number, has: (name: string) => boolean): string {
  for (let st = stage; st >= 0; st--) { const n = `b_${kind}_s${st}`; if (has(n)) return n; }
  return `b_${kind}`;
}
export function stakeSpriteName(stage: number, has: (name: string) => boolean): string {
  return stagedSpriteName('stake', stage, has);
}
/** The halls that grow with the city (iteration 51): the Stake and the Temple. */
export const GROWING_HALLS = ['stake', 'temple'];
/** "the Burgh's hall": the name of the hall at this stage, from the people's own milestone names. */
export function stakeHallName(state: GameState): string {
  const st = stakeStage(state);
  return st === 0 ? 'the founding hall' : `the ${milestonesOf(state)[STAKE_STAGE_AT[st]].name}'s hall`;
}

export function districtName(state: GameState, d: number): string {
  return state.districtNames[d] || DISTRICT_NAMES[d - 1] || `District ${d}`;
}

export const NODE_DEEPEN_COST = [8000, 14000];
export const NODE_DEEPEN_MANA = 45;

/** Extra mana from deepened nodes. */
/** A water building's reach: a plain well far from any water reaches 4. */
/** The tiles a water building actually waters: its radius this season, and the near-water bonus (as updateWater reads it). */
export function waterReachOf(state: GameState, b: Building): number {
  const def = BUILDING_BY_KEY[b.kind];
  let r = waterRadiusOf(state, b);
  if (r > 0 && def.waterNearBonus && state.waterDist[idx(b.x, b.y)] <= 3) r += def.waterNearBonus;
  return r;
}
export function waterRadiusOf(state: GameState, b: Building): number {
  const def = BUILDING_BY_KEY[b.kind];
  let r = def.waterRadius ?? 0;
  if (!r) return 0;
  const season = seasonOf(state);
  if (b.kind === 'well') {
    const wd = state.waterDist[idx(b.x, b.y)];
    if (wd > 8) r = 4; // dry land: the Cistern's reason
  }
  return r;
}

/** An unlinked node seeps this share of its 90 into the ground; a lit spire, stake or hall within 6 draws the rest, and its depth and the founding node's 15 come only with the link. */
export const NODE_SEEP = 0.5;
/** The founding Wellspring runs deeper than the rest: the Vein aspect's 15, which only it ever had (the aspects are parked, scope reset phase 1c). */
export const FOUNDING_FLOW = 15;
const isFounding = (state: GameState, n: { x: number; y: number }) => n.x === state.founding.x && n.y === state.founding.y;
/** The nodes' flow before the people's multiplier: 90 a node plus its depth and the founding node's 15 when linked (a list given), else the seep. */
export function nodeFlow(state: GameState, linked?: boolean[]): number {
  let m = 0;
  state.nodes.forEach((n, k) => {
    if (linked && linked[k] === false) { m += NODE_MANA * NODE_SEEP; return; }
    m += NODE_MANA + (n.depth ?? 0) * NODE_DEEPEN_MANA + (isFounding(state, n) ? FOUNDING_FLOW : 0);
  });
  return m;
}
/** One node's flow as its panel shows it. */
export function nodeFlowOf(state: GameState, ni: number): number {
  const n = state.nodes[ni];
  return NODE_MANA + (n.depth ?? 0) * NODE_DEEPEN_MANA + (isFounding(state, n) ? FOUNDING_FLOW : 0);
}

export function canDeepenNode(state: GameState, ni: number): string | null {
  const n = state.nodes[ni];
  if (!n) return 'No such node';
  const depth = n.depth ?? 0;
  if (depth >= NODE_DEEPEN_COST.length) return 'This Wellspring is as deep as it goes';
  if (state.milestone < 6) return 'Unlocks at Burgh';
  if (state.nodeLinked.length && state.nodeLinked[ni] === false) return 'Unlinked: raise a spire within 6 tiles first; an unlinked node seeps only half its flow and none of its depth';
  if (state.treasury < NODE_DEEPEN_COST[depth]) return 'Not enough crowns';
  return null;
}

export function deepenNode(state: GameState, ni: number): string | null {
  const why = canDeepenNode(state, ni);
  if (why) return why;
  const n = state.nodes[ni];
  const depth = n.depth ?? 0;
  state.treasury -= NODE_DEEPEN_COST[depth];
  n.depth = depth + 1;
  pushMessage(state, `The Wellspring at (${n.x},${n.y}) is deepened. Tallowkin bore-singers coax ${NODE_DEEPEN_MANA} more mana a day from the Vein.`, 'milestone');
  return null;
}

/** The wonder halls standing and lit (or needing no mana): each delights the whole city and lifts the next grant (iteration 53). */
export function litWonders(s: GameState): Building[] {
  const out: Building[] = [];
  forEachBuilding(s, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (def.category === 'wonder' && b.state === 'ok' && (b.lit || !def.needsMana)) out.push(b);
  });
  return out;
}
