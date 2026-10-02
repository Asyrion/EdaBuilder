// Iteration 49: the art import pipeline's pure steps and the PNG codec, on a synthetic painting.
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';
import { autoAnchor, blank, boxScale, centreAnchor, colourCount, crop, cropRect, glowLayer, groundDiamond, islands, keepLargest, keyBackground, meanMatch, outline, pad, propAnchor, quantize, quantizeShared, sharpen } from '../scripts/lib/sprite.mjs';
import { shelfPack } from '../src/render/atlas';

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
