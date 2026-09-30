import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
const s = createGame(31, 'Goods');
const f = s.founding;
for (let y = f.y - 4; y <= f.y + 10; y++) for (let x = f.x - 14; x <= f.x + 14; x++) { const i = idx(x, y); if (s.terrain[i] !== Terrain.LeyNode) s.terrain[i] = Terrain.Grass; s.gloam[i] = 0; }
console.log(buildRoad(s, RoadType.Track, roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false)));
const crafts: any[] = [], markets: any[] = [];
for (let x = f.x - 11; x <= f.x - 6; x++) { const b = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); b.workers = 8; crafts.push(b); }
for (let x = f.x + 6; x <= f.x + 11; x++) { const b = placeBuildingRaw(s, 'market', x, f.y + 4, 2); b.workers = 6; markets.push(b); }
for (let x = f.x - 5; x <= f.x + 5; x++) { const b = placeBuildingRaw(s, 'hearth', x, f.y + 2, 2); b.residents = 8; }
s.population = 88;
recomputeAll(s);
for (let d = 1; d <= 12; d++) {
  run(s, TICKS_PER_DAY);
  const carts = s.agents.filter((a) => a.kind === 1);
  console.log(`day ${d} pop ${s.population} jobs ${s.jobs} emp ${s.employed} craftStock ${crafts.map((c) => c.stock.toFixed(1)).join(',')} workers ${crafts.map((c) => c.workers).join(',')} marketStock ${markets.map((m) => m.stock.toFixed(1)).join(',')} carts ${carts.length} loads ${carts.map((c) => c.load + '@' + c.targetId + 't' + c.timer + 'p' + c.path.length).join(' ')} road ${s.road[idx(f.x, f.y + 3)]}`);
}
