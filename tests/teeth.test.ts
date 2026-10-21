// Iteration 48, M14 part 2b: unrest with teeth, halls with a difference, the smaller rows (the riot, the consecrated shrine and
// the Carters' Yard are parked: scope reset phase 1c).
import { describe, expect, it } from 'vitest';
import { createGame, kinReach, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { EDUCATED_FLOOR_CAP, HOSPICE_DRAUGHTS, IDLE_SCHOLARS, dailyBuildings, dailyTrade, grandAcademyBonus, idleScholars, theftAt } from '../src/sim/growth';
import { updateCoverage } from '../src/sim/services';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Teeth', 'valley');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  s.sectors.fill(1);
  recomputeAll(s);
  return s;
}
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

describe('Unrest with teeth: theft and idle scholars', () => {

  it('theft takes a tenth of an unwatched shelf while the city is unquiet, and none under the Watch; idle scholars add unrest', () => {
    const s = town();
    const f = s.founding;
    const m = placeBuildingRaw(s, 'market', f.x - 2, f.y + 1, 1); ok(m); m.workers = 0; m.stock = 20;
    recomputeAll(s);
    s.coverage.watch.fill(0);
    s.unrest = 0.4;
    expect(theftAt(s, m)).toBe(true);
    dailyBuildings(s);
    expect(m.stock).toBeCloseTo(20 * 0.9 - 1, 5); // a tenth stolen, then the day's sale of one
    expect(s.stats.goodsStolen).toBeCloseTo(2, 5);
    s.coverage.watch.fill(200);
    expect(theftAt(s, m)).toBe(false);
    s.unrest = 0.1; s.coverage.watch.fill(0);
    expect(theftAt(s, m)).toBe(false);
    // idle scholars
    s.population = 400; s.educated = 0.6;
    expect(idleScholars(s)).toBe(true);
    for (let k = 0; k < 10; k++) { const a = placeBuildingRaw(s, 'arcane', f.x + 2 + k, f.y + 1, 3); ok(a); }
    expect(idleScholars(s)).toBe(false);
    expect(IDLE_SCHOLARS).toBe(0.05);
  });
});

describe('Halls with a difference', () => {
  it('the Hospice draws draughts and heals at six tenths without; a dry fire hall is half; a shrine reaches 8', () => {
    const s = town();
    const f = s.founding;
    const h = placeBuildingRaw(s, 'hospice', f.x + 4, f.y + 3); ok(h); h.lit = true; h.workers = 16; h.stock = 0;
    const m = placeBuildingRaw(s, 'market', f.x - 4, f.y + 1, 1); ok(m); m.stock = 10; m.workers = 0;
    recomputeAll(s);
    updateCoverage(s, 'health');
    const dry = s.coverage.health[idx(f.x + 4, f.y + 6)];
    dailyBuildings(s);
    expect(h.stock).toBe(1); // drew 2, used 1
    expect(m.stock).toBeCloseTo(10 - 2 - 1, 5);
    h.workers = 16; // the day's job round found no folk for the crew
    updateCoverage(s, 'health');
    expect(s.coverage.health[idx(f.x + 4, f.y + 6)]).toBeCloseTo(dry / 0.6, -1);
    expect(HOSPICE_DRAUGHTS).toBe(10);
    // the fire hall
    const v = placeBuildingRaw(s, 'veshari', f.x + 10, f.y + 3); ok(v); v.lit = true; v.workers = 8;
    v.watered = true; updateCoverage(s, 'fire');
    const wet = s.coverage.fire[idx(f.x + 10, f.y + 6)];
    v.watered = false; updateCoverage(s, 'fire');
    expect(s.coverage.fire[idx(f.x + 10, f.y + 6)]).toBeCloseTo(wet / 2, -1);
    // the shrine
    const sh = placeBuildingRaw(s, 'shrine', f.x - 10, f.y + 3); ok(sh); sh.workers = 2;
    updateCoverage(s, 'faith');
    expect(s.coverage.faith[idx(f.x - 10, f.y + 3 + 11)]).toBe(0); // 8 tiles
  });

  it("the Grand Academy's prices rise with schooling; an Academy studies a loose relic every five days for a lasting floor", () => {
    const s = town();
    const f = s.founding;
    expect(grandAcademyBonus(s)).toBe(1);
    const ga = placeBuildingRaw(s, 'grandacademy', f.x + 4, f.y - 6); ok(ga); ga.lit = true;
    s.educated = 0.35;
    expect(grandAcademyBonus(s)).toBe(1);
    s.educated = 0.62;
    expect(grandAcademyBonus(s)).toBeCloseTo(1.1, 9);
    s.relicStock = 3; s.day = 5;
    dailyBuildings(s);
    expect(s.relicStock).toBe(2);
    expect(s.educatedFloor).toBeCloseTo(0.01, 9);
    expect(ga.progress).toBe(1);
    s.day = 6; dailyBuildings(s);
    expect(s.relicStock).toBe(2); // not every day
    s.educatedFloor = EDUCATED_FLOOR_CAP; s.day = 10; dailyBuildings(s);
    expect(s.relicStock).toBe(2); // the floor is full
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.educatedFloor).toBe(EDUCATED_FLOOR_CAP);
  });
});

describe('The smaller rows', () => {
  it("the Gloam road sells the lodge's hides; the kin rings", () => {
    const s = town();
    const f = s.founding;
    const lodge = placeBuildingRaw(s, 'hunterslodge', f.x + 6, f.y + 3); ok(lodge); lodge.stock = 5;
    const depot = placeBuildingRaw(s, 'depot', f.x - 6, f.y - 2); ok(depot);
    const pelts = lodge.stock;
    dailyTrade(s);
    expect(s.trade.exported).toBeCloseTo(Math.min(8, pelts), 5);
    expect(lodge.stock).toBeCloseTo(pelts - Math.min(8, pelts), 5);
    // the rings a new spire would join: every node and lit relay; a new well: every well
    const sp = placeBuildingRaw(s, 'spire', f.x + 3, f.y - 2); ok(sp);
    recomputeAll(s);
    const rings = kinReach(s, BUILDING_BY_KEY.spire);
    expect(rings.length).toBe(s.nodes.length + s.buildings.filter((b) => b && b.lit && (b.kind === 'spire' || b.kind === 'stake')).length);
    expect(rings.some((r) => r.cx === sp.x && r.cy === sp.y && r.r === 6)).toBe(true);
    const well = placeBuildingRaw(s, 'well', f.x - 8, f.y + 4); ok(well);
    expect(kinReach(s, BUILDING_BY_KEY.well).some((r) => r.cx === well.x && r.cy === well.y)).toBe(true);
    expect(kinReach(s, BUILDING_BY_KEY.watchpost).length).toBe(1); // the Founding Stake keeps a small watch
    expect(kinReach(s, BUILDING_BY_KEY.academy).length).toBe(0);
  });
});
