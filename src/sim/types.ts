/** Plain-data simulation types. Nothing here touches the DOM. */

export const MAP_W = 128;
export const MAP_H = 128;
export const TICKS_PER_SEC = 10;
export const TICKS_PER_DAY = 900; // 90 s of game time at 1x
export const SAVE_VERSION = 6;
export const MAX_DISTRICTS = 8;
export const DISTRICT_NAMES = ['Hearthside', 'Stillward', 'Spirefield', 'Lanternrow', 'Greywall', 'Marketcross', 'Candlerow', 'Boneward'];
export const DAYS_PER_SEASON = 30;
export const SEASON_NAMES = ['Thaw', 'Bloom', 'Ember', 'Hush'] as const;

export const enum Terrain {
  DeepWater = 0,
  Water = 1,
  Shore = 2,
  Grass = 3,
  Meadow = 4,
  Forest = 5,
  Hills = 6,
  LeyNode = 7,
}

export const enum Zone {
  None = 0,
  Hearth = 1,
  Market = 2,
  Craft = 3,
  Arcane = 4,
}

export const enum RoadType {
  None = 0,
  Track = 1,
  Cobble = 2,
  Lantern = 3,
}

export type ServiceType =
  | 'watch'
  | 'health'
  | 'fire'
  | 'faith'
  | 'school'
  | 'death'
  | 'ward'
  | 'leisure';

export const SERVICE_TYPES: ServiceType[] = [
  'watch',
  'health',
  'fire',
  'faith',
  'school',
  'death',
  'ward',
  'leisure',
];

export type BuildingState = 'ok' | 'burning' | 'ruin' | 'abandoned';

export interface Building {
  id: number;
  kind: string; // catalog key
  x: number;
  y: number;
  w: number;
  h: number;
  level: number; // 1..3 for zoned buildings, 1 otherwise
  variant: number;
  residents: number;
  workers: number;
  happiness: number; // 0..100
  lit: boolean;
  watered: boolean;
  state: BuildingState;
  stateDays: number; // days spent in current state
  progress: number; // level-up progress (-100..100)
  age: number; // days
  unhappyDays: number;
  dryDays: number;
  stock: number; // goods held (craft: produced, market: delivered)
  problemDays: number; // consecutive days unlit/dry (drives problem icons)
}

export const enum AgentKind {
  Citizen = 0,
  Cart = 1,
  Restless = 2,
}

export interface Agent {
  id: number;
  kind: AgentKind;
  x: number; // tile coords (float, centre of tile = +0.5)
  y: number;
  path: number[]; // tile indices
  pathIdx: number;
  speed: number;
  homeId: number; // building id or -1
  targetId: number; // building id or -1
  timer: number; // ticks until next decision
  variant: number;
  dir: number; // 0..3 facing for sprites
  load: number; // goods carried (carts)
}

export interface TaxRates {
  hearth: number;
  market: number;
  craft: number;
  arcane: number;
}

export interface Demand {
  hearth: number;
  market: number;
  craft: number;
  arcane: number;
}

export interface Message {
  tick: number;
  text: string;
  kind: 'info' | 'good' | 'warn' | 'bad' | 'milestone';
}

export interface DayLedger {
  taxHearth: number;
  taxMarket: number;
  taxCraft: number;
  taxArcane: number;
  artifacts: number;
  trade: number;
  upkeepRoads: number;
  upkeepBuildings: number;
  upkeepEdicts: number;
  grants: number;
  net: number;
}

export interface Modifier {
  kind: 'happiness' | 'unrest' | 'deaths' | 'health' | 'tithe' | 'craftTax' | 'mana' | 'gloamHold';
  value: number;
  until: number; // day
  label: string;
}

export interface PendingEvent {
  id: string;
  title: string;
  text: string;
  choices: { label: string; desc: string }[];
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  cityName: string;
  tick: number;
  day: number;
  w: number;
  h: number;
  // grid layers
  terrain: Uint8Array;
  gloam: Uint8Array; // 0 none, 1 gloam
  zone: Uint8Array;
  road: Uint8Array;
  district: Uint8Array; // 0 none, 1..MAX_DISTRICTS
  bIndex: Int32Array; // building index or -1
  lit: Uint8Array; // tile lit by mana (0/1)
  watered: Uint8Array;
  landValue: Uint8Array; // 0..100
  coverage: Record<ServiceType, Uint8Array>; // 0..255 -> 0..1
  miasma: Uint8Array; // 0..255
  traffic: Uint16Array; // agents passing this day
  trafficSmooth: Uint8Array; // 0..255 relative congestion
  waterDist: Uint8Array; // distance to nearest water, capped 15
  gloamDist: Uint8Array; // distance to nearest gloam, capped 15
  nodes: { x: number; y: number; depth?: number }[]; // depth: times deepened (0..2)
  founding: { x: number; y: number };
  // entities
  buildings: (Building | null)[];
  nextBuildingId: number;
  agents: Agent[];
  nextAgentId: number;
  // economy
  treasury: number;
  taxRates: TaxRates;
  ledger: DayLedger;
  ledgerHistory: number[]; // net per day, last 30
  bankruptDays: number;
  // demographics
  population: number;
  jobs: number;
  employed: number;
  educated: number; // 0..1
  happiness: number; // 0..100
  health: number; // 0..1
  unrest: number; // 0..1
  // mana
  manaSupply: number;
  manaDemand: number;
  manaStorage: number;
  manaStorageMax: number;
  overdrawDays: number;
  brownout: number; // fraction of consumers unlit 0..1
  // water
  waterSupply: number;
  waterDemand: number;
  // deathcare
  unquieted: number;
  deathsToday: number;
  // hazards
  demand: Demand;
  milestone: number;
  messages: Message[];
  edicts: Record<string, boolean>;
  districtEdicts: Record<string, boolean>; // key `${district}:${edict}`
  districtNames: Record<number, string>; // player renames
  trade: { exported: number; imported: number; importCost: number; priceGoods: number; priceLeystone: number }; // today
  artifactsSold: number; // crowns from artifacts today
  tradeIncomeToday: number;
  modifiers: Modifier[];
  pendingEvent: PendingEvent | null;
  lastEventDay: number;
  firedEvents: string[];
  goodsProduced: number; // per day, for UI
  goodsSold: number;
  goodsShort: number; // markets that ran dry today
  gameOver: string | null;
  stats: {
    firesTotal: number;
    surgesTotal: number;
    restlessTotal: number;
    gloamTiles: number;
    peakPopulation: number;
  };
  // transient (rebuilt after load)
  dirtyChunks?: Set<number>;
  zoneListDirty?: boolean;
  zoneList?: number[];
}

export function idx(x: number, y: number): number {
  return y * MAP_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function isWater(t: number): boolean {
  return t === Terrain.DeepWater || t === Terrain.Water;
}
