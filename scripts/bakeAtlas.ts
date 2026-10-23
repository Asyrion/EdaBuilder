/** The procedural atlas baked at build time (scope reset phase 3-4, RESET_PLAN Phase 3 task 3): every sprite the code paints
 *  (sprites.ts, handdrawn.ts), snapped to the master palette and packed exactly as the boot would pack it (atlas.ts
 *  packLayout, atlasPixels), written as public/art/atlas.<hash>.png with public/art/atlas.json beside it. The game loads
 *  that instead of painting at boot (SpriteAtlas.fromOverride); without it (npm run dev before a build) it paints, as
 *  before. Both files are build output (.gitignore); `npm run build` runs this first.
 *    npx tsx scripts/bakeAtlas.ts [dir]   → the two files (in public/art, or in dir: the test bakes into a scratch folder),
 *                                           and a line with the sprite count, size and time */
import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { encodePng } from './lib/png.mjs';
import { atlasPixels, packLayout, type AtlasManifest } from '../src/render/atlas';
import { generateSprites } from '../src/render/sprites';

const dir = process.argv[2] ?? 'public/art';
const t0 = performance.now();
const defs = generateSprites();
const { W, H, items, rects } = packLayout(defs);
const data = new Uint8ClampedArray(W * H * 4);
for (const it of items) {
  const p = it.glow ? it.def.glow! : it.def.p;
  const px = atlasPixels(it.def, it.glow);
  for (let y = 0; y < p.h; y++) data.set(px.subarray(y * p.w * 4, (y + 1) * p.w * 4), ((it.y + y) * W + it.x) * 4);
}
const png = encodePng({ w: W, h: H, data });
const hash = createHash('sha256').update(png).digest('hex').slice(0, 12);
for (const f of readdirSync(dir)) if (/^atlas\.[0-9a-f]+\.png$/.test(f)) rmSync(`${dir}/${f}`);
const image = `atlas.${hash}.png`;
writeFileSync(`${dir}/${image}`, png);
const manifest: AtlasManifest = { image, sprites: rects };
writeFileSync(`${dir}/atlas.json`, JSON.stringify(manifest) + '\n');
console.log(`baked ${defs.length} sprites into ${dir}/${image} (${W}×${H}, ${Math.round(png.length / 1024)} KB) in ${Math.round(performance.now() - t0)} ms`);
