/** Iteration 79 (the paintings redrawn in code, part 1): the three wells, the four level-2 hearths, the four level-1 craft houses
 *  and the depot are drawn by the procedural painter after their paintings; the paintings are switched off (`off: true`) and no
 *  longer in the manifest. The redraws keep the citizen yardstick of iteration 78. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateSprites, type SpriteDef } from '../src/render/sprites';
import { PAL } from '../src/render/palette';

const REDRAWN = ['b_well', 'b_seep', 'b_tidewell', 'b_depot', 'hearth_l2_v0', 'hearth_l2_v1', 'hearth_l2_v2', 'hearth_l2_v3', 'craft_l1_v0', 'craft_l1_v1', 'craft_l1_v2', 'craft_l1_v3'];
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number }>;
const sources = JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as { name: string; off?: boolean }[];
const defs = generateSprites();
const by = new Map(defs.map((d) => [d.name, d]));
const get = (n: string): SpriteDef => { const d = by.get(n); if (!d) throw new Error(`no sprite ${n}`); return d; };
function opaqueHeight(d: SpriteDef): number {
  let top = -1, bottom = -1;
  for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; }
  return bottom - top + 1;
}
const hex = (d: SpriteDef, x: number, y: number) => { const i = (y * d.p.w + x) * 4; return '#' + [0, 1, 2].map((k) => d.p.data[i + k].toString(16).padStart(2, '0')).join(''); };
const has = (d: SpriteDef, colour: string) => { for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0 && hex(d, x, y) === colour) return true; return false; };

describe('The paintings redrawn in code, part 1', () => {
  it('the twelve paintings are off: their entries say so, and the manifest no longer carries them', () => {
    for (const n of REDRAWN) {
      expect(sources.find((e) => e.name === n)?.off, n).toBe(true);
      expect(manifest[n], n).toBeUndefined();
    }
    expect(sources.filter((e) => e.off).length).toBe(12);
  });
  it('the redraws keep the citizen yardstick: the wells 1.5, the crafts 2.8, the hearths 4, the depot 5.5', () => {
    for (const n of ['b_well', 'b_seep', 'b_tidewell']) expect(opaqueHeight(get(n)) / 12, n).toBeLessThanOrEqual(1.5);
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`craft_l1_v${v}`)) / 12).toBeLessThanOrEqual(2.8);
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`hearth_l2_v${v}`)) / 12).toBeLessThanOrEqual(4);
    expect(opaqueHeight(get('b_depot')) / 12).toBeLessThanOrEqual(5.5);
  });
  it('a well stands in the middle of its tile: its anchor ten rows above its last row', () => {
    for (const n of ['b_well', 'b_seep', 'b_tidewell']) { const d = get(n); expect(d.ay, n).toBe(d.p.h - 1 - 10); expect(d.ax).toBe(17); }
  });
  it("the paintings' materials are on the redraws: brick on the plank house's chimney, the log cabins' seams, the tide-well's glowing water", () => {
    expect(has(get('hearth_l2_v0'), PAL.brick1)).toBe(true); // the plank house's brick chimney (the depot's is stone since iteration 80, as its painting has)
    const cabin = get('hearth_l2_v1');
    // a seam under every third log row on the left face: at least three outline-tinted rows below the eaves on one column
    let seams = 0;
    for (let y = 0; y < cabin.p.h; y++) if (cabin.p.get(8, y) > 0 && hex(cabin, 8, y) !== PAL.wood1 && hex(cabin, 8, y) !== PAL.outline) seams++;
    expect(seams).toBeGreaterThanOrEqual(3);
    expect(get('b_tidewell').glow && (get('b_tidewell').glow as { get: (x: number, y: number) => number }).get(17, 12)).toBeGreaterThan(0);
  });
  it('every zone sprite of every people still exists, with the redrawn hearths and crafts among them', () => {
    for (const p of ['', '_grimmen', '_veshari', '_tallowkin']) for (const z of ['hearth', 'craft', 'market', 'arcane']) for (const l of [1, 2, 3]) for (const v of [0, 1, 2, 3]) expect(by.has(`${z}_l${l}_v${v}${p}`), `${z}_l${l}_v${v}${p}`).toBe(true);
  });
});
