import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { isBuildingUnlocked } from '../src/sim/catalog';
import { placeBuilding, buildRoad, roadPath } from '../src/sim/actions';
import { RoadType, idx } from '../src/sim/types';
import { dailyTrade } from '../src/sim/growth';
import { activeQuests } from '../src/sim/quests';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase4');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('Relic buildings', () => {
  it('unlock with their set, and pay their boons', () => {
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
