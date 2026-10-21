/** Iteration 63: the bot values the works' surplus above ten at the road's price (the Belerial caravan, which paid half again,
 *  is parked with the tales: scope reset phase 1c). */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTrade } from '../src/sim/growth';
import { Bot } from '../src/sim/bot';
import type { GameState } from '../src/sim/types';
import { flatten } from './helpers';

/** A Village with a depot and two works holding 30 goods each (40 above the ten a shelf kept). */
function town(seed = 63): GameState {
  const s = createGame(seed, 'Caravanwick');
  const f = s.founding;
  flatten(s, f.x - 12, f.y - 12, f.x + 12, f.y + 12);
  s.sectors.fill(1);
  s.milestone = 3;
  s.treasury = 10000;
  const depot = placeBuildingRaw(s, 'depot', f.x + 5, f.y + 4);
  depot.state = 'ok';
  for (const dx of [8, 9]) { const w = placeBuildingRaw(s, 'craft', f.x + dx, f.y - 4); w.state = 'ok'; }
  recomputeAll(s);
  dailyTrade(s); // today's prices (the depot's road sells from full works, so the stock is set after it)
  for (const b of s.buildings) if (b && b.kind === 'craft') b.stock = 30;
  s.ledgerHistory = [120, 140];
  return s;
}
describe('The bot reads the caravan', () => {
  it('values the works\' stock above ten at the road\'s price, and the depot goal follows', () => {
    const s = town(67);
    s.buildings.forEach((b, k) => { if (b && b.kind === 'depot') { s.buildings[k] = null; for (let i = 0; i < s.bIndex.length; i++) if (s.bIndex[i] === k) s.bIndex[i] = -1; } });
    const bot = new Bot(s);
    (bot as any).goalBlocked.cradle = 9999;
    s.manaSupply = 500; s.manaDemand = 100; s.brownout = 0; s.ledger.net = 400;
    expect(bot.waitingForRoad()).toBeCloseTo(40 * s.trade.priceGoods, 6); // the caravan's half again is parked
    for (const b of s.buildings) if (b && b.kind === 'craft') b.stock = 10; // nothing above ten: nothing waiting
    expect(bot.waitingForRoad()).toBe(0);
    for (const b of s.buildings) if (b && b.kind === 'craft') b.stock = 10 + 400; // 800 surplus: far past half the depot's price
    expect((bot as any).pickGoal()?.kind).toBe('depot');
  });
});
