import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Walkers3'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 14; x <= f.x + 14; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 12, f.y + 2, f.x + 12, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 6, f.y - 8, f.x + 6, f.y + 10, false));
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.terrain[(f.y + 3 + dy) * s.w + (f.x - 10 + dx)] = 8;
  w.place(s, 'academy', f.x + 2, f.y + 3); w.place(s, 'ruindelve', f.x - 10, f.y + 3);
  w.place(s, 'tamerslodge', f.x + 7, f.y - 5); const c = w.place(s, 'cradle', f.x + 7, f.y + 4);
  w.place(s, 'shrine', f.x - 4, f.y + 3); w.place(s, 'temple', f.x + 7, f.y + 7); w.place(s, 'spire', f.x - 1, f.y - 2);
  s.relics.uncatalogued = 2; s.milestone = 6;
  w.recomputeAll(s);
  s.dragons.push({ id: s.nextDragonId++, name: 'Pell', line: 'ember', stage: 1, days: 0, cradleId: c.id, role: 'none', roleTarget: -1, mood: 50, hungry: 0, training: 'gentle', agentId: -1, born: s.day });
  for (let k = 0; k < 1800; k++) w.tick(s);
  g.renderer.camera.centerOnTile(f.x, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
console.log('walkers:', await page.evaluate(() => { const s = window.__game.state; const by = {}; for (const a of s.agents.filter((a) => a.kind === 5)) by[a.job] = (by[a.job] ?? 0) + 1; return JSON.stringify(by) + ' sprites ' + ['scholar', 'tamer', 'pilgrim'].map((j) => !!window.__wardlight.atlas.get(`walker_${j}_0_1`)).join(','); }));
console.log('stats:', await page.evaluate(() => { const s = window.__game.state; return `scholarTrips=${s.stats.scholarTrips} uncatalogued=${s.relics.uncatalogued} pieces=${JSON.stringify(s.relics.pieces)} tamerVisits=${s.stats.tamerVisits} prayers=${s.stats.pilgrimPrayers} dragonMood=${s.dragons[0].mood}`; }));
for (const kind of ['academy', 'tamerslodge', 'shrine']) {
  await page.evaluate((kind) => { const g = window.__game, s = g.state; const b = s.buildings.find((b) => b && b.kind === kind); g.selected = b; g.view.selected = b; g.ui.refresh(); }, kind);
  await page.waitForTimeout(150);
  console.log(kind + ':', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').match(/Walkers \| [^|]*(\| ✦[^|]*)?/)?.[0]));
}
await page.screenshot({ path: 'shots/iter33_walkers.png' });
await page.evaluate(() => { window.__game.ui.toggleDev(true); }); await page.waitForTimeout(100);
console.log('dev jobs:', await page.evaluate(() => Array.from(document.querySelectorAll('#dev select[data-arg="walker"] option')).length));
console.log('errors', errors);
await browser.close();
