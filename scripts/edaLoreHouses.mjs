// Iteration 82 (the eda-lore swap, batch 1): writes the zone houses' entries in art/sources.json from the allocation below.
//   node scripts/edaLoreHouses.mjs && npm run art
// Each slot (people → zone → level → four variants; the Vellish only since the scope reset) names a sheet in inspirations/eda-lore (the letter, see SHEETS) and an
// island of it (node scripts/importSprites.mjs --islands <sheet> [white]); a trailing ! mirrors a house fronted on the left;
// '-' leaves the slot to its people's drawn house (no painting is used twice, the user's rule). The entries carry
// set: 'eda-lore-1', so a rerun replaces them; the older zone paintings are switched off.
import { readFileSync, writeFileSync } from 'node:fs';
const SHEETS = { A: 'houses_12', B: 'alchemy_towers_8', C: 'medieval_9', D: 'smithies_grey_10', E: 'houses_10', F: 'alchemy_labelled_8', G: 'houses_labelled_16', H: 'smithies_plated_4', I: 'lodges_labelled_16', J: 'houses_grey_16', K: 'alchemy_labelled_6', L: 'stone_houses_4', M: 'smithies_4', N: 'towers_16', O: 'lodges_labelled_12', P: 'plated_houses_4', Q: 'alchemy_labelled_6b', R: 'houses_4', S: 'smithies_labelled_12', T: 'wooden_houses_20', U: 'towers_8', V: 'shrines_16', W: 'shrines_12', X: 'shrines_altars_12', Y: 'lantern_towers_7', Z: 'light_towers_6', a: 'magic_buildings_8' }; // W–a: iteration 83's sheets, for the twelve gaps
const WHITE = { A: 200, D: 200, J: 200, R: 200 }; // the sheets with a light-grey drop shadow
const ALLOC = { // '-' = no painting of its own yet: the slot keeps its people's drawn house (no repeats, the user's rule)
  '': { // Vellish: the town, half-timber, tile and thatch, brick
    hearth: [['A2!', 'A3!', 'A0', 'A9!'], ['G1', 'P0', 'P2!', 'C8'], ['R3!', 'I2', 'E2', 'R2']],
    craft: [['S1', 'S55', 'D2', 'M5'], ['J15!', 'D4', 'M1', 'M6!'], ['H2', 'H3', 'D9', 'O130!']],
    market: [['C10', 'C4', 'G125', 'V3'], ['B2!', 'O2!', 'I70!', 'J0'], ['Q2', 'K64!', 'A6', 'I54!']],
    arcane: [['G58!', 'G59!', 'G60!', 'V9'], ['B9', 'K2', 'Q3', 'J14'], ['B1', 'F51!', 'K3', 'B8!']],
  },
};
const FILE = 'art/sources.json';
const src = JSON.parse(readFileSync(FILE, 'utf8'));
const ZONE = /^(hearth|craft|market|arcane)_l\d_v\d(_\w+)?$/;
const kept = src.sprites.filter((e) => e.set !== 'eda-lore-1');
for (const e of kept) if (ZONE.test(e.name) && !e.off) e.off = true; // the older zone paintings give way (iteration 82)
const out = [];
const H = (p, z, l) => (l === 3 && z === 'arcane') ? 56 : l === 3 ? 45 : l === 2 ? 40 : 31;
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
