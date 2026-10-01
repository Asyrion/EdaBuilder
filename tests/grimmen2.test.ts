import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, nodeMana } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { AgentKind, RoadType, Terrain, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { canBuild, stoneQuarried, milestonesOf } from '../src/data/factions';
import { FORGE_WAKE_RADIUS, GOLEM_HOUSES, boundGolems, dailyBeasts, foundries, wildGolems } from '../src/sim/beasts';
import { spawnCreature } from '../src/sim/creatures';
import { updateCoverage, updateLandValue } from '../src/sim/services';
import { updateMana } from '../src/sim/networks';
import { GRIMMEN, ALL_EVENTS, resolveEvent } from '../src/sim/events';
import { activeQuests } from '../src/sim/quests';
import { QUESTS } from '../src/data/quests';
import { flatten } from './helpers';

function town(faction: 'vellish' | 'grimmen' = 'grimmen') {
  const s = createGame(41, 'Underhill', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  for (let dy = 4; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
  s.treasury = 50000;
  return s;
}

function fire(s: ReturnType<typeof town>, id: string, choice: number): string {
  const e = ALL_EVENTS.find((x) => x.id === id)!;
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: [] };
  resolveEvent(s, choice);
  return s.messages.at(-1)!.text;
}

describe('The Forge-Temple and the Underking\'s Seat', () => {
  it('replace the foundry and the Lantern for the Grimmen only', () => {
    const g = town();
    const v = town('vellish');
    g.milestone = 7; v.milestone = 7;
    expect(canBuild(g, 'golemfoundry')).toBe(false);
    expect(canBuild(g, 'lantern')).toBe(false);
    expect(canBuild(g, 'forgetemple')).toBe(true);
    expect(canBuild(g, 'underkingseat')).toBe(true);
    expect(canBuild(v, 'forgetemple')).toBe(false);
    expect(canBuild(v, 'underkingseat')).toBe(false);
    expect(canBuild(v, 'lantern')).toBe(true);
    expect(milestonesOf(g)[6].unlocks).toContain('forgetemple');
    expect(milestonesOf(g)[7].unlocks).toContain('underkingseat');
    expect(GOLEM_HOUSES).toContain('forgetemple');
  });

  it('a lit Forge-Temple binds wild Wardens within 12, and a Warden woken within 20 of it climbs out bound', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'spire', f.x + 4, f.y + 1);
    const ft = placeBuildingRaw(s, 'forgetemple', f.x + 5, f.y + 4);
    recomputeAll(s);
    expect(ft.lit).toBe(true);
    expect(foundries(s).map((b) => b.kind)).toEqual(['forgetemple']);
    spawnCreature(s, 'golem', f.x + 6, f.y + 6);
    expect(wildGolems(s)).toBe(1);
    dailyBeasts(s);
    expect(wildGolems(s)).toBe(0);
    expect(boundGolems(s)).toBe(1);
    expect(s.messages.at(-1)!.text).toMatch(/Forge-Temple at/);
    // a mine within reach wakes a bound Warden
    const mine = placeBuildingRaw(s, 'mine', f.x + 6, f.y + 8);
    mine.age = 10;
    expect(Math.hypot(ft.x - mine.x, ft.y - mine.y)).toBeLessThan(FORGE_WAKE_RADIUS);
    let woke = 0;
    for (let d = 0; d < 400 && s.stats.golemsWoken === 0; d++) { s.day++; dailyBeasts(s); woke = d; }
    expect(s.stats.golemsWoken).toBe(1);
    expect(wildGolems(s)).toBe(0);
    expect(boundGolems(s)).toBe(2);
    expect(s.messages.some((m) => m.text.includes('kneels'))).toBe(true);
    void woke;
    expect(s.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'golem').every((a) => a.homeId === ft.id)).toBe(true);
  });

  it('the Seat wards 30, relays the ley and counts ten stone', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'spire', f.x + 2, f.y + 1);
    const seat = placeBuildingRaw(s, 'underkingseat', f.x + 1, f.y + 4);
    recomputeAll(s);
    expect(seat.lit).toBe(true); // linked through the spire by the node
    expect(stoneQuarried(s)).toBe(12); // on hills (2) + the Seat (10)
    updateCoverage(s, 'ward');
    expect(s.coverage.ward[idx(f.x + 1, f.y + 30)]).toBeGreaterThan(0);
    // relays: a spire within the Seat's long link but far from the node is lit through it
    const far = placeBuildingRaw(s, 'spire', f.x - 5, f.y + 10);
    updateMana(s);
    expect(far.lit).toBe(true);
    updateLandValue(s);
    expect(s.landValue[idx(f.x - 4, f.y + 8)]).toBeGreaterThan(40);
  });
});

describe('The Underhill chapter and the Grimmen tales', () => {
  it('Vellish goals read as the Grimmen replacements; the Underhill chapter shows only for them', () => {
    const g = town();
    const v = town('vellish');
    const f = g.founding;
    expect(QUESTS.filter((q) => q.chapter === 'The Underhill').length).toBe(8);
    expect(activeQuests(g, 100).some((q) => q.chapter === 'The Underhill')).toBe(true);
    expect(activeQuests(v, 100).some((q) => q.chapter === 'The Underhill')).toBe(false);
    const well = QUESTS.find((q) => q.id === 'f_well')!;
    expect(well.done(g)).toBe(false);
    placeBuildingRaw(g, 'seep', f.x - 4, f.y + 4);
    expect(well.done(g)).toBe(true); // a Seep is the Grimmen's well
    expect(well.done(v)).toBe(false);
    const cut = QUESTS.find((q) => q.id === 'u_cut')!;
    expect(cut.done(g)).toBe(true); // the seep stands on hills: two stone
  });

  it('the three tales fire for the Grimmen only and every choice applies', () => {
    const g = town();
    const v = town('vellish');
    const f = g.founding;
    expect(GRIMMEN.length).toBe(3);
    for (const e of GRIMMEN) expect(e.when(v)).toBe(false);
    g.milestone = 3;
    expect(GRIMMEN.find((e) => e.id === 'underking_envoy')!.when(g)).toBe(true);
    const t0 = g.treasury;
    fire(g, 'underking_envoy', 0);
    expect(t0 - g.treasury).toBe(1500);
    expect(g.modifiers.some((m) => m.label === 'The deep holds trade')).toBe(true);
    fire(g, 'underking_envoy', 2);
    expect(g.modifiers.some((m) => m.value === -4)).toBe(true);
    // a collapse needs four hill buildings
    expect(GRIMMEN.find((e) => e.id === 'collapse')!.when(g)).toBe(false);
    for (let k = 0; k < 4; k++) placeBuildingRaw(g, 'hearth', f.x - 6 + k * 3, f.y + 4);
    recomputeAll(g);
    expect(GRIMMEN.find((e) => e.id === 'collapse')!.when(g)).toBe(true);
    const stone0 = g.stats.terraformed;
    fire(g, 'collapse', 1);
    expect(g.buildings.filter((b) => b && b.state === 'ruin').length).toBe(1);
    expect(g.stats.terraformed - stone0).toBe(2);
    fire(g, 'collapse', 0);
    expect(g.buildings.filter((b) => b && b.state === 'ruin').length).toBe(1);
    // the true vein
    expect(GRIMMEN.find((e) => e.id === 'true_leystone')!.when(g)).toBe(false);
    const mine = placeBuildingRaw(g, 'mine', f.x + 6, f.y + 8);
    mine.stock = 10;
    expect(GRIMMEN.find((e) => e.id === 'true_leystone')!.when(g)).toBe(true);
    fire(g, 'true_leystone', 0);
    expect(mine.stock).toBe(40);
    expect(g.materials.scale).toBe(3);
    const m0 = nodeMana(g);
    fire(g, 'true_leystone', 2);
    expect(nodeMana(g) - m0).toBe(10);
    expect(g.stats.trueVeins).toBe(1);
  });
});
