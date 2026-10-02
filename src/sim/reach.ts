/**
 * Every reach a building has, for the rings drawn when it is placed or selected (iteration 56): its service, its water or
 * its light (`influenceRadius`), and the secondary reaches the sim uses but the panels only name in text. Each number is
 * read from the constant the sim itself uses, so a ring can never disagree with what the building does.
 */
import { BUILDING_BY_KEY, WONDER_HALLS, type BuildingDef } from './catalog';
import { FISH_MARKET_REACH, FISH_REACH, REED_REACH, SMOKE_REACH, THATCH_REACH, WEIR_REACH } from './water';
import { influenceRadius, waterReachOf } from './world';
import { FEED_REACH, LODGE_REACH } from './wyrmcraft';
import { FOUNDRY_RADIUS, FORGE_WAKE_RADIUS } from './beasts';
import { QUAY_REACH } from './vehicles';
import { GLIMHOUSE_REACH, HOSPICE_REACH } from './growth';
import { CARTERS_REACH } from './agents';
import { GLOWVINE_REACH, MILL_SHARE_REACH, SEAT_WARMTH, WICKS_REACH } from './networks';
import { SLUICE_FLOOD_REACH } from './weave';
import { HOUND_REACH, HUNT_REACH } from './wild';
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

/** The secondary reaches, by building key; `when` limits one to a state of the building (the Weir's sluice). */
export const SECONDARY_REACH: Record<string, { r: number; label: string; square?: boolean; when?: (b: Building) => boolean }[]> = {
  cradle: [{ r: FEED_REACH, label: 'fed from markets' }],
  hatchery: [{ r: FEED_REACH, label: 'fed from markets' }],
  tidepool: [{ r: FEED_REACH, label: 'fed from markets' }],
  tamerslodge: [{ r: LODGE_REACH, label: 'seats cradles' }],
  golemfoundry: [{ r: FOUNDRY_RADIUS, label: 'binds wardens' }],
  forgetemple: [{ r: FOUNDRY_RADIUS, label: 'binds wardens' }, { r: FORGE_WAKE_RADIUS, label: 'wakes them bound' }],
  quay: [{ r: QUAY_REACH, label: 'works by barge', square: true }],
  landing: [{ r: QUAY_REACH, label: 'works by barge', square: true }],
  hospice: [{ r: HOSPICE_REACH, label: 'draughts from markets', square: true }],
  cartersyard: [{ r: CARTERS_REACH, label: 'eases the roads', square: true }],
  hanginggardens: [{ r: GLOWVINE_REACH, label: 'glowvine alive' }],
  greatweir: [{ r: SLUICE_FLOOD_REACH, label: 'sluice floods', when: (b) => !!b.sluice }],
  lanternofwicks: [{ r: WICKS_REACH, label: 'halves spires' }],
  underkingseat: [{ r: SEAT_WARMTH, label: 'warms cradles' }],
  torrentmill: [{ r: MILL_SHARE_REACH, label: 'shares the river', square: true }],
  glimhouse: [{ r: GLIMHOUSE_REACH, label: 'Hush works', square: true }],
  hunterslodge: [{ r: HOUND_REACH, label: 'hounds' }, { r: HUNT_REACH, label: 'hunt and meat' }], // the grounds it hunts game in and carts meat across (iteration 57)
  fishershut: [{ r: FISH_REACH, label: 'fishes' }, { r: FISH_MARKET_REACH, label: 'fish to markets' }], // the water (iteration 60)
  smokehouse: [{ r: SMOKE_REACH, label: 'takes the huts\' fish' }],
  reedcutters: [{ r: REED_REACH, label: 'reed beds' }, { r: THATCH_REACH, label: 'thatches homes' }],
  weir: [{ r: WEIR_REACH, label: 'holds the fords' }],
};

/** The word for a building's primary reach. */
function primaryWord(def: BuildingDef): string {
  if (def.service) return SERVICE_WORDS[def.service.type] ?? def.service.type;
  if (def.waterRadius) return 'water';
  if (def.key === 'spire' || def.key === 'wicktower' || def.key === 'nexus' || WONDER_HALLS.includes(def.key)) return 'light';
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
