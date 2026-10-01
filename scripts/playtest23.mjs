import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Phase3'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 10; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
  w.place(s, 'guildhall', f.x + 2, f.y + 4); w.place(s, 'spire', f.x + 5, f.y + 5); w.place(s, 'depot', f.x - 5, f.y + 4);
  const c1 = w.place(s, 'cradle', f.x + 3, f.y - 3); w.place(s, 'cradle', f.x - 4, f.y - 3); w.place(s, 'spire', f.x + 6, f.y - 5); w.place(s, 'spire', f.x - 7, f.y - 5);
  w.recomputeAll(s);
  s.guilds.standing.carters = 95; s.guilds.pleasedDays.carters = 9; s.milestone = 5;
  g.renderer.camera.centerOnTile(f.x, f.y); g.renderer.camera.setZoom(3); g.ui.refresh();
});
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  const c1 = s.buildings.find((b) => b && b.kind === 'cradle');
  // two drakes in the first cradle
  const a = w.addEgg ? null : null;
  g.renderer.camera.centerOnTile(f.x, f.y);
});
// give dragons via the sim's own egg function through a wyrmcraft import exposed? use actions: dragons array directly
await page.evaluate(() => {
  const s = window.__game.state; const c1 = s.buildings.find((b) => b && b.kind === 'cradle');
  const mk = (line, name) => ({ id: s.nextDragonId++, name, line, stage: 2, days: 0, cradleId: c1.id, role: 'none', roleTarget: -1, mood: 85, hungry: 0, training: 'gentle', agentId: -1, born: s.day });
  s.dragons.push(mk('vein', 'Ashvel'), mk('ember', 'Cinder'));
  window.__game.selected = c1; window.__game.view.selected = c1; window.__game.ui.refresh();
});
await page.waitForTimeout(200);
console.log('cradle info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').slice(0, 320)));
await page.screenshot({ path: 'shots/iter25_cradle.png' });
// one day passes: the carters raise their yard
await page.evaluate(() => { const g = window.__game, s = g.state; s.day = 50 - 1; g.paused = false; });
await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight; s.tick = s.day * 900 + 899; w.tick(s); w.tick(s); g.paused = true; g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('after day:', await page.evaluate(() => { const s = window.__game.state; return `day=${s.day} halls=${s.stats.guildHalls} yard=${!!s.buildings.find((b) => b && b.kind === 'cartersyard')} dragons=${s.dragons.map((d) => d.name + ':' + d.line + (d.second ? '/' + d.second : '')).join(',')} crossEggs=${s.stats.crossEggs}`; }));
await page.evaluate(() => { const g = window.__game, s = g.state; const y = s.buildings.find((b) => b && b.kind === 'cartersyard'); if (y) { g.selected = y; g.view.selected = y; g.renderer.camera.centerOnTile(y.x, y.y); } g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('yard info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').slice(0, 260)));
await page.screenshot({ path: 'shots/iter25_yard.png' });
await page.evaluate(() => { const g = window.__game; g.selected = null; g.view.selected = null; g.ui.refresh(); g.ui.toggleWyrms(true); }); await page.waitForTimeout(200);
console.log('wyrms:', await page.evaluate(() => Array.from(document.querySelectorAll('#wyrms .muted')).map((p) => p.textContent).filter((t) => t.includes('crossed') || t.includes('fainter')).join(' || ').slice(0, 300)));
await page.screenshot({ path: 'shots/iter25_wyrms.png' });
await page.evaluate(() => { window.__game.ui.toggleWyrms(false); window.__game.ui.toggleEdicts(true); }); await page.waitForTimeout(200);
console.log('council:', await page.evaluate(() => Array.from(document.querySelectorAll('#edicts .guild')).map((g) => g.innerText.replace(/\n/g, ' ')).filter((t) => t.includes('stands') || t.includes('toward')).join(' || ').slice(0, 300)));
console.log('errors', errors);
await browser.close();
