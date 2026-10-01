import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.click('#t-daily');
await page.evaluate(() => document.getElementById('help').classList.add('hidden'));
await page.waitForTimeout(300);
console.log(await page.evaluate(() => { const s = window.__game.state; return `challenge=${s.challenge} seed=${s.seed} first=${document.querySelector('#tasks .q.now .t')?.textContent}`; }));
// Land tab: clear a forest tile under the cursor
await page.click('#toolbar .tabs button:nth-child(8)');
await page.click('#toolbar .items button:nth-child(1)');
const r = await page.evaluate(() => { const g = window.__game, s = g.state; const f = s.founding; for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const i = (f.y + dy) * s.w + f.x + dx; if (s.terrain[i] === 5 && s.bIndex[i] < 0 && !s.road[i]) { g.renderer.camera.centerOnTile(f.x + dx, f.y + dy); g.renderer.camera.setZoom(3); return [f.x + dx, f.y + dy]; } } return null; });
console.log('forest tile', r);
await page.waitForTimeout(200);
const sx = 750, sy = 425;
await page.mouse.click(sx, sy);
await page.waitForTimeout(200);
console.log(await page.evaluate(() => { const s = window.__game.state; return `terraformed=${s.stats.terraformed} tool=${JSON.stringify(window.__game.tools.tool)}`; }));
await page.screenshot({ path: 'shots/iter19_land.png' });
// keys menu: rebind bulldoze to q
await page.click('#btn-menu'); await page.click('#m-keys'); await page.click('#menu .keyrow[data-k="bulldoze"]'); await page.keyboard.press('q'); await page.click('#k-done');
await page.keyboard.press('q');
console.log('tool after q:', await page.evaluate(() => JSON.stringify(window.__game.tools.tool)), 'keys:', await page.evaluate(() => JSON.stringify(window.__game.settings.keys.bulldoze)));
await page.screenshot({ path: 'shots/iter19_keys.png' });
console.log('errors', errors);
await browser.close();
