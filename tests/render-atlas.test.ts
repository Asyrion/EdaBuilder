/** The sprites and the atlas: the drawn sprite set and its outline, the painted sprites and how they fit their tiles (the
 *  citizen is the yardstick), the eda-lore houses and looks, the donkey carts, buildings facing their road, the light cache,
 *  the sprite sheets the atlas loads, and the trees chosen by region. */
import { readManifest, spriteImage } from '../scripts/lib/sheet.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { decodePng } from '../scripts/lib/png.mjs';
import { packSheets, recolour } from '../scripts/lib/sprite.mjs';
import { SpriteAtlas, lookName, mirrorRect, zoneSpriteName, type ImportManifest } from '../src/render/atlas';
import { CART_GOODS_PREFIX, CART_STONE_PREFIX, cartPick, cartSpriteName, facesRight } from '../src/render/carts';
import { faceLeft } from '../src/render/facing';
import { ANCIENT, AUTUMN_PLAIN, BLOSSOM, BROADLEAF, CONIFER, CRYSTAL, CRYSTAL_REACH, MAGIC_REACH, SPIRIT, WET_REACH, WILLOW, groveCtx, treeFor, type GroveCtx } from '../src/render/groves';
import { drawHearthL2v0, drawHearthL2v1, drawHearthL2v2, drawHearthL2v3, drawCraftL1v0, drawCraftL1v2, drawDepot } from '../src/render/painted';
import { PAL, ambientFor, liftAmbient, nightFactor } from '../src/render/palette';
import { VIEW_LIFT } from '../src/render/renderer';
import { generateSprites, type SpriteDef } from '../src/render/sprites';
import { BUILDINGS, BUILDINGS as CATALOG, BUILDING_BY_KEY } from '../src/sim/catalog';
import { Terrain, idx, MAP_H, MAP_W } from '../src/sim/types';
import { GROWING_HALLS, createGame, stagedSpriteName } from '../src/sim/world';

// Shared by several blocks: the drawn sprite set, the imported manifest's entries, the painting list (art/sources.json),
// with and without the entries switched off, and the peoples whose looks are in play.
const defs = generateSprites();
const by = new Map(defs.map((d) => [d.name, d]));
const get = (n: string): SpriteDef => { const d = by.get(n); if (!d) throw new Error(`no sprite ${n}`); return d; };
const hex = (d: SpriteDef, x: number, y: number) => { const i = (y * d.p.w + x) * 4; return '#' + [0, 1, 2].map((k) => d.p.data[i + k].toString(16).padStart(2, '0')).join(''); };
/** The opaque height of a drawn sprite: rows from its first opaque pixel to its last. */
function opaqueHeight(d: SpriteDef): number {
  let top = -1, bottom = -1;
  for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; }
  return bottom - top + 1;
}
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number; ax: number; ay: number; file: string }>;
const sources = JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as { name: string; kind?: string; w?: number; h?: number; checked?: boolean; targetHeight?: number; shift?: { x: number; y: number }; off?: boolean }[];
type LoreEntry = { name: string; set?: string; src: string; island?: number; rect?: number[]; w?: number; h?: number; flip?: boolean; off?: boolean; anchor?: unknown; checked?: boolean; aliases?: string[]; kind?: string; shift?: { x: number; y: number } };
const liveSources = (JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as LoreEntry[]).filter((e) => !e.off);
const PEOPLES = ['']; // the other peoples' looks are parked (scope reset)

// Every building has a sprite, the road tile leaves the ground to show, the atlas counts its prop variants; zone houses,
// growing halls and the recolour step.
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

describe('the painted set, part 2', () => {
  it('a zone house is named by zone, level and variant (the variant wraps at four)', () => {
    const atlas = { imported: new Set(['hearth_l2_v0']) };
    expect(zoneSpriteName(atlas, 'hearth', 2, 0)).toBe('hearth_l2_v0');
    expect(zoneSpriteName(atlas, 'hearth', 2, 4)).toBe('hearth_l2_v0');
    expect(zoneSpriteName(atlas, 'hearth', 1, 0)).toBe('hearth_l1_v0');
  });

  it('a hall that grows falls back to the highest lower stage, then the plain sprite', () => {
    const has = (n: string) => ['b_temple_s1'].includes(n);
    expect(stagedSpriteName('temple', 0, has)).toBe('b_temple');
    expect(stagedSpriteName('temple', 1, has)).toBe('b_temple_s1');
    expect(stagedSpriteName('temple', 3, has)).toBe('b_temple_s1');
    expect(GROWING_HALLS).toEqual(['stake', 'temple']); // the Guildhall grew too; it is parked with the guilds (scope reset 1c)
    for (const n of ['b_temple_s1', 'b_temple_s2']) expect(names.has(n)).toBe(true);
  });

  it('recolour shifts the hue and keeps alpha; the manifest holds the zone levels at 36 px and the glimwood', () => {
    const img = { w: 2, h: 1, data: new Uint8ClampedArray([40, 200, 40, 255, 0, 0, 0, 0]) };
    const out = recolour(img, { hue: 120 });
    expect(out.data[2]).toBeGreaterThan(out.data[0]); // green turned blue
    expect(out.data[3]).toBe(255);
    expect(out.data[7]).toBe(0);
    const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8'));
    for (const n of ['craft_l2_v0', 'craft_l3_v0', 'arcane_l2_v0', 'market_l3_v0']) expect(manifest.sprites[n].w).toBeLessThanOrEqual(36); // the user's houses since iteration 82: at most the tile's width and the outline
    expect(manifest.sprites.glimwood_0.glow).toBeDefined();
  });
});

// The light sprite cache is bounded.
describe('Hotfix: the light sprite cache is bounded', () => {
  it('never holds more than LIGHT_CACHE_MAX canvases and still returns a canvas', async () => {
    let made = 0;
    const fakeCtx = { createRadialGradient: () => ({ addColorStop: () => undefined }), fillRect: () => undefined, fillStyle: null as unknown };
    (globalThis as any).document = { createElement: () => { made++; return { width: 0, height: 0, getContext: () => fakeCtx }; } };
    const { lightSprite, lightCacheSize, LIGHT_CACHE_MAX } = await import('../src/render/lights');
    const a = lightSprite(6, '#ffcc88', 0.6);
    expect(lightSprite(6, '#ffcc88', 0.6)).toBe(a); // cached
    for (let k = 0; k < 2000; k++) lightSprite(6, '#ffcc88', 0.6 * (k / 2000));
    expect(lightCacheSize()).toBeLessThanOrEqual(LIGHT_CACHE_MAX);
    expect(made).toBeGreaterThan(1000);
    expect(lightSprite(3, '#88ccff', 0.5)).toBeTruthy();
    // the quantized particle intensities make only eleven keys per radius and colour
    const before = lightCacheSize();
    for (let life = 0; life <= 1; life += 0.001) lightSprite(3, '#88ccff', (Math.round(Math.min(1, life) * 10) / 10) * 0.6);
    expect(lightCacheSize() - before).toBeLessThanOrEqual(11);
    delete (globalThis as any).document;
  });
});

/** The donkey carts: the painted carts carry the goods and the leystone, at a folk's scale, facing the way they drive; a
 *  missing painting falls back to the procedural cart. */
interface CartEntry { file: string; w: number; h: number; ax: number; ay: number }
const cartManifestFull = readManifest('.');
const cartManifest = cartManifestFull as { sprites: Record<string, CartEntry> };
const cartSources = JSON.parse(readFileSync('art/sources.json', 'utf8')) as { sprites: { name: string; kind?: string; checked?: boolean; mirrored?: boolean }[] };
const carts = cartSources.sprites.filter((e) => e.kind === 'vehicle');
const cartPng = (e: CartEntry) => spriteImage('.', cartManifestFull, e) as { w: number; h: number; data: Uint8ClampedArray };
const opaqueBox = (img: { w: number; h: number; data: Uint8ClampedArray }) => {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const cartCount = (prefix: string) => { let n = 0; while (`${prefix}${n}` in cartManifest.sprites) n++; return n; };

describe('The donkey carts', () => {
  it('every painted cart is checked by eye, has its sprite and a left-facing twin with the mirrored anchor and pixels', () => {
    expect(carts.length).toBeGreaterThanOrEqual(20);
    for (const e of carts) {
      expect(e.checked, `${e.name} judged by eye`).toBe(true);
      expect(e.mirrored, e.name).toBe(true);
      const r = cartManifest.sprites[e.name], l = cartManifest.sprites[`${e.name}_l`];
      expect(r, e.name).toBeDefined();
      expect(l, `${e.name}_l`).toBeDefined();
      expect([l.w, l.h, l.ay]).toEqual([r.w, r.h, r.ay]);
      expect(l.ax).toBe(r.w - r.ax);
      const a = cartPng(r), b = cartPng(l);
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) expect(b.data[(y * a.w + (a.w - 1 - x)) * 4 + 3]).toBe(a.data[(y * a.w + x) * 4 + 3]);
    }
    expect(cartCount(CART_GOODS_PREFIX)).toBe(carts.filter((e) => e.name.startsWith(CART_GOODS_PREFIX)).length);
    expect(cartCount(CART_STONE_PREFIX)).toBeGreaterThanOrEqual(3);
  });

  it('a cart is the scale of the folk: no taller than one and a half citizens, no wider than 28 px, the wheels on its point', () => {
    const citizen = 12; // cit_* is 8×12
    for (const e of carts) {
      const r = cartManifest.sprites[e.name];
      const box = opaqueBox(cartPng(r));
      expect(box.h, e.name).toBeLessThanOrEqual(citizen * 1.5);
      expect(box.h, e.name).toBeGreaterThanOrEqual(10);
      expect(box.w, e.name).toBeLessThanOrEqual(28);
      expect(r.ay, e.name).toBe(r.h - 1);
      expect(Math.abs(r.ax - r.w / 2), e.name).toBeLessThanOrEqual(1);
    }
  });

  it('picks a painting by id and a facing by heading; a missing set keeps the procedural carts', () => {
    const n = (p: string) => (p === CART_GOODS_PREFIX ? 27 : p === CART_STONE_PREFIX ? 4 : 0);
    expect(facesRight(0)).toBe(true);
    expect(facesRight(3)).toBe(true);
    expect(facesRight(1)).toBe(false);
    expect(facesRight(2)).toBe(false);
    expect(cartSpriteName({ id: 7, variant: 1, dir: 0 }, n)).toBe(`${CART_GOODS_PREFIX}${cartPick(7, 27)}`);
    expect(cartSpriteName({ id: 7, variant: 2, dir: 1 }, n)).toBe(`${CART_GOODS_PREFIX}${cartPick(7, 27)}_l`);
    expect(cartSpriteName({ id: 7, variant: 0, dir: 2 }, n)).toBe(`${CART_STONE_PREFIX}${cartPick(7, 4)}_l`);
    expect(cartSpriteName({ id: 7, variant: 1, dir: 0 }, () => 0)).toBe('cart_1');
    // consecutive carts spread over the pool
    const picks = new Set(Array.from({ length: 40 }, (_, id) => cartPick(id, 27)));
    expect(picks.size).toBeGreaterThan(15);
    for (const p of picks) expect(p).toBeLessThan(27);
  });
});

/** Every building faces its road: a building whose road runs past its left face is drawn mirrored, the visible front edges
 *  before the back ones; the mirrored rect is the sprite's mirror image about its anchor. */
const world = (roads: [number, number][]) => {
  const road = new Uint8Array(MAP_W * MAP_H);
  for (const [x, y] of roads) road[idx(x, y)] = 1;
  return { road } as unknown as Parameters<typeof faceLeft>[0];
};

describe('Buildings turn to their road', () => {
  const house = { x: 20, y: 20, w: 1, h: 1 };
  const hall = { x: 20, y: 20, w: 2, h: 2 };

  it('a road on one edge: the right faces (+x, −y) keep the sprite, the left faces (+y, −x) mirror it', () => {
    expect(faceLeft(world([[21, 20]]), house)).toBe(false); // +x, the lower-right face
    expect(faceLeft(world([[20, 21]]), house)).toBe(true); // +y, the lower-left face
    expect(faceLeft(world([[20, 19]]), house)).toBe(false); // −y, behind on the right
    expect(faceLeft(world([[19, 20]]), house)).toBe(true); // −x, behind on the left
    expect(faceLeft(world([[22, 21]]), hall)).toBe(false);
    expect(faceLeft(world([[21, 22]]), hall)).toBe(true);
    expect(faceLeft(world([[19, 21]]), hall)).toBe(true);
    expect(faceLeft(world([]), house)).toBe(false); // no road: the default
  });

  it('the visible front edges win over the back ones, and the longer road front wins a tie of sides', () => {
    expect(faceLeft(world([[20, 21], [20, 19]]), house)).toBe(true); // front-left beats back-right
    expect(faceLeft(world([[21, 20], [19, 20]]), house)).toBe(false); // front-right beats back-left
    expect(faceLeft(world([[21, 20], [20, 21]]), house)).toBe(false); // both fronts: right
    expect(faceLeft(world([[22, 20], [20, 22], [21, 22]]), hall)).toBe(true); // two road tiles on the left front, one on the right
    expect(faceLeft(world([[19, 20], [20, 19]]), house)).toBe(false); // both backs: right
  });

  it('corner-only roads: the left corner mirrors, the others keep the sprite', () => {
    expect(faceLeft(world([[19, 21]]), house)).toBe(true); // the left corner (−x, +y)
    expect(faceLeft(world([[21, 19]]), house)).toBe(false); // the right corner
    expect(faceLeft(world([[21, 21]]), house)).toBe(false); // the bottom corner
    expect(faceLeft(world([[19, 19]]), house)).toBe(false); // the top corner
  });

  it('the mirrored rect: the body and glow at W − x − w, the anchor at w − ax, the same rows', () => {
    const r = { x: 100, y: 40, w: 30, h: 20, ax: 12, ay: 18, glow: { x: 300, y: 80 } };
    const m = mirrorRect(r, 1024);
    expect(m).toEqual({ x: 1024 - 100 - 30, y: 40, w: 30, h: 20, ax: 18, ay: 18, glow: { x: 1024 - 300 - 30, y: 80 } });
    expect(mirrorRect(m, 1024)).toEqual(r);
    expect(mirrorRect({ x: 0, y: 0, w: 8, h: 8, ax: 4, ay: 8 }, 64).glow).toBeUndefined();
  });

  it('every footprint is square, so a mirror about the footprint keeps a building on its tiles', () => {
    for (const b of BUILDINGS) expect(b.w, b.key).toBe(b.h);
  });
});

/** The Lantern of Vell and the temple's three stages drawn by hand in code, and the citizens on their 8×12 canvas. The sprites
 *  stand on their footprint's back corner, the temple grows, the Lantern is the tallest 3×3 and burns at night, the walk cycle
 *  moves, the Tallowkin keep their eyes, and every sprite is closed by its outline. */
/** The opaque height of a sprite: rows from its first opaque pixel to its last. */
function opaqueRows(d: SpriteDef): { top: number; bottom: number } {
  let top = -1, bottom = -1;
  for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; }
  return { top, bottom };
}
const glowCount = (d: SpriteDef, y0 = 0, y1 = Infinity) => { let n = 0; if (!d.glow) return 0; for (let y = y0; y < Math.min(d.glow.h, y1); y++) for (let x = 0; x < d.glow.w; x++) if (d.glow.get(x, y) > 0) n++; return n; };

describe('The Lantern of Vell and the temple, drawn', () => {
  it('stand on the footprint\'s back corner, and the footprint\'s front corner is on the canvas', () => {
    for (const n of ['b_lantern', 'b_temple', 'b_temple_s1', 'b_temple_s2']) {
      const d = get(n);
      expect(d.ax).toBe(49);
      expect(d.p.w).toBe(98);
      expect(d.ay + 48).toBeLessThan(d.p.h); // the front ground corner
      expect(opaqueRows(d).bottom).toBeGreaterThanOrEqual(d.ay + 47);
    }
  });
  it('the temple grows from stage to stage', () => {
    const h = ['b_temple', 'b_temple_s1', 'b_temple_s2'].map((n) => { const d = get(n); return d.ay + 48 - opaqueRows(d).top; });
    expect(h[1]).toBeGreaterThan(h[0]);
    expect(h[2]).toBeGreaterThanOrEqual(h[1]);
  });
  it('the Lantern is the tallest 3×3 sprite, and its lantern room burns at night', () => {
    const lantern = get('b_lantern');
    const height = (d: SpriteDef) => d.ay + 48 - opaqueRows(d).top;
    for (const d of defs) if (d.name.startsWith('b_') && d.name !== 'b_lantern' && d.p.w === 98) expect(height(lantern)).toBeGreaterThan(height(d));
    const top = opaqueRows(lantern).top;
    expect(glowCount(lantern, top, top + 40)).toBeGreaterThan(40); // the crystal, the panes and the halo
    expect(glowCount(get('b_temple'))).toBeGreaterThan(10); // the rose window, the nave's windows and the lamps
  });
});

describe('The citizens, redrawn', () => {
  it('every citizen frame is 8×12 on its anchor (4, 12), and a variant\'s four frames differ', () => {
    for (let v = 0; v < 6; v++) {
      const frames = [0, 1, 2, 3].map((f) => get(`cit_${v}_${f}`));
      for (const d of frames) { expect([d.p.w, d.p.h, d.ax, d.ay]).toEqual([8, 12, 4, 12]); }
      const keys = new Set(frames.map((d) => Array.from(d.p.data).join(',')));
      expect(keys.size).toBe(4);
    }
  });
  it('the Tallowkin keep their candle eyes on the glow layer; the Grimmen their bone helm', () => {
    expect(glowCount(get('cit_5_0'))).toBe(2);
    const g = get('cit_4_0');
    let bone = 0;
    for (let x = 0; x < 8; x++) if (g.p.get(x, 0) > 0 && hex(g, x, 0) === PAL.bone) bone++;
    expect(bone).toBeGreaterThanOrEqual(3);
  });
});

describe('Closed by the outline', () => {
  it('no opaque pixel of a drawn sprite touches transparency except through an outline pixel', () => {
    const outline = PAL.outline;
    for (const n of ['b_lantern', 'b_temple', 'b_temple_s1', 'b_temple_s2', 'cit_0_0', 'cit_3_2', 'cit_5_1']) {
      const d = get(n);
      for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) {
        if (d.p.get(x, y) === 0) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d.p.get(x + dx, y + dy) === 0 && x + dx >= 0 && y + dy >= 0 && x + dx < d.p.w && y + dy < d.p.h);
        if (edge) expect(hex(d, x, y)).toBe(outline);
      }
    }
  });
});

/** The sprites faced and fitted: every building painting was judged over its footprint diamond, beside its mirror; the fit
 *  rules that survey settled are held here. */
const buildings = sources.filter((e) => (e.kind ?? 'building') === 'building' && e.w && e.h && !e.off); // the paintings switched off in iteration 79 are not in the atlas

describe('The painted buildings fitted to their tiles', () => {
  it("the Founding Stake's halls grow: the three tall halls never shrink, and the wide brick hall of stage 2 fills its diamond's width", () => {
    const h = [0, 1, 2, 3].map((k) => manifest[`b_stake_s${k}`].h);
    expect(h[1]).toBeGreaterThanOrEqual(h[0]);
    expect(h[3]).toBeGreaterThanOrEqual(h[1]);
    // stage 2 is a low, wide painting (a brick hall on its lawn): scaled to its 2×2 diamond's width it stands 50 tall, from 42
    expect(manifest.b_stake_s2.w).toBeGreaterThanOrEqual(62);
    expect(h[2]).toBeGreaterThanOrEqual(50);
  });
  it('no painted building spills far past its footprint', () => {
    for (const e of buildings) {
      const m = manifest[e.name];
      expect(m, e.name).toBeDefined();
      expect(m.w, `${e.name} is ${m.w} wide on a ${(e.w! + e.h!) * 16} diamond`).toBeLessThanOrEqual((e.w! + e.h!) * 16 + 8);
    }
  });
  it('every building painting has been judged by eye, and the heroes stand centred on their tiles', () => {
    for (const e of buildings) expect(e.checked, `${e.name} unchecked`).toBe(true);
    for (const e of buildings) if (e.name.startsWith('b_')) {
      const m = manifest[e.name];
      // the centre anchor: the sprite's middle over the footprint's centre line (centreAnchor in scripts/lib/sprite.mjs)
      expect(m.ax, `${e.name} anchor`).toBe(Math.round(m.w / 2) - (e.w! - e.h!) * 8 + (e.shift?.x ?? 0));
      expect(m.ay, `${e.name} base`).toBe(m.h - 1 - (e.w! + e.h!) * 8 + (e.shift?.y ?? 0)); // a small object may be shifted up into its tile's middle (iteration 78)
    }
  });
});

/** The scale of things: the citizen (12 px) is the yardstick for the small buildings. Objects a person reaches over stand at
 *  most 1.5 citizens; posts and small shrines 2.3; sheds, works and cottages 2.7; the halls 5.5. The painted heights come from
 *  the manifest, the drawn ones from the sprites themselves. */
const CITIZEN = 12;
/** A sprite's opaque height: the painted ones from the manifest (the atlas draws the painting over the drawn twin), the rest drawn. */
function paintedHeight(name: string): number {
  const m = manifest[name];
  if (m) return m.h;
  const d = by.get(name);
  if (!d) throw new Error(`no sprite ${name}`);
  let top = -1, bottom = -1;
  for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; }
  return bottom - top + 1;
}
const folk = (name: string) => paintedHeight(name) / CITIZEN;

describe('The scale of things: the small buildings against a citizen', () => {
  it('a citizen is still 8×12', () => {
    const d = by.get('cit_0_0') as SpriteDef;
    expect([d.p.w, d.p.h, d.ax, d.ay]).toEqual([8, 12, 4, 12]);
  });
  it('objects a person reaches over stand at most 1.5 citizens: the well', () => {
    for (const n of ['b_well']) expect(folk(n), n).toBeLessThanOrEqual(1.5);
  });
  it('posts and small shrines at most 2.5: the ward lantern, the shrine', () => {
    for (const n of ['b_wardlantern', 'b_shrine']) expect(folk(n), n).toBeLessThanOrEqual(2.5);
  });
  it('sheds, works and level-1 houses at most 2.8', () => {
    for (const n of ['b_healer', 'hearth_l1_v0', 'craft_l1_v0']) expect(folk(n), n).toBeLessThanOrEqual(2.8);
    for (const zone of ['hearth', 'craft', 'market', 'arcane']) for (const v of [0, 1, 2, 3]) for (const p of PEOPLES) {
      const n = `${zone}_l1_v${v}${p}`;
      expect(folk(n), n).toBeLessThanOrEqual(2.8);
    }
  });
  it('the academy is a hall of 5.5 citizens at most, like the other 2×2 halls', () => {
    expect(folk('b_academy')).toBeLessThanOrEqual(5.5);
  });
  it('the towers keep their height: the spire, the watchpost', () => {
    expect(folk('b_spire')).toBeGreaterThan(4);
    expect(folk('b_watchpost')).toBeGreaterThanOrEqual(3); // 36 opaque rows
  });
  it('a small object stands in the middle of its tile, not at its front corner (the wells, drawn in code since iteration 79: the anchor ten rows above the last row)', () => {
    for (const n of ['b_well']) {
      const d = by.get(n) as SpriteDef;
      expect(d.ay, n).toBe(d.p.h - 1 - 10);
    }
    // the drawn ones keep the footprint anchor: the sprite's last row is the diamond's bottom
    for (const n of ['b_wardlantern', 'b_shrine', 'b_healer', 'hearth_l1_v0', 'market_l1_v0']) {
      const d = by.get(n) as SpriteDef;
      expect([d.p.h - 1, d.p.h], n).toContain(d.ay + 16); // drawBuilding ends on the last row; the hand-drawn lantern one past it, as it always did
    }
  });
});

/** The paintings redrawn in code, part 1: the wells, the four level-2 hearths, the four level-1 craft houses and the depot
 *  are drawn by the procedural painter after their paintings; the paintings are switched off (`off: true`) and no longer in
 *  the manifest. The redraws keep the citizen yardstick. */
const REDRAWN = ['b_well', 'b_depot', // the Seep and the Tide-Well are parked with their peoples (scope reset)
  'hearth_l2_v0', 'hearth_l2_v1', 'hearth_l2_v2', 'hearth_l2_v3', 'craft_l1_v0', 'craft_l1_v1', 'craft_l1_v2', 'craft_l1_v3'];
const has = (d: SpriteDef, colour: string) => { for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0 && hex(d, x, y) === colour) return true; return false; };

describe('The paintings redrawn in code, part 1', () => {
  it('the twelve paintings are off: their entries say so, and the manifest no longer carries them', () => {
    for (const n of REDRAWN) {
      expect(sources.find((e) => e.name === n)?.off, n).toBe(true);
      if (n.startsWith('b_')) expect(manifest[n], n).toBeUndefined(); // the zone houses carry the user's eda-lore houses since iteration 82
    }
    expect(sources.filter((e) => e.off).length).toBe(35); // 37 before the scope reset parked the Seep's and the Tide-Well's; since iteration 82 the sixteen older zone paintings too, since 83 the eight recoloured tree paintings (glimwood, gloam trees) and the shore's repeat of a grass tile
  });
  it('the redraws keep the citizen yardstick: the wells 1.5, the crafts 2.8, the hearths 4, the depot 5.5', () => {
    for (const n of ['b_well']) expect(opaqueHeight(get(n)) / 12, n).toBeLessThanOrEqual(1.5);
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`craft_l1_v${v}`)) / 12).toBeLessThanOrEqual(2.8);
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`hearth_l2_v${v}`)) / 12).toBeLessThanOrEqual(4);
    expect(opaqueHeight(get('b_depot')) / 12).toBeLessThanOrEqual(5.5);
  });
  it('a well stands in the middle of its tile: its anchor ten rows above its last row', () => {
    for (const n of ['b_well']) { const d = get(n); expect(d.ay, n).toBe(d.p.h - 1 - 10); expect(d.ax).toBe(17); }
  });
  it("the paintings' materials are on the redraws: brick on the plank house's chimney, the log cabins' seams", () => {
    expect(has(get('hearth_l2_v0'), PAL.brick1)).toBe(true); // the plank house's brick chimney (the depot's is stone since iteration 81, as its painting has)
    const cabin = get('hearth_l2_v1');
    // a seam under every third log row on the left face: at least three outline-tinted rows below the eaves on one column
    let seams = 0;
    for (let y = 0; y < cabin.p.h; y++) if (cabin.p.get(8, y) > 0 && hex(cabin, 8, y) !== PAL.wood1 && hex(cabin, 8, y) !== PAL.outline) seams++;
    expect(seams).toBeGreaterThanOrEqual(3);
  });
  it('every zone sprite still exists, with the redrawn hearths and crafts among them', () => {
    for (const p of ['']) for (const z of ['hearth', 'craft', 'market', 'arcane']) for (const l of [1, 2, 3]) for (const v of [0, 1, 2, 3]) expect(by.has(`${z}_l${l}_v${v}${p}`), `${z}_l${l}_v${v}${p}`).toBe(true);
  });
});

/** The twelve redrawn again, each after its own painting: the level-2 hearths, the level-1 crafts and the depot are composed
 *  by hand in src/render/painted.ts (boxes, gables along either axis, porches, verandas, dormers, chimneys and props where the
 *  painting has them), not built from one spec; the citizen yardstick holds; the outline closes them. */
const hexOf = (d: { p: { w: number; data: Uint8ClampedArray } }, x: number, y: number) => { const i = (y * d.p.w + x) * 4; return '#' + [0, 1, 2].map((k) => d.p.data[i + k].toString(16).padStart(2, '0')).join(''); };
const colourCount = (d: { p: { w: number; h: number; data: Uint8ClampedArray; get: (x: number, y: number) => number } }, colour: string) => { let n = 0; for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0 && hexOf(d, x, y) === colour) n++; return n; };

describe('The twelve redrawn by hand after their paintings', () => {
  it('the atlas draws the hand-drawn houses', () => {
    expect(get('hearth_l2_v0').p.h).toBe(drawHearthL2v0().p.h);
    expect(get('craft_l1_v2').p.h).toBe(drawCraftL1v2().p.h);
    expect(get('b_depot').p.w).toBe(66);
  });
  it('the four hearths differ in composition: their heights, roof colours and chimney kinds are not all alike', () => {
    const hs = [0, 1, 2, 3].map((v) => opaqueHeight(get(`hearth_l2_v${v}`)));
    expect(new Set(hs).size).toBeGreaterThanOrEqual(3);
    expect(colourCount(drawHearthL2v0(), PAL.brick1)).toBeGreaterThan(0); // the brick chimney
    expect(colourCount(drawHearthL2v1(), PAL.brick1)).toBe(0); // the stone chimney
    expect(colourCount(drawHearthL2v2(), PAL.tile1)).toBeGreaterThan(20); // the red tile roof
    expect(colourCount(drawHearthL2v3(), PAL.tile1)).toBe(0); // the dark shingle roof
  });
  it('the yardstick holds: the hearths under 4 citizens, the crafts under 2.8, the depot under 5.5', () => {
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`hearth_l2_v${v}`)) / 12).toBeLessThanOrEqual(4);
    for (const v of [0, 1, 2, 3]) expect(opaqueHeight(get(`craft_l1_v${v}`)) / 12).toBeLessThanOrEqual(2.8);
    expect(opaqueHeight(get('b_depot')) / 12).toBeLessThanOrEqual(5.5);
  });
  it("the paintings' named parts are there: the workshop's parchment sign, the green roof, the depot's two roof colours and its striped awnings", () => {
    expect(colourCount(drawCraftL1v0(), PAL.parchment)).toBeGreaterThan(0);
    expect(colourCount(drawCraftL1v2(), PAL.green1)).toBeGreaterThan(20);
    const depot = drawDepot();
    expect(colourCount(depot, PAL.slate1)).toBeGreaterThan(8);
    expect(colourCount(depot, PAL.tile1)).toBeGreaterThan(20);
    expect(colourCount(depot, PAL.cloth2)).toBeGreaterThan(4);
    expect(colourCount(depot, PAL.cloth3)).toBeGreaterThan(4);
  });
  it('the anchor is the tile\'s top corner, as drawBuilding\'s: 17 across, 17 rows above the last for a 1×1', () => {
    for (const n of ['hearth_l2_v0', 'hearth_l2_v1', 'craft_l1_v0', 'craft_l1_v3']) { const d = get(n); expect(d.ax).toBe(17); expect(d.ay).toBe(d.p.h - 17); }
    const depot = get('b_depot'); expect(depot.ax).toBe(33); expect(depot.ay).toBe(depot.p.h - 33);
  });
  it('the outline closes every hand-drawn sprite', () => {
    for (const n of ['hearth_l2_v0', 'hearth_l2_v1', 'hearth_l2_v2', 'hearth_l2_v3', 'craft_l1_v0', 'craft_l1_v1', 'craft_l1_v2', 'craft_l1_v3', 'b_depot']) {
      const d = get(n);
      for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) {
        if (d.p.get(x, y) === 0) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < d.p.w && y + dy < d.p.h && d.p.get(x + dx, y + dy) === 0);
        if (edge) expect(hexOf(d, x, y), `${n} at ${x},${y}`).toBe(PAL.outline);
      }
    }
  });
});

/** The eda-lore swap, batch 1: the zone houses are the user's own houses from eda-lore. Each slot (zone × level × variant;
 *  the Vellish only since the scope reset) holds a painting no other slot holds, or, where the sheets ran short, keeps its
 *  people's drawn house: no painting is repeated (the user's rule). The houses fit their 1×1 tile and the citizen yardstick. */
const ZONES = ['hearth', 'craft', 'market', 'arcane'];
const ZONE = /^(hearth|craft|market|arcane)_l(\d)_v\d(_\w+)?$/;
const houses = liveSources.filter((e) => ZONE.test(e.name));
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

/** The eda-lore swap, batch 2: every other compatible painting of the user's eda-lore repository. Buildings take looks
 *  (b_<key>_v0..N-1), one per building chosen by its tile; the props pool by prefix; no painting is used twice. */
const batch2 = liveSources.filter((e) => e.set === 'eda-lore-2');
const count = (p: string) => { let n = 0; while (manifest[`${p}${n}`]) n++; return n; };

describe('The eda-lore swap, batch 2: every compatible asset', () => {
  it('no painting fills two names anywhere in the set (the user\'s rule), across both batches and the earlier imports', () => {
    // a dragon's stage 1 and stage 2 are one animal at two ages (iteration 50), not a repeat
    const keys = liveSources.filter((e) => e.kind !== 'vehicle' && !(e as { flap?: unknown }).flap && !/^dragon_\d_2_0$/.test(e.name)).map((e) => `${e.src}#${e.island ?? ''}#${(e.rect ?? []).join(',')}`);
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
    expect(looks.length).toBeGreaterThan(75); // over 130 before the scope reset parked the peoples' looks, 116 after, 105 after the creature buildings (phase 1b), 96 after 1c-1, 81 after 1c-2
    for (const n of looks) {
      const [, key, v] = /^b_(\w+)_v(\d+)$/.exec(n)!;
      expect(BUILDING_BY_KEY[key], n).toBeTruthy();
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
    expect(batch2.filter((e) => e.flip).map((e) => e.name).sort()).toEqual(["b_healer_v0","b_lantern_v0","b_ossuary_v5","b_shrine_v0","b_shrine_v1","b_shrine_v10","b_shrine_v3","b_shrine_v5","b_shrine_v6","b_shrine_v7","b_shrine_v8","b_shrine_v9","b_spire_v1"]);
  });
});

/** The sprite sheets (the slow first load): the imported sprites ship packed in a few sheets (`npm run art` writes them),
 *  and the atlas loads the sheets at once instead of a thousand single files one after another. The sheets hold every sprite
 *  pixel for pixel; a sheet that fails, or a manifest without sheets, falls back to the single files, 24 at a time, and either
 *  way the atlas ends up with the same rects. */
const importManifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')) as ImportManifest;
const entries = Object.entries(importManifest.sprites);
const sheets = importManifest.sheets ?? [];
type Img = { w: number; h: number; data: Uint8ClampedArray };
const decoded = new Map<string, Img>();
const png = (file: string): Img => { if (!decoded.has(file)) decoded.set(file, decodePng(readFileSync(`public/art/${file}`)) as Img); return decoded.get(file)!; };
/** A sprite's own PNG, which `npm run art` writes under art/build (not committed, not shipped: scope reset phase 1d); null without it. */
const single = (file: string): Img | null => (existsSync(`art/build/${file}`) ? (decodePng(readFileSync(`art/build/${file}`)) as Img) : null);

/** The rect of `sheet` at (x, y), w × h, equals `img` in every byte. */
function same(sheet: Img, x: number, y: number, img: Img): boolean {
  for (let r = 0; r < img.h; r++) {
    const a = sheet.data.subarray(((y + r) * sheet.w + x) * 4, ((y + r) * sheet.w + x + img.w) * 4);
    const b = img.data.subarray(r * img.w * 4, (r + 1) * img.w * 4);
    for (let k = 0; k < b.length; k++) if (a[k] !== b[k]) return false;
  }
  return true;
}

describe('The sprite sheets', () => {
  it('the importManifest lists one to four sheets, each at most 2048 × 2048, named by its content\'s hash', () => {
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    expect(sheets.length).toBeLessThanOrEqual(4);
    for (const s of sheets) {
      expect(existsSync(`public/art/${s.file}`)).toBe(true);
      const img = png(s.file);
      expect([img.w, img.h]).toEqual([s.w, s.h]);
      expect(s.w).toBeLessThanOrEqual(2048);
      expect(s.h).toBeLessThanOrEqual(2048);
      expect(s.hash).toBe(createHash('sha256').update(readFileSync(`public/art/${s.file}`)).digest('hex').slice(0, 12));
      expect(s.file).toBe(`sheets/sheet_${sheets.indexOf(s)}.${s.hash}.png`); // the name carries the hash: no host can serve an old sheet under it
    }
  });

  it('every sprite and glow sits inside its sheet, and matches its own PNG pixel for pixel where `npm run art` left one', () => {
    let glows = 0;
    for (const [name, e] of entries) {
      expect(e.sheet, name).toBeTypeOf('number');
      const sheet = png(sheets[e.sheet!].file);
      expect(e.sx! >= 0 && e.sy! >= 0 && e.sx! + e.w <= sheet.w && e.sy! + e.h <= sheet.h, name).toBe(true);
      const body = single(e.file);
      if (body) { expect([body.w, body.h], name).toEqual([e.w, e.h]); expect(same(sheet, e.sx!, e.sy!, body), name).toBe(true); }
      if (!e.glow) continue;
      glows++;
      const gs = png(sheets[e.gsheet!].file);
      expect(e.gx! >= 0 && e.gy! >= 0 && e.gx! + e.gw! <= gs.w && e.gy! + e.gh! <= gs.h, name).toBe(true);
      const glow = single(e.glow);
      if (glow) { expect([glow.w, glow.h], name).toEqual([e.gw, e.gh]); expect(same(gs, e.gx!, e.gy!, glow), name).toBe(true); }
    }
    expect(entries.length).toBeGreaterThan(550); // 834 before the scope reset parked the other peoples' looks (659 after, 589 after phase 1c-1)
    expect(glows).toBeGreaterThan(100);
  });

  it('entries that share a file (aliases, hop frames) share one place in the sheet', () => {
    const at = new Map<string, string>();
    for (const [, e] of entries) {
      const here = `${e.sheet}:${e.sx}:${e.sy}`;
      if (at.has(e.file)) expect(here).toBe(at.get(e.file));
      else at.set(e.file, here);
    }
    const places = new Set(at.values());
    expect(places.size).toBe(at.size); // no two files packed on top of each other
  });

  it('packSheets keeps items apart, starts a new sheet when one is full, and refuses an item larger than a sheet', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ w: 30 + (i % 7) * 9, h: 20 + (i % 5) * 11 }));
    const { pos, sheets: out } = packSheets(items, 200, 150);
    expect(out.length).toBeGreaterThan(1);
    for (let i = 0; i < items.length; i++) {
      const a = { ...pos[i], ...items[i] };
      expect(a.x + a.w <= 200 && a.y + a.h <= out[a.sheet].h && out[a.sheet].h <= 150).toBe(true);
      for (let j = i + 1; j < items.length; j++) {
        const b = { ...pos[j], ...items[j] };
        const overlap = a.sheet === b.sheet && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
    expect(() => packSheets([{ w: 300, h: 10 }], 200, 150)).toThrow();
  });
});

// A stand-in for the browser: fetch serves the importManifest, Image "loads" a file after a tick (or fails), a canvas records draws.
type Draw = { src: string; sx: number; sy: number; w: number; h: number; dx: number; dy: number };
const g = globalThis as Record<string, unknown>;
const saved = { fetch: g.fetch, Image: g.Image, document: g.document };
afterEach(() => Object.assign(g, saved));

function browser(serve: ImportManifest, fail: (url: string) => boolean) {
  const requested: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const draws: Draw[] = [];
  g.fetch = async () => ({ ok: true, json: async () => serve });
  g.Image = class {
    onload: () => void = () => {};
    onerror: () => void = () => {};
    width = 0;
    height = 0;
    url = '';
    set src(url: string) {
      this.url = url;
      requested.push(url);
      peak = Math.max(peak, ++inFlight);
      setTimeout(() => {
        inFlight--;
        const file = url.replace(/^\/?art\//, '').replace(/\?v=\w+$/, '');
        if (fail(url) || !existsSync(`public/art/${file}`)) { this.onerror(); return; }
        const size = png(file); // the file's own size, so the atlas's size check meets what a browser would decode
        this.width = size.w;
        this.height = size.h;
        this.onload();
      }, 0);
    }
  };
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: true,
        drawImage: (src: { url?: string }, sx: number, sy: number, w?: number, h?: number, dx?: number, dy?: number) => {
          if (w === undefined) return; // the old atlas drawn under the new
          draws.push({ src: src.url ?? '', sx, sy, w, h: h!, dx: dx!, dy: dy! });
        },
      }),
    }),
  };
  return { requested, draws, peak: () => peak };
}

const DRAWN = { x: 1, y: 2, w: 3, h: 4, ax: 1, ay: 3 }; // a drawn sprite of every imported name, under the merge

async function merge(serve: ImportManifest, fail: (url: string) => boolean = () => false) {
  const b = browser(serve, fail);
  const atlas = new SpriteAtlas();
  atlas.image = { width: 1024, height: 400 } as unknown as HTMLCanvasElement;
  for (const [name] of entries) atlas.sprites[name] = { ...DRAWN };
  const progress: [number, number][] = [];
  const n = await atlas.mergeOverrides('/', (done, total) => progress.push([done, total]));
  return { ...b, atlas, n, progress };
}

describe('The atlas loads the sheets', () => {
  it('the build ships the sheets only: a failed sheet, a sheet of the wrong size or a manifest without sheets keeps the drawn sprites', async () => {
    for (const r of [await merge(importManifest, (url) => url.includes('sheets/')), await merge({ ...importManifest, sheets: sheets.map((s) => ({ ...s, h: s.h + 1 })) }), await merge({ sprites: importManifest.sprites })]) {
      expect(r.n).toBe(0);
      expect(r.requested.some((u) => u.includes('/sprites/'))).toBe(false);
      for (const [name] of entries) expect(r.atlas.sprites[name]).toEqual(DRAWN);
      expect(r.progress.at(-1)).toEqual([entries.length, entries.length]);
    }
  });
  it('an entry whose glow sheet fails keeps its drawn sprite; the others are still cut from their sheet', async () => {
    const two: ImportManifest = {
      sheets: [...sheets, { file: 'sheets/missing.png', w: 2048, h: 10, hash: 'f00' }],
      sprites: Object.fromEntries(entries.map(([name, e]) => [name, e.glow ? { ...e, gsheet: 1 } : e])),
    };
    const r = await merge(two);
    expect(r.n).toBe(entries.filter(([, e]) => !e.glow).length);
    for (const [name, e] of entries) if (e.glow) expect(r.atlas.sprites[name], name).toEqual(DRAWN);
  });

  it('with sheets it asks for the sheets only, by hash, and cuts every sprite from them', async () => {
    const r = await merge(importManifest);
    expect(r.requested).toEqual(sheets.map((s) => `/art/${s.file}`));
    expect(r.n).toBe(entries.length);
    expect(r.progress).toEqual([[entries.length, entries.length]]); // the sheets' sprites all at once
    const at = new Map(r.draws.map((d) => [`${d.dx},${d.dy}`, d]));
    const url = (n: number) => `/art/${sheets[n].file}`;
    for (const [name, e] of entries) {
      const rect = r.atlas.sprites[name];
      expect(at.get(`${rect.x},${rect.y}`), name).toEqual({ src: url(e.sheet!), sx: e.sx, sy: e.sy, w: e.w, h: e.h, dx: rect.x, dy: rect.y });
      expect(!!rect.glow, name).toBe(!!e.glow);
      if (e.glow) expect(at.get(`${rect.glow!.x},${rect.glow!.y}`), name).toEqual({ src: url(e.gsheet!), sx: e.gx, sy: e.gy, w: e.gw, h: e.gh, dx: rect.glow!.x, dy: rect.glow!.y });
      expect(r.atlas.imported.has(name)).toBe(true);
    }
    expect(r.draws.length).toBe(entries.length + entries.filter(([, e]) => e.glow).length);
  });

});

/** Trees by region (DESIGN §4.125): each forest tile draws the trees of the land it stands on: crystal and spirit trees only
 *  beside a ley node, willows only by water, spruces by the hills and in the cold, blossom and autumn in groves. */
const shippedNames = new Set(Object.keys(JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites));
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
        expect(shippedNames.has(a), a).toBe(true);
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

  it('no 20 × 20 block of forest is an even mix: one family leads it (a grove may take part of a block: over 30 % in the lead, where an even mix of the set would be 15 %)', () => {
    const cases: [string, GroveCtx][] = [['plain', plain], ['hills', { ...plain, hills: true }], ['wet', { ...plain, wet: true }], ['deep', { ...plain, deep: true }]];
    for (const [label, ctx] of cases)
      for (let by = 0; by < 100; by += 20) for (let bx = 0; bx < 100; bx += 20) {
        const fam: Record<string, number> = {};
        for (let y = by; y < by + 20; y++) for (let x = bx; x < bx + 20; x++) { const f = FAMILY(treeFor(ctx, x, y, 0, COUNTS)); fam[f] = (fam[f] ?? 0) + 1; }
        const lead = Math.max(...Object.values(fam)) / 400;
        expect(lead, `${label} ${bx},${by}`).toBeGreaterThan(0.3);
      }
  });

  it('a view lifts the night ambient toward daylight and leaves the day as it is', () => {
    expect(liftAmbient([58, 66, 120], 0)).toEqual([58, 66, 120]);
    expect(liftAmbient([58, 66, 120], 1)).toEqual([255, 255, 255]);
    const night = ambientFor(0);
    const lifted = liftAmbient(night, VIEW_LIFT);
    for (let c = 0; c < 3; c++) { expect(lifted[c]).toBeGreaterThan(night[c]); expect(lifted[c]).toBeLessThan(255); }
    expect(liftAmbient(ambientFor(0.5), VIEW_LIFT).every((v) => v >= 250)).toBe(true); // noon is white already
    expect(nightFactor(0)).toBeGreaterThan(0.9); // midnight keeps the full night pass in a view: the lights stay on
  });

  it('the procedural fallback set (four trees) still draws, and an empty glimwood pool draws no glimwood', () => {
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      expect(treeFor({ ...plain, wet: true }, x, y, 0, { tree: 4, autumn: 0, glimwood: 0 })).toMatch(/^tree_[0-3]$/);
      expect(treeFor({ ...plain, node: 1 }, x, y, 0, { tree: 4, autumn: 0, glimwood: 0 })).toMatch(/^tree_[0-3]$/);
    }
  });

  it('groveCtx reads the real map: it agrees with a brute-force look at the water, hills and forest around each tile', () => {
    const s = createGame(42, 'Groves');
    const n = s.nodes[0];
    expect(groveCtx(s, n.x, n.y).node).toBe(0);
    const seen = { wet: [0, 0], hills: [0, 0], deep: [0, 0] };
    for (let y = 10; y < MAP_H - 10; y += 2) for (let x = 10; x < MAP_W - 10; x += 2) {
      if (s.terrain[idx(x, y)] !== Terrain.Forest) continue;
      let wet = false, hills = false, forest = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const t = s.terrain[idx(x + dx, y + dy)];
        if (t === Terrain.Hills) hills = true;
        if (Math.abs(dx) <= WET_REACH && Math.abs(dy) <= WET_REACH && (t === Terrain.Water || t === Terrain.DeepWater)) wet = true;
        if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3 && t === Terrain.Forest) forest++;
      }
      const c = groveCtx(s, x, y);
      expect([c.wet, c.hills, c.deep]).toEqual([wet, hills, forest >= 36]);
      seen.wet[wet ? 1 : 0]++; seen.hills[hills ? 1 : 0]++; seen.deep[forest >= 36 ? 1 : 0]++;
    }
    for (const [k, [no, yes]] of Object.entries(seen)) { expect(no, `${k} false`).toBeGreaterThan(0); expect(yes, `${k} true`).toBeGreaterThan(0); }
  });
});
