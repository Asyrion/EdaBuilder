// Iteration 87 (content as data, DESIGN 4.118): the build menu of this build (port 4173) against main's (4174, a build of
// origin/main) for every people at the last milestone: every tab's items, their costs and locks, must be the same, now that
// the buildings, roads and milestones come from src/data/content/*.json. Then a Ley Spire placed by the founding stake, lit.
//   shots/iter87_menu_<people>.png, iter87_spire_4x.png
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
async function open(port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${port} console: ${m.text()}`); });
  await page.goto(`http://localhost:${port}/`, { timeout: 8000 });
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  return page;
}
/** Every tool button of every tab, as "tab | label | cost | locked". */
async function menu(page, people, shot) {
  await page.evaluate((people) => {
    const g = window.__game;
    g.newGame(42, 'Eelwick', 'valley', people);
    for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
    g.paused = true; g.state.milestone = 8; g.state.treasury = 9999999; g.ui.refresh();
  }, people);
  const tabs = await page.$$eval('#toolbar .tabs button', (bs) => bs.map((b) => b.dataset.cat));
  const out = [];
  for (const cat of tabs) {
    await page.click(`#toolbar .tabs button[data-cat="${cat}"]`);
    out.push(...await page.$$eval('#toolbar .items button', (bs, cat) => bs.map((b) => `${cat} | ${b.getAttribute('aria-label')}`), cat));
    if (shot && cat === tabs[1]) await page.screenshot({ path: shot });
  }
  return out;
}

const here = await open('4173'), main = await open('4174');
let same = true;
for (const people of ['vellish', 'grimmen', 'veshari', 'tallowkin']) {
  const a = await menu(here, people, `shots/iter87_menu_${people}.png`), b = await menu(main, people);
  const diff = a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x)).map((x) => `main only: ${x}`));
  console.log(`${people}: ${a.length} tools, ${diff.length ? `DIFFERENT: ${diff.slice(0, 6).join(' / ')}` : 'same as main'}`);
  if (diff.length || a.length !== b.length) same = false;
}
const placed = await here.evaluate(() => {
  const g = window.__game, w = window.__wardlight, s = g.state, f = s.founding;
  g.newGame(42, 'Eelwick', 'valley', 'vellish');
  for (const id of ['help', 'title', 'toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  let at = null;
  for (let r = 3; r < 9 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
    const res = w.place(g.state, 'spire', f.x + dx, f.y + dy);
    if (res && res.ok !== false) at = { x: f.x + dx, y: f.y + dy };
  }
  if (at) { g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(at.x, at.y); g.renderer.invalidateAll(); g.ui.refresh(); }
  return { at, spires: g.state.buildings.filter((b) => b && b.kind === 'spire').length };
});
await here.waitForTimeout(500);
await here.screenshot({ path: 'shots/iter87_spire_4x.png' });
console.log('spire placed:', JSON.stringify(placed));
console.log(same ? 'BUILD MENUS: identical to main for every people' : 'BUILD MENUS: DIFFER');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
