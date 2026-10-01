/** Scenario charters: pre-built maps with a goal and a twist, chosen on the title screen. See DESIGN.md 4.38. */
import { Bot } from './bot';
import { createGame, pushMessage } from './world';
import { run, recomputeAll } from './sim';
import { spawnRestless } from './agents';
import { markDirty } from './world';
import { type GameState, type Scenario } from './types';

export interface ScenarioDef {
  id: Scenario;
  name: string;
  blurb: string;
  goal: string;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'valley', name: 'The open valley', blurb: 'A river valley with four to six ley nodes and a thin rim of Gloam. The standard Charter.', goal: 'Grow a camp into a Beacon of Eda.' },
  { id: 'onenode', name: 'The one-node valley', blurb: 'The Crown surveyed a single node and nothing else. It runs deep, twice the flow of a common node, but every spire, cistern and ward must drink from it. Mana is the whole game.', goal: 'Reach Burgh (1,000 folk) on one Vein.' },
  { id: 'island', name: 'The Gloam-locked island', blurb: 'Thirty tiles of green in a grey sea. The Gloam presses from every side, the hounds come early, and there is no road out. Wards are your walls.', goal: 'Reach Township and burn back 300 tiles of Gloam.' },
  { id: 'inherited', name: 'The inherited collapse', blurb: 'The last Warden-Reeve fled. You inherit a town a month old: debt, ruins, the dead walking, and the spires howling toward a surge. Stop the bleeding, then build.', goal: 'Treasury positive, no ruins and no restless for ten days running, then Burgh.' },
];

export function scenarioDef(id: Scenario): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/** Create a game for a scenario. The seed and name work as for the open valley. */
export function createScenario(seed: number, name: string, id: Scenario): GameState {
  const s = createGame(seed, name, id);
  if (id === 'inherited') inherit(s);
  if (id === 'island') pushMessage(s, 'The sea of grey is forty tiles off in every direction and closer every week. Ward Lanterns, the Watch and a Hunters\' Lodge before anything else.', 'warn', true);
  if (id === 'onenode') pushMessage(s, 'One Vein, running deep: twice the flow of a common node, and no other. Every spire you raise drinks from it.', 'warn', true);
  return s;
}

/** Forty days of a careless bot, then a collapse: debt, ruins, the dead, and an overdraw. */
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
  pushMessage(s, `${s.cityName} is yours by default. The last Warden-Reeve left ${-s.treasury} crowns of debt, ${ruined} ruins, ${s.unquieted} unquieted dead and a surge two days out. Five days below −8,000 ends the Charter.`, 'bad', true);
}

/** Days in a row the inherited city has been clean (positive treasury, no ruins, no restless). */
export function inheritedClean(s: GameState): boolean {
  return s.treasury > 0 && !s.buildings.some((b) => b && b.state === 'ruin') && !s.agents.some((a) => a.kind === 2);
}
