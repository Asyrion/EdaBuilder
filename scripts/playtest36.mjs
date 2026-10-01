// Iteration 38: a Grimmen game lists the Delve and the Deep Cut, a Vellish game neither; a quarry stands on a delved tile.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

async function newGame(fac) {
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game);
  if (fac === 'grimmen') await page.click('#title .peoples button[data-fac="grimmen"]');
  await page.fill('#t-seed', '11');
  await page.click('#t-new'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
}
async function landOps() {
  await page.click('#toolbar .tabs button:has-text("Land")'); await page.waitForTimeout(80);
  return page.evaluate(() => [...document.querySelectorAll('#toolbar .items button')].map((b) => b.textContent.trim().split('\n')[0]));
}
async function edictNames() {
  await page.evaluate(() => window.__game.ui.toggleEdicts(true)); await page.waitForTimeout(120);
  const names = await page.evaluate(() => [...document.querySelectorAll('#edicts .edict b')].map((b) => b.textContent));
  await page.evaluate(() => window.__game.ui.toggleEdicts(false));
  return names;
}

await newGame('grimmen');
const gOps = await landOps();
const gEdicts = await edictNames();
console.log('grimmen land ops:', gOps.join(' | '));
console.log('grimmen edicts:', gEdicts.length, 'deep cut:', gEdicts.some((n) => n.includes('Deep Cut')));
console.log('b_quarry in atlas:', await page.evaluate(() => !!window.__wardlight.atlas.get('b_quarry')));
const scene = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  for (let y = f.y - 6; y <= f.y + 3; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = y * s.w + x; if (s.terrain[i] !== 1 && s.terrain[i] !== 2 && s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 8, f.y - 2, f.x + 8, f.y - 2, false));
  s.treasury = 50000; s.milestone = 2;
  const out = {};
  out.delve = w.actions.terraform(s, 'delve', f.x + 2, f.y - 3);
  out.delve2 = w.actions.terraform(s, 'delve', f.x + 3, f.y - 3);
  out.terrain = s.terrain[(f.y - 3) * s.w + f.x + 2];
  out.quarry = w.actions.placeBuilding(s, 'quarry', f.x + 2, f.y - 3);
  out.stoneCut = s.stats.stoneCut;
  w.recomputeAll(s);
  g.renderer.invalidateAll();
  for (let k = 0; k < 120; k++) w.tick(s);
  const q = s.buildings.find((b) => b && b.kind === 'quarry');
  g.selected = q; g.view.selected = q;
  g.renderer.camera.centerOnTile(f.x + 2, f.y - 3); g.renderer.camera.setZoom(3); g.ui.refresh();
  return out;
});
console.log('scene:', JSON.stringify(scene));
await page.waitForTimeout(200);
console.log('quarry info:', await page.evaluate(() => document.querySelector('#info')?.innerText.replace(/\n/g, ' | ').match(/Workers[^|]*\|[^|]*\|?[^|]*Carts[^|]*\|[^|]*/)?.[0] ?? document.querySelector('#info')?.innerText.slice(0, 200)));
await page.screenshot({ path: 'shots/iter38_quarry.png' });

await newGame('vellish');
const vOps = await landOps();
const vEdicts = await edictNames();
console.log('vellish land ops:', vOps.join(' | '));
console.log('vellish edicts:', vEdicts.length, 'deep cut:', vEdicts.some((n) => n.includes('Deep Cut')));
const pass = gOps.some((o) => o.startsWith('Delve')) && !vOps.some((o) => o.startsWith('Delve')) && gEdicts.length === vEdicts.length + 1 && scene.terrain === 6 && scene.quarry.ok && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
