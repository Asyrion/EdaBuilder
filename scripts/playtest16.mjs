import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 }, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(21, 'Mother'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state; s.milestone = 8; s.treasury = 50000;
  let best = -1, bd = 0; s.nodes.forEach((n, i) => { const d = Math.hypot(n.x - s.founding.x, n.y - s.founding.y); if (i !== s.wyrm.node && d > bd) { bd = d; best = i; } });
  const n = s.nodes[best];
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const x = n.x + dx, y = n.y + dy; if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  g.selectedNode = best; g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(n.x, n.y); g.renderer.camera.setZoom(3); g.ui.refresh();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter18_node.png' });
await page.fill('#n-dname', 'Newlight');
await page.click('#n-daughter');
await page.waitForTimeout(400);
console.log(await page.evaluate(() => { const s = window.__game.state; return `daughter=${s.daughter?.name} stakes=${s.buildings.filter((b) => b && b.kind === 'stake').length} treasury=${s.treasury}`; }));
await page.screenshot({ path: 'shots/iter18_daughter.png' });
// touch: two-finger pan and pinch
const before = await page.evaluate(() => [window.__game.renderer.camera.cx, window.__game.renderer.camera.zoom]);
const cdp = await page.context().newCDPSession(page);
const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
await touch('touchStart', [[600, 400], [800, 400]]);
await touch('touchMove', [[650, 420], [850, 420]]);
await touch('touchMove', [[560, 420], [940, 420]]);
await touch('touchEnd', []);
const after = await page.evaluate(() => [window.__game.renderer.camera.cx, window.__game.renderer.camera.zoom]);
console.log('touch pan/pinch:', before.map((v) => v.toFixed(0)).join(','), '->', after.map((v) => v.toFixed(0)).join(','));
console.log('errors', errors);
await browser.close();
