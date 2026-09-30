import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(19, 'Fenmarch'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight, A = W.actions; const f = s.founding;
  for (let dy = -6; dy <= 12; dy++) for (let dx = -16; dx <= 16; dx++) { const x = f.x + dx, y = f.y + dy; if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  s.milestone = 7; s.treasury = 200000;
  A.buildRoad(s, 1, A.roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  console.log('font', JSON.stringify(A.placeBuilding(s, 'fontquieting', f.x + 4, f.y + 4)));
  for (let k = 0; k < 5; k++) { const h = W.place(s, 'hearth', f.x - 8 + k, f.y + 4, 2); h.residents = 3; }
  A.placeBuilding(s, 'spire', f.x + 2, f.y + 2);
  W.recomputeAll(s);
  s.storms.push({ x: f.x - 6, y: f.y + 6, until: s.day + 4, vx: 0, vy: 0 });
  s.agents.push({ id: 9100, kind: 3, x: f.x - 3.5, y: f.y + 7.5, path: [], pathIdx: 0, speed: 1.9, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, species: 'tiger', anchorId: -1, ax: f.x - 3.5, ay: f.y + 7.5 });
  s.tick = 640;
  for (let i = 0; i < 60; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(f.x - 2, f.y + 5); g.renderer.camera.setZoom(3);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter16_scene.png' });
console.log(await page.evaluate(() => { const s = window.__game.state; return `storms=${s.storms.length} tiger=${s.agents.filter((a) => a.species === 'tiger').length} atlas fen drake=${window.__wardlight.atlas.get('dragon_8_2_0') ? 'ok' : 'missing'} tiger=${window.__wardlight.atlas.get('tiger_0') ? 'ok' : 'missing'}`; }));
console.log('errors', errors);
await browser.close();
