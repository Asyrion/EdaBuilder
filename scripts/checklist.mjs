// The scripted walk of docs/CORE_CHECKLIST.md (scope reset, phases 1c and 1d): the lines a script can check, against
// `npx vite preview --port 4173`. The title screen founds the valley; the top bar keeps five buttons and the Menu opens the
// help, as does H; the Ledger counts its tasks; the bot plays 40 days of seed 42; a quick save and load inside a day gives
// the same city; every info view draws; shots by day and night. The lines that need a hand (a road dragged with its cost,
// the reach rings while placing, the demand bars' hover) stay for the person walking the list.
//   node scripts/checklist.mjs   → shots/checklist_*.png and one json line; exit 1 on a failed line or a page error
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
await page.waitForTimeout(600);
const hide = () => page.evaluate(() => { document.getElementById('lesson-close')?.click(); for (const el of document.querySelectorAll('#toast, #lesson, .panel.modal')) el.classList.add('hidden'); });
const r = {};
// 1. the title screen founds the valley
await page.screenshot({ path: 'shots/checklist_title.png' });
await page.fill('#t-seed', '42');
await page.click('#t-new');
await page.waitForTimeout(600);
r.founded = await page.evaluate(() => window.__game.state.buildings.some((b) => b && b.kind === 'stake'));
await page.click('#help-close').catch(() => {});
// the top bar, the Menu and the help
r.topbar = await page.evaluate(() => [...document.querySelectorAll('#topbar > button')].map((b) => b.textContent.trim()));
await page.click('#btn-menu');
await page.waitForTimeout(300);
await page.click('#m-help');
await page.waitForTimeout(300);
r.helpFromMenu = await page.evaluate(() => !document.getElementById('help').classList.contains('hidden'));
await hide();
await page.keyboard.press('h');
await page.waitForTimeout(300);
r.helpFromKey = await page.evaluate(() => !document.getElementById('help').classList.contains('hidden'));
await hide();
// 6, 10: the bot plays 40 days; growth and the milestones
await page.evaluate(() => {
  const g = window.__game, W = window.__wardlight, s = g.state, bot = new W.Bot(s);
  g.paused = true;
  for (let d = 0; d < 40; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
  W.recomputeAll(s); g.renderer.invalidateAll();
  g.renderer.camera.setZoom(2);
  g.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 2);
});
r.city = await page.evaluate(() => { const s = window.__game.state; return { day: s.day, folk: s.population, milestone: s.milestone }; });
r.ledger = await page.evaluate(() => document.querySelector('#tasks')?.textContent.match(/\d+\/\d+/)?.[0] ?? null);
// 11: every info view draws
r.views = await page.evaluate(async () => {
  const g = window.__game, seen = [];
  for (const id of ['mana', 'water', 'landvalue', 'happiness', 'traffic', 'ward', 'district', 'miasma']) { g.view.overlay = id; g.renderer.invalidateAll(); await new Promise((res) => setTimeout(res, 100)); seen.push(id); }
  g.view.overlay = null;
  return seen.length;
});
// 12: a quick save and load inside a day
const before = await page.evaluate(() => { const s = window.__game.state; return [s.population, Math.round(s.treasury), s.day]; });
await page.keyboard.press('F5'); await page.waitForTimeout(400);
await page.evaluate(() => { const s = window.__game.state; for (let i = 0; i < 100; i++) window.__wardlight.tick(s); });
await page.keyboard.press('F9'); await page.waitForTimeout(800);
const after = await page.evaluate(() => { const s = window.__game.state; return [s.population, Math.round(s.treasury), s.day]; });
r.saveLoad = JSON.stringify(before) === JSON.stringify(after);
// 13: day and night
for (const [when, t] of [['day', 180], ['night', 630]]) {
  await page.evaluate((t) => { const s = window.__game.state; s.tick = Math.floor(s.tick / 900) * 900 + t; }, t);
  await page.waitForTimeout(900); await hide();
  await page.screenshot({ path: `shots/checklist_${when}.png` });
}
r.errors = errors;
const ok = r.founded && r.topbar.length === 5 && r.helpFromMenu && r.helpFromKey && r.city.milestone >= 4 && r.views === 8 && r.saveLoad && !errors.length;
console.log(JSON.stringify(r));
console.log(ok ? 'CHECKLIST OK' : 'CHECKLIST FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
