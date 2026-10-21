/** Iteration 54 (M14 part 4, the world pushes back): the weather from the seed, the Crown's levy, favour, interest and loan, the gates and the next-gate line, the three chains, ill tidings only from hazards, edicts as commitments, charters with a price, the festivals in the forecast, and the daily challenge that can be lost. */
import { describe, expect, it } from 'vitest';
import { createGame, illTiding, placeBuildingRaw, pushMessage, waterRadiusOf } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, TICKS_PER_DAY, Zone, idx, CHALLENGE_DAYS } from '../src/sim/types';
import { buildRoad, paintDistrict, roadPath } from '../src/sim/actions';
import { dailyBuildings } from '../src/sim/growth';
import { DEBT_DAYS, FAVOUR_AUDIT, checkMilestones, computeLedger, crownLevy, dailyEconomy, debtLine, favourFactor, grantFor, levyDue, loanLimit, repayLoan, takeLoan } from '../src/sim/economy';
import { sectorCost } from '../src/sim/sectors';
import { BLIZZARD_DAYS, DROUGHT_DAYS, RAIN_DAYS, blizzard, dailyWeather, drought, raining, seasonWeather, weatherAt } from '../src/sim/weave';
import { dailyFire } from '../src/sim/hazards';
import { updateMana } from '../src/sim/networks';
import { updateMiasma } from '../src/sim/services';
import { ALL_EVENTS, CALENDAR, PILGRIM_ASK_DAYS, resolveEvent } from '../src/sim/events';
import { EDICT_MIN_DAYS, EDICT_REPEAL, edictLocked, setEdict } from '../src/sim/edicts';
import { CHARTER_LOCK_DAYS, CHARTER_SMOKE_SPILL, TEMPLE_TITHE_SHARE, charterCostOf, charterHeld, charterUpkeep, setQuarter } from '../src/sim/districts';
import { forecast } from '../src/sim/forecast';
import { CHALLENGE_PEOPLES, challengePeople, challengeScore, challengeSeed, createChallenge } from '../src/sim/scenario';
import { checkQuests } from '../src/sim/quests';
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

describe('The weather is written in the seed', () => {
  it('is a pure function of the seed and the season, read on a stream of its own, and the Chronicle says when a spell begins', () => {
    const s = town();
    // Bloom brings rain somewhere in a few seeds; Ember a drought and the Hush a blizzard in some
    let rainSeed = -1, droughtSeed = -1, blizzardSeed = -1;
    for (let seed = 1; seed < 200 && (rainSeed < 0 || droughtSeed < 0 || blizzardSeed < 0); seed++) {
      if (rainSeed < 0 && seasonWeather(seed, 1).some((w) => w.kind === 'rain')) rainSeed = seed;
      if (droughtSeed < 0 && seasonWeather(seed, 2).some((w) => w.kind === 'drought')) droughtSeed = seed;
      if (blizzardSeed < 0 && seasonWeather(seed, 3).some((w) => w.kind === 'blizzard')) blizzardSeed = seed;
    }
    expect(rainSeed).toBeGreaterThan(0); expect(droughtSeed).toBeGreaterThan(0); expect(blizzardSeed).toBeGreaterThan(0);
    expect(seasonWeather(rainSeed, 1)).toEqual(seasonWeather(rainSeed, 1)); // pure
    for (const w of seasonWeather(rainSeed, 1)) expect(w.end - w.start).toBe(RAIN_DAYS);
    for (const w of seasonWeather(droughtSeed, 2)) expect(w.end - w.start).toBe(DROUGHT_DAYS);
    for (const w of seasonWeather(blizzardSeed, 3)) expect(w.end - w.start).toBe(BLIZZARD_DAYS);
    expect(seasonWeather(rainSeed, 0)).toEqual([]); // the Thaw is dry
    // the main stream is untouched by reading the sky
    s.seed = rainSeed;
    const rain = seasonWeather(rainSeed, 1)[0];
    const rng0 = s.rngState;
    expect(weatherAt(s, rain.start)).toEqual({ kind: 'rain', until: rain.end });
    expect(weatherAt(s, rain.end)).toBeNull();
    s.day = rain.start;
    const n0 = s.messages.length;
    dailyWeather(s);
    expect(s.rngState).toBe(rng0);
    expect(s.weather).toEqual({ kind: 'rain', until: rain.end });
    expect(raining(s)).toBe(true);
    expect(s.stats.rainDays).toBe(1);
    expect(s.messages.slice(n0).some((m) => /^Rain over/.test(m.text))).toBe(true);
    dailyWeather(s); // the same spell again says nothing new
    expect(s.messages.length).toBe(n0 + 1);
    // the Storm-Caller's rain is the sure version
    s.weather = null;
    expect(raining(s)).toBe(false);
    s.modifiers.push({ kind: 'rain', value: 1, until: s.day + 2, label: 'Called rain' });
    expect(raining(s)).toBe(true);
  });

  it('a drought shrinks the wells and pauses the World Tree; a blizzard makes the hearths drink more', () => {
    const s = town();
    const f = s.founding;
    const well = placeBuildingRaw(s, 'well', f.x + 3, f.y + 1); ok(well);
    const tree = placeBuildingRaw(s, 'worldtree', f.x - 8, f.y - 6); ok(tree); tree.lit = true;
    recomputeAll(s);
    const r0 = waterRadiusOf(s, well);
    s.weather = { kind: 'drought', until: s.day + DROUGHT_DAYS };
    expect(drought(s)).toBe(true);
    expect(waterRadiusOf(s, well)).toBe(Math.max(2, r0 - 2));
    const age0 = tree.age;
    dailyBuildings(s);
    expect(tree.age).toBe(age0); // the tree waits
    s.weather = null;
    dailyBuildings(s);
    expect(tree.age).toBe(age0 + 1);
    // the blizzard: hearths drink a tenth more
    for (let k = 0; k < 4; k++) { const h = placeBuildingRaw(s, 'hearth', f.x + 5 + k, f.y + 1); ok(h); h.residents = 4; }
    recomputeAll(s);
    updateMana(s);
    const d0 = s.manaDemand;
    s.weather = { kind: 'blizzard', until: s.day + BLIZZARD_DAYS };
    expect(blizzard(s)).toBe(true);
    updateMana(s);
    expect(s.manaDemand).toBeGreaterThan(d0);
    expect(s.manaDemand).toBeLessThanOrEqual(d0 * 1.1 + 1e-6);
  });

  it('rain sleeps the fires and a drought wakes them', () => {
    // the same works under the two skies, over many days on the same stream: the drought burns five times the rain
    const count = (kind: 'rain' | 'drought') => {
      const s = town(7);
      const f = s.founding;
      for (let k = 0; k < 12; k++) for (let j = 0; j < 4; j++) { const c = placeBuildingRaw(s, 'craft', f.x - 12 + k * 2, f.y - 8 + j * 3, 2); ok(c); c.workers = 4; }
      recomputeAll(s);
      s.weather = { kind, until: 10000 };
      s.day = 40; // Bloom, no Ember factor
      let fires = 0;
      for (let d = 0; d < 300; d++) {
        dailyFire(s);
        for (const b of s.buildings) if (b && b.state === 'burning') { b.state = 'ok'; b.stateDays = 0; fires++; }
      }
      return fires;
    };
    const wet = count('rain'), dry = count('drought');
    expect(dry).toBeGreaterThan(wet * 2);
  });
});

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

  it('welcomed pilgrims ask for a shrine a month on, and each pleading is remembered', () => {
    const s = town();
    const f = s.founding;
    for (let k = 0; k < 6; k++) { const h = placeBuildingRaw(s, 'hearth', f.x - 6 + k * 2, f.y + 1); ok(h); h.residents = 2; }
    recomputeAll(s);
    s.population = 100;
    s.pendingEvent = { id: 'pilgrims', title: 'A caravan of pilgrims', text: '', choices: [] };
    s.firedEvents.push('pilgrims:?');
    resolveEvent(s, 0);
    expect(s.pilgrimsDay).toBe(s.day);
    const shrine = ALL_EVENTS.find((e) => e.id === 'pilgrims_shrine')!;
    expect(shrine.priority).toBe(true);
    expect(shrine.when(s)).toBe(false);
    s.day += PILGRIM_ASK_DAYS;
    expect(shrine.when(s)).toBe(true);
    s.day += 11;
    expect(shrine.when(s)).toBe(false); // they stop asking
    s.day -= 11;
    s.pendingEvent = { id: 'pilgrims_shrine', title: shrine.title, text: '', choices: [] };
    s.firedEvents.push('pilgrims_shrine:?');
    const t0 = s.treasury;
    resolveEvent(s, 0);
    expect(s.pilgrimsDay).toBe(-1);
    expect(s.buildings.some((b) => b && b.kind === 'shrine')).toBe(true);
    expect(s.treasury).toBe(t0 - 600);
    expect(s.stats.pilgrimShrines).toBe(1);
    // the collector: each pleading costs ten favour and the next audit is harsher
    const plead = () => { s.pendingEvent = { id: 'collector', title: 'The Crown\'s collector', text: '', choices: [] }; s.firedEvents.push('collector:?'); resolveEvent(s, 1); };
    s.crownFavour = 50; s.treasury = 20000;
    plead();
    expect(s.pleadings).toBe(1); expect(s.crownFavour).toBe(40);
    expect(s.modifiers.some((m) => m.kind === 'tithe' && m.value === -0.15)).toBe(true);
    plead();
    expect(s.pleadings).toBe(2); expect(s.crownFavour).toBe(30);
    expect(s.modifiers.some((m) => m.kind === 'tithe' && m.value === -0.25)).toBe(true);
    s.treasury = 20000;
    plead();
    expect(s.pleadings).toBe(3); expect(s.crownFavour).toBe(20);
    expect(s.treasury).toBe(16000);
    // paying lifts the favour
    s.pendingEvent = { id: 'collector', title: 'The Crown\'s collector', text: '', choices: [] }; s.firedEvents.push('collector:?'); resolveEvent(s, 0);
    expect(s.crownFavour).toBe(25);
  });

  it('a bad line no longer silences the tales: only a hazard is an ill tiding', () => {
    const s = town();
    s.day = 50; s.lastBadDay = -30;
    pushMessage(s, 'Fire at Hearth (1,1)!', 'bad');
    expect(s.lastBadDay).toBe(-30);
    illTiding(s);
    expect(s.lastBadDay).toBe(50);
  });

  it('B16: the fired-tales list is never trimmed', () => {
    const s = town();
    for (let k = 0; k < 400; k++) s.firedEvents.push(`tale${k}:0`);
    run(s, TICKS_PER_DAY * 2);
    expect(s.firedEvents.length).toBeGreaterThanOrEqual(400);
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

describe('Festivals seen, the daily challenge', () => {
  it('the forecast lists the calendar festivals the city is eligible for, the Lantern Fair among them', () => {
    const s = town();
    const f = s.founding;
    const obs = placeBuildingRaw(s, 'observatory', f.x + 4, f.y - 4); ok(obs); obs.lit = true;
    s.population = 100;
    const fair = CALENDAR.find((e) => e.id === 'lanternfair')!;
    s.day = fair.season * 30 + fair.seasonDay - 3;
    expect(forecast(s).some((l) => /Lantern Fair in 3 days/.test(l.text))).toBe(false); // no Guildhall: not eligible
    const gh = placeBuildingRaw(s, 'guildhall', f.x - 6, f.y - 4); ok(gh);
    expect(forecast(s).some((l) => /Lantern Fair in 3 days/.test(l.text))).toBe(true);
    s.day = 2 * 30 + 15 - 1;
    expect(forecast(s).some((l) => /The Remembrance in 1 day\./.test(l.text))).toBe(true);
    s.day = 120 + 2 - 2;
    expect(forecast(s).some((l) => /Thaw-day in 2 days/.test(l.text))).toBe(true);
    s.day = 0; // the founding Thaw has no festivals
    expect(forecast(s).some((l) => /Thaw-day/.test(l.text))).toBe(false);
  });

  it('the Remembrance counts its dead, the feast names the districts it fed', () => {
    const s = town();
    const f = s.founding;
    paintDistrict(s, 1, f.x + 1, f.y - 10, f.x + 15, f.y + 10);
    const m = placeBuildingRaw(s, 'market', f.x + 6, f.y + 1, 2); ok(m); m.workers = 4; m.stock = 40;
    s.districtNames[1] = 'Foxmoor';
    recomputeAll(s);
    const rem = CALENDAR.find((e) => e.id === 'remembrance')!;
    rem.choices[0].apply(s);
    expect(s.remembranceDead).toBe(12);
    const thaw = CALENDAR.find((e) => e.id === 'thawday')!;
    s.population = 100;
    expect(thaw.choices[0].apply(s)).toMatch(/Foxmoor/);
  });

  it('the daily challenge is the Vellish on every date, fails on day 61 and is scored by the days to spare and the crowns', () => {
    const peoples = new Set(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map(challengePeople));
    expect([...peoples]).toEqual(['vellish']); // the only people since the scope reset
    const key = '2026-10-02';
    const s = createChallenge('Daily', key);
    expect(s.faction).toBe(CHALLENGE_PEOPLES[challengeSeed(key) % CHALLENGE_PEOPLES.length]);
    expect(s.challenge).toBe(key);
    expect(s.challengeDay).toBe(-1);
    s.day = CHALLENGE_DAYS;
    checkQuests(s);
    expect(s.challengeDay).toBe(-1);
    s.day = CHALLENGE_DAYS + 1;
    const n0 = s.messages.length;
    checkQuests(s);
    expect(s.challengeDay).toBe(-2);
    expect(s.messages.slice(n0).some((m) => m.kind === 'bad' && /challenge .* is lost/.test(m.text))).toBe(true);
    expect(challengeScore(s)).toBe(0);
    s.challengeDay = 40; s.treasury = 5000;
    expect(challengeScore(s)).toBe(CHALLENGE_DAYS + 1 - 40 + 5);
  });

  it('round-trips the new state through a save, and an old save gets the defaults', () => {
    const s = town();
    s.weather = { kind: 'rain', until: 12 };
    s.crownFavour = 71; s.loan = 10000; s.pleadings = 2; s.pilgrimsDay = 4; s.remembranceDead = 24;
    s.edictSince = { curfew: 3, '1:curfew': 5 };
    s.quarterSince = { 1: 7 };
    const t = deserialize(serialize(s), (seed) => createGame(seed));
    expect(t.weather).toEqual({ kind: 'rain', until: 12 });
    expect([t.crownFavour, t.loan, t.pleadings, t.pilgrimsDay, t.remembranceDead]).toEqual([71, 10000, 2, 4, 24]);
    expect(t.edictSince).toEqual({ curfew: 3, '1:curfew': 5 });
    expect(t.quarterSince).toEqual({ 1: 7 });
    const raw = JSON.parse(serialize(s));
    for (const k of ['weather', 'crownFavour', 'loan', 'pleadings', 'pilgrimsDay', 'remembranceDead', 'edictSince', 'quarterSince']) delete raw[k];
    delete raw.stats.rainDays; delete raw.ledger.levy;
    const o = deserialize(JSON.stringify(raw), (seed) => createGame(seed));
    expect(o.weather).toBeNull();
    expect([o.crownFavour, o.loan, o.pleadings, o.pilgrimsDay, o.remembranceDead]).toEqual([50, 0, 0, -1, 0]);
    expect(o.edictSince).toEqual({});
    expect(o.quarterSince).toEqual({});
    expect(o.stats.rainDays).toBe(0);
    expect(o.ledger.levy).toBe(0);
    run(o, TICKS_PER_DAY);
  });
});
