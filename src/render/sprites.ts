/**
 * Procedural pixel-art sprite generation. Everything is drawn from the palette at
 * startup into a list of SpriteDefs which the atlas packs. Hand-made art can replace
 * any sprite by name via public/art/atlas.json (see atlas.ts).
 */
import { Painter, h2 } from './painter';
import { PAL, type PalName } from './palette';

export interface SpriteDef {
  name: string;
  p: Painter;
  ax: number; // anchor: sprite pixel that maps to the tile's top corner (ground tiles) or footprint top corner
  ay: number;
  glow?: Painter; // emissive layer drawn additively at night
}

export const TILE_W = 32;
export const TILE_H = 16;

type Col = PalName | string;

// ---------- ground tiles ----------
/** Rasterize a 32x16 diamond. fn receives tile-space (u,v) in [0,1) and pixel coords. */
function diamond(fn: (u: number, v: number, px: number, py: number) => Col | null, w = TILE_W, h = TILE_H): Painter {
  const p = new Painter(w, h);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      // pixel centre
      const sx = px + 0.5 - w / 2;
      const sy = py + 0.5;
      // u,v from iso: sx = (u - v) * w/2, sy = (u + v) * h/2
      const u = sx / w + sy / h;
      const v = sy / h - sx / w;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const c = fn(u, v, px, py);
      if (c) p.px(px, py, c);
    }
  return p;
}

function groundVariants(name: string, base: Col[], speck: Col[], density: number, seed: number, n: number): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (let k = 0; k < n; k++) {
    const p = diamond((u, v, px, py) => {
      const r = h2(px, py, seed + k * 17);
      if (r < density) return speck[Math.floor(h2(py, px, seed + 3) * speck.length)];
      return base[Math.floor(h2(px >> 1, py >> 1, seed + k) * base.length)];
    });
    out.push({ name: `${name}_${k}`, p, ax: 16, ay: 0 });
  }
  return out;
}

function waterFrames(name: string, base: Col, mid: Col, hi: Col, frames: number, seed: number): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (let f = 0; f < frames; f++) {
    const p = diamond((u, v, px, py) => {
      const wave = Math.sin((u * 3 + v * 2) * Math.PI * 2 + (f / frames) * Math.PI * 2) + Math.sin((v * 5 - u) * Math.PI * 2 - (f / frames) * Math.PI * 2 * 0.7);
      const r = h2(px, py, seed);
      if (wave > 1.35 && r < 0.8) return hi;
      if (wave > 0.6) return mid;
      return base;
    });
    out.push({ name: `${name}_${f}`, p, ax: 16, ay: 0 });
  }
  return out;
}

function roadTile(type: 'track' | 'cobble' | 'lantern', mask: number): Painter {
  const cols: Record<string, [Col, Col, Col]> = {
    track: ['dirt1', 'dirt2', 'dirt3'],
    cobble: ['cobble1', 'cobble2', 'cobble3'],
    lantern: ['lantern1', 'lantern2', 'cobble3'],
  };
  const [c1, c2, c3] = cols[type];
  const half = type === 'track' ? 0.26 : 0.3;
  const n = !!(mask & 1); // y-1  (up-right on screen)
  const e = !!(mask & 2); // x+1  (down-right)
  const s = !!(mask & 4); // y+1  (down-left)
  const w = !!(mask & 8); // x-1  (up-left)
  const grassCols: Col[] = ['grass1', 'grass2', 'grass3'];
  return diamond((u, v, px, py) => {
    const du = Math.abs(u - 0.5);
    const dv = Math.abs(v - 0.5);
    let inRoad = du < half && dv < half; // centre square
    if (e && v > 0.5 - half && v < 0.5 + half && u >= 0.5) inRoad = true;
    if (w && v > 0.5 - half && v < 0.5 + half && u <= 0.5) inRoad = true;
    if (s && u > 0.5 - half && u < 0.5 + half && v >= 0.5) inRoad = true;
    if (n && u > 0.5 - half && u < 0.5 + half && v <= 0.5) inRoad = true;
    if (mask === 0) inRoad = du < half + 0.05 && dv < half + 0.05;
    if (!inRoad) return grassCols[Math.floor(h2(px >> 1, py >> 1, 5) * 3)];
    const r = h2(px, py, 77 + mask);
    // edge shading
    const edge = (e || w ? Math.min(0.5 + half - v, v - (0.5 - half)) : 1) < 0.05 || (n || s ? Math.min(0.5 + half - u, u - (0.5 - half)) < 0.05 : false);
    if (type === 'track') {
      if (r < 0.12) return c3;
      if (r < 0.25 || edge) return c2;
      return c1;
    }
    if (type === 'cobble') {
      // cobblestone pattern
      const cx = (px + (py & 2 ? 2 : 0)) % 4;
      const cy = py % 2;
      if (cx === 0 || cy === 0) return c2;
      if (r < 0.15) return c3;
      return c1;
    }
    // lantern: pale flagstones with lantern-core studs along the centre
    const cx = px % 5;
    const cy = py % 3;
    if (Math.abs(u - 0.5) < 0.04 && Math.abs(v - 0.5) < 0.04) return 'lanternLight';
    if (cx === 0 || cy === 0) return c2;
    if (r < 0.1) return c3;
    return c1;
  });
}

// ---------- buildings ----------
export type Wall = 'sod' | 'timber' | 'stone' | 'whitewash' | 'arcane' | 'bone' | 'darkstone';
export type Roof = 'thatch' | 'shingle' | 'slate' | 'tile' | 'arcane' | 'flat' | 'cone' | 'dome' | 'green' | 'awning' | 'none';

export interface BuildingSpec {
  w: number;
  h: number;
  height: number; // wall height px
  roofH: number;
  wall: Wall;
  roof: Roof;
  hip?: boolean;
  windows?: number; // windows per face row
  windowRows?: number;
  door?: boolean;
  chimney?: boolean;
  sign?: boolean;
  crystal?: boolean; // floating crystal above
  spire?: boolean; // small spire on roof
  banner?: boolean;
  glowWindows?: boolean;
  seed?: number;
  leyLamps?: boolean;
  gloomy?: boolean;
}

const WALLS: Record<Wall, { l: Col; r: Col; t: Col; d: Col }> = {
  sod: { l: 'sod', r: 'sod2', t: 'sod2', d: 'sod' },
  timber: { l: 'wood1', r: 'wood2', t: 'wood3', d: 'wood1' },
  stone: { l: 'stone1', r: 'stone2', t: 'stone3', d: 'stone1' },
  whitewash: { l: 'whitewash2', r: 'whitewash', t: 'whitewash', d: 'wood1' },
  arcane: { l: 'arcane2', r: 'arcane1', t: 'arcane3', d: 'arcane2' },
  bone: { l: 'whitewash2', r: 'bone', t: 'bone', d: 'stone1' },
  darkstone: { l: 'outline', r: 'stone1', t: 'stone2', d: 'shadow' },
};
const ROOFS: Record<string, { a: Col; b: Col }> = {
  thatch: { a: 'thatch1', b: 'thatch2' },
  shingle: { a: 'shingle1', b: 'shingle2' },
  slate: { a: 'slate1', b: 'slate2' },
  tile: { a: 'tile1', b: 'tile2' },
  arcane: { a: 'arcane1', b: 'arcane2' },
  flat: { a: 'stone3', b: 'stone2' },
  cone: { a: 'slate1', b: 'slate2' },
  dome: { a: 'ley2', b: 'ley3' },
  green: { a: 'green1', b: 'green2' },
  awning: { a: 'cloth2', b: 'whitewash' },
  none: { a: 'stone2', b: 'stone1' },
};

/** Draws an isometric building; returns [sprite, glow]. Anchor is the footprint's top corner. */
export function drawBuilding(spec: BuildingSpec): { p: Painter; glow: Painter; ax: number; ay: number } {
  const { w, h, height: H, roofH: RH } = spec;
  const W = (w + h) * 16;
  const FH = (w + h) * 8;
  const extra = spec.crystal ? 20 : spec.spire ? 14 : 2;
  const SH = FH + H + RH + extra;
  const p = new Painter(W + 2, SH + 1);
  const glow = new Painter(W + 2, SH + 1);
  const ox = 1;
  const base = RH + extra;
  const seed = spec.seed ?? 0;
  // footprint corners at wall top (y - H) and ground
  const T = [ox + h * 16, base + H] as [number, number];
  const R = [ox + W, base + H + w * 8] as [number, number];
  const B = [ox + w * 16, base + H + FH] as [number, number];
  const L = [ox, base + H + h * 8] as [number, number];
  const up = (pt: [number, number], d: number): [number, number] => [pt[0], pt[1] - d];
  const wc = WALLS[spec.wall];
  // ground shadow/plinth
  p.poly([T, R, B, L], 'shadow', 90);
  // walls
  p.poly([L, B, up(B, H), up(L, H)], wc.l);
  p.poly([B, R, up(R, H), up(B, H)], wc.r);
  // wall texture
  const texWall = (x0: number, y0: number, x1: number, y1: number, right: boolean) => {
    // ground line from (x0,y0) to (x1,y1); walk pixels
    const len = Math.abs(x1 - x0);
    for (let i = 0; i <= len; i++) {
      const x = x0 + (x1 > x0 ? i : -i);
      const gy = y0 + ((y1 - y0) * i) / len;
      for (let d = 1; d < H; d++) {
        const y = Math.floor(gy) - d;
        const r = h2(x, y, seed + 9);
        if (spec.wall === 'timber') {
          if (d % 5 === 0) p.px(x, y, right ? 'wood1' : 'outline', 110);
          if (i % 6 === 0) p.px(x, y, 'wood1', 120);
        } else if (spec.wall === 'stone' || spec.wall === 'darkstone' || spec.wall === 'bone') {
          if (d % 3 === 0 || (i + (d % 6 >= 3 ? 2 : 0)) % 5 === 0) p.px(x, y, right ? 'stone1' : 'outline', spec.wall === 'bone' ? 60 : 90);
        } else if (spec.wall === 'whitewash') {
          if (d % 6 === 0 || i % 7 === 0) p.px(x, y, 'wood1', 200);
        } else if (spec.wall === 'sod') {
          if (r < 0.15) p.px(x, y, 'sod2', right ? 120 : 200);
        } else if (spec.wall === 'arcane') {
          if (r < 0.06) p.px(x, y, 'arcane3', 150);
        }
      }
    }
  };
  texWall(L[0], L[1], B[0], B[1], false);
  texWall(B[0], B[1], R[0], R[1], true);
  // wall bottom edge and vertical corner
  p.line(L[0], L[1], B[0], B[1], 'outline');
  p.line(B[0], B[1], R[0], R[1], 'outline');
  p.line(B[0], B[1], B[0], B[1] - H, 'outline');
  // windows
  const winRows = spec.windowRows ?? 1;
  const winCols = spec.windows ?? 0;
  const drawWindows = (x0: number, y0: number, x1: number, y1: number, cols: number, lit: boolean) => {
    if (cols <= 0) return;
    const len = Math.abs(x1 - x0);
    for (let r = 0; r < winRows; r++)
      for (let c = 0; c < cols; c++) {
        const f = (c + 0.5) / cols;
        const x = Math.round(x0 + (x1 - x0) * f) - 1;
        const rowBase = H - 4 - r * Math.floor((H - 6) / winRows);
        for (let dx = 0; dx < 2; dx++) {
          const gy = y0 + ((y1 - y0) * (Math.abs(x + dx - x0))) / len;
          for (let dy = 0; dy < 3; dy++) {
            const y = Math.floor(gy) - rowBase + dy;
            p.px(x + dx, y, 'windowDark');
            if (lit) glow.px(x + dx, y, 'windowLit');
          }
        }
      }
  };
  drawWindows(L[0] + 2, L[1] + 1, B[0] - 2, B[1] - 1, Math.max(0, Math.round(winCols * (h / (w + h)) * 2)), !!spec.glowWindows);
  drawWindows(B[0] + 2, B[1] - 1, R[0] - 2, R[1] + 1, Math.max(0, Math.round(winCols * (w / (w + h)) * 2)), !!spec.glowWindows);
  // door on right face
  if (spec.door) {
    const f = 0.35;
    const x = Math.round(B[0] + (R[0] - B[0]) * f);
    const len = R[0] - B[0];
    for (let dx = 0; dx < 3; dx++) {
      const gy = B[1] + ((R[1] - B[1]) * (x + dx - B[0])) / len;
      for (let dy = 1; dy <= 5; dy++) p.px(x + dx, Math.floor(gy) - dy, dx === 1 ? wc.d : 'outline');
    }
    if (spec.glowWindows) {
      const gy = B[1] + ((R[1] - B[1]) * (x + 1 - B[0])) / len;
      glow.px(x + 1, Math.floor(gy) - 3, 'lampWarm');
    }
  }
  // roof
  const Tt = up(T, H);
  const Rt = up(R, H);
  const Bt = up(B, H);
  const Lt = up(L, H);
  const rc = ROOFS[spec.roof];
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (spec.roof === 'none' || spec.roof === 'flat') {
    p.poly([Tt, Rt, Bt, Lt], spec.roof === 'flat' ? rc.a : wc.t);
    if (spec.roof === 'flat') {
      // crenellations
      for (let i = 0; i < W; i += 4) {
        const x = ox + i;
        // top-left edge & top-right edge
      }
      p.line(Lt[0], Lt[1], Tt[0], Tt[1], rc.b);
      p.line(Tt[0], Tt[1], Rt[0], Rt[1], rc.b);
    }
    p.line(Lt[0], Lt[1], Bt[0], Bt[1], 'outline');
    p.line(Bt[0], Bt[1], Rt[0], Rt[1], 'outline');
  } else if (spec.roof === 'cone') {
    const apex: [number, number] = [ox + W / 2, base - 1 + (spec.spire ? 0 : 0)];
    const c: [number, number] = [ox + W / 2, base + H + FH / 2];
    void c;
    p.poly([Lt, Bt, apex], rc.b);
    p.poly([Bt, Rt, apex], rc.a);
    p.poly([Tt, Rt, apex], rc.a);
    p.poly([Lt, Tt, apex], rc.b);
    p.line(Bt[0], Bt[1], apex[0], apex[1], 'outline');
    p.line(Lt[0], Lt[1], apex[0], apex[1], rc.b);
    p.line(Rt[0], Rt[1], apex[0], apex[1], rc.a);
  } else if (spec.roof === 'dome') {
    const cx = ox + W / 2;
    const cy = base + FH / 2; // centre of the wall-top diamond
    const rx = W / 2 - 2;
    const ry = RH + FH / 2 - 2;
    const dia: [number, number][] = [Tt, Rt, Bt, Lt];
    p.poly(dia, rc.b);
    for (let y = -ry; y <= FH / 2; y++)
      for (let x = -rx; x <= rx; x++) {
        const nx = x / rx;
        const ny = y / ry;
        if (nx * nx + ny * ny > 1) continue;
        if (y > 0 && !inPoly(cx + x + 0.5, cy + y + 0.5, dia)) continue;
        const shade = nx * 0.6 - ny * 0.8;
        const c: Col = shade > 0.45 ? 'leyGlow' : shade > -0.25 ? rc.a : rc.b;
        p.px(cx + x, cy + y, c);
        if (shade > 0.45) glow.px(cx + x, cy + y, 'ley1', 110);
        if ((x + y) % 6 === 0) p.px(cx + x, cy + y, rc.b, 90);
      }
    p.px(cx, cy - ry - 1, 'gold');
    p.px(cx, cy - ry - 2, 'gold');
  } else {
    // gable / hip with ridge along x (T->R direction). ridge endpoints at midpoints of y-edges.
    let r1 = mid(Tt, Lt);
    let r2 = mid(Rt, Bt);
    if (spec.hip) {
      const inset = 0.28;
      r1 = [r1[0] + (r2[0] - r1[0]) * inset, r1[1] + (r2[1] - r1[1]) * inset];
      r2 = [r2[0] - (r2[0] - r1[0]) * inset, r2[1] - (r2[1] - r1[1]) * inset];
    }
    r1 = up(r1, RH);
    r2 = up(r2, RH);
    // eaves overhang: extend slightly
    p.poly([Tt, Rt, r2, r1], rc.a); // back slope (lit)
    p.poly([Lt, Bt, r2, r1], rc.b); // front slope
    if (spec.hip) {
      p.poly([Tt, Lt, r1], rc.b);
      p.poly([Rt, Bt, r2], rc.a);
    } else {
      // gable end wall on the right (visible)
      p.poly([Rt, Bt, up(mid(Rt, Bt), RH)], wc.r);
      p.line(Rt[0], Rt[1], r2[0], r2[1], 'outline');
      p.line(Bt[0], Bt[1], r2[0], r2[1], 'outline');
    }
    // texture on slopes
    const tex = (poly: [number, number][], dark: Col, light: Col, s: number) => {
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const [x, y] of poly) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      for (let y = Math.ceil(minY); y <= maxY; y++)
        for (let x = Math.floor(minX); x <= maxX; x++) {
          if (!inPoly(x + 0.5, y + 0.5, poly)) continue;
          if (spec.roof === 'thatch') {
            if ((y + (x >> 2)) % 4 === 0 && h2(x, y, s) < 0.7) p.px(x, y, dark);
          } else if (spec.roof === 'shingle' || spec.roof === 'tile') {
            if (y % 3 === 0 && (x + (y % 6 === 0 ? 0 : 2)) % 4 !== 0) p.px(x, y, dark);
          } else if (spec.roof === 'slate' || spec.roof === 'arcane') {
            if ((x + y) % 5 === 0) p.px(x, y, dark, 140);
            if (spec.roof === 'arcane' && h2(x, y, s) < 0.04) { p.px(x, y, 'ley1'); glow.px(x, y, 'ley1', 160); }
          } else if (spec.roof === 'green') {
            if (h2(x, y, s) < 0.2) p.px(x, y, light);
          } else if (spec.roof === 'awning') {
            if (Math.floor((x - y * 0.5) / 3) % 2 === 0) p.px(x, y, seed % 2 ? 'cloth3' : 'cloth2');
            else p.px(x, y, 'whitewash');
          }
        }
    };
    tex([Tt, Rt, r2, r1], rc.b, rc.a, seed + 1);
    tex([Lt, Bt, r2, r1], 'outline', rc.a, seed + 2);
    p.line(r1[0], r1[1], r2[0], r2[1], 'outline');
    p.line(Lt[0], Lt[1], Bt[0], Bt[1], 'outline');
    p.line(Bt[0], Bt[1], Rt[0], Rt[1], 'outline');
    p.line(Lt[0], Lt[1], r1[0], r1[1], 'outline');
    // chimney
    if (spec.chimney) {
      const cx = Math.round(r1[0] + (r2[0] - r1[0]) * 0.3);
      const cy = Math.round(r1[1] + (r2[1] - r1[1]) * 0.3);
      p.rect(cx - 1, cy - 6, 3, 7, 'stone1');
      p.rect(cx - 1, cy - 6, 1, 7, 'outline');
      p.rect(cx, cy - 7, 2, 1, 'stone2');
    }
  }
  // sign (market)
  if (spec.sign) {
    const x = Math.round(B[0] + (R[0] - B[0]) * 0.72);
    const len = R[0] - B[0];
    const gy = Math.floor(B[1] + ((R[1] - B[1]) * (x - B[0])) / len);
    p.rect(x - 2, gy - H + 3, 5, 3, 'cloth5');
    p.px(x, gy - H + 2, 'outline');
    p.rect(x - 2, gy - H + 3, 1, 3, 'outline');
  }
  // banner (services)
  if (spec.banner) {
    const x = Math.round(B[0] + (R[0] - B[0]) * 0.15);
    const len = R[0] - B[0];
    const gy = Math.floor(B[1] + ((R[1] - B[1]) * (x - B[0])) / len);
    p.rect(x, gy - H + 1, 1, H - 3, 'wood1');
    p.rect(x + 1, gy - H + 2, 3, 5, 'banner');
    p.px(x + 3, gy - H + 6, 'outline');
  }
  // spire on top
  if (spec.spire) {
    const cx = ox + Math.round(W / 2);
    const top = Math.round(base + FH / 2 - RH) - 11;
    p.rect(cx - 1, top + 2, 3, 9, 'leyStone');
    p.rect(cx - 1, top + 2, 1, 9, 'ley3');
    p.px(cx, top + 1, 'ley1');
    p.px(cx, top, 'leyGlow');
    glow.rect(cx - 1, top, 3, 3, 'ley1', 220);
  }
  if (spec.crystal) {
    const cx = ox + Math.round(W / 2);
    const cy = Math.round(base + FH / 2 - RH) - 9;
    p.poly([[cx, cy - 6], [cx + 3, cy], [cx, cy + 6], [cx - 3, cy]], 'ley1');
    p.poly([[cx, cy - 6], [cx + 3, cy], [cx, cy]], 'leyGlow');
    p.line(cx - 3, cy, cx, cy + 6, 'ley2');
    glow.poly([[cx, cy - 6], [cx + 3, cy], [cx, cy + 6], [cx - 3, cy]], 'ley1', 230);
  }
  if (spec.leyLamps) {
    // small lamps at the two front corners
    for (const pt of [L, R]) {
      const x = pt[0] + (pt === L ? 1 : -2);
      const y = pt[1] - 1;
      p.rect(x, y - 5, 1, 5, 'stone1');
      p.px(x, y - 6, 'ley1');
      glow.px(x, y - 6, 'ley1');
    }
  }
  p.outline('outline');
  return { p, glow, ax: ox + h * 16, ay: base + H };
}

function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- props ----------
function tree(variant: number, autumn = false): Painter {
  const p = new Painter(16, 24);
  const seed = variant * 31;
  const trunkH = 5 + (variant % 2);
  p.rect(7, 24 - trunkH - 1, 2, trunkH, 'trunk');
  const cols: Col[] = autumn ? ['leafAutumn', 'thatch1', 'leaf2'] : ['leaf1', 'leaf2', 'leaf3'];
  const cx = 8;
  const layers = variant === 3 ? [[17, 6], [12, 5], [7, 3]] : [[16, 6], [11, 5], [6, 3]];
  if (variant === 2) {
    // conifer
    for (let y = 2; y < 18; y++) {
      const hw = Math.floor(((y - 2) / 16) * 6) + 1;
      for (let x = -hw; x <= hw; x++) {
        const shade = x > hw * 0.3 ? 2 : x < -hw * 0.3 ? 0 : 1;
        if (h2(x, y, seed) < 0.9) p.px(cx + x, y, cols[shade]);
      }
    }
  } else {
    for (const [cy, r] of layers) {
      for (let y = -r; y <= r; y++)
        for (let x = -r - 1; x <= r + 1; x++) {
          if ((x * x) / ((r + 1) * (r + 1)) + (y * y) / (r * r) > 1) continue;
          const shade = x - y > r * 0.6 ? 2 : x - y < -r * 0.6 ? 0 : 1;
          if (h2(x + cy, y, seed) < 0.92) p.px(cx + x, cy + y, cols[shade]);
        }
    }
  }
  p.outline('outline');
  return p;
}

function rock(variant: number): Painter {
  const p = new Painter(14, 10);
  const pts: [number, number][] = variant === 0 ? [[2, 8], [1, 4], [5, 1], [10, 2], [13, 6], [11, 9]] : variant === 1 ? [[1, 7], [3, 2], [8, 1], [12, 4], [10, 9], [4, 9]] : [[3, 9], [2, 5], [6, 3], [9, 4], [11, 8]];
  p.poly(pts, 'rock2');
  for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) if (p.get(x, y) && x - y * 0.5 < 3) p.px(x, y, 'rock3');
  for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) if (p.get(x, y) && x - y > 6) p.px(x, y, 'rock1');
  p.outline('outline');
  return p;
}

function citizen(variant: number, frame: number, grimmen: boolean, tallow: boolean): Painter {
  const p = new Painter(8, 12);
  const cloth: Col[] = ['cloth1', 'cloth2', 'cloth3', 'cloth4', 'cloth5', 'wood2'];
  const c = cloth[variant % cloth.length];
  const skin: Col = grimmen ? 'skinGrey' : 'skin';
  const top = tallow ? 3 : 1;
  // head
  p.rect(3, top, 2, 2, skin);
  if (grimmen) p.rect(3, top - 1, 2, 1, 'bone');
  else p.rect(3, top - 1, 2, 1, variant % 2 ? 'wood1' : 'outline');
  if (tallow) {
    p.px(3, top, 'windowLit');
    p.px(4, top, 'windowLit');
  }
  // body
  p.rect(2, top + 2, 4, 4, c);
  // legs (4-frame walk cycle)
  switch (frame % 4) {
    case 0: p.rect(2, top + 6, 1, 3, 'outline'); p.rect(5, top + 6, 1, 3, 'outline'); break;
    case 1: p.rect(3, top + 6, 1, 3, 'outline'); p.rect(4, top + 6, 1, 2, 'outline'); break;
    case 2: p.rect(3, top + 6, 1, 3, 'outline'); p.rect(4, top + 6, 1, 3, 'outline'); break;
    default: p.rect(2, top + 6, 1, 2, 'outline'); p.rect(4, top + 6, 1, 3, 'outline');
  }
  // a small pack or basket on one side gives the sprite a facing
  p.px(6, top + 3, variant % 2 ? 'wood1' : 'cloth5');
  p.outline('outline');
  return p;
}

function cart(variant: number): Painter {
  const p = new Painter(18, 12);
  // mule
  p.rect(1, 5, 5, 3, 'wood1');
  p.rect(0, 4, 2, 2, 'wood1');
  p.px(1, 8, 'outline');
  p.px(4, 8, 'outline');
  // cart body
  p.rect(7, 4, 9, 4, 'cartWood');
  p.rect(7, 4, 9, 1, 'wood1');
  // load
  const load: Col = variant === 0 ? 'ley1' : variant === 1 ? 'green1' : 'cloth5';
  p.rect(9, 2, 5, 2, load);
  p.px(10, 1, load);
  p.px(13, 1, load);
  // wheels
  p.circle(9, 9, 1, 'outline');
  p.circle(14, 9, 1, 'outline');
  p.outline('outline');
  return p;
}

function restlessSprite(variant: number, frame: number): { p: Painter; glow: Painter } {
  const p = new Painter(8, 12);
  const glow = new Painter(8, 12);
  const top = 1 + (frame % 2);
  p.rect(3, top, 2, 2, 'bone');
  p.rect(2, top + 2, 4, 5, 'restless', 200);
  p.rect(2, top + 7, 1, 2, 'restless', 120);
  p.rect(5, top + 7, 1, 2, 'restless', 120);
  p.px(3, top, 'gloamEye');
  p.px(4, top, 'gloamEye');
  glow.rect(2, top, 4, 8, 'restless', 90);
  glow.px(3, top, 'gloamEye');
  glow.px(4, top, 'gloamEye');
  void variant;
  return { p, glow };
}

function icon(kind: string): Painter {
  const p = new Painter(9, 9);
  switch (kind) {
    case 'nomana':
      p.poly([[5, 0], [2, 5], [4, 5], [3, 8], [7, 3], [5, 3]], 'ley1');
      p.line(0, 8, 8, 0, 'fire2');
      break;
    case 'nowater':
      p.poly([[4, 0], [7, 5], [4, 8], [1, 5]], 'water3');
      p.line(0, 8, 8, 0, 'fire2');
      break;
    case 'fire':
      p.poly([[4, 0], [7, 4], [6, 8], [2, 8], [1, 4]], 'fire2');
      p.poly([[4, 3], [6, 6], [4, 8], [2, 6]], 'fire1');
      break;
    case 'unhappy':
      p.circle(4, 4, 4, 'gold');
      p.px(2, 3, 'outline');
      p.px(6, 3, 'outline');
      p.line(2, 7, 6, 7, 'outline');
      p.px(2, 6, 'outline');
      p.px(6, 6, 'outline');
      break;
    case 'gloam':
      p.circle(4, 3, 3, 'bone');
      p.px(3, 3, 'outline');
      p.px(5, 3, 'outline');
      p.rect(3, 6, 3, 2, 'bone');
      break;
    case 'abandoned':
      p.rect(1, 2, 7, 6, 'stone1');
      p.line(1, 2, 8, 8, 'fire2');
      p.line(8, 2, 1, 8, 'fire2');
      break;
    case 'nogoods':
      p.rect(1, 3, 7, 5, 'wood2');
      p.rect(2, 4, 5, 3, 'outline');
      p.line(0, 8, 8, 0, 'fire2');
      break;
    case 'nojobs':
      p.rect(1, 3, 7, 5, 'wood2');
      p.rect(3, 1, 3, 2, 'wood1');
      p.line(0, 8, 8, 0, 'fire2');
      break;
  }
  p.outline('outline');
  return p;
}

// ---------- building specs ----------
const V = (n: number) => n;

function zoneSpecs(zone: string, level: number, variant: number): BuildingSpec {
  const seed = level * 100 + variant * 7 + zone.length;
  if (zone === 'hearth') {
    if (level === 1) {
      const walls: Wall[] = ['sod', 'sod', 'timber', 'sod'];
      const roofs: Roof[] = ['thatch', 'thatch', 'thatch', 'shingle'];
      return { w: 1, h: 1, height: 7 + (variant % 2), roofH: 6 + (variant === 3 ? 1 : 0), wall: walls[variant], roof: roofs[variant], windows: 1, door: true, chimney: variant % 2 === 0, glowWindows: true, seed };
    }
    if (level === 2) {
      const walls: Wall[] = ['timber', 'timber', 'whitewash', 'timber'];
      const roofs: Roof[] = ['shingle', 'thatch', 'tile', 'shingle'];
      return { w: 1, h: 1, height: 11 + (variant % 2), roofH: 7, wall: walls[variant], roof: roofs[variant], windows: 2, windowRows: 2, door: true, chimney: true, glowWindows: true, seed, hip: variant === 3 };
    }
    const walls: Wall[] = ['stone', 'whitewash', 'stone', 'whitewash'];
    const roofs: Roof[] = ['slate', 'tile', 'tile', 'slate'];
    return { w: 1, h: 1, height: 16 + (variant % 2) * 2, roofH: 8, wall: walls[variant], roof: roofs[variant], windows: 2, windowRows: 3, door: true, chimney: true, glowWindows: true, seed, hip: variant >= 2 };
  }
  if (zone === 'market') {
    if (level === 1) return { w: 1, h: 1, height: 6, roofH: 5, wall: 'timber', roof: 'awning', windows: 0, door: true, sign: true, glowWindows: true, seed };
    if (level === 2) return { w: 1, h: 1, height: 11, roofH: 6, wall: variant % 2 ? 'whitewash' : 'timber', roof: variant % 2 ? 'tile' : 'awning', windows: 2, windowRows: 2, door: true, sign: true, glowWindows: true, seed };
    return { w: 1, h: 1, height: 17, roofH: 7, wall: variant % 2 ? 'whitewash' : 'stone', roof: variant % 2 ? 'tile' : 'slate', windows: 3, windowRows: 3, door: true, sign: true, banner: variant % 2 === 0, glowWindows: true, seed, hip: true };
  }
  if (zone === 'craft') {
    if (level === 1) return { w: 1, h: 1, height: 7, roofH: 4, wall: 'timber', roof: variant % 2 ? 'thatch' : 'shingle', windows: 1, door: true, chimney: true, glowWindows: true, seed };
    if (level === 2) return { w: 1, h: 1, height: 10, roofH: 6, wall: variant % 2 ? 'stone' : 'darkstone', roof: 'shingle', windows: 2, windowRows: 1, door: true, chimney: true, glowWindows: true, seed };
    return { w: 1, h: 1, height: 14, roofH: 7, wall: 'darkstone', roof: variant % 2 ? 'slate' : 'shingle', windows: 2, windowRows: 2, door: true, chimney: true, glowWindows: true, seed, spire: variant % 2 === 0 };
  }
  // arcane
  if (level === 1) return { w: 1, h: 1, height: 10, roofH: 7, wall: 'arcane', roof: 'arcane', windows: 1, windowRows: 1, door: true, glowWindows: true, seed, hip: variant % 2 === 1 };
  if (level === 2) return { w: 1, h: 1, height: 15, roofH: 8, wall: variant % 2 ? 'stone' : 'arcane', roof: 'arcane', windows: 2, windowRows: 2, door: true, glowWindows: true, seed, spire: true };
  return { w: 1, h: 1, height: 20, roofH: 10, wall: variant % 2 ? 'arcane' : 'stone', roof: 'cone', windows: 2, windowRows: 3, door: true, glowWindows: true, seed, crystal: true };
}

const SERVICE_SPECS: Record<string, BuildingSpec> = {
  stake: { w: 2, h: 2, height: 14, roofH: 8, wall: 'timber', roof: 'shingle', windows: 2, windowRows: 2, door: true, chimney: true, banner: true, glowWindows: true, leyLamps: true, seed: 1 },
  spire: { w: 1, h: 1, height: 3, roofH: 2, wall: 'stone', roof: 'flat', seed: 2 }, // special-drawn below
  nexus: { w: 2, h: 2, height: 6, roofH: 4, wall: 'stone', roof: 'flat', crystal: true, leyLamps: true, seed: 3 },
  font: { w: 2, h: 2, height: 10, roofH: 6, wall: 'darkstone', roof: 'flat', crystal: true, seed: 4 },
  mine: { w: 2, h: 2, height: 8, roofH: 6, wall: 'darkstone', roof: 'shingle', windows: 0, door: true, seed: 23, crystal: true },
  well: { w: 1, h: 1, height: 4, roofH: 5, wall: 'stone', roof: 'shingle', seed: 5 },
  cistern: { w: 2, h: 2, height: 12, roofH: 8, wall: 'stone', roof: 'dome', windows: 1, seed: 6 },
  watchpost: { w: 1, h: 1, height: 18, roofH: 6, wall: 'timber', roof: 'shingle', windows: 1, windowRows: 3, door: true, banner: true, glowWindows: true, seed: 7, hip: true },
  watchhouse: { w: 2, h: 2, height: 16, roofH: 6, wall: 'stone', roof: 'flat', windows: 2, windowRows: 2, door: true, banner: true, glowWindows: true, seed: 8 },
  healer: { w: 1, h: 1, height: 12, roofH: 7, wall: 'whitewash', roof: 'green', windows: 2, windowRows: 2, door: true, glowWindows: true, seed: 9 },
  hospice: { w: 2, h: 2, height: 16, roofH: 8, wall: 'whitewash', roof: 'green', windows: 3, windowRows: 3, door: true, chimney: true, glowWindows: true, seed: 10, hip: true },
  veshari: { w: 2, h: 2, height: 14, roofH: 7, wall: 'stone', roof: 'slate', windows: 2, windowRows: 2, door: true, banner: true, glowWindows: true, seed: 11, hip: true },
  shrine: { w: 1, h: 1, height: 8, roofH: 8, wall: 'whitewash', roof: 'cone', windows: 1, door: true, glowWindows: true, seed: 12 },
  temple: { w: 3, h: 3, height: 22, roofH: 12, wall: 'whitewash', roof: 'dome', windows: 3, windowRows: 3, door: true, glowWindows: true, leyLamps: true, seed: 13 },
  academy: { w: 2, h: 2, height: 18, roofH: 8, wall: 'stone', roof: 'slate', windows: 3, windowRows: 3, door: true, glowWindows: true, seed: 14, spire: true, hip: true },
  grandacademy: { w: 3, h: 3, height: 26, roofH: 10, wall: 'stone', roof: 'arcane', windows: 4, windowRows: 4, door: true, glowWindows: true, seed: 15, crystal: true, hip: true },
  boneyard: { w: 2, h: 2, height: 5, roofH: 5, wall: 'darkstone', roof: 'shingle', windows: 0, door: true, seed: 16 },
  ossuary: { w: 2, h: 2, height: 14, roofH: 9, wall: 'bone', roof: 'slate', windows: 2, windowRows: 2, door: true, glowWindows: true, seed: 17, spire: true },
  wardlantern: { w: 1, h: 1, height: 14, roofH: 3, wall: 'stone', roof: 'flat', seed: 18, crystal: true },
  garden: { w: 1, h: 1, height: 1, roofH: 1, wall: 'stone', roof: 'none', seed: 19 },
  square: { w: 2, h: 2, height: 1, roofH: 1, wall: 'stone', roof: 'none', seed: 20 },
  guildhall: { w: 2, h: 2, height: 18, roofH: 8, wall: 'timber', roof: 'tile', windows: 3, windowRows: 3, door: true, sign: true, banner: true, glowWindows: true, seed: 21, hip: true },
  lantern: { w: 3, h: 3, height: 40, roofH: 10, wall: 'stone', roof: 'cone', windows: 2, windowRows: 5, door: true, glowWindows: true, seed: 22, crystal: true },
};

function drawSpire(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 40);
  const glow = new Painter(34, 40);
  // base diamond
  p.poly([[17, 24], [32, 32], [17, 40], [2, 32]], 'shadow', 90);
  p.poly([[17, 27], [26, 31], [17, 36], [8, 31]], 'stone2');
  p.poly([[8, 31], [17, 36], [17, 38], [8, 33]], 'stone1');
  p.poly([[17, 36], [26, 31], [26, 33], [17, 38]], 'stone2');
  // obelisk
  p.poly([[17, 4], [21, 30], [17, 33], [13, 30]], 'leyStone');
  p.poly([[17, 4], [13, 30], [17, 33]], 'ley2');
  p.line(17, 6, 17, 32, 'leyGlow');
  for (let y = 10; y < 30; y += 5) { p.px(15, y, 'ley1'); p.px(19, y + 2, 'ley1'); glow.px(15, y, 'ley1'); glow.px(19, y + 2, 'ley1'); }
  p.px(17, 3, 'leyGlow');
  p.px(17, 2, 'ley1');
  glow.rect(16, 1, 3, 4, 'ley1', 230);
  glow.rect(16, 6, 3, 26, 'ley1', 70);
  p.outline('outline');
  return { p, glow, ax: 17, ay: 24 };
}

function drawWell(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 28);
  const glow = new Painter(34, 28);
  p.poly([[17, 12], [32, 20], [17, 28], [2, 20]], 'shadow', 90);
  // stone ring
  p.poly([[17, 15], [27, 20], [17, 25], [7, 20]], 'stone2');
  p.poly([[17, 19], [23, 20], [17, 23], [11, 20]], 'water2');
  p.px(17, 20, 'water3');
  p.poly([[7, 20], [17, 25], [17, 27], [7, 22]], 'stone1');
  p.poly([[17, 25], [27, 20], [27, 22], [17, 27]], 'stone2');
  // posts and little roof
  p.rect(9, 8, 2, 12, 'wood1');
  p.rect(24, 8, 2, 12, 'wood1');
  p.poly([[17, 2], [30, 9], [17, 12], [4, 9]], 'shingle1');
  p.poly([[4, 9], [17, 12], [17, 14], [4, 11]], 'shingle2');
  p.poly([[17, 12], [30, 9], [30, 11], [17, 14]], 'shingle1');
  p.rect(17, 14, 1, 4, 'wood1');
  p.rect(16, 18, 3, 2, 'wood2');
  p.outline('outline');
  return { p, glow, ax: 17, ay: 12 };
}

function drawGarden(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 22);
  const glow = new Painter(34, 22);
  p.poly([[17, 6], [32, 14], [17, 22], [2, 14]], 'meadow2');
  p.poly([[17, 8], [29, 14], [17, 20], [5, 14]], 'meadow');
  for (let k = 0; k < 14; k++) {
    const u = h2(k, 1, 4) * 0.8 + 0.1;
    const v = h2(k, 2, 4) * 0.8 + 0.1;
    const x = Math.round(17 + (u - v) * 15);
    const y = Math.round(6 + (u + v) * 7.5);
    const c: Col = (['flower1', 'flower2', 'flower3', 'ley1'] as Col[])[k % 4];
    p.px(x, y, c);
    if (c === 'ley1') glow.px(x, y, 'ley1');
  }
  // hearth-stone
  p.rect(15, 11, 4, 3, 'stone2');
  p.rect(15, 11, 1, 3, 'stone1');
  p.px(16, 10, 'ember');
  glow.px(16, 10, 'ember');
  // bench
  p.rect(22, 15, 4, 1, 'wood2');
  p.px(22, 16, 'wood1');
  p.px(25, 16, 'wood1');
  p.outline('outline');
  return { p, glow, ax: 17, ay: 6 };
}

function drawSquare(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(66, 40);
  const glow = new Painter(66, 40);
  const cx = 33;
  const T: [number, number] = [cx, 8];
  const R: [number, number] = [65, 24];
  const B: [number, number] = [cx, 40];
  const L: [number, number] = [1, 24];
  p.poly([T, R, B, L], 'cobble1');
  for (let y = 8; y < 40; y++) for (let x = 1; x < 65; x++) if (p.get(x, y) && ((x + y) % 5 === 0 || y % 3 === 0)) p.px(x, y, 'cobble2');
  // fountain
  p.poly([[cx, 17], [cx + 9, 22], [cx, 27], [cx - 9, 22]], 'stone2');
  p.poly([[cx, 19], [cx + 6, 22], [cx, 25], [cx - 6, 22]], 'water3');
  p.rect(cx - 1, 12, 3, 10, 'stone3');
  p.rect(cx - 1, 12, 1, 10, 'stone1');
  p.px(cx, 11, 'waterHi');
  p.px(cx - 2, 13, 'waterHi');
  p.px(cx + 2, 13, 'waterHi');
  glow.rect(cx - 1, 10, 3, 3, 'ley1', 120);
  // lamp posts
  for (const [x, y] of [[8, 24], [58, 24]]) {
    p.rect(x, y - 8, 1, 8, 'stone1');
    p.px(x, y - 9, 'lampWarm');
    glow.px(x, y - 9, 'lampWarm');
  }
  // market stalls
  p.rect(12, 30, 8, 3, 'cloth2');
  p.rect(12, 33, 8, 2, 'wood1');
  p.rect(46, 30, 8, 3, 'cloth3');
  p.rect(46, 33, 8, 2, 'wood1');
  p.outline('outline');
  return { p, glow, ax: cx, ay: 8 };
}

function drawBoneyard(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(66, 44);
  const glow = new Painter(66, 44);
  const cx = 33;
  p.poly([[cx, 12], [65, 28], [cx, 44], [1, 28]], 'forestFloor');
  for (let y = 12; y < 44; y++) for (let x = 1; x < 65; x++) if (p.get(x, y) && h2(x, y, 3) < 0.12) p.px(x, y, 'gloamGrass');
  // low wall
  p.line(1, 28, cx, 44, 'stone1');
  p.line(cx, 44, 65, 28, 'stone2');
  p.line(1, 27, cx, 43, 'stone2');
  p.line(cx, 43, 65, 27, 'stone3');
  // graves
  for (let k = 0; k < 8; k++) {
    const u = 0.15 + (k % 4) * 0.22;
    const v = 0.2 + Math.floor(k / 4) * 0.4;
    const x = Math.round(cx + (u - v) * 32);
    const y = Math.round(12 + (u + v) * 16);
    p.rect(x - 1, y - 5, 3, 5, 'stone3');
    p.rect(x - 1, y - 5, 1, 5, 'stone2');
    p.px(x, y - 6, 'stone3');
  }
  // chapel of Morrow at back
  const ch = drawBuilding({ w: 1, h: 1, height: 9, roofH: 6, wall: 'darkstone', roof: 'slate', windows: 1, door: true, glowWindows: true, seed: 16 });
  p.blit(ch.p, cx - ch.ax + 16, 12 - ch.ay + 0);
  glow.blit(ch.glow, cx - ch.ax + 16, 12 - ch.ay + 0);
  // wisp
  p.px(20, 20, 'restless');
  glow.px(20, 20, 'restless');
  p.outline('outline');
  return { p, glow, ax: cx, ay: 12 };
}

function drawWardLantern(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 40);
  const glow = new Painter(34, 40);
  p.poly([[17, 24], [32, 32], [17, 40], [2, 32]], 'shadow', 90);
  p.poly([[17, 28], [24, 32], [17, 36], [10, 32]], 'stone2');
  p.poly([[10, 32], [17, 36], [17, 38], [10, 34]], 'stone1');
  p.poly([[17, 36], [24, 32], [24, 34], [17, 38]], 'stone2');
  p.rect(16, 10, 3, 22, 'stone1');
  p.rect(16, 10, 1, 22, 'outline');
  // lantern cage
  p.rect(13, 4, 9, 8, 'outline');
  p.rect(14, 5, 7, 6, 'ley1');
  p.rect(15, 6, 3, 3, 'leyGlow');
  p.px(17, 3, 'stone2');
  p.px(17, 2, 'stone3');
  glow.rect(13, 3, 9, 10, 'ley1', 255);
  p.outline('outline');
  return { p, glow, ax: 17, ay: 24 };
}

// ---------- assemble ----------
export function generateSprites(): SpriteDef[] {
  const out: SpriteDef[] = [];
  const push = (name: string, r: { p: Painter; glow?: Painter; ax: number; ay: number }) => out.push({ name, p: r.p, glow: r.glow, ax: r.ax, ay: r.ay });

  // terrain
  out.push(...groundVariants('grass', ['grass1', 'grass2', 'grass2', 'grass3'], ['grass3', 'grass1'], 0.08, 1, 4));
  out.push(...groundVariants('meadow', ['meadow', 'meadow2', 'meadow'], ['flower1', 'flower2', 'flower3', 'meadow2'], 0.12, 2, 3));
  out.push(...groundVariants('forest', ['forestFloor', 'leaf1', 'forestFloor'], ['leaf2', 'trunk'], 0.1, 3, 3));
  out.push(...groundVariants('hills', ['rock1', 'rock2', 'hillGrass'], ['rock3', 'rock2'], 0.18, 4, 3));
  out.push(...groundVariants('shore', ['sand', 'sand2', 'sand'], ['sand2', 'grass3'], 0.1, 5, 2));
  out.push(...groundVariants('gloam', ['gloam1', 'gloam2', 'gloamGrass'], ['gloam3', 'outline'], 0.14, 6, 3));
  out.push(...waterFrames('water', 'water2', 'water3', 'waterHi', 4, 7));
  out.push(...waterFrames('deep', 'water1', 'water2', 'water3', 4, 8));
  // ley node tile + glow
  {
    const p = diamond((u, v, px, py) => {
      const d = Math.hypot(u - 0.5, v - 0.5);
      if (d < 0.12) return 'leyGlow';
      if (d < 0.22) return 'ley1';
      if (d < 0.3) return 'ley2';
      const r = h2(px, py, 9);
      if (r < 0.2) return 'ley3';
      return 'grass2';
    });
    const glow = diamond((u, v) => {
      const d = Math.hypot(u - 0.5, v - 0.5);
      return d < 0.32 ? 'ley1' : null;
    });
    out.push({ name: 'leynode', p, glow, ax: 16, ay: 0 });
  }
  // roads
  for (const t of ['track', 'cobble', 'lantern'] as const) for (let m = 0; m < 16; m++) out.push({ name: `road_${t}_${m}`, p: roadTile(t, m), ax: 16, ay: 0 });
  // zone overlays
  const zoneCols: [string, Col][] = [['hearth', 'zoneHearth'], ['market', 'zoneMarket'], ['craft', 'zoneCraft'], ['arcane', 'zoneArcane']];
  for (const [z, c] of zoneCols) {
    const p = diamond((u, v) => {
      const e = Math.min(u, v, 1 - u, 1 - v);
      if (e < 0.08) return c;
      return null;
    });
    // semi transparent fill
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const sx = x + 0.5 - 16, sy = y + 0.5;
      const u = sx / 32 + sy / 16, v = sy / 16 - sx / 32;
      if (u >= 0 && v >= 0 && u < 1 && v < 1 && !p.get(x, y)) p.px(x, y, c, 70);
    }
    out.push({ name: `zone_${z}`, p, ax: 16, ay: 0 });
  }
  // cursors
  for (const [n, c] of [['cursor', 'flower3'], ['cursor_bad', 'fire2'], ['cursor_ok', 'zoneHearth']] as [string, Col][]) {
    const p = diamond((u, v) => (Math.min(u, v, 1 - u, 1 - v) < 0.07 ? c : null));
    out.push({ name: n, p, ax: 16, ay: 0 });
  }
  {
    const p = diamond(() => 'flower3');
    out.push({ name: 'tile_white', p, ax: 16, ay: 0 });
  }
  // props
  for (let i = 0; i < 4; i++) out.push({ name: `tree_${i}`, p: tree(i), ax: 8, ay: 24 });
  out.push({ name: 'tree_autumn', p: tree(1, true), ax: 8, ay: 24 });
  for (let i = 0; i < 3; i++) out.push({ name: `rock_${i}`, p: rock(i), ax: 7, ay: 10 });
  {
    const p = new Painter(10, 8);
    p.circle(5, 4, 3, 'leaf2');
    p.px(3, 3, 'leaf3');
    p.px(6, 2, 'leaf3');
    p.outline('outline');
    out.push({ name: 'bush', p, ax: 5, ay: 8 });
  }
  {
    const p = new Painter(12, 12);
    // dead tree for gloam
    p.rect(5, 3, 2, 9, 'gloam1');
    p.line(5, 5, 2, 2, 'gloam1');
    p.line(6, 4, 9, 1, 'gloam1');
    p.line(6, 7, 9, 6, 'gloam1');
    p.outline('outline');
    out.push({ name: 'deadtree', p, ax: 6, ay: 12 });
  }
  // zoned buildings
  for (const z of ['hearth', 'market', 'craft', 'arcane'])
    for (let lvl = 1; lvl <= 3; lvl++)
      for (let v = 0; v < 4; v++) push(`${z}_l${lvl}_v${v}`, drawBuilding(zoneSpecs(z, lvl, v)));
  // ruin
  {
    const p = new Painter(34, 26);
    p.poly([[17, 10], [32, 18], [17, 26], [2, 18]], 'shadow', 90);
    p.poly([[4, 18], [17, 25], [17, 19], [4, 12]], 'stone1');
    p.poly([[17, 25], [30, 18], [30, 14], [17, 21]], 'stone2');
    p.rect(5, 8, 2, 5, 'stone1');
    p.rect(26, 9, 3, 6, 'stone2');
    for (let k = 0; k < 10; k++) p.px(8 + k * 2, 20 + (k % 3), 'outline');
    p.outline('outline');
    out.push({ name: 'ruin', p, ax: 17, ay: 10 });
  }
  {
    const p = new Painter(66, 42);
    p.poly([[33, 8], [65, 24], [33, 40], [1, 24]], 'shadow', 90);
    p.poly([[5, 24], [33, 38], [33, 30], [5, 16]], 'stone1');
    p.poly([[33, 38], [61, 24], [61, 18], [33, 32]], 'stone2');
    p.rect(8, 6, 3, 12, 'stone1');
    p.rect(50, 8, 4, 12, 'stone2');
    p.outline('outline');
    out.push({ name: 'ruin2', p, ax: 33, ay: 8 });
  }
  {
    const p = new Painter(98, 58);
    p.poly([[49, 8], [97, 32], [49, 56], [1, 32]], 'shadow', 90);
    p.poly([[6, 32], [49, 54], [49, 42], [6, 20]], 'stone1');
    p.poly([[49, 54], [92, 32], [92, 24], [49, 46]], 'stone2');
    p.rect(12, 10, 4, 14, 'stone1');
    p.rect(70, 10, 5, 16, 'stone2');
    p.outline('outline');
    out.push({ name: 'ruin3', p, ax: 49, ay: 8 });
  }
  // service buildings
  for (const [key, spec] of Object.entries(SERVICE_SPECS)) {
    if (key === 'spire') push('b_spire', drawSpire());
    else if (key === 'well') push('b_well', drawWell());
    else if (key === 'garden') push('b_garden', drawGarden());
    else if (key === 'square') push('b_square', drawSquare());
    else if (key === 'boneyard') push('b_boneyard', drawBoneyard());
    else if (key === 'wardlantern') push('b_wardlantern', drawWardLantern());
    else push(`b_${key}`, drawBuilding(spec));
  }
  // agents
  for (let v = 0; v < 6; v++)
    for (let f = 0; f < 4; f++) out.push({ name: `cit_${v}_${f}`, p: citizen(v, f, v === 4, v === 5), ax: 4, ay: 12 });
  for (let v = 0; v < 3; v++) out.push({ name: `cart_${v}`, p: cart(v), ax: 9, ay: 11 });
  for (let f = 0; f < 2; f++) {
    const r = restlessSprite(0, f);
    out.push({ name: `restless_${f}`, p: r.p, glow: r.glow, ax: 4, ay: 12 });
  }
  // icons
  for (const k of ['nomana', 'nowater', 'fire', 'unhappy', 'gloam', 'abandoned', 'nojobs', 'nogoods']) out.push({ name: `icon_${k}`, p: icon(k), ax: 4, ay: 9 });
  // flame sprite frames
  for (let f = 0; f < 3; f++) {
    const p = new Painter(10, 14);
    const glow = new Painter(10, 14);
    const hh = 10 + f * 2 - (f === 2 ? 3 : 0);
    p.poly([[5, 14 - hh], [9, 9], [7, 14], [3, 14], [1, 9]], 'fire2');
    p.poly([[5, 16 - hh + 1], [7, 10], [5, 14], [3, 10]], 'fire1');
    glow.poly([[5, 14 - hh], [9, 9], [7, 14], [3, 14], [1, 9]], 'ember', 200);
    out.push({ name: `flame_${f}`, p, glow, ax: 5, ay: 14 });
  }
  void V;
  void PAL;
  return out;
}
