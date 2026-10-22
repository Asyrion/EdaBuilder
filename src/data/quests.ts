/** The Charter's Ledger: guided goals for every mechanic. See DESIGN.md 4.27. */
import { AgentKind, Zone, type GameState } from '../sim/types';
import { canBuild, milestonesOf, nextGate } from './factions';
import { BUILDING_BY_KEY } from '../sim/catalog';
import { factionKey, type FactionId } from './factions';
import { debtLine } from '../sim/economy';
import QUEST_TEXT from './content/text/quests.json';

export type Focus =
  | { tool: 'road' | 'zoneHearth' | 'zoneMarket' | 'zoneCraft' | 'zoneArcane' | 'district' }
  | { build: string }
  | { panel: 'edicts' | 'budget' | 'views' | 'chronicle' }
  | { overlay: string }
  | { center: 'founding' | 'gloam' | 'node' | 'ruins' | 'cart' };

export interface QuestDef {
  id: string;
  chapter: string;
  title: string;
  hint: string;
  when: (s: GameState) => boolean;
  done: (s: GameState) => boolean;
  focus?: Focus;
  reward: number; // crowns
  priority: number; // lower first
  people?: FactionId; // a people's own chapter: shown and paid for that people only (none since the scope reset, phase 1a)
  strict?: boolean; // completes only while `when` holds (the scenarios' goals used it; parked, scope reset phase 1c)
  /** What the task still needs, read from the city (iteration 93): shown under the hint in the Ledger. See questStatus. */
  status?: (s: GameState) => string;
}

/** Counts this people's building for a Vellish key (a Seep for 'well'), so the Charter's goals read for every people. */
const has = (s: GameState, kind0: string, n = 1) => { const kind = factionKey(s, kind0); return s.buildings.filter((b) => b && b.kind === kind && b.state !== 'ruin' && b.state !== 'building').length >= n; };
const zoned = (s: GameState, z: Zone, n: number) => { let c = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === z) c++; return c >= n; };
const roads = (s: GameState) => { let c = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i]) c++; return c; };
const zoneBuildings = (s: GameState, z?: Zone) => s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok' && (z === undefined || BUILDING_BY_KEY[b.kind].zone === z)) as NonNullable<GameState['buildings'][number]>[];
const unlit = (s: GameState) => zoneBuildings(s).filter((b) => !b.lit).length;
const dry = (s: GameState) => zoneBuildings(s).filter((b) => !b.watered).length;
const districts = (s: GameState) => { for (let i = 0; i < s.district.length; i++) if (s.district[i]) return true; return false; };

export const QUESTS: QuestDef[] = [
  // Founding
  { id: 'f_road', chapter: QUEST_TEXT.f_road.chapter, title: QUEST_TEXT.f_road.title, hint: QUEST_TEXT.f_road.hint, when: () => true, done: (s) => roads(s) > 8, focus: { tool: 'road' }, reward: 0, priority: 1 },
  { id: 'f_hearth', chapter: QUEST_TEXT.f_hearth.chapter, title: QUEST_TEXT.f_hearth.title, hint: QUEST_TEXT.f_hearth.hint, when: (s) => roads(s) > 8, done: (s) => zoned(s, Zone.Hearth, 6), focus: { tool: 'zoneHearth' }, reward: 0, priority: 2 },
  { id: 'f_jobs', chapter: QUEST_TEXT.f_jobs.chapter, title: QUEST_TEXT.f_jobs.title, hint: QUEST_TEXT.f_jobs.hint, when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => zoned(s, Zone.Craft, 3) && zoned(s, Zone.Market, 2), focus: { tool: 'zoneCraft' }, reward: 0, priority: 3 },
  { id: 'f_spire', chapter: QUEST_TEXT.f_spire.chapter, title: QUEST_TEXT.f_spire.title, hint: QUEST_TEXT.f_spire.hint, when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => has(s, 'spire'), focus: { build: 'spire' }, reward: 0, priority: 4 },
  { id: 'f_well', chapter: QUEST_TEXT.f_well.chapter, title: QUEST_TEXT.f_well.title, hint: QUEST_TEXT.f_well.hint, when: (s) => zoned(s, Zone.Hearth, 6), done: (s) => has(s, 'well'), focus: { build: 'well' }, reward: 0, priority: 5 },
  { id: 'f_watch', chapter: QUEST_TEXT.f_watch.chapter, title: QUEST_TEXT.f_watch.title, hint: QUEST_TEXT.f_watch.hint, when: (s) => s.population > 15, done: (s) => has(s, 'watchpost') && has(s, 'shrine'), focus: { build: 'watchpost' }, reward: 300, priority: 6 },
  { id: 'f_sector', chapter: QUEST_TEXT.f_sector.chapter, title: QUEST_TEXT.f_sector.title, hint: QUEST_TEXT.f_sector.hint, when: (s) => s.milestone >= 1 && s.sectors.some((v) => !v), done: (s) => s.stats.sectorsBought > 0, reward: 500, priority: 9 },
  { id: 'f_hamlet', chapter: QUEST_TEXT.f_hamlet.chapter, title: QUEST_TEXT.f_hamlet.title, hint: QUEST_TEXT.f_hamlet.hint, when: (s) => s.population > 15, done: (s) => s.milestone >= 1, reward: 0, priority: 7 },
  // Mana
  { id: 'l_nexus', chapter: QUEST_TEXT.l_nexus.chapter, title: QUEST_TEXT.l_nexus.title, hint: QUEST_TEXT.l_nexus.hint, when: (s) => s.milestone >= 4, done: (s) => has(s, 'nexus'), focus: { build: 'nexus' }, reward: 800, priority: 30 },
  // The dead
  { id: 'd_boneyard', chapter: QUEST_TEXT.d_boneyard.chapter, title: QUEST_TEXT.d_boneyard.title, hint: QUEST_TEXT.d_boneyard.hint, when: (s) => s.milestone >= 1, done: (s) => has(s, 'boneyard'), focus: { build: 'boneyard' }, reward: 400, priority: 8 },
  // The grey edge
  { id: 'g_ward', chapter: QUEST_TEXT.g_ward.chapter, title: QUEST_TEXT.g_ward.title, hint: QUEST_TEXT.g_ward.hint, when: (s) => s.milestone >= 2, done: (s) => has(s, 'wardlantern'), focus: { build: 'wardlantern' }, reward: 500, priority: 13 },
  // Goods
  { id: 'o_depot', chapter: QUEST_TEXT.o_depot.chapter, title: QUEST_TEXT.o_depot.title, hint: QUEST_TEXT.o_depot.hint, when: (s) => s.milestone >= 3, done: (s) => has(s, 'depot'), focus: { build: 'depot' }, reward: 700, priority: 20 },
  // Schooling and the arcane
  { id: 'a_academy', chapter: QUEST_TEXT.a_academy.chapter, title: QUEST_TEXT.a_academy.title, hint: QUEST_TEXT.a_academy.hint, when: (s) => s.milestone >= 3, done: (s) => s.educated >= 0.3, focus: { build: 'academy' }, reward: 800, priority: 22 },
  // Districts
  { id: 'x_charter', chapter: QUEST_TEXT.x_charter.chapter, title: QUEST_TEXT.x_charter.title, hint: QUEST_TEXT.x_charter.hint, when: (s) => districts(s), done: (s) => Object.values(s.districtQuarters).some(Boolean), focus: { panel: 'edicts' }, reward: 400, priority: 27 },
  // The Crown
  { id: 'c_thorp', chapter: QUEST_TEXT.c_thorp.chapter, title: QUEST_TEXT.c_thorp.title, hint: QUEST_TEXT.c_thorp.hint, when: (s) => s.milestone === 1, done: (s) => s.milestone >= 2, reward: 0, priority: 60 },
  { id: 'c_village', chapter: QUEST_TEXT.c_village.chapter, title: QUEST_TEXT.c_village.title, hint: QUEST_TEXT.c_village.hint, when: (s) => s.milestone === 2, done: (s) => s.milestone >= 3, reward: 0, priority: 61 },
  { id: 'c_township', chapter: QUEST_TEXT.c_township.chapter, title: QUEST_TEXT.c_township.title, hint: QUEST_TEXT.c_township.hint, when: (s) => s.milestone === 3, done: (s) => s.milestone >= 4, reward: 0, priority: 62 },
  { id: 'c_market', chapter: QUEST_TEXT.c_market.chapter, title: QUEST_TEXT.c_market.title, hint: QUEST_TEXT.c_market.hint, when: (s) => s.milestone === 4, done: (s) => s.milestone >= 5, reward: 0, priority: 63 },
  { id: 'c_burgh', chapter: QUEST_TEXT.c_burgh.chapter, title: QUEST_TEXT.c_burgh.title, hint: QUEST_TEXT.c_burgh.hint, when: (s) => s.milestone === 5, done: (s) => s.milestone >= 6, reward: 0, priority: 64 },
  { id: 'c_free', chapter: QUEST_TEXT.c_free.chapter, title: QUEST_TEXT.c_free.title, hint: QUEST_TEXT.c_free.hint, when: (s) => s.milestone === 6, done: (s) => s.milestone >= 7, reward: 0, priority: 65 },
  { id: 'c_beacon', chapter: QUEST_TEXT.c_beacon.chapter, title: QUEST_TEXT.c_beacon.title, hint: QUEST_TEXT.c_beacon.hint, when: (s) => s.milestone === 7, done: (s) => s.milestone >= 8, reward: 0, priority: 66 },
];

/** The advisor: one line about the city's worst current problem, or null. */
export function advise(s: GameState): { text: string; focus?: Focus } | null {
  const zb = zoneBuildings(s);
  if (zb.length < 4) return null;
  const u = unlit(s);
  const d = dry(s);
  if (s.overdrawDays > 0) return { text: 'Mana overdrawn: a wild surge is coming. Build a Nexus or Thrum Font, or cut consumers.', focus: { build: 'nexus' } };
  if (s.treasury < 0) return { text: `The treasury is in debt, and a debt costs a crown in a hundred a day. Raise the tithe a little or cut upkeep; five days below ${Math.round(debtLine(s)).toLocaleString()} ends the Charter. The Budget panel offers the Crown's loan.`, focus: { panel: 'budget' } };
  if (u > zb.length * 0.25) return { text: `${u} buildings have no mana. Chain Ley Spires within 6 tiles of a node or another lit spire.`, focus: { overlay: 'mana' } };
  if (d > zb.length * 0.25) return { text: `${d} buildings are dry. Dig Wells or a Cistern near them.`, focus: { overlay: 'water' } };
  if (s.unquieted > 12 && !has(s, 'boneyard')) return { text: 'The dead are piling up unquieted. Build a Boneyard before they rise.', focus: { build: 'boneyard' } };
  if (s.agents.filter((a) => a.kind === AgentKind.Restless).length > 5) return { text: 'The restless walk. Watch coverage and wards lay them down.', focus: { overlay: 'watch' } };
  if (s.goodsShort > Math.max(3, zoneBuildings(s, Zone.Market).length * 0.4)) return { text: 'Markets are running dry. Zone Craft works with a road to them, or import through a Trade Depot.', focus: { overlay: 'goods' } };
  if (s.gloamPressure >= 0.65) return { text: 'The Gloam is hungry: unquieted dead and the restless feed it. Quiet the dead (Boneyard, Ossuary) and spread Shrines of Aume.', focus: { build: 'boneyard' } };
  if (s.unrest > 0.35) return { text: 'Unrest is high. More Watch coverage, lower taxes, or a Night Curfew edict.', focus: { panel: 'edicts' } };
  if (s.happiness < 40) return { text: 'Folk are unhappy. Check the Happiness view (4) for the worst streets.', focus: { overlay: 'happiness' } };
  const gloamNear = zb.some((b) => s.gloamDist[b.y * s.w + b.x] < 6);
  if (gloamNear && !has(s, 'wardlantern')) return { text: 'The Gloam whispers at your buildings. Raise a Ward Lantern near the grey.', focus: { build: 'wardlantern' } };
  return null;
}

// ---- What a task still needs (iteration 93, DESIGN 4.124) ----
// The hint says once what to do; the status line says, every time the Ledger is drawn, what is missing now: a building not
// yet raised, still rising, unlit or in ruins, or a counter against its target. Computed from the city, so it stays in code
// beside the condition it mirrors.

const n0 = (v: number) => Math.floor(v).toLocaleString();
const of = (have: number, need: number, what: string) => `${n0(Math.min(have, need))} of ${n0(need)} ${what}.`;
const zonedCount = (s: GameState, z: Zone) => { let c = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === z) c++; return c; };

/** A building task's line: not built (or still locked), being built, burning, in ruins, built but unlit, or built. */
export function buildStatus(s: GameState, key0: string, n = 1, showMe = true): string {
  const key = factionKey(s, key0);
  const def = BUILDING_BY_KEY[key];
  if (!def) return '';
  const all = s.buildings.filter((b) => b && b.kind === key) as NonNullable<GameState['buildings'][number]>[];
  const standing = all.filter((b) => b.state !== 'ruin' && b.state !== 'building');
  const count = n > 1 ? ` (${Math.min(standing.length, n)} of ${n})` : '';
  if (standing.length >= n) {
    if (def.needsMana && !standing.some((b) => b.lit)) return `Built, but unlit: the ${def.name} needs mana. Chain a Ley Spire within reach of it (Mana view, 1).`;
    if (standing.some((b) => b.state === 'burning')) return `The ${def.name} is burning: a Fire Watch in reach puts it out.`;
    return `Built${count}.`;
  }
  const site = all.find((b) => b.state === 'building');
  if (site) {
    const pct = site.workTotal ? Math.round(100 * (1 - site.work / site.workTotal)) : 0;
    return `${standing.length ? `${standing.length} of ${n} standing; the next is being built` : 'Being built'}: ${Math.max(0, Math.min(99, pct))} %. Builders walk from the Founding Stake by road.`;
  }
  if (all.some((b) => b.state === 'ruin')) return `The ${def.name} lies in ruins: bulldoze it and build again.`;
  if (!canBuild(s, key)) {
    const MS = milestonesOf(s);
    return def.unlock > s.milestone && MS[def.unlock] ? `Not built yet: the ${def.name} unlocks at ${MS[def.unlock].name}.` : `Not built yet: the ${def.name} cannot be raised yet (its card in the build menu says why).`;
  }
  return showMe ? `Not built yet${count}: pick the ${def.name} with Show me and place it.` : `Not built yet${count}: the ${def.name} is in the build menu.`;
}

const anyOf = (s: GameState, keys: string[]) => keys.some((k) => has(s, k));

const STATUS: Record<string, (s: GameState) => string> = {
  f_road: (s) => of(roads(s), 9, 'road tiles'),
  f_hearth: (s) => of(zonedCount(s, Zone.Hearth), 6, 'Hearth tiles zoned'),
  f_jobs: (s) => `Craft ${n0(Math.min(zonedCount(s, Zone.Craft), 3))} of 3 tiles, Market ${n0(Math.min(zonedCount(s, Zone.Market), 2))} of 2 tiles zoned.`,
  f_watch: (s) => `Watch Post: ${buildStatus(s, 'watchpost')} Shrine: ${buildStatus(s, 'shrine', 1, false)}`,
  f_hamlet: (s) => `${n0(s.population)} folk. Next: ${nextGate(s) ?? 'the last gate is reached'}.`,
  f_sector: () => 'No sector bought yet: click the dimmed land beyond the Charter line.',
  a_academy: (s) => `${anyOf(s, ['academy', 'grandacademy']) ? '' : `${buildStatus(s, 'academy')} `}${Math.floor(s.educated * 100)} % of the folk educated, of 30 %.`,
  x_charter: () => 'No charter yet: open the Edicts panel and charter the district.',
};
for (const id of ['c_thorp', 'c_village', 'c_township', 'c_market', 'c_burgh', 'c_free', 'c_beacon']) STATUS[id] = (s) => `${n0(s.population)} folk. Next: ${nextGate(s) ?? 'every gate is reached'}.`;

/** "Build X" tasks whose goal is more than that building standing: their line must not say "Built." while they are open.
 *  A test holds this list to the conditions (a plain `has(s, key)` done is the generic case). */
export const NOT_PLAIN_BUILD = new Set(['f_watch', 'a_academy']);

/** The task's status line: its own, else the generic one for a "build X" task whose goal is that building; else none. */
export function questStatus(s: GameState, q: QuestDef): string | null {
  const own = q.status ?? STATUS[q.id];
  if (own) return own(s) || null;
  if (q.focus && 'build' in q.focus && !NOT_PLAIN_BUILD.has(q.id)) return buildStatus(s, q.focus.build) || null;
  return null;
}
