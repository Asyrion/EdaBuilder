import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { idx } from '../src/sim/types';
import { canFoundDaughter, foundDaughter, daughterPopulation, dailyDaughter, DAUGHTER_GRANT } from '../src/sim/charter';
import { activeQuests } from '../src/sim/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function farNode(s: ReturnType<typeof createGame>): number {
  let best = -1;
  let bd = 0;
  s.nodes.forEach((n, i) => { const d = Math.hypot(n.x - s.founding.x, n.y - s.founding.y); const w = s.wyrm.node === i; if (!w && d > bd) { bd = d; best = i; } });
  return best;
}

describe('The daughter charter', () => {
  it('needs Beacon of Eda and a far node; founding places a stake, a district and pays the grant', () => {
    const s = createGame(21, 'Mother');
    const ni = farNode(s);
    expect(ni).toBeGreaterThanOrEqual(0);
    expect(canFoundDaughter(s, ni)).toMatch(/Beacon/);
    s.milestone = 8;
    expect(canFoundDaughter(s, 0)).toMatch(/founding/);
    if (s.wyrm.node >= 0) expect(canFoundDaughter(s, s.wyrm.node)).toMatch(/wyrm/);
    const n = s.nodes[ni];
    flatten(s, n.x - 8, n.y - 8, n.x + 8, n.y + 8);
    expect(canFoundDaughter(s, ni)).toBeNull();
    const t0 = s.treasury;
    expect(foundDaughter(s, ni, 'Newlight')).toBeNull();
    expect(s.daughter?.name).toBe('Newlight');
    expect(s.treasury).toBeGreaterThan(t0 + DAUGHTER_GRANT - 100); // minus the road stub
    expect(s.buildings.filter((b) => b && b.kind === 'stake').length).toBe(2);
    const d = s.daughter!;
    expect(s.district[idx(d.x, d.y)]).toBeGreaterThan(0);
    expect(Object.values(s.districtNames)).toContain('Newlight');
    expect(canFoundDaughter(s, ni)).toMatch(/already/);
    expect(activeQuests(s, 100).some((q) => q.id === 'c_twin')).toBe(true);
    // Twin Beacons
    for (let k = 0; k < 20; k++) { const h = placeBuildingRaw(s, 'hearth', d.x - 6 + (k % 10), d.y + 4 + Math.floor(k / 10), 3); h.residents = 30; }
    recomputeAll(s);
    expect(daughterPopulation(s)).toBeGreaterThanOrEqual(500);
    dailyDaughter(s);
    expect(s.daughter!.twin).toBeGreaterThanOrEqual(0);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.daughter?.name).toBe('Newlight');
    run(b, 5);
  });
});
