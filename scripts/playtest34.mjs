import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.click('#title .peoples button[data-fac="grimmen"]'); await page.waitForTimeout(100);
await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 12; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = y >= f.y + 3 ? 6 : 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 4, f.x + 10, f.y + 4, false));
  s.treasury = 80000; s.milestone = 7;
  w.actions.paintZone(s, 1, f.x - 8, f.y + 3, f.x + 8, f.y + 3);
  w.recomputeAll(s);
  g.ui.refreshItems(); g.ui.refresh();
});
const tabs = {};
for (const [name, n] of [['services', 5], ['leisure', 6]]) {
  await page.click(`#toolbar .tabs button:nth-child(${n})`); await page.waitForTimeout(100);
  tabs[name] = await page.evaluate(() => Array.from(document.querySelectorAll('#toolbar .items button')).map((b) => b.textContent.trim().replace(/\s+/g, ' ').replace(/\d+c.*$/, '').trim()));
}
console.log('services:', ['Forge-Temple', 'Golem Foundry'].map((k) => `${k}=${tabs.services.some((t) => t.startsWith(k))}`).join(' '), 'leisure:', ["Underking's Seat", 'Lantern of Vell'].map((k) => `${k}=${tabs.leisure.some((t) => t.startsWith(k))}`).join(' '));
console.log('sprites:', await page.evaluate(() => ['b_forgetemple', 'b_underkingseat'].map((k) => `${k}=${!!window.__wardlight.atlas.get(k)}`).join(' ')));
console.log('tasks:', await page.evaluate(() => Array.from(document.querySelectorAll('#tasks .q .ch')).map((e) => e.textContent).join(' | ')));
for (const id of ['underking_envoy', 'collapse', 'true_leystone']) {
  await page.evaluate(() => { window.__game.ui.toggleDev(true); }); await page.waitForTimeout(80);
  await page.selectOption('#dev select[data-arg="event"]', id);
  await page.click('#dev button[data-id="event"]'); await page.waitForTimeout(80);
  await page.evaluate(() => window.__game.ui.toggleDev(false)); await page.waitForTimeout(150);
  const title = await page.evaluate(() => document.querySelector('#event h2')?.textContent + ' / ' + document.querySelectorAll('#event button').length + ' choices');
  await page.click('#event button:nth-child(1)'); await page.waitForTimeout(100);
  console.log(id + ':', title, '→', await page.evaluate(() => window.__game.state.messages.at(-1).text.slice(0, 90)));
}
await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; console.log('seat', JSON.stringify(w.actions.placeBuilding(s, 'underkingseat', f.x - 4, f.y + 5)), 'forge', JSON.stringify(w.actions.placeBuilding(s, 'forgetemple', f.x + 4, f.y + 5))); for (let k = 0; k < 900; k++) w.tick(s); g.renderer.camera.centerOnTile(f.x, f.y + 5); g.renderer.camera.setZoom(3); g.ui.refresh(); });
await page.waitForTimeout(300);
console.log('placed:', await page.evaluate(() => { const s = window.__game.state; return ['underkingseat', 'forgetemple'].map((k) => { const b = s.buildings.find((b) => b && b.kind === k); return `${k}=${b ? b.state : 'none'}`; }).join(' ') + ` stone=${window.__wardlight ? 'ok' : ''}`; }));
await page.screenshot({ path: 'shots/iter36_grimmen2.png' });
console.log('errors', errors);
await browser.close();
