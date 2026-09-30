import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, Zone, TICKS_PER_DAY, idx } from '../src/sim/types';
import { BUILDING_BY_KEY } from '../src/sim/catalog';

const state = createGame(42, 'Testwick');
const f = state.founding;
const sx = f.x + 2, sy = f.y + 1;
for (let k = 0; k < 4; k++) buildRoad(state, RoadType.Track, roadPath(sx - 12, sy + k * 5, sx + 12, sy + k * 5, false));
for (let k = 0; k < 4; k++) buildRoad(state, RoadType.Track, roadPath(sx - 12 + k * 8, sy, sx - 12 + k * 8, sy + 15, true));
paintZone(state, Zone.Hearth, sx - 11, sy + 1, sx + 11, sy + 4);
paintZone(state, Zone.Market, sx - 11, sy + 6, sx + 11, sy + 7);
paintZone(state, Zone.Hearth, sx - 11, sy + 8, sx + 11, sy + 9);
paintZone(state, Zone.Craft, sx - 11, sy + 11, sx + 11, sy + 14);
console.log(placeBuilding(state, 'well', sx - 12, sy - 1), placeBuilding(state, 'well', sx + 1, sy + 9), placeBuilding(state, 'well', sx - 7, sy + 4), placeBuilding(state, 'well', sx + 9, sy + 6));
placeBuilding(state, 'well', sx + 12, sy - 1);
console.log(placeBuilding(state, 'spire', sx + 5, sy + 1), placeBuilding(state, 'spire', sx - 3, sy + 6),placeBuilding(state, 'spire', sx + 3, sy + 11));
placeBuilding(state, 'watchpost', sx, sy - 1);
placeBuilding(state, 'shrine', sx + 8, sy - 1);
run(state, TICKS_PER_DAY * 15);
let lit = 0, wat = 0, n = 0, res = 0;
const sample: string[] = [];
for (const b of state.buildings) {
  if (!b || BUILDING_BY_KEY[b.kind].category !== 'zone') continue;
  n++; if (b.lit) lit++; if (b.watered) wat++; res += b.residents;
  if (sample.length < 6) {
    const i = idx(b.x, b.y);
    sample.push(`${b.kind} (${b.x},${b.y}) lvl${b.level} res${b.residents} happy${b.happiness.toFixed(0)} lit${b.lit} wat${b.watered} lv${state.landValue[i]} miasma${state.miasma[i]} gloamD${state.gloamDist[i]} traffic${state.trafficSmooth[i]} faith${state.coverage.faith[i]} watch${state.coverage.watch[i]} state=${b.state}`);
  }
}
console.log(`zone buildings ${n} lit ${lit} watered ${wat} residents ${res} pop ${state.population} unrest ${state.unrest.toFixed(2)} health ${state.health.toFixed(2)} employed ${state.employed} jobs ${state.jobs}`);
console.log(sample.join('\n'));
console.log('spires lit:', state.buildings.filter(b => b && b.kind === 'spire').map(b => b!.lit));
console.log('founding', f, 'nodes', state.nodes);
