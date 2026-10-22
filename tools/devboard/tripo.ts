/* The Tripo Studio pipeline's Route 2 on the board (iteration 91, DESIGN 4.122, docs/ART_PIPELINES.md): Claude's route in
   Azyrion Tamer (docs 04 §11), run from a sprite's Art panel on the user's PC. The Tripo CLI (`npm install -g @tripo3d/cli`)
   spends the user's Studio credits; the user logs in once in their own terminal (`tripo auth login`, about 2 h), the board
   only asks `tripo auth whoami`. A round is four Nano Banana 2 images:
     tripo image "<prompt>" -m gemini_3.1_flash_image_preview -n 4 --scale 1:1
   CLI 0.8.1 may end with "no image URLs in result" or return while the task still runs, so the task id is read from its
   "Task created" line and `tripo image get <id> --output-format json` is polled until `status` is success; its `urls`
   (signed, valid a few hours) are downloaded into art/tripo/<sprite>/round<n>/ (git-ignored: only the image used is ever
   committed, as a painting in eda-lore's inspirations/tripo/). One round at a time. */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { SPRITE_RE } from './prompts';

export class Busy extends Error {}
export const TRIPO_MODEL = 'gemini_3.1_flash_image_preview';
const pollMs = () => Number(process.env.DEVBOARD_TRIPO_POLL_MS ?? 5000); // (the self-test polls faster)
export const ROUND_TIMEOUT = 10 * 60e3;
/** How to start the CLI without a shell (the prompt never passes through one): TRIPO if set; on Windows, npm's shim is a
    .cmd that needs a shell, so the package's own JS entry is run with Node; elsewhere `tripo` on PATH. */
let cmd: [string, string[]] | null = null;
export function tripoCommand(): [string, string[]] {
  if (process.env.TRIPO) return [process.env.TRIPO, []];
  if (cmd) return cmd;
  cmd = ['tripo', []];
  if (process.platform === 'win32') {
    try {
      const root = execFileSync('npm.cmd', ['root', '-g'], { encoding: 'utf8', shell: true }).trim();
      const pkgDir = join(root, '@tripo3d', 'cli'), pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { bin?: string | Record<string, string> };
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tripo ?? Object.values(pkg.bin ?? {})[0];
      if (bin) cmd = [process.execPath, [join(pkgDir, bin)]];
    } catch { /* not installed: the start fails and says how to install it */ }
  }
  return cmd;
}

/** The task id from the CLI's output ("Task created: <id>", in any of its spellings). */
export function taskIdOf(out: string): string | null {
  const m = /task created[^A-Za-z0-9]*(?:id[^A-Za-z0-9]*)?([A-Za-z0-9][A-Za-z0-9-]{7,})/i.exec(out) ?? /"task_id"\s*:\s*"([^"]+)"/.exec(out);
  return m ? m[1] : null;
}

/** `tripo image get --output-format json`: its status and urls, wherever the CLI nests them. */
export function resultOf(json: string): { status: string; urls: string[] } {
  const d = JSON.parse(json) as Record<string, unknown>;
  const pick = (o: unknown): Record<string, unknown> => (o && typeof o === 'object' ? o as Record<string, unknown> : {});
  const body = pick(d.data ?? d.result ?? d);
  const status = String(body.status ?? d.status ?? 'unknown').toLowerCase();
  const raw = body.urls ?? body.images ?? d.urls ?? [];
  const urls = (Array.isArray(raw) ? raw : []).map((u) => (typeof u === 'string' ? u : String(pick(u).url ?? ''))).filter((u) => /^https?:\/\//.test(u));
  return { status, urls };
}

const run = (args: string[], timeout = 60e3) => new Promise<{ code: number | null; out: string }>((ok) => {
  const [exe, pre] = tripoCommand();
  execFile(exe, [...pre, ...args], { timeout, maxBuffer: 8e6 }, (err, stdout, stderr) => {
    const code = err ? ((err as NodeJS.ErrnoException).code === 'ENOENT' ? -1 : (err as { code?: number }).code ?? 1) : 0;
    ok({ code: typeof code === 'number' ? code : 1, out: `${stdout ?? ''}${stderr ?? ''}` });
  });
});

/** Logged in? `tripo auth whoami` (the CLI missing says how to install it). */
export async function whoami(): Promise<{ ok: boolean; text: string; installed: boolean }> {
  const r = await run(['auth', 'whoami'], 20e3);
  if (r.code === -1) return { ok: false, installed: false, text: 'The Tripo CLI is not installed: npm install -g @tripo3d/cli, then tripo auth login in your own terminal.' };
  const text = r.out.trim().split('\n').slice(-2).join(' ');
  return { ok: r.code === 0 && !/not logged|login required|unauthori[sz]ed|expired/i.test(text), installed: true, text: text || (r.code === 0 ? 'logged in' : 'not logged in') };
}

export interface Round { id: number; sprite: string; round: number; state: 'running' | 'done' | 'failed'; task?: string; log: string[]; files: string[]; started: number; error?: string }
let current: Round | null = null;
const rounds = new Map<string, Round>(); // the last round per sprite, for the page
let nextId = 1;

export const roundDir = (root: string, sprite: string, n: number) => join(root, 'art/tripo', sprite, `round${n}`);
/** The rounds kept for a sprite, newest first, with their files (as the page's /tripo/ links name them). */
export function roundsOf(root: string, sprite: string) {
  if (!SPRITE_RE.test(sprite)) throw new Error(`"${sprite}" is not a sprite name`);
  const dir = join(root, 'art/tripo', sprite);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^round\d+$/.test(d)).map((d) => Number(d.slice(5))).sort((a, b) => b - a)
    .map((n) => ({ round: n, files: readdirSync(roundDir(root, sprite, n)).filter((f) => /\.(png|webp|jpe?g)$/i.test(f)).sort().map((f) => `${sprite}/round${n}/${f}`) }));
}
/** A round's file, inside art/tripo/ (refused otherwise). */
export function roundFile(root: string, rel: string): string {
  const base = resolve(root, 'art/tripo'), p = resolve(base, rel);
  if (!p.startsWith(base + sep) || !/\.(png|webp|jpe?g)$/i.test(p)) throw new Error(`refused ${rel}`);
  return p;
}

const extOf = (url: string, type: string | null) => (/webp/.test(type ?? '') || /\.webp(\?|$)/i.test(url) ? 'webp' : /jpe?g/.test(type ?? '') || /\.jpe?g(\?|$)/i.test(url) ? 'jpg' : 'png');

/** A round of four for the sprite's prompt, in the background; the page polls `roundState`. */
export function generate(root: string, sprite: string, prompt: string): Round {
  if (!SPRITE_RE.test(sprite)) throw new Error(`"${sprite}" is not a sprite name`);
  if (!prompt.trim()) throw new Error('No prompt: write or refine one first.');
  if (prompt.length > 1000) throw new Error(`The prompt is ${prompt.length} characters; Tripo's image prompt takes 1000 at most.`);
  if (current) throw new Busy('A Tripo round is running already; wait for it.');
  const n = (roundsOf(root, sprite)[0]?.round ?? 0) + 1;
  const r: Round = { id: nextId++, sprite, round: n, state: 'running', log: [], files: [], started: Date.now() };
  current = r; rounds.set(sprite, r);
  const say = (l: string) => { r.log.push(l); if (r.log.length > 200) r.log.shift(); };
  const end = (state: Round['state'], error?: string) => { if (r.state !== 'running') return; Object.assign(r, { state, error }); if (error) say(error); current = null; };
  const [exe, pre] = tripoCommand();
  const child = spawn(exe, [...pre, 'image', prompt, '-m', TRIPO_MODEL, '-n', '4', '--scale', '1:1'], { shell: false });
  let out = '';
  child.stdout.on('data', (d) => { out += d; String(d).split('\n').filter((l) => l.trim()).forEach(say); });
  child.stderr.on('data', (d) => { out += d; String(d).split('\n').filter((l) => l.trim()).forEach(say); });
  child.on('error', (e) => end('failed', (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'The Tripo CLI is not installed: npm install -g @tripo3d/cli' : e.message));
  child.on('close', () => {
    if (r.state !== 'running') return;
    const task = taskIdOf(out);
    if (!task) return end('failed', /login|auth/i.test(out) ? 'Not logged in: run tripo auth login in your own terminal, then try again.' : 'No task id in the CLI\'s output.');
    r.task = task;
    say(`polling task ${task}`);
    const t0 = Date.now();
    const poll = async () => {
      if (r.state !== 'running') return;
      const g = await run(['image', 'get', task, '--output-format', 'json']);
      let res: { status: string; urls: string[] } | null = null;
      try { res = resultOf(g.out.slice(g.out.indexOf('{'))); } catch { /* not JSON yet */ }
      if (res && /fail|cancel|ban/.test(res.status)) return end('failed', `Tripo says ${res.status}`);
      if (res && res.status === 'success' && res.urls.length) {
        const dir = roundDir(root, sprite, n);
        mkdirSync(dir, { recursive: true });
        for (const [i, url] of res.urls.slice(0, 4).entries()) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) { say(`image ${i + 1}: HTTP ${resp.status}`); continue; }
            const name = `A_r${n}_${i + 1}.${extOf(url, resp.headers.get('content-type'))}`;
            writeFileSync(join(dir, name), Buffer.from(await resp.arrayBuffer()));
            r.files.push(`${sprite}/round${n}/${name}`);
          } catch (e) { say(`image ${i + 1}: ${(e as Error).message}`); }
        }
        return r.files.length ? end('done') : end('failed', 'None of the images downloaded.');
      }
      if (Date.now() - t0 > ROUND_TIMEOUT) return end('failed', `No result in ${ROUND_TIMEOUT / 60e3} minutes.`);
      setTimeout(poll, pollMs());
    };
    void poll();
  });
  return r;
}
export const roundState = (sprite: string) => rounds.get(sprite) ?? null;
