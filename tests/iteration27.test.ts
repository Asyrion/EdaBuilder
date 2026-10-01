import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { BREED_DAY, canBreed, dailyBreeding } from '../src/sim/breeding';
import { addEgg } from '../src/sim/wyrmcraft';
import { dragonAuras } from '../src/sim/weave';
import { isBuildingUnlocked } from '../src/sim/catalog';
import { placeBuilding, buildRoad, roadPath } from '../src/sim/actions';
import { RoadType, idx } from '../src/sim/types';
import { BOON_AT, GUILDS, RIVALRY_DRIFT, RIVALRY_STING, RIVAL_OF, dailyGuilds, guildDrivers } from '../src/sim/guilds';
import { resolveEvent } from '../src/sim/events';
import { dailyTrade } from '../src/sim/growth';
import { forecast } from '../src/sim/forecast';
import { activeQuests } from '../src/sim/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase4');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('Bloodlines', () => {
  it('two crossed parents lay a trueblood egg with both auras in full', () => {
    const s = town();
    const f = s.founding;
    const c1 = placeBuildingRaw(s, 'cradle', f.x + 3, f.y + 3);
    placeBuildingRaw(s, 'cradle', f.x - 5, f.y + 3);
    recomputeAll(s);
    const a = addEgg(s, 'vein')!;
    const b = addEgg(s, 'ember')!;
    a.stage = 2; b.stage = 2; a.mood = 80; b.mood = 80;
    expect(canBreed(s, c1).trueblood).toBe(false);
    a.second = 'grey'; b.second = 'sky';
    const chk = canBreed(s, c1);
    expect(chk.ok).toBe(true);
    expect(chk.trueblood).toBe(true);
    expect(chk.why).toMatch(/trueblood/);
    s.day = BREED_DAY;
    dailyBreeding(s);
    const egg = s.dragons[2];
    expect(egg.trueblood).toBe(true);
    expect(egg.line).toBe('vein');
    expect(egg.second).toBe('ember');
    expect(s.stats.truebloods).toBe(1);
    egg.stage = 2;
    expect(dragonAuras(s).filter((x) => x.name === egg.name).map((x) => x.r)).toEqual([8, 8]);
    expect(s.chronicle.some((c) => c.text.includes('bloodline'))).toBe(true);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_blood')).toBe(false);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.dragons[2].trueblood).toBe(true);
  });
});

describe('Relic buildings', () => {
  it('unlock with their set, pay their boons, and the chart-room reads the forecast', () => {
    const s = town();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
    s.milestone = 6; s.treasury = 50000;
    expect(isBuildingUnlocked(s.milestone, 'corelantern', s.relics.complete)).toBe(false);
    expect(placeBuilding(s, 'corelantern', f.x + 4, f.y + 3).reason).toMatch(/Lantern-Cores/);
    s.relics.complete = ['lanterncores', 'concordcharts', 'ninehouses'];
    expect(isBuildingUnlocked(s.milestone, 'corelantern', s.relics.complete)).toBe(true);
    expect(placeBuilding(s, 'corelantern', f.x + 4, f.y + 3).ok).toBe(true);
    expect(placeBuilding(s, 'chartroom', f.x - 3, f.y + 3).ok).toBe(true);
    expect(placeBuilding(s, 'saltfont', f.x + 8, f.y + 3).reason).toMatch(/Salt Spoons/);
    recomputeAll(s);
    expect(s.coverage.ward[idx(f.x + 4, f.y + 3)]).toBeGreaterThan(0);
    expect(s.lit[idx(f.x + 4, f.y + 3)]).toBe(1);
    placeBuildingRaw(s, 'spire', f.x - 4, f.y);
    recomputeAll(s);
    s.day = 26;
    expect(forecast(s).length).toBeGreaterThan(0); // the chart-room reads like an observatory
    placeBuildingRaw(s, 'depot', f.x - 7, f.y + 3);
    const c = placeBuildingRaw(s, 'craft', f.x + 1, f.y - 3, 2);
    recomputeAll(s);
    c.stock = 60;
    const t0 = s.treasury;
    dailyTrade(s);
    expect(s.treasury - t0).toBeCloseTo(8 * 2 * 1.15, 5);
    expect(activeQuests(s, 100).some((q) => q.id === 'k_relicbuild')).toBe(false);
  });
});

describe('Guild rivalries', () => {
  it('a favoured guild drags its rival down, and a granted petition stings the rival', () => {
    const s = town();
    const f = s.founding;
    placeBuildingRaw(s, 'guildhall', f.x + 3, f.y + 3);
    recomputeAll(s);
    expect(RIVAL_OF.carters).toBe('spirewrights');
    s.guilds.standing.carters = BOON_AT;
    const d = guildDrivers(s, 'spirewrights').find((x) => x.text.includes(GUILDS.carters.name));
    expect(d?.value).toBe(-RIVALRY_DRIFT);
    expect(guildDrivers(s, 'sextons').some((x) => x.text.includes('favoured'))).toBe(false);
    s.day = 40; s.guilds.lastCouncil = 0; s.guilds.standing.sextons = 30; s.guilds.standing.alchemists = 60;
    dailyGuilds(s);
    expect(s.pendingEvent?.id).toBe('council_sextons');
    resolveEvent(s, 0);
    expect(s.guilds.standing.alchemists).toBeCloseTo(60 - RIVALRY_STING, 0);
  });
});
