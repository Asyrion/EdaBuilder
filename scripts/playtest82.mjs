// Iteration 82 (the eda-lore swap, batch 1): the zone houses from the user's sheets, every people its own. For each people:
//   shots/iter82_<people>_before.png / _after.png   the 48 zone houses (rows hearth, craft, market, arcane; levels 1–3 × four
//                                                    variants) over their diamonds with a citizen, from main's build (OLD_PORT,
//                                                    default 4174) and this build (4173), at 3×
//   shots/iter82_<people>_<zone>_6x.png             one zone's twelve after, at 6×, for judging
//   shots/iter82_<people>_town_{day,night}_3x.png    a block of all 48 on four streets, by day and at night; _6x a close-up
// No page errors, no missing sprites.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const ONLY = process.env.ONLY; // a people's suffix name to run alone (vellish, grimmen, veshari, tallowkin)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
const PEOPLES = [['vellish', ''], ['grimmen', '_grimmen'], ['veshari', '_veshari'], ['tallowkin', '_tallowkin']].filter(([p]) => !ONLY || ONLY === p);
const ZONES = ['hearth', 'craft', 'market', 'arcane'];
const names = (z, suf) => [1, 2, 3].flatMap((l) => [0, 1, 2, 3].map((v) => `${z}_l${l}_v${v}${suf}`));

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
const TOWN = (people) => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(82, 'Lorehold', 'valley', people);
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 999999; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 4; y <= f.y + 14; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const Y = f.y + 3, X = f.x - 6;
  const put = (k, x, y, lvl, v) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; b.variant = v; } return b; };
  ['hearth', 'craft', 'market', 'arcane'].forEach((z, zi) => {
    const road = Y + Math.floor(zi / 2) * 5, row = zi % 2 === 0 ? road - 1 : road + 1;
    if (zi % 2 === 0) w.actions.buildRoad(s, 2, w.actions.roadPath(X - 2, road, X + 13, road, false));
    for (let l = 1; l <= 3; l++) for (let v = 0; v < 4; v++) put(z, X + (l - 1) * 4 + v, row, l, v);
  });
  w.recomputeAll(s);
  for (let k = 0; k < 12; k++) s.agents.push({ id: 90000 + k, kind: 0, x: X - 1 + k * 1.2, y: Y + 0.5, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
  g.select(null);
  return { cx: X + 6, cy: Y + 3, Y, X };
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

const after = await open('4173');
const before = await open(OLD_PORT);
if (!before) console.log(`no server on ${OLD_PORT}: no before sheets`);
const count = {};
for (const [people, suf] of PEOPLES) {
  const rowsAfter = []; const rowsBefore = [];
  for (const z of ZONES) {
    rowsAfter.push({ items: await grab(after, names(z, suf)) });
    if (before) rowsBefore.push({ items: await grab(before, names(z, suf)) });
  }
  const imported = await after.evaluate((ns) => ns.filter((n) => window.__wardlight.atlas.imported.has(n)).length, ZONES.flatMap((z) => names(z, suf)));
  count[people] = imported;
  await sheet(after, rowsAfter, 3, `shots/iter82_${people}_after.png`, {});
  if (before) await sheet(after, rowsBefore, 3, `shots/iter82_${people}_before.png`, {});
  for (let zi = 0; zi < 4; zi++) await sheet(after, [{ items: rowsAfter[zi].items.slice(0, 6) }, { items: rowsAfter[zi].items.slice(6) }], 6, `shots/iter82_${people}_${ZONES[zi]}_6x.png`, {});
  for (const [page, tag] of [[after, 'after'], [before, 'before']]) {
    if (!page) continue;
    const t = await page.evaluate(TOWN, people);
    await shot(page, `shots/iter82_${people}_town_day_3x_${tag}.png`, t.cx, t.cy, 3, 200);
    if (tag === 'after') {
      await shot(page, `shots/iter82_${people}_town_night_3x.png`, t.cx, t.cy, 3, 640);
      await shot(page, `shots/iter82_${people}_town_day_6x.png`, t.X + 3, t.Y, 6, 200);
    }
  }
}
console.log('imported zone houses per people', count);
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
