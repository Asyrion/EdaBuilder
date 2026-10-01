import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(41, 'Council'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  for (let y = f.y - 6; y <= f.y + 8; y++) for (let x = f.x - 8; x <= f.x + 8; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2) s.terrain[i] = 3; }
  w.place(s, 'guildhall', f.x + 3, f.y + 3); w.place(s, 'depot', f.x - 4, f.y + 3); w.place(s, 'nexus', f.x + 5, f.y - 3);
  w.recomputeAll(s);
  s.guilds.standing.carters = 72; s.guilds.standing.sextons = 22; s.milestone = 5;
  g.renderer.camera.centerOnTile(f.x, f.y); g.renderer.camera.setZoom(3); g.ui.refresh();
});
await page.keyboard.press('w'); await page.waitForTimeout(300);
console.log('overlay:', await page.evaluate(() => window.__game.view.overlay));
console.log('legend:', await page.evaluate(() => document.querySelector('#views .legend')?.innerText.replace(/\n/g, ' | ').slice(0, 200)));
await page.screenshot({ path: 'shots/iter24_weave.png' });
await page.keyboard.press('w');
await page.click('#btn-edicts'); await page.waitForTimeout(200);
console.log('council:', await page.evaluate(() => Array.from(document.querySelectorAll('#edicts .guild')).map((g) => g.innerText.replace(/\n/g, ' ').slice(0, 90)).join(' || ')));
await page.screenshot({ path: 'shots/iter24_council.png' });
await page.evaluate(() => document.getElementById('e-close').click());
await page.click('#btn-budget'); await page.waitForTimeout(200);
console.log('routes:', await page.evaluate(() => document.querySelector('#budget .routes')?.innerText.replace(/\n/g, ' | ')));
await page.screenshot({ path: 'shots/iter24_ledger.png' });
await page.evaluate(() => document.getElementById('b-close').click());
// a petition
await page.evaluate(() => { const g = window.__game, s = g.state; s.day = 40; s.guilds.lastCouncil = 0; window.__wardlight.tick; });
await page.evaluate(() => { const s = window.__game.state; const def = window.__wardlight.ALL_EVENTS.find((e) => e.id === 'council_sextons'); s.pendingEvent = { id: def.id, title: def.title, text: def.text, choices: def.choices.map((c) => ({ label: c.label, desc: c.desc })) }; window.__game.ui.refresh(); });
await page.waitForTimeout(200);
console.log('event:', await page.evaluate(() => document.querySelector('#event h2')?.textContent + ' / ' + document.querySelectorAll('#event button').length + ' choices'));
await page.screenshot({ path: 'shots/iter24_petition.png' });
await page.click('#event button:nth-child(1)'); await page.waitForTimeout(200);
console.log('after grant:', await page.evaluate(() => { const s = window.__game.state; return `rites=${s.edicts.rites} sextons=${Math.round(s.guilds.standing.sextons)} demand=${JSON.stringify(s.guilds.demand)}`; }));
// guildhall info panel
await page.evaluate(() => { const g = window.__game, s = g.state; const b = s.buildings.find((b) => b && b.kind === 'guildhall'); g.selected = b; g.view.selected = b; g.ui.refresh(); });
await page.waitForTimeout(200);
console.log('info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').slice(0, 300)));
console.log('errors', errors);
await browser.close();
