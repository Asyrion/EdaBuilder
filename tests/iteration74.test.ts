/** Iteration 74 (DESIGN 4.105, markets want a good road; AUDIT B40): the road at a market's door scales its tithe (a dirt track
 *  a tenth less, a fifth in the mud; cobbles in full; a lit Lantern-way or a Glowvine Lane a tenth more); the panel says so; the
 *  bot paves its market doors from Market Town. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { RoadType, type Building, type GameState } from '../src/sim/types';
import { MARKET_MUD_TRADE, MARKET_ROAD_TRADE, marketRoadMultAt, marketRoadWords, muddySeason } from '../src/sim/roads';
import { roadTileOf } from '../src/sim/agents';
import { computeLedger } from '../src/sim/economy';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { Bot } from '../src/sim/bot';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A street: a dirt track, two markets of one size on it (west and east), a works between. */
function street(): { s: GameState; west: Building; east: Building; works: Building } {
  const s = createGame(74, 'Cobblewick');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 8, f.x + 20, f.y + 12);
  s.milestone = 3;
  s.treasury = 50000;
  s.day = 40; // Bloom: no mud
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 5, f.x + 14, f.y + 5, false));
  const west = placeBuildingRaw(s, 'market', f.x - 6, f.y + 4, 1); ok(west); west.workers = 4; west.happiness = 70; west.lit = true;
  const east = placeBuildingRaw(s, 'market', f.x + 6, f.y + 4, 1); ok(east); east.workers = 4; east.happiness = 70; east.lit = true;
  const works = placeBuildingRaw(s, 'craft', f.x, f.y + 4, 1); ok(works); works.workers = 4; works.happiness = 70; works.lit = true;
  recomputeAll(s);
  west.workers = 4; east.workers = 4; works.workers = 4; west.happiness = 70; east.happiness = 70; works.happiness = 70;
  return { s, west, east, works };
}

describe('The road at the door', () => {
  it('scales by tier: a track a tenth less and a fifth in the mud, cobbles in full, a lit Lantern-way or a Glowvine Lane a tenth more, no road a fifth less', () => {
    const { s, west } = street();
    const door = roadTileOf(s, west);
    expect(s.road[door]).toBe(RoadType.Track);
    expect(muddySeason(s)).toBe(false);
    expect(marketRoadMultAt(s, door)).toBe(MARKET_ROAD_TRADE[RoadType.Track]);
    expect(marketRoadMultAt(s, door)).toBe(0.9);
    s.day = 10; // the Thaw
    expect(muddySeason(s)).toBe(true);
    expect(marketRoadMultAt(s, door)).toBe(MARKET_MUD_TRADE);
    s.day = 100; // the Hush
    expect(marketRoadMultAt(s, door)).toBe(0.8);
    s.day = 40;
    s.road[door] = RoadType.Cobble;
    expect(marketRoadMultAt(s, door)).toBe(1);
    s.day = 10;
    expect(marketRoadMultAt(s, door)).toBe(1); // cobbles do not mud
    s.day = 40;
    s.road[door] = RoadType.Lantern;
    s.lit[door] = 0;
    expect(marketRoadMultAt(s, door)).toBe(1); // unlit: a cobbled road
    s.lit[door] = 1;
    expect(marketRoadMultAt(s, door)).toBe(1.1);
    s.road[door] = RoadType.Glowvine;
    expect(marketRoadMultAt(s, door)).toBe(1.1);
    expect(marketRoadMultAt(s, -1)).toBe(0.8);
  });

  it('names the tier in the panel\'s words', () => {
    const { s, west } = street();
    const door = roadTileOf(s, west);
    expect(marketRoadWords(s, door)).toMatch(/^Dirt Track: trade × 0\.9, × 0\.8 in the mud/);
    s.day = 10;
    expect(marketRoadWords(s, door)).toMatch(/in the mud of this season/);
    s.day = 40;
    s.road[door] = RoadType.Cobble;
    expect(marketRoadWords(s, door)).toMatch(/^Cobbled Road: trade in full/);
    s.road[door] = RoadType.Lantern;
    s.lit[door] = 0;
    expect(marketRoadWords(s, door)).toMatch(/unlit \(counts as cobbled\)/);
    s.lit[door] = 1;
    expect(marketRoadWords(s, door)).toMatch(/^Lantern-way: trade × 1\.1/);
    expect(marketRoadWords(s, -1)).toMatch(/no road/);
    expect(BUILDING_BY_KEY.market.desc).toMatch(/cobbled road at the door trades in full/);
  });

  it('scales the market tithe only: two markets alike, one door cobbled, pay 0.95 of both cobbled; Craft and Hearth tithes are untouched', () => {
    const { s, west, east } = street();
    const a = roadTileOf(s, west);
    const b = roadTileOf(s, east);
    const both = () => { s.road[a] = RoadType.Cobble; s.road[b] = RoadType.Cobble; return computeLedger(s); };
    const one = () => { s.road[a] = RoadType.Track; s.road[b] = RoadType.Cobble; return computeLedger(s); };
    const l2 = both();
    const l1 = one();
    expect(l2.taxMarket).toBeGreaterThan(0);
    expect(l1.taxMarket / l2.taxMarket).toBeCloseTo(0.95, 3);
    expect(l1.taxCraft).toBe(l2.taxCraft);
    expect(l1.taxHearth).toBe(l2.taxHearth);
    s.day = 10; // the mud: 0.9 of both cobbled
    expect(one().taxMarket / both().taxMarket).toBeCloseTo(0.9, 3);
    s.day = 40;
    s.road[a] = RoadType.Lantern; s.lit[a] = 1; s.road[b] = RoadType.Cobble;
    expect(computeLedger(s).taxMarket / l2.taxMarket).toBeCloseTo(1.05, 3);
  });
});

describe('The bot paves its market doors', () => {
  it('cobbles one track-side door a day from Market Town, the nearest its centre first, when the treasury holds it; not before, not when poor', () => {
    const { s, west, east } = street();
    const bot = new Bot(s);
    const pave = () => (bot as unknown as { paveDoors: () => void }).paveDoors();
    const a = roadTileOf(s, west);
    const b = roadTileOf(s, east);
    s.milestone = 0;
    pave();
    expect(bot.doorsPaved).toBe(0);
    expect(s.road[a]).toBe(RoadType.Track);
    s.milestone = 1;
    s.treasury = 100;
    pave();
    expect(bot.doorsPaved).toBe(0);
    s.treasury = 5000;
    const t0 = s.treasury;
    pave();
    expect(bot.doorsPaved).toBe(1);
    expect([s.road[a], s.road[b]].filter((r) => r === RoadType.Cobble).length).toBe(1);
    expect(s.treasury).toBeLessThan(t0);
    pave();
    expect(bot.doorsPaved).toBe(2);
    expect(s.road[a]).toBe(RoadType.Cobble);
    expect(s.road[b]).toBe(RoadType.Cobble);
    pave();
    expect(bot.doorsPaved).toBe(2); // nothing left to pave
    expect(marketRoadMultAt(s, a)).toBe(1);
  });
});
