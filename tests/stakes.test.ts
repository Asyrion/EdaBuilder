// Iteration 47, M14 part 2a: services with staff and stakes. Crews, the breakdowns, deathcare in the open, wards with a budget.
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { crewFactor, landBonusMap, landValueTerms, updateCoverage, updateLandValue, DEATHCARE_LV } from '../src/sim/services';
import { computeBuildingHappiness, dailyBuildings, happinessTerms, levelUpNeeds, demandReasons, updateDemand } from '../src/sim/growth';
import { WARD_BURN, dailyDeath, dailyGloam, greyInReach, wardBurnBudget } from '../src/sim/hazards';
import { flatten } from './helpers';

function town(seed = 41) {
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
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

describe('Crews', () => {
  it('a Watch House at half crew watches half as strong and says it is short-handed; a full one in full', () => {
    const s = town();
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
    const s = town();
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
    const s = town();
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
    const s = town();
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
