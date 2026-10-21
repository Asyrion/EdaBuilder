import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, paintDistrict, placeBuilding, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { edictOn, edictShare, edictUpkeep, districtsInUse } from '../src/sim/edicts';
import { computeBuildingHappiness, dailyBuildings } from '../src/sim/growth';
import { computeLedger } from '../src/sim/economy';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 51) {
  const s = createGame(seed, 'Dist');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 4, f.x + 16, f.y + 12);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
  const west = [], east = [];
  for (let x = f.x - 13; x <= f.x - 2; x++) { const b = placeBuildingRaw(s, 'hearth', x, f.y + 4, 2); b.residents = 8; west.push(b); }
  for (let x = f.x + 2; x <= f.x + 13; x++) { const b = placeBuildingRaw(s, 'hearth', x, f.y + 4, 2); b.residents = 8; east.push(b); }
  s.population = 24 * 8;
  s.milestone = 3; // districts open in steps (iteration 49): four at the Village
  recomputeAll(s);
  s.sectors.fill(1); // this test is about edicts, not the Charter line
  return { s, west, east, f };
}

describe('districts', () => {
  it('paints districts on land only and lists them', () => {
    const { s, f } = town();
    const r = paintDistrict(s, 2, f.x - 14, f.y + 2, f.x - 1, f.y + 6);
    expect(r.ok).toBe(true);
    expect(s.district[idx(f.x - 5, f.y + 4)]).toBe(2);
    expect(s.district[idx(f.x + 5, f.y + 4)]).toBe(0);
    expect(districtsInUse(s)).toEqual([2]);
    // water never gets a district
    let wi = -1;
    for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === Terrain.Water) { wi = i; break; }
    if (wi >= 0) { paintDistrict(s, 3, wi % s.w, (wi / s.w) | 0, wi % s.w, (wi / s.w) | 0); expect(s.district[wi]).toBe(0); }
  });
  it('applies an edict to one district only, scales its share and cost', () => {
    const { s, west, east, f } = town();
    paintDistrict(s, 1, f.x - 14, f.y + 2, f.x - 1, f.y + 6);
    s.districtEdicts['1:curfew'] = true;
    expect(edictOn(s, 'curfew', west[0])).toBe(true);
    expect(edictOn(s, 'curfew', east[0])).toBe(false);
    expect(edictShare(s, 'curfew')).toBeCloseTo(0.5, 1);
    const withEdict = computeBuildingHappiness(s, west[0]);
    const eastSame = computeBuildingHappiness(s, east[0]);
    s.districtEdicts['1:curfew'] = false;
    expect(computeBuildingHappiness(s, west[0]) - withEdict).toBeCloseTo(4, 0);
    expect(computeBuildingHappiness(s, east[0])).toBeCloseTo(eastSame, 5);
    s.districtEdicts['1:curfew'] = true;
    const half = edictUpkeep(s);
    s.edicts.curfew = true;
    expect(edictUpkeep(s)).toBeGreaterThan(half);
  });
});

describe('leystone', () => {
  it('mines need hills, fill up, and carts feed enchanters who sell artifacts', () => {
    const { s, f } = town(52);
    s.milestone = 4;
    s.treasury = 50000;
    // make a hill patch with a road to it
    for (let y = f.y + 6; y <= f.y + 7; y++) for (let x = f.x; x <= f.x + 1; x++) s.terrain[idx(x, y)] = Terrain.Hills;
    buildRoad(s, RoadType.Track, roadPath(f.x - 1, f.y + 3, f.x - 1, f.y + 8, true));
    expect(placeBuilding(s, 'mine', f.x + 4, f.y + 6).ok).toBe(false); // not hills
    const r = placeBuilding(s, 'mine', f.x, f.y + 6);
    expect(r.ok).toBe(true);
    const mine = s.buildings.find((b) => b && b.kind === 'mine')!;
    mine.lit = true;
    const arcanes = [];
    for (let x = f.x + 2; x <= f.x + 5; x++) { const b = s.buildings[s.bIndex[idx(x, f.y + 4)]]!; b.kind = 'arcane'; b.residents = 0; b.workers = 6; arcanes.push(b); }
    recomputeAll(s);
    run(s, TICKS_PER_DAY * 8);
    expect(mine.stock).toBeGreaterThan(0);
    const carts = s.agents.filter((a) => a.kind === AgentKind.Cart && a.homeId === mine.id);
    expect(carts.length).toBeGreaterThan(0);
    const delivered = arcanes.reduce((n, b) => n + b.stock, 0) + s.artifactsSold;
    expect(delivered).toBeGreaterThan(0);
    const l = computeLedger(s);
    expect(l.artifacts).toBeGreaterThanOrEqual(0);
  });
});

describe('districts on save/load', () => {
  it('round-trips districts and district edicts through save/load', () => {
    const { s, f } = town(55);
    paintDistrict(s, 4, f.x - 14, f.y + 2, f.x - 1, f.y + 6);
    s.districtEdicts['4:draughts'] = true;
    run(s, TICKS_PER_DAY);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.district[idx(f.x - 5, f.y + 4)]).toBe(4);
    expect(b.districtEdicts['4:draughts']).toBe(true);
  });
});
