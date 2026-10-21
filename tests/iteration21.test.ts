import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { drainEffects, SOUND_CUES } from '../src/sim/hazards';
import { dailyBarges } from '../src/sim/vehicles';
import { Terrain, idx } from '../src/sim/types';
import { recomputeAll } from '../src/sim/sim';
import { flatten } from './helpers';

describe('Sound cues', () => {
  it('the sim raises a positional cue for a barge', () => {
    const s = createGame(21, 'Cue');
    drainEffects();
    const f = s.founding;
    flatten(s, f.x - 30, f.y - 8, f.x + 30, f.y + 14);
    for (let x = f.x - 20; x <= f.x + 20; x++) s.terrain[idx(x, f.y + 8)] = Terrain.Water;
    placeBuildingRaw(s, 'quay', f.x - 18, f.y + 7);
    placeBuildingRaw(s, 'quay', f.x + 18, f.y + 7);
    const c = placeBuildingRaw(s, 'craft', f.x - 16, f.y + 5, 2); c.stock = 60;
    const m = placeBuildingRaw(s, 'market', f.x + 16, f.y + 5, 2); m.stock = 0;
    recomputeAll(s);
    dailyBarges(s);
    expect(drainEffects().some((e) => e.kind === 'bell')).toBe(true);
    expect(SOUND_CUES).toContain('bell');
  });
});
