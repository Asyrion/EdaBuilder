/** Iteration 82 (the eda-lore swap, batch 1): the zone houses are the user's own houses from eda-lore, every people its own.
 *  Each slot (zone × level × variant; the Vellish only since the scope reset) holds a painting no other slot holds, or, where the sheets ran short, keeps its
 *  people's drawn house: no painting is repeated (the user's rule). The houses fit their 1×1 tile and the citizen yardstick. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoneSpriteName } from '../src/render/atlas';
import { generateSprites } from '../src/render/sprites';

type Entry = { name: string; set?: string; src: string; island?: number; w?: number; h?: number; flip?: boolean; off?: boolean; anchor?: unknown; checked?: boolean; aliases?: string[] };
const sources = (JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as Entry[]).filter((e) => !e.off);
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number; ax: number; ay: number; file: string }>;
const PEOPLES = [''];
const ZONES = ['hearth', 'craft', 'market', 'arcane'];
const ZONE = /^(hearth|craft|market|arcane)_l(\d)_v\d(_\w+)?$/;
const houses = sources.filter((e) => ZONE.test(e.name));
const drawn = new Set(generateSprites().map((d) => d.name));

describe('The eda-lore swap, batch 1: the zone houses', () => {
  it('every zone painting comes from the user\'s eda-lore sheets, and no painting fills two slots', () => {
    expect(houses.length).toBe(48); // 192 before the scope reset parked the other peoples' houses
    for (const e of houses) { expect(e.src, e.name).toMatch(/^inspirations\/eda-lore\//); expect(e.aliases, e.name).toBeUndefined(); }
    const keys = houses.map((e) => `${e.src}#${e.island}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('the Vellish have their own houses, all 48', () => {
    const count = (p: string) => houses.filter((e) => (e.name.match(ZONE)![3] ?? '') === p).length;
    expect(PEOPLES.map(count)).toEqual([48]);
  });
  it('a slot without a painting keeps its people\'s drawn house, never another people\'s painting', () => {
    const imported = new Set(Object.keys(manifest));
    for (const p of PEOPLES) for (const z of ZONES) for (const l of [1, 2, 3]) for (const v of [0, 1, 2, 3]) {
      const n = zoneSpriteName({ imported }, z, l, v);
      expect(n).toBe(`${z}_l${l}_v${v}${p}`);
      expect(imported.has(n) || drawn.has(n), n).toBe(true);
    }
  });
  it('the houses fit a 1×1 tile, stand centred on it, and keep the yardstick (level 1 2.8 citizens; level 2–3 4; arcane level 3 towers 5)', () => {
    for (const e of houses) {
      const m = manifest[e.name]; const [, l, p] = e.name.match(ZONE)!.slice(1);
      expect([e.w, e.h, e.anchor, e.checked], e.name).toEqual([1, 1, 'centre', true]);
      expect(m.w, e.name).toBeLessThanOrEqual(36);
      expect([m.ax, m.ay], e.name).toEqual([Math.round(m.w / 2), m.h - 1 - 16]);
      const tower = l === '3' && e.name.startsWith('arcane');
      const cap = l === '1' ? 2.8 : tower ? 5 : 4;
      expect(m.h / 12, e.name).toBeLessThanOrEqual(cap);
    }
  });
  it('the houses fronted on the left are mirrored so their door faces the road side', () => {
    expect(houses.filter((e) => e.flip).map((e) => e.name).sort()).toEqual(["arcane_l1_v0","arcane_l1_v1","arcane_l1_v2","arcane_l3_v1","arcane_l3_v3","craft_l2_v0","craft_l2_v3","craft_l3_v3","hearth_l1_v0","hearth_l1_v1","hearth_l1_v3","hearth_l2_v2","hearth_l3_v0","market_l2_v0","market_l2_v1","market_l2_v2","market_l3_v1","market_l3_v3"]);
  });
});
