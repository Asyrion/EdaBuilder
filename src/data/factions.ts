/** Peoples: playable factions as data. The Vellish default has neutral rules; the Grimmen of the Underhill are the proof of concept (DESIGN 14.2). */
import { BUILDING_BY_KEY, MILESTONES, isBuildingUnlocked, type BuildingDef, type Milestone } from '../sim/catalog';
import { Terrain, idx, type GameState } from '../sim/types';

export type FactionId = 'vellish' | 'grimmen' | 'veshari' | 'tallowkin';

export interface FactionRules {
  hillLandValue: number; // land value added on Hills tiles
  grassPenalty: number; // land value taken off every tile that is not hills
  hillBuildable: boolean; // ordinary buildings and zones may stand on Hills
  wallWard: number; // × the ward of the Warding Wall's gates
  lanternWard: number; // × the strength of a Ward Lantern
  hillMana: number; // × the mana made by a building that stands on hills
  nodeMana: number; // × the flow of the ley nodes
  startCrowns: number; // added to the starting treasury
  waterLandValue: number; // × the land value the river gives its banks (services.ts)
  dryPenalty: number; // land value taken off every tile more than 8 from water
  riverFreezes: boolean; // false: the river runs through the Hush (barges sail, mills turn)
  millMana: number; // × the mana a Torrent Mill makes
  spireReach: number; // added to a Ley Spire's link and light radius (networks.ts)
  spireCost: number; // × the crowns a Ley Spire costs (costOf)
  darkAbandon: number; // days unlit before a zone building is abandoned; 0 = never (growth.ts)
  vigilCost: number; // × the mana the Hush vigil draws (events.ts)
  vigilMandatory: boolean; // skipping the vigil costs the people dearly (events.ts)
  milestoneGate?: (s: GameState, next: number) => boolean; // false holds the city at its milestone
}

export interface FactionDef {
  id: FactionId;
  name: string; // the people, e.g. "The Vellish"
  people: string; // adjective, e.g. "Vellish"
  lore: string;
  playable: boolean;
  milestones: Milestone[]; // same length and indices as MILESTONES
  deny: string[]; // catalog keys this people never builds
  replaces: Record<string, string>; // Vellish key -> this people's key
  rules: FactionRules;
}

/** Stone quarried: hills levelled, plus two for every building standing on hills. The Grimmen's depth milestones need it. */
export function stoneQuarried(s: GameState): number {
  let n = s.stats.stoneCut;
  for (const b of s.buildings) {
    if (!b || b.state === 'ruin') continue;
    if (s.terrain[idx(b.x, b.y)] === Terrain.Hills) n += b.kind === 'quarry' && b.state === 'ok' ? 4 : 2; // a quarry is the hill cut open
    if (b.kind === 'underkingseat' && b.state === 'ok') n += 10; // the Seat is the deepest cut of all
  }
  return n;
}
export const GRIMMEN_STONE = [0, 2, 6, 12, 20, 30, 42, 56, 72];
const GRIMMEN_NAMES = ['Camp', 'Cut', 'Gallery', 'Hold', 'Deep Hold', 'Under-Market', 'Deephold', "Underking's Hall", "Underking's Seat"];
const GRIMMEN_TEXTS = [
  'A camp at the hill foot. Cut the hill, hold the grey, and make the stone pay.',
  'The first cut into the hill. The Crown sends cobbles, a sexton and a healer; the Grimmen send for more picks.',
  'A gallery runs under the hill. The Veshari answer, and the first Stone Ward is yours to raise.',
  "A hold with a name on the Crown's maps. Scholars, a proper Watch and the carters' guild follow.",
  'The Deep Hold. The deep Veins may be tapped, and a Hatchery cut for the stone lines.',
  'An under-market: carts from three valleys come down the ramps. The guilds petition for a hall.',
  'A deephold of a thousand souls. The Four Vigils ask for a temple under the hill.',
  "The Underking's Hall: the Crown grants you the right to cut the Underking's Seat into the hill.",
  "The Underking's Seat. The deepest hall in Eda, and the Gloam has never seen the inside of it.",
];
const SWAP: Record<string, string> = { well: 'seep', wardlantern: 'stoneward', cradle: 'hatchery', golemfoundry: 'forgetemple', lantern_wonder: 'underkingseat' };
export const GRIMMEN_MILESTONES: Milestone[] = MILESTONES.map((m, i) => ({ ...m, name: GRIMMEN_NAMES[i], text: GRIMMEN_TEXTS[i], unlocks: m.unlocks.map((k) => SWAP[k] ?? k) }));

/** Moorings: the buildings barges sail between. The Veshari's reach milestones count them. */
export const MOORINGS = ['quay', 'landing'];
export function moorings(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b && b.state === 'ok' && MOORINGS.includes(b.kind)) n++;
  return n;
}
export const VESHARI_MOORINGS = [0, 1, 2, 3, 4, 5, 6, 8, 10];
const VESHARI_NAMES = ['The Bank', 'Jetty', 'Quayside', 'Harbour', 'Haven', 'River-Market', 'Weirhold', "Vesh's Court", 'Sable Crown'];
const VESHARI_TEXTS = [
  'A camp on the Sable\'s bank. Sink a tide-well, lay the first landing, and let the river do the carrying.',
  'A jetty on the water. The Crown sends cobbles, a sexton and a healer; the Veshari send for more rope.',
  'A quayside with a name. Barges run between your landings, and the first Ward Lantern is yours to raise.',
  "A harbour on the Crown's charts. Scholars, a proper Watch and the carters' guild follow the barges in.",
  'A haven. The deep Veins may be tapped, the mills may turn in the current, and a Tide Pool dug for the water lines.',
  'A river-market: barges from three valleys tie up at your moorings. The guilds petition for a hall.',
  'A weirhold of a thousand souls. The Four Vigils ask for a temple with its feet in the water.',
  "Vesh's Court: the Crown grants you the right to raise the Great Weir across the Sable.",
  'The Sable Crown. The river runs through the city and the city runs the river, and the Gloam has never crossed it.',
];
const VESHARI_SWAP: Record<string, string> = { well: 'tidewell', cradle: 'tidepool', lantern_wonder: 'greatweir' };
export const VESHARI_MILESTONES: Milestone[] = MILESTONES.map((m, i) => ({ ...m, name: VESHARI_NAMES[i], text: VESHARI_TEXTS[i], unlocks: m.unlocks.map((k) => VESHARI_SWAP[k] ?? k) }));

/** The share of standing buildings that are lit (the stake counts): the Tallowkin's milestones need it. */
export function litShare(s: GameState): number {
  let all = 0; let lit = 0;
  for (const b of s.buildings) { if (!b || b.state !== 'ok') continue; all++; if (b.lit) lit++; }
  return all ? lit / all : 1;
}
export const TALLOW_LIGHT = [0, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.9];
const TALLOW_NAMES = ['Wick', 'Taper', 'Candle', 'Lamp', 'Lantern', 'Beacon-Street', 'Bright Town', 'Hall of Wicks', 'Lantern of Wicks'];
const TALLOW_TEXTS = [
  'A wick at the node. Raise a spire, light every window, and let no house go dark.',
  'A taper. The Crown sends cobbles, a sexton and a healer; the Tallowkin send for more leystone.',
  'A candle in the dark. The Veshari answer, and the first Ward Lantern is yours to raise.',
  "A lamp on the Crown's maps. Scholars, a proper Watch and the carters' guild follow the light in.",
  'A lantern town. The deep Veins may be tapped and a Wyrm-Cradle warmed under the spires.',
  'A beacon-street: carts from three valleys steer by your light. The guilds petition for a hall.',
  'A bright town of a thousand souls. The Four Vigils ask for a temple with a lamp in every niche.',
  'The Hall of Wicks stands and the city is nine tenths lit: the Crown grants you the right to raise the Lantern of Wicks.',
  'The Lantern of Wicks. Every window in the city burns, and the Gloam has nowhere to stand.',
];
const TALLOW_SWAP: Record<string, string> = { shrine: 'candleshrine', lantern_wonder: 'lanternofwicks' };
export const TALLOW_MILESTONES: Milestone[] = MILESTONES.map((m, i) => ({ ...m, name: TALLOW_NAMES[i], text: TALLOW_TEXTS[i], unlocks: m.unlocks.map((k) => TALLOW_SWAP[k] ?? k) }));

export const NEUTRAL_RULES: FactionRules = { hillLandValue: 0, grassPenalty: 0, hillBuildable: false, wallWard: 1, lanternWard: 1, hillMana: 1, nodeMana: 1, startCrowns: 0, waterLandValue: 1, dryPenalty: 0, riverFreezes: true, millMana: 1, spireReach: 0, spireCost: 1, darkAbandon: 0, vigilCost: 1, vigilMandatory: false };

export const FACTIONS: Record<string, FactionDef> = {
  vellish: {
    id: 'vellish', name: 'The Vellish', people: 'Vellish', playable: true,
    lore: 'Hearthfolk of the Ashen Crown: the Charter, the spires, the Ward Lanterns and the river wells. The standard wardlight.',
    milestones: MILESTONES, deny: [], replaces: {}, rules: { ...NEUTRAL_RULES },
  },
  grimmen: {
    id: 'grimmen', name: 'The Grimmen of the Underhill', people: 'Grimmen', playable: true,
    lore: 'Ash-grey stone folk the Gloam cannot touch. Hills are their best land and grass is poor; they drink from seeps, hold the grey with standing stones instead of lanterns, draw more from the hill than from the spires, and hatch only the stone lines. Their milestones are cut by depth: each needs stone quarried as well as folk.',
    milestones: GRIMMEN_MILESTONES, deny: [], replaces: { well: 'seep', wardlantern: 'stoneward', cradle: 'hatchery', golemfoundry: 'forgetemple', lantern: 'underkingseat' },
    rules: { ...NEUTRAL_RULES, hillLandValue: 12, grassPenalty: 6, hillBuildable: true, wallWard: 2, lanternWard: 1, hillMana: 1.33, nodeMana: 0.67, startCrowns: 0, milestoneGate: (s, next) => stoneQuarried(s) >= GRIMMEN_STONE[next] },
  },
  veshari: {
    id: 'veshari', name: 'The Veshari of the Sable', people: 'Veshari', playable: true,
    lore: 'The water-mages of Vesh and their river-kin, chartered on the Sable\'s bank. The riverbank is their best land and dry ground is poor; they drink from tide-wells, moor barges at landings where the Vellish send carts, draw more from the mills in the current than from the Veins, and the river never freezes for them. Their milestones are measured by reach: each needs moorings as well as folk.',
    milestones: VESHARI_MILESTONES, deny: [], replaces: { well: 'tidewell', cradle: 'tidepool', lantern: 'greatweir' },
    rules: { ...NEUTRAL_RULES, waterLandValue: 2, dryPenalty: 6, riverFreezes: false, millMana: 1.33, nodeMana: 0.8, milestoneGate: (s, next) => moorings(s) >= VESHARI_MOORINGS[next] },
  },
  tallowkin: {
    id: 'tallowkin', name: 'The Tallowkin of the Wick', people: 'Tallowkin', playable: true,
    lore: 'The small candle-eyed people born beside the Veins, the spire-wrights of every wardlight, chartered under two nodes. Light is life: a house three days dark is abandoned, their spires reach a tile further and cost double, Wick-Towers light the corners cheaply, the Hush vigil is theirs to keep, and their milestones are measured by how much of the city burns bright.',
    milestones: TALLOW_MILESTONES, deny: [], replaces: { shrine: 'candleshrine', lantern: 'lanternofwicks' },
    rules: { ...NEUTRAL_RULES, spireReach: 1, spireCost: 2, darkAbandon: 3, vigilCost: 0.5, vigilMandatory: true, nodeMana: 1.2, milestoneGate: (s, next) => litShare(s) >= TALLOW_LIGHT[next] },
  },
};

/** What a building costs this people: the Ley Spire's price is a rule, everything else is the catalog's. */
export function costOf(s: GameState, def: BuildingDef): number {
  const base = def.key === 'spire' ? def.cost * factionOf(s).rules.spireCost : def.cost;
  // the spire-wrights' strike (a Tallowkin tale): spires and Wick-Towers cost half again while it lasts
  const strike = def.key === 'spire' || def.key === 'wicktower' ? s.modifiers.filter((m) => m.kind === 'wrights' && m.until > s.day).reduce((a, m) => a + m.value, 0) : 0;
  return Math.round(base * (1 + strike));
}

export function factionOf(s: GameState): FactionDef {
  return FACTIONS[s.faction] ?? FACTIONS.vellish;
}

/** This people's key for a Vellish building (a Seep for a Well), or the key itself. */
export function factionKey(s: GameState, key: string): string {
  return factionOf(s).replaces[key] ?? key;
}

export function milestonesOf(s: GameState): Milestone[] {
  return factionOf(s).milestones;
}

/** Whether a people builds this at all: not denied, not replaced away, and not another people's own. */
export function buildsFor(f: FactionDef, def: BuildingDef): boolean {
  if (f.deny.includes(def.key)) return false;
  if (def.key in f.replaces) return false;
  if (def.faction && !def.faction.includes(f.id)) return false;
  return true;
}

/** Unlocked for this city: milestone, relic set, and the people. */
/** A building's own gate beyond the milestone: the reason it cannot be raised now, or null. */
export function specialLock(s: GameState, key: string): string | null {
  if (key === 'stormpeak' && !s.firedEvents.includes('stormcaller:0')) return 'Needs its caller: give the Huruhui storm caller the hills when they come (a Township of 300 folk).';
  if (key === 'wyrmcourt' && (s.wyrm.state === 'none' || s.wyrm.state === 'sleeping')) return 'Raised for a woken wyrm: there is none awake to court.';
  if (key === 'hallofwicks' && !s.firedEvents.includes('vigil:0')) return 'Sworn at the Hush vigil: keep one first (the first night of the Hush).';
  return null;
}
export function canBuild(s: GameState, key: string): boolean {
  const def = BUILDING_BY_KEY[key];
  if (!def) return false;
  return buildsFor(factionOf(s), def) && isBuildingUnlocked(s.milestone, key, s.relics?.complete) && !specialLock(s, key);
}
