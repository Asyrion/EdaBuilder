import type { QuarterId } from './districts';
import type { FactionId } from '../data/factions';
/** Plain-data simulation types. Nothing here touches the DOM. */

export const MAP_W = 128;
export const MAP_H = 128;
export const TICKS_PER_SEC = 10;
export const TICKS_PER_DAY = 900; // 90 s of game time at 1x
export const SAVE_VERSION = 8; // 8: the scope reset's core (phase 1d), every layer saved; older saves are refused
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
  Ruins = 8, // the Ruins of Lukuku: flagstones and broken columns; nothing is built here (the Ruin Delve is parked, scope reset phase 1c)
  // 9 was the marsh (iteration 85; parked, scope reset phase 1c)
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
  // 4 was the glowvine lane (parked, scope reset phase 1c)
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

/** What ended a charter (iteration 70). */
export type LossKind = 'gloam' | 'restless' | 'crown';

export type BuildingState = 'ok' | 'burning' | 'ruin' | 'abandoned' | 'building';

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
  relit?: number; // lit by a lamplighter's candle until this day (the Tallowkin, iteration 52)
  work: number; // construction work left in builder-ticks (0 when standing)
  workTotal: number;
  priority?: 0 | 1 | 2; // brownout tier: 0 essential, 1 normal, 2 dim (dark first); unset = by category
  load?: number; // a member's load: a spire's mana of lit buildings, a well's levels drawn, a producer's output (transient)
  seam?: number; // a Crystal Mine's leystone left in the seam (unset = a full seam)
  flare?: number; // days a Thrum Font's bore flare still smokes
  greyDays?: number; // days the Gloam has stood at the door of this dark, unwarded building
  dryBy?: 'overdrawn'; // why a watered-by-radius building is dry (transient)
}

export const enum AgentKind {
  Citizen = 0,
  Cart = 1,
  Restless = 2,
  // 3 was the creature (the wild, the boats and the airship; parked, scope reset phases 1b and 1c)
  Builder = 4,
  // 5 was the walker (parked, scope reset phase 1c)
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
  phase?: number; // courier trip phase: 0 idle, 1 to source, 2 to destination
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

export interface ChronicleEntry {
  day: number;
  kind: Message['kind'];
  text: string;
  x?: number;
  y?: number;
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
  upkeepCharters: number; // a crown a building a day in every chartered district (iteration 54)
  charterTithe: number; // the Temple quarter's tenth of the city's market tithe
  interest: number; // 1 % a day on a debt, 0.5 % a day on the Crown's loan
  levy: number; // the Crown's Thaw levy, on the day it is taken
  grants: number;
  net: number;
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
  ledgerHistory: number[]; // net per day, exports included, last 30
  bankruptDays: number;
  crownFavour: number; // 0..100, 50 neutral: each point is −0.3 % on the levy and on sector prices; under 20 the next grant is withheld (iteration 54)
  loan: number; // the Crown's loan outstanding, 0.5 % a day
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
  nodeLinked: boolean[]; // a node's flow counts only while a lit spire, stake or hall links it (transient)
  roadsDim: boolean; // lantern-ways are the first thing a shortfall dims (hysteresis)
  // water
  waterSupply: number;
  waterDemand: number;
  // deathcare
  unquieted: number;
  deathsToday: number;
  quietCap: number; // deathcare capacity today (transient)
  quietedToday: number; // dead laid to rest today (transient)
  waitingDead: number; // bodies left waiting after today's quieting (transient)
  // hazards
  demand: Demand;
  milestone: number;
  messages: Message[];
  chronicle: ChronicleEntry[];
  questsDone: string[];
  edicts: Record<string, boolean>;
  districtEdicts: Record<string, boolean>; // key `${district}:${edict}`
  districtNames: Record<number, string>; // player renames
  districtQuarters: Record<number, QuarterId | undefined>; // a district's charter (districts.ts)
  trade: { exported: number; imported: number; importCost: number; priceGoods: number; priceLeystone: number }; // today
  edictSince: Record<string, number>; // the day each edict was turned on (key, or district:key): an edict runs ten days and costs 200 to repeal
  quarterSince: Record<number, number>; // the day each district took its charter: it holds thirty days
  remembranceDead: number; // unquieted dead the Remembrance stirred, drawn down as they rise
  faction: FactionId; // the people (data/factions.ts)
  gloamPressure: number; // 0..1, recomputed daily (hazards.ts)
  sectors: Uint8Array; // 4x4 map sectors, 1 = within the Charter
  artifactsSold: number; // crowns from artifacts today
  tradeIncomeToday: number;
  /** Lessons the player has closed (the districts card at the Hamlet). */
  lessonsSeen: string[];
  goodsProduced: number; // per day, for UI
  goodsSold: number;
  goodsShort: number; // markets that ran dry today
  gameOver: string | null;
  lostTo?: LossKind; // what ended the charter (iteration 70)
  stats: {
    firesTotal: number;
    surgesTotal: number;
    restlessTotal: number;
    brownoutsSurvived: number;
    brownoutOpen: number; // 1 while an overdraw is running
    sectorsBought: number;
    gloamTiles: number;
    peakPopulation: number;
    devUses: number; // dev tools used in this charter (marks the daily result)
    quarterDays: number; // days with at least one chartered district
    goodsStolen: number; // goods taken from unwatched shelves
    levies: number; // the Crown's Thaw levies taken
    levied: number; // crowns they took
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
