/** Headless balance run with the scripted bot. Usage: npx tsx scripts/balance.ts [seed] [days] [treasury] [faction] [roll=N|null]
 *  `roll=N` draws N extra rolls of the main stream on day 10 (`null` is roll=1): the seed's draws, the noise a change must clear
 *  (DESIGN 4.91–4.93). The valley only: the other scenarios are parked (scope reset phase 1c).
 *  The last line, `json: {…}`, is what scripts/table.ts reads. */
import { createGame } from '../src/sim/world';
import { ROLL_DAY, extraRolls, rollsOf } from './rolls';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY } from '../src/sim/types';
import { computeLedger } from '../src/sim/economy';
import { Bot } from '../src/sim/bot';
import { milestonesOf, type FactionId } from '../src/data/factions';

const seed = Number(process.argv[2] ?? 42);
const days = Number(process.argv[3] ?? 120);
const faction = (process.argv[5] ?? 'vellish') as FactionId;
const rolls = rollsOf(process.argv[6]);
const state = createGame(seed, 'Botwick', faction);
if (process.argv[4] && process.argv[4] !== '-') state.treasury = Number(process.argv[4]);
const bot = new Bot(state);
const t0 = Date.now();
const milestoneDays: number[] = [];
let roadCrowns = 0; // what the Gloam road paid over the run (iteration 61)
run(state, TICKS_PER_DAY * days, {
  onDay: (s) => {
    if (s.day === ROLL_DAY) extraRolls(s, rolls);
    bot.step();
    roadCrowns += s.tradeIncomeToday ?? 0;
    while (milestoneDays.length <= s.milestone) milestoneDays.push(s.day);
    if (s.day % 10 === 0) {
      const l = computeLedger(s);
      const bld = s.buildings.filter(Boolean).length;
      console.log(
        `d${String(s.day).padStart(3)} pop ${String(s.population).padStart(5)} jobs ${String(s.jobs).padStart(4)} bld ${String(bld).padStart(4)} $${String(Math.round(s.treasury)).padStart(7)} net ${String(Math.round(l.net)).padStart(5)} chr ${String(Math.round(l.upkeepCharters)).padStart(3)} happy ${s.happiness.toFixed(0).padStart(3)} mana ${String(Math.round(s.manaDemand)).padStart(4)}/${s.manaSupply} bo ${s.brownout.toFixed(2)} dem H${s.demand.hearth.toFixed(1)} M${s.demand.market.toFixed(1)} C${s.demand.craft.toFixed(1)} A${s.demand.arcane.toFixed(1)} edu ${s.educated.toFixed(2)} hp ${s.health.toFixed(2)} unr ${s.unrest.toFixed(2)} unq ${s.unquieted.toFixed(0).padStart(3)} rest ${String(s.agents.filter((a) => a.kind === 2).length).padStart(2)} ag ${String(s.agents.length).padStart(4)} gloam ${String(s.stats.gloamTiles).padStart(4)} ms ${s.milestone} r${bot.radius} mines ${s.buildings.filter((b) => b && b.kind === 'mine').length} arc ${s.buildings.filter((b) => b && b.kind === 'arcane').length} art ${Math.round(s.artifactsSold)} mstock ${s.buildings.filter((b) => b && b.kind === 'mine').map((b) => Math.round(b!.stock)).join('/')} arcFed ${s.buildings.filter((b) => b && b.kind === 'arcane' && b.stock > 0).length} depot ${s.buildings.filter((b) => b && b.kind === 'depot').length} exp ${s.trade.exported} deep ${s.nodes.map((n) => n.depth ?? 0).join('')}`,
      );
    }
  },
});
const ms = Date.now() - t0;
console.log(`\n${days} days simulated in ${ms} ms (${(ms / (days * TICKS_PER_DAY)).toFixed(3)} ms/tick)`);
console.log('milestones:', milestoneDays.map((d, i) => `${milestonesOf(state)[i].name}@d${d}`).join(', '));
console.log('gameOver:', state.gameOver, '| fires', state.stats.firesTotal, 'surges', state.stats.surgesTotal, 'restless', state.stats.restlessTotal, 'stolen', Math.round(state.stats.goodsStolen), 'levies', `${state.stats.levies} (${state.stats.levied})`, 'favour', Math.round(state.crownFavour), 'loan', state.loan);
console.log('bot:', `tax H${state.taxRates.hearth}/M${state.taxRates.market}/C${state.taxRates.craft}/A${state.taxRates.arcane}`, 'edicts', Object.keys(state.edicts).filter((k) => state.edicts[k]).join(',') || 'none', '| loans', bot.loans, 'out', Math.round(state.loan), '| depot', state.buildings.filter((b) => b && b.kind === 'depot').length, `(day ${bot.depotDay})`, 'road crowns', Math.round(roadCrowns), 'exported', state.trade.exported, '| fonts', state.buildings.filter((b) => b && b.kind === 'font').length, 'deep', state.nodes.map((n) => n.depth ?? 0).join(''), '| charter', Object.values(state.districtQuarters).filter(Boolean).length, '| goal', bot.goal ? `${bot.goal.kind}:${bot.goal.key} ${bot.goal.cost}` : 'none', '| halls', ['lantern'].filter((k) => state.buildings.some((b) => b && b.kind === k)).join(',') || 'none');
console.log('last messages:\n' + state.messages.slice(-8).map((m) => `  [${m.kind}] ${m.text}`).join('\n'));
// the machine line: scripts/table.ts reads this and nothing above it
console.log('json: ' + JSON.stringify({
  seed, people: faction, rolls, days, folk: state.population, milestone: state.milestone,
  gates: milestoneDays.map((d, i) => ({ name: milestonesOf(state)[i].name, day: d })),
  treasury: Math.round(state.treasury), loan: Math.round(state.loan), depotDay: bot.depotDay, roadCrowns: Math.round(roadCrowns), caravanCrowns: (state.stats as Record<string, number>).caravanCrowns ?? 0, gameOver: !!state.gameOver, // caravanCrowns: 0 since the caravan is parked (scope reset 1c); a ref before it still reports its own
}));
