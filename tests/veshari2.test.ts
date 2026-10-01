import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx, isWater } from '../src/sim/types';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { computeBuildingHappiness } from '../src/sim/growth';
import { updateMana } from '../src/sim/networks';
import { FLOODPROOF, dailyWeave, flooding, riverFrozen } from '../src/sim/weave';
import { BARGE_VARIANT, dailyBarges } from '../src/sim/vehicles';
import { ALL_EVENTS, VESHARI, resolveEvent } from '../src/sim/events';
import { QUESTS } from '../src/data/quests';
import { questsFor } from '../src/sim/quests';
import { WALKER_JOBS, dailyWalkers, tickWalkers, walkersOf } from '../src/sim/walkers';
import { distanceMap } from '../src/sim/terrain';
import { Bot } from '../src/sim/bot';
import { WONDER_HALLS } from '../src/sim/catalog';
import { moorings, type FactionId } from '../src/data/factions';
import { flatten } from './helpers';

function town(faction: FactionId = 'veshari') {
  const s = createGame(41, 'Sablemouth', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  for (let dx = -12; dx <= 12; dx++) for (let dy = 5; dy <= 6; dy++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Water;
  for (let dx = -13; dx <= 13; dx++) for (const dy of [4, 7]) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Shore;
  for (const dy of [5, 6]) { s.terrain[idx(f.x - 13, f.y + dy)] = Terrain.Shore; s.terrain[idx(f.x + 13, f.y + dy)] = Terrain.Shore; }
  s.waterDist = distanceMap((i) => isWater(s.terrain[i]), 15);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 9, f.x + 14, f.y + 9, false));
  s.treasury = 50000;
  recomputeAll(s);
  return s;
}
function fire(s: ReturnType<typeof town>, id: string, choice: number): string {
  const e = ALL_EVENTS.find((x) => x.id === id)!;
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: [] };
  resolveEvent(s, choice);
  return s.messages.at(-1)!.text;
}
const count = (s: ReturnType<typeof town>, kind: string) => s.buildings.filter((b) => b && b.kind === kind).length;

describe('The Hush flood', () => {
  it('rises from the fifth night for the Veshari, never for the Vellish, and not behind a Weir', () => {
    const s = town();
    const v = town('vellish');
    s.day = 93; v.day = 93;
    expect(flooding(s)).toBe(false);
    s.day = 95; v.day = 95;
    expect(flooding(s)).toBe(true);
    expect(flooding(v)).toBe(false);
    expect(riverFrozen(s)).toBe(false);
    const weir = placeBuildingRaw(s, 'greatweir', s.founding.x + 6, s.founding.y + 7);
    expect(weir.state).toBe('ok');
    expect(flooding(s)).toBe(false);
  });

  it('costs a bank home ten happiness and its land value ten, and a landing nothing', () => {
    const s = town();
    const f = s.founding;
    const home = placeBuildingRaw(s, 'hearth', f.x - 2, f.y + 4); home.residents = 4;
    const landing = placeBuildingRaw(s, 'landing', f.x + 2, f.y + 4);
    recomputeAll(s);
    const bank = idx(f.x - 2, f.y + 4);
    const lv0 = s.landValue[bank];
    const h0 = computeBuildingHappiness(s, home);
    const l0 = computeBuildingHappiness(s, landing);
    s.day = 96;
    recomputeAll(s);
    expect(lv0 - s.landValue[bank]).toBe(10);
    expect(h0 - computeBuildingHappiness(s, home)).toBeGreaterThanOrEqual(10); // the flood, plus the land value it took
    expect(computeBuildingHappiness(s, landing)).toBe(l0 - 3); // only the land value moved
    expect(FLOODPROOF).toContain('landing');
    // a flood is weathered when the Hush ends with the river having risen
    for (let d = 90; d < 120; d++) { s.day = d; dailyWeave(s); }
    expect(s.stats.floodDays).toBe(25);
    expect(s.stats.floodsWeathered).toBe(1);
  });
});

describe('The Great Weir', () => {
  it('is the Veshari wonder: on the water, 90 mana, a ward of 30, a ley hall', () => {
    const v = town('vellish');
    expect(placeBuilding(v, 'greatweir', v.founding.x + 6, v.founding.y + 7).ok).toBe(false);
    const s = town();
    const f = s.founding;
    s.milestone = 7;
    expect(placeBuilding(s, 'greatweir', f.x + 6, f.y - 3).ok).toBe(false); // no water, no road
    expect(placeBuilding(s, 'lantern', f.x + 6, f.y - 4).ok).toBe(false); // replaced
    const before = s.manaSupply;
    expect(placeBuilding(s, 'greatweir', f.x + 6, f.y + 7).ok).toBe(true);
    updateMana(s);
    expect(s.manaSupply - before).toBeCloseTo(90, 5);
    recomputeAll(s);
    expect(s.coverage.ward[idx(f.x + 6, f.y - 10)]).toBeGreaterThan(0);
    expect(WONDER_HALLS).toContain('greatweir');
  });
});

describe('The Sable chapter and the tales', () => {
  it('shows eight quests to the Veshari and none to the Vellish; barges and floods complete them', () => {
    const s = town();
    const sable = QUESTS.filter((q) => q.chapter === 'The Sable');
    expect(sable.length).toBe(8);
    expect(questsFor(s).filter((q) => q.chapter === 'The Sable').length).toBe(8);
    expect(questsFor(town('vellish')).some((q) => q.chapter === 'The Sable')).toBe(false);
    s.stats.bargeTrips = 1; s.stats.floodsWeathered = 1;
    expect(sable.find((q) => q.id === 'v_barge')!.done(s)).toBe(true);
    expect(sable.find((q) => q.id === 'v_flood')!.done(s)).toBe(true);
    expect(sable.find((q) => q.id === 'v_weir')!.done(s)).toBe(false);
  });

  it('a tide egg and a storm egg land in the Tide Pool; the strike halts the barges', () => {
    const s = town();
    const f = s.founding;
    s.milestone = 4;
    expect(VESHARI.length).toBe(3);
    expect(VESHARI.find((e) => e.id === 'tide_net')!.when(s)).toBe(false); // no pool yet
    const pool = placeBuildingRaw(s, 'tidepool', f.x + 10, f.y + 7);
    pool.lit = true;
    expect(VESHARI.find((e) => e.id === 'tide_net')!.when(s)).toBe(true);
    expect(VESHARI.find((e) => e.id === 'tide_net')!.when(town('vellish'))).toBe(false);
    fire(s, 'tide_net', 0);
    expect(s.dragons.some((d) => d.line === 'tide' && d.cradleId === pool.id)).toBe(true);
    expect(VESHARI.find((e) => e.id === 'storm_egg')!.when(s)).toBe(false);
    s.stats.stormWarps = 1;
    expect(VESHARI.find((e) => e.id === 'storm_egg')!.when(s)).toBe(true);
    fire(s, 'storm_egg', 0);
    expect(s.dragons.some((d) => d.line === 'storm')).toBe(true);
    fire(s, 'storm_egg', 2);
    expect(s.storms.length).toBe(1);
    // the strike
    const la = placeBuildingRaw(s, 'landing', f.x - 11, f.y + 4);
    placeBuildingRaw(s, 'landing', f.x + 11, f.y + 4);
    placeBuildingRaw(s, 'landing', f.x - 5, f.y + 4);
    placeBuildingRaw(s, 'landing', f.x + 5, f.y + 4);
    const c = placeBuildingRaw(s, 'craft', f.x - 10, f.y + 1, 2); c.stock = 60;
    const m = placeBuildingRaw(s, 'market', f.x + 10, f.y + 1, 2); m.stock = 0;
    recomputeAll(s);
    expect(moorings(s)).toBe(4);
    expect(VESHARI.find((e) => e.id === 'bargemen_strike')!.when(s)).toBe(true);
    const t0 = s.treasury;
    fire(s, 'bargemen_strike', 0);
    expect(t0 - s.treasury).toBe(900);
    dailyBarges(s);
    expect(s.agents.filter((a) => a.kind === AgentKind.Cart && a.variant === BARGE_VARIANT).length).toBeGreaterThanOrEqual(1);
    s.agents = s.agents.filter((a) => a.variant !== BARGE_VARIANT);
    c.stock = 60; m.stock = 0;
    fire(s, 'bargemen_strike', 1);
    dailyBarges(s);
    expect(s.agents.some((a) => a.kind === AgentKind.Cart && a.variant === BARGE_VARIANT)).toBe(false);
    s.day += 9;
    c.stock = 60; m.stock = 0;
    dailyBarges(s);
    expect(s.agents.some((a) => a.kind === AgentKind.Cart && a.homeId === la.id)).toBe(true);
  });
});

describe('The bargeman', () => {
  it('walks from every mooring of the Veshari, none for the Vellish, and bails the bank in a flood', () => {
    const s = town();
    const f = s.founding;
    const l1 = placeBuildingRaw(s, 'landing', f.x - 6, f.y + 4);
    const l2 = placeBuildingRaw(s, 'landing', f.x + 6, f.y + 4);
    const home = placeBuildingRaw(s, 'hearth', f.x, f.y + 4); home.residents = 4;
    recomputeAll(s);
    dailyWalkers(s);
    expect(walkersOf(s, l1).map((a) => a.job)).toEqual(['bargeman']);
    expect(walkersOf(s, l2).map((a) => a.job)).toEqual(['bargeman']);
    expect(WALKER_JOBS.bargeman.from).toContain('quay');
    const v = town('vellish');
    const q = placeBuildingRaw(v, 'quay', v.founding.x - 6, v.founding.y + 4);
    recomputeAll(v);
    dailyWalkers(v);
    expect(walkersOf(v, q).length).toBe(0);
    // the flood: the bargeman tends the bank home
    s.day = 96;
    recomputeAll(s);
    dailyWalkers(s);
    for (let k = 0; k < 2500 && (home.tended ?? -1) < s.day; k++) { tickWalkers(s); s.tick++; }
    expect(home.tended).toBe(s.day);
    expect(s.stats.bargemanRounds).toBeGreaterThanOrEqual(1);
    expect(computeBuildingHappiness(s, home)).toBeGreaterThan(0);
  });
});

describe('The bot on the Sable', () => {
  it('lays a landing beside its works and raises the Weir at Vesh\'s Court', () => {
    const s = town();
    const f = s.founding;
    const bot = new Bot(s);
    placeBuildingRaw(s, 'landing', f.x - 12, f.y + 4);
    const c = placeBuildingRaw(s, 'craft', f.x + 11, f.y + 1, 2);
    recomputeAll(s);
    (bot as any).moor();
    expect(s.buildings.some((b) => b && b.kind === 'landing' && Math.abs(b.x - c.x) <= 8 && Math.abs(b.y - c.y) <= 8)).toBe(true);
    s.milestone = 7; s.treasury = 60000;
    (bot as any).buyServices();
    expect(count(s, 'greatweir')).toBe(1);
  });
  it('keeps the river for twenty days', () => {
    const s = town();
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 20, { onDay: () => bot.step() });
    expect(s.milestone).toBeGreaterThanOrEqual(1);
    expect(s.terrain.filter((t) => t === Terrain.Water).length).toBeGreaterThan(0);
  });
});
