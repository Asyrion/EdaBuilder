/* The Aseprite pipeline (iteration 91, DESIGN 4.122, docs/ART_PIPELINES.md): a sprite redrawn as clean, editable pixel art.
   Ported from Azyrion Tamer's tools/aseprite/redraw.py (docs 06 §2b), cut down to one image a sprite.

     npx tsx scripts/aseprite.ts <sprite> trace [--force] [--colors 24] [--from <png>]
         the sprite as the game has it (imported, else drawn in code; or --from a PNG) → art/aseprite/<sprite>.aseprite:
         indexed, its colours cut to a palette in Lab, the silhouette's edge in the darkest colour (the ink), stray pixels
         taken by their surroundings. Also <sprite>.trace.png (the same pixels) and an 8× preview. Refuses to overwrite an
         .aseprite without --force: from the first trace on, the .aseprite is the source of truth, edited by hand.
     npx tsx scripts/aseprite.ts <sprite> export
         .aseprite → art/aseprite/export/<sprite>.png and <sprite>_8x.png, the preview shown to the user before install.
     npx tsx scripts/aseprite.ts <sprite> install [--no-art]
         the export becomes the sprite: its art/sources.json entry (pixel: true, taken as drawn) replaces the live one
         (switched off, kept for the record), then `npm run art` (unless --no-art).

   Aseprite runs headless (`-b`) on the user's PC: its path is ASEPRITE, else the Steam install on Windows, else `aseprite`. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { decodePng, encodePng } from './lib/png.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const DIR = 'art/aseprite';
const CHARS = '0123456789abcdefghijklmnopqrstuv'; // a palette index a pixel in the trace data (at most 32 colours)
export const asepritePath = () => process.env.ASEPRITE
  ?? (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Aseprite\\Aseprite.exe' : 'aseprite');

export interface Img { w: number; h: number; data: Uint8ClampedArray }
type RGB = [number, number, number];

// ---------------- colour ----------------

export function lab([r, g, b]: RGB): RGB {
  const f = (c: number) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}
const d2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** At most n colours for the opaque pixels: median cut in Lab, each box's mean colour. */
export function palette(img: Img, n: number): RGB[] {
  const px: { rgb: RGB; lab: RGB }[] = [];
  for (let i = 0; i < img.w * img.h; i++) if (img.data[i * 4 + 3] > 127) {
    const rgb: RGB = [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]];
    px.push({ rgb, lab: lab(rgb) });
  }
  if (!px.length) return [];
  let boxes = [px];
  while (boxes.length < n) {
    let best = -1, axis = 0, spread = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = Infinity, hi = -Infinity;
        for (const p of b) { lo = Math.min(lo, p.lab[a]); hi = Math.max(hi, p.lab[a]); }
        if (hi - lo > spread) { spread = hi - lo; best = i; axis = a; }
      }
    });
    if (best < 0 || spread < 2) break; // every box is one colour already
    const b = boxes[best].sort((p, q) => p.lab[axis] - q.lab[axis]), mid = b.length >> 1;
    boxes = [...boxes.slice(0, best), b.slice(0, mid), b.slice(mid), ...boxes.slice(best + 1)];
  }
  const out = boxes.map((b) => [0, 1, 2].map((a) => Math.round(b.reduce((s, p) => s + p.rgb[a], 0) / b.length)) as RGB);
  return [...new Map(out.map((c) => [c.join(','), c])).values()];
}

/** The trace: every opaque pixel to its nearest palette colour in Lab; the silhouette's edge in the ink (the darkest);
    a lone pixel unlike all four neighbours that agree on one colour takes theirs; a pixel with no opaque neighbour goes.
    Returns the palette with index 0 transparent and index 1 the ink, and one index a pixel. */
export function trace(img: Img, colors = 24): { palette: RGB[]; idx: Uint8Array; w: number; h: number } {
  const pal = palette(img, Math.max(1, Math.min(colors - 1, CHARS.length - 2))); // one place kept for an added ink
  pal.sort((a, b) => lab(a)[0] - lab(b)[0]); // darkest first: the ink
  if (pal.length && lab(pal[0])[0] > 20) pal.unshift(pal[0].map((c) => Math.round(c * 0.3)) as RGB); // no outline yet: the ink is the darkest colour, darkened
  const labs = pal.map(lab), { w, h, data } = img;
  const idx = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 127) {
    const l = lab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    let k = 0; // the nearest colour (an added ink is darker than any of the sprite's, so only its outline takes it)
    labs.forEach((c, j) => { if (d2(c, l) < d2(labs[k], l)) k = j; });
    idx[i] = k + 1;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : idx[y * w + x]);
  const next = idx.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = idx[y * w + x];
    if (!v) continue;
    const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    if (n.every((c) => c === 0)) { next[y * w + x] = 0; continue; } // a speck
    if (n.some((c) => c === 0)) { next[y * w + x] = 1; continue; } // the silhouette's edge: ink
    if (v !== 1 && n.every((c) => c === n[0]) && n[0] !== v) next[y * w + x] = n[0]; // a stray pixel (never an ink line)
  }
  return { palette: [[0, 0, 0], ...pal], idx: next, w, h };
}

export function render(t: { palette: RGB[]; idx: Uint8Array; w: number; h: number }): Img {
  const data = new Uint8ClampedArray(t.w * t.h * 4);
  t.idx.forEach((v, i) => { if (v) { data.set(t.palette[v], i * 4); data[i * 4 + 3] = 255; } });
  return { w: t.w, h: t.h, data };
}

/** The trace as the Lua table build_sprite.lua reads. */
export function luaData(name: string, t: { palette: RGB[]; idx: Uint8Array; w: number; h: number }): string {
  const rows = [];
  for (let y = 0; y < t.h; y++) rows.push(JSON.stringify(Array.from(t.idx.subarray(y * t.w, (y + 1) * t.w), (v) => CHARS[v]).join('')));
  return `return {\n  name = ${JSON.stringify(name)}, w = ${t.w}, h = ${t.h},\n  palette = { ${t.palette.map((c) => `{${c.join(', ')}}`).join(', ')} },\n  rows = {\n    ${rows.join(',\n    ')}\n  },\n}\n`;
}

/** Nearest-neighbour ×k on the board's slate grey, the review preview. */
export function preview(img: Img, k = 8): Img {
  const w = img.w * k + 16, h = img.h * k + 16, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([104, 120, 140, 255], i * 4);
  for (let y = 0; y < img.h * k; y++) for (let x = 0; x < img.w * k; x++) {
    const s = ((y / k | 0) * img.w + (x / k | 0)) * 4;
    if (img.data[s + 3] > 127) data.set([img.data[s], img.data[s + 1], img.data[s + 2], 255], ((y + 8) * w + x + 8) * 4);
  }
  return { w, h, data };
}

// ---------------- the steps ----------------

function aseprite(...args: string[]) {
  const r = spawnSync(asepritePath(), ['-b', ...args], { cwd: ROOT, encoding: 'utf8' });
  if (r.error) throw new Error(`Aseprite did not start (${asepritePath()}): ${r.error.message}. Set ASEPRITE to its path.`);
  if (r.status !== 0) throw new Error(`Aseprite failed: ${args.join(' ')}\n${r.stdout}${r.stderr}`);
  if (r.stdout.trim()) console.log(r.stdout.trim());
}

/** The sprite as the game has it: the imported PNG (public/art/sprites.json), else the one drawn in code. */
async function source(name: string): Promise<Img> {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/art/sprites.json'), 'utf8')) as { sprites: Record<string, { file: string }> };
  const file = manifest.sprites[name]?.file;
  if (file && existsSync(join(ROOT, 'public/art', file))) return decodePng(readFileSync(join(ROOT, 'public/art', file)));
  const { generateSprites } = await import('../src/render/sprites');
  const d = generateSprites().find((s) => s.name === name);
  if (!d) throw new Error(`no sprite ${name}: neither imported nor drawn in code (use --from <png>)`);
  return { w: d.p.w, h: d.p.h, data: new Uint8ClampedArray(d.p.data) };
}

const paths = (name: string) => ({
  ase: join(DIR, `${name}.aseprite`), data: join(DIR, `${name}.trace.lua`), png: join(DIR, `${name}.trace.png`),
  preview: join(DIR, `${name}.trace_8x.png`), out: join(DIR, 'export', `${name}.png`), out8: join(DIR, 'export', `${name}_8x.png`),
});
const write = (rel: string, bytes: Uint8Array | string) => { mkdirSync(dirname(join(ROOT, rel)), { recursive: true }); writeFileSync(join(ROOT, rel), bytes); };

export async function traceStep(name: string, o: { force?: boolean; colors?: number; from?: string } = {}) {
  const p = paths(name);
  if (existsSync(join(ROOT, p.ase)) && !o.force) throw new Error(`${p.ase} exists: it is the source of truth now (edit it in Aseprite, then export). --force traces it again.`);
  const img = o.from ? decodePng(readFileSync(resolve(ROOT, o.from))) : await source(name);
  const t = trace(img, o.colors ?? 24);
  const out = render(t);
  write(p.data, luaData(name, t));
  write(p.png, encodePng(out));
  write(p.preview, encodePng(preview(out)));
  aseprite('--script-param', `data=${p.data}`, '--script-param', `out=${p.ase}`, '--script', 'scripts/aseprite/build_sprite.lua');
  console.log(`traced ${name}: ${t.w}×${t.h}, ${t.palette.length - 1} colours → ${p.ase} (preview ${p.preview})`);
  return { ...p, colours: t.palette.length - 1, w: t.w, h: t.h };
}

export function exportStep(name: string) {
  const p = paths(name);
  if (!existsSync(join(ROOT, p.ase))) throw new Error(`no ${p.ase}: trace it first`);
  mkdirSync(join(ROOT, DIR, 'export'), { recursive: true });
  aseprite(p.ase, '--save-as', p.out);
  const img = decodePng(readFileSync(join(ROOT, p.out)));
  write(p.out8, encodePng(preview(img)));
  console.log(`exported ${name}: ${img.w}×${img.h} → ${p.out}; review ${p.out8} before install`);
  return { ...p, w: img.w, h: img.h };
}

interface SrcEntry { name: string; src: string; kind?: string; w?: number; h?: number; anchor?: unknown; shift?: unknown; flip?: boolean; off?: boolean; pixel?: boolean; checked?: boolean; [k: string]: unknown }

/** The entry that installs the export: the live one's kind, footprint and anchor, pixel: true, the old one switched off. */
export function installEntries(list: SrcEntry[], name: string, fallback: { w: number; h: number }): { list: SrcEntry[]; entry: SrcEntry } {
  const live = list.filter((e) => e.name === name && !e.off).pop();
  const entry: SrcEntry = { name, src: `${DIR}/export/${name}.png`, pixel: true };
  if (live?.kind) entry.kind = live.kind;
  if (!live?.kind || live.kind === 'building') { entry.w = live?.w ?? fallback.w; entry.h = live?.h ?? fallback.h; entry.anchor = live?.anchor ?? 'centre'; if (live?.shift) entry.shift = live.shift; }
  entry.checked = true; // judged at its 8× preview before install (the review rule)
  const out = list.filter((e) => !(e.name === name && e.pixel && e.src === entry.src)).map((e) => (e === live ? { ...e, off: true } : e));
  return { list: [...out, entry], entry };
}

export function installStep(name: string, o: { art?: boolean } = {}) {
  const p = paths(name);
  if (!existsSync(join(ROOT, p.out))) throw new Error(`no ${p.out}: export it first, and show the 8× preview before install`);
  const file = join(ROOT, 'art/sources.json'), text = readFileSync(file, 'utf8'), json = JSON.parse(text);
  const key = /^b_(.+?)(?:_[vs]\d+)?$/.exec(name)?.[1];
  const b = key ? (JSON.parse(readFileSync(join(ROOT, 'src/data/content/buildings.json'), 'utf8')) as { key: string; w: number; h: number }[]).find((x) => x.key === key) : undefined;
  const { list, entry } = installEntries(json.sprites, name, { w: b?.w ?? 1, h: b?.h ?? 1 });
  json.sprites = list;
  const after = JSON.stringify(json, null, 1) + (text.endsWith('\n') ? '\n' : '');
  writeFileSync(file, after);
  console.log(`installed ${name}: art/sources.json ${JSON.stringify(entry)}`);
  if (o.art !== false) execFileSync(process.execPath, ['scripts/importSprites.mjs'], { cwd: ROOT, stdio: 'inherit' });
  return entry;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [name, step] = process.argv.slice(2), arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  if (!name || !['trace', 'export', 'install'].includes(step ?? '')) { console.log('usage: npx tsx scripts/aseprite.ts <sprite> trace|export|install (see the header)'); process.exit(1); }
  const run = async () => {
    if (step === 'trace') await traceStep(name, { force: process.argv.includes('--force'), colors: arg('--colors') ? Number(arg('--colors')) : undefined, from: arg('--from') });
    if (step === 'export') exportStep(name);
    if (step === 'install') installStep(name, { art: !process.argv.includes('--no-art') });
  };
  run().catch((e) => { console.error((e as Error).message); process.exit(1); });
}
