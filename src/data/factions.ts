/** Peoples: playable factions as data. The Vellish default has neutral rules; the Grimmen of the Underhill are the proof of concept (DESIGN 14.2). */
import { BUILDING_BY_KEY, MILESTONES, isBuildingUnlocked, type BuildingDef, type Milestone } from '../sim/catalog';
import { Terrain, idx, type GameState } from '../sim/types';

export type FactionId = 'vellish' | 'grimmen';

export interface FactionRules {
  hillLandValue: number; // land value added on Hills tiles
  grassPenalty: number; // land value taken off every tile that is not hills
  hillBuildable: boolean; // ordinary buildings and zones may stand on Hills
  wallWard: number; // × the ward of the Warding Wall's gates
  lanternWard: number; // × the strength of a Ward Lantern
  hillMana: number; // × the mana made by a building that stands on hills
  nodeMana: number; // × the flow of the ley nodes
  startCrowns: number; // added to the starting treasury
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

export const NEUTRAL_RULES: FactionRules = { hillLandValue: 0, grassPenalty: 0, hillBuildable: false, wallWard: 1, lanternWard: 1, hillMana: 1, nodeMana: 1, startCrowns: 0 };

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
    rules: { hillLandValue: 12, grassPenalty: 6, hillBuildable: true, wallWard: 2, lanternWard: 1, hillMana: 1.33, nodeMana: 0.67, startCrowns: 0, milestoneGate: (s, next) => stoneQuarried(s) >= GRIMMEN_STONE[next] },
  },
};

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
export function canBuild(s: GameState, key: string): boolean {
  const def = BUILDING_BY_KEY[key];
  if (!def) return false;
  return buildsFor(factionOf(s), def) && isBuildingUnlocked(s.milestone, key, s.relics?.complete);
}
