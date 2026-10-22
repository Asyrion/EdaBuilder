/**
 * Trees by region (iteration 94, DESIGN §4.125). The forest used to draw any tree anywhere: willows on the hills, crystal
 * trees in a plain wood, blossom beside redwoods. Now each forest tile belongs to a grove of the land it stands on:
 * conifers by the hills and in the cold patches, willows by the water, blossom and autumn in groves of their own, the
 * crystal and spirit trees only beside a ley node, and oaks and birches everywhere else.
 *
 * Pure and deterministic from the tile and the map: no state, no RNG, so a saved game draws the same wood it always did.
 * The sprite indices are the shipped set's (tree_0..31, tree_autumn_0..2, glimwood_0..9); a pool keeps only the indices the
 * loaded atlas has, so the procedural fallback set (four trees) still draws.
 */
import { h2 } from './painter';
import { Terrain, idx, inBounds, isWater, type GameState } from '../sim/types';

/** The oaks, the apple tree and the birches: the woods of the meadow. */
export const BROADLEAF = [0, 1, 2, 3, 12, 17, 28, 23, 4, 5, 6, 7, 18];
/** The spruces and firs: by the hills and in the cold. */
export const CONIFER = [8, 9, 10, 11, 13, 19, 24, 29];
/** The willows: by water and marsh. */
export const WILLOW = [15, 16, 20, 25, 31];
/** The pink blossom trees: small groves of their own. */
export const BLOSSOM = [21, 26, 30];
/** The red and orange trees (autumn 0..2) and the red conifer (27): groves of their own. */
export const AUTUMN_PLAIN = [27];
/** The great dark trunk and the bonsai-like tree: rare, in the deep forest. */
export const ANCIENT = [22, 14];
/** The pure crystal trees (glimwood): only at a node's core. */
export const CRYSTAL = [0, 1, 6];
/** The other spirit trees (glimwood): near a node. */
export const SPIRIT = [2, 3, 4, 5, 7, 8, 9];

/** How far from a ley node the magic trees grow, and how far the pure crystal ones. */
export const MAGIC_REACH = 5;
export const CRYSTAL_REACH = 3;
/** How far from water a willow grows. */
export const WET_REACH = 5;

export interface GroveCtx {
  /** Distance to the nearest ley node, in tiles. */
  node: number;
  /** Is open water or marsh within WET_REACH? */
  wet: boolean;
  /** Are hills within six tiles? */
  hills: boolean;
  /** Is the tile in the thick of a forest (most of its neighbours are forest)? */
  deep: boolean;
}

export interface TreeCounts { tree: number; autumn: number; glimwood: number }

/** The map's smooth fields, 0..1, in cells of about 14 tiles: cold, blossom, autumn. */
export function field(x: number, y: number, salt: number, cell = 14): number {
  const fx = x / cell, fy = y / cell;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const u = fx - x0, v = fy - y0;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = h2(x0, y0, salt), b = h2(x0 + 1, y0, salt), c = h2(x0, y0 + 1, salt), d = h2(x0 + 1, y0 + 1, salt);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** What the land around a forest tile says about its trees. */
export function groveCtx(s: GameState, x: number, y: number): GroveCtx {
  let node = Infinity;
  for (const n of s.nodes) node = Math.min(node, Math.hypot(n.x - x, n.y - y));
  let wet = false, hills = false, forest = 0;
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const t = s.terrain[idx(nx, ny)];
      if (t === Terrain.Hills) hills = true;
      if (Math.abs(dx) > WET_REACH || Math.abs(dy) > WET_REACH) continue;
      if (isWater(t)) wet = true;
      if (t === Terrain.Forest && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) forest++;
    }
  return { node, wet, hills, deep: forest >= 36 };
}

const pick = (pool: number[], limit: number, r: number): number | null => {
  const ok = pool.filter((i) => i < limit);
  return ok.length ? ok[Math.floor(r * ok.length) % ok.length] : null;
};

/**
 * The sprite name of tree `k` (0 or 1) on forest tile (x, y). Falls back to a broadleaf, then to tree_0, when a pool is
 * empty in the loaded atlas.
 */
export function treeFor(ctx: GroveCtx, x: number, y: number, k: number, n: TreeCounts): string {
  const r = (salt: number) => h2(x, y, salt + k * 7);
  // the magic trees: beside a node only, thinning with distance
  if (ctx.node <= MAGIC_REACH && n.glimwood > 0 && r(33) < 0.6 * (1 - ctx.node / (MAGIC_REACH + 1))) {
    const g = ctx.node <= CRYSTAL_REACH ? pick([...CRYSTAL, ...SPIRIT], n.glimwood, r(34)) : pick(SPIRIT, n.glimwood, r(34));
    if (g !== null) return `glimwood_${g}`;
  }
  const cold = field(x, y, 901), bloom = field(x, y, 902, 11), fall = field(x, y, 903, 11);
  let pool: number[];
  let autumn = false;
  if (bloom > 0.74 && r(50) < 0.85) pool = BLOSSOM;
  else if (fall > 0.74 && r(51) < 0.85) { pool = AUTUMN_PLAIN; autumn = true; }
  else if (ctx.wet && r(52) < 0.7) pool = WILLOW;
  else if ((ctx.hills || cold > 0.58) && r(53) < 0.85) pool = CONIFER;
  else if (ctx.deep && r(54) < 0.05) pool = ANCIENT;
  else pool = r(55) < 0.12 && !ctx.wet ? CONIFER : BROADLEAF; // a few conifers among the oaks keep the seams soft
  if (autumn && n.autumn > 0 && r(56) < 0.75) return `tree_autumn_${Math.floor(r(57) * n.autumn) % n.autumn}`;
  const i = pick(pool, n.tree, r(58)) ?? pick(BROADLEAF, n.tree, r(59)) ?? 0;
  return `tree_${i}`;
}
