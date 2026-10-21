import { manaUseOf } from '../src/sim/networks';
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, canPlaceBuilding } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, Terrain, Zone, idx } from '../src/sim/types';
import { updateMana } from '../src/sim/networks';
import { HUSH_CRAFT, dailyBuildings, glimhouseNear } from '../src/sim/growth';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function base(seed = 5) {
  const s = createGame(seed, 'Mill');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 6, f.x + 14, f.y + 12);
  s.milestone = 5;
  s.treasury = 100000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  return { s, f };
}

describe('Torrent Mill', () => {
  it('must touch water and adds 30 mana to the flow', () => {
    const { s, f } = base();
    expect(canPlaceBuilding(s, 'torrentmill', f.x + 2, f.y + 4)).toMatch(/water/);
    s.terrain[idx(f.x + 3, f.y + 4)] = Terrain.Water;
    expect(canPlaceBuilding(s, 'torrentmill', f.x + 2, f.y + 4)).toBeNull();
    updateMana(s);
    const before = s.manaSupply;
    expect(placeBuilding(s, 'torrentmill', f.x + 2, f.y + 4).ok).toBe(true);
    updateMana(s);
    expect(s.manaSupply - before).toBeCloseTo(30, 5);
  });
});

describe('Hanging Gardens and the Glowvine Lane', () => {
  it('must touch hills, lights itself and its neighbours, and makes goods for the carts', () => {
    const { s, f } = base();
    expect(canPlaceBuilding(s, 'hanginggardens', f.x - 8, f.y + 4)).toMatch(/hills/);
    s.terrain[idx(f.x - 9, f.y + 4)] = Terrain.Hills;
    expect(placeBuilding(s, 'hanginggardens', f.x - 8, f.y + 4).ok).toBe(true);
    const h = placeBuildingRaw(s, 'hearth', f.x - 6, f.y + 4);
    recomputeAll(s);
    const g = s.buildings.find((b) => b && b.kind === 'hanginggardens')!;
    expect(g.lit).toBe(true);
    expect(h.lit).toBe(true);
    expect(s.buildings.some((b) => b && b.kind === 'spire')).toBe(false);
    const st = g.stock;
    dailyBuildings(s);
    expect(g.stock - st).toBeCloseTo(6, 5);
  });

  it('glowvine needs a gardens and is lit only within 12 tiles of one', () => {
    const { s, f } = base();
    const r = buildRoad(s, RoadType.Glowvine, roadPath(f.x - 12, f.y + 6, f.x + 12, f.y + 6, false));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Hanging Gardens/);
    s.terrain[idx(f.x - 13, f.y + 4)] = Terrain.Hills;
    expect(placeBuilding(s, 'hanginggardens', f.x - 12, f.y + 4).ok).toBe(true);
    expect(buildRoad(s, RoadType.Glowvine, roadPath(f.x - 12, f.y + 6, f.x + 12, f.y + 6, false)).ok).toBe(true);
    recomputeAll(s);
    expect(s.lit[idx(f.x - 6, f.y + 6)]).toBe(1); // within 12
    expect(s.lit[idx(f.x + 10, f.y + 6)]).toBe(0); // too far from the vines
    // the lane lights what stands along it, with no spire: a hearth beside the vines is lit, and draws only its own mana
    const before = s.manaDemand;
    const h = placeBuildingRaw(s, 'hearth', f.x - 4, f.y + 7, 1);
    recomputeAll(s);
    expect(h.lit).toBe(true);
    expect(s.manaDemand).toBe(before + manaUseOf(h)); // the lane itself costs nothing: only the hearth's own draw is added
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.road[idx(f.x, f.y + 6)]).toBe(RoadType.Glowvine);
  });
});

describe('Glimhouse', () => {
  it('lifts the Hush penalty for Craft works within 8', () => {
    const { s, f } = base();
    const c = placeBuildingRaw(s, 'craft', f.x + 1, f.y + 4, 2);
    s.day = 91; // Hush
    recomputeAll(s);
    c.workers = 10;
    c.lit = true;
    c.stock = 0;
    dailyBuildings(s);
    const cold = c.stock;
    expect(cold).toBeGreaterThan(0);
    const g = placeBuildingRaw(s, 'glimhouse', f.x + 4, f.y + 4);
    g.lit = true;
    expect(glimhouseNear(s, c)).toBe(true);
    c.stock = 0;
    c.workers = 10;
    c.lit = true;
    dailyBuildings(s);
    expect(c.stock / cold).toBeCloseTo(1.1 / HUSH_CRAFT, 1);
  });
});
