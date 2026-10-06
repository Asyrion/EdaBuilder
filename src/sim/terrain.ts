import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { MAP_H, MAP_W, Terrain, idx, inBounds, isWater } from './types';

export interface TerrainResult {
  terrain: Uint8Array;
  gloam: Uint8Array;
  nodes: { x: number; y: number; aspect?: 'vein' }[];
  founding: { x: number; y: number };
}

/** Procedural map: rolling grass, forests, hills, a river, a lake, ley nodes, gloam on the rim. */
export interface TerrainOptions { nodes?: number; island?: boolean; underhill?: boolean; riverside?: boolean; twinnode?: boolean }

/** The shore rule: a land tile (not hills, not a node, not ruins) with water among its eight neighbours. */
function shoreTile(terrain: Uint8Array, x: number, y: number): boolean {
  const t = terrain[idx(x, y)];
  if (isWater(t) || t === Terrain.Hills || t === Terrain.LeyNode || t === Terrain.Ruins) return false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (inBounds(x + dx, y + dy) && isWater(terrain[idx(x + dx, y + dy)])) return true;
  return false;
}

/** Marsh (iteration 85, DESIGN §17.1): low land within MARSH_REACH of water, in patches where a noise passes a bound, never
 *  within MARSH_FOUNDING of the founding or MARSH_NODE of a node. Hills, nodes and ruins stay. Its own noise, no rng: the
 *  generator's stream is unchanged. */
export const MARSH_REACH = 3;
export const MARSH_FOUNDING = 9;
const MARSH_NODE = 4;
export const MARSH_LOW = 0.02;
export const MARSH_NOISE = 0.12;
function markMarsh(terrain: Uint8Array, height: Float32Array, nz: Noise2D, fx: number, fy: number, nodes: { x: number; y: number }[]): void {
  const dist = new Uint8Array(MAP_W * MAP_H).fill(255);
  let frontier: number[] = [];
  for (let i = 0; i < terrain.length; i++) if (isWater(terrain[i])) { dist[i] = 0; frontier.push(i); }
  for (let d = 1; d <= MARSH_REACH; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % MAP_W; const y = (i / MAP_W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!inBounds(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (dist[j] > d) { dist[j] = d; next.push(j); }
      }
    }
    frontier = next;
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const i = idx(x, y);
    const t = terrain[i];
    if (dist[i] < 1 || dist[i] > MARSH_REACH) continue;
    if (t !== Terrain.Shore && t !== Terrain.Grass && t !== Terrain.Meadow && t !== Terrain.Forest) continue;
    if (Math.hypot(x - fx, y - fy) <= MARSH_FOUNDING) continue;
    if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) <= MARSH_NODE)) continue;
    const low = height[i] - (MARSH_REACH - dist[i]) * 0.06; // the nearer the water, the wetter
    if (low > MARSH_LOW) continue;
    if (nz.fbm(x / 9, y / 9, 3) < MARSH_NOISE) continue;
    terrain[i] = Terrain.Marsh;
  }
}

export function generateTerrain(seed: number, opts: TerrainOptions = {}): TerrainResult {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const nz = new Noise2D(seed);
  const nz2 = new Noise2D(seed + 1337);
  const terrain = new Uint8Array(MAP_W * MAP_H);
  const gloam = new Uint8Array(MAP_W * MAP_H);
  const height = new Float32Array(MAP_W * MAP_H);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const h = nz.fbm(x / 34, y / 34, 5, 2.1, 0.5);
      height[idx(x, y)] = h;
    }
  }

  // River: random walk from one edge to the opposite, wobbling with noise.
  const vertical = rng.chance(0.5);
  let rx = vertical ? 20 + rng.int(MAP_W - 40) : 0;
  let ry = vertical ? 0 : 20 + rng.int(MAP_H - 40);
  const riverTiles: number[] = [];
  for (let step = 0; step < MAP_W * 2; step++) {
    if (!inBounds(rx, ry)) break;
    riverTiles.push(idx(rx, ry));
    const wob = nz2.noise(step / 9, 3.7) * 1.6;
    if (vertical) {
      ry += 1;
      rx += Math.round(wob + nz2.noise(step / 23, 8.1) * 1.2);
      if (rx < 2) rx = 2;
      if (rx > MAP_W - 3) rx = MAP_W - 3;
    } else {
      rx += 1;
      ry += Math.round(wob + nz2.noise(step / 23, 8.1) * 1.2);
      if (ry < 2) ry = 2;
      if (ry > MAP_H - 3) ry = MAP_H - 3;
    }
  }
  const riverSet = new Set<number>();
  for (const t of riverTiles) {
    const x = t % MAP_W;
    const y = (t / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!inBounds(x + dx, y + dy)) continue;
        if (Math.abs(dx) + Math.abs(dy) > 1 && rng.chance(0.5)) continue;
        riverSet.add(idx(x + dx, y + dy));
      }
  }
  // Lake: lower a blob
  const lx = 24 + rng.int(MAP_W - 48);
  const ly = 24 + rng.int(MAP_H - 48);
  const lr = 6 + rng.int(6);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      let h = height[i];
      const dl = Math.hypot(x - lx, y - ly) + nz2.noise(x / 7, y / 7) * 2.5;
      if (dl < lr) h -= (lr - dl) / lr * 0.9;
      if (riverSet.has(i)) h -= 0.8;
      let t: Terrain;
      if (h < -0.62) t = Terrain.DeepWater;
      else if (h < -0.42) t = Terrain.Water;
      else if (h < -0.34) t = Terrain.Shore;
      else if (h > 0.46) t = Terrain.Hills;
      else {
        const f = nz2.fbm(x / 18 + 50, y / 18 + 50, 3);
        if (f > 0.22 && h > -0.2) t = Terrain.Forest;
        else if (f < -0.25) t = Terrain.Meadow;
        else t = Terrain.Grass;
      }
      terrain[i] = t;
    }
  }
  // Shores next to water
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) if (shoreTile(terrain, x, y)) terrain[idx(x, y)] = Terrain.Shore;

  // Ley nodes: one near centre (founding), 3-5 others spread out on buildable land.
  const nodes: { x: number; y: number; aspect?: 'vein' }[] = [];
  const buildable = (x: number, y: number) => {
    if (!inBounds(x, y)) return false;
    const t = terrain[idx(x, y)];
    return t === Terrain.Grass || t === Terrain.Meadow || t === Terrain.Forest;
  };
  const clearAround = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (!inBounds(x + dx, y + dy)) continue;
        const i = idx(x + dx, y + dy);
        if (dx * dx + dy * dy <= r * r && !isWater(terrain[i]) && terrain[i] !== Terrain.LeyNode)
          terrain[i] = dx === 0 && dy === 0 ? terrain[i] : Terrain.Grass;
      }
  };
  let fx = MAP_W >> 1;
  let fy = MAP_H >> 1;
  for (let tries = 0; tries < 400; tries++) {
    const cx = (MAP_W >> 1) + rng.int(25) - 12;
    const cy = (MAP_H >> 1) + rng.int(25) - 12;
    if (buildable(cx, cy) && buildableCount(terrain, cx, cy, 6) > 90) {
      fx = cx;
      fy = cy;
      break;
    }
  }
  nodes.push({ x: fx, y: fy });
  const targetNodes = opts.nodes ?? 4 + rng.int(3);
  for (let tries = 0; tries < 3000 && nodes.length < targetNodes; tries++) {
    const x = 10 + rng.int(MAP_W - 20);
    const y = 10 + rng.int(MAP_H - 20);
    if (!buildable(x, y)) continue;
    let ok = true;
    for (const n of nodes) if (Math.hypot(n.x - x, n.y - y) < 26) ok = false;
    if (!ok) continue;
    if (buildableCount(terrain, x, y, 4) < 30) continue;
    nodes.push({ x, y });
  }
  for (const n of nodes) {
    clearAround(n.x, n.y, 2);
    terrain[idx(n.x, n.y)] = Terrain.LeyNode;
  }
  // Founding clearing: make sure there is room to build.
  clearAround(fx, fy, 5);

  // The twin node: a people born beside the Veins founds its city between two. The first buildable tile at Chebyshev
  // distance 8 in fixed scan order; it keeps the founding's Vein aspect. No rng; other maps are untouched.
  if (opts.twinnode && opts.nodes !== 1) {
    let placed = false;
    for (let dy = -8; dy <= 8 && !placed; dy++)
      for (let dx = -8; dx <= 8 && !placed; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 8) continue;
        const x = fx + dx; const y = fy + dy;
        if (!buildable(x, y) || nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 6)) continue;
        clearAround(x, y, 2);
        terrain[idx(x, y)] = Terrain.LeyNode;
        nodes.push({ x, y, aspect: 'vein' });
        placed = true;
      }
  }

  // The Underhill: a people that builds in stone starts beside a hill ridge (6 to 9 tiles south of the founding).
  if (opts.underhill) {
    for (let dy = 5; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const x = fx + dx;
        const y = fy + dy;
        if (!inBounds(x, y) || Math.max(Math.abs(dx), dy) < 6) continue;
        const i = idx(x, y);
        if (terrain[i] === Terrain.Grass || terrain[i] === Terrain.Meadow || terrain[i] === Terrain.Forest) terrain[i] = Terrain.Hills;
      }
  }
  terrain[idx(fx, fy)] = Terrain.LeyNode;

  markMarsh(terrain, height, new Noise2D(seed + 9091), fx, fy, nodes);

  // The Ruins of Lukuku: one flagstone cluster in a forest, well away from the founding node.
  for (let tries = 0; tries < 400; tries++) {
    const x = 12 + rng.int(MAP_W - 24);
    const y = 12 + rng.int(MAP_H - 24);
    if (terrain[idx(x, y)] !== Terrain.Forest) continue;
    if (Math.hypot(x - fx, y - fy) < 28) continue;
    if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 9)) continue;
    let placed = 0;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(tx, ty)) continue;
        const d = Math.hypot(dx, dy) + nz2.noise(tx / 3 + 500, ty / 3 + 500) * 1.2;
        if (d > 2.6) continue;
        const t = terrain[idx(tx, ty)];
        if (t === Terrain.Forest || t === Terrain.Grass || t === Terrain.Meadow) { terrain[idx(tx, ty)] = Terrain.Ruins; placed++; }
      }
    if (placed >= 6) break;
    // undo a too-small cluster
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inBounds(x + dx, y + dy) && terrain[idx(x + dx, y + dy)] === Terrain.Ruins) terrain[idx(x + dx, y + dy)] = Terrain.Forest;
  }

  // The riverside: a people that lives on the water founds its city within six tiles of it. When the nearest river
  // or lake water lies further, a two-wide channel is cut from it toward the founding, stopping at six (never into the
  // clearing), with shore along its banks. No rng; the Vellish map is untouched.
  if (opts.riverside) {
    let wx = -1; let wy = -1; let wd = Infinity;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (terrain[idx(x, y)] !== Terrain.Water) continue;
        const d = Math.max(Math.abs(x - fx), Math.abs(y - fy));
        if (d < wd) { wd = d; wx = x; wy = y; }
      }
    if (wx >= 0 && wd > 6) {
      const carved: [number, number][] = [];
      const cut = (x: number, y: number) => {
        if (!inBounds(x, y)) return;
        const t = terrain[idx(x, y)];
        if (t === Terrain.LeyNode || t === Terrain.Ruins || isWater(t)) return;
        terrain[idx(x, y)] = Terrain.Water;
        carved.push([x, y]);
      };
      let x = wx; let y = wy;
      while (Math.max(Math.abs(x - fx), Math.abs(y - fy)) > 6) {
        const ddx = fx - x; const ddy = fy - y;
        if (Math.abs(ddx) >= Math.abs(ddy)) { x += Math.sign(ddx); cut(x, y); cut(x, y + 1); } else { y += Math.sign(ddy); cut(x, y); cut(x + 1, y); }
      }
      for (const [cx, cy] of carved)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(cx + dx, cy + dy) && shoreTile(terrain, cx + dx, cy + dy)) terrain[idx(cx + dx, cy + dy)] = Terrain.Shore;
    }
  }

  // Gloam on the map rim, with noisy pockets.
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (isWater(terrain[i])) continue;
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      const n = nz2.noise(x / 11 + 200, y / 11 + 200);
      const threshold = 3 + n * 3;
      if (edge < threshold) gloam[i] = 1;
      if (opts.island && Math.hypot(x - fx, y - fy) + n * 4 > 36) gloam[i] = 1;
    }
  // never near founding
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (Math.hypot(x - fx, y - fy) < 30) gloam[idx(x, y)] = 0;

  return { terrain, gloam, nodes, founding: { x: fx, y: fy } };
}

function buildableCount(terrain: Uint8Array, cx: number, cy: number, r: number): number {
  let c = 0;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(x, y)) continue;
      const t = terrain[idx(x, y)];
      if (t === Terrain.Grass || t === Terrain.Meadow || t === Terrain.Forest) c++;
    }
  return c;
}

/** BFS distance from any tile matching `pred`, capped. */
export function distanceMap(pred: (i: number) => boolean, cap: number): Uint8Array {
  const out = new Uint8Array(MAP_W * MAP_H).fill(cap);
  const queue = new Int32Array(MAP_W * MAP_H);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < out.length; i++)
    if (pred(i)) {
      out[i] = 0;
      queue[tail++] = i;
    }
  while (head < tail) {
    const i = queue[head++];
    const d = out[i];
    if (d >= cap) continue;
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    const n = [i - 1, i + 1, i - MAP_W, i + MAP_W];
    const ok = [x > 0, x < MAP_W - 1, y > 0, y < MAP_H - 1];
    for (let k = 0; k < 4; k++) {
      if (!ok[k]) continue;
      const j = n[k];
      if (out[j] > d + 1) {
        out[j] = d + 1;
        queue[tail++] = j;
      }
    }
  }
  return out;
}
