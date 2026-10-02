/** The balance table (DESIGN 4.93): the bot's runs over peoples × seeds × draws, in parallel, with each row's spread, and with
 *  `--compare <ref>` the working tree against a git ref, paired by seed, with a verdict against the noise.
 *
 *  npx tsx scripts/table.ts [--compare <ref>] [--ref <ref>] [--peoples vellish,grimmen,veshari,tallowkin] [--seeds 42,43,44]
 *                           [--draws 2] [--days 150] [--jobs N] [--out shots/table.json]
 *
 *  --ref runs another git ref instead of the working tree; --compare runs both. A ref runs in a detached worktree in the temp dir
 *  with this tree's balance.ts and rolls.ts copied in (so both print the same json line), removed afterwards. */
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseRun, renderTable, type Run } from './tableStats';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const peoples = opt('peoples', 'vellish,grimmen,veshari,tallowkin')!.split(',');
const seeds = opt('seeds', '42,43,44')!.split(',').map(Number);
const draws = Number(opt('draws', '2'));
const days = Number(opt('days', '150'));
const jobs = Number(opt('jobs', String(Math.max(1, cpus().length - 1))));
const out = resolve(ROOT, opt('out', 'shots/table.json')!);
const compareRef = opt('compare');
const ref = opt('ref');

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

interface Job { dir: string; label: string; people: string; seed: number; rolls: number }
function runOne(j: Job): Promise<Run> {
  return new Promise((ok, fail) => {
    const p = spawn('npx', ['tsx', 'scripts/balance.ts', String(j.seed), String(days), '-', j.people, `roll=${j.rolls}`], { cwd: j.dir });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.stderr.on('data', (d) => (text += d));
    p.on('close', (code) => {
      const r = parseRun(text);
      if (!r) return fail(new Error(`${j.label} ${j.people} ${j.seed} roll=${j.rolls} printed no json line (exit ${code}):\n${text.slice(-1500)}`));
      ok({ ...r, ref: j.label });
    });
  });
}
async function pool(list: Job[]): Promise<Run[]> {
  const res: Run[] = new Array(list.length);
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, async () => {
    while (next < list.length) {
      const k = next++;
      res[k] = await runOne(list[k]);
      done++;
      process.stderr.write(`\r${done}/${list.length} runs (${Math.round((Date.now() - t0) / 1000)} s)   `);
    }
  }));
  process.stderr.write('\n');
  return res;
}

const sides: { label: string; dir: string; temp: boolean }[] = [];
if (ref) sides.push({ label: ref, dir: worktree(ref), temp: true });
else sides.push({ label: 'this tree', dir: ROOT, temp: false });
if (compareRef) sides.push({ label: compareRef, dir: worktree(compareRef), temp: true });
try {
  const list: Job[] = [];
  for (const people of peoples) for (const seed of seeds) for (let k = 0; k < draws; k++) for (const s of sides) list.push({ dir: s.dir, label: s.label, people, seed, rolls: k });
  process.stderr.write(`${list.length} runs of ${days} days, ${jobs} at a time\n`);
  const runs = await pool(list);
  const [a, b] = sides.map((s) => runs.filter((r) => r.ref === s.label));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ days, peoples, seeds, draws, sides: sides.map((s) => s.label), runs }, null, 1));
  console.log(renderTable(a, b, b ? [sides[0].label, sides[1].label] : undefined));
  console.log(`\nraw runs: ${out}`);
} finally {
  for (const s of sides) if (s.temp) dropWorktree(s.dir);
}
