// The art import pipeline (iterations 49–50): reference paintings in inspirations/ become game sprites under
// public/art/sprites, listed in public/art/sprites.json, which the atlas merges over its procedural sprites at boot.
//   node scripts/importSprites.mjs           writes the sprites and the manifest
//   node scripts/importSprites.mjs --check   also renders shots/import_check.png (every sprite at 4×)
//   node scripts/importSprites.mjs --islands <src> [white]   lists a sheet's islands, row-major, for picking by index
// Entries (art/sources.json "sprites"): name, src, kind ('building' | 'prop' | 'ground'), w/h (footprint in tiles, buildings),
// island (index into the sheet's islands) or rect [x, y, w, h], inset (fraction cut from each side, ground), targetWidth /
// targetHeight, colors, family (ground variants that share a palette and a mean colour), glow ({ minLum, warm, hue } or false),
// glowSrc, white (background key), anchor ('auto' | 'centre' | { ax, ay }), baseInset (prop: px above the last row),
// recolour ({ hue degrees, sat, light }: glimwood from a birch), sharpen (unsharp amount, default 0.6), outline (false to skip the dark 1 px outline), aliases [names], checked (true once judged by eye).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { decodePng, encodePng } from './lib/png.mjs';
import { autoAnchor, boxScale, centreAnchor, checkSheet, colourCount, crop, cropRect, glowLayer, groundDiamond, islands, keepLargest, keyBackground, meanMatch, outline, pad, propAnchor, quantize, quantizeShared, recolour, sharpen } from './lib/sprite.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const decoded = new Map();
const load = (src) => { if (!decoded.has(src)) decoded.set(src, decodePng(readFileSync(src))); return decoded.get(src); };

if (args[0] === '--islands') {
  const img = keyBackground(load(args[1]), Number(args[2] ?? 235));
  islands(img).forEach((f, i) => console.log(`${String(i).padStart(3)}  x ${f.x} y ${f.y} w ${f.w} h ${f.h} px ${f.n}`));
  process.exit(0);
}

const sources = JSON.parse(readFileSync('art/sources.json', 'utf8'));
mkdirSync('public/art/sprites', { recursive: true });
const manifest = { sprites: {} };
const sheet = [];
const families = new Map(); // family → [{ e, img }] for the shared quantize
const results = [];

for (const e of sources.sprites) {
  const kind = e.kind ?? 'building';
  let img = keyBackground(load(e.src), e.white ?? 235);
  if (e.island !== undefined) { const list = islands(img); const f = list[e.island]; if (!f) throw new Error(`${e.name}: island ${e.island} of ${list.length}`); img = cropRect(img, [f.x, f.y, f.w, f.h]); }
  else if (e.rect) img = cropRect(img, e.rect);
  if (kind !== 'ground') img = crop(e.islands === 'keep' ? img : keepLargest(img)).img;
  if (kind === 'ground') {
    const inset = e.inset ?? 0.12;
    const ix = Math.round(img.w * inset), iy = Math.round(img.h * inset);
    const tex = cropRect(img, [ix, iy, img.w - 2 * ix, img.h - 2 * iy]);
    const tile = groundDiamond(tex);
    results.push({ e, kind, img: tile });
    continue;
  }
  if (kind === 'prop') {
    const th = e.targetHeight ?? 24;
    const small = boxScale(img, Math.max(1, Math.round((img.w * th) / img.h)), th);
    results.push({ e, kind, img: sharpen(e.recolour ? recolour(small, e.recolour) : small, e.sharpen ?? 0.6) });
    continue;
  }
  const targetW = e.targetWidth ?? (e.targetHeight ? Math.max(1, Math.round((img.w * e.targetHeight) / img.h)) : (e.w + e.h) * 16 + 2);
  const scaled = boxScale(img, targetW, e.targetHeight ?? 0);
  results.push({ e, kind, img: sharpen(e.recolour ? recolour(scaled, e.recolour) : scaled, e.sharpen ?? 0.6) });
}

// ground families: one palette and one mean colour per family
for (const r of results) if (r.kind === 'ground') { const f = r.e.family ?? r.e.name; if (!families.has(f)) families.set(f, []); families.get(f).push(r); }
for (const list of families.values()) {
  const matched = list.map((r, i) => (i === 0 ? r.img : meanMatch(r.img, list[0].img, list[0].e.meanMatch ?? 0.6)));
  const shared = quantizeShared(matched, list[0].e.colors ?? 24);
  list.forEach((r, i) => { r.img = shared[i]; });
}

for (const r of results) {
  const { e, kind } = r;
  // buildings and props get the procedural set's dark outline (the sprite grows a pixel each side; the anchors follow)
  const sprite = kind === 'ground' ? r.img : e.outline === false ? quantize(r.img, e.colors ?? 32) : outline(pad(quantize(r.img, e.colors ?? 32), 1));
  if (kind !== 'ground' && e.outline !== false) r.img = pad(r.img, 1); // the glow source keeps the same frame
  let anchor;
  if (kind === 'ground') anchor = { ax: 16, ay: 0 };
  else if (kind === 'prop') { const auto = propAnchor(sprite, e.baseInset ?? 0); anchor = e.anchor && typeof e.anchor === 'object' ? e.anchor : auto; r.auto = auto; }
  else {
    const auto = e.anchor === 'centre' ? centreAnchor(e.w, e.h, sprite.w, sprite.h) : autoAnchor(e.w, e.h, sprite.h);
    const shift = e.shift ?? { x: 0, y: 0 };
    anchor = e.anchor && typeof e.anchor === 'object' ? e.anchor : { ax: auto.ax + shift.x, ay: auto.ay + shift.y };
    r.auto = auto;
  }
  if (!e.checked && !check) console.warn(`  ${e.name}: not yet checked by eye (run with --check, judge the sheet, set "checked": true)`);
  const entry = { file: `sprites/${e.name}.png`, w: sprite.w, h: sprite.h, ax: anchor.ax, ay: anchor.ay };
  writeFileSync(`public/art/${entry.file}`, encodePng(sprite));
  let glowCount = 0;
  if (e.glow !== false && kind !== 'ground') {
    const glow = e.glowSrc ? { img: decodePng(readFileSync(e.glowSrc)), count: 1 } : glowLayer(r.img, { minLum: 0.5, ...(e.glow ?? {}) }); // from the unquantized scale, where a window keeps its colour
    if (glow.count > 0) { entry.glow = `sprites/${e.name}_glow.png`; writeFileSync(`public/art/${entry.glow}`, encodePng(glow.img)); glowCount = glow.count; }
  }
  manifest.sprites[e.name] = entry;
  for (const a of e.aliases ?? []) manifest.sprites[a] = { ...entry };
  sheet.push({ kind, img: sprite, w: sprite.w, h: sprite.h, ax: anchor.ax, ay: anchor.ay, w_t: e.w ?? 1, h_t: e.h ?? 1 });
  const autoText = r.auto ? ` (auto ${r.auto.ax},${r.auto.ay})` : '';
  console.log(`${e.name.padEnd(16)} ${kind.padEnd(8)} ${String(sprite.w).padStart(3)}×${String(sprite.h).padEnd(3)} anchor ${anchor.ax},${anchor.ay}${autoText} colours ${colourCount(sprite)} glow px ${glowCount}${e.checked ? '' : ' (unchecked)'}`);
}
writeFileSync('public/art/sprites.json', JSON.stringify(manifest, null, 1) + '\n');
if (check) {
  if (!existsSync('shots')) mkdirSync('shots');
  writeFileSync('shots/import_check.png', encodePng(checkSheet(sheet)));
  console.log('check sheet: shots/import_check.png');
}
