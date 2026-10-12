/** The balance table's statistics (DESIGN 4.93): pure, so tests can hold them. scripts/table.ts runs the matrix and calls these.
 *
 *  A seed's draws (roll 0, 1, 2, … extra rolls of the main stream on day 10) are the same map down different paths, so the spread
 *  inside a seed is the noise. σ is pooled within seeds; two refs are compared paired by seed, and a difference is "seen" only
 *  when it is more than twice its standard error. */
import { createHash } from 'node:crypto';

export interface Gate { name: string; day: number }
export interface Run {
  seed: number; people: string; rolls: number; days: number; folk: number; milestone: number; gates: Gate[];
  treasury: number; loan: number; depotDay: number; roadCrowns: number; caravanCrowns?: number; gameOver: boolean;
  ref?: string;
  /** A charter other than the valley (the Atoll, iteration 95): its goal reached, and the standing zone buildings on each isle. */
  scenario?: string; goal?: boolean; isles?: number[]; galeDays?: number;
}

/** The `json:` line of a balance.ts run, or null when the run printed none (it crashed). */
export function parseRun(stdout: string): Run | null {
  const line = stdout.split('\n').reverse().find((l) => l.startsWith('json: '));
  if (!line) return null;
  return JSON.parse(line.slice(6)) as Run;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** Sample variance (n − 1). */
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

/** Runs grouped people → seed → draws (sorted by rolls). */
export function bySeed(runs: Run[]): Map<string, Map<number, Run[]>> {
  const out = new Map<string, Map<number, Run[]>>();
  for (const r of runs) {
    if (!out.has(r.people)) out.set(r.people, new Map());
    const m = out.get(r.people)!;
    if (!m.has(r.seed)) m.set(r.seed, []);
    m.get(r.seed)!.push(r);
  }
  for (const m of out.values()) for (const rs of m.values()) rs.sort((a, b) => a.rolls - b.rolls);
  return out;
}

/** σ of folk, pooled within seeds: the root of the mean over seeds (with two draws or more) of each seed's sample variance. */
export function pooledSigma(groups: Run[][]): number {
  const vs = groups.filter((g) => g.length >= 2).map((g) => variance(g.map((r) => r.folk)));
  return vs.length ? Math.sqrt(mean(vs)) : NaN;
}

export interface Comparison {
  people: string; seeds: number; meanA: number; meanB: number; delta: number; se: number; sigma: number;
  seen: boolean; /** the smallest change this matrix can see (2·SE) */ floor: number;
}

/** A against B for one people, paired by seed: Δ is the mean over shared seeds of (A's mean − B's mean); its variance is
 *  σ² (1/dA + 1/dB) / S per seed pair, with σ pooled over both refs' seeds. */
export function compare(people: string, a: Map<number, Run[]>, b: Map<number, Run[]>): Comparison {
  const seeds = [...a.keys()].filter((s) => b.has(s)).sort((x, y) => x - y);
  const sigma = pooledSigma([...seeds.map((s) => a.get(s)!), ...seeds.map((s) => b.get(s)!)]);
  const ds = seeds.map((s) => mean(a.get(s)!.map((r) => r.folk)) - mean(b.get(s)!.map((r) => r.folk)));
  const varPair = seeds.map((s) => sigma ** 2 * (1 / a.get(s)!.length + 1 / b.get(s)!.length));
  const se = seeds.length ? Math.sqrt(mean(varPair) / seeds.length) : NaN;
  const delta = mean(ds);
  return {
    people, seeds: seeds.length,
    meanA: mean(seeds.flatMap((s) => a.get(s)!.map((r) => r.folk))), meanB: mean(seeds.flatMap((s) => b.get(s)!.map((r) => r.folk))),
    delta, se, sigma, seen: Math.abs(delta) > 2 * se, floor: 2 * se,
  };
}

/** The peoples together: Δ of the sum of the peoples' means, its SE the root of the summed squares. */
export function overall(cs: Comparison[]): Comparison {
  const se = Math.sqrt(cs.reduce((a, c) => a + c.se ** 2, 0));
  const delta = cs.reduce((a, c) => a + c.delta, 0);
  return {
    people: 'all', seeds: cs.reduce((a, c) => a + c.seeds, 0), meanA: cs.reduce((a, c) => a + c.meanA, 0), meanB: cs.reduce((a, c) => a + c.meanB, 0),
    delta, se, sigma: NaN, seen: Math.abs(delta) > 2 * se, floor: 2 * se,
  };
}

/** Per people: how many runs reach each gate, and the median day of those that do. */
export function gateCounts(runs: Run[]): { name: string; reached: number; of: number; medianDay: number }[] {
  const names: string[] = [];
  for (const r of runs) for (const g of r.gates) if (!names.includes(g.name)) names.push(g.name);
  return names.map((name) => {
    const days = runs.map((r) => r.gates.find((g) => g.name === name)?.day).filter((d): d is number => d !== undefined);
    return { name, reached: days.length, of: runs.length, medianDay: median(days) };
  });
}

const n0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '–');
const sgn = (x: number) => (x >= 0 ? '+' : '−') + n0(Math.abs(x));
const pct = (x: number, of: number) => (of > 0 ? `${x >= 0 ? '+' : '−'}${Math.abs((x / of) * 100).toFixed(1)} %` : '–');
const lastGate = (r: Run) => { const g = r.gates[r.gates.length - 1]; return g ? `${g.name} ${g.day}` : '–'; };

/** The markdown report: every row, each people's σ, and with two refs the paired comparison and its verdict. */
export function renderTable(a: Run[], b?: Run[], names: [string, string] = ['this tree', 'the other ref']): string {
  const out: string[] = [];
  const A = bySeed(a);
  const B = b ? bySeed(b) : undefined;
  const draws = (rs: Run[] | undefined) => (rs ? rs.map((r) => `${n0(r.folk)} (${lastGate(r)})`).join(' · ') : '–');
  const spread = (rs: Run[] | undefined) => (rs && rs.length >= 2 ? n0(Math.max(...rs.map((r) => r.folk)) - Math.min(...rs.map((r) => r.folk))) : '–');
  out.push(B ? `| run | ${names[0]}: folk by draw (last gate) | spread | ${names[1]}: folk by draw (last gate) | spread |` : '| run | folk by draw (last gate) | spread |');
  out.push(B ? '|---|---|---|---|---|' : '|---|---|---|');
  for (const [people, seeds] of A) for (const [seed, rs] of seeds) {
    const other = B?.get(people)?.get(seed);
    out.push(B ? `| ${people} ${seed} | ${draws(rs)} | ${spread(rs)} | ${draws(other)} | ${spread(other)} |` : `| ${people} ${seed} | ${draws(rs)} | ${spread(rs)} |`);
  }
  out.push('');
  if (!B) {
    out.push('| people | runs | mean folk | σ within seeds | smallest change two such tables could see (2·SE) |', '|---|---|---|---|---|');
    for (const [people, seeds] of A) {
      const c = compare(people, seeds, seeds); // the table against a copy of itself: Δ = 0, and the floor two such tables would have
      out.push(`| ${people} | ${[...seeds.values()].flat().length} | ${n0(c.meanA)} | ${n0(c.sigma)} | ${n0(c.floor)} (${pct(c.floor, c.meanA)}) |`);
    }
  } else {
    const cs = [...A.keys()].filter((p) => B.has(p)).map((p) => compare(p, A.get(p)!, B.get(p)!));
    out.push(`| people | ${names[0]} mean | ${names[1]} mean | Δ (paired by seed) | ± 2·SE | verdict |`, '|---|---|---|---|---|---|');
    for (const c of [...cs, overall(cs)]) out.push(`| ${c.people} | ${n0(c.meanA)} | ${n0(c.meanB)} | ${sgn(c.delta)} (${pct(c.delta, c.meanB)}) | ${n0(c.floor)} | ${c.seen ? '**seen**' : 'within the noise'} |`);
  }
  out.push('');
  // the trade: how many runs stand a depot, its median day, and what the road and the caravan paid (iteration 63)
  out.push('| side | people | runs with a depot | median depot day | road crowns (mean) | caravan crowns (mean) |', '|---|---|---|---|---|---|');
  for (const [label, M] of B ? ([[names[0], A], [names[1], B]] as const) : ([['', A]] as const)) for (const [people, seeds] of M) {
    const rs = [...seeds.values()].flat();
    const withDepot = rs.filter((r) => r.depotDay >= 0 || (r.caravanCrowns ?? 0) > 0);
    out.push(`| ${label || 'this tree'} | ${people} | ${withDepot.length}/${rs.length} | ${n0(median(rs.filter((r) => r.depotDay >= 0).map((r) => r.depotDay)))} | ${n0(mean(rs.map((r) => r.roadCrowns ?? 0)))} | ${rs.some((r) => r.caravanCrowns !== undefined) ? n0(mean(rs.map((r) => r.caravanCrowns ?? 0))) : '–'} |`);
  }
  out.push('');
  for (const [label, M] of B ? ([[names[0], A], [names[1], B]] as const) : ([['', A]] as const)) {
    if (label) out.push(`Gates, ${label}:`, '');
    out.push('| people | gate | runs reaching it | median day |', '|---|---|---|---|');
    for (const [people, seeds] of M) for (const g of gateCounts([...seeds.values()].flat())) out.push(`| ${people} | ${g.name} | ${g.reached}/${g.of} | ${n0(g.medianDay)} |`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

// ---------- the wide bar (iteration 64): rounds that spend runs where the noise is ----------

/** The floor (2·SE) as a share of the people's mean folk (both sides' means averaged). */
export function floorShare(c: Comparison): number {
  const m = (c.meanA + c.meanB) / 2;
  return m > 0 ? c.floor / m : Infinity;
}

/** The comparison a people's bar is judged by: against the other side, or with one side the table against a copy of itself
 *  (the floor two such tables would have). */
export function barComparison(people: string, a: Map<number, Run[]>, b?: Map<number, Run[]>): Comparison {
  return compare(people, a, b ?? a);
}

/** Draws a people has: the fewest any of its seeds has on side A. */
export function drawsOf(seeds: Map<number, Run[]>): number {
  return Math.min(...[...seeds.values()].map((rs) => rs.length));
}

/** The peoples that get one more draw a seed this round: over the target, and under the cap. */
export function needMore(a: Run[], b: Run[] | undefined, target: number, maxDraws: number): string[] {
  const A = bySeed(a);
  const B = b ? bySeed(b) : undefined;
  const out: string[] = [];
  for (const [people, seeds] of A) {
    if (drawsOf(seeds) >= maxDraws) continue;
    if (floorShare(barComparison(people, seeds, B?.get(people))) > target) out.push(people);
  }
  return out;
}

/** What a balance run reads (iteration 71): the sim, its data and the core (rng, noise). A run of the same files gives the same
 *  numbers whatever the commit, so the cache is keyed by them, not by the commit a docs change would move. */
export const SIM_DIRS = ['src/sim', 'src/data', 'src/core'];

/** The sim key: a hash of every file a run reads (its path and git blob hash) and the node major version. The order of the
 *  listing does not matter. */
export function simKeyOf(files: { path: string; blob: string }[], node: string): string {
  const lines = files.map((f) => `${f.path} ${f.blob}`).sort();
  return createHash('sha1').update(`node ${node.replace(/^v/, '').split('.')[0]}\n`).update(lines.join('\n')).digest('hex');
}

/** `git ls-tree -r` output (`mode blob <hash>\t<path>`) as the sim key's listing. */
export function parseLsTree(text: string): { path: string; blob: string }[] {
  return text.split('\n').filter(Boolean).map((l) => { const [meta, path] = l.split('\t'); return { path, blob: meta.split(' ')[2] }; });
}

/** The cache's key for a run: the file of its sim version and runner (balance.ts and rolls.ts), and the run within it. */
export function cacheKey(k: { sim: string; runner: string; people: string; seed: number; rolls: number; days: number; scenario?: string }): { file: string; run: string } {
  return { file: `${k.sim.slice(0, 12)}-${k.runner.slice(0, 12)}.json`, run: `${k.people}-${k.seed}-r${k.rolls}-d${k.days}${k.scenario && k.scenario !== 'valley' ? `-${k.scenario}` : ''}` }; // a charter's runs are keyed apart from the valley's
}

/** One committed cache file: every finished run of one sim version and runner. */
export interface CacheFile { created: string; runs: Record<string, Run> }

/** The cache files to delete: all but the `keep` newest, never one in use now. */
export function pruneList(files: { name: string; created: string }[], inUse: string[], keep = 4): string[] {
  const sorted = [...files].sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : a.name.localeCompare(b.name)));
  return sorted.slice(keep).map((f) => f.name).filter((n) => !inUse.includes(n));
}

/** The bar's report: per people, the draws used, the floor reached against the target, met or at the cap (never rounded up). */
export function renderBar(a: Run[], b: Run[] | undefined, target: number, maxDraws: number): string {
  const A = bySeed(a);
  const B = b ? bySeed(b) : undefined;
  const out = ['| people | seeds × draws | floor (2·SE) | share of the mean | target | bar |', '|---|---|---|---|---|---|'];
  for (const [people, seeds] of A) {
    const c = barComparison(people, seeds, B?.get(people));
    const share = floorShare(c);
    const d = drawsOf(seeds);
    const status = share <= target ? 'met' : d >= maxDraws ? `**not met: at the cap of ${maxDraws} draws**` : '**not met**';
    out.push(`| ${people} | ${seeds.size} × ${d} | ${n0(c.floor)} | ${(share * 100).toFixed(1)} % | ${(target * 100).toFixed(0)} % | ${status} |`);
  }
  return out.join('\n');
}
