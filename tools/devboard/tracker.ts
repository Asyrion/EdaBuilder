/* The dev board's project side (iteration 88, DESIGN 4.119): what is planned and done, read from docs/NEXT_STEPS.md and
   docs/DESIGN.md, and the balance bar's runs, read from balance/cache/. Read-only: the board never writes these files. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DIRS, simKeyOf } from '../../scripts/tableStats';

export interface OpenItem { n: number; title: string; text: string; design: string[] }
export interface DoneIteration { n: number; title: string; bullets: string[]; design: string[] }
export interface DesignHeading { id: string; title: string; iteration: number | null; from: number; to: number }

const sections = (text: string) => [...new Set(text.match(/§\s?4\.\d+/g)?.map((s) => s.replace(/\s/g, '')) ?? [])];
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The open list ("Prioritized ideas for the next iteration": `N. **Title** text`) and every "## Done in iteration NN". */
export function nextSteps(text: string): { open: OpenItem[]; done: DoneIteration[] } {
  const open: OpenItem[] = [], done: DoneIteration[] = [];
  const parts = text.split(/^## /m);
  for (const part of parts) {
    const nl = part.indexOf('\n'), head = part.slice(0, nl), body = part.slice(nl + 1);
    const d = /^Done in iteration (\d+)\s*(?:\((.*)\))?/.exec(head);
    if (d) {
      const bullets: string[] = [];
      for (const line of body.split('\n')) {
        if (/^\s*- /.test(line)) bullets.push(line.replace(/^\s*- /, ''));
        else if (bullets.length && /^\s{2,}\S/.test(line)) bullets[bullets.length - 1] += ' ' + line.trim();
      }
      done.push({ n: Number(d[1]), title: d[2] ?? '', bullets: bullets.map(clean), design: sections(body) });
    }
    if (/^Prioritized ideas/.test(head)) {
      const items = body.split(/^(?=\d+\.\s)/m).filter((s) => /^\d+\.\s/.test(s));
      for (const it of items) {
        const m = /^(\d+)\.\s+\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(it.trim());
        if (m) open.push({ n: Number(m[1]), title: m[2].replace(/[.:]$/, ''), text: clean(m[3]), design: sections(it) });
        else { const n = Number(/^(\d+)/.exec(it)![1]); open.push({ n, title: clean(it.replace(/^\d+\.\s*/, '')).slice(0, 80), text: clean(it.replace(/^\d+\.\s*/, '')), design: sections(it) }); }
      }
    }
  }
  done.sort((a, b) => b.n - a.n);
  return { open, done };
}

/** DESIGN's "### 4.NN Title (iteration NN)" sections, with their line ranges. */
export function designIndex(text: string): DesignHeading[] {
  const lines = text.split('\n'), out: DesignHeading[] = [];
  lines.forEach((l, i) => {
    const m = /^### (4\.\d+)\s+(.*)$/.exec(l);
    if (!m) return;
    if (out.length) out[out.length - 1].to = i;
    const it = /\(iteration (\d+)\)\s*$/.exec(m[2]);
    out.push({ id: m[1], title: m[2].replace(/\s*\(iteration \d+\)\s*$/, ''), iteration: it ? Number(it[1]) : null, from: i, to: lines.length });
  });
  // a section ends at the next heading of level 1 to 3 too
  for (const h of out) for (let i = h.from + 1; i < h.to; i++) if (/^#{1,3} /.test(lines[i])) { h.to = i; break; }
  return out;
}

export function designSection(text: string, id: string): string | null {
  const h = designIndex(text).find((x) => x.id === id);
  return h ? text.split('\n').slice(h.from, h.to).join('\n').trim() : null;
}

interface Run { seed: number; people: string; rolls: number; days: number; folk: number; milestone: number; gates?: { name: string; day: number }[]; scenario?: string }

/** The balance bar's cache (DESIGN 4.102): each file's runs by people and seed, newest file first. `current` marks the
    file whose sim key is the working tree's (its runs are this tree's numbers). */
export function balance(root: string) {
  const dir = join(root, 'balance/cache');
  if (!existsSync(dir)) return { files: [] };
  let current = '';
  try { current = treeSimKey(root).slice(0, 12); } catch { /* git missing: no marking */ }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { created?: string | number; runs: Record<string, Run> };
    const peoples: Record<string, { seeds: Record<string, { folk: number; gate: string; day: number | null; draws: number }[]> }> = {};
    for (const r of Object.values(d.runs)) {
      if (r.scenario && r.scenario !== 'valley') continue; // a charter's runs (the Atoll, iteration 95) are not the valley's numbers
      const p = (peoples[r.people] ??= { seeds: {} });
      const last = r.gates?.[r.gates.length - 1];
      (p.seeds[r.seed] ??= []).push({ folk: r.folk, gate: last?.name ?? '', day: last?.day ?? null, draws: r.rolls });
    }
    for (const p of Object.values(peoples)) for (const s of Object.values(p.seeds)) s.sort((a, b) => a.draws - b.draws);
    const stats = Object.fromEntries(Object.entries(peoples).map(([name, p]) => {
      const means = Object.values(p.seeds).map((s) => s.reduce((a, x) => a + x.folk, 0) / s.length);
      const all = Object.values(p.seeds).flat().map((x) => x.folk), mean = all.reduce((a, x) => a + x, 0) / (all.length || 1);
      const sd = means.length > 1 ? Math.sqrt(means.reduce((a, x) => a + (x - mean) ** 2, 0) / (means.length - 1)) : 0;
      return [name, { runs: all.length, seeds: means.length, mean: Math.round(mean), se2: Math.round(2 * sd / Math.sqrt(means.length || 1)) }];
    }));
    return { file: f, sim: f.split('-')[0], current: !!current && f.startsWith(current), created: d.created ?? null, runs: Object.keys(d.runs).length, peoples, stats };
  });
  const valley = files.filter((f) => Object.keys(f.stats).length > 0 || f.runs === 0); // a file of charter runs only holds no valley numbers
  files.length = 0; files.push(...valley);
  files.sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')));
  return { files, treeSim: current };
}

/** The working tree's sim key, as scripts/table.ts computes it for a dirty tree (the files under SIM_DIRS by content). */
function treeSimKey(root: string): string {
  const paths = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...SIM_DIRS], { cwd: root, encoding: 'utf8' }).split('\n').filter((p) => p && existsSync(join(root, p)));
  const blobs = paths.length ? execFileSync('git', ['hash-object', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim().split('\n') : [];
  return simKeyOf(paths.map((path, k) => ({ path, blob: blobs[k] })), process.version);
}
