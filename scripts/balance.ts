/** Headless balance run with the scripted bot. Usage: npx tsx scripts/balance.ts [seed] [days] [treasury] [faction] [null]
 *  `null` draws one extra roll of the main stream on day 10: the run's own yardstick for the noise (DESIGN 4.91, 4.92). */
import { commitRng, createGame, rngOf } from '../src/sim/world';
import { isFordTile, waterCensus } from '../src/sim/water';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY } from '../src/sim/types';
import { computeLedger } from '../src/sim/economy';
import { Bot } from '../src/sim/bot';
import { WILD_SPECIES, quarryOf, wildCensus } from '../src/sim/wild';
import { litShare, milestonesOf, moorings, stoneQuarried, type FactionId } from '../src/data/factions';

const seed = Number(process.argv[2] ?? 42);
const days = Number(process.argv[3] ?? 120);
const faction = (process.argv[5] ?? 'vellish') as FactionId;
const nullRoll = process.argv[6] === 'null';
const state = createGame(seed, 'Botwick', 'valley', faction);
if (process.argv[4] && process.argv[4] !== '-') state.treasury = Number(process.argv[4]);
const bot = new Bot(state);
const t0 = Date.now();
const milestoneDays: number[] = [];
let roadCrowns = 0; // what the Gloam road paid over the run (iteration 61)
run(state, TICKS_PER_DAY * days, {
  onDay: (s) => {
    if (nullRoll && s.day === 10) { const r = rngOf(s); r.next(); commitRng(s, r); }
    bot.step();
    roadCrowns += s.tradeIncomeToday ?? 0;
    while (milestoneDays.length <= s.milestone) milestoneDays.push(s.day);
    if (s.day % 10 === 0) {
      const l = computeLedger(s);
      const bld = s.buildings.filter(Boolean).length;
      console.log(
        `d${String(s.day).padStart(3)} pop ${String(s.population).padStart(5)} jobs ${String(s.jobs).padStart(4)} bld ${String(bld).padStart(4)} $${String(Math.round(s.treasury)).padStart(7)} net ${String(Math.round(l.net)).padStart(5)} chr ${String(Math.round(l.upkeepCharters)).padStart(3)} happy ${s.happiness.toFixed(0).padStart(3)} mana ${String(Math.round(s.manaDemand)).padStart(4)}/${s.manaSupply} bo ${s.brownout.toFixed(2)} dem H${s.demand.hearth.toFixed(1)} M${s.demand.market.toFixed(1)} C${s.demand.craft.toFixed(1)} A${s.demand.arcane.toFixed(1)} edu ${s.educated.toFixed(2)} hp ${s.health.toFixed(2)} unr ${s.unrest.toFixed(2)} unq ${s.unquieted.toFixed(0).padStart(3)} rest ${String(s.agents.filter((a) => a.kind === 2).length).padStart(2)} ag ${String(s.agents.length).padStart(4)} gloam ${String(s.stats.gloamTiles).padStart(4)} ms ${s.milestone} r${bot.radius} mines ${s.buildings.filter((b) => b && b.kind === 'mine').length} arc ${s.buildings.filter((b) => b && b.kind === 'arcane').length} art ${Math.round(s.artifactsSold)} mstock ${s.buildings.filter((b) => b && b.kind === 'mine').map((b) => Math.round(b!.stock)).join('/')} arcFed ${s.buildings.filter((b) => b && b.kind === 'arcane' && b.stock > 0).length} depot ${s.buildings.filter((b) => b && b.kind === 'depot').length} exp ${s.trade.exported} deep ${s.nodes.map((n) => n.depth ?? 0).join('')} ev ${s.firedEvents.length} drg ${s.dragons.length}[${s.dragons.map((d) => `${d.line[0]}${d.stage}${d.role[0]}`).join(',')}] mat s${Math.round(s.materials.scale)}/w${s.materials.wyrmfire.toFixed(1)}/e${Math.round(s.materials.eggshell)}/g${Math.round(s.materials.glimdust)} bouts ${s.stats.boutsWon}/${s.stats.boutsLost} gol ${s.stats.golemsWoken}/${s.stats.golemsBound} dep ${s.departed.length}/${s.stats.dragonsReturned}${faction === 'grimmen' ? ` stone ${stoneQuarried(s)}` : ''}${faction === 'veshari' ? ` moorings ${moorings(s)} barges ${s.stats.bargeTrips}` : ''}${faction === 'tallowkin' ? ` lit ${Math.round(litShare(s) * 100)}% hall ${s.buildings.filter((b) => b && b.kind === 'hallofwicks').length} lamps ${s.stats.lamplighterRounds}` : ''}`,
      );
    }
  },
});
const ms = Date.now() - t0;
console.log(`\n${days} days simulated in ${ms} ms (${(ms / (days * TICKS_PER_DAY)).toFixed(3)} ms/tick)`);
console.log('milestones:', milestoneDays.map((d, i) => `${milestonesOf(state)[i].name}@d${d}`).join(', '));
console.log('gameOver:', state.gameOver, '| fires', state.stats.firesTotal, 'surges', state.stats.surgesTotal, 'restless', state.stats.restlessTotal, 'riots', state.stats.riots, 'stolen', Math.round(state.stats.goodsStolen), 'pelts', state.stats.pelts, '| dragons', state.dragons.length, 'bouts', `${state.stats.boutsWon}/${state.stats.boutsLost}`, 'departed', state.departed.length, 'returned', state.stats.dragonsReturned, 'tideTrips', state.stats.tideTrips, 'wyrmfire', state.materials.wyrmfire.toFixed(1), 'scale', Math.round(state.materials.scale), '| weather r/d/b', `${state.stats.rainDays}/${state.stats.droughtDays}/${state.stats.blizzardDays}`, 'levies', `${state.stats.levies} (${state.stats.levied})`, 'favour', Math.round(state.crownFavour), 'pleadings', state.pleadings, 'loan', state.loan, 'foxAudits', state.stats.foxAudits, 'shrines', state.stats.pilgrimShrines);
console.log('bot:', `tax H${state.taxRates.hearth}/M${state.taxRates.market}/C${state.taxRates.craft}/A${state.taxRates.arcane}`, 'edicts', Object.keys(state.edicts).filter((k) => state.edicts[k]).join(',') || 'none', '| tales', `${bot.tales} (${bot.talesOff0} not choice 0)`, '| loans', bot.loans, 'out', Math.round(state.loan), '| hounds', state.stats.houndsTotal, 'walls', bot.wallArcs, `(${state.wall.reduce((a, v) => a + (v ? 1 : 0), 0)} tiles)`, '| depot', state.buildings.filter((b) => b && b.kind === 'depot').length, `(day ${bot.depotDay})`, 'road crowns', Math.round(roadCrowns), 'exported', state.trade.exported, '| fonts', state.buildings.filter((b) => b && b.kind === 'font').length, 'deep', state.nodes.map((n) => n.depth ?? 0).join(''), '| charter', Object.values(state.districtQuarters).filter(Boolean).length, '| goal', bot.goal ? `${bot.goal.kind}:${bot.goal.key} ${bot.goal.cost}` : 'none', '| dragons', state.dragons.map((d) => `${d.name} ${d.line} s${d.stage} ${d.role}`).join('; ') || 'none', '| halls', ['hallofwicks', 'lantern', 'greatweir', 'underkingseat', 'lanternofwicks'].filter((k) => state.buildings.some((b) => b && b.kind === k)).join(',') || 'none');
{ const c = wildCensus(state); console.log('wild:', WILD_SPECIES.map((sp) => `${sp} ${c[sp].herds}/${Math.round(c[sp].head)}`).join(' '), '| lost', state.stats.herdsLost, 'hunted out', state.stats.herdsHunted, '| taken hides', state.stats.hides, 'meat', state.stats.meat, 'trophies', state.stats.trophies, '| hunt crowns', state.stats.huntCrowns, '| hens', state.stats.hensTaken, '| lodges', state.buildings.filter((b) => b && b.kind === 'hunterslodge').map((b) => quarryOf(b!)).join(',') || 'none', 'quarry changes', bot.quarryChanges, '| meat markets', state.wild.meatAt.length / 2); }
{ const c = waterCensus(state); console.log('water:', `bodies ${c.bodies} (lakes ${c.lakes}) shoals ${Math.round(c.shoal)}/${Math.round(c.cap)} fished out ${c.out}`, '| huts', state.buildings.filter((b) => b && b.kind === 'fishershut').length, 'smokehouses', state.buildings.filter((b) => b && b.kind === 'smokehouse').length, '| caught', state.stats.fishCaught, 'spoiled', state.stats.fishSpoiled, 'smoked', state.stats.fishSmoked, 'fish crowns', state.stats.fishCrowns, '| fish markets', state.water.fishAt.length / 2, '| thatched', state.stats.homesThatched, '| fords', (() => { let n = 0; for (let i = 0; i < state.road.length; i++) if (state.road[i] && isFordTile(state, i)) n++; return n; })(), 'ford days closed', state.stats.fordDaysClosed, '| bot built', bot.fishBuilt, 'cutters', bot.cuttersBuilt, 'weirs', bot.weirsBuilt, 'fords bridged', bot.fordsBridged); }
console.log('tales:', state.firedEvents.join(' ') || 'none');
console.log('last messages:\n' + state.messages.slice(-8).map((m) => `  [${m.kind}] ${m.text}`).join('\n'));
