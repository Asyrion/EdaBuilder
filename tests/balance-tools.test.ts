/** The balance tools: the table's statistics (σ pooled within seeds, paired comparisons, the report), the wide bar's rounds and
 *  floor, and the cache of runs keyed by what they read. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SIM_DIRS, barComparison, bySeed, cacheKey, compare, drawsOf, floorShare, gateCounts, needMore, overall, parseLsTree, parseRun, pooledSigma, pruneList, renderBar, renderTable, simKeyOf, type CacheFile, type Run } from '../scripts/tableStats';
import { extraRolls, rollsOf } from '../scripts/rolls';
import { createGame, rngOf } from '../src/sim/world';

// The table's statistics: the json line is parsed, σ is pooled within seeds, two refs are compared paired by seed with a verdict
// against twice the standard error, the report carries every row, and `roll=N` draws exactly N extra numbers from the main stream.
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

// The wide bar: its rounds grow only the peoples whose floor is over the target and stop at the cap, the floor follows the
// standard error's formula, the cache key moves with everything a run depends on, and the report never rounds a cap up to "met".
function barRun(people: string, seed: number, rolls: number, folk: number): Run {
  return { seed, people, rolls, days: 150, folk, milestone: 0, gates: [], treasury: 0, loan: 0, depotDay: -1, roadCrowns: 0, gameOver: false };
}
/** `draws` draws a seed at 1000 + seed·50 ± `noise` (alternating), for six seeds. */
function people(name: string, noise: number, draws = 2, seeds = [42, 43, 44, 45, 46, 47]): Run[] {
  return seeds.flatMap((s) => Array.from({ length: draws }, (_, k) => barRun(name, s, k, 1000 + s * 50 + (k % 2 ? noise : -noise))));
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

// The cache (DESIGN 4.102): runs are cached by what they read, not by the commit. The sim key is a hash of the files under
// src/sim, src/data and src/core (their git blobs) and the node major version; the cache files are committed under balance/cache,
// one per sim and runner, and the four newest are kept.
const files = [{ path: 'src/sim/a.ts', blob: '1'.repeat(40) }, { path: 'src/data/b.ts', blob: '2'.repeat(40) }];

describe('The sim key', () => {
  it('moves with a file\'s contents, a new file and the node major version, not with the order of the listing', () => {
    const base = simKeyOf(files, 'v22.22.0');
    expect(simKeyOf([...files].reverse(), 'v22.1.0')).toBe(base);
    expect(simKeyOf([files[0], { ...files[1], blob: '3'.repeat(40) }], 'v22.22.0')).not.toBe(base);
    expect(simKeyOf([...files, { path: 'src/core/c.ts', blob: '4'.repeat(40) }], 'v22.22.0')).not.toBe(base);
    expect(simKeyOf(files, 'v24.0.0')).not.toBe(base);
  });

  it('reads what a balance run reads', () => {
    expect(SIM_DIRS).toEqual(['src/sim', 'src/data', 'src/core']);
    // the scripts a run starts from import the sim and the data only, and those reach nothing past src/sim, src/data and src/core
    for (const f of ['scripts/balance.ts', 'scripts/rolls.ts']) for (const m of readFileSync(f, 'utf8').matchAll(/from '\.\.\/src\/([a-z]+)/g)) expect(SIM_DIRS).toContain(`src/${m[1]}`);
    // (sub-folders too: src/data/content holds the content as JSON since iteration 87, which imports nothing)
    const ts = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? ts(`${dir}/${d.name}`) : d.name.endsWith('.ts') ? [`${dir}/${d.name}`] : []);
    for (const dir of SIM_DIRS) for (const file of ts(dir)) for (const m of readFileSync(file, 'utf8').matchAll(/from '(?:\.\.\/)+([a-z]+)\//g)) if (m[1] !== 'content') expect(SIM_DIRS).toContain(`src/${m[1]}`);
  });

  it('is the same from git\'s tree and from the files on disk when they match', () => {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/core']).toString().trim();
    if (dirty) return; // only meaningful on a clean src/core
    const fromRef = simKeyOf(parseLsTree(execFileSync('git', ['ls-tree', '-r', 'HEAD', '--', 'src/core']).toString()), process.version);
    const paths = execFileSync('git', ['ls-files', '--', 'src/core']).toString().split('\n').filter(Boolean);
    const blobs = execFileSync('git', ['hash-object', '--', ...paths]).toString().trim().split('\n');
    expect(simKeyOf(paths.map((path, k) => ({ path, blob: blobs[k] })), process.version)).toBe(fromRef);
  });
});

describe('The cache files', () => {
  it('one file per sim and runner, a run within it', () => {
    const k = cacheKey({ sim: 'a'.repeat(40), runner: 'b'.repeat(40), people: 'vellish', seed: 42, rolls: 3, days: 150 });
    expect(k).toEqual({ file: `${'a'.repeat(12)}-${'b'.repeat(12)}.json`, run: 'vellish-42-r3-d150' });
  });

  it('pruning keeps the four newest and any file in use', () => {
    const list = ['2026-01-01', '2026-03-01', '2026-02-01', '2026-05-01', '2026-04-01', '2026-06-01'].map((created, k) => ({ name: `f${k}.json`, created }));
    expect(pruneList(list, []).sort()).toEqual(['f0.json', 'f2.json']);
    expect(pruneList(list, ['f0.json'])).toEqual(['f2.json']);
  });

  it('the committed cache files parse, and hold runs keyed as the table reads them', () => {
    if (!existsSync('balance/cache')) return;
    for (const name of readdirSync('balance/cache')) {
      expect(name).toMatch(/^[0-9a-f]{12}-[0-9a-f]{12}\.json$/);
      const f = JSON.parse(readFileSync(`balance/cache/${name}`, 'utf8')) as CacheFile;
      expect(Number.isNaN(Date.parse(f.created))).toBe(false);
      for (const [key, r] of Object.entries(f.runs)) expect(key).toBe(cacheKey({ sim: '', runner: '', people: r.people, seed: r.seed, rolls: r.rolls, days: r.days, scenario: (r as { scenario?: string }).scenario }).run);
    }
  });
});
