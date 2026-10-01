/** Peoples: playable factions as data. The Vellish default has neutral rules; the Grimmen of the Underhill are the proof of concept (DESIGN 14.2). */
import { BUILDING_BY_KEY, MILESTONES, isBuildingUnlocked, type BuildingDef, type Milestone } from '../sim/catalog';
import type { GameState } from '../sim/types';

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

export const NEUTRAL_RULES: FactionRules = { hillLandValue: 0, grassPenalty: 0, hillBuildable: false, wallWard: 1, lanternWard: 1, hillMana: 1, nodeMana: 1, startCrowns: 0 };

export const FACTIONS: Record<string, FactionDef> = {
  vellish: {
    id: 'vellish', name: 'The Vellish', people: 'Vellish', playable: true,
    lore: 'Hearthfolk of the Ashen Crown: the Charter, the spires, the Ward Lanterns and the river wells. The standard wardlight.',
    milestones: MILESTONES, deny: [], replaces: {}, rules: { ...NEUTRAL_RULES },
  },
  grimmen: {
    id: 'grimmen', name: 'The Grimmen of the Underhill', people: 'Grimmen', playable: false,
    lore: 'Ash-grey stone folk the Gloam cannot touch. They cut their halls into the hills, draw water from seeps, hold the grey with stone, and bind the old Wardens at a Forge-Temple. Coming in a later iteration.',
    milestones: MILESTONES, deny: [], replaces: {}, rules: { ...NEUTRAL_RULES },
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
