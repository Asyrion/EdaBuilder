/** Iteration 81 (the twelve redrawn again, each after its own painting): the level-2 hearths, the level-1 crafts and the depot
 *  are composed by hand in src/render/painted.ts (boxes, gables along either axis, porches, verandas, dormers, chimneys and
 *  props where the painting has them), not built from one spec; the citizen yardstick holds; the outline closes them. */
import { describe, expect, it } from 'vitest';
import { generateSprites, type SpriteDef } from '../src/render/sprites';
import { PAL } from '../src/render/palette';
import { drawHearthL2v0, drawHearthL2v1, drawHearthL2v2, drawHearthL2v3, drawCraftL1v0, drawCraftL1v2, drawDepot } from '../src/render/painted';

const defs = generateSprites();
const by = new Map(defs.map((d) => [d.name, d]));
const get = (n: string): SpriteDef => { const d = by.get(n); if (!d) throw new Error(`no sprite ${n}`); return d; };
const hex = (d: { p: { w: number; data: Uint8ClampedArray } }, x: number, y: number) => { const i = (y * d.p.w + x) * 4; return '#' + [0, 1, 2].map((k) => d.p.data[i + k].toString(16).padStart(2, '0')).join(''); };
function opaqueHeight(d: SpriteDef): number { let top = -1, bottom = -1; for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; } return bottom - top + 1; }
const count = (d: { p: { w: number; h: number; data: Uint8ClampedArray; get: (x: number, y: number) => number } }, colour: string) => { let n = 0; for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0 && hex(d, x, y) === colour) n++; return n; };

describe('The twelve redrawn by hand after their paintings', () => {
  it('the atlas draws the hand-drawn houses for the Vellish look and the spec builds for the peoples', () => {
    expect(get('hearth_l2_v0').p.h).toBe(drawHearthL2v0().p.h);
    expect(get('craft_l1_v2').p.h).toBe(drawCraftL1v2().p.h);
    expect(get('b_depot').p.w).toBe(66);
    for (const p of ['_grimmen', '_veshari', '_tallowkin']) expect(get(`hearth_l2_v0${p}`).p.h).not.toBe(drawHearthL2v0().p.h);
  });
  it('the four hearths differ in composition: their heights, roof colours and chimney kinds are not all alike', () => {
    const hs = [0, 1, 2, 3].map((v) => opaqueHeight(get(`hearth_l2_v${v}`)));
    expect(new Set(hs).size).toBeGreaterThanOrEqual(3);
    expect(count(drawHearthL2v0(), PAL.brick1)).toBeGreaterThan(0); // the brick chimney
    expect(count(drawHearthL2v1(), PAL.brick1)).toBe(0); // the stone chimney
    expect(count(drawHearthL2v2(), PAL.tile1)).toBeGreaterThan(20); // the red tile roof
    expect(count(drawHearthL2v3(), PAL.tile1)).toBe(0); // the dark shingle roof
  });
  it('the yardstick holds: the hearths under 4 citizens, the crafts under 2.8, the depot under 5.5', () => {
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`hearth_l2_v${v}`)) / 12).toBeLessThanOrEqual(4);
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`craft_l1_v${v}`)) / 12).toBeLessThanOrEqual(2.8);
    expect(opaqueHeight(get('b_depot')) / 12).toBeLessThanOrEqual(5.5);
  });
  it("the paintings' named parts are there: the workshop's parchment sign, the green roof, the depot's two roof colours and its striped awnings", () => {
    expect(count(drawCraftL1v0(), PAL.parchment)).toBeGreaterThan(0);
    expect(count(drawCraftL1v2(), PAL.green1)).toBeGreaterThan(20);
    const depot = drawDepot();
    expect(count(depot, PAL.slate1)).toBeGreaterThan(8);
    expect(count(depot, PAL.tile1)).toBeGreaterThan(20);
    expect(count(depot, PAL.cloth2)).toBeGreaterThan(4);
    expect(count(depot, PAL.cloth3)).toBeGreaterThan(4);
  });
  it('the anchor is the tile\'s top corner, as drawBuilding\'s: 17 across, 17 rows above the last for a 1×1', () => {
    for (const n of ['hearth_l2_v0', 'hearth_l2_v1', 'craft_l1_v0', 'craft_l1_v3']) { const d = get(n); expect(d.ax).toBe(17); expect(d.ay).toBe(d.p.h - 17); }
    const depot = get('b_depot'); expect(depot.ax).toBe(33); expect(depot.ay).toBe(depot.p.h - 33);
  });
  it('the outline closes every hand-drawn sprite', () => {
    for (const n of ['hearth_l2_v0', 'hearth_l2_v1', 'hearth_l2_v2', 'hearth_l2_v3', 'craft_l1_v0', 'craft_l1_v1', 'craft_l1_v2', 'craft_l1_v3', 'b_depot']) {
      const d = get(n);
      for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) {
        if (d.p.get(x, y) === 0) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < d.p.w && y + dy < d.p.h && d.p.get(x + dx, y + dy) === 0);
        if (edge) expect(hex(d, x, y), `${n} at ${x},${y}`).toBe(PAL.outline);
      }
    }
  });
});
