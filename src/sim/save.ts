/** JSON serialization of GameState. Typed arrays are base64-encoded. */
import { initGuilds } from './guilds';
import { initRelics } from './relics';
import { chooseWyrmNode, newWyrm } from './wyrm';
import { assignAspects } from './weave';
import type { WyrmState } from './types';
import { SAVE_VERSION, SERVICE_TYPES, type GameState, type ServiceType } from './types';
import { markAllDirty } from './world';
import { recomputeAll } from './sim';

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

export function deserialize(json: string, fresh: (seed: number) => GameState): GameState {
  const o = JSON.parse(json) as Record<string, any>;
  if (typeof o.seed !== 'number') throw new Error('Not a Wardlight save');
  const state = fresh(o.seed);
  for (const [k, v] of Object.entries(o)) {
    if (!(k in state)) continue;
    if (v && typeof v === 'object' && 'u8' in v) (state as any)[k] = fromB64(v.u8);
    else if (v && typeof v === 'object' && 'i32' in v) {
      const b = fromB64(v.i32);
      (state as any)[k] = new Int32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    } else if (v && typeof v === 'object' && 'u16' in v) {
      const b = fromB64(v.u16);
      (state as any)[k] = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
    } else (state as any)[k] = v;
  }
  if (!('sectors' in o)) state.sectors.fill(1); // saves from before map sectors own the whole map
  state.version = SAVE_VERSION;
  // forward-compat defaults for fields added after v3
  for (const b of state.buildings) if (b) { b.stock = b.stock ?? 0; b.problemDays = b.problemDays ?? 0; b.cooldown = b.cooldown ?? 0; }
  state.stats.boutsWon = state.stats.boutsWon ?? 0;
  state.chronicle = state.chronicle ?? [];
  state.questsDone = state.questsDone ?? [];
  for (const k of ['goodsDelivered', 'houndsKilled', 'gloamBurned', 'restlessLaid', 'caravanGoods', 'courierTrips'] as const) (state.stats as any)[k] = (state.stats as any)[k] ?? 0;
  state.stats.boutsLost = state.stats.boutsLost ?? 0;
  for (const a of state.agents) a.load = a.load ?? 0;
  state.agents = state.agents.filter((a) => a.kind !== 5 || !!a.job);
  state.edicts = state.edicts ?? {};
  state.modifiers = state.modifiers ?? [];
  state.pendingEvent = state.pendingEvent ?? null;
  state.lastEventDay = state.lastEventDay ?? 0;
  state.firedEvents = state.firedEvents ?? [];
  state.districtEdicts = state.districtEdicts ?? {};
  state.districtNames = state.districtNames ?? {};
  state.tradeIncomeToday = state.tradeIncomeToday ?? 0;
  state.dragons = state.dragons ?? [];
  state.nextDragonId = state.nextDragonId ?? 1;
  state.materials = state.materials ?? { scale: 0, wyrmfire: 0, eggshell: 0, rayscale: 0 };
  state.materials.rayscale = state.materials.rayscale ?? 0;
  state.materials.glimdust = state.materials.glimdust ?? 0;
  state.gloamPressure = state.gloamPressure ?? 0.3;
  state.lastBadDay = state.lastBadDay ?? -30;
  assignAspects(state.nodes, state.founding, (() => { let k = 0; return () => (k++ * 5 + 3); })());
  state.trade = state.trade ?? { exported: 0, imported: 0, importCost: 0, priceGoods: 2, priceLeystone: 3 };
  if (!state.district || state.district.length !== state.w * state.h) state.district = new Uint8Array(state.w * state.h);
  if (!state.wall || state.wall.length !== state.w * state.h) state.wall = new Uint8Array(state.w * state.h);
  state.stats.houndsTotal = state.stats.houndsTotal ?? 0;
  state.stats.houndRaids = state.stats.houndRaids ?? 0;
  state.stats.wyrmTributes = state.stats.wyrmTributes ?? 0;
  state.stats.wyrmFlyovers = state.stats.wyrmFlyovers ?? 0;
  state.stats.relics = state.stats.relics ?? 0;
  state.stats.portalTrips = state.stats.portalTrips ?? 0;
  for (const k of ['golemsWoken', 'golemsBound', 'skyraySchools', 'rayscaleTotal', 'bargeTrips', 'airshipVoyages', 'airshipCrowns', 'riderRescues', 'stormWarps', 'tigersTotal', 'tigersKilled', 'brownoutsSurvived', 'brownoutOpen', 'mothsSeen', 'daughters', 'terraformed', 'sectorsBought', 'glimdustTotal', 'marvels', 'quietHush', 'hushPressureBreaks', 'wispRing', 'councils', 'twinGoods', 'feastGoods', 'crossEggs', 'guildHalls', 'truebloods', 'devUses', 'greatWyrms', 'relicsSold', 'guildWars', 'wyrmDuels', 'relicsAuctioned', 'guildCharters', 'walkerKills', 'walkerLayings', 'healerVisits', 'wardenRounds', 'scholarTrips', 'tamerVisits', 'pilgrimPrayers'] as const) state.stats[k] = state.stats[k] ?? 0;
  state.stats.lastFeastDay = state.stats.lastFeastDay ?? -99;
  state.guilds = state.guilds ?? initGuilds();
  state.guilds.pleasedDays = state.guilds.pleasedDays ?? { carters: 0, alchemists: 0, spirewrights: 0, sextons: 0 };
  state.relics = state.relics ?? initRelics();
  state.relicStock = state.relicStock ?? 0;
  state.guilds.lastWar = state.guilds.lastWar ?? 0;
  state.guilds.charters = state.guilds.charters ?? [];
  for (const b of state.buildings) if (b) { b.work = b.work ?? 0; b.workTotal = b.workTotal ?? 0; }
  state.airship = state.airship ?? { status: 'none', goods: 0, since: -1, tale: 0, voyages: 0 };
  state.fenNex = state.fenNex ?? 0;
  state.scenario = state.scenario ?? 'valley';
  state.faction = state.faction ?? 'vellish';
  state.daughter = state.daughter ?? null;
  state.challenge = state.challenge ?? null;
  state.challengeDay = state.challengeDay ?? -1;
  state.cleanDays = state.cleanDays ?? 0;
  state.storms = state.storms ?? [];
  if (!state.wyrm || typeof state.wyrm !== 'object' || !(state.wyrm as WyrmState).state) state.wyrm = newWyrm(chooseWyrmNode(state.nodes, state.founding));
  // rebuild derived layers
  const n = state.w * state.h;
  for (const s of SERVICE_TYPES as ServiceType[]) state.coverage[s] = new Uint8Array(n);
  state.traffic = new Uint16Array(n);
  state.zoneListDirty = true;
  state.dirtyChunks = new Set();
  markAllDirty(state);
  void U8_FIELDS;
  recomputeAll(state);
  return state;
}
