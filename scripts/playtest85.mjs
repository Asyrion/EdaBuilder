// Iteration 85 (M17 part 1, the marsh): seed 42's marsh nearest the founding, by day, at dawn (the mist) and at night; a causeway
// across it; the Drainage edict on for five days, before and after; the minimap in every shot. No errors, no missing sprites.
//   shots/iter85_marsh_{day,dawn,night}_3x.png, iter85_marsh_day_6x.png, iter85_causeway_4x.png, iter85_drained_{before,after}_4x.png
import { chromium } from 'playwright';
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

const page = await open('4173');
const m = await page.evaluate(() => {
  const g = window.__game;
  g.newGame(42, 'Fenwick', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 9999999; s.sectors.fill(1);
  let best = null, bd = 1e9, count = 0;
  for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === 9) { count++; const x = i % s.w, y = (i / s.w) | 0; const d = Math.hypot(x - f.x, y - f.y); if (d < bd && !s.gloam[i]) { bd = d; best = [x, y]; } }
  // the densest marsh within 30 of the founding: the tile with the most marsh within 3
  let dense = null, dn = 0;
  for (let y = f.y - 30; y <= f.y + 30; y++) for (let x = f.x - 30; x <= f.x + 30; x++) {
    if (x < 3 || y < 3 || x >= s.w - 3 || y >= s.h - 3) continue;
    let n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (s.terrain[(y + dy) * s.w + x + dx] === 9) n++;
    if (n > dn) { dn = n; dense = [x, y]; }
  }
  best = dense;
  for (let k = 0; k < 8; k++) s.agents.push({ id: 92000 + k, kind: 0, x: best[0] - 4 + k * 0.7, y: best[1] - 3, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
  g.select(null);
  return { x: best[0], y: best[1], d: bd, count, fx: f.x, fy: f.y };
});
console.log('marsh tiles', m.count, 'nearest at', m.x, m.y, 'distance', m.d.toFixed(1));
const T = (k) => `shots/iter85_${k}.png`;
await shot(page, T('marsh_day_3x'), m.x, m.y, 3, 200);
await shot(page, T('marsh_day_6x'), m.x, m.y, 6, 200);
await shot(page, T('marsh_dawn_3x'), m.x, m.y, 3, 875);
await shot(page, T('marsh_night_3x'), m.x, m.y, 3, 640);
// a causeway: a cobbled road across the marsh's row
const c = await page.evaluate(([mx, my]) => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  let x0 = mx, x1 = mx;
  while (x0 > 0 && s.terrain[my * s.w + x0 - 1] === 9) x0--;
  while (x1 < s.w - 1 && s.terrain[my * s.w + x1 + 1] === 9) x1++;
  const path = w.actions.roadPath(x0 - 2, my, x1 + 2, my, false);
  const before = s.treasury;
  const r = w.actions.buildRoad(s, 2, path);
  return { ok: r.ok, cost: before - s.treasury, tiles: path.length, marsh: x1 - x0 + 1 };
}, [m.x, m.y]);
console.log('causeway', JSON.stringify(c));
await shot(page, T('causeway_4x'), m.x, m.y, 4, 200);
// the Drainage edict for five days: the drained tiles shot before (the terrain put back for the frame) and after
const d = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  const snap = s.terrain.slice();
  s.edicts.drainage = true;
  for (let day = 0; day < 5; day++) { for (let k = 0; k < 900; k++) { if (s.pendingEvent) s.pendingEvent = null; w.tick(s); } }
  let n = 0, cx = 0, cy = 0, ch = 0;
  for (let i = 0; i < s.terrain.length; i++) { if (s.terrain[i] === 9) n++; if (snap[i] === 9 && s.terrain[i] !== 9) { ch++; cx += i % s.w; cy += (i / s.w) | 0; } }
  window.__drain = { snap, after: s.terrain.slice() };
  return { left: n, drained: s.stats.marshDrained, x: Math.round(cx / ch), y: Math.round(cy / ch), before: snap.filter((t) => t === 9).length };
});
console.log('drainage: marsh', d.before, '->', d.left, 'drained', d.drained, 'around', d.x, d.y);
await page.evaluate(() => window.__game.state.terrain.set(window.__drain.snap));
await shot(page, T('drained_before_4x'), d.x, d.y, 4, 200);
await page.evaluate(() => window.__game.state.terrain.set(window.__drain.after));
await shot(page, T('drained_after_4x'), d.x, d.y, 4, 200);
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
