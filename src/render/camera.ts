import { MAP_H, MAP_W } from '../sim/types';
import { tileToWorld, worldToTile } from './iso';

export class Camera {
  /** World-space centre (native pixels). */
  cx = 0;
  cy = 0;
  zoom = 2;
  viewW = 800; // screen px
  viewH = 600;
  constructor() {
    const [wx, wy] = tileToWorld(MAP_W / 2, MAP_H / 2);
    this.cx = wx;
    this.cy = wy;
  }
  get nativeW(): number {
    return Math.ceil(this.viewW / this.zoom);
  }
  get nativeH(): number {
    return Math.ceil(this.viewH / this.zoom);
  }
  /** World px of the top-left corner of the view (integer for crisp rendering). */
  get left(): number {
    return Math.round(this.cx - this.nativeW / 2);
  }
  get top(): number {
    return Math.round(this.cy - this.nativeH / 2);
  }
  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.left + sx / this.zoom, this.top + sy / this.zoom];
  }
  screenToTile(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const [u, v] = worldToTile(wx, wy);
    return [Math.floor(u), Math.floor(v)];
  }
  pan(dxScreen: number, dyScreen: number): void {
    this.cx -= dxScreen / this.zoom;
    this.cy -= dyScreen / this.zoom;
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
