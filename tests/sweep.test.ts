// Iteration 44: the audit's sweep. One `it` per group of AUDIT.md §1, each asserting the fixed behaviour.
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, Terrain, Zone, idx } from '../src/sim/types';
import { buildRoad, bulldoze, roadPath } from '../src/sim/actions';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { ALL_EVENTS, chose, maybeFireCalendar, maybeFireEvent, resolveEvent } from '../src/sim/events';
import { QUESTS } from '../src/data/quests';
import { checkQuests } from '../src/sim/quests';
import { dailySurge } from '../src/sim/hazards';
import { computeBuildingHappiness, dailyBuildings, dailyTrade, craftStockCap } from '../src/sim/growth';
import { dailyWalkers, tickWalkers, walkersOf } from '../src/sim/walkers';
import { EDICT_BY_KEY, edictUpkeep } from '../src/sim/edicts';
import { checkMilestones, computeLedger } from '../src/sim/economy';
import { canBuild, specialLock } from '../src/data/factions';
import { courierJob, freeCradle } from '../src/sim/wyrmcraft';
import { setQuarter, setQuarterSnapshot } from '../src/sim/districts';
import { paintDistrict } from '../src/sim/actions';
import { serialize, deserialize } from '../src/sim/save';
import { wyrmBoneQuiet } from '../src/sim/wyrm';
import { flatten } from './helpers';

function town(faction: 'vellish' | 'grimmen' | 'veshari' = 'vellish', seed = 41) {
  const s = createGame(seed, 'Sweep', 'valley', faction);
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
  it('the Hush vigil and the Thaw feast complete; scenario goals pay only in their scenario; the failed daily leaves the Ledger', () => {
    const s = town();
    s.day = 91; // the Hush's first day
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('vigil');
    resolveEvent(s, 0);
    expect(chose(s, 'vigil', 0)).toBe(true);
    expect(QUESTS.find((q) => q.id === 's_vigil')!.done(s)).toBe(true);
    // a valley game at Burgh with ten clean days pays neither the one-node nor the inherited goal
    s.milestone = 6; s.cleanDays = 10; s.day = 120;
    const t0 = s.treasury;
    checkQuests(s);
    expect(s.questsDone).not.toContain('z_onenode');
    expect(s.questsDone).not.toContain('z_inherited');
    expect(s.treasury - t0).toBeLessThan(5000);
    const c = createGame(7, 'Daily', 'valley'); c.challenge = 'x' as never; c.day = 61;
    expect(QUESTS.find((q) => q.id === 'z_daily')!.when(c)).toBe(false);
  });

  it('a storm dissolved by wards, five full days, a named district of your own, a district taming edict, a kept Vein egg', () => {
    const s = town();
    const q = (id: string) => QUESTS.find((x) => x.id === id)!;
    s.stats.stormWarps = 5;
    expect(q('n_storm').done(s)).toBe(false);
    s.stats.stormsDissolved = 1;
    expect(q('n_storm').done(s)).toBe(true);
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
    s.districtEdicts['1:bounty'] = true;
    expect(q('e_edict').done(s)).toBe(true);
    s.wyrm.state = 'bound';
    s.firedEvents.push('egg_vein:0');
    expect(q('v_egg').done(s)).toBe(false);
    s.dragons.push({ id: 1, name: 'V', line: 'vein', stage: 0, days: 0, mood: 80, training: 'gentle', role: 'none', roleTarget: -1, cradleId: 1, hungry: 0, age: 0 } as never);
    expect(q('v_egg').done(s)).toBe(true);
    expect(s.stats.mothsSeen).toBe(0);
  });
});

describe('The sweep: timing and counting', () => {
  it("the healer's +4 lands in the stored happiness the next day", () => {
    const s = town();
    const f = s.founding;
    const hs = placeBuildingRaw(s, 'healer', f.x + 4, f.y + 3);
    const h = placeBuildingRaw(s, 'hearth', f.x - 4, f.y + 3, 1);
    ok(hs); ok(h); h.residents = 4;
    recomputeAll(s);
    dailyWalkers(s);
    const w = walkersOf(s, hs)[0];
    w.timer = 0;
    h.happiness = 20;
    for (let t = 0; t < 600 && (h.tended ?? -1) < s.day; t++) tickWalkers(s);
    expect(h.tended).toBe(s.day + 1);
    const untended = computeBuildingHappiness(s, { ...h, tended: -1 } as never);
    s.day++; // the day rolls over and the daily reader runs
    expect(computeBuildingHappiness(s, h) - untended).toBe(4);
  });

  it('a Nexus store delays the surge count; the store drains by its deficit per day; once-tales stay fired past forty', () => {
    const s = town();
    s.manaDemand = 300; s.manaSupply = 100; s.manaStorage = 50; s.manaStorageMax = 120;
    dailySurge(s);
    expect(s.overdrawDays).toBeLessThanOrEqual(0);
    s.manaStorage = 0; s.overdrawDays = 0;
    dailySurge(s);
    expect(s.overdrawDays).toBe(1);
    for (let k = 0; k < 60; k++) s.firedEvents.push(`filler_${k}:0`);
    s.firedEvents.push('relic:0');
    const relic = ALL_EVENTS.find((e) => e.id === 'relic')!;
    expect(relic.once).toBe(true);
    s.day = 200; s.lastEventDay = 100; s.lastBadDay = 0;
    const seen = new Set<string>();
    for (let k = 0; k < 300; k++) { s.pendingEvent = null; s.day += 20; s.lastEventDay = s.day - 40; s.lastBadDay = 0; maybeFireEvent(s); const pe = s.pendingEvent as { id: string } | null; if (pe) seen.add(pe.id); }
    expect(seen.has('relic')).toBe(false);
    expect(s.firedEvents.length).toBeGreaterThan(60);
  });

  it('couriers fill to the real shelf cap; the craft-tax cap is the lower one; the caravan buys wyrmfire and eggshell', () => {
    const s = town();
    const f = s.founding;
    const works = placeBuildingRaw(s, 'craft', f.x - 6, f.y + 1, 2); ok(works); works.stock = 40;
    const m = placeBuildingRaw(s, 'market', f.x + 6, f.y + 1, 1); ok(m); m.stock = 22;
    paintDistrict(s, 1, f.x + 4, f.y - 1, f.x + 8, f.y + 3);
    setQuarter(s, 1, 'market');
    recomputeAll(s);
    setQuarterSnapshot(s.districtQuarters, s.district); // the tick's snapshot that marketStockCap reads
    const job = courierJob(s);
    expect(job?.to.id).toBe(m.id); // 22 of 30 on a market-quarter shelf is a buyer; 22 of 20 was not
    s.modifiers.push({ kind: 'craftTax', value: 8, until: s.day + 10, label: 'pact' }, { kind: 'craftTax', value: 6, until: s.day + 10, label: 'bargain' });
    s.taxRates.craft = 12;
    works.workers = 8;
    const l = computeLedger(s);
    s.modifiers = [{ kind: 'craftTax', value: 6, until: s.day + 10, label: 'bargain' }];
    expect(computeLedger(s).taxCraft).toBeCloseTo(l.taxCraft, 6);
    s.materials.wyrmfire = 2; s.materials.eggshell = 3;
    const caravan = ALL_EVENTS.find((e) => e.id === 'caravan')!;
    const t0 = s.treasury;
    caravan.choices[1].apply(s);
    expect(s.treasury - t0).toBe(2 * 500 + 3 * 200);
    expect(s.materials.wyrmfire).toBe(0);
  });
});

describe('The sweep: edicts, promises and gates', () => {
  it('city-only edicts are not billed per district and are hidden from a district scope', () => {
    const s = town();
    s.districtEdicts['1:bounty'] = true;
    s.districtEdicts['1:wardens'] = true;
    paintDistrict(s, 1, s.founding.x - 4, s.founding.y - 4, s.founding.x + 4, s.founding.y + 4);
    expect(EDICT_BY_KEY.bounty.cityOnly).toBe(true);
    expect(edictUpkeep(s)).toBe(0);
    const h = placeBuildingRaw(s, 'hearth', s.founding.x - 2, s.founding.y + 1, 1); ok(h); h.residents = 4;
    s.districtEdicts['1:curfew'] = true;
    expect(edictUpkeep(s)).toBeGreaterThan(0); // a district edict with residents in it is billed; a city-only one never
  });

  it("a square's markets pay more, the Lantern delights the city, a Hall of Marvels needs light, the Beacon needs the Lantern", () => {
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
    s.population = 5000; s.milestone = 7;
    
    checkMilestones(s);
    expect(s.milestone).toBe(7); // the Lantern is dark: no Beacon
    lantern.lit = true;
    checkMilestones(s);
    expect(s.milestone).toBe(8);
    const hall = placeBuildingRaw(s, 'hallofmarvels', f.x - 10, f.y - 6); ok(hall); hall.lit = false;
    const noHall = computeBuildingHappiness(s, h);
    hall.lit = true;
    expect(computeBuildingHappiness(s, h) - noHall).toBe(0); // nothing in the vault: nothing on show (iteration 53)
    s.materials.scale = 3; s.materials.wyrmfire = 1; s.materials.glimdust = 0.5;
    expect(computeBuildingHappiness(s, h) - noHall).toBe(4); // two exhibits at +2
    hall.lit = false;
    expect(computeBuildingHappiness(s, h) - noHall).toBe(0);
  });

  it('the Peak needs its caller and the Court a woken wyrm', () => {
    const s = town();
    expect(canBuild(s, 'stormpeak')).toBe(false);
    expect(specialLock(s, 'stormpeak')).toMatch(/caller/);
    s.firedEvents.push('stormcaller:0');
    expect(canBuild(s, 'stormpeak')).toBe(true);
    s.milestone = 8;
    s.wyrm.state = 'sleeping';
    expect(canBuild(s, 'wyrmcourt')).toBe(false);
    s.wyrm.state = 'awake';
    expect(canBuild(s, 'wyrmcourt')).toBe(true);
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
    const g = town('grimmen');
    const q = placeBuildingRaw(g, 'quarry', g.founding.x + 3, g.founding.y - 3); ok(q);
    g.terrain[idx(q.x, q.y)] = Terrain.Hills;
    q.workers = 8; q.stock = 0; q.lit = true;
    dailyBuildings(g);
    const full = q.stock;
    q.workers = 2; q.stock = 0;
    dailyBuildings(g);
    expect(q.stock).toBeCloseTo(full * 0.25, 5);
    expect(craftStockCap(q)).toBeGreaterThan(0);
  });

  it('bred and bought eggs respect the cradle lines; the Crown gifts the Veshari a tide egg; a gate is bulldozed before its road', () => {
    const g = town('grimmen');
    const hatchery = placeBuildingRaw(g, 'hatchery', g.founding.x + 3, g.founding.y - 3); ok(hatchery);
    expect(freeCradle(g, 'tide')).toBeNull();
    expect(freeCradle(g, 'ember')?.id).toBe(hatchery.id);
    const v = town('veshari');
    const gift = ALL_EVENTS.find((e) => e.id === 'egg_first')!;
    expect(String(typeof gift.choices[0].desc === 'function' ? gift.choices[0].desc(v) : gift.choices[0].desc)).toMatch(/tide/);
    const s = town();
    const i = idx(s.founding.x, s.founding.y + 2);
    expect(s.road[i]).toBe(RoadType.Track);
    s.wall[i] = 2; // a gate on the road
    expect(bulldoze(s, s.founding.x, s.founding.y + 2).ok).toBe(true);
    expect(s.wall[i]).toBe(0);
    expect(s.road[i]).toBe(RoadType.Track);
  });

  it("the wyrm's bones fade after a season's worth of days; a priced choice needs the purse; old saves load", () => {
    const s = town();
    s.wyrm.state = 'dead'; s.wyrm.died = 100; s.day = 150;
    expect(wyrmBoneQuiet(s)).toBe(80);
    s.day = 230;
    expect(wyrmBoneQuiet(s)).toBe(20);
    const poachers = ALL_EVENTS.find((e) => e.id === 'poachers' || e.choices.some((c) => c.label.startsWith('Buy the egg')))!;
    s.pendingEvent = { id: poachers.id, title: poachers.title, text: poachers.text, choices: poachers.choices.map((c) => ({ label: c.label, desc: String(c.desc) })) };
    s.treasury = 100;
    resolveEvent(s, poachers.choices.findIndex((c) => c.label.startsWith('Buy the egg')));
    expect(s.treasury).toBe(100);
    expect(s.messages[s.messages.length - 1].text).toMatch(/purse is too light/);
    const o = JSON.parse(serialize(s));
    delete o.stats.firesTotal; delete o.stats.peakPopulation; delete o.stats.stormsDissolved;
    const r = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(r.stats.firesTotal).toBe(0);
    expect(r.stats.peakPopulation).toBe(0);
    expect(r.stats.stormsDissolved).toBe(0);
    expect(Zone.Market).toBeDefined();
    expect(BUILDING_BY_KEY.lantern.desc).toMatch(/delights/);
  });
});
