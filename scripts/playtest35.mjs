import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.click('#title .peoples button[data-fac="grimmen"]'); await page.waitForTimeout(100);
await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); });
console.log('ridge:', await page.evaluate(() => { const s = window.__game.state, f = s.founding; let n = 0; for (let dy = 6; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) if (s.terrain[(f.y + dy) * s.w + f.x + dx] === 6) n++; return n; }));
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 4; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 6, f.y + 2, f.x + 6, f.y - 5, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 8, f.y - 5, f.x + 8, f.y - 5, false));
  s.treasury = 50000; s.milestone = 2;
  console.log('ward', JSON.stringify(w.actions.placeBuilding(s, 'stoneward', f.x + 4, f.y + 3)));
  // A Gloam strip one tile north of the upper road, well outside the founding node's three-tile ring.
  for (let x = f.x - 8; x <= f.x + 8; x++) { const i = (f.y - 6) * s.w + x; if (s.bIndex[i] < 0 && s.road[i] === 0) s.gloam[i] = 1; }
  w.recomputeAll(s);
  for (let k = 0; k < 2200; k++) w.tick(s);
  g.renderer.camera.centerOnTile(f.x + 2, f.y - 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
console.log('walkers:', await page.evaluate(() => { const s = window.__game.state; return s.agents.filter((a) => a.kind === 5).map((a) => a.job).join(',') + ` burned=${s.stats.gloamBurned} sprite=${!!window.__wardlight.atlas.get('walker_stonesexton_0_1')}`; }));
await page.evaluate(() => { const g = window.__game, s = g.state; const b = s.buildings.find((b) => b && b.kind === 'stoneward'); g.selected = b; g.view.selected = b; g.ui.refresh(); });
await page.waitForTimeout(150);
console.log('ward info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').match(/Walkers \| [^|]*(\| ✦[^|]*)?/)?.[0]));
await page.screenshot({ path: 'shots/iter37_stonesexton.png' });
await page.evaluate(() => { window.__game.ui.toggleDev(true); }); await page.waitForTimeout(100);
console.log('dev jobs:', await page.evaluate(() => document.querySelectorAll('#dev select[data-arg="walker"] option').length));
console.log('errors', errors);
await browser.close();
