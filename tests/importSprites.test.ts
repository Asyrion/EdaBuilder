// Iteration 49: the art import pipeline's pure steps and the PNG codec, on a synthetic painting.
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';
import { autoAnchor, blank, boxScale, colourCount, crop, glowLayer, keepLargest, keyBackground, quantize } from '../scripts/lib/sprite.mjs';
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
});
