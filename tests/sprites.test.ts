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

import { zoneSpriteName } from '../src/render/atlas';
import { stagedSpriteName, GROWING_HALLS } from '../src/sim/world';
import { recolour } from '../scripts/lib/sprite.mjs';
import { readFileSync } from 'node:fs';

describe('the painted set, part 2', () => {
  it('an imported base is the look for every people; the levels without a painting keep the people copy', () => {
    const atlas = { imported: new Set(['hearth_l2_v0']) };
    expect(zoneSpriteName(atlas, 'hearth', 2, 0, '_grimmen')).toBe('hearth_l2_v0');
    expect(zoneSpriteName(atlas, 'hearth', 2, 4, '_grimmen')).toBe('hearth_l2_v0');
    expect(zoneSpriteName(atlas, 'hearth', 1, 0, '_grimmen')).toBe('hearth_l1_v0_grimmen');
    expect(zoneSpriteName(atlas, 'hearth', 1, 0, '')).toBe('hearth_l1_v0');
  });

  it('a hall that grows falls back to the highest lower stage, then the plain sprite', () => {
    const has = (n: string) => ['b_guildhall_s1', 'b_guildhall_s2', 'b_temple_s1'].includes(n);
    expect(stagedSpriteName('guildhall', 0, has)).toBe('b_guildhall');
    expect(stagedSpriteName('guildhall', 1, has)).toBe('b_guildhall_s1');
    expect(stagedSpriteName('guildhall', 3, has)).toBe('b_guildhall_s2');
    expect(stagedSpriteName('temple', 3, has)).toBe('b_temple_s1');
    expect(GROWING_HALLS).toEqual(['stake', 'guildhall', 'temple']);
    for (const n of ['b_guildhall_s1', 'b_guildhall_s2', 'b_temple_s1', 'b_temple_s2']) expect(names.has(n)).toBe(true);
  });

  it('recolour shifts the hue and keeps alpha; the manifest holds the zone levels at 36 px and the glimwood', () => {
    const img = { w: 2, h: 1, data: new Uint8ClampedArray([40, 200, 40, 255, 0, 0, 0, 0]) };
    const out = recolour(img, { hue: 120 });
    expect(out.data[2]).toBeGreaterThan(out.data[0]); // green turned blue
    expect(out.data[3]).toBe(255);
    expect(out.data[7]).toBe(0);
    const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8'));
    for (const n of ['hearth_l2_v0', 'craft_l1_v0', 'craft_l2_v0', 'craft_l3_v0', 'arcane_l2_v0', 'market_l3_v0']) expect(manifest.sprites[n].w).toBe(36);
    expect(manifest.sprites.glimwood_0.glow).toBeDefined();
  });
});
