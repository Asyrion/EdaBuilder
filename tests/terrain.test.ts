import { describe, expect, it } from 'vitest';
import { generateTerrain } from '../src/sim/terrain';
import { MAP_H, MAP_W, Terrain, idx } from '../src/sim/types';

describe('terrain', () => {
  it('is deterministic for a seed', () => {
    const a = generateTerrain(123);
    const b = generateTerrain(123);
    expect(Array.from(a.terrain)).toEqual(Array.from(b.terrain));
    expect(a.nodes).toEqual(b.nodes);
  });
  it('differs between seeds', () => {
    const a = generateTerrain(1);
    const b = generateTerrain(2);
    let diff = 0;
    for (let i = 0; i < a.terrain.length; i++) if (a.terrain[i] !== b.terrain[i]) diff++;
    expect(diff).toBeGreaterThan(1000);
  });
  it('has water, forest, hills, ley nodes and rim gloam', () => {
    for (const seed of [1, 7, 42, 999]) {
      const t = generateTerrain(seed);
      const counts = new Array(10).fill(0);
      for (let i = 0; i < t.terrain.length; i++) counts[t.terrain[i]]++;
      expect(counts[Terrain.Water] + counts[Terrain.DeepWater]).toBeGreaterThan(200);
      expect(counts[Terrain.Forest]).toBeGreaterThan(200);
      expect(counts[Terrain.Hills]).toBeGreaterThan(50);
      expect(t.nodes.length).toBeGreaterThanOrEqual(4);
      expect(t.terrain[idx(t.founding.x, t.founding.y)]).toBe(Terrain.LeyNode);
      let gloam = 0;
      for (let i = 0; i < t.gloam.length; i++) gloam += t.gloam[i];
      expect(gloam).toBeGreaterThan(500);
      // founding area clear of gloam
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++)
          if (Math.hypot(x - t.founding.x, y - t.founding.y) < 25) expect(t.gloam[idx(x, y)]).toBe(0);
    }
  });
});
