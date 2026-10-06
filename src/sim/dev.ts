/** Dev tools: commands for playtesting and checking mechanics. Every use is counted, marks the daily result, and writes one Chronicle line. See DESIGN.md 4.55. */
import { lairFor } from './marshwyrms';
import { ALL_EVENTS, descOf } from './events';
import { milestonesOf } from '../data/factions';
import { ASPECTS } from './weave';
import { QUARTERS, QUARTER_BY_ID, setQuarter, type QuarterId } from './districts';
import { LINE_INFO, addEgg, STAGE_NAMES, stageCap } from './wyrmcraft';
import { GUILDS, GUILD_IDS, dailyGuilds, type GuildId } from './guilds';
import { RELIC_SETS, grantRelicSet } from './relics';
import { construction, dailyConstruction, sites, tickConstruction } from './construction';
import { dailySurge, igniteBuilding, recomputeGloamDist } from './hazards';
import { spawnCreature } from './creatures';
import { roadTileOf, spawnRestless } from './agents';
import { WALKER_JOBS, spawnWalker } from './walkers';
import { startStorm } from './lore';
import { wake, startFlyover } from './wyrm';
import { checkMilestones } from './economy';
import { run } from './sim';
import { AgentKind, DAYS_PER_SEASON, MAP_H, MAP_W, SEASON_NAMES, TICKS_PER_DAY, Terrain, idx, inBounds, type Building, type DragonLine, type GameState } from './types';
import { flooding, weatherAt } from './weave';
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

const eventOptions = (): [string, string][] => ALL_EVENTS.map((e) => [e.id, `${e.title} (${e.id})`] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]));

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
  { id: 'materials', group: 'Purse', name: '+10 of every rare good', desc: 'Scale, wyrmfire, eggshell, rayscale, glim-dust.', run: (s) => { for (const k of Object.keys(s.materials) as (keyof typeof s.materials)[]) s.materials[k] += 10; return 'The vaults fill.'; } },
  { id: 'lamplight', group: 'Purse', name: "The lamplighters' round", desc: 'Every standing home, shop and works relit by candle for three days (the Tallowkin way).', run: (s) => { let n = 0; for (const b of s.buildings) if (b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone') { b.relit = s.day + 3; b.lit = true; n++; } return `${n} candles lit for three days.`; } },
  { id: 'milestone', group: 'Purse', name: 'Next milestone', desc: 'Raises the milestone by one (unlocks follow).', run: (s) => { const MS = milestonesOf(s); s.milestone = Math.min(MS.length - 1, s.milestone + 1); return `Now ${MS[s.milestone].name}.`; } },
  { id: 'population', group: 'Purse', name: 'Fill every home', desc: 'Residents and workers to capacity for one day.', run: (s) => { let n = 0; forEachBuilding(s, (b) => { const d = BUILDING_BY_KEY[b.kind]; if (d.zone === Zone.Hearth && b.state === 'ok') { b.residents = 8 * b.level; n += b.residents; } }); s.population = Math.max(s.population, n); checkMilestones(s); return `${n} folk housed.`; } },
  // time
  { id: 'day', group: 'Time', name: 'Run a day', desc: '900 ticks; the game pauses after.', run: (s) => { run(s, 900); return `Day ${s.day}.`; } },
  { id: 'season', group: 'Time', name: 'Run to the next season', desc: 'Up to 30 days.', run: (s) => { const target = (Math.floor(s.day / 30) + 1) * 30; while (s.day < target && !s.gameOver) { run(s, 900); if (s.pendingEvent) break; } return s.pendingEvent ? `Stopped on day ${s.day}: an event waits.` : `Day ${s.day}, a new season.`; } },
  { id: 'instant', group: 'Time', name: 'Toggle instant build', desc: 'New buildings stand at once while on.', run: () => { construction.instant = !construction.instant; return `Instant build ${construction.instant ? 'on' : 'off'}.`; } },
  { id: 'finish', group: 'Time', name: 'Finish every site', desc: 'All buildings under construction complete now.', run: (s) => { const n = sites(s).length; for (const b of sites(s)) b.work = 0; tickConstruction(s); return `${n} site(s) finished.`; } },
  { id: 'setday', group: 'Time', name: 'Jump to day', desc: 'Forward only, up to a year: the calendar, the season and the weather move to that day; nothing grows, burns or is levied in between.', arg: { kind: 'number', min: 1, max: 9999, value: (s) => s.day + 30 }, run: (s, a) => {
    const target = Math.floor(Number(a));
    if (!Number.isFinite(target) || target <= s.day) return `Only forward: today is day ${s.day}.`;
    if (target > s.day + 360) return 'At most a year ahead.';
    const season0 = Math.floor(s.day / DAYS_PER_SEASON);
    s.tick = target * TICKS_PER_DAY + (s.tick % TICKS_PER_DAY);
    s.day = target;
    s.weather = weatherAt(s, target);
    if (Math.floor(target / DAYS_PER_SEASON) !== season0) { s.stats.floodDays = 0; s.stats.hushPressureBreaks = 0; }
    markAllDirty(s);
    return `Day ${target}, ${SEASON_NAMES[seasonOf(s)]}${s.weather ? `, ${s.weather.kind}` : ''}.`;
  } },
  { id: 'builders', group: 'Time', name: 'Hire builders', desc: "Fills the builders' yard to its cap.", run: (s) => { s.population = Math.max(s.population, 1200); dailyConstruction(s); return `${s.agents.filter((a) => a.kind === AgentKind.Builder).length} builders.`; } },
  // hazards
  { id: 'hounds', group: 'Hazards', name: 'Hound pack here', desc: 'Four Gloam-hounds at the camera centre.', run: (s, _a, at) => { for (let k = 0; k < 4; k++) spawnCreature(s, 'hound', at.x + (k % 2), at.y + (k >> 1)); return 'Howling.'; } },
  { id: 'restless', group: 'Hazards', name: 'Restless here', desc: 'Three of the unquieted dead rise at the camera centre.', run: (s, _a, at) => { let n = 0; for (let k = 0; k < 3; k++) if (spawnRestless(s, at.x + k, at.y)) n++; return `${n} rise.`; } },
  { id: 'marshwyrm', group: 'Hazards', name: 'Marsh-wyrm here', desc: 'A marsh-wyrm at the camera centre lairs under the nearest bridge (in any season, until Ember).', run: (s, _a, at) => { const w = { id: 900 + (s.marshWyrms?.length ?? 0), x: at.x, y: at.y, lair: -1, nest: -1 }; const i = lairFor(s, w); if (i < 0) return 'No bridge in reach.'; w.lair = i; w.x = i % s.w; w.y = (i / s.w) | 0; (s.marshWyrms ??= []).push(w); s.stats.wyrmsLaired = (s.stats.wyrmsLaired ?? 0) + 1; return 'Something long moves under the planks.'; } },
  { id: 'tiger', group: 'Hazards', name: 'War-tiger here', desc: 'A tiger of Longwood at the camera centre.', run: (s, _a, at) => { s.agents.push({ id: s.nextAgentId++, kind: AgentKind.Creature, x: at.x + 0.5, y: at.y + 0.5, path: [], pathIdx: 0, speed: 1.9, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, species: 'tiger', anchorId: -1, ax: at.x + 0.5, ay: at.y + 0.5 }); s.stats.tigersTotal++; return 'Striped, silent.'; } },
  { id: 'storm', group: 'Hazards', name: 'Mana-storm here', desc: 'A storm starts at the camera centre.', run: (s, _a, at) => { startStorm(s, at.x, at.y); return 'The sky bruises.'; } },
  { id: 'surge', group: 'Hazards', name: 'Wild surge now', desc: 'The overdraw breaks loose today.', run: (s) => { s.overdrawDays = 6; dailySurge(s); return 'The ley lashes out.'; } },
  { id: 'fire', group: 'Hazards', name: 'Fire in a random home', desc: 'Ignites one lit zone building.', run: (s) => { const list = s.buildings.filter((b) => b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone'); const b = list[Math.floor(list.length / 2)]; return b && igniteBuilding(s, b, 'Dev fire at') ? `Fire at (${b.x},${b.y}).` : 'Nothing to burn.'; } },
  { id: 'gloam', group: 'Hazards', name: 'Gloam pocket here', desc: 'Grey grass in a 7×7 at the camera centre.', run: (s, _a, at) => `${pocket(s, at, 3)} tiles greyed.` },
  { id: 'cleargloam', group: 'Hazards', name: 'Clear all Gloam', desc: 'Every grey tile burned back.', run: (s) => { let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i]) { s.gloam[i] = 0; n++; } recomputeGloamDist(s); markAllDirty(s); return `${n} tiles cleared.`; } },
  { id: 'walker', group: 'Hazards', name: 'Walker here', desc: 'A walker of the chosen job at the camera centre, anchored to the nearest building of its kind (or the Stake). Every job in the walker table is listed.', arg: { kind: 'select', options: Object.values(WALKER_JOBS).map((j) => [j.id, j.name]) }, run: (s, jobId, at) => { const job = WALKER_JOBS[jobId] ?? Object.values(WALKER_JOBS)[0]; let best: Building | null = null; let bd = Infinity; for (const b of s.buildings) { if (!b || b.state !== 'ok' || !(job.from.includes(b.kind) || b.kind === 'stake')) continue; const d = Math.abs(b.x - at.x) + Math.abs(b.y - at.y) + (b.kind === 'stake' ? 50 : 0); if (d < bd) { bd = d; best = b; } } if (!best) return 'No building of that kind and no Stake.'; const rt = s.road[idx(at.x, at.y)] ? idx(at.x, at.y) : roadTileOf(s, best); if (rt < 0) return 'No road here or at the building.'; const w = spawnWalker(s, job, best, rt); return `${w.id}: a ${job.name} from ${BUILDING_BY_KEY[best.kind].name} at (${best.x},${best.y}).`; } },
  { id: 'river', group: 'Hazards', name: 'Flood or freeze the river', desc: 'For ten days, whatever the season or the people: a flood takes heart from the bank homes and fouls their wells (a Great Weir still holds it); a freeze slows the mills and stops the barges.', arg: { kind: 'select', options: [['flood', 'Flood'], ['freeze', 'Freeze']] }, run: (s, a) => {
    const kind = a === 'freeze' ? 'freeze' : 'flood';
    s.modifiers.push({ kind, value: 1, until: s.day + 10, label: kind === 'flood' ? 'Dev: the river in flood' : 'Dev: the river frozen' });
    return kind === 'flood' ? (flooding(s) ? 'The river rises over the bank for ten days.' : 'The river rises, and the Great Weir holds it.') : 'The river freezes for ten days.';
  } },
  { id: 'unquieted', group: 'Hazards', name: '+20 unquieted dead', desc: 'Pressure rises; the restless may walk.', run: (s) => { s.unquieted += 20; return `${Math.round(s.unquieted)} unquieted.`; } },
  // wyrms
  { id: 'egg', group: 'Wyrms', name: 'Lay an egg', desc: 'Of the chosen line, in a free cradle.', arg: { kind: 'select', options: ASPECTS.concat(['fen' as DragonLine]).map((l) => [l, LINE_INFO[l].name]) }, run: (s, line) => { const d = addEgg(s, line as DragonLine); return d ? `${d.name} laid.` : 'No free cradle.'; } },
  { id: 'grow', group: 'Wyrms', name: 'Grow every dragon a stage', desc: 'Eggs hatch, hatchlings become drakes, drakes wyverns where the line allows.', run: (s) => { let n = 0; for (const d of s.dragons) { const cap = stageCap(d); if (d.stage < cap) { d.stage = (d.stage + 1) as typeof d.stage; d.days = 0; n++; } } return `${n} grew; ${s.dragons.map((d) => `${d.name} ${STAGE_NAMES[d.stage]}`).join(', ') || 'no dragons'}.`; } },
  { id: 'content', group: 'Wyrms', name: 'Dragons content', desc: 'Mood 100 and fed.', run: (s) => { for (const d of s.dragons) { d.mood = 100; d.hungry = 0; } return `${s.dragons.length} dragons purr.`; } },
  { id: 'wake', group: 'Wyrms', name: 'Wake the Vein-Wyrm', desc: 'If one sleeps on the map.', run: (s) => { if (s.wyrm.state === 'sleeping') { wake(s, 'the dev bell'); return 'It wakes.'; } return `The wyrm is ${s.wyrm.state}.`; } },
  { id: 'flyover', group: 'Wyrms', name: 'Wyrm flyover', desc: 'A hostile pass over the city.', run: (s) => { if (s.wyrm.state === 'awake' || s.wyrm.state === 'bound') { startFlyover(s, true); return 'Wings over the valley.'; } return `The wyrm is ${s.wyrm.state}.`; } },
  // guilds & relics
  { id: 'guildup', group: 'Guilds & relics', name: 'Guild +25', desc: 'Standing of the chosen guild.', arg: { kind: 'select', options: GUILD_IDS.map((g) => [g, GUILDS[g].name]) }, run: (s, g) => { s.guilds.standing[g as GuildId] = Math.min(100, s.guilds.standing[g as GuildId] + 25); return `${GUILDS[g as GuildId].name}: ${Math.round(s.guilds.standing[g as GuildId])}.`; } },
  { id: 'guilddown', group: 'Guilds & relics', name: 'Guild −25', desc: 'Standing of the chosen guild.', arg: { kind: 'select', options: GUILD_IDS.map((g) => [g, GUILDS[g].name]) }, run: (s, g) => { s.guilds.standing[g as GuildId] = Math.max(0, s.guilds.standing[g as GuildId] - 25); return `${GUILDS[g as GuildId].name}: ${Math.round(s.guilds.standing[g as GuildId])}.`; } },
  { id: 'standing', group: 'Guilds & relics', name: 'Set a standing', desc: "A guild's standing or the Crown's favour, 0 to 100 (50 is indifferent; under 20 the Crown withholds the next grant).", arg: { kind: 'select', options: [...GUILD_IDS.map((g) => [g, GUILDS[g].name] as [string, string]), ['crown', "The Crown's favour"]] }, arg2: { kind: 'number', min: 0, max: 100, value: 80 }, run: (s, a) => {
    const [who, v] = a.split(':');
    const val = Math.max(0, Math.min(100, Math.round(Number(v ?? 80))));
    if (!Number.isFinite(val)) return 'A number from 0 to 100.';
    if (who === 'crown') { s.crownFavour = val; return `The Crown's favour: ${val}.`; }
    if (!(GUILD_IDS as string[]).includes(who)) return 'No such guild.';
    s.guilds.standing[who as GuildId] = val;
    return `${GUILDS[who as GuildId].name}: ${val}.`;
  } },
  { id: 'petition', group: 'Guilds & relics', name: 'Petition now', desc: 'The least pleased guild petitions today (needs a lit Guildhall).', run: (s) => { s.guilds.lastCouncil = -99; dailyGuilds(s); return s.pendingEvent ? `${s.pendingEvent.title}.` : 'No petition: no council, or every guild is content.'; } },
  { id: 'relic', group: 'Guilds & relics', name: 'Complete a relic set', desc: 'The chosen set entire.', arg: { kind: 'select', options: RELIC_SETS.map((r) => [r.id, r.name]) }, run: (s, id) => { grantRelicSet(s, id); return `${RELIC_SETS.find((r) => r.id === id)?.name} entire.`; } },
  // events & map
  { id: 'event', group: 'Events & map', name: 'Fire an event', desc: 'Any event or festival by name.', arg: { kind: 'select', options: eventOptions() }, run: (s, id) => { const e = ALL_EVENTS.find((x) => x.id === id); if (!e) return 'Unknown event.'; s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) }; s.firedEvents.push(`${e.id}:?`); return `${e.title}.`; } },
  { id: 'quest', group: 'Events & map', name: 'Complete a task', desc: "One of this people's open Charter tasks, done now with its reward, as if its goal were met.", arg: { kind: 'select', options: (s) => { const done = new Set(s.questsDone); const open = questsFor(s).filter((q) => !done.has(q.id)).map((q) => [q.id, `${q.chapter}: ${q.title}`] as [string, string]); return open.length ? open : [['', 'every task is done']]; } }, run: (s, id) => {
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
  { id: 'forget', group: 'Events & map', name: 'Reset the history', desc: 'The tales (the storyteller forgets every tale but the ones that unlock a building, and may tell any again), the ledger history, or the Chronicle (the dev-tools line stays). The dev count never resets.', arg: { kind: 'select', options: [['tales', 'The tales'], ['ledger', 'The ledger history'], ['chronicle', 'The Chronicle']] }, run: (s, what) => {
    if (what === 'ledger') { s.ledgerHistory = []; return 'The ledger history is blank.'; }
    if (what === 'chronicle') { s.chronicle = s.chronicle.filter((c) => c.text.includes('dev tools')); return 'The Chronicle is blank but for the dev mark.'; }
    const before = s.firedEvents.length;
    s.firedEvents = s.firedEvents.filter((f) => f.startsWith('stormcaller:') || f.startsWith('vigil')); // the Storm Peak and the Hall of Wicks stay unlocked
    s.lastEventDay = -30;
    s.lastBadDay = -30;
    return `${before - s.firedEvents.length} tales forgotten.`;
  } },
  { id: 'charter', group: 'Events & map', name: 'Charter the whole map', desc: 'Every sector bought.', run: (s) => { s.sectors.fill(1); markAllDirty(s); return 'Sixteen sectors.'; } },
  { id: 'quarter', group: 'Events & map', name: 'Charter the district here', desc: 'Gives the district under the camera centre the chosen charter (paint one first).', arg: { kind: 'select', options: QUARTERS.map((q) => [q.id, q.name]) }, run: (s, q, at) => { const d = s.district[idx(at.x, at.y)]; if (!d) return 'No district here.'; const why = setQuarter(s, d, q as QuarterId); return why ?? `${districtName(s, d)} is a ${QUARTER_BY_ID[q as QuarterId].name}.`; } },
  { id: 'flatten', group: 'Events & map', name: 'Flatten here', desc: 'Grass in a 21×21 at the camera centre (water and nodes kept).', run: (s, _a, at) => { let n = 0; for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const x = at.x + dx; const y = at.y + dy; if (!inBounds(x, y)) continue; const i = idx(x, y); const t = s.terrain[i]; if (t === Terrain.Forest || t === Terrain.Hills || t === Terrain.Meadow) { s.terrain[i] = Terrain.Grass; n++; markDirty(s, x, y); } } return `${n} tiles flattened.`; } },
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
