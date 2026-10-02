import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, TICKS_PER_DAY, Zone, idx } from '../src/sim/types';
import { buildRoad, paintDistrict, roadPath } from '../src/sim/actions';
import { computeBuildingHappiness, dailyBuildings } from '../src/sim/growth';
import { marketStockCap } from '../src/sim/agents';
import { computeLedger } from '../src/sim/economy';
import { QUARTERS, DISTRICT_UNLOCK, quarterAt, setQuarter } from '../src/sim/districts';
import { serialize, deserialize } from '../src/sim/save';
import { QUESTS } from '../src/data/quests';
import { Bot } from '../src/sim/bot';
import { flatten } from './helpers';

function town() {
  const s = createGame(41, 'Quarterwick');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 12);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y - 3, f.x + 14, f.y - 3, false));
  s.treasury = 50000;
  s.milestone = 3;
  return s;
}
/** The east half is district 1; the west half stays unpainted. */
function split(s: ReturnType<typeof town>) {
  const f = s.founding;
  paintDistrict(s, 1, f.x + 1, f.y - 10, f.x + 15, f.y + 10);
  return f;
}

describe('District charters', () => {
  it('a Hearth quarter raises land value and the hearths, and slows the works', () => {
    const s = town();
    const f = split(s);
    const hIn = placeBuildingRaw(s, 'hearth', f.x + 4, f.y + 1); hIn.residents = 4;
    const hOut = placeBuildingRaw(s, 'hearth', f.x - 4, f.y + 1); hOut.residents = 4;
    const cIn = placeBuildingRaw(s, 'craft', f.x + 6, f.y + 1); cIn.workers = 4;
    const cOut = placeBuildingRaw(s, 'craft', f.x - 6, f.y + 1); cOut.workers = 4;
    recomputeAll(s);
    const lv0 = s.landValue[idx(hIn.x, hIn.y)];
    const h0 = computeBuildingHappiness(s, hIn);
    setQuarter(s, 1, 'hearth');
    recomputeAll(s);
    expect(quarterAt(s, idx(hIn.x, hIn.y))).toBe('hearth');
    expect(quarterAt(s, idx(hOut.x, hOut.y))).toBeNull();
    expect(s.landValue[idx(hIn.x, hIn.y)] - lv0).toBe(6);
    expect(computeBuildingHappiness(s, hIn) - h0).toBeGreaterThanOrEqual(3);
    cIn.stock = 0; cOut.stock = 0; cIn.lit = cOut.lit = true;
    dailyBuildings(s);
    expect(cIn.stock).toBeCloseTo(cOut.stock * 0.8, 1);
  });

  it('a Craft quarter speeds the works and costs the hearths; a Market quarter widens the shelves and the tithe', () => {
    const s = town();
    const f = split(s);
    const cIn = placeBuildingRaw(s, 'craft', f.x + 6, f.y + 1); cIn.workers = 4;
    const cOut = placeBuildingRaw(s, 'craft', f.x - 6, f.y + 1); cOut.workers = 4;
    const hIn = placeBuildingRaw(s, 'hearth', f.x + 4, f.y + 1); hIn.residents = 4;
    recomputeAll(s);
    const h0 = computeBuildingHappiness(s, hIn);
    setQuarter(s, 1, 'craft');
    recomputeAll(s);
    expect(h0 - computeBuildingHappiness(s, hIn)).toBeGreaterThanOrEqual(4);
    cIn.stock = 0; cOut.stock = 0; cIn.lit = cOut.lit = true;
    dailyBuildings(s);
    expect(cIn.stock).toBeCloseTo(cOut.stock * 1.2, 1);
    // the market quarter
    const mIn = placeBuildingRaw(s, 'market', f.x + 8, f.y + 1, 2); mIn.workers = 4; mIn.happiness = 60;
    const mOut = placeBuildingRaw(s, 'market', f.x - 8, f.y + 1, 2); mOut.workers = 4; mOut.happiness = 60;
    s.day += 30; // each charter holds thirty days (iteration 54)
    setQuarter(s, 1, 'market');
    run(s, 1);
    expect(marketStockCap(mIn)).toBe(marketStockCap(mOut) * 1.5);
    const l = computeLedger(s);
    expect(l.taxMarket).toBeGreaterThan(0);
    s.day += 30;
    setQuarter(s, 1, null);
    run(s, 1);
    expect(marketStockCap(mIn)).toBe(marketStockCap(mOut));
    expect(computeLedger(s).taxMarket).toBeLessThan(l.taxMarket);
  });

  it("a Scholars' quarter speeds the enchanters and raises upkeep; a Temple quarter takes the market tithe", () => {
    const s = town(); s.milestone = 5; // the Scholars' charter opens at the Township, the Temple's at the Market Town (iteration 49)
    const f = split(s);
    const aIn = placeBuildingRaw(s, 'arcane', f.x + 6, f.y + 1); aIn.workers = 4; aIn.stock = 20; aIn.lit = true;
    const aOut = placeBuildingRaw(s, 'arcane', f.x - 6, f.y + 1); aOut.workers = 4; aOut.stock = 20; aOut.lit = true;
    placeBuildingRaw(s, 'watchpost', f.x + 10, f.y + 1);
    recomputeAll(s);
    const up0 = computeLedger(s).upkeepBuildings;
    setQuarter(s, 1, 'scholars');
    recomputeAll(s);
    expect(computeLedger(s).upkeepBuildings).toBeGreaterThan(up0);
    aIn.lit = aOut.lit = true;
    dailyBuildings(s);
    expect(20 - aIn.stock).toBeCloseTo((20 - aOut.stock) * 1.2, 2);
    const m = placeBuildingRaw(s, 'market', f.x + 8, f.y + 1, 2); m.workers = 4; m.happiness = 60;
    const t0 = computeLedger(s).taxMarket;
    expect(t0).toBeGreaterThan(0);
    s.day += 30;
    setQuarter(s, 1, 'temple');
    expect(computeLedger(s).taxMarket).toBe(0);
    expect(QUARTERS.length).toBe(5);
  });

  it('charters survive a save, an old save has none, and districts open at the Hamlet', () => {
    const s = town();
    split(s);
    setQuarter(s, 1, 'market');
    const t = deserialize(serialize(s), (seed) => createGame(seed));
    expect(t.districtQuarters[1]).toBe('market');
    const o = JSON.parse(serialize(s));
    delete o.districtQuarters;
    const u = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(u.districtQuarters).toEqual({});
    expect(DISTRICT_UNLOCK).toBe(1);
    const chapter = QUESTS.filter((q) => q.chapter === 'Districts');
    expect(chapter.map((q) => q.id)).toEqual(['x_paint', 'x_charter', 'x_pay', 'x_edict', 'x_rename']);
    expect(chapter[0].when({ ...s, milestone: 0 })).toBe(false);
    expect(chapter[1].done(s)).toBe(true);
    s.stats.quarterDays = 2;
    expect(chapter[2].done(s)).toBe(true);
  });

  it('the bot paints and charters its hearth square from the Village, once the ledger carries a crown a building', () => {
    const s = createGame(42, 'Botwick');
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 20, { onDay: () => bot.step() });
    expect(s.milestone).toBeGreaterThanOrEqual(3);
    // since iteration 55 the charter waits for a net of 800 a day and no goal being saved for
    s.ledger.net = 500; (bot as any).goal = null;
    (bot as any).charterDistricts();
    expect(s.districtQuarters[1]).toBeUndefined();
    s.ledger.net = 900;
    (bot as any).charterDistricts();
    run(s, TICKS_PER_DAY, { onDay: () => bot.step() });
    expect(s.districtQuarters[1]).toBe('hearth');
    let d1 = 0;
    for (let i = 0; i < s.district.length; i++) if (s.district[i] === 1) d1++;
    expect(d1).toBeGreaterThan(100);
    expect(s.stats.quarterDays).toBeGreaterThan(0);
    expect(Zone.Craft).toBeDefined();
  });
});
