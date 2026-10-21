import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run, tick } from '../src/sim/sim';
import { AgentKind, RoadType, TICKS_PER_DAY, idx } from '../src/sim/types';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { BASE_RATE, buildDaysFor, builderTarget, builders, buildersAt, construction, dailyConstruction, sites, tickConstruction } from '../src/sim/construction';
import { trySpawnBuildings } from '../src/sim/growth';
import { serialize, deserialize } from '../src/sim/save';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

beforeAll(() => { construction.instant = false; });
afterAll(() => { construction.instant = true; });

function town(seed = 41) {
  const s = createGame(seed, 'Builders');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  s.milestone = 3;
  return s;
}

describe('Construction', () => {
  it('build time follows cost; zone buildings take a day, wonders longer', () => {
    expect(buildDaysFor(BUILDING_BY_KEY.hearth)).toBe(1);
    expect(buildDaysFor(BUILDING_BY_KEY.well)).toBe(1);
    expect(buildDaysFor(BUILDING_BY_KEY.watchhouse)).toBeGreaterThanOrEqual(1);
    expect(buildDaysFor(BUILDING_BY_KEY.nexus)).toBe(4);
    expect(buildDaysFor(BUILDING_BY_KEY.skydock)).toBe(9);
  });

  it('a placed building is a site, inert until finished; the folk raise it slowly with nobody there', () => {
    const s = town();
    const f = s.founding;
    const r = placeBuilding(s, 'watchhouse', f.x + 9, f.y + 3);
    expect(r.ok).toBe(true);
    const b = s.buildings.find((x) => x && x.kind === 'watchhouse')!;
    expect(b.state).toBe('building');
    expect(b.work).toBe(buildDaysFor(BUILDING_BY_KEY.watchhouse) * TICKS_PER_DAY);
    recomputeAll(s);
    expect(s.coverage.watch[idx(f.x + 9, f.y + 3)]).toBe(0); // no service yet
    expect(activeQuests(s, 100).find((q) => q.id === 'g_watch' || q.title.toLowerCase().includes('watch'))?.done(s) ?? false).toBe(false);
    s.agents = s.agents.filter((a) => a.kind !== AgentKind.Builder);
    const w0 = b.work;
    tickConstruction(s);
    expect(w0 - b.work).toBeCloseTo(BASE_RATE, 5);
    expect(buildersAt(s, b)).toEqual({ assigned: 0, present: 0 });
  });

  it('builders come from the Founding Stake, walk the road to the site, work it down and go home', () => {
    const s = town();
    const f = s.founding;
    expect(builderTarget(s)).toBe(2);
    dailyConstruction(s);
    expect(builders(s).length).toBe(2);
    placeBuilding(s, 'well', f.x + 6, f.y + 3);
    const b = s.buildings.find((x) => x && x.kind === 'well')!;
    tickConstruction(s);
    const ba = buildersAt(s, b);
    expect(ba.assigned).toBe(2);
    expect(ba.present).toBe(0);
    for (let t = 0; t < 400 && buildersAt(s, b).present < 2; t++) tickConstruction(s);
    expect(buildersAt(s, b).present).toBe(2);
    const w0 = b.work;
    tickConstruction(s);
    expect(w0 - b.work).toBeCloseTo(2 + BASE_RATE, 5); // two hands plus the folk
    for (let t = 0; t < TICKS_PER_DAY && b.state === 'building'; t++) tickConstruction(s);
    expect(b.state).toBe('ok');
    expect(sites(s).length).toBe(0);
    expect(builders(s).every((a) => a.targetId === -1 && a.phase === 0)).toBe(true);
    expect(s.messages.some((m) => m.text.includes('is finished'))).toBe(true);
    // more folk, more builders; never above ten
    s.population = 2000;
    dailyConstruction(s);
    expect(builders(s).length).toBe(10);
    s.population = 0;
    dailyConstruction(s);
    expect(builders(s).length).toBe(2);
  });

  it('spawned zone buildings rise too, three builders at most per site, and the whole thing survives a save', () => {
    const s = town();
    const f = s.founding;
    for (let x = f.x - 6; x <= f.x + 6; x++) { s.zone[idx(x, f.y + 3)] = 1; s.zone[idx(x, f.y + 1)] = 1; }
    s.zoneListDirty = true;
    recomputeAll(s);
    trySpawnBuildings(s, 20);
    const homes = s.buildings.filter((b) => b && b.kind === 'hearth');
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.every((b) => b!.state === 'building')).toBe(true);
    s.population = 2000;
    dailyConstruction(s);
    for (let t = 0; t < 60; t++) tickConstruction(s);
    for (const h of homes) expect(buildersAt(s, h!).assigned).toBe(0); // the folk raise their own homes
    expect(homes[0]!.work).toBe(homes[0]!.workTotal - 60);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.agents.filter((a) => a.kind === AgentKind.Builder).length).toBe(10);
    expect(r.buildings.filter((b) => b && b.state === 'building').length).toBe(homes.length);
    run(r, TICKS_PER_DAY * 2);
    expect(r.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok').length).toBeGreaterThan(0);
    // an old save with no work fields loads standing
    const o = JSON.parse(serialize(s)); o.version = 6; // a save from before iteration 55 says 6
    for (const b of o.buildings) if (b) { delete b.work; delete b.workTotal; }
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(old.buildings.every((b) => !b || typeof b.work === 'number')).toBe(true);
    void tick; void placeBuildingRaw;
  });
});
