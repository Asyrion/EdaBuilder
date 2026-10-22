// The scope reset's smoke playtest (phase 0, docs/RESET_PLAN.md): it replaces a new playtestNN.mjs per iteration.
// Against `npx vite preview --port 4173`: boot, a new valley charter, a road drawn through the sim's actions, 30 days
// played by the bot, the Budget panel, every info view, a quick save and load, and shots by day and night.
//   node scripts/smoke.mjs   → shots/smoke_day.png, smoke_night.png, smoke_budget.png; exit 1 on any page error
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const t0 = Date.now();
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
const bootMs = Date.now() - t0;
await page.evaluate(() => {
  const g = window.__game;
  g.newGame(42, 'Smokewick');
  for (const id of ['title', 'help', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
});
const r = await page.evaluate(() => {
  const g = window.__game, W = window.__wardlight, s = g.state, A = W.actions;
  const roads0 = s.road.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  A.buildRoad(s, 1, A.roadPath(s.founding.x + 3, s.founding.y + 3, s.founding.x + 12, s.founding.y + 3, false));
  const roads1 = s.road.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  const bot = new W.Bot(s);
  for (let d = 0; d < 30; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
  W.recomputeAll(s);
  g.renderer.invalidateAll();
  g.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 4);
  g.renderer.camera.setZoom(2);
  s.tick = Math.floor(s.tick / 900) * 900 + 300;
  return { roads0, roads1, day: s.day, pop: s.population, bld: s.buildings.filter(Boolean).length, milestone: s.milestone, treasury: Math.round(s.treasury) };
});
console.log(`boot ${bootMs} ms`, r);
await page.waitForTimeout(400);
// the milestone toast and a lesson the bot's growth opened would cover the shots
await page.evaluate(() => { for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden'); });
await page.screenshot({ path: 'shots/smoke_day.png' });
// every info view, by the overlay the renderer reads
const views = await page.evaluate(async () => {
  const g = window.__game, seen = [];
  for (const v of ['mana', 'water', 'landvalue', 'happiness', 'traffic', 'ward', 'district', 'miasma']) {
    g.view.overlay = v; g.renderer.overlayVersion++;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    seen.push(v);
  }
  g.view.overlay = null;
  return seen;
}).catch((e) => { errors.push(`views: ${e}`); return []; });
// the Budget panel
await page.evaluate(() => [...document.querySelectorAll('#topbar button')].find((b) => /Budget/.test(b.textContent))?.click());
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/smoke_budget.png' });
await page.keyboard.press('Escape');
// a quick save and load must give the same city
const saved = await page.evaluate(() => {
  const g = window.__game, W = window.__wardlight;
  const json = W.save.serialize(g.state);
  const back = W.save.deserialize(json, (seed) => W.createGame(seed, g.state.cityName));
  return { same: back !== g.state && back.population === g.state.population && back.tick === g.state.tick && back.treasury === g.state.treasury, bytes: json.length };
});
// night
await page.evaluate(() => { const s = window.__game.state; s.tick = Math.floor(s.tick / 900) * 900 + 640; });
await page.waitForTimeout(400);
await page.evaluate(() => { for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden'); });
await page.screenshot({ path: 'shots/smoke_night.png' });
console.log('views', views.join(' '), '· save', saved);
const fails = [];
if (r.roads1 <= r.roads0) fails.push('the road was not built');
if (r.pop <= 0) fails.push('no folk after 30 days');
if (!saved.same) fails.push('save/load changed the city');
if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);
await browser.close();
if (fails.length) { console.log('SMOKE FAIL:', fails.join('; ')); process.exit(1); }
console.log('SMOKE OK');
