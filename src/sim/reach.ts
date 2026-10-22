/**
 * Every reach a building has, for the rings drawn when it is placed or selected (iteration 56): its service, its water or
 * its light (`influenceRadius`), and the secondary reaches the sim uses but the panels only name in text. Each number is
 * read from the constant the sim itself uses, so a ring can never disagree with what the building does.
 */
import { BUILDING_BY_KEY, WONDER_HALLS, type BuildingDef } from './catalog';
import { influenceRadius, waterReachOf } from './world';
import { HOSPICE_REACH } from './growth';
import type { Building, GameState } from './types';

export interface Reach {
  r: number;
  label: string;
  /** a reach the sim measures as a square of tiles (|dx| and |dy| within r), drawn as one */
  square?: boolean;
  /** the primary reach (service, water, light) rather than a secondary one */
  primary?: boolean;
}

const SERVICE_WORDS: Record<string, string> = { watch: 'watch', health: 'healing', fire: 'fire', faith: 'faith', school: 'schooling', death: 'quieting', ward: 'ward', leisure: 'leisure' };

/** The secondary reaches, by building key; `when` limits one to a state of the building. */
export const SECONDARY_REACH: Record<string, { r: number; label: string; square?: boolean; when?: (b: Building) => boolean }[]> = {
  hospice: [{ r: HOSPICE_REACH, label: 'draughts from markets', square: true }],
};

/** The word for a building's primary reach. */
function primaryWord(def: BuildingDef): string {
  if (def.service) return SERVICE_WORDS[def.service.type] ?? def.service.type;
  if (def.waterRadius) return 'water';
  if (def.key === 'spire' || def.key === 'nexus' || WONDER_HALLS.includes(def.key)) return 'light';
  return 'reach';
}

/** Every reach of a building (standing, or about to be placed when `b` is absent), primary first. */
export function reachesOf(state: GameState, def: BuildingDef, b?: Building): Reach[] {
  const out: Reach[] = [];
  const r = b && def.waterRadius ? waterReachOf(state, b) : influenceRadius(state, def, b);
  if (r > 0) out.push({ r, label: `${primaryWord(def)} ${r}`, primary: true });
  for (const x of SECONDARY_REACH[def.key] ?? []) {
    if (x.when && (!b || !x.when(b))) continue;
    out.push({ r: x.r, label: `${x.label} ${x.r}`, square: x.square });
  }
  return out;
}

/** The same for a standing building, by its kind. */
export function reachesOfBuilding(state: GameState, b: Building): Reach[] {
  return reachesOf(state, BUILDING_BY_KEY[b.kind], b);
}
