// Iteration 41: the Tallowkin of the Wick on the title; two nodes, the Ley tab prices, Wick-Towers lighting a dark hearth, the look.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
async function newGame(fac) {
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game);
  const peoples = await page.evaluate(() => document.querySelectorAll('#title .peoples button').length);
  if (fac !== 'vellish') await page.click(`#title .peoples button[data-fac="${fac}"]`);
  await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
  return peoples;
}
async function items(tab) {
  await page.click(`#toolbar .tabs button:has-text("${tab}")`); await page.waitForTimeout(80);
  return page.evaluate(() => [...document.querySelectorAll('#toolbar .items button')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')));
}
const peoples = await newGame('tallowkin');
const start = await page.evaluate(() => { const s = window.__game.state, f = s.founding; return { people: s.faction, nodesWithin8: s.nodes.filter((n) => Math.max(Math.abs(n.x - f.x), Math.abs(n.y - f.y)) <= 8).length }; });
console.log('people buttons:', peoples, 'start:', JSON.stringify(start));
const ley = await items('Ley'); const services = await items('Services');
console.log('ley:', ley.filter((t) => /Spire|Wick/.test(t)).join(' | '));
console.log('services Candle-Shrine:', services.some((t) => t.startsWith('Candle-Shrine')), '| Shrine of Aume:', services.some((t) => t.startsWith('Shrine of Aume')));
console.log('atlas:', await page.evaluate(() => { const a = window.__wardlight.atlas; return ['b_wicktower', 'b_candleshrine', 'b_lanternofwicks', 'hearth_l1_v0_tallowkin', 'market_l3_v2_tallowkin'].map((k) => k + '=' + !!a.get(k)).join(' '); }));
const scene = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  for (let y = f.y - 8; y <= f.y + 8; y++) for (let x = f.x - 16; x <= f.x + 16; x++) { const i = y * s.w + x; const t = s.terrain[i]; if (t !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
  s.treasury = 50000;
  const out = {};
  const home = w.place(s, 'hearth', f.x + 14, f.y + 2, 2); home.residents = 6; // 9 from the spire: only a tower can light it
  out.spire = w.actions.placeBuilding(s, 'spire', f.x + 5, f.y + 4);
  out.tower = null;
  for (const dx of [12, 13, 11]) { const r = w.actions.placeBuilding(s, 'wicktower', f.x + dx, f.y + 4); out.tower = out.tower || (r.ok ? r : null); out['tower' + dx] = r.reason ?? 'ok'; if (r.ok) break; }
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  w.recomputeAll(s);
  out.homeLit = home.lit; out.towerLit = s.buildings.find((b) => b && b.kind === 'wicktower')?.lit;
  s.tick = 700; // dusk
  for (let k = 0; k < 60; k++) w.tick(s);
  g.renderer.invalidateAll(); g.renderer.camera.centerOnTile(f.x + 8, f.y + 2); g.renderer.camera.setZoom(3); g.ui.refresh();
  return out;
});
console.log('scene:', JSON.stringify(scene));
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/iter41_wick.png' });
await newGame('vellish');
const vley = await items('Ley');
console.log('vellish ley:', vley.filter((t) => /Spire|Wick/.test(t)).join(' | '));
const pass = peoples === 4 && start.nodesWithin8 === 2 && scene.spire.ok && !!scene.tower && ley.some((t) => /Ley Spire\s*800c/.test(t)) && ley.some((t) => /Wick-Tower\s*250c/.test(t)) && services.some((t) => t.startsWith('Candle-Shrine')) && !services.some((t) => t.startsWith('Shrine of Aume')) && scene.homeLit && scene.towerLit && vley.some((t) => /Ley Spire\s*400c/.test(t)) && !vley.some((t) => t.startsWith('Wick-Tower')) && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
