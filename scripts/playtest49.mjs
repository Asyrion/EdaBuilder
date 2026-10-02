// Iteration 49: a zone past a road's end grows; the Hamlet lesson card; district slots and locked charters; the zone preview's
// no-road hint; a hearth without a road; the demand tooltip; the imported Founding Stake at stages 0 and 3, day and night.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || /missing sprite|failed to load/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.treasury = 90000; s.sectors.fill(1);
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 2, f.x + 5, f.y + 2, false)); // ends at f.x + 5
  const out = {};
  out.atlas = [w.atlas.has('b_stake_s0'), w.atlas.has('b_stake_s3'), !!w.atlas.get('b_stake_s1').glow];
  // the zone preview over a block past the road's end: the tiles with no road in their ring are bad, with a hint
  g.tools.tool = { kind: 'zone', zone: 1 }; g.tools.dragStart = [f.x + 4, f.y + 3]; g.view.hover = [f.x + 9, f.y + 4]; g.tools.updatePreview();
  out.previewBad = g.view.previewTiles.filter((t) => !t.ok).length; out.previewOk = g.view.previewTiles.filter((t) => t.ok).length; out.previewReason = g.tools.previewReason;
  g.tools.dragStart = null; g.tools.tool = { kind: 'select' };
  // a hearth with its road bulldozed shows the problem
  const h = w.place(s, 'hearth', f.x - 4, f.y + 3); h.state = 'ok'; h.work = 0; h.residents = 3; h.age = 3;
  for (let x = f.x - 5; x <= f.x - 3; x++) w.actions.bulldoze(s, x, f.y + 2);
  w.recomputeAll(s); g.select(h); g.ui.refresh();
  out.noRoad = /No road at its door/.test(document.body.textContent);
  // the Hamlet lesson
  s.milestone = 1; g.ui.refresh();
  const lesson = document.getElementById('lesson');
  out.lesson = !lesson.classList.contains('hidden') && lesson.querySelectorAll('button[data-step]').length === 3;
  out.lessonTitle = lesson.querySelector('h2')?.textContent;
  // district slots and charters
  out.paint3 = w.actions.paintDistrict(s, 3, f.x - 8, f.y - 6, f.x - 2, f.y - 2).reason;
  out.paint1 = w.actions.paintDistrict(s, 1, f.x - 8, f.y - 6, f.x - 2, f.y - 2).ok;
  g.ui.edictScope = 1; g.ui.toggleEdicts(true);
  const locked = [...document.querySelectorAll('#edicts button[data-quarter]')].filter((b) => b.disabled).map((b) => b.dataset.quarter);
  out.lockedCharters = locked; out.lockedText = /opens at the village/i.test(document.getElementById('edicts').textContent);
  g.ui.toggleEdicts(false);
  s.milestone = 3; out.paint3later = w.actions.paintDistrict(s, 3, f.x + 8, f.y - 6, f.x + 12, f.y - 2).ok;
  // the demand sign words
  s.demand.hearth = 0.6; s.demand.market = -0.4; g.ui.refresh();
  out.signs = [...document.querySelectorAll('#demand .sign')].map((e) => e.textContent);
  s.milestone = 0; g.renderer.invalidateAll(); g.ui.refresh();
  g.renderer.camera.centerOnTile(f.x + 3, f.y + 1); g.renderer.camera.setZoom(3);
  g.select(null); s.tick = 180; // noon
  return out;
});
console.log('checks:', JSON.stringify(info));
await page.hover('#demand .col[data-zone="hearth"]');
await page.waitForTimeout(200);
const tip = await page.evaluate(() => document.getElementById('tooltip').textContent);
console.log('tooltip:', tip.slice(0, 120));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter49_stake_s0_day.png', clip: { x: 500, y: 200, width: 400, height: 400 } });
await page.evaluate(() => { const g = window.__game, s = g.state; s.milestone = 7; s.tick = 630; g.renderer.invalidateAll(); g.ui.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter49_stake_s3_night.png', clip: { x: 500, y: 200, width: 400, height: 400 } });
await page.evaluate(() => { const g = window.__game, s = g.state; s.milestone = 3; s.tick = 180; g.renderer.invalidateAll(); g.ui.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter49_stake_s1_day.png', clip: { x: 500, y: 200, width: 400, height: 400 } });
await page.evaluate(() => { const g = window.__game, s = g.state; s.milestone = 6; g.renderer.invalidateAll(); g.ui.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter49_stake_s2_day.png', clip: { x: 500, y: 200, width: 400, height: 400 } });
await page.evaluate(() => { const g = window.__game, s = g.state; s.milestone = 1; s.lessonsSeen = []; s.district.fill(0); g.renderer.camera.setZoom(2); g.ui.refresh(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter49_lesson.png' });
const pass = info.atlas.every(Boolean) && info.previewBad > 0 && info.previewOk > 0 && /no road at the door/.test(info.previewReason ?? '') && info.noRoad && info.lesson && /opens at the Village/.test(info.paint3 ?? '') && info.paint1 && info.lockedCharters.length === 3 && info.lockedText && info.paint3later && info.signs[0] === '▲ more' && info.signs[1] === '▼ fewer' && /^Hearths \+\d+ %/.test(tip) && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
