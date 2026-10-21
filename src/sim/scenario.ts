/** Scenario charters: pre-built maps with a goal and a twist, chosen on the title screen. See DESIGN.md 4.38. */
import type { FactionId } from '../data/factions';
import { Bot } from './bot';
import { createGame, pushMessage } from './world';
import { run, recomputeAll } from './sim';
import { spawnRestless } from './agents';
import { markDirty } from './world';
import { CHALLENGE_DAYS, type GameState, type Scenario } from './types';
import { debtLine } from './economy';

export interface ScenarioDef {
  id: Scenario;
  name: string;
  blurb: string;
  goal: string;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'valley', name: 'The open valley', blurb: 'A river valley with four to six ley nodes and a thin rim of Gloam. The standard Charter.', goal: 'Grow a camp into a Beacon of Eda.' },
  { id: 'onenode', name: 'The one-node valley', blurb: 'The Crown surveyed a single node and nothing else. It runs deep, twice the flow of a common node, but every spire, cistern and ward must drink from it. Mana is the whole game.', goal: 'Reach Burgh (1,000 folk) on one Vein.' },
  { id: 'island', name: 'The Gloam-locked island', blurb: 'Thirty tiles of green in a grey sea. The Gloam presses from every side and there is no road out. Wards are your walls.', goal: 'Reach Township and burn back 300 tiles of Gloam.' },
  { id: 'atoll', name: 'The Patagoi Atoll', blurb: 'Six isles in open water. The great isle holds the Stake; three near isles lie over shallow bars a bridge can cross, two far isles only barges and drakes reach. Land is scarce, and in the Hush the sea-gales close the bridges.', goal: 'Reach Burgh (1,000 folk) with four isles settled.' },
  { id: 'inherited', name: 'The inherited collapse', blurb: 'The last Warden-Reeve fled. You inherit a town a month old: debt, ruins, the dead walking, and the spires howling toward a surge. Stop the bleeding, then build.', goal: 'Treasury positive, no ruins and no restless for ten days running, then Burgh.' },
];

export function scenarioDef(id: Scenario): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/** Create a game for a scenario. The seed and name work as for the open valley. */
export function createScenario(seed: number, name: string, id: Scenario, faction: FactionId = 'vellish'): GameState {
  const s = createGame(seed, name, id, faction);
  if (id === 'inherited') inherit(s);
  if (id === 'island') pushMessage(s, 'The sea of grey is forty tiles off in every direction and closer every week. Ward Lanterns, the Watch and a Hunters\' Lodge before anything else.', 'warn', true);
  if (id === 'atoll') pushMessage(s, 'Six isles in a grey-blue sea, a ley node on each. Bridge the shallow bars to the near isles; the far two wait for barges. Cobble your bridges before the Hush: the gales close the plain ones.', 'warn', true);
  if (id === 'onenode') pushMessage(s, 'One Vein, running deep: twice the flow of a common node, and no other. Every spire you raise drinks from it.', 'warn', true);
  return s;
}

/** Twenty-eight days of a careless bot, then a collapse: debt, ruins, the dead, and an overdraw. */
function inherit(s: GameState): void {
  const bot = new Bot(s, { aggressive: true });
  s.treasury += 20000;
  for (let d = 0; d < 28; d++) {
    run(s, 900);
    bot.step();
    if (s.pendingEvent) s.pendingEvent = null;
  }
  // the collapse
  s.treasury = -7000;
  let ruined = 0;
  for (const b of s.buildings) {
    if (!b || b.state !== 'ok') continue;
    if (ruined >= 8) break;
    if ((b.id * 7919) % 11 === 0 && b.kind !== 'stake') { b.state = 'ruin'; b.stateDays = 0; b.residents = 0; b.workers = 0; markDirty(s, b.x, b.y); ruined++; }
  }
  s.unquieted = 30;
  const f = s.founding;
  for (let k = 0; k < 8; k++) spawnRestless(s, f.x + 4 + (k % 4), f.y + 3 + Math.floor(k / 4));
  s.overdrawDays = 3;
  s.cleanDays = 0;
  s.questsDone = s.questsDone.filter((q) => !q.startsWith('z_'));
  s.messages = [];
  s.chronicle = [];
  recomputeAll(s);
  pushMessage(s, `${s.cityName} is yours by default. The last Warden-Reeve left ${-s.treasury} crowns of debt, ${ruined} ruins, ${s.unquieted} unquieted dead and a surge two days out. Five days below ${Math.round(debtLine(s)).toLocaleString()} ends the Charter.`, 'bad', true);
}

/** The daily challenge: the open valley on a seed made from today's date, the people drawn from it too (only the Vellish since the scope reset); the goal is Market Town by day 60, failed at day 61 and scored. */
export { CHALLENGE_DAYS };
export const CHALLENGE_PEOPLES: FactionId[] = ['vellish'];
export function challengePeople(key: string): FactionId {
  return CHALLENGE_PEOPLES[challengeSeed(key) % CHALLENGE_PEOPLES.length];
}
/** The score: the days to spare and a point a thousand crowns; 0 when the challenge was failed. */
export function challengeScore(s: GameState): number {
  if (s.challengeDay < 0) return 0;
  return Math.max(0, CHALLENGE_DAYS + 1 - s.challengeDay) + Math.round(s.treasury / 1000);
}
export function todayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function challengeSeed(key: string): number {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 1000000;
}
export function createChallenge(name: string, key = todayKey()): GameState {
  const people = challengePeople(key);
  const s = createGame(challengeSeed(key), name, 'valley', people);
  s.challenge = key;
  pushMessage(s, `The daily challenge of ${key}: every Warden-Reeve in Eda plays this valley today, as the ${people[0].toUpperCase() + people.slice(1)}. Reach the fifth milestone by day ${CHALLENGE_DAYS}; the score is the days to spare and a point a thousand crowns.`, 'milestone', true);
  return s;
}

