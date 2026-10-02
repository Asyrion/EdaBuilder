import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, canPlaceBuilding } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, Terrain, Zone, idx } from '../src/sim/types';
import { buildRoad, roadPath, paintZone, placeBuilding, terraform } from '../src/sim/actions';
import { GRIMMEN_MILESTONES, GRIMMEN_STONE, canBuild, factionKey, milestonesOf, stoneQuarried } from '../src/data/factions';
import { checkMilestones } from '../src/sim/economy';
import { updateCoverage, updateLandValue } from '../src/sim/services';
import { updateWater } from '../src/sim/networks';
import { addEgg, cradleCapacity, freeCradle, isCradle } from '../src/sim/wyrmcraft';
import { activeQuests } from '../src/sim/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(faction: 'vellish' | 'grimmen' = 'grimmen') {
  const s = createGame(41, 'Underhill', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  for (let dy = 4; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 8, f.y + 3, f.x + 8, f.y + 3, false));
  s.treasury = 50000;
  return s;
}

describe('The Grimmen of the Underhill', () => {
  it('read the depth milestones and advance only with stone quarried', () => {
    const s = town();
    expect(s.faction).toBe('grimmen');
    expect(milestonesOf(s)).toBe(GRIMMEN_MILESTONES);
    expect(milestonesOf(s)[0].name).toBe('Camp');
    expect(milestonesOf(s)[4].unlocks).toContain('hatchery');
    expect(stoneQuarried(s)).toBe(0);
    s.population = 60;
    checkMilestones(s);
    expect(s.milestone).toBe(0); // folk enough for Cut, no stone
    const f = s.founding;
    s.milestone = 4; // level needs Township-depth; test the counter directly
    expect(terraform(s, 'level', f.x + 8, f.y + 8).ok).toBe(true);
    s.milestone = 0;
    expect(stoneQuarried(s)).toBe(1);
    expect(placeBuilding(s, 'shrine', f.x, f.y + 4).ok).toBe(true); // on hills
    expect(stoneQuarried(s)).toBe(3);
    checkMilestones(s);
    expect(s.milestone).toBe(1);
    expect(milestonesOf(s)[1].name).toBe('Cut');
    expect(GRIMMEN_STONE[2]).toBe(6);
    s.population = 300;
    checkMilestones(s);
    expect(s.milestone).toBe(1); // held at Cut until six stone
  });

  it('build seeps, stone wards and hatcheries instead of wells, lanterns and cradles; the Vellish cannot', () => {
    const g = town();
    const v = town('vellish');
    for (const k of ['well', 'wardlantern', 'cradle']) expect(canBuild(g, k)).toBe(false);
    g.milestone = 4;
    for (const k of ['seep', 'stoneward', 'hatchery']) expect(canBuild(g, k)).toBe(true);
    v.milestone = 4;
    for (const k of ['seep', 'stoneward', 'hatchery']) expect(canBuild(v, k)).toBe(false);
    expect(factionKey(g, 'well')).toBe('seep');
    const f = g.founding;
    // a seep must touch hills and waters 6
    expect(placeBuilding(g, 'seep', f.x - 12, f.y + 1).reason).toMatch(/hills/);
    expect(placeBuilding(g, 'seep', f.x - 6, f.y + 4).ok).toBe(true);
    recomputeAll(g);
    updateWater(g);
    expect(g.watered[idx(f.x - 6, f.y + 9)]).toBe(1);
    expect(g.watered[idx(f.x - 6, f.y + 12)]).toBe(1); // the Thaw swells the seep to 9
    expect(g.watered[idx(f.x - 6, f.y + 14)]).toBe(0);
    g.day = 60; // the Ember shrinks it to 3
    updateWater(g);
    expect(g.watered[idx(f.x - 6, f.y + 9)]).toBe(0);
    expect(g.watered[idx(f.x - 6, f.y + 7)]).toBe(1);
    g.day = 0;
    updateWater(g);
    // a stone ward wards with no mana at all
    const sw = placeBuildingRaw(g, 'stoneward', f.x + 12, f.y - 6);
    recomputeAll(g);
    expect(sw.lit).toBe(false);
    updateCoverage(g, 'ward');
    expect(g.coverage.ward[idx(f.x + 12, f.y - 2)]).toBeGreaterThan(0);
    // a hatchery is a cradle for the stone lines only
    const h = placeBuildingRaw(g, 'hatchery', f.x + 2, f.y + 4);
    recomputeAll(g);
    expect(isCradle(h.kind)).toBe(true);
    expect(cradleCapacity(h)).toBe(2);
    expect(freeCradle(g, 'sky')).toBeNull();
    expect(freeCradle(g, 'grey')?.id).toBe(h.id);
    expect(addEgg(g, 'sky')).toBeNull();
    expect(addEgg(g, 'grey')?.cradleId).toBe(h.id);
    placeBuildingRaw(g, 'tamerslodge', f.x + 6, f.y + 4);
    expect(activeQuests(g, 100).some((q) => q.id === 'w_cradle')).toBe(false); // a hatchery counts as the cradle
  });

  it('zone and value the hills, and the people survive a save', () => {
    const g = town();
    const v = town('vellish');
    const f = g.founding;
    paintZone(g, Zone.Hearth, f.x - 4, f.y + 4, f.x + 4, f.y + 4);
    paintZone(v, Zone.Hearth, f.x - 4, f.y + 4, f.x + 4, f.y + 4);
    expect(g.zone[idx(f.x, f.y + 4)]).toBe(Zone.Hearth);
    expect(v.zone[idx(f.x, f.y + 4)]).toBe(0);
    expect(canPlaceBuilding(g, 'shrine', f.x + 6, f.y + 4)).toBeNull();
    expect(canPlaceBuilding(v, 'shrine', f.x + 6, f.y + 4)).toMatch(/terrain/);
    recomputeAll(g); recomputeAll(v);
    updateLandValue(g); updateLandValue(v);
    expect(g.landValue[idx(f.x, f.y + 6)]).toBeGreaterThan(v.landValue[idx(f.x, f.y + 6)]);
    expect(g.landValue[idx(f.x, f.y - 4)]).toBeLessThan(v.landValue[idx(f.x, f.y - 4)]);
    const r = deserialize(serialize(g), (seed) => createGame(seed));
    expect(r.faction).toBe('grimmen');
    expect(milestonesOf(r)[0].name).toBe('Camp');
  });
});
