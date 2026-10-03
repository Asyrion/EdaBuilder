/** Iteration 65 (drawn art): the Lantern of Vell and the temple's three stages drawn by hand in code, and the citizens redrawn on
 *  their 8×12 canvas. The sprites stand on their footprint's back corner, the temple grows, the Lantern is the tallest 3×3 and burns
 *  at night, the walk cycle moves, the Tallowkin keep their eyes, and every sprite is closed by its outline. */
import { describe, expect, it } from 'vitest';
import { generateSprites, type SpriteDef } from '../src/render/sprites';
import { PAL } from '../src/render/palette';

const defs = generateSprites();
const by = new Map(defs.map((d) => [d.name, d]));
const get = (n: string): SpriteDef => { const d = by.get(n); if (!d) throw new Error(`no sprite ${n}`); return d; };
/** The opaque height of a sprite: rows from its first opaque pixel to its last. */
function opaqueRows(d: SpriteDef): { top: number; bottom: number } {
  let top = -1, bottom = -1;
  for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; }
  return { top, bottom };
}
const glowCount = (d: SpriteDef, y0 = 0, y1 = Infinity) => { let n = 0; if (!d.glow) return 0; for (let y = y0; y < Math.min(d.glow.h, y1); y++) for (let x = 0; x < d.glow.w; x++) if (d.glow.get(x, y) > 0) n++; return n; };
const hex = (d: SpriteDef, x: number, y: number) => { const i = (y * d.p.w + x) * 4; return '#' + [0, 1, 2].map((k) => d.p.data[i + k].toString(16).padStart(2, '0')).join(''); };

describe('The Lantern of Vell and the temple, drawn', () => {
  it('stand on the footprint\'s back corner, and the footprint\'s front corner is on the canvas', () => {
    for (const n of ['b_lantern', 'b_temple', 'b_temple_s1', 'b_temple_s2']) {
      const d = get(n);
      expect(d.ax).toBe(49);
      expect(d.p.w).toBe(98);
      expect(d.ay + 48).toBeLessThan(d.p.h); // the front ground corner
      expect(opaqueRows(d).bottom).toBeGreaterThanOrEqual(d.ay + 47);
    }
  });
  it('the temple grows from stage to stage', () => {
    const h = ['b_temple', 'b_temple_s1', 'b_temple_s2'].map((n) => { const d = get(n); return d.ay + 48 - opaqueRows(d).top; });
    expect(h[1]).toBeGreaterThan(h[0]);
    expect(h[2]).toBeGreaterThanOrEqual(h[1]);
  });
  it('the Lantern is the tallest 3×3 sprite, and its lantern room burns at night', () => {
    const lantern = get('b_lantern');
    const height = (d: SpriteDef) => d.ay + 48 - opaqueRows(d).top;
    for (const d of defs) if (d.name.startsWith('b_') && d.name !== 'b_lantern' && d.p.w === 98) expect(height(lantern)).toBeGreaterThan(height(d));
    const top = opaqueRows(lantern).top;
    expect(glowCount(lantern, top, top + 40)).toBeGreaterThan(40); // the crystal, the panes and the halo
    expect(glowCount(get('b_temple'))).toBeGreaterThan(10); // the rose window, the nave's windows and the lamps
  });
});

describe('The citizens, redrawn', () => {
  it('every citizen frame is 8×12 on its anchor (4, 12), and a variant\'s four frames differ', () => {
    for (let v = 0; v < 6; v++) {
      const frames = [0, 1, 2, 3].map((f) => get(`cit_${v}_${f}`));
      for (const d of frames) { expect([d.p.w, d.p.h, d.ax, d.ay]).toEqual([8, 12, 4, 12]); }
      const keys = new Set(frames.map((d) => Array.from(d.p.data).join(',')));
      expect(keys.size).toBe(4);
    }
  });
  it('the Tallowkin keep their candle eyes on the glow layer; the Grimmen their bone helm', () => {
    expect(glowCount(get('cit_5_0'))).toBe(2);
    const g = get('cit_4_0');
    let bone = 0;
    for (let x = 0; x < 8; x++) if (g.p.get(x, 0) > 0 && hex(g, x, 0) === PAL.bone) bone++;
    expect(bone).toBeGreaterThanOrEqual(3);
  });
  it('the walkers keep their props on the new body', () => {
    expect(hex(get('walker_watchman_0_0'), 7, 3)).toBe(PAL.wood1); // the Watch's rod
    expect(hex(get('walker_pilgrim_0_0'), 7, 0)).toBe(PAL.fire1); // the pilgrim's lit staff
  });
});

describe('Closed by the outline', () => {
  it('no opaque pixel of a drawn sprite touches transparency except through an outline pixel', () => {
    const outline = PAL.outline;
    for (const n of ['b_lantern', 'b_temple', 'b_temple_s1', 'b_temple_s2', 'cit_0_0', 'cit_3_2', 'cit_5_1']) {
      const d = get(n);
      for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) {
        if (d.p.get(x, y) === 0) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d.p.get(x + dx, y + dy) === 0 && x + dx >= 0 && y + dy >= 0 && x + dx < d.p.w && y + dy < d.p.h);
        if (edge) expect(hex(d, x, y)).toBe(outline);
      }
    }
  });
});
