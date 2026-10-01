import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind, MAP_W, RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { WALKER_JOBS, dailyWalkers, tickWalkers, walkersOf, spawnWalker, walkerBonus } from '../src/sim/walkers';
import { spawnRestless } from '../src/sim/agents';
import { dailyGloam, recomputeGloamDist } from '../src/sim/hazards';
import { Bot } from '../src/sim/bot';
import { stoneQuarried, GRIMMEN_STONE } from '../src/data/factions';
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

describe('The stone-sexton', () => {
  it('comes from Stone Wards and the Forge-Temple, paints ward, cuts the grey beside its road and lays the restless', () => {
    const s = town();
    const f = s.founding;
    const sw = placeBuildingRaw(s, 'stoneward', f.x + 4, f.y + 1);
    const ft = placeBuildingRaw(s, 'forgetemple', f.x - 6, f.y + 4);
    recomputeAll(s);
    dailyWalkers(s);
    expect(walkersOf(s, sw).map((a) => a.job)).toEqual(['stonesexton']);
    expect(walkersOf(s, ft).map((a) => a.job)).toEqual(['stonesexton']);
    for (const o of s.agents) if (o.kind === AgentKind.Walker) o.timer = 9999;
    const w = spawnWalker(s, WALKER_JOBS.stonesexton, sw, idx(f.x + 4, f.y + 2));
    w.timer = 0;
    // a grey strip north of the road
    for (let x = f.x - 8; x <= f.x + 8; x++) s.gloam[idx(x, f.y + 1)] = s.bIndex[idx(x, f.y + 1)] < 0 ? 1 : 0;
    recomputeGloamDist(s);
    const grey0 = s.stats.gloamTiles;
    for (let t = 0; t < 1500 && Math.floor(w.load / 10) < 2; t++) tickWalkers(s);
    expect(Math.floor(w.load / 10)).toBe(2); // two cuts a day, no more
    expect(s.stats.gloamBurned).toBe(2);
    expect(s.stats.gloamTiles).toBe(grey0 - 2);
    expect(w.log!.some((l) => l.includes('Cut the grey'))).toBe(true);
    const bonus = walkerBonus(s, 'ward');
    let painted = 0;
    for (let i = 0; i < bonus.length; i++) if (bonus[i] > 0) painted++;
    expect(painted).toBeGreaterThanOrEqual(3);
    for (let t = 0; t < 400; t++) tickWalkers(s);
    expect(s.stats.gloamBurned).toBe(2); // the cap holds
    // the restless it meets are laid, three a day
    w.path = []; w.pathIdx = 0; w.timer = 0;
    for (let k = 0; k < 5; k++) spawnRestless(s, Math.floor(w.x), Math.floor(w.y));
    for (let t = 0; t < 10; t++) tickWalkers(s);
    expect(s.agents.filter((a) => a.kind === AgentKind.Restless).length).toBe(2);
    expect(s.stats.walkerLayings).toBe(3);
  });

  it('an unlit Stone Ward burns the Gloam; an unlit Ward Lantern does not', () => {
    const g = town();
    const v = town('vellish');
    const f = g.founding;
    const sw = placeBuildingRaw(g, 'stoneward', f.x + 12, f.y - 8);
    const wl = placeBuildingRaw(v, 'wardlantern', f.x + 12, f.y - 8);
    for (const s of [g, v]) { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx || dy) s.gloam[idx(f.x + 12 + dx, f.y - 8 + dy)] = 1; recomputeAll(s); }
    expect(sw.lit).toBe(false);
    expect(wl.lit).toBe(false);
    const g0 = g.stats.gloamTiles;
    const v0 = v.stats.gloamTiles;
    dailyGloam(g); dailyGloam(v);
    expect(g.stats.gloamTiles).toBeLessThan(g0);
    expect(v.stats.gloamTiles).toBeGreaterThanOrEqual(v0);
  });
});

describe('The bot plays the Grimmen', () => {
  it('zones the hills, cuts a seep and reaches the Cut within twenty days', () => {
    const s = town();
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 20, { onDay: () => bot.step() });
    expect(stoneQuarried(s)).toBeGreaterThanOrEqual(GRIMMEN_STONE[1]);
    expect(s.buildings.some((b) => b && b.kind === 'hearth' && s.terrain[idx(b.x, b.y)] === Terrain.Hills)).toBe(true);
    expect(s.buildings.some((b) => b && b.kind === 'seep')).toBe(true);
    expect(s.buildings.some((b) => b && b.kind === 'well')).toBe(false);
    expect(s.milestone).toBeGreaterThanOrEqual(1);
  });

  it('delves beside its streets when its folk outrun its stone, and never levels its own hills', () => {
    const s = town();
    const bot = new Bot(s);
    s.milestone = 4; s.population = 700; // Under-Market needs 650 folk and 30 stone
    expect(stoneQuarried(s)).toBeLessThan(GRIMMEN_STONE[5]);
    const hills0 = s.terrain.filter((t) => t === Terrain.Hills).length;
    const t0 = s.stats.stoneCut;
    bot.step();
    expect(s.stats.stoneCut - t0).toBe(4);
    expect(s.terrain.filter((t) => t === Terrain.Hills).length).toBe(hills0 + 4); // delved, not levelled
    expect(s.milestone).toBe(4);
    for (let d = 0; d < 12; d++) bot.step();
    expect(stoneQuarried(s)).toBeGreaterThanOrEqual(GRIMMEN_STONE[5]);
  });
});

describe('The Underhill start', () => {
  it('a Grimmen game begins beside a hill ridge; the Vellish map is untouched', () => {
    const g = createGame(42, 'U', 'valley', 'grimmen');
    const v = createGame(42, 'U', 'valley', 'vellish');
    const f = g.founding;
    expect(f).toEqual(v.founding);
    let ridge = 0;
    for (let dy = 6; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) if (g.terrain[idx(f.x + dx, f.y + dy)] === Terrain.Hills) ridge++;
    expect(ridge).toBeGreaterThan(40);
    // Every difference between the two maps is a ridge tile: inside the window and Hills on the Grimmen map.
    for (let i = 0; i < g.terrain.length; i++) {
      if (g.terrain[i] === v.terrain[i]) continue;
      const x = i % MAP_W, y = Math.floor(i / MAP_W);
      expect(g.terrain[i]).toBe(Terrain.Hills);
      expect(y - f.y).toBeGreaterThanOrEqual(5);
      expect(y - f.y).toBeLessThanOrEqual(9);
      expect(Math.max(Math.abs(x - f.x), y - f.y)).toBeGreaterThanOrEqual(6);
    }
    expect(v.terrain.filter((t) => t === Terrain.Hills).length).toBeLessThan(g.terrain.filter((t) => t === Terrain.Hills).length);
  });
});
