/**
 * The Patagoi Atoll (iteration 95, DESIGN §4.126, §17.1): a ring of islands in open water. The valley generator is not
 * touched: `generateTerrain` hands an atoll straight here, so every valley map stays as it was.
 *
 * Six isles on a 128 × 128 sea:
 *  - the great isle at the centre (radius about 14), where the founding node, the first town and, for the Grimmen, the
 *    hills stand;
 *  - three near isles on a ring 32 tiles out, each joined to the great isle by a shallow bar a track can be bridged over
 *    (four times the road price, as in the valley);
 *  - two far isles 46 tiles out, ringed by deep water: only barges, a Portal Arch pair or drake riders cross to them,
 *    and the Gloam lies on their outer halves (it cannot cross water, so the rest of the atoll never sees it).
 * Every isle has a ley node of its own, since mana links by distance and could not cross a channel.
 *
 * Deterministic from the seed, with its own rng and noise: no other generator's stream is touched.
 */
import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { MAP_H, MAP_W, Terrain, idx, inBounds, isWater } from './types';
import type { TerrainOptions, TerrainResult } from './terrain';

export interface Isle { x: number; y: number; r: number; kind: 'great' | 'near' | 'far' }

/** Where the isles lie for a seed: the great isle, three near isles, two far isles. */
export function atollIsles(seed: number): Isle[] {
  const rng = new Rng(seed ^ 0xa7011);
  const cx = MAP_W >> 1, cy = MAP_H >> 1;
  const out: Isle[] = [{ x: cx, y: cy, r: 14, kind: 'great' }];
  const at = (deg: number, ring: number) => ({ x: Math.round(cx + ring * Math.cos((deg * Math.PI) / 180)), y: Math.round(cy - ring * Math.sin((deg * Math.PI) / 180)) });
  for (const base of [0, 120, 240]) out.push({ ...at(base + rng.int(21) - 10, 32), r: 6 + rng.int(3), kind: 'near' });
  for (const base of [60, 180]) out.push({ ...at(base + rng.int(21) - 10, 46), r: 6 + rng.int(2), kind: 'far' });
  return out;
}

const SHOAL = 3;
const BAR_HALF = 1.6;

export function generateAtoll(seed: number, opts: TerrainOptions): TerrainResult {
  const rng = new Rng(seed ^ 0x5ea5ea);
  const nz = new Noise2D(seed + 4242);
  const nz2 = new Noise2D(seed + 1337);
  const terrain = new Uint8Array(MAP_W * MAP_H).fill(Terrain.DeepWater);
  const gloam = new Uint8Array(MAP_W * MAP_H);
  const isles = atollIsles(seed);
  const isleOf = new Int8Array(MAP_W * MAP_H).fill(-1);

  // land, the shoal round it, and deep water beyond
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      for (let k = 0; k < isles.length; k++) {
        const s = isles[k];
        const d = Math.hypot(x - s.x, y - s.y) + nz.noise(x / 6 + k * 31, y / 6 + k * 17) * 2.6;
        if (d < s.r) { isleOf[i] = k; terrain[i] = Terrain.Grass; break; }
        if (d < s.r + SHOAL && terrain[i] === Terrain.DeepWater) terrain[i] = Terrain.Water;
      }
    }
  // the shallow bars: a band of shoal from the great isle to each near isle, which a track can be bridged over
  const great = isles[0];
  for (const s of isles) {
    if (s.kind !== 'near') continue;
    const ax = great.x, ay = great.y, bx = s.x, by = s.y;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    for (let y = Math.min(ay, by) - 3; y <= Math.max(ay, by) + 3; y++)
      for (let x = Math.min(ax, bx) - 3; x <= Math.max(ax, bx) + 3; x++) {
        if (!inBounds(x, y) || terrain[idx(x, y)] !== Terrain.DeepWater) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
        if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) < BAR_HALF) terrain[idx(x, y)] = Terrain.Water;
      }
  }

  // the isles' own ground: forest, meadow and grass, with a few outcrops of hills
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (isleOf[i] < 0) continue;
      const f = nz2.fbm(x / 12 + 50, y / 12 + 50, 3);
      const hn = nz.fbm(x / 9 + 30, y / 9 + 30, 3);
      if (hn > 0.42 && Math.hypot(x - great.x, y - great.y) > 9) terrain[i] = Terrain.Hills;
      else if (f > 0.18) terrain[i] = Terrain.Forest;
      else if (f < -0.22) terrain[i] = Terrain.Meadow;
    }
  const shoreTile = (x: number, y: number): boolean => {
    const t = terrain[idx(x, y)];
    if (isWater(t) || t === Terrain.Hills || t === Terrain.LeyNode || t === Terrain.Ruins) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(x + dx, y + dy) && isWater(terrain[idx(x + dx, y + dy)])) return true;
    return false;
  };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (shoreTile(x, y)) terrain[idx(x, y)] = Terrain.Shore;

  const buildable = (x: number, y: number) => {
    if (!inBounds(x, y)) return false;
    const t = terrain[idx(x, y)];
    return t === Terrain.Grass || t === Terrain.Meadow || t === Terrain.Forest;
  };
  const buildableCount = (cx: number, cy: number, r: number) => {
    let c = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (buildable(cx + dx, cy + dy)) c++;
    return c;
  };
  const clearAround = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (!inBounds(x + dx, y + dy) || dx * dx + dy * dy > r * r) continue;
        const i = idx(x + dx, y + dy);
        if (!isWater(terrain[i]) && terrain[i] !== Terrain.LeyNode && !(dx === 0 && dy === 0)) terrain[i] = Terrain.Grass;
      }
  };

  // the founding node, on the great isle near its centre
  let fx = great.x, fy = great.y;
  for (let tries = 0; tries < 400; tries++) {
    const x = great.x + rng.int(9) - 4, y = great.y + rng.int(9) - 4;
    if (buildable(x, y) && buildableCount(x, y, 6) > 90) { fx = x; fy = y; break; }
  }
  const nodes: TerrainResult['nodes'] = [{ x: fx, y: fy }];
  // one node on every other isle, on a buildable tile near its centre, so every isle has mana of its own
  for (const s of isles.slice(1)) {
    let placed = false;
    for (let r = 0; r <= 3 && !placed; r++)
      for (let dy = -r; dy <= r && !placed; dy++)
        for (let dx = -r; dx <= r && !placed; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = s.x + dx, y = s.y + dy;
          if (!buildable(x, y)) continue;
          nodes.push({ x, y });
          placed = true;
        }
    if (!placed) { terrain[idx(s.x, s.y)] = Terrain.Grass; nodes.push({ x: s.x, y: s.y }); }
  }
  for (const n of nodes) { clearAround(n.x, n.y, 2); terrain[idx(n.x, n.y)] = Terrain.LeyNode; }
  clearAround(fx, fy, 5);

  terrain[idx(fx, fy)] = Terrain.LeyNode;

  // the Ruins of Lukuku: one flagstone cluster in a forest on a near isle, if one has room
  const nearIsles = isles.map((s, k) => ({ s, k })).filter((e) => e.s.kind === 'near');
  for (let tries = 0; tries < 400; tries++) {
    const { s } = nearIsles[rng.int(nearIsles.length)];
    const x = s.x + rng.int(2 * s.r + 1) - s.r, y = s.y + rng.int(2 * s.r + 1) - s.r;
    if (!inBounds(x, y) || terrain[idx(x, y)] !== Terrain.Forest) continue;
    if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 5)) continue;
    let placed = 0;
    const cells: number[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!inBounds(tx, ty) || Math.hypot(dx, dy) > 2.2) continue;
        const t = terrain[idx(tx, ty)];
        if (t === Terrain.Forest || t === Terrain.Grass || t === Terrain.Meadow) { cells.push(idx(tx, ty)); placed++; }
      }
    if (placed >= 6) { for (const c of cells) terrain[c] = Terrain.Ruins; break; }
  }

  // the Gloam: on the outer half of each far isle only, never at its node
  isles.forEach((s, k) => {
    if (s.kind !== 'far') return;
    const node = nodes[k] ?? nodes[nodes.length - 1];
    for (let y = s.y - s.r - 2; y <= s.y + s.r + 2; y++)
      for (let x = s.x - s.r - 2; x <= s.x + s.r + 2; x++) {
        if (!inBounds(x, y) || isleOf[idx(x, y)] !== k || isWater(terrain[idx(x, y)])) continue;
        if (Math.hypot(x - node.x, y - node.y) < 3) continue;
        if (Math.hypot(x - s.x, y - s.y) + nz2.noise(x / 5 + 200, y / 5 + 200) * 1.8 > s.r * 0.66) gloam[idx(x, y)] = 1;
      }
  });
  return { terrain, gloam, nodes, founding: { x: fx, y: fy } };
}
