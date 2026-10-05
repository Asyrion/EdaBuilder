/**
 * Drawn art (iteration 65, DESIGN 4.96): the Lantern of Vell and the temple's three stages, drawn by hand in code where the
 * paintings in inspirations/ have nothing to give. The procedural set's rules hold: light from the right (a left face takes the
 * darker tone), windows dark by day and lit on the glow layer, one outline round the whole. A painting uploaded later replaces any of
 * these through npm run art, since a manifest entry wins over the procedural atlas.
 *
 * Geometry: a 3×3 footprint is a 24×24 unit square whose front corner is the screen point (49, ay + 48). A point (x, y, z) in units
 * (x toward the right corner, y toward the left corner, z up in pixels) projects to (49 + 2x − 2y, ay + 48 − x − y − z). The anchor is
 * the footprint's back corner on the ground, (49, ay), as in every 3×3 painter.
 */
import { Painter, h2 } from './painter';
import type { PalName } from './palette';

type Pt = [number, number];
type Col = PalName;
interface Drawn { p: Painter; glow: Painter; ax: number; ay: number }

/** A projector for a 3×3 footprint whose back ground corner is at (49, ay). */
function projector(ay: number) {
  return (x: number, y: number, z: number): Pt => [49 + 2 * x - 2 * y, ay + 48 - x - y - z];
}

/** A box from (x0, y0, z0) to (x1, y1, z1) in units: the visible left face (x = x0), right face (y = y0) and top. */
function box(p: Painter, P: ReturnType<typeof projector>, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, left: Col, right: Col, top: Col): void {
  p.poly([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], left);
  p.poly([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], right);
  p.poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top);
}

/**
 * A solid of revolution about a vertical axis at screen (cx, base): slices from h = 0 to H, each a filled ellipse of half-width r(h)
 * and half-height r(h)/2, painted bottom up so the highest slice covering a pixel wins. `side` colours a pixel of the wall from its
 * place across the solid (u from −1 at the left edge to 1 at the right) and its height; the top slice is the cap.
 */
function revolve(p: Painter, cx: number, base: number, H: number, r: (h: number) => number, side: (u: number, h: number) => Col | null, cap?: Col): void {
  for (let h = 0; h <= H; h += 0.5) {
    const rr = r(h);
    if (rr <= 0) continue;
    for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) {
      const u = x / rr;
      if (Math.abs(u) > 1) continue;
      const half = (rr / 2) * Math.sqrt(1 - u * u);
      const y0 = Math.round(base - h - half);
      const y1 = Math.round(base - h + half);
      const c = h >= H - 0.25 && cap ? cap : side(u, h);
      if (!c) continue;
      for (let y = y0; y <= y1; y++) p.px(cx + x, y, c);
    }
  }
}

/** Three tones across a lit-from-the-right round surface. */
function roundTone(u: number, dark: Col, mid: Col, light: Col): Col {
  return u < -0.35 ? dark : u < 0.3 ? mid : light;
}

// ---------------------------------------------------------------- the Lantern of Vell

/** The Lantern of Vell: a leystone lighthouse on a stepped plinth, with the keeper's house at its foot. */
export function drawLanternOfVell(): Drawn {
  const ay = 118;
  const p = new Painter(98, ay + 51);
  const glow = new Painter(98, ay + 51);
  const P = projector(ay);
  // the plinth in two steps of dressed stone, with flagstones on top
  p.poly([P(0, 0, 0), P(24, 0, 0), P(24, 24, 0), P(0, 24, 0)], 'shadow', 90);
  box(p, P, 1, 1, 0, 23, 23, 4, 'stone1', 'stone2', 'stone3');
  box(p, P, 5, 5, 4, 19, 19, 7, 'stone1', 'stone2', 'stone3');
  for (let x = 1; x < 23; x += 3) p.line(...P(x, 1, 4), ...P(x, 5, 4), 'stone2');
  for (let y = 1; y < 23; y += 3) p.line(...P(1, y, 4), ...P(5, y, 4), 'stone2');
  // the tower: tapered, coursed, lit from the right
  const [cx, cy] = P(12, 12, 7);
  const TH = 78;
  const rT = (h: number) => 15 - (h / TH) * 5;
  revolve(p, cx, cy, TH, rT, (u, h) => {
    const course = Math.floor(h) % 6 === 0;
    if (course) return u < -0.35 ? 'outline' : 'stone1';
    const t = roundTone(u, 'stone1', 'stone2', 'stone3');
    return t === 'stone2' && h2(Math.floor(u * 9), Math.floor(h / 6), 22) < 0.18 ? 'stone3' : t;
  });
  // a band of leystone runes a third of the way up, and slit windows climbing in a spiral
  for (let x = -12; x <= 12; x++) {
    const rr = rT(30);
    const u = x / rr;
    if (Math.abs(u) > 0.9) continue;
    const y = Math.round(cy - 30 + (rr / 2) * Math.sqrt(1 - u * u));
    p.px(cx + x, y, x % 3 === 0 ? 'ley1' : 'ley3');
    if (x % 3 === 0) glow.px(cx + x, y, 'ley1', 200);
  }
  for (let k = 0; k < 6; k++) {
    const h = 12 + k * 11;
    const a = -1.0 + k * 0.55;
    const rr = rT(h);
    const x = Math.round(rr * Math.sin(a));
    const y = Math.round(cy - h + (rr / 2) * Math.cos(a));
    for (let d = 0; d < 4; d++) for (let e = 0; e < 2; e++) { p.px(cx + x + e, y - d, 'windowDark'); glow.px(cx + x + e, y - d, 'windowLit'); }
  }
  // the gallery: a corbelled ring with an iron rail
  const gy = cy - TH;
  revolve(p, cx, gy + 3, 3, (h) => 10 + h * 1.4, (u) => roundTone(u, 'stone1', 'stone2', 'stone3'), 'stone3');
  // the lantern room: glass between iron mullions, the great crystal burning inside
  const LH = 14;
  revolve(p, cx, gy - 1, LH, () => 9, (u, h) => (Math.round((u + 1) * 4) % 2 === 0 || Math.floor(h) === 0 ? 'ironDark' : 'ley3'));
  for (let y = gy - LH; y <= gy - 2; y++) for (let x = -7; x <= 7; x++) {
    if (p.get(cx + x, y) === 0) continue;
    const i = (y * p.w + cx + x) * 4;
    if (p.data[i] === 0x1a && p.data[i + 1] === 0x5f) glow.px(cx + x, y, 'ley1', 120); // the panes glow
  }
  // the crystal: a tall lozenge of leystone
  const kx = cx;
  const ky = gy - 8;
  p.poly([[kx, ky - 7], [kx + 3, ky], [kx, ky + 5], [kx - 3, ky]], 'leyStone');
  p.poly([[kx, ky - 7], [kx + 3, ky], [kx, ky + 5]], 'ley1');
  p.px(kx, ky - 3, 'leyGlow');
  p.px(kx + 1, ky - 1, 'leyGlow');
  glow.poly([[kx, ky - 8], [kx + 4, ky], [kx, ky + 6], [kx - 4, ky]], 'leyGlow');
  glow.circle(kx, ky, 11, 'ley1', 70);
  // beams leaving the lantern room to either side
  for (let k = 1; k <= 12; k++) { glow.px(kx + 9 + k, ky - 1 - Math.floor(k / 3), 'leyGlow', 160 - k * 10); glow.px(kx - 9 - k, ky - 1 - Math.floor(k / 3), 'leyGlow', 160 - k * 10); }
  // the gallery rail in front of the glass
  for (let x = -12; x <= 12; x++) {
    const rr = 12.5;
    const u = x / rr;
    if (Math.abs(u) > 1) continue;
    const y = Math.round(gy - 1 + (rr / 2) * Math.sqrt(1 - u * u));
    p.px(cx + x, y - 3, 'ironDark');
    if (x % 3 === 0) { p.px(cx + x, y - 2, 'ironDark'); p.px(cx + x, y - 1, 'ironDark'); }
  }
  // the copper cap, its verdigris rim, the finial and a pennant
  const capBase = gy - LH - 1;
  revolve(p, cx, capBase, 11, (h) => 11 - h, (u, h) => (h < 1.5 ? 'verdigris' : roundTone(u, 'copper2', 'copper', 'gold')));
  p.rect(cx, capBase - 16, 1, 5, 'gold');
  p.px(cx, capBase - 17, 'leyGlow');
  glow.px(cx, capBase - 17, 'leyGlow');
  p.rect(cx + 1, capBase - 16, 4, 1, 'banner');
  p.rect(cx + 1, capBase - 15, 3, 1, 'banner');
  p.px(cx + 1, capBase - 14, 'banner');
  // the keeper's house: whitewashed walls, a slate lean-to, a door and a lit window, on the plinth's front-right
  box(p, P, 14, 1.5, 4, 22, 6.5, 13, 'whitewash2', 'whitewash', 'whitewash');
  p.poly([P(13.5, 1, 13), P(22.5, 1, 13), P(22.5, 7, 17), P(13.5, 7, 17)], 'slate1');
  p.poly([P(13.5, 1, 13), P(13.5, 7, 17), P(13.5, 7, 13)], 'whitewash2');
  p.line(...P(13.5, 1, 13), ...P(22.5, 1, 13), 'slate2');
  {
    const [dx, dy] = P(16, 1.5, 4);
    p.rect(dx, dy - 6, 3, 6, 'wood1');
    p.px(dx + 2, dy - 3, 'gold');
    const [wx, wy] = P(20, 1.5, 9);
    p.rect(wx, wy - 2, 2, 3, 'windowDark');
    glow.rect(wx, wy - 2, 2, 3, 'windowLit');
  }
  // two ley lamps at the stair
  for (const [x, y] of [[3, 2], [11, 2]] as Pt[]) {
    const [lx, ly] = P(x, y, 4);
    p.rect(lx, ly - 6, 1, 6, 'ironDark');
    p.px(lx, ly - 7, 'ley1');
    glow.px(lx, ly - 7, 'leyGlow');
    glow.circle(lx, ly - 7, 2, 'ley1', 90);
  }
  p.outline('outline');
  return { p, glow, ax: 49, ay };
}

// ---------------------------------------------------------------- the temple

/** The temple: a whitewashed nave with a portico; at stage 1 a bell tower at the back corner, at stage 2 a ley-glass dome over the
 *  crossing. Drawn back to front: the tower, the nave and its roof, the dome, then the portico before it. */
export function drawTemple(stage: 0 | 1 | 2): Drawn {
  const ay = stage === 0 ? 46 : stage === 1 ? 62 : 70;
  const p = new Painter(98, ay + 51);
  const glow = new Painter(98, ay + 51);
  const P = projector(ay);
  p.poly([P(0, 0, 0), P(24, 0, 0), P(24, 24, 0), P(0, 24, 0)], 'shadow', 90);
  // the plinth, with three steps up to the portico
  box(p, P, 1, 1, 0, 23, 23, 3, 'stone1', 'stone2', 'stone3');
  for (let x = 1; x < 23; x += 3) p.line(...P(x, 1, 3), ...P(x, 23, 3), 'stone2');
  for (let y = 1; y < 23; y += 3) p.line(...P(1, y, 3), ...P(23, y, 3), 'stone2');
  for (let k = 0; k < 3; k++) box(p, P, 5, 0.2 + k * 0.6, 0, 19, 1.4 + k * 0.6, 1 + k, 'stone1', 'stone2', 'stone3');
  // the bell tower at the back corner, behind the nave
  if (stage >= 1) {
    const top = 44;
    const X = 18.5, Y = 17, X2 = 23, Y2 = 22.5;
    box(p, P, X, Y, 3, X2, Y2, top, 'whitewash2', 'whitewash', 'whitewash');
    for (let z = 8; z < top - 8; z += 5) p.line(...P(X2, Y, z), ...P(X2 - 1, Y, z), 'stone2');
    // the open belfry and its bronze bell, on the lit face
    const [bx, by] = P((X + X2) / 2, Y, top - 9);
    p.rect(bx - 3, by - 6, 6, 8, 'outline');
    p.rect(bx - 1, by - 5, 3, 3, 'gold');
    p.px(bx, by - 2, 'copper');
    p.px(bx, by - 1, 'copper2');
    const apex = P((X + X2) / 2, (Y + Y2) / 2, top + 12);
    p.poly([P(X - 0.5, Y - 0.5, top), P(X2 + 0.5, Y - 0.5, top), apex], 'slate1');
    p.poly([P(X - 0.5, Y - 0.5, top), apex, P(X - 0.5, Y2 + 0.5, top)], 'slate2');
    p.rect(apex[0], apex[1] - 4, 1, 4, 'gold');
  }
  // the nave: whitewashed walls between stone buttresses
  const X0 = 5, X1 = 17, Y0 = 7, Y1 = 22, WZ = 19, RZ = 30;
  box(p, P, X0, Y0, 3, X1, Y1, WZ, 'whitewash2', 'whitewash', 'whitewash');
  for (const y of [8, 12, 16, 20]) box(p, P, X0 - 0.75, y, 3, X0, y + 0.75, 13, 'stone1', 'stone2', 'stone3');
  // tall arched windows between the buttresses, dark by day and lit at night
  for (const y of [9.9, 13.9, 17.9]) {
    const [wx, wy] = P(X0, y + 0.4, 6);
    for (let d = 0; d < 7; d++) for (let e = 0; e < 2; e++) { p.px(wx - e, wy - d + e, 'windowDark'); glow.px(wx - e, wy - d + e, 'windowLit'); }
    p.px(wx, wy - 7, 'windowDark');
    p.px(wx - 1, wy - 7, 'stone2');
  }
  // the roof: the far slope lit, the near slope in shade, coursed slates and a lead ridge
  p.poly([P(11, Y0 - 0.5, RZ), P(X1 + 1, Y0 - 0.5, WZ), P(X1 + 1, Y1 + 0.5, WZ), P(11, Y1 + 0.5, RZ)], 'slate1');
  p.poly([P(X0 - 1, Y0 - 0.5, WZ), P(11, Y0 - 0.5, RZ), P(11, Y1 + 0.5, RZ), P(X0 - 1, Y1 + 0.5, WZ)], 'slate2');
  for (let y = Y0; y <= Y1; y += 1.5) p.line(...P(X0 - 1, y, WZ), ...P(11, y, RZ), 'slate1');
  // the front gable and its rose window
  p.poly([P(X0 - 1, Y0 - 0.5, WZ), P(X1 + 1, Y0 - 0.5, WZ), P(11, Y0 - 0.5, RZ)], 'whitewash');
  p.line(...P(X0 - 1, Y0 - 0.5, WZ), ...P(11, Y0 - 0.5, RZ), 'slate2');
  p.line(...P(11, Y0 - 0.5, RZ), ...P(X1 + 1, Y0 - 0.5, WZ), 'slate1');
  {
    const [rx, ry] = P(11, Y0 - 0.5, 24);
    p.circle(rx, ry, 3, 'stone2');
    p.circle(rx, ry, 2, 'windowDark');
    p.px(rx, ry, 'gold');
    glow.circle(rx, ry, 2, 'windowLit');
    glow.px(rx, ry, 'fire1');
  }
  p.line(...P(11, Y0 - 0.5, RZ), ...P(11, Y1 + 0.5, RZ), 'ironDark');
  // the dome over the crossing: a drum with ley-glass windows, a leaded dome, a gilded lantern
  if (stage === 2) {
    const [dx, dy] = P(11, 15, RZ - 3);
    revolve(p, dx, dy, 7, () => 9, (u) => roundTone(u, 'whitewash2', 'whitewash', 'bone'));
    for (const x of [-6, -2, 2, 6]) {
      const half = 4.5 * Math.sqrt(1 - (x / 9) ** 2);
      const by = Math.round(dy + half) - 1;
      for (let d = 1; d <= 4; d++) { p.px(dx + x, by - d, 'ley3'); glow.px(dx + x, by - d, 'ley1', 220); }
      p.px(dx + x, by - 5, 'ley2');
    }
    revolve(p, dx, dy - 7, 9, (h) => 9.5 * Math.sqrt(Math.max(0, 1 - (h / 9) ** 2)), (u, h) => (Math.round(u * 6) % 3 === 0 && h < 7 ? 'copperRoof2' : roundTone(u, 'copperRoof2', 'copperRoof', 'verdigris')));
    p.rect(dx - 1, dy - 19, 3, 3, 'gold');
    p.rect(dx, dy - 23, 1, 4, 'gold');
    glow.px(dx, dy - 18, 'windowLit');
  }
  // the door in the nave's front wall, behind the portico
  {
    const [dx, dy] = P(11, Y0, 3);
    p.rect(dx - 1, dy - 7, 4, 7, 'wood1');
    p.rect(dx - 1, dy - 7, 4, 1, 'outline');
    glow.rect(dx, dy - 5, 2, 4, 'lampWarm', 120);
  }
  // the portico: four columns under an entablature and a pediment with a gilded sun
  const PZ = 13;
  for (const x of [6, 9.5, 13, 16.5]) {
    const [cx, cy] = P(x, 2, 3);
    const [, ty] = P(x, 2, PZ);
    for (let y = ty; y <= cy; y++) { p.px(cx - 1, y, 'whitewash2'); p.px(cx, y, 'whitewash'); p.px(cx + 1, y, 'bone'); }
    p.rect(cx - 1, cy - 1, 3, 1, 'stone2');
  }
  box(p, P, 4.5, 1.5, PZ, 18, 7, PZ + 2.5, 'stone2', 'whitewash', 'stone3');
  p.poly([P(11.25, 1.5, PZ + 9), P(18, 1.5, PZ + 2.5), P(18, 7, PZ + 2.5), P(11.25, 7, PZ + 9)], 'slate1');
  p.poly([P(4.5, 1.5, PZ + 2.5), P(11.25, 1.5, PZ + 9), P(11.25, 7, PZ + 9), P(4.5, 7, PZ + 2.5)], 'slate2');
  p.poly([P(4.5, 1.5, PZ + 2.5), P(18, 1.5, PZ + 2.5), P(11.25, 1.5, PZ + 9)], 'whitewash');
  p.line(...P(4.5, 1.5, PZ + 2.5), ...P(11.25, 1.5, PZ + 9), 'slate1');
  p.line(...P(11.25, 1.5, PZ + 9), ...P(18, 1.5, PZ + 2.5), 'slate1');
  p.line(...P(4.5, 1.5, PZ + 2.5), ...P(18, 1.5, PZ + 2.5), 'stone2');
  {
    const [sx, sy] = P(11.25, 1.5, PZ + 5);
    p.circle(sx, sy, 1, 'gold');
    for (const [ddx, ddy] of [[-2, 0], [2, 0], [0, -2]] as Pt[]) p.px(sx + ddx, sy + ddy, 'gold');
  }
  // banners on the outer columns from the bell tower's stage
  if (stage >= 1) for (const x of [6, 16.5]) { const [bx, by] = P(x, 2, PZ - 1); p.rect(bx + 2, by, 2, 6, 'banner'); p.px(bx + 2, by + 6, 'banner'); p.px(bx + 3, by, 'gold'); }
  // two ley lamps at the foot of the steps
  for (const x of [3, 21]) {
    const [lx, ly] = P(x, 0.5, 0);
    p.rect(lx, ly - 7, 1, 7, 'ironDark');
    p.px(lx, ly - 8, 'ley1');
    glow.px(lx, ly - 8, 'leyGlow');
    glow.circle(lx, ly - 8, 2, 'ley1', 90);
  }
  p.outline('outline');
  return { p, glow, ax: 49, ay };
}

// ---------------------------------------------------------------- the Great Gate (iteration 69)

/** The Great Gate: the gatehouse of the Pass of Buluiain in pale Belregi Stone. Two towers with slate caps flank a deep arch on the
 *  right face (the face a building turns to its road), a parapet runs over the arch, blue rune bands ring the towers, and the Heart
 *  of Belregi burns in the keystone. Drawn back to front: the far tower, the arch block, the near tower. */
export function drawGreatGate(): Drawn {
  const ay = 62;
  const p = new Painter(98, ay + 51);
  const glow = new Painter(98, ay + 51);
  const P = projector(ay);
  // Belregi Stone: a pale grey with blue in it; the left faces take the darker tone
  const sL = '#8d96a8' as Col;
  const sR = '#b6bfcf' as Col;
  const sT = '#d8dee8' as Col;
  const course = '#6f788a' as Col;
  p.poly([P(0, 0, 0), P(24, 0, 0), P(24, 24, 0), P(0, 24, 0)], 'shadow', 90);
  box(p, P, 0.5, 0.5, 0, 23.5, 23.5, 3, sL, sR, sT);
  for (let x = 1; x < 23; x += 3) p.line(...P(x, 0.5, 3), ...P(x, 3, 3), course);
  /** A rune band round a block at height z: a line along both visible faces, every third pixel a lit rune. */
  const runeBand = (x0: number, y0: number, x1: number, y1: number, z: number) => {
    const pts: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 1 / ((y1 - y0) * 2)) pts.push(P(x0, y1 - t * (y1 - y0), z));
    for (let t = 0; t <= 1.0001; t += 1 / ((x1 - x0) * 2)) pts.push(P(x0 + t * (x1 - x0), y0, z));
    let k = 0;
    for (const [x, y] of pts) {
      const rune = k++ % 3 === 0;
      p.px(Math.round(x), Math.round(y), rune ? 'ley1' : 'ley3');
      if (rune) glow.px(Math.round(x), Math.round(y), 'ley1', 210);
    }
  };
  /** Coursed stone on a block's two visible faces: a darker line every twelve pixels of height. */
  const courses = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => {
    for (let z = z0 + 12; z < z1 - 3; z += 12) { p.line(...P(x0, y0, z), ...P(x0, y1, z), course); p.line(...P(x0, y0, z), ...P(x1, y0, z), course); }
  };
  /** A slit window on a tower's right face (y = y0) or left face (x = x0), dark by day and lit on the glow layer. */
  const slit = (x: number, y: number, z: number) => {
    const [wx, wy] = P(x, y, z);
    p.rect(Math.round(wx), Math.round(wy) - 4, 1, 4, 'windowDark');
    glow.rect(Math.round(wx), Math.round(wy) - 4, 1, 4, 'windowLit');
  };
  /** A tower: a block with courses, two rune bands, slits on both faces, crenels and a slate pyramid with a gold finial. */
  const tower = (x0: number, y0: number, x1: number, y1: number, H: number) => {
    box(p, P, x0, y0, 3, x1, y1, H, sL, sR, sT);
    courses(x0, y0, x1, y1, 3, H);
    runeBand(x0, y0, x1, y1, 16);
    runeBand(x0, y0, x1, y1, H - 6);
    for (const z of [22, 32]) if (z < H - 8) { slit((x0 + x1) / 2, y0, z); slit(x0, (y0 + y1) / 2, z); }
    // crenels along the two visible top edges
    for (let t = y0; t < y1 - 0.5; t += 2) box(p, P, x0, t, H, x0 + 1, t + 1, H + 2, sL, sR, sT);
    for (let t = x0 + 1; t < x1 - 0.5; t += 2) box(p, P, t, y0, H, t + 1, y0 + 1, H + 2, sL, sR, sT);
    // the cap: a slate pyramid, its left face darker
    const zr = H + 2;
    const apex = P((x0 + x1) / 2, (y0 + y1) / 2, zr + 16);
    p.poly([P(x0 - 0.5, y0 - 0.5, zr), P(x0 - 0.5, y1 + 0.5, zr), apex], 'slate2');
    p.poly([P(x0 - 0.5, y0 - 0.5, zr), P(x1 + 0.5, y0 - 0.5, zr), apex], 'slate1');
    p.line(...P(x0 - 0.5, y0 - 0.5, zr), ...apex, '#6a7c98' as Col);
    p.rect(apex[0], apex[1] - 4, 1, 4, 'gold');
    p.px(apex[0], apex[1] - 5, 'leyGlow');
    glow.px(apex[0], apex[1] - 5, 'leyGlow');
  };
  // four square towers at the corners of a long passage block, curtain walls between them; back to front: the right column
  // (x ≥ 16.5) from the back, the passage block, then the left column from the back
  const curtain = (x0: number, y0: number, x1: number, y1: number, H: number) => {
    box(p, P, x0, y0, 3, x1, y1, H, sL, sR, sT);
    courses(x0, y0, x1, y1, 3, H);
    for (let t = y0; t < y1 - 0.5; t += 2) box(p, P, x0, t, H, x0 + 1, t + 1, H + 2, sL, sR, sT);
    for (let t = x0 + 1; t < x1 - 0.5; t += 2) box(p, P, t, y0, H, t + 1, y0 + 1, H + 2, sL, sR, sT);
  };
  tower(16.5, 15, 23, 21.5, 36);
  curtain(17.5, 9, 22, 15, 24);
  tower(16.5, 2, 23, 9, 46);
  // the passage block between the towers, a little set back, with a parapet
  const bx0 = 7;
  const bx1 = 16.5;
  const by0 = 4;
  const BH = 30;
  curtain(bx0, by0, bx1, 21, BH);
  // the arch: a deep dark opening on the right face, round-headed, with lit voussoirs and a glimpse of road through it
  const ax0 = 8.5;
  const ax1 = 15;
  const spring = 14;
  const rise = (ax1 - ax0) / 2;
  const archTop = (x: number) => spring + Math.sqrt(Math.max(0, rise * rise - (x - (ax0 + ax1) / 2) ** 2)) * 2;
  const open: Pt[] = [P(ax0, by0, 3)];
  for (let x = ax0; x <= ax1 + 0.001; x += 0.25) open.push(P(x, by0, archTop(x)));
  open.push(P(ax1, by0, 3));
  p.poly(open, '#1d1a28');
  p.poly([P(ax0 + 0.5, by0, 3), P(ax1 - 0.5, by0, 3), P(ax1 - 0.5, by0, 6), P(ax0 + 0.5, by0, 6)], '#2c3346'); // the road beyond, under the far arch
  for (let k = 0; k <= 12; k++) {
    const x = ax0 - 0.6 + ((ax1 - ax0 + 1.2) * k) / 12;
    const [vx, vy] = P(x, by0, archTop(Math.min(ax1, Math.max(ax0, x))) + 1.2);
    p.px(Math.round(vx), Math.round(vy), k % 2 ? sT : 'ley3');
    if (k % 2 === 0) glow.px(Math.round(vx), Math.round(vy), 'ley1', 180);
  }
  // the keystone and the Heart of Belregi in it
  const [kx, ky] = P((ax0 + ax1) / 2, by0, spring + rise * 2 + 5);
  const hx = Math.round(kx);
  const hy = Math.round(ky);
  p.rect(hx - 3, hy - 4, 7, 8, sT);
  p.rect(hx - 3, hy - 4, 1, 8, sL);
  p.poly([[hx, hy - 3], [hx + 2, hy], [hx, hy + 3], [hx - 2, hy]], 'leyStone');
  p.poly([[hx, hy - 3], [hx + 2, hy], [hx, hy + 3]], 'ley1');
  p.px(hx, hy - 1, 'leyGlow');
  glow.poly([[hx, hy - 4], [hx + 3, hy], [hx, hy + 4], [hx - 3, hy]], 'leyGlow');
  glow.circle(hx, hy, 8, 'ley1', 80);
  runeBand(bx0, by0, bx1, 21, 25);
  // two ley lamps on the plinth either side of the arch
  for (const x of [ax0 - 1.2, ax1 + 1.2]) {
    const [lx, ly] = P(x, 1.8, 3);
    p.rect(Math.round(lx), Math.round(ly) - 7, 1, 7, 'ironDark');
    p.px(Math.round(lx), Math.round(ly) - 8, 'ley1');
    glow.px(Math.round(lx), Math.round(ly) - 8, 'leyGlow');
    glow.circle(Math.round(lx), Math.round(ly) - 8, 2, 'ley1', 90);
  }
  // the left column from the back: a tower, a curtain, the near tower with a Guardians' banner
  tower(1, 15, 7.5, 21.5, 34);
  curtain(1.5, 9, 6, 15, 22);
  tower(1, 2, 7.5, 9, 42);
  {
    const [bxp, byp] = P(4.2, 2, 34);
    p.rect(Math.round(bxp), Math.round(byp), 3, 9, 'ley3');
    p.rect(Math.round(bxp) + 1, Math.round(byp) + 2, 1, 4, 'ley1');
    p.px(Math.round(bxp) + 1, Math.round(byp) + 9, 'ley3');
  }
  p.outline('outline');
  return { p, glow, ax: 49, ay };
}

// ---------------------------------------------------------------- the brickworks (after the user's painting)

/** A brickworks on a 3×3 footprint, after the user's painting: the brick hall under orange tiles with its kiln burning in the
 *  arch, the brick-and-timber house beside it with a stone chimney, the clay shed at the back-left, and the yard in front
 *  (stacked bricks, a rack, the bench and tools, pots, a woodpile, the clay cart, the fenced garden and the stone path). Drawn
 *  but given to no building yet: the sprite `b_brickworks`. Its front, the side a building turns to its road, is the right
 *  face (y = 0), as in every procedural building. */
export function drawBrickworks(): Drawn {
  const ay = 32;
  const p = new Painter(98, ay + 51);
  const glow = new Painter(98, ay + 51);
  const P = projector(ay);
  // the painting's colours: brick in three tones and its mortar, the roof tiles, timber, the yard's earth and the grass
  const bL = '#8e3f2a' as Col, bR = '#b4573a' as Col, bT = '#c9694a' as Col, mortar = '#73321f' as Col;
  const tL = '#c0602f' as Col, tR = '#d9783f' as Col, tRidge = '#5a3a22' as Col;
  const timber = '#5a3a22' as Col, earth = '#a07e4c' as Col, earthD = '#86663a' as Col, grassC = '#5f8f3e' as Col;
  const clay = '#a8603a' as Col, clayD = '#7e4428' as Col;
  // the ground: a grass rim round trodden earth
  p.poly([P(0, 0, 0), P(24, 0, 0), P(24, 24, 0), P(0, 24, 0)], grassC);
  p.poly([P(1.2, 1.2, 0), P(23, 1.2, 0), P(23, 23, 0), P(1.2, 23, 0)], earth);
  for (let k = 0; k < 40; k++) { const [x, y] = P(2 + h2(k, 3, 7) * 20, 2 + h2(k, 5, 7) * 20, 0); p.px(Math.round(x), Math.round(y), earthD); }
  /** A brick wall face between two corners, coursed: mortar lines every 3 px and staggered joints. */
  const brickFace = (a: Pt, b: Pt, z0: number, z1: number, left: boolean) => {
    const q = (u: number, z: number) => P(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z);
    p.poly([q(0, z0), q(1, z0), q(1, z1), q(0, z1)], left ? bL : bR);
    for (let z = z0 + 3; z < z1; z += 3) p.line(...q(0, z), ...q(1, z), mortar);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let z = z0; z < z1; z += 3) for (let u = ((z / 3) % 2) * 1.5; u < len; u += 3) { const [x, y] = q(u / len, z); p.px(Math.round(x), Math.round(y) - 1, mortar); }
  };
  /** A gable roof whose ridge runs along y at x = rx, height zr, over x0..x1 (eaves at ze), y0..y1. The far slope faces away
   *  from the viewer and goes down first (`back`), before the walls and the gable end; the near slope and the timbers after. */
  const roofBack = (x1: number, y0: number, y1: number, ze: number, zr: number, rx: number) => {
    p.poly([P(x1, y0, ze), P(rx, y0, zr), P(rx, y1, zr), P(x1, y1, ze)], tR);
  };
  const roofFront = (x0: number, x1: number, y0: number, y1: number, ze: number, zr: number, rx: number) => {
    p.poly([P(x0, y0, ze), P(rx, y0, zr), P(rx, y1, zr), P(x0, y1, ze)], tL); // the near slope
    for (let k = 1; k < 5; k++) { const z = ze + ((zr - ze) * k) / 5; const xa = x0 + ((rx - x0) * k) / 5; p.line(...P(xa, y0, z), ...P(xa, y1, z), '#9a4426' as Col); } // tile rows
    p.line(...P(rx, y0, zr), ...P(rx, y1, zr), tRidge);
    // the barge boards: dark timber along both rakes of the gable end, two pixels thick as in the painting
    for (const d of [0, 1]) { const [ax2, ay2] = P(x0, y0, ze); const [rx2, ry2] = P(rx, y0, zr); const [bx2, by2] = P(x1, y0, ze); p.line(ax2, ay2 + d, rx2, ry2 + d, tRidge); p.line(rx2, ry2 + d, bx2, by2 + d, tRidge); }
  };
  // -- the house, at the back-right: brick below, timber framing, two windows, a plank door on stone steps, a stone chimney
  {
    const x0 = 15.5, x1 = 23, y0 = 12, y1 = 17, H = 11;
    roofBack(x1 + 0.6, y0 - 0.8, y1 + 0.5, H, H + 7, 19.25);
    brickFace([x0, y0], [x0, y1], 0, H, true);
    brickFace([x0, y0], [x1, y0], 0, H, false);
    for (const x of [x0, x0 + 4, x1]) p.line(...P(x, y0, 0), ...P(x, y0, H), timber); // posts
    p.line(...P(x0, y0, H), ...P(x1, y0, H), timber); // the wall plate
    p.line(...P(x0, y0, 7), ...P(x1, y0, 7), timber); // the rail
    p.poly([P(x0, y0, H), P(x1, y0, H), P(19.25, y0, H + 7)], bR); // the gable
    for (const [wx, wz] of [[16.8, 7.5], [21.2, 7.5]] as Pt[]) { const [sx, sy] = P(wx, y0, wz); p.rect(Math.round(sx), Math.round(sy) - 3, 3, 3, 'windowDark'); p.rect(Math.round(sx), Math.round(sy) - 4, 3, 1, timber); glow.rect(Math.round(sx), Math.round(sy) - 3, 3, 3, 'windowLit'); }
    { const [sx, sy] = P(19, y0, 4); p.rect(Math.round(sx), Math.round(sy) - 6, 3, 7, timber); p.px(Math.round(sx) + 2, Math.round(sy) - 3, 'gold'); }
    { const [sx, sy] = P(19.6, y0, H + 2.5); p.rect(Math.round(sx), Math.round(sy) - 2, 2, 2, 'windowDark'); glow.rect(Math.round(sx), Math.round(sy) - 2, 2, 2, 'windowLit'); } // the gable's window
    box(p, P, 18.2, 10.4, 0, 20.6, 12, 1.4, 'stone1', 'stone2', 'stone3'); // the steps
    roofFront(x0 - 0.6, x1 + 0.6, y0 - 0.8, y1 + 0.5, H, H + 7, 19.25);
    box(p, P, 21, 14.6, H + 2, 22.4, 16, H + 10, 'stone1', 'stone2', 'stone3'); // the stone chimney
    p.line(...P(21, 14.6, H + 7), ...P(22.4, 14.6, H + 7), 'stone1');
    box(p, P, 20.8, 14.4, H + 10, 22.6, 16.2, H + 11, 'stone1', 'stone2', 'stone3');
  }
  // -- the hall, centre: the tall brick gable, the arch open on the kiln, the brick chimney smoking on its left slope
  {
    const x0 = 6, x1 = 15.5, y0 = 10, y1 = 16.5, H = 15;
    roofBack(x1 + 0.6, y0 - 0.8, y1 + 0.5, H, H + 9, 10.75);
    brickFace([x0, y0], [x0, y1], 0, H, true);
    brickFace([x0, y0], [x1, y0], 0, H, false);
    p.poly([P(x0, y0, H), P(x1, y0, H), P(10.75, y0, H + 9)], bR); // the gable end
    for (const d of [0, 1]) { const [a1, a2] = P(x0, y0, H); const [b1, b2] = P(x1, y0, H); p.line(a1, a2 + d, b1, b2 + d, timber); } // the tie beam across the gable
    for (const x of [x0, x1]) for (const d of [0, 1]) { const [a1, a2] = P(x, y0, 0); const [b1, b2] = P(x, y0, H); p.line(a1 - d, a2, b1 - d, b2, timber); } // the corner posts
    for (let z = H + 3; z < H + 9; z += 3) { const w = (1 - (z - H) / 9) * 4.75; p.line(...P(10.75 - w, y0, z), ...P(10.75 + w, y0, z), mortar); }
    { const [sx, sy] = P(10.75, y0, H + 5); p.rect(Math.round(sx) - 1, Math.round(sy) - 3, 3, 4, 'windowDark'); } // the vent under the ridge
    // cracks in the old brick, as in the painting
    p.line(...P(8.5, y0, 16), ...P(9.1, y0, 18), 'outline'); p.line(...P(13, y0, 17), ...P(13.5, y0, 15.5), 'outline');
    // the arch: a round-headed opening, the kiln's stone hood and its fire inside
    const ax0 = 7.6, ax1 = 13.6, spring = 6.5, rise = (ax1 - ax0) / 2;
    const top = (x: number) => spring + Math.sqrt(Math.max(0, rise * rise - (x - (ax0 + ax1) / 2) ** 2)) * 1.6;
    const open: Pt[] = [P(ax0, y0, 0)];
    for (let x = ax0; x <= ax1 + 0.001; x += 0.25) open.push(P(x, y0, top(x)));
    open.push(P(ax1, y0, 0));
    p.poly(open, '#2a1c18' as Col);
    for (let k = 0; k <= 16; k++) { const x = ax0 - 0.5 + ((ax1 - ax0 + 1) * k) / 16; const [vx, vy] = P(x, y0, top(Math.min(ax1, Math.max(ax0, x))) + 1); p.rect(Math.round(vx), Math.round(vy) - 1, 1, 2, k % 3 ? bT : mortar); } // the brick ring of the arch
    { const [sx, sy] = P(13.9, y0, 0); p.rect(Math.round(sx) - 4, Math.round(sy) - 6, 5, 5, 'stone2'); p.rect(Math.round(sx) - 3, Math.round(sy) - 4, 3, 3, 'ember'); glow.rect(Math.round(sx) - 3, Math.round(sy) - 4, 3, 3, 'fire1'); } // the small oven beside the kiln
    // the kiln inside: a grey stone dome with its mouth burning
    const [kx, ky] = P(10.4, y0 + 0.6, 0);
    p.poly([[kx - 4, ky], [kx - 4, ky - 5], [kx - 2, ky - 8], [kx + 2, ky - 8], [kx + 4, ky - 5], [kx + 4, ky]], 'stone2');
    p.poly([[kx - 4, ky], [kx - 4, ky - 5], [kx - 2, ky - 8], [kx, ky - 8], [kx, ky]], 'stone1');
    p.poly([[kx - 2, ky], [kx - 2, ky - 3], [kx, ky - 5], [kx + 2, ky - 3], [kx + 2, ky]], 'ember');
    p.poly([[kx - 1, ky], [kx - 1, ky - 2], [kx, ky - 3], [kx + 1, ky - 2], [kx + 1, ky]], 'fire1');
    glow.poly([[kx - 3, ky + 1], [kx - 3, ky - 4], [kx, ky - 6], [kx + 3, ky - 4], [kx + 3, ky + 1]], 'fire1');
    glow.circle(kx, ky - 3, 9, 'ember', 90);
    // stacked bricks inside the arch, to the right of the kiln
    const [bx, by] = P(12.4, y0 + 0.4, 0);
    for (let r = 0; r < 3; r++) p.rect(Math.round(bx), Math.round(by) - 2 - r * 2, 4, 2, r % 2 ? bT : bR);
    roofFront(x0 - 0.6, x1 + 0.6, y0 - 0.8, y1 + 0.5, H, H + 9, 10.75);
    // the brick chimney on the left slope, smoking
    box(p, P, 7.8, 13.5, H + 3, 9.3, 15, H + 11, bL, bR, bT);
    for (let z = H + 6; z < H + 11; z += 3) p.line(...P(7.8, 13.5, z), ...P(9.3, 13.5, z), mortar);
    const [cx, cy] = P(8.5, 14.2, H + 11);
    for (const [dx, dy, c] of [[0, -2, 'smoke'], [1, -4, 'smoke'], [-1, -6, 'stone3'], [1, -8, 'smoke'], [0, -10, 'stone3']] as [number, number, PalName][]) p.rect(Math.round(cx) + dx, Math.round(cy) + dy, 2, 2, c);
  }
  // -- the clay shed at the back-left: a lean-to on timber posts, open to the yard, its roof falling to the left
  {
    const x0 = 1.2, x1 = 6, y0 = 13, y1 = 18.5;
    p.poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, 11), P(x0, y1, 7)], '#4a3020' as Col); // the back wall, in shadow
    // clay heaps under the roof
    for (const [hx, hy] of [[2.8, 16.5], [4.6, 16.5], [3.6, 14.4]] as Pt[]) { const [sx, sy] = P(hx, hy, 0); p.poly([[sx - 5, sy], [sx - 3, sy - 3], [sx, sy - 4], [sx + 3, sy - 3], [sx + 5, sy]], clay); p.poly([[sx - 5, sy], [sx - 3, sy - 3], [sx, sy - 4], [sx, sy]], clayD); }
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1]] as Pt[]) p.line(...P(x, y, 0), ...P(x, y, x === x0 ? 7 : 11), timber); // posts
    p.poly([P(x0 - 0.8, y0 - 0.8, 6.4), P(x1, y0 - 0.8, 11.4), P(x1, y1 + 0.5, 11.4), P(x0 - 0.8, y1 + 0.5, 6.4)], tR); // the lean-to roof
    for (let k = 1; k < 5; k++) { const x = x0 + ((x1 - x0) * k) / 5; const z = 6.4 + (5 * k) / 5; p.line(...P(x, y0 - 0.8, z), ...P(x, y1 + 0.5, z), '#b4552e' as Col); }
    p.line(...P(x0 - 0.8, y0 - 0.8, 6.4), ...P(x1, y0 - 0.8, 11.4), tRidge);
  }
  // -- the yard, back to front
  /** A stack of bricks: a box of brick with a few lighter brick ends. */
  const stack = (x0: number, y0: number, x1: number, y1: number, z: number) => {
    box(p, P, x0, y0, 0, x1, y1, z, bL, bR, bT);
    for (let zz = 1.5; zz < z; zz += 1.5) { p.line(...P(x0, y0, zz), ...P(x1, y0, zz), mortar); p.line(...P(x0, y0, zz), ...P(x0, y1, zz), mortar); }
  };
  // the woodpile and the pots by the house steps
  box(p, P, 15.5, 9.5, 0, 17.5, 11, 2.5, 'wood1', 'wood2', 'wood3');
  for (let k = 0; k < 3; k++) { const [sx, sy] = P(15.8 + k * 0.6, 9.5, 1.2); p.px(Math.round(sx), Math.round(sy), 'wood3'); }
  for (const [px0, py0] of [[14.4, 8.6], [13.4, 9.6]] as Pt[]) { const [sx, sy] = P(px0, py0, 0); p.rect(Math.round(sx) - 1, Math.round(sy) - 4, 3, 4, clay); p.px(Math.round(sx) - 1, Math.round(sy) - 4, clayD); p.rect(Math.round(sx) - 1, Math.round(sy) - 5, 3, 1, clayD); }
  // the brick rack at the left: two shelves of bricks drying
  box(p, P, 1.5, 6, 0, 3, 10.5, 6.5, 'wood1', 'wood2', 'wood3');
  for (const z of [2, 4.5]) for (let y = 6.5; y < 10.5; y += 1.2) { const [sx, sy] = P(1.5, y, z); p.rect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 1, bT); }
  // stacked bricks, as in the painting's yard
  stack(3.6, 9, 5.6, 11, 4.5);
  stack(3, 2.5, 5.5, 4.5, 3);
  // the workbench with its tools
  box(p, P, 8.5, 4.5, 2.5, 12, 6, 3.4, 'wood1', 'wood3', 'wood3');
  for (const [lx, ly] of [[8.7, 4.7], [11.8, 4.7]] as Pt[]) p.line(...P(lx, ly, 0), ...P(lx, ly, 2.5), 'wood1');
  { const [sx, sy] = P(9.5, 5.2, 3.4); p.rect(Math.round(sx), Math.round(sy) - 1, 3, 1, 'ironDark'); const [tx, ty] = P(11, 5.2, 3.4); p.rect(Math.round(tx), Math.round(ty) - 2, 1, 2, 'stone3'); }
  // spades leaning on the hall
  for (const x of [14.2, 14.8]) { p.line(...P(x, 8.4, 0.6), ...P(x + 0.3, 8.6, 6), 'wood2'); const [sx, sy] = P(x, 8.4, 0.6); p.rect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2, 'stone2'); }
  // the stone path from the steps to the front
  for (let k = 0; k < 4; k++) { const [sx, sy] = P(19 - k * 0.4, 8.5 - k * 2, 0); p.rect(Math.round(sx) - 2, Math.round(sy) - 1, 4, 2, k % 2 ? 'stone2' : 'stone3'); }
  // the garden at the front-right, fenced: rows of greens
  const fence: Pt[] = [[16.5, 1.5], [23, 1.5], [23, 7.5], [16.5, 7.5]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const [sx, sy] = P(17.5 + c * 1.5, 2.6 + r * 1.7, 0); p.rect(Math.round(sx), Math.round(sy) - 1, 2, 2, (r + c) % 2 ? 'leaf3' : 'leaf2'); p.px(Math.round(sx), Math.round(sy) - 2, 'leaf3'); }
  for (let e = 0; e < 4; e++) {
    const [ax2, ay2] = fence[e]; const [bx2, by2] = fence[(e + 1) % 4];
    if (e === 2) continue; // the back rail stands behind the beds and is lost under them
    p.line(...P(ax2, ay2, 1.6), ...P(bx2, by2, 1.6), 'wood2');
    for (let k = 0; k <= 4; k++) { const x = ax2 + ((bx2 - ax2) * k) / 4, y = ay2 + ((by2 - ay2) * k) / 4; p.line(...P(x, y, 0), ...P(x, y, 2.4), 'wood1'); }
  }
  // the clay cart at the front: a plank box on one wheel, heaped with clay
  box(p, P, 10.5, 1, 1.2, 13.5, 3, 3.2, 'wood1', 'wood2', 'wood3');
  { const [sx, sy] = P(12, 2, 3.2); p.poly([[sx - 4, sy + 1], [sx - 1, sy - 2], [sx + 2, sy - 2], [sx + 4, sy + 1]], clay); }
  { const [sx, sy] = P(12.5, 1, 1.2); p.circle(Math.round(sx), Math.round(sy), 2, 'wood1'); p.px(Math.round(sx), Math.round(sy), 'ironDark'); }
  p.line(...P(10.5, 2, 2), ...P(8.8, 2.4, 0.6), 'wood1'); // its handles
  // the fence along the left edge of the yard
  for (let k = 0; k <= 5; k++) { const y = 1.5 + k * 1.6; p.line(...P(1, y, 0), ...P(1, y, 2.6), 'wood1'); }
  p.line(...P(1, 1.5, 1.8), ...P(1, 9.5, 1.8), 'wood2');
  p.outline('outline');
  return { p, glow, ax: 49, ay };
}
