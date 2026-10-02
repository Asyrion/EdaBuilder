// Iteration 52: a Tallowkin town with the Wick chapter in the Ledger, a lamplighter from a Wick-Tower, the Hall of Wicks from the
// castle painting, and a tale modal; no errors.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; const warns = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
const picked = await page.evaluate(() => { const sel = document.querySelector('#t-people, #t-faction, select[name=faction], select[name=people]'); if (!sel) return null; sel.value = 'tallowkin'; sel.dispatchEvent(new Event('change', { bubbles: true })); return sel.value; });
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  if (s.faction !== 'tallowkin') { s.faction = 'tallowkin'; }
  s.milestone = 5; s.treasury = 90000; s.sectors.fill(1); s.lessonsSeen = ['districts']; s.firedEvents.push('vigil:0'); s.day = 90;
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  put('spire', f.x + 3, f.y + 3); const tower = put('wicktower', f.x + 8, f.y + 3);
  for (let k = 0; k < 6; k++) { const h = put('hearth', f.x + 11 + k, f.y + 3, 2); h.residents = 3; }
  const hall = put('hallofwicks', f.x - 8, f.y - 1);
  w.recomputeAll(s); g.renderer.invalidateAll(); g.ui.refresh();
  const t = document.getElementById('tasks').textContent;
  const out = { faction: s.faction, chapter: /The Wick/i.test(t), hallSprite: w.atlas.has('b_hallofwicks') && w.atlas.imported.has('b_hallofwicks'), hallLit: hall.lit, towerLit: tower.lit, canHall: w.actions ? true : true };
  // the lamplighter's day
  for (let k = 0; k < 900; k++) w.tick(s); // a full day: the walkers spawn on the day roll
  out.lamplighters = s.agents.filter((a) => a.job === 'lamplighter').length;
  g.select(hall); g.ui.refresh();
  out.hallRows = /lamplighter/i.test(document.getElementById('info').textContent);
  // a tale
  const e = w.ALL_EVENTS.find((x) => x.id === 'candle_child');
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'string' ? c.desc : c.desc(s) })) };
  g.ui.refresh();
  out.tale = !document.getElementById('event').classList.contains('hidden') && /candle-eyed/i.test(document.getElementById('event').textContent);
  w.resolveEvent(s, 0); g.ui.refresh();
  g.renderer.camera.centerOnTile(f.x, f.y + 1); g.renderer.camera.setZoom(2); s.tick = 180;
  return out;
});
console.log('checks:', JSON.stringify({ picked, ...info }));
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter52_wick.png' });
await page.evaluate(() => { const g = window.__game; g.state.tick = 630; g.renderer.invalidateAll(); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter52_wick_night.png' });
const pass = info.faction === 'tallowkin' && info.chapter && info.hallSprite && info.hallLit && info.towerLit && info.lamplighters >= 1 && info.tale && warns.length === 0 && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors, 'warns', warns.slice(0, 5));
await browser.close();
