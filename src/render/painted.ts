/** The paintings redrawn by hand, each after its own painting (iteration 81). Iteration 79 built the redraws from drawBuilding
 *  specs, so every house had the same box, roof line and window grid; the paintings differ in composition. Here each sprite is
 *  a short script of placed parts on the tile: boxes with their own footprint and wall height, gable roofs whose ridge runs
 *  along either axis, porches, verandas, dormers, chimneys where the painting has them, and the props at its sides. The style
 *  is the set's: 2:1 iso, the palette, flat two-tone faces (left dark, right lit), the 1 px outline, the front on the right
 *  face. The anchor is the tile's top corner, as drawBuilding's. */
import { Painter, h2 } from './painter';
import type { PalName } from './palette';

type Col = PalName | string;
type Pt = [number, number];
export interface Drawn { p: Painter; glow: Painter; ax: number; ay: number }
export type WallKind = 'log' | 'timber' | 'plaster' | 'stone' | 'brick' | 'whitewash' | 'halftimber';
export type RoofKind = 'shingle' | 'tile' | 'slate' | 'thatch' | 'moss' | 'green' | 'darkshingle';

const WALL: Record<WallKind, { l: Col; r: Col }> = {
  log: { l: 'wood1', r: 'wood2' },
  timber: { l: 'wood1', r: 'wood2' },
  plaster: { l: 'plaster2', r: 'plaster' },
  halftimber: { l: 'plaster2', r: 'plaster' },
  stone: { l: 'stone1', r: 'stone2' },
  brick: { l: 'brick2', r: 'brick1' },
  whitewash: { l: 'whitewash2', r: 'whitewash' },
};
const ROOF: Record<RoofKind, { a: Col; b: Col; d: Col }> = {
  shingle: { a: 'shingle1', b: 'shingle2', d: 'outline' },
  darkshingle: { a: 'shingle2', b: 'outline', d: 'shingle1' },
  tile: { a: 'tile1', b: 'tile2', d: 'outline' },
  slate: { a: 'slate1', b: 'slate2', d: 'outline' },
  thatch: { a: 'thatch1', b: 'thatch2', d: 'thatch2' },
  moss: { a: 'mossRoof', b: 'mossRoof2', d: 'mossRoof2' },
  green: { a: 'green1', b: 'green2', d: 'green2' },
};

function inPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A tile to draw on: tile coordinates (tx, ty) in [0, 1] along the two ground axes and z up, mapped to the sprite's pixels.
 *  The right face of a box is its tx = tx1 side (toward +x, the road side), the left face its ty = ty1 side. */
export class Iso {
  constructor(public p: Painter, public glow: Painter, public ox: number, public y0: number, public seed = 0) {}
  pt(tx: number, ty: number, z = 0): Pt { return [this.ox + 16 + (tx - ty) * 16, this.y0 + (tx + ty) * 8 - z]; }
  /** A polygon of tile points (tx, ty, z). */
  poly(pts: [number, number, number][], c: Col, a = 255): void { this.p.poly(pts.map(([x, y, z]) => this.pt(x, y, z)), c, a); }
  /** The ground shadow of a footprint. */
  shadow(tx0: number, ty0: number, tx1: number, ty1: number): void { this.poly([[tx0, ty0, 0], [tx1, ty0, 0], [tx1, ty1, 0], [tx0, ty1, 0]], 'shadow', 90); }
  /** A box with its own footprint and wall height; the roof is drawn apart. Returns nothing: the faces are textured here. */
  box(tx0: number, ty0: number, tx1: number, ty1: number, h: number, wall: WallKind, opts: { storeyLine?: number; braces?: boolean } = {}): void {
    const { p } = this;
    const wc = WALL[wall];
    const L = this.pt(tx0, ty1), B = this.pt(tx1, ty1), R = this.pt(tx1, ty0), T = this.pt(tx0, ty0);
    const up = (q: Pt, d: number): Pt => [q[0], q[1] - d];
    p.poly([L, B, up(B, h), up(L, h)], wc.l);
    p.poly([B, R, up(R, h), up(B, h)], wc.r);
    p.poly([up(T, h), up(R, h), up(B, h), up(L, h)], wc.r);
    const tex = (x0: number, y0: number, x1: number, y1: number, right: boolean) => {
      const len = Math.abs(x1 - x0);
      for (let i = 0; i <= len; i++) {
        const x = x0 + (x1 > x0 ? i : -i);
        const gy = y0 + ((y1 - y0) * i) / len;
        for (let d = 1; d < h; d++) {
          const y = Math.floor(gy) - d;
          if (wall === 'log') {
            if (d % 3 === 0) p.px(x, y, right ? 'wood1' : 'outline', 130);
            if (d % 3 === 1 && i % 9 === 4) p.px(x, y, 'wood3', 110);
          } else if (wall === 'timber') {
            if (d % 5 === 0) p.px(x, y, right ? 'wood1' : 'outline', 110);
            if (i % 6 === 0) p.px(x, y, 'wood1', 120);
          } else if (wall === 'stone') {
            if (d % 3 === 0 || (i + (d % 6 >= 3 ? 2 : 0)) % 5 === 0) p.px(x, y, right ? 'stone1' : 'outline', 90);
          } else if (wall === 'brick') {
            if (d % 3 === 0 || (i + (d % 6 >= 3 ? 2 : 0)) % 4 === 0) p.px(x, y, right ? 'brick2' : 'outline', 110);
          } else if (wall === 'halftimber') {
            if (d % 6 === 0 || i % 7 === 0) p.px(x, y, 'wood1', 200);
            if (opts.braces && (i + d) % 7 === 3 && d % 6 !== 0) p.px(x, y, 'wood1', 90);
          } else if (wall === 'plaster' || wall === 'whitewash') {
            if (h2(x, y, this.seed) < 0.05) p.px(x, y, right ? wc.l : 'outline', 60);
          }
          if (opts.storeyLine && d === opts.storeyLine) p.px(x, y, 'outline', 150);
        }
      }
    };
    tex(L[0], L[1], B[0], B[1], false);
    tex(B[0], B[1], R[0], R[1], true);
    p.line(L[0], L[1], B[0], B[1], 'outline');
    p.line(B[0], B[1], R[0], R[1], 'outline');
    p.line(B[0], B[1], B[0], B[1] - h, 'outline');
  }
  /** A pixel loop over a roof slope with the set's textures. */
  private slope(poly: Pt[], roof: RoofKind, dark: boolean, s: number): void {
    const rc = ROOF[roof];
    const { p } = this;
    this.p.poly(poly, dark ? rc.b : rc.a);
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const [x, y] of poly) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    for (let y = Math.ceil(minY); y <= maxY; y++)
      for (let x = Math.floor(minX); x <= maxX; x++) {
        if (!inPoly(x + 0.5, y + 0.5, poly)) continue;
        const d: Col = dark ? rc.d : rc.b;
        if (roof === 'thatch') { if ((y + (x >> 2)) % 4 === 0 && h2(x, y, s) < 0.7) p.px(x, y, d); }
        else if (roof === 'shingle' || roof === 'tile' || roof === 'darkshingle') { if (y % 3 === 0 && (x + (y % 6 === 0 ? 0 : 2)) % 4 !== 0) p.px(x, y, d); }
        else if (roof === 'slate') { if ((x + y) % 5 === 0) p.px(x, y, d, 140); }
        else if (roof === 'moss' || roof === 'green') { if (h2(x, y, s) < 0.2) p.px(x, y, dark ? rc.a : 'leaf3'); if (roof === 'moss' && h2(x, y, s + 5) < 0.04) p.px(x, y, 'flower1'); }
      }
  }
  /** A gable roof over a box: the ridge runs along the x axis (the gable shows on the right face) or the y axis (the gable
   *  shows on the left face). The eaves overhang by e tiles on the slope sides and g at the gable ends; the wall top is at z = h. */
  gable(tx0: number, ty0: number, tx1: number, ty1: number, h: number, rise: number, axis: 'x' | 'y', roof: RoofKind, wall: WallKind, e = 0.08, g = 0.06, trim?: Col): void {
    const { p } = this;
    const wc = WALL[wall];
    const z = h - 1;
    if (axis === 'x') {
      const tym = (ty0 + ty1) / 2;
      // the gable end walls (the right one visible, the back one behind)
      p.poly([this.pt(tx1, ty0, h), this.pt(tx1, ty1, h), this.pt(tx1, tym, h + rise)], wc.r);
      p.poly([this.pt(tx0, ty0, h), this.pt(tx0, ty1, h), this.pt(tx0, tym, h + rise)], wc.l);
      const r1 = this.pt(tx0 - g, tym, h + rise), r2 = this.pt(tx1 + g, tym, h + rise);
      this.slope([this.pt(tx0 - g, ty0 - e, z), this.pt(tx1 + g, ty0 - e, z), r2, r1], roof, false, this.seed + 1);
      this.slope([this.pt(tx0 - g, ty1 + e, z), this.pt(tx1 + g, ty1 + e, z), r2, r1], roof, true, this.seed + 2);
      p.line(r1[0], r1[1], r2[0], r2[1], 'outline');
      const fl = this.pt(tx0 - g, ty1 + e, z), fb = this.pt(tx1 + g, ty1 + e, z), br = this.pt(tx1 + g, ty0 - e, z);
      p.line(fl[0], fl[1], fb[0], fb[1], 'outline');
      p.line(fb[0], fb[1], br[0], br[1], 'outline');
      p.line(fl[0], fl[1], r1[0], r1[1], 'outline');
      if (trim) { p.line(fb[0], fb[1], r2[0], r2[1], trim); p.line(br[0], br[1], r2[0], r2[1], trim); }
      else { p.line(fb[0], fb[1], r2[0], r2[1], 'outline'); p.line(br[0], br[1], r2[0], r2[1], 'outline'); }
    } else {
      const txm = (tx0 + tx1) / 2;
      p.poly([this.pt(tx0, ty1, h), this.pt(tx1, ty1, h), this.pt(txm, ty1, h + rise)], wc.l);
      p.poly([this.pt(tx0, ty0, h), this.pt(tx1, ty0, h), this.pt(txm, ty0, h + rise)], wc.r);
      const r1 = this.pt(txm, ty0 - g, h + rise), r2 = this.pt(txm, ty1 + g, h + rise);
      this.slope([this.pt(tx0 - e, ty0 - g, z), this.pt(tx0 - e, ty1 + g, z), r2, r1], roof, true, this.seed + 1);
      this.slope([this.pt(tx1 + e, ty0 - g, z), this.pt(tx1 + e, ty1 + g, z), r2, r1], roof, false, this.seed + 2);
      p.line(r1[0], r1[1], r2[0], r2[1], 'outline');
      const lb = this.pt(tx0 - e, ty1 + g, z), bb = this.pt(tx1 + e, ty1 + g, z), rb = this.pt(tx1 + e, ty0 - g, z);
      p.line(lb[0], lb[1], bb[0], bb[1], 'outline');
      p.line(bb[0], bb[1], rb[0], rb[1], 'outline');
      p.line(rb[0], rb[1], r1[0], r1[1], 'outline');
      if (trim) { p.line(lb[0], lb[1], r2[0], r2[1], trim); p.line(bb[0], bb[1], r2[0], r2[1], trim); }
      else { p.line(lb[0], lb[1], r2[0], r2[1], 'outline'); p.line(bb[0], bb[1], r2[0], r2[1], 'outline'); }
    }
  }
  /** A lean-to roof projecting from the right face (tx = tx1) over ty0..ty1, out by depth, from z top down drop. */
  leanToRight(tx1: number, ty0: number, ty1: number, ztop: number, depth: number, drop: number, roof: RoofKind, posts = true): void {
    const { p } = this;
    const rc = ROOF[roof];
    this.slope([this.pt(tx1, ty0, ztop), this.pt(tx1, ty1, ztop), this.pt(tx1 + depth, ty1, ztop - drop), this.pt(tx1 + depth, ty0, ztop - drop)], roof, false, this.seed + 3);
    const a = this.pt(tx1 + depth, ty0, ztop - drop), b = this.pt(tx1 + depth, ty1, ztop - drop);
    p.line(a[0], a[1], b[0], b[1], rc.b);
    p.line(a[0], a[1] + 1, b[0], b[1] + 1, 'outline');
    if (posts) for (const t of [ty0 + 0.04, ty1 - 0.04]) { const q = this.pt(tx1 + depth - 0.02, t, 0); const top = this.pt(tx1 + depth - 0.02, t, ztop - drop - 1); p.rect(q[0], top[1], 1, q[1] - top[1], 'wood1'); }
  }
  /** A lean-to roof projecting from the left face (ty = ty1) over tx0..tx1. */
  leanToLeft(ty1: number, tx0: number, tx1: number, ztop: number, depth: number, drop: number, roof: RoofKind, posts = true): void {
    const { p } = this;
    const rc = ROOF[roof];
    this.slope([this.pt(tx0, ty1, ztop), this.pt(tx1, ty1, ztop), this.pt(tx1, ty1 + depth, ztop - drop), this.pt(tx0, ty1 + depth, ztop - drop)], roof, true, this.seed + 3);
    const a = this.pt(tx0, ty1 + depth, ztop - drop), b = this.pt(tx1, ty1 + depth, ztop - drop);
    p.line(a[0], a[1], b[0], b[1], rc.d);
    p.line(a[0], a[1] + 1, b[0], b[1] + 1, 'outline');
    if (posts) for (const t of [tx0 + 0.04, tx1 - 0.04]) { const q = this.pt(t, ty1 + depth - 0.02, 0); const top = this.pt(t, ty1 + depth - 0.02, ztop - drop - 1); p.rect(q[0], top[1], 1, q[1] - top[1], 'wood1'); }
  }
  /** A window on a face at a tile point, w × hh pixels up from z. */
  window(tx: number, ty: number, z: number, lit = true, w = 2, hh = 3, frame?: Col): void {
    const [x, y] = this.pt(tx, ty, z);
    if (frame) this.p.rect(x - 1, y - hh - 1, w + 2, hh + 2, frame);
    this.p.rect(x, y - hh, w, hh, 'windowDark');
    if (lit) this.glow.rect(x, y - hh, w, hh, 'windowLit');
  }
  /** A plank door on the right face at ty (3 wide, h tall), with a warm doorway glow; arched: a rounded top. */
  door(tx: number, ty: number, h = 5, kind: 'plank' | 'arched' | 'round' = 'plank', c: Col = 'wood1'): void {
    const [x, y] = this.pt(tx, ty, 0);
    if (kind === 'round') {
      this.p.circle(x + 1, y - 3, 3, 'outline');
      this.p.circle(x + 1, y - 3, 2, c);
      this.p.px(x + 2, y - 3, 'gold');
      return;
    }
    for (let dx = 0; dx < 3; dx++) for (let dy = 1; dy <= h; dy++) this.p.px(x + dx, y - dy, dx === 1 ? c : 'outline');
    if (kind === 'arched') { this.p.px(x, y - h, 'outline'); this.p.px(x + 2, y - h, 'outline'); this.p.px(x + 1, y - h - 1, 'outline'); this.p.px(x + 1, y - h, c); }
    this.glow.px(x + 1, y - 3, 'lampWarm');
  }
  chimney(tx: number, ty: number, zTop: number, h: number, kind: 'stone' | 'brick' = 'stone', smoke = true): void {
    const [x, y] = this.pt(tx, ty, zTop);
    const a: Col = kind === 'brick' ? 'brick1' : 'stone1', b: Col = kind === 'brick' ? 'brick2' : 'outline', cap: Col = kind === 'brick' ? 'brick2' : 'stone2';
    this.p.rect(x - 1, y - h, 3, h, a);
    this.p.rect(x - 1, y - h, 1, h, b);
    this.p.rect(x - 1, y - h - 1, 3, 1, cap);
    if (smoke) { this.p.px(x + 1, y - h - 3, 'smoke'); this.p.px(x + 2, y - h - 5, 'smoke'); }
  }
  dormer(tx: number, ty: number, z: number, roof: RoofKind, wall: WallKind, axisX = true): void {
    const [x, y] = this.pt(tx, ty, z);
    const wc = WALL[wall], rc = ROOF[roof];
    this.p.rect(x - 2, y - 3, 5, 4, axisX ? wc.l : wc.r);
    this.p.rect(x - 2, y - 3, 1, 4, 'outline');
    this.p.rect(x, y - 2, 2, 2, 'windowDark');
    this.glow.rect(x, y - 2, 2, 2, 'windowLit');
    this.p.rect(x - 3, y - 5, 7, 2, rc.a);
    this.p.rect(x - 3, y - 4, 7, 1, rc.b);
  }
  /** A railed deck in front of the right face over ty0..ty1, out by depth. */
  veranda(tx1: number, ty0: number, ty1: number, depth: number, rails = true): void {
    const { p } = this;
    this.poly([[tx1, ty0, 1], [tx1, ty1, 1], [tx1 + depth, ty1, 1], [tx1 + depth, ty0, 1]], 'wood2');
    this.poly([[tx1, ty1, 1], [tx1 + depth, ty1, 1], [tx1 + depth, ty1, 0], [tx1, ty1, 0]], 'wood1');
    this.poly([[tx1 + depth, ty0, 1], [tx1 + depth, ty1, 1], [tx1 + depth, ty1, 0], [tx1 + depth, ty0, 0]], 'wood1');
    if (rails) {
      const a = this.pt(tx1 + depth, ty0, 1), b = this.pt(tx1 + depth, ty1, 1);
      const n = Math.max(2, Math.round(Math.abs(b[0] - a[0]) / 3));
      for (let k = 0; k <= n; k++) { const x = Math.round(a[0] + ((b[0] - a[0]) * k) / n), y = Math.round(a[1] + ((b[1] - a[1]) * k) / n); p.rect(x, y - 5, 1, 5, 'wood1'); }
      p.line(a[0], a[1] - 5, b[0], b[1] - 5, 'wood3');
      p.line(a[0], a[1] - 3, b[0], b[1] - 3, 'wood3');
    }
  }
  /** A railing across the right face at height z over ty0..ty1 (a balcony). */
  balcony(tx1: number, ty0: number, ty1: number, z: number, cloths = false): void {
    const a = this.pt(tx1 + 0.03, ty0, z), b = this.pt(tx1 + 0.03, ty1, z);
    this.p.line(a[0], a[1] - 3, b[0], b[1] - 3, 'wood3');
    this.p.line(a[0], a[1], b[0], b[1], 'wood1');
    const n = Math.max(2, Math.round(Math.abs(b[0] - a[0]) / 3));
    for (let k = 0; k <= n; k++) { const x = Math.round(a[0] + ((b[0] - a[0]) * k) / n), y = Math.round(a[1] + ((b[1] - a[1]) * k) / n); this.p.rect(x, y - 3, 1, 3, 'wood1'); if (cloths && k % 2 === 1 && k < n) this.p.rect(x + 1, y - 3, 2, 2, k % 4 === 1 ? 'cloth2' : 'cloth4'); }
  }
  sign(tx: number, ty: number, z: number, w = 5): void {
    const [x, y] = this.pt(tx, ty, z);
    this.p.rect(x - 1, y - 4, w + 2, 4, 'outline');
    this.p.rect(x, y - 3, w, 2, 'parchment');
    this.p.px(x + 1, y - 3, 'wood1'); this.p.px(x + 3, y - 2, 'wood1');
  }
  flowerBox(tx: number, ty: number, z: number, w = 4): void {
    const [x, y] = this.pt(tx, ty, z);
    this.p.rect(x, y, w, 1, 'wood1');
    const cols: Col[] = ['flower1', 'flower2', 'leaf3', 'flower2'];
    for (let k = 0; k < w; k++) this.p.px(x + k, y - 1, cols[k % 4]);
  }
  lantern(tx: number, ty: number, z: number): void {
    const [x, y] = this.pt(tx, ty, z);
    this.p.px(x, y - 3, 'ironDark');
    this.p.rect(x, y - 2, 1, 2, 'lampWarm');
    this.glow.rect(x - 1, y - 3, 3, 4, 'lampWarm', 230);
  }
  bush(tx: number, ty: number, r = 3, c: Col = 'leaf2', hi: Col = 'leaf3'): void {
    const [x, y] = this.pt(tx, ty, 0);
    this.p.circle(x, y - r + 1, r, c);
    this.p.circle(x - 1, y - r, 1, hi);
  }
  tree(tx: number, ty: number, kind: 'round' | 'conifer' | 'autumn' | 'birch', size = 1): void {
    const [x, y] = this.pt(tx, ty, 0);
    if (kind === 'conifer') {
      this.p.rect(x, y - 2, 1, 2, 'trunk');
      const rows = 7 + size * 2;
      for (let k = 0; k < rows; k++) { const hw = Math.floor(k / 2.5); this.p.rect(x - hw, y - 2 - rows + k, 2 * hw + 1, 1, k % 2 ? 'leaf2' : 'leaf1'); }
      return;
    }
    const trunk: Col = kind === 'birch' ? 'whitewash' : 'trunk';
    const th = 3 + size;
    this.p.rect(x, y - th, 1, th, trunk);
    if (kind === 'birch') { this.p.px(x, y - 2, 'stone2'); this.p.px(x, y - th + 1, 'stone2'); }
    const cols: Col[] = kind === 'autumn' ? ['leafAutumn', 'thatch1', 'copper'] : kind === 'birch' ? ['leaf3', 'leaf2', 'glimleaf'] : ['leaf2', 'leaf1', 'leaf3'];
    const r = 3 + size;
    this.p.circle(x, y - th - r + 1, r, cols[0]);
    this.p.circle(x - 1, y - th - r, Math.max(1, r - 2), cols[2]);
    this.p.circle(x + 1, y - th - r + 2, Math.max(1, r - 2), cols[1]);
  }
  /** Pickets along the ground from (txa, tya) to (txb, tyb). */
  fence(txa: number, tya: number, txb: number, tyb: number, n = 5): void {
    const a = this.pt(txa, tya, 0), b = this.pt(txb, tyb, 0);
    this.p.line(a[0], a[1] - 2, b[0], b[1] - 2, 'wood2');
    for (let k = 0; k <= n; k++) { const x = Math.round(a[0] + ((b[0] - a[0]) * k) / n), y = Math.round(a[1] + ((b[1] - a[1]) * k) / n); this.p.rect(x, y - 3, 1, 4, 'wood1'); this.p.px(x, y - 4, 'wood3'); }
  }
  woodpile(tx: number, ty: number): void {
    const [x, y] = this.pt(tx, ty, 0);
    for (const [dx, dy] of [[0, 0], [2, 0], [4, 0], [1, -2], [3, -2]]) { this.p.circle(x + dx, y + dy - 1, 1, 'wood2'); this.p.px(x + dx, y + dy - 1, 'wood3'); }
  }
  barrel(tx: number, ty: number): void {
    const [x, y] = this.pt(tx, ty, 0);
    this.p.rect(x, y - 4, 3, 4, 'wood2');
    this.p.rect(x, y - 3, 3, 1, 'ironDark');
    this.p.rect(x, y - 1, 3, 1, 'ironDark');
  }
  /** Stepping stones from (txa, tya) to (txb, tyb). */
  path(txa: number, tya: number, txb: number, tyb: number, n = 3): void {
    const a = this.pt(txa, tya, 0), b = this.pt(txb, tyb, 0);
    for (let k = 0; k <= n; k++) { const x = Math.round(a[0] + ((b[0] - a[0]) * k) / n), y = Math.round(a[1] + ((b[1] - a[1]) * k) / n); this.p.rect(x, y, 2, 1, k % 2 ? 'cobble1' : 'cobble2'); }
  }
  /** A striped awning projecting from the right face over ty0..ty1, with a counter of goods under it. */
  awningRight(tx1: number, ty0: number, ty1: number, ztop: number, depth: number, stripe: Col, goods = true): void {
    const poly = [this.pt(tx1, ty0, ztop), this.pt(tx1, ty1, ztop), this.pt(tx1 + depth, ty1, ztop - 2), this.pt(tx1 + depth, ty0, ztop - 2)];
    this.p.poly(poly, 'whitewash');
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const [x, y] of poly) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    for (let y = Math.ceil(minY); y <= maxY; y++) for (let x = Math.floor(minX); x <= maxX; x++) if (inPoly(x + 0.5, y + 0.5, poly) && Math.floor((x - y * 0.5) / 2) % 2 === 0) this.p.px(x, y, stripe);
    const a = this.pt(tx1 + depth, ty0, ztop - 2), b = this.pt(tx1 + depth, ty1, ztop - 2);
    this.p.line(a[0], a[1] + 1, b[0], b[1] + 1, 'outline');
    for (const t of [ty0 + 0.03, ty1 - 0.03]) { const q = this.pt(tx1 + depth, t, 0); const top = this.pt(tx1 + depth, t, ztop - 3); this.p.rect(q[0], top[1], 1, q[1] - top[1], 'wood1'); }
    if (goods) {
      const c0 = this.pt(tx1 + depth * 0.6, ty0 + 0.05, 0), c1 = this.pt(tx1 + depth * 0.6, ty1 - 0.05, 0);
      this.p.line(c0[0], c0[1] - 2, c1[0], c1[1] - 2, 'wood1');
      this.p.line(c0[0], c0[1] - 1, c1[0], c1[1] - 1, 'wood2');
      const cols: Col[] = ['flower1', 'gold', 'leaf2', 'cloth4', 'cloth2'];
      const n = Math.max(2, Math.round(Math.abs(c1[0] - c0[0]) / 3));
      for (let k = 1; k < n; k++) { const x = Math.round(c0[0] + ((c1[0] - c0[0]) * k) / n), y = Math.round(c0[1] + ((c1[1] - c0[1]) * k) / n); this.p.px(x, y - 3, cols[k % cols.length]); }
    }
  }
  flag(tx: number, ty: number, z: number, c: Col, h = 6): void {
    const [x, y] = this.pt(tx, ty, z);
    this.p.rect(x, y - h, 1, h, 'wood1');
    this.p.rect(x + 1, y - h, 3, 2, c);
    this.p.px(x + 3, y - h + 1, 'outline');
  }
}

/** A 1×1 sprite's canvas: 34 wide, H tall, the tile's top corner at (17, H − 17); the anchor is that corner. */
function tile1(H: number, seed: number): { iso: Iso; done: () => Drawn } {
  const p = new Painter(34, H), glow = new Painter(34, H);
  const iso = new Iso(p, glow, 1, H - 17, seed);
  return { iso, done: () => { p.outline('outline'); return { p, glow, ax: 17, ay: H - 17 }; } };
}

// ---------- the level-2 hearths, after inspirations/wooden_houses ----------

/** image_0(1): a tall two-storey plank house, gable to the front with a tile roof, a brick chimney at the back end, a porch
 *  roof over the door with a lantern, a picket fence and a red bush on the left, a round tree at the right corner. */
export function drawHearthL2v0(): Drawn {
  const { iso, done } = tile1(48, 20);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.92, 0.1, 'round', 1);
  iso.box(0.12, 0.2, 0.88, 0.95, 16, 'timber', { storeyLine: 8 });
  iso.gable(0.12, 0.2, 0.88, 0.95, 16, 8, 'x', 'tile', 'timber', 0.08, 0.08);
  iso.chimney(0.2, 0.5, 23, 6, 'brick');
  iso.window(0.88, 0.35, 12); iso.window(0.88, 0.7, 12);
  iso.window(0.88, 0.75, 5);
  iso.window(0.3, 0.95, 12); iso.window(0.6, 0.95, 5);
  iso.leanToRight(0.88, 0.28, 0.62, 8, 0.14, 2, 'tile');
  iso.door(0.88, 0.4, 5, 'arched');
  iso.lantern(0.99, 0.62, 7);
  iso.fence(0.05, 1.02, 0.5, 1.02, 4);
  iso.bush(0.2, 1.0, 2, 'leaf1', 'flower2');
  iso.path(1.0, 0.45, 1.08, 0.45, 2);
  return done();
}

/** image_1(1): a log cabin, gable to the front, a dark shingle roof with white trim, a tall stone chimney at the left end, a
 *  porch under its own small roof, a flower box under the paired windows, a woodpile at the left corner, a pine at the right. */
export function drawHearthL2v1(): Drawn {
  const { iso, done } = tile1(44, 21);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.92, 0.08, 'conifer', 1);
  iso.box(0.1, 0.15, 0.9, 0.9, 11, 'log');
  iso.gable(0.1, 0.15, 0.9, 0.9, 11, 9, 'x', 'darkshingle', 'log', 0.1, 0.1, 'whitewash2');
  iso.chimney(0.15, 0.3, 16, 8, 'stone');
  iso.window(0.9, 0.52, 17, true, 2, 2);
  iso.window(0.9, 0.65, 8, true, 3, 3);
  iso.flowerBox(0.9, 0.66, 4, 4);
  iso.window(0.4, 0.9, 8);
  iso.leanToRight(0.9, 0.18, 0.46, 8, 0.14, 2, 'darkshingle');
  iso.door(0.9, 0.28, 5, 'plank');
  iso.woodpile(0.06, 0.98);
  iso.path(1.0, 0.33, 1.1, 0.33, 2);
  return done();
}

/** image_2(1): a low log cabin, eaves to the front with the gable to the right, a red tile roof, a brick chimney, a railed
 *  veranda along the front with steps, a hood over the door, a tree at the left, bushes and pots. */
export function drawHearthL2v2(): Drawn {
  const { iso, done } = tile1(42, 22);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.1, 0.12, 'round', 1);
  iso.box(0.15, 0.1, 0.82, 0.85, 10, 'log');
  iso.gable(0.15, 0.1, 0.82, 0.85, 10, 7, 'y', 'tile', 'log', 0.12, 0.1);
  iso.chimney(0.45, 0.25, 14, 6, 'brick');
  iso.window(0.82, 0.25, 8); iso.window(0.82, 0.7, 8);
  iso.window(0.4, 0.85, 8);
  iso.veranda(0.82, 0.12, 0.85, 0.22);
  iso.leanToRight(0.82, 0.42, 0.6, 9, 0.08, 2, 'tile', false);
  iso.door(0.82, 0.48, 5, 'plank');
  iso.bush(0.05, 0.9, 2);
  iso.bush(1.02, 0.95, 2, 'leaf2', 'flower1');
  iso.path(1.0, 0.5, 1.1, 0.5, 2);
  return done();
}

/** image_3(2): a log cabin, eaves to the front with the gable at the left end, a dark shingle roof with a dormer, a stone
 *  chimney, a wide flower-boxed window, a porch with two lanterns and a bench, bushes and a stone path. */
export function drawHearthL2v3(): Drawn {
  const { iso, done } = tile1(44, 23);
  iso.shadow(0, 0, 1, 1);
  iso.box(0.1, 0.12, 0.85, 0.88, 11, 'log');
  iso.gable(0.1, 0.12, 0.85, 0.88, 11, 9, 'y', 'darkshingle', 'log', 0.12, 0.1);
  iso.chimney(0.55, 0.2, 16, 7, 'stone');
  iso.dormer(0.7, 0.05, 16, 'darkshingle', 'log', false);
  iso.window(0.85, 0.7, 8, true, 4, 3);
  iso.flowerBox(0.85, 0.72, 4, 5);
  iso.window(0.3, 0.88, 8);
  iso.leanToRight(0.85, 0.15, 0.5, 10, 0.12, 2, 'darkshingle');
  iso.door(0.85, 0.3, 5, 'plank');
  iso.lantern(0.97, 0.17, 7); iso.lantern(0.97, 0.49, 7);
  iso.bush(0.06, 0.95, 2); iso.bush(0.3, 1.02, 2, 'leaf2', 'flower3');
  iso.path(1.0, 0.33, 1.12, 0.33, 2);
  return done();
}

// ---------- the level-1 crafts, after inspirations/craft_houses/general_craft ----------

/** image_0(1): a tan timber workshop with a balcony over the arched door, a signboard, a loft with cross braces, a stone
 *  chimney at the right, flower boxes, a woodpile and a round tree at the right. */
export function drawCraftL1v0(): Drawn {
  const { iso, done } = tile1(33, 24);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.95, 0.1, 'round', 0);
  iso.box(0.12, 0.15, 0.86, 0.9, 10, 'timber', { storeyLine: 6 });
  iso.gable(0.12, 0.15, 0.86, 0.9, 10, 5, 'x', 'shingle', 'timber', 0.1, 0.08);
  iso.chimney(0.75, 0.3, 14, 4, 'stone');
  iso.window(0.86, 0.3, 5); iso.window(0.86, 0.75, 5);
  iso.flowerBox(0.86, 0.3, 1, 3); iso.flowerBox(0.86, 0.75, 1, 3);
  iso.window(0.86, 0.55, 10, true, 2, 2);
  iso.balcony(0.86, 0.3, 0.8, 7);
  iso.sign(0.86, 0.48, 10, 5);
  iso.door(0.86, 0.5, 5, 'arched');
  iso.window(0.45, 0.9, 5);
  iso.woodpile(1.0, 0.95);
  return done();
}

/** image_1(1): a red-roofed timber cottage, gable to the front, a signboard under the gable, a railed porch with steps,
 *  flower boxes, a stone chimney, a tree at the left, a picket garden at the right. */
export function drawCraftL1v1(): Drawn {
  const { iso, done } = tile1(33, 25);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.08, 0.1, 'round', 0);
  iso.box(0.12, 0.18, 0.82, 0.88, 8, 'timber');
  iso.gable(0.12, 0.18, 0.82, 0.88, 8, 7, 'x', 'tile', 'timber', 0.1, 0.1);
  iso.chimney(0.4, 0.3, 11, 4, 'stone');
  iso.sign(0.82, 0.43, 12, 5);
  iso.window(0.82, 0.28, 7); iso.window(0.82, 0.72, 7);
  iso.flowerBox(0.82, 0.28, 3, 3); iso.flowerBox(0.82, 0.72, 3, 3);
  iso.veranda(0.82, 0.2, 0.86, 0.14);
  iso.door(0.82, 0.48, 5, 'plank', 'copper');
  iso.lantern(0.84, 0.62, 6);
  iso.fence(1.0, 0.92, 1.0, 1.05, 2);
  iso.bush(1.05, 1.0, 1, 'leaf2', 'flower2');
  return done();
}

/** image_2(1): a half-timbered house, green tile roof with a dormer, a brick chimney, two teal doors, a flower box, an
 *  autumn tree at the right, fences and a vegetable patch. */
export function drawCraftL1v2(): Drawn {
  const { iso, done } = tile1(33, 26);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.94, 0.1, 'autumn', 0);
  iso.box(0.12, 0.15, 0.85, 0.88, 9, 'halftimber', { braces: true, storeyLine: 5 });
  iso.gable(0.12, 0.15, 0.85, 0.88, 9, 6, 'y', 'green', 'halftimber', 0.1, 0.1);
  iso.chimney(0.6, 0.25, 14, 5, 'brick');
  iso.dormer(0.75, 0.05, 13, 'green', 'halftimber', false);
  iso.window(0.85, 0.65, 9, true, 2, 2);
  iso.window(0.85, 0.72, 5);
  iso.flowerBox(0.85, 0.72, 1, 3);
  iso.door(0.85, 0.3, 5, 'plank', 'verdigris');
  iso.door(0.5, 0.88, 5, 'plank', 'verdigris');
  iso.lantern(0.03, 0.9, 8);
  iso.fence(0.0, 1.03, 0.4, 1.03, 3);
  iso.bush(1.02, 0.95, 1, 'leaf3', 'flower1'); iso.bush(1.1, 0.85, 1, 'leaf2', 'flower2');
  return done();
}

/** image_3(2): a stone-and-timber house, a dark shingle roof, a balcony with cloths, a signboard, an awning over the door,
 *  a birch at the left and a pine at the right, a barrel and a broom. */
export function drawCraftL1v3(): Drawn {
  const { iso, done } = tile1(33, 27);
  iso.shadow(0, 0, 1, 1);
  iso.tree(0.1, 0.08, 'birch', 0);
  iso.tree(0.95, 0.08, 'conifer', 0);
  iso.box(0.12, 0.15, 0.86, 0.88, 10, 'stone', { storeyLine: 5 });
  iso.gable(0.12, 0.15, 0.86, 0.88, 10, 5, 'x', 'darkshingle', 'timber', 0.1, 0.08);
  iso.chimney(0.7, 0.25, 14, 4, 'stone');
  iso.balcony(0.86, 0.35, 0.8, 7, true);
  iso.window(0.86, 0.5, 9, true, 2, 2);
  iso.window(0.86, 0.72, 5, true, 3, 3);
  iso.sign(0.86, 0.3, 10, 4);
  iso.leanToRight(0.86, 0.32, 0.5, 7, 0.1, 2, 'tile', false);
  iso.door(0.86, 0.38, 5, 'plank');
  iso.window(0.4, 0.88, 5);
  iso.flowerBox(0.35, 0.88, 1, 3);
  iso.barrel(1.0, 0.95);
  iso.bush(0.06, 0.95, 2, 'leaf2', 'flower2');
  return done();
}

// ---------- the depot, after inspirations/trade_houses/image_0(1) ----------

/** A half-timbered hall over a stone ground floor, a steep roof half blue slate and half red tile with a gable to the front
 *  and flags on the ridge, a stone chimney, the signboard over an arched door, a clock on the gable, a lantern, striped
 *  awnings with stalls of goods along both front faces, barrels and crates. 2×2: the tile is twice as wide. */
export function drawDepot(): Drawn {
  const H = 62;
  const p = new Painter(66, H), glow = new Painter(66, H);
  const iso = new Iso(p, glow, 1, H - 33, 28);
  // a 2×2 tile: scale the tile coordinates by two
  const S = 2;
  const tx0 = 0.1 * S, ty0 = 0.1 * S, tx1 = 0.9 * S, ty1 = 0.9 * S;
  iso.shadow(0, 0, S, S);
  iso.box(tx0, ty0, tx1, ty1, 9, 'stone');
  iso.box(tx0 - 0.04, ty0 - 0.04, tx1 + 0.04, ty1 + 0.04, 20, 'halftimber', { braces: true, storeyLine: 10 });
  // the stone ground floor shows under the jetty
  const sL = iso.pt(tx0, ty1), sB = iso.pt(tx1, ty1), sR = iso.pt(tx1, ty0);
  p.poly([sL, sB, [sB[0], sB[1] - 9], [sL[0], sL[1] - 9]], 'stone1');
  p.poly([sB, sR, [sR[0], sR[1] - 9], [sB[0], sB[1] - 9]], 'stone2');
  for (let k = 0; k < 9; k += 3) { p.line(sL[0], sL[1] - k, sB[0], sB[1] - k, 'outline'); p.line(sB[0], sB[1] - k, sR[0], sR[1] - k, 'stone1'); }
  // the roof: the front half slate, the back half tile, a gable to the front
  iso.gable(tx0 - 0.04, ty0 - 0.04, tx1 + 0.04, ty1 + 0.04, 20, 12, 'x', 'slate', 'halftimber', 0.08, 0.08);
  iso.gable(tx0 - 0.04, 0.9, 1.0, ty1 + 0.04, 20, 11, 'y', 'tile', 'halftimber', 0.08, 0.06); // the red cross-gable over the left wing
  iso.chimney(0.3 * S, 0.5 * S, 32, 7, 'stone');
  iso.flag(0.5 * S, 0.5 * S, 32, 'cloth2', 7);
  iso.flag(tx1 + 0.04, 0.5 * S, 32, 'cloth3', 6);
  // the clock on the gable and the windows
  const [cx, cy] = iso.pt(tx1 + 0.04, 0.5 * S, 26);
  p.circle(cx, cy, 2, 'parchment'); p.px(cx, cy - 1, 'outline'); p.px(cx + 1, cy, 'outline');
  for (const t of [0.3, 0.7, 1.3, 1.7]) iso.window(tx1 + 0.04, t * (S / 2), 16);
  for (const t of [0.3, 0.7, 1.3, 1.7]) iso.window(t * (S / 2), ty1 + 0.04, 16);
  iso.window(tx1 + 0.04, 1.0, 16, true, 3, 3);
  // the sign, the arched door and the lantern on the front
  iso.sign(tx1 + 0.04, 0.95, 11, 7);
  iso.door(tx1, 1.0, 6, 'arched');
  iso.lantern(tx1 + 0.1, 0.4, 9);
  // the awnings and stalls along both front faces
  iso.awningRight(tx1, 0.25, 0.75, 8, 0.2, 'cloth2');
  iso.awningRight(tx1, 1.25, 1.75, 8, 0.2, 'cloth3');
  const mirror = new Iso(p, glow, 1, H - 33, 29);
  mirror.leanToLeft(ty1, 0.3, 0.9, 8, 0.2, 2, 'thatch', true);
  iso.barrel(tx1 + 0.3, 1.9); iso.barrel(0.1, ty1 + 0.3);
  iso.flowerBox(tx1 + 0.04, 0.9, 13, 6);
  p.outline('outline');
  return { p, glow, ax: 33, ay: H - 33 };
}
