/** Iteration 62 (a balance measure that can see a change): the balance table's statistics. The json line is parsed, σ is pooled
 *  within seeds, two refs are compared paired by seed with a verdict against twice the standard error, the report carries every
 *  row, and `roll=N` draws exactly N extra numbers from the main stream. */
import { describe, expect, it } from 'vitest';
import { bySeed, compare, gateCounts, overall, parseRun, pooledSigma, renderTable, type Run } from '../scripts/tableStats';
import { extraRolls, rollsOf } from '../scripts/rolls';
import { createGame, rngOf } from '../src/sim/world';

function run(people: string, seed: number, rolls: number, folk: number, gates: [string, number][] = [['Camp', 1]]): Run {
  return { seed, people, rolls, days: 150, folk, milestone: gates.length - 1, gates: gates.map(([name, day]) => ({ name, day })), treasury: 0, loan: 0, depotDay: -1, roadCrowns: 0, gameOver: false };
}
/** Seeds whose draws sit at base ± 100 (σ within a seed = 100·√2 for two draws at ±100). */
function side(people: string, shift: number, seeds = [1, 2, 3, 4, 5, 6, 7, 8]): Run[] {
  return seeds.flatMap((s) => [run(people, s, 0, 1000 + s * 50 + shift - 100), run(people, s, 1, 1000 + s * 50 + shift + 100)]);
}

describe('The balance table reads its runs', () => {
  it('parses the last json line and nothing above it', () => {
    const r = run('vellish', 42, 1, 2249, [['Founding Stake', 1], ['Free City', 129]]);
    const text = `d150 pop 2249 ...\nmilestones: ...\njson: {"not":"this"}\nbot: ...\njson: ${JSON.stringify(r)}\n`;
    expect(parseRun(text)).toEqual(r);
    expect(parseRun('a run that crashed\n')).toBeNull();
  });
  it('the roll argument: roll=N, null for one, nothing for none, and a typo refused', () => {
    expect(rollsOf(undefined)).toBe(0);
    expect(rollsOf('null')).toBe(1);
    expect(rollsOf('roll=3')).toBe(3);
    expect(() => rollsOf('rolls=3')).toThrow();
  });
  it('roll=N draws exactly N numbers from the main stream', () => {
    const s = createGame(62, 'Rollwick');
    const r = rngOf(s);
    for (let k = 0; k < 3; k++) r.next();
    extraRolls(s, 3);
    expect(s.rngState).toBe(r.state);
    const before = s.rngState;
    extraRolls(s, 0);
    expect(s.rngState).toBe(before);
  });
});

describe('The balance table\'s statistics', () => {
  it('σ is pooled within seeds, so a difference between seeds is not noise', () => {
    const g = bySeed(side('vellish', 0)).get('vellish')!;
    expect(pooledSigma([...g.values()])).toBeCloseTo(100 * Math.SQRT2, 6);
  });
  it('a shift of three σ is seen; half a σ is within the noise; the floor says how large a change could be seen', () => {
    const base = bySeed(side('vellish', 0)).get('vellish')!;
    const sigma = 100 * Math.SQRT2;
    const far = compare('vellish', bySeed(side('vellish', 3 * sigma)).get('vellish')!, base);
    expect(far.delta).toBeCloseTo(3 * sigma, 6);
    // eight seeds, two draws a side: SE = σ·√(2/2/8) = σ/√8
    expect(far.se).toBeCloseTo(sigma / Math.sqrt(8), 6);
    expect(far.seen).toBe(true);
    const near = compare('vellish', bySeed(side('vellish', 0.5 * sigma)).get('vellish')!, base);
    expect(near.seen).toBe(false);
    expect(near.floor).toBeCloseTo(2 * sigma / Math.sqrt(8), 6);
  });
  it('the peoples together: the deltas add and the errors add in quadrature', () => {
    const v = compare('vellish', bySeed(side('vellish', 300)).get('vellish')!, bySeed(side('vellish', 0)).get('vellish')!);
    const g = compare('grimmen', bySeed(side('grimmen', -100)).get('grimmen')!, bySeed(side('grimmen', 0)).get('grimmen')!);
    const all = overall([v, g]);
    expect(all.delta).toBeCloseTo(200, 6);
    expect(all.se).toBeCloseTo(Math.hypot(v.se, g.se), 6);
  });
  it('gates: runs reaching each, and the median day of those that do', () => {
    const rs = [run('vellish', 1, 0, 1, [['A', 1], ['B', 10]]), run('vellish', 1, 1, 1, [['A', 1], ['B', 20], ['C', 90]]), run('vellish', 2, 0, 1, [['A', 1]])];
    expect(gateCounts(rs)).toEqual([{ name: 'A', reached: 3, of: 3, medianDay: 1 }, { name: 'B', reached: 2, of: 3, medianDay: 15 }, { name: 'C', reached: 1, of: 3, medianDay: 90 }]);
  });
  it('the report carries every row, and a verdict for each people and for all', () => {
    const a = [...side('vellish', 400, [42, 43]), ...side('grimmen', 0, [42, 43])];
    const b = [...side('vellish', 0, [42, 43]), ...side('grimmen', 0, [42, 43])];
    const md = renderTable(a, b, ['branch', 'main']);
    for (const row of ['vellish 42', 'vellish 43', 'grimmen 42', 'grimmen 43']) expect(md).toContain(`| ${row} |`);
    expect(md).toMatch(/\| vellish \|.*\*\*seen\*\*/);
    expect(md).toMatch(/\| grimmen \|.*within the noise/);
    expect(md).toMatch(/\| all \|/);
    const solo = renderTable(a);
    expect(solo).toContain('σ within seeds');
  });
});
