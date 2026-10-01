import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(21, 'Phase6'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 8; y <= f.y + 10; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  w.place(s, 'guildhall', f.x + 2, f.y + 4); w.place(s, 'spire', f.x + 5, f.y + 5); w.place(s, 'depot', f.x - 5, f.y + 4);
  const c1 = w.place(s, 'cradle', f.x + 3, f.y - 3);
  s.dragons.push({ id: s.nextDragonId++, name: 'Marrow', line: 'vein', second: 'ember', trueblood: true, stage: 4, days: 0, cradleId: c1.id, role: 'none', roleTarget: -1, mood: 85, hungry: 0, training: 'gentle', agentId: -1, born: s.day });
  s.relicStock = 10; s.treasury = 9000; s.guilds.standing.carters = 80;
  w.recomputeAll(s);
  g.renderer.camera.centerOnTile(f.x, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
});
await page.evaluate(() => window.__game.ui.toggleEdicts(true)); await page.waitForTimeout(200);
console.log('charter buttons:', await page.evaluate(() => Array.from(document.querySelectorAll('#edicts button[data-charter]')).map((b) => b.textContent).join(' | ')));
await page.click('#edicts button[data-charter="carters"]'); await page.waitForTimeout(200);
console.log('after charter:', await page.evaluate(() => { const s = window.__game.state; return `charters=${s.guilds.charters} treasury=${s.treasury} buttons=${document.querySelectorAll('#edicts button[data-charter]').length} text=${Array.from(document.querySelectorAll('#edicts .guild')).map((g) => g.innerText).find((t) => t.includes('chartered'))?.slice(0, 40)}`; }));
await page.screenshot({ path: 'shots/iter30_charter.png' });
await page.evaluate(() => { window.__game.ui.toggleEdicts(false); window.__game.ui.toggleDev(true); }); await page.waitForTimeout(150);
await page.selectOption('#dev select[data-arg="event"]', 'caravan');
await page.click('#dev button[data-id="event"]'); await page.waitForTimeout(150);
await page.evaluate(() => window.__game.ui.toggleDev(false)); await page.waitForTimeout(200);
console.log('caravan:', await page.evaluate(() => Array.from(document.querySelectorAll('#event button b')).map((b) => b.textContent).join(' | ')));
await page.click('#event button:nth-child(4)'); await page.waitForTimeout(150);
console.log('auction:', await page.evaluate(() => { const s = window.__game.state; return `relicStock=${s.relicStock} auctioned=${s.stats.relicsAuctioned} msg=${s.messages.at(-1).text.slice(0, 120)}`; }));
// the duel
await page.evaluate(() => { const g = window.__game, s = g.state; if (s.wyrm.node >= 0) { s.wyrm.state = 'awake'; } g.ui.toggleDev(true); }); await page.waitForTimeout(150);
await page.click('#dev button[data-id="flyover"]'); await page.waitForTimeout(150);
console.log('duel:', await page.evaluate(() => { const s = window.__game.state; return `duels=${s.stats.wyrmDuels} last=${document.querySelector('#dev .good')?.textContent} msg=${s.messages.filter((m) => m.text.includes('rises from its cradle')).length}`; }));
console.log('errors', errors);
await browser.close();
