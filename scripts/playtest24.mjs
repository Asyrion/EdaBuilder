import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Builders'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 10; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  s.milestone = 3; s.treasury = 50000;
  console.log('place', JSON.stringify(w.actions.placeBuilding(s, 'watchhouse', f.x + 5, f.y + 3)), JSON.stringify(w.actions.placeBuilding(s, 'well', f.x - 6, f.y + 3)), JSON.stringify(w.actions.placeBuilding(s, 'academy', f.x + 8, f.y - 2)));
  for (let x = f.x - 8; x <= f.x + 8; x++) s.zone[y_(x)] = 1;
  function y_(x) { return (f.y + 3) * s.w + x; }
  s.zoneListDirty = true;
  w.recomputeAll(s);
  g.renderer.camera.centerOnTile(f.x, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
// run half a day unpaused so builders walk and the sites rise
await page.evaluate(() => { const s = window.__game.state, w = window.__wardlight; for (let k = 0; k < 450; k++) w.tick(s); window.__game.ui.refresh(); });
await page.waitForTimeout(300);
console.log('state:', await page.evaluate(() => { const s = window.__game.state; const sites = s.buildings.filter((b) => b && b.state === 'building'); const bl = s.agents.filter((a) => a.kind === 4); return `tick=${s.tick} sites=${sites.length} builders=${bl.length} phases=${bl.map((a) => a.phase).join(',')} progress=${sites.map((b) => Math.round((1 - b.work / b.workTotal) * 100)).join(',')}`; }));
await page.evaluate(() => { const g = window.__game, s = g.state; const b = s.buildings.find((b) => b && b.kind === 'watchhouse'); g.selected = b; g.view.selected = b; g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').slice(0, 220)));
await page.screenshot({ path: 'shots/iter26_building.png' });
// crop around the site for a close look
await page.evaluate(() => { const g = window.__game; g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(g.state.founding.x + 5, g.state.founding.y + 3); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter26_site.png', clip: { x: 450, y: 200, width: 500, height: 400 } });
// let it finish
await page.evaluate(() => { const s = window.__game.state, w = window.__wardlight; for (let k = 0; k < 2700; k++) w.tick(s); window.__game.ui.refresh(); });
await page.waitForTimeout(300);
console.log('later:', await page.evaluate(() => { const s = window.__game.state; return `tick=${s.tick} sites=${s.buildings.filter((b) => b && b.state === 'building').length} ok=${s.buildings.filter((b) => b && b.state === 'ok').length} msgs=${s.messages.filter((m) => m.text.includes('finished')).map((m) => m.text).slice(0, 2).join(' / ')}`; }));
console.log('errors', errors);
await browser.close();
