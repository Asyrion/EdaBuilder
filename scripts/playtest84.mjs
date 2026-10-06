// Iteration 84 (the eda-lore swap, batch 2): every other compatible painting of the user's eda-lore repository.
//   shots/iter84_looks_<n>.png   each building with looks: main's sprite (OLD_PORT, default 4174) first, then its looks from the
//                                build on 4173, each over its footprint with a citizen at the front corner
//   shots/iter84_props_<kind>.png   the trees, the autumn trees, glimwood, gloam trees, bushes, mushrooms, glowing caps,
//                                   the ground tiles and the creatures, on a grass ground with a citizen for scale
//   shots/iter84_town_<people>_{day,night}_{2x,4x}.png   a street of the new looks; shots/iter84_forest_*.png a forest by a node
// No page errors, no missing sprites.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const FOOT = Object.fromEntries(JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites.filter((e) => e.w).map((e) => [e.name, e.w]));
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
async function open(port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${port} console: ${m.text()}`); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  try { await page.goto(`http://localhost:${port}/`, { timeout: 8000 }); } catch { await page.close(); return null; }
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  return page;
}
const grab = (page, names) => page.evaluate((names) => names.map((n) => {
  const a = window.__wardlight.atlas; const r = a.get(n); if (!r) return { n };
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; const g = c.getContext('2d');
  g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return { n, w: r.w, h: r.h, ax: r.ax, ay: r.ay, url: c.toDataURL() };
}), names);
/** Rows of sprites; each row has its footprint f (0: a prop, drawn at its anchor on a grass line) and items. */
async function sheet(page, rows, Z, file) {
  const cit = (await grab(page, ['cit_0_0']))[0];
  const url = await page.evaluate(async ([rows, Z, cit]) => {
    const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
    const citImg = await load(cit.url);
    const dims = rows.map((r) => { const f = r.f || 0; const mh = Math.max(20, ...r.items.map((i) => i.h ?? 0)); return { cw: (Math.max(f * 32, 22) + 14) * Z, ch: (mh + f * 16 + 22) * Z }; });
    const W = Math.max(...rows.map((r, i) => r.items.length * dims[i].cw)); const H = dims.reduce((a, d) => a + d.ch, 0);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#2b3a2b'; g.fillRect(0, 0, W, H);
    let y0 = 0;
    for (let ri = 0; ri < rows.length; ri++) {
      const { cw, ch } = dims[ri]; const f = rows[ri].f || 0;
      for (let ci = 0; ci < rows[ri].items.length; ci++) {
        const it = rows[ri].items[ci]; const x0 = ci * cw;
        g.strokeStyle = '#000'; g.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, ch - 1);
        let base;
        if (f > 0) {
          const top = [x0 + cw / 2, y0 + ch - 16 * Z - f * 16 * Z];
          const d = [[0, 0], [f * 16, f * 8], [0, f * 16], [-f * 16, f * 8]].map(([x, y]) => [top[0] + x * Z, top[1] + y * Z]);
          const path = () => { g.beginPath(); d.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
          g.fillStyle = it.ground ? '#000' : '#6a8f4e'; path(); g.fill();
          if (it.url) { const img = await load(it.url); g.drawImage(img, 0, 0, it.w, it.h, top[0] - it.ax * Z, top[1] - it.ay * Z, it.w * Z, it.h * Z); }
          if (!it.ground) g.drawImage(citImg, 0, 0, cit.w, cit.h, d[2][0] + 6 * Z - cit.ax * Z, d[2][1] - cit.ay * Z, cit.w * Z, cit.h * Z);
          g.strokeStyle = 'rgba(255,230,80,0.7)'; path(); g.stroke();
          base = y0 + ch - 4 * Z;
        } else {
          const by = y0 + ch - 14 * Z; g.fillStyle = '#6a8f4e'; g.fillRect(x0 + 2, by - 2 * Z, cw - 4, 4 * Z);
          if (it.url) { const img = await load(it.url); g.drawImage(img, 0, 0, it.w, it.h, x0 + cw / 2 - it.ax * Z, by - it.ay * Z, it.w * Z, it.h * Z); }
          g.drawImage(citImg, 0, 0, cit.w, cit.h, x0 + 4 * Z, by - cit.ay * Z, cit.w * Z, cit.h * Z);
          base = y0 + ch - 3 * Z;
        }
        g.fillStyle = '#fff'; g.font = `${Math.max(10, 4 * Z)}px monospace`; g.textAlign = 'center';
        g.fillText(it.url ? `${it.label ?? it.n}` : `${it.n} MISSING`, x0 + cw / 2, base);
      }
      y0 += ch;
    }
    return c.toDataURL();
  }, [rows, Z, cit]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

const after = await open('4173');
const before = await open(OLD_PORT);
const manifest = await after.evaluate(() => fetch('art/sprites.json').then((r) => r.json()));
const names = Object.keys(manifest.sprites);
const keys = [...new Set(names.map((n) => /^b_(\w+?)_v\d+$/.exec(n)?.[1]).filter(Boolean))].sort();
const count = (p) => { let n = 0; while (manifest.sprites[`${p}${n}`]) n++; return n; };
const rowsBy = { 1: [], 2: [], 3: [] };
for (const k of keys) {
  const f = FOOT[`b_${k}_v0`] ?? 1;
  const old = before ? (await grab(before, [`b_${k}`]))[0] : { n: `b_${k}` };
  const vs = await grab(after, Array.from({ length: count(`b_${k}_v`) }, (_, i) => `b_${k}_v${i}`));
  const items = [{ ...old, label: `${k} (main)` }, ...vs.map((v) => ({ ...v, label: v.n.replace(/^b_/, '') }))];
  const per = f === 1 ? 14 : f === 2 ? 7 : 5;
  for (let i = 0; i < items.length; i += per) rowsBy[Math.min(3, f)].push({ f, items: items.slice(i, i + per) });
}
let sheetN = 0;
for (const f of [1, 2, 3]) { const rows = rowsBy[f]; const per = f === 1 ? 8 : 4; for (let i = 0; i < rows.length; i += per) await sheet(after, rows.slice(i, i + per), f === 3 ? 2 : 3, `shots/iter84_looks_${sheetN++}.png`); }
console.log('building looks', keys.map((k) => `${k}:${count(`b_${k}_v`)}`).join(' '));

const props = { trees: 'tree_', autumn: 'tree_autumn_', glimwood: 'glimwood_', gloamtree: 'gloamtree_', bushes: 'bush_', mushrooms: 'mushroom_', glowcaps: 'glowcap_' };
for (const [kind, p] of Object.entries(props)) {
  const all = await grab(after, Array.from({ length: count(p) }, (_, i) => `${p}${i}`));
  const per = kind === 'trees' ? 11 : 18; const rows = [];
  for (let i = 0; i < all.length; i += per) rows.push({ f: 0, items: all.slice(i, i + per).map((x) => ({ ...x, label: x.n.replace(p, '') })) });
  await sheet(after, rows, kind === 'trees' || kind === 'glimwood' || kind === 'autumn' || kind === 'gloamtree' ? 4 : 5, `shots/iter84_props_${kind}.png`);
}
const grounds = [];
for (const fam of ['grass', 'meadow', 'forest', 'hills', 'shore', 'ruins']) grounds.push({ f: 1, items: (await grab(after, Array.from({ length: count(`${fam}_`) }, (_, i) => `${fam}_${i}`))).map((x) => ({ ...x, ground: true, ax: 16, ay: 0, label: x.n })) });
await sheet(after, grounds, 4, 'shots/iter84_props_ground.png');
const crit = await grab(after, ['boar_0', 'boar_1', 'goat_0', 'goat_1', 'glimmoth_0', 'glimmoth_1', 'tiger_0', 'tiger_1', 'deadtree']);
const critOld = before ? await grab(before, ['boar_0', 'goat_0', 'glimmoth_0', 'tiger_0', 'deadtree']) : [];
await sheet(after, [{ f: 0, items: critOld.map((x) => ({ ...x, label: `${x.n} main` })) }, { f: 0, items: crit }], 8, 'shots/iter84_props_creatures.png');
console.log('props', Object.entries(props).map(([k, p]) => `${k}:${count(p)}`).join(' '), ['grass', 'meadow', 'forest', 'hills', 'shore', 'ruins'].map((f) => `${f}:${count(`${f}_`)}`).join(' '));

// a street of the new looks per people, by day and by night, and a forest by a node
const TOWN = (people) => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(83, 'Lorewick', 'valley', people);
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 9999999; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 3; y <= f.y + 12; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const Y = f.y + 3, X = f.x - 11;
  w.actions.buildRoad(s, 2, w.actions.roadPath(X - 1, Y, X + 23, Y, false));
  w.actions.buildRoad(s, 2, w.actions.roadPath(X - 1, Y + 6, X + 23, Y + 6, false));
  const placed = [];
  const put = (k, x, y) => { let b = null; try { b = w.place(s, k, x, y, 1); } catch (e) { placed.push('ERR ' + k + ' ' + e.message); return null; } if (b) { b.state = 'ok'; b.work = 0; b.lit = true; placed.push(k); } return b; };
  const water = people === 'grimmen' ? 'seep' : people === 'veshari' ? 'tidewell' : 'well';
  let x = X; for (const k of [water, water, water, water, 'shrine', 'shrine', 'healer', 'healer', 'watchpost', 'leybeacon', 'eggshellfont', 'stoneward', 'candleshrine', 'fishershut', 'smokehouse', 'stormpeak']) { if (put(k, x, Y - 1)) x++; else if (put(k, x + 1, Y - 1)) x += 2; }
  x = X; for (const k of ['boneyard', 'boneyard', 'ossuary', 'hunterslodge', 'depot', 'wyrmforge', 'observatory', 'househall', 'drakemews', 'academy']) { if (put(k, x, Y + 1)) x += 2; else if (put(k, x + 1, Y + 1)) x += 3; }
  x = X; for (const k of ['grandacademy', 'hallofmarvels', 'greatgate', 'saltfont', 'tamerslodge', 'wrightslodge', 'raymirror']) { const fw = ['grandacademy', 'hallofmarvels', 'greatgate'].includes(k) ? 3 : 2; if (put(k, x, Y + 7)) x += fw; else if (put(k, x + 1, Y + 7)) x += fw + 1; }
  w.recomputeAll(s);
  for (let k = 0; k < 14; k++) s.agents.push({ id: 90000 + k, kind: 0, x: X + k * 1.6, y: Y + 0.5, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
  g.select(null);
  const node = s.nodes[0]; let forest = null, best = 1e9;
  for (let y = 0; y < s.h; y++) for (let x2 = 0; x2 < s.w; x2++) if (s.terrain[y * s.w + x2] === 4) { const d = Math.hypot(node.x - x2, node.y - y); if (d > 3 && d < best) { best = d; forest = [x2, y]; } }
  return { cx: X + 11, cy: Y + 4, X, Y, placed, forest };
};
async function shot(page, file, x, y, zoom, tick) {
  await page.evaluate(([x, y, zoom, tick]) => {
    const g = window.__game, s = g.state;
    for (const b of s.buildings) if (b) b.lit = true;
    s.tick = s.day * 900 + tick;
    g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y);
    g.renderer.invalidateAll(); g.ui.refresh();
    for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  }, [x, y, zoom, tick]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: file });
}
for (const people of (process.env.PEOPLES ?? 'vellish,grimmen,veshari,tallowkin').split(',')) {
  for (const [page, tag] of [[after, 'after'], [before, 'before']]) {
    if (!page) continue;
    const t = await page.evaluate(TOWN, people);
    if (tag === 'after') console.log(people, 'placed', t.placed.length, 'forest at', t.forest);
    await shot(page, `shots/iter84_town_${people}_day_2x_${tag}.png`, t.cx, t.cy, 2, 200);
    if (tag === 'after') {
      await shot(page, `shots/iter84_town_${people}_night_2x.png`, t.cx, t.cy, 2, 640);
      await shot(page, `shots/iter84_town_${people}_day_4x.png`, t.X + 6, t.Y + 1, 4, 200);
    }
    if (t.forest && people === 'vellish') await shot(page, `shots/iter84_forest_${tag}_3x.png`, t.forest[0], t.forest[1], 3, 200);
    if (t.forest && people === 'vellish' && tag === 'after') await shot(page, `shots/iter84_forest_night_3x.png`, t.forest[0], t.forest[1], 3, 640);
    if (t.forest && people === 'vellish') { // the mushrooms against the folk (the user's word: a mushroom is smaller than a person): citizens walk the forest's edge
      await page.evaluate(([fx, fy]) => { const s = window.__game.state; for (let k = 0; k < 10; k++) s.agents.push({ id: 91000 + k, kind: 0, x: fx - 3 + (k % 5) * 1.3, y: fy - 1 + Math.floor(k / 5) * 1.5, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 }); }, t.forest);
      await shot(page, `shots/iter84_forest_folk_${tag}_6x.png`, t.forest[0], t.forest[1], 6, 200);
    }
  }
}
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
