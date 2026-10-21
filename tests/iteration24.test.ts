import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTwinRoad, tradeRoutes, twinDepots } from '../src/sim/trade';
import { foundDaughter } from '../src/sim/charter';
import { serialize, deserialize } from '../src/sim/save';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

describe('Trade routes', () => {
  it('lists the Gloam road, the river, the arches and the Twin Road; the Twin Road carries goods to the daughter', () => {
    const s = createGame(21, 'Routes');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 12);
    expect(tradeRoutes(s)).toEqual([]);
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    recomputeAll(s);
    expect(tradeRoutes(s).map((r) => r.kind)).toEqual(['road']);
    // the daughter
    s.milestone = 8;
    let ni = -1;
    for (let k = 0; k < s.nodes.length; k++) { const n = s.nodes[k]; if (Math.max(Math.abs(n.x - f.x), Math.abs(n.y - f.y)) >= 40) { flatten(s, n.x - 8, n.y - 8, n.x + 8, n.y + 8); if (foundDaughter(s, k, 'Newlight') === null) { ni = k; break; } } }
    expect(ni).toBeGreaterThanOrEqual(0);
    const d = s.daughter!;
    let routes = tradeRoutes(s);
    expect(routes.find((r) => r.kind === 'twin')!.open).toBe(false);
    expect(twinDepots(s)).toBeNull();
    placeBuildingRaw(s, 'depot', d.x + 3, d.y + 3);
    const m = placeBuildingRaw(s, 'market', d.x - 3, d.y + 3, 2);
    const c = placeBuildingRaw(s, 'craft', f.x - 2, f.y + 6, 2);
    recomputeAll(s);
    expect(twinDepots(s)).not.toBeNull();
    routes = tradeRoutes(s);
    expect(routes.find((r) => r.kind === 'twin')!.open).toBe(true);
    c.stock = 40; m.stock = 0;
    const t0 = s.treasury;
    const moved = dailyTwinRoad(s);
    expect(moved).toBe(30);
    expect(m.stock).toBe(30);
    expect(c.stock).toBe(10);
    expect(s.treasury - t0).toBe(30);
    expect(s.stats.twinGoods).toBe(30);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_twinroad')).toBe(false); // done
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.stats.twinGoods).toBe(30);
  });
});
