/** Iteration 71 (DESIGN 4.102, a faster balance bar): runs are cached by what they read, not by the commit. The sim key is a hash of
 *  the files under src/sim, src/data and src/core (their git blobs) and the node major version; the cache files are committed under
 *  balance/cache, one per sim and runner, and the four newest are kept. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SIM_DIRS, cacheKey, parseLsTree, pruneList, simKeyOf, type CacheFile } from '../scripts/tableStats';

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
    for (const dir of SIM_DIRS) for (const name of readdirSync(dir)) for (const m of readFileSync(`${dir}/${name}`, 'utf8').matchAll(/from '\.\.\/([a-z]+)\//g)) expect(SIM_DIRS).toContain(`src/${m[1]}`);
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
      for (const [key, r] of Object.entries(f.runs)) expect(key).toBe(cacheKey({ sim: '', runner: '', people: r.people, seed: r.seed, rolls: r.rolls, days: r.days }).run);
    }
  });
});
