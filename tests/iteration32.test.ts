import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { AgentKind, RoadType, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { WALKER_JOBS, dailyWalkers, tickWalkers, walkersOf, spawnWalker, wardenNear, buildingsAt } from '../src/sim/walkers';
import { spawnRestless } from '../src/sim/agents';
import { computeBuildingHappiness } from '../src/sim/growth';
import { dailySurge } from '../src/sim/hazards';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Walkers2');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x + 8, f.y - 8, f.x + 8, f.y + 12, false));
  return s;
}

describe('Sextons', () => {
  it('come from boneyards and ossuaries, lay the restless they meet and quiet a dead each, three a day', () => {
    const s = town();
    const f = s.founding;
    const by = placeBuildingRaw(s, 'boneyard', f.x + 4, f.y + 3);
    const os = placeBuildingRaw(s, 'ossuary', f.x - 6, f.y + 3);
    recomputeAll(s);
    dailyWalkers(s);
    expect(walkersOf(s, by).length).toBe(1);
    expect(walkersOf(s, os).length).toBe(2);
    expect(walkersOf(s, by)[0].job).toBe('sexton');
    const w = spawnWalker(s, WALKER_JOBS.sexton, by, idx(f.x + 4, f.y + 2));
    w.timer = 0;
    for (const o of s.agents) if (o.kind === AgentKind.Walker && o.id !== w.id) o.load = 99; // only w works today
    for (let k = 0; k < 5; k++) spawnRestless(s, f.x + 4, f.y + 2);
    s.unquieted = 10;
    for (let t = 0; t < 10; t++) tickWalkers(s);
    expect(s.agents.filter((a) => a.kind === AgentKind.Restless).length).toBe(2); // cap 3
    expect(s.unquieted).toBe(7);
    expect(s.stats.walkerLayings).toBe(3);
    expect(w.log!.every((l) => l.includes('Salted'))).toBe(true);
    expect(activeQuests(s, 100).some((q) => q.id === 'w_sexton')).toBe(false);
  });
});

describe('Healers', () => {
  it('walk to the unhappiest home in reach and tend it: +4 happiness for the day, six visits a day', () => {
    const s = town();
    const f = s.founding;
    const hs = placeBuildingRaw(s, 'healer', f.x + 4, f.y + 3);
    const h1 = placeBuildingRaw(s, 'hearth', f.x - 4, f.y + 3);
    const h2 = placeBuildingRaw(s, 'hearth', f.x - 5, f.y + 3);
    recomputeAll(s);
    h1.happiness = 60; h2.happiness = 20;
    dailyWalkers(s);
    const w = walkersOf(s, hs)[0];
    expect(w.job).toBe('healer');
    w.timer = 0;
    const to = WALKER_JOBS.healer.target!(s, w, hs);
    expect(to).not.toBeNull();
    expect(buildingsAt(s, to!).some((b) => b.id === h2.id)).toBe(true); // the unhappiest first
    for (let t = 0; t < 400 && (h2.tended ?? -1) < s.day; t++) tickWalkers(s);
    expect(h2.tended).toBe(s.day);
    expect(s.stats.healerVisits).toBe(1);
    const before = computeBuildingHappiness(s, h2);
    h2.tended = -1;
    expect(before - computeBuildingHappiness(s, h2)).toBe(4);
    h2.tended = s.day;
    expect(WALKER_JOBS.healer.target!(s, w, hs)).not.toBe(to); // tended homes are skipped
    w.load = 6;
    WALKER_JOBS.healer.onArrive!(s, w, roadTileOfHome(s, h1));
    expect(h1.tended).toBeUndefined();
    expect(activeQuests(s, 100).some((q) => q.id === 'w_healer')).toBe(false);
    function roadTileOfHome(st: typeof s, b: typeof h1) { return idx(b.x, b.y - 1); }
  });
});

describe('Tallowkin wardens', () => {
  it('walk spire to spire under the edict only, and nothing near them is warped by a surge', () => {
    const s = town();
    const f = s.founding;
    const sp1 = placeBuildingRaw(s, 'spire', f.x + 4, f.y + 3);
    const sp2 = placeBuildingRaw(s, 'spire', f.x - 6, f.y + 3);
    for (let k = 0; k < 6; k++) placeBuildingRaw(s, 'hearth', f.x - 10 + k * 3, f.y - 2);
    recomputeAll(s);
    dailyWalkers(s);
    expect(walkersOf(s, sp1).length).toBe(0);
    s.edicts.wardens = true;
    dailyWalkers(s);
    expect(walkersOf(s, sp1).length).toBe(1);
    const w = walkersOf(s, sp1)[0];
    expect(w.job).toBe('warden');
    w.timer = 0;
    for (let t = 0; t < 600 && s.stats.wardenRounds === 0; t++) tickWalkers(s);
    expect(s.stats.wardenRounds).toBeGreaterThan(0);
    expect(w.log![0]).toMatch(/Checked the spire/);
    expect(activeQuests(s, 100).some((q) => q.id === 'w_warden')).toBe(false);
    // a surge spares what a warden stands beside
    const homes = s.buildings.filter((b) => b && b.kind === 'hearth');
    for (const h of homes) { h!.lit = true; h!.residents = 5; }
    w.x = homes[0]!.x + 0.5; w.y = homes[0]!.y + 1.5;
    expect(wardenNear(s, homes[0]!)).toBe(true);
    expect(wardenNear(s, homes[5]!)).toBe(false);
    s.overdrawDays = 6;
    dailySurge(s);
    expect(s.stats.surgesTotal).toBe(1);
    expect(homes[0]!.state).toBe('ok');
    expect(homes.some((h) => h!.state === 'ruin')).toBe(true);
    s.edicts.wardens = false;
    dailyWalkers(s);
    expect(walkersOf(s, sp1).length).toBe(0);
    void sp2;
  });
});
