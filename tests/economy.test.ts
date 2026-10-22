/** The economy pushes back: the Crown's levy, favour, interest and loan, the gates and the next-gate line, edicts as
 *  commitments, and charters with a price. (The daily challenge was parked in phase 1c-2; the weather, the chains, the ill
 *  tidings and the festivals were parked in the scope reset, phase 1c.) */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, TICKS_PER_DAY, idx } from '../src/sim/types';
import { buildRoad, paintDistrict, roadPath } from '../src/sim/actions';
import { DEBT_DAYS, FAVOUR_AUDIT, checkMilestones, computeLedger, crownLevy, dailyEconomy, debtLine, favourFactor, grantFor, levyDue, loanLimit, repayLoan, takeLoan } from '../src/sim/economy';
import { sectorCost } from '../src/sim/sectors';
import { updateMiasma } from '../src/sim/services';
import { EDICT_MIN_DAYS, EDICT_REPEAL, edictLocked, setEdict } from '../src/sim/edicts';
import { CHARTER_LOCK_DAYS, CHARTER_SMOKE_SPILL, TEMPLE_TITHE_SHARE, charterCostOf, charterHeld, charterUpkeep, setQuarter } from '../src/sim/districts';
import { VELLISH_HAPPINESS, gateMet, milestonesOf, nextGate } from '../src/data/factions';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 54) {
  const s = createGame(seed, 'Pushback');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 12);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  s.treasury = 50000;
  s.milestone = 3;
  return s;
}
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

describe('The Crown that wants', () => {
  it('levies five percent of the treasury above ten thousand each Thaw, less or more by its favour, and favour moves the sector prices', () => {
    const s = town();
    s.day = 120; s.treasury = 30000;
    expect(levyDue(s)).toBe(1000);
    crownLevy(s);
    expect(s.treasury).toBe(29000);
    expect(s.stats.levies).toBe(1);
    expect(s.stats.levied).toBe(1000);
    expect(s.ledger.levy).toBe(1000);
    expect(s.messages[s.messages.length - 1].kind).toBe('warn');
    s.day = 121; s.treasury = 30000;
    crownLevy(s); // only on the Thaw's first day
    expect(s.treasury).toBe(30000);
    s.day = 240; s.treasury = 8000;
    crownLevy(s); // nothing under the floor
    expect(s.treasury).toBe(8000);
    expect(s.stats.levies).toBe(1);
    s.crownFavour = 100; s.treasury = 30000;
    expect(favourFactor(s)).toBeCloseTo(0.85);
    expect(levyDue(s)).toBe(850);
    s.crownFavour = 0;
    expect(favourFactor(s)).toBeCloseTo(1.15);
    const c50 = (() => { s.crownFavour = 50; return sectorCost(s, 1); })();
    s.crownFavour = 0;
    expect(sectorCost(s, 1)).toBeCloseTo(c50 * 1.15, 0);
    s.crownFavour = 100;
    expect(sectorCost(s, 1)).toBeCloseTo(c50 * 0.85, 0);
  });

  it('a debt pays interest, the loan is one at a time and repaid in full, trade joins the history, and the line scales with the milestone', () => {
    const s = town();
    s.treasury = -1000;
    expect(computeLedger(s).interest).toBeCloseTo(10);
    s.treasury = 1000;
    expect(computeLedger(s).interest).toBe(0);
    s.milestone = 2;
    expect(loanLimit(s)).toBe(20000);
    expect(takeLoan(s)).toBeNull();
    expect(s.loan).toBe(20000);
    expect(s.treasury).toBe(21000);
    expect(takeLoan(s)).toMatch(/already/);
    expect(computeLedger(s).interest).toBeCloseTo(100);
    s.treasury = 5000;
    expect(repayLoan(s)).toMatch(/Needs 20,000/);
    s.treasury = 25000;
    expect(repayLoan(s)).toBeNull();
    expect(s.loan).toBe(0);
    expect(s.treasury).toBe(5000);
    expect(repayLoan(s)).toMatch(/No loan/);
    // trade is banked on the day and now counted in the history
    s.tradeIncomeToday = 250;
    const l = computeLedger(s);
    dailyEconomy(s);
    expect(s.ledgerHistory[s.ledgerHistory.length - 1]).toBe(Math.round(l.net + 250));
    // the line: −8,000 × (1 + milestone/2)
    expect(debtLine(s)).toBe(-16000);
    s.milestone = 4;
    expect(debtLine(s)).toBe(-24000);
    s.treasury = -9000; s.bankruptDays = 0;
    for (let d = 0; d < DEBT_DAYS + 1; d++) dailyEconomy(s);
    expect(s.gameOver).toBeFalsy();
    s.milestone = 0; s.treasury = -9000 - 2000 * (DEBT_DAYS + 1);
    for (let d = 0; d < DEBT_DAYS; d++) dailyEconomy(s);
    expect(s.gameOver).toBeTruthy();
  });

  it('the auditors hold the grant while the favour is under twenty, and the toast and the sim agree on the grant', () => {
    const s = town();
    s.milestone = 0; s.population = 10000; s.happiness = 80;
    s.crownFavour = FAVOUR_AUDIT - 1;
    const MS = milestonesOf(s);
    expect(grantFor(s, MS[1].grant)).toBe(0);
    const t0 = s.treasury;
    checkMilestones(s);
    expect(s.milestone).toBeGreaterThanOrEqual(1);
    expect(s.treasury).toBe(t0);
    expect(s.messages.some((m) => /auditors hold the grant/.test(m.text))).toBe(true);
    s.crownFavour = 50;
    expect(grantFor(s, MS[1].grant)).toBe(MS[1].grant);
  });
});

describe('Gates and memory', () => {
  it('the Vellish gate asks happiness 45 + 3 × the milestone, and the top bar names the next gate', () => {
    const s = town();
    s.milestone = 2; s.population = 100000; s.happiness = VELLISH_HAPPINESS(3) - 1;
    checkMilestones(s);
    expect(s.milestone).toBe(2);
    expect(gateMet(s)).toBe(false);
    expect(nextGate(s)).toBe(`${milestonesOf(s)[3].name}: ${milestonesOf(s)[3].pop.toLocaleString()} folk, happiness ${VELLISH_HAPPINESS(3)}`);
    s.happiness = VELLISH_HAPPINESS(3);
    expect(gateMet(s)).toBe(true);
    checkMilestones(s);
    expect(s.milestone).toBe(3); // and no further: the Township asks 57
    expect(s.happiness).toBeLessThan(VELLISH_HAPPINESS(4));
    s.milestone = milestonesOf(s).length - 1;
    expect(nextGate(s)).toBeNull();
  });

});

describe('Edicts as commitments, charters with a price', () => {
  it('an edict runs ten days once made and costs 200 crowns to repeal; an old save with no stamp may be repealed', () => {
    const s = town();
    s.milestone = 8;
    expect(setEdict(s, 'curfew', true)).toBeNull();
    expect(s.edicts.curfew).toBe(true);
    expect(s.edictSince.curfew).toBe(s.day);
    expect(setEdict(s, 'curfew', false)).toMatch(new RegExp(`Runs ${EDICT_MIN_DAYS} more days`));
    expect(s.edicts.curfew).toBe(true);
    s.day += EDICT_MIN_DAYS - 1;
    expect(edictLocked(s, 'curfew')).toMatch(/Runs 1 more day:/);
    s.day += 1;
    expect(edictLocked(s, 'curfew')).toBeNull();
    s.treasury = 100;
    expect(setEdict(s, 'curfew', false)).toMatch(/costs 200 crowns/);
    s.treasury = 1000;
    expect(setEdict(s, 'curfew', false)).toBeNull();
    expect(s.treasury).toBe(1000 - EDICT_REPEAL);
    expect(s.edicts.curfew).toBe(false);
    expect(s.edictSince.curfew).toBeUndefined();
    // per district, the same, keyed district:key
    paintDistrict(s, 1, s.founding.x + 1, s.founding.y - 10, s.founding.x + 15, s.founding.y + 10);
    expect(setEdict(s, 'curfew', true, 1)).toBeNull();
    expect(s.edictSince['1:curfew']).toBe(s.day);
    expect(setEdict(s, 'curfew', false, 1)).toMatch(/Runs/);
    // an old save: no stamp, repealable at once
    s.edicts.draughts = true;
    expect(setEdict(s, 'draughts', false)).toBeNull();
    expect(setEdict(s, 'nosuch', true)).toBe('No such edict');
  });

  it('a charter holds thirty days, costs a crown a building a day, a Craft quarter smokes past its edge and a Temple quarter takes a tenth of the market tithe', () => {
    const s = town();
    const f = s.founding;
    paintDistrict(s, 1, f.x + 1, f.y - 10, f.x + 8, f.y + 10);
    const cIn = placeBuildingRaw(s, 'craft', f.x + 7, f.y + 1, 2); ok(cIn); cIn.workers = 4;
    const hIn = placeBuildingRaw(s, 'hearth', f.x + 3, f.y + 1); ok(hIn); hIn.residents = 4;
    const mOut = placeBuildingRaw(s, 'market', f.x - 6, f.y + 1, 2); ok(mOut); mOut.workers = 4; mOut.happiness = 60;
    recomputeAll(s);
    updateMiasma(s);
    const past = idx(f.x + 8 + CHARTER_SMOKE_SPILL, f.y + 1); // past the district's edge, beyond the works' own reach
    const m0 = s.miasma[past];
    expect(setQuarter(s, 1, 'craft')).toBeNull();
    expect(s.quarterSince[1]).toBe(s.day);
    expect(charterHeld(s, 1)).toMatch(new RegExp(`holds ${CHARTER_LOCK_DAYS} more days`));
    expect(setQuarter(s, 1, 'hearth')).toMatch(/holds/);
    expect(setQuarter(s, 1, null)).toMatch(/holds/);
    expect(setQuarter(s, 1, 'craft')).toBeNull(); // the same charter again is no change
    const inDistrict = s.buildings.filter((b) => b && s.district[idx(b.x, b.y)] === 1).length;
    expect(inDistrict).toBeGreaterThanOrEqual(2);
    expect(charterUpkeep(s)).toBe(inDistrict);
    expect(charterCostOf(s, 1)).toBe(inDistrict);
    expect(computeLedger(s).upkeepCharters).toBe(inDistrict);
    recomputeAll(s);
    updateMiasma(s);
    expect(s.miasma[past]).toBeGreaterThan(m0);
    s.day += CHARTER_LOCK_DAYS;
    expect(charterHeld(s, 1)).toBeNull();
    s.milestone = 5;
    expect(setQuarter(s, 1, 'temple')).toBeNull();
    const l = computeLedger(s);
    expect(l.taxMarket).toBeGreaterThan(0);
    expect(l.charterTithe).toBeCloseTo(l.taxMarket * TEMPLE_TITHE_SHARE);
    s.day += CHARTER_LOCK_DAYS;
    expect(setQuarter(s, 1, null)).toBeNull();
    expect(s.quarterSince[1]).toBeUndefined();
    expect(computeLedger(s).charterTithe).toBe(0);
    expect(charterUpkeep(s)).toBe(0);
  });
});

describe('The new state in a save', () => {
  it('round-trips the new state through a save', () => {
    const s = town();
    s.crownFavour = 71; s.loan = 10000; s.remembranceDead = 24;
    s.edictSince = { curfew: 3, '1:curfew': 5 };
    s.quarterSince = { 1: 7 };
    const t = deserialize(serialize(s), (seed) => createGame(seed));
    expect([t.crownFavour, t.loan, t.remembranceDead]).toEqual([71, 10000, 24]);
    expect(t.edictSince).toEqual({ curfew: 3, '1:curfew': 5 });
    expect(t.quarterSince).toEqual({ 1: 7 });
    run(t, TICKS_PER_DAY);
  });
});

// Phase 2-3 of the scope reset: the budget shows where the upkeep goes.
describe('the budget by kind', () => {
  it('the upkeep by kind adds up to the building upkeep, and the road tiles to the road upkeep', () => {
    const s = createGame(42, 'Ledger');
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    buildRoad(s, RoadType.Cobble, roadPath(f.x - 6, f.y + 4, f.x - 2, f.y + 4, false));
    for (const [k, dx] of [['spire', -4], ['well', -2], ['healer', 0], ['garden', 2], ['watchpost', 4]] as [string, number][]) placeBuildingRaw(s, k, f.x + dx, f.y + 2).state = 'ok';
    const l = computeLedger(s);
    const sum = Object.values(l.upkeepBy).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(l.upkeepBuildings, 6);
    expect(Object.keys(l.upkeepBy)).toEqual(expect.arrayContaining(['ley', 'water', 'service', 'leisure']));
    const tiles = l.roadTiles;
    expect(tiles[RoadType.Track] * 0.3 + (tiles[RoadType.Cobble] ?? 0) * 0.8).toBeCloseTo(l.upkeepRoads, 6);
  });
});
