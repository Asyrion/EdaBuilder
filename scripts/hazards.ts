/** The hazards table (scope reset phase 2-8): what fire, the wild surge, the restless and the Gloam did to the bot's towns.
 *  Usage: npx tsx scripts/hazards.ts [seeds=42,1,7,13,21,45] [days=150] [draws=2]
 *  One line a run, then the means: fires (spread from a neighbour / lit uncovered), buildings burned down, surges and the
 *  buildings they warped, restless risen and their peak, the peak of the waiting dead, buildings the Gloam took, Gloam
 *  tiles at the end, and the share of zone buildings in a fire hall's reach on the last day. */
import { createGame } from '../src/sim/world';
import { ROLL_DAY, extraRolls } from './rolls';
import { run } from '../src/sim/sim';
import { AgentKind, TICKS_PER_DAY, idx } from '../src/sim/types';
import { Bot } from '../src/sim/bot';
import { BUILDING_BY_KEY } from '../src/sim/catalog';

const seeds = (process.argv[2] ?? '42,1,7,13,21,45').split(',').map(Number);
const days = Number(process.argv[3] ?? 150);
const draws = Number(process.argv[4] ?? 2);

const cols = ['seed', 'draw', 'folk', 'fires', 'spread', 'uncov', 'burned', 'surges', 'warped', 'restless', 'restPeak', 'deadPeak', 'gloamTook', 'gloam', 'fireReach'] as const;
type Row = Record<(typeof cols)[number], number>;
const rows: Row[] = [];
for (const seed of seeds)
  for (let draw = 0; draw < draws; draw++) {
    const state = createGame(seed, 'Botwick', 'vellish');
    const bot = new Bot(state);
    let restPeak = 0;
    let deadPeak = 0;
    run(state, TICKS_PER_DAY * days, {
      onDay: (s) => {
        if (s.day === ROLL_DAY) extraRolls(s, draw);
        bot.step();
        let r = 0;
        for (const a of s.agents) if (a.kind === AgentKind.Restless) r++;
        restPeak = Math.max(restPeak, r);
        deadPeak = Math.max(deadPeak, s.waitingDead);
      },
    });
    let zoned = 0;
    let reached = 0;
    for (const b of state.buildings) {
      if (!b || b.state !== 'ok' || BUILDING_BY_KEY[b.kind].category !== 'zone') continue;
      zoned++;
      if (state.coverage.fire[idx(b.x, b.y)] > 0) reached++;
    }
    const st = state.stats;
    const row: Row = {
      seed, draw, folk: state.population, fires: st.firesTotal, spread: st.firesSpread, uncov: st.firesUncovered, burned: st.burnedDown,
      surges: st.surgesTotal, warped: st.surgeRuined, restless: st.restlessTotal, restPeak, deadPeak: Math.round(deadPeak),
      gloamTook: st.gloamTaken, gloam: st.gloamTiles, fireReach: zoned ? Math.round((100 * reached) / zoned) : 0,
    };
    rows.push(row);
    console.log(cols.map((c) => `${c} ${row[c]}`).join(' · ') + (state.gameOver ? ` · LOST (${state.lostTo})` : ''));
  }
console.log('\n| ' + cols.join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + cols.map((c) => r[c]).join(' | ') + ' |');
const mean = (c: (typeof cols)[number]) => Math.round(rows.reduce((a, r) => a + r[c], 0) / rows.length);
console.log('| **mean** | | ' + cols.slice(2).map(mean).join(' | ') + ' |');
