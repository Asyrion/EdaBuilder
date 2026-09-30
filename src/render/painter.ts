/** Tiny pixel painter backed by an RGBA buffer. Used only at startup to generate sprites. */
import { PAL, hexToRgb, type PalName } from './palette';

const rgbCache = new Map<string, [number, number, number]>();
function rgb(c: PalName | string): [number, number, number] {
  const hex = (PAL as Record<string, string>)[c] ?? c;
  let v = rgbCache.get(hex);
  if (!v) {
    v = hexToRgb(hex);
    rgbCache.set(hex, v);
  }
  return v;
}

export class Painter {
  data: Uint8ClampedArray;
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  px(x: number, y: number, c: PalName | string, a = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = rgb(c);
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    } else {
      const t = a / 255;
      const da = this.data[i + 3] / 255;
      const oa = t + da * (1 - t);
      this.data[i] = (r * t + this.data[i] * da * (1 - t)) / (oa || 1);
      this.data[i + 1] = (g * t + this.data[i + 1] * da * (1 - t)) / (oa || 1);
      this.data[i + 2] = (b * t + this.data[i + 2] * da * (1 - t)) / (oa || 1);
      this.data[i + 3] = oa * 255;
    }
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }
  rect(x: number, y: number, w: number, h: number, c: PalName | string, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: PalName | string): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Fill a convex polygon given as [x,y] pairs. */
  poly(pts: [number, number][], c: PalName | string, a = 255): void {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k]); x < xs[k + 1]; x++) this.px(x, y, c, a);
    }
  }
  circle(cx: number, cy: number, r: number, c: PalName | string, a = 255): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.px(cx + x, cy + y, c, a);
  }
  /** Outline every opaque pixel that borders a transparent one (1px, outside). */
  outline(c: PalName | string = 'outline'): void {
    const src = this.get.bind(this);
    const alpha = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) alpha[y * this.w + x] = src(x, y) > 0 ? 1 : 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (alpha[y * this.w + x]) continue;
        const n = (x > 0 && alpha[y * this.w + x - 1]) || (x < this.w - 1 && alpha[y * this.w + x + 1]) || (y > 0 && alpha[(y - 1) * this.w + x]) || (y < this.h - 1 && alpha[(y + 1) * this.w + x]);
        if (n) this.px(x, y, c);
      }
  }
  blit(other: Painter, ox: number, oy: number): void {
    for (let y = 0; y < other.h; y++)
      for (let x = 0; x < other.w; x++) {
        const i = (y * other.w + x) * 4;
        const a = other.data[i + 3];
        if (a === 0) continue;
        const c = `#${((1 << 24) | (other.data[i] << 16) | (other.data[i + 1] << 8) | other.data[i + 2]).toString(16).slice(1)}`;
        this.px(ox + x, oy + y, c, a);
      }
  }
}

/** Deterministic hash for sprite-variation noise. */
export function h2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
