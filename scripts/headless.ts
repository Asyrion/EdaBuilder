/** Headless balance run: builds a plausible town with scripted actions and prints stats over time. */
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, Zone, TICKS_PER_DAY } from '../src/sim/types';
import { computeLedger } from '../src/sim/economy';

const seed = Number(process.argv[2] ?? 42);
const days = Number(process.argv[3] ?? 120);
const state = createGame(seed, 'Testwick');
const f = state.founding;
const sx = f.x + 2;
const sy = f.y + 1; // road stub row

function grid(cx: number, cy: number) {
  // a small grid of roads: 3 horizontal streets, 4 vertical
  for (let k = 0; k < 4; k++) buildRoad(state, RoadType.Track, roadPath(cx - 12, cy + k * 5, cx + 12, cy + k * 5, false));
  for (let k = 0; k < 4; k++) buildRoad(state, RoadType.Track, roadPath(cx - 12 + k * 8, cy, cx - 12 + k * 8, cy + 15, true));
  paintZone(state, Zone.Hearth, cx - 11, cy + 1, cx + 11, cy + 4);
  paintZone(state, Zone.Market, cx - 11, cy + 6, cx + 11, cy + 7);
  paintZone(state, Zone.Hearth, cx - 11, cy + 8, cx + 11, cy + 9);
  paintZone(state, Zone.Craft, cx - 11, cy + 11, cx + 11, cy + 14);
}
grid(sx, sy);
placeBuilding(state, 'well', sx - 12, sy - 1);
placeBuilding(state, 'well', sx + 12, sy - 1);
placeBuilding(state, 'well', sx + 1, sy + 9);
placeBuilding(state, 'well', sx - 7, sy + 4);
placeBuilding(state, 'well', sx + 9, sy + 6);
function place(key: string, x: number, y: number) {
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const r = placeBuilding(state, key, x + dx, y + dy);
    if (r.ok) return true;
  }
  console.log('failed to place', key, x, y, placeBuilding(state, key, x, y).reason);
  return false;
}
place('spire', sx + 4, sy + 1);
place('spire', sx - 4, sy + 1);
place('spire', sx - 3, sy + 6);
place('spire', sx + 3, sy + 6);
place('spire', sx + 3, sy + 11);
place('spire', sx - 3, sy + 11);
placeBuilding(state, 'watchpost', sx, sy - 1);
placeBuilding(state, 'shrine', sx + 8, sy - 1);

const log: string[] = [];
let built = new Set<string>();
run(state, TICKS_PER_DAY * days, {
  onDay: (s) => {
    // scripted player: buy things as unlocked
    const tryBuy = (key: string, x: number, y: number) => {
      if (built.has(key + x + ',' + y)) return;
      const r = placeBuilding(s, key, x, y);
      if (r.ok) built.add(key + x + ',' + y);
    };
    if (s.milestone >= 1) {
      tryBuy('boneyard', sx - 12, sy + 16);
      tryBuy('healer', sx + 12, sy + 16);
      tryBuy('garden', sx - 8, sy + 16);
    }
    if (s.milestone >= 2) {
      tryBuy('veshari', sx + 13, sy + 5);
      tryBuy('wardlantern', sx - 13, sy + 5);
      tryBuy('spire', sx + 13, sy + 10);
    }
    if (s.milestone >= 3) {
      tryBuy('academy', sx - 14, sy + 10);
      tryBuy('square', sx + 13, sy);
    }
    if (s.day % 10 === 0) {
      const l = computeLedger(s);
      log.push(
        `day ${s.day} pop ${s.population} jobs ${s.jobs} emp ${s.employed} bld ${s.buildings.filter(Boolean).length} treas ${Math.round(s.treasury)} net ${Math.round(l.net)} happy ${s.happiness.toFixed(0)} mana ${s.manaDemand}/${s.manaSupply} bo ${s.brownout.toFixed(2)} dem H${s.demand.hearth.toFixed(2)} M${s.demand.market.toFixed(2)} C${s.demand.craft.toFixed(2)} edu ${s.educated.toFixed(2)} hp ${s.health.toFixed(2)} unrest ${s.unrest.toFixed(2)} unq ${s.unquieted.toFixed(0)} rest ${s.agents.filter((a) => a.kind === 2).length} agents ${s.agents.length} gloam ${s.stats.gloamTiles} ms ${s.milestone}`,
      );
    }
  },
});
console.log(log.join('\n'));
console.log('gameOver:', state.gameOver);
console.log('messages:\n' + state.messages.slice(-12).map((m) => `  [${m.kind}] ${m.text}`).join('\n'));
