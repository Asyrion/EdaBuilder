/** Iteration 61 (the bot's depot): the depot becomes the bot's goal once what waits for the Gloam road would fetch half its
 *  price (since the scope reset, only the Craft works' surplus above ten waits for it). */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTrade } from '../src/sim/growth';
import { buildRoad, roadPath } from '../src/sim/actions';
import { distanceMap } from '../src/sim/terrain';
import { Bot } from '../src/sim/bot';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { costOf } from '../src/data/factions';
import { RoadType, Terrain, idx, isWater, type Building, type GameState } from '../src/sim/types';
import { forgetWaters } from '../src/sim/water';
import { flatten } from './helpers';

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
