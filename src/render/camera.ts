import { MAP_H, MAP_W } from '../sim/types';
import { tileToWorld, worldToTile } from './iso';

/** The device pixels per art pixel for each zoom level 1..4 at a device pixel ratio (scope reset phase 3-3): round(level ×
 *  dpr), at least one more than the level below, so every level is a whole number of device pixels and the grid stays even
 *  on a 125 % or 150 % display (at 1.5: 2, 3, 5, 6). */
export function zoomScales(dpr: number): number[] {
  const out: number[] = [];
  for (let l = 1; l <= 4; l++) out.push(Math.max(out.length ? out[out.length - 1] + 1 : 1, Math.round(l * dpr)));
  return out;
}

export class Camera {
  /** World-space centre (native pixels). */
  cx = 0;
  cy = 0;
  /** The player's zoom level, 1..4; the device scale is `scale`. */
  zoom = 2;
  /** Device pixels per CSS pixel (window.devicePixelRatio, set by the renderer's resize). */
  dpr = 1;
  viewW = 800; // device px
  viewH = 600;
  /** Device pixels per art pixel: a whole number at every level and ratio. */
  get scale(): number {
    return zoomScales(this.dpr)[this.zoom - 1];
  }
  constructor() {
    const [wx, wy] = tileToWorld(MAP_W / 2, MAP_H / 2);
    this.cx = wx;
    this.cy = wy;
  }
  get nativeW(): number {
    return Math.ceil(this.viewW / this.scale);
  }
  get nativeH(): number {
    return Math.ceil(this.viewH / this.scale);
  }
  /** The view in CSS pixels, the space of mouse events. */
  get cssW(): number {
    return this.viewW / this.dpr;
  }
  get cssH(): number {
    return this.viewH / this.dpr;
  }
  /** World px of the top-left corner of the view (integer for crisp rendering). */
  get left(): number {
    return Math.round(this.cx - this.nativeW / 2);
  }
  get top(): number {
    return Math.round(this.cy - this.nativeH / 2);
  }
  /** A point in CSS pixels (a mouse event's clientX/Y) to world pixels. */
  screenToWorld(sx: number, sy: number): [number, number] {
    const k = this.dpr / this.scale;
    return [this.left + sx * k, this.top + sy * k];
  }
  screenToTile(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const [u, v] = worldToTile(wx, wy);
    return [Math.floor(u), Math.floor(v)];
  }
  /** Pan by a drag in CSS pixels. */
  pan(dxScreen: number, dyScreen: number): void {
    this.cx -= (dxScreen * this.dpr) / this.scale;
    this.cy -= (dyScreen * this.dpr) / this.scale;
    this.clamp();
  }
  setZoom(z: number, anchorSx?: number, anchorSy?: number): void {
    z = Math.max(1, Math.min(4, Math.round(z)));
    if (z === this.zoom) return;
    if (anchorSx !== undefined && anchorSy !== undefined) {
      const [wx, wy] = this.screenToWorld(anchorSx, anchorSy);
      this.zoom = z;
      const [wx2, wy2] = this.screenToWorld(anchorSx, anchorSy);
      this.cx += wx - wx2;
      this.cy += wy - wy2;
    } else this.zoom = z;
    this.clamp();
  }
  centerOnTile(x: number, y: number): void {
    const [wx, wy] = tileToWorld(x, y);
    this.cx = wx;
    this.cy = wy + 8;
    this.clamp();
  }
  clamp(): void {
    const [l] = tileToWorld(0, MAP_H);
    const [r] = tileToWorld(MAP_W, 0);
    const [, t] = tileToWorld(0, 0);
    const [, b] = tileToWorld(MAP_W, MAP_H);
    this.cx = Math.max(l, Math.min(r, this.cx));
    this.cy = Math.max(t, Math.min(b, this.cy));
  }
}
