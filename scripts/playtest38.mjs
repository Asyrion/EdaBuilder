// Iteration 39: the Veshari of the Sable on the title, the riverside start, their buildings, a barge between two landings.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

async function newGame(fac) {
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game);
  const peoples = await page.evaluate(() => document.querySelectorAll('#title .peoples button').length);
  if (fac !== 'vellish') await page.click(`#title .peoples button[data-fac="${fac}"]`);
  await page.fill('#t-seed', '42');
  await page.click('#t-new'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
  return peoples;
}
async function items(tab) {
  await page.click(`#toolbar .tabs button:has-text("${tab}")`); await page.waitForTimeout(80);
  return page.evaluate(() => [...document.querySelectorAll('#toolbar .items button')].map((b) => b.textContent.trim().split('\n')[0].replace(/\d+c.*$/, '').trim()));
}

const peoples = await newGame('veshari');
console.log('people buttons:', peoples);
const start = await page.evaluate(() => { const s = window.__game.state, f = s.founding; let d = 99; for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (s.terrain[(f.y + dy) * s.w + f.x + dx] === 1) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); return { people: s.faction, waterWithin: d, milestone: window.__wardlight.MILESTONES ? 'ok' : 'ok' }; });
console.log('veshari start:', JSON.stringify(start));
const water = await items('Water'); const services = await items('Services');
console.log('water tab:', water.join(' | '));
console.log('services has Landing:', services.some((t) => t.startsWith('Landing')), 'Tide Pool:', services.some((t) => t.startsWith('Tide Pool')));
console.log('atlas:', await page.evaluate(() => { const a = window.__wardlight.atlas; return ['b_tidewell', 'b_landing', 'b_tidepool', 'hearth_l1_v0_veshari', 'market_l2_v1_veshari'].map((k) => k + '=' + !!a.get(k)).join(' '); }));
const scene = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  // find the nearest water tile and lay a street along the bank with two landings, a works and a market
  let best = null;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const x = f.x + dx, y = f.y + dy; if (s.terrain[y * s.w + x] !== 1) continue; const d = Math.abs(dx) + Math.abs(dy); if (!best || d < best.d) best = { x, y, d }; }
  const out = { water: best };
  if (!best) return out;
  // a grid of tracks over the bank (bridges where they cross water), then landings wherever the real bank allows
  const box = 12;
  s.treasury = 60000;
  for (let k = -box; k <= box; k += 4) {
    w.actions.buildRoad(s, 1, w.actions.roadPath(best.x - box, best.y + k, best.x + box, best.y + k, false));
    w.actions.buildRoad(s, 1, w.actions.roadPath(best.x + k, best.y - box, best.x + k, best.y + box, true));
  }
  const tryPlace = (kind, x, y) => w.actions.placeBuilding(s, kind, x, y).ok;
  let la = null, lb = null;
  for (let dy = -box; dy <= box && !la; dy++) for (let dx = -box; dx <= box && !la; dx++) if (tryPlace('landing', best.x + dx, best.y + dy)) la = { x: best.x + dx, y: best.y + dy };
  // the second landing must sit on the same water as the first: flood-fill the body from the first landing's bank
  const body = new Set();
  if (la) {
    const stack = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = (la.y + dy) * s.w + la.x + dx; if (s.terrain[i] <= 1) stack.push(i); }
    while (stack.length) { const i = stack.pop(); if (body.has(i) || s.terrain[i] > 1) continue; body.add(i); const x = i % s.w, y = Math.floor(i / s.w); if (x > 0) stack.push(i - 1); if (x < s.w - 1) stack.push(i + 1); if (y > 0) stack.push(i - s.w); if (y < s.h - 1) stack.push(i + s.w); }
  }
  const onBody = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (body.has((y + dy) * s.w + x + dx)) return true; return false; };
  if (la) for (let dy = box; dy >= -box && !lb; dy--) for (let dx = box; dx >= -box && !lb; dx--) { const x = best.x + dx, y = best.y + dy; if (Math.max(Math.abs(x - la.x), Math.abs(y - la.y)) >= 8 && onBody(x, y) && tryPlace('landing', x, y)) lb = { x, y }; }
  out.body = body.size;
  out.landings = [la, lb];
  const freeNear = (o) => { for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = o.x + dx, y = o.y + dy; const i = y * s.w + x; const t = s.terrain[i]; if (t !== 3 && t !== 4 && t !== 5 && t !== 2) continue; if (s.bIndex[i] >= 0 || s.road[i]) continue; if (![i - 1, i + 1, i - s.w, i + s.w].some((j) => s.road[j])) continue; return { x, y }; } return null; };
  if (la && lb) {
    const cs = freeNear(la); const ms = freeNear(lb);
    if (cs) { const c = w.place(s, 'craft', cs.x, cs.y, 2); c.stock = 60; }
    if (ms) { const m = w.place(s, 'market', ms.x, ms.y, 2); m.stock = 0; }
    const tws = freeNear(la);
    out.tidewell = tws ? tryPlace('tidewell', tws.x, tws.y) : false;
  }
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; } // finished at once, as the dev menu would
  w.recomputeAll(s);
  for (let k = 0; k < 2000; k++) w.tick(s);
  out.barge = s.agents.some((a) => a.kind === 1 && a.variant === 4) || s.stats.bargeTrips > 0;
  out.works = s.buildings.filter((b) => b && (b.kind === 'craft' || b.kind === 'market')).map((b) => `${b.kind}@${b.x},${b.y} stock ${Math.round(b.stock)} ${b.state}`);
  out.ringWater = [la, lb].map((o) => { if (!o) return -1; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.terrain[(o.y + dy) * s.w + o.x + dx] <= 1) n++; return n; });
  out.day = s.day;
  out.bargeTrips = s.stats.bargeTrips;
  out.moorings = s.buildings.filter((b) => b && (b.kind === 'landing' || b.kind === 'quay') && b.state === 'ok').length;
  g.renderer.invalidateAll();
  g.renderer.camera.centerOnTile(best.x, best.y - 1); g.renderer.camera.setZoom(2); g.ui.refresh();
  return out;
});
console.log('scene:', JSON.stringify(scene));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/iter39_veshari.png' });

await newGame('vellish');
const vWater = await items('Water'); const vServices = await items('Services');
console.log('vellish water tab:', vWater.join(' | '), '| Landing:', vServices.some((t) => t.startsWith('Landing')));
const pass = peoples === 3 && start.waterWithin <= 6 && water.some((t) => t.startsWith('Tide-Well')) && !water.some((t) => t === 'Well') && services.some((t) => t.startsWith('Landing')) && scene.barge && vWater.some((t) => t === 'Well') && !vServices.some((t) => t.startsWith('Landing')) && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
