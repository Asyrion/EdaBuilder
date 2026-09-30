/** Headless balance run with the scripted bot. Usage: npx tsx scripts/balance.ts [seed] [days] */
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY } from '../src/sim/types';
import { computeLedger } from '../src/sim/economy';
import { Bot } from '../src/sim/bot';
import { MILESTONES } from '../src/sim/catalog';

const seed = Number(process.argv[2] ?? 42);
const days = Number(process.argv[3] ?? 120);
const state = createGame(seed, 'Botwick');
if (process.argv[4]) state.treasury = Number(process.argv[4]);
const bot = new Bot(state);
const t0 = Date.now();
const milestoneDays: number[] = [];
run(state, TICKS_PER_DAY * days, {
  onDay: (s) => {
    bot.step();
    while (milestoneDays.length <= s.milestone) milestoneDays.push(s.day);
    if (s.day % 10 === 0) {
      const l = computeLedger(s);
      const bld = s.buildings.filter(Boolean).length;
      console.log(
        `d${String(s.day).padStart(3)} pop ${String(s.population).padStart(5)} jobs ${String(s.jobs).padStart(4)} bld ${String(bld).padStart(4)} $${String(Math.round(s.treasury)).padStart(7)} net ${String(Math.round(l.net)).padStart(5)} happy ${s.happiness.toFixed(0).padStart(3)} mana ${String(Math.round(s.manaDemand)).padStart(4)}/${s.manaSupply} bo ${s.brownout.toFixed(2)} dem H${s.demand.hearth.toFixed(1)} M${s.demand.market.toFixed(1)} C${s.demand.craft.toFixed(1)} A${s.demand.arcane.toFixed(1)} edu ${s.educated.toFixed(2)} hp ${s.health.toFixed(2)} unr ${s.unrest.toFixed(2)} unq ${s.unquieted.toFixed(0).padStart(3)} rest ${String(s.agents.filter((a) => a.kind === 2).length).padStart(2)} ag ${String(s.agents.length).padStart(4)} gloam ${String(s.stats.gloamTiles).padStart(4)} ms ${s.milestone} r${bot.radius} mines ${s.buildings.filter((b) => b && b.kind === 'mine').length} arc ${s.buildings.filter((b) => b && b.kind === 'arcane').length} art ${Math.round(s.artifactsSold)} mstock ${s.buildings.filter((b) => b && b.kind === 'mine').map((b) => Math.round(b!.stock)).join('/')} arcFed ${s.buildings.filter((b) => b && b.kind === 'arcane' && b.stock > 0).length}`,
      );
    }
  },
});
const ms = Date.now() - t0;
console.log(`\n${days} days simulated in ${ms} ms (${(ms / (days * TICKS_PER_DAY)).toFixed(3)} ms/tick)`);
console.log('milestones:', milestoneDays.map((d, i) => `${MILESTONES[i].name}@d${d}`).join(', '));
console.log('gameOver:', state.gameOver, '| fires', state.stats.firesTotal, 'surges', state.stats.surgesTotal, 'restless', state.stats.restlessTotal);
console.log('last messages:\n' + state.messages.slice(-8).map((m) => `  [${m.kind}] ${m.text}`).join('\n'));
