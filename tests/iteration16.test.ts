import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind } from '../src/sim/types';
import { dailyRestless, spawnRestless } from '../src/sim/agents';
import { flatten } from './helpers';

function town(seed = 19) {
  const s = createGame(seed, 'Fen');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 8, f.x + 20, f.y + 12);
  s.milestone = 7;
  s.treasury = 100000;
  return { s, f };
}

describe('Font of Quieting', () => {
  it('lays the restless down more easily', () => {
    const { s, f } = town();
    recomputeAll(s);
    for (let k = 0; k < 20; k++) spawnRestless(s, f.x + (k % 5), f.y + 4 + Math.floor(k / 5));
    const n0 = s.agents.filter((a) => a.kind === AgentKind.Restless).length;
    dailyRestless(s);
    const without = n0 - s.agents.filter((a) => a.kind === AgentKind.Restless).length;
    const font = placeBuildingRaw(s, 'fontquieting', f.x - 8, f.y + 4);
    font.lit = true;
    let cleared = 0;
    for (let r = 0; r < 3; r++) { const n = s.agents.filter((a) => a.kind === AgentKind.Restless).length; cleared += dailyRestless(s); void n; }
    expect(cleared).toBeGreaterThan(without);
    run(s, 5);
  });
});
