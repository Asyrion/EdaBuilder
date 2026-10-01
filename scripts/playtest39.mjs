// Iteration 40: a Veshari game in the Hush: the flood message, bargemen on the bank, the Great Weir in the Leisure tab, the dev lists.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.click('#title .peoples button[data-fac="veshari"]');
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const scene = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  let best = null;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const x = f.x + dx, y = f.y + dy; if (s.terrain[y * s.w + x] !== 1) continue; const d = Math.abs(dx) + Math.abs(dy); if (!best || d < best.d) best = { x, y, d }; }
  const box = 12; s.treasury = 60000;
  for (let k = -box; k <= box; k += 4) { w.actions.buildRoad(s, 1, w.actions.roadPath(best.x - box, best.y + k, best.x + box, best.y + k, false)); w.actions.buildRoad(s, 1, w.actions.roadPath(best.x + k, best.y - box, best.x + k, best.y + box, true)); }
  const out = {};
  let la = null;
  for (let dy = -box; dy <= box && !la; dy++) for (let dx = -box; dx <= box && !la; dx++) if (w.actions.placeBuilding(s, 'landing', best.x + dx, best.y + dy).ok) la = { x: best.x + dx, y: best.y + dy };
  // bank homes beside the landing
  let homes = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = la.x + dx, y = la.y + dy, i = y * s.w + x; const t = s.terrain[i]; if (t !== 2 && t !== 3 && t !== 4) continue; if (s.bIndex[i] >= 0 || s.road[i]) continue; if (![i - 1, i + 1, i - s.w, i + s.w].some((j) => s.road[j])) continue; const b = w.place(s, 'hearth', x, y, 1); b.residents = 4; homes++; }
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  // into the Hush: day 95
  s.day = 95; s.tick = 95 * 900;
  w.recomputeAll(s);
  for (let k = 0; k < 1500; k++) w.tick(s);
  out.landing = la; out.homes = homes; out.day = s.day;
  out.flooding = s.stats.floodDays > 0;
  out.bargemen = s.agents.filter((a) => a.kind === 5 && a.job === 'bargeman').length;
  out.bailed = s.stats.bargemanRounds;
  out.sprite = !!w.atlas.get('walker_bargeman_0_1') && !!w.atlas.get('b_greatweir');
  out.hushMsg = s.messages.some((m) => m.text.includes('the Sable rises'));
  g.renderer.invalidateAll(); g.renderer.camera.centerOnTile(la.x, la.y); g.renderer.camera.setZoom(3); g.ui.refresh();
  return out;
});
console.log('scene:', JSON.stringify(scene));
await page.click('#toolbar .tabs button:has-text("Leisure")'); await page.waitForTimeout(80);
const leisure = await page.evaluate(() => [...document.querySelectorAll('#toolbar .items button')].map((b) => b.textContent.trim().split('\n')[0]));
console.log('leisure has Great Weir:', leisure.some((t) => t.startsWith('The Great Weir')), '| Lantern of Vell:', leisure.some((t) => t.startsWith('Lantern of Vell')));
await page.evaluate(() => window.__game.ui.toggleDev(true)); await page.waitForTimeout(100);
const dev = await page.evaluate(() => ({ jobs: document.querySelectorAll('#dev select[data-arg="walker"] option').length, tales: [...document.querySelectorAll('#dev select[data-arg="event"] option')].filter((o) => /tide egg|storm egg|bargemen/i.test(o.textContent)).length }));
console.log('dev:', JSON.stringify(dev));
await page.evaluate(() => window.__game.ui.toggleDev(false));
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/iter40_weir.png' });
const pass = scene.flooding && scene.bargemen >= 1 && scene.sprite && leisure.some((t) => t.startsWith('The Great Weir')) && !leisure.some((t) => t.startsWith('Lantern of Vell')) && dev.jobs === 9 && dev.tales === 3 && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
