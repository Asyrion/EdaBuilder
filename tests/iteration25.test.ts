import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RELIC_SETS, dailyRelics, initRelics, relicDone } from '../src/sim/relics';
import { sectorCost } from '../src/sim/sectors';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Phase3');
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}

describe('Relic sets', () => {
  it('a piece every twelve relics, catalogued by an Academy; three make a set with a lasting boon', () => {
    const s = town();
    const f = s.founding;
    expect(s.relics).toEqual(initRelics());
    s.stats.relics = 11;
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(0);
    s.stats.relics = 24;
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(2); // no Academy: they wait
    placeBuildingRaw(s, 'academy', f.x + 4, f.y + 4);
    dailyRelics(s);
    expect(s.relics.uncatalogued).toBe(1);
    expect(Object.values(s.relics.pieces).reduce((a, b) => a + b, 0)).toBe(1);
    for (let k = 0; k < 40; k++) { s.stats.relics += 12; dailyRelics(s); }
    expect(s.relics.complete.length).toBe(RELIC_SETS.length);
    expect(s.relics.uncatalogued).toBeGreaterThan(0); // nothing left to catalogue into
    // boons
    const cost0 = sectorCost(s, 0);
    s.relics.complete = s.relics.complete.filter((id) => id !== 'concordcharts');
    expect(cost0 / sectorCost(s, 0)).toBeCloseTo(0.8, 2);
    s.relics.complete = [];
    recomputeAll(s);
    const st0 = s.manaStorageMax;
    s.relics.complete = ['lanterncores'];
    recomputeAll(s);
    expect(s.manaStorageMax - st0).toBe(60);
    expect(relicDone(s, 'lanterncores')).toBe(true);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.relics.complete).toEqual(['lanterncores']);
    const o = JSON.parse(serialize(s)); delete o.relics;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).relics).toEqual(initRelics());
  });
});
