// Iteration 52, M13 part 2: the Wick chapter, three tales, the lamplighter, the Hall of Wicks, the bot's towers.
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, idx } from '../src/sim/types';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { QUESTS } from '../src/data/quests';
import { questsFor } from '../src/sim/quests';
import { TALLOWKIN, resolveEvent } from '../src/sim/events';
import { BUILDING_BY_KEY, WONDER_HALLS } from '../src/sim/catalog';
import { canBuild, costOf, litShare, specialLock, type FactionId } from '../src/data/factions';
import { WALKER_JOBS, dailyWalkers, spawnWalker } from '../src/sim/walkers';
import { updateMana } from '../src/sim/networks';
import { dailyBuildings } from '../src/sim/growth';
import { DEV_COMMANDS } from '../src/sim/dev';
import { serialize, deserialize } from '../src/sim/save';
import { roadTileOf } from '../src/sim/agents';
import { flatten } from './helpers';

function town(faction: FactionId = 'tallowkin') {
  const s = createGame(41, 'Wickmere', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.treasury = 50000;
  s.sectors.fill(1);
  recomputeAll(s);
  return s;
}
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };
const fire = (s: ReturnType<typeof town>, id: string, choice: number) => { const e = TALLOWKIN.find((x) => x.id === id)!; s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'string' ? c.desc : c.desc(s) })) }; s.firedEvents.push(`${e.id}:?`); return resolveEvent(s, choice); };

describe('The Wick: the chapter', () => {
  it('shows eight quests to the Tallowkin in order and none to the Vellish; the last is the Lantern at priority 70', () => {
    const s = town();
    const wick = QUESTS.filter((q) => q.chapter === 'The Wick');
    expect(wick.map((q) => q.id)).toEqual(['t_spire', 't_tower', 't_shrine', 't_half', 't_vigil', 't_nexus', 't_hall', 't_lantern']);
    expect(questsFor(s).filter((q) => q.chapter === 'The Wick').length).toBe(8);
    expect(questsFor(town('vellish')).some((q) => q.chapter === 'The Wick')).toBe(false);
    expect(wick[7].priority).toBe(70);
    expect(wick[7].reward).toBe(5000);
    const f = s.founding;
    const sp = placeBuildingRaw(s, 'spire', f.x + 2, f.y + 1); ok(sp); recomputeAll(s);
    expect(sp.lit).toBe(true);
    expect(wick[0].done(s)).toBe(true);
    expect(wick[3].done(s)).toBe(false); // fewer than twenty buildings
    s.firedEvents.push('vigil:0');
    expect(wick[4].done(s)).toBe(true);
  });
});

describe('The Tallowkin tales', () => {
  it("the spire-wrights' strike: pay, or spires and towers cost half again for ten days", () => {
    const s = town();
    const f = s.founding;
    for (let k = 0; k < 4; k++) { const sp = placeBuildingRaw(s, 'spire', f.x - 10 + k * 5, f.y + 1); ok(sp); }
    expect(TALLOWKIN[0].when(s)).toBe(true);
    expect(TALLOWKIN[0].when(town('vellish'))).toBe(false);
    const t0 = s.treasury;
    fire(s, 'wrights_strike', 0);
    expect(t0 - s.treasury).toBe(700);
    const spire = costOf(s, BUILDING_BY_KEY.spire), tower = costOf(s, BUILDING_BY_KEY.wicktower);
    fire(s, 'wrights_strike', 1);
    expect(costOf(s, BUILDING_BY_KEY.spire)).toBe(Math.round(spire * 1.5));
    expect(costOf(s, BUILDING_BY_KEY.wicktower)).toBe(Math.round(tower * 1.5));
    expect(costOf(s, BUILDING_BY_KEY.well)).toBe(BUILDING_BY_KEY.well.cost);
    s.day += 11;
    expect(costOf(s, BUILDING_BY_KEY.spire)).toBe(spire);
  });

  it('the surge in the wickhouses burns bright or is snuffed; the candle-eyed child reads a true vein or is schooled', () => {
    const s = town();
    const f = s.founding;
    const sp = placeBuildingRaw(s, 'spire', f.x, f.y + 1); ok(sp);
    for (let k = 0; k < 10; k++) { const h = placeBuildingRaw(s, 'hearth', f.x - 5 + k, f.y + 3); ok(h); h.residents = 3; }
    recomputeAll(s);
    s.stats.surgesTotal = 1;
    expect(TALLOWKIN[1].when(s)).toBe(true);
    fire(s, 'surge_wickhouses', 1);
    expect(s.modifiers.some((m) => m.kind === 'mana' && m.value === 0.15)).toBe(true);
    expect(s.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'burning').length).toBe(2);
    const t0 = s.treasury;
    fire(s, 'surge_wickhouses', 0);
    expect(t0 - s.treasury).toBe(300);
    expect(s.modifiers.some((m) => m.kind === 'happiness' && m.value === 4)).toBe(true);
    s.milestone = 3;
    expect(TALLOWKIN[2].when(s)).toBe(true);
    const veins = s.stats.trueVeins;
    fire(s, 'candle_child', 0);
    expect(s.stats.trueVeins).toBe(veins + 1);
    fire(s, 'candle_child', 1);
    expect(s.educatedFloor).toBeCloseTo(0.02, 9);
  });
});

describe('The lamplighter and the Hall of Wicks', () => {
  it('a lit Wick-Tower sends one lamplighter who relights a dark home for the day; the ley pass keeps it lit; the home stays', () => {
    const s = town();
    const f = s.founding;
    const sp = placeBuildingRaw(s, 'spire', f.x, f.y + 1); ok(sp);
    const tower = placeBuildingRaw(s, 'wicktower', f.x + 5, f.y + 1); ok(tower);
    const dark = placeBuildingRaw(s, 'hearth', f.x + 14, f.y + 1); ok(dark); dark.residents = 3; // past any light
    recomputeAll(s);
    expect(tower.lit).toBe(true);
    expect(dark.lit).toBe(false);
    const job = WALKER_JOBS.lamplighter;
    expect(job.count(s, tower)).toBe(1);
    tower.lit = false; expect(job.count(s, tower)).toBe(0); tower.lit = true;
    dailyWalkers(s);
    expect(s.agents.filter((a) => a.job === 'lamplighter').length).toBe(1);
    const a = s.agents.find((x) => x.job === 'lamplighter')!;
    const door = roadTileOf(s, dark);
    expect(job.target!(s, a, tower)).toBe(door);
    job.onArrive!(s, a, door);
    expect(dark.relit).toBe(s.day + 1);
    expect(dark.lit).toBe(true);
    expect(s.stats.lamplighterRounds).toBe(1);
    updateMana(s);
    expect(dark.lit).toBe(true); // the candle holds through the ley's pass
    expect(litShare(s)).toBe(1);
    dark.problemDays = 5;
    dailyBuildings(s);
    expect(dark.state).toBe('ok'); // lit, so the dark-abandon rule does not bite
    s.day += 2;
    updateMana(s);
    expect(dark.lit).toBe(false); // the candle is out
    expect(job.target!(s, a, tower)).toBe(door); // and the lamplighter comes again
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.buildings.find((b) => b && b.kind === 'hearth')!.relit).toBe(dark.relit);
  });

  it('the Hall of Wicks is sworn at the vigil, is a ley hall with three lamplighters, and the dev round lights the city', () => {
    const s = town();
    const f = s.founding;
    s.milestone = 5;
    expect(canBuild(s, 'hallofwicks')).toBe(false);
    expect(specialLock(s, 'hallofwicks')).toMatch(/vigil/);
    expect(canBuild(town('vellish'), 'hallofwicks')).toBe(false);
    s.firedEvents.push('vigil:0');
    expect(canBuild(s, 'hallofwicks')).toBe(true);
    expect(WONDER_HALLS).toContain('hallofwicks');
    const r = placeBuilding(s, 'hallofwicks', f.x + 8, f.y - 1); // its south edge on the road, clear of the stake
    expect(r.ok).toBe(true);
    const hall = s.buildings.find((b) => b && b.kind === 'hallofwicks')!;
    ok(hall); recomputeAll(s);
    expect(hall.lit).toBe(true);
    expect(s.manaStorageMax).toBeGreaterThanOrEqual(40);
    expect(WALKER_JOBS.lamplighter.count(s, hall)).toBe(3);
    expect(placeBuilding(s, 'hallofwicks', f.x - 8, f.y - 1).reason).toBe('Only one may be raised');
    const far = placeBuildingRaw(s, 'hearth', f.x - 16, f.y + 1); ok(far); far.residents = 2; // beyond the stake's and the hall's light
    recomputeAll(s);
    expect(far.lit).toBe(false);
    const dev = DEV_COMMANDS.find((c) => c.id === 'lamplight')!;
    expect(dev.run(s, '', { x: f.x, y: f.y })).toMatch(/candles lit/);
    expect(far.relit).toBe(s.day + 3);
    updateMana(s);
    expect(far.lit).toBe(true);
  });
});
