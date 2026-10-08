/* The dev board's art status (iteration 87, DESIGN 4.118): for every building, the sprites the game would show and where
   each comes from. Imported sprites come from public/art/sprites.json (the paintings through `npm run art`); procedural
   ones come from the painter (src/render/sprites.ts), rendered here to PNG files in the temp folder for the page. Also what
   the art pipeline holds: the art/sources.json entries, whether each is `checked`, and whether its painting is in
   inspirations/. Run by the board in a fresh process when the code or the art changes; prints one `ART_JSON {...}` line.
   Run by hand: npx tsx tools/devboard/art.ts <out dir> */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateSprites } from '../../src/render/sprites';
import { BUILDINGS } from '../../src/sim/catalog';
import { encodePng } from '../../scripts/lib/png.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const out = process.argv[2] ?? join(ROOT, 'shots/devboard-sprites');
mkdirSync(out, { recursive: true });

const imported = (JSON.parse(readFileSync(join(ROOT, 'public/art/sprites.json'), 'utf8')) as { sprites: Record<string, { file: string }> }).sprites;
const sources = (JSON.parse(readFileSync(join(ROOT, 'art/sources.json'), 'utf8')) as { sprites: { name: string; src: string; checked?: boolean; off?: boolean }[] }).sprites;
const drawn = new Set<string>();
for (const d of generateSprites()) {
  drawn.add(d.name);
  if (!/^(b_|hearth_|market_|craft_|arcane_)/.test(d.name) || /_glow$/.test(d.name)) continue;
  writeFileSync(join(out, `${d.name}.png`), encodePng({ w: d.p.w, h: d.p.h, data: new Uint8ClampedArray(d.p.data) }));
}

/** A building's looks: zone houses by level and variant, others their base sprite and its _vN variants. */
function looksOf(key: string, zone: boolean): string[] {
  const all = new Set([...drawn, ...Object.keys(imported)]);
  if (zone) return [1, 2, 3].flatMap((l) => [0, 1, 2, 3].map((v) => `${key}_l${l}_v${v}`)).filter((n) => all.has(n));
  const base = all.has(`b_${key}`) ? [`b_${key}`] : all.has(`b_${key}_0`) ? [`b_${key}_0`] : [];
  const vars = [...all].filter((n) => new RegExp(`^b_${key}_v\\d+$`).test(n)).sort((a, b) => Number(a.split('_v').pop()) - Number(b.split('_v').pop()));
  return [...base, ...vars];
}

const status: Record<string, unknown> = {};
for (const b of BUILDINGS) {
  const zone = b.category === 'zone';
  const looks = looksOf(b.key, zone);
  const entries = sources.filter((s) => looks.includes(s.name) || s.name === `b_${b.key}` || s.name.startsWith(`b_${b.key}_`) || (zone && s.name.startsWith(`${b.key}_l`)));
  status[b.key] = {
    looks: looks.map((n) => ({ name: n, from: imported[n] ? 'imported' : 'drawn', file: imported[n]?.file ?? null })),
    // tests/sprites.test.ts: every non-zone building needs a b_<key> (or b_<key>_0) sprite drawn in code
    drawnBase: zone || drawn.has(`b_${b.key}`) || drawn.has(`b_${b.key}_0`),
    sources: entries.map((s) => ({ name: s.name, src: s.src, checked: !!s.checked, off: !!s.off, painting: existsSync(join(ROOT, s.src)) })),
  };
}
console.log('ART_JSON ' + JSON.stringify({ out, buildings: status }));
