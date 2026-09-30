import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, buildWall, bulldoze, previewWall, roadPath, wallCount } from '../src/sim/actions';
import { AgentKind, RoadType, TICKS_PER_DAY, idx } from '../src/sim/types';
import { creatureCount, updateCreatures, tickCreatures, dailyHunt, isNight } from '../src/sim/creatures';
import { dailyGloam } from '../src/sim/hazards';
import { computeBuildingHappiness } from '../src/sim/growth';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function setNight(s: ReturnType<typeof createGame>, night: boolean) {
  const day = Math.floor(s.tick / TICKS_PER_DAY);
  for (let t = 0; t < TICKS_PER_DAY; t++) { s.tick = day * TICKS_PER_DAY + t; if (isNight(s) === night) return; }
}

function edgeTown(seed = 81) {
  const s = createGame(seed, 'Edge');
  const f = s.founding;
  flatten(s, f.x - 12, f.y - 4, f.x + 12, f.y + 12);
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
  const homes = [];
  for (let x = f.x - 9; x <= f.x + 9; x++) { const b = placeBuildingRaw(s, 'hearth', x, f.y + 4, 1); b.residents = 4; homes.push(b); }
  s.population = homes.length * 4;
  s.day = 10;
  // a gloam patch 12 tiles south of the homes
  for (let y = f.y + 14; y <= f.y + 18; y++) for (let x = f.x - 6; x <= f.x + 6; x++) if (x >= 0 && y < s.h) s.gloam[idx(x, y)] = 1;
  recomputeAll(s);
  s.stats.gloamTiles = s.gloam.reduce((a, b) => a + b, 0);
  return { s, homes, f };
}

describe('Gloam-hounds', () => {
  it('come out of the Gloam at night near buildings and slink back by day', () => {
    const { s } = edgeTown();
    setNight(s, true);
    let n = 0;
    for (let k = 0; k < 40 && n === 0; k++) { updateCreatures(s); n = creatureCount(s, 'hound'); }
    expect(n).toBeGreaterThanOrEqual(3);
    expect(s.stats.houndsTotal).toBeGreaterThanOrEqual(3);
    setNight(s, false);
    for (let k = 0; k < 30; k++) updateCreatures(s);
    expect(creatureCount(s, 'hound')).toBe(0);
  });
  it('stalk unlit buildings, frighten them, and are blocked by a Warding Wall', () => {
    const { s, homes, f } = edgeTown(82);
    setNight(s, true);
    for (let k = 0; k < 40 && creatureCount(s, 'hound') === 0; k++) updateCreatures(s);
    expect(creatureCount(s, 'hound')).toBeGreaterThan(0);
    for (let k = 0; k < 600; k++) tickCreatures(s);
    const hounds = s.agents.filter((a) => a.species === 'hound');
    const nearest = Math.min(...hounds.map((h) => Math.min(...homes.map((b) => Math.hypot(b.x - h.x, b.y - h.y)))));
    expect(nearest).toBeLessThan(6);
    // fear
    const frightened = homes.some((b) => computeBuildingHappiness(s, b) < computeBuildingHappiness({ ...s, agents: [] } as any, b));
    expect(frightened).toBe(true);
    // now wall them off: a line between town and gloam, rerun from spawn
    s.agents = s.agents.filter((a) => a.species !== 'hound');
    s.milestone = 2;
    s.treasury = 10000;
    const r = buildWall(s, roadPath(f.x - 14, f.y + 9, f.x + 14, f.y + 9, false));
    expect(r.ok).toBe(true);
    expect(wallCount(s)).toBeGreaterThan(20);
    for (let k = 0; k < 40 && creatureCount(s, 'hound') === 0; k++) updateCreatures(s);
    for (let k = 0; k < 900; k++) tickCreatures(s);
    for (const h of s.agents.filter((a) => a.species === 'hound')) expect(h.y).toBeGreaterThan(f.y + 9);
  });
  it("a Hunters' Lodge kills hounds in its radius", () => {
    const { s, f } = edgeTown(83);
    placeBuildingRaw(s, 'hunterslodge', f.x, f.y + 6);
    setNight(s, true);
    for (let k = 0; k < 40 && creatureCount(s, 'hound') === 0; k++) updateCreatures(s);
    for (let k = 0; k < 400; k++) tickCreatures(s);
    const before = creatureCount(s, 'hound');
    expect(before).toBeGreaterThan(0);
    dailyHunt(s);
    dailyHunt(s);
    expect(creatureCount(s, 'hound')).toBeLessThan(before);
  });
});

describe('Warding Wall', () => {
  it('costs crowns, refuses water and buildings, blocks gloam creep, and bulldozes for free', () => {
    const { s, f } = edgeTown(84);
    s.milestone = 2;
    s.treasury = 5000;
    const tiles = roadPath(f.x - 6, f.y + 11, f.x + 6, f.y + 11, false);
    const pv = previewWall(s, tiles);
    expect(pv.cost).toBeGreaterThan(0);
    const t0 = s.treasury;
    expect(buildWall(s, tiles).ok).toBe(true);
    expect(s.treasury).toBe(t0 - pv.cost);
    expect(buildWall(s, [idx(f.x, f.y + 4)]).ok).toBe(false); // building there
    // creep for a long time: nothing north of the wall within its span
    for (let d = 0; d < 40; d++) { s.day++; dailyGloam(s); }
    for (let x = f.x - 6; x <= f.x + 6; x++) expect(s.gloam[idx(x, f.y + 10)]).toBe(0);
    expect(bulldoze(s, f.x, f.y + 11).ok).toBe(true);
    expect(s.wall[idx(f.x, f.y + 11)]).toBe(0);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(wallCount(b)).toBe(wallCount(s));
  });
  it('survives a long run with hounds and walls', () => {
    const { s, f } = edgeTown(85);
    s.milestone = 3;
    s.treasury = 20000;
    buildWall(s, roadPath(f.x - 14, f.y + 9, f.x + 14, f.y + 9, false));
    placeBuildingRaw(s, 'hunterslodge', f.x + 4, f.y + 6);
    run(s, TICKS_PER_DAY * 6);
    for (const a of s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
    expect(s.gameOver).toBeNull();
  });
});
