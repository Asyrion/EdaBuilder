import { afterAll, describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, canPlaceBuilding } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, Terrain, idx } from '../src/sim/types';
import { buildRoad, roadPath, paintZone } from '../src/sim/actions';
import { MILESTONES } from '../src/sim/catalog';
import { FACTIONS, NEUTRAL_RULES, buildsFor, canBuild, factionKey, factionOf, milestonesOf } from '../src/data/factions';
import { checkMilestones } from '../src/sim/economy';
import { updateCoverage, updateLandValue } from '../src/sim/services';
import { updateMana } from '../src/sim/networks';
import { createScenario } from '../src/sim/scenario';
import { SaveVersionError, serialize, deserialize } from '../src/sim/save';
import { Zone } from '../src/sim/types';
import { flatten } from './helpers';

// a throwaway people to prove every rule point: the seam another people would plug into (the scope reset keeps it, docs/PARKED.md)
FACTIONS.test = {
  id: 'test' as never, name: 'The Test Folk', people: 'Testish', playable: true, lore: 'test',
  milestones: MILESTONES.map((m, i) => ({ ...m, name: `Depth ${i}` })),
  deny: ['garden'], replaces: { well: 'cistern' },
  rules: { ...NEUTRAL_RULES, hillLandValue: 10, grassPenalty: 5, hillBuildable: true, lanternWard: 0.5, hillMana: 2, nodeMana: 0.5, startCrowns: 1000, waterLandValue: 1, dryPenalty: 0, riverFreezes: true, millMana: 1, spireReach: 0, spireCost: 1, darkAbandon: 0, vigilCost: 1, vigilMandatory: false, milestoneGate: (_s, next) => next < 2 },
};
afterAll(() => { delete FACTIONS.test; });

function town(faction = 'vellish') {
  const s = createGame(41, 'Peoples', 'valley', faction as 'vellish');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  return s;
}

describe('The faction scaffold', () => {
  it('a new game is Vellish with neutral rules and the Vellish milestones; saves keep it and old saves default', () => {
    const s = town();
    expect(s.faction).toBe('vellish');
    expect(factionOf(s).id).toBe('vellish');
    expect(milestonesOf(s)).toBe(MILESTONES);
    expect(factionKey(s, 'well')).toBe('well');
    expect(canBuild(s, 'well')).toBe(true);
    const sc = createScenario(41, 'P', 'onenode', 'vellish');
    expect(sc.faction).toBe('vellish');
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.faction).toBe('vellish');
    const o = JSON.parse(serialize(s)); delete o.faction;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).faction).toBe('vellish');
  });

  it('a charter of a parked people is refused with a reason, not loaded half-built (scope reset, phase 1a)', () => {
    const o = JSON.parse(serialize(town())); o.faction = 'grimmen';
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(SaveVersionError);
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(/parked/);
  });

  it('every rule point reads the people: hills, ward, mana, crowns, milestones, unlocks', () => {
    const v = town();
    const t = town('test');
    expect(factionOf(t).people).toBe('Testish');
    expect(t.treasury - v.treasury).toBe(1000);
    expect(milestonesOf(t)[1].name).toBe('Depth 1');
    const f = t.founding;
    // hills: buildable and zoneable, and worth more
    for (const s of [v, t]) for (let dy = 4; dy <= 7; dy++) for (let dx = -6; dx <= 6; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
    buildRoad(t, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    buildRoad(v, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    expect(canPlaceBuilding(v, 'shrine', f.x, f.y + 4)).toMatch(/terrain/);
    expect(canPlaceBuilding(t, 'shrine', f.x, f.y + 4)).toBeNull();
    paintZone(v, Zone.Hearth, f.x - 2, f.y + 4, f.x + 2, f.y + 4);
    paintZone(t, Zone.Hearth, f.x - 2, f.y + 4, f.x + 2, f.y + 4);
    expect(v.zone[idx(f.x, f.y + 4)]).toBe(0);
    expect(t.zone[idx(f.x, f.y + 4)]).toBe(Zone.Hearth);
    recomputeAll(v); recomputeAll(t);
    updateLandValue(v); updateLandValue(t);
    const hill = idx(f.x, f.y + 5);
    const grass = idx(f.x, f.y - 4);
    expect(t.landValue[hill] - v.landValue[hill]).toBe(10);
    expect(v.landValue[grass] - t.landValue[grass]).toBe(5);
    // node flow halves; a hill building's mana doubles
    updateMana(v); updateMana(t);
    expect(t.manaSupply).toBeCloseTo(v.manaSupply * 0.5, 5);
    for (const s of [v, t]) { s.terrain[idx(f.x + 8, f.y - 6)] = Terrain.Hills; s.terrain[idx(f.x + 9, f.y - 6)] = Terrain.Hills; s.terrain[idx(f.x + 8, f.y - 5)] = Terrain.Hills; s.terrain[idx(f.x + 9, f.y - 5)] = Terrain.Hills; placeBuildingRaw(s, 'torrentmill', f.x + 8, f.y - 6); }
    const before = [v.manaSupply, t.manaSupply];
    updateMana(v); updateMana(t);
    const dv = v.manaSupply - before[0];
    const dt = t.manaSupply - before[1];
    expect(dv).toBeGreaterThan(0);
    expect(dt).toBeCloseTo(dv * 2, 3);
    // lantern halves
    for (const s of [v, t]) { placeBuildingRaw(s, 'spire', f.x + 3, f.y - 6); const l = placeBuildingRaw(s, 'wardlantern', f.x + 5, f.y - 4); recomputeAll(s); expect(l.lit).toBe(true); }
    updateCoverage(v, 'ward'); updateCoverage(t, 'ward');
    const li = idx(f.x + 5, f.y - 5);
    expect(t.coverage.ward[li]).toBeLessThan(v.coverage.ward[li]);
    // the milestone gate holds the city at its milestone
    v.population = 700; t.population = 700;
    checkMilestones(v); checkMilestones(t);
    expect(v.milestone).toBeGreaterThanOrEqual(3);
    expect(t.milestone).toBe(1);
    // unlocks: denied and replaced keys are not built, the replacement is
    expect(canBuild(v, 'garden')).toBe(true);
    expect(canBuild(t, 'garden')).toBe(false);
    expect(canBuild(t, 'well')).toBe(false);
    expect(factionKey(t, 'well')).toBe('cistern');
    expect(buildsFor(factionOf(t), { key: 'x', faction: ['vellish'] } as never)).toBe(false);
  });
});
