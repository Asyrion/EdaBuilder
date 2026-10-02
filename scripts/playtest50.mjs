// Iteration 50: the painted set, part 1. Every imported name is in the atlas, the nine once-invisible buildings draw, and
// screenshots of a forest (day, night), painted ground under roads, and the hero buildings in one town.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; const warns = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.milestone = 8; s.treasury = 90000; s.sectors.fill(1);
  const names = ['grass_0', 'meadow_2', 'forest_1', 'hills_2', 'shore_1', 'tree_11', 'bush_5', 'mushroom_5', 'b_spire', 'b_nexus', 'b_wicktower', 'b_well', 'b_seep', 'b_tidewell', 'b_cistern', 'b_depot', 'b_cartersyard', 'b_ossuary', 'b_sextonchapel', 'b_boneyard', 'b_lyceum'];
  const nine = ['cartersyard', 'chartroom', 'corelantern', 'househall', 'lyceum', 'saltfont', 'sextonchapel', 'wrightslodge', 'wyrmcourt'];
  const out = { missing: names.filter((n) => !w.atlas.has(n)), nineMissing: nine.filter((k) => !w.atlas.has('b_' + k)), counts: [w.atlas.countVariants('tree_'), w.atlas.countVariants('bush_'), w.atlas.countVariants('mushroom_')] };
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x + 4, f.y - 8, f.x + 4, f.y + 10, false));
  const put = (k, x, y) => { const b = w.place(s, k, x, y); b.state = 'ok'; b.work = 0; b.lit = true; return b; };
  put('spire', f.x - 2, f.y + 3); put('nexus', f.x + 6, f.y + 4); put('wicktower', f.x + 1, f.y + 3);
  put('well', f.x - 6, f.y + 3); put('seep', f.x - 8, f.y + 3); put('tidewell', f.x - 10, f.y + 3); put('cistern', f.x - 14, f.y + 3);
  put('depot', f.x - 6, f.y - 2); put('cartersyard', f.x - 10, f.y - 2); put('ossuary', f.x + 6, f.y - 2); put('sextonchapel', f.x + 9, f.y - 2); put('boneyard', f.x + 12, f.y - 2); put('lyceum', f.x - 14, f.y - 2);
  put('chartroom', f.x - 6, f.y - 6); put('corelantern', f.x - 10, f.y - 6); put('househall', f.x + 6, f.y - 6); put('saltfont', f.x + 9, f.y - 6); put('wrightslodge', f.x + 12, f.y - 6); put('wyrmcourt', f.x - 2, f.y + 6);
  for (let y = f.y + 6; y <= f.y + 11; y++) for (let x = f.x + 8; x <= f.x + 17; x++) s.terrain[y * s.w + x] = 5; // a forest block (Terrain.Forest = 5)
  w.recomputeAll(s); g.renderer.invalidateAll(); g.select(null); g.ui.refresh();
  out.forestValue = s.terrain[(f.y + 7) * s.w + f.x + 9];
  g.renderer.camera.centerOnTile(f.x, f.y); g.renderer.camera.setZoom(2); s.tick = 180;
  return out;
});
console.log('checks:', JSON.stringify(info));
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter50_town_day.png' });
await page.evaluate(() => { const g = window.__game; g.state.tick = 630; g.renderer.invalidateAll(); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter50_town_night.png' });
await page.evaluate(() => { const g = window.__game, s = g.state, f = s.founding; s.tick = 180; g.renderer.camera.centerOnTile(f.x + 12, f.y + 8); g.renderer.camera.setZoom(3); g.renderer.invalidateAll(); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter50_forest.png', clip: { x: 300, y: 100, width: 800, height: 600 } });
await page.evaluate(() => { const g = window.__game, s = g.state, f = s.founding; g.renderer.camera.centerOnTile(f.x - 20, f.y + 20); g.renderer.camera.setZoom(1); g.renderer.invalidateAll(); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter50_wild_1x.png' });
const pass = info.missing.length === 0 && info.nineMissing.length === 0 && info.counts[0] >= 12 && info.counts[2] >= 6 && warns.length === 0 && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors, 'warns', warns.slice(0, 5));
await browser.close();
