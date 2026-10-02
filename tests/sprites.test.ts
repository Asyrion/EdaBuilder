// Iteration 50: every building has a sprite, the road tile leaves the ground to show, and the atlas counts its prop variants.
import { describe, expect, it } from 'vitest';
import { generateSprites } from '../src/render/sprites';
import { BUILDINGS as CATALOG } from '../src/sim/catalog';
import { SpriteAtlas } from '../src/render/atlas';

const defs = generateSprites();
const names = new Set(defs.map((d) => d.name));

describe('the sprite set', () => {
  it('holds a b_<key> sprite for every non-zone building in the catalog (the nine that drew nothing are drawn)', () => {
    const missing = CATALOG.filter((d) => d.category !== 'zone' && !names.has(`b_${d.key}`) && !names.has(`b_${d.key}_0`)).map((d) => d.key); // the World Tree is b_worldtree_<stage>
    expect(missing).toEqual([]);
  });

  it('a plain road tile is transparent outside its band, so painted ground shows beside the road', () => {
    const track = defs.find((d) => d.name === 'road_track_0')!;
    const { w, h, data } = track.p;
    const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3];
    expect(alphaAt(16, 8)).toBeGreaterThan(0); // the centre square is road
    expect(alphaAt(2, 8)).toBe(0); // the diamond's left corner is ground now
    expect(alphaAt(29, 8)).toBe(0);
  });

  it('countVariants counts the numbered props', () => {
    const atlas = new SpriteAtlas();
    for (const n of ['tree_0', 'tree_1', 'tree_2', 'bush_0', 'mushroom_0', 'mushroom_1']) atlas.sprites[n] = { x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 };
    expect(atlas.countVariants('tree_')).toBe(3);
    expect(atlas.countVariants('bush_')).toBe(1);
    expect(atlas.countVariants('mushroom_')).toBe(2);
    expect(atlas.countVariants('rock_')).toBe(0);
    expect(names.has('bush_0')).toBe(true);
  });
});
