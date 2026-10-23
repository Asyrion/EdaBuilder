/** The sprite list (scope reset phase 3-5, RESET_PLAN Phase 3 task 4): every sprite the game has, measured against the art
 *  bible (docs/ART_BIBLE.md), with a proposed status: ok, rework or new (and "replaced": drawn in code but covered by a
 *  painting of the same name, so never shown). Families (the numbered variants of one thing) are one row.
 *    npx tsx scripts/spriteList.ts   → docs/SPRITE_LIST.generated.md (the measured table, to be judged into
 *                                      docs/SPRITE_LIST.md by eye) and shots/spritelist_<area>.png, every sprite at 3×
 *                                      framed by its status (green ok, yellow rework, red new, grey replaced) */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodePng } from './lib/png.mjs';
import { readManifest, spriteImage } from './lib/sheet.mjs';
import { atlasPixels } from '../src/render/atlas';
import { generateSprites } from '../src/render/sprites';

type Img = { w: number; h: number; data: Uint8ClampedArray };
type Status = 'ok' | 'rework' | 'new' | 'replaced';
interface Sprite { name: string; family: string; area: string; source: 'painting' | 'code' | 'replaced'; img: Img; ax: number; ay: number }

const AREAS = ['zones', 'services', 'roads', 'terrain', 'plants', 'people', 'ui'] as const;
const AREA_NAME: Record<string, string> = { zones: 'Zones', services: 'Services and supply', roads: 'Roads', terrain: 'Terrain', plants: 'Trees and plants', people: 'Citizens, builders, carts, the restless', ui: 'Interface (icons, cursors, flames)' };
function areaOf(n: string): string {
  if (/^(hearth|market|craft|arcane)_l\d|^zone_|^ruin_/.test(n)) return 'zones';
  if (/^b_/.test(n)) return 'services';
  if (/^road_/.test(n)) return 'roads';
  if (/^(grass|meadow|forest|hills|shore|ruins|gloam|water|deep|leynode|rock|tile_white)(_|$)/.test(n)) return 'terrain';
  if (/^(tree|bush|mushroom|glowcap|glimwood|gloamtree|deadtree)/.test(n)) return 'plants';
  if (/^(cit|builder|cart|restless)/.test(n)) return 'people';
  return 'ui';
}
/** The family a sprite belongs to: its name without the variant, frame, stage or mirror suffix. */
function familyOf(n: string): string {
  if (/^road_/.test(n)) return n.replace(/_\d+$/, '');
  if (/^cit_\d/.test(n)) return n.replace(/_\d+$/, ''); // cit_4 is one look, its frames the variants
  if (/^builder_\d/.test(n)) return 'builder';
  if (/^cartp_/.test(n)) return n.replace(/_\d+(_l)?$/, '').replace(/_l$/, '');
  return n.replace(/_l$/, '').replace(/_v\d+$/, '').replace(/_s\d+$/, '').replace(/_\d+$/, '');
}

// ---------- the sprites ----------
const manifest = readManifest('.');
if (!manifest) throw new Error('public/art/sprites.json is missing');
const imported = new Set(Object.keys(manifest.sprites));
const sprites: Sprite[] = [];
for (const d of generateSprites()) {
  const img = { w: d.p.w, h: d.p.h, data: atlasPixels(d, false) };
  sprites.push({ name: d.name, family: familyOf(d.name), area: areaOf(d.name), source: imported.has(d.name) ? 'replaced' : 'code', img, ax: d.ax, ay: d.ay });
}
const seen = new Set<string>();
for (const [name, e] of Object.entries(manifest.sprites)) {
  const key = `${e.sheet ?? 0}:${e.sx}:${e.sy}`;
  if (seen.has(key)) continue; // an alias or hop frame shares its source's pixels
  seen.add(key);
  const img = spriteImage('.', manifest, e) as Img | null;
  if (img) sprites.push({ name, family: familyOf(name), area: areaOf(name), source: 'painting', img, ax: e.ax, ay: e.ay });
}

// ---------- the bible's checks ----------
const INK = new Set([0x1a1420, 0x0e0a14]);
const rgbAt = (img: Img, i: number) => (img.data[i * 4] << 16) | (img.data[i * 4 + 1] << 8) | img.data[i * 4 + 2];
const lum = (img: Img, i: number) => 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2];
/** §3: the share of the edge pixels (opaque, beside a clear one or the frame) in ink. */
function outlineShare(img: Img): number {
  let edge = 0, ink = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = y * img.w + x;
    if (img.data[i * 4 + 3] < 128) continue;
    const clear = (xx: number, yy: number) => xx < 0 || yy < 0 || xx >= img.w || yy >= img.h || img.data[(yy * img.w + xx) * 4 + 3] < 128;
    if (!(clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1))) continue;
    edge++;
    if (INK.has(rgbAt(img, i))) ink++;
  }
  return edge ? ink / edge : 1;
}
/** §2: the mean lightness right of the anchor over the left of it (opaque, not ink); over 1 is lit from the right. */
function lightRatio(img: Img, ax: number): number {
  let l = 0, nl = 0, r = 0, nr = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = y * img.w + x;
    if (img.data[i * 4 + 3] < 128 || INK.has(rgbAt(img, i))) continue;
    if (x < ax) { l += lum(img, i); nl++; } else if (x > ax) { r += lum(img, i); nr++; }
  }
  return nl && nr ? r / nr / (l / nl) : 1;
}
function colours(img: Img): number {
  const s = new Set<number>();
  for (let i = 0; i < img.w * img.h; i++) if (img.data[i * 4 + 3] >= 128) s.add(rgbAt(img, i));
  return s.size;
}
/** The opaque rows' span: a sprite's drawn height. */
function drawnHeight(img: Img): number {
  let top = -1, bottom = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] >= 128) { if (top < 0) top = y; bottom = y; break; }
  return top < 0 ? 0 : bottom - top + 1;
}

// ---------- the known points (RESET_PLAN §3 Phase 3 task 4, the logs) ----------
/** Under this right/left lightness a building is probably lit from the left (§2). Calibrated by eye on the sheets in phase 3-5:
 *  at 0.97 the procedural boxes, plainly lit from the right, failed (a roof slope across the anchor fools the halves); the
 *  material does too (white plaster left, brown timber right). Under 0.8 the eye agreed for the clearest (a mossy tower, a
 *  thatched cottage), so a row there says "to check by eye". */
const LEFT_LIT = Number(process.env.LEFT_LIT ?? 0.8);
const STILL_PROCEDURAL = ['b_watchhouse', 'b_veshari', 'b_temple', 'b_wardlantern', 'b_garden', 'b_square', 'b_font', 'b_mine'];
function known(f: string, source: string): { status: Status; why: string } | null {
  if (/^(water|deep)$/.test(f)) return { status: 'new', why: 'RESET_PLAN: water and deep water, four frames, procedural → new' };
  if (/^road_/.test(f)) return { status: 'rework', why: 'RESET_PLAN: roads, procedural, to rework (and bridges)' };
  if (STILL_PROCEDURAL.includes(f) && source !== 'painting') return { status: 'new', why: 'still drawn in code; a painting wanted (RESET_PLAN, HANDOFF)' };
  if (f === 'cit_4' || f === 'cit_5') return { status: 'rework', why: 'the Grimmen / Tallowkin look, rolled in a Vellish game: to strike from the roll (known issue)' };
  if (/^(bush|glimwood)$/.test(f) && source === 'painting') return { status: 'rework', why: 'the weakest on the palette (3-1: ΔE 0.04–0.06): two more steps, or repainted' };
  return null;
}

// ---------- the families ----------
interface Row { family: string; area: string; source: string; n: number; size: string; outline: [number, number]; light: [number, number]; cols: [number, number]; height: [number, number]; status: Status; why: string[]; members: Sprite[]; memberStatus: Status[] }
const rank: Record<Status, number> = { replaced: 0, ok: 1, rework: 2, new: 3 };
const groups = new Map<string, Sprite[]>();
for (const s of sprites) { const k = `${s.source === 'replaced' ? 'R:' : ''}${s.family}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
const rows: Row[] = [];
for (const [, list] of groups) {
  const s0 = list[0];
  // ground tiles, the zones' and the cursor's translucent tile marks, and the effects (a flame, a restless ghost: light, not
  // paint) take no outline (§3) and are not judged flat
  const ground = s0.area === 'terrain' || s0.area === 'roads' || /^(zone_|cursor|flame|restless)/.test(s0.family);
  const built = s0.area === 'zones' || s0.area === 'services';
  const why = new Set<string>();
  const memberStatus: Status[] = [];
  let leftLit = 0, lowest = 9, unlined = 0, lowestLine = 1;
  const o: number[] = [], l: number[] = [], c: number[] = [], hh: number[] = [];
  for (const s of list) {
    const os = outlineShare(s.img), lr = lightRatio(s.img, s.ax), cc = colours(s.img), h = drawnHeight(s.img);
    o.push(os); l.push(lr); c.push(cc); hh.push(h);
    let st: Status = 'ok';
    if (s.source === 'replaced') st = 'replaced';
    else {
      if (!ground && os < 0.7) { st = 'rework'; unlined++; lowestLine = Math.min(lowestLine, os); }
      if (built && lr < LEFT_LIT) { st = 'rework'; leftLit++; lowest = Math.min(lowest, lr); }
      if (!ground && s.img.w * s.img.h > 400 && cc < 6) { st = 'rework'; why.add(`flat: ${cc} colours`); }
      if (/^cit_|^builder/.test(s.family) && Math.abs(h - 12) > 2) { st = 'rework'; why.add(`${h} px tall, the yardstick is 12 (§1)`); }
    }
    memberStatus.push(st);
  }
  if (unlined) why.add(`outline: ${unlined} of ${list.length} under 70 % of the edge in ink, lowest ${Math.round(lowestLine * 100)} % (§3)`);
  if (leftLit) why.add(`probably lit from the left: ${leftLit} of ${list.length} under ${LEFT_LIT}, down to ${lowest.toFixed(2)} (§2; check by eye: the material can fool the number)`);
  const srcs = new Set(list.map((s) => s.source));
  const source = srcs.size > 1 ? `mixed (${list.filter((s) => s.source === 'painting').length} paintings)` : s0.source;
  const k = s0.source === 'replaced' ? null : known(s0.family, srcs.has('painting') ? 'painting' : s0.source);
  let status: Status = memberStatus.reduce((a, b) => (rank[b] > rank[a] ? b : a), memberStatus[0]);
  if (k) { if (rank[k.status] >= rank[status] || status === 'ok') status = k.status; why.add(k.why); }
  const mm = (a: number[]) => [Math.min(...a), Math.max(...a)] as [number, number];
  const ws = list.map((s) => s.img.w), hs = list.map((s) => s.img.h);
  const span = (a: number[]) => (Math.min(...a) === Math.max(...a) ? `${a[0]}` : `${Math.min(...a)}–${Math.max(...a)}`);
  rows.push({ family: s0.family, area: s0.area, source, n: list.length, size: `${span(ws)}×${span(hs)}`, outline: mm(o), light: mm(l), cols: mm(c), height: mm(hh), status, why: [...why], members: list, memberStatus });
}
// §1: a zone's houses rise from level 1 to 3 (the tallest of each level, the paintings that show)
for (const z of ['hearth', 'market', 'craft', 'arcane']) {
  const lv = [1, 2, 3].map((n) => rows.find((r) => r.family === `${z}_l${n}` && r.source !== 'replaced'));
  for (let n = 1; n < 3; n++) {
    const a = lv[n - 1], b = lv[n];
    if (a && b && b.height[1] < a.height[1]) { b.status = b.status === 'new' ? 'new' : 'rework'; b.why.push(`no taller than level ${n} (${b.height[1]} against ${a.height[1]} px; §1)`); }
  }
}
// every catalog building has a row (the test "every building has a sprite" holds the sprites themselves)
const catalog = JSON.parse(readFileSync('src/data/content/buildings.json', 'utf8')) as { key: string; category: string }[];
const missing = catalog.filter((b) => b.category !== 'zone' && !rows.some((r) => r.family === `b_${b.key}` && r.source !== 'replaced'));

// ---------- the table ----------
const pct = ([a, b]: [number, number]) => (Math.round(a * 100) === Math.round(b * 100) ? `${Math.round(a * 100)}` : `${Math.round(a * 100)}–${Math.round(b * 100)}`);
const r2 = ([a, b]: [number, number]) => (a.toFixed(2) === b.toFixed(2) ? a.toFixed(2) : `${a.toFixed(2)}–${b.toFixed(2)}`);
const rng = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);
const counts = (pred: (r: Row) => boolean) => { const m: Record<Status, number> = { ok: 0, rework: 0, new: 0, replaced: 0 }; for (const r of rows.filter(pred)) m[r.status] += r.n; return m; };
const all = counts(() => true);
const out: string[] = [];
out.push('# The sprite list, as measured', '', `Generated by \`npx tsx scripts/spriteList.ts\` (scope reset phase 3-5); the judged list is \`docs/SPRITE_LIST.md\`.`, '');
out.push(`${sprites.length} sprites in ${rows.length} families: ${all.ok} ok, ${all.rework} rework, ${all.new} new, ${all.replaced} replaced (drawn in code, covered by a painting).`, '');
out.push('Columns: **outline** = % of the edge pixels in ink (§3; ground tiles exempt); **light** = right half over left half in lightness (§2; under 0.97 is lit from the left; buildings only); **colours** = distinct colours; **height** = drawn rows.', '');
if (missing.length) out.push(`**Catalog buildings without a row:** ${missing.map((b) => b.key).join(', ')}.`, '');
for (const a of AREAS) {
  const list = rows.filter((r) => r.area === a).sort((p, q) => rank[q.status] - rank[p.status] || p.family.localeCompare(q.family));
  if (!list.length) continue;
  const c = counts((r) => r.area === a);
  out.push(`## ${AREA_NAME[a]}`, '', `${c.ok} ok, ${c.rework} rework, ${c.new} new, ${c.replaced} replaced.`, '');
  out.push('| Family | Source | n | Size | Outline % | Light | Colours | Height | Status | Why |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of list) out.push(`| \`${r.family}\` | ${r.source} | ${r.n} | ${r.size} | ${pct(r.outline)} | ${r2(r.light)} | ${rng(r.cols)} | ${rng(r.height)} | **${r.status}** | ${r.why.join('; ')} |`);
  out.push('');
}
writeFileSync('docs/SPRITE_LIST.generated.md', out.join('\n'));

// ---------- the sheets ----------
mkdirSync('shots', { recursive: true });
const FRAME: Record<Status, [number, number, number]> = { ok: [70, 200, 90], rework: [235, 190, 40], new: [230, 60, 60], replaced: [120, 120, 130] };
const S = 3, PAD = 6, MAXW = 1800, BG = [40, 36, 48];
for (const a of AREAS) {
  // each family's members, at most 8 of a big family, in the table's order
  const items: { img: Img; st: Status }[] = [];
  for (const r of rows.filter((x) => x.area === a).sort((p, q) => rank[q.status] - rank[p.status] || p.family.localeCompare(q.family))) {
    const step = Math.max(1, Math.ceil(r.members.length / 8));
    for (let k = 0; k < r.members.length; k += step) items.push({ img: r.members[k].img, st: r.status });
  }
  if (!items.length) continue;
  const pos: { x: number; y: number }[] = [];
  let x = PAD, y = PAD, shelf = 0, W = 0;
  for (const it of items) {
    const w = it.img.w * S + 4, h = it.img.h * S + 4;
    if (x + w + PAD > MAXW) { x = PAD; y += shelf + PAD; shelf = 0; }
    pos.push({ x, y }); x += w + PAD; shelf = Math.max(shelf, h); W = Math.max(W, x);
  }
  const H = y + shelf + PAD;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = BG[0]; data[i * 4 + 1] = BG[1]; data[i * 4 + 2] = BG[2]; data[i * 4 + 3] = 255; }
  items.forEach((it, k) => {
    const { x: x0, y: y0 } = pos[k], w = it.img.w * S + 4, h = it.img.h * S + 4, f = FRAME[it.st];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const o = ((y0 + yy) * W + x0 + xx) * 4;
      if (xx < 2 || yy < 2 || xx >= w - 2 || yy >= h - 2) { data[o] = f[0]; data[o + 1] = f[1]; data[o + 2] = f[2]; continue; }
      const s = (((yy - 2) / S | 0) * it.img.w + ((xx - 2) / S | 0)) * 4, al = it.img.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[o + c] = Math.round(it.img.data[s + c] * al + BG[c] * (1 - al));
    }
  });
  writeFileSync(`shots/spritelist_${a}.png`, encodePng({ w: W, h: H, data }));
}
console.log(`${sprites.length} sprites, ${rows.length} families: ${all.ok} ok, ${all.rework} rework, ${all.new} new, ${all.replaced} replaced${missing.length ? `; catalog buildings without a row: ${missing.map((b) => b.key).join(', ')}` : ''}`);
for (const a of AREAS) { const c = counts((r) => r.area === a); console.log(`  ${a.padEnd(9)} ok ${c.ok}, rework ${c.rework}, new ${c.new}, replaced ${c.replaced}`); }
