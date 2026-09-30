import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { TICKS_PER_DAY, Terrain, idx, MAP_W, MAP_H } from '../src/sim/types';
import { Bot } from '../src/sim/bot';
import { placeBuilding, buildRoad, roadPath } from '../src/sim/actions';
import { canPlaceBuilding } from '../src/sim/world';
const s = createGame(42, 'M');
const bot = new Bot(s);
run(s, TICKS_PER_DAY * 25, { onDay: () => bot.step() });
console.log('milestone', s.milestone, 'treasury', s.treasury, 'radius', (bot as any).radius);
s.treasury = 50000;
// nearest 2x2 hills patch
let best: any = null, bd = Infinity;
const cx = s.founding.x + 2, cy = s.founding.y + 1;
for (let y = 2; y < MAP_H - 3; y++) for (let x = 2; x < MAP_W - 3; x++) {
  let ok = true;
  for (let dy = 0; dy < 2 && ok; dy++) for (let dx = 0; dx < 2; dx++) if (s.terrain[idx(x + dx, y + dy)] !== Terrain.Hills) ok = false;
  if (!ok) continue;
  const d = Math.hypot(x - cx, y - cy);
  if (d < bd) { bd = d; best = [x, y]; }
}
console.log('nearest hills patch', best, 'dist', bd.toFixed(1));
(bot as any).buildMine();
console.log('mines after buildMine:', s.buildings.filter((b) => b && b.kind === 'mine').length);
if (best) {
  const [mx, my] = best;
  console.log('canPlace at patch:', canPlaceBuilding(s, 'mine', mx, my), 'road below?', s.road[idx(mx, my + 2)], 'terrain below', s.terrain[idx(mx, my + 2)]);
}
