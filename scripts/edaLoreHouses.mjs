// Iteration 82 (the eda-lore swap, batch 1): writes the zone houses' entries in art/sources.json from the allocation below.
//   node scripts/edaLoreHouses.mjs && npm run art
// Each slot (people → zone → level → four variants) names a sheet in inspirations/eda-lore (the letter, see SHEETS) and an
// island of it (node scripts/importSprites.mjs --islands <sheet> [white]); a trailing ! mirrors a house fronted on the left;
// '-' leaves the slot to its people's drawn house (no painting is used twice, the user's rule). The entries carry
// set: 'eda-lore-1', so a rerun replaces them; the older zone paintings are switched off.
import { readFileSync, writeFileSync } from 'node:fs';
const SHEETS = { A: 'houses_12', B: 'alchemy_towers_8', C: 'medieval_9', D: 'smithies_grey_10', E: 'houses_10', F: 'alchemy_labelled_8', G: 'houses_labelled_16', H: 'smithies_plated_4', I: 'lodges_labelled_16', J: 'houses_grey_16', K: 'alchemy_labelled_6', L: 'stone_houses_4', M: 'smithies_4', N: 'towers_16', O: 'lodges_labelled_12', P: 'plated_houses_4', Q: 'alchemy_labelled_6b', R: 'houses_4', S: 'smithies_labelled_12', T: 'wooden_houses_20', U: 'towers_8', V: 'shrines_16' };
const WHITE = { A: 200, D: 200, J: 200, R: 200 }; // the sheets with a light-grey drop shadow
const ALLOC = { // '-' = no painting of its own yet: the slot keeps its people's drawn house (no repeats, the user's rule)
  '': { // Vellish: the town, half-timber, tile and thatch, brick
    hearth: [['A2!', 'A3!', 'A0', 'A9!'], ['G1', 'P0', 'P2!', 'C8'], ['R3!', 'I2', 'E2', 'R2']],
    craft: [['S1', 'S55', 'D2', 'M5'], ['J15!', 'D4', 'M1', 'M6!'], ['H2', 'H3', 'D9', 'O130!']],
    market: [['C10', 'C4', 'G125', 'V3'], ['B2!', 'O2!', 'I70!', 'J0'], ['Q2', 'K64!', 'A6', 'I54!']],
    arcane: [['G58!', 'G59!', 'G60!', 'V9'], ['B9', 'K2', 'Q3', 'J14'], ['B1', 'F51!', 'K3', 'B8!']],
  },
  _grimmen: { // stone and slate, dug into the hill
    hearth: [['I119!', 'J5', 'G128!', 'P3!'], ['J13', 'R0', 'G127', 'G0!'], ['C5', 'I1', 'O3!', 'G126']],
    craft: [['D0!', 'D6', 'S0!', 'S53'], ['D5', 'D7', 'D3!', 'S3'], ['S2!', 'K63', 'B10', 'S54!']],
    market: [['V0!', 'V22!', 'V6', '-'], ['L1!', 'L3!', 'C7', 'F52!'], ['N2!', 'I3!', 'L0!', 'G3!']],
    arcane: [['V4!', '-', '-', '-'], ['Q1', 'S101!', '-', '-'], ['F2', 'N3', 'U0', '-']],
  },
  _veshari: { // plank, reed and log, by the water
    hearth: [['T0', 'A10', 'A11!', 'I52!'], ['T9', 'T13', 'T16', 'T11!'], ['T1!', 'I117', 'T7!', 'T8']],
    craft: [['S52', 'D1', 'M2', 'T4!'], ['D8!', 'I68', 'E8', 'J1'], ['T3!', 'H4!', 'O128!', 'T10']],
    market: [['I0', 'V1!', 'K65!', 'G2'], ['Q48!', 'I69!', 'T17', 'T15!'], ['T5', 'F53', 'T19!', 'T14']],
    arcane: [['G179!', 'I116!', 'O1!', 'V5'], ['B4', 'I53', 'O61!', 'T12'], ['F3', 'E3', 'I118', 'O60!']],
  },
  _tallowkin: { // tall and narrow, whitewash and plaster under cones, a lit window on every floor
    hearth: [['E4', 'E7', 'A8!', 'J2'], ['G182', 'G181', 'B7', 'E9'], ['N7', 'B3', 'I55!', 'T2']],
    craft: [['Q47!', 'H5', 'V8!', 'J3'], ['F1', 'U2!', 'N12!', 'F0'], ['K1', 'U1', 'N10!', '-']],
    market: [['V20!', 'V10', '-', '-'], ['N6', 'U5', 'F54!', 'N15'], ['U6', 'N4!', 'U7', 'C6']],
    arcane: [['V7', 'V2', 'R1', 'E10'], ['Q49', 'N5!', 'O59', 'O129!'], ['U3', 'T18!', '-', '-']],
  },
};
const FILE = 'art/sources.json';
const src = JSON.parse(readFileSync(FILE, 'utf8'));
const ZONE = /^(hearth|craft|market|arcane)_l\d_v\d(_\w+)?$/;
const kept = src.sprites.filter((e) => e.set !== 'eda-lore-1');
for (const e of kept) if (ZONE.test(e.name) && !e.off) e.off = true; // the older zone paintings give way (iteration 82)
const out = [];
const H = (p, z, l) => (l === 3 && (z === 'arcane' || p === '_tallowkin')) ? 56 : l === 3 ? 45 : l === 2 ? 40 : p === '_tallowkin' ? 36 : 31;
for (const [p, zs] of Object.entries(ALLOC)) for (const [z, lv] of Object.entries(zs)) lv.forEach((row, li) => {
  const l = li + 1; const ents = [];
  row.forEach((k, v) => {
    const name = `${z}_l${l}_v${v}${p}`;
    if (k === '-') return; // no repeats (the user's rule): a slot without a painting of its own keeps its people's drawn house
    const flip = k.endsWith('!'); const key = k.replace('!', ''); const sh = key[0]; const island = Number(key.slice(1));
    const e = { name, set: 'eda-lore-1', src: `inspirations/eda-lore/${SHEETS[sh]}.png`, island, ...(WHITE[sh] ? { white: WHITE[sh] } : {}), w: 1, h: 1, targetHeight: H(p, z, l), maxWidth: 34, anchor: 'centre', colors: 24, sharpen: 0.8, checked: true, glow: { minLum: 0.6, warm: 60, maxBlob: 10 }, ...(flip ? { flip: true } : {}) };
    ents.push(e);
  });
  out.push(...ents);
});
src.sprites = [...kept, ...out];
writeFileSync(FILE, JSON.stringify(src, null, 1) + '\n');
console.log('zone entries', out.length);
