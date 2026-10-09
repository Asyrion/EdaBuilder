// Iteration 93 (what a task still needs): the Ledger's live status lines in the browser, at three moments of a new city:
// before building (the Cistern not built), while the Cistern rises (n %), and with a Ward Lantern standing unlit.
//   shots/iter93_before.png, iter93_rising.png, iter93_unlit.png
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight, null, { timeout: 120000 });
const lines = () => page.evaluate(() => [...document.querySelectorAll('#tasks .q')].map((q) => `${q.querySelector('.t')?.textContent?.trim()} | ${q.querySelector('.st')?.textContent?.trim() ?? '(no line)'}`));
const shot = async (name) => {
  await page.evaluate(() => { const g = window.__game; ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden')); g.ui.refresh(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/iter93_${name}.png`, clip: { x: 0, y: 40, width: 640, height: 560 } });
  return lines();
};
await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(42, 'Lineford', 'valley', 'vellish');
  const s = g.state, f = s.founding;
  g.paused = true;
  s.lessonsSeen = ['districts']; s.treasury = 99999; s.milestone = 2; s.sectors.fill(1);
  // the early tasks done, so the Ledger shows the ones of the user's screenshot
  s.questsDone.push('f_road', 'f_hearth', 'f_jobs', 'f_spire', 'f_well', 'f_watch', 'f_sector', 'f_hamlet', 'l_all', 'l_water', 'd_boneyard', 'w_ford', 'x_paint', 'b_moths', 'c_thorp', 'w_pilgrim', 'w_healer', 'o_cart', 'w_fish', 'w_thatch');
  for (let y = f.y - 6; y <= f.y + 8; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7 && s.terrain[i] !== 1) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x, f.y + 2);
  g.renderer.invalidateAll();
});
const before = await shot('before');
const rising = await page.evaluate(() => {
  const g = window.__game, s = g.state, f = s.founding, w = window.__wardlight;
  const r = w.actions.placeBuilding(s, 'cistern', f.x - 6, f.y + 3);
  const site = s.buildings.find((b) => b && b.kind === 'cistern');
  if (site && site.workTotal) site.work = Math.round(site.workTotal * 0.6);
  return r.ok;
});
const risingLines = await shot('rising');
await page.evaluate(() => {
  const g = window.__game, s = g.state, f = s.founding, w = window.__wardlight;
  w.actions.placeBuilding(s, 'wardlantern', f.x + 9, f.y + 3);
  const l = s.buildings.find((b) => b && b.kind === 'wardlantern');
  if (l) { l.state = 'ok'; l.work = 0; l.lit = false; }
});
const unlitLines = await shot('unlit');
console.log('before', JSON.stringify(before, null, 1));
console.log('rising', rising, JSON.stringify(risingLines, null, 1));
console.log('unlit', JSON.stringify(unlitLines, null, 1));
console.log('errors', errors.length ? errors : 'none');
const has = (ls, re) => ls.some((l) => re.test(l));
const ok = has(before, /Cistern.*Not built yet/) && has(risingLines, /Cistern.*Being built: \d+ %/) && has(unlitLines, /Burn back.*unlit/) && !errors.length;
console.log(ok ? 'PLAYTEST 93 OK' : 'PLAYTEST 93 FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
