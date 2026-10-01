// Hotfix check: a full in-game night creates only a handful of canvas elements, and a day's autosave stays small.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
await page.addInitScript(() => {
  window.__canvasCount = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, o) => { if (String(tag).toLowerCase() === 'canvas') window.__canvasCount++; return orig(tag, o); };
});
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('crash', () => errors.push('PAGE CRASHED'));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-name', 'Nightwick'); await page.fill('#t-seed', '11'); await page.click('#t-new'); await page.waitForTimeout(300); await page.keyboard.press('h');
const tileToScreen = async (x, y) => page.evaluate(([x, y]) => { const cam = window.__game.renderer.camera; const wx = (x - y) * 16, wy = (x + y) * 8 + 8; return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom]; }, [x, y]);
const f = await page.evaluate(() => window.__game.state.founding);
const drag = async (x1, y1, x2, y2) => { const [ax, ay] = await tileToScreen(x1, y1); const [bx, by] = await tileToScreen(x2, y2); await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 10 }); await page.mouse.up(); };
await page.click('#toolbar .tabs button:has-text("Roads")'); await page.click('#toolbar .items button:has-text("Dirt Track")');
await drag(f.x - 8, f.y + 3, f.x + 8, f.y + 3); await drag(f.x + 3, f.y - 6, f.x + 3, f.y + 10);
await page.keyboard.press('z'); await drag(f.x - 7, f.y + 4, f.x + 7, f.y + 5); await drag(f.x - 7, f.y + 1, f.x + 7, f.y + 2);
await page.click('#toolbar .tabs button:has-text("Ley")'); await page.click('#toolbar .items button:has-text("Ley Spire")'); let p = await tileToScreen(f.x + 4, f.y + 2); await page.mouse.click(p[0], p[1]);
await page.click('#toolbar .tabs button:has-text("Water")'); await page.click('#toolbar .items button:has-text("Well")'); p = await tileToScreen(f.x - 3, f.y + 2); await page.mouse.click(p[0], p[1]);
await page.click('#toolbar .tabs button:has-text("Services")'); await page.click('#toolbar .items button:has-text("Watch Post")'); p = await tileToScreen(f.x - 5, f.y + 2); await page.mouse.click(p[0], p[1]);
const start = await page.evaluate(() => window.__canvasCount);
console.log('canvases after setup:', start);
await page.click('#sp-3');
let maxNight = 0;
let last = start;
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => { const s = window.__game.state; return { day: s.day, tod: ((s.tick % 900) / 900).toFixed(2), canvases: window.__canvasCount, glow: window.__game.renderer.particles.list.filter((q) => q.glow).length }; });
  const delta = info.canvases - last; last = info.canvases;
  if (Number(info.tod) > 0.4) maxNight = Math.max(maxNight, delta);
  console.log(JSON.stringify(info), 'new canvases in 4s:', delta);
}
const total = last - start;
console.log('canvases created through the run:', total, '(max per 4 s at night', maxNight + ')');
await page.keyboard.press('F5'); await page.waitForTimeout(200);
const saveKB = await page.evaluate(() => Math.round((localStorage.getItem('wardlight.save.v1') || '').length / 1024));
console.log('save size KB:', saveKB, 'walkerBonus in save:', await page.evaluate(() => (localStorage.getItem('wardlight.save.v1') || '').includes('"walkerBonus"')));
console.log(total < 200 && saveKB < 400 && errors.length === 0 ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
