/* The prompt studio (iteration 89, DESIGN 4.120): an image prompt for every building and sprite, kept with the art in
   art/prompts/<sprite>.json. The draft is composed from the house art rules (the citizen yardstick of DESIGN 4.109, the
   facing rule of 4.90, the look of the eda-lore sheets that the importer expects); "Refine with Claude" runs `claude -p`
   on this PC with the draft, the brief and the lore that names the building, in the background, and the page polls for
   the answer. Without the CLI the same task goes through Send to Claude (session.ts). */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTIONS } from '../../src/data/factions';
import { findClaude } from './session';

/** Tripo's Image tab takes a prompt of at most 1000 characters. */
export const TRIPO_MAX = 1000;
export const SPRITE_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
export const promptFile = (sprite: string) => {
  if (!SPRITE_RE.test(sprite)) throw new Error(`"${sprite}" is not a sprite name`);
  return `art/prompts/${sprite}.json`;
};

export interface PromptData {
  sprite: string; building?: string; brief: string; draft: string; refined: string; note: string; pipeline: string;
  history: { at: string; refined: string; note: string }[];
}
interface Building { key: string; name: string; category: string; faction?: string[]; desc: string; flavor?: string; w: number; h: number }

export const blank = (sprite: string, building?: string): PromptData =>
  ({ sprite, building, brief: '', draft: '', refined: '', note: '', pipeline: 'paintings', history: [] });

/** How tall it may stand, in citizens of 12 px (DESIGN 4.109's yardstick). */
export function yardstick(b: Building): { citizens: string; px: number | null; why: string } {
  if (['well', 'tidewell', 'seep'].includes(b.key)) return { citizens: '1.5', px: 18, why: 'an object a person reaches over' };
  if (['wardlantern', 'shrine', 'candleshrine', 'stoneward'].includes(b.key)) return { citizens: '2.5', px: 30, why: 'a post or small shrine' };
  if (['wonder', 'marvel'].includes(b.category) || b.w >= 3) return { citizens: 'free', px: null, why: 'a wonder or great work, meant to rise over the roofs' };
  if (b.w * b.h === 1) return b.faction?.includes('tallowkin')
    ? { citizens: '3.2', px: 38, why: 'a Tallowkin shed or cottage' } : { citizens: '2.8', px: 33, why: 'a one-tile shed, works or cottage' };
  return { citizens: '5.5', px: 66, why: 'a two-by-two hall' };
}

/** The house art rules, as lines a prompt and a reviewer can both read. */
export function houseRules(b?: Building): string[] {
  const y = b ? yardstick(b) : null;
  return [
    // positive phrasing only (a negation invites what it names; Tripo's exclusions go in its negative-prompt field), and
    // short: the whole draft fits Tripo's 1000 characters (docs/ART_PIPELINES.md, the prompt rules)
    'One subject, whole and alone, on a plain flat white background.',
    'Isometric 2:1 view from above, about 30 degrees down.',
    'Its front (door, sign, open side) on the right-hand face.',
    b ? `Footprint: ${b.w} by ${b.h} tiles; ${y!.citizens === 'free' ? 'it may tower over the houses' : `about ${y!.citizens} people tall`} (${y!.why}).` : 'As tall as it would stand beside a person.',
    'Crisp modern pixel art like the Eda lore sheets: a dark outline, muted earthy colours, warm lantern light, blue ley-light accents.',
  ];
}

const PEOPLE_LOOK: Record<string, string> = {
  vellish: 'Vellish: timber and plaster under slate, iron lanterns, the Ashen Crown\'s charter seals.',
  grimmen: 'Grimmen: ash-grey stone cut into the hill, heavy lintels, standing stones, turf and slab roofs.',
  veshari: 'Veshari: river folk of the Sable, reed and tarred timber, stilts and moorings, blue-dyed cloth, water-mage sigils.',
  tallowkin: 'Tallowkin: small candle-lit timber buildings, wax and tallow, many lamps and wicks, soot-dark beams.',
  fennex: 'Fen-Nex: fox-folk traders of the fen, plank and russet brick on stilts over the marsh, reed thatch, striped awnings, banners and signs in two scripts.',
};

export function peopleOf(b: Building): string[] {
  return b.faction?.length ? b.faction : ['vellish', 'grimmen', 'veshari', 'tallowkin', 'fennex'];
}

/** Paragraphs of the lore docs that name the building (its name, or the name without "The"). */
export function loreFor(root: string, name: string): string[] {
  const needle = name.replace(/^the /i, '').toLowerCase();
  if (needle.length < 4) return [];
  const out: string[] = [];
  for (const f of ['docs/EDA_CITY_LORE.md', 'docs/EDA_LORE.md']) {
    if (!existsSync(join(root, f))) continue;
    for (const p of readFileSync(join(root, f), 'utf8').split(/\n\s*\n/)) {
      if (p.toLowerCase().includes(needle)) out.push(`${f}: ${p.replace(/\s+/g, ' ').trim().slice(0, 700)}`);
      if (out.length >= 3) return out;
    }
  }
  return out;
}

/** The draft prompt for an image model, from the building's data, the brief and the house rules. */
export function draftFor(b: Building | null, sprite: string, brief: string): string {
  const what = brief.trim() || (b ? [b.flavor, b.desc.split(/(?<=\.)\s/)[0]].filter(Boolean).join(' ') : sprite);
  const head = b ? `Isometric pixel-art game sprite of ${b.name}, a building of a dark-fantasy city-builder in the world of Eda. ${what}`
    : `Isometric pixel-art game sprite for "${sprite}" in a dark-fantasy city-builder in the world of Eda. ${what}`;
  const people = b ? peopleOf(b) : [];
  const look = people.length === 1 ? [`Built by the ${PEOPLE_LOOK[people[0]]}`] : [];
  const rest = [...look, ...houseRules(b ?? undefined)].join('\n');
  const room = TRIPO_MAX - rest.length - 1; // the brief gives way first: the rules always fit
  return `${head.length > room ? head.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '') + '…' : head}\n${rest}`;
}

/** The task for Claude: improve the draft into one prompt, with a short note on what changed. */
export function refineTask(root: string, b: Building | null, sprite: string, d: PromptData): string {
  const lore = b ? loreFor(root, b.name) : [];
  const people = b ? peopleOf(b).map((p) => `- ${FACTIONS[p]?.name ?? p}: ${FACTIONS[p]?.lore ?? ''}`) : [];
  return [
    `Refine an image-generation prompt for a game sprite of EdaBuilder (sprite ${sprite}${b ? `, building "${b.key}"` : ''}).`,
    'The image goes through the paintings importer (scripts/importSprites.mjs): it keys out a white background, crops, scales to the yardstick and outlines, so the house rules below must hold.',
    '', 'House rules (keep every one):', ...houseRules(b ?? undefined).map((r) => `- ${r}`),
    ...(b ? ['', `The building: ${b.name} (${b.category}, ${b.w}x${b.h}). ${b.desc}${b.flavor ? ` Flavour: ${b.flavor}` : ''}`] : []),
    ...(people.length ? ['', 'Its people:', ...people] : []),
    ...(lore.length ? ['', 'Lore that names it:', ...lore.map((l) => `- ${l}`)] : []),
    ...(d.brief.trim() ? ['', `The designer's brief: ${d.brief.trim()}`] : []),
    '', 'The draft:', d.refined.trim() || d.draft.trim() || draftFor(b, sprite, d.brief),
    '', 'Answer in exactly this form, nothing before or after:', 'PROMPT:', '<the improved prompt: under 1000 characters in all (Tripo\'s cap), positive phrasing only (a negation invites what it names), the house rules as short sentences>', 'NOTE:', '<one or two sentences: what you changed and why>',
  ].join('\n');
}

export function parseRefined(out: string): { prompt: string; note: string } {
  const m = /PROMPT:\s*([\s\S]*?)\s*(?:NOTE:\s*([\s\S]*))?$/.exec(out.trim());
  return m ? { prompt: m[1].trim(), note: (m[2] ?? '').trim() } : { prompt: out.trim(), note: '' };
}

// ---------------- Refine with Claude: background jobs ----------------

export interface Job { id: number; sprite: string; state: 'running' | 'done' | 'failed'; prompt?: string; note?: string; error?: string; started: number }
const jobs = new Map<number, Job>();
let nextJob = 1;
export const REFINE_TIMEOUT = 120000;

/** `claude -p` with the task on stdin (never in the arguments). Throws NO_CLI without the CLI. */
export function startRefine(root: string, sprite: string, task: string): Job {
  const exe = findClaude();
  if (!exe) throw new Error('NO_CLI');
  const job: Job = { id: nextJob++, sprite, state: 'running', started: Date.now() };
  jobs.set(job.id, job);
  const shim = /\.(cmd|bat)$/i.test(exe);
  const child = spawn(exe, ['-p', '--output-format', 'text'], { cwd: root, shell: shim, windowsHide: true });
  let out = '', err = '';
  const timer = setTimeout(() => { child.kill(); finish('failed', undefined, `no answer in ${REFINE_TIMEOUT / 1000} s`); }, REFINE_TIMEOUT);
  function finish(state: Job['state'], text?: string, error?: string) {
    if (job.state !== 'running') return;
    clearTimeout(timer);
    if (text !== undefined) Object.assign(job, parseRefined(text));
    Object.assign(job, { state, error });
  }
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => finish('failed', undefined, e.message));
  child.on('close', (code) => (code === 0 && out.trim() ? finish('done', out) : finish('failed', undefined, (err || `claude exited with ${code}`).trim().split('\n').slice(-3).join(' '))));
  child.stdin.end(task);
  for (const [id, j] of jobs) if (Date.now() - j.started > 3600e3) jobs.delete(id);
  return job;
}
export const jobOf = (id: number) => jobs.get(id) ?? null;
