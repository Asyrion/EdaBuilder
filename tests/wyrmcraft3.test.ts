// Iteration 53 (M14 part 3, wyrmcraft matured): lines that do what they say, cradles with a ceiling, roles with a price,
// materials with sinks, marvels and wonders with a role, the Wyrm-Court after the binding, golems assigned.
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath, scatterDust, toggleSluice } from '../src/sim/actions';
import { AgentKind, DAYS_PER_SEASON, RoadType, TICKS_PER_DAY, Terrain, cracked, idx, isWater, type Agent, type Dragon } from '../src/sim/types';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import {
  EGGSHELL_HATCH, FEED_REACH, FORGE_BURN, GREAT_CRADLE_MANA, LODGE_SEATS, REGRESS_AFTER, STAGE_DAYS, WYRMFIRE_BURN, addEgg, boutOdds, cradleCapacity, dailyDragons, delverAt, dueReturn,
  forgeHot, lineNest, lodgeSeats, marketsInReach, nextBoutDay, raiseCradle, scaleMailOn, seasonalBout, setRole, wyrmfireBonus,
} from '../src/sim/wyrmcraft';
import { aurasAt, floodedAt, litWonders, marvelExhibits } from '../src/sim/weave';
import { dailyBuildings, computeBuildingHappiness, updateSocial, workforceOf } from '../src/sim/growth';
import { ALL_EVENTS, maybeFireReturn, resolveEvent } from '../src/sim/events';
import { tickCreatures, updateCreatures } from '../src/sim/creatures';
import { BARGE_VARIANT, dailyBarges, swimsBarges, tideMooring } from '../src/sim/vehicles';
import { GOLEM_LABOUR, dailyBeasts, guardGolems, labourGolems, setGolemDuty, surgeMaddensGolems, worksGolems } from '../src/sim/beasts';
import { manaUseOf, seatWarmed, updateMana, wicksHalved } from '../src/sim/networks';
import { dailySurge, CORES_BROKEN_DAYS } from '../src/sim/hazards';
import { checkMilestones } from '../src/sim/economy';
import { updateCoverage } from '../src/sim/services';
import { WYRM_EATS, bind, dailyWyrm, marketGoods, wyrmEats, wyrmGuards, wyrmNode } from '../src/sim/wyrm';
import { specialLock } from '../src/data/factions';
import { serialize, deserialize } from '../src/sim/save';
import { distanceMap } from '../src/sim/terrain';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A cradle, a lodge and five stocked markets along a track (the wyrmcraft test's nest). */
function nest(seed = 91) {
  const s = createGame(seed, 'Nest');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 8, f.x + 18, f.y + 12);
  s.milestone = 4;
  s.treasury = 50000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 3, f.x + 16, f.y + 3, false));
  expect(placeBuilding(s, 'cradle', f.x + 2, f.y + 4).ok).toBe(true);
  expect(placeBuilding(s, 'tamerslodge', f.x + 5, f.y + 4).ok).toBe(true);
  const markets = [];
  for (let x = f.x - 6; x <= f.x - 2; x++) { const m = placeBuildingRaw(s, 'market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  recomputeAll(s);
  const cradle = s.buildings.find((b) => b && b.kind === 'cradle')!;
  const lodge = s.buildings.find((b) => b && b.kind === 'tamerslodge')!;
  ok(cradle); ok(lodge);
  cradle.lit = true;
  return { s, f, cradle, lodge, markets };
}
const feedAll = (markets: { stock: number }[], n = 40) => { for (const m of markets) m.stock = n; };

describe('Lines that do what they say', () => {
  it('an Ember drake with no role lifts Craft a tenth within its aura, and the building names it', () => {
    const { s, f, cradle, markets } = nest();
    const c = placeBuildingRaw(s, 'craft', f.x + 5, f.y + 1, 2); ok(c); c.workers = 6; c.lit = true;
    const d = addEgg(s, 'ember')!;
    d.stage = 2;
    s.tick = 100;
    recomputeAll(s);
    expect(aurasAt(s, c.x, c.y).map((a) => a.line)).toContain('ember');
    const made = () => { c.stock = 0; c.workers = 6; feedAll(markets); cradle.lit = true; dailyBuildings(s); return c.stock; };
    const withAura = made();
    d.stage = 1; // a hatchling radiates nothing
    s.tick = 200;
    const without = made();
    expect(withAura / without).toBeCloseTo(1.1, 1);
    expect(aurasAt(s, c.x, c.y).length).toBe(0);
  });

  it("the Crown's gift matches the people: tide for the Veshari, ember for the rest", () => {
    for (const [faction, kind, line] of [['vellish', 'cradle', 'ember'], ['grimmen', 'hatchery', 'ember'], ['veshari', 'tidepool', 'tide'], ['tallowkin', 'cradle', 'ember']] as const) {
      const s = createGame(7, 'Gift', 'valley', faction);
      const f = s.founding;
      flatten(s, f.x - 6, f.y - 6, f.x + 6, f.y + 6);
      const c = placeBuildingRaw(s, kind, f.x + 2, f.y + 2); ok(c); c.lit = true;
      const e = ALL_EVENTS.find((x) => x.id === 'egg_first')!;
      s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((ch) => ({ label: ch.label, desc: typeof ch.desc === 'string' ? ch.desc : ch.desc(s) })) };
      resolveEvent(s, 0);
      expect(s.dragons.length).toBe(1);
      expect(s.dragons[0].line).toBe(line);
    }
  });

  it('a Tide drake swims a barge a day from the mooring nearest its cradle, strike or no strike', () => {
    const s = createGame(41, 'Sablemouth', 'valley', 'veshari');
    const f = s.founding;
    flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
    for (let dx = -12; dx <= 12; dx++) for (let dy = 5; dy <= 6; dy++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Water;
    for (let dx = -13; dx <= 13; dx++) for (const dy of [4, 7]) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Shore;
    s.waterDist = distanceMap((i) => isWater(s.terrain[i]), 15);
    const a = placeBuildingRaw(s, 'landing', f.x - 10, f.y + 4); ok(a);
    const b = placeBuildingRaw(s, 'landing', f.x + 10, f.y + 4); ok(b);
    const pool = placeBuildingRaw(s, 'tidepool', f.x - 8, f.y + 1); ok(pool); pool.lit = true;
    const works: ReturnType<typeof placeBuildingRaw>[] = [];
    for (let k = 0; k < 3; k++) { const w = placeBuildingRaw(s, 'craft', f.x - 12 + k, f.y + 2, 2); ok(w); w.stock = 60; works.push(w); }
    const markets: ReturnType<typeof placeBuildingRaw>[] = [];
    for (let k = 0; k < 3; k++) { const m = placeBuildingRaw(s, 'market', f.x + 8 + k, f.y + 2, 2); ok(m); m.stock = 0; markets.push(m); }
    recomputeAll(s);
    const d = addEgg(s, 'tide')!;
    d.stage = 2;
    expect(swimsBarges(d)).toBe(true);
    expect(tideMooring(s, d)?.id).toBe(a.id);
    s.modifiers.push({ kind: 'barges', value: -1, until: s.day + 10, label: 'strike' }); // the bargemen are on strike
    dailyBarges(s);
    const barges = s.agents.filter((x) => x.kind === AgentKind.Cart && x.variant === BARGE_VARIANT);
    expect(barges.length).toBe(1);
    expect(barges[0].dragonId).toBe(d.id);
    expect(barges[0].homeId).toBe(a.id);
    expect(s.stats.tideTrips).toBe(1);
    expect(s.stats.bargeTrips).toBe(1);
    expect(works.reduce((n, w) => n + w.stock, 0)).toBeLessThan(180);
    dailyBarges(s); // one out at a time
    expect(s.stats.tideTrips).toBe(1);
    d.role = 'delver'; // a drake with a working role radiates nothing and swims nothing
    expect(swimsBarges(d)).toBe(false);
  });
});

describe('Cradles with a ceiling', () => {
  it('a Great Cradle: four nests and four more mana, raised at the sixth milestone, kept by a save', () => {
    const { s, cradle } = nest();
    expect(raiseCradle(s, cradle.id)).toMatch(/Burgh/);
    s.milestone = 6;
    s.treasury = 1000;
    expect(raiseCradle(s, cradle.id)).toMatch(/crowns/);
    s.treasury = 10000;
    const mana0 = manaUseOf(cradle);
    expect(raiseCradle(s, cradle.id)).toBeNull();
    expect(cradle.level).toBe(2);
    expect(cradleCapacity(cradle)).toBe(4);
    expect(manaUseOf(cradle)).toBe(mana0 + GREAT_CRADLE_MANA);
    expect(s.treasury).toBe(6000);
    for (let k = 0; k < 4; k++) expect(addEgg(s, 'ember')).toBeTruthy();
    expect(addEgg(s, 'ember')).toBeNull();
    expect(raiseCradle(s, cradle.id)).toMatch(/Already/);
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Nest'));
    expect(cradleCapacity(back.buildings.find((b) => b && b.id === cradle.id)!)).toBe(4);
  });

  it('a lodge seats four: the fifth hatchling does not grow, and a drake without a seat grows at half pace', () => {
    const { s, cradle, markets } = nest();
    cradle.level = 2;
    const eggs: Dragon[] = [];
    for (let k = 0; k < 4; k++) eggs.push(addEgg(s, 'ember')!);
    const second = placeBuildingRaw(s, 'cradle', cradle.x + 4, cradle.y + 3); ok(second); second.lit = true;
    recomputeAll(s);
    cradle.lit = true; second.lit = true;
    const fifth = addEgg(s, 'ember')!;
    expect(fifth.cradleId).toBe(second.id);
    for (const d of [...eggs, fifth]) { d.stage = 1; d.days = 0; }
    const seats = lodgeSeats(s);
    expect(seats.get(eggs[0].id)).toBeTruthy();
    expect(seats.get(fifth.id)).toBeNull();
    feedAll(markets, 60);
    dailyDragons(s);
    expect(eggs[0].days).toBeGreaterThan(0);
    expect(fifth.days).toBe(0);
    // drakes: the seated one at full pace, the unseated at half
    eggs[0].stage = 2; eggs[0].days = 0; fifth.stage = 2; fifth.days = 0;
    feedAll(markets, 60);
    cradle.lit = true; second.lit = true;
    dailyDragons(s);
    expect(fifth.days).toBeCloseTo(eggs[0].days / 2, 5);
    expect(LODGE_SEATS).toBe(4);
  });

  it(`feeding reaches ${FEED_REACH} tiles; a warden eats from the markets of its district`, () => {
    const { s, f, cradle, markets } = nest();
    const d = addEgg(s, 'ember')!;
    d.stage = 1;
    expect(marketsInReach(s, cradle).length).toBe(5);
    feedAll(markets, 0);
    const far = placeBuildingRaw(s, 'market', f.x + 16, f.y + 4, 2); ok(far); far.stock = 40; far.workers = 6;
    expect(marketsInReach(s, cradle).some((m) => m.id === far.id)).toBe(false);
    dailyDragons(s);
    expect(d.hungry).toBe(1);
    expect(far.stock).toBe(40);
    // a warden of the far market's district eats there, any distance
    d.stage = 2;
    s.district[idx(far.x, far.y)] = 2;
    expect(setRole(s, d.id, 'warden', 2)).toBeNull();
    dailyDragons(s);
    expect(d.hungry).toBe(0);
    expect(far.stock).toBe(30);
  });

  it(`${REGRESS_AFTER} unfed days cost a stage; starved, it leaves, and returns after a season to ask a tribute`, () => {
    const { s, cradle, markets } = nest();
    const d = addEgg(s, 'ember')!;
    d.stage = 3; d.mood = 100;
    expect(setRole(s, d.id, 'courier')).toBeNull();
    feedAll(markets, 0);
    for (let k = 0; k < REGRESS_AFTER; k++) { cradle.lit = true; dailyDragons(s); }
    expect(d.stage).toBe(2);
    expect(d.role).toBe('none');
    expect(s.messages.some((m) => /shrinks back/.test(m.text))).toBe(true);
    let days = 0;
    while (s.dragons.length && days < 40) { cradle.lit = true; dailyDragons(s); days++; }
    expect(s.dragons.length).toBe(0);
    expect(s.departed.length).toBe(1);
    expect(s.departed[0].name).toBe(d.name);
    expect(s.departed[0].stage).toBe(2);
    expect(dueReturn(s)).toBeNull();
    s.day += DAYS_PER_SEASON;
    expect(dueReturn(s)?.name).toBe(d.name);
    maybeFireReturn(s);
    expect(s.pendingEvent?.id).toBe('dragon_returns');
    expect(s.pendingEvent?.title).toContain(d.name);
    const purse = s.treasury;
    resolveEvent(s, 0);
    expect(s.treasury).toBe(purse - 1000);
    expect(s.departed[0].returned).toBe(true);
    expect(s.stats.dragonsReturned).toBe(1);
    expect(dueReturn(s)).toBeNull();
  });

  it('a returned dragon comes home to an open cradle, or burns the dark roofs near its old one when refused', () => {
    const { s, cradle } = nest();
    s.departed.push({ name: 'Ashvel', line: 'ember', stage: 2, day: s.day - 31, x: cradle.x, y: cradle.y, returned: false });
    maybeFireReturn(s);
    expect(s.pendingEvent?.id).toBe('dragon_returns');
    resolveEvent(s, 1); // open a cradle
    expect(s.dragons.length).toBe(1);
    expect(s.dragons[0].name).toBe('Ashvel');
    expect(s.dragons[0].mood).toBe(40);
    expect(s.dragons[0].stage).toBe(2);
    // refused: a rogue flyer for a day and up to two dark roofs alight
    const h1 = placeBuildingRaw(s, 'hearth', cradle.x + 4, cradle.y, 1); ok(h1); h1.lit = false;
    const h2 = placeBuildingRaw(s, 'hearth', cradle.x + 5, cradle.y, 1); ok(h2); h2.lit = false;
    const h3 = placeBuildingRaw(s, 'hearth', cradle.x + 6, cradle.y, 1); ok(h3); h3.lit = false;
    s.departed.push({ name: 'Cinder', line: 'ember', stage: 2, day: s.day - 31, x: cradle.x, y: cradle.y, returned: false });
    s.coverage.ward.fill(0); // nothing wards these roofs, and nothing else near the cradle is dark
    for (const b of s.buildings) if (b && b !== h1 && b !== h2 && b !== h3) b.lit = true;
    maybeFireReturn(s);
    resolveEvent(s, 2);
    expect([h1, h2, h3].filter((h) => h.state === 'burning').length).toBe(2);
    const rogue = s.agents.find((a) => a.species === 'wyvern' && a.dragonId === -1);
    expect(rogue).toBeTruthy();
    expect(rogue!.phase).toBe(3);
    for (let k = 0; k < TICKS_PER_DAY + 5; k++) { tickCreatures(s); s.tick++; }
    updateCreatures(s);
    expect(s.agents.some((a) => a.species === 'wyvern' && a.dragonId === -1)).toBe(false);
    expect(s.departed.every((e) => e.returned)).toBe(true);
  });
});

describe('Roles with a price', () => {
  it('a delver halves the chance of waking a Concord Warden at its mine', () => {
    const woken = (delver: boolean) => {
      const s = createGame(13, 'Seam');
      const f = s.founding;
      flatten(s, f.x - 12, f.y - 12, f.x + 12, f.y + 12);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (s.terrain[idx(f.x + 6 + dx, f.y - 6 + dy)] !== Terrain.LeyNode) s.terrain[idx(f.x + 6 + dx, f.y - 6 + dy)] = Terrain.Hills;
      const mine = placeBuildingRaw(s, 'mine', f.x + 6, f.y - 6); ok(mine); mine.age = 10;
      const cradle = placeBuildingRaw(s, 'cradle', f.x - 4, f.y + 2); ok(cradle); cradle.lit = true;
      recomputeAll(s);
      if (delver) { const d = addEgg(s, 'ember')!; d.stage = 2; expect(setRole(s, d.id, 'delver', mine.id)).toBeNull(); expect(delverAt(s, mine)).toBe(true); } else expect(delverAt(s, mine)).toBe(false);
      for (let k = 0; k < 150; k++) dailyBeasts(s);
      return s.stats.golemsWoken;
    };
    const without = woken(false);
    const withDelver = woken(true);
    expect(without).toBeGreaterThan(0);
    expect(withDelver).toBeLessThan(without); // the same rolls, half the chance
  });

  it('a courier remembers its last trip', () => {
    const { s, f, cradle, markets } = nest();
    const crafts = [];
    for (let x = f.x + 9; x <= f.x + 11; x++) { const c = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); ok(c); c.workers = 8; c.stock = 50; crafts.push(c); }
    recomputeAll(s);
    cradle.lit = true;
    const d = addEgg(s, 'ember')!;
    d.stage = 3;
    feedAll(markets, 0);
    expect(setRole(s, d.id, 'courier')).toBeNull();
    for (let k = 0; k < 4000 && !d.lastTrip; k++) { if (k % 50 === 20) updateCreatures(s); tickCreatures(s); s.tick++; }
    expect(d.lastTrip).toBeTruthy();
    expect(d.lastTrip!.goods).toBeGreaterThan(0);
    expect(d.lastTrip!.day).toBe(s.day);
    expect(crafts.some((c) => c.x === d.lastTrip!.fx)).toBe(true);
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Nest'));
    expect(back.dragons[0].lastTrip?.goods).toBe(d.lastTrip!.goods);
  });

  it('the odds are shown and a challenger of its own weight can beat a great wyrm', () => {
    const s = createGame(5, 'Ring');
    const champ: Dragon = { id: 1, name: 'Ossa', line: 'vein', stage: 4, days: 0, cradleId: 1, role: 'champion', roleTarget: -1, mood: 70, hungry: 0, training: 'gentle', agentId: -1, born: 0 };
    expect(boutOdds(s, champ, 0).chance).toBeCloseTo(0.875, 5);
    expect(boutOdds(s, { ...champ, mood: 30 }, 0).chance).toBeCloseTo(0.5, 5);
    expect(boutOdds(s, champ, 300).chance).toBeCloseTo(0.361, 2); // year two, the Ember season: the challengers grow
    expect(boutOdds(s, { ...champ, stage: 2 }, 0).chance).toBeCloseTo(0.875, 5); // the stage cancels: a drake fights drakes
    s.day = 44; expect(nextBoutDay(s)).toBe(45);
    s.day = 45; expect(nextBoutDay(s)).toBe(75);
    s.day = 10; expect(nextBoutDay(s)).toBe(45);
    // a mood-30 great wyrm loses some bouts
    const { s: t, cradle } = nest();
    const ring = placeBuildingRaw(t, 'ring', cradle.x + 6, cradle.y - 6); ok(ring);
    const d = addEgg(t, 'vein')!;
    d.stage = 4; d.trueblood = true;
    expect(setRole(t, d.id, 'champion')).toBeNull();
    for (let k = 0; k < 12; k++) { t.day = 45 + k * 30; d.mood = 30; d.stage = 4; seasonalBout(t); }
    expect(t.stats.boutsLost).toBeGreaterThan(0);
    expect(t.stats.boutsWon).toBeGreaterThan(0);
    expect(t.messages.some((m) => /odds were/.test(m.text))).toBe(true);
  });
});

describe('Materials with sinks', () => {
  it('Scale-Mail wears scale a day and lowers unrest while the vault holds any', () => {
    const { s, f } = nest();
    for (let k = 0; k < 8; k++) { const h = placeBuildingRaw(s, 'hearth', f.x - 8 + k, f.y + 1, 1); ok(h); h.residents = 4; h.lit = true; }
    recomputeAll(s);
    s.materials.scale = 1;
    expect(scaleMailOn(s)).toBe(false);
    s.edicts.scalemail = true;
    expect(scaleMailOn(s)).toBe(true);
    dailyDragons(s);
    expect(s.materials.scale).toBeCloseTo(0.95, 5);
    s.edicts.scalemail = false;
    for (let k = 0; k < 60; k++) updateSocial(s);
    const off = s.unrest;
    s.edicts.scalemail = true;
    s.materials.scale = 100;
    for (let k = 0; k < 60; k++) updateSocial(s);
    expect(off - s.unrest).toBeCloseTo(0.05, 2);
    s.materials.scale = 0;
    for (let k = 0; k < 60; k++) updateSocial(s);
    expect(s.unrest).toBeCloseTo(off, 2); // idle without scale
  });

  it('the Forge burns wyrmfire and goes cold; the city burns a share for Craft only while the toggle is on', () => {
    const { s, f, cradle, markets } = nest();
    const c = placeBuildingRaw(s, 'craft', f.x + 9, f.y + 1, 2); ok(c); c.workers = 6; c.lit = true;
    const forge = placeBuildingRaw(s, 'wyrmforge', f.x + 12, f.y + 1); ok(forge); forge.lit = true;
    recomputeAll(s);
    cradle.lit = true; c.lit = true; forge.lit = true;
    s.materials.wyrmfire = 0.25;
    expect(forgeHot(s)).toBe(true);
    expect(wyrmfireBonus(s)).toBe(0.15);
    dailyDragons(s);
    expect(s.materials.wyrmfire).toBeCloseTo(0.25 - WYRMFIRE_BURN - FORGE_BURN, 5);
    dailyDragons(s);
    expect(s.materials.wyrmfire).toBe(0);
    expect(forgeHot(s)).toBe(false);
    expect(wyrmfireBonus(s)).toBe(0);
    s.materials.wyrmfire = 1;
    s.burnWyrmfire = false;
    expect(wyrmfireBonus(s)).toBe(0);
    dailyDragons(s);
    expect(s.materials.wyrmfire).toBeCloseTo(1 - FORGE_BURN, 5); // the Forge alone
    // the works near a hot Forge make half again as much as near a cold one
    const made = () => { c.stock = 0; c.workers = 6; feedAll(markets); dailyBuildings(s); return c.stock; };
    s.burnWyrmfire = true; s.materials.wyrmfire = 5;
    const hot = made();
    s.materials.wyrmfire = 0;
    const cold = made();
    expect(hot / cold).toBeCloseTo(1.5, 1);
  });

  it('eggshell lines a nest for a faster hatching; the Font costs 3', () => {
    const { s, cradle } = nest();
    const d = addEgg(s, 'bone')!;
    expect(lineNest(s, d.id)).toMatch(/eggshell/);
    s.materials.eggshell = 1;
    expect(lineNest(s, d.id)).toBeNull();
    expect(s.materials.eggshell).toBe(0);
    expect(d.lined).toBe(true);
    expect(lineNest(s, d.id)).toMatch(/Already/);
    let days = 0;
    while (d.stage === 0 && days < 40) { cradle.lit = true; dailyDragons(s); days++; }
    expect(days).toBe(Math.ceil(STAGE_DAYS[0] / EGGSHELL_HATCH));
    expect(BUILDING_BY_KEY.eggshellfont.materials!.eggshell).toBe(3);
  });

  it('glim-dust lights a dark road tile for a season, conducts nothing, and goes with the road', () => {
    const { s, f } = nest();
    const far = idx(f.x + 15, f.y + 3);
    expect(s.road[far]).toBe(RoadType.Track);
    updateMana(s);
    expect(s.lit[far]).toBe(0);
    expect(scatterDust(s, f.x + 15, f.y + 3).ok).toBe(false);
    s.materials.glimdust = 1.5;
    expect(scatterDust(s, f.x + 15, f.y + 3).ok).toBe(true);
    expect(s.materials.glimdust).toBeCloseTo(0.5, 5);
    expect(scatterDust(s, f.x + 15, f.y + 3).reason).toMatch(/Already/);
    expect(s.dustLit[far]).toBe(s.day + 30);
    const demand = s.manaDemand;
    updateMana(s);
    expect(s.lit[far]).toBe(1);
    expect(s.manaDemand).toBe(demand);
    const h = placeBuildingRaw(s, 'hearth', f.x + 15, f.y + 2, 1); ok(h);
    updateMana(s);
    expect(h.lit).toBe(false); // dust lights no building
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Nest'));
    expect(back.dustLit[far]).toBe(s.day + 30);
    s.day += 30;
    s.dustLit[far] = s.day; // its day has come
    updateMana(s);
    expect(s.lit[far]).toBe(0);
    s.materials.glimdust = 1;
    s.road[idx(f.x + 14, f.y + 3)] = RoadType.Lantern;
    expect(scatterDust(s, f.x + 14, f.y + 3).ok).toBe(false);
  });

  it('the caravan sells the share of the vault the slider sets', () => {
    const { s } = nest();
    const e = ALL_EVENTS.find((x) => x.id === 'caravan')!;
    const pend = () => { s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'string' ? c.desc : c.desc(s), slider: c.slider })) }; };
    s.materials.scale = 10; s.materials.wyrmfire = 2;
    pend();
    expect(s.pendingEvent!.choices[1].slider?.max).toBe(100);
    const purse = s.treasury;
    resolveEvent(s, 1, 50);
    expect(s.materials.scale).toBe(5);
    expect(s.materials.wyrmfire).toBe(1);
    expect(s.treasury).toBe(purse + 5 * 400 + 500);
    pend();
    resolveEvent(s, 1); // no amount: everything, as before
    expect(s.materials.scale).toBe(0);
  });

  it('rays circling a Rayscale Mirror shed glim-dust where a Beacon school sheds rayscale', () => {
    const s = createGame(13, 'Rays');
    const f = s.founding;
    flatten(s, f.x - 10, f.y - 10, f.x + 10, f.y + 10);
    const mirror = placeBuildingRaw(s, 'raymirror', f.x + 3, f.y - 3); ok(mirror); mirror.lit = true;
    const beacon = placeBuildingRaw(s, 'leybeacon', f.x - 3, f.y + 3); ok(beacon); beacon.lit = true;
    const ray = (anchor: number): Agent => ({ id: s.nextAgentId++, kind: AgentKind.Creature, x: f.x, y: f.y, path: [], pathIdx: 0, speed: 1, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, species: 'skyray', anchorId: anchor, alt: 50, phase: 1 });
    for (let k = 0; k < 3; k++) s.agents.push(ray(mirror.id));
    s.materials.rayscale = 0; s.materials.glimdust = 0;
    dailyBeasts(s);
    expect(s.materials.glimdust).toBeCloseTo(0.6, 5);
    expect(s.materials.rayscale).toBe(0);
    s.agents = s.agents.filter((a) => a.species !== 'skyray');
    for (let k = 0; k < 3; k++) s.agents.push(ray(beacon.id));
    dailyBeasts(s);
    expect(s.materials.rayscale).toBeCloseTo(0.6 - 0.15, 5);
    expect(s.materials.glimdust).toBeCloseTo(0.6, 5);
  });
});

describe('Marvels and wonders with a role', () => {
  it('the Hall of Marvels exhibits each rare good for +2, lit only', () => {
    const { s, f } = nest();
    const h = placeBuildingRaw(s, 'hearth', f.x - 8, f.y + 1, 1); ok(h);
    const hall = placeBuildingRaw(s, 'hallofmarvels', f.x + 8, f.y - 6); ok(hall); hall.lit = true;
    recomputeAll(s); hall.lit = true;
    const h0 = computeBuildingHappiness(s, h);
    expect(marvelExhibits(s)).toBe(0);
    s.materials.scale = 2; s.materials.rayscale = 1; s.materials.glimdust = 0.4;
    expect(marvelExhibits(s)).toBe(2);
    expect(computeBuildingHappiness(s, h) - h0).toBe(4);
    s.materials.wyrmfire = 1; s.materials.eggshell = 1; s.materials.glimdust = 1;
    expect(computeBuildingHappiness(s, h) - h0).toBe(10);
    hall.lit = false;
    expect(computeBuildingHappiness(s, h) - h0).toBe(0);
  });

  it('the Lantern of the Cores takes the first 30 of a surge and cracks for ten days', () => {
    const s = createGame(41, 'Cores');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 10, f.x + 12, f.y + 10);
    s.milestone = 6;
    buildRoad(s, RoadType.Track, roadPath(f.x - 8, f.y + 2, f.x + 8, f.y + 2, false));
    const homes = [];
    for (let k = 0; k < 6; k++) { const h = placeBuildingRaw(s, 'hearth', f.x - 3 + k, f.y + 1, 1); ok(h); h.residents = 3; homes.push(h); }
    const cores = placeBuildingRaw(s, 'corelantern', f.x - 6, f.y - 4); ok(cores);
    recomputeAll(s);
    const storeWhole = s.manaStorageMax;
    for (const h of homes) h.lit = true;
    s.manaStorage = 0;
    s.manaSupply = 100;
    s.manaDemand = 130; // a small overdraw: 30 over, past the surge threshold of a quarter
    s.overdrawDays = 5;
    dailySurge(s);
    expect(cores.broken).toBe(CORES_BROKEN_DAYS);
    expect(cracked(cores)).toBe(true);
    expect(homes.filter((h) => h.state === 'ruin').length).toBe(0);
    expect(s.stats.surgesAbsorbed).toBe(1);
    updateMana(s);
    expect(storeWhole - s.manaStorageMax).toBeGreaterThanOrEqual(30); // its store is gone (45 on a Vein node)
    updateCoverage(s, 'ward');
    expect(s.coverage.ward[idx(cores.x, cores.y + 3)]).toBe(0);
    // it heals a day at a time
    s.overdrawDays = -4; s.manaDemand = 0;
    for (let k = 0; k < CORES_BROKEN_DAYS; k++) dailySurge(s);
    expect(cores.broken).toBe(0);
    expect(cracked(cores)).toBe(false);
    // a big overdraw cracks it and still breaks loose
    for (const h of homes) { h.lit = true; h.state = 'ok'; }
    s.manaStorage = 0;
    s.manaSupply = 100;
    s.manaDemand = 200;
    s.overdrawDays = 5;
    dailySurge(s);
    expect(cores.broken).toBe(CORES_BROKEN_DAYS);
    expect(homes.filter((h) => h.state === 'ruin').length).toBeGreaterThan(0);
    expect(s.stats.surgesAbsorbed).toBe(1);
  });

  it('every lit wonder hall delights the city and lifts the next grant a tenth', () => {
    const { s, f } = nest();
    const h = placeBuildingRaw(s, 'hearth', f.x - 8, f.y + 1, 1); ok(h);
    recomputeAll(s);
    const h0 = computeBuildingHappiness(s, h);
    const lantern = placeBuildingRaw(s, 'lantern', f.x + 8, f.y - 6); ok(lantern); lantern.lit = true;
    const court = placeBuildingRaw(s, 'wyrmcourt', f.x - 10, f.y - 6); ok(court); court.lit = true;
    expect(litWonders(s).length).toBe(2);
    expect(computeBuildingHappiness(s, h) - h0).toBe(10);
    court.lit = false;
    expect(computeBuildingHappiness(s, h) - h0).toBe(5);
    s.milestone = 3; s.population = 400;
    const purse = s.treasury;
    checkMilestones(s);
    expect(s.milestone).toBe(4);
    expect(s.treasury - purse).toBe(6600); // the Township's 6,000 and a tenth for the Lantern
    expect(s.messages.some((m) => /a tenth more/.test(m.text))).toBe(true);
  });

  it('the Lantern draws 10; the Weir makes 45, or 90 with the sluice open, which floods the bank below it in the Thaw', () => {
    expect(BUILDING_BY_KEY.lantern.manaUse).toBe(10);
    expect(BUILDING_BY_KEY.greatweir.manaProduce).toBe(45);
    const s = createGame(41, 'Weir', 'valley', 'veshari');
    const f = s.founding;
    flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
    for (let dx = -12; dx <= 12; dx++) for (let dy = 5; dy <= 6; dy++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Water;
    for (let dx = -13; dx <= 13; dx++) for (const dy of [4, 7]) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Shore;
    s.waterDist = distanceMap((i) => isWater(s.terrain[i]), 15);
    recomputeAll(s);
    const before = s.manaSupply;
    const weir = placeBuildingRaw(s, 'greatweir', f.x + 2, f.y + 7); ok(weir);
    updateMana(s);
    expect(s.manaSupply - before).toBeCloseTo(45, 5);
    expect(toggleSluice(s, weir.id)).toBeNull();
    updateMana(s);
    expect(s.manaSupply - before).toBeCloseTo(90, 5);
    s.day = 10; // the Thaw, past day 5
    expect(floodedAt(s, weir.x + 3, weir.y)).toBe(true);
    expect(floodedAt(s, weir.x + 40, weir.y)).toBe(false);
    weir.sluice = false;
    expect(floodedAt(s, weir.x + 3, weir.y)).toBe(false);
    const v = createGame(41, 'Dry'); // the Vellish river freezes: no flood of either kind
    expect(floodedAt(v, v.founding.x, v.founding.y)).toBe(false);
  });

  it("the Underking's Seat warms every hatchery within 30 for no mana", () => {
    const s = createGame(41, 'Deep', 'valley', 'grimmen');
    const f = s.founding;
    flatten(s, f.x - 30, f.y - 12, f.x + 30, f.y + 12);
    const seat = placeBuildingRaw(s, 'underkingseat', f.x - 4, f.y - 5); ok(seat);
    const hatch = placeBuildingRaw(s, 'hatchery', f.x + 20, f.y - 4); ok(hatch);
    recomputeAll(s);
    expect(seat.lit).toBe(true);
    expect(hatch.lit).toBe(true);
    expect(seatWarmed(s, hatch)).toBe(true);
    const demand = s.manaDemand;
    const hatch2 = placeBuildingRaw(s, 'hatchery', f.x + 22, f.y + 4); ok(hatch2);
    updateMana(s);
    expect(hatch2.lit).toBe(true);
    expect(s.manaDemand).toBe(demand); // warmed for nothing
    const far = placeBuildingRaw(s, 'hatchery', f.x - 28, f.y + 8); ok(far); // 25 tiles: within reach
    updateMana(s);
    expect(far.lit).toBe(true);
    seat.state = 'building';
    updateMana(s);
    expect(hatch.lit).toBe(false);
    expect(seatWarmed(s, hatch)).toBe(false);
  });

  it('the Lantern of Wicks halves what lit spires within 30 carry', () => {
    const s = createGame(41, 'Wicks', 'valley', 'tallowkin');
    const f = s.founding;
    flatten(s, f.x - 30, f.y - 12, f.x + 30, f.y + 12);
    const spire = placeBuildingRaw(s, 'spire', f.x + 5, f.y - 2); ok(spire);
    for (let k = 0; k < 4; k++) { const h = placeBuildingRaw(s, 'hearth', f.x + 7, f.y - 4 + k, 2); ok(h); h.residents = 3; }
    recomputeAll(s);
    expect(spire.lit).toBe(true);
    const load0 = spire.load!;
    expect(load0).toBeGreaterThan(0);
    const wicks = placeBuildingRaw(s, 'lanternofwicks', f.x + 12, f.y - 6); ok(wicks); // linked: a hall of the chain, carrying its own draw
    updateMana(s);
    expect(wicks.lit).toBe(true);
    expect(wicksHalved(s, spire)).toBe(true);
    expect(spire.load!).toBeCloseTo(load0 / 2, 5);
    expect(wicks.load).toBeGreaterThan(0);
  });
});

describe('The Wyrm-Court after the binding, and golems assigned', () => {
  it('a lit Court halves the appetite; dark two days, the wyrm sulks until it is lit; the Court needs a woken wyrm', () => {
    const s = createGame(21, 'Scale');
    expect(s.wyrm.node).toBeGreaterThanOrEqual(0);
    const n = wyrmNode(s)!;
    flatten(s, n.x - 8, n.y - 8, n.x + 8, n.y + 8);
    s.milestone = 7;
    expect(specialLock(s, 'wyrmcourt')).toMatch(/awake/);
    s.wyrm.state = 'awake';
    expect(specialLock(s, 'wyrmcourt')).toBeNull();
    const f = s.founding;
    flatten(s, f.x - 10, f.y - 8, f.x + 10, f.y + 6);
    for (let k = 0; k < 8; k++) { const m = placeBuildingRaw(s, 'market', f.x - 8 + k * 2, f.y + 4, 2); ok(m); m.stock = 200; }
    bind(s);
    expect(wyrmEats(s)).toBe(WYRM_EATS);
    const court = placeBuildingRaw(s, 'wyrmcourt', f.x - 2, f.y - 6); ok(court); court.lit = true;
    expect(wyrmEats(s)).toBe(WYRM_EATS / 2);
    const g0 = marketGoods(s);
    dailyWyrm(s);
    expect(g0 - marketGoods(s)).toBeCloseTo(WYRM_EATS / 2, 5);
    expect(s.wyrm.courted).toBe(true);
    court.lit = false;
    dailyWyrm(s);
    expect(s.wyrm.courtDark).toBe(1);
    expect(s.wyrm.sulking).toBe(0);
    dailyWyrm(s);
    expect(s.wyrm.sulking).toBe(1);
    expect(wyrmGuards(s)).toBe(false);
    dailyWyrm(s); // fed, but the Court is still dark: it sulks on
    expect(s.wyrm.sulking).toBe(1);
    court.lit = true;
    dailyWyrm(s);
    expect(s.wyrm.sulking).toBe(0);
    expect(s.wyrm.courtDark).toBe(0);
    expect(wyrmGuards(s)).toBe(true);
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Scale'));
    expect(back.wyrm.courted).toBe(true);
  });

  it('a bound warden labours, guards its foundry or works a bench; a surge frees it', () => {
    const s = createGame(13, 'Beasts');
    const f = s.founding;
    flatten(s, f.x - 20, f.y - 8, f.x + 20, f.y + 12);
    s.milestone = 6;
    const fd = placeBuildingRaw(s, 'golemfoundry', f.x + 6, f.y + 4); ok(fd); fd.lit = true;
    const works = placeBuildingRaw(s, 'craft', f.x + 10, f.y + 2, 1); ok(works); works.workers = 2; works.lit = true;
    recomputeAll(s);
    const g: Agent = { id: s.nextAgentId++, kind: AgentKind.Creature, x: fd.x + 1, y: fd.y + 2.5, path: [], pathIdx: 0, speed: 0.45, homeId: fd.id, targetId: -1, timer: 0, variant: 0, dir: 0, load: 1, species: 'golem', anchorId: -1, ax: fd.x + 1, ay: fd.y + 2.5 };
    s.agents.push(g);
    const wf0 = workforceOf(s);
    expect(labourGolems(s)).toBe(1);
    expect(setGolemDuty(s, g.id, 'guard')).toBeNull();
    expect(labourGolems(s)).toBe(0);
    expect(guardGolems(s).length).toBe(1);
    expect(workforceOf(s)).toBe(wf0 - GOLEM_LABOUR);
    updateCoverage(s, 'ward');
    expect(s.coverage.ward[idx(fd.x + 1, fd.y + 3)]).toBeGreaterThan(0);
    expect(s.coverage.ward[idx(fd.x + 1, fd.y + 12)]).toBe(0);
    expect(setGolemDuty(s, g.id, 'works', works.id)).toBeNull();
    expect(worksGolems(s, works)).toBe(1);
    expect(guardGolems(s).length).toBe(0);
    const made = () => { works.stock = 0; dailyBuildings(s); return works.stock; };
    const posted = made();
    expect(setGolemDuty(s, g.id, 'labour')).toBeNull();
    const alone = made();
    expect(posted).toBeGreaterThan(alone);
    expect(labourGolems(s)).toBe(1);
    expect(setGolemDuty(s, g.id, 'works', -1)).toMatch(/Craft works/);
    setGolemDuty(s, g.id, 'guard');
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Beasts'));
    expect(guardGolems(back).length).toBe(1);
    expect(surgeMaddensGolems(s)).toBe(1);
    expect(g.duty).toBeUndefined();
    expect(g.load).toBe(0);
  });
});
