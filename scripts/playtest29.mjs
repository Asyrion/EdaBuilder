import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Walkers'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 14; x <= f.x + 14; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 12, f.y + 2, f.x + 12, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 6, f.y - 8, f.x + 6, f.y + 10, false));
  w.place(s, 'watchhouse', f.x + 4, f.y + 3); w.place(s, 'spire', f.x + 8, f.y + 4);
  w.recomputeAll(s);
  for (let k = 0; k < 1400; k++) w.tick(s); // a day passes: the house fields its watchmen and they set out
  g.renderer.camera.centerOnTile(f.x + 4, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
console.log('walkers:', await page.evaluate(() => { const s = window.__game.state; const ws = s.agents.filter((a) => a.kind === 5); return `${ws.length} ${ws.map((a) => `${a.job}@(${a.x.toFixed(1)},${a.y.toFixed(1)}) path=${a.path.length - a.pathIdx}`).join(' ')}`; }));
console.log('sprite:', await page.evaluate(() => !!window.__wardlight.atlas.get('walker_watchman_0_1')));
await page.evaluate(() => { const g = window.__game, s = g.state; const b = s.buildings.find((b) => b && b.kind === 'watchhouse'); g.selected = b; g.view.selected = b; g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').match(/Walkers \| [^|]*/)?.[0]));
await page.screenshot({ path: 'shots/iter31_watchmen.png' });
// a hound meets a watchman
await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight; const a = s.agents.find((a) => a.kind === 5); g.renderer.camera.centerOnTile(Math.floor(a.x), Math.floor(a.y)); g.ui.toggleDev(true); });
await page.click('#dev button[data-id="hounds"]'); await page.waitForTimeout(100);
await page.evaluate(() => { const s = window.__game.state, w = window.__wardlight; const a = s.agents.find((a) => a.kind === 5); for (const h of s.agents) if (h.species === 'hound') { h.x = a.x; h.y = a.y; } for (let k = 0; k < 6; k++) w.tick(s); window.__game.ui.toggleDev(false); const g = window.__game; const b = s.buildings.find((b) => b && b.kind === 'watchhouse'); g.selected = b; g.view.selected = b; g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('after hounds:', await page.evaluate(() => { const s = window.__game.state; return `kills=${s.stats.walkerKills} hounds=${s.agents.filter((a) => a.species === 'hound').length} log=${document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').match(/✦[^|]*/)?.[0] ?? ''}`; }));
await page.evaluate(() => { const g = window.__game; g.ui.toggleDev(true); }); await page.waitForTimeout(100);
console.log('dev select:', await page.evaluate(() => Array.from(document.querySelectorAll('#dev select[data-arg="walker"] option')).map((o) => o.textContent).join(',')));
await page.click('#dev button[data-id="walker"]'); await page.waitForTimeout(100);
console.log('dev spawn:', await page.evaluate(() => document.querySelector('#dev .good')?.textContent));
await page.screenshot({ path: 'shots/iter31_close.png', clip: { x: 400, y: 150, width: 600, height: 450 } });
console.log('errors', errors);
await browser.close();
