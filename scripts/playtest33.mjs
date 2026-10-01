import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
console.log('peoples:', await page.evaluate(() => Array.from(document.querySelectorAll('#title .peoples button')).map((b) => `${b.querySelector('b').textContent}${b.disabled ? '[disabled]' : ''}`).join(' | ')));
await page.click('#title .peoples button[data-fac="grimmen"]'); await page.waitForTimeout(100);
await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); });
console.log('topbar:', await page.evaluate(() => document.querySelector('#tb-title')?.textContent), 'faction:', await page.evaluate(() => window.__game.state.faction));
const tabs = {};
for (const [name, n] of [['water', 4], ['services', 5]]) {
  await page.click(`#toolbar .tabs button:nth-child(${n})`); await page.waitForTimeout(100);
  tabs[name] = await page.evaluate(() => Array.from(document.querySelectorAll('#toolbar .items button')).map((b) => b.textContent.trim().replace(/\s+/g, ' ').replace(/\d+c.*$/, '').trim()));
}
console.log('water tab:', tabs.water.join(' | '));
console.log('services has:', ['Stone Ward', 'Hatchery', 'Ward Lantern', 'Wyrm-Cradle'].map((k) => `${k}=${tabs.services.some((t) => t.startsWith(k))}`).join(' '));
console.log('sprites:', await page.evaluate(() => ['hearth_l1_v0_grimmen', 'market_l2_v1_grimmen', 'b_seep', 'b_stoneward', 'b_hatchery'].map((k) => `${k}=${!!window.__wardlight.atlas.get(k)}`).join(' ')));
// zone a hill street and let homes rise in stone
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 12; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = y >= f.y + 3 ? 6 : 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 4, f.x + 10, f.y + 4, false));
  s.treasury = 50000;
  console.log('zone', JSON.stringify(w.actions.paintZone(s, 1, f.x - 8, f.y + 3, f.x + 8, f.y + 3)), 'seep', JSON.stringify(w.actions.placeBuilding(s, 'seep', f.x + 3, f.y + 5)), 'ward', JSON.stringify(w.actions.placeBuilding(s, 'stoneward', f.x - 3, f.y + 5)));
  w.recomputeAll(s);
  for (let k = 0; k < 2000; k++) w.tick(s);
  g.renderer.camera.centerOnTile(f.x, f.y + 3); g.renderer.camera.setZoom(3); g.ui.refresh();
});
console.log('homes:', await page.evaluate(() => { const s = window.__game.state; return `${s.buildings.filter((b) => b && b.kind === 'hearth' && b.state === 'ok').length} hearths on hills, stone=${window.__wardlight ? 1 : 0}`; }));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter35_grimmen.png' });
console.log('errors', errors);
await browser.close();
