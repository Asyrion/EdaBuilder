import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY } from '../src/sim/types';
import { flatten } from './helpers';

function town(seed = 101) {
  const s = createGame(seed, 'Nine');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 4, f.x + 18, f.y + 14);
  s.milestone = 5;
  s.treasury = 80000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 3, f.x + 16, f.y + 3, false));
  const markets = [];
  for (let x = f.x - 6; x <= f.x - 2; x++) { const m = placeBuildingRaw(s, 'market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  const crafts = [];
  for (let x = f.x + 9; x <= f.x + 12; x++) { const c = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); c.workers = 8; c.stock = 50; crafts.push(c); }
  recomputeAll(s);
  return { s, f, markets, crafts };
}

describe('A busy market town', () => {
  it('a long run with all of it stays finite', () => {
    const t = town(107);
    run(t.s, TICKS_PER_DAY * 4, { onDay: () => { for (const m of t.markets) m.stock = 20; } });
    for (const a of t.s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
    expect(t.s.gameOver).toBeNull();
  });
});
