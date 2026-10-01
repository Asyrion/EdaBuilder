import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Phase5'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 10; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  w.place(s, 'guildhall', f.x + 2, f.y + 4); w.place(s, 'spire', f.x + 5, f.y + 5); w.place(s, 'depot', f.x - 5, f.y + 4);
  const c1 = w.place(s, 'cradle', f.x + 3, f.y - 3);
  s.dragons.push({ id: s.nextDragonId++, name: 'Marrow', line: 'vein', second: 'ember', trueblood: true, stage: 3, days: 0, cradleId: c1.id, role: 'none', roleTarget: -1, mood: 85, hungry: 0, training: 'gentle', agentId: -1, born: s.day });
  s.relicStock = 14;
  w.recomputeAll(s);
  g.renderer.camera.centerOnTile(f.x, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
// the Wyrms panel before and after the dev "grow" command
await page.evaluate(() => { window.__game.ui.toggleWyrms(true); }); await page.waitForTimeout(150);
console.log('wyvern:', await page.evaluate(() => Array.from(document.querySelectorAll('#wyrms .muted')).map((p) => p.textContent).find((t) => t.includes('trueblood'))?.slice(0, 160)));
await page.evaluate(() => { window.__game.ui.toggleWyrms(false); window.__game.ui.toggleDev(true); }); await page.waitForTimeout(150);
await page.click('#dev button[data-id="grow"]'); await page.waitForTimeout(150);
console.log('grow:', await page.evaluate(() => document.querySelector('#dev .good')?.textContent));
await page.evaluate(() => { window.__game.ui.toggleDev(false); window.__game.ui.toggleWyrms(true); }); await page.waitForTimeout(150);
console.log('wyrm:', await page.evaluate(() => Array.from(document.querySelectorAll('#wyrms .muted')).map((p) => p.textContent).find((t) => t.includes('great wyrm'))?.slice(0, 160)));
await page.screenshot({ path: 'shots/iter29_wyrm.png' });
// the assessor via the dev event select
await page.evaluate(() => { window.__game.ui.toggleWyrms(false); window.__game.ui.toggleDev(true); }); await page.waitForTimeout(150);
await page.selectOption('#dev select[data-arg="event"]', 'assessor');
await page.click('#dev button[data-id="event"]'); await page.waitForTimeout(150);
await page.evaluate(() => window.__game.ui.toggleDev(false)); await page.waitForTimeout(200);
console.log('assessor:', await page.evaluate(() => document.querySelector('#event h2')?.textContent + ' / ' + Array.from(document.querySelectorAll('#event button b')).map((b) => b.textContent).join(' | ')));
await page.screenshot({ path: 'shots/iter29_assessor.png' });
await page.click('#event button:nth-child(1)'); await page.waitForTimeout(150);
console.log('sold:', await page.evaluate(() => { const s = window.__game.state; return `relicStock=${s.relicStock} relicsSold=${s.stats.relicsSold} sextons=${Math.round(s.guilds.standing.sextons)}`; }));
// a guild war via the dev guild commands
await page.evaluate(() => { const s = window.__game.state; s.guilds.standing.alchemists = 10; s.guilds.standing.sextons = 10; s.day = 70; s.guilds.lastCouncil = 70; window.__game.ui.toggleDev(true); }); await page.waitForTimeout(150);
await page.click('#dev button[data-id="day"]'); await page.waitForTimeout(400);
await page.evaluate(() => window.__game.ui.toggleDev(false)); await page.waitForTimeout(200);
console.log('war:', await page.evaluate(() => document.querySelector('#event h2')?.textContent + ' / ' + document.querySelectorAll('#event button').length + ' choices'));
await page.screenshot({ path: 'shots/iter29_war.png' });
await page.click('#event button:nth-child(3)'); await page.waitForTimeout(150);
await page.click('#btn-budget'); await page.waitForTimeout(200);
console.log('routes:', await page.evaluate(() => document.querySelector('#budget .routes')?.innerText.replace(/\n/g, ' | ').slice(0, 160)));
console.log('errors', errors);
await browser.close();
