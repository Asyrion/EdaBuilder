import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, removeBuilding } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind, RoadType, TICKS_PER_DAY, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { WALKER_JOBS, dailyWalkers, tickWalkers, walkersOf, spawnWalker, walkerBonus } from '../src/sim/walkers';
import { spawnCreature } from '../src/sim/creatures';
import { spawnRestless } from '../src/sim/agents';
import { updateCoverage } from '../src/sim/services';
import { serialize, deserialize } from '../src/sim/save';
import { activeQuests } from '../src/sim/quests';
import { runDev } from '../src/sim/dev';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Walkers');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x + 8, f.y - 8, f.x + 8, f.y + 12, false));
  return s;
}

describe('The walker framework', () => {
  it('buildings field their walkers daily: counts follow the table, orphans and surplus go home', () => {
    const s = town();
    const f = s.founding;
    const wh = placeBuildingRaw(s, 'watchhouse', f.x + 4, f.y + 3);
    const wp = placeBuildingRaw(s, 'watchpost', f.x - 6, f.y + 3);
    const far = placeBuildingRaw(s, 'watchpost', f.x - 12, f.y - 8); // no road at its door
    recomputeAll(s);
    expect(wh.lit).toBe(true);
    dailyWalkers(s);
    expect(walkersOf(s, wh).length).toBe(2);
    expect(walkersOf(s, wp).length).toBe(1);
    expect(walkersOf(s, far).length).toBe(0);
    const w = walkersOf(s, wh)[0];
    expect(w.kind).toBe(AgentKind.Walker);
    expect(w.job).toBe('watchman');
    expect(w.homeId).toBe(wh.id);
    dailyWalkers(s);
    expect(walkersOf(s, wh).length).toBe(2); // idempotent
    wh.lit = false;
    dailyWalkers(s);
    expect(walkersOf(s, wh).length).toBe(1); // unlit: one
    removeBuilding(s, wp);
    dailyWalkers(s);
    expect(s.agents.filter((a) => a.kind === AgentKind.Walker && a.anchorId === wp.id).length).toBe(0);
    expect(Object.values(WALKER_JOBS).every((j) => j.from.length > 0 && j.cap > 0)).toBe(true);
  });

  it('a watchman patrols the roads within its radius and paints watch on the streets it walks', () => {
    const s = town();
    const f = s.founding;
    const wh = placeBuildingRaw(s, 'watchhouse', f.x + 4, f.y + 3);
    recomputeAll(s);
    dailyWalkers(s);
    const w = walkersOf(s, wh)[0];
    const x0 = w.x; const y0 = w.y;
    let moved = false;
    let maxD = 0;
    for (let t = 0; t < 600; t++) {
      tickWalkers(s);
      if (Math.abs(w.x - x0) + Math.abs(w.y - y0) > 1) moved = true;
      maxD = Math.max(maxD, Math.max(Math.abs(w.x - (wh.x + 0.5)), Math.abs(w.y - (wh.y + 0.5))));
      expect(s.road[idx(Math.floor(w.x), Math.floor(w.y))]).toBeGreaterThan(0);
    }
    expect(moved).toBe(true);
    expect(maxD).toBeLessThanOrEqual(WALKER_JOBS.watchman.radius(wh, s) + 3);
    const bonus = walkerBonus(s, 'watch');
    let painted = 0;
    for (let i = 0; i < bonus.length; i++) if (bonus[i] > 0) painted++;
    expect(painted).toBeGreaterThan(3);
    // a far road tile the walker painted reads as watched now
    const far = idx(f.x - 14, f.y + 2); // beyond the house's 14 radius? paint only where walked: check any painted tile outside static coverage
    void far;
    let outside = -1;
    for (let i = 0; i < bonus.length; i++) if (bonus[i] >= 0.08 && s.coverage.watch[i] === 0) { outside = i; break; }
    updateCoverage(s, 'watch');
    if (outside >= 0) expect(s.coverage.watch[outside]).toBeGreaterThan(0);
    const before = bonus.reduce((a, b) => a + b, 0);
    dailyWalkers(s);
    expect(bonus.reduce((a, b) => a + b, 0)).toBeCloseTo(before / 2, 5);
  });

  it('a watchman kills the hound and lays the restless it meets, two of each a day, and logs it', () => {
    const s = town();
    const f = s.founding;
    const wh = placeBuildingRaw(s, 'watchhouse', f.x + 4, f.y + 3);
    recomputeAll(s);
    const rt = idx(f.x + 4, f.y + 2);
    const w = spawnWalker(s, WALKER_JOBS.watchman, wh, rt);
    w.timer = 0;
    for (let k = 0; k < 3; k++) spawnCreature(s, 'hound', f.x + 4, f.y + 2);
    for (let k = 0; k < 3; k++) spawnRestless(s, f.x + 4, f.y + 2);
    expect(s.agents.filter((a) => a.species === 'hound').length).toBe(3);
    for (let t = 0; t < 10; t++) tickWalkers(s);
    expect(s.agents.filter((a) => a.species === 'hound').length).toBe(1); // cap 2
    expect(s.agents.filter((a) => a.kind === AgentKind.Restless).length).toBe(1);
    expect(s.stats.walkerKills).toBe(2);
    expect(s.stats.walkerLayings).toBe(2);
    expect(s.stats.houndsKilled).toBe(2);
    expect(s.stats.restlessLaid).toBe(2);
    expect(w.log!.length).toBe(3);
    expect(w.log!.some((l) => l.includes('Killed a hound'))).toBe(true);
    expect(activeQuests(s, 100).some((q) => q.id === 'w_patrol')).toBe(false);
    // the day resets the counter
    dailyWalkers(s);
    const again = walkersOf(s, wh).find((a) => a.id === w.id)!;
    expect(again.load).toBe(0);
    expect(again.log).toEqual([]);
  });

  it('walkers survive a save and a long run, and the dev command spawns one of any job', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'watchhouse', f.x + 4, f.y + 3);
    recomputeAll(s);
    run(s, TICKS_PER_DAY * 2);
    expect(s.agents.filter((a) => a.kind === AgentKind.Walker).length).toBe(2);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.agents.filter((a) => a.kind === AgentKind.Walker && a.job === 'watchman').length).toBe(2);
    run(r, TICKS_PER_DAY);
    expect(r.agents.filter((a) => a.kind === AgentKind.Walker).length).toBe(2);
    const o = JSON.parse(serialize(s));
    for (const a of o.agents) if (a.kind === 5) delete a.job;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).agents.some((a) => a.kind === AgentKind.Walker)).toBe(false);
    const out = runDev(s, 'walker', 'watchman', { x: f.x + 8, y: f.y + 2 });
    expect(out).toMatch(/watchman from Watch House/);
    expect(s.agents.filter((a) => a.kind === AgentKind.Walker).length).toBe(3);
  });
});
