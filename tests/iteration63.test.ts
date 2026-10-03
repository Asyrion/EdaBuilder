/** Iteration 63 (the caravan in the books): what the Belerial caravan pays is counted (the Annals, the Budget's row, the day's line of
 *  the ledger history), an old save loads with nothing counted, and the bot values the works' surplus at the caravan's price. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTrade } from '../src/sim/growth';
import { ALL_EVENTS, caravanSurplus, descOf, resolveEvent } from '../src/sim/events';
import { deserialize, serialize } from '../src/sim/save';
import { Bot } from '../src/sim/bot';
import { ANNALS } from '../src/data/annals';
import type { GameState } from '../src/sim/types';
import { flatten } from './helpers';

/** A Village with a depot and two works holding 30 goods each (40 above the caravan's ten a shelf). */
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
/** The caravan at the gate, as maybeFireCaravan puts it there. */
function halt(s: GameState) {
  const e = ALL_EVENTS.find((x) => x.id === 'caravan')!;
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: descOf(c, s), slider: c.slider })) };
  s.firedEvents.push('caravan:?');
}

describe('The caravan in the books', () => {
  it('Trade: the crowns the treasury gained are the charter\'s total and the last take, and join the day\'s line of the history', () => {
    const s = town();
    expect(caravanSurplus(s)).toBe(40);
    const before = s.treasury;
    halt(s);
    resolveEvent(s, 0);
    const take = Math.round(s.treasury - before);
    expect(take).toBe(Math.round(40 * s.trade.priceGoods * 1.5));
    expect(s.stats.caravanCrowns).toBe(take);
    expect(s.stats.lastCaravanCrowns).toBe(take);
    expect(s.stats.caravanGoods).toBe(40);
    expect(s.ledgerHistory).toEqual([120, 140 + take]);
  });
  it('the rare goods and the relic auction count too; a caravan sent on counts nothing and leaves the last take at 0', () => {
    const s = town(64);
    s.materials.scale = 2;
    halt(s);
    resolveEvent(s, 1, 100);
    expect(s.stats.caravanCrowns).toBe(800); // scale at 400 each
    s.relicStock = 3;
    halt(s);
    const before = s.treasury;
    resolveEvent(s, 3);
    const auction = Math.round(s.treasury - before);
    expect(auction).toBeGreaterThan(0);
    expect(s.stats.caravanCrowns).toBe(800 + auction);
    halt(s);
    resolveEvent(s, 4);
    expect(s.stats.caravanCrowns).toBe(800 + auction);
    expect(s.stats.lastCaravanCrowns).toBe(0);
  });
  it('buying striders is not a take', () => {
    const s = town(65);
    halt(s);
    resolveEvent(s, 2);
    expect(s.stats.caravanCrowns).toBe(0);
  });
  it('a save from before the books loads with nothing counted', () => {
    const s = town(66);
    const o = JSON.parse(serialize(s));
    delete o.stats.caravanCrowns;
    delete o.stats.lastCaravanCrowns;
    const t = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(t.stats.caravanCrowns).toBe(0);
    expect(t.stats.lastCaravanCrowns).toBe(0);
  });
  it('the Annals carry the caravan\'s crowns', () => {
    expect(ANNALS.some((c) => c.rows.some((r) => r.stat === 'caravanCrowns'))).toBe(true);
  });
});

describe('The bot reads the caravan', () => {
  it('values the works\' stock above ten at the caravan\'s 1.5× price, and the depot goal follows', () => {
    const s = town(67);
    s.buildings.forEach((b, k) => { if (b && b.kind === 'depot') { s.buildings[k] = null; for (let i = 0; i < s.bIndex.length; i++) if (s.bIndex[i] === k) s.bIndex[i] = -1; } });
    const bot = new Bot(s);
    (bot as any).goalBlocked.cradle = 9999;
    s.manaSupply = 500; s.manaDemand = 100; s.brownout = 0; s.ledger.net = 400;
    expect(bot.waitingForRoad()).toBeCloseTo(40 * s.trade.priceGoods * 1.5, 6);
    for (const b of s.buildings) if (b && b.kind === 'craft') b.stock = 10; // nothing above ten: nothing for the caravan
    expect(bot.waitingForRoad()).toBe(0);
    for (const b of s.buildings) if (b && b.kind === 'craft') b.stock = 10 + 400; // 800 surplus: far past half the depot's price
    expect((bot as any).pickGoal()?.kind).toBe('depot');
  });
});
