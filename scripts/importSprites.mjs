// The art import pipeline (iteration 49): reference paintings in inspirations/ become game sprites under public/art/sprites,
// listed in public/art/sprites.json, which the atlas merges over its procedural sprites at boot.
//   node scripts/importSprites.mjs           writes the sprites and the manifest
//   node scripts/importSprites.mjs --check   also renders shots/import_check.png: every sprite over its footprint diamond at 4×
// Every entry of art/sources.json carries a hand-set footprint offset ("anchor"); the script proposes one ("auto") only until
// the entry is checked by eye and marked "checked": true.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { decodePng, encodePng } from './lib/png.mjs';
import { autoAnchor, boxScale, checkSheet, colourCount, crop, glowLayer, keepLargest, keyBackground, quantize } from './lib/sprite.mjs';

const check = process.argv.includes('--check');
const sources = JSON.parse(readFileSync('art/sources.json', 'utf8'));
mkdirSync('public/art/sprites', { recursive: true });
const manifest = { sprites: {} };
const sheet = [];
for (const e of sources.sprites) {
  const src = decodePng(readFileSync(e.src));
  const keyed = keyBackground(src, e.white ?? 235);
  const { img: cut } = crop(e.islands === 'keep' ? keyed : keepLargest(keyed)); // painted clouds and loose smoke go unless the entry keeps them
  const targetW = e.targetWidth ?? (e.w + e.h) * 16 + 2;
  const small = boxScale(cut, targetW, e.targetHeight ?? 0);
  const sprite = quantize(small, e.colors ?? 32);
  const auto = autoAnchor(e.w, e.h, sprite.h);
  const shift = e.shift ?? { x: 0, y: 0 };
  const anchor = e.anchor && e.anchor !== 'auto' ? e.anchor : { ax: auto.ax + shift.x, ay: auto.ay + shift.y };
  if (!e.checked && !check) console.warn(`  ${e.name}: anchor not yet checked by eye (run with --check, set "anchor" and "checked": true)`);
  const entry = { file: `sprites/${e.name}.png`, w: sprite.w, h: sprite.h, ax: anchor.ax, ay: anchor.ay };
  writeFileSync(`public/art/${entry.file}`, encodePng(sprite));
  let glowCount = 0;
  if (e.glow !== false) {
    const glow = e.glowSrc ? { img: decodePng(readFileSync(e.glowSrc)), count: 1 } : glowLayer(small, { minLum: 0.5, ...(e.glow ?? {}) }); // from the unquantized scale, where a window keeps its yellow
    if (glow.count > 0) { entry.glow = `sprites/${e.name}_glow.png`; writeFileSync(`public/art/${entry.glow}`, encodePng(glow.img)); glowCount = glow.count; }
  }
  manifest.sprites[e.name] = entry;
  sheet.push({ img: sprite, w: sprite.w, h: sprite.h, ax: anchor.ax, ay: anchor.ay, w_t: e.w, h_t: e.h });
  console.log(`${e.name.padEnd(14)} ${String(sprite.w).padStart(3)}×${String(sprite.h).padEnd(3)} anchor ${anchor.ax},${anchor.ay} (auto ${auto.ax},${auto.ay}) colours ${colourCount(sprite)} glow px ${glowCount}${e.checked ? '' : ' (unchecked)'}`);
}
writeFileSync('public/art/sprites.json', JSON.stringify(manifest, null, 1) + '\n');
if (check) {
  if (!existsSync('shots')) mkdirSync('shots');
  writeFileSync('shots/import_check.png', encodePng(checkSheet(sheet)));
  console.log('check sheet: shots/import_check.png');
}
