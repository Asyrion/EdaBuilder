/* The pipelines registry (iteration 89, DESIGN 4.120): tools/devboard/pipelines.json lists the asset pipelines; a 'board'
   one runs its steps here, a 'handoff' one writes a task for Claude. The paintings importer (scripts/importSprites.mjs)
   runs from the board: a painting is saved into eda-lore's inspirations/ (scripts/lib/lore.mjs: EDA_LORE or ../eda-lore), its islands are listed, its art/sources.json entry is
   edited as the 'artsources' kind (content.ts, lossless and undoable), and `npm run art -- --check` runs in a child
   process, one at a time, its log kept for the page. */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { loreRoot } from '../../scripts/lib/lore.mjs';

export interface Pipeline { id: string; name: string; runs: 'board' | 'handoff'; doc: string | null; for: string; steps?: string[]; tests?: string[]; task?: string }
export const pipelines = (root: string): Pipeline[] =>
  (JSON.parse(readFileSync(join(root, 'tools/devboard/pipelines.json'), 'utf8')) as { pipelines: Pipeline[] }).pipelines;

export class Busy extends Error {}
const PAINTINGS = 'inspirations';
export const MAX_UPLOAD = 12 * 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A path inside eda-lore's inspirations/ (refused otherwise). */
export function paintingPath(root: string, src: string): string {
  const lore = loreRoot(root), base = resolve(lore, PAINTINGS), p = resolve(lore, src);
  if (!p.startsWith(base + sep) || !/\.png$/i.test(p)) throw new Error(`refused painting path ${src}`);
  return p;
}

/** Save a dropped painting into eda-lore's inspirations/<folder>/ (committed there, not here), never over another; returns its repo path. */
export function savePainting(root: string, folder: string, name: string, base64: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(folder)) throw new Error('A folder is lower case letters, digits, _ or -.');
  const data = Buffer.from(base64, 'base64');
  if (data.length > MAX_UPLOAD) throw new Error(`The painting is over ${MAX_UPLOAD / 1024 / 1024} MB.`);
  if (!data.subarray(0, 8).equals(PNG)) throw new Error('Only PNG paintings (the importer reads PNG).');
  const stem = name.replace(/\.png$/i, '').toLowerCase().replace(/[^a-z0-9_()-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'painting';
  const lore = loreRoot(root);
  mkdirSync(join(lore, PAINTINGS, folder), { recursive: true });
  let rel = `${PAINTINGS}/${folder}/${stem}.png`;
  for (let n = 2; existsSync(join(lore, rel)); n++) rel = `${PAINTINGS}/${folder}/${stem}_${n}.png`;
  writeFileSync(paintingPath(root, rel), data);
  return rel;
}

/** The sheet's islands, row-major (the importer's --islands): what an entry's `island` picks. */
export function islands(root: string, src: string, white = 235) {
  if (!existsSync(paintingPath(root, src))) throw new Error(`no painting ${src}`);
  const out = execFileSync(process.execPath, ['scripts/importSprites.mjs', '--islands', src, String(Math.round(white))], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
  return out.split('\n').map((l) => /^\s*(\d+)\s+x (\d+) y (\d+) w (\d+) h (\d+) px (\d+)/.exec(l)).filter(Boolean)
    .map((m) => ({ i: +m![1], x: +m![2], y: +m![3], w: +m![4], h: +m![5], px: +m![6] }));
}

/** The paintings already in eda-lore's inspirations/, by folder (the importer's sources). */
export function paintings(root: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  try {
    const lore = loreRoot(root);
    const list = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', PAINTINGS], { cwd: lore, encoding: 'utf8' });
    for (const f of list.split('\n').filter((f) => /\.png$/i.test(f) && existsSync(join(lore, f)))) {
      const folder = f.split('/').slice(1, -1).join('/') || '.';
      (out[folder] ??= []).push(f);
    }
  } catch { /* no git: none listed */ }
  return out;
}

// ---------------- the import run ----------------

export interface Run { id: number; what: string; state: 'running' | 'done' | 'failed'; log: string[]; started: number; ended?: number; code?: number | null }
let current: Run | null = null, nextRun = 1;
const lastOf = new Map<string, Run>();

/** A pipeline script in a child process, its log kept for the page. One at a time across the importer and the Aseprite
    steps: both write the art the game loads (public/art, art/sources.json). */
export function runScript(root: string, what: string, args: string[]): Run {
  if (current) throw new Busy(`${current.what} is running already; wait for it to finish.`);
  const run: Run = { id: nextRun++, what, state: 'running', log: [], started: Date.now() };
  current = run; lastOf.set(what.split(' ')[0], run);
  const child = spawn(process.execPath, args, { cwd: root });
  const take = (d: Buffer) => { for (const l of String(d).split('\n')) if (l.trim()) run.log.push(l); if (run.log.length > 2000) run.log.splice(0, run.log.length - 2000); };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  const end = (code: number | null, err?: string) => {
    if (run.state !== 'running') return;
    if (err) run.log.push(err);
    Object.assign(run, { state: code === 0 ? 'done' : 'failed', code, ended: Date.now() });
    current = null;
  };
  child.on('error', (e) => end(null, e.message));
  child.on('close', (code) => end(code));
  return run;
}

/** `node scripts/importSprites.mjs --check` (what `npm run art -- --check` runs). */
export const runImport = (root: string) => runScript(root, 'import', ['scripts/importSprites.mjs', '--check']);

/** An Aseprite step (scripts/aseprite.ts) for a sprite: trace, export or install (install runs the importer itself). */
export function runAseprite(root: string, sprite: string, step: string, force = false): Run {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(sprite)) throw new Error(`"${sprite}" is not a sprite name`);
  if (!['trace', 'export', 'install'].includes(step)) throw new Error(`no Aseprite step ${step}`);
  return runScript(root, `aseprite ${step} ${sprite}`, ['--import', 'tsx', 'scripts/aseprite.ts', sprite, step, ...(force && step === 'trace' ? ['--force'] : [])]);
}
export const asepriteState = () => lastOf.get('aseprite') ?? null;
export const importState = () => lastOf.get('import') ?? null;

/** The hand-off task of a pipeline not yet written into the docs. */
export function handoffTask(p: Pipeline, sprite: string, what: string, prompt: string): string {
  return [
    'Read CLAUDE.md and docs/HANDOFF.md first.',
    `${p.task ?? `Make the art for ${sprite} with the ${p.name} pipeline.`}`,
    '', `The sprite: ${sprite}${what ? ` (${what})` : ''}.`,
    'The house art rules: DESIGN 4.109 (the citizen yardstick) and 4.90 (the front on the right face); the paintings importer\'s header (scripts/importSprites.mjs) for what it expects.',
    '', 'The prompt (from the dev board, art/prompts/' + sprite + '.json):', prompt || '(none yet: write one with me first)',
    '', 'Plan it on the Plan panel first; show me the art before it goes into the game.',
  ].join('\n');
}
