/** The balance table (DESIGN 4.93, 4.95): the bot's runs over peoples × seeds × draws, in parallel, with each row's spread, and with
 *  `--compare <ref>` the working tree against a git ref, paired by seed, with a verdict against the noise.
 *
 *  npx tsx scripts/table.ts [--bar wide] [--compare <ref>] [--ref <ref>] [--peoples vellish]
 *                           [--seeds 42,43,44] [--draws 2] [--target 0.10] [--max-draws 8] [--days 150] [--jobs N]
 *                           [--no-cache] [--out shots/table.json]
 *  npx tsx scripts/table.ts --import-cache <dir> --ref <sha>   (old commit-keyed run files of that commit into the cache)
 *
 *  --ref runs another git ref instead of the working tree; --compare runs both. A ref runs in a detached worktree in the temp dir
 *  with this tree's balance.ts and rolls.ts copied in (so both print the same json line), removed afterwards.
 *
 *  The cache (iteration 71, DESIGN 4.102): runs are kept in balance/cache/<sim>-<runner>.json, committed with the iteration, keyed
 *  by the sim key (a hash of every file under src/sim, src/data and src/core, and the node major version) and the runner's hash.
 *  The same sim gives the same runs whatever the commit, so main's side of a bar is the previous iteration's branch side, and a
 *  docs-, art- or UI-only change has nothing to run. A dirty working tree is keyed by its files' contents, so it is cached too. A
 *  table stopped part way resumes. The four newest files are kept. --jobs defaults to every core.
 *
 *  --bar wide (the bar for a sim change since iteration 64): seeds 42–47, two draws, then rounds: every people whose floor (2·SE) is
 *  over the target share of its mean gets one more draw a seed on both sides, until each is under it or at the cap of draws. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { SIM_DIRS, cacheKey, needMore, parseLsTree, parseRun, pruneList, renderBar, renderTable, simKeyOf, type CacheFile, type Run } from './tableStats';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const wide = opt('bar') === 'wide';
const peoples = opt('peoples', 'vellish')!.split(','); // the Vellish only since the scope reset (phase 1a)
const seeds = opt('seeds', wide ? '42,43,44,45,46,47' : '42,43,44')!.split(',').map(Number);
const draws = Number(opt('draws', '2'));
const target = Number(opt('target', '0.10'));
const maxDraws = Number(opt('max-draws', wide ? '8' : String(draws)));
const days = Number(opt('days', '150'));
const scenario = opt('scenario', 'valley')!; // a charter other than the valley, e.g. --scenario atoll (iteration 95)
if (!['valley', 'onenode', 'island', 'atoll', 'inherited'].includes(scenario)) throw new Error(`unknown --scenario "${scenario}"`);
if (scenario !== 'valley' && (opt('compare') || opt('ref'))) throw new Error('--scenario has no main side to compare with: an older tree does not know the charter');
const jobs = Number(opt('jobs', String(Math.max(1, cpus().length)))); // every core since iteration 71
const out = resolve(ROOT, opt('out', 'shots/table.json')!);
const cacheDir = resolve(ROOT, 'balance/cache');
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

interface Side { label: string; dir: string; temp: boolean; sim: string }
interface Job { side: Side; people: string; seed: number; rolls: number }

/** The sim key of a ref (from git's tree) or of the working tree (from the files as they are, committed or not). */
function simKeyOfRef(r: string): string {
  return simKeyOf(parseLsTree(execFileSync('git', ['ls-tree', '-r', r, '--', ...SIM_DIRS], { cwd: ROOT }).toString()), process.version);
}
function simKeyOfTree(): string {
  const paths = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...SIM_DIRS], { cwd: ROOT }).toString().split('\n').filter((p) => p && existsSync(join(ROOT, p)));
  const blobs = paths.length ? execFileSync('git', ['hash-object', '--', ...paths], { cwd: ROOT }).toString().trim().split('\n') : [];
  return simKeyOf(paths.map((path, k) => ({ path, blob: blobs[k] })), process.version);
}

/** The cache files, read once and written back whole after every run (a stopped table resumes). */
const files = new Map<string, CacheFile>();
function cacheFile(name: string): CacheFile {
  let f = files.get(name);
  if (!f) {
    const p = join(cacheDir, name);
    f = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as CacheFile) : { created: new Date().toISOString(), runs: {} };
    files.set(name, f);
  }
  return f;
}
function saveCacheFile(name: string): void {
  mkdirSync(cacheDir, { recursive: true });
  const p = join(cacheDir, name);
  writeFileSync(`${p}.tmp`, JSON.stringify(cacheFile(name), null, 0));
  renameSync(`${p}.tmp`, p);
}
/** Keep the four newest cache files and any in use now. */
function prune(inUse: string[]): void {
  if (!existsSync(cacheDir)) return;
  const list = readdirSync(cacheDir).filter((n) => n.endsWith('.json')).map((name) => ({ name, created: (JSON.parse(readFileSync(join(cacheDir, name), 'utf8')) as CacheFile).created }));
  for (const name of pruneList(list, inUse)) { rmSync(join(cacheDir, name)); process.stderr.write(`cache: dropped ${name}\n`); }
}

let cached = 0;
function runOne(j: Job): Promise<Run> {
  const key = cacheKey({ sim: j.side.sim, runner, people: j.people, seed: j.seed, rolls: j.rolls, days, scenario });
  const hit = useCache ? cacheFile(key.file).runs[key.run] : undefined;
  if (hit) { cached++; return Promise.resolve({ ...hit, ref: j.side.label }); }
  return new Promise((ok, fail) => {
    const p = spawn('npx', ['tsx', 'scripts/balance.ts', String(j.seed), String(days), '-', j.people, `roll=${j.rolls}`, ...(scenario === 'valley' ? [] : [`scenario=${scenario}`])], { cwd: j.side.dir });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.stderr.on('data', (d) => (text += d));
    p.on('close', (code) => {
      const r = parseRun(text);
      if (!r) return fail(new Error(`${j.side.label} ${j.people} ${j.seed} roll=${j.rolls} printed no json line (exit ${code}):\n${text.slice(-1500)}`));
      if (useCache) { cacheFile(key.file).runs[key.run] = r; saveCacheFile(key.file); }
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

// --import-cache <dir> --ref <sha>: the old commit-keyed files of one commit (shots/table-cache before iteration 71) into the cache
const importDir = opt('import-cache');
if (importDir) {
  if (!ref) throw new Error('--import-cache needs --ref <the commit the runs were made on>');
  const sha = execFileSync('git', ['rev-parse', `${ref}^{commit}`], { cwd: ROOT }).toString().trim();
  const sim = simKeyOfRef(sha);
  const head = `${sha.slice(0, 12)}-${runner.slice(0, 12)}-`;
  let n = 0;
  for (const name of readdirSync(importDir)) {
    if (!name.startsWith(head) || !name.endsWith('.json')) continue;
    const r = JSON.parse(readFileSync(join(importDir, name), 'utf8')) as Run;
    const key = cacheKey({ sim, runner, people: r.people, seed: r.seed, rolls: r.rolls, days: r.days });
    cacheFile(key.file).runs[key.run] = r;
    n++;
  }
  if (n) saveCacheFile(cacheKey({ sim, runner, people: '', seed: 0, rolls: 0, days: 0 }).file);
  console.log(`imported ${n} runs of ${sha.slice(0, 12)} under the sim key ${sim.slice(0, 12)} (this tree's: ${simKeyOfTree().slice(0, 12)})`);
  process.exit(0);
}

/** Whether a side's tree knows a people: a ref older than the people has no row for it (a new people, iteration 96). */
const knows = (side: Side, people: string): boolean => readFileSync(join(side.dir, 'src/data/factions.ts'), 'utf8').includes(`\n  ${people}: {`);

const sides: Side[] = [];
if (ref) sides.push({ label: ref, dir: worktree(ref), temp: true, sim: simKeyOfRef(ref) });
else sides.push({ label: 'this tree', dir: ROOT, temp: false, sim: simKeyOfTree() }); // keyed by its files, committed or not (iteration 71)
if (compareRef) sides.push({ label: compareRef, dir: worktree(compareRef), temp: true, sim: simKeyOfRef(compareRef) });
for (const s of sides) process.stderr.write(`${s.label}: sim ${s.sim.slice(0, 12)}${sides.length === 2 && sides[0].sim === sides[1].sim ? ' (the same sim on both sides: every pair is equal)' : ''}\n`);
if (useCache) prune(sides.map((s) => cacheKey({ sim: s.sim, runner, people: '', seed: 0, rolls: 0, days: 0 }).file));
try {
  const runs: Run[] = [];
  const have: Record<string, number> = Object.fromEntries(peoples.map((p) => [p, 0]));
  let grow = peoples;
  let want = draws;
  for (let round = 1; grow.length; round++) {
    const list: Job[] = [];
    for (const people of grow) for (const seed of seeds) for (let k = have[people]; k < (round === 1 ? want : have[people] + 1); k++) for (const side of sides) if (knows(side, people)) list.push({ side, people, seed, rolls: k });
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
  if (scenario !== 'valley') { // the charter's own report: the goal reached, and how far the isles were settled
    const rows = peoples.map((p) => {
      const rs = a.filter((r) => r.people === p);
      const goals = rs.filter((r) => r.goal).length;
      const settled = rs.map((r) => (r.isles ?? []).filter((c) => c >= 6).length);
      const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length);
      const burgh = rs.map((r) => r.gates[6]?.day).filter((d): d is number => d !== undefined); // the seventh gate is Burgh for every people (milestone 6)
      return `| ${p} | ${rs.length} | ${goals}/${rs.length} | ${mean(settled).toFixed(1)} | ${burgh.length ? `${[...burgh].sort((x, y) => x - y)[burgh.length >> 1]} (${burgh.length}/${rs.length})` : '–'} | ${Math.round(mean(rs.map((r) => r.folk)))} | ${mean(rs.map((r) => r.galeDays ?? 0)).toFixed(1)} |`;
    });
    console.log(`\nThe ${scenario} charter (${days} days):\n\n| people | runs | goal reached | isles settled (mean) | median Burgh day | folk (mean) | gale days (mean) |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}`);
  }
  console.log(`\n${runs.length} runs (${cached} from the cache) in ${Math.round((Date.now() - t0) / 60000)} minutes; raw runs: ${out}`);
} finally {
  for (const s of sides) if (s.temp) dropWorktree(s.dir);
}
