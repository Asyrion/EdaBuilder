/** Dev tools: commands for playtesting and checking mechanics. Every use is counted, marks the daily result, and writes one Chronicle line. See DESIGN.md 4.55. */
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
import { AgentKind, MAP_H, MAP_W, Terrain, idx, inBounds, type Building, type DragonLine, type GameState } from './types';
import { BUILDING_BY_KEY } from './catalog';
import { forEachBuilding, markAllDirty, markDirty, pushChronicle, pushMessage, districtName } from './world';
import { Zone } from './types';

export interface DevArg { kind: 'select'; options: [string, string][] }
export interface DevCommand {
  id: string;
  group: string;
  name: string;
  desc: string;
  arg?: DevArg;
  /** at = the tile under the camera's centre */
  run: (s: GameState, arg: string, at: { x: number; y: number }) => string;
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
  { id: 'milestone', group: 'Purse', name: 'Next milestone', desc: 'Raises the milestone by one (unlocks follow).', run: (s) => { const MS = milestonesOf(s); s.milestone = Math.min(MS.length - 1, s.milestone + 1); return `Now ${MS[s.milestone].name}.`; } },
  { id: 'population', group: 'Purse', name: 'Fill every home', desc: 'Residents and workers to capacity for one day.', run: (s) => { let n = 0; forEachBuilding(s, (b) => { const d = BUILDING_BY_KEY[b.kind]; if (d.zone === Zone.Hearth && b.state === 'ok') { b.residents = 8 * b.level; n += b.residents; } }); s.population = Math.max(s.population, n); checkMilestones(s); return `${n} folk housed.`; } },
  // time
  { id: 'day', group: 'Time', name: 'Run a day', desc: '900 ticks; the game pauses after.', run: (s) => { run(s, 900); return `Day ${s.day}.`; } },
  { id: 'season', group: 'Time', name: 'Run to the next season', desc: 'Up to 30 days.', run: (s) => { const target = (Math.floor(s.day / 30) + 1) * 30; while (s.day < target && !s.gameOver) { run(s, 900); if (s.pendingEvent) break; } return s.pendingEvent ? `Stopped on day ${s.day}: an event waits.` : `Day ${s.day}, a new season.`; } },
  { id: 'instant', group: 'Time', name: 'Toggle instant build', desc: 'New buildings stand at once while on.', run: () => { construction.instant = !construction.instant; return `Instant build ${construction.instant ? 'on' : 'off'}.`; } },
  { id: 'finish', group: 'Time', name: 'Finish every site', desc: 'All buildings under construction complete now.', run: (s) => { const n = sites(s).length; for (const b of sites(s)) b.work = 0; tickConstruction(s); return `${n} site(s) finished.`; } },
  { id: 'builders', group: 'Time', name: 'Hire builders', desc: "Fills the builders' yard to its cap.", run: (s) => { s.population = Math.max(s.population, 1200); dailyConstruction(s); return `${s.agents.filter((a) => a.kind === AgentKind.Builder).length} builders.`; } },
  // hazards
  { id: 'hounds', group: 'Hazards', name: 'Hound pack here', desc: 'Four Gloam-hounds at the camera centre.', run: (s, _a, at) => { for (let k = 0; k < 4; k++) spawnCreature(s, 'hound', at.x + (k % 2), at.y + (k >> 1)); return 'Howling.'; } },
  { id: 'restless', group: 'Hazards', name: 'Restless here', desc: 'Three of the unquieted dead rise at the camera centre.', run: (s, _a, at) => { let n = 0; for (let k = 0; k < 3; k++) if (spawnRestless(s, at.x + k, at.y)) n++; return `${n} rise.`; } },
  { id: 'tiger', group: 'Hazards', name: 'War-tiger here', desc: 'A tiger of Longwood at the camera centre.', run: (s, _a, at) => { s.agents.push({ id: s.nextAgentId++, kind: AgentKind.Creature, x: at.x + 0.5, y: at.y + 0.5, path: [], pathIdx: 0, speed: 1.9, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, species: 'tiger', anchorId: -1, ax: at.x + 0.5, ay: at.y + 0.5 }); s.stats.tigersTotal++; return 'Striped, silent.'; } },
  { id: 'storm', group: 'Hazards', name: 'Mana-storm here', desc: 'A storm starts at the camera centre.', run: (s, _a, at) => { startStorm(s, at.x, at.y); return 'The sky bruises.'; } },
  { id: 'surge', group: 'Hazards', name: 'Wild surge now', desc: 'The overdraw breaks loose today.', run: (s) => { s.overdrawDays = 6; dailySurge(s); return 'The ley lashes out.'; } },
  { id: 'fire', group: 'Hazards', name: 'Fire in a random home', desc: 'Ignites one lit zone building.', run: (s) => { const list = s.buildings.filter((b) => b && b.state === 'ok' && BUILDING_BY_KEY[b.kind].category === 'zone'); const b = list[Math.floor(list.length / 2)]; return b && igniteBuilding(s, b, 'Dev fire at') ? `Fire at (${b.x},${b.y}).` : 'Nothing to burn.'; } },
  { id: 'gloam', group: 'Hazards', name: 'Gloam pocket here', desc: 'Grey grass in a 7×7 at the camera centre.', run: (s, _a, at) => `${pocket(s, at, 3)} tiles greyed.` },
  { id: 'cleargloam', group: 'Hazards', name: 'Clear all Gloam', desc: 'Every grey tile burned back.', run: (s) => { let n = 0; for (let i = 0; i < s.gloam.length; i++) if (s.gloam[i]) { s.gloam[i] = 0; n++; } recomputeGloamDist(s); markAllDirty(s); return `${n} tiles cleared.`; } },
  { id: 'walker', group: 'Hazards', name: 'Walker here', desc: 'A walker of the chosen job at the camera centre, anchored to the nearest building of its kind (or the Stake). Every job in the walker table is listed.', arg: { kind: 'select', options: Object.values(WALKER_JOBS).map((j) => [j.id, j.name]) }, run: (s, jobId, at) => { const job = WALKER_JOBS[jobId] ?? Object.values(WALKER_JOBS)[0]; let best: Building | null = null; let bd = Infinity; for (const b of s.buildings) { if (!b || b.state !== 'ok' || !(job.from.includes(b.kind) || b.kind === 'stake')) continue; const d = Math.abs(b.x - at.x) + Math.abs(b.y - at.y) + (b.kind === 'stake' ? 50 : 0); if (d < bd) { bd = d; best = b; } } if (!best) return 'No building of that kind and no Stake.'; const rt = s.road[idx(at.x, at.y)] ? idx(at.x, at.y) : roadTileOf(s, best); if (rt < 0) return 'No road here or at the building.'; const w = spawnWalker(s, job, best, rt); return `${w.id}: a ${job.name} from ${BUILDING_BY_KEY[best.kind].name} at (${best.x},${best.y}).`; } },
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
  { id: 'petition', group: 'Guilds & relics', name: 'Petition now', desc: 'The least pleased guild petitions today (needs a lit Guildhall).', run: (s) => { s.guilds.lastCouncil = -99; dailyGuilds(s); return s.pendingEvent ? `${s.pendingEvent.title}.` : 'No petition: no council, or every guild is content.'; } },
  { id: 'relic', group: 'Guilds & relics', name: 'Complete a relic set', desc: 'The chosen set entire.', arg: { kind: 'select', options: RELIC_SETS.map((r) => [r.id, r.name]) }, run: (s, id) => { grantRelicSet(s, id); return `${RELIC_SETS.find((r) => r.id === id)?.name} entire.`; } },
  // events & map
  { id: 'event', group: 'Events & map', name: 'Fire an event', desc: 'Any event or festival by name.', arg: { kind: 'select', options: eventOptions() }, run: (s, id) => { const e = ALL_EVENTS.find((x) => x.id === id); if (!e) return 'Unknown event.'; s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s) })) }; s.firedEvents.push(`${e.id}:?`); return `${e.title}.`; } },
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
