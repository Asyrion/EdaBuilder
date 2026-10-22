/** Iteration 57 (the donkey carts): the painted carts carry the goods and the leystone, at a folk's scale, facing the way they
 *  drive; a missing painting falls back to the procedural cart. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodePng } from '../scripts/lib/png.mjs';
import { CART_GOODS_PREFIX, CART_STONE_PREFIX, cartPick, cartSpriteName, facesRight } from '../src/render/carts';

interface Entry { file: string; w: number; h: number; ax: number; ay: number }
const sources = JSON.parse(readFileSync('art/sources.json', 'utf8')) as { sprites: { name: string; kind?: string; checked?: boolean; mirrored?: boolean }[] };
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')) as { sprites: Record<string, Entry> };
const carts = sources.sprites.filter((e) => e.kind === 'vehicle');
const png = (e: Entry) => decodePng(readFileSync(`public/art/${e.file}`)) as { w: number; h: number; data: Uint8ClampedArray };
const opaqueBox = (img: { w: number; h: number; data: Uint8ClampedArray }) => {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const count = (prefix: string) => { let n = 0; while (`${prefix}${n}` in manifest.sprites) n++; return n; };

describe('The donkey carts', () => {
  it('every painted cart is checked by eye, has its sprite and a left-facing twin with the mirrored anchor and pixels', () => {
    expect(carts.length).toBeGreaterThanOrEqual(20);
    for (const e of carts) {
      expect(e.checked, `${e.name} judged by eye`).toBe(true);
      expect(e.mirrored, e.name).toBe(true);
      const r = manifest.sprites[e.name], l = manifest.sprites[`${e.name}_l`];
      expect(r, e.name).toBeDefined();
      expect(l, `${e.name}_l`).toBeDefined();
      expect([l.w, l.h, l.ay]).toEqual([r.w, r.h, r.ay]);
      expect(l.ax).toBe(r.w - r.ax);
      const a = png(r), b = png(l);
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) expect(b.data[(y * a.w + (a.w - 1 - x)) * 4 + 3]).toBe(a.data[(y * a.w + x) * 4 + 3]);
    }
    expect(count(CART_GOODS_PREFIX)).toBe(carts.filter((e) => e.name.startsWith(CART_GOODS_PREFIX)).length);
    expect(count(CART_STONE_PREFIX)).toBeGreaterThanOrEqual(3);
  });

  it('a cart is the scale of the folk: no taller than one and a half citizens, no wider than 28 px, the wheels on its point', () => {
    const citizen = 12; // cit_* is 8×12
    for (const e of carts) {
      const r = manifest.sprites[e.name];
      const box = opaqueBox(png(r));
      expect(box.h, e.name).toBeLessThanOrEqual(citizen * 1.5);
      expect(box.h, e.name).toBeGreaterThanOrEqual(10);
      expect(box.w, e.name).toBeLessThanOrEqual(28);
      expect(r.ay, e.name).toBe(r.h - 1);
      expect(Math.abs(r.ax - r.w / 2), e.name).toBeLessThanOrEqual(1);
    }
  });

  it('picks a painting by id and a facing by heading; a missing set keeps the procedural carts', () => {
    const n = (p: string) => (p === CART_GOODS_PREFIX ? 27 : p === CART_STONE_PREFIX ? 4 : 0);
    expect(facesRight(0)).toBe(true);
    expect(facesRight(3)).toBe(true);
    expect(facesRight(1)).toBe(false);
    expect(facesRight(2)).toBe(false);
    expect(cartSpriteName({ id: 7, variant: 1, dir: 0 }, n)).toBe(`${CART_GOODS_PREFIX}${cartPick(7, 27)}`);
    expect(cartSpriteName({ id: 7, variant: 2, dir: 1 }, n)).toBe(`${CART_GOODS_PREFIX}${cartPick(7, 27)}_l`);
    expect(cartSpriteName({ id: 7, variant: 0, dir: 2 }, n)).toBe(`${CART_STONE_PREFIX}${cartPick(7, 4)}_l`);
    expect(cartSpriteName({ id: 7, variant: 1, dir: 0 }, () => 0)).toBe('cart_1');
    // consecutive carts spread over the pool
    const picks = new Set(Array.from({ length: 40 }, (_, id) => cartPick(id, 27)));
    expect(picks.size).toBeGreaterThan(15);
    for (const p of picks) expect(p).toBeLessThan(27);
  });
});
