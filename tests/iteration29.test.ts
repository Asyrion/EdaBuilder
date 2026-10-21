import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RELIC_KEEP, RELICS_PER_DAY, RELIC_PRICE, dailyTrade } from '../src/sim/growth';
import { tradeRoutes } from '../src/sim/trade';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase5');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('Relic trade with the Crown', () => {
  it('the depot sells two loose relics a day above ten', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'depot', f.x - 4, f.y + 3);
    recomputeAll(s);
    s.relicStock = 11;
    const t0 = s.treasury;
    dailyTrade(s);
    expect(s.trade.relicsSold).toBe(1);
    expect(s.treasury - t0).toBe(RELIC_PRICE);
    expect(s.relicStock).toBe(RELIC_KEEP);
    s.relicStock = 20;
    dailyTrade(s);
    expect(s.trade.relicsSold).toBe(RELICS_PER_DAY);
    expect(s.stats.relicsSold).toBe(3);
    expect(tradeRoutes(s)[0].note).toMatch(/3 relics sold/);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_assessor')).toBe(false);
  });
});
