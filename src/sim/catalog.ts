import type { FactionId } from '../data/factions';
import { RoadType, Zone, type ServiceType } from './types';
import buildingsJson from '../data/content/buildings.json';
import roadsJson from '../data/content/roads.json';
import milestonesJson from '../data/content/milestones.json';

/** The names the content files use for the zone and road enums. */
export const ZONE_OF: Record<string, Zone> = { none: Zone.None, hearth: Zone.Hearth, market: Zone.Market, craft: Zone.Craft, arcane: Zone.Arcane };
export const ROAD_TYPE_OF: Record<string, RoadType> = { none: RoadType.None, track: RoadType.Track, cobble: RoadType.Cobble, lantern: RoadType.Lantern };
type Named<T, K extends keyof T> = Omit<T, K> & { [P in K]?: string };
const buildingsData = buildingsJson as unknown as Named<BuildingDef, 'zone'>[];
const roadsData = roadsJson as unknown as (Omit<RoadDef, 'type'> & { type: string })[];
const milestonesData = milestonesJson as unknown as Milestone[];

export type BuildingCategory = 'zone' | 'ley' | 'water' | 'service' | 'leisure' | 'wonder' | 'special';

export interface ServiceDef {
  type: ServiceType;
  radius: number;
  strength: number; // 0..1 at the centre
  quietRate?: number; // bodies per day (deathcare)
}

export interface BuildingDef {
  key: string;
  name: string;
  category: BuildingCategory;
  desc: string;
  flavor: string;
  w: number;
  h: number;
  cost: number;
  upkeep: number; // crowns per day
  manaUse: number; // per day (zone: per level)
  manaProduce?: number;
  manaStorage?: number;
  waterRadius?: number;
  waterNearBonus?: number; // extra radius if within 3 tiles of water
  needsMana?: boolean; // service works at half strength if unlit
  service?: ServiceDef;
  miasma?: number; // emitted per level, radius 4
  landValue?: number; // flat bonus in radius 6
  zone?: Zone;
  capacity?: number[]; // residents or jobs per level (index level-1)
  tax?: number; // crowns per occupant per day at 10%
  unlock: number; // milestone index
  wonder?: boolean;
  onHills?: boolean; // footprint must be hills
  nearHills?: boolean; // a hills tile must touch the footprint
  nearWater?: boolean; // a river/lake tile must touch the footprint
  nearShore?: boolean; // a shore or water tile must touch the footprint (the reed-cutters, iteration 60)
  nearLake?: boolean; // a footprint tile within 3 of the lake's open water (the Water Garden, iteration 60)
  selfLit?: boolean; // lights itself and its neighbours without mana
  goodsRate?: number; // goods produced per day, carted like a Craft works
  onRuins?: boolean; // footprint must be Ruins tiles
  maxCount?: number; // at most this many in the city
  faction?: FactionId[]; // a people's own building; absent = every people
  leystone?: number; // leystone mined per day
}

/** Every building, from src/data/content/buildings.json (iteration 87, DESIGN 4.118: content is data, edited by hand or
 *  on the dev board, tools/devboard; `zone` by name there). src/sim/contentCheck.ts validates it. */
export const BUILDINGS: BuildingDef[] = buildingsData.map((b) =>
  (b.zone === undefined ? b : { ...b, zone: ZONE_OF[b.zone] }) as BuildingDef,
);

export const BUILDING_BY_KEY: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.key, b]),
);

export const ZONE_KEY: Record<number, string> = {
  [Zone.Hearth]: 'hearth',
  [Zone.Market]: 'market',
  [Zone.Craft]: 'craft',
  [Zone.Arcane]: 'arcane',
};

export interface RoadDef {
  type: RoadType;
  key: string;
  name: string;
  cost: number;
  upkeep: number;
  manaUse: number;
  speed: number;
  capacity: number; // agents per day before congestion
  landValue: number;
  unlock: number;
  desc: string;
  requires?: string; // building key that must exist
}

/** The roads, from src/data/content/roads.json (`type` by name there). */
export const ROADS: RoadDef[] = roadsData.map((r) => ({ ...r, type: ROAD_TYPE_OF[r.type] }) as RoadDef);

export const ROAD_BY_TYPE: Record<number, RoadDef> = Object.fromEntries(ROADS.map((r) => [r.type, r]));

export interface Milestone {
  name: string;
  pop: number;
  grant: number;
  unlocks: string[]; // building keys / road keys / zone keys
  text: string;
}

export const MILESTONES: Milestone[] = milestonesData;

export function isBuildingUnlocked(milestone: number, key: string): boolean {
  const def = BUILDING_BY_KEY[key];
  if (!def) return false;
  return milestone >= def.unlock;
}

export function isRoadUnlocked(milestone: number, type: RoadType): boolean {
  return milestone >= ROAD_BY_TYPE[type].unlock;
}

export function isZoneUnlocked(milestone: number, zone: Zone): boolean {
  const key = ZONE_KEY[zone];
  return key ? milestone >= BUILDING_BY_KEY[key].unlock : false;
}

/** The Gloam road's yards: the Trade Depot (the Fen-Nex's Caravanserai is parked, scope reset phase 1a). */
export const DEPOT_KINDS = ['depot'];
export function isDepot(kind: string): boolean {
  return DEPOT_KINDS.includes(kind);
}

export const BULLDOZE_COST = 5;
export const START_TREASURY = 15000;
export const NODE_MANA = 90;
/** Great halls that relay the ley like a Nexus and light like the Lantern (the other peoples' halls are parked). */
export const WONDER_HALLS = ['lantern'];

