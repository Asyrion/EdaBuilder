/** Dev tools: commands for playtesting and checking mechanics. Every use is counted, marks the daily result, and writes one Chronicle line. See DESIGN.md 4.55. */
import { milestonesOf } from '../data/factions';
import { QUARTERS, QUARTER_BY_ID, setQuarter, type QuarterId } from './districts';
import { RELIC_SETS, grantRelicSet } from './relics';
import { construction, dailyConstruction, sites, tickConstruction } from './construction';
import { dailySurge, igniteBuilding, recomputeGloamDist } from './hazards';
import { roadTileOf, spawnRestless } from './agents';
import { checkMilestones } from './economy';
import { run } from './sim';
import { AgentKind, DAYS_PER_SEASON, MAP_H, MAP_W, SEASON_NAMES, TICKS_PER_DAY, Terrain, idx, inBounds, type Building, type GameState } from './types';
import { questsFor } from './quests';
import { QUESTS } from '../data/quests';
import { BUILDING_BY_KEY } from './catalog';
import { forEachBuilding, markAllDirty, markDirty, pushChronicle, pushMessage, districtName, seasonOf } from './world';
import { Zone } from './types';

/** A command's argument: a list to pick from (its options may follow the state: the open quests), or a number (iteration 55). */
export type DevArg =
  | { kind: 'select'; options: [string, string][] | ((s: GameState) => [string, string][]) }
  | { kind: 'number'; min: number; max: number; value: number | ((s: GameState) => number) };
export interface DevCommand {
  id: string;
  group: string;
  name: string;
  desc: string;
  arg?: DevArg;
  /** a second argument; the panel passes both as `first:second` */
  arg2?: DevArg;
  /** at = the tile under the camera's centre */
  run: (s: GameState, arg: string, at: { x: number; y: number }) => string;
}
export function devOptions(a: Extract<DevArg, { kind: 'select' }>, s: GameState): [string, string][] {
  return typeof a.options === 'function' ? a.options(s) : a.options;
}
export function devNumber(a: Extract<DevArg, { kind: 'number' }>, s: GameState): number {
  return typeof a.value === 'function' ? a.value(s) : a.value;
}
/** The argument the panel would pass untouched: the first option or the number's default, joined for two. */
export function devDefaultArg(c: DevCommand, s: GameState): string {
  const one = (a?: DevArg) => (!a ? '' : a.kind === 'select' ? devOptions(a, s)[0]?.[0] ?? '' : String(devNumber(a, s)));
  return c.arg2 ? `${one(c.arg)}:${one(c.arg2)}` : one(c.arg);
}


function pocket(s: GameState, at: { x: number; y: number }, r: number): number {
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = at.x + dx; const y = at.y + dy;
    if (!inBounds(x, y)) continue;
    const i = idx(x, y);
    const t = s.terrain[i];
    if (s.bIndex[i] >= 0 || s.road[i] || t === Terrain.Water || t === Terrain.DeepWater || t === Terrain.LeyNode) continue;
    if (!s.gloam[i]) { s.gloam[i] = 1; n++; markDirty(s, x, y); }
  }
  recomputeGloamDist(s);
  return n;
}

export const DEV_COMMANDS: DevCommand[] = [
  // purse
  { id: 'crowns', group: 'Purse', name: '+10,000 crowns', desc: 'Into the treasury.', run: (s) => { s.treasury += 10000; return 'The Crown sends a chest.'; } },
  { id: 'lamplight', group: 'Purse', name: "The lamplighters' round", desc: 'Every standing home, shop and works relit by candle for three days (the Tallowkin way).', run: (s) => { let n = 0; for (const b of s.buildings) if (b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone') { b.relit = s.day + 3; b.lit = true; n++; } return `${n} candles lit for three days.`; } },
  { id: 'milestone', group: 'Purse', name: 'Next milestone', desc: 'Raises the milestone by one (unlocks follow).', run: (s) => { const MS = milestonesOf(s); s.milestone = Math.min(MS.length - 1, s.milestone + 1); return `Now ${MS[s.milestone].name}.`; } },
  { id: 'population', group: 'Purse', name: 'Fill every home', desc: 'Residents and workers to capacity for one day.', run: (s) => { let n = 0; forEachBuilding(s, (b) => { const d = BUILDING_BY_KEY[b.kind]; if (d.zone === Zone.Hearth && b.state === 'ok') { b.residents = 8 * b.level; n += b.residents; } }); s.population = Math.max(s.population, n); checkMilestones(s); return `${n} folk housed.`; } },
  // time
  { id: 'day', group: 'Time', name: 'Run a day', desc: '900 ticks; the game pauses after.', run: (s) => { run(s, 900); return `Day ${s.day}.`; } },
  { id: 'season', group: 'Time', name: 'Run to the next season', desc: 'Up to 30 days.', run: (s) => { const target = (Math.floor(s.day / 30) + 1) * 30; while (s.day < target && !s.gameOver) run(s, 900); return `Day ${s.day}, a new season.`; } },
  { id: 'instant', group: 'Time', name: 'Toggle instant build', desc: 'New buildings stand at once while on.', run: () => { construction.instant = !construction.instant; return `Instant build ${construction.instant ? 'on' : 'off'}.`; } },
  { id: 'finish', group: 'Time', name: 'Finish every site', desc: 'All buildings under construction complete now.', run: (s) => { const n = sites(s).length; for (const b of sites(s)) b.work = 0; tickConstruction(s); return `${n} site(s) finished.`; } },
  { id: 'setday', group: 'Time', name: 'Jump to day', desc: 'Forward only, up to a year: the calendar and the season move to that day; nothing grows, burns or is levied in between.', arg: { kind: 'number', min: 1, max: 9999, value: (s) => s.day + 30 }, run: (s, a) => {
    const target = Math.floor(Number(a));
    if (!Number.isFinite(target) || target <= s.day) return `Only forward: today is day ${s.day}.`;
    if (target > s.day + 360) return 'At most a year ahead.';
    const season0 = Math.floor(s.day / DAYS_PER_SEASON);
    s.tick = target * TICKS_PER_DAY + (s.tick % TICKS_PER_DAY);
    s.day = target;
    if (Math.floor(target / DAYS_PER_SEASON) !== season0) s.stats.hushPressureBreaks = 0;
    markAllDirty(s);
    return `Day ${target}, ${SEASON_NAMES[seasonOf(s)]}.`;
  } },
  { id: 'builders', group: 'Time', name: 'Hire builders', desc: "Fills the builders' yard to its cap.", run: (s) => { s.population = Math.max(s.population, 1200); dailyConstruction(s); return `${s.agents.filter((a) => a.kind === AgentKind.Builder).length} builders.`; } },
  // hazards
  { id: 'restless', group: 'Hazards', name: 'Restless here', desc: 'Three of the unquieted dead rise at the camera centre.', run: (s, _a, at) => { let n = 0; for (let k = 0; k < 3; k++) if (spawnRestless(s, at.x + k, at.y)) n++; return `${n} rise.`; } },
  { id: 'surge', group: 'Hazards', name: 'Wild surge now', desc: 'The overdraw breaks loose today.', run: (s) => { s.overdrawDays = 6; dailySurge(s); return 'The ley lashes out.'; } },
  { id: 'fire', group: 'Hazards', name: 'Fire in a random home', desc: 'Ignites one lit zone building.', run: (s) => { const list = s.buildings.filter((b) => b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone'); const b = list[Math.floor(list.length / 2)]; return b && igniteBuilding(s, b, 'Dev fire at') ? `Fire at (${b.x},${b.y}).` : 'Nothing to burn.'; } },
  { id: 'gloam', group: 'Hazards', name: 'Gloam pocket here', desc: 'Grey grass in a 7×7 at the camera centre.', run: (s, _a, at) => `${pocket(s, at, 3)} tiles greyed.` },
  { id: 'cleargloam', group: 'Hazards', name: 'Clear all Gloam', desc: 'Every grey tile burned back.', run: (s) => { let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i]) { s.gloam[i] = 0; n++; } recomputeGloamDist(s); markAllDirty(s); return `${n} tiles cleared.`; } },
  { id: 'gale', group: 'Hazards', name: 'Blow a sea-gale', desc: 'For three days, in any charter: the barges stay in port and every plain Track bridge over water is under the surf (Cobble holds, and a Quay or a Weir within six tiles holds the bridges round it).', run: (s) => {
    s.modifiers.push({ kind: 'gale', value: 1, until: s.day + 3, label: 'Dev: a sea-gale' });
    return 'A sea-gale blows for three days.';
  } },
  { id: 'unquieted', group: 'Hazards', name: '+20 unquieted dead', desc: 'Pressure rises; the restless may walk.', run: (s) => { s.unquieted += 20; return `${Math.round(s.unquieted)} unquieted.`; } },
  // guilds & relics
  { id: 'standing', group: 'The Crown & relics', name: 'Set a standing', desc: "The Crown's favour, 0 to 100 (50 is indifferent; under 20 the Crown withholds the next grant).", arg: { kind: 'select', options: [['crown', "The Crown's favour"]] }, arg2: { kind: 'number', min: 0, max: 100, value: 80 }, run: (s, a) => {
    const [who, v] = a.split(':');
    const val = Math.max(0, Math.min(100, Math.round(Number(v ?? 80))));
    if (!Number.isFinite(val)) return 'A number from 0 to 100.';
    if (who !== 'crown') return 'No such standing.';
    s.crownFavour = val;
    return `The Crown's favour: ${val}.`;
  } },
  { id: 'relic', group: 'The Crown & relics', name: 'Complete a relic set', desc: 'The chosen set entire.', arg: { kind: 'select', options: RELIC_SETS.map((r) => [r.id, r.name]) }, run: (s, id) => { grantRelicSet(s, id); return `${RELIC_SETS.find((r) => r.id === id)?.name} entire.`; } },
  // events & map
  { id: 'quest', group: 'Tasks & map', name: 'Complete a task', desc: "One of this people's open Charter tasks, done now with its reward, as if its goal were met.", arg: { kind: 'select', options: (s) => { const done = new Set(s.questsDone); const open = questsFor(s).filter((q) => !done.has(q.id)).map((q) => [q.id, `${q.chapter}: ${q.title}`] as [string, string]); return open.length ? open : [['', 'every task is done']]; } }, run: (s, id) => {
    const q = QUESTS.find((x) => x.id === id);
    if (!q) return 'No such task.';
    if (!questsFor(s).includes(q)) return 'That task belongs to another people.';
    if (s.questsDone.includes(q.id)) return 'Already done.';
    s.questsDone.push(q.id);
    if (q.reward > 0) s.treasury += q.reward;
    if (q.id === 'z_daily') s.challengeDay = s.day;
    pushMessage(s, `Charter task done: ${q.title}${q.reward ? ` (+${q.reward} crowns)` : ''}.`, 'good', true);
    return `${q.title} done.`;
  } },
  { id: 'forget', group: 'Tasks & map', name: 'Reset the history', desc: 'The ledger history or the Chronicle (the dev-tools line stays). The dev count never resets.', arg: { kind: 'select', options: [['ledger', 'The ledger history'], ['chronicle', 'The Chronicle']] }, run: (s, what) => {
    if (what === 'ledger') { s.ledgerHistory = []; return 'The ledger history is blank.'; }
    s.chronicle = s.chronicle.filter((c) => c.text.includes('dev tools'));
    return 'The Chronicle is blank but for the dev mark.';
  } },
  { id: 'charter', group: 'Tasks & map', name: 'Charter the whole map', desc: 'Every sector bought.', run: (s) => { s.sectors.fill(1); markAllDirty(s); return 'Sixteen sectors.'; } },
  { id: 'quarter', group: 'Tasks & map', name: 'Charter the district here', desc: 'Gives the district under the camera centre the chosen charter (paint one first).', arg: { kind: 'select', options: QUARTERS.map((q) => [q.id, q.name]) }, run: (s, q, at) => { const d = s.district[idx(at.x, at.y)]; if (!d) return 'No district here.'; const why = setQuarter(s, d, q as QuarterId); return why ?? `${districtName(s, d)} is a ${QUARTER_BY_ID[q as QuarterId].name}.`; } },
  { id: 'flatten', group: 'Tasks & map', name: 'Flatten here', desc: 'Grass in a 21×21 at the camera centre (water and nodes kept).', run: (s, _a, at) => { let n = 0; for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const x = at.x + dx; const y = at.y + dy; if (!inBounds(x, y)) continue; const i = idx(x, y); const t = s.terrain[i]; if (t === Terrain.Forest || t === Terrain.Hills || t === Terrain.Meadow) { s.terrain[i] = Terrain.Grass; n++; markDirty(s, x, y); } } return `${n} tiles flattened.`; } },
];

export const DEV_GROUPS = [...new Set(DEV_COMMANDS.map((c) => c.group))];

/** Run a command; counts the use and writes one Chronicle line the first time. */
export function runDev(s: GameState, id: string, arg: string, at: { x: number; y: number }): string {
  const c = DEV_COMMANDS.find((x) => x.id === id);
  if (!c) return 'Unknown command';
  if (!s.stats.devUses) pushChronicle(s, "The Warden-Reeve's hand reached into the ley: dev tools were used in this charter.", 'warn');
  s.stats.devUses++;
  const out = c.run(s, arg, { x: Math.max(0, Math.min(MAP_W - 1, at.x)), y: Math.max(0, Math.min(MAP_H - 1, at.y)) });
  pushMessage(s, `Dev: ${c.name}. ${out}`, 'info');
  return out;
}
