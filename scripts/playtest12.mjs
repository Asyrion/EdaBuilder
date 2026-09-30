import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(13, 'Foundry'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight, A = W.actions; const f = s.founding;
  for (let dy = -6; dy <= 12; dy++) for (let dx = -20; dx <= 20; dx++) { const x = f.x + dx, y = f.y + dy; if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  s.milestone = 6; s.treasury = 200000; s.day = 36;
  A.buildRoad(s, 1, A.roadPath(f.x - 12, f.y + 3, f.x + 12, f.y + 3, false));
  console.log('foundry', JSON.stringify(A.placeBuilding(s, 'golemfoundry', f.x - 6, f.y + 4)));
  console.log('beacon', JSON.stringify(A.placeBuilding(s, 'leybeacon', f.x + 2, f.y + 4)));
  console.log('mews', JSON.stringify(A.placeBuilding(s, 'drakemews', f.x + 6, f.y + 4)));
  A.placeBuilding(s, 'spire', f.x - 2, f.y + 2); A.placeBuilding(s, 'spire', f.x + 4, f.y + 2);
  W.recomputeAll(s);
  // a wild warden and a bound one, and a school of rays over the beacon
  s.agents.push({ id: 9001, kind: 3, x: f.x - 10.5, y: f.y + 6.5, path: [], pathIdx: 0, speed: 0.45, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, species: 'golem', anchorId: -1, ax: f.x - 10.5, ay: f.y + 6.5 });
  s.agents.push({ id: 9002, kind: 3, x: f.x - 5.5, y: f.y + 6.5, path: [], pathIdx: 0, speed: 0.45, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 1, species: 'golem', anchorId: -1, ax: f.x - 5.5, ay: f.y + 6.5 });
  for (let k = 0; k < 5; k++) s.agents.push({ id: 9010 + k, kind: 3, x: f.x + 2 + k, y: f.y + 8, path: [], pathIdx: 0, speed: 1.8, homeId: -1, targetId: -1, timer: 0, variant: k, dir: 0, load: 0, species: 'skyray', anchorId: -1, ax: 0, ay: 0, alt: 60, phase: 1 });
  for (let i = 0; i < 200; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(f.x, f.y + 5); g.renderer.camera.setZoom(3);
});
await page.waitForTimeout(400);
console.log('rays lured:', await page.evaluate(() => window.__game.state.agents.filter((a) => a.species === 'skyray' && a.phase === 1).length), 'golems:', await page.evaluate(() => window.__game.state.agents.filter((a) => a.species === 'golem').map((a) => `${a.load ? 'bound' : 'wild'}@${a.x.toFixed(0)},${a.y.toFixed(0)}`).join(' ')));
await page.screenshot({ path: 'shots/iter14_scene.png' });
await page.click('#btn-edicts'); await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/iter14_edicts.png' });
console.log('errors', errors);
await browser.close();
