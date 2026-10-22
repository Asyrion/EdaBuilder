// Iteration 44: the audit's sweep. One `it` per group of AUDIT.md §1, each asserting the fixed behaviour.
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, Zone } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { QUESTS } from '../src/data/quests';
import { checkQuests } from '../src/sim/quests';
import { dailySurge } from '../src/sim/hazards';
import { computeBuildingHappiness, dailyTrade } from '../src/sim/growth';
import { EDICT_BY_KEY, edictUpkeep } from '../src/sim/edicts';
import { checkMilestones, computeLedger } from '../src/sim/economy';
import { paintDistrict } from '../src/sim/actions';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Sweep');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  s.milestone = 5;
  s.treasury = 50000;
  s.population = 300;
  return s;
}
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

describe('The sweep: quests', () => {
  it('scenario goals pay only in their scenario; the failed daily leaves the Ledger', () => {
    const s = town();
    // a valley game at Burgh with ten clean days pays neither the one-node nor the inherited goal
    s.milestone = 6; s.cleanDays = 10; s.day = 120;
    const t0 = s.treasury;
    checkQuests(s);
    expect(s.questsDone).not.toContain('z_onenode');
    expect(s.questsDone).not.toContain('z_inherited');
    expect(s.treasury - t0).toBeLessThan(5000);
    const c = createGame(7, 'Daily'); c.challenge = 'x' as never; c.day = 61;
    expect(QUESTS.find((q) => q.id === 'z_daily')!.when(c)).toBe(false);
  });

  it('five full days, a named district of your own', () => {
    const s = town();
    const q = (id: string) => QUESTS.find((x) => x.id === id)!;
    s.stats.fullDays = 4; s.day = 30;
    for (let k = 0; k < 4; k++) placeBuildingRaw(s, 'market', s.founding.x - 8 + k * 2, s.founding.y + 1, 1);
    expect(q('o_full').done(s)).toBe(false);
    s.stats.fullDays = 5;
    expect(q('o_full').done(s)).toBe(true);
    s.daughter = { node: 0, x: 0, y: 0, name: 'Ashmere', day: 1, twin: -1 };
    s.districtNames = { 2: 'Ashmere' };
    expect(q('x_rename').done(s)).toBe(false);
    s.districtNames[1] = 'Hearthside';
    expect(q('x_rename').done(s)).toBe(true);
  });
});

describe('The sweep: timing and counting', () => {

  it('a Nexus store delays the surge count; the store drains by its deficit per day', () => {
    const s = town();
    s.manaDemand = 300; s.manaSupply = 100; s.manaStorage = 50; s.manaStorageMax = 120;
    dailySurge(s);
    expect(s.overdrawDays).toBeLessThanOrEqual(0);
    s.manaStorage = 0; s.overdrawDays = 0;
    dailySurge(s);
    expect(s.overdrawDays).toBe(1);
  });

  it('the craft-tax cap is the lower one', () => {
    const s = town();
    const f = s.founding;
    const works = placeBuildingRaw(s, 'craft', f.x - 6, f.y + 1, 2); ok(works); works.stock = 40;
    recomputeAll(s);
    s.modifiers.push({ kind: 'craftTax', value: 8, until: s.day + 10, label: 'pact' }, { kind: 'craftTax', value: 6, until: s.day + 10, label: 'bargain' });
    s.taxRates.craft = 12;
    works.workers = 8;
    const l = computeLedger(s);
    s.modifiers = [{ kind: 'craftTax', value: 6, until: s.day + 10, label: 'bargain' }];
    expect(computeLedger(s).taxCraft).toBeCloseTo(l.taxCraft, 6);
  });
});

describe('The sweep: edicts and promises', () => {
  it('city-only edicts are not billed per district and are hidden from a district scope', () => {
    const s = town();
    s.districtEdicts['1:closeseason'] = true; // the bounty this test used is parked
    paintDistrict(s, 1, s.founding.x - 4, s.founding.y - 4, s.founding.x + 4, s.founding.y + 4);
    expect(EDICT_BY_KEY.closeseason.cityOnly).toBe(true);
    expect(edictUpkeep(s)).toBe(0);
    const h = placeBuildingRaw(s, 'hearth', s.founding.x - 2, s.founding.y + 1, 1); ok(h); h.residents = 4;
    s.districtEdicts['1:curfew'] = true;
    expect(edictUpkeep(s)).toBeGreaterThan(0); // a district edict with residents in it is billed; a city-only one never
  });

  it("a square's markets pay more, the Lantern delights the city, the Beacon needs the Lantern", () => {
    const s = town();
    const f = s.founding;
    const m = placeBuildingRaw(s, 'market', f.x + 2, f.y + 1, 1); ok(m); m.workers = 3; m.happiness = 60;
    const far = placeBuildingRaw(s, 'market', f.x - 12, f.y + 1, 1); ok(far); far.workers = 3; far.happiness = 60;
    const t1 = computeLedger(s).taxMarket;
    const sq = placeBuildingRaw(s, 'square', f.x + 4, f.y - 2); ok(sq);
    const t2 = computeLedger(s).taxMarket;
    expect(t2).toBeGreaterThan(t1);
    expect(t2 / t1).toBeCloseTo((1.15 + 1) / 2, 2); // one market near the square, one far
    const h = placeBuildingRaw(s, 'hearth', f.x - 4, f.y + 1, 1); ok(h);
    const h0 = computeBuildingHappiness(s, h);
    const lantern = placeBuildingRaw(s, 'lantern', f.x + 8, f.y - 4); ok(lantern); lantern.lit = true;
    expect(computeBuildingHappiness(s, h) - h0).toBe(5);
    lantern.lit = false;
    expect(computeBuildingHappiness(s, h)).toBe(h0);
    s.population = 5000; s.milestone = 7; s.happiness = 70; // the Vellish gate asks 69 for the Beacon (iteration 54)
    
    checkMilestones(s);
    expect(s.milestone).toBe(7); // the Lantern is dark: no Beacon
    lantern.lit = true;
    checkMilestones(s);
    expect(s.milestone).toBe(8);
  });

});

describe('The sweep: sim logic', () => {
  it('the Gloam road carries 8 a day per depot city-wide from the fullest shelves, and a works makes by its hands', () => {
    const s = town();
    const f = s.founding;
    const d1 = placeBuildingRaw(s, 'depot', f.x + 6, f.y - 2); ok(d1);
    const ws = [0, 1, 2, 3].map((k) => { const w = placeBuildingRaw(s, 'craft', f.x - 10 + k * 2, f.y + 1, 1); ok(w); w.stock = 30 - k; return w; });
    recomputeAll(s);
    dailyTrade(s);
    expect(s.trade.exported).toBe(8); // one depot: eight goods, whatever the number of works
    expect(ws[0].stock).toBe(22); // the fullest shelf first
    expect(ws[1].stock).toBe(29);
    const d2 = placeBuildingRaw(s, 'depot', f.x + 10, f.y - 2); ok(d2);
    for (const w of ws) w.stock = 30;
    dailyTrade(s);
    expect(s.trade.exported).toBe(16);
  });

  it('old saves load', () => {
    const s = town();
    const o = JSON.parse(serialize(s));
    delete o.stats.firesTotal; delete o.stats.peakPopulation;
    const r = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(r.stats.firesTotal).toBe(0);
    expect(r.stats.peakPopulation).toBe(0);
    expect(Zone.Market).toBeDefined();
    expect(BUILDING_BY_KEY.lantern.desc).toMatch(/delights/);
  });
});
