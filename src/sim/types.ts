import type { GuildState } from './guilds';
import type { RelicState } from './relics';
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
  Ruins = 8, // the Ruins of Lukuku: flagstones and broken columns; only a Ruin Delve may be built here
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
  Glowvine = 4,
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
  cooldown: number; // days until an ability can be used again
  stock: number; // goods held (craft: produced, market: delivered)
  problemDays: number; // consecutive days unlit/dry (drives problem icons)
  tended?: number; // day a healer last tended this home (+4 happiness that day)
  work: number; // construction work left in builder-ticks (0 when standing)
  workTotal: number;
}

export const enum AgentKind {
  Citizen = 0,
  Cart = 1,
  Restless = 2,
  Creature = 3,
  Builder = 4,
  Walker = 5,
}

export type Species = 'glimmoth' | 'thrumhare' | 'wisp' | 'hound' | 'drake' | 'wyvern' | 'wyrm' | 'golem' | 'skyray' | 'rider' | 'airship' | 'tiger';

export type DragonLine = 'ember' | 'bone' | 'glim' | 'vein' | 'sky' | 'grey' | 'tide' | 'storm' | 'fen';
export type DragonStage = 0 | 1 | 2 | 3 | 4; // egg, hatchling, drake, wyvern, wyrm
export type DragonRole = 'none' | 'warden' | 'delver' | 'courier' | 'champion';
export type Training = 'gentle' | 'hard' | 'wild';

export interface Dragon {
  id: number;
  name: string;
  line: DragonLine;
  second?: DragonLine; // crossed: a second line and a second aura (breeding.ts)
  trueblood?: boolean; // born of two crossed parents: both auras full, grows and sheds more
  stage: DragonStage;
  days: number; // days in the current stage
  cradleId: number; // building id
  role: DragonRole;
  roleTarget: number; // district id (warden) or mine building id (delver)
  mood: number; // 0..100
  hungry: number; // consecutive unfed days
  training: Training;
  agentId: number; // creature agent when out of the cradle, else -1
  born: number; // day
}

export type Scenario = 'valley' | 'onenode' | 'island' | 'inherited';

export interface WyrmState {
  node: number; // index into nodes, -1 none
  state: 'none' | 'sleeping' | 'awake' | 'bound' | 'dead';
  waking: number; // 0..100 while sleeping
  tributes: number; // times a tribute was demanded and settled (raises the price)
  tributeDay: number; // next day a tribute is due while awake, -1 none
  unfed: number; // days without 40 goods while bound
  sulking: number; // days sulking (0 = content)
  fedDays: number; // consecutive fed days while bound (vein egg at a season)
  refused: number;
  flyover: number; // tick the current flyover started, 0 none
  fires: number; // buildings set alight in the current flyover
  bound: number; // day bound, -1
  died: number; // day died, -1
  askedBind: number; // day the binding was last offered, -1
}

export interface Materials {
  scale: number;
  wyrmfire: number;
  eggshell: number;
  rayscale: number;
  glimdust: number;
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
  species?: Species; // creatures only
  dragonId?: number; // drake/wyvern agents
  alt?: number; // altitude in px for flying agents
  phase?: number; // courier trip phase: 0 idle, 1 to source, 2 to destination
  anchorId?: number; // building id (or -1) a creature is tied to
  ax?: number; // anchor tile for free-moving creatures
  ay?: number;
  job?: string; // walkers: key into WALKER_JOBS
  log?: string[]; // walkers: what it did today, last three lines
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
  grants: number;
  net: number;
}

export interface Modifier {
  kind: 'happiness' | 'unrest' | 'deaths' | 'health' | 'tithe' | 'craftTax' | 'mana' | 'gloamHold' | 'rain' | 'watch' | 'goods' | 'price';
  value: number;
  until: number; // day
  label: string;
  district?: number; // only buildings in this district feel it (0 = undistricted)
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
  wall: Uint8Array; // Warding Wall tiles: 0 none, 1 wall, 2 Belregi gate, 3 Uzulim gate
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
  nodes: { x: number; y: number; depth?: number; aspect?: DragonLine }[]; // depth: times deepened (0..2); aspect: the node's ley
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
  chronicle: ChronicleEntry[];
  questsDone: string[];
  edicts: Record<string, boolean>;
  districtEdicts: Record<string, boolean>; // key `${district}:${edict}`
  districtNames: Record<number, string>; // player renames
  trade: { exported: number; imported: number; importCost: number; priceGoods: number; priceLeystone: number; relicsSold?: number }; // today
  dragons: Dragon[];
  nextDragonId: number;
  materials: Materials;
  wyrm: WyrmState;
  fenNex: number; // district granted to the Fen-Nex, 0 none
  guilds: GuildState; // the council at the Guildhall (guilds.ts)
  relics: RelicState; // relic sets from the delve (relics.ts)
  relicStock: number; // loose relics the delve has brought up and not yet sold
  scenario: Scenario;
  gloamPressure: number; // 0..1, recomputed daily (see weave.ts)
  lastBadDay: number; // storyteller: day of the last ill tiding
  sectors: Uint8Array; // 4x4 map sectors, 1 = within the Charter
  challenge: string | null; // daily challenge date, e.g. '2026-10-01'
  challengeDay: number; // day the challenge goal was met, -1
  daughter: { node: number; x: number; y: number; name: string; day: number; twin: number } | null;
  cleanDays: number; // inherited-collapse scenario: days in a row clean
  storms: { x: number; y: number; until: number; vx: number; vy: number }[];
  airship: { status: 'none' | 'docked' | 'away'; goods: number; since: number; tale: number; voyages: number };
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
    goodsDelivered: number;
    houndsKilled: number;
    gloamBurned: number;
    restlessLaid: number;
    caravanGoods: number;
    courierTrips: number;
    boutsWon: number;
    boutsLost: number;
    firesTotal: number;
    surgesTotal: number;
    restlessTotal: number;
    houndsTotal: number;
    houndRaids: number;
    wyrmTributes: number;
    relics: number;
    portalTrips: number;
    golemsWoken: number;
    golemsBound: number;
    skyraySchools: number;
    rayscaleTotal: number;
    bargeTrips: number;
    airshipVoyages: number;
    airshipCrowns: number;
    riderRescues: number;
    stormWarps: number;
    tigersTotal: number;
    tigersKilled: number;
    brownoutsSurvived: number;
    brownoutOpen: number; // 1 while an overdraw is running
    mothsSeen: number;
    daughters: number;
    terraformed: number;
    sectorsBought: number;
    glimdustTotal: number;
    marvels: number;
    quietHush: number;
    hushPressureBreaks: number; // days of the current Hush with pressure >= 0.45
    wispRing: number;
    wyrmFlyovers: number;
    gloamTiles: number;
    peakPopulation: number;
    councils: number; // petitions heard
    twinGoods: number; // goods carried on the Twin Road
    feastGoods: number; // goods eaten at the last Thaw feast
    crossEggs: number;
    guildHalls: number;
    truebloods: number;
    devUses: number; // dev tools used in this charter (marks the daily result)
    greatWyrms: number;
    relicsSold: number; // loose relics sold to the Crown
    guildWars: number;
    wyrmDuels: number;
    relicsAuctioned: number;
    guildCharters: number;
    walkerKills: number;
    walkerLayings: number;
    healerVisits: number;
    wardenRounds: number;
    lastFeastDay: number;
  };
  // transient (rebuilt after load)
  walkerBonus?: Record<ServiceType, Float32Array>; // walkers' bonus on coverage (walkers.ts)
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
