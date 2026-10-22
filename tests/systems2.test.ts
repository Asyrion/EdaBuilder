import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, seasonOf, timeOfDay } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { AgentKind, DAYS_PER_SEASON, RoadType, TICKS_PER_DAY, Zone } from '../src/sim/types';
import { dailyBuildings, craftStockCap } from '../src/sim/growth';
import { dailyAgents, marketStockCap } from '../src/sim/agents';
import { computeLedger } from '../src/sim/economy';
import { edictUpkeep } from '../src/sim/edicts';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function works(seed = 31) {
  const s = createGame(seed, 'Goods');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 4, f.x + 14, f.y + 10);
  buildRoad(s, RoadType.Track, roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  const crafts = [];
  const markets = [];
  for (let x = f.x - 11; x <= f.x - 6; x++) { const b = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); b.workers = 8; crafts.push(b); }
  for (let x = f.x + 6; x <= f.x + 11; x++) { const b = placeBuildingRaw(s, 'market', x, f.y + 4, 2); b.workers = 6; markets.push(b); }
  for (let x = f.x - 5; x <= f.x + 5; x++) { const b = placeBuildingRaw(s, 'hearth', x, f.y + 2, 2); b.residents = 8; }
  s.population = 88;
  recomputeAll(s);
  return { s, crafts, markets };
}

describe('goods flow', () => {
  it('craft works fill up and carts deliver to markets', () => {
    const { s, crafts, markets } = works();
    run(s, TICKS_PER_DAY * 2);
    expect(crafts.some((c) => c.stock > 0)).toBe(true);
    run(s, TICKS_PER_DAY * 4);
    const carts = s.agents.filter((a) => a.kind === AgentKind.Cart);
    expect(carts.length).toBeGreaterThan(0);
    const delivered = markets.reduce((n, m) => n + m.stock, 0);
    expect(delivered).toBeGreaterThan(0);
    expect(markets.every((m) => m.stock <= marketStockCap(m))).toBe(true);
    expect(crafts.every((c) => c.stock >= 0 && c.stock <= craftStockCap(c))).toBe(true);
  });
  it('markets with no craft works run dry and complain', () => {
    const s = createGame(32, 'Dry');
    const f = s.founding;
    flatten(s, f.x - 14, f.y - 4, f.x + 14, f.y + 10);
    buildRoad(s, RoadType.Track, roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
    const m = placeBuildingRaw(s, 'market', f.x, f.y + 4, 1);
    m.workers = 3;
    m.stock = 5;
    recomputeAll(s);
    for (let d = 0; d < 5; d++) dailyBuildings(s);
    expect(m.stock).toBe(0);
    expect(s.goodsShort).toBeGreaterThanOrEqual(1);
  });
});

describe('seasons', () => {
  it('cycle every 30 days and the Hush has longer nights', () => {
    const s = createGame(33, 'Hush');
    expect(seasonOf(s)).toBe(0);
    s.day = DAYS_PER_SEASON * 3;
    expect(seasonOf(s)).toBe(3);
    // count daylight ticks (timeOfDay within 0.27..0.73) across a day in Thaw vs Hush
    const light = (day: number) => {
      s.day = day;
      let n = 0;
      for (let t = 0; t < TICKS_PER_DAY; t++) { s.tick = day * TICKS_PER_DAY + t; const tod = timeOfDay(s); if (tod > 0.27 && tod < 0.73) n++; }
      return n;
    };
    expect(light(DAYS_PER_SEASON * 3 + 1)).toBeLessThan(light(1));
  });
});

describe('edicts', () => {
  it('edicts cost upkeep and change the ledger', () => {
    const { s } = works(35);
    run(s, TICKS_PER_DAY);
    const base = computeLedger(s).net;
    s.edicts.curfew = true;
    s.edicts.draughts = true;
    expect(edictUpkeep(s)).toBeGreaterThan(0);
    expect(computeLedger(s).net).toBeLessThan(base);
  });
  it('round-trips edicts and stock through save/load', () => {
    const { s } = works(36);
    run(s, TICKS_PER_DAY * 3);
    s.edicts.rites = true;
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.edicts.rites).toBe(true);
    const stockA = s.buildings.filter(Boolean).map((x) => Math.round(x!.stock * 100));
    const stockB = b.buildings.filter(Boolean).map((x) => Math.round(x!.stock * 100));
    expect(stockB).toEqual(stockA);
  });
});
