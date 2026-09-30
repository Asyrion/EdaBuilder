// Drives the real UI with mouse/keyboard: draws a road, zones, places a spire and a well, checks state.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
// title screen: found a new wardlight via the real button
await page.fill('#t-name', 'Playwick');
await page.fill('#t-seed', '7');
await page.click('#t-new');
await page.waitForTimeout(200);
// help shows on new game; close with H key
await page.keyboard.press('h');
const tileToScreen = async (x, y) => page.evaluate(([x, y]) => {
  const cam = window.__game.renderer.camera;
  const wx = (x - y) * 16, wy = (x + y) * 8 + 8; // tile centre
  return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom];
}, [x, y]);
const f = await page.evaluate(() => window.__game.state.founding);
// road tool via toolbar button
await page.click('#toolbar .tabs button:has-text("Roads")');
await page.click('#toolbar .items button:has-text("Dirt Track")');
let [ax, ay] = await tileToScreen(f.x - 6, f.y + 3);
let [bx, by] = await tileToScreen(f.x + 8, f.y + 3);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 8 }); await page.mouse.up();
let roads = await page.evaluate(() => window.__game.state.road.reduce((a, b) => a + (b ? 1 : 0), 0));
console.log('roads after drag:', roads);
// zone with keyboard tool + drag
await page.keyboard.press('z');
[ax, ay] = await tileToScreen(f.x - 5, f.y + 4);
[bx, by] = await tileToScreen(f.x + 7, f.y + 5);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
const zoned = await page.evaluate(() => window.__game.state.zone.reduce((a, b) => a + (b ? 1 : 0), 0));
console.log('zoned tiles:', zoned);
// place a spire via Ley tab
await page.click('#toolbar .tabs button:has-text("Ley")');
await page.click('#toolbar .items button:has-text("Ley Spire")');
[ax, ay] = await tileToScreen(f.x + 3, f.y + 2);
await page.mouse.move(ax, ay); await page.mouse.click(ax, ay);
await page.click('#toolbar .tabs button:has-text("Water")');
await page.click('#toolbar .items button:has-text("Well")');
[ax, ay] = await tileToScreen(f.x - 3, f.y + 2);
await page.mouse.click(ax, ay);
const kinds = await page.evaluate(() => window.__game.state.buildings.filter(Boolean).map((b) => b.kind));
console.log('buildings:', kinds);
// run at 3x for a while via UI speed button
await page.click('#sp-3');
await page.waitForTimeout(6000);
const info = await page.evaluate(() => ({ tick: window.__game.state.tick, pop: window.__game.state.population, bld: window.__game.state.buildings.filter(Boolean).length, treasury: window.__game.state.treasury }));
console.log('after 6s at 3x:', info);
// select a building by clicking it
const first = await page.evaluate(() => { const b = window.__game.state.buildings.find((b) => b && b.kind === 'hearth'); return b ? [b.x, b.y] : null; });
if (first) {
  await page.keyboard.press('x');
  const [sx, sy] = await tileToScreen(first[0], first[1]);
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(300);
  console.log('info panel visible:', await page.evaluate(() => !document.getElementById('info').classList.contains('hidden')), 'text:', (await page.textContent('#info h2')));
}
// overlays by key, budget, save/load
await page.keyboard.press('1');
console.log('overlay:', await page.evaluate(() => window.__game.view.overlay));
await page.keyboard.press('Escape');
await page.keyboard.press('F5');
await page.waitForTimeout(200);
console.log('save exists:', await page.evaluate(() => !!localStorage.getItem('wardlight.save.v1')));
await page.keyboard.press('F9');
await page.waitForTimeout(300);
console.log('after load pop:', await page.evaluate(() => window.__game.state.population), 'name', await page.evaluate(() => window.__game.state.cityName));
await page.screenshot({ path: 'shots/playtest.png' });
console.log('errors:', errors);
await browser.close();
