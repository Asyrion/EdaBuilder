/** The bot: its purse (saving for a goal, the Crown's loan as a bridge), zoning only what it can light, the tithe and the edicts,
 *  and the depot it stands once goods wait for the Gloam road. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, Terrain, idx, isWater, type Building, type GameState } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { dailyTrade } from '../src/sim/growth';
import { distanceMap } from '../src/sim/terrain';
import { forgetWaters } from '../src/sim/water';
import { Bot } from '../src/sim/bot';
import { BUILDING_BY_KEY, MILESTONES } from '../src/sim/catalog';
import { VELLISH_HAPPINESS, costOf } from '../src/data/factions';
import { flatten } from './helpers';

// The bot plays it all: its purse, light-first zoning, taxes, edicts and depot.
function town(seed = 55) {
  const s = createGame(seed, 'Annalwick');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 14, f.x + 18, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  s.treasury = 50000;
  s.milestone = 3;
  recomputeAll(s);
  return s;
}
describe('The bot keeps a purse', () => {
  it('saves for a Font when the ley runs short, holds the price back from services, and buys it once the purse holds it', () => {
    const s = town();
    s.milestone = 4;
    const bot = new Bot(s);
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    const g = (bot as any).pickGoal();
    expect(g.kind).toBe('font');
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    (bot as any).goal = g; (bot as any).reserve = g.cost;
    for (let k = 0; k < 6; k++) placeBuildingRaw(s, 'hearth', s.founding.x - 8 + k, s.founding.y + 3);
    recomputeAll(s);
    s.manaSupply = 100; s.manaDemand = 120; s.brownout = 0.2;
    s.treasury = g.cost + 500; // a watchpost (800 + 1,500 buffer) would eat the Font's price
    const posts = s.buildings.filter((b) => b && b.kind === 'watchpost').length;
    (bot as any).buyServices();
    expect(s.buildings.filter((b) => b && b.kind === 'watchpost').length).toBe(posts);
    (bot as any).pursueGoal();
    expect(s.buildings.filter((b) => b && b.kind === 'font').length).toBe(1);
    expect((bot as any).goal).toBeNull();
  });
  it('takes the Crown\'s loan only as a bridge to a hall the ledger can carry, and repays it when nothing is saved for', () => {
    const s = town(55);
    s.milestone = 7; // the Lantern of Vell is the hall (the Tallowkin's Hall of Wicks, which this test used, is parked)
    const bot = new Bot(s);
    s.treasury = 500;
    (bot as any).goal = { kind: 'font', key: 'font', cost: 6700, mana: true };
    s.ledger.net = 600;
    (bot as any).pursueGoal();
    expect(s.loan).toBe(0); // never for the Fonts
    (bot as any).goal = { kind: 'hall', key: 'lantern', cost: 9500, mana: false };
    s.ledger.net = 600; // 70,000 at half a crown in a hundred is 350 a day: the ledger must carry twice that
    (bot as any).pursueGoal();
    expect(s.loan).toBe(0);
    s.ledger.net = 750;
    (bot as any).pursueGoal();
    expect(s.loan).toBe(70000);
    expect(s.buildings.filter((b) => b && b.kind === 'lantern').length).toBe(1);
    expect(bot.loans).toBe(1);
    // while it is out, the reserve holds the loan; once the purse holds it and two thousand more and nothing is saved for, it goes back
    s.manaSupply = 500; s.manaDemand = 100; s.brownout = 0;
    s.treasury = 72500;
    bot.step();
    expect(s.loan).toBe(0);
  });
  it('abandons a goal it cannot place after five days, for twenty', () => {
    const s = town(55);
    s.milestone = 6;
    const bot = new Bot(s);
    (bot as any).goal = { kind: 'hall', key: 'mine', cost: 5400, mana: false };
    s.treasury = 60000;
    // no hills anywhere: the mine cannot stand (the Ruin Delve this test used is parked)
    for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Hills) s.terrain[i] = Terrain.Grass;
    for (let k = 0; k < 5; k++) (bot as any).pursueGoal();
    expect((bot as any).goal).toBeNull();
    expect((bot as any).goalBlocked.mine).toBe(s.day + 20);
  });
});

describe('The bot zones what it can light and moves the tithe', () => {
  function lots(s: GameState) { let n = 0; for (let i = 0; i < s.zone.length; i++) if (s.zone[i]) n++; return n; }
  it('paints no new lots while the Vellish ley browns out and the city sits under its gate', () => {
    const s = town();
    const bot = new Bot(s);
    const f = s.founding;
    for (let k = 0; k < 24; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 12 + k, f.y + 3); b.lit = false; }
    s.brownout = 0.3; s.happiness = 40; s.demand.hearth = 1;
    const before = lots(s);
    (bot as any).zoneByDemand();
    expect(lots(s)).toBe(before);
    s.brownout = 0; // the ley carries them: homes dark for want of a spire are keepLit's to fix
    (bot as any).zoneByDemand();
    expect(lots(s)).toBeGreaterThan(before);
  });
  it('lowers the hearth tithe under the Vellish gate and the works, shops and studios carry the difference', () => {
    const s = town();
    const bot = new Bot(s);
    s.day = 10;
    s.population = MILESTONES[4].pop; s.happiness = VELLISH_HAPPINESS(4) - 5;
    s.demand.market = 0.3; s.demand.craft = 0.3; s.demand.arcane = -0.2;
    (bot as any).setTaxes();
    expect(s.taxRates.hearth).toBe(9);
    expect(s.taxRates.market).toBe(11);
    expect(s.taxRates.craft).toBe(11);
    expect(s.taxRates.arcane).toBe(10); // no demand for studios: their tithe stays
  });
  it('turns on the curfew past 0.35 unrest, as the advisor would', () => {
    const s = town();
    const bot = new Bot(s);
    s.unrest = 0.4;
    (bot as any).setEdicts();
    expect(s.edicts.curfew).toBe(true);
    expect(s.edictSince.curfew).toBe(s.day);
  });
});

describe('The bot stands a depot', () => {
  it('finds a depot room in the outer ring when the old homes are packed (the depot of iteration 43)', () => {
    const s = town();
    const bot = new Bot(s);
    const f = s.founding;
    // a packed old core: homes on every tile beside the road near the stake, free land only far out along it
    for (let x = f.x - 6; x <= f.x + 6; x++) for (const y of [f.y + 1, f.y + 3]) if (s.bIndex[idx(x, y)] < 0 && !s.road[idx(x, y)]) placeBuildingRaw(s, 'hearth', x, y);
    for (let x = f.x - 6; x <= f.x + 6; x++) for (const y of [f.y + 4, f.y + 5, f.y, f.y - 1]) if (s.bIndex[idx(x, y)] < 0 && !s.road[idx(x, y)]) placeBuildingRaw(s, 'hearth', x, y);
    placeBuildingRaw(s, 'hearth', f.x + 15, f.y + 3);
    recomputeAll(s);
    expect((bot as any).placeService('depot')).toBe(true);
    expect(s.buildings.some((b) => b && b.kind === 'depot')).toBe(true);
  });
});

// The depot becomes the bot's goal once what waits for the Gloam road would fetch half its price (since the scope reset, only
// the Craft works' surplus above ten waits for it).
/** A clean valley as iteration 60 paints it: a lake south-east of the stake, a 2-wide river west of it. */
function valley(seed: number): { s: GameState; lake: { x: number; y: number }; river: number } {
  const s = createGame(seed, 'Depotwick');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 30, f.x + 30, f.y + 30);
  s.sectors.fill(1);
  const L = { x: f.x + 14, y: f.y + 14 };
  for (let y = L.y - 6; y <= L.y + 6; y++) for (let x = L.x - 6; x <= L.x + 6; x++) s.terrain[idx(x, y)] = Math.abs(x - L.x) <= 3 && Math.abs(y - L.y) <= 3 ? Terrain.DeepWater : Terrain.Water;
  for (let y = L.y - 7; y <= L.y + 7; y++) for (let x = L.x - 7; x <= L.x + 7; x++) if (!isWater(s.terrain[idx(x, y)])) s.terrain[idx(x, y)] = Terrain.Shore;
  const rx = f.x - 14;
  for (let y = f.y - 25; y <= f.y + 25; y++) { s.terrain[idx(rx, y)] = Terrain.Water; s.terrain[idx(rx + 1, y)] = Terrain.Water; s.terrain[idx(rx - 1, y)] = Terrain.Shore; s.terrain[idx(rx + 2, y)] = Terrain.Shore; }
  s.waterDist = distanceMap((i) => isWater(s.terrain[i]), 15);
  forgetWaters(s);
  s.treasury = 50000;
  s.milestone = 3;
  s.ledger.net = 400;
  recomputeAll(s);
  return { s, lake: L, river: rx };
}
function raw(s: GameState, kind: string, x: number, y: number): Building {
  const b = placeBuildingRaw(s, kind, x, y);
  b.state = 'ok';
  return b;
}
/** A bot with no cradle and no mana to save for, so the depot is the only goal in question. */
function bot(s: GameState): Bot {
  const b = new Bot(s);
  (b as any).goalBlocked.cradle = 9999;
  s.manaSupply = 500; s.manaDemand = 100; s.brownout = 0;
  return b;
}
const kinds = (s: GameState, k: string) => s.buildings.filter((b) => b && b.kind === k).length;
/** Craft stock above the ten a works keeps that fetches half the depot's price at today's price. */
const halfDepot = (s: GameState) => Math.ceil(costOf(s, BUILDING_BY_KEY.depot) / 2 / s.trade.priceGoods);

describe('The bot saves for a depot when goods wait for the Gloam road', () => {
  it('no goal on an empty road; a goal once the Craft works\' surplus would fetch half its price', () => {
    const { s } = valley(61);
    const f = s.founding;
    dailyTrade(s); // today's prices, with no depot to sell at
    const b = bot(s);
    const works = raw(s, 'craft', f.x + 6, f.y + 3);
    works.stock = 10; // the ten a works keeps do not wait for the road
    expect(b.waitingForRoad()).toBe(0);
    expect((b as any).pickGoal()).toBeNull();
    works.stock = 10 + halfDepot(s) - 1;
    expect((b as any).pickGoal()).toBeNull();
    works.stock = 10 + halfDepot(s);
    expect((b as any).pickGoal()?.kind).toBe('depot');
    // a ledger that cannot carry the upkeep waits
    s.ledger.net = 100;
    expect((b as any).pickGoal()).toBeNull();
  });

  it('buys and places the depot from the morning purse, and stops asking once it stands', () => {
    const { s } = valley(62);
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 4, f.x + 10, f.y + 4, false));
    for (let k = 0; k < 6; k++) raw(s, 'hearth', f.x - 6 + k, f.y + 5);
    recomputeAll(s);
    s.ledger.net = 400;
    dailyTrade(s);
    const b = bot(s);
    raw(s, 'craft', f.x + 6, f.y + 3).stock = 10 + 2 * halfDepot(s);
    b.goal = (b as any).pickGoal();
    expect(b.goal?.kind).toBe('depot');
    (b as any).pursueGoal();
    expect(kinds(s, 'depot')).toBe(1);
    expect(b.depotDay).toBe(s.day);
    expect(b.goal).toBeNull();
    expect((b as any).pickGoal()).toBeNull();
  });
});

describe('The bot imports only what the ledger can carry', () => {
  it('leaves the Import edict off when the dry markets\' bill is over half the ledger, and calls it when it is not', () => {
    const { s } = valley(68);
    const f = s.founding;
    raw(s, 'depot', f.x + 6, f.y + 3);
    for (let k = 0; k < 6; k++) raw(s, 'market', f.x - 6 + k, f.y + 5);
    recomputeAll(s);
    dailyTrade(s);
    const b = bot(s);
    s.goodsShort = 6; // 6 × 8 goods × twice the price: about 200 a day
    s.ledger.net = 300;
    (b as any).setEdicts();
    expect(!!s.edicts.imports).toBe(false);
    s.ledger.net = 1000;
    (b as any).setEdicts();
    expect(!!s.edicts.imports).toBe(true);
  });
  it('holds the depot\'s price back from growth while it is the goal', () => {
    const { s } = valley(69);
    dailyTrade(s);
    const b = bot(s);
    raw(s, 'craft', s.founding.x + 6, s.founding.y + 3).stock = 10 + 2 * halfDepot(s);
    s.treasury = 1000;
    b.step();
    expect(b.goal?.kind).toBe('depot');
    expect(b.reserve).toBe(b.goal!.cost);
  });
});

// The bot values the works' surplus above ten at the road's price (the Belerial caravan, which paid half again, is parked with
// the tales: scope reset phase 1c).
/** A Village with a depot and two works holding 30 goods each (40 above the ten a shelf kept). */
function caravanTown(seed = 63): GameState {
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
    const s = caravanTown(67);
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

// Phase 2-3 of the scope reset: the bot lays its street grid a block side at a time, where the town is and one ring past it.
describe('the bot builds streets where the town is', () => {
  it('on day 60 most of its street tiles have a lot or a building beside them, and it still reaches the Hamlet by day 5', async () => {
    const { run } = await import('../src/sim/sim');
    const s = createGame(42, 'Streets');
    const bot = new Bot(s);
    let hamlet = -1;
    run(s, 900 * 60, { onDay: () => { bot.step(); if (hamlet < 0 && s.milestone >= 1) hamlet = s.day; } });
    let roads = 0, beside = 0;
    for (let i = 0; i < s.road.length; i++) {
      if (!s.road[i]) continue;
      roads++;
      const x = i % 128, y = (i / 128) | 0;
      let n = false;
      for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * 128 + x + dx;
        if (j >= 0 && j < s.road.length && (s.zone[j] || (s.bIndex[j] >= 0 && !s.road[j]))) { n = true; break; }
      }
      if (n) beside++;
    }
    expect(hamlet).toBeGreaterThan(0);
    expect(hamlet).toBeLessThanOrEqual(5);
    // most of them (2-3 held 60 %; since the carts route round jams, 2-5, the day-60 town has 58.5 %; the old full grid had 35 %)
    expect(beside / roads).toBeGreaterThan(0.5);
  }, 120_000);
});
