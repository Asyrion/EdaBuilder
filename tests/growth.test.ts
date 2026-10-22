/** How the town grows and runs day to day: the core loop over days, craft works and markets, a busy market town, unrest
 *  and halls, services with staff and stakes, the audit's sweep of fixes, construction by builders, and the quest counters. */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createGame, placeBuildingRaw, seasonOf, timeOfDay, kinReach } from '../src/sim/world';
import { run, recomputeAll, tick } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath, paintDistrict } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Zone, AgentKind, DAYS_PER_SEASON, idx } from '../src/sim/types';
import { serialize, deserialize } from '../src/sim/save';
import { computeLedger, checkMilestones } from '../src/sim/economy';
import { findPath, dailyAgents, marketStockCap } from '../src/sim/agents';
import { dailyBuildings, craftStockCap, HOSPICE_DRAUGHTS, IDLE_SCHOLARS, grandAcademyBonus, idleScholars, theftAt, computeBuildingHappiness, happinessTerms, levelUpNeeds, demandReasons, updateDemand, dailyTrade, trySpawnBuildings, growthBlock } from '../src/sim/growth';
import { edictUpkeep, EDICT_BY_KEY } from '../src/sim/edicts';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { updateCoverage, crewFactor, landBonusMap, landValueTerms, updateLandValue, DEATHCARE_LV } from '../src/sim/services';
import { WARD_BURN, dailyDeath, dailyGloam, greyInReach, wardBurnBudget, dailySurge } from '../src/sim/hazards';
import { BASE_RATE, buildDaysFor, builderTarget, builders, buildersAt, construction, dailyConstruction, sites, tickConstruction } from '../src/sim/construction';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

// The core loop: a town grows, collects taxes, stays finite, saves and loads.
function town(seed = 42) {
  const s = createGame(seed, 'T');
  const f = s.founding;
  const sx = f.x + 2;
  const sy = f.y + 1;
  flatten(s, sx - 12, sy - 2, sx + 12, sy + 12);
  for (let k = 0; k < 3; k++) buildRoad(s, RoadType.Track, roadPath(sx - 10, sy + k * 5, sx + 10, sy + k * 5, false));
  for (let k = 0; k < 3; k++) buildRoad(s, RoadType.Track, roadPath(sx - 10 + k * 10, sy, sx - 10 + k * 10, sy + 10, true));
  paintZone(s, Zone.Hearth, sx - 9, sy + 1, sx + 9, sy + 4);
  paintZone(s, Zone.Market, sx - 9, sy + 6, sx + 9, sy + 6);
  paintZone(s, Zone.Craft, sx - 9, sy + 7, sx + 9, sy + 9);
  placeBuilding(s, 'well', sx - 11, sy + 1);
  placeBuilding(s, 'well', sx + 11, sy + 6);
  placeBuilding(s, 'spire', sx - 4, sy + 1);
  placeBuilding(s, 'spire', sx + 4, sy + 6);
  return s;
}

describe('simulation', () => {
  it('grows a town, collects taxes and stays finite over 60 days', () => {
    const s = town();
    run(s, TICKS_PER_DAY * 60);
    expect(s.population).toBeGreaterThan(60);
    expect(s.milestone).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(s.treasury)).toBe(true);
    expect(Number.isFinite(s.happiness)).toBe(true);
    const l = computeLedger(s);
    expect(l.taxHearth).toBeGreaterThan(0);
    for (const b of s.buildings) if (b) expect(Number.isFinite(b.happiness)).toBe(true);
    expect(s.agents.length).toBeGreaterThan(10);
  });
  it('is deterministic', () => {
    const a = town(7);
    const b = town(7);
    run(a, TICKS_PER_DAY * 20);
    run(b, TICKS_PER_DAY * 20);
    expect(serialize(a)).toEqual(serialize(b));
  });
  it('round-trips through save/load and keeps simulating identically', () => {
    const a = town(9);
    run(a, TICKS_PER_DAY * 12 + 37);
    const json = serialize(a);
    const b = deserialize(json, (seed) => createGame(seed));
    expect(b.population).toBe(a.population);
    expect(b.treasury).toBe(a.treasury);
    expect(b.buildings.filter(Boolean).length).toBe(a.buildings.filter(Boolean).length);
    run(a, 500);
    run(b, 500);
    expect(b.population).toBe(a.population);
    expect(b.tick).toBe(a.tick);
  });
  it('goes bankrupt when upkeep is impossible', () => {
    const s = createGame(3, 'Broke');
    s.treasury = -9000;
    run(s, TICKS_PER_DAY * 6);
    expect(s.gameOver).toMatch(/Charter/);
  });
  it('finds paths along roads and not across grass', () => {
    const s = town();
    const f = s.founding;
    const sx = f.x + 2;
    const sy = f.y + 1;
    const a = (sx - 10) + (sy) * s.w;
    const b = (sx + 10) + (sy + 10) * s.w;
    const p = findPath(s, a, b);
    expect(p).not.toBeNull();
    expect(p![0]).toBe(a);
    expect(p![p!.length - 1]).toBe(b);
    for (const t of p!) expect(s.road[t]).toBeGreaterThan(0);
    expect(findPath(s, a, a + 3 * s.w + 1)).toBeNull();
  });
});

// Goods: craft works, carts, markets, seasons and the ledger.
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

// Phase 2-1 of the scope reset: every zoned tile has one reason it grows or not, and growth draws only among lots that can.
describe('why a lot grows or not, and growth from the lots that can', () => {
  const lot = (s: ReturnType<typeof town>, dx: number, dy: number) => idx(s.founding.x + 2 + dx, s.founding.y + 1 + dy);
  it('names one reason per lot: ok, no road, no demand, the Gloam, an Arcane lot without school; a dark house', () => {
    const s = town();
    recomputeAll(s);
    const near = lot(s, -5, 1), far = lot(s, -5, 2);
    s.demand.hearth = 0.5;
    expect(growthBlock(s, near)).toBe('ok');
    expect(growthBlock(s, far)).toBe('noRoad');
    s.demand.hearth = 0;
    expect(growthBlock(s, near)).toBe('noDemand');
    s.demand.hearth = 0.5;
    s.gloam[near] = 1;
    expect(growthBlock(s, near)).toBe('gloam');
    s.gloam[near] = 0;
    s.zone[near] = Zone.Arcane;
    s.demand.arcane = 0.5;
    s.coverage.school[near] = 0;
    expect(growthBlock(s, near)).toBe('noSchool');
    s.coverage.school[near] = 200;
    expect(growthBlock(s, near)).toBe('ok');
    s.zone[near] = Zone.Hearth;
    const b = placeBuildingRaw(s, 'hearth', s.founding.x - 3, s.founding.y + 2);
    s.landValue[idx(b.x, b.y)] = 100;
    b.lit = false; b.watered = true; b.happiness = 80;
    expect(growthBlock(s, idx(b.x, b.y))).toBe('dark');
    b.lit = true;
    expect(growthBlock(s, idx(b.x, b.y))).toBe('ok');
    b.level = 3;
    expect(growthBlock(s, idx(b.x, b.y))).toBe('top');
    expect(growthBlock(s, idx(s.founding.x + 2, s.founding.y + 1))).toBe('none'); // a road
  });

  it('a nearly full district still grows its last lot within a day at a small demand, and never where a lot cannot grow', () => {
    const s = town();
    recomputeAll(s);
    const open = lot(s, -5, 1), noRoad = lot(s, -5, 2);
    for (const i of refreshLots(s)) if (i !== open && i !== noRoad && s.zone[i] === Zone.Hearth && s.bIndex[i] < 0) placeBuildingRaw(s, 'hearth', i % 128, (i / 128) | 0);
    s.demand.hearth = 0.1; s.demand.market = 0; s.demand.craft = 0;
    let calls = 0;
    for (; calls < TICKS_PER_DAY / 10 && s.bIndex[open] < 0; calls++) trySpawnBuildings(s, 3);
    expect(s.bIndex[open]).toBeGreaterThanOrEqual(0);
    expect(s.bIndex[noRoad]).toBe(-1);
    // no lot left that can grow (the last one has no road, the other zones no demand): nothing grows, no draw is spent
    const before = s.buildings.length, rng = s.rngState;
    for (let k = 0; k < 200; k++) trySpawnBuildings(s, 3);
    expect(s.buildings.length).toBe(before);
    expect(s.rngState).toBe(rng);
  });
});

function refreshLots(s: ReturnType<typeof town>): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.zone.length; i++) if (s.zone[i]) out.push(i);
  return out;
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
    expect(markets.every((m) => m.stock <= marketStockCap(s, m))).toBe(true);
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

// A busy market town.
function townNine(seed = 101) {
  const s = createGame(seed, 'Nine');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 4, f.x + 18, f.y + 14);
  s.milestone = 5;
  s.treasury = 80000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 3, f.x + 16, f.y + 3, false));
  const markets = [];
  for (let x = f.x - 6; x <= f.x - 2; x++) { const m = placeBuildingRaw(s, 'market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  const crafts = [];
  for (let x = f.x + 9; x <= f.x + 12; x++) { const c = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); c.workers = 8; c.stock = 50; crafts.push(c); }
  recomputeAll(s);
  return { s, f, markets, crafts };
}

describe('A busy market town', () => {
  it('a long run with all of it stays finite', () => {
    const t = townNine(107);
    run(t.s, TICKS_PER_DAY * 4, { onDay: () => { for (const m of t.markets) m.stock = 20; } });
    for (const a of t.s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
    expect(t.s.gameOver).toBeNull();
  });
});

// Unrest with teeth, halls with a difference, the smaller rows (the riot, the consecrated shrine and the Carters' Yard
// are parked: scope reset phase 1c).
function townTeeth(seed = 41) {
  const s = createGame(seed, 'Teeth');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  s.sectors.fill(1);
  recomputeAll(s);
  return s;
}

describe('Unrest with teeth: theft and idle scholars', () => {

  it('theft takes a tenth of an unwatched shelf while the city is unquiet, and none under the Watch; idle scholars add unrest', () => {
    const s = townTeeth();
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
    const s = townTeeth();
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

  it("the Grand Academy's prices rise with schooling", () => {
    const s = townTeeth();
    const f = s.founding;
    expect(grandAcademyBonus(s)).toBe(1);
    const ga = placeBuildingRaw(s, 'grandacademy', f.x + 4, f.y - 6); ok(ga); ga.lit = true;
    s.educated = 0.35;
    expect(grandAcademyBonus(s)).toBe(1);
    s.educated = 0.62;
    expect(grandAcademyBonus(s)).toBeCloseTo(1.1, 9);
  });
});

describe('The smaller rows', () => {
  it("the kin rings", () => {
    const s = townTeeth();
    const f = s.founding;
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

// Services with staff and stakes: crews, the breakdowns, deathcare in the open, wards with a budget.
function townStakes(seed = 41) {
  const s = createGame(seed, 'Stakes');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  s.sectors.fill(1);
  recomputeAll(s);
  return s;
}

describe('Crews', () => {
  it('a Watch House at half crew watches half as strong and says it is short-handed; a full one in full', () => {
    const s = townStakes();
    const f = s.founding;
    const wh = placeBuildingRaw(s, 'watchhouse', f.x + 4, f.y + 3); ok(wh); wh.lit = true;
    wh.workers = 10;
    expect(crewFactor(wh, s)).toBe(1);
    updateCoverage(s, 'watch');
    const full = s.coverage.watch[idx(f.x + 4, f.y + 6)];
    wh.workers = 5;
    expect(crewFactor(wh, s)).toBe(0.5);
    updateCoverage(s, 'watch');
    expect(s.coverage.watch[idx(f.x + 4, f.y + 6)]).toBeCloseTo(full / 2, -1);
    wh.workers = 1;
    expect(crewFactor(wh, s)).toBe(0.3); // never below three tenths
    // the daily fill staffs it from the city's hands
    s.population = 200;
    dailyBuildings(s);
    expect(wh.workers).toBeGreaterThan(0);
  });
});

describe('The breakdowns', () => {
  it('happiness and land value are the sums of their terms; the level-up needs name the unmet condition; the demand bars have reasons', () => {
    const s = townStakes();
    const f = s.founding;
    const h = placeBuildingRaw(s, 'hearth', f.x - 2, f.y + 1, 2); ok(h); h.residents = 6;
    placeBuildingRaw(s, 'shrine', f.x + 3, f.y - 2);
    placeBuildingRaw(s, 'craft', f.x + 1, f.y + 1, 2);
    for (const b of s.buildings) if (b && b.state === 'building') ok(b);
    s.unrest = 0.2;
    s.gloam[idx(f.x - 2, f.y - 4)] = 1;
    recomputeAll(s);
    const terms = happinessTerms(s, h);
    expect(terms.length).toBeGreaterThan(8);
    const sum = terms.reduce((v, x) => v + x.v, 0);
    expect(computeBuildingHappiness(s, h)).toBeCloseTo(Math.max(0, Math.min(100, sum)), 9);
    expect(terms.some((x) => x.label === 'unrest' && x.v < 0)).toBe(true);
    const i = idx(h.x, h.y);
    const lt = landValueTerms(s, i, landBonusMap(s));
    const lsum = lt.reduce((v, x) => v + x.v, 0);
    expect(s.landValue[i]).toBe(Math.max(0, Math.min(100, Math.round(lsum))));
    const needs = levelUpNeeds(s, h);
    expect(needs.map((n) => n.text).join(' ')).toMatch(/land value 62/);
    expect(needs.find((n) => /schooling/.test(n.text))!.met).toBe(false);
    h.level = 3;
    expect(levelUpNeeds(s, h)).toEqual([]);
    updateDemand(s);
    expect(demandReasons(s).length).toBe(4);
    expect(demandReasons(s)[0]).toMatch(/^Hearth:/);
  });
});

describe('Deathcare in the open', () => {
  it('the dead line counts the pipeline; the ground beside deathcare is worth 6 less', () => {
    const s = townStakes();
    const f = s.founding;
    const h = placeBuildingRaw(s, 'hearth', f.x - 4, f.y + 1, 3); ok(h); h.residents = 14;
    recomputeAll(s);
    const before = s.landValue[idx(f.x + 6, f.y + 1)];
    const by = placeBuildingRaw(s, 'boneyard', f.x + 6, f.y - 2); ok(by); by.workers = 3;
    updateLandValue(s);
    expect(s.landValue[idx(f.x + 6, f.y + 1)]).toBe(before - DEATHCARE_LV);
    s.population = 1000; s.health = 0.5; s.unquieted = 5;
    dailyDeath(s);
    expect(s.quietCap).toBeCloseTo(12, 5);
    expect(s.quietedToday).toBeGreaterThan(0);
    expect(s.waitingDead).toBeCloseTo(s.unquieted, 9);
  });
});

describe('Wards with a budget', () => {
  it('a Ward Lantern burns 12 of the nearest grey tiles a day', () => {
    const s = townStakes();
    const f = s.founding;
    const ward = placeBuildingRaw(s, 'wardlantern', f.x + 8, f.y - 4); ok(ward); ward.lit = true;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (Math.abs(dx) + Math.abs(dy) >= 2) s.gloam[idx(f.x + 8 + dx, f.y - 4 + dy)] = 1;
    const grey0 = greyInReach(s, ward);
    expect(grey0).toBeGreaterThan(40);
    expect(wardBurnBudget(s, ward)).toBe(WARD_BURN);
    s.day = 1; // not a creep day
    dailyGloam(s);
    expect(grey0 - greyInReach(s, ward)).toBe(WARD_BURN);
    // the nearest went first: the ring beside the ward is clear, and only 8 of the 20 grey tiles within 2 remain
    let ring1 = 0;
    let near = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s.gloam[idx(f.x + 8 + dx, f.y - 4 + dy)]) { near++; if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) ring1++; }
    expect(ring1).toBe(0);
    expect(near).toBe(20 - WARD_BURN);
  });
});

// The audit's sweep: one `it` per group of AUDIT.md §1, each asserting the fixed behaviour.
function townSweep(seed = 41) {
  const s = createGame(seed, 'Sweep');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  s.milestone = 5;
  s.treasury = 50000;
  s.population = 300;
  return s;
}

describe('The sweep: timing and counting', () => {

  it('a Nexus store delays the surge count; the store drains by its deficit per day', () => {
    const s = townSweep();
    s.manaDemand = 300; s.manaSupply = 100; s.manaStorage = 50; s.manaStorageMax = 120;
    dailySurge(s);
    expect(s.overdrawDays).toBeLessThanOrEqual(0);
    s.manaStorage = 0; s.overdrawDays = 0;
    dailySurge(s);
    expect(s.overdrawDays).toBe(1);
  });
});

describe('The sweep: edicts and promises', () => {
  it('city-only edicts are not billed per district and are hidden from a district scope', () => {
    const s = townSweep();
    s.trade.importCost = 40;
    s.districtEdicts['1:imports'] = true;
    paintDistrict(s, 1, s.founding.x - 4, s.founding.y - 4, s.founding.x + 4, s.founding.y + 4);
    expect(EDICT_BY_KEY.imports.cityOnly).toBe(true);
    expect(edictUpkeep(s)).toBe(0);
    const h = placeBuildingRaw(s, 'hearth', s.founding.x - 2, s.founding.y + 1, 1); ok(h); h.residents = 4;
    s.districtEdicts['1:curfew'] = true;
    expect(edictUpkeep(s)).toBeGreaterThan(0); // a district edict with residents in it is billed; a city-only one never
  });

  it("a square's markets pay more, the Lantern delights the city, the Beacon needs the Lantern", () => {
    const s = townSweep();
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
    const s = townSweep();
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

  it('the Lantern of Vell delights', () => {
    expect(BUILDING_BY_KEY.lantern.desc).toMatch(/delights/);
  });
});

// Construction: build times, builders and sites. These tests switch instant construction off for their describe only.
function townBuilders(seed = 41) {
  const s = createGame(seed, 'Builders');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  s.milestone = 3;
  return s;
}

describe('Construction', () => {
  beforeAll(() => { construction.instant = false; });
  afterAll(() => { construction.instant = true; });
  it('build time follows cost; zone buildings take a day, wonders longer', () => {
    expect(buildDaysFor(BUILDING_BY_KEY.hearth)).toBe(1);
    expect(buildDaysFor(BUILDING_BY_KEY.well)).toBe(1);
    expect(buildDaysFor(BUILDING_BY_KEY.watchhouse)).toBeGreaterThanOrEqual(1);
    expect(buildDaysFor(BUILDING_BY_KEY.nexus)).toBe(4);
    expect(buildDaysFor(BUILDING_BY_KEY.lantern)).toBe(9);
  });

  it('a placed building is a site, inert until finished; the folk raise it slowly with nobody there', () => {
    const s = townBuilders();
    const f = s.founding;
    const r = placeBuilding(s, 'watchhouse', f.x + 9, f.y + 3);
    expect(r.ok).toBe(true);
    const b = s.buildings.find((x) => x && x.kind === 'watchhouse')!;
    expect(b.state).toBe('building');
    expect(b.work).toBe(buildDaysFor(BUILDING_BY_KEY.watchhouse) * TICKS_PER_DAY);
    recomputeAll(s);
    expect(s.coverage.watch[idx(f.x + 9, f.y + 3)]).toBe(0); // no service yet
    expect(activeQuests(s, 100).find((q) => q.id === 'g_watch' || q.title.toLowerCase().includes('watch'))?.done(s) ?? false).toBe(false);
    s.agents = s.agents.filter((a) => a.kind !== AgentKind.Builder);
    const w0 = b.work;
    tickConstruction(s);
    expect(w0 - b.work).toBeCloseTo(BASE_RATE, 5);
    expect(buildersAt(s, b)).toEqual({ assigned: 0, present: 0 });
  });

  it('builders come from the Founding Stake, walk the road to the site, work it down and go home', () => {
    const s = townBuilders();
    const f = s.founding;
    expect(builderTarget(s)).toBe(2);
    dailyConstruction(s);
    expect(builders(s).length).toBe(2);
    placeBuilding(s, 'well', f.x + 6, f.y + 3);
    const b = s.buildings.find((x) => x && x.kind === 'well')!;
    tickConstruction(s);
    const ba = buildersAt(s, b);
    expect(ba.assigned).toBe(2);
    expect(ba.present).toBe(0);
    for (let t = 0; t < 400 && buildersAt(s, b).present < 2; t++) tickConstruction(s);
    expect(buildersAt(s, b).present).toBe(2);
    const w0 = b.work;
    tickConstruction(s);
    expect(w0 - b.work).toBeCloseTo(2 + BASE_RATE, 5); // two hands plus the folk
    for (let t = 0; t < TICKS_PER_DAY && b.state === 'building'; t++) tickConstruction(s);
    expect(b.state).toBe('ok');
    expect(sites(s).length).toBe(0);
    expect(builders(s).every((a) => a.targetId === -1 && a.phase === 0)).toBe(true);
    expect(s.messages.some((m) => m.text.includes('is finished'))).toBe(true);
    // more folk, more builders; never above ten
    s.population = 2000;
    dailyConstruction(s);
    expect(builders(s).length).toBe(10);
    s.population = 0;
    dailyConstruction(s);
    expect(builders(s).length).toBe(2);
  });

  it('spawned zone buildings rise too, three builders at most per site, and the whole thing survives a save', () => {
    const s = townBuilders();
    const f = s.founding;
    for (let x = f.x - 6; x <= f.x + 6; x++) { s.zone[idx(x, f.y + 3)] = 1; s.zone[idx(x, f.y + 1)] = 1; }
    s.zoneListDirty = true;
    recomputeAll(s);
    trySpawnBuildings(s, 20);
    const homes = s.buildings.filter((b) => b && b.kind === 'hearth');
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.every((b) => b!.state === 'building')).toBe(true);
    s.population = 2000;
    dailyConstruction(s);
    for (let t = 0; t < 60; t++) tickConstruction(s);
    for (const h of homes) expect(buildersAt(s, h!).assigned).toBe(0); // the folk raise their own homes
    expect(homes[0]!.work).toBe(homes[0]!.workTotal - 60);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.agents.filter((a) => a.kind === AgentKind.Builder).length).toBe(10);
    expect(r.buildings.filter((b) => b && b.state === 'building').length).toBe(homes.length);
    run(r, TICKS_PER_DAY * 2);
    expect(r.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok').length).toBeGreaterThan(0);
    void tick; void placeBuildingRaw;
  });
});

// Quest counters: a brownout that ends without a surge counts as survived.
describe('Quest counters', () => {
  it('a brownout that ends without a surge counts as survived', () => {
    const s = createGame(3, 'B');
    s.manaDemand = 500; s.manaSupply = 100;
    dailySurge(s);
    dailySurge(s);
    expect(s.overdrawDays).toBe(2);
    s.manaDemand = 50;
    dailySurge(s);
    expect(s.stats.brownoutsSurvived).toBe(1);
    dailySurge(s);
    expect(s.stats.brownoutsSurvived).toBe(1);
  });
});
