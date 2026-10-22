/** Peoples: playable factions as data. Since the scope reset (phase 1a, docs/RESET_PLAN.md) the Vellish are the only people;
 *  this file stays as the seam another people would plug into (docs/PARKED.md), with neutral rules for the Vellish. */
import { BUILDING_BY_KEY, MILESTONES, isBuildingUnlocked, type BuildingDef, type Milestone } from '../sim/catalog';
import type { GameState } from '../sim/types';

export type FactionId = 'vellish';

export interface FactionRules {
  hillLandValue: number; // land value added on Hills tiles
  grassPenalty: number; // land value taken off every tile that is not hills
  hillBuildable: boolean; // ordinary buildings and zones may stand on Hills
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

/** The Vellish gate: mean happiness of 45 + 3 × the milestone reached (iteration 54). */
export function VELLISH_HAPPINESS(next: number): number {
  return 45 + 3 * next;
}

export const NEUTRAL_RULES: FactionRules = { hillLandValue: 0, grassPenalty: 0, hillBuildable: false, lanternWard: 1, hillMana: 1, nodeMana: 1, startCrowns: 0, waterLandValue: 1, dryPenalty: 0, riverFreezes: true, millMana: 1, spireReach: 0, spireCost: 1, darkAbandon: 0, vigilCost: 1, vigilMandatory: false };

export const FACTIONS: Record<string, FactionDef> = {
  vellish: {
    id: 'vellish', name: 'The Vellish', people: 'Vellish', playable: true,
    lore: 'Hearthfolk of the Ashen Crown: the Charter, the spires, the Ward Lanterns and the river wells. The standard wardlight.',
    milestones: MILESTONES, deny: [], replaces: {}, rules: { ...NEUTRAL_RULES, milestoneGate: (s, next) => s.happiness >= VELLISH_HAPPINESS(next) },
  },
};

/** What a building costs this people: the Ley Spire's price is a rule, everything else is the catalog's. */
export function costOf(s: GameState, def: BuildingDef): number {
  const base = def.key === 'spire' ? def.cost * factionOf(s).rules.spireCost : def.cost;
  return Math.round(base);
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

/** A building's own gate beyond the milestone: the reason it cannot be raised now, or null. */
export function specialLock(s: GameState, key: string): string | null {
  return null;
}
/** Unlocked for this city: the milestone and the people. */
export function canBuild(s: GameState, key: string): boolean {
  const def = BUILDING_BY_KEY[key];
  if (!def) return false;
  return buildsFor(factionOf(s), def) && isBuildingUnlocked(s.milestone, key) && !specialLock(s, key);
}

/** The next milestone's gate in words, for the top bar: folk, and the people's own condition (iteration 54). */
export function nextGate(s: GameState): string | null {
  const MS = milestonesOf(s);
  const next = s.milestone + 1;
  if (next >= MS.length) return null;
  const bits = [`${MS[next].pop.toLocaleString()} folk`];
  bits.push(`happiness ${VELLISH_HAPPINESS(next)}`);
  if (next === MS.length - 1) bits.push('the Lantern of Vell lit');
  return `${MS[next].name}: ${bits.join(', ')}`;
}
/** Does the city meet the next gate's own condition today (not the folk)? */
export function gateMet(s: GameState): boolean {
  const gate = factionOf(s).rules.milestoneGate;
  return !gate || gate(s, s.milestone + 1);
}
