import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, Zone, idx } from '../src/sim/types';
import { updateMana, updateWater } from '../src/sim/networks';
import { NODE_MANA } from '../src/sim/catalog';
import { placeBuildingRaw } from '../src/sim/world';
import { flatten } from './helpers';

describe('mana network', () => {
  it('lights a spire chain from the node and buildings by adjacency', () => {
    const s = createGame(42, 'T');
    const f = s.founding;
    flatten(s, f.x - 3, f.y - 3, f.x + 25, f.y + 10);
    // road east of node
    buildRoad(s, RoadType.Track, roadPath(f.x - 2, f.y + 3, f.x + 20, f.y + 3, false));
    const s1 = placeBuilding(s, 'spire', f.x + 5, f.y + 4); // 5 from node
    const s2 = placeBuilding(s, 'spire', f.x + 11, f.y + 4); // 6 from s1
    const s3 = placeBuilding(s, 'spire', f.x + 19, f.y + 4); // 8 from s2 -> unlit
    expect(s1.ok && s2.ok && s3.ok).toBe(true);
    // a row of houses along the road far from spires but touching each other
    const houses = [];
    for (let x = f.x + 12; x <= f.x + 18; x++) houses.push(placeBuildingRaw(s, 'hearth', x, f.y + 2));
    updateMana(s);
    const spires = s.buildings.filter((b) => b && b.kind === 'spire');
    expect(spires.map((b) => b!.lit)).toEqual([true, true, false]);
    // houses within radius 5 of s2 (x <= f.x+16) lit directly; the rest by adjacency chain
    for (const h of houses) expect(h.lit).toBe(true);
    expect(s.manaSupply).toBe(s.nodes.length * NODE_MANA + 15 * s.nodes.filter((n) => n.aspect === 'vein').length); // Vein ley adds 15
    expect(s.manaDemand).toBe(houses.length * 1);
  });
  it('browns out the farthest consumers when demand exceeds supply', () => {
    const s = createGame(42, 'T');
    const f = s.founding;
    s.nodes = [s.nodes[0]];
    flatten(s, f.x - 32, f.y - 3, f.x + 32, f.y + 6);
    buildRoad(s, RoadType.Track, roadPath(f.x - 30, f.y + 3, f.x + 30, f.y + 3, false));
    for (let x = f.x - 29; x <= f.x + 29; x++) placeBuildingRaw(s, 'arcane', x, f.y + 2, 3); // 8 mana each
    updateMana(s);
    expect(s.manaDemand).toBeGreaterThan(s.manaSupply);
    expect(s.brownout).toBeGreaterThan(0);
    const lit = s.buildings.filter((b) => b && b.kind === 'arcane' && b.lit) as any[];
    const dark = s.buildings.filter((b) => b && b.kind === 'arcane' && !b.lit) as any[];
    expect(dark.length).toBeGreaterThan(0);
    const maxLitDist = Math.max(...lit.map((b) => Math.abs(b.x - f.x)));
    const minDarkDist = Math.min(...dark.map((b) => Math.abs(b.x - f.x)));
    expect(minDarkDist).toBeGreaterThanOrEqual(maxLitDist);
  });
});

describe('water', () => {
  it('waters tiles around a well', () => {
    const s = createGame(42, 'T');
    const f = s.founding;
    flatten(s, f.x - 3, f.y - 3, f.x + 25, f.y + 25);
    buildRoad(s, RoadType.Track, roadPath(f.x - 2, f.y + 3, f.x + 20, f.y + 3, false));
    placeBuilding(s, 'well', f.x + 15, f.y + 4);
    updateWater(s);
    expect(s.watered[idx(f.x + 15, f.y + 8)]).toBe(1);
    expect(s.watered[idx(f.x + 15, f.y + 20)]).toBe(0);
  });
});
