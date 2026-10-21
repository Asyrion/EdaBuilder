/** Iteration 84 (the eda-lore swap, batch 2): every other compatible painting of the user's eda-lore repository. Buildings take
 *  looks (b_<key>_v0..N-1), one per building chosen by its tile; the props pool by prefix; no painting is used twice. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookName } from '../src/render/atlas';
import { BUILDING_BY_KEY } from '../src/sim/catalog';

type Entry = { name: string; set?: string; src: string; island?: number; rect?: number[]; w?: number; h?: number; flip?: boolean; off?: boolean; anchor?: unknown; checked?: boolean; aliases?: string[]; kind?: string; shift?: { x: number; y: number } };
const sources = (JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as Entry[]).filter((e) => !e.off);
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number; ax: number; ay: number }>;
const batch2 = sources.filter((e) => e.set === 'eda-lore-2');
const count = (p: string) => { let n = 0; while (manifest[`${p}${n}`]) n++; return n; };

describe('The eda-lore swap, batch 2: every compatible asset', () => {
  it('no painting fills two names anywhere in the set (the user\'s rule), across both batches and the earlier imports', () => {
    // a dragon's stage 1 and stage 2 are one animal at two ages (iteration 50), not a repeat
    const keys = sources.filter((e) => e.kind !== 'vehicle' && !(e as { flap?: unknown }).flap && !/^dragon_\d_2_0$/.test(e.name)).map((e) => `${e.src}#${e.island ?? ''}#${(e.rect ?? []).join(',')}`);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup).toEqual([]);
  });
  it('the pools grew: trees, glimwood, bushes, mushrooms, glowing caps, the ground', () => {
    expect(count('tree_')).toBe(32);
    expect(count('tree_autumn_')).toBe(3);
    expect(count('glimwood_')).toBe(10);
    expect(count('bush_')).toBe(108);
    expect(count('mushroom_')).toBe(114);
    expect(count('glowcap_')).toBe(60);
    expect([count('grass_'), count('meadow_'), count('forest_'), count('hills_'), count('shore_')]).toEqual([7, 9, 7, 8, 2]);
  });
  it('every look belongs to a real building, runs from v0 without a gap, and stands centred on its footprint', () => {
    const looks = Object.keys(manifest).filter((n) => /^b_\w+_v\d+$/.test(n));
    expect(looks.length).toBeGreaterThan(110); // over 130 before the scope reset parked the peoples' looks, 116 after
    for (const n of looks) {
      const [, key, v] = /^b_(\w+)_v(\d+)$/.exec(n)!;
      expect(BUILDING_BY_KEY[key] || key === 'brickworks', n).toBeTruthy();
      for (let k = 0; k < Number(v); k++) expect(manifest[`b_${key}_v${k}`], `${n} gap at v${k}`).toBeDefined();
    }
    for (const e of batch2.filter((e) => /^b_/.test(e.name))) {
      const m = manifest[e.name]; const f = e.w!;
      expect([e.anchor, e.checked], e.name).toEqual(['centre', true]);
      expect(m.w, e.name).toBeLessThanOrEqual(f * 32 + 4);
      expect([m.ax, m.ay], e.name).toEqual([Math.round(m.w / 2) + (e.shift?.x ?? 0), m.h - 1 - f * 16 + (e.shift?.y ?? 0)]);
    }
  });
  it('a mushroom is smaller than a person: every mushroom and glowing cap at most 0.6 citizens (the user\'s word after iteration 84)', () => {
    for (const p of ['mushroom_', 'glowcap_']) for (let k = 0; k < count(p); k++) expect(manifest[`${p}${k}`].h / 12, `${p}${k}`).toBeLessThanOrEqual(0.6);
  });
  it('the wells keep the yardstick (1.5 citizens) and stand in the middle of their tile', () => {
    for (const p of ['b_well_v']) for (let k = 0; k < count(p); k++) {
      const m = manifest[`${p}${k}`];
      expect(m.h / 12, `${p}${k}`).toBeLessThanOrEqual(1.5 + 2 / 12); // the outline's two rows
    }
    expect(count('b_well_v')).toBe(37);
  });
  it('a building keeps its look: the pick is a function of its tile, spread over the looks, and the base where there are none', () => {
    const atlas = { countVariants: (p: string) => (p === 'b_well_v' ? 5 : 0) };
    expect(lookName(atlas, 'b_well', 3, 7)).toBe(lookName(atlas, 'b_well', 3, 7));
    expect(lookName(atlas, 'b_spire', 3, 7)).toBe('b_spire');
    const seen = new Set<string>();
    for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) seen.add(lookName(atlas, 'b_well', x, y));
    expect(seen.size).toBe(5);
  });
  it('a painting imported before stays the first look of its building', () => {
    for (const n of ['b_boneyard', 'b_ossuary', 'b_sextonchapel', 'b_spire']) expect(manifest[`${n}_v0`], n).toEqual(manifest[n]);
  });
  it('the looks fronted on the left are mirrored', () => {
    expect(batch2.filter((e) => e.flip).map((e) => e.name).sort()).toEqual(["b_drakemews_v0","b_fishershut_v0","b_golemfoundry_v0","b_healer_v0","b_househall_v0","b_hunterslodge_v0","b_hunterslodge_v3","b_lantern_v0","b_leybeacon_v0","b_ossuary_v5","b_shrine_v0","b_shrine_v1","b_shrine_v10","b_shrine_v3","b_shrine_v5","b_shrine_v6","b_shrine_v7","b_shrine_v8","b_shrine_v9","b_spire_v1","b_stormpeak_v0","b_tamerslodge_v0","b_wyrmforge_v0"]);
  });
});
