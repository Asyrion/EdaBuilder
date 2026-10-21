/** Iteration 76 (DESIGN 4.107, the wyrm's wing beat): the flight's frames are cut from one painting by the importer's flap key,
 *  and must share one size and anchor so the body holds still while the wings move; the renderer plays them up, mid, down, mid. */
import { describe, expect, it } from 'vitest';
import { flapFrame } from '../scripts/lib/sprite.mjs';

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
