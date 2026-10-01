// Iteration 44, the sweep: a glowvine-lit hearth at night, the square's and the depot's panel rows, the store in the top bar, no errors.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.milestone = 6; s.treasury = 90000;
  for (let y = f.y - 8; y <= f.y + 10; y++) for (let x = f.x - 16; x <= f.x + 16; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  // a Hanging Gardens on a hill, a glowvine lane east of it, hearths along the lane and no spire near them
  s.terrain[(f.y + 5) * s.w + (f.x - 13)] = 4;
  const gardens = w.place(s, 'hanginggardens', f.x - 12, f.y + 5);
  const lane = w.actions.buildRoad(s, 4, w.actions.roadPath(f.x - 11, f.y + 7, f.x - 2, f.y + 7, false));
  const hearths = []; for (let dx = -10; dx <= -4; dx += 2) { const b = w.place(s, 'hearth', f.x + dx, f.y + 8, 1); if (b) hearths.push(b); }
  const sq = w.place(s, 'square', f.x + 4, f.y - 2);
  const m = w.place(s, 'market', f.x + 2, f.y + 1, 1);
  const depot = w.place(s, 'depot', f.x + 8, f.y - 2);
  const nexus = w.place(s, 'nexus', f.x + 3, f.y - 6);
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  if (m) { m.workers = 3; m.residents = 0; }
  for (const b of hearths) b.residents = 4;
  w.recomputeAll(s); g.renderer.invalidateAll();
  s.tick = 450; // night
  g.renderer.camera.centerOnTile(f.x - 6, f.y + 6); g.renderer.camera.setZoom(2); g.ui.refresh();
  return { gardens: !!gardens, lane: lane.ok, hearths: hearths.length, litHearths: hearths.filter((b) => b.lit).length, square: !!sq, depot: !!depot, nexus: !!nexus, store: s.manaStorageMax, topbar: document.querySelector('#t-mana')?.textContent ?? document.body.textContent.match(/store \d+\/\d+/)?.[0] ?? '' };
});
console.log('scene:', JSON.stringify(info));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter44_glowvine_night.png' });
// the depot's Caravan row and the square's reach
const rows = await page.evaluate(() => { const g = window.__game, s = g.state; const depot = s.buildings.find((b) => b && b.kind === 'depot'); g.select(depot); g.ui.refresh(); const txt = document.querySelector('#info')?.textContent ?? document.body.textContent; return { caravan: /Caravan/.test(txt), next: (txt.match(/next in \d+ days?/) ?? [''])[0] }; });
console.log('depot panel:', JSON.stringify(rows));
const pass = info.lane && info.hearths >= 3 && info.litHearths === info.hearths && info.square && info.depot && info.store > 0 && /store/.test(info.topbar) && rows.caravan && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
