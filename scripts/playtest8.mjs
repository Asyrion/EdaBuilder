import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter10_start.png' });
console.log('ledger start:', await page.evaluate(() => document.querySelector('#tasks .list').innerText.slice(0, 200)));
// Click "Show me" on the first quest: should pick the road tool.
await page.click('#tasks .q.now button.show');
console.log('tool after show me:', await page.evaluate(() => JSON.stringify(window.__game.tool)));
// Bot-run 25 days so quests complete and the chronicle fills.
await page.evaluate(() => {
  const g = window.__game, W = window.__wardlight; const s = g.state;
  const bot = new W.Bot(s); for (let d = 0; d < 25; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); if (s.pendingEvent) W.resolveEvent(s, 0); }
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(s.founding.x, s.founding.y + 4); g.renderer.camera.setZoom(2);
});
await page.waitForTimeout(500);
console.log('quests done:', await page.evaluate(() => window.__game.state.questsDone.join(',')));
console.log('ledger later:', await page.evaluate(() => document.querySelector('#tasks').innerText.replace(/\n+/g, ' | ').slice(0, 400)));
await page.screenshot({ path: 'shots/iter10_ledger.png' });
await page.keyboard.press('c'); await page.waitForTimeout(300);
console.log('chronicle entries:', await page.evaluate(() => document.querySelectorAll('#chronicle .e').length), 'jumps:', await page.evaluate(() => document.querySelectorAll('#chronicle .jump').length));
await page.screenshot({ path: 'shots/iter10_chronicle.png' });
const jump = await page.$('#chronicle .jump');
if (jump) { await jump.click(); await page.waitForTimeout(200); console.log('chronicle hidden after jump:', await page.evaluate(() => document.getElementById('chronicle').classList.contains('hidden'))); }
console.log('errors', errors);
await browser.close();
