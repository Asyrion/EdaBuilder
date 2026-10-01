// Iteration 45, the ley has limits: an overloaded spire shows its load and problem, the Brownout row switches, an unlinked node's panel warns.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.milestone = 6; s.treasury = 90000;
  for (let y = f.y - 8; y <= f.y + 10; y++) for (let x = f.x - 16; x <= f.x + 20; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 14, f.y + 2, f.x + 20, f.y + 2, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 6, f.y - 3, f.x + 20, f.y - 3, false));
  const sp = w.place(s, 'spire', f.x + 5, f.y - 1);
  const shops = []; for (let k = 0; k < 12; k++) { const b = w.place(s, 'arcane', f.x + 7 + k, f.y - 2, 3); if (b) shops.push(b); }
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  for (const b of shops) b.workers = 6;
  w.recomputeAll(s); g.renderer.invalidateAll();
  g.select(sp); g.ui.refresh();
  g.renderer.camera.centerOnTile(f.x + 10, f.y - 1); g.renderer.camera.setZoom(2);
  const txt = document.body.textContent;
  const founding = s.nodes.findIndex((n) => n.x === f.x && n.y === f.y);
  const other = s.nodes.findIndex((n, k) => k !== founding);
  return { spireLit: sp.lit, load: sp.load, dark: shops.filter((b) => !b.lit).length, loadRow: /Load\s*\d+ \/ 80 mana/.test(txt), overloaded: /Overloaded/.test(txt), other, linked: s.nodeLinked.slice() };
});
console.log('spire:', JSON.stringify(info));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter45_spire_load.png' });
// the Brownout row on a shop, and a click that switches it
const prio = await page.evaluate(() => { const g = window.__game, s = g.state; const shop = s.buildings.find((b) => b && b.kind === 'arcane'); g.select(shop); g.ui.refresh(); const btns = [...document.querySelectorAll('button[data-prio]')]; const before = btns.map((b) => b.className); btns[2].click(); const after = [...document.querySelectorAll('button[data-prio]')].map((b) => b.className); return { count: btns.length, before, after, priority: shop.priority }; });
console.log('priority row:', JSON.stringify(prio));
// the unlinked node's panel
const node = await page.evaluate(() => { const g = window.__game, s = g.state, f = s.founding; const founding = s.nodes.findIndex((n) => n.x === f.x && n.y === f.y); const other = s.nodes.findIndex((n, k) => k !== founding); g.selectedNode = other; g.select(null); g.ui.refresh(); if (g.ui.showNode) g.ui.showNode(other); const txt = document.body.textContent; return { other, unlinked: /not drawn/.test(txt) }; });
console.log('node panel:', JSON.stringify(node));
const pass = info.spireLit && info.load > 80 && info.dark === 2 && info.loadRow && info.overloaded && prio.count === 3 && prio.priority === 2 && /active/.test(prio.after[2]) && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
