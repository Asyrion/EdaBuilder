/** The art pipeline: the importer's pure steps and the PNG codec on a synthetic painting; the flap key that cuts a flight's
 *  frames from one painting; the Tripo Studio and Aseprite pipelines (docs/ART_PIPELINES.md). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';
import { autoAnchor, blank, boxScale, centreAnchor, colourCount, crop, cropRect, flapFrame, glowLayer, groundDiamond, islands, keepLargest, keyBackground, meanMatch, outline, pad, propAnchor, quantize, quantizeShared, sharpen } from '../scripts/lib/sprite.mjs';
import { installEntries, luaData, render, trace, type Img } from '../scripts/aseprite';
import { shelfPack } from '../src/render/atlas';
import { BUILDINGS } from '../src/sim/catalog';
import { generateSprites } from '../src/render/sprites';
import { resultOf, taskIdOf } from '../tools/devboard/tripo';
import { draftFor, TRIPO_MAX } from '../tools/devboard/prompts';

// The importer's pure steps (key, crop, scale, quantize, glow, anchor, pack, slice, outline, ground diamonds) and the PNG codec.

/** A 64×64 painting: white ground, a red house from (16,24) to (48,56) with a white window at (24..28, 32..36) and a warm lamp at (40..42, 40..42). */
function painting() {
  const img = blank(64, 64);
  img.data.fill(255);
  const set = (x: number, y: number, r: number, g: number, b: number) => { const o = (y * 64 + x) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; };
  for (let y = 24; y < 56; y++) for (let x = 16; x < 48; x++) set(x, y, 180, 40, 40);
  for (let y = 32; y < 36; y++) for (let x = 24; x < 28; x++) set(x, y, 250, 250, 250);
  for (let y = 40; y < 43; y++) for (let x = 40; x < 43; x++) set(x, y, 255, 220, 90);
  return img;
}

describe('the art import pipeline', () => {
  it('keys the ground from the corners and keeps the white window; crops to the house', () => {
    const keyed = keyBackground(painting(), 235);
    const a = (x: number, y: number) => keyed.data[(y * 64 + x) * 4 + 3];
    expect(a(0, 0)).toBe(0);
    expect(a(63, 63)).toBe(0);
    expect(a(10, 30)).toBe(0); // ground beside the house
    expect(a(25, 33)).toBe(255); // the window inside the walls stays
    expect(a(20, 30)).toBe(255);
    const { img, x0, y0 } = crop(keyed);
    expect([x0, y0, img.w, img.h]).toEqual([16, 24, 32, 32]);
    // a painted cloud above the house is a loose island and goes; the house stays
    const cloudy = painting();
    for (let y = 4; y < 8; y++) for (let x = 30; x < 40; x++) { const o = (y * 64 + x) * 4; cloudy.data[o] = 200; cloudy.data[o + 1] = 220; cloudy.data[o + 2] = 250; }
    const kept = keepLargest(keyBackground(cloudy));
    expect(kept.data[(5 * 64 + 32) * 4 + 3]).toBe(0);
    expect(kept.data[(30 * 64 + 20) * 4 + 3]).toBe(255);
    expect(crop(kept).img.h).toBe(32);
  });

  it('box-scales to a width with hard edges, quantizes to a palette twice the same, and glows only at the lamp', () => {
    const { img } = crop(keyBackground(painting()));
    const small = boxScale(img, 16);
    expect([small.w, small.h]).toEqual([16, 16]);
    for (let i = 0; i < 16 * 16; i++) expect([0, 255]).toContain(small.data[i * 4 + 3]);
    const q1 = quantize(small, 4);
    const q2 = quantize(small, 4);
    expect(colourCount(q1)).toBeLessThanOrEqual(4);
    expect(colourCount(q1)).toBeGreaterThanOrEqual(2);
    expect(Array.from(q1.data)).toEqual(Array.from(q2.data));
    const glow = glowLayer(img, { minLum: 0.5, warm: 40 });
    expect(glow.count).toBe(9); // the 3×3 lamp
    expect(glow.img.data[((40 - 24) * 32 + (40 - 16)) * 4 + 3]).toBe(255);
    expect(glow.img.data[((30 - 24) * 32 + (20 - 16)) * 4 + 3]).toBe(0); // the wall does not glow
    expect(glow.img.data[((33 - 24) * 32 + (25 - 16)) * 4 + 3]).toBe(0); // nor the white window: no warmth
  });

  it('the PNG codec round-trips and the anchor follows the procedural convention', () => {
    const { img } = crop(keyBackground(painting()));
    const back = decodePng(encodePng(img));
    expect([back.w, back.h]).toEqual([img.w, img.h]);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
    expect(autoAnchor(2, 2, 76)).toEqual({ ax: 33, ay: 43 });
    expect(autoAnchor(1, 1, 30)).toEqual({ ax: 17, ay: 13 });
  });

  it('shelfPack appends below a start height without overlaps', () => {
    const items = [{ w: 66, h: 76 }, { w: 66, h: 76 }, { w: 500, h: 20 }, { w: 500, h: 20 }, { w: 40, h: 40 }];
    const { pos, height } = shelfPack(items, 1024, 300);
    expect(pos[0]).toEqual({ x: 0, y: 300 });
    expect(pos[1]).toEqual({ x: 67, y: 300 });
    expect(pos[2].y).toBe(300);
    expect(pos[3].y).toBeGreaterThan(300); // 66+66+500+500 with gutters passes 1024: the fourth wraps to a new shelf
    expect(pos[4].y).toBe(pos[3].y); // the fifth fits beside it
    expect(height).toBeGreaterThan(pos[4].y + 40);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = { ...pos[i], ...items[i] }, b = { ...pos[j], ...items[j] };
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap).toBe(false);
    }
  });

  it('slices a sheet into islands in row-major order and crops one by index or rectangle', () => {
    const sheet = blank(100, 60); sheet.data.fill(255);
    const blob = (x0: number, y0: number, w: number, h: number) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * 100 + x) * 4; sheet.data[o] = 40; sheet.data[o + 1] = 120; sheet.data[o + 2] = 40; } };
    blob(60, 5, 12, 12); blob(10, 8, 14, 10); blob(30, 35, 20, 12); // two on the first row (right one first in x order? no: sorted by x), one below
    const list = islands(keyBackground(sheet), { minPixels: 20, rowBand: 20 }); // a toy sheet: rows 20 px apart
    expect(list.map((f) => [f.x, f.y])).toEqual([[10, 8], [60, 5], [30, 35]]);
    const mid = cropRect(keyBackground(sheet), [list[1].x, list[1].y, list[1].w, list[1].h]);
    expect([mid.w, mid.h]).toEqual([12, 12]);
    expect(mid.data[3]).toBe(255);
  });

  it("a prop's anchor is the trunk base, a narrow building centres on its footprint, pad and outline grow a dark edge", () => {
    const img = blank(9, 9);
    for (let y = 0; y < 9; y++) for (let x = 2; x < 7; x++) { const o = (y * 9 + x) * 4; img.data[o] = 90; img.data[o + 1] = 60; img.data[o + 2] = 30; img.data[o + 3] = 255; }
    expect(propAnchor(img, 0)).toEqual({ ax: 5, ay: 9 });
    expect(propAnchor(img, 2).ay).toBe(7);
    expect(centreAnchor(1, 1, 21, 64)).toEqual({ ax: 11, ay: 47 });
    expect(centreAnchor(2, 2, 39, 90)).toEqual({ ax: 20, ay: 57 });
    const o = outline(pad(img, 1));
    expect([o.w, o.h]).toEqual([11, 11]);
    expect(Array.from(o.data.subarray((5 * 11 + 2) * 4, (5 * 11 + 2) * 4 + 4))).toEqual([26, 20, 32, 255]); // left of the body
    expect(o.data[(0 * 11 + 0) * 4 + 3]).toBe(0); // the far corner stays clear
    const sh = sharpen(img, 1);
    expect([sh.w, sh.h]).toEqual([9, 9]);
    expect(sh.data[(4 * 9 + 4) * 4]).toBe(90); // a flat body is unchanged by the mask
  });

  it('a ground diamond folds a texture so its edges continue, follows the diamond mask, and a family shares a palette', () => {
    const tex = blank(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const o = (y * 64 + x) * 4; tex.data[o] = x * 4; tex.data[o + 1] = 100 + (y >> 2); tex.data[o + 2] = 50; tex.data[o + 3] = 255; }
    const t = groundDiamond(tex);
    expect([t.w, t.h]).toEqual([32, 16]);
    const a = (x: number, y: number) => t.data[(y * 32 + x) * 4 + 3];
    expect(a(15, 0)).toBe(255); expect(a(16, 0)).toBe(255); expect(a(14, 0)).toBe(0); expect(a(17, 0)).toBe(0); // row 0: x in [15, 16]
    expect(a(1, 7)).toBe(255); expect(a(0, 7)).toBe(0); expect(a(30, 7)).toBe(255); expect(a(31, 7)).toBe(0); // row 7: [1, 30]
    // the fold: the pixel at the diamond's left corner and the one at its right corner sample the same folded texel column
    const red = (x: number, y: number) => t.data[(y * 32 + x) * 4];
    expect(Math.abs(red(1, 7) - red(30, 8))).toBeLessThanOrEqual(24);
    const t2 = groundDiamond({ w: 64, h: 64, data: new Uint8ClampedArray(tex.data).map((v, i) => (i % 4 === 0 ? 255 - v : v)) });
    const [q1, q2] = quantizeShared([t, t2], 6);
    const pal = new Set<number>();
    for (const q of [q1, q2]) for (let i = 0; i < 32 * 16; i++) if (q.data[i * 4 + 3] > 0) pal.add((q.data[i * 4] << 16) | (q.data[i * 4 + 1] << 8) | q.data[i * 4 + 2]);
    expect(pal.size).toBeLessThanOrEqual(6);
    const m = meanMatch(t2, t, 1);
    const mean = (im: { data: Uint8ClampedArray }) => { let r = 0, n = 0; for (let i = 0; i < 32 * 16; i++) if (im.data[i * 4 + 3] > 0) { r += im.data[i * 4]; n++; } return r / n; };
    expect(Math.abs(mean(m) - mean(t))).toBeLessThan(2);
  });

  it('the glow hue: cool catches a blue lamp and not a red one, warm the reverse', () => {
    const img = blank(4, 1);
    const set = (x: number, r: number, g: number, b: number) => { img.data.set([r, g, b, 255], x * 4); };
    set(0, 255, 220, 90); set(1, 90, 200, 255); set(2, 60, 60, 60); set(3, 230, 230, 230);
    expect(glowLayer(img, { minLum: 0.5, warm: 40, hue: 'warm' }).count).toBe(1);
    expect(glowLayer(img, { minLum: 0.5, warm: 40, hue: 'cool' }).count).toBe(1);
    expect(glowLayer(img, { minLum: 0.5, warm: 40, hue: 'cool' }).img.data[1 * 4 + 3]).toBe(255);
    expect(glowLayer(img, { minLum: 0.5, warm: 60, hue: 'any' }).count).toBe(2); // both saturated lamps, not the grey or the white
  });
});

/** The wing beat: a flight's frames are cut from one painting by the importer's flap key, and must share one size and anchor
 *  so the body holds still while the wings move; the renderer plays them up, mid, down, mid. */
describe('The wing beat (the importer\'s flap key; the wyrm it was made for is parked, scope reset phase 1b)', () => {

  it("flapFrame moves only the paint inside a wing's polygon, turned about its pivot, and leaves the rest", () => {
    // a 9×9 white canvas: a dark wing pixel at (6, 2) inside the polygon, a dark body pixel at (2, 6) outside it
    const w = 9, h = 9, data = new Uint8ClampedArray(w * h * 4).fill(255);
    const dark = (x: number, y: number) => { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 20; };
    dark(6, 2); dark(2, 6);
    const src = { w, h, data };
    const wing = { poly: [[5, 0], [9, 0], [9, 4], [5, 4]], pivot: [4.5, 4.5] };
    const out = flapFrame(src, [wing], [{ rot: 90, sy: 1 }]);
    const at = (x: number, y: number) => out.data[(y * w + x) * 4];
    expect(at(2, 6)).toBe(20); // the body stays
    expect(at(6, 2)).toBe(255); // the wing left its place
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((y) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => at(x, y))).filter((v) => v === 20).length).toBe(2); // and was drawn once elsewhere
  });
});

// The Tripo Studio and Aseprite pipelines: the importer's `pixel: true` takes a drawn sprite as drawn; the Aseprite trace makes
// an indexed image with its edge in ink; install switches the old entry off; the Tripo CLI's output is read for its task id
// and its result.
/** A 6×6 drawing on transparency: a 4×4 block of two colours, a speck in the corner. */
function drawing(): Img {
  const w = 6, h = 6, data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * w + x) * 4);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) set(x, y, x < 3 ? [200, 60, 40] : [60, 120, 200]);
  set(5, 5, [250, 250, 250]); // a speck with no opaque neighbour
  return { w, h, data };
}

describe('the importer takes a pixel: true sprite as drawn', () => {
  it('keeps every pixel, crops to them and anchors it; its colours snap to the master palette like every sprite (phase 3-2)', async () => {
    const { loadPalette, nearest } = await import('../scripts/lib/palette.mjs');
    const pal = loadPalette();
    const dir = mkdtempSync(join(tmpdir(), 'iter91-')), script = resolve('scripts/importSprites.mjs');
    try {
      mkdirSync(join(dir, 'art'), { recursive: true });
      mkdirSync(join(dir, 'inspirations'), { recursive: true }); // the scratch folder is the eda-lore checkout too (EDA_LORE)
      const img = drawing();
      img.data.set([0, 0, 0, 0], (5 * 6 + 5) * 4); // without the speck: the crop is the 4×4 block
      writeFileSync(join(dir, 'inspirations/drawn.png'), encodePng(img));
      writeFileSync(join(dir, 'art/sources.json'), JSON.stringify({ sprites: [{ name: 'b_test', src: 'inspirations/drawn.png', pixel: true, w: 1, h: 1, anchor: 'centre', checked: true, glow: false }] }));
      execFileSync(process.execPath, [script], { cwd: dir, stdio: 'pipe', env: { ...process.env, EDA_LORE: dir } });
      const out = decodePng(readFileSync(join(dir, 'art/build/sprites/b_test.png')));
      expect([out.w, out.h]).toEqual([4, 4]);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const a = (y * 4 + x) * 4, b = ((y + 1) * 6 + x + 1) * 4;
        const src = [...img.data.subarray(b, b + 4)];
        const want = src[3] > 0 ? [...nearest([src[0], src[1], src[2]], pal.colors, pal.chroma).c.rgb, src[3]] : src;
        expect([...out.data.subarray(a, a + 4)]).toEqual(want);
      }
      const m = JSON.parse(readFileSync(join(dir, 'public/art/sprites.json'), 'utf8')).sprites.b_test;
      expect([m.w, m.h]).toEqual([4, 4]);
      expect(Number.isInteger(m.ax) && Number.isInteger(m.ay)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the Aseprite trace', () => {
  const t = trace(drawing(), 24);
  it('makes an indexed image: index 0 clear, index 1 the ink (the darkest), the edge in ink, a speck gone', () => {
    expect(t.palette[0]).toEqual([0, 0, 0]);
    const at = (x: number, y: number) => t.idx[y * t.w + x];
    expect(at(5, 5)).toBe(0);
    expect(at(0, 0)).toBe(0);
    for (const [x, y] of [[1, 1], [4, 1], [1, 4], [4, 4], [2, 1]]) expect(at(x, y)).toBe(1);
    expect(at(2, 2)).not.toBe(1); // inside keeps its colour
    expect(at(2, 2)).not.toBe(at(3, 2)); // two colours inside
  });
  it('renders and writes the Lua table build_sprite.lua reads', () => {
    const img = render(t);
    expect(img.data[3]).toBe(0);
    const lua = luaData('b_test', t);
    expect(lua).toMatch(/^return \{/);
    expect(lua).toMatch(/w = 6, h = 6/);
    expect((lua.match(/"[0-9a-v]{6}"/g) ?? []).length).toBe(6);
  });
  it('cuts a many-coloured sprite to the palette asked for', () => {
    const w = 16, h = 16, data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4);
    expect(trace({ w, h, data }, 8).palette.length).toBeLessThanOrEqual(9);
  });
});

describe('install', () => {
  it('switches the live entry off, keeps it, and adds the pixel entry with its footprint and anchor', () => {
    const list = [{ name: 'b_well', src: 'inspirations/old.png', w: 1, h: 1, anchor: 'centre', shift: { x: 0, y: 6 }, checked: true }, { name: 'tree_1', src: 'x.png', kind: 'prop' }];
    const { list: out, entry } = installEntries(list, 'b_well', { w: 2, h: 2 });
    expect(out.find((e) => e.src === 'inspirations/old.png')!.off).toBe(true);
    expect(entry).toMatchObject({ name: 'b_well', src: 'art/aseprite/export/b_well.png', pixel: true, w: 1, h: 1, anchor: 'centre', shift: { x: 0, y: 6 } });
    expect(out.filter((e) => e.name === 'b_well' && !e.off)).toHaveLength(1);
    // installing again replaces the pixel entry instead of adding a second
    expect(installEntries(out, 'b_well', { w: 2, h: 2 }).list.filter((e) => e.name === 'b_well' && !e.off)).toHaveLength(1);
    // a prop keeps its kind and gets no footprint
    expect(installEntries(list, 'tree_1', { w: 1, h: 1 }).entry).toMatchObject({ kind: 'prop', pixel: true });
  });
});

describe('the Tripo CLI', () => {
  it('reads the task id from its "Task created" line', () => {
    expect(taskIdOf('Submitting…\nTask created: 4f2a9c1e-77b0-4c1e-9a33-2d1b0f6c7e10\nWaiting')).toBe('4f2a9c1e-77b0-4c1e-9a33-2d1b0f6c7e10');
    expect(taskIdOf('✔ Task created (id: abc12345def)')).toBe('abc12345def');
    expect(taskIdOf('{"task_id":"zz-99887766"}')).toBe('zz-99887766');
    expect(taskIdOf('error: not logged in')).toBeNull();
  });
  it('reads the status and the urls wherever the result nests them', () => {
    expect(resultOf('{"status":"running"}')).toEqual({ status: 'running', urls: [] });
    expect(resultOf('{"data":{"status":"success","urls":["https://a/1.webp","https://a/2.webp"]}}').urls).toHaveLength(2);
    expect(resultOf('{"status":"SUCCESS","images":[{"url":"https://a/1.png"}]}')).toEqual({ status: 'success', urls: ['https://a/1.png'] });
  });
});

describe('the board\'s draft prompt keeps the prompt rules', () => {
  it('every building\'s draft fits Tripo\'s 1000 characters and names no negation', () => {
    for (const b of BUILDINGS) {
      const d = draftFor(b as never, `b_${b.key}`, '');
      expect(d.length, b.key).toBeLessThanOrEqual(TRIPO_MAX);
      expect(d, b.key).not.toMatch(/\bno (text|ground|shadow|frame)\b/i);
      expect(d, b.key).toMatch(/plain flat white background/);
    }
    expect(draftFor(BUILDINGS[0] as never, 'b_x', 'word '.repeat(400)).length).toBeLessThanOrEqual(TRIPO_MAX); // a long brief gives way
  });
});

describe('art/sources.json names only sprites the game shows (scope reset 1d-2)', () => {
  it('every entry belongs to a drawn sprite family, a building or a counted import pool', () => {
    // a family is the name without its variant suffix (_3, _v1, _s2, _l2_v0); the counted pools are the ones the renderer
    // sizes from the atlas (carts.ts, groves.ts, renderer.ts) that the painter draws none of
    const fam = (n: string) => n.replace(/_(v|s|l)?\d+$/, '').replace(/_(v|s|l)?\d+$/, '');
    const fams = new Set(generateSprites().map((d) => fam(d.name)));
    for (const p of ['cartp_goods', 'cartp_stone', 'tree_autumn', 'glowcap']) fams.add(p);
    for (const b of BUILDINGS) { fams.add(`b_${b.key}`); fams.add(b.key); }
    const sources = (JSON.parse(readFileSync('art/sources.json', 'utf8')) as { sprites: { name: string }[] }).sprites;
    expect(sources.filter((s) => !fams.has(fam(s.name))).map((s) => s.name)).toEqual([]);
  });
});
