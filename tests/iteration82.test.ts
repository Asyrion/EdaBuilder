/** Iteration 82 (the eda-lore swap, batch 1): the zone houses are the user's own houses from eda-lore, every people its own.
 *  Each slot (people × zone × level × variant) holds a painting no other slot holds, or, where the sheets ran short, keeps its
 *  people's drawn house: no painting is repeated (the user's rule). The houses fit their 1×1 tile and the citizen yardstick. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoneSpriteName } from '../src/render/atlas';
import { generateSprites } from '../src/render/sprites';

type Entry = { name: string; set?: string; src: string; island?: number; w?: number; h?: number; flip?: boolean; off?: boolean; anchor?: unknown; checked?: boolean; aliases?: string[] };
const sources = (JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as Entry[]).filter((e) => !e.off);
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number; ax: number; ay: number; file: string }>;
const PEOPLES = ['', '_grimmen', '_veshari', '_tallowkin'];
const ZONES = ['hearth', 'craft', 'market', 'arcane'];
const ZONE = /^(hearth|craft|market|arcane)_l(\d)_v\d(_\w+)?$/;
const houses = sources.filter((e) => ZONE.test(e.name));
const drawn = new Set(generateSprites().map((d) => d.name));

describe('The eda-lore swap, batch 1: the zone houses', () => {
  it('every zone painting comes from the user\'s eda-lore sheets, and no painting fills two slots', () => {
    expect(houses.length).toBe(180);
    for (const e of houses) { expect(e.src, e.name).toMatch(/^inspirations\/eda-lore\//); expect(e.aliases, e.name).toBeUndefined(); }
    const keys = houses.map((e) => `${e.src}#${e.island}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('each people has its own houses: the Vellish and Veshari all 48, the Grimmen 41, the Tallowkin 43', () => {
    const count = (p: string) => houses.filter((e) => (e.name.match(ZONE)![3] ?? '') === p).length;
    expect(PEOPLES.map(count)).toEqual([48, 41, 48, 43]);
  });
  it('a slot without a painting keeps its people\'s drawn house, never another people\'s painting', () => {
    const imported = new Set(Object.keys(manifest));
    for (const p of PEOPLES) for (const z of ZONES) for (const l of [1, 2, 3]) for (const v of [0, 1, 2, 3]) {
      const n = zoneSpriteName({ imported }, z, l, v, p);
      expect(n).toBe(`${z}_l${l}_v${v}${p}`);
      expect(imported.has(n) || drawn.has(n), n).toBe(true);
    }
  });
  it('the houses fit a 1×1 tile, stand centred on it, and keep the yardstick (level 1 2.8 citizens, the Tallowkin 3.2; level 2–3 4; arcane and Tallowkin level 3 towers 5)', () => {
    for (const e of houses) {
      const m = manifest[e.name]; const [, l, p] = e.name.match(ZONE)!.slice(1);
      expect([e.w, e.h, e.anchor, e.checked], e.name).toEqual([1, 1, 'centre', true]);
      expect(m.w, e.name).toBeLessThanOrEqual(36);
      expect([m.ax, m.ay], e.name).toEqual([Math.round(m.w / 2), m.h - 1 - 16]);
      const tower = l === '3' && (e.name.startsWith('arcane') || p === '_tallowkin');
      const cap = l === '1' ? (p === '_tallowkin' ? 3.2 : 2.8) : tower ? 5 : 4;
      expect(m.h / 12, e.name).toBeLessThanOrEqual(cap);
    }
  });
  it('the houses fronted on the left are mirrored so their door faces the road side', () => {
    expect(houses.filter((e) => e.flip).map((e) => e.name).sort()).toEqual(["arcane_l1_v0","arcane_l1_v0_grimmen","arcane_l1_v0_veshari","arcane_l1_v1","arcane_l1_v1_veshari","arcane_l1_v2","arcane_l1_v2_veshari","arcane_l2_v1_grimmen","arcane_l2_v1_tallowkin","arcane_l2_v2_veshari","arcane_l2_v3_tallowkin","arcane_l3_v1","arcane_l3_v1_tallowkin","arcane_l3_v3","arcane_l3_v3_veshari","craft_l1_v0_grimmen","craft_l1_v0_tallowkin","craft_l1_v2_grimmen","craft_l1_v2_tallowkin","craft_l1_v3_veshari","craft_l2_v0","craft_l2_v0_veshari","craft_l2_v1_tallowkin","craft_l2_v2_grimmen","craft_l2_v2_tallowkin","craft_l2_v3","craft_l3_v0_grimmen","craft_l3_v0_veshari","craft_l3_v1_veshari","craft_l3_v2_tallowkin","craft_l3_v2_veshari","craft_l3_v3","craft_l3_v3_grimmen","hearth_l1_v0","hearth_l1_v0_grimmen","hearth_l1_v1","hearth_l1_v2_grimmen","hearth_l1_v2_tallowkin","hearth_l1_v2_veshari","hearth_l1_v3","hearth_l1_v3_grimmen","hearth_l1_v3_veshari","hearth_l2_v2","hearth_l2_v3_grimmen","hearth_l2_v3_veshari","hearth_l3_v0","hearth_l3_v0_veshari","hearth_l3_v2_grimmen","hearth_l3_v2_tallowkin","hearth_l3_v2_veshari","market_l1_v0_grimmen","market_l1_v0_tallowkin","market_l1_v1_grimmen","market_l1_v1_veshari","market_l1_v2_veshari","market_l2_v0","market_l2_v0_grimmen","market_l2_v0_veshari","market_l2_v1","market_l2_v1_grimmen","market_l2_v1_veshari","market_l2_v2","market_l2_v2_tallowkin","market_l2_v3_grimmen","market_l2_v3_veshari","market_l3_v0_grimmen","market_l3_v1","market_l3_v1_grimmen","market_l3_v1_tallowkin","market_l3_v2_grimmen","market_l3_v2_veshari","market_l3_v3","market_l3_v3_grimmen"]);
  });
});
