// Iteration 48, unrest with teeth: the riot tale's modal, a market's theft problem, the Hospice's draughts row,
// the Guildhall's petition clock, the Wrights' vent button, and the kin rings drawn while placing a spire.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.milestone = 6; s.treasury = 90000; s.sectors.fill(1);
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  const m = w.place(s, 'market', f.x - 2, f.y + 1, 1);
  const h = w.place(s, 'hospice', f.x + 4, f.y + 3);
  const gh = w.place(s, 'guildhall', f.x - 8, f.y - 3);
  const wl = w.place(s, 'wrightslodge', f.x + 10, f.y - 3);
  for (let k = 0; k < 3; k++) { const hh = w.place(s, 'hearth', f.x + 2 + k * 2, f.y + 4); hh.residents = 4; }
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  m.stock = 20; m.workers = 3; h.lit = true; h.workers = 16; h.stock = 0; gh.lit = true; wl.lit = true; wl.cooldown = 0;
  s.coverage.watch.fill(0); s.unrest = 0.4; s.manaStorage = 25; s.guilds.lastCouncil = s.day - 4;
  w.recomputeAll(s); s.coverage.watch.fill(0); gh.lit = true; wl.lit = true; g.renderer.invalidateAll(); // no spire here: the halls are lit by hand
  g.select(m); g.ui.refresh();
  const t1 = document.body.textContent;
  const theft = /Theft: a tenth of the shelves a night\. Watch here 0 %/.test(t1);
  g.select(h); g.ui.refresh();
  const t2 = document.body.textContent;
  const draughts = /Draughts\s*0 \/ 10/.test(t2), dry = /No draughts/.test(t2);
  g.select(gh); g.ui.refresh();
  const t3 = document.body.textContent;
  const petition = /Next petition\s*in \d+ days?, from the/.test(t3);
  g.select(wl); g.ui.refresh();
  const btn = [...document.querySelectorAll('button')].find((b) => /Vent the store/.test(b.textContent));
  const ventEnabled = !!btn && !btn.disabled;
  if (btn) btn.click();
  const vented = s.manaStorage < 25 && s.overdrawDays === -4 && wl.cooldown === 30; // the store is emptied, then the day's surplus slice trickles back
  // the riot
  s.unrestHigh = 5; w.maybeFireRiot(s); g.ui.refresh();
  const modal = document.getElementById('event');
  const riotShown = !modal.classList.contains('hidden') && /riot/i.test(modal.textContent) && /watch coverage \d+ %/.test(modal.textContent);
  const riotTitle = modal.querySelector('h2')?.textContent;
  w.resolveEvent(s, 1); g.ui.refresh();
  const riotClosed = modal.classList.contains('hidden') && s.stats.riots === 1;
  // the kin rings while placing a spire: a ghost beside the stake
  g.view.ghost = { key: 'spire', x: f.x + 6, y: f.y - 6, ok: true, radius: 6 + 2 };
  g.renderer.camera.centerOnTile(f.x, f.y); g.renderer.camera.setZoom(2);
  return { theft, draughts, dry, petition, ventEnabled, vented, riotShown, riotTitle, riotClosed };
});
console.log('panels:', JSON.stringify(info));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter48_rings.png' });
// the modal once more for the screenshot of the tale
await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight; g.view.ghost = null; s.unrestHigh = 5; w.maybeFireRiot(s); g.ui.refresh(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter48_riot.png' });
const pass = info.theft && info.draughts && info.dry && info.petition && info.ventEnabled && info.vented && info.riotShown && info.riotClosed && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
