// The master palette (scope reset phase 3-1, docs/ART_BIBLE.md): measure the sheet's colours, derive ramps, and show in A/B
// sheets what snapping every sprite to the palette would do. Nothing here changes the game; phase 3-2 puts the palette to work.
//   node scripts/palette.mjs --measure        colour statistics of the sheet and of PAL
//   node scripts/palette.mjs --derive         writes art/palette.json: ramps derived from PAL's roles and the sheet's pixels
//   node scripts/palette.mjs --gaps           the sheet's colours the palette misses most (farther than ΔE 0.06), clustered
//   node scripts/palette.mjs --ab             shots/palette_ab.png: original · on the master palette · on PAL, 3×, per sprite
//   node scripts/palette.mjs --swatch         shots/palette_swatch.png: the ramps, and where each PAL colour lands
//   node scripts/palette.mjs --scene          shots/palette_scene_{before,after}.png: a town with the sheet as is and snapped
//                                             (needs `npx vite preview --port 4173`)
// --derive overwrites art/palette.json; once the palette is decided (ART_BIBLE.md) it is edited by hand and only read.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { decodePng, encodePng } from './lib/png.mjs';

const args = new Set(process.argv.slice(2));
mkdirSync('shots', { recursive: true });
const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8'));
const sheetFiles = Array.isArray(manifest.sheets) ? manifest.sheets : Object.values(manifest.sheets);
const sheets = sheetFiles.map((f) => decodePng(readFileSync(`public/art/${typeof f === 'string' ? f : f.file}`)));

// ---------- colour ----------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** sRGB 0..255 → OKLab. */
function oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const unlin = (c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/** The snap's distance: hue and chroma (a, b) count CHROMA times as much as lightness, so a deep red stays red rather than
 *  turning the brown of the same lightness (phase 3-1: the red barn and the grey-green roof of the A/B sheet). */
const CHROMA = Number([...args].find((a) => a.startsWith('--chroma='))?.slice(9) ?? 2);
const dSnap = (p, q) => Math.hypot(p[0] - q[0], CHROMA * (p[1] - q[1]), CHROMA * (p[2] - q[2]));
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------- PAL, read from the source so this script never drifts from it ----------
const PAL = Object.fromEntries([...readFileSync('src/render/palette.ts', 'utf8').matchAll(/^\s+(\w+): '(#[0-9a-fA-F]{6})'/gm)].map((m) => [m[1], m[2].toLowerCase()]));
/** UI tints, not art: they stay out of the sprite palette. */
const UI_ONLY = ['zoneHearth', 'zoneMarket', 'zoneCraft', 'zoneArcane'];

// ---------- the ramps: PAL's roles, and how many steps each gets ----------
const RAMPS = [
  { id: 'ink', steps: 2, roles: ['shadow', 'outline'], fixed: true },
  { id: 'grass', steps: 5, roles: ['grass1', 'grass2', 'grass3', 'meadow', 'meadow2', 'hillGrass', 'forestFloor', 'moss', 'green1', 'green2', 'cloth4'] },
  { id: 'foliage', steps: 4, roles: ['leaf1', 'leaf2', 'leaf3'] },
  { id: 'earth', steps: 5, roles: ['dirt1', 'dirt2', 'dirt3', 'sand', 'sand2', 'sod', 'sod2'] },
  { id: 'wood', steps: 4, roles: ['trunk', 'wood1', 'wood2', 'wood3', 'cartWood', 'copper2'] },
  { id: 'stone', steps: 5, roles: ['rock1', 'rock2', 'rock3', 'stone1', 'stone2', 'stone3', 'cobble1', 'cobble2', 'cobble3', 'lantern1', 'lantern2', 'smoke', 'ironDark'] },
  { id: 'plaster', steps: 4, roles: ['whitewash', 'whitewash2', 'plaster', 'plaster2', 'parchment', 'bone'] },
  { id: 'thatch', steps: 3, roles: ['thatch1', 'thatch2', 'gold', 'cloth5', 'flower1'] },
  { id: 'roofRed', steps: 4, roles: ['tile1', 'tile2', 'shingle1', 'shingle2', 'brick1', 'brick2', 'cloth2', 'banner', 'leafAutumn', 'copper'] },
  { id: 'roofSlate', steps: 3, roles: ['slate1', 'slate2', 'bluewash', 'bluewash2', 'cloth3'] },
  { id: 'roofGreen', steps: 3, roles: ['mossRoof', 'mossRoof2', 'copperRoof', 'copperRoof2', 'verdigris'] },
  { id: 'water', steps: 5, roles: ['water1', 'water2', 'water3', 'waterHi', 'mist'] },
  { id: 'ley', steps: 5, roles: ['ley1', 'ley2', 'ley3', 'leyGlow', 'leyStone', 'glass', 'glassGlow', 'glimleaf', 'restless'] },
  { id: 'light', steps: 5, roles: ['windowLit', 'lampWarm', 'ember', 'fire1', 'fire2', 'lanternLight', 'rune'] },
  { id: 'gloam', steps: 5, roles: ['windowDark', 'deepPurple', 'gloam1', 'gloam2', 'gloam3', 'gloamGrass', 'arcane1', 'arcane2', 'arcane3', 'cloth1'] },
  { id: 'accent', steps: 3, roles: ['flower2', 'crystalPink', 'flower3', 'skin', 'skinGrey', 'gloamEye', 'runeViolet', 'mushroom'] },
];

// ---------- the sheet's pixels, weighted (glow layers left out: they are light, not paint) ----------
function sheetPixels() {
  const counts = new Map();
  for (const sp of Object.values(manifest.sprites)) {
    const img = sheets[sp.sheet ?? 0];
    for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
      const o = ((sp.sy + y) * img.w + sp.sx + x) * 4;
      if (img.data[o + 3] < 128) continue;
      const k = (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts].map(([k, n]) => ({ rgb: [k >> 16, (k >> 8) & 255, k & 255], n }));
}

function measure() {
  const px = sheetPixels();
  const total = px.reduce((a, p) => a + p.n, 0);
  const palLab = Object.entries(PAL).filter(([k]) => !UI_ONLY.includes(k)).map(([k, h]) => [k, oklab(rgbOf(h))]);
  let on = 0, near = 0;
  const byRamp = new Map();
  for (const p of px) {
    const lab = oklab(p.rgb);
    let best = null, bd = 9;
    for (const [k, q] of palLab) { const d = dE(lab, q); if (d < bd) { bd = d; best = k; } }
    if (bd < 1e-6) on += p.n;
    if (bd < 0.03) near += p.n;
    const ramp = RAMPS.find((r) => r.roles.includes(best))?.id ?? '?';
    byRamp.set(ramp, (byRamp.get(ramp) ?? 0) + p.n);
  }
  console.log(`PAL: ${Object.keys(PAL).length} colours (${UI_ONLY.length} UI tints). The sheet: ${Object.keys(manifest.sprites).length} sprites, ${px.length} distinct colours, ${total} opaque pixels.`);
  console.log(`On PAL exactly: ${(100 * on / total).toFixed(1)} %; within ΔE 0.03 of PAL: ${(100 * near / total).toFixed(1)} %.`);
  console.log('Share of the sheet nearest to each ramp: ' + [...byRamp].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${(100 * n / total).toFixed(1)} %`).join(', '));
}

/** k-means in OKLab on weighted points, from the given seeds. */
function kmeans(points, seeds, iters = 25) {
  let cs = seeds.map((s) => s.slice());
  for (let it = 0; it < iters; it++) {
    const acc = cs.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let bi = 0, bd = 9;
      cs.forEach((c, i) => { const d = dE(p.lab, c); if (d < bd) { bd = d; bi = i; } });
      const a = acc[bi]; a[0] += p.lab[0] * p.w; a[1] += p.lab[1] * p.w; a[2] += p.lab[2] * p.w; a[3] += p.w;
    }
    cs = cs.map((c, i) => (acc[i][3] > 0 ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : c));
  }
  return cs;
}

function derive() {
  const px = sheetPixels();
  const total = px.reduce((a, p) => a + p.n, 0);
  const roleLab = Object.fromEntries(Object.entries(PAL).map(([k, h]) => [k, oklab(rgbOf(h))]));
  const members = new Map(RAMPS.map((r) => [r.id, []]));
  // each sheet colour joins the ramp of its nearest PAL role; each PAL role counts as much as 0.2 % of the sheet, so the
  // procedural sprites' colours keep a say where the paintings seldom go
  for (const p of px) {
    const lab = oklab(p.rgb);
    let best = null, bd = 9;
    for (const r of RAMPS) for (const k of r.roles) { const d = dE(lab, roleLab[k]); if (d < bd) { bd = d; best = r.id; } }
    members.get(best).push({ lab, w: p.n });
  }
  for (const r of RAMPS) for (const k of r.roles) members.get(r.id).push({ lab: roleLab[k], w: total * 0.002 });
  const out = { note: 'The master palette (docs/ART_BIBLE.md). Each ramp runs dark to light. Derived by scripts/palette.mjs --derive, then decided by hand.', ramps: [] };
  for (const r of RAMPS) {
    let steps;
    if (r.fixed) steps = r.roles.map((k) => roleLab[k]);
    else {
      // seeds: the ramp's PAL roles at the quantiles of lightness
      const roles = r.roles.map((k) => roleLab[k]).sort((p, q) => p[0] - q[0]);
      const seeds = Array.from({ length: r.steps }, (_, i) => roles[Math.round((i * (roles.length - 1)) / Math.max(1, r.steps - 1))]);
      steps = kmeans(members.get(r.id), seeds);
    }
    steps.sort((p, q) => p[0] - q[0]);
    // near twins merge (ΔE < 0.025): a ramp keeps steps a viewer can tell apart
    const kept = [];
    for (const s of steps) if (!kept.some((k) => dE(k, s) < 0.025)) kept.push(s);
    out.ramps.push({ id: r.id, roles: r.roles, colors: kept.map((s) => hex(fromOklab(s))) });
  }
  const n = out.ramps.reduce((a, r) => a + r.colors.length, 0);
  out.count = n;
  writeFileSync('art/palette.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`art/palette.json: ${out.ramps.length} ramps, ${n} colours.`);
  for (const r of out.ramps) console.log(`  ${r.id.padEnd(10)} ${r.colors.join(' ')}`);
}

const master = () => {
  if (!existsSync('art/palette.json')) throw new Error('art/palette.json is missing: run --derive first');
  return JSON.parse(readFileSync('art/palette.json', 'utf8')).ramps.flatMap((r) => r.colors.map((h) => ({ h, rgb: rgbOf(h), lab: oklab(rgbOf(h)), ramp: r.id })));
};
const palList = () => Object.entries(PAL).filter(([k]) => !UI_ONLY.includes(k)).map(([k, h]) => ({ h, rgb: rgbOf(h), lab: oklab(rgbOf(h)), ramp: k }));

/** Snap an image's opaque pixels to the nearest colour of `pal` (OKLab, no dither); returns the image and its ΔE. */
function snap(img, pal) {
  const out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) };
  const memo = new Map();
  let sum = 0, n = 0, worst = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const o = i * 4;
    if (img.data[o + 3] === 0) continue;
    const k = (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2];
    let m = memo.get(k);
    if (!m) {
      const lab = oklab([img.data[o], img.data[o + 1], img.data[o + 2]]);
      let best = pal[0], bd = 9;
      for (const c of pal) { const d = dSnap(lab, c.lab); if (d < bd) { bd = d; best = c; } }
      m = { rgb: best.rgb, d: dE(lab, best.lab) };
      memo.set(k, m);
    }
    out.data[o] = m.rgb[0]; out.data[o + 1] = m.rgb[1]; out.data[o + 2] = m.rgb[2];
    sum += m.d; n++; worst = Math.max(worst, m.d);
  }
  return { img: out, mean: n ? sum / n : 0, worst };
}

function cut(sp) {
  const src = sheets[sp.sheet ?? 0];
  const img = { w: sp.w, h: sp.h, data: new Uint8ClampedArray(sp.w * sp.h * 4) };
  for (let y = 0; y < sp.h; y++) img.data.set(src.data.subarray(((sp.sy + y) * src.w + sp.sx) * 4, ((sp.sy + y) * src.w + sp.sx + sp.w) * 4), y * sp.w * 4);
  return img;
}
function blit(dst, img, x0, y0, scale, bg) {
  for (let y = 0; y < img.h * scale; y++) for (let x = 0; x < img.w * scale; x++) {
    const s = (((y / scale) | 0) * img.w + ((x / scale) | 0)) * 4, d = ((y0 + y) * dst.w + x0 + x) * 4;
    const a = img.data[s + 3] / 255;
    for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(img.data[s + c] * a + bg[c] * (1 - a));
    dst.data[d + 3] = 255;
  }
}
function canvas(w, h, bg) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { d.set(bg, i * 4); d[i * 4 + 3] = 255; } return { w, h, data: d }; }

/** The A/B sample: a sprite of every family the game shows most. */
function sample() {
  const keys = Object.keys(manifest.sprites);
  const first = (re) => keys.find((k) => re.test(k));
  const want = [];
  for (const z of ['hearth', 'market', 'craft', 'arcane']) for (const l of [1, 2, 3]) want.push(first(new RegExp(`^${z}_l${l}`)));
  for (const b of ['stake', 'spire', 'well', 'watchpost', 'healer', 'shrine', 'boneyard', 'ossuary', 'depot']) want.push(first(new RegExp(`^b_${b}`)));
  for (const t of ['grass_0', 'meadow_0', 'forest_0', 'hills_0', 'shore_0', 'tree_0', 'tree_5', 'tree_autumn', 'bush_0', 'mushroom_0', 'cartp_goods']) want.push(first(new RegExp(`^${t}`)));
  return [...new Set(want.filter(Boolean))];
}

/** The colours the palette misses: the sheet's pixels farther than ΔE 0.06 from it, clustered (k = 8), by weight. */
function gaps() {
  const M = master();
  const far = [];
  for (const p of sheetPixels()) {
    const lab = oklab(p.rgb);
    let bd = 9;
    for (const c of M) bd = Math.min(bd, dE(lab, c.lab));
    if (bd > 0.06) far.push({ lab, w: p.n, d: bd });
  }
  const tot = far.reduce((a, p) => a + p.w, 0);
  far.sort((a, b) => b.w - a.w);
  const cs = kmeans(far, far.slice(0, 8).map((p) => p.lab));
  const weight = cs.map(() => 0);
  for (const p of far) { let bi = 0, bd = 9; cs.forEach((c, i) => { const d = dE(p.lab, c); if (d < bd) { bd = d; bi = i; } }); weight[bi] += p.w; }
  console.log(`Pixels farther than ΔE 0.06 from the master palette: ${tot}. Their clusters: ` + cs.map((c, i) => `${hex(fromOklab(c))} (${weight[i]})`).sort((a, b) => Number(b.match(/\((\d+)/)[1]) - Number(a.match(/\((\d+)/)[1])).join(', '));
}

function ab() {
  const M = master(), P = palList();
  const keys = sample();
  const S = 3, gap = 8, bg = [40, 36, 48];
  const rows = keys.map((k) => ({ k, sp: manifest.sprites[k], img: cut(manifest.sprites[k]) }));
  const colW = Math.max(...rows.map((r) => r.sp.w)) * S + gap;
  const half = Math.ceil(rows.length / 2);
  const rowH = (list) => list.reduce((a, r) => a + r.sp.h * S + gap, gap);
  const H = Math.max(rowH(rows.slice(0, half)), rowH(rows.slice(half)));
  const out = canvas(colW * 6 + gap * 3, H, bg);
  const report = [];
  rows.forEach((r, i) => {
    const side = i < half ? 0 : 1;
    const y = gap + rows.slice(side ? half : 0, i).reduce((a, q) => a + q.sp.h * S + gap, 0);
    const x0 = side * (colW * 3 + gap * 2) + gap;
    const m = snap(r.img, M), p = snap(r.img, P);
    blit(out, r.img, x0, y, S, bg);
    blit(out, m.img, x0 + colW, y, S, bg);
    blit(out, p.img, x0 + colW * 2, y, S, bg);
    report.push({ k: r.k, row: i + 1, master: m.mean, masterWorst: m.worst, pal: p.mean });
  });
  writeFileSync('shots/palette_ab.png', encodePng(out));
  // the whole sheet, every sprite: the mean and the worst
  const all = Object.entries(manifest.sprites).map(([k, sp]) => { const m = snap(cut(sp), M); return { k, mean: m.mean, worst: m.worst }; }).sort((a, b) => b.mean - a.mean);
  const mean = all.reduce((a, r) => a + r.mean, 0) / all.length;
  console.log('shots/palette_ab.png: original · master · PAL (rows top to bottom, left column then right):');
  for (const r of report) console.log(`  ${String(r.row).padStart(2)} ${r.k.padEnd(22)} ΔE master ${r.master.toFixed(3)} (worst ${r.masterWorst.toFixed(3)}) · PAL ${r.pal.toFixed(3)}`);
  console.log(`Every sprite of the sheet on the master palette: mean ΔE ${mean.toFixed(3)}; the ten that change most: ${all.slice(0, 10).map((r) => `${r.k} ${r.mean.toFixed(3)}`).join(', ')}`);
  // the sheet snapped whole, for --scene
  const snapped = sheets.map((s) => snap(s, M).img);
  snapped.forEach((s, i) => writeFileSync(`shots/palette_sheet_${i}.png`, encodePng(s)));
}

function swatch() {
  const pal = JSON.parse(readFileSync('art/palette.json', 'utf8'));
  const C = 24, gap = 4, bg = [40, 36, 48];
  const maxSteps = Math.max(...pal.ramps.map((r) => r.colors.length));
  const P = palList(), M = master();
  const palRows = Math.ceil(P.length / 16);
  const out = canvas(Math.max(maxSteps, 16 * 2) * (C + gap) + gap * 2, (pal.ramps.length + palRows * 2 + 1) * (C + gap) + gap * 2, bg);
  const fill = (x, y, w, h, rgb) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const o = (yy * out.w + xx) * 4; out.data[o] = rgb[0]; out.data[o + 1] = rgb[1]; out.data[o + 2] = rgb[2]; } };
  pal.ramps.forEach((r, j) => r.colors.forEach((h, i) => fill(gap + i * (C + gap), gap + j * (C + gap), C, C, rgbOf(h))));
  // where PAL lands: each PAL colour (top half) above its master colour (bottom half), 16 to a row
  const y0 = gap + (pal.ramps.length + 1) * (C + gap);
  P.forEach((c, i) => {
    let best = M[0], bd = 9;
    for (const m of M) { const d = dE(c.lab, m.lab); if (d < bd) { bd = d; best = m; } }
    const x = gap + (i % 16) * 2 * (C + gap), y = y0 + ((i / 16) | 0) * 2 * (C + gap);
    fill(x, y, C * 2 + gap, C, c.rgb);
    fill(x, y + C, C * 2 + gap, C, best.rgb);
  });
  writeFileSync('shots/palette_swatch.png', encodePng(out));
  console.log(`shots/palette_swatch.png: ${pal.ramps.length} ramps (${pal.ramps.map((r) => r.id).join(', ')}), then PAL's ${P.length} colours above where each lands.`);
}

async function scene() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const side of ['before', 'after']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    if (side === 'after') await page.route(/\/art\/sheets\/sheet_0[^/]*\.png/, (route) => route.fulfill({ contentType: 'image/png', body: readFileSync('shots/palette_sheet_0.png') }));
    await page.goto('http://localhost:4173/');
    await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
    await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(600);
    await page.evaluate(() => {
      document.getElementById('help-close')?.click();
      const g = window.__game, W = window.__wardlight, s = g.state, bot = new W.Bot(s);
      g.paused = true;
      for (let d = 0; d < 40; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
      s.tick = Math.floor(s.tick / 900) * 900 + 200;
      W.recomputeAll(s); g.renderer.invalidateAll();
      g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 2);
      for (const el of document.querySelectorAll('#toast, #lesson, #help')) el.classList.add('hidden');
    });
    await page.waitForTimeout(1200);
    await page.addStyleTag({ content: '#toast, #lesson, .modal { display: none !important; }' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/palette_scene_${side}.png`, clip: { x: 280, y: 60, width: 780, height: 620 } });
    await page.close();
  }
  await browser.close();
  console.log('shots/palette_scene_before.png, shots/palette_scene_after.png');
}

if (args.has('--measure')) measure();
if (args.has('--derive')) derive();
if (args.has('--gaps')) gaps();
if (args.has('--ab')) ab();
if (args.has('--swatch')) swatch();
if (args.has('--scene')) await scene();
if (![...args].some((a) => ['--measure', '--derive', '--gaps', '--ab', '--swatch', '--scene'].includes(a))) console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 9).join('\n'));
