/** Pixel-exact drawing for the game picture (scope reset phase 3-3, docs/ART_BIBLE.md §1): the views' diamonds, the
 *  reach rings, the selection, the grid and the ley lines are made of whole pixels (axis-aligned rects on integer
 *  coordinates), so canvas antialiasing never softens an edge. Each helper adds rects to the current path; the caller
 *  sets fillStyle and calls fill() once, so a ring of a thousand pixels is one fill. */
import { TILE_H, TILE_W } from './sprites';

/** The tile diamond as rows of [x0, x1) relative to its top corner (x 0 is the corner's column): the same pixels as a
 *  ground tile sprite (sprites.ts `diamond`: a pixel is in when its centre is). */
export const DIAMOND_SPANS: [number, number][] = (() => {
  const rows: [number, number][] = [];
  for (let py = 0; py < TILE_H; py++) {
    let x0 = Infinity, x1 = -Infinity;
    for (let px = 0; px < TILE_W; px++) {
      const sx = px + 0.5 - TILE_W / 2, sy = py + 0.5;
      const u = sx / TILE_W + sy / TILE_H, v = sy / TILE_H - sx / TILE_W;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px + 1);
    }
    rows.push([x0 - TILE_W / 2, x1 - TILE_W / 2]);
  }
  return rows;
})();

/** A tile diamond whose top corner is at (x, y), as rects on the current path. */
export function diamondRects(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < DIAMOND_SPANS.length; r++) { const [a, b] = DIAMOND_SPANS[r]; ctx.rect(x + a, y + r, b - a, 1); }
}

/** The pixels of a line from (x0, y0) to (x1, y1), both ends included (Bresenham). */
export function linePixels(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

/** The pixels of a polyline (closed: back to the first point), each pixel once. */
export function polylinePixels(pts: [number, number][], closed: boolean): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<number>();
  const n = closed ? pts.length : pts.length - 1;
  for (let k = 0; k < n; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
    for (const p of linePixels(ax, ay, bx, by)) { const key = (p[0] + 32768) * 65536 + (p[1] + 32768); if (!seen.has(key)) { seen.add(key); out.push(p); } }
  }
  return out;
}

/** Rects for a list of pixels, each grown by `pad` (a halo of 1 behind a line). With `dash` [on, off, offset] only the
 *  pixels whose index along the line falls in an "on" stretch. */
export function pixelRects(ctx: CanvasRenderingContext2D, px: [number, number][], pad = 0, dash?: [number, number, number]): void {
  const period = dash ? dash[0] + dash[1] : 0;
  for (let k = 0; k < px.length; k++) {
    if (dash && (((k + dash[2]) % period) + period) % period >= dash[0]) continue;
    ctx.rect(px[k][0] - pad, px[k][1] - pad, 1 + 2 * pad, 1 + 2 * pad);
  }
}

/** A polygon filled by whole-pixel spans: a pixel is in when its centre is (even-odd), as rects on the current path. */
export function polygonRects(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) xs.push(x0 + ((cy - y0) * (x1 - x0)) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.round(xs[k]), b = Math.round(xs[k + 1]);
      if (b > a) ctx.rect(a, y, b - a, 1);
    }
  }
}
