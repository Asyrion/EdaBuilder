import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(17, 'Skydock'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight, A = W.actions; const f = s.founding;
  for (let dy = -6; dy <= 14; dy++) for (let dx = -24; dx <= 24; dx++) { const x = f.x + dx, y = f.y + dy; if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  s.milestone = 8; s.treasury = 300000; s.day = 32;
  for (let x = f.x - 20; x <= f.x + 20; x++) s.terrain[(f.y + 9) * s.w + x] = 1;
  A.buildRoad(s, 1, A.roadPath(f.x - 20, f.y + 7, f.x + 20, f.y + 7, false));
  A.buildRoad(s, 1, A.roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  A.buildRoad(s, 1, A.roadPath(f.x, f.y + 3, f.x, f.y + 7, true));
  console.log('quayA', JSON.stringify(A.placeBuilding(s, 'quay', f.x - 18, f.y + 8)));
  console.log('quayB', JSON.stringify(A.placeBuilding(s, 'quay', f.x + 18, f.y + 8)));
  console.log('dock', JSON.stringify(A.placeBuilding(s, 'skydock', f.x + 2, f.y + 4)));
  console.log('mews', JSON.stringify(A.placeBuilding(s, 'drakemews', f.x - 6, f.y + 4)));
  A.placeBuilding(s, 'spire', f.x + 5, f.y + 2); A.placeBuilding(s, 'spire', f.x - 3, f.y + 2);
  for (let k = 0; k < 3; k++) { const c = W.place(s, 'craft', f.x - 16 + k * 2, f.y + 6, 3); c.stock = 60; c.workers = 8; }
  for (let k = 0; k < 3; k++) { const m = W.place(s, 'market', f.x + 12 + k * 2, f.y + 6, 2); m.stock = 0; m.workers = 4; }
  W.place(s, 'arcane', f.x - 8, f.y + 2, 3);
  W.recomputeAll(s);
  for (let i = 0; i < 950; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(f.x, f.y + 6); g.renderer.camera.setZoom(2);
});
await page.waitForTimeout(400);
console.log(await page.evaluate(() => { const s = window.__game.state; return `air=${s.airship.status} goods=${Math.round(s.airship.goods)} agents: airship=${s.agents.filter((a) => a.species === 'airship').length} riders=${s.agents.filter((a) => a.species === 'rider').length} barges=${s.agents.filter((a) => a.kind === 1 && a.variant === 4).length} floats=${s.agents.filter((a) => a.kind === 1 && a.variant === 3).length} bargeTrips=${s.stats.bargeTrips}`; }));
await page.screenshot({ path: 'shots/iter15_scene.png' });
console.log('errors', errors);
await browser.close();
