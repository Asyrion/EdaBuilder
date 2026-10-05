/** Iteration 77 (the sprites faced and fitted): every building painting was judged over its footprint diamond, beside its
 *  mirror (scripts/playtest77.mjs); the fit rules the survey settled are held here. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number; ax: number; ay: number }>;
const sources = JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as { name: string; kind?: string; w?: number; h?: number; checked?: boolean; targetHeight?: number }[];
const buildings = sources.filter((e) => (e.kind ?? 'building') === 'building' && e.w && e.h);

describe('The painted buildings fitted to their tiles', () => {
  it("the Founding Stake's halls grow: the three tall halls never shrink, and the wide brick hall of stage 2 fills its diamond's width", () => {
    const h = [0, 1, 2, 3].map((k) => manifest[`b_stake_s${k}`].h);
    expect(h[1]).toBeGreaterThanOrEqual(h[0]);
    expect(h[3]).toBeGreaterThanOrEqual(h[1]);
    // stage 2 is a low, wide painting (a brick hall on its lawn): scaled to its 2×2 diamond's width it stands 50 tall, from 42
    expect(manifest.b_stake_s2.w).toBeGreaterThanOrEqual(62);
    expect(h[2]).toBeGreaterThanOrEqual(50);
  });
  it('the Hall of Wicks fills its 3×3 diamond, and no painted building spills far past its footprint', () => {
    expect(manifest.b_hallofwicks.w).toBeGreaterThanOrEqual(Math.round(0.85 * 96));
    for (const e of buildings) {
      const m = manifest[e.name];
      expect(m, e.name).toBeDefined();
      expect(m.w, `${e.name} is ${m.w} wide on a ${(e.w! + e.h!) * 16} diamond`).toBeLessThanOrEqual((e.w! + e.h!) * 16 + 8);
    }
  });
  it('every building painting has been judged by eye, and the heroes stand centred on their tiles', () => {
    for (const e of buildings) expect(e.checked, `${e.name} unchecked`).toBe(true);
    for (const e of buildings) if (e.name.startsWith('b_')) {
      const m = manifest[e.name];
      // the centre anchor: the sprite's middle over the footprint's centre line (centreAnchor in scripts/lib/sprite.mjs)
      expect(m.ax, `${e.name} anchor`).toBe(Math.round(m.w / 2) - (e.w! - e.h!) * 8);
      expect(m.ay, `${e.name} base`).toBe(m.h - 1 - (e.w! + e.h!) * 8);
    }
  });
});
