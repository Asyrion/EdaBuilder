// Iteration 83 (the Brickworks): the Village's Services tab with the Brickworks and its tip; the placing ghost with its reach
// ring; a Brickworks standing in a street, by day and at night (the kiln's glow), its panel with the ring of its builders'
// reach; a site beside it rising half again as fast (its Construction row and the work done in a day, against a site beyond
// the reach); its goods carted. No errors, no missing sprites. Screenshots go to shots/iter83_*.png.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(600);
const snap = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `shots/iter83_${name}.png` }); };
const HIDE = () => { for (const id of ['toast', 'lesson', 'tasks', 'help', 'title']) document.getElementById(id)?.classList.add('hidden'); };

const t = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(81, 'Brickford', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding; s.lessonsSeen = ['districts']; s.milestone = 3; s.treasury = 99999; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 14; y <= f.y + 14; y++) for (let x = f.x - 24; x <= f.x + 24; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const Y = f.y + 4;
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 22, Y, f.x + 22, Y, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; } return b; };
  for (let k = 0; k < 6; k++) { const h = put('hearth', f.x - 8 + k, Y - 1, 2); if (h) h.residents = 12; put('craft', f.x - 8 + k, Y + 1, 2); }
  for (let k = 0; k < 8; k++) { const h = put('hearth', f.x - 16 + k, Y - 1, 2); if (h) h.residents = 12; }
  put('market', f.x + 10, Y - 1, 2); put('well', f.x + 2, Y - 2);
  w.recomputeAll(s); g.select(null);
  return { fx: f.x, fy: f.y, Y };
});

// the Services tab at the Village, the Brickworks' tip, and the placing ghost with its ring
const menu = await page.evaluate(() => {
  const g = window.__game;
  document.querySelector('#toolbar .tabs button[data-cat="service"]')?.click();
  g.ui.refresh();
  const btn = [...document.querySelectorAll('#toolbar .items button')].find((b) => /Brickworks/.test(b.textContent));
  return { listed: !!btn, locked: btn?.disabled ?? null, text: btn?.textContent };
});
console.log('menu', JSON.stringify(menu));
const btn = page.locator('#toolbar .items button', { hasText: 'Brickworks' });
await btn.click();
await btn.hover();
await page.evaluate(([fx, Y]) => { const g = window.__game; g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(fx + 4, Y); g.renderer.invalidateAll(); for (const id of ['toast', 'lesson', 'tasks']) document.getElementById(id)?.classList.add('hidden'); }, [t.fx, t.Y]);
const cv = await page.locator('#game').boundingBox();
await snap('menu_tip');
await page.mouse.move(cv.x + cv.width / 2 + 10, cv.y + cv.height / 2 + 30);
await page.mouse.move(cv.x + cv.width / 2 + 12, cv.y + cv.height / 2 + 34);
await snap('ghost');
await page.mouse.move(cv.x + cv.width - 20, cv.y + 60);

// placed through the game's own action, then raised and staffed
const placed = await page.evaluate(([fx, Y]) => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  g.tools.setTool({ kind: 'select' });
  const r = w.actions.placeBuilding(s, 'brickworks', fx + 3, Y + 1);
  const bw = s.buildings.find((b) => b && b.kind === 'brickworks');
  const days = bw ? Math.round(bw.workTotal / 900) : null;
  if (bw) { bw.state = 'ok'; bw.work = 0; bw.workers = 10; bw.lit = true; }
  w.recomputeAll(s);
  return { ok: r.ok, reason: r.reason ?? null, at: bw ? [bw.x, bw.y] : null, buildDays: days };
}, [t.fx, t.Y]);
console.log('placed', JSON.stringify(placed));

for (const [name, tick] of [['day', 200], ['night', 640]]) {
  await page.evaluate(([x, y, tick]) => { const g = window.__game, s = g.state; s.tick = s.day * 900 + tick; g.select(null); g.renderer.camera.setZoom(3); g.renderer.camera.centerOnTile(x, y); g.renderer.invalidateAll(); g.ui.refresh(); for (const id of ['toast', 'lesson', 'tasks']) document.getElementById(id)?.classList.add('hidden'); }, [placed.at[0] + 1, placed.at[1], tick]);
  await snap(name);
}

// its panel and the ring of its builders' reach
const panel = await page.evaluate(([x, y]) => {
  const g = window.__game, s = g.state;
  s.tick = s.day * 900 + 200;
  const bw = s.buildings.find((b) => b && b.kind === 'brickworks');
  g.select(bw); g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(x, y); g.renderer.invalidateAll(); g.ui.refresh();
  for (const id of ['toast', 'lesson', 'tasks']) document.getElementById(id)?.classList.add('hidden');
  return document.getElementById('info')?.innerText.split('\n').filter((l) => /Brickworks|Workers|Goods|Carts|reach|brick/i.test(l)).slice(0, 8);
}, [placed.at[0] - 3, placed.at[1] + 4]);
console.log('panel', JSON.stringify(panel));
await snap('panel_ring');

// a site beside it and one beyond its reach: a day's work on each, and the near site's Construction row
const sites = await page.evaluate(([fx, Y]) => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  const near = w.place(s, 'watchhouse', fx + 8, Y - 2);
  const far = w.place(s, 'watchhouse', fx - 20, Y - 2);
  for (const b of [near, far]) { b.state = 'building'; b.work = b.workTotal = 3000; }
  // no builders, so both rise at the folk's own pace and only the bricks differ (Builder agents are kind 4)
  for (let k = 0; k < 400; k++) { s.agents = s.agents.filter((a) => a.kind !== 4); w.tick(s); if (s.pendingEvent) w.resolveEvent(s, 0); }
  const builders = 0;
  s.tick = s.day * 900 + 200; // a daylight shot
  g.select(near); g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(fx, Y); g.renderer.invalidateAll(); g.ui.refresh();
  for (const id of ['toast', 'lesson', 'tasks']) document.getElementById(id)?.classList.add('hidden');
  return { nearDone: Math.round(3000 - near.work), farDone: Math.round(3000 - far.work), builders, row: document.getElementById('info')?.innerText.split('\n').find((l) => /%/.test(l) && /builder/.test(l)) ?? (document.getElementById('info')?.innerText.match(/Construction[^\n]*\n?[^\n]*/) ?? [null])[0] };
}, [t.fx, t.Y]);
console.log('sites', JSON.stringify(sites));
await snap('site_row');

// a few days of the sim: its goods made and carted
const goods = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  const bw = s.buildings.find((b) => b && b.kind === 'brickworks');
  const p0 = s.goodsProduced;
  const d0 = s.day;
  while (s.day < d0 + 3 && !s.gameOver) { w.tick(s); if (s.pendingEvent) w.resolveEvent(s, 0); }
  return { days: s.day - d0, produced: Math.round(s.goodsProduced - p0), stock: Math.round(bw.stock), workers: bw.workers, lit: bw.lit, state: bw.state };
});
console.log('goods', JSON.stringify(goods));
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
