/** Quest census (iteration 92): which Charter tasks a bot game completes. Usage: npx tsx scripts/questCensus.ts seed days faction scenario
 *  Prints one json line: the quests done with their day, and the ones never done (with whether `when` ever held). */
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY, type Scenario } from '../src/sim/types';
import { Bot } from '../src/sim/bot';
import { questsFor } from '../src/sim/quests';
import type { FactionId } from '../src/data/factions';

const seed = Number(process.argv[2] ?? 42);
const days = Number(process.argv[3] ?? 150);
const faction = (process.argv[4] ?? 'vellish') as FactionId;
const scenario = (process.argv[5] ?? 'valley') as Scenario;
const state = createGame(seed, 'Botwick', scenario, faction);
const bot = new Bot(state);
const doneDay: Record<string, number> = {};
const opened = new Set<string>();
run(state, TICKS_PER_DAY * days, {
  onDay: (s) => {
    bot.step();
    for (const q of questsFor(s)) if (!opened.has(q.id) && q.when(s)) opened.add(q.id);
    for (const id of s.questsDone) if (doneDay[id] === undefined) doneDay[id] = s.day;
  },
});
const never = questsFor(state).filter((q) => !state.questsDone.includes(q.id)).map((q) => ({ id: q.id, opened: opened.has(q.id) }));
console.log('json: ' + JSON.stringify({ seed, faction, scenario, days, folk: state.population, milestone: state.milestone, done: doneDay, never }));
