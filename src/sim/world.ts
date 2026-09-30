import { Rng, hashString } from '../core/rng';
import { BUILDING_BY_KEY, START_TREASURY } from './catalog';
import { distanceMap, generateTerrain } from './terrain';
import {
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

export function createGame(seed: number, cityName?: string): GameState {
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
    treasury: START_TREASURY,
    taxRates: { hearth: 10, market: 10, craft: 10, arcane: 10 },
    ledger: emptyLedger(),
    ledgerHistory: [],
    bankruptDays: 0,
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
    waterSupply: 0,
    waterDemand: 0,
    unquieted: 0,
    deathsToday: 0,
    demand: { hearth: 0.5, market: 0.1, craft: 0.3, arcane: 0 },
    milestone: 0,
    messages: [],
    gameOver: null,
    stats: { firesTotal: 0, surgesTotal: 0, restlessTotal: 0, gloamTiles: 0, peakPopulation: 0 },
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
  return state;
}

export function emptyLedger() {
  return { taxHearth: 0, taxMarket: 0, taxCraft: 0, taxArcane: 0, upkeepRoads: 0, upkeepBuildings: 0, grants: 0, net: 0 };
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

export function pushMessage(state: GameState, text: string, kind: Message['kind'] = 'info'): void {
  state.messages.push({ tick: state.tick, text, kind });
  if (state.messages.length > 60) state.messages.splice(0, state.messages.length - 60);
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

/** Can a building of size w×h be placed with origin (x,y)? Returns reason or null. */
export function canPlaceBuilding(state: GameState, key: string, x: number, y: number): string | null {
  const def = BUILDING_BY_KEY[key];
  if (!def) return 'Unknown building';
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) return 'Off the map';
      const i = idx(tx, ty);
      if (!isBuildableTerrain(state.terrain[i])) return 'Cannot build on this terrain';
      if (state.road[i]) return 'A road is in the way';
      if (state.bIndex[i] >= 0) return 'Something is already built here';
      if (state.gloam[i]) return 'The Gloam holds this ground';
    }
  if (def.category !== 'zone' && def.key !== 'stake' && !touchesRoad(state, x, y, def.w, def.h)) return 'Must touch a road';
  return null;
}

export function touchesRoad(state: GameState, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const edge = dx === -1 || dy === -1 || dx === w || dy === h;
      if (!edge) continue;
      const corner = (dx === -1 || dx === w) && (dy === -1 || dy === h);
      if (corner) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty) && state.road[idx(tx, ty)]) return true;
    }
  return false;
}

export function placeBuildingRaw(state: GameState, key: string, x: number, y: number, level = 1): Building {
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
    state: 'ok',
    stateDays: 0,
    progress: 0,
    age: 0,
    unhappyDays: 0,
    dryDays: 0,
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

export function timeOfDay(state: GameState): number {
  // 0..1, 0 = midnight. Start the game at dawn-ish.
  const TICKS_PER_DAY = 900;
  return (((state.tick + TICKS_PER_DAY * 0.3) % TICKS_PER_DAY) / TICKS_PER_DAY);
}
