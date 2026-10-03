/** The balance table (DESIGN 4.93, 4.95): the bot's runs over peoples × seeds × draws, in parallel, with each row's spread, and with
 *  `--compare <ref>` the working tree against a git ref, paired by seed, with a verdict against the noise.
 *
 *  npx tsx scripts/table.ts [--bar wide] [--compare <ref>] [--ref <ref>] [--peoples vellish,grimmen,veshari,tallowkin]
 *                           [--seeds 42,43,44] [--draws 2] [--target 0.10] [--max-draws 8] [--days 150] [--jobs N]
 *                           [--no-cache] [--out shots/table.json]
 *
 *  --ref runs another git ref instead of the working tree; --compare runs both. A ref runs in a detached worktree in the temp dir
 *  with this tree's balance.ts and rolls.ts copied in (so both print the same json line), removed afterwards. Runs are cached in
 *  shots/table-cache by commit, runner and run: a ref's always, the working tree's when it has no uncommitted change under src/,
 *  scripts/ or public/. A table stopped part way resumes from the cache.
 *
 *  --bar wide (the bar for a sim change since iteration 64): seeds 42–47, two draws, then rounds: every people whose floor (2·SE) is
 *  over the target share of its mean gets one more draw a seed on both sides, until each is under it or at the cap of draws. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { cacheKey, needMore, parseRun, renderBar, renderTable, type Run } from './tableStats';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const wide = opt('bar') === 'wide';
const peoples = opt('peoples', 'vellish,grimmen,veshari,tallowkin')!.split(',');
const seeds = opt('seeds', wide ? '42,43,44,45,46,47' : '42,43,44')!.split(',').map(Number);
const draws = Number(opt('draws', '2'));
const target = Number(opt('target', '0.10'));
const maxDraws = Number(opt('max-draws', wide ? '8' : String(draws)));
const days = Number(opt('days', '150'));
const jobs = Number(opt('jobs', String(Math.max(1, cpus().length - 1))));
const out = resolve(ROOT, opt('out', 'shots/table.json')!);
const cacheDir = resolve(ROOT, 'shots/table-cache');
const useCache = !args.includes('--no-cache');
const compareRef = opt('compare');
const ref = opt('ref');
const runner = createHash('sha1').update(readFileSync(join(ROOT, 'scripts/balance.ts'))).update(readFileSync(join(ROOT, 'scripts/rolls.ts'))).digest('hex');

/** A detached worktree of `r` with this tree's balance runner in it. */
function worktree(r: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'wardlight-table-'));
  rmSync(dir, { recursive: true });
  execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, r], { cwd: ROOT, stdio: 'inherit' });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  for (const f of ['balance.ts', 'rolls.ts']) copyFileSync(join(ROOT, 'scripts', f), join(dir, 'scripts', f));
  return dir;
}
function dropWorktree(dir: string): void {
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'inherit' }); } catch { rmSync(dir, { recursive: true, force: true }); }
}

interface Side { label: string; dir: string; temp: boolean; sha?: string }
interface Job { side: Side; people: string; seed: number; rolls: number }
let cached = 0;
function runOne(j: Job): Promise<Run> {
  const key = j.side.sha ? join(cacheDir, cacheKey({ sha: j.side.sha, runner, people: j.people, seed: j.seed, rolls: j.rolls, days }) + '.json') : null;
  if (key && useCache && existsSync(key)) { cached++; return Promise.resolve({ ...(JSON.parse(readFileSync(key, 'utf8')) as Run), ref: j.side.label }); }
  return new Promise((ok, fail) => {
    const p = spawn('npx', ['tsx', 'scripts/balance.ts', String(j.seed), String(days), '-', j.people, `roll=${j.rolls}`], { cwd: j.side.dir });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.stderr.on('data', (d) => (text += d));
    p.on('close', (code) => {
      const r = parseRun(text);
      if (!r) return fail(new Error(`${j.side.label} ${j.people} ${j.seed} roll=${j.rolls} printed no json line (exit ${code}):\n${text.slice(-1500)}`));
      if (key) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(key, JSON.stringify(r)); }
      ok({ ...r, ref: j.side.label });
    });
  });
}
const t0 = Date.now();
async function pool(list: Job[], round: number): Promise<Run[]> {
  const res: Run[] = new Array(list.length);
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, async () => {
    while (next < list.length) {
      const k = next++;
      res[k] = await runOne(list[k]);
      done++;
      process.stderr.write(`\rround ${round}: ${done}/${list.length} runs (${cached} from the cache, ${Math.round((Date.now() - t0) / 1000)} s)   `);
    }
  }));
  process.stderr.write('\n');
  return res;
}

const sides: Side[] = [];
const shaOf = (r: string) => execFileSync('git', ['rev-parse', `${r}^{commit}`], { cwd: ROOT }).toString().trim();
if (ref) sides.push({ label: ref, dir: worktree(ref), temp: true, sha: shaOf(ref) });
else {
  // the working tree is cached too when nothing the runs read differs from HEAD (iteration 64: the first wide bar outran the
  // two-hour limit of a background job; with every finished run cached, a rerun resumes where it was stopped)
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'scripts', 'public', 'package.json'], { cwd: ROOT }).toString().trim();
  sides.push({ label: 'this tree', dir: ROOT, temp: false, sha: dirty ? undefined : shaOf('HEAD') });
  if (dirty) process.stderr.write('this tree has uncommitted changes: its runs are not cached (commit first to make a long table resumable)\n');
}
if (compareRef) sides.push({ label: compareRef, dir: worktree(compareRef), temp: true, sha: shaOf(compareRef) });
try {
  const runs: Run[] = [];
  const have: Record<string, number> = Object.fromEntries(peoples.map((p) => [p, 0]));
  let grow = peoples;
  let want = draws;
  for (let round = 1; grow.length; round++) {
    const list: Job[] = [];
    for (const people of grow) for (const seed of seeds) for (let k = have[people]; k < (round === 1 ? want : have[people] + 1); k++) for (const side of sides) list.push({ side, people, seed, rolls: k });
    for (const people of grow) have[people] = round === 1 ? want : have[people] + 1;
    process.stderr.write(`round ${round}: ${list.length} runs of ${days} days for ${grow.join(', ')}, ${jobs} at a time\n`);
    runs.push(...(await pool(list, round)));
    const [a, b] = sides.map((s) => runs.filter((r) => r.ref === s.label));
    grow = wide ? needMore(a, b, target, maxDraws) : [];
    want = 0;
  }
  const [a, b] = sides.map((s) => runs.filter((r) => r.ref === s.label));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ days, peoples, seeds, target, maxDraws, wide, sides: sides.map((s) => s.label), runs }, null, 1));
  if (wide) console.log(`The bar (a floor of ${Math.round(target * 100)} % of each people's mean, at most ${maxDraws} draws a seed):\n\n${renderBar(a, b, target, maxDraws)}\n`);
  console.log(renderTable(a, b, b ? [sides[0].label, sides[1].label] : undefined));
  console.log(`\n${runs.length} runs (${cached} from the cache) in ${Math.round((Date.now() - t0) / 60000)} minutes; raw runs: ${out}`);
} finally {
  for (const s of sides) if (s.temp) dropWorktree(s.dir);
}
