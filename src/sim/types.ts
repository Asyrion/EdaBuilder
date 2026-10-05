import type { QuarterId } from './districts';
import type { GuildState } from './guilds';
import type { FactionId } from '../data/factions';
import type { RelicState } from './relics';
/** Plain-data simulation types. Nothing here touches the DOM. */

export const MAP_W = 128;
export const MAP_H = 128;
export const TICKS_PER_SEC = 10;
export const TICKS_PER_DAY = 900; // 90 s of game time at 1x
export const SAVE_VERSION = 7; // 7: saves branch on their version (iteration 55); every save before says 6
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

/** Where the Heart of Belregi is (iteration 69): not yet brought; set in the Great Gate; left with the Guardians; sold to the Crown;
 *  shared with the Uzulim. `step` counts the tales answered (the High Warden, the obelisks or their skip, the waking); `day` is the last. */
/** What ended a charter (iteration 70). */
export type LossKind = 'gloam' | 'restless' | 'crown' | 'wyrm' | 'hounds';
/** The hounds' Hush (iteration 70): the year it belongs to, and the units (a painted district, or an unpainted march as 100 + its
 *  sector) whose homes have half fled from the hounds this Hush. */
export interface HushState { year: number; emptied: number[]; warned?: number[]; quarter?: number[] } // warned: units told of a second night; quarter: units told of a quarter fled

export type HeartHeld = 'none' | 'set' | 'guardians' | 'sold' | 'shared';
export interface HeartState { held: HeartHeld; step: number; day: number }

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
  relit?: number; // lit by a lamplighter's candle until this day (the Tallowkin, iteration 52)
  visited?: number; // day a tamer last visited this cradle (growth ×1.1 that day)
  work: number; // construction work left in builder-ticks (0 when standing)
  workTotal: number;
  priority?: 0 | 1 | 2; // brownout tier: 0 essential, 1 normal, 2 dim (dark first); unset = by category
  load?: number; // a member's load: a spire's mana of lit buildings, a well's levels drawn, a mill's output, an arch's crossings today (transient)
  seam?: number; // a Crystal Mine's leystone left in the seam (unset = a full seam)
  flare?: number; // days a Thrum Font's bore flare still smokes
  greyDays?: number; // days the Gloam has stood at the door of this dark, unwarded building
  dryBy?: 'overdrawn'; // why a watered-by-radius building is dry (transient)
  plate?: number; // a Scale Ward's plating, 1 new, wearing a tenth a season; multiplies its ward
  blessed?: number; // a shrine consecrated by a pilgrim's prayer at the Temple: the day it lasts until
  sluice?: boolean; // the Great Weir's sluice: open makes 90 mana and floods the bank below it in the Thaw (iteration 53)
  quarry?: 'hounds' | WildSpecies; // a Hunters' Lodge's chosen quarry; unset = hounds (iteration 58)
  meat?: number; // a lodge's meat in the salting shed, a market's meat on the shelves (iteration 58)
  trophies?: number; // a lodge's trophies awaiting the Gloam road
  took?: number; // a lodge: the day it last brought in game
  tookSp?: string; // a lodge: what it brought in that day
  hounded?: number; // a hearth: nights this Hush the hounds reached its door (iteration 70)
  houndNight?: number; // the last such night's key
  fled?: number; // a hearth whose folk fled the hounds: the Hush year it stands empty through (no move-ins until the Thaw)
  wolfDay?: number; // a hearth: the day the wolves took a hen (−6 happiness for five days)
  broken?: number; // the Lantern of the Cores: days it stays cracked after absorbing a surge (iteration 53)
  fish?: number; // a Fishers' Hut: today's catch, fresh; a market: fish on the shelves (iteration 60)
  fishOld?: number; // a Fishers' Hut: yesterday's catch, which spoils tonight unless a market or a smokehouse takes it
  caught?: number; // a Fishers' Hut: what it caught today; a Reed-Cutters' hut: bundles cut today
  spoiled?: number; // a Fishers' Hut: fish that spoiled last night
  thatchUntil?: number; // a hearth: the day its thatch wears out (a level-1 home thatched by the reed-cutters)
}

/** The Lantern of the Cores is cracked after taking a surge: no light, no store, no ward until it heals (iteration 53). */
export function cracked(b: Building): boolean {
  return b.kind === 'corelantern' && (b.broken ?? 0) > 0;
}

export const enum AgentKind {
  Citizen = 0,
  Cart = 1,
  Restless = 2,
  Creature = 3,
  Builder = 4,
  Walker = 5,
}

export type WildSpecies = 'deer' | 'elk' | 'boar' | 'otter' | 'heron' | 'goat' | 'wolf'; // the wild (M16 part 1, iteration 58)
export type Species = 'glimmoth' | 'thrumhare' | 'wisp' | 'hound' | 'drake' | 'wyvern' | 'wyrm' | 'golem' | 'skyray' | 'rider' | 'airship' | 'tiger' | 'boat' | WildSpecies;

/** A herd, sounder, band or pack of the wild: a home tile, a head count (fractional: the young come in by the day) and the cap its land holds (iteration 58). */
export interface Herd {
  id: number;
  sp: WildSpecies;
  x: number;
  y: number;
  head: number;
  cap: number; // the head its land holds today (habitat within HERD_RANGE)
  bx: number; // where it beds down at night (deer and elk: the nearest forest), else its home
  by: number;
  taken: number; // the last day a lodge took one of it, -1
  prey: number; // a wolf pack: the hearth it stalks tonight (building id), -1
}

export interface WildState {
  herds: Herd[];
  nextId: number;
  seeded: boolean;
  foldsUntil: number; // the wolf winter's lamps on the folds: no hen is taken before this day
  thriveUntil: number; // the white hart let run: herds breed half again as fast until this day
  hensDay: number; // the last day wolves took a hen, -99
  meatAt: number[]; // markets with meat on the shelves today, as x, y pairs (read by the hearths' happiness)
}

/** The water (M16 part 2, iteration 60): a shoal of fish for each body of water, by the body's index (water.ts). */
export interface WaterState {
  fish: number[]; // each body's shoal; the bodies come from the terrain, ordered by their first tile
  spawnUntil: number; // the spawning run let go: shoals regrow twice as fast until this day
  fishAt: number[]; // markets with fish on the shelves today, as x, y pairs
  closed: number[]; // ford tiles closed by high water today
}

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
  lastTrip?: { fx: number; fy: number; tx: number; ty: number; goods: number; day: number }; // a courier's last delivery (iteration 53)
  lined?: boolean; // an egg whose nest is lined with eggshell warms a quarter faster (iteration 53)
}

/** A dragon that left the city (starved, trained wild, its cradle gone): it returns after a season, wild, to ask a tribute. */
export interface DepartedDragon {
  name: string;
  line: DragonLine;
  stage: DragonStage;
  day: number; // day it left
  x: number; // its cradle's tile
  y: number;
  returned: boolean; // its return tale has been answered
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
  courted: boolean; // a lit Wyrm-Court has stood since the binding (iteration 53)
  courtDark: number; // days in a row the courted wyrm has had no lit Court
  starved: number; // refusals in a row: a tribute paid, the binding or its death resets it; the third razes the Stake (iteration 70)
  razing: boolean; // the third refusal's flight is on its way to the Founding Stake
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
  herdId?: number; // a wild animal's herd (iteration 58)
  duty?: 'guard' | 'works' | 'haul'; // a bound golem's post: guard (ward 6 at its foundry), works (12 hands at targetId) or haul (a golem cart from the works at targetId, iteration 72); unset = labour (iteration 53)
  golemId?: number; // a golem hauler cart: the bound warden in its harness (iteration 72)
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

/** The sky today: a pure function of the seed and the day (weave.ts), kept for the panels (iteration 54). */
export type WeatherKind = 'rain' | 'drought' | 'blizzard';
export interface Weather {
  kind: WeatherKind;
  until: number; // the first day it is over
}
/** The daily challenge's length in days. */
export const CHALLENGE_DAYS = 60;

export interface Modifier {
  kind: 'happiness' | 'unrest' | 'deaths' | 'health' | 'tithe' | 'craftTax' | 'mana' | 'gloamHold' | 'rain' | 'watch' | 'goods' | 'price' | 'barges' | 'wrights' | 'flood' | 'freeze'; // flood/freeze: forced from the dev panel (iteration 55)
  value: number;
  until: number; // day
  label: string;
  district?: number; // only buildings in this district feel it (0 = undistricted)
}

export interface PendingEvent {
  id: string;
  title: string;
  text: string;
  choices: { label: string; desc: string; slider?: { max: number; label: string } }[]; // a slider choice carries an amount (the caravan's rare goods)
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
  ledgerHistory: number[]; // net per day, exports included, last 30
  bankruptDays: number;
  crownFavour: number; // 0..100, 50 neutral: each point is −0.3 % on the levy and on sector prices; under 20 the next grant is withheld (iteration 54)
  loan: number; // the Crown's loan outstanding, 0.5 % a day
  pleadings: number; // times the collector was pleaded with: the next audit is harsher
  // demographics
  population: number;
  jobs: number;
  employed: number;
  educated: number; // 0..1
  happiness: number; // 0..100
  health: number; // 0..1
  unrest: number; // 0..1
  unrestHigh: number; // days in a row unrest has stood above half (a riot at five)
  educatedFloor: number; // the Academy's studied relics: a lasting floor under the educated share
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
  trade: { exported: number; imported: number; importCost: number; priceGoods: number; priceLeystone: number; relicsSold?: number; priceHides?: number; priceMeat?: number; priceTrophy?: number; hidesSold?: number; meatSold?: number; trophiesSold?: number; priceFish?: number; fishSold?: number }; // today; the hunt's prices and sales since iteration 58, smoked fish since 60
  wild: WildState; // herds, packs and the hunt (wild.ts, iteration 58)
  water: WaterState; // shoals, the fish shelves and the fords (water.ts, iteration 60)
  dragons: Dragon[];
  nextDragonId: number;
  materials: Materials;
  weather: Weather | null; // today's spell, if any (iteration 54)
  pilgrimsDay: number; // the day pilgrims were last welcomed, −1: they ask for a shrine a month on
  heart: HeartState; // the Heart of Belregi and its tales (iteration 69)
  litHeld: number; // days in a row the Tallowkin's lit share has held the next gate (needs 3)
  edictSince: Record<string, number>; // the day each edict was turned on (key, or district:key): an edict runs ten days and costs 200 to repeal
  quarterSince: Record<number, number>; // the day each district took its charter: it holds thirty days
  remembranceDead: number; // unquieted dead the Remembrance stirred, drawn down as they rise
  departed: DepartedDragon[]; // dragons that left and may return (iteration 53)
  burnWyrmfire: boolean; // burn 0.05 wyrmfire a day for Craft +15 % (iteration 53)
  dustLit: Uint16Array; // a road tile scattered with glim-dust: the day its light ends, 0 none (iteration 53)
  wyrm: WyrmState;
  fenNex: number; // district granted to the Fen-Nex, 0 none
  guilds: GuildState; // the council at the Guildhall (guilds.ts)
  relics: RelicState; // relic sets from the delve (relics.ts)
  relicStock: number; // loose relics the delve has brought up and not yet sold
  scenario: Scenario;
  faction: FactionId; // the people (data/factions.ts)
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
  /** Lessons the player has closed (the districts card at the Hamlet). */
  lessonsSeen: string[];
  goodsProduced: number; // per day, for UI
  goodsSold: number;
  goodsShort: number; // markets that ran dry today
  gameOver: string | null;
  lostTo?: LossKind; // what ended the charter (iteration 70)
  hush: HushState; // the hounds' Hush: the units they emptied, reset at the Thaw (iteration 70)
  stats: {
    goodsDelivered: number;
    houndsKilled: number;
    gloamBurned: number;
    restlessLaid: number;
    caravanGoods: number;
    caravanCrowns: number; // what the Belerial caravan paid this charter (iteration 63)
    lastCaravanCrowns: number; // and at its last halt
    lastCaravanDay: number; // the Belerial caravan's rhythm; −1 before the first
    courierTrips: number;
    boutsWon: number;
    boutsLost: number;
    firesTotal: number;
    surgesTotal: number;
    restlessTotal: number;
    houndsTotal: number;
    houndRaids: number;
    golemHauls: number; // goods delivered by golem haulers (iteration 72)
    cartsBalked: number; // donkey carts that stopped for a hound (iteration 72)
    lastBalkDay: number; // the day the carters last complained of hounds (iteration 72)
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
    stormsDissolved: number; // storms the wards or a Storm ley ended early
    fullDays: number; // days in a row with no market short
    tigersTotal: number;
    tigersKilled: number;
    brownoutsSurvived: number;
    brownoutOpen: number; // 1 while an overdraw is running
    mothsSeen: number;
    daughters: number;
    terraformed: number;
    stoneCut: number; // hills levelled or ground delved, and collapse rubble: what the Grimmen count as stone
    sectorsBought: number;
    glimdustTotal: number;
    marvels: number;
    quietHush: number;
    hushPressureBreaks: number; // days of the current Hush with pressure >= 0.45
    wispRing: number;
    wyrmFlyovers: number;
    wyrmStarvedMost: number; // the most refusals of the wyrm in a row (iteration 70)
    houndFled: number; // homes whose folk fled the hounds in the Hush
    houndEmptied: number; // districts (or marches) the hounds emptied
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
    lamplighterRounds: number; // dark homes relit by lamplighters
    scholarTrips: number;
    tamerVisits: number;
    pilgrimPrayers: number;
    trueVeins: number; // veins of true leystone left to the ley: +10 node mana each
    floodDays: number; // days of the current Hush the Sable has been in flood (weave.ts)
    floodsWeathered: number; // Hushes a water people came through with the river in flood
    bargemanRounds: number; // flooded homes bailed by bargemen
    quarterDays: number; // days with at least one chartered district
    riots: number;
    goodsStolen: number; // goods taken from unwatched shelves
    pelts: number; // hound pelts the lodges brought in
    rainDays: number; // iteration 54: the weather
    droughtDays: number;
    blizzardDays: number;
    levies: number; // the Crown's Thaw levies taken
    levied: number; // crowns they took
    foxAudits: number; // the Fen-Nex quarter's seasonal audits
    hides: number; // hides the lodges brought in from game (iteration 58)
    meat: number; // meat the lodges brought in
    trophies: number; // trophies taken (antlers, tusks, plumes, wolf heads, a tiger, a white hart)
    herdsLost: number; // herds the city's spread drove off
    herdsHunted: number; // herds the hunters took to the last
    hensTaken: number; // hens the Hush wolves took from the hearths
    huntCrowns: number; // crowns the Gloam road paid for hides, meat and trophies
    fishCaught: number; // fish the Fishers' Huts landed (iteration 60)
    fishSpoiled: number; // fish no market or smokehouse took in two days
    fishSmoked: number;
    fishCrowns: number; // crowns the Gloam road paid for smoked fish
    homesThatched: number; // level-1 homes the reed-cutters thatched
    fordDaysClosed: number; // days a ford stood closed by high water
    pilgrimShrines: number; // shrines raised at the pilgrims' asking
    gatePilgrims: number; // pilgrims of the Pass lodged through the Great Gate (iteration 69)
    gateAlms: number; // the alms they paid
    tideTrips: number; // barges a Tide dragon swam (iteration 53)
    surgesAbsorbed: number; // surges the Lantern of the Cores took
    dragonsReturned: number; // departed dragons that came back to ask a tribute
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
