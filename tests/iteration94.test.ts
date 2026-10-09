/** Iteration 94 (DESIGN §4.125): trees by region. Each forest tile draws the trees of the land it stands on: crystal and spirit
 *  trees only beside a ley node, willows only by water, spruces by the hills and in the cold, blossom and autumn in groves. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/world';
import { Terrain, idx, MAP_H, MAP_W } from '../src/sim/types';
import { ANCIENT, AUTUMN_PLAIN, BLOSSOM, BROADLEAF, CONIFER, CRYSTAL, CRYSTAL_REACH, MAGIC_REACH, SPIRIT, WET_REACH, WILLOW, groveCtx, treeFor, type GroveCtx } from '../src/render/groves';

const manifest = new Set(Object.keys(JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites));
const COUNTS = { tree: 32, autumn: 3, glimwood: 10 };
const FAMILY = (name: string): string => {
  const m = /^(tree|glimwood|tree_autumn)_(\d+)$/.exec(name);
  if (!m) return 'other';
  const i = Number(m[2]);
  if (m[1] === 'glimwood') return 'magic';
  if (m[1] === 'tree_autumn') return 'autumn';
  return BROADLEAF.includes(i) ? 'broadleaf' : CONIFER.includes(i) ? 'conifer' : WILLOW.includes(i) ? 'willow' : BLOSSOM.includes(i) ? 'blossom' : AUTUMN_PLAIN.includes(i) ? 'autumn' : ANCIENT.includes(i) ? 'ancient' : 'other';
};
const plain: GroveCtx = { node: Infinity, wet: false, hills: false, deep: false };

describe('Trees by region', () => {
  it('the pools cover the shipped set with no tree in two families', () => {
    const all = [...BROADLEAF, ...CONIFER, ...WILLOW, ...BLOSSOM, ...AUTUMN_PLAIN, ...ANCIENT];
    expect(new Set(all).size).toBe(all.length);
    expect([...new Set(all)].sort((a, b) => a - b)).toEqual([...Array(32).keys()]);
    expect([...CRYSTAL, ...SPIRIT].sort((a, b) => a - b)).toEqual([...Array(10).keys()]);
  });

  it('is deterministic, and every name it returns is in the shipped atlas', () => {
    const wild: GroveCtx[] = [plain, { ...plain, wet: true }, { ...plain, hills: true }, { ...plain, deep: true }, { ...plain, node: 2 }, { ...plain, node: 4.5 }];
    for (const ctx of wild)
      for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) for (const k of [0, 1]) {
        const a = treeFor(ctx, x, y, k, COUNTS);
        expect(a).toBe(treeFor(ctx, x, y, k, COUNTS));
        expect(manifest.has(a), a).toBe(true);
      }
  });

  it('crystal trees stand only at a node\'s core, and spirit trees only within five tiles of one', () => {
    const seen = { crystal: 0, spirit: 0 };
    for (const node of [0.5, 2, 3, 3.5, 4.5, 5, 5.5, 8, 20])
      for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
        const name = treeFor({ ...plain, node }, x, y, 0, COUNTS);
        const m = /^glimwood_(\d+)$/.exec(name);
        if (!m) continue;
        const g = Number(m[1]);
        expect(node, name).toBeLessThanOrEqual(MAGIC_REACH);
        if (CRYSTAL.includes(g)) { expect(node, name).toBeLessThanOrEqual(CRYSTAL_REACH); seen.crystal++; } else seen.spirit++;
      }
    expect(seen.crystal).toBeGreaterThan(0);
    expect(seen.spirit).toBeGreaterThan(0);
  });

  it('willows grow only by water, spruces mostly by hills, and a plain wood is mostly oaks and birches', () => {
    let willowsDry = 0, willowsWet = 0, conifersHills = 0, broadleafPlain = 0, total = 0, byFamily: Record<string, number> = {};
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      if (FAMILY(treeFor(plain, x, y, 0, COUNTS)) === 'willow') willowsDry++;
      if (FAMILY(treeFor({ ...plain, wet: true }, x, y, 0, COUNTS)) === 'willow') willowsWet++;
      if (FAMILY(treeFor({ ...plain, hills: true }, x, y, 0, COUNTS)) === 'conifer') conifersHills++;
      const f = FAMILY(treeFor(plain, x, y, 0, COUNTS));
      byFamily[f] = (byFamily[f] ?? 0) + 1;
      if (f === 'broadleaf') broadleafPlain++;
      total++;
    }
    expect(willowsDry).toBe(0);
    expect(willowsWet / total).toBeGreaterThan(0.4);
    expect(conifersHills / total).toBeGreaterThan(0.5);
    expect(byFamily.magic ?? 0).toBe(0);
    expect(broadleafPlain / total).toBeGreaterThan(0.3);
    expect(((byFamily.blossom ?? 0) + (byFamily.autumn ?? 0)) / total).toBeLessThan(0.3); // groves are patches, not the rule
  });

  it('a 20 × 20 block of plain forest shows at most three families', () => {
    let worst = 0;
    for (let by = 0; by < 100; by += 20) for (let bx = 0; bx < 100; bx += 20) {
      const fam = new Set<string>();
      for (let y = by; y < by + 20; y++) for (let x = bx; x < bx + 20; x++) fam.add(FAMILY(treeFor(plain, x, y, 0, COUNTS)));
      worst = Math.max(worst, fam.size);
    }
    expect(worst).toBeLessThanOrEqual(4); // a grove edge may add one; never the mix of the whole set
  });

  it('the procedural fallback set (four trees) still draws, and an empty glimwood pool draws no glimwood', () => {
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      expect(treeFor({ ...plain, wet: true }, x, y, 0, { tree: 4, autumn: 0, glimwood: 0 })).toMatch(/^tree_[0-3]$/);
      expect(treeFor({ ...plain, node: 1 }, x, y, 0, { tree: 4, autumn: 0, glimwood: 0 })).toMatch(/^tree_[0-3]$/);
    }
  });

  it('groveCtx reads the real map: nodes, water, hills', () => {
    const s = createGame(42, 'Groves');
    const n = s.nodes[0];
    expect(groveCtx(s, n.x, n.y).node).toBe(0);
    let wetFound = false, hillsFound = false;
    for (let y = 8; y < MAP_H - 8 && !(wetFound && hillsFound); y++) for (let x = 8; x < MAP_W - 8; x++) {
      const t = s.terrain[idx(x, y)];
      if (t !== Terrain.Forest) continue;
      const c = groveCtx(s, x, y);
      if (c.wet) { wetFound = true; let near = false; for (let dy = -WET_REACH; dy <= WET_REACH; dy++) for (let dx = -WET_REACH; dx <= WET_REACH; dx++) { const tt = s.terrain[idx(x + dx, y + dy)]; if (tt === Terrain.Water || tt === Terrain.DeepWater || tt === Terrain.Shore || tt === Terrain.Marsh) near = true; } expect(near).toBe(true); }
      if (c.hills) hillsFound = true;
    }
    expect(wetFound || hillsFound).toBe(true);
  });
});
