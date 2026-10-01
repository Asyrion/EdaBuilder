import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { creatureCount, isNight, updateCreatures, tickCreatures, mothBonus } from '../src/sim/creatures';
import { spawnRestless } from '../src/sim/agents';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function setNight(s: ReturnType<typeof createGame>, night: boolean) {
  // find a tick within the current day that is night/day
  const day = Math.floor(s.tick / TICKS_PER_DAY);
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    s.tick = day * TICKS_PER_DAY + t;
    if (isNight(s) === night) return;
  }
}

describe('creatures', () => {
  it('glimmoths swarm ley sources at night and leave by day', () => {
    const s = createGame(71, 'Moth');
    setNight(s, true);
    updateCreatures(s);
    const n = creatureCount(s, 'glimmoth');
    expect(n).toBeGreaterThanOrEqual(s.nodes.length * 2 - 1);
    tickCreatures(s);
    for (const a of s.agents) if (a.species === 'glimmoth') { expect(Number.isFinite(a.x)).toBe(true); expect(Math.abs(a.x - (a.ax ?? a.x))).toBeLessThan(4); }
    setNight(s, false);
    for (let k = 0; k < 12; k++) updateCreatures(s);
    expect(creatureCount(s, 'glimmoth')).toBe(0);
  });
  it('thrumhares graze meadows by day and hop between grass tiles', () => {
    const s = createGame(72, 'Hare');
    setNight(s, false);
    updateCreatures(s);
    const n = creatureCount(s, 'thrumhare');
    expect(n).toBeGreaterThan(0);
    for (let k = 0; k < 400; k++) tickCreatures(s);
    for (const a of s.agents) if (a.species === 'thrumhare') {
      const t = s.terrain[idx(Math.floor(a.x), Math.floor(a.y))];
      expect(t === Terrain.Meadow || t === Terrain.Grass).toBe(true);
    }
  });
  it('wisps appear over boneyards and multiply with the unquieted dead', () => {
    const s = createGame(73, 'Wisp');
    const f = s.founding;
    flatten(s, f.x - 10, f.y - 4, f.x + 10, f.y + 10);
    buildRoad(s, RoadType.Track, roadPath(f.x - 8, f.y + 3, f.x + 8, f.y + 3, false));
    placeBuildingRaw(s, 'boneyard', f.x, f.y + 4);
    recomputeAll(s);
    updateCreatures(s);
    expect(creatureCount(s, 'wisp')).toBe(1);
    s.unquieted = 40;
    updateCreatures(s);
    expect(creatureCount(s, 'wisp')).toBeGreaterThanOrEqual(5);
    spawnRestless(s, f.x, f.y + 3);
    updateCreatures(s);
    expect(s.agents.some((a) => a.species === 'wisp' && a.anchorId === s.agents.find((r) => r.kind === AgentKind.Restless)!.id) || creatureCount(s, 'wisp') >= 6).toBe(true);
    s.unquieted = 0;
    for (let k = 0; k < 3; k++) updateCreatures(s);
    expect(creatureCount(s, 'wisp')).toBeLessThanOrEqual(2);
  });
  it('a Moth-Loft needs ley within 6 and boosts nearby craft works', () => {
    const s = createGame(74, 'Loft');
    const f = s.founding;
    flatten(s, f.x - 16, f.y - 4, f.x + 16, f.y + 10);
    s.milestone = 2;
    s.treasury = 20000;
    buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
    expect(placeBuilding(s, 'mothloft', f.x + 12, f.y + 4).ok).toBe(false);
    expect(placeBuilding(s, 'mothloft', f.x + 3, f.y + 4).ok).toBe(true);
    const loft = s.buildings.find((b) => b && b.kind === 'mothloft')!;
    loft.lit = true;
    const near = placeBuildingRaw(s, 'craft', f.x + 6, f.y + 4, 1);
    const far = placeBuildingRaw(s, 'craft', f.x - 13, f.y + 4, 1);
    expect(mothBonus(s, near)).toBe(0); // no moths swarmed it yet
    loft.stock = 3; // three moths swarmed the loft last night: 4 % each
    expect(mothBonus(s, near)).toBeCloseTo(0.12);
    loft.stock = 9;
    expect(mothBonus(s, near)).toBeCloseTo(0.2); // capped
    expect(mothBonus(s, far)).toBe(0);
  });
  it('creatures survive a long run and a save/load round trip', () => {
    const s = createGame(75, 'Run');
    run(s, TICKS_PER_DAY * 3);
    expect(creatureCount(s)).toBeGreaterThan(0);
    for (const a of s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(creatureCount(b)).toBe(creatureCount(s));
    run(b, 300);
  });
});
