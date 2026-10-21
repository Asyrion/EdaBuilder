/** JSON serialization of GameState. Typed arrays are base64-encoded. */
import { initRelics } from './relics';
import { AgentKind, SAVE_VERSION, SERVICE_TYPES, isWater, type GameState, type ServiceType } from './types';
import { BUILDING_BY_KEY } from './catalog';
import { isWild } from './wild';
import { emptyLedger, markAllDirty } from './world';
import { recomputeAll } from './sim';
import { distanceMap } from './terrain';

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(s, 'binary').toString('base64');
}
function fromB64(s: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const U8_FIELDS = ['terrain', 'gloam', 'zone', 'road', 'trafficSmooth'] as const;

export function serialize(state: GameState): string {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (k === 'dirtyChunks' || k === 'zoneList' || k === 'zoneListDirty') continue;
    if (k === 'coverage' || k === 'lit' || k === 'watered' || k === 'landValue' || k === 'miasma' || k === 'traffic' || k === 'waterDist' || k === 'gloamDist') continue;
    if (v instanceof Uint8Array) o[k] = { u8: toB64(v) };
    else if (v instanceof Int32Array) o[k] = { i32: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    else if (v instanceof Uint16Array) o[k] = { u16: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    else o[k] = v;
  }
  return JSON.stringify(o);
}

/** A save from a newer Wardlight than this one: refused with a reason the title screen and the import show (iteration 55). */
export class SaveVersionError extends Error {}
/** A charter of a people the scope reset parked (phase 1a, docs/PARKED.md): refused, it would load buildings this build no longer has. */
export function parkedPeopleMessage(people: string): string {
  return `This charter belongs to a people that is parked for now (${people}): this Wardlight plays the Vellish only.`;
}
/** A charter that holds what the scope reset parked in phase 1b (dragons, the Warding Wall, their buildings): refused with the
 *  first such thing named, as it would load what this build no longer has (docs/PARKED.md). */
export function parkedContentMessage(what: string): string {
  return `This charter holds something that is parked for now (${what}): this Wardlight cannot load it.`;
}
/** The first parked thing a raw save holds, or null: a building this build no longer has, a dragon, a stretch of the Warding Wall. */
export function parkedContentIn(o: Record<string, any>): string | null {
  for (const b of (o.buildings ?? []) as ({ kind: string } | null)[]) if (b && !BUILDING_BY_KEY[b.kind]) return `the building "${b.kind}"`;
  if (Array.isArray(o.dragons) && o.dragons.length) return 'dragons';
  if (o.wall && typeof o.wall === 'object' && 'u8' in o.wall && fromB64(o.wall.u8).some((v) => v !== 0)) return 'the Warding Wall';
  return null;
}

/**
 * Save migrations by version (iteration 55). `MIGRATIONS[v]` lifts a save of version v to v + 1; they run in order from the
 * save's own version up to SAVE_VERSION, after the saved fields are copied over a fresh state. Every save written before
 * iteration 55 says 6 whatever its age (the version was written but never read), so step 6 is the whole forward-compat
 * block that grew from v3: presence checks for every field added since. A missing version counts as 6.
 */
export const MIGRATIONS: Record<number, (state: GameState, raw: Record<string, any>) => void> = {
  6: (state, o) => {
    if (!('sectors' in o)) state.sectors.fill(1); // saves from before map sectors own the whole map
    for (const b of state.buildings) if (b) { b.stock = b.stock ?? 0; b.problemDays = b.problemDays ?? 0; b.cooldown = b.cooldown ?? 0; }
    state.chronicle = state.chronicle ?? [];
    state.questsDone = state.questsDone ?? [];
    for (const a of state.agents) a.load = a.load ?? 0;
    state.edicts = state.edicts ?? {};
    state.modifiers = state.modifiers ?? [];
    state.lessonsSeen = state.lessonsSeen ?? [];
    state.districtEdicts = state.districtEdicts ?? {};
    state.districtNames = state.districtNames ?? {};
    state.districtQuarters = state.districtQuarters ?? {};
    state.tradeIncomeToday = state.tradeIncomeToday ?? 0;
    state.crownFavour = state.crownFavour ?? 50;
    state.loan = state.loan ?? 0;
    state.edictSince = state.edictSince ?? {}; // an edict with no stamp may be repealed
    state.quarterSince = state.quarterSince ?? {}; // a charter with no stamp may be changed
    state.remembranceDead = state.remembranceDead ?? 0;
    state.gloamPressure = state.gloamPressure ?? 0.3;
    state.educatedFloor = state.educatedFloor ?? 0;
    state.trade = state.trade ?? { exported: 0, imported: 0, importCost: 0, priceGoods: 2, priceLeystone: 3 };
    // the stats object is replaced whole by the save: stone before iteration 38 was every terraform op; the rest fill from a fresh game below
    if (state.stats.stoneCut === undefined) state.stats.stoneCut = state.stats.terraformed ?? 0;
    state.relics = state.relics ?? initRelics();
    state.relicStock = state.relicStock ?? 0;
    for (const b of state.buildings) if (b) { b.work = b.work ?? 0; b.workTotal = b.workTotal ?? 0; }
    state.airship = state.airship ?? { status: 'none', goods: 0, since: -1, tale: 0, voyages: 0 };
    state.scenario = state.scenario ?? 'valley';
    state.faction = state.faction ?? 'vellish';
    state.daughter = state.daughter ?? null;
    state.challenge = state.challenge ?? null;
    state.challengeDay = state.challengeDay ?? -1;
    state.cleanDays = state.cleanDays ?? 0;
  },
};

export function deserialize(json: string, fresh: (seed: number) => GameState): GameState {
  const o = JSON.parse(json) as Record<string, any>;
  if (typeof o.seed !== 'number') throw new Error('Not a Wardlight save');
  const saved = typeof o.version === 'number' ? o.version : 6;
  if (saved > SAVE_VERSION) throw new SaveVersionError(`This charter was saved by a newer Wardlight (save version ${saved}); this one reads version ${SAVE_VERSION} and older.`);
  if (o.faction !== undefined && o.faction !== 'vellish') throw new SaveVersionError(parkedPeopleMessage(String(o.faction)));
  const parked = parkedContentIn(o);
  if (parked) throw new SaveVersionError(parkedContentMessage(parked));
  const state = fresh(o.seed);
  const freshStats = { ...state.stats };
  for (const [k, v] of Object.entries(o)) {
    if (!(k in state)) continue; // a field this build no longer has (a parked system's) is dropped
    if (v && typeof v === 'object' && 'u8' in v) (state as any)[k] = fromB64(v.u8);
    else if (v && typeof v === 'object' && 'i32' in v) {
      const b = fromB64(v.i32);
      (state as any)[k] = new Int32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    } else if (v && typeof v === 'object' && 'u16' in v) {
      const b = fromB64(v.u16);
      (state as any)[k] = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
    } else (state as any)[k] = v;
  }
  for (let v = Math.max(6, saved); v < SAVE_VERSION; v++) MIGRATIONS[v](state, o);
  // the fill every version gets: a counter or a ledger row the save lacks starts where a fresh game's does
  state.stats = { ...freshStats, ...state.stats };
  if (!('wild' in o)) { state.wild = { herds: [], nextId: 1, seeded: false, foldsUntil: -1, thriveUntil: -1, hensDay: -99, meatAt: [] }; state.agents = state.agents.filter((a) => a.herdId === undefined); } // a save from before the wild seeds its herds on its own land the next day (iteration 58)
  if (!('water' in o)) state.water = { fish: [], spawnUntil: -1, fishAt: [], closed: [] }; // a save from before the water: every shoal starts full (iteration 60)
  state.ledger = { ...emptyLedger(), ...(state.ledger ?? {}) };
  // the parked creatures (phase 1b) and walkers (1c, kind 5) leave the map; the wild, the boats and the airship stay
  state.agents = state.agents.filter((a) => (a.kind as number) !== 5 && (a.kind !== AgentKind.Creature || a.species === 'airship' || a.species === 'boat' || isWild(a.species)));
  for (const n of state.nodes) delete (n as { aspect?: string }).aspect; // the ley aspects are parked (1c)
  for (const k of Object.keys(state.stats)) if (!(k in freshStats)) delete (state.stats as Record<string, number>)[k]; // the parked systems' counters
  if (!state.district || state.district.length !== state.w * state.h) state.district = new Uint8Array(state.w * state.h);
  state.version = SAVE_VERSION;
  // rebuild derived layers
  const n = state.w * state.h;
  for (const s of SERVICE_TYPES as ServiceType[]) state.coverage[s] = new Uint8Array(n);
  state.traffic = new Uint16Array(n);
  state.zoneListDirty = true;
  state.dirtyChunks = new Set();
  markAllDirty(state);
  void U8_FIELDS;
  // the water map is derived from the saved terrain, not from the fresh seed's (a people may have cut a channel)
  state.waterDist = distanceMap((i) => isWater(state.terrain[i]), 15);
  recomputeAll(state);
  return state;
}
