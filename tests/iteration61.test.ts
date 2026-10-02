/** Iteration 61 (the bot's depot, the hunt and the fish): the depot becomes the bot's goal once what waits for the Gloam road
 *  would fetch half its price; the bot thatches with a Reed-Cutters' Hut, raises a Weir where its hut fishes the shoal down,
 *  and before the Thaw's high water bridges the fords no Weir holds (or raises a Weir over five of them). */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { dailyTrade } from '../src/sim/growth';
import { buildRoad, roadPath } from '../src/sim/actions';
import { distanceMap } from '../src/sim/terrain';
import { Bot } from '../src/sim/bot';
import { RoadType, Terrain, idx, isWater, type Building, type GameState } from '../src/sim/types';
import { bodyOf, ensureShoals, forgetWaters, fordClosedToday, isFordTile, shoalCap, weirHolds } from '../src/sim/water';
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
  s.water.fish = [];
  s.wild.herds = [];
  s.agents = s.agents.filter((a) => a.herdId === undefined);
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

describe('The bot saves for a depot when goods wait for the Gloam road', () => {
  it('no goal on an empty road; a goal once the hides, the trophies, the smoked fish or the relics would fetch half its price', () => {
    const { s } = valley(61);
    const f = s.founding;
    dailyTrade(s); // today's prices, with no depot to sell at
    const b = bot(s);
    const lodge = raw(s, 'hunterslodge', f.x + 6, f.y + 3);
    expect(b.waitingForRoad()).toBe(0);
    expect((b as any).pickGoal()).toBeNull();
    lodge.stock = Math.ceil(1100 / s.trade.priceHides!); // hides worth half the depot
    expect((b as any).pickGoal()?.kind).toBe('depot');
    lodge.stock = 0;
    lodge.trophies = 40;
    expect((b as any).pickGoal()?.kind).toBe('depot');
    lodge.trophies = 0;
    const smoke = raw(s, 'smokehouse', f.x + 6, f.y - 3);
    smoke.stock = 10 + 600;
    expect((b as any).pickGoal()?.kind).toBe('depot');
    smoke.stock = 0;
    s.relicStock = 10 + 19;
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
    s.relicStock = 40;
    b.goal = (b as any).pickGoal();
    expect(b.goal?.kind).toBe('depot');
    (b as any).pursueGoal();
    expect(kinds(s, 'depot')).toBe(1);
    expect(b.depotDay).toBe(s.day);
    expect(b.goal).toBeNull();
    expect((b as any).pickGoal()).toBeNull();
  });
});

describe('The bot thatches', () => {
  /** Eight level-1 homes west of a road that runs down the lake's west shore. */
  function shoreStreet(s: GameState, L: { x: number; y: number }, homes: number) {
    buildRoad(s, RoadType.Track, roadPath(L.x - 9, L.y - 8, L.x - 9, L.y + 2, true));
    for (let k = 0; k < homes; k++) { const h = raw(s, 'hearth', L.x - 10, L.y - 7 + k); h.level = 1; h.residents = 4; }
    recomputeAll(s);
    s.ledger.net = 400;
  }
  it('a Reed-Cutters\' Hut where ten reed beds and eight level-1 homes are in reach', () => {
    const { s, lake } = valley(63);
    shoreStreet(s, lake, 8);
    s.day = 32;
    const b = bot(s);
    (b as any).thatch();
    expect(kinds(s, 'reedcutters')).toBe(1);
    expect(b.cuttersBuilt).toBe(1);
    (b as any).thatch(); // one until day 90
    expect(kinds(s, 'reedcutters')).toBe(1);
  });
  it('none for five homes', () => {
    const { s, lake } = valley(64);
    shoreStreet(s, lake, 5);
    s.day = 32;
    const b = bot(s);
    (b as any).thatch();
    expect(kinds(s, 'reedcutters')).toBe(0);
  });
});

describe('The bot\'s Weir and bridges', () => {
  it('a Weir on the hut\'s water once its shoal is fished under half its cap', () => {
    const { s, lake } = valley(65);
    buildRoad(s, RoadType.Track, roadPath(lake.x - 8, lake.y - 8, lake.x - 8, lake.y + 8, true));
    const h = raw(s, 'fishershut', lake.x - 7, lake.y);
    h.workers = 4;
    raw(s, 'market', lake.x - 9, lake.y - 2);
    recomputeAll(s);
    s.ledger.net = 400;
    const w = ensureShoals(s);
    const body = bodyOf(s, h);
    s.day = 31;
    const b = bot(s);
    (b as any).goalBlocked.depot = 9999;
    (b as any).fish();
    expect(kinds(s, 'weir')).toBe(0); // a full shoal needs no Weir
    s.water.fish[body] = shoalCap(w, body) * 0.3;
    (b as any).fish();
    const weir = s.buildings.find((x) => x && x.kind === 'weir')!;
    expect(weir).toBeTruthy();
    expect(bodyOf(s, weir)).toBe(body);
    expect(b.weirsBuilt).toBe(1);
  });

  it('in the late Hush, bridges a crossing no Weir holds and leaves the one a Weir holds', () => {
    const { s, river } = valley(66);
    const y = s.founding.y;
    s.milestone = 1;
    buildRoad(s, RoadType.Track, roadPath(river - 3, y, river + 4, y, false));
    buildRoad(s, RoadType.Track, roadPath(river - 3, y + 20, river + 4, y + 20, false));
    const ford = idx(river, y);
    const held = idx(river, y + 20);
    expect(isFordTile(s, ford) && isFordTile(s, held)).toBe(true);
    raw(s, 'weir', river + 2, y + 21);
    expect(weirHolds(s, held)).toBe(true);
    expect(weirHolds(s, ford)).toBe(false);
    const b = bot(s);
    s.day = 100; // the Hush, but not its second half
    (b as any).fords();
    expect(s.road[ford]).toBe(RoadType.Track);
    s.day = 110;
    (b as any).fords();
    expect(s.road[ford]).toBe(RoadType.Cobble);
    expect(s.road[ford + 1]).toBe(RoadType.Cobble);
    expect(b.fordsBridged).toBe(2);
    (b as any).fords();
    expect(s.road[held]).toBe(RoadType.Track); // the Weir holds it
    // weirHolds is the test the high water reads
    s.day = 122;
    expect(fordClosedToday(s, held)).toBe(false);
  });

  it('raises a Weir instead where one bank spot holds five fords or more', () => {
    const { s, river } = valley(67);
    const y = s.founding.y;
    s.milestone = 2;
    for (const dy of [0, 2, 4]) buildRoad(s, RoadType.Track, roadPath(river - 3, y + dy, river + 4, y + dy, false));
    const b = bot(s);
    s.day = 112;
    (b as any).fords();
    expect(kinds(s, 'weir')).toBe(1);
    expect(b.weirsBuilt).toBe(1);
    expect(b.fordsBridged).toBe(0);
    for (const dy of [0, 2, 4]) expect(weirHolds(s, idx(river, y + dy))).toBe(true);
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
    s.relicStock = 40;
    s.treasury = 1000;
    b.step();
    expect(b.goal?.kind).toBe('depot');
    expect(b.reserve).toBe(b.goal!.cost);
  });
});
