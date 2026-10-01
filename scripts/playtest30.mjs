import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Walkers2'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 14; x <= f.x + 14; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 12, f.y + 2, f.x + 12, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 6, f.y - 8, f.x + 6, f.y + 10, false));
  w.place(s, 'boneyard', f.x + 4, f.y + 3); w.place(s, 'healer', f.x - 6, f.y + 3); w.place(s, 'spire', f.x + 2, f.y + 3); w.place(s, 'spire', f.x - 3, f.y + 3);
  for (const [x, y] of [[f.x - 1, f.y + 3], [f.x + 7, f.y - 3], [f.x + 7, f.y + 6], [f.x - 8, f.y + 1]]) { const h = w.place(s, 'hearth', x, y); h.residents = 4; h.happiness = 30; }
  s.edicts.wardens = true; s.milestone = 3;
  w.recomputeAll(s);
  for (let k = 0; k < 1400; k++) w.tick(s);
  g.renderer.camera.centerOnTile(f.x, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
console.log('walkers:', await page.evaluate(() => { const s = window.__game.state; const ws = s.agents.filter((a) => a.kind === 5); const by = {}; for (const a of ws) by[a.job] = (by[a.job] ?? 0) + 1; return JSON.stringify(by) + ' sprites ' + ['sexton', 'healer', 'warden'].map((j) => !!window.__wardlight.atlas.get(`walker_${j}_0_1`)).join(','); }));
console.log('stats:', await page.evaluate(() => { const s = window.__game.state; return `healerVisits=${s.stats.healerVisits} wardenRounds=${s.stats.wardenRounds} tended=${s.buildings.filter((b) => b && b.tended >= s.day).length}`; }));
await page.evaluate(() => { const g = window.__game, s = g.state; const b = s.buildings.find((b) => b && b.kind === 'healer'); g.selected = b; g.view.selected = b; g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('healer info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').match(/Walkers \| [^|]*(\| ✦[^|]*)?/)?.[0]));
await page.screenshot({ path: 'shots/iter32_walkers.png' });
await page.evaluate(() => { const g = window.__game; g.ui.toggleDev(true); }); await page.waitForTimeout(100);
console.log('dev jobs:', await page.evaluate(() => Array.from(document.querySelectorAll('#dev select[data-arg="walker"] option')).map((o) => o.textContent).join(',')));
await page.selectOption('#dev select[data-arg="walker"]', 'sexton');
await page.click('#dev button[data-id="walker"]'); await page.waitForTimeout(100);
console.log('dev spawn:', await page.evaluate(() => document.querySelector('#dev .good')?.textContent));
console.log('errors', errors);
await browser.close();
