// Iteration 83 (the eda-lore swap, batch 2): every other compatible painting of the user's eda-lore repository, written into
// art/sources.json as entries with set: 'eda-lore-2' (a rerun replaces them), then `npm run art`.
//   node scripts/edaLoreAssets.mjs && npm run art
// The props pool by prefix (tree_, tree_autumn_, glimwood_, gloamtree_, bush_, mushroom_, glowcap_, the ground families),
// counted by the renderer at boot. A building takes its looks as b_<key>_v0..N-1, one chosen per building by its tile
// (lookName in src/render/atlas.ts); a building whose base was imported before keeps that painting as its v0 (an alias).
// A pick is `[sheet, island]` or `[sheet, island, { overrides }]`; a sheet cut from a grid takes `rect` instead of an island.
// No painting is used twice (the user's rule): tests/iteration83.test.ts holds every src+island pair to one name.
import { readFileSync, writeFileSync } from 'node:fs';

const E = 'inspirations/eda-lore/';
const FILE = 'art/sources.json';
const src = JSON.parse(readFileSync(FILE, 'utf8'));
const kept = src.sprites.filter((e) => e.set !== 'eda-lore-2');
const out = [];
const sheetOf = (s) => (s.includes('/') ? s : `${E}${s}.png`);
/** A grid sheet's cell, inset from the grid lines. */
const cell = (c, r, cw, ch, pad = 8) => ({ rect: [c * cw + pad, r * ch + pad, cw - 2 * pad, ch - 2 * pad] });
function pick(p) {
  const [s, at] = p;
  return { src: sheetOf(s), ...(typeof at === 'number' ? { island: at } : at ?? {}) };
}

// ---------- props ----------
function props(prefix, start, picks, base) {
  picks.forEach((p, k) => out.push({ name: `${prefix}${start + k}`, set: 'eda-lore-2', kind: 'prop', ...base, ...pick(p), ...(p[2] ?? {}), checked: true }));
}
const TREE = { targetHeight: 30, baseInset: 2, colors: 20, glow: false };
props('tree_', 12, [
  ['trees_12', 0], ['trees_12', 1, { targetHeight: 34 }], ['trees_12', 3], ['trees_12', 7], ['trees_12', 11],
  ['trees_12b', 0], ['trees_12b', 1, { targetHeight: 32 }], ['trees_12b', 2, { targetHeight: 34 }], ['trees_12b', 3], ['trees_12b', 4], ['trees_12b', 7, { targetHeight: 38 }],
  ['trees_16', 0], ['trees_16', 1, { targetHeight: 34 }], ['trees_16', 2], ['trees_16', 9], ['trees_16', 13, { targetHeight: 38 }],
  ['trees_8', 0], ['trees_8', 1, { targetHeight: 34 }], ['trees_8', 2], ['trees_8', 6],
], TREE);
props('tree_autumn_', 0, [['trees_12', 2], ['trees_12b', 6], ['trees_16', 4]], TREE);
props('glimwood_', 0, [
  ['trees_12', 4], ['trees_12', 8], ['trees_12b', 8], ['trees_12b', 11], ['trees_16', 3], ['trees_16', 6], ['trees_16', 10], ['trees_16', 11], ['trees_16', 14],
  ['inspirations/bushes/image_1(1).png', 3],
], { ...TREE, colors: 20, glow: { hue: 'any', minLum: 0.65, warm: 40, maxBlob: 12 } });
props('gloamtree_', 0, [['trees_12b', 9], ['trees_8', 5]], { ...TREE, targetHeight: 28, colors: 12, recolour: { hue: 160, sat: -0.05, light: -0.1 }, glow: { hue: 'any', minLum: 0.35, warm: 50 } });
// the dark bush recoloured as a dead tree read as a black blob: the drawn dead tree stays
// out.push({ name: 'deadtree', set: 'eda-lore-2', kind: 'prop', ...pick(['bushes_23', 13]), targetHeight: 18, baseInset: 1, colors: 16, glow: false, recolour: { hue: 0, sat: -0.5, light: -0.15 }, checked: true });

const BUSH = { targetHeight: 12, maxWidth: 20, baseInset: 1, colors: 16, glow: false };
const range = (a, b, skip = []) => Array.from({ length: b - a + 1 }, (_, k) => a + k).filter((i) => !skip.includes(i));
const B = 'inspirations/bushes/';
props('bush_', 6, [
  ...[2, 3, 7, 9, 12, 14, 15].map((i) => [`${B}image_0(1).png`, i]),
  ...range(0, 35, [8, 14, 9, 15, 21]).map((i) => [`${B}image_3.png`, i]),
  ...[0, 1, 2, 24, 25, 26, 27, 56, 58, 80, 81, 82, 83].map((i) => [`${B}image_0.png`, i]),
  ...[0, 2, 5, 6, 8].map((i) => [`${B}image_1(1).png`, i]),
  ...[1, 2, 3, 5, 7].map((i) => [`${B}image_2(1).png`, i]),
  ...range(0, 6).map((i) => [`${B}image_2.png`, i]),
  ...[0, 1, 2, 4, 5, 7].map((i) => [`${B}image_3(1).png`, i]),
  ...[0, 1, 2, 3, 4, 5, 6, 9, 10, 16, 17, 18, 20, 21].map((i) => ['bushes_23', i]),
  ...[0, 2, 5, 6, 7].map((i) => ['bushes_9', i]),
  ...[0, 2, 3, 4, 6, 8, 9, 10, 12].map((i) => ['bushes_grid_16', cell(i % 4, Math.floor(i / 4), 256, 256), { white: 215 }]),
], BUSH);

const M = 'inspirations/mushrooms/';
// a mushroom stands well below a citizen's knee-to-hip: 5 px, 7 with the outline, against the citizen's 12 (the user's word after iteration 84)
const MUSH = { targetHeight: 5, baseInset: 1, colors: 16, glow: false };
const GLOW = { ...MUSH, glow: { hue: 'any', minLum: 0.45, warm: 40, maxBlob: 30 } };
props('mushroom_', 3, [
  ...[0, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 16, 17, 23, 24, 31, 32, 33, 35, 36, 37, 40, 41, 44, 45, 53, 54, 56, 57, 58, 61, 65, 66, 68, 69, 70].map((i) => [`${M}image_0(1).png`, i]),
  ...[0, 5, 10, 14].map((i) => [`${M}image_0.png`, i]),
  ...[0, 1, 3, 4, 6, 7, 8, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 23].map((i) => [`${M}image_1(1).png`, i]),
  ...[0, 2, 7, 8, 9, 13].map((i) => [`${M}image_1.png`, i]),
  ...[0, 1, 2, 3, 4, 5, 7, 8, 9, 12, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((i) => [`${M}image_2(1).png`, i]),
  ...[0, 1, 4, 7, 10, 11, 13, 14].map((i) => [`${M}image_2.png`, i]),
  ...[0, 6, 7, 8].map((i) => [`${M}image_3.png`, i]),
  ...[15, 16, 18, 19, 21, 25, 26].map((i) => [`${M}image_3(1).png`, i]),
  ...[0, 2, 3].map((i) => ['mushrooms_grid_8', cell(i % 4, Math.floor(i / 4), 256, 512), { white: 200 }]),
  ['trees_16', 12],
], MUSH);
props('glowcap_', 3, [
  ...[1, 2, 10, 11, 12, 18, 19, 20, 22, 34, 42, 43, 47, 51, 55].map((i) => [`${M}image_0(1).png`, i]),
  ...[1, 13, 15].map((i) => [`${M}image_0.png`, i]),
  ...[2, 5, 9, 14, 15, 22].map((i) => [`${M}image_1(1).png`, i]),
  ...[1, 3, 4].map((i) => [`${M}image_1.png`, i]),
  ...[10, 11, 14, 15, 21, 22, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41].map((i) => [`${M}image_2(1).png`, i]),
  ...[2, 3, 5, 9, 12].map((i) => [`${M}image_2.png`, i]),
  ...[1, 3].map((i) => [`${M}image_3.png`, i]),
  ...[6, 17, 27].map((i) => [`${M}image_3(1).png`, i]),
  ...[1, 4, 5, 6].map((i) => ['mushrooms_grid_8', cell(i % 4, Math.floor(i / 4), 256, 512), { white: 200 }]),
], GLOW);

// the ground: a tile's top folded onto the diamond, matched in colour to its family (iteration 50's rule)
const G = 'inspirations/grass_tiles/';
function ground(family, start, picks, inset = 0.14) {
  picks.forEach((p, k) => out.push({ name: `${family}_${start + k}`, set: 'eda-lore-2', kind: 'ground', family, ...pick(p), inset, ...(p[2] ?? {}), colors: 20, glow: false, checked: true }));
}
// the flat squares fold onto the diamond; the isometric blocks (grass_tiles/image_0, grass_tiles_9, grass_tiles_16) give their top face
const ISO = { isoTop: { shrink: 0.18, y: 0.02 } };
ground('grass', 4, [[`${G}image_0.png`, 0, ISO], ['grass_tiles_9', 0, ISO], ['grass_tiles_9', 1, ISO]]);
ground('meadow', 3, [[`${G}image_0.png`, 1, ISO], [`${G}image_0.png`, 3, ISO], [`${G}image_0.png`, 9, ISO], ['grass_tiles_16', 0, ISO], [`${G}image_2.png`, 0], [`${G}image_2.png`, 6]]);
ground('forest', 3, [[`${G}image_0.png`, 7, ISO], [`${G}image_0.png`, 15, ISO], ['grass_tiles_16', 12, ISO], ['grass_tiles_16', 14, ISO]]);
ground('hills', 3, [[`${G}image_0.png`, 4, ISO], [`${G}image_0.png`, 5, ISO], [`${G}image_0.png`, 10, ISO], [`${G}image_0.png`, 14, ISO], ['grass_tiles_16', 3, ISO]]);
ground('shore', 1, [[`${G}image_0.png`, 11, ISO]]);
ground('ruins', 3, [[`${G}image_0.png`, 2, ISO], ['grass_tiles_16', 10, ISO], ['grass_tiles_9', 2, ISO], ['grass_tiles_9', 5, ISO]]);

// the creatures the game has and the sheets paint: one painting, a pixel's hop for the second frame (iteration 58's rule)
const A = 'inspirations/animals/';
out.push({ name: 'boar_0', set: 'eda-lore-2', kind: 'prop', ...pick([`${A}image_3(1).png`, 26]), targetHeight: 9, colors: 20, glow: false, hop: true, checked: true });
// the crystal ram reads as a purple blob at a goat's 11 px: it keeps the drawn sprite (the glimmoth, the tiger and the
// looks of the creature buildings are parked with their systems, scope reset phase 1b)
// out.push({ name: 'goat_0', set: 'eda-lore-2', kind: 'prop', ...pick([`${A}image_2(1).png`, 37]), targetHeight: 11, colors: 20, glow: false, hop: true, checked: true });

// ---------- buildings: looks ----------
const GLOWB = { minLum: 0.6, warm: 60, maxBlob: 10 };
/** h: the target height (the old sprite's, under the §4.109 caps); f: the footprint; picks may carry { flip: true }. */
function looks(key, f, h, picks, start = 0, extra = {}) {
  picks.forEach((p, k) => out.push({ name: `b_${key}_v${start + k}`, set: 'eda-lore-2', ...pick(p), w: f, h: f, targetHeight: h, maxWidth: f * 32 + 2, anchor: 'centre', colors: 24, sharpen: 0.8, glow: GLOWB, ...extra, ...(p[2] ?? {}), checked: true }));
}
const WELL = { shift: { x: 0, y: 6 } };
const F = { flip: true }; // fronted on the left: mirrored so the door faces the road side (iteration 59's rule)
looks('well', 1, 16, [
  ...range(0, 7).map((i) => ['wells_9', i]), ...[2, 3, 10].map((i) => ['wells_cut_15', i]), ...[0, 1, 2, 4].map((i) => ['wells_5', i]),
  ...range(0, 5).map((i) => ['wells_wood_6b', i]), ...[1, 3, 5, 7].map((i) => ['wells_stone_9', i]), ...[2, 4, 5].map((i) => ['wells_6', i]),
  ...[0, 1, 3, 5, 6, 7, 9, 10, 11].map((i) => ['wells_wood_12', i]),
], 0, WELL);
looks('shrine', 1, 28, [['shrines_12', 0, F], ['shrines_12', 2, F], ['shrines_12', 3], ['shrines_12', 4, F], ['shrines_12', 8], ['shrines_altars_12', 1, F], ['shrines_altars_12', 3, F], ['shrines_altars_12', 9, F], ['shrines_altars_12', 10, F], ['shrines_altars_12', 16, F], ['magic_buildings_8', 0, F]]);
const AL = 'inspirations/craft_houses/alchemists_house/';
looks('healer', 1, 31, [['shrines_altars_12', 6, F], ['shrines_altars_12', 14], [`${AL}image_1(1).png`], [`${AL}image_2(1).png`], [`${AL}image_3(2).png`]]);
looks('watchpost', 1, 36, [['light_towers_6', 51], ['hunters_lodges_7', 4]]);
looks('boneyard', 2, 49, [0, 1, 3, 4, 5, 7, 8, 9, 11, 12].map((i) => ['cemeteries_16', i]), 1);
looks('ossuary', 2, 58, [['cemeteries_16', 2], ['cemeteries_16', 6], ['cemeteries_16', 14], ['cemeteries_16', 10], ['inspirations/graveyards/image_2(1).png', undefined, F]], 1);
const TH = 'inspirations/trade_houses/';
looks('depot', 2, 62, [[`${TH}image_0(1).png`], [`${TH}image_2(1).png`], [`${TH}image_3(2).png`]]);
// a narrow painting on a 2×2 stands taller so it fills its diamond; the two thinnest spires are Ley Spires (1×1)
looks('academy', 2, 62, [['lantern_towers_7', 2]]);
looks('spire', 1, 47, [['magic_buildings_8', 54, F], ['lantern_towers_7', 4]], 1);
looks('lantern', 3, 140, [['light_towers_6', 2, F]]);
looks('grandacademy', 3, 85, [['lantern_towers_7', 6]]);

// a building whose base painting was imported before keeps it as its first look
const BASE_LOOKS = ['b_boneyard', 'b_ossuary', 'b_sextonchapel', 'b_spire'];
for (const e of kept) if (BASE_LOOKS.includes(e.name) && !e.off) e.aliases = [`${e.name}_v0`];
// the glowing caps of iteration 50 are their own pool now; the recoloured repeats of tree paintings give way (no painting twice)
for (const e of kept) {
  const m = /^mushroom_([345])$/.exec(e.name);
  if (m) e.name = `glowcap_${Number(m[1]) - 3}`;
  if (/^(mushroom|glowcap)_\d+$/.test(e.name) && !e.set) e.targetHeight = MUSH.targetHeight; // iteration 50's six, at the same size
  if (/^(glimwood|gloamtree)_\d$/.test(e.name) && !e.set) e.off = true;
  if (e.name === 'shore_1' && !e.set) e.off = true; // grass_3's tile again: the shore takes a tile of its own
}

src.sprites = [...kept, ...out];
writeFileSync(FILE, JSON.stringify(src, null, 1) + '\n');
console.log('batch-2 entries', out.length);
