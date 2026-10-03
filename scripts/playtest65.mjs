// Iteration 65 (drawn art): the Lantern of Vell, the temple at its three stages and the citizens, drawn by hand in code. A town
// painted on seed 65: the temple and the Lantern by day and night, a temple mirrored to a road on its left, a street of folk at 4×;
// and a before/after sheet of the sprites at 6× against a build of the previous main (OLD_PORT, default 4174, if it is running).
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
const NAMES = ['b_temple', 'b_temple_s1', 'b_temple_s2', 'b_lantern'];
const FOLK = ['cit_0_0', 'cit_1_1', 'cit_2_2', 'cit_3_3', 'cit_4_0', 'cit_5_0', 'builder_0_2', 'walker_watchman_0_0', 'walker_pilgrim_0_1', 'walker_lamplighter_0_0'];
async function sheet(port, names, zoom, file) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try { await page.goto(`http://localhost:${port}/`, { timeout: 8000 }); } catch { await page.close(); return false; }
  await page.waitForFunction(() => window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(400);
  const url = await page.evaluate(([names, Z]) => {
    const a = window.__wardlight.atlas;
    const rects = names.map((n) => a.get(n)).filter(Boolean);
    const W = rects.reduce((s, r) => s + r.w * Z + 12, 12); const H = Math.max(...rects.map((r) => r.h * Z)) + 24;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6a8f4e'; g.fillRect(0, 0, W, H);
    let x = 12; for (const r of rects) { g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, x, H - 12 - r.h * Z, r.w * Z, r.h * Z); x += r.w * Z + 12; }
    return c.toDataURL();
  }, [names, zoom]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  await page.close();
  return true;
}
for (const [port, tag] of [['4173', 'after'], [OLD_PORT, 'before']]) {
  const a = await sheet(port, NAMES, 3, `shots/iter65_${tag}_buildings.png`);
  const b = await sheet(port, FOLK, 8, `shots/iter65_${tag}_folk.png`);
  console.log(tag, a && b ? 'sheets written' : `no server on ${port}`);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(600);
const town = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(65, 'Templewick', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 999999; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 14; y <= f.y + 14; y++) for (let x = f.x - 16; x <= f.x + 18; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  // a street east from the stake, the temple and the Lantern on it; a second temple west with its road on its left
  const Y = f.y + 4;
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 14, Y, f.x + 16, Y, false));
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 10, Y - 8, f.x - 10, Y, true));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; } return b; };
  const temple = put('temple', f.x + 4, Y + 1);
  const lantern = put('lantern', f.x + 10, Y + 1);
  const temple2 = put('temple', f.x - 9, Y - 6);
  for (let k = 0; k < 6; k++) { put('hearth', f.x - 6 + k, Y - 1, 2); put('market', f.x - 6 + k, Y + 1, 1); }
  w.recomputeAll(s);
  // a dozen folk walking the street
  for (let k = 0; k < 12; k++) s.agents.push({ id: 90000 + k, kind: 0, x: f.x - 7 + k * 0.9, y: Y + 0.5, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
  g.select(null);
  return { temple: [temple.x, temple.y], lantern: [lantern.x, lantern.y], temple2: [temple2.x, temple2.y], Y, fx: f.x };
});
console.log('town', JSON.stringify(town));
async function shot(name, x, y, zoom, tick, milestone) {
  await page.evaluate(([x, y, zoom, tick, milestone]) => {
    const g = window.__game, s = g.state;
    if (milestone !== undefined) s.milestone = milestone;
    for (const b of s.buildings) if (b) b.lit = true; // the hand-built town has no spires: the night shots show the lit glow
    s.tick = s.day * 900 + tick;
    g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y);
    g.renderer.invalidateAll(); g.ui.refresh();
    for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  }, [x, y, zoom, tick, milestone]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `shots/iter65_${name}.png` });
}
const [tx, ty] = town.temple; const [lx, ly] = town.lantern;
for (const [st, ms] of [[0, 2], [1, 4], [2, 8]]) await shot(`temple_stage${st}_3x`, tx + 1, ty, 3, 200, ms);
await shot('lantern_day_2x', lx + 1, ly - 2, 2, 200, 8);
await shot('lantern_night_2x', lx + 1, ly - 2, 2, 640, 8);
await shot('temple_night_3x', tx + 1, ty, 3, 640, 8);
await shot('temple_mirrored_3x', town.temple2[0] + 1, town.temple2[1], 3, 200, 8);
await shot('folk_4x', town.fx, town.Y, 4, 200, 8);
const mirrored = await page.evaluate(([x, y]) => window.__wardlight.facing.faceLeft(window.__game.state, { x, y, w: 3, h: 3 }), town.temple2);
console.log('temple on a road to its left is mirrored:', mirrored);
const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  const base = s.day * 900;
  for (let t = 520; t <= 900; t += 40) { s.tick = base + t; r.render(s, g.view, 0.016); ctx.drawImage(r.back, 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
