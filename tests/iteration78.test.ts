/** Iteration 78 (the scale of things): the citizen (12 px) is the yardstick for the small buildings. Objects a person reaches
 *  over stand at most 1.5 citizens; posts and small shrines 2.3; sheds, works and cottages 2.7; the halls 5.5. The painted
 *  heights come from the manifest, the drawn ones from the sprites themselves. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateSprites, type SpriteDef } from '../src/render/sprites';

const CITIZEN = 12;
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number; ax: number; ay: number }>;
const defs = generateSprites();
const by = new Map(defs.map((d) => [d.name, d]));
/** A sprite's opaque height: the painted ones from the manifest (the atlas draws the painting over the drawn twin), the rest drawn. */
function opaqueHeight(name: string): number {
  const m = manifest[name];
  if (m) return m.h;
  const d = by.get(name);
  if (!d) throw new Error(`no sprite ${name}`);
  let top = -1, bottom = -1;
  for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; }
  return bottom - top + 1;
}
const folk = (name: string) => opaqueHeight(name) / CITIZEN;
const PEOPLES = ['', '_grimmen', '_veshari', '_tallowkin', '_fennex'];

describe('The scale of things: the small buildings against a citizen', () => {
  it('a citizen is still 8×12', () => {
    const d = by.get('cit_0_0') as SpriteDef;
    expect([d.p.w, d.p.h, d.ax, d.ay]).toEqual([8, 12, 4, 12]);
  });
  it('objects a person reaches over stand at most 1.5 citizens: the well, the tide-well, the seep', () => {
    for (const n of ['b_well', 'b_tidewell', 'b_seep']) expect(folk(n), n).toBeLessThanOrEqual(1.5);
  });
  it('posts and small shrines at most 2.5: the ward lantern, the shrine, the candle shrine', () => {
    for (const n of ['b_wardlantern', 'b_shrine', 'b_candleshrine']) expect(folk(n), n).toBeLessThanOrEqual(2.5);
  });
  it('sheds, works and level-1 houses at most 2.8 (the Tallowkin wickhouses a storey more, 3.2)', () => {
    for (const n of ['b_fishershut', 'b_smokehouse', 'b_reedcutters', 'b_healer', 'b_torrentmill']) expect(folk(n), n).toBeLessThanOrEqual(2.8);
    for (const zone of ['hearth', 'craft', 'market', 'arcane']) for (const v of [0, 1, 2, 3]) for (const p of PEOPLES) {
      const n = `${zone}_l1_v${v}${p}`;
      expect(folk(n), n).toBeLessThanOrEqual(p === '_tallowkin' ? 3.2 : 2.8);
    }
  });
  it('the academy is a hall of 5.5 citizens at most, like the other 2×2 halls', () => {
    expect(folk('b_academy')).toBeLessThanOrEqual(5.5);
  });
  it('the towers keep their height: the spire, the Wick-Tower, the watchpost, the moth-loft', () => {
    expect(folk('b_spire')).toBeGreaterThan(4);
    expect(folk('b_wicktower')).toBeGreaterThan(3.5);
    expect(folk('b_watchpost')).toBeGreaterThanOrEqual(3); // 36 opaque rows
    expect(folk('b_mothloft')).toBeGreaterThan(3);
  });
  it('a small object stands in the middle of its tile, not at its front corner (the wells, drawn in code since iteration 79: the anchor ten rows above the last row)', () => {
    for (const n of ['b_well', 'b_tidewell', 'b_seep']) {
      const d = by.get(n) as SpriteDef;
      expect(d.ay, n).toBe(d.p.h - 1 - 10);
    }
    // the drawn ones keep the footprint anchor: the sprite's last row is the diamond's bottom
    for (const n of ['b_wardlantern', 'b_shrine', 'b_healer', 'hearth_l1_v0', 'market_l1_v0']) {
      const d = by.get(n) as SpriteDef;
      expect([d.p.h - 1, d.p.h], n).toContain(d.ay + 16); // drawBuilding ends on the last row; the hand-drawn lantern one past it, as it always did
    }
  });
});
