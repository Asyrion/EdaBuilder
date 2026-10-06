/**
 * Procedural pixel-art sprite generation. Everything is drawn from the palette at
 * startup into a list of SpriteDefs which the atlas packs. Hand-made art can replace
 * any sprite by name via public/art/atlas.json (see atlas.ts).
 */
import { Painter, h2 } from './painter';
import { drawCraftL1v0, drawCraftL1v1, drawCraftL1v2, drawCraftL1v3, drawDepot, drawHearthL2v0, drawHearthL2v1, drawHearthL2v2, drawHearthL2v3 } from './painted';
/** The zone houses drawn by hand after their paintings (iteration 81), by `${zone}_l${level}` then variant. */
const PAINTED: Record<string, (() => { p: Painter; glow: Painter; ax: number; ay: number })[]> = { hearth_l2: [drawHearthL2v0, drawHearthL2v1, drawHearthL2v2, drawHearthL2v3], craft_l1: [drawCraftL1v0, drawCraftL1v1, drawCraftL1v2, drawCraftL1v3] };
import { drawBrickworks, drawGreatGate, drawLanternOfVell, drawTemple } from './drawn';
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

/** Marsh ground (iteration 85): moss and mud with dark standing pools, a glint on each, and reed stubble. */
function marshGround(n: number): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (let k = 0; k < n; k++) {
    const p = diamond((u, v, px, py) => {
      const pool = h2(px >> 2, py >> 1, 40 + k * 7) < 0.45 || h2((px + 2) >> 2, (py + 1) >> 1, 41 + k * 7) < 0.25;
      if (pool) return h2(px, py, 44 + k) < 0.07 ? 'waterHi' : h2(px >> 1, py, 45 + k) < 0.6 ? 'water1' : 'water2';
      const r = h2(px, py, 46 + k * 3);
      if (r < 0.14) return r < 0.06 ? 'leaf2' : 'grass3';
      return (['moss', 'forestFloor', 'leaf1', 'moss'] as Col[])[Math.floor(h2(px >> 1, py >> 1, 47 + k) * 4)];
    });
    out.push({ name: `marsh_${k}`, p, ax: 16, ay: 0 });
  }
  return out;
}

/** A reed clump (iteration 85): stems in two greens, bowed, with cattail heads; about a citizen tall. */
function reeds(k: number): Painter {
  const p = new Painter(11, 13);
  const stems = 5 + k;
  for (let j = 0; j < stems; j++) {
    const x = 1 + Math.floor(h2(j, k, 61) * 9);
    const top = 1 + Math.floor(h2(k, j, 62) * 5);
    const lean = h2(j, j + k, 63) < 0.5 ? -1 : 1;
    for (let y = 12; y >= top; y--) p.px(Math.max(0, Math.min(10, x + (y < top + 3 ? lean : 0))), y, j % 2 ? 'leaf2' : 'grass3');
    if (h2(j, k, 64) < 0.5) { p.px(x, top, 'trunk'); p.px(x, top + 1, 'trunk'); }
  }
  p.outline('outline');
  return p;
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

function roadTile(type: 'track' | 'cobble' | 'lantern' | 'glowvine', mask: number): Painter {
  const cols: Record<string, [Col, Col, Col]> = {
    track: ['dirt1', 'dirt2', 'dirt3'],
    cobble: ['cobble1', 'cobble2', 'cobble3'],
    lantern: ['lantern1', 'lantern2', 'cobble3'],
    glowvine: ['cobble1', 'cobble2', 'glimleaf'],
  };
  const [c1, c2, c3] = cols[type];
  const half = type === 'track' ? 0.26 : 0.3;
  const n = !!(mask & 1); // y-1  (up-right on screen)
  const e = !!(mask & 2); // x+1  (down-right)
  const s = !!(mask & 4); // y+1  (down-left)
  const w = !!(mask & 8); // x-1  (up-left)
  return diamond((u, v, px, py) => {
    const du = Math.abs(u - 0.5);
    const dv = Math.abs(v - 0.5);
    let inRoad = du < half && dv < half; // centre square
    if (e && v > 0.5 - half && v < 0.5 + half && u >= 0.5) inRoad = true;
    if (w && v > 0.5 - half && v < 0.5 + half && u <= 0.5) inRoad = true;
    if (s && u > 0.5 - half && u < 0.5 + half && v >= 0.5) inRoad = true;
    if (n && u > 0.5 - half && u < 0.5 + half && v <= 0.5) inRoad = true;
    if (mask === 0) inRoad = du < half + 0.05 && dv < half + 0.05;
    if (!inRoad) return null; // the ground tile shows beside the road (iteration 50: painted ground needs no baked grass)
    const r = h2(px, py, 77 + mask);
    // edge shading
    const edge = (e || w ? Math.min(0.5 + half - v, v - (0.5 - half)) : 1) < 0.05 || (n || s ? Math.min(0.5 + half - u, u - (0.5 - half)) < 0.05 : false);
    if (type === 'track') {
      if (r < 0.12) return c3;
      if (r < 0.25 || edge) return c2;
      return c1;
    }
    if (type === 'glowvine') {
      // cobbles with a vine running down each side and glowing berries
      const cx = (px + (py & 2 ? 2 : 0)) % 4;
      const cy = py % 2;
      const edgeBand = (e || w) && Math.abs(v - 0.5) > half - 0.09 || (n || s) && Math.abs(u - 0.5) > half - 0.09 || mask === 0;
      if (edgeBand) {
        if (r < 0.2) return 'leyGlow';
        if (r < 0.7) return 'glimleaf';
        return 'leaf2';
      }
      if (cx === 0 || cy === 0) return c2;
      if (r < 0.08) return c3;
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

function wallTile(mask: number): { p: Painter; glow: Painter } {
  // low stone wall with leystone inlay; arms toward connected neighbours (same mask bits as roads)
  const p = new Painter(32, 26);
  const glow = new Painter(32, 26);
  const n = !!(mask & 1);
  const e = !!(mask & 2);
  const sIt = !!(mask & 4);
  const w = !!(mask & 8);
  const H = 7;
  // centre post
  const post = (cx: number, cy: number, h: number) => {
    p.rect(cx - 1, cy - h, 3, h, 'stone2');
    p.rect(cx - 1, cy - h, 1, h, 'stone1');
    p.px(cx, cy - h - 1, 'stone3');
    p.px(cx, cy - Math.floor(h / 2), 'ley1');
    glow.px(cx, cy - Math.floor(h / 2), 'ley1', 220);
  };
  // arms as parallelograms from centre (16,18) toward edge midpoints
  const arm = (dx: number, dy: number, left: boolean) => {
    // draw a segment of wall from centre toward (16+dx*8, 18+dy*4)
    for (let k = 0; k <= 8; k++) {
      const x = 16 + Math.round((dx * 8 * k) / 8);
      const y = 18 + Math.round((dy * 4 * k) / 8);
      for (let h = 0; h < H; h++) p.px(x, y - h, left ? 'stone1' : 'stone2');
      p.px(x, y - H, 'stone3');
      p.px(x, y, 'outline');
      if (k % 4 === 2) { p.px(x, y - 3, 'ley1'); glow.px(x, y - 3, 'ley1', 160); }
    }
  };
  if (w) arm(-2, -1, true);   // toward up-left edge (x-1)
  if (n) arm(2, -1, false);   // toward up-right (y-1)
  if (sIt) arm(-2, 1, true);  // down-left (y+1)
  if (e) arm(2, 1, false);    // down-right (x+1)
  post(16, 18, H + 2);
  p.outline('outline');
  return { p, glow };
}

// ---------- buildings ----------
export type Wall = 'sod' | 'timber' | 'stone' | 'whitewash' | 'arcane' | 'bone' | 'darkstone' | 'plaster' | 'bluewash' | 'log' | 'brick';
export type Roof = 'thatch' | 'shingle' | 'slate' | 'tile' | 'arcane' | 'flat' | 'cone' | 'dome' | 'green' | 'awning' | 'moss' | 'copper' | 'none';

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
  overhang?: boolean; // upper floor juts out (crooked fantasy townhouse)
  runeBand?: boolean; // glowing rune band around the walls
  alembic?: boolean; // copper alembic with green glass on the roof
  bottles?: boolean; // potion bottles displayed along the front
  lanternPost?: boolean; // a hanging lantern by the door
  orbit?: boolean; // small crystals orbiting a central crystal
  standingStones?: boolean;
  wisps?: boolean; // little green-blue wisps
  bellTower?: boolean;
  ridgeOrnament?: boolean; // carved beast heads on the roof ridge
  glassDome?: boolean;
  waterWheel?: boolean; // a mill wheel on the left face
  vines?: boolean; // glowing vines down the walls
  stonePile?: boolean; // cut blocks stepped beside the right face and a windlass post over them (the Quarry)
  fishRack?: boolean; // a drying rack hung with fish and an upturned boat by the right face (the Fishers' Hut, iteration 60)
  reedBundles?: boolean; // sheaves of cut reed leaning on the right face (the Reed-Cutters)
  smokeRack?: boolean; // a smoking rack of fish under a little roof by the right face (the Smokehouse)
  lilyPond?: boolean; // a pond with lilies and stepping stones in front (the Water Garden)
  weirStones?: boolean; // a low stone sill with white water over it (the Weir)
  // the paintings' features, redrawn in the set's manner (iteration 79)
  porch?: boolean; // a small lean-to roof over the door on two posts
  flowerBox?: boolean; // a box of flowers under the ground-floor windows of the right face
  bush?: boolean; // a round bush at the left corner
  woodpile?: boolean; // logs stacked at the right corner
  stalls?: boolean; // a striped awning along the right face with a counter of goods under it (the depot)
  sideTree?: 'round' | 'conifer' | 'autumn'; // a small tree at the left corner
  fence?: boolean; // pickets along the left front edge
  dormer?: boolean; // a dormer window on the front slope
  balcony?: boolean; // a railing across the right face at mid height
  brickChimney?: boolean; // the chimney in brick instead of stone
}

const WALLS: Record<Wall, { l: Col; r: Col; t: Col; d: Col }> = {
  sod: { l: 'sod', r: 'sod2', t: 'sod2', d: 'sod' },
  timber: { l: 'wood1', r: 'wood2', t: 'wood3', d: 'wood1' },
  stone: { l: 'stone1', r: 'stone2', t: 'stone3', d: 'stone1' },
  whitewash: { l: 'whitewash2', r: 'whitewash', t: 'whitewash', d: 'wood1' },
  arcane: { l: 'arcane2', r: 'arcane1', t: 'arcane3', d: 'arcane2' },
  bone: { l: 'whitewash2', r: 'bone', t: 'bone', d: 'stone1' },
  darkstone: { l: 'outline', r: 'stone1', t: 'stone2', d: 'shadow' },
  plaster: { l: 'plaster2', r: 'plaster', t: 'plaster', d: 'wood1' },
  bluewash: { l: 'bluewash2', r: 'bluewash', t: 'bluewash', d: 'wood1' },
  log: { l: 'wood1', r: 'wood2', t: 'wood3', d: 'wood1' }, // the timber wall with a seam every third row (the log cabins of the paintings, iteration 79)
  brick: { l: 'brick2', r: 'brick1', t: 'brick1', d: 'wood1' },
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
  moss: { a: 'mossRoof', b: 'mossRoof2' },
  copper: { a: 'copperRoof', b: 'copperRoof2' },
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
  if (spec.overhang && H >= 12) {
    // upper floor juts out by 2px on both visible faces, with a dark underside line
    const oh = Math.floor(H * 0.5);
    p.poly([[L[0] - 2, L[1] - oh + 1], [B[0], B[1] - oh + 2], [B[0], B[1] - H], [L[0] - 2, L[1] - H]], wc.l);
    p.poly([[B[0], B[1] - oh + 2], [R[0] + 2, R[1] - oh + 1], [R[0] + 2, R[1] - H], [B[0], B[1] - H]], wc.r);
    p.line(L[0] - 2, L[1] - oh + 1, B[0], B[1] - oh + 2, 'outline');
    p.line(B[0], B[1] - oh + 2, R[0] + 2, R[1] - oh + 1, 'outline');
    // carved timber braces under the overhang
    for (let k = 1; k <= 2; k++) {
      const fx = Math.round(L[0] + ((B[0] - L[0]) * k) / 3);
      const fy = Math.round(L[1] + ((B[1] - L[1]) * k) / 3) - oh + 2;
      p.line(fx, fy, fx + 2, fy + 3, 'wood1');
      const gx = Math.round(B[0] + ((R[0] - B[0]) * k) / 3);
      const gy = Math.round(B[1] + ((R[1] - B[1]) * k) / 3) - oh + 2;
      p.line(gx, gy, gx - 2, gy + 3, 'wood1');
    }
  }
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
        } else if (spec.wall === 'whitewash' || spec.wall === 'plaster' || spec.wall === 'bluewash') {
          if (d % 6 === 0 || i % 7 === 0) p.px(x, y, 'wood1', 200);
          if (spec.wall !== 'whitewash' && (i + d) % 7 === 3 && d % 6 !== 0) p.px(x, y, 'wood1', 90);
        } else if (spec.wall === 'log') {
          if (d % 3 === 0) p.px(x, y, right ? 'wood1' : 'outline', 130); // a seam under every log
          if (d % 3 === 1 && i % 9 === 4) p.px(x, y, 'wood3', 110); // a knot now and then
        } else if (spec.wall === 'brick') {
          if (d % 3 === 0 || (i + (d % 6 >= 3 ? 2 : 0)) % 4 === 0) p.px(x, y, right ? 'brick2' : 'outline', 110);
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
          } else if (spec.roof === 'green' || spec.roof === 'moss') {
            if (h2(x, y, s) < 0.2) p.px(x, y, light);
            if (spec.roof === 'moss' && h2(x, y, s + 5) < 0.05) p.px(x, y, 'flower1');
          } else if (spec.roof === 'copper') {
            if (y % 3 === 0) p.px(x, y, dark, 120);
            if (h2(x, y, s) < 0.06) p.px(x, y, 'copper');
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
      p.rect(cx - 1, cy - 6, 3, 7, spec.brickChimney ? 'brick1' : 'stone1');
      p.rect(cx - 1, cy - 6, 1, 7, spec.brickChimney ? 'brick2' : 'outline');
      p.rect(cx, cy - 7, 2, 1, spec.brickChimney ? 'brick2' : 'stone2');
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
  if (spec.runeBand) {
    // a band of glowing runes a third of the way up both faces
    const band = Math.floor(H * 0.35);
    const runeAt = (x: number, gy: number, k: number) => {
      const y = Math.floor(gy) - band;
      const c: Col = k % 3 === 0 ? 'rune' : 'runeViolet';
      p.px(x, y, c);
      p.px(x, y - 1, c);
      if (k % 2) p.px(x + 1, y - 1, c);
      glow.px(x, y, c, 200);
      glow.px(x, y - 1, c, 200);
    };
    const lenL = B[0] - L[0];
    for (let x = L[0] + 3, k = 0; x < B[0] - 2; x += 4, k++) runeAt(x, L[1] + ((B[1] - L[1]) * (x - L[0])) / lenL, k);
    const lenR = R[0] - B[0];
    for (let x = B[0] + 3, k = 1; x < R[0] - 2; x += 4, k++) runeAt(x, B[1] + ((R[1] - B[1]) * (x - B[0])) / lenR, k);
  }
  if (spec.bottles) {
    // potion bottles on a shelf along the right face
    const len = R[0] - B[0];
    const cols: Col[] = ['glass', 'crystalPink', 'ley1', 'flower1', 'runeViolet'];
    for (let k = 0; k < 4; k++) {
      const x = Math.round(B[0] + (len * (0.45 + k * 0.12)));
      const gy = Math.floor(B[1] + ((R[1] - B[1]) * (x - B[0])) / len);
      const c = cols[(k + seed) % cols.length];
      p.rect(x, gy - 4, 1, 2, c);
      p.px(x, gy - 5, 'outline');
      glow.px(x, gy - 4, c, 140);
    }
    p.line(B[0] + Math.round(len * 0.42), Math.floor(B[1] + ((R[1] - B[1]) * 0.42)) - 2, B[0] + Math.round(len * 0.9), Math.floor(B[1] + ((R[1] - B[1]) * 0.9)) - 2, 'wood1');
  }
  if (spec.waterWheel) {
    const cx = L[0] + 7;
    const cy = L[1] - 2;
    p.circle(cx, cy, 6, 'wood2');
    p.circle(cx, cy, 5, 'wood1');
    p.circle(cx, cy, 3, 'wood3');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.line(cx, cy, Math.round(cx + Math.cos(a) * 5), Math.round(cy + Math.sin(a) * 5), 'wood2'); }
    p.circle(cx, cy, 1, 'ironDark');
    for (let k = 0; k < 6; k++) p.px(cx - 6 + k, cy + 6, 'waterHi');
  }
  if (spec.vines) {
    for (let k = 0; k < 7; k++) {
      const x = ox + 3 + Math.floor(h2(k, seed, 5) * (W - 6));
      const top = base + Math.floor(h2(seed, k, 6) * 4);
      const len = 6 + Math.floor(h2(k, seed + 1, 7) * (H + 6));
      for (let y = top; y < top + len; y++) if (p.get(x, y)) p.px(x, y, (y + k) % 3 === 0 ? 'glimleaf' : 'leaf2');
      const gy = top + len - 1;
      p.px(x, gy, 'leyGlow');
      glow.px(x, gy, 'glimleaf', 200);
      if (k % 2 === 0) { p.px(x + 1, gy - 3, 'flower1'); glow.px(x + 1, gy - 3, 'lampWarm', 160); }
    }
  }
  if (spec.lanternPost) {
    const x = R[0] - 3;
    const y = R[1] - 1;
    p.rect(x, y - 9, 1, 9, 'ironDark');
    p.px(x + 1, y - 9, 'ironDark');
    p.rect(x + 1, y - 8, 2, 3, 'lampWarm');
    p.px(x + 1, y - 8, 'windowLit');
    glow.rect(x, y - 9, 4, 5, 'lampWarm', 230);
  }
  if (spec.stonePile) {
    // dressed blocks in three stepped rows, and the windlass: a post with an arm and an iron hook
    const x = R[0] - 11;
    const y = R[1] - 2;
    for (let k = 0; k < 3; k++) {
      p.rect(x + k, y - 2 * k - 2, 7 - 2 * k, 2, k % 2 ? 'stone2' : 'stone1');
      p.px(x + k + 2, y - 2 * k - 2, 'stone3');
    }
    p.rect(x + 8, y - 11, 1, 10, 'wood2');
    p.line(x + 8, y - 11, x + 2, y - 11, 'wood1');
    p.rect(x + 2, y - 10, 1, 3, 'ironDark');
    p.px(x + 3, y - 7, 'ironDark');
  }
  if (spec.fishRack) {
    // a drying rack: two posts, a bar, four fish hanging; and an upturned boat on the ground before it
    const x = R[0] - 11;
    const y = R[1] - 1;
    p.rect(x, y - 9, 1, 8, 'wood2');
    p.rect(x + 7, y - 9, 1, 8, 'wood2');
    p.line(x, y - 9, x + 7, y - 9, 'wood1');
    for (let k = 0; k < 4; k++) { p.rect(x + 1 + k * 2, y - 8, 1, 3, k % 2 ? 'stone3' : 'whitewash2'); p.px(x + 1 + k * 2, y - 5, 'water2'); }
    p.rect(x - 1, y - 2, 9, 2, 'wood1');
    p.rect(x, y - 3, 7, 1, 'wood3');
  }
  if (spec.reedBundles) {
    // four sheaves of reed leaning on the right face, tied in the middle
    const x = R[0] - 12;
    const y = R[1] - 1;
    for (let k = 0; k < 4; k++) {
      const bx = x + k * 3;
      p.rect(bx, y - 9, 2, 9, k % 2 ? 'thatch1' : 'thatch2');
      p.px(bx, y - 10, 'thatch1');
      p.px(bx + 1, y - 5, 'wood1');
    }
  }
  if (spec.smokeRack) {
    // a rack of fish under a small lean-to roof, and smoke curling over it
    const x = R[0] - 11;
    const y = R[1] - 1;
    p.rect(x, y - 7, 8, 1, 'wood1');
    p.line(x - 1, y - 9, x + 8, y - 8, 'thatch2');
    for (let k = 0; k < 3; k++) p.rect(x + 1 + k * 2, y - 6, 1, 3, 'copper');
    p.rect(x, y - 2, 8, 2, 'stone1');
    p.px(x + 3, y - 3, 'ember');
    glow.px(x + 3, y - 3, 'ember', 200);
    for (let k = 0; k < 3; k++) p.px(x + 4 + k, y - 11 - k * 2, 'smoke');
  }
  if (spec.lilyPond) {
    // a pond across the front of the footprint, lilies on it and stepping stones over it
    const cx = B[0];
    const cy = B[1] - 5;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -10; dx <= 10; dx++) if ((dx * dx) / 100 + (dy * dy) / 9 <= 1) p.px(cx + dx, cy + dy, dy < 0 ? 'water2' : 'water1');
    for (const [dx, dy] of [[-6, 0], [5, -1], [1, 2]]) { p.px(cx + dx, cy + dy, 'leaf2'); p.px(cx + dx + 1, cy + dy, 'leaf1'); p.px(cx + dx, cy + dy - 1, 'flower1'); }
    for (let k = -8; k <= 8; k += 4) p.rect(cx + k, cy + (k > 0 ? 1 : 0), 2, 1, 'stone3');
    p.px(cx - 2, cy - 1, 'waterHi');
  }
  if (spec.weirStones) {
    // a low sill of dressed stone and white water spilling over it
    const x = L[0] + 2;
    const y = L[1] + 2;
    for (let k = 0; k < 12; k++) p.px(x + k, y - Math.floor(k / 2), k % 3 ? 'stone2' : 'stone3');
    for (let k = 0; k < 12; k += 2) { p.px(x + k, y + 1 - Math.floor(k / 2), 'waterHi'); p.px(x + k + 1, y + 2 - Math.floor(k / 2), 'water2'); }
  }
  if (spec.alembic) {
    // copper still with a green glass bulb on the roof
    const cx = ox + Math.round(W * 0.62);
    const cy = Math.round(base + FH / 2 - RH) + 2;
    p.rect(cx - 2, cy - 6, 4, 6, 'copper');
    p.rect(cx - 2, cy - 6, 1, 6, 'copper2');
    p.circle(cx, cy - 9, 3, 'glass');
    p.px(cx - 1, cy - 10, 'glassGlow');
    p.line(cx + 3, cy - 8, cx + 6, cy - 4, 'copper');
    glow.circle(cx, cy - 9, 3, 'glass', 200);
    for (let k = 0; k < 3; k++) {
      p.px(cx + 1 + k, cy - 13 - k * 2, 'verdigris');
    }
  }
  if (spec.orbit) {
    const cx = ox + Math.round(W / 2);
    const cy = Math.round(base + FH / 2 - RH) - 9;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + seed;
      const x = Math.round(cx + Math.cos(a) * 7);
      const y = Math.round(cy + Math.sin(a) * 3);
      const c: Col = k === 0 ? 'crystalPink' : k === 1 ? 'ley1' : 'runeViolet';
      p.px(x, y, c);
      p.px(x, y - 1, c);
      glow.rect(x - 1, y - 2, 3, 4, c, 180);
    }
  }
  if (spec.bellTower) {
    const cx = ox + Math.round(W * 0.28);
    const top = Math.round(base + FH / 2 - RH) - 14;
    p.rect(cx - 2, top + 4, 5, 12, 'stone2');
    p.rect(cx - 2, top + 4, 1, 12, 'stone1');
    p.rect(cx - 1, top + 6, 3, 3, 'windowDark');
    p.px(cx, top + 7, 'gold');
    p.poly([[cx - 3, top + 4], [cx, top], [cx + 3, top + 4]], 'slate2');
    p.px(cx, top - 1, 'gold');
  }
  if (spec.ridgeOrnament && spec.roof !== 'flat' && spec.roof !== 'none' && spec.roof !== 'dome' && spec.roof !== 'cone') {
    const r1x = ox + h * 8 + 1;
    const r1y = base + FH / 4 - RH + h * 4 - 1;
    const r2x = ox + W - w * 8 - 1;
    const r2y = base + FH / 4 - RH + h * 4 + w * 4 - 1;
    for (const [x, y] of [[r1x, r1y], [r2x, r2y]] as [number, number][]) {
      p.px(x, y - 1, 'gold');
      p.px(x, y - 2, 'gold');
      p.px(x + 1, y - 3, 'gold');
      p.px(x - 1, y - 3, 'gold');
    }
  }
  if (spec.wisps) {
    for (let k = 0; k < 3; k++) {
      const x = ox + 4 + Math.floor(h2(k, seed, 3) * (W - 8));
      const y = base + H + Math.floor(h2(seed, k, 4) * FH * 0.6);
      p.px(x, y, 'restless');
      p.px(x, y - 1, 'glassGlow');
      glow.rect(x - 1, y - 2, 3, 4, 'restless', 200);
    }
  }
  if (spec.glassDome) {
    const cx = ox + Math.round(W / 2);
    const cy = Math.round(base + FH / 2 - RH) + 1;
    const r = Math.max(5, Math.round(W / 6));
    for (let y = -r; y <= 0; y++)
      for (let x = -r * 1.4; x <= r * 1.4; x++) {
        if ((x * x) / (r * r * 1.96) + (y * y) / (r * r) > 1) continue;
        const shade = x * 0.5 - y;
        p.px(cx + x, cy + y, shade > r * 0.6 ? 'glassGlow' : 'glass', 235);
        if ((Math.round(x) + y) % 4 === 0) p.px(cx + x, cy + y, 'copper2', 160);
        glow.px(cx + x, cy + y, 'glass', 120);
      }
    p.px(cx, cy - r - 1, 'copper');
  }
  // the paintings' features (iteration 79), each a few flat polygons in the set's colours
  const gyR = (x: number) => B[1] + ((R[1] - B[1]) * (x - B[0])) / (R[0] - B[0]); // the right face's ground line
  const gyL = (x: number) => L[1] + ((B[1] - L[1]) * (x - L[0])) / (B[0] - L[0]); // the left face's ground line
  if (spec.porch) {
    const x0 = Math.round(B[0] + (R[0] - B[0]) * 0.35) - 1;
    const rcP = ROOFS[spec.roof === 'none' || spec.roof === 'flat' ? 'shingle' : spec.roof];
    for (const px of [x0, x0 + 5]) p.rect(px, Math.floor(gyR(px)) - 6, 1, 6, 'wood1');
    for (let dx = -1; dx <= 6; dx++) { const y = Math.floor(gyR(x0 + dx)) - 7; p.px(x0 + dx, y, rcP.a); p.px(x0 + dx, y - 1, rcP.b); p.px(x0 + dx, y + 1, 'outline'); }
  }
  if (spec.flowerBox && H >= 9) {
    const cols = Math.max(0, Math.round((spec.windows ?? 0) * (w / (w + h)) * 2));
    for (let c = 0; c < cols; c++) {
      const x = Math.round(B[0] + 2 + (R[0] - 2 - (B[0] + 2)) * ((c + 0.5) / cols)) - 1;
      const y = Math.floor(gyR(x)) - H + 7;
      p.rect(x - 1, y + 1, 4, 1, 'wood1');
      p.px(x - 1, y, 'leaf2'); p.px(x, y, 'flower1'); p.px(x + 1, y, 'flower2'); p.px(x + 2, y, 'leaf2');
    }
  }
  if (spec.balcony) {
    const yb = Math.floor(H * 0.5);
    for (let x = B[0] + 3; x < R[0] - 3; x++) { const y = Math.floor(gyR(x)) - yb; p.px(x, y, 'wood1'); if ((x - B[0]) % 3 === 0) p.px(x, y + 1, 'wood2'); }
  }
  if (spec.dormer) {
    const mx = Math.round((L[0] + B[0]) / 2) + 2;
    const my = Math.round((L[1] + B[1]) / 2) - H - Math.round(RH * 0.55);
    p.rect(mx - 2, my - 3, 5, 4, wc.r);
    p.rect(mx - 2, my - 3, 1, 4, wc.l);
    p.rect(mx, my - 2, 2, 2, 'windowDark');
    if (spec.glowWindows) glow.rect(mx, my - 2, 2, 2, 'windowLit');
    p.rect(mx - 3, my - 4, 7, 1, ROOFS[spec.roof === 'none' || spec.roof === 'flat' ? 'shingle' : spec.roof].b);
  }
  if (spec.bush) {
    const cx = L[0] + 4, cy = L[1] - 1;
    p.circle(cx, cy, 3, 'leaf2');
    p.circle(cx - 1, cy - 1, 1, 'leaf1');
    p.px(cx + 1, cy, 'leaf3');
  }
  if (spec.sideTree) {
    const tx = L[0] + 3, ty = L[1] - 2;
    if (spec.sideTree === 'conifer') {
      p.rect(tx, ty - 1, 1, 2, 'trunk');
      for (let k = 0; k < 7; k++) { const hw = Math.floor(k / 2); p.rect(tx - hw, ty - 8 + k, 2 * hw + 1, 1, k % 2 ? 'leaf2' : 'leaf1'); }
    } else {
      const cols: Col[] = spec.sideTree === 'autumn' ? ['leafAutumn', 'thatch1'] : ['leaf2', 'leaf1'];
      p.rect(tx, ty - 3, 1, 4, 'trunk');
      p.circle(tx, ty - 6, 3, cols[0]);
      p.circle(tx - 1, ty - 7, 1, cols[1]);
    }
  }
  if (spec.fence) {
    for (let k = 1; k <= 5; k++) { const x = L[0] + 1 + k * 2; const y = Math.floor(gyL(x)) + 1; p.rect(x, y - 2, 1, 3, 'wood1'); p.px(x, y - 3, 'wood2'); if (k < 5) p.px(x + 1, y - 1, 'wood2'); }
  }
  if (spec.woodpile) {
    const x = R[0] - 7, y = R[1] - 1;
    for (const [dx, dy] of [[0, 0], [2, 0], [4, 0], [1, -2], [3, -2]]) { p.circle(x + dx, y + dy, 1, 'wood2'); p.px(x + dx, y + dy, 'wood3'); }
  }
  if (spec.stalls) {
    const len = R[0] - B[0];
    const x0 = B[0] + Math.round(len * 0.55), x1 = B[0] + Math.round(len * 0.95);
    for (let x = x0; x <= x1; x++) { const y = Math.floor(gyR(x)) - 7; const c: Col = Math.floor((x - x0) / 2) % 2 ? 'whitewash' : 'cloth2'; p.px(x, y, c); p.px(x, y - 1, c); p.px(x, y + 1, 'outline'); }
    for (const px of [x0, x1]) p.rect(px, Math.floor(gyR(px)) - 6, 1, 6, 'wood1');
    for (let x = x0 + 1; x < x1; x++) { const y = Math.floor(gyR(x)); p.px(x, y - 2, 'wood1'); p.px(x, y - 1, 'wood2'); if ((x - x0) % 3 === 1) p.px(x, y - 3, (['flower1', 'gold', 'leaf2', 'cloth4'] as Col[])[Math.floor((x - x0) / 3) % 4]); }
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

function glimwood(variant: number): { p: Painter; glow: Painter } {
  // a pale, slender tree whose leaf tips glow faintly with thrum
  const p = new Painter(16, 26);
  const glow = new Painter(16, 26);
  p.rect(7, 16, 2, 9, 'whitewash2');
  p.px(7, 20, 'stone2');
  const layers = [[16, 6], [11, 5], [6, 3]];
  for (const [cy, r] of layers)
    for (let y = -r; y <= r; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        if ((x * x) / ((r + 1) * (r + 1)) + (y * y) / (r * r) > 1) continue;
        const edge = (x * x) / ((r + 1) * (r + 1)) + (y * y) / (r * r) > 0.7;
        const shade = x - y > r * 0.6 ? 2 : x - y < -r * 0.6 ? 0 : 1;
        const c: Col = edge && h2(x + cy, y, variant) < 0.5 ? 'glimleaf' : (['leaf1', 'leaf2', 'leaf3'] as Col[])[shade];
        if (h2(x + cy, y, variant + 9) < 0.92) p.px(8 + x, cy + y, c);
        if (c === 'glimleaf') glow.px(8 + x, cy + y, 'glimleaf', 150);
      }
  p.outline('outline');
  return { p, glow };
}

function gloamTree(variant: number): { p: Painter; glow: Painter } {
  // twisted, leafless, with a single violet eye
  const p = new Painter(16, 22);
  const glow = new Painter(16, 22);
  p.rect(7, 8, 2, 14, 'gloam1');
  p.px(6, 14, 'gloam1');
  p.px(9, 11, 'gloam1');
  p.line(7, 9, 3, 4, 'gloam1');
  p.line(8, 8, 12, 2, 'gloam1');
  p.line(3, 4, 1, 5, 'gloam1');
  p.line(12, 2, 14, 4, 'gloam1');
  p.line(8, 12, 12, 9, 'gloam1');
  p.line(7, 11, 4, 9, 'gloam1');
  if (variant % 2 === 0) {
    p.px(8, 6, 'gloamEye');
    glow.px(8, 6, 'gloamEye');
  }
  p.outline('outline');
  return { p, glow };
}

function mushrooms(variant: number): { p: Painter; glow: Painter } {
  const p = new Painter(10, 8);
  const glow = new Painter(10, 8);
  for (let k = 0; k < 3; k++) {
    const x = 1 + k * 3 + (variant % 2);
    const hgt = 2 + ((k + variant) % 2);
    p.rect(x, 8 - hgt, 1, hgt, 'whitewash');
    p.rect(x - 1, 7 - hgt, 3, 1, 'mushroom');
    p.px(x, 6 - hgt, 'mushroom');
    glow.rect(x - 1, 6 - hgt, 3, 2, 'mushroom', 160);
  }
  p.outline('outline');
  return { p, glow };
}

const DRAGON_LINES: { base: Col; belly: Col; accent: Col; eye: Col }[] = [
  { base: 'tile2', belly: 'ember', accent: 'outline', eye: 'fire1' }, // ember
  { base: 'bone', belly: 'ironDark', accent: 'whitewash2', eye: 'restless' }, // bone
  { base: 'gold', belly: 'flower1', accent: 'copper', eye: 'windowLit' }, // glim
  { base: 'ley2', belly: 'leyGlow', accent: 'leyStone', eye: 'ley1' }, // vein
  { base: 'whitewash', belly: 'stone3', accent: 'stone2', eye: 'ley1' }, // sky
  { base: 'stone1', belly: 'stone2', accent: 'gloam2', eye: 'gloamEye' }, // grey
  { base: 'verdigris', belly: 'glass', accent: 'water1', eye: 'waterHi' }, // tide
  { base: 'deepPurple', belly: 'runeViolet', accent: 'flower3', eye: 'flower3' }, // storm
  { base: 'copper', belly: 'cloth5', accent: 'whitewash', eye: 'leafAutumn' }, // fen
];

/** Four-legged, wingless drake (stage 2) or a hatchling (stage 1, smaller). */
function drawDrake(line: number, stage: number, frame: number): { p: Painter; glow: Painter } {
  const c = DRAGON_LINES[line % DRAGON_LINES.length];
  const small = stage < 2;
  const W = small ? 12 : 20;
  const H = small ? 9 : 13;
  const p = new Painter(W, H);
  const glow = new Painter(W, H);
  const y0 = small ? 3 : 4;
  // body
  p.rect(3, y0, W - 8, small ? 3 : 4, c.base);
  p.rect(3, y0 + (small ? 2 : 3), W - 8, 1, c.belly);
  // neck + head
  p.rect(W - 5, y0 - 1, 2, 2, c.base);
  p.rect(W - 4, y0 - 2, 4, 2, c.base);
  p.px(W - 1, y0 - 1, c.belly);
  p.px(W - 2, y0 - 2, c.eye);
  glow.px(W - 2, y0 - 2, c.eye);
  // horns / crest (drakes only)
  if (!small) {
    p.px(W - 4, y0 - 3, c.accent);
    p.px(W - 3, y0 - 4, c.accent);
    for (let k = 4; k < W - 6; k += 3) p.px(k, y0 - 1, c.accent);
  }
  // tail
  p.px(2, y0 + 1, c.base);
  p.px(1, y0, c.base);
  p.px(0, y0 - 1, c.accent);
  // legs, alternating
  const legY = y0 + (small ? 3 : 4);
  const legH = small ? 2 : 3;
  if (frame === 0) {
    p.rect(4, legY, 1, legH, c.base);
    p.rect(W - 7, legY, 1, legH, c.base);
  } else {
    p.rect(5, legY, 1, legH, c.base);
    p.rect(W - 8, legY, 1, legH - 1, c.base);
  }
  // line signature glow
  if (line === 0) { p.px(W - 1, y0 - 1, 'fire1'); glow.rect(W - 2, y0 - 2, 3, 3, 'ember', 160); }
  if (line === 2) glow.rect(2, y0 - 1, W - 4, H - y0, 'lampWarm', 120);
  if (line === 1) glow.rect(3, y0, W - 8, 3, 'restless', 70);
  p.outline('outline');
  return { p, glow };
}

/** Two-legged winged wyvern (stage 3), two wing frames. */
function drawWyvern(line: number, frame: number): { p: Painter; glow: Painter } {
  const c = DRAGON_LINES[line % DRAGON_LINES.length];
  const p = new Painter(28, 20);
  const glow = new Painter(28, 20);
  const wingCol: Col = line === 4 ? 'stone3' : line === 7 ? 'runeViolet' : c.base;
  // wings: up (frame 0) or down (frame 1)
  if (frame === 0) {
    p.poly([[4, 12], [10, 12], [2, 3], [0, 6]], wingCol);
    p.poly([[18, 12], [24, 12], [26, 3], [28, 6]], wingCol);
  } else {
    p.poly([[4, 12], [10, 12], [1, 17], [0, 14]], wingCol);
    p.poly([[18, 12], [24, 12], [27, 17], [28, 14]], wingCol);
  }
  // body and tail
  p.rect(9, 11, 10, 4, c.base);
  p.rect(9, 14, 10, 1, c.belly);
  p.line(9, 12, 3, 16, c.base);
  p.px(2, 17, c.accent);
  // neck + head
  p.rect(18, 9, 3, 3, c.base);
  p.rect(20, 7, 5, 3, c.base);
  p.px(24, 8, c.belly);
  p.px(23, 7, c.eye);
  glow.px(23, 7, c.eye);
  p.px(21, 6, c.accent);
  p.px(22, 5, c.accent);
  // legs
  p.rect(12, 15, 1, 3, c.base);
  p.rect(16, 15, 1, 3, c.base);
  if (line === 0) glow.rect(21, 7, 5, 3, 'ember', 150);
  if (line === 3) glow.rect(9, 11, 10, 4, 'ley1', 120);
  if (line === 7) { p.px(14, 12, 'flower3'); glow.rect(4, 3, 20, 12, 'runeViolet', 60); }
  p.outline('outline');
  return { p, glow };
}


/** The Vein-Wyrm coiled around a ley node, in the form of the user's painting (iteration 74, inspirations/wyrm): a green scaled
 *  serpent with an orange-red belly, olive spines, cream horns and bat wings. Returns back (behind the stones) and front halves. */
function drawWyrmCoil(st: 'sleeping' | 'awake' | 'dead'): { back: Painter; front: Painter; glowBack: Painter; glowFront: Painter } {
  const W = 104;
  const H = 72;
  const p = new Painter(W, H);
  const glow = new Painter(W, H);
  const cx = 52;
  const cy = 44; // ring centre (the node's pool)
  const bone = st === 'dead';
  // the painting's colours: three greens, the belly's two oranges, the spines' olive, the horns' cream
  const gDark = (bone ? 'whitewash2' : '#24502f') as Col;
  const gMid = (bone ? 'bone' : '#3f8446') as Col;
  const gLight = (bone ? 'whitewash' : '#6faa52') as Col;
  const scale = (bone ? 'whitewash2' : '#2f6b3a') as Col;
  const belly = '#d9542f' as Col;
  const bellyLight = '#f08a50' as Col;
  const spine = '#8a8f4a' as Col;
  const horn = 'parchment' as Col;
  // ring body: an ellipse band, thick, with a gap at the front-right where the tail ends
  const rx = 44;
  const ry = 22;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      const d = Math.sqrt(u * u + v * v);
      if (d < 0.62 || d > 1.0) continue;
      const ang = Math.atan2(v, u);
      if (bone && Math.floor((ang + Math.PI) / 0.28) % 3 === 1) continue; // gaps between ribs
      if (ang > 0.35 && ang < 0.95) continue; // the gap the tail leaves
      const band = (d - 0.62) / 0.38; // 0 at the inner edge, 1 at the outer
      let c: Col;
      if (!bone && band < 0.24) c = Math.floor((ang + Math.PI) * 9) % 2 === 0 ? belly : bellyLight; // the belly plates on the inner edge
      else if (band > 0.82) c = v < 0 ? gLight : gDark; // the outer edge: lit on the far side, shadowed on the near
      else {
        c = band > 0.55 ? gLight : gMid;
        // scales: a staggered row of small dark arcs
        const sa = (ang + Math.PI) * 14 + (Math.floor(band * 6) % 2) * 0.5;
        if (!bone && Math.abs(sa - Math.round(sa)) < 0.12 && Math.floor(band * 12) % 2 === 0) c = scale;
      }
      if (!bone && band > 0.4 && band < 0.5 && Math.floor((ang + Math.PI) * 4) % 5 === 0) glow.px(x, y, 'ley1', 90); // the Vein still runs in it
      p.px(x, y, c);
    }
  // olive spines along the far half of the outer ridge
  if (!bone) for (let k = 0; k < 14; k++) {
    const a = Math.PI + 0.12 + k * 0.21;
    if (a > Math.PI * 2 - 0.05) break;
    const x = Math.round(cx + Math.cos(a) * rx * 0.99);
    const y = Math.round(cy + Math.sin(a) * ry * 0.99);
    p.px(x, y - 1, spine);
    p.px(x, y - 2, spine);
    p.px(x - 1, y - 1, spine);
    p.px(x + (k % 2 ? 1 : 0), y - 3, 'parchment');
  }
  // the tail: out of the gap, curling up into a blade
  const tailCol = bone ? 'bone' : gMid;
  p.line(cx + 38, cy + 11, cx + 45, cy + 6, tailCol);
  p.line(cx + 38, cy + 12, cx + 45, cy + 7, bone ? 'whitewash2' : gDark);
  p.line(cx + 45, cy + 6, cx + 48, cy + 1, tailCol);
  if (!bone) { p.poly([[cx + 47, cy + 2], [cx + 51, cy - 5], [cx + 49, cy + 3]], horn); p.poly([[cx + 46, cy + 3], [cx + 43, cy - 2], [cx + 48, cy + 1]], spine); }
  /** A horned head facing left with its snout at (hx, hy), `k` times the base size: jaw open when awake, a skull when dead. Its
   *  outline is drawn round it, so it reads against the coil it lies on. */
  const head = (hx: number, hy: number, open: boolean, k = 1) => {
    const P = (x: number, y: number): [number, number] => [Math.round(hx + x * k), Math.round(hy + y * k)];
    const top = bone ? 'bone' : gMid;
    const under = bone ? 'whitewash2' : gDark;
    const skull = [P(0, 0), P(6, -4), P(15, -5), P(18, 1), P(12, 3), P(1, 2)];
    const jaw = [P(1, 2), P(12, 3), P(11, 7), P(2, 7)];
    if (open) p.poly(jaw, under);
    p.poly(skull, top);
    p.line(...P(2, -1), ...P(13, -3), bone ? 'whitewash' : gLight); // the lit brow
    if (open) {
      p.poly([P(2, 3), P(10, 3), P(9, 5), P(3, 5)], bone ? 'outline' : 'fire2'); // the mouth
      if (!bone) for (const t of [3, 6, 9]) { p.px(...P(t, 3), 'parchment'); p.px(...P(t + 1, 5), 'parchment'); } // teeth
    } else p.line(...P(1, 2), ...P(12, 3), under);
    // the outline round skull and jaw
    const ring = open ? [P(0, 0), P(6, -4), P(15, -5), P(18, 1), P(12, 3), P(11, 7), P(2, 7), P(1, 2)] : skull;
    for (let e = 0; e < ring.length; e++) p.line(...ring[e], ...ring[(e + 1) % ring.length], 'outline');
    // two cream horns swept back, and a smaller pair behind
    p.line(...P(12, -5), ...P(20, -10), horn);
    p.line(...P(13, -4), ...P(21, -9), horn);
    p.line(...P(8, -4), ...P(11, -8), horn);
    p.px(...P(2, -1), under); // the nostril
    if (bone) { p.px(...P(9, -2), 'outline'); p.px(...P(10, -2), 'outline'); return; }
    if (st === 'sleeping') { p.line(...P(8, -2), ...P(11, -2), 'outline'); return; } // the eye closed
    p.px(...P(9, -2), 'fire1');
    p.px(...P(10, -2), 'fire2');
    const [ex, ey] = P(8, -3);
    glow.rect(ex, ey, 5, 3, 'ember', 230);
  };
  /** A bat wing from its root, its fingers fanned toward `tips`: membrane between, cream claws at the tips. */
  const wing = (root: [number, number], tips: [number, number][]) => {
    if (bone) { for (const t of tips) p.line(root[0], root[1], t[0], t[1], 'bone'); return; }
    for (let k = 0; k + 1 < tips.length; k++) p.poly([root, tips[k], [Math.round((tips[k][0] + tips[k + 1][0]) / 2), Math.round((tips[k][1] + tips[k + 1][1]) / 2) + 2], tips[k + 1]], k % 2 ? '#2c5a36' : '#3a7340');
    for (const t of tips) { p.line(root[0], root[1], t[0], t[1], gLight); p.px(t[0], t[1], horn); }
  };
  if (st === 'sleeping') {
    // wings folded flat along the far coil, the head resting on the near coil at the front-left, eyes closed
    wing([cx + 6, cy - 18], [[cx - 22, cy - 24], [cx - 14, cy - 27], [cx - 4, cy - 28], [cx + 4, cy - 26]]);
    head(cx - 52, cy + 15, false, 1.7); // a big head, the user asked (iteration 76): it lies across the near coil, eyes shut
  } else if (st === 'awake') {
    // wings half raised behind the coil
    wing([cx + 8, cy - 16], [[cx - 18, cy - 38], [cx - 8, cy - 43], [cx + 2, cy - 44], [cx + 10, cy - 40]]);
    // the neck rises from the near-right coil in an S, the belly showing on its inner curve; the head faces the city, jaw open
    const neck: [number, number][] = [[cx + 30, cy + 10], [cx + 34, cy], [cx + 32, cy - 10], [cx + 24, cy - 18], [cx + 22, cy - 24], [cx + 23, cy - 27]];
    for (let k = 0; k + 1 < neck.length; k++) {
      const [x0, y0] = neck[k];
      const [x1, y1] = neck[k + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let t = 0; t <= n; t++) {
        const x = Math.round(x0 + ((x1 - x0) * t) / n);
        const y = Math.round(y0 + ((y1 - y0) * t) / n);
        p.rect(x - 5, y, 11, 1, gMid);
        p.px(x - 5, y, 'outline');
        p.px(x + 5, y, 'outline');
        p.px(x + 4, y, gLight);
        p.rect(x - 4, y, 3, 1, (y >> 1) % 2 ? belly : bellyLight); // the belly plates on the curve's inner side
        if ((x + y) % 3 === 0) p.px(x + 1, y, scale);
        if (t % 3 === 0) { p.px(x + 6, y, spine); p.px(x + 7, y - 1, spine); } // spines down the neck
      }
    }
    head(cx + 2, cy - 30, true, 1.35);
  } else {
    // bones: the folded wing's fingers and a horned skull at the front-left
    wing([cx + 6, cy - 18], [[cx - 22, cy - 24], [cx - 14, cy - 27], [cx - 4, cy - 28]]);
    head(cx - 52, cy + 13, false, 1.2);
  }
  p.outline('outline');
  // split into back (above the ring centre) and front halves so the node's stones sit inside the coil
  const back = new Painter(W, H);
  const front = new Painter(W, H);
  const glowBack = new Painter(W, H);
  const glowFront = new Painter(W, H);
  for (let y = 0; y < H; y++) {
    const rowStart = y * W * 4;
    const rowEnd = rowStart + W * 4;
    (y < cy ? back : front).data.set(p.data.subarray(rowStart, rowEnd), rowStart);
    (y < cy ? glowBack : glowFront).data.set(glow.data.subarray(rowStart, rowEnd), rowStart);
  }
  return { back, front, glowBack, glowFront };
}

/** The wyrm in flight: a great grey shape with ley-veined wings. */
function drawWyrmFly(frame: number): { p: Painter; glow: Painter } {
  const W = 60;
  const H = 40;
  const p = new Painter(W, H);
  const glow = new Painter(W, H);
  const wing: Col = 'stone2';
  if (frame === 0) {
    p.poly([[10, 24], [24, 24], [4, 4], [0, 12]], wing);
    p.poly([[36, 24], [50, 24], [56, 4], [60, 12]], wing);
    glow.poly([[12, 22], [22, 22], [8, 8]], 'ley2', 70);
    glow.poly([[38, 22], [48, 22], [52, 8]], 'ley2', 70);
  } else {
    p.poly([[10, 24], [24, 24], [2, 36], [0, 30]], wing);
    p.poly([[36, 24], [50, 24], [58, 36], [60, 30]], wing);
    glow.poly([[12, 26], [22, 26], [6, 32]], 'ley2', 70);
    glow.poly([[38, 26], [48, 26], [54, 32]], 'ley2', 70);
  }
  // veins on the wings
  for (let k = 0; k < 3; k++) { p.line(16, 24, 6 + k * 4, frame === 0 ? 8 + k * 3 : 32 - k * 3, 'stone1'); p.line(44, 24, 54 - k * 4, frame === 0 ? 8 + k * 3 : 32 - k * 3, 'stone1'); }
  // body, tail, neck, head
  p.rect(22, 22, 18, 7, 'stone2');
  p.rect(22, 28, 18, 2, 'stone1');
  for (let k = 0; k < 6; k++) p.px(24 + k * 3, 21, 'stone3');
  p.line(22, 25, 6, 34, 'stone2');
  p.line(22, 26, 7, 35, 'stone1');
  p.px(5, 35, 'stone3');
  p.rect(40, 18, 5, 6, 'stone2');
  p.rect(44, 14, 10, 6, 'stone2');
  p.px(52, 16, 'leyGlow');
  p.px(50, 16, 'leyGlow');
  glow.rect(49, 15, 5, 3, 'leyGlow', 220);
  p.px(46, 12, 'stone3');
  p.px(49, 11, 'stone3');
  for (let k = 0; k < 4; k++) { p.px(27 + k * 3, 24 + (k % 2), 'ley2'); glow.px(27 + k * 3, 24 + (k % 2), 'ley1', 140); }
  p.outline('outline');
  return { p, glow };
}

/** The World Tree over four growth stages, on a 3x3 footprint. */
function drawWorldTree(stage: number): { p: Painter; glow: Painter; ax: number; ay: number } {
  const W = 98;
  const canopyH = [14, 30, 52, 78][stage];
  const H = 56 + canopyH;
  const p = new Painter(W, H);
  const glow = new Painter(W, H);
  const cx = 49;
  const groundY = H - 24; // footprint diamond centre
  // footprint: roots and moss
  p.poly([[cx, groundY - 24], [97, groundY], [cx, groundY + 24], [1, groundY]], 'shadow', 90);
  p.poly([[cx, groundY - 22], [95, groundY], [cx, groundY + 22], [3, groundY]], 'forestFloor');
  for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; const r = 8 + h2(k, stage, 1) * 12; p.px(Math.round(cx + Math.cos(a) * r * 2), Math.round(groundY + Math.sin(a) * r), k % 3 ? 'meadow2' : 'glimleaf'); }
  // trunk
  const trunkW = [3, 5, 8, 12][stage];
  const trunkH = [10, 20, 34, 50][stage];
  p.rect(cx - (trunkW >> 1), groundY - trunkH, trunkW, trunkH, 'trunk');
  p.rect(cx - (trunkW >> 1), groundY - trunkH, Math.max(1, trunkW >> 2), trunkH, 'wood3');
  // roots
  for (let k = 0; k < 2 + stage * 2; k++) { const dir = k % 2 ? 1 : -1; const len = 4 + stage * 4; p.line(cx, groundY - 2, cx + dir * (len * 2), groundY + (k % 3) * 3, 'trunk'); }
  // canopy: layered blobs, glim leaves; glow points
  const top = groundY - trunkH;
  const layers = 1 + stage;
  for (let l = 0; l < layers; l++) {
    const ry = Math.round(canopyH / (layers + 1)) + 4;
    const rx = [10, 18, 28, 40][stage] - l * 4;
    const cy = top - l * ry * 0.9 + 2;
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
        const r = h2(x + 100, y + 100 + l * 7, stage + 11);
        const c: Col = y < -ry * 0.3 ? (r < 0.2 ? 'glimleaf' : 'leaf1') : y > ry * 0.4 ? 'leaf3' : r < 0.12 ? 'glimleaf' : 'leaf2';
        p.px(cx + x, Math.round(cy + y), c);
        if (r < 0.03 + stage * 0.01) { p.px(cx + x, Math.round(cy + y), 'leyGlow'); glow.px(cx + x, Math.round(cy + y), 'leyGlow', 200); }
      }
  }
  p.outline('outline');
  return { p, glow, ax: cx, ay: groundY - 24 };
}

function drawRing(): { p: Painter; glow: Painter; ax: number; ay: number } {
  // 3x3 arena: sand oval inside a stone stand
  const W = 96;
  const p = new Painter(W + 2, 66);
  const glow = new Painter(W + 2, 66);
  const cx = 49;
  const T: [number, number] = [cx, 18];
  const R: [number, number] = [97, 42];
  const B: [number, number] = [cx, 66];
  const L: [number, number] = [1, 42];
  p.poly([T, R, B, L], 'stone2');
  // stands: outer band darker, raised
  p.poly([[cx, 12], [97, 36], [97, 42], [cx, 18]], 'stone1');
  p.poly([[1, 36], [cx, 12], [cx, 18], [1, 42]], 'stone3');
  for (let y = 18; y < 66; y++) for (let x = 1; x < 97; x++) if (p.get(x, y) && ((x + y) % 6 === 0)) p.px(x, y, 'stone1');
  // sand oval
  for (let y = -12; y <= 12; y++) for (let x = -30; x <= 30; x++) if ((x * x) / 900 + (y * y) / 144 <= 1) p.px(cx + x, 42 + y, (x + y) % 5 === 0 ? 'sand2' : 'sand');
  // banners at the corners
  for (const [x, y] of [[8, 34], [90, 34], [cx, 8]] as [number, number][]) {
    p.rect(x, y - 12, 1, 12, 'wood1');
    p.rect(x + 1, y - 11, 4, 5, y === 8 ? 'gold' : 'banner');
  }
  // lamps
  for (const [x, y] of [[20, 52], [78, 52]] as [number, number][]) { p.rect(x, y - 8, 1, 8, 'ironDark'); p.px(x, y - 9, 'lampWarm'); glow.px(x, y - 9, 'lampWarm'); }
  p.outline('outline');
  return { p, glow, ax: cx, ay: 18 };
}

function drawGate(style: 2 | 3): { p: Painter; glow: Painter; ax: number; ay: number } {
  // an arch over one tile; Belregi blue-runed pale stone, Uzulim dark volcanic with crimson symbols
  const p = new Painter(34, 40);
  const glow = new Painter(34, 40);
  const stone: Col = style === 2 ? 'stone3' : 'ironDark';
  const stoneD: Col = style === 2 ? 'stone2' : 'outline';
  const rune: Col = style === 2 ? 'ley1' : 'fire2';
  // two pillars at the left and right tile corners, an arch between
  p.rect(2, 14, 4, 22, stone);
  p.rect(2, 14, 1, 22, stoneD);
  p.rect(28, 14, 4, 22, stone);
  p.rect(28, 14, 1, 22, stoneD);
  for (let x = 4; x <= 30; x++) {
    const y = 14 - Math.round(Math.sin(((x - 4) / 26) * Math.PI) * 9);
    p.rect(x, y, 1, 4, stone);
    p.px(x, y, stoneD);
  }
  // runes / symbols
  for (let k = 0; k < 5; k++) {
    const x = 6 + k * 5;
    const y = 12 - Math.round(Math.sin(((x - 4) / 26) * Math.PI) * 9) + 2;
    p.px(x, y, rune);
    glow.px(x, y, rune, 220);
    p.px(3, 18 + k * 3, rune);
    p.px(30, 18 + k * 3, rune);
    glow.px(3, 18 + k * 3, rune, 200);
    glow.px(30, 18 + k * 3, rune, 200);
  }
  if (style === 3) {
    // hooded statue heads on the pillars
    p.rect(1, 10, 6, 4, 'ironDark');
    p.rect(27, 10, 6, 4, 'ironDark');
    p.px(3, 12, 'fire2');
    p.px(30, 12, 'fire2');
    glow.px(3, 12, 'fire2');
    glow.px(30, 12, 'fire2');
  } else {
    p.px(17, 3, 'gold');
    p.px(17, 2, 'gold');
  }
  p.outline('outline');
  return { p, glow, ax: 17, ay: 20 };
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

function citizen(variant: number, frame: number, grimmen: boolean, tallow: boolean): { p: Painter; glow: Painter } {
  // drawn by hand (iteration 65): two-tone cloth lit from the right, a belt, boots, arms that swing against the stride.
  // The layout is the walkers' (hair or cap on row t-1, the face on t..t+1, the body on t+2..t+5, props in columns 6 and 7).
  const p = new Painter(8, 12);
  const glow = new Painter(8, 12);
  const cloth: Col[] = ['cloth1', 'cloth2', 'cloth3', 'cloth4', 'cloth5', 'wood2'];
  const c = cloth[variant % cloth.length];
  const skin: Col = grimmen ? 'skinGrey' : 'skin';
  const t = tallow ? 3 : 1;
  const f = frame % 4;
  // arms first, so the body overlaps their shoulders: the forward arm reaches a row lower, and its hand shows
  const armL = f === 0 ? 3 : f === 2 ? 1 : 2;
  const armR = f === 2 ? 3 : f === 0 ? 1 : 2;
  for (let k = 0; k < armL; k++) { p.px(1, t + 2 + k, c); p.px(1, t + 2 + k, 'outline', 45); }
  p.px(1, t + 2 + armL, skin);
  for (let k = 0; k < armR; k++) p.px(6, t + 2 + k, c);
  p.px(6, t + 2 + armR, skin);
  // the body: the shaded left column, a lit shoulder, the belt, and an apron or a sash by variant
  p.rect(2, t + 2, 4, 4, c);
  for (let k = 0; k < 4; k++) p.px(2, t + 2 + k, 'outline', 45);
  p.px(5, t + 2, 'whitewash', 70);
  p.px(4, t + 2, 'whitewash', 40);
  p.rect(2, t + 4, 4, 1, variant % 3 === 2 ? 'gold' : 'wood1');
  if (variant % 4 === 1) { p.rect(3, t + 4, 2, 2, 'bone'); p.px(3, t + 5, 'outline', 50); }
  // the head: hair or a hood, the face shaded on the left
  p.rect(3, t, 2, 2, skin);
  p.px(3, t + 1, 'outline', 60);
  if (grimmen) { p.rect(2, t - 1, 4, 1, 'bone'); p.px(2, t - 1, 'stone2'); }
  else if (variant % 3 === 0) { p.rect(2, t - 1, 4, 1, c); p.px(2, t, c); p.px(5, t, c); p.px(2, t, 'outline', 80); }
  else p.rect(3, t - 1, 2, 1, variant % 2 ? 'wood1' : 'outline');
  if (tallow) { for (const x of [3, 4]) { p.px(x, t, 'windowLit'); glow.px(x, t, 'windowLit'); } }
  // legs in dark hose with boots: a stride on frames 0 and 2 (the lifted foot a row short), the legs together on 1 and 3
  const leg = (x: number, len: number) => { for (let k = 0; k < len - 1; k++) p.px(x, t + 6 + k, x <= 3 ? 'stone1' : 'stone2'); p.px(x, t + 5 + len, 'wood1'); };
  if (f === 0) { leg(2, 3); leg(5, 2); }
  else if (f === 2) { leg(2, 2); leg(5, 3); }
  else if (f === 1) { leg(3, 3); leg(4, 2); }
  else { leg(3, 2); leg(4, 3); }
  // a small pack or basket on one side gives the sprite a facing
  p.px(6, t + 3, variant % 2 ? 'wood1' : 'cloth5');
  p.outline('outline');
  return { p, glow };
}

/** A builder: a citizen in a leather cap with a plank on one shoulder and a hammer; frames 2 and 3 swing the hammer. */
function builder(variant: number, frame: number): Painter {
  const { p } = citizen(variant + 1, frame % 2, false, false);
  p.rect(3, 0, 2, 1, 'wood2'); // cap
  p.rect(0, 3, 5, 1, 'wood1'); // plank on the shoulder
  if (frame >= 2) { p.px(6, frame === 2 ? 2 : 4, 'outline'); p.px(7, frame === 2 ? 1 : 4, 'stone2'); } // hammer up / down
  else p.px(6, 3, 'stone2');
  p.outline('outline');
  return p;
}

/** A walker: a citizen with a signature prop so the kind reads at 2x. Props: rod (watchman). */
function walker(prop: string, variant: number, frame: number): Painter {
  const { p } = citizen(variant + 2, frame, false, false);
  switch (prop) {
    case 'rod':
      p.rect(3, 0, 2, 1, 'fire1'); // red cap
      p.rect(7, 1, 1, 6, 'wood1'); // the Watch's rod
      p.px(7, 1, 'stone2');
      break;
    case 'spoon': // a sexton: grey hood and the long salt spoon
      p.rect(2, 0, 4, 1, 'stone2');
      p.px(2, 1, 'stone2'); p.px(5, 1, 'stone2');
      p.rect(7, 2, 1, 5, 'bone');
      p.px(7, 2, 'windowLit');
      break;
    case 'satchel': // a healer: green sash and a satchel
      p.rect(2, 3, 4, 1, 'leaf1');
      p.rect(6, 4, 2, 2, 'wood2');
      p.px(6, 4, 'bone');
      break;
    case 'book': // a scholar: a blue robe and a book under the arm
      p.rect(2, 3, 4, 4, 'cloth3');
      p.rect(6, 4, 2, 2, 'parchment');
      p.px(6, 5, 'wood1');
      break;
    case 'leash': // a tamer: a leather cap and a lead with a loop
      p.rect(3, 0, 2, 1, 'wood2');
      p.rect(7, 2, 1, 4, 'wood1');
      p.px(6, 6, 'wood1'); p.px(7, 6, 'wood1');
      break;
    case 'staff': // a pilgrim: a white hood and a tall staff with a lit tip
      p.rect(2, 0, 4, 1, 'bone');
      p.px(2, 1, 'bone'); p.px(5, 1, 'bone');
      p.rect(7, 1, 1, 7, 'wood3');
      p.px(7, 0, 'fire1');
      break;
    case 'salt': // a Grimmen stone-sexton: grey hood, a salt bag at the hip and a chisel
      p.rect(2, 0, 4, 1, 'stone2');
      p.px(2, 1, 'stone2'); p.px(5, 1, 'stone2');
      p.rect(6, 5, 2, 2, 'bone');
      p.rect(7, 1, 1, 3, 'stone3');
      p.px(7, 0, 'outline');
      break;
    case 'pole': // a Veshari bargeman: a wide reed hat and a long pole
      p.rect(1, 0, 6, 1, 'wood2');
      p.rect(2, 1, 4, 1, 'wood1');
      p.rect(7, 0, 1, 10, 'wood1');
      p.px(7, 9, 'ironDark');
      break;
    case 'lamp': // a Tallowkin lamplighter: candle-eyed, a pole with a lit lantern over the shoulder
      p.px(3, 1, 'windowLit'); p.px(4, 1, 'windowLit');
      p.rect(7, 0, 1, 6, 'wood2');
      p.rect(6, 0, 3, 2, 'gold');
      p.px(7, 1, 'fire1');
      break;
    case 'candle': // a Tallowkin warden: candle-eyed, a tallow candle held up
      p.px(3, 1, 'windowLit'); p.px(4, 1, 'windowLit');
      p.rect(7, 1, 1, 3, 'bone');
      p.px(7, 0, 'fire1');
      break;
    default:
      p.px(6, 3, 'cloth5');
  }
  p.outline('outline');
  return p;
}

function cart(variant: number): Painter {
  const p = new Painter(18, 12);
  if (variant === 3) {
    // floating cart: no mule, a leystone keel and a violet load
    p.rect(5, 4, 11, 4, 'cartWood');
    p.rect(5, 4, 11, 1, 'wood1');
    p.rect(7, 2, 6, 2, 'arcane2');
    p.px(8, 1, 'arcane1');
    p.px(11, 1, 'arcane1');
    p.rect(6, 8, 9, 1, 'ley2');
    p.px(6, 9, 'ley1');
    p.px(14, 9, 'ley1');
    p.rect(16, 1, 1, 4, 'ironDark');
    p.px(16, 0, 'ley1');
    p.outline('outline');
    return p;
  }
  if (variant === 4) {
    // barge: a flat hull, a cargo hump and a stern lantern
    p.poly([[0, 7], [17, 7], [15, 11], [2, 11]], 'wood2');
    p.rect(1, 6, 16, 1, 'wood1');
    p.rect(5, 3, 8, 3, 'cloth5');
    p.rect(5, 3, 8, 1, 'wood3');
    p.rect(16, 2, 1, 4, 'ironDark');
    p.px(16, 1, 'lampWarm');
    p.px(1, 5, 'wood3');
    p.outline('outline');
    return p;
  }
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
  // a lantern on a pole
  p.rect(16, 1, 1, 4, 'ironDark');
  p.px(16, 0, 'lampWarm');
  p.outline('outline');
  return p;
}

/** A golem hauler (iteration 72): a Concord Warden in harness, walking right and dragging a stone-wheeled wagon with a high load.
 *  The cart's scale (28 wide, 16 tall: a citizen and a half), the wheels and the feet on the anchor row; the eyes and the rune glow. */
function golemHauler(): { p: Painter; glow: Painter } {
  const p = new Painter(28, 18);
  const glow = new Painter(28, 18);
  // the wagon: a stone bed on two stone wheels, a heap of sacks and crates on it
  p.rect(1, 9, 15, 4, 'stone2');
  p.rect(1, 9, 15, 1, 'stone1');
  p.rect(1, 9, 1, 4, 'stone1');
  p.rect(15, 9, 1, 4, 'stone3');
  p.rect(3, 5, 11, 4, 'cloth5');
  p.rect(3, 5, 11, 1, 'cloth4');
  p.rect(4, 3, 5, 2, 'green1');
  p.px(5, 3, 'green2');
  p.rect(9, 4, 4, 1, 'wood2');
  p.rect(9, 3, 3, 1, 'wood1');
  p.circle(4, 15, 2, 'stone1');
  p.circle(12, 15, 2, 'stone1');
  p.px(4, 15, 'ironDark');
  p.px(12, 15, 'ironDark');
  // the harness pole from the wagon to the warden's hand
  p.rect(16, 10, 4, 1, 'ironDark');
  // the warden: a squat stone giant, the golem_ look at the cart's scale
  p.rect(18, 8, 2, 4, 'slate1'); // the back arm, on the pole
  p.rect(20, 5, 6, 8, 'bluewash2'); // blue-grey stone, like the painted warden
  p.rect(20, 5, 1, 8, 'slate1');
  p.rect(25, 5, 1, 8, 'bluewash');
  p.rect(21, 2, 4, 3, 'bluewash2');
  p.px(22, 3, 'leyGlow');
  p.px(24, 3, 'leyGlow');
  glow.px(22, 3, 'leyGlow');
  glow.px(24, 3, 'leyGlow');
  p.rect(22, 7, 2, 2, 'rune');
  glow.rect(22, 7, 2, 2, 'rune', 200);
  p.rect(26, 6, 2, 6, 'bluewash'); // the front arm
  p.rect(21, 13, 2, 4, 'slate1'); // the legs, one forward
  p.rect(24, 12, 2, 5, 'bluewash2');
  p.outline('outline');
  return { p, glow };
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
    case 'noroad': // a strip of road with no way to it
      p.rect(0, 3, 9, 4, 'stone1');
      p.px(2, 5, 'stone2');
      p.px(4, 5, 'stone2');
      p.px(6, 5, 'stone2');
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

/** The Grimmen cut in stone: every wall stone or dark stone, every roof slate, flat or none. */
function stoneSpec(spec: BuildingSpec, level: number, variant: number): BuildingSpec {
  const walls: Wall[] = ['stone', 'darkstone', 'stone', 'darkstone'];
  const roofs: Roof[] = level === 1 ? ['flat', 'none', 'flat', 'slate'] : level === 2 ? ['slate', 'flat', 'slate', 'none'] : ['slate', 'slate', 'flat', 'slate'];
  return { ...spec, wall: walls[variant % 4], roof: roofs[variant % 4], roofH: Math.max(2, spec.roofH - 3), chimney: false, lanternPost: false, runeBand: level >= 2 || spec.runeBand, seed: (spec.seed ?? 0) + 500 };
}

/** The Veshari build in plank and reed: timber and washed walls, thatch and awnings, a lantern on every market post. */
function reedSpec(spec: BuildingSpec, level: number, variant: number, zone: string): BuildingSpec {
  const walls: Wall[] = ['timber', 'plaster', 'timber', 'bluewash'];
  const roofs: Roof[] = level === 1 ? ['thatch', 'thatch', 'moss', 'thatch'] : level === 2 ? ['thatch', 'shingle', 'thatch', 'awning'] : ['tile', 'thatch', 'copper', 'slate'];
  return { ...spec, wall: spec.wall === 'arcane' ? 'arcane' : walls[variant % 4], roof: roofs[variant % 4], lanternPost: spec.lanternPost || zone === 'market', seed: (spec.seed ?? 0) + 700 };
}

/** The Tallowkin build wickhouses: tall, narrow, an overhang, a lit window on every floor, whitewash and plaster under cones and shingles. */
function wickSpec(spec: BuildingSpec, level: number, variant: number): BuildingSpec {
  const walls: Wall[] = ['whitewash', 'plaster', 'whitewash', 'timber'];
  const roofs: Roof[] = level === 1 ? ['cone', 'shingle', 'cone', 'shingle'] : level === 2 ? ['shingle', 'cone', 'cone', 'tile'] : ['cone', 'copper', 'cone', 'slate'];
  return { ...spec, wall: spec.wall === 'arcane' ? 'arcane' : walls[variant % 4], roof: roofs[variant % 4], height: spec.height + 4, overhang: true, glowWindows: true, windowRows: (spec.windowRows ?? 1) + 1, seed: (spec.seed ?? 0) + 900 };
}

/** Peoples with a zone look of their own: the atlas carries a `_people` copy of every zoned sprite. */
export const ZONE_LOOKS = ['grimmen', 'veshari', 'tallowkin'];

function zoneSpecs(zone: string, level: number, variant: number, people?: string): BuildingSpec {
  if (people === 'grimmen') return stoneSpec(zoneSpecs(zone, level, variant), level, variant);
  if (people === 'veshari') return reedSpec(zoneSpecs(zone, level, variant), level, variant, zone);
  if (people === 'tallowkin') return wickSpec(zoneSpecs(zone, level, variant), level, variant);
  const seed = level * 100 + variant * 7 + zone.length;
  if (zone === 'hearth') {
    if (level === 1) {
      const walls: Wall[] = ['sod', 'sod', 'plaster', 'sod'];
      const roofs: Roof[] = ['thatch', 'moss', 'thatch', 'shingle'];
      return { w: 1, h: 1, height: 5 + (variant % 2), roofH: 5 + (variant === 3 ? 1 : 0), wall: walls[variant], roof: roofs[variant], windows: 1, door: true, chimney: variant % 2 === 0, glowWindows: true, seed, lanternPost: variant === 1 };
    }
    if (level === 2) {
      const walls: Wall[] = ['timber', 'plaster', 'whitewash', 'bluewash'];
      const roofs: Roof[] = ['shingle', 'moss', 'tile', 'slate'];
      // the four wooden_houses paintings, redrawn in code (iteration 79): a plank house with a tile roof and a porch, a log cabin
      // with a flower box and a woodpile, a log cabin with a red roof and a veranda, a log cabin with a dormer and lanterns
      const painted: Partial<BuildingSpec>[] = [
        { wall: 'timber', roof: 'tile', height: 13, roofH: 7, brickChimney: true, porch: true, lanternPost: true, fence: true, bush: true, sideTree: 'round' },
        { wall: 'log', roof: 'shingle', height: 12, roofH: 7, porch: true, flowerBox: true, woodpile: true, sideTree: 'conifer' },
        { wall: 'log', roof: 'tile', height: 12, roofH: 6, brickChimney: true, porch: true, bush: true, sideTree: 'round', fence: true },
        { wall: 'log', roof: 'shingle', height: 12, roofH: 8, dormer: true, flowerBox: true, porch: true, lanternPost: true, bush: true },
      ];
      return { w: 1, h: 1, height: 12, roofH: 7, wall: walls[variant], roof: roofs[variant], windows: 2, windowRows: 2, door: true, chimney: true, glowWindows: true, seed, ...painted[variant % 4] };
    }
    const walls: Wall[] = ['stone', 'plaster', 'bluewash', 'whitewash'];
    const roofs: Roof[] = ['slate', 'tile', 'copper', 'slate'];
    return { w: 1, h: 1, height: 18 + (variant % 2) * 2, roofH: 9, wall: walls[variant], roof: roofs[variant], windows: 2, windowRows: 3, door: true, chimney: true, glowWindows: true, seed, hip: variant >= 2, overhang: true, lanternPost: true, ridgeOrnament: variant % 2 === 1, leyLamps: variant === 0 };
  }
  if (zone === 'market') {
    if (level === 1) return { w: 1, h: 1, height: 5, roofH: 4, wall: 'timber', roof: 'awning', windows: 0, door: true, sign: true, glowWindows: true, seed, bottles: true };
    if (level === 2) return { w: 1, h: 1, height: 11, roofH: 6, wall: variant % 2 ? 'plaster' : 'timber', roof: variant % 2 ? 'tile' : 'awning', windows: 2, windowRows: 2, door: true, sign: true, glowWindows: true, seed, bottles: true, lanternPost: true, overhang: variant % 2 === 1 };
    return { w: 1, h: 1, height: 18, roofH: 7, wall: variant % 2 ? 'plaster' : 'stone', roof: variant % 2 ? 'copper' : 'slate', windows: 3, windowRows: 3, door: true, sign: true, banner: variant % 2 === 0, glowWindows: true, seed, hip: true, bottles: true, lanternPost: true, bellTower: variant % 2 === 0, ridgeOrnament: true };
  }
  if (zone === 'craft') {
    if (level === 1) {
      // the four general_craft paintings, redrawn in code (iteration 79): the tan workshop with a balcony and a sign, the red-roofed
      // cottage with a porch, the half-timbered house with a green roof and a dormer, the stone-and-timber house with a balcony
      const painted: Partial<BuildingSpec>[] = [
        { wall: 'timber', roof: 'shingle', height: 9, roofH: 5, sign: true, balcony: true, flowerBox: true, woodpile: true, sideTree: 'round' },
        { wall: 'timber', roof: 'tile', height: 8, roofH: 6, sign: true, porch: true, flowerBox: true, sideTree: 'round', fence: true, lanternPost: true },
        { wall: 'plaster', roof: 'green', height: 9, roofH: 5, brickChimney: true, dormer: true, flowerBox: true, sideTree: 'autumn', fence: true },
        { wall: 'stone', roof: 'slate', height: 9, roofH: 5, sign: true, balcony: true, porch: true, sideTree: 'conifer', woodpile: true },
      ];
      return { w: 1, h: 1, height: 9, roofH: 5, wall: 'timber', roof: 'shingle', windows: 2, windowRows: 1, door: true, chimney: true, glowWindows: true, seed, ...painted[variant % 4] };
    }
    if (level === 2) return { w: 1, h: 1, height: 10, roofH: 6, wall: variant % 2 ? 'stone' : 'darkstone', roof: 'shingle', windows: 2, windowRows: 1, door: true, chimney: true, glowWindows: true, seed, alembic: true };
    return { w: 1, h: 1, height: 14, roofH: 7, wall: 'darkstone', roof: variant % 2 ? 'slate' : 'shingle', windows: 2, windowRows: 2, door: true, chimney: true, glowWindows: true, seed, glassDome: variant % 2 === 0, alembic: variant % 2 === 1, runeBand: variant % 2 === 1 };
  }
  // arcane
  if (level === 1) return { w: 1, h: 1, height: 8, roofH: 6, wall: 'arcane', roof: 'arcane', windows: 1, windowRows: 1, door: true, glowWindows: true, seed, hip: variant % 2 === 1, runeBand: true };
  if (level === 2) return { w: 1, h: 1, height: 16, roofH: 8, wall: variant % 2 ? 'stone' : 'arcane', roof: 'arcane', windows: 2, windowRows: 2, door: true, glowWindows: true, seed, spire: true, runeBand: true, overhang: variant % 2 === 0 };
  return { w: 1, h: 1, height: 22, roofH: 11, wall: variant % 2 ? 'arcane' : 'stone', roof: 'cone', windows: 2, windowRows: 3, door: true, glowWindows: true, seed, crystal: true, orbit: true, runeBand: true };
}

const SERVICE_SPECS: Record<string, BuildingSpec> = {
  stake: { w: 2, h: 2, height: 14, roofH: 8, wall: 'timber', roof: 'shingle', windows: 2, windowRows: 2, door: true, chimney: true, banner: true, glowWindows: true, leyLamps: true, seed: 1, overhang: true, ridgeOrnament: true, lanternPost: true },
  spire: { w: 1, h: 1, height: 3, roofH: 2, wall: 'stone', roof: 'flat', seed: 2 }, // special-drawn below
  nexus: { w: 2, h: 2, height: 6, roofH: 4, wall: 'stone', roof: 'flat', crystal: true, leyLamps: true, seed: 3, orbit: true, runeBand: true },
  font: { w: 2, h: 2, height: 10, roofH: 6, wall: 'darkstone', roof: 'flat', crystal: true, seed: 4, runeBand: true, orbit: true },
  mine: { w: 2, h: 2, height: 8, roofH: 6, wall: 'darkstone', roof: 'shingle', windows: 0, door: true, seed: 23, crystal: true, lanternPost: true },
  mothloft: { w: 1, h: 1, height: 16, roofH: 5, wall: 'timber', roof: 'cone', windows: 2, windowRows: 3, seed: 25, runeBand: true, orbit: true },
  hunterslodge: { w: 2, h: 2, height: 11, roofH: 8, wall: 'timber', roof: 'moss', windows: 2, windowRows: 1, door: true, chimney: true, banner: true, glowWindows: true, seed: 26, ridgeOrnament: true, lanternPost: true },
  cradle: { w: 2, h: 2, height: 6, roofH: 3, wall: 'stone', roof: 'flat', windows: 0, seed: 27, runeBand: true, orbit: true, leyLamps: true },
  greatcradle: { w: 2, h: 2, height: 10, roofH: 4, wall: 'stone', roof: 'flat', windows: 0, seed: 27, runeBand: true, orbit: true, leyLamps: true, standingStones: true, crystal: true }, // a cradle at level 2 (iteration 53)
  hatchery: { w: 2, h: 2, height: 5, roofH: 2, wall: 'darkstone', roof: 'none', windows: 0, seed: 33, runeBand: true, leyLamps: true, standingStones: true },
  seep: { w: 1, h: 1, height: 3, roofH: 2, wall: 'darkstone', roof: 'none', windows: 0, seed: 9 },
  stoneward: { w: 1, h: 1, height: 12, roofH: 2, wall: 'darkstone', roof: 'flat', windows: 0, seed: 21, runeBand: true, standingStones: true },
  quarry: { w: 1, h: 1, height: 6, roofH: 2, wall: 'darkstone', roof: 'none', windows: 0, seed: 46, lanternPost: true, stonePile: true },
  tidewell: { w: 1, h: 1, height: 4, roofH: 4, wall: 'stone', roof: 'thatch', windows: 0, seed: 48, lanternPost: true },
  landing: { w: 1, h: 1, height: 3, roofH: 2, wall: 'timber', roof: 'none', windows: 0, seed: 49, lanternPost: true, banner: true },
  tidepool: { w: 2, h: 2, height: 4, roofH: 2, wall: 'stone', roof: 'none', windows: 0, seed: 50, runeBand: true, leyLamps: true, wisps: true },
  tamerslodge: { w: 2, h: 2, height: 12, roofH: 7, wall: 'plaster', roof: 'copper', windows: 2, windowRows: 2, door: true, banner: true, glowWindows: true, seed: 28, lanternPost: true, ridgeOrnament: true },
  stormpeak: { w: 1, h: 1, height: 20, roofH: 6, wall: 'stone', roof: 'cone', windows: 1, windowRows: 2, seed: 29, spire: true, runeBand: true },
  torrentmill: { w: 1, h: 1, height: 9, roofH: 5, wall: 'timber', roof: 'shingle', windows: 1, windowRows: 1, door: true, seed: 34, waterWheel: true, glowWindows: true },
  glimhouse: { w: 2, h: 2, height: 8, roofH: 6, wall: 'plaster', roof: 'green', windows: 3, windowRows: 1, glowWindows: true, seed: 31, glassDome: true, runeBand: true },
  observatory: { w: 2, h: 2, height: 14, roofH: 8, wall: 'darkstone', roof: 'dome', windows: 2, windowRows: 2, door: true, glowWindows: true, seed: 32, orbit: true, spire: true, runeBand: true },
  hanginggardens: { w: 2, h: 2, height: 10, roofH: 4, wall: 'stone', roof: 'moss', windows: 0, seed: 33, vines: true, wisps: true },
  golemfoundry: { w: 2, h: 2, height: 14, roofH: 6, wall: 'darkstone', roof: 'copper', windows: 2, windowRows: 1, door: true, chimney: true, glowWindows: true, seed: 37, runeBand: true, alembic: true },
  forgetemple: { w: 2, h: 2, height: 15, roofH: 4, wall: 'darkstone', roof: 'flat', windows: 2, windowRows: 1, door: true, chimney: true, glowWindows: true, seed: 41, runeBand: true, standingStones: true, bellTower: true },
  underkingseat: { w: 3, h: 3, height: 30, roofH: 6, wall: 'darkstone', roof: 'flat', windows: 2, windowRows: 4, door: true, glowWindows: true, seed: 44, crystal: true, runeBand: true, standingStones: true, leyLamps: true },
  leybeacon: { w: 1, h: 1, height: 24, roofH: 5, wall: 'stone', roof: 'cone', windows: 1, windowRows: 3, seed: 38, spire: true, crystal: true, runeBand: true },
  drakemews: { w: 2, h: 2, height: 9, roofH: 7, wall: 'timber', roof: 'thatch', windows: 2, windowRows: 1, door: true, banner: true, glowWindows: true, seed: 39, lanternPost: true, ridgeOrnament: true },
  scaleward: { w: 1, h: 1, height: 14, roofH: 4, wall: 'bone', roof: 'cone', windows: 1, windowRows: 2, seed: 43, leyLamps: true, runeBand: true, spire: true },
  wyrmforge: { w: 2, h: 2, height: 12, roofH: 6, wall: 'darkstone', roof: 'copper', windows: 2, windowRows: 1, door: true, chimney: true, glowWindows: true, seed: 44, alembic: true, runeBand: true },
  eggshellfont: { w: 1, h: 1, height: 8, roofH: 5, wall: 'whitewash', roof: 'dome', seed: 45, crystal: true, runeBand: true },
  raymirror: { w: 2, h: 2, height: 10, roofH: 6, wall: 'stone', roof: 'dome', windows: 0, seed: 46, glassDome: true, orbit: true, leyLamps: true },
  hallofmarvels: { w: 3, h: 3, height: 20, roofH: 10, wall: 'plaster', roof: 'copper', windows: 3, windowRows: 2, door: true, banner: true, glowWindows: true, seed: 47, glassDome: true, orbit: true, runeBand: true, lanternPost: true, ridgeOrnament: true },
  fontquieting: { w: 2, h: 2, height: 10, roofH: 6, wall: 'whitewash', roof: 'dome', windows: 2, windowRows: 1, seed: 42, runeBand: true, wisps: true, leyLamps: true },
  quay: { w: 1, h: 1, height: 4, roofH: 3, wall: 'stone', roof: 'none', windows: 0, seed: 40, lanternPost: true },
  skydock: { w: 2, h: 2, height: 30, roofH: 4, wall: 'stone', roof: 'flat', windows: 2, windowRows: 4, door: true, glowWindows: true, seed: 41, runeBand: true, leyLamps: true, spire: true, banner: true },
  portalarch: { w: 1, h: 1, height: 16, roofH: 2, wall: 'arcane', roof: 'flat', windows: 0, seed: 35, runeBand: true, orbit: true, leyLamps: true },
  ruindelve: { w: 2, h: 2, height: 6, roofH: 5, wall: 'timber', roof: 'awning', windows: 1, windowRows: 1, door: true, seed: 36, lanternPost: true, standingStones: true },
  well: { w: 1, h: 1, height: 4, roofH: 5, wall: 'stone', roof: 'shingle', seed: 5 },
  cistern: { w: 2, h: 2, height: 12, roofH: 8, wall: 'stone', roof: 'dome', windows: 1, seed: 6, runeBand: true },
  watchpost: { w: 1, h: 1, height: 18, roofH: 6, wall: 'timber', roof: 'shingle', windows: 1, windowRows: 3, door: true, banner: true, glowWindows: true, seed: 7, hip: true, lanternPost: true },
  watchhouse: { w: 2, h: 2, height: 16, roofH: 6, wall: 'darkstone', roof: 'flat', windows: 2, windowRows: 2, door: true, banner: true, glowWindows: true, seed: 8, lanternPost: true, bellTower: true },
  healer: { w: 1, h: 1, height: 8, roofH: 6, wall: 'plaster', roof: 'green', windows: 2, windowRows: 2, door: true, glowWindows: true, seed: 9, bottles: true, lanternPost: true },
  hospice: { w: 2, h: 2, height: 16, roofH: 8, wall: 'whitewash', roof: 'green', windows: 3, windowRows: 3, door: true, chimney: true, glowWindows: true, seed: 10, hip: true, bottles: true, glassDome: true, lanternPost: true },
  veshari: { w: 2, h: 2, height: 14, roofH: 7, wall: 'stone', roof: 'slate', windows: 2, windowRows: 2, door: true, banner: true, glowWindows: true, seed: 11, hip: true, runeBand: true, bellTower: true },
  shrine: { w: 1, h: 1, height: 5, roofH: 6, wall: 'whitewash', roof: 'cone', windows: 1, door: true, glowWindows: true, seed: 12, lanternPost: true },
  candleshrine: { w: 1, h: 1, height: 5, roofH: 6, wall: 'whitewash', roof: 'cone', windows: 1, windowRows: 2, door: true, glowWindows: true, seed: 52, lanternPost: true, leyLamps: true },
  wicktower: { w: 1, h: 1, height: 14, roofH: 3, wall: 'plaster', roof: 'cone', windows: 1, windowRows: 3, seed: 53, glowWindows: true, lanternPost: true },
  temple: { w: 3, h: 3, height: 22, roofH: 12, wall: 'whitewash', roof: 'dome', windows: 3, windowRows: 3, door: true, glowWindows: true, leyLamps: true, seed: 13, runeBand: true, orbit: true },
  academy: { w: 2, h: 2, height: 13, roofH: 6, wall: 'bluewash', roof: 'copper', windows: 3, windowRows: 3, door: true, glowWindows: true, seed: 14, spire: true, hip: true, runeBand: true, glassDome: true },
  grandacademy: { w: 3, h: 3, height: 26, roofH: 10, wall: 'stone', roof: 'arcane', windows: 4, windowRows: 4, door: true, glowWindows: true, seed: 15, crystal: true, hip: true, orbit: true, runeBand: true, bellTower: true },
  boneyard: { w: 2, h: 2, height: 5, roofH: 5, wall: 'darkstone', roof: 'shingle', windows: 0, door: true, seed: 16 },
  ossuary: { w: 2, h: 2, height: 14, roofH: 9, wall: 'bone', roof: 'slate', windows: 2, windowRows: 2, door: true, glowWindows: true, seed: 17, spire: true, wisps: true, runeBand: true },
  wardlantern: { w: 1, h: 1, height: 14, roofH: 3, wall: 'stone', roof: 'flat', seed: 18, crystal: true },
  garden: { w: 1, h: 1, height: 1, roofH: 1, wall: 'stone', roof: 'none', seed: 19 },
  square: { w: 2, h: 2, height: 1, roofH: 1, wall: 'stone', roof: 'none', seed: 20 },
  guildhall: { w: 2, h: 2, height: 18, roofH: 8, wall: 'plaster', roof: 'copper', windows: 3, windowRows: 3, door: true, sign: true, banner: true, glowWindows: true, seed: 21, hip: true, overhang: true, bellTower: true, ridgeOrnament: true, lanternPost: true },
  depot: { w: 2, h: 2, height: 16, roofH: 8, wall: 'plaster', roof: 'slate', windows: 3, windowRows: 2, door: true, chimney: true, brickChimney: true, sign: true, banner: true, stalls: true, lanternPost: true, flowerBox: true, overhang: true, dormer: true, glowWindows: true, seed: 24 }, // the trade_houses painting redrawn (iteration 79): a half-timbered hall over a slate roof, awnings and a stall along its front
  ring: { w: 3, h: 3, height: 1, roofH: 1, wall: 'stone', roof: 'none', seed: 30 },
  lantern: { w: 3, h: 3, height: 40, roofH: 10, wall: 'stone', roof: 'cone', windows: 2, windowRows: 5, door: true, glowWindows: true, seed: 22, crystal: true, orbit: true, runeBand: true },
  lanternofwicks: { w: 3, h: 3, height: 40, roofH: 10, wall: 'whitewash', roof: 'cone', windows: 3, windowRows: 6, door: true, glowWindows: true, seed: 54, crystal: true, orbit: true, runeBand: true, leyLamps: true, lanternPost: true },
  // the water (iteration 60)
  fishershut: { w: 1, h: 1, height: 7, roofH: 6, wall: 'timber', roof: 'thatch', windows: 1, door: true, seed: 71, fishRack: true, lanternPost: true, glowWindows: true },
  smokehouse: { w: 1, h: 1, height: 8, roofH: 5, wall: 'stone', roof: 'shingle', windows: 0, door: true, chimney: true, seed: 72, smokeRack: true },
  reedcutters: { w: 1, h: 1, height: 6, roofH: 7, wall: 'timber', roof: 'thatch', windows: 1, door: true, seed: 73, reedBundles: true },
  weir: { w: 1, h: 1, height: 4, roofH: 2, wall: 'stone', roof: 'flat', windows: 0, seed: 74, weirStones: true, lanternPost: true },
  watergarden: { w: 2, h: 2, height: 7, roofH: 6, wall: 'plaster', roof: 'copper', windows: 0, seed: 75, lilyPond: true, ridgeOrnament: true, lanternPost: true },
  greatweir: { w: 2, h: 2, height: 10, roofH: 3, wall: 'stone', roof: 'flat', windows: 0, seed: 51, runeBand: true, leyLamps: true, waterWheel: true, lanternPost: true, crystal: true },
  // the nine that drew nothing until iteration 50 (the Carters' Yard, the Lyceum and the Sextons' Chapel also have paintings)
  cartersyard: { w: 2, h: 2, height: 8, roofH: 6, wall: 'timber', roof: 'thatch', windows: 1, door: true, sign: true, lanternPost: true, seed: 67 },
  chartroom: { w: 2, h: 2, height: 14, roofH: 7, wall: 'stone', roof: 'copper', windows: 2, windowRows: 2, door: true, glassDome: true, banner: true, glowWindows: true, seed: 65 },
  corelantern: { w: 2, h: 2, height: 12, roofH: 4, wall: 'stone', roof: 'flat', windows: 2, windowRows: 2, leyLamps: true, glowWindows: true, crystal: true, orbit: true, seed: 63 },
  househall: { w: 2, h: 2, height: 16, roofH: 8, wall: 'timber', roof: 'shingle', windows: 3, windowRows: 2, door: true, banner: true, ridgeOrnament: true, lanternPost: true, glowWindows: true, seed: 64 },
  lyceum: { w: 2, h: 2, height: 16, roofH: 8, wall: 'plaster', roof: 'slate', windows: 2, windowRows: 3, door: true, alembic: true, bottles: true, glowWindows: true, seed: 68 },
  saltfont: { w: 2, h: 2, height: 4, roofH: 2, wall: 'stone', roof: 'flat', crystal: true, runeBand: true, wisps: true, seed: 62 },
  sextonchapel: { w: 2, h: 2, height: 12, roofH: 8, wall: 'darkstone', roof: 'slate', windows: 1, windowRows: 2, door: true, spire: true, wisps: true, glowWindows: true, seed: 69 },
  wrightslodge: { w: 2, h: 2, height: 14, roofH: 8, wall: 'bluewash', roof: 'slate', windows: 2, windowRows: 2, door: true, chimney: true, overhang: true, sign: true, glowWindows: true, runeBand: true, seed: 66 },
  greatgate: { w: 3, h: 3, height: 46, roofH: 16, wall: 'stone', roof: 'none', windows: 2, windowRows: 2, door: true, glowWindows: true, seed: 69, runeBand: true }, // drawn by hand (drawn.ts, iteration 69)
  wyrmcourt: { w: 3, h: 3, height: 2, roofH: 1, wall: 'stone', roof: 'none', standingStones: true, runeBand: true, seed: 61 },
  hallofwicks: { w: 3, h: 3, height: 24, roofH: 10, wall: 'stone', roof: 'cone', windows: 3, windowRows: 3, door: true, glowWindows: true, leyLamps: true, crystal: true, runeBand: true, banner: true, lanternPost: true, seed: 70 },
  // halls that grow with the city (iteration 51): stage 1 from the Village, stage 2 from the Burgh
  guildhall_s1: { w: 2, h: 2, height: 22, roofH: 9, wall: 'plaster', roof: 'copper', windows: 3, windowRows: 4, door: true, sign: true, banner: true, glowWindows: true, seed: 21, hip: true, overhang: true, bellTower: true, ridgeOrnament: true, lanternPost: true, runeBand: true },
  guildhall_s2: { w: 2, h: 2, height: 26, roofH: 10, wall: 'stone', roof: 'copper', windows: 4, windowRows: 4, door: true, sign: true, banner: true, glowWindows: true, seed: 21, hip: true, overhang: true, bellTower: true, ridgeOrnament: true, lanternPost: true, runeBand: true, glassDome: true, crystal: true },
  temple_s1: { w: 3, h: 3, height: 26, roofH: 13, wall: 'whitewash', roof: 'dome', windows: 3, windowRows: 4, door: true, glowWindows: true, leyLamps: true, seed: 13, runeBand: true, orbit: true, banner: true, bellTower: true },
  temple_s2: { w: 3, h: 3, height: 32, roofH: 14, wall: 'whitewash', roof: 'dome', windows: 4, windowRows: 5, door: true, glowWindows: true, leyLamps: true, seed: 13, runeBand: true, orbit: true, banner: true, bellTower: true, crystal: true, glassDome: true },
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
  // a floating ring of leystone shards around the shaft
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const x = Math.round(17 + Math.cos(a) * 7);
    const y = Math.round(16 + Math.sin(a) * 3);
    p.px(x, y, k % 2 ? 'leyStone' : 'ley1');
    glow.px(x, y, 'ley1', 160);
  }
  // rune ring on the plinth
  for (const [x, y] of [[12, 32], [17, 30], [22, 32], [17, 35]] as [number, number][]) {
    p.px(x, y, 'rune');
    glow.px(x, y, 'rune', 200);
  }
  p.outline('outline');
  return { p, glow, ax: 17, ay: 24 };
}

/** The three wells after their paintings (iteration 79), a citizen and a half tall, standing in the middle of the tile: the
 *  anchor is 10 rows above the sprite's last row, so the ring's base sits at the tile's centre. Each is a stone ring under a
 *  little pyramid roof on two posts, with the bucket the paintings show; 16 painted rows, 18 with the outline. */
function wellRing(p: Painter, water: Col, hi: Col, mossy: boolean): void {
  // the ring: a dark left half and a lit right half, the water seen in its top
  p.rect(11, 12, 13, 5, 'stone1');
  p.rect(17, 12, 7, 5, 'stone2');
  p.poly([[17, 10], [23, 12], [17, 14], [11, 12]], 'stone3');
  p.poly([[17, 11], [21, 12], [17, 13], [13, 12]], water);
  p.px(17, 12, hi);
  for (let d = 0; d < 6; d++) p.px(12 + d * 2, 14 + (d % 2), d < 3 ? 'outline' : 'stone3'); // the courses
  if (mossy) { p.px(12, 16, 'moss'); p.px(22, 15, 'moss'); p.px(15, 16, 'moss'); }
}
function wellRoof(p: Painter, a: Col, b: Col, post: Col): void {
  // two posts, and a pyramid roof over them: the lit faces toward the right, the dark toward the left, as the set's cone roofs
  p.rect(11, 6, 1, 7, post);
  p.rect(23, 6, 1, 7, 'wood2');
  const apex: [number, number] = [17, 1], T: [number, number] = [17, 3], R: [number, number] = [25, 7], B: [number, number] = [17, 10], L: [number, number] = [9, 7];
  p.poly([L, T, apex], b);
  p.poly([T, R, apex], a);
  p.poly([L, B, apex], b);
  p.poly([B, R, apex], a);
  p.line(B[0], B[1], apex[0], apex[1], 'outline');
  p.line(L[0], L[1], apex[0], apex[1], b);
  p.line(R[0], R[1], apex[0], apex[1], a);
  p.rect(16, 11, 2, 2, 'wood1'); // the bucket on the rim
  p.px(16, 10, 'ironDark');
}
function drawWell(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 18);
  const glow = new Painter(34, 18);
  // the painting: a mossy stone ring, a shingled roof on timber posts, the bucket, a coil of rope and a mound of earth beside
  // it, cobbles under it
  for (const x of [8, 26, 10, 24]) p.px(x, 16, 'stone3');
  p.poly([[3, 17], [9, 17], [6, 14]], 'dirt2');
  p.circle(28, 15, 1, 'thatch1'); p.px(28, 15, 'thatch2');
  wellRing(p, 'water1', 'water3', true);
  wellRoof(p, 'shingle1', 'shingle2', 'wood1');
  p.outline('outline');
  return { p, glow, ax: 17, ay: 7 };
}
function drawSeep(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 18);
  const glow = new Painter(34, 18);
  // the painting: the same well under a violet slate roof, grass and flowers about its foot
  for (let x = 4; x <= 30; x += 2) p.px(x, 16, x % 4 ? 'grass2' : 'grass3');
  p.px(5, 15, 'flower3'); p.px(29, 15, 'flower1'); p.px(27, 16, 'flower2');
  wellRing(p, 'water2', 'waterHi', true);
  wellRoof(p, 'bluewash2', 'deepPurple', 'wood1');
  p.outline('outline');
  return { p, glow, ax: 17, ay: 7 };
}
function drawTidewell(): { p: Painter; glow: Painter; ax: number; ay: number } {
  const p = new Painter(34, 18);
  const glow = new Painter(34, 18);
  // the painting: a shrine well, its water glowing blue, under a green pagoda roof with upturned eaves and a finial, runes on
  // the arch beneath it, a lantern hung at each eave
  for (const x of [8, 26]) p.px(x, 16, 'stone3');
  wellRing(p, 'ley1', 'leyGlow', false);
  glow.poly([[17, 11], [21, 12], [17, 13], [13, 12]], 'ley1', 200);
  wellRoof(p, 'copperRoof', 'copperRoof2', 'wood1');
  for (const [x, y] of [[14, 9], [17, 8], [20, 9]] as [number, number][]) { p.px(x, y, 'rune'); glow.px(x, y, 'rune', 200); }
  p.px(8, 6, 'copperRoof'); p.px(26, 6, 'copperRoof'); // the upturned eaves
  p.px(17, 0, 'ironDark'); // the finial
  for (const x of [7, 27]) { p.px(x, 8, 'ironDark'); p.px(x, 9, 'lampWarm'); glow.rect(x - 1, 8, 3, 3, 'lampWarm', 220); }
  p.outline('outline');
  return { p, glow, ax: 17, ay: 7 };
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
  // a lamp post two citizens and a bit tall (iteration 78: the post was 12 px longer and stood over three)
  const p = new Painter(34, 28);
  const glow = new Painter(34, 28);
  p.poly([[17, 12], [32, 20], [17, 28], [2, 20]], 'shadow', 90);
  p.poly([[17, 16], [24, 20], [17, 24], [10, 20]], 'stone2');
  p.poly([[10, 20], [17, 24], [17, 26], [10, 22]], 'stone1');
  p.poly([[17, 24], [24, 20], [24, 22], [17, 26]], 'stone2');
  p.rect(16, 10, 3, 10, 'stone1');
  p.rect(16, 10, 1, 10, 'outline');
  // lantern cage
  p.rect(13, 4, 9, 8, 'outline');
  p.rect(14, 5, 7, 6, 'ley1');
  p.rect(15, 6, 3, 3, 'leyGlow');
  p.px(17, 3, 'stone2');
  p.px(17, 2, 'stone3');
  glow.rect(13, 3, 9, 10, 'ley1', 255);
  p.outline('outline');
  return { p, glow, ax: 17, ay: 12 };
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
  out.push(...groundVariants('ruins', ['stone2', 'stone1', 'grass3', 'stone2'], ['stone3', 'outline', 'moss', 'grass2'], 0.16, 9, 3));
  out.push(...marshGround(3)); // reed beds and standing pools (iteration 85)
  out.push(...groundVariants('gloam', ['gloam1', 'gloam2', 'gloamGrass', 'deepPurple'], ['gloam3', 'outline', 'bone'], 0.14, 6, 3));
  out.push(...waterFrames('water', 'water2', 'water3', 'waterHi', 4, 7));
  out.push(...waterFrames('deep', 'water1', 'water2', 'water3', 4, 8));
  // ley node: a glowing pool of thrum ringed by standing stones
  {
    const p = new Painter(34, 30);
    const glow = new Painter(34, 30);
    const tile = diamond((u, v, px, py) => {
      const d = Math.hypot(u - 0.5, v - 0.5);
      const ang = Math.atan2(v - 0.5, u - 0.5);
      if (d < 0.1) return 'leyGlow';
      if (d < 0.2) return 'ley1';
      if (d < 0.27) return 'ley2';
      // spiral grass
      const spiral = Math.sin(ang * 3 + d * 30);
      if (spiral > 0.7) return 'glimleaf';
      const r = h2(px, py, 9);
      if (r < 0.15) return 'meadow2';
      return 'grass2';
    });
    p.blit(tile, 1, 14);
    const gtile = diamond((u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.3 ? 'ley1' : null));
    glow.blit(gtile, 1, 14);
    // standing stones around the pool (drawn tallest at the back)
    const stones: [number, number, number][] = [[17, 14, 7], [7, 19, 5], [27, 19, 5], [11, 25, 4], [23, 25, 4]];
    for (const [x, y, hgt] of stones) {
      p.rect(x - 1, y - hgt, 3, hgt, 'stone2');
      p.rect(x - 1, y - hgt, 1, hgt, 'stone1');
      p.px(x, y - hgt - 1, 'stone3');
      p.px(x, y - Math.floor(hgt / 2), 'rune');
      glow.px(x, y - Math.floor(hgt / 2), 'rune', 220);
    }
    p.outline('outline');
    out.push({ name: 'leynode', p, glow, ax: 17, ay: 14 });
  }
  // roads
  for (const t of ['track', 'cobble', 'lantern', 'glowvine'] as const) for (let m = 0; m < 16; m++) out.push({ name: `road_${t}_${m}`, p: roadTile(t, m), ax: 16, ay: 0 });
  // warding wall autotiles
  for (let m = 0; m < 16; m++) { const wt = wallTile(m); out.push({ name: `wall_${m}`, p: wt.p, glow: wt.glow, ax: 16, ay: 2 }); }
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
  for (let i = 0; i < 2; i++) { const g = glimwood(i); out.push({ name: `glimwood_${i}`, p: g.p, glow: g.glow, ax: 8, ay: 26 }); }
  for (let i = 0; i < 2; i++) { const g = gloamTree(i); out.push({ name: `gloamtree_${i}`, p: g.p, glow: g.glow, ax: 8, ay: 22 }); }
  for (let i = 0; i < 2; i++) { const g = mushrooms(i); out.push({ name: `mushroom_${i}`, p: g.p, glow: g.glow, ax: 5, ay: 8 }); }
  for (let i = 0; i < 3; i++) out.push({ name: `rock_${i}`, p: rock(i), ax: 7, ay: 10 });
  for (let i = 0; i < 3; i++) out.push({ name: `reeds_${i}`, p: reeds(i), ax: 5, ay: 12 }); // the marsh's reed beds (iteration 85)
  {
    const p = new Painter(10, 8);
    p.circle(5, 4, 3, 'leaf2');
    p.px(3, 3, 'leaf3');
    p.px(6, 2, 'leaf3');
    p.outline('outline');
    out.push({ name: 'bush_0', p, ax: 5, ay: 8 }); // bush_N: imported bushes take the next numbers (iteration 50)
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
      for (let v = 0; v < 4; v++) { const hand = PAINTED[`${z}_l${lvl}`]?.[v]; push(`${z}_l${lvl}_v${v}`, hand ? hand() : drawBuilding(zoneSpecs(z, lvl, v))); for (const p of ZONE_LOOKS) push(`${z}_l${lvl}_v${v}_${p}`, drawBuilding(zoneSpecs(z, lvl, v, p))); } // the level-2 hearths and level-1 crafts are drawn by hand after their paintings (iteration 81); the peoples keep their own looks
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
    else if (key === 'depot') push('b_depot', drawDepot()); // after the trade house painting (iteration 81)
    else if (key === 'well') push('b_well', drawWell());
    else if (key === 'seep') push('b_seep', drawSeep()); // the three wells after their paintings (iteration 79)
    else if (key === 'tidewell') push('b_tidewell', drawTidewell());
    else if (key === 'garden') push('b_garden', drawGarden());
    else if (key === 'square') push('b_square', drawSquare());
    else if (key === 'boneyard') push('b_boneyard', drawBoneyard());
    else if (key === 'wardlantern') push('b_wardlantern', drawWardLantern());
    else if (key === 'lantern') push('b_lantern', drawLanternOfVell()); // drawn by hand (iteration 65)
    else if (key === 'greatgate') push('b_greatgate', drawGreatGate()); // drawn by hand (iteration 69)
    else if (key === 'temple' || key === 'temple_s1' || key === 'temple_s2') push(`b_${key}`, drawTemple(key === 'temple' ? 0 : key === 'temple_s1' ? 1 : 2));
    else if (key === 'ring') continue;
    else push(`b_${key}`, drawBuilding(spec));
  }
  // agents
  for (let v = 0; v < 6; v++)
    for (let f = 0; f < 4; f++) { const c = citizen(v, f, v === 4, v === 5); out.push({ name: `cit_${v}_${f}`, p: c.p, glow: v === 5 ? c.glow : undefined, ax: 4, ay: 12 }); }
  for (let v = 0; v < 3; v++) for (let f = 0; f < 4; f++) out.push({ name: `builder_${v}_${f}`, p: builder(v, f), ax: 4, ay: 12 });
  for (const [job, prop] of [['watchman', 'rod'], ['sexton', 'spoon'], ['healer', 'satchel'], ['warden', 'candle'], ['scholar', 'book'], ['tamer', 'leash'], ['pilgrim', 'staff'], ['stonesexton', 'salt'], ['bargeman', 'pole'], ['lamplighter', 'lamp']]) for (let v = 0; v < 3; v++) for (let f = 0; f < 4; f++) out.push({ name: `walker_${job}_${v}_${f}`, p: walker(prop, v, f), ax: 4, ay: 12 });
  for (let v = 0; v < 5; v++) {
    const p = cart(v);
    if (v === 3) { const glow = new Painter(18, 12); glow.rect(6, 8, 9, 2, 'ley1', 160); glow.rect(7, 2, 6, 2, 'arcane2', 120); out.push({ name: `cart_${v}`, p, glow, ax: 9, ay: 11 }); }
    else out.push({ name: `cart_${v}`, p, ax: 9, ay: 11 });
  }
  { const h = golemHauler(); out.push({ name: 'cart_6', p: h.p, glow: h.glow, ax: 14, ay: 17 }); } // the golem hauler (iteration 72)
  // war-tiger: long, striped, low; two stride frames
  for (let f = 0; f < 2; f++) {
    const p = new Painter(18, 10);
    const glow = new Painter(18, 10);
    p.rect(3, 3, 11, 4, 'copper');
    for (let k = 0; k < 5; k++) p.rect(4 + k * 2, 3, 1, 4, 'outline');
    p.rect(13, 2, 4, 3, 'copper');
    p.px(16, 3, 'whitewash');
    p.px(15, 2, 'leafAutumn');
    glow.px(15, 2, 'leafAutumn', 200);
    p.px(2, 2, 'copper');
    p.px(1, 1, 'outline');
    if (f === 0) { p.rect(4, 7, 1, 3, 'copper'); p.rect(12, 7, 1, 3, 'copper'); p.rect(7, 7, 1, 2, 'copper'); } else { p.rect(5, 7, 1, 2, 'copper'); p.rect(11, 7, 1, 3, 'copper'); p.rect(8, 7, 1, 3, 'copper'); }
    p.outline('outline');
    out.push({ name: `tiger_${f}`, p, glow, ax: 9, ay: 10 });
  }
  // drake rider: a Watch drake with a rider, two wing frames
  for (let f = 0; f < 2; f++) {
    const p = new Painter(20, 14);
    const glow = new Painter(20, 14);
    const lift = f === 0 ? -4 : 3;
    p.poly([[9, 8], [2, 4 + lift], [1, 7 + lift], [9, 10]], 'ley2');
    p.poly([[11, 8], [18, 4 + lift], [19, 7 + lift], [11, 10]], 'ley2');
    p.rect(6, 7, 8, 3, 'ley2');
    p.rect(13, 5, 4, 3, 'ley2');
    p.px(16, 6, 'ley1');
    p.line(6, 9, 2, 12, 'leyStone');
    p.rect(9, 4, 2, 3, 'banner'); // rider
    p.px(10, 3, 'whitewash');
    p.px(11, 4, 'lampWarm');
    glow.px(11, 4, 'lampWarm', 200);
    glow.px(16, 6, 'ley1', 160);
    p.outline('outline');
    out.push({ name: `rider_${f}`, p, glow, ax: 10, ay: 12 });
  }
  // airship: a ley-lamp envelope over a wooden gondola
  for (let f = 0; f < 2; f++) {
    const p = new Painter(44, 26);
    const glow = new Painter(44, 26);
    for (let y = 0; y <= 14; y++) for (let x = 2; x <= 41; x++) { const u = (x - 21.5) / 20; const v = (y - 7) / 7; if (u * u + v * v <= 1) p.px(x, y, (x + y) % 7 === 0 ? 'cloth5' : y < 4 ? 'whitewash' : 'whitewash2'); }
    p.rect(12, 8, 20, 1, 'wood3');
    for (let k = 0; k < 4; k++) p.line(14 + k * 5, 14, 15 + k * 4, 18, 'ironDark');
    p.rect(13, 18, 18, 5, 'wood2');
    p.rect(13, 18, 18, 1, 'wood1');
    p.rect(15, 20, 2, 1, 'windowLit');
    p.rect(20, 20, 2, 1, 'windowLit');
    p.rect(25, 20, 2, 1, 'windowLit');
    glow.rect(15, 20, 12, 1, 'lampWarm', 120);
    p.rect(31, 19, 3, 3, 'ironDark');
    if (f === 0) { p.px(35, 19, 'stone3'); p.px(35, 22, 'stone3'); } else { p.px(36, 20, 'stone3'); p.px(34, 21, 'stone3'); }
    p.px(6, 7, 'ley1');
    glow.px(6, 7, 'ley1', 200);
    p.outline('outline');
    out.push({ name: `airship_${f}`, p, glow, ax: 22, ay: 24 });
  }
  for (let f = 0; f < 2; f++) {
    const r = restlessSprite(0, f);
    out.push({ name: `restless_${f}`, p: r.p, glow: r.glow, ax: 4, ay: 12 });
  }
  // dragons: 8 lines x hatchling/drake x 2 frames
  for (let line = 0; line < 9; line++)
    for (const stage of [1, 2])
      for (let f = 0; f < 2; f++) {
        const d = drawDrake(line, stage, f);
        out.push({ name: `dragon_${line}_${stage}_${f}`, p: d.p, glow: d.glow, ax: Math.floor(d.p.w / 2), ay: d.p.h });
      }
  for (let line = 0; line < 9; line++) for (let f = 0; f < 2; f++) { const w = drawWyvern(line, f); out.push({ name: `wyvern_${line}_${f}`, p: w.p, glow: w.glow, ax: 14, ay: 18 }); }
  for (const st of ['sleeping', 'awake', 'dead'] as const) {
    const w = drawWyrmCoil(st);
    out.push({ name: `wyrm_${st}_back`, p: w.back, glow: w.glowBack, ax: 52, ay: 36 });
    out.push({ name: `wyrm_${st}_front`, p: w.front, glow: w.glowFront, ax: 52, ay: 36 });
  }
  for (let f = 0; f < 2; f++) { const w = drawWyrmFly(f); out.push({ name: `wyrm_fly_${f}`, p: w.p, glow: w.glow, ax: 30, ay: 34 }); }
  push('b_ring', drawRing());
  for (let st = 0; st < 4; st++) push(`b_worldtree_${st}`, drawWorldTree(st));
  push('b_brickworks', drawBrickworks()); // drawn after the user's painting (iteration 80), the Brickworks (83)
  push('gate_2', drawGate(2));
  push('gate_3', drawGate(3));
  // creatures
  for (let f = 0; f < 2; f++) {
    const p = new Painter(6, 5);
    const glow = new Painter(6, 5);
    // glimmoth: two wings, open/closed
    if (f === 0) { p.rect(0, 1, 2, 3, 'glimleaf'); p.rect(4, 1, 2, 3, 'glimleaf'); } else { p.rect(1, 2, 1, 2, 'glimleaf'); p.rect(4, 2, 1, 2, 'glimleaf'); }
    p.rect(2, 1, 2, 3, 'leyGlow');
    p.px(2, 0, 'outline'); p.px(3, 0, 'outline');
    glow.rect(0, 0, 6, 5, 'glimleaf', 150);
    out.push({ name: `glimmoth_${f}`, p, glow, ax: 3, ay: 4 });
  }
  for (let f = 0; f < 2; f++) {
    const p = new Painter(7, 6);
    p.rect(1, 2, 5, 3, 'sand');
    p.rect(1, 3, 5, 1, 'sand2');
    p.rect(5, 1, 1, 2, 'sand');
    p.px(6, 2, 'sand');
    p.px(6, 1, 'outline');
    if (f === 0) { p.px(1, 0, 'sand'); p.px(2, 1, 'sand'); } else { p.px(2, 0, 'sand'); p.px(2, 1, 'sand'); }
    p.px(0, 4, 'flower3');
    p.outline('outline');
    out.push({ name: `thrumhare_${f}`, p, ax: 3, ay: 6 });
  }
  for (let f = 0; f < 2; f++) {
    const p = new Painter(5, 8);
    const glow = new Painter(5, 8);
    const top = f;
    p.circle(2, top + 2, 2, 'restless', 200);
    p.px(2, top + 1, 'glassGlow');
    p.px(2, top + 5, 'restless', 120);
    p.px(2, top + 6, 'restless', 60);
    glow.rect(0, top, 5, 7, 'restless', 140);
    glow.px(2, top + 1, 'glassGlow');
    out.push({ name: `wisp_${f}`, p, glow, ax: 2, ay: 7 });
  }
  for (let f = 0; f < 2; f++) {
    const p = new Painter(12, 8);
    const glow = new Painter(12, 8);
    // lean grey hound, low head, ragged back
    p.rect(2, 3, 8, 3, 'gloam2');
    p.rect(3, 2, 6, 1, 'gloam3');
    p.rect(9, 2, 3, 2, 'gloam2'); // head
    p.px(11, 3, 'gloam1');
    p.px(1, 2, 'gloam2'); // tail
    p.px(0, 1, 'gloam2');
    if (f === 0) { p.rect(3, 6, 1, 2, 'gloam1'); p.rect(8, 6, 1, 2, 'gloam1'); } else { p.rect(4, 6, 1, 2, 'gloam1'); p.rect(7, 6, 1, 1, 'gloam1'); p.px(9, 7, 'gloam1'); }
    p.px(10, 2, 'gloamEye');
    glow.px(10, 2, 'gloamEye');
    glow.rect(2, 2, 10, 4, 'gloam3', 60);
    p.outline('outline');
    out.push({ name: `hound_${f}`, p, glow, ax: 6, ay: 8 });
  }
  // the wild (iteration 58): deer, elk, boar, goats, wolves, otters and herons, two stride frames each, facing right
  const beast = (w: number, h: number, body: string, belly: string, f: number, o: { bodyX: number; bodyY: number; bodyW: number; bodyH: number; legH: number; headX: number; headY: number; headW: number; headH: number; neck?: boolean; tail?: [number, number][] }) => {
    const p = new Painter(w, h);
    const { bodyX, bodyY, bodyW, bodyH, legH, headX, headY, headW, headH } = o;
    p.rect(bodyX, bodyY, bodyW, bodyH, body);
    p.rect(bodyX + 1, bodyY + bodyH - 1, bodyW - 2, 1, belly);
    if (o.neck) p.rect(headX - 1, headY + headH - 1, 2, bodyY - headY - headH + 2, body);
    p.rect(headX, headY, headW, headH, body);
    p.px(headX + headW - 1, headY + 1, 'outline'); // the eye
    for (const [tx, ty] of o.tail ?? []) p.px(tx, ty, body);
    const ly = bodyY + bodyH;
    const legs = f === 0 ? [bodyX, bodyX + 2, bodyX + bodyW - 3, bodyX + bodyW - 1] : [bodyX + 1, bodyX + 2, bodyX + bodyW - 2, bodyX + bodyW - 2];
    legs.forEach((lx, k) => p.rect(lx, ly, 1, legH - (f === 1 && k % 2 ? 1 : 0), belly));
    return p;
  };
  for (let f = 0; f < 2; f++) {
    // deer: tawny, white rump, a small rack
    const d = beast(12, 12, 'leafAutumn', 'sand2', f, { bodyX: 2, bodyY: 5, bodyW: 7, bodyH: 3, legH: 4, headX: 9, headY: 2, headW: 2, headH: 2, neck: true, tail: [[1, 5]] });
    d.px(2, 6, 'whitewash');
    d.px(9, 1, 'wood1'); d.px(10, 0, 'wood1'); d.px(11, 1, 'wood1');
    d.outline('outline');
    out.push({ name: `deer_${f}`, p: d, ax: 6, ay: 12 });
    // elk: bigger, darker, a broad rack
    const e = beast(16, 15, 'wood2', 'wood1', f, { bodyX: 2, bodyY: 6, bodyW: 9, bodyH: 4, legH: 5, headX: 12, headY: 3, headW: 3, headH: 2, neck: true, tail: [[1, 6]] });
    e.rect(3, 6, 7, 1, 'sand2');
    for (const [x, y] of [[11, 2], [12, 1], [13, 0], [14, 1], [15, 0], [12, 0], [11, 0]]) e.px(x, y, 'parchment');
    e.outline('outline');
    out.push({ name: `elk_${f}`, p: e, ax: 8, ay: 15 });
    // boar: low, dark, bristled, white tusks
    const b = beast(12, 8, 'dirt3', 'dirt1', f, { bodyX: 1, bodyY: 2, bodyW: 8, bodyH: 4, legH: 2, headX: 9, headY: 3, headW: 3, headH: 3 });
    for (let x = 2; x < 8; x += 2) b.px(x, 1, 'dirt1');
    b.px(11, 5, 'bone');
    b.outline('outline');
    out.push({ name: `boar_${f}`, p: b, ax: 6, ay: 8 });
    // goat: pale, a beard and curled horns
    const g = beast(11, 11, 'whitewash2', 'stone3', f, { bodyX: 2, bodyY: 4, bodyW: 6, bodyH: 3, legH: 4, headX: 8, headY: 2, headW: 2, headH: 2, neck: true, tail: [[1, 4]] });
    g.px(7, 1, 'stone1'); g.px(7, 0, 'stone1'); g.px(6, 0, 'stone1');
    g.px(9, 4, 'stone2');
    g.outline('outline');
    out.push({ name: `goat_${f}`, p: g, ax: 5, ay: 11 });
    // wolf: grey, long tail, pricked ears
    const w = beast(13, 9, 'stone2', 'stone3', f, { bodyX: 2, bodyY: 3, bodyW: 8, bodyH: 3, legH: 3, headX: 10, headY: 2, headW: 3, headH: 2, tail: [[1, 3], [0, 4], [0, 5]] });
    w.px(10, 1, 'stone1'); w.px(12, 1, 'stone1');
    w.rect(3, 3, 6, 1, 'stone1');
    w.outline('outline');
    out.push({ name: `wolf_${f}`, p: w, ax: 6, ay: 9 });
    // otter: long and low, a sleek brown body and a thick tail
    const ot = new Painter(12, 5);
    ot.rect(2, 1, 7, 3, 'wood2');
    ot.rect(3, 3, 5, 1, 'sand2');
    ot.rect(9, 1, 2, 2, 'wood2');
    ot.px(10, 1, 'outline');
    ot.rect(0, f === 0 ? 2 : 3, 2, 1, 'wood1');
    ot.outline('outline');
    out.push({ name: `otter_${f}`, p: ot, ax: 6, ay: 5 });
    // heron: grey-blue, long legs and neck, a dagger bill
    const hn = new Painter(9, 14);
    hn.rect(2, 5, 4, 3, 'bluewash2');
    hn.rect(1, 6, 1, 2, 'stone1');
    hn.rect(5, 2, 1, 4, 'bluewash');
    hn.rect(5, 1, 2, 2, 'whitewash');
    hn.px(6, 1, 'outline');
    hn.rect(7, 2, 2, 1, 'gold');
    hn.px(4, 1, 'stone1');
    if (f === 0) { hn.rect(3, 8, 1, 6, 'gold'); hn.rect(4, 8, 1, 6, 'gold'); } else { hn.rect(3, 8, 1, 6, 'gold'); hn.rect(5, 8, 1, 5, 'gold'); }
    hn.outline('outline');
    out.push({ name: `heron_${f}`, p: hn, ax: 4, ay: 14 });
    // a fishers' boat (iteration 60): a clinker hull, a fisher with a hat, an oar dipping on the stroke; the bow faces right
    const bt = new Painter(16, 10);
    bt.poly([[0, 5], [15, 5], [13, 8], [2, 8]], 'wood2');
    bt.rect(1, 5, 14, 1, 'wood1');
    bt.rect(2, 7, 11, 1, 'wood3');
    bt.px(15, 4, 'wood2');
    bt.rect(6, 1, 3, 4, 'cloth3');
    bt.rect(6, 0, 3, 1, 'thatch1');
    bt.px(7, 1, 'skin');
    if (f === 0) bt.line(5, 3, 1, 8, 'wood1'); else bt.line(9, 3, 13, 9, 'wood1');
    bt.rect(10, 4, 3, 1, 'stone3'); // the catch
    bt.outline('outline');
    out.push({ name: `boat_${f}`, p: bt, ax: 8, ay: 8 });
  }
  // Concord Warden: a squat stone giant with a rune-lit chest
  for (let f = 0; f < 2; f++) {
    const p = new Painter(16, 22);
    const glow = new Painter(16, 22);
    p.rect(4, 4, 8, 10, 'stone2');
    p.rect(4, 4, 2, 10, 'stone1');
    p.rect(10, 4, 2, 10, 'stone3');
    p.rect(5, 1, 6, 4, 'stone2');
    p.px(6, 2, 'leyGlow');
    p.px(9, 2, 'leyGlow');
    glow.px(6, 2, 'leyGlow');
    glow.px(9, 2, 'leyGlow');
    p.rect(7, 7, 2, 3, 'rune');
    glow.rect(7, 7, 2, 3, 'rune', 200);
    p.rect(1, 5, 3, 8, 'stone1');
    p.rect(12, 5, 3, 8, 'stone3');
    if (f === 0) { p.rect(5, 14, 3, 7, 'stone1'); p.rect(9, 14, 3, 6, 'stone2'); } else { p.rect(5, 14, 3, 6, 'stone1'); p.rect(9, 14, 3, 7, 'stone2'); }
    p.outline('outline');
    out.push({ name: `golem_${f}`, p, glow, ax: 8, ay: 21 });
  }
  // skyray: a pale manta with a long tail, two wing frames
  for (let f = 0; f < 2; f++) {
    const p = new Painter(30, 16);
    const glow = new Painter(30, 16);
    const lift = f === 0 ? 0 : 3;
    p.poly([[15, 8], [1, 4 + lift], [1, 7 + lift], [15, 12]], 'whitewash');
    p.poly([[15, 8], [29, 4 + lift], [29, 7 + lift], [15, 12]], 'whitewash');
    p.rect(12, 6, 6, 6, 'whitewash2');
    p.line(15, 11, 9, 15, 'stone3');
    for (let k = 0; k < 4; k++) { p.px(6 + k * 5, 8 + (k % 2), 'ley2'); glow.px(6 + k * 5, 8 + (k % 2), 'ley1', 120); }
    p.px(14, 7, 'outline');
    p.px(16, 7, 'outline');
    p.outline('outline');
    out.push({ name: `skyray_${f}`, p, glow, ax: 15, ay: 10 });
  }
  // icons
  for (const k of ['nomana', 'nowater', 'fire', 'unhappy', 'gloam', 'abandoned', 'nojobs', 'nogoods', 'noroad']) out.push({ name: `icon_${k}`, p: icon(k), ax: 4, ay: 9 });
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
