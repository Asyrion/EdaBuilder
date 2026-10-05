/** Iteration 64 (a wider balance bar): the bar's rounds grow only the peoples whose floor is over the target and stop at the cap,
 *  the floor follows the standard error's formula, the cache key moves with everything a run depends on, and the bar's report never
 *  rounds a cap up to "met". */
import { describe, expect, it } from 'vitest';
import { bySeed, cacheKey, drawsOf, floorShare, barComparison, needMore, renderBar, type Run } from '../scripts/tableStats';

function run(people: string, seed: number, rolls: number, folk: number): Run {
  return { seed, people, rolls, days: 150, folk, milestone: 0, gates: [], treasury: 0, loan: 0, depotDay: -1, roadCrowns: 0, gameOver: false };
}
/** `draws` draws a seed at 1000 + seed·50 ± `noise` (alternating), for six seeds. */
function people(name: string, noise: number, draws = 2, seeds = [42, 43, 44, 45, 46, 47]): Run[] {
  return seeds.flatMap((s) => Array.from({ length: draws }, (_, k) => run(name, s, k, 1000 + s * 50 + (k % 2 ? noise : -noise))));
}

describe('The wide bar', () => {
  it('the floor is 2·SE as a share of the mean, with SE = σ·√(2 / (draws × seeds))', () => {
    const rs = bySeed(people('vellish', 100)).get('vellish')!;
    const c = barComparison('vellish', rs);
    const sigma = 100 * Math.SQRT2; // two draws at ±100
    expect(c.sigma).toBeCloseTo(sigma, 6);
    expect(c.floor).toBeCloseTo(2 * sigma * Math.sqrt(2 / (2 * 6)), 6);
    expect(floorShare(c)).toBeCloseTo(c.floor / c.meanA, 9);
  });
  it('grows only the noisy peoples, and none at the cap', () => {
    const quiet = people('grimmen', 10); // a floor far under a tenth
    const loud = people('vellish', 1500); // a floor far over it
    expect(needMore([...quiet, ...loud], undefined, 0.1, 8)).toEqual(['vellish']);
    const capped = people('vellish', 1500, 8);
    expect(drawsOf(bySeed(capped).get('vellish')!)).toBe(8);
    expect(needMore([...quiet, ...capped], undefined, 0.1, 8)).toEqual([]);
  });
  it('with a compare, the floor counts both sides', () => {
    const a = people('veshari', 300);
    const b = people('veshari', 0); // a quiet other side lowers the pooled σ
    const alone = floorShare(barComparison('veshari', bySeed(a).get('veshari')!));
    const paired = floorShare(barComparison('veshari', bySeed(a).get('veshari')!, bySeed(b).get('veshari')!));
    expect(paired).toBeLessThan(alone);
  });
  it('the cache key moves with the sim, the runner, the run and the days (keyed by the sim since iteration 71)', () => {
    const k = { sim: 'a'.repeat(40), runner: 'b'.repeat(40), people: 'vellish', seed: 42, rolls: 1, days: 150 };
    const id = (x: { file: string; run: string }) => `${x.file}#${x.run}`;
    const base = id(cacheKey(k));
    for (const change of [{ sim: 'c'.repeat(40) }, { runner: 'd'.repeat(40) }, { people: 'grimmen' }, { seed: 43 }, { rolls: 2 }, { days: 30 }]) expect(id(cacheKey({ ...k, ...change }))).not.toBe(base);
    expect(id(cacheKey({ ...k }))).toBe(base);
  });
  it('the report says met, not met, or not met at the cap, and never rounds a cap up', () => {
    const md = renderBar([...people('grimmen', 10), ...people('vellish', 1500, 8), ...people('tallowkin', 1500, 3)], undefined, 0.1, 8);
    expect(md).toMatch(/\| grimmen \| 6 × 2 \|.*\| met \|/);
    expect(md).toMatch(/\| vellish \| 6 × 8 \|.*not met: at the cap of 8 draws/);
    expect(md).toMatch(/\| tallowkin \| 6 × 3 \|.*\*\*not met\*\* \|/);
  });
});
