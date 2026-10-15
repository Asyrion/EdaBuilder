/** The guild council: four guilds that sit at the Guildhall, each with a standing, a boon, a strike and an edict they petition for. See DESIGN.md 4.44. */
import { BUILDING_BY_KEY, isDepot } from './catalog';
import { AgentKind, Zone, type Building, type GameState } from './types';
import type { EventDef } from './events';
import { tradeRoutes } from './trade';
import { MOORINGS } from '../data/factions';
import { canPlaceBuilding, markDirty, placeBuildingRaw, pushMessage } from './world';
import GUILD_TEXT from '../data/content/text/guilds.json';

export type GuildId = 'carters' | 'alchemists' | 'spirewrights' | 'sextons';
export const GUILD_IDS: GuildId[] = ['carters', 'alchemists', 'spirewrights', 'sextons'];

export interface GuildDef {
  id: GuildId;
  name: string;
  seal: string;
  desc: string; // what raises and lowers standing
  edict: string; // the edict they petition for
  boon: string;
  strike: string;
  petition: string; // event text
}

export const GUILDS: Record<GuildId, GuildDef> = {
  carters: {
    id: 'carters', name: GUILD_TEXT.carters.name, seal: GUILD_TEXT.carters.seal,
    desc: GUILD_TEXT.carters.desc,
    edict: 'imports',
    boon: GUILD_TEXT.carters.boon,
    strike: GUILD_TEXT.carters.strike,
    petition: GUILD_TEXT.carters.petition,
  },
  alchemists: {
    id: 'alchemists', name: GUILD_TEXT.alchemists.name, seal: GUILD_TEXT.alchemists.seal,
    desc: GUILD_TEXT.alchemists.desc,
    edict: 'herbgardens',
    boon: GUILD_TEXT.alchemists.boon,
    strike: GUILD_TEXT.alchemists.strike,
    petition: GUILD_TEXT.alchemists.petition,
  },
  spirewrights: {
    id: 'spirewrights', name: GUILD_TEXT.spirewrights.name, seal: GUILD_TEXT.spirewrights.seal,
    desc: GUILD_TEXT.spirewrights.desc,
    edict: 'wardens',
    boon: GUILD_TEXT.spirewrights.boon,
    strike: GUILD_TEXT.spirewrights.strike,
    petition: GUILD_TEXT.spirewrights.petition,
  },
  sextons: {
    id: 'sextons', name: GUILD_TEXT.sextons.name, seal: GUILD_TEXT.sextons.seal,
    desc: GUILD_TEXT.sextons.desc,
    edict: 'rites',
    boon: GUILD_TEXT.sextons.boon,
    strike: GUILD_TEXT.sextons.strike,
    petition: GUILD_TEXT.sextons.petition,
  },
};

export interface GuildState {
  standing: Record<GuildId, number>; // 0..100, 50 is indifferent
  demand: { guild: GuildId; until: number } | null; // a granted petition: keep the edict on until this day
  lastCouncil: number; // day of the last petition
  pleasedDays: Record<GuildId, number>; // days in a row at or above BOON_AT; at HALL_DAYS the guild builds its hall
  lastWar: number; // day of the last brawl between rivals
  brawlDay: number; // the day the last brawl fired, for the sextons who walk to the square (iteration 73)
  charters: GuildId[]; // rival pairs reconciled by charter, keyed by the first of the pair ('carters' | 'alchemists')
}

export const COUNCIL_SPACING = 20;
/** Old grudges: a favoured guild's rival resents it, and a granted petition stings the rival. */
export const RIVAL_OF: Record<GuildId, GuildId> = { carters: 'spirewrights', spirewrights: 'carters', alchemists: 'sextons', sextons: 'alchemists' };
export const RIVALRY_DRIFT = 0.4;
export const RIVALRY_STING = 5;
export const WAR_SPACING = 60;
export const CHARTER_COST = 2000;
/** The first guild of each rival pair names the pair. */
export function pairOf(g: GuildId): GuildId {
  return g === 'carters' || g === 'spirewrights' ? 'carters' : 'alchemists';
}
export function isChartered(s: GameState, g: GuildId): boolean {
  return !!s.guilds?.charters?.includes(pairOf(g));
}
/** A guild charter ends a rivalry for good: 2,000 crowns, both guilds +10, no more drag, sting or brawls. */
export function charterGuilds(s: GameState, g: GuildId): string | null {
  const pair = pairOf(g);
  if (!hasCouncil(s)) return 'No lit Guildhall seats the council';
  if (s.guilds.charters.includes(pair)) return 'This rivalry is already chartered';
  if (s.treasury < CHARTER_COST) return `Needs ${CHARTER_COST} crowns`;
  s.treasury -= CHARTER_COST;
  s.guilds.charters.push(pair);
  const b = RIVAL_OF[pair];
  s.guilds.standing[pair] = Math.min(100, s.guilds.standing[pair] + 10);
  s.guilds.standing[b] = Math.min(100, s.guilds.standing[b] + 10);
  s.stats.guildCharters++;
  pushMessage(s, `${GUILDS[pair].name} and ${GUILDS[b].name} sign a charter at the Guildhall: the old grudge is struck from both their books for ${CHARTER_COST} crowns.`, 'milestone', true);
  return null;
}
export const HALL_DAYS = 10;
/** The hall each guild raises for itself after HALL_DAYS pleased days. */
export const HALL_OF: Record<GuildId, string> = { carters: 'cartersyard', alchemists: 'lyceum', spirewrights: 'wrightslodge', sextons: 'sextonchapel' };
export const BOON_AT = 70;
export const STRIKE_AT = 25;

export function initGuilds(): GuildState {
  return { standing: { carters: 50, alchemists: 50, spirewrights: 50, sextons: 50 }, demand: null, lastCouncil: 0, pleasedDays: { carters: 0, alchemists: 0, spirewrights: 0, sextons: 0 }, lastWar: 0, brawlDay: -1, charters: [] };
}

/** A lit, standing Guildhall seats the council. */
export function hasCouncil(s: GameState): boolean {
  return s.buildings.some((b) => b && b.kind === 'guildhall' && b.state === 'ok' && b.lit);
}

/** +1 while the guild is pleased (boon), -1 while it strikes, else 0. Without a council no guild acts. */
export function guildEffect(s: GameState, g: GuildId): -1 | 0 | 1 {
  if (!s.guilds || !hasCouncil(s)) return 0;
  const st = s.guilds.standing[g];
  return st >= BOON_AT ? 1 : st <= STRIKE_AT ? -1 : 0;
}

export function guildMood(st: number): string {
  return st >= BOON_AT ? 'pleased' : st >= 55 ? 'content' : st > STRIKE_AT ? 'grumbling' : 'on strike';
}

function count(s: GameState, test: (kind: string) => boolean): number {
  let n = 0;
  for (const b of s.buildings) if (b && b.state === 'ok' && test(b.kind)) n++;
  return n;
}

/** What moved each guild's standing today, for the UI and the daily drift. */
export function guildDrivers(s: GameState, g: GuildId): { text: string; value: number }[] {
  const out: { text: string; value: number }[] = [];
  const add = (text: string, value: number) => { if (value) out.push({ text, value }); };
  const on = (k: string) => !!s.edicts[k];
  switch (g) {
    case 'carters': {
      const depots = count(s, (k) => isDepot(k) || (k === 'cartersyard' && hallActive(s, 'cartersyard')));
      add(depots ? 'a Trade Depot' : 'no Trade Depot', depots ? 0.6 : -0.6);
      if (count(s, (k) => MOORINGS.includes(k)) >= 2) add('barges on the river', 0.4);
      const routes = tradeRoutes(s).filter((r) => r.kind !== 'road').length;
      if (routes) add(`${routes} open trade route${routes > 1 ? 's' : ''}`, Math.min(0.9, routes * 0.3));
      let jam = 0, roads = 0;
      for (let i = 0; i < s.road.length; i++) if (s.road[i]) { roads++; if (s.trafficSmooth[i] > 160) jam++; }
      if (roads && jam / roads > 0.08) add('congested roads', -0.7);
      if (on('imports')) add('the Import Edict', 0.3);
      break;
    }
    case 'alchemists': {
      const yards = count(s, (k) => BUILDING_BY_KEY[k].zone === Zone.Craft);
      if (yards >= 5) add(`${yards} Craft yards`, 0.5);
      if (on('herbgardens')) add('the Herb Garden Edict', 0.4);
      if (s.goodsShort > 0) add('markets ran dry', -0.5);
      if (s.stats.feastGoods > 0 && s.day - s.stats.lastFeastDay < 15) add('a feast from their shelves', 0.3);
      break;
    }
    case 'spirewrights': {
      if (count(s, (k) => k === 'nexus') > 0) add('a Ley Nexus', 0.5);
      if (on('wardens')) add('Spire Wardens', 0.3);
      if (s.overdrawDays > 0) add('overdraw', -1);
      if (s.brownout > 0) add('brownout', -0.5);
      break;
    }
    case 'sextons': {
      if (count(s, (k) => k === 'ossuary') > 0) add('an Ossuary', 0.5);
      if (on('rites')) add('the Rite Subsidy', 0.3);
      { const walking = s.agents.filter((a) => a.kind === AgentKind.Restless).length; if (walking > 0) add(`${walking} restless walking`, -Math.min(0.9, 0.15 * walking)); }
      if (s.unquieted > 10) add(`${Math.round(s.unquieted)} dead waiting`, -0.4);
      break;
    }
  }
  if (s.guilds && !isChartered(s, g) && s.guilds.standing[RIVAL_OF[g]] >= BOON_AT) add(`${GUILDS[RIVAL_OF[g]].name} are favoured`, -RIVALRY_DRIFT);
  const d = s.guilds?.demand;
  if (d && d.guild === g && d.until > s.day) add(s.edicts[GUILDS[g].edict] ? 'the granted petition is kept' : 'the granted petition was broken', s.edicts[GUILDS[g].edict] ? 1 : -2);
  return out;
}

/** Daily: standings drift toward 50 and move with the drivers; a petition is called every 20 days from the lowest guild. */
export function dailyGuilds(s: GameState): void {
  if (!s.guilds) s.guilds = initGuilds();
  const gs = s.guilds;
  const council = hasCouncil(s);
  for (const g of GUILD_IDS) {
    let st = gs.standing[g];
    st += (50 - st) * 0.02;
    if (council) for (const d of guildDrivers(s, g)) st += d.value;
    gs.standing[g] = Math.max(0, Math.min(100, st));
  }
  if (gs.demand && gs.demand.until <= s.day) gs.demand = null;
  for (const g of GUILD_IDS) {
    gs.pleasedDays[g] = council && gs.standing[g] >= BOON_AT ? gs.pleasedDays[g] + 1 : 0;
    if (gs.pleasedDays[g] >= HALL_DAYS && !s.buildings.some((b) => b && b.kind === HALL_OF[g])) raiseHall(s, g);
  }
  if (!council || s.pendingEvent || s.gameOver) return;
  // two rivals striking at once brawl on the square
  if (s.day - (gs.lastWar ?? 0) >= WAR_SPACING) {
    for (const a of ['carters', 'alchemists'] as GuildId[]) {
      const b = RIVAL_OF[a];
      if (!gs.charters.includes(a) && gs.standing[a] <= STRIKE_AT && gs.standing[b] <= STRIKE_AT) {
        const def = WAR_EVENTS.find((e) => e.id === `guildwar_${a}`)!;
        s.pendingEvent = { id: def.id, title: def.title, text: def.text, choices: def.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'function' ? c.desc(s) : c.desc })) };
        s.firedEvents.push(`${def.id}:?`);
        gs.lastWar = s.day;
        gs.brawlDay = s.day; // the sextons walk to the square today and tomorrow (iteration 73)
        s.stats.guildWars++;
        return;
      }
    }
  }
  if (s.day - gs.lastCouncil < COUNCIL_SPACING) return;
  let low: GuildId = 'carters';
  for (const g of GUILD_IDS) if (gs.standing[g] < gs.standing[low]) low = g;
  if (gs.standing[low] >= 60 || s.edicts[GUILDS[low].edict]) { gs.lastCouncil = s.day; return; }
  const def = COUNCIL_EVENTS.find((e) => e.id === `council_${low}`)!;
  s.pendingEvent = { id: def.id, title: def.title, text: def.text, choices: def.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'function' ? c.desc(s) : c.desc })) };
  s.firedEvents.push(`${def.id}:?`);
  gs.lastCouncil = s.day;
  s.stats.councils++;
}

/** A guild hall's effect holds while its guild is not striking. */
export function hallActive(s: GameState, kind: string): boolean {
  const g = (Object.keys(HALL_OF) as GuildId[]).find((k) => HALL_OF[k] === kind);
  if (!g || !s.guilds || s.guilds.standing[g] <= STRIKE_AT) return false;
  return s.buildings.some((b) => b && b.kind === kind && b.state === 'ok');
}

/** The guild builds its hall near the Guildhall at its own cost; only road-touching, chartered ground. */
function raiseHall(s: GameState, g: GuildId): void {
  const hall = s.buildings.find((b) => b && b.kind === 'guildhall' && b.state === 'ok');
  if (!hall) return;
  const kind = HALL_OF[g];
  for (let r = 2; r <= 9; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = hall.x + dx;
        const y = hall.y + dy;
        if (canPlaceBuilding(s, kind, x, y)) continue;
        const b = placeBuildingRaw(s, kind, x, y, 1, true);
        s.stats.guildHalls++;
        s.guilds.pleasedDays[g] = 0;
        pushMessage(s, `${GUILDS[g].name} has raised ${BUILDING_BY_KEY[kind].name} at (${x},${y}) at its own cost: ${BUILDING_BY_KEY[kind].desc}`, 'milestone', true, { x: b.x, y: b.y });
        return;
      }
}

function councilEvent(g: GuildDef): EventDef {
  return {
    id: `council_${g.id}`, title: `${g.name} petitions`, text: g.petition, when: () => false,
    choices: [
      { label: 'Grant the petition', desc: `Enact the edict they ask for; standing +15, and +1 a day while it stays on for 20 days (−2 a day if it is turned off). ${GUILDS[RIVAL_OF[g.id]].name} take it ill (−${RIVALRY_STING}).`, apply: (s) => { s.edicts[g.edict] = true; s.edictSince[g.edict] = s.day; s.guilds.standing[g.id] = Math.min(100, s.guilds.standing[g.id] + 15); if (!isChartered(s, g.id)) s.guilds.standing[RIVAL_OF[g.id]] = Math.max(0, s.guilds.standing[RIVAL_OF[g.id]] - RIVALRY_STING); s.guilds.demand = { guild: g.id, until: s.day + 20 }; return `The seal of ${g.seal} is pressed into the edict. The guild drinks the Warden-Reeve's health.`; } },
      { label: 'Pay them off (400 crowns)', desc: 'Standing +8; no edict.', apply: (s) => { s.treasury -= 400; s.guilds.standing[g.id] = Math.min(100, s.guilds.standing[g.id] + 8); return 'The purse changes hands under the table. Nobody writes anything down.'; } },
      { label: 'Refuse', desc: 'Standing −12; happiness −2 for 8 days as the guild grumbles in every tavern.', apply: (s) => { s.guilds.standing[g.id] = Math.max(0, s.guilds.standing[g.id] - 12); s.modifiers.push({ kind: 'happiness', value: -2, until: s.day + 8, label: `${g.name} refused` }); return 'The guildmaster bows a little too low and leaves. The songs that night are not kind.'; } },
    ],
  };
}

function warEvent(a: GuildId): EventDef {
  const b = RIVAL_OF[a];
  const A = GUILDS[a].name;
  const B = GUILDS[b].name;
  const side = (win: GuildId, lose: GuildId) => (s: GameState) => { s.guilds.standing[win] = Math.min(100, s.guilds.standing[win] + 20); s.guilds.standing[lose] = Math.max(0, s.guilds.standing[lose] - 10); return `The Warden-Reeve stands with ${GUILDS[win].name}. ${GUILDS[lose].name} leave the square in silence.`; };
  return {
    id: `guildwar_${a}`, title: `${A} and ${B} brawl`, when: () => false,
    text: `Both guilds have been on strike for days and today it comes to blows on the square: ${a === 'carters' ? 'cart-staves against wardens\' rods, mules loose in the market' : 'stills overturned, salt thrown in the stills, Hollis bleeding from the nose'}. The Watch waits for a word.`,
    choices: [
      { label: `Side with ${A}`, desc: `${A} +20, ${B} −10.`, apply: side(a, b) },
      { label: `Side with ${B}`, desc: `${B} +20, ${A} −10.`, apply: side(b, a) },
      { label: 'Call the Watch (300 crowns)', desc: 'Both guilds +5; happiness −3 for 5 days as the square is cleared with rods.', apply: (s) => { s.treasury -= 300; s.guilds.standing[a] = Math.min(100, s.guilds.standing[a] + 5); s.guilds.standing[b] = Math.min(100, s.guilds.standing[b] + 5); s.modifiers.push({ kind: 'happiness', value: -3, until: s.day + 5, label: 'The Watch cleared the square' }); return 'The Watch wades in. Nobody wins, which both guilds can live with.'; } },
      { label: 'Let them brawl', desc: 'A building by the Guildhall catches fire; happiness −6 for 10 days; neither guild is moved.', apply: (s) => { const hall = s.buildings.find((x) => x && x.kind === 'guildhall'); let burnt: Building | null = null; if (hall) for (const x of s.buildings) { if (x && x.state === 'ok' && BUILDING_BY_KEY[x.kind].category === 'zone' && Math.max(Math.abs(x.x - hall.x), Math.abs(x.y - hall.y)) <= 8) { burnt = x; break; } } if (burnt) { burnt.state = 'burning'; burnt.stateDays = 0; markDirty(s, burnt.x, burnt.y); s.stats.firesTotal++; } s.modifiers.push({ kind: 'happiness', value: -6, until: s.day + 10, label: 'The guild brawl' }); return burnt ? `A lamp goes over in the scuffle: fire at (${burnt.x},${burnt.y}). The guilds stop to watch it burn.` : 'They fight until dark and go home bruised.'; } },
      { label: 'Let the sextons part them', desc: (s) => { const n = sextonsAbroad(s); return n ? `${n} sexton${n === 1 ? '' : 's'} abroad with salt: both guilds +5, the sextons +10, no crowns.` : 'No sexton is abroad: nobody comes, and the guilds are unmoved.'; }, apply: (s) => { const n = sextonsAbroad(s); if (!n) return 'The Watch looks for a sexton and finds the boneyard shut. The brawl runs its course and settles nothing.'; s.guilds.standing[a] = Math.min(100, s.guilds.standing[a] + 5); s.guilds.standing[b] = Math.min(100, s.guilds.standing[b] + 5); s.guilds.standing.sextons = Math.min(100, s.guilds.standing.sextons + 10); return `${n === 1 ? 'A sexton walks' : `${n} sextons walk`} into the square with the salt spoon held up, and nobody will throw a stave past it. Both guilds go home ashamed; the sextons are owed.`; } },
    ],
  };
}

/** Sextons out on the roads: the walkers of the boneyards, ossuaries and chapels (iteration 73). */
export function sextonsAbroad(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Walker && (a.job === 'sexton' || a.job === 'stonesexton')) n++;
  return n;
}
/** The square the brawl is on: the Guildhall. */
export function brawlToday(s: GameState): boolean {
  return s.guilds.brawlDay >= 0 && s.day - s.guilds.brawlDay <= 1;
}

export const WAR_EVENTS: EventDef[] = (['carters', 'alchemists'] as GuildId[]).map(warEvent);
export const COUNCIL_EVENTS: EventDef[] = [...GUILD_IDS.map((g) => councilEvent(GUILDS[g])), ...WAR_EVENTS];
