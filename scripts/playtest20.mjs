import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(31, 'Charter'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
const info = await page.evaluate(() => {
  const g = window.__game, s = g.state; s.milestone = 1; s.treasury = 30000;
  const adj = (j) => { const sx = j % 4, sy = Math.floor(j / 4); return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => { const nx = sx + dx, ny = sy + dy; return nx >= 0 && ny >= 0 && nx < 4 && ny < 4 && s.sectors[ny * 4 + nx]; }); };
  let k = -1; for (let j = 0; j < s.sectors.length; j++) if (!s.sectors[j] && adj(j)) { k = j; break; }
  const x = (k % 4) * 32 + 16, y = Math.floor(k / 4) * 32 + 16;
  g.renderer.camera.centerOnTile(x, y); g.renderer.camera.setZoom(2); g.paused = true;
  return { k, x, y, chartered: Array.from(s.sectors).join('') };
});
console.log('target', JSON.stringify(info));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter22_beyond.png' });
await page.mouse.click(700, 400);
await page.waitForTimeout(300);
console.log('panel:', await page.evaluate(() => document.querySelector('#info h2')?.textContent), '|', await page.evaluate(() => document.querySelector('#sec-buy')?.textContent), '| disabled:', await page.evaluate(() => document.querySelector('#sec-buy')?.disabled));
await page.click('#sec-buy');
await page.waitForTimeout(400);
console.log('after buy:', await page.evaluate(() => { const s = window.__game.state; return `sectors=${Array.from(s.sectors).join('')} treasury=${s.treasury} bought=${s.stats.sectorsBought}`; }));
await page.screenshot({ path: 'shots/iter22_bought.png' });
console.log('errors', errors);
await browser.close();
