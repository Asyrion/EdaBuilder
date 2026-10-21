/** City-wide edicts (policies). Toggled by the player; effects are read by the systems. */
import { BUILDING_BY_KEY } from './catalog';
import { Terrain, Zone, idx, type Building, type GameState } from './types';
import type { FactionId } from '../data/factions';

export interface EdictDef {
  key: string;
  name: string;
  desc: string;
  flavor: string;
  costPerDay: (s: GameState) => number;
  unlock: number; // milestone
  faction?: FactionId[]; // a people's own edict; absent = every people
  cityOnly?: boolean; // read city-wide only: never offered or billed per district
}

import { DRAIN_BASE, DRAIN_PER_DAY, DRAIN_PER_TEN, drainageCost } from './marsh';
import EDICT_TEXT from '../data/content/text/edicts.json';

export const EDICTS: EdictDef[] = [
  {
    key: 'beastmasters', name: EDICT_TEXT.beastmasters.name,
    desc: EDICT_TEXT.beastmasters.desc,
    flavor: EDICT_TEXT.beastmasters.flavor,
    costPerDay: () => 40, unlock: 4, cityOnly: true,
  },
  {
    key: 'bounty', name: EDICT_TEXT.bounty.name,
    desc: EDICT_TEXT.bounty.desc,
    flavor: EDICT_TEXT.bounty.flavor,
    costPerDay: (s) => 20 + s.buildings.filter((b) => b && b.kind === 'hunterslodge').length * 15, unlock: 2, cityOnly: true,
  },
  {
    key: 'closeseason', name: EDICT_TEXT.closeseason.name,
    desc: EDICT_TEXT.closeseason.desc,
    flavor: EDICT_TEXT.closeseason.flavor,
    costPerDay: (s) => 10 + s.buildings.filter((b) => b && b.kind === 'hunterslodge').length * 10, unlock: 2, cityOnly: true,
  },
  {
    key: 'wyrmpeace', name: EDICT_TEXT.wyrmpeace.name,
    desc: EDICT_TEXT.wyrmpeace.desc,
    flavor: EDICT_TEXT.wyrmpeace.flavor,
    costPerDay: () => 80, unlock: 5, cityOnly: true,
  },
  {
    key: 'scalemail', name: EDICT_TEXT.scalemail.name,
    desc: EDICT_TEXT.scalemail.desc,
    flavor: EDICT_TEXT.scalemail.flavor,
    costPerDay: () => 0, unlock: 4, cityOnly: true,
  },
  {
    key: 'curfew', name: EDICT_TEXT.curfew.name,
    desc: EDICT_TEXT.curfew.desc,
    flavor: EDICT_TEXT.curfew.flavor,
    costPerDay: () => 15, unlock: 1,
  },
  {
    key: 'draughts', name: EDICT_TEXT.draughts.name,
    desc: EDICT_TEXT.draughts.desc,
    flavor: EDICT_TEXT.draughts.flavor,
    costPerDay: (s) => Math.round(s.population * 0.3), unlock: 1,
  },
  {
    key: 'rites', name: EDICT_TEXT.rites.name,
    desc: EDICT_TEXT.rites.desc,
    flavor: EDICT_TEXT.rites.flavor,
    costPerDay: (s) => 25 * s.buildings.filter((b) => b && (b.kind === 'boneyard' || b.kind === 'ossuary')).length, unlock: 1,
  },
  {
    key: 'wardens', name: EDICT_TEXT.wardens.name,
    desc: EDICT_TEXT.wardens.desc,
    flavor: EDICT_TEXT.wardens.flavor,
    costPerDay: () => 60, unlock: 2, cityOnly: true,
  },
  {
    key: 'herbgardens', name: EDICT_TEXT.herbgardens.name,
    desc: EDICT_TEXT.herbgardens.desc,
    flavor: EDICT_TEXT.herbgardens.flavor,
    costPerDay: () => 0, unlock: 2,
  },
  {
    key: 'lanternlevy', name: EDICT_TEXT.lanternlevy.name,
    desc: EDICT_TEXT.lanternlevy.desc,
    flavor: EDICT_TEXT.lanternlevy.flavor,
    costPerDay: () => 0, unlock: 3,
  },
  {
    key: 'imports', name: EDICT_TEXT.imports.name,
    desc: EDICT_TEXT.imports.desc,
    flavor: EDICT_TEXT.imports.flavor,
    costPerDay: (s) => s.trade.importCost, unlock: 3, cityOnly: true,
  },
  {
    key: 'scholars', name: EDICT_TEXT.scholars.name,
    desc: EDICT_TEXT.scholars.desc,
    flavor: EDICT_TEXT.scholars.flavor,
    costPerDay: (s) => Math.round(s.population * 0.2), unlock: 3,
  },
  {
    key: 'drainage', name: EDICT_TEXT.drainage.name,
    desc: `Ditchers cut the marsh nearest the city to meadow, ${DRAIN_PER_DAY} tiles a day: no causeway needed there, no miasma from it, and land to build on. The land loses its reeds. ${DRAIN_BASE} crowns a day and ${DRAIN_PER_TEN} more for every ten marsh tiles left.`,
    flavor: EDICT_TEXT.drainage.flavor,
    costPerDay: (s) => drainageCost(s), unlock: 3, cityOnly: true,
  },
];

export const EDICT_BY_KEY: Record<string, EdictDef> = Object.fromEntries(EDICTS.map((e) => [e.key, e]));
const FACTION_EDICTS = new Set(EDICTS.filter((e) => e.faction).map((e) => e.key));

/** Does this people have the edict at all? Another people's edict is never on, whatever the flags say. */
export function edictOf(s: GameState, key: string): boolean {
  return !FACTION_EDICTS.has(key) || !!EDICT_BY_KEY[key].faction!.includes(s.faction);
}

/** The edicts this people can see: the shared ones and its own. */
export function edictsFor(s: GameState): EdictDef[] {
  return EDICTS.filter((e) => !e.faction || e.faction.includes(s.faction));
}

/** City-wide edict, or the edict of the district a tile/building lies in. */
export function edictOn(s: GameState, key: string, at?: number | Building): boolean {
  if (FACTION_EDICTS.has(key) && !edictOf(s, key)) return false;
  if (s.edicts[key]) return true;
  if (at === undefined) return false;
  const i = typeof at === 'number' ? at : idx(at.x, at.y);
  const d = s.district[i];
  return d > 0 && !!s.districtEdicts[`${d}:${key}`];
}

/** Share of residents living under an edict (1 if city-wide). */
export function edictShare(s: GameState, key: string): number {
  if (s.edicts[key]) return 1;
  let res = 0;
  let under = 0;
  for (const b of s.buildings) {
    if (!b || BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.state !== 'ok') continue;
    res += b.residents;
    if (edictOn(s, key, b)) under += b.residents;
  }
  return res > 0 ? under / res : 0;
}

export function districtsInUse(s: GameState): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < s.district.length; i++) if (s.district[i]) seen.add(s.district[i]);
  return [...seen].sort((a, b) => a - b);
}

export function edictUpkeep(s: GameState): number {
  let c = 0;
  for (const e of EDICTS) {
    if (e.faction && !e.faction.includes(s.faction)) continue;
    if (s.edicts[e.key]) {
      c += e.costPerDay(s);
      continue;
    }
    if (e.cityOnly) continue; // a city-only edict is never billed per district
    // per-district: flat costs are split, per-resident costs follow the residents
    const share = edictShare(s, e.key);
    if (share > 0) c += Math.round(e.costPerDay(s) * Math.max(share, 0.25));
  }
  return c;
}

// ---------- edicts as commitments (iteration 54) ----------
/** An edict runs EDICT_MIN_DAYS once on, and repealing one after that costs EDICT_REPEAL crowns. */
export const EDICT_MIN_DAYS = 10;
export const EDICT_REPEAL = 200;
export function edictKey(key: string, district = 0): string {
  return district ? `${district}:${key}` : key;
}
/** Why an edict cannot be repealed yet, or null. An edict with no stamp (an old save) may always be repealed. */
export function edictLocked(s: GameState, key: string, district = 0): string | null {
  const since = s.edictSince[edictKey(key, district)];
  if (since === undefined) return null;
  const left = EDICT_MIN_DAYS - (s.day - since);
  return left > 0 ? `Runs ${left} more day${left === 1 ? '' : 's'}: an edict holds ${EDICT_MIN_DAYS} days once made` : null;
}
/** Turn an edict on (stamped with the day) or off (after its run, for EDICT_REPEAL crowns). The reason it cannot be, or null. */
export function setEdict(s: GameState, key: string, on: boolean, district = 0): string | null {
  if (!EDICT_BY_KEY[key]) return 'No such edict';
  const k = edictKey(key, district);
  const cur = district ? !!s.districtEdicts[k] : !!s.edicts[key];
  if (on === cur) return null;
  if (on) {
    if (district) s.districtEdicts[k] = true; else s.edicts[key] = true;
    s.edictSince[k] = s.day;
    return null;
  }
  const why = edictLocked(s, key, district);
  if (why) return why;
  if (s.treasury < EDICT_REPEAL) return `Repealing an edict costs ${EDICT_REPEAL} crowns; the treasury holds ${Math.round(s.treasury)}`;
  s.treasury -= EDICT_REPEAL;
  if (district) s.districtEdicts[k] = false; else s.edicts[key] = false;
  delete s.edictSince[k];
  return null;
}

/** Sum of active temporary modifiers of a kind. */
export function modifierSum(s: GameState, kind: string): number {
  let v = 0;
  for (const m of s.modifiers) if (m.kind === kind && m.until > s.day && m.district === undefined) v += m.value;
  return v;
}

/** City-wide modifiers plus those scoped to one district. */
export function modifierSumAt(s: GameState, kind: string, district: number): number {
  let v = 0;
  for (const m of s.modifiers) if (m.kind === kind && m.until > s.day && (m.district === undefined || m.district === district)) v += m.value;
  return v;
}
