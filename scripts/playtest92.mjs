// Iteration 92 (the quests that never complete): in the browser, a quiet city with a Watch Post and a Boneyard on its road
// sees "See the Watch at work" and "See a sexton walk the rounds" complete, with the ticker line and the reward.
//   shots/iter92_ledger.png (the Ledger before), iter92_done.png (after)
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight, null, { timeout: 120000 });
const before = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(42, 'Watchford', 'valley', 'vellish');
  const s = g.state, f = s.founding;
  g.paused = true;
  s.lessonsSeen = ['districts']; s.treasury = 99999; s.milestone = 2;
  for (let y = f.y - 6; y <= f.y + 8; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7 && s.terrain[i] !== 1) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  const put = (k, x, y) => { const b = w.place(s, k, x, y); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; b.workers = 8; } return b; };
  const post = put('watchpost', f.x + 3, f.y + 3);
  const yard = put('boneyard', f.x - 4, f.y + 3);
  for (let k = 0; k < 4; k++) put('hearth', f.x - 9 + k * 2, f.y + 1);
  w.recomputeAll(s);
  ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x, f.y + 2);
  g.renderer.invalidateAll(); g.ui.refresh();
  return { post: !!post, yard: !!yard, done: [...s.questsDone], treasury: s.treasury };
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter92_ledger.png' });
// four days at speed
await page.evaluate(() => { const g = window.__game; g.paused = false; g.speed = 3; });
await page.waitForFunction(() => { const s = window.__game.state; return s.questsDone.includes('w_patrol') && s.questsDone.includes('w_sexton'); }, null, { timeout: 180000, polling: 500 }).catch(() => {});
const after = await page.evaluate(() => {
  const g = window.__game, s = g.state;
  g.paused = true;
  ['lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  g.ui.refresh();
  return {
    day: s.day, watchRounds: s.stats.watchRounds, sextonRounds: s.stats.sextonRounds, houndsKilled: s.stats.walkerKills, restlessLaid: s.stats.restlessLaid,
    patrol: s.questsDone.includes('w_patrol'), sexton: s.questsDone.includes('w_sexton'),
    ticker: s.messages.filter((m) => /Charter task/.test(m.text)).map((m) => m.text).slice(-4),
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter92_done.png' });
console.log('before', JSON.stringify(before));
console.log('after', JSON.stringify(after));
console.log('errors', errors.length ? errors : 'none');
const ok = before.post && before.yard && after.patrol && after.sexton && after.houndsKilled === 0 && after.ticker.some((t) => /See the Watch at work/.test(t)) && !errors.length;
console.log(ok ? 'PLAYTEST 92 OK' : 'PLAYTEST 92 FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
