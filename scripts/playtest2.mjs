import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
// grow with the bot for 30 days, answering events automatically, then force an event
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const bot = new W.Bot(g.state); for (let d = 0; d < 30; d++) { for (let i = 0; i < 900; i++) W.tick(g.state); bot.step(); } W.recomputeAll(g.state); g.renderer.invalidateAll(); g.state.lastEventDay = -100; g.state.population = Math.max(200, g.state.population); });
await page.evaluate(() => { const g = window.__game; let n = 0; while (!g.state.pendingEvent && n++ < 500) window.__wardlight.maybeFireEvent(g.state); });
await page.waitForTimeout(400);
console.log('event modal visible:', await page.evaluate(() => !document.getElementById('event').classList.contains('hidden')), await page.textContent('#event h2'));
const tickBefore = await page.evaluate(() => window.__game.state.tick);
await page.waitForTimeout(800);
console.log('paused during event:', tickBefore === await page.evaluate(() => window.__game.state.tick));
await page.screenshot({ path: 'shots/event.png' });
await page.click('#event .choices button');
await page.waitForTimeout(300);
console.log('event resolved:', await page.evaluate(() => window.__game.state.pendingEvent === null), 'last msg:', await page.evaluate(() => window.__game.state.messages.at(-1).text));
await page.click('#btn-edicts');
await page.waitForTimeout(200);
await page.click('#edicts input[data-key="curfew"]');
await page.waitForTimeout(200);
console.log('curfew on:', await page.evaluate(() => window.__game.state.edicts.curfew));
await page.screenshot({ path: 'shots/edicts.png' });
await page.click('#e-close');
await page.click('#btn-budget');
await page.waitForTimeout(300);
console.log('budget edicts row:', await page.textContent('#budget [data-k="upkeepEdicts"]'));
await page.keyboard.press('Escape');
// select a market to see goods rows
const m = await page.evaluate(() => { const b = window.__game.state.buildings.find((b) => b && b.kind === 'market'); return b ? [b.x, b.y] : null; });
if (m) {
  const [sx, sy] = await page.evaluate(([x, y]) => { const cam = window.__game.renderer.camera; cam.centerOnTile(x, y); const wx = (x - y) * 16, wy = (x + y) * 8 + 8; return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom]; }, m);
  await page.keyboard.press('x');
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(300);
  console.log('market info:', (await page.textContent('#info')).replace(/\s+/g, ' ').slice(0, 200));
}
console.log('errors', errors);
await browser.close();
