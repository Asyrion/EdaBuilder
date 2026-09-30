import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(5, 'Millbrook'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight, A = W.actions; const f = s.founding;
    for (let dy = -6; dy <= 12; dy++) for (let dx = -14; dx <= 14; dx++) { const i = (f.y + dy) * s.w + f.x + dx; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  s.milestone = 5; s.treasury = 100000;
  A.buildRoad(s, 1, A.roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  for (let k = 0; k < 6; k++) s.terrain[(f.y + 5) * s.w + f.x + 3 + k] = 1; // a river strip
  s.terrain[(f.y + 5) * s.w + f.x - 13] = 6; s.terrain[(f.y + 6) * s.w + f.x - 13] = 6; s.terrain[(f.y + 4) * s.w + f.x - 13] = 6;
  console.log('mill', JSON.stringify(A.placeBuilding(s, 'torrentmill', f.x + 4, f.y + 4)));
  console.log('gardens', JSON.stringify(A.placeBuilding(s, 'hanginggardens', f.x - 12, f.y + 4)));
  console.log('glim', JSON.stringify(A.placeBuilding(s, 'glimhouse', f.x - 4, f.y + 4)));
  console.log('obs', JSON.stringify(A.placeBuilding(s, 'observatory', f.x, f.y + 4)));
  console.log('glowvine', JSON.stringify(A.buildRoad(s, 4, A.roadPath(f.x - 12, f.y + 7, f.x + 2, f.y + 7, false))));
  A.paintZone(s, 3, f.x - 9, f.y + 8, f.x - 1, f.y + 8);
  W.recomputeAll(s);
  for (let i = 0; i < 2000; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(f.x - 4, f.y + 5); g.renderer.camera.setZoom(3);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter12_day.png' });
await page.evaluate(() => { const g = window.__game; g.state.tick = Math.floor(g.state.tick / 900) * 900 + 640; g.ui.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter12_night.png' });
console.log('ledger forecast:', await page.evaluate(() => { const e = document.querySelector('#tasks .forecast'); return e && !e.classList.contains('hidden') ? e.innerText.replace(/\n/g, ' | ') : 'none'; }));
console.log('lit glowvine tiles:', await page.evaluate(() => { const s = window.__game.state; let n = 0, l = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 4) { n++; if (s.lit[i]) l++; } return `${l}/${n}`; }));
console.log('errors', errors);
await browser.close();
