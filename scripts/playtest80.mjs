// Iteration 79 (the paintings redrawn in code, part 1): the twelve redrawn buildings side by side with their paintings. The
// paintings come from the previous main served on OLD_PORT (default 4174), the redraws from the build on 4173; each pair stands
// over its footprint diamond (yellow; the red edge is the right face) with a citizen at the tile's front corner, at 6×:
//   shots/iter80_side_by_side.png   painting | redraw, for the three wells, the four level-2 hearths, the four level-1 crafts, the depot
//   shots/iter80_{hearths,crafts,wells_depot}_10x.png   the same pairs at 10×, a row each
//   shots/iter80_peoples.png        the redrawn hearths and crafts as the Grimmen, Veshari and Tallowkin build them (their spec functions
//                                   apply again, now that no painting is the look for everyone)
// then the street of iteration 78 at 4× and 6×, before and after; no errors, no missing sprites.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
const NAMES = ['b_well', 'b_seep', 'b_tidewell', 'b_depot', 'hearth_l2_v0', 'hearth_l2_v1', 'hearth_l2_v2', 'hearth_l2_v3', 'craft_l1_v0', 'craft_l1_v1', 'craft_l1_v2', 'craft_l1_v3'];
const FOOT = { b_depot: 2 };

async function open(port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${port} console: ${m.text()}`); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  try { await page.goto(`http://localhost:${port}/`, { timeout: 8000 }); } catch { await page.close(); return null; }
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  return page;
}
/** Each named sprite's pixels and anchor as a data URL, from a page's atlas. */
const grab = (page, names) => page.evaluate((names) => names.map((n) => {
  const a = window.__wardlight.atlas; const r = a.get(n); if (!r) return { n };
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; const g = c.getContext('2d');
  g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return { n, w: r.w, h: r.h, ax: r.ax, ay: r.ay, url: c.toDataURL() };
}), names);
/** A sheet of cells, each a row of sprites (given as grabbed records) over diamonds with a citizen; labels under each. */
async function sheet(page, rows, Z, file, foot) {
  const cit = (await grab(page, ['cit_0_0']))[0];
  const url = await page.evaluate(async ([rows, Z, cit, foot]) => {
    const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
    const citImg = await load(cit.url);
    const cellW = 56 * Z, cellH = 84 * Z;
    const cols = Math.max(...rows.map((r) => r.items.length));
    const c = document.createElement('canvas'); c.width = cols * cellW; c.height = rows.length * cellH;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#2b3a2b'; g.fillRect(0, 0, c.width, c.height);
    for (let ri = 0; ri < rows.length; ri++) for (let ci = 0; ci < rows[ri].items.length; ci++) {
      const it = rows[ri].items[ci]; const f = foot[it.n.replace(/^b_/, '')] ?? foot[it.n] ?? 1;
      const x0 = ci * cellW, y0 = ri * cellH;
      g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, cellW - 1, cellH - 1);
      const top = [x0 + cellW / 2, y0 + cellH - 24 - f * 16 * Z];
      const d = [[0, 0], [f * 16, f * 8], [0, f * 16], [-f * 16, f * 8]].map(([x, y]) => [top[0] + x * Z, top[1] + y * Z]);
      const path = () => { g.beginPath(); d.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
      g.fillStyle = '#6a8f4e'; path(); g.fill();
      if (it.url) { const img = await load(it.url); g.drawImage(img, 0, 0, it.w, it.h, top[0] - it.ax * Z, top[1] - it.ay * Z, it.w * Z, it.h * Z); }
      g.drawImage(citImg, 0, 0, cit.w, cit.h, d[2][0] + 6 * Z - cit.ax * Z, d[2][1] - cit.ay * Z, cit.w * Z, cit.h * Z);
      g.strokeStyle = 'rgba(255,230,80,0.8)'; path(); g.stroke();
      g.strokeStyle = 'rgba(255,60,60,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(d[1][0], d[1][1]); g.lineTo(d[2][0], d[2][1]); g.stroke();
      g.fillStyle = '#fff'; g.font = '13px monospace'; g.textAlign = 'center';
      g.fillText(it.url ? `${it.label ?? it.n} ${it.w}×${it.h} ${(it.h / 12).toFixed(1)} folk` : `${it.n} MISSING`, x0 + cellW / 2, y0 + cellH - 7);
    }
    return c.toDataURL();
  }, [rows, Z, cit, foot]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

// the street of iteration 78, on seed 78
const TOWN = () => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(78, 'Scaleton', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 999999; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 12; y <= f.y + 12; y++) for (let x = f.x - 16; x <= f.x + 18; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const Y = f.y + 5;
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 14, Y, f.x + 16, Y, false));
  const put = (k, x, y, lvl, v) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; if (v !== undefined) b.variant = v; } return b; };
  put('well', f.x - 6, Y - 1); put('seep', f.x - 4, Y - 1); put('tidewell', f.x - 2, Y - 1); put('spire', f.x, Y - 1);
  for (let v = 0; v < 4; v++) put('hearth', f.x + 2 + v * 2, Y - 1, 2, v);
  put('shrine', f.x + 10, Y - 1); put('wardlantern', f.x + 12, Y - 1);
  put('depot', f.x - 6, Y + 1); put('cistern', f.x - 3, Y + 1); put('watchpost', f.x, Y + 1);
  for (let v = 0; v < 4; v++) put('craft', f.x + 2 + v * 2, Y + 1, 1, v);
  w.recomputeAll(s);
  for (let k = 0; k < 16; k++) s.agents.push({ id: 90000 + k, kind: 0, x: f.x - 7 + k * 1.2, y: Y + 0.5, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
  g.select(null);
  return { fx: f.x, Y };
};
async function shot(page, tag, name, x, y, zoom, tick) {
  await page.evaluate(([x, y, zoom, tick]) => {
    const g = window.__game, s = g.state;
    for (const b of s.buildings) if (b) b.lit = true;
    s.tick = s.day * 900 + tick;
    g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y);
    g.renderer.invalidateAll(); g.ui.refresh();
    for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  }, [x, y, zoom, tick]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `shots/iter80_${tag}_${name}.png` });
}

const after = await open('4173');
const before = await open(OLD_PORT);
const redrawn = await grab(after, NAMES);
if (before) {
  const painted = await grab(before, NAMES);
  const rows = NAMES.map((n, i) => ({ items: [{ ...painted[i], label: `${n} painting` }, { ...redrawn[i], label: `${n} redrawn` }] }));
  // four pairs a row: the wells + depot, the hearths, the crafts
  const grouped = [rows.slice(0, 4), rows.slice(4, 8), rows.slice(8, 12)].map((g) => ({ items: g.flatMap((r) => r.items) }));
  await sheet(after, grouped, 6, 'shots/iter80_side_by_side.png', FOOT);
  await sheet(after, rows.slice(4, 8), 10, 'shots/iter80_hearths_10x.png', FOOT);
  await sheet(after, rows.slice(8, 12), 10, 'shots/iter80_crafts_10x.png', FOOT);
  await sheet(after, rows.slice(0, 4), 10, 'shots/iter80_wells_depot_10x.png', FOOT);
  console.log('side-by-side sheets written');
} else console.log(`no server on ${OLD_PORT}: no side-by-side sheet`);
const peoples = ['', '_grimmen', '_veshari', '_tallowkin'].map((p) => ({ items: [0, 1, 2, 3].map((v) => `hearth_l2_v${v}${p}`).concat([0, 1, 2, 3].map((v) => `craft_l1_v${v}${p}`)) }));
const peopleRows = [];
for (const r of peoples) peopleRows.push({ items: await grab(after, r.items) });
await sheet(after, peopleRows, 5, 'shots/iter80_peoples.png', FOOT);
console.log('peoples sheet written; redrawn', redrawn.map((r) => `${r.n} ${r.w}×${r.h}`).join(', '));
for (const [page, tag] of [[after, 'after'], [before, 'before']]) {
  if (!page) continue;
  const town = await page.evaluate(TOWN);
  await shot(page, tag, 'street_4x', town.fx + 2, town.Y, 4, 200);
  await shot(page, tag, 'wells_6x', town.fx - 3, town.Y, 6, 200);
  await shot(page, tag, 'houses_6x', town.fx + 5, town.Y, 6, 200);
  await shot(page, tag, 'street_night_4x', town.fx + 2, town.Y, 4, 640);
  await page.close();
}
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
