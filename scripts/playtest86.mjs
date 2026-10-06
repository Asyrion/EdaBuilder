// Iteration 86 (M17 part 2, the marsh-wyrms): seed 42 in Bloom. The wyrms in the water; a cobbled bridge with a wyrm laired
// under it and a cart crawling across, by day and at night; a Veshari Hall raised beside it and the day after, the lair gone.
//   shots/iter86_wyrms_3x.png, iter86_lair_{day,night}_5x.png, iter86_driven_5x.png
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
const r = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(42, 'Eelwick', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 9999999; s.sectors.fill(1);
  // a bridge: the narrowest crossing of the river nearest the founding, a row of water with land at both ends
  let best = null, bd = 1e9;
  for (let y = 10; y < s.h - 10; y++) for (let x = 10; x < s.w - 10; x++) {
    const i = y * s.w + x; if (s.terrain[i] !== 1 || s.terrain[i - 1] === 1) continue;
    let x1 = x; while (x1 < s.w - 1 && (s.terrain[y * s.w + x1] === 1)) x1++;
    const len = x1 - x; if (len < 2 || len > 4 || s.terrain[y * s.w + x - 1] === 0) continue;
    const d = Math.hypot(x - f.x, y - f.y) + len * 3;
    if (d < bd && d > 6) { bd = d; best = { x0: x - 2, x1: x1 + 1, y, water: [x, x1 - 1] }; }
  }
  const path = w.actions.roadPath(best.x0, best.y, best.x1, best.y, false);
  const built = w.actions.buildRoad(s, 2, path);
  // Bloom: the day before, and one day on, so the wyrms come up the water
  s.day = 29; s.tick = s.day * 900;
  for (let k = 0; k < 900; k++) { if (s.pendingEvent) s.pendingEvent = null; w.tick(s); }
  const at = { x: best.water[0], y: best.y };
  const dev = w.dev.runDev(s, 'marshwyrm', '', at);
  return { bridge: best, built: built.ok, wyrms: s.marshWyrms.length, lair: s.marshWyrms.find((m) => m.lair >= 0)?.lair ?? -1, dev, day: s.day };
});
console.log(JSON.stringify(r));
const T = (k) => `shots/iter86_${k}.png`;
const first = await page.evaluate(() => { const m = window.__game.state.marshWyrms.find((w) => w.lair < 0); return m ? [m.x, m.y] : null; });
if (first) await shot(page, T('wyrms_3x'), first[0], first[1], 3, 200);
const lx = r.lair % 128, ly = Math.floor(r.lair / 128);
// a cart on the bridge, crawling
await page.evaluate(([bx0, bx1, y]) => {
  const g = window.__game, s = g.state;
  const path = []; for (let x = bx0; x <= bx1; x++) path.push(y * s.w + x);
  s.agents.push({ id: 95000, kind: 1, x: bx0 + 0.5, y: y + 0.5, path, pathIdx: 1, timer: 0, variant: 0, speed: 1, home: -1, cargo: 4 });
  for (let k = 0; k < 6; k++) s.agents.push({ id: 95100 + k, kind: 0, x: bx0 - 2 + k * 0.4, y: y - 1.2, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
}, [r.bridge.x0, r.bridge.x1, r.bridge.y]);
await shot(page, T('lair_day_5x'), lx, ly, 5, 200);
await shot(page, T('lair_night_5x'), lx, ly, 5, 640);
const speed = await page.evaluate((i) => { const s = window.__game.state; const sp = []; sp.push(window.__wardlight.dev ? 1 : 0); return s.marshWyrms.filter((m) => m.lair === i).length; }, r.lair);
console.log('wyrms under the bridge', speed);
// the Veshari Hall beside the bridge, a day on: the lair is gone
const v = await page.evaluate(([x, y]) => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  let placed = null;
  for (let d = 2; d < 8 && !placed; d++) for (const [dx, dy] of [[0, -d], [0, d], [-d, -2], [d, -2], [-d, 1], [d, 1]]) { const b = w.place(s, 'veshari', x + dx, y + dy, 1); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; placed = b; break; } }
  w.recomputeAll(s);
  // an empty test town has no folk to crew the hall or water to fill it: give it both, as a grown city would
  for (let k = 0; k < 900; k++) { if (s.pendingEvent) s.pendingEvent = null; if (placed) { placed.workers = 8; placed.watered = true; placed.lit = true; } w.tick(s); }
  return { hall: placed ? [placed.x, placed.y] : null, lairs: s.marshWyrms.filter((m) => m.lair >= 0).length, driven: s.stats.wyrmsDriven, msg: s.messages.slice(-4).map((m) => m.text.slice(0, 90)) };
}, [lx, ly]);
console.log(JSON.stringify(v));
await shot(page, T('driven_5x'), lx, ly, 5, 200);
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
