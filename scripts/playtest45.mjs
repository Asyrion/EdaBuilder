// Iteration 46, the ground has limits: an overdrawn well's panel, a spent mine's panel, the grey at a dark house's door with its icon.
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
  for (let y = f.y - 10; y <= f.y + 16; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 16, f.y + 11, f.x + 16, f.y + 11, false));
  s.waterDist.fill(5);
  // an overdrawn well: thirteen level-3 hearths on one well
  const well = w.place(s, 'well', f.x, f.y + 8);
  const hs = []; for (let k = 0; k < 13; k++) { const b = w.place(s, 'hearth', f.x - 6 + k, f.y + 12, 3); if (b) hs.push(b); }
  // a spent mine on a hill
  for (let dy = -4; dy <= -3; dy++) for (let dx = 8; dx <= 9; dx++) s.terrain[(f.y + dy) * s.w + f.x + dx] = 4;
  const mine = w.place(s, 'mine', f.x + 8, f.y - 4);
  // a dark house with the grey at its door
  const dark = w.place(s, 'hearth', f.x + 14, f.y - 8, 1);
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  for (const b of hs) b.residents = 10;
  if (mine) mine.seam = 0;
  s.gloam[(f.y - 8) * s.w + f.x + 15] = 1; s.gloam[(f.y - 7) * s.w + f.x + 15] = 1;
  w.recomputeAll(s); g.renderer.invalidateAll();
  if (dark) { dark.lit = false; dark.greyDays = 1; }
  g.select(well); g.ui.refresh();
  const txt1 = document.body.textContent;
  const wellRow = /Drawn\s*39 \/ 30/.test(txt1), overdrawn = /Overdrawn/.test(txt1);
  g.select(mine); g.ui.refresh();
  const txt2 = document.body.textContent;
  const seamRow = /Seam\s*cut out/.test(txt2), spent = /Spent/.test(txt2);
  g.select(dark); g.ui.refresh();
  const txt3 = document.body.textContent;
  const grey = /grey is at the door/.test(txt3);
  g.renderer.camera.centerOnTile(f.x + 10, f.y - 4); g.renderer.camera.setZoom(2);
  return { wellRow, overdrawn, dry: hs.filter((b) => !b.watered).length, seamRow, spent, grey, greyDays: dark && dark.greyDays };
});
console.log('panels:', JSON.stringify(info));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter46_ground.png' });
const pass = info.wellRow && info.overdrawn && info.dry === 3 && info.seamRow && info.spent && info.grey && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
