// The art import pipeline (iterations 49–50): reference paintings in inspirations/ become game sprites under
// public/art/sprites, listed in public/art/sprites.json, which the atlas merges over its procedural sprites at boot.
//   node scripts/importSprites.mjs           writes the sprites and the manifest
//   node scripts/importSprites.mjs --check   also renders shots/import_check.png (every sprite at 4×)
//   node scripts/importSprites.mjs --islands <src> [white]   lists a sheet's islands, row-major, for picking by index
// Entries (art/sources.json "sprites"): name, src, kind ('building' | 'prop' | 'ground' | 'vehicle'), w/h (footprint in tiles, buildings),
// island (index into the sheet's islands) or rect [x, y, w, h], inset (fraction cut from each side, ground), targetWidth /
// targetHeight, colors, family (ground variants that share a palette and a mean colour), glow ({ minLum, warm, hue } or false),
// glowSrc, white (background key), anchor ('auto' | 'centre' | { ax, ay }), baseInset (prop: px above the last row),
// recolour ({ hue degrees, sat, light }: glimwood from a birch), flip (mirror left to right: the set faces lower-right), sharpen (unsharp amount, default 0.6), outline (false to skip the dark 1 px outline), aliases [names], checked (true once judged by eye), holes (key enclosed background regions of at least this many source pixels, a coiled body's loop; iteration 74), flap ({ wings: [{ poly, pivot, root, behind }], frames: [[{ rot, sy } per wing]], specks }: a wing beat cut from one painting, each frame written as <name>_1… with frame 0's crop, scale and anchor; iteration 76), hop (a creature's `_0` painting also serves as its `_1` frame, a pixel higher: a gait bob; iteration 58).
// A vehicle (the donkey carts, iteration 57) is scaled by scale (a fraction of the painting's pixels, set per sheet so every
// donkey stands the same height), faces right after any flip, is anchored at the bottom centre, and with mirrored: true also
// writes <name>_l, the left-facing twin. A rect is cut from the raw sheet and keyed after, so a sheet's grid lines cannot
// stop the background key.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { decodePng, encodePng } from './lib/png.mjs';
import { autoAnchor, boxScale, centreAnchor, checkSheet, colourCount, crop, cropRect, dropSpecks, flapFrame, glowLayer, groundDiamond, islands, keepLargest, keyBackground, meanMatch, outline, pad, propAnchor, quantize, quantizeShared, recolour, sharpen } from './lib/sprite.mjs';

/** The image mirrored left to right. */
function mirror(img) {
  const out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data.length) };
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const a = (y * img.w + x) * 4, b = (y * img.w + (img.w - 1 - x)) * 4;
    for (let k = 0; k < 4; k++) out.data[b + k] = img.data[a + k];
  }
  return out;
}

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
  if (e.flap) { // a wing beat (iteration 76): every frame keyed, cropped to the frames' common box and scaled by one factor, so the body holds still
    const src = load(e.src);
    const frames = [src, ...e.flap.frames.map((f) => flapFrame(src, e.flap.wings, f, e.white ?? 235))].map((f) => dropSpecks(keyBackground(f, e.white ?? 235, e.holes ?? 0), e.flap.specks ?? 600));
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const f of frames) { const c = crop(f); x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x0 + c.img.w - 1); y1 = Math.max(y1, c.y0 + c.img.h - 1); }
    const box = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
    const th = e.targetHeight ?? 24;
    const tw = Math.max(1, Math.round((box[2] * th) / box[3]));
    frames.forEach((f, k) => {
      const small = boxScale(cropRect(f, box), tw, th);
      results.push({ e: k === 0 ? e : { ...e, name: e.name.replace(/_0$/, `_${k}`) }, kind, img: sharpen(small, e.sharpen ?? 0.6), flapOf: k === 0 ? undefined : e.name });
    });
    continue;
  }
  let img = e.rect ? keyBackground(cropRect(load(e.src), e.rect), e.white ?? 235, e.holes ?? 0) : keyBackground(load(e.src), e.white ?? 235, e.holes ?? 0);
  if (!e.rect && e.island !== undefined) { const list = islands(img); const f = list[e.island]; if (!f) throw new Error(`${e.name}: island ${e.island} of ${list.length}`); img = cropRect(img, [f.x, f.y, f.w, f.h]); }
  if (kind !== 'ground') img = crop(e.islands === 'keep' ? img : keepLargest(img)).img;
  if (e.flip) img = mirror(img); // a painting whose front is on its left face is mirrored, so the set faces lower-right with the procedural buildings (iteration 56)
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
  if (kind === 'vehicle') {
    const scale = e.scale ?? 0.06;
    const small = boxScale(img, Math.max(1, Math.round(img.w * scale)), Math.max(1, Math.round(img.h * scale)));
    results.push({ e, kind, img: sharpen(small, e.sharpen ?? 0.6) });
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
  else if (kind === 'vehicle') anchor = { ax: Math.round(sprite.w / 2), ay: sprite.h - 1 }; // wheels and hooves on the agent's point
  else if (r.flapOf) anchor = manifest.sprites[r.flapOf] ? { ax: manifest.sprites[r.flapOf].ax, ay: manifest.sprites[r.flapOf].ay } : propAnchor(sprite, e.baseInset ?? 0); // a wing beat's frames share frame 0's anchor
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
  if (e.glow !== false && kind !== 'ground' && kind !== 'vehicle') {
    const glow = e.glowSrc ? { img: e.flip ? mirror(decodePng(readFileSync(e.glowSrc))) : decodePng(readFileSync(e.glowSrc)), count: 1 } : glowLayer(r.img, { minLum: 0.5, ...(e.glow ?? {}) }); // from the unquantized scale, where a window keeps its colour
    if (glow.count > 0) { entry.glow = `sprites/${e.name}_glow.png`; writeFileSync(`public/art/${entry.glow}`, encodePng(glow.img)); glowCount = glow.count; }
  }
  manifest.sprites[e.name] = entry;
  for (const a of e.aliases ?? []) manifest.sprites[a] = { ...entry };
  if (e.hop) manifest.sprites[e.name.replace(/_0$/, '_1')] = { ...entry, ay: entry.ay + 1 }; // a painting is one frame: the second stands a pixel higher, a gait bob (iteration 58)
  if (e.mirrored) { // the left-facing twin: the same pixels mirrored, the anchor mirrored with them (w − ax)
    const twin = { file: `sprites/${e.name}_l.png`, w: sprite.w, h: sprite.h, ax: sprite.w - anchor.ax, ay: anchor.ay };
    writeFileSync(`public/art/${twin.file}`, encodePng(mirror(sprite)));
    manifest.sprites[`${e.name}_l`] = twin;
  }
  sheet.push({ kind: kind === 'vehicle' ? 'prop' : kind, img: sprite, w: sprite.w, h: sprite.h, ax: anchor.ax, ay: anchor.ay, w_t: e.w ?? 1, h_t: e.h ?? 1 });
  const autoText = r.auto ? ` (auto ${r.auto.ax},${r.auto.ay})` : '';
  console.log(`${e.name.padEnd(16)} ${kind.padEnd(8)} ${String(sprite.w).padStart(3)}×${String(sprite.h).padEnd(3)} anchor ${anchor.ax},${anchor.ay}${autoText} colours ${colourCount(sprite)} glow px ${glowCount}${e.checked ? '' : ' (unchecked)'}`);
}
writeFileSync('public/art/sprites.json', JSON.stringify(manifest, null, 1) + '\n');
if (check) {
  if (!existsSync('shots')) mkdirSync('shots');
  writeFileSync('shots/import_check.png', encodePng(checkSheet(sheet)));
  console.log('check sheet: shots/import_check.png');
}
