import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Zone } from '../src/sim/types';
import { serialize, deserialize } from '../src/sim/save';
import { computeLedger } from '../src/sim/economy';
import { findPath } from '../src/sim/agents';
import { flatten } from './helpers';

function town(seed = 42) {
  const s = createGame(seed, 'T');
  const f = s.founding;
  const sx = f.x + 2;
  const sy = f.y + 1;
  flatten(s, sx - 12, sy - 2, sx + 12, sy + 12);
  for (let k = 0; k < 3; k++) buildRoad(s, RoadType.Track, roadPath(sx - 10, sy + k * 5, sx + 10, sy + k * 5, false));
  for (let k = 0; k < 3; k++) buildRoad(s, RoadType.Track, roadPath(sx - 10 + k * 10, sy, sx - 10 + k * 10, sy + 10, true));
  paintZone(s, Zone.Hearth, sx - 9, sy + 1, sx + 9, sy + 4);
  paintZone(s, Zone.Market, sx - 9, sy + 6, sx + 9, sy + 6);
  paintZone(s, Zone.Craft, sx - 9, sy + 7, sx + 9, sy + 9);
  placeBuilding(s, 'well', sx - 11, sy + 1);
  placeBuilding(s, 'well', sx + 11, sy + 6);
  placeBuilding(s, 'spire', sx - 4, sy + 1);
  placeBuilding(s, 'spire', sx + 4, sy + 6);
  return s;
}

describe('simulation', () => {
  it('grows a town, collects taxes and stays finite over 60 days', () => {
    const s = town();
    run(s, TICKS_PER_DAY * 60);
    expect(s.population).toBeGreaterThan(60);
    expect(s.milestone).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(s.treasury)).toBe(true);
    expect(Number.isFinite(s.happiness)).toBe(true);
    const l = computeLedger(s);
    expect(l.taxHearth).toBeGreaterThan(0);
    for (const b of s.buildings) if (b) expect(Number.isFinite(b.happiness)).toBe(true);
    expect(s.agents.length).toBeGreaterThan(10);
  });
  it('is deterministic', () => {
    const a = town(7);
    const b = town(7);
    run(a, TICKS_PER_DAY * 20);
    run(b, TICKS_PER_DAY * 20);
    expect(serialize(a)).toEqual(serialize(b));
  });
  it('round-trips through save/load and keeps simulating identically', () => {
    const a = town(9);
    run(a, TICKS_PER_DAY * 12 + 37);
    const json = serialize(a);
    const b = deserialize(json, (seed) => createGame(seed));
    expect(b.population).toBe(a.population);
    expect(b.treasury).toBe(a.treasury);
    expect(b.buildings.filter(Boolean).length).toBe(a.buildings.filter(Boolean).length);
    run(a, 500);
    run(b, 500);
    expect(b.population).toBe(a.population);
    expect(b.tick).toBe(a.tick);
  });
  it('goes bankrupt when upkeep is impossible', () => {
    const s = createGame(3, 'Broke');
    s.treasury = -9000;
    run(s, TICKS_PER_DAY * 6);
    expect(s.gameOver).toMatch(/Charter/);
  });
  it('finds paths along roads and not across grass', () => {
    const s = town();
    const f = s.founding;
    const sx = f.x + 2;
    const sy = f.y + 1;
    const a = (sx - 10) + (sy) * s.w;
    const b = (sx + 10) + (sy + 10) * s.w;
    const p = findPath(s, a, b);
    expect(p).not.toBeNull();
    expect(p![0]).toBe(a);
    expect(p![p!.length - 1]).toBe(b);
    for (const t of p!) expect(s.road[t]).toBeGreaterThan(0);
    expect(findPath(s, a, a + 3 * s.w + 1)).toBeNull();
  });
});
