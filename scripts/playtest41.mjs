// Iteration 42: districts answer the day they are painted: the lock, the toast, the charter row, the label, the effect.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
await page.click('#toolbar .tabs button:has-text("Districts")'); await page.waitForTimeout(80);
const lockedBefore = await page.evaluate(() => [...document.querySelectorAll('#toolbar .items button')].filter((b) => b.textContent.includes('Hearthside')).every((b) => b.classList.contains('locked')));
console.log('before:', await page.evaluate(() => ({ ms: window.__game.state.milestone, items: [...document.querySelectorAll('#toolbar .items button')].slice(0, 3).map((b) => b.className + ':' + b.textContent.trim().slice(0, 12)) })));
const tileToScreen = async (x, y) => page.evaluate(([x, y]) => { const cam = window.__game.renderer.camera; const wx = (x - y) * 16, wy = (x + y) * 8 + 8; return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom]; }, [x, y]);
// to the Hamlet with a works and a hearth row on the east side
await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.milestone = 1; s.treasury = 50000;
  for (let y = f.y - 6; y <= f.y + 6; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  for (let dx = 2; dx <= 6; dx++) { const b = w.place(s, 'hearth', f.x + dx, f.y + 1, 1); b.residents = 4; }
  const c = w.place(s, 'craft', f.x + 8, f.y + 1, 2); c.workers = 6; c.lit = true;
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; }
  w.recomputeAll(s); g.renderer.invalidateAll(); g.ui.refresh(); });
await page.click('#toolbar .tabs button:has-text("Districts")'); await page.waitForTimeout(80);
const lockedAfter = await page.evaluate(() => [...document.querySelectorAll('#toolbar .items button')].some((b) => b.classList.contains('locked')));
await page.click('#toolbar .items button:has-text("Hearthside")');
const f = await page.evaluate(() => window.__game.state.founding);
let [ax, ay] = await tileToScreen(f.x + 1, f.y - 3);
let [bx, by] = await tileToScreen(f.x + 10, f.y + 4);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(200);
const afterPaint = await page.evaluate(() => ({ overlay: window.__game.view.overlay, toast: document.querySelector('#toast')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 140) ?? document.body.textContent.includes('No charter yet'), painted: window.__game.state.district.filter((d) => d === 1).length }));
console.log('locked before/after Hamlet:', lockedBefore, lockedAfter, '| after paint:', JSON.stringify(afterPaint));
await page.evaluate(() => { window.__game.ui.edictScope = 1; window.__game.ui.toggleEdicts(true); }); await page.waitForTimeout(120);
const row = await page.evaluate(() => [...document.querySelectorAll('#edicts button[data-quarter]')].map((b) => b.textContent));
console.log('charter row:', row.join(' | '));
await page.click('#edicts button[data-quarter="craft"]'); await page.waitForTimeout(120);
const chosen = await page.evaluate(() => ({ q: window.__game.state.districtQuarters[1], active: document.querySelector('#edicts button[data-quarter="craft"]')?.classList.contains('active') }));
await page.evaluate(() => window.__game.ui.toggleEdicts(false));
const effect = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight; const c = s.buildings.find((b) => b && b.kind === 'craft'); const h = s.buildings.find((b) => b && b.kind === 'hearth'); const h0 = h.happiness; const oneDay = () => { s.tick = Math.ceil((s.tick + 1) / 900) * 900 - 1; c.stock = 0; c.workers = 6; c.lit = true; c.state = 'ok'; w.tick(s); return c.stock; }; const made = oneDay(); s.districtQuarters = {}; w.recomputeAll(s); const plain = oneDay(); s.districtQuarters[1] = 'craft'; w.recomputeAll(s); g.renderer.overlayVersion++; g.renderer.camera.centerOnTile(s.founding.x + 5, s.founding.y); g.renderer.camera.setZoom(2); g.view.overlay = 'district'; g.ui.refresh(); return { made: Math.round(made * 10) / 10, plain: Math.round(plain * 10) / 10, ratio: Math.round((made / plain) * 100) / 100, hearthBefore: h0 }; });
console.log('chosen:', JSON.stringify(chosen), 'effect:', JSON.stringify(effect));
await page.click('#toolbar .tabs button:has-text("Districts")'); await page.waitForTimeout(80);
const label = await page.evaluate(() => document.querySelector('#toolbar .items button')?.textContent?.replace(/\s+/g, ' ').trim());
console.log('tab label:', label);
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/iter42_districts.png' });
const pass = lockedBefore && !lockedAfter && afterPaint.overlay === 'district' && afterPaint.painted > 50 && row.length === 6 && chosen.q === 'craft' && chosen.active && effect.ratio > 1.15 && effect.ratio < 1.25 && /Craft quarter/.test(label) && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
