import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(9, 'Longwood'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight, A = W.actions; const f = s.founding;
  for (let dy = -6; dy <= 12; dy++) for (let dx = -30; dx <= 30; dx++) { const x = f.x + dx, y = f.y + dy; if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  s.milestone = 7; s.treasury = 200000;
  A.buildRoad(s, 1, A.roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  console.log('tree', JSON.stringify(A.placeBuilding(s, 'worldtree', f.x + 2, f.y + 4)));
  console.log('arch1', JSON.stringify(A.placeBuilding(s, 'portalarch', f.x - 4, f.y + 4)));
  console.log('arch2', JSON.stringify(A.placeBuilding(s, 'portalarch', f.x - 10, f.y + 4)));
  A.placeBuilding(s, 'spire', f.x - 2, f.y + 2);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.terrain[(f.y + 4 + dy) * s.w + f.x + 8 + dx] = 8;
  console.log('delve', JSON.stringify(A.placeBuilding(s, 'ruindelve', f.x + 8, f.y + 4)));
  const t = s.buildings.find((b) => b && b.kind === 'worldtree'); t.age = 90;
  W.recomputeAll(s);
  for (let i = 0; i < 500; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(f.x + 2, f.y + 5); g.renderer.camera.setZoom(2);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter13_scene.png' });
// minimap: click near the top-left of the minimap should move the camera
const before = await page.evaluate(() => [window.__game.renderer.camera.cx, window.__game.renderer.camera.cy]);
const box = await page.$eval('#minimap canvas', (c) => { const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
await page.mouse.click(box[0] + box[2] * 0.5, box[1] + box[3] * 0.25);
const after = await page.evaluate(() => [window.__game.renderer.camera.cx, window.__game.renderer.camera.cy]);
console.log('camera moved by minimap:', before.map((v) => v.toFixed(0)).join(','), '->', after.map((v) => v.toFixed(0)).join(','));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter13_minimap_jump.png' });
// ruins terrain on the real map
await page.evaluate(() => { const g = window.__game, s = g.state; for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === 8) { g.renderer.camera.centerOnTile(i % s.w, (i / s.w) | 0); break; } g.renderer.camera.setZoom(3); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter13_ruins.png' });
console.log('errors', errors);
await browser.close();
