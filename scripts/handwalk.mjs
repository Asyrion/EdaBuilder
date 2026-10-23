// The lines of docs/CORE_CHECKLIST.md walked with a real mouse and keys (scope reset phase 2-10), against
// `npx vite preview --port 4173`: a new charter, a road dragged and undone, zones painted from the toolbar, a spire, a
// well, growth at 3×, the demand bars' hover, a Watch Post and a Shrine placed with their reach, the Hearth tithe, Hamlet
// with its message (fast-forwarded once the real-time pace is noted), every info view by its key after a mouse click on a
// button (the focus bug of 2-9), F5/F9 and Continue after a reload, dusk to dawn without a black frame, the console.
// The shots (shots/handwalk_*.png) are for the eye: the colour ramps and the night are judged by looking.
//   node scripts/handwalk.mjs   → one json line and HANDWALK OK, or the failed lines; exit 1 on a failure
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// HANDWALK_DPR=1.5 walks it on a 150 % display (phase 3-3): the clicks must land on the same tiles
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: Number(process.env.HANDWALK_DPR ?? 1) });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const r = {};
const shot = (n, clip) => page.screenshot({ path: `${out}/handwalk_${n}.png`, ...(clip ? { clip } : {}) });
const wait = (ms) => page.waitForTimeout(ms);
const hide = () => page.evaluate(() => { document.getElementById('lesson-close')?.click(); if (!document.getElementById('help')?.classList.contains('hidden')) document.getElementById('help-close')?.click(); for (const el of document.querySelectorAll('#toast, #lesson')) el.classList.add('hidden'); });
// the screen point of a tile: scan the canvas with the camera's inverse
const at = (tx, ty) => page.evaluate(([tx, ty]) => {
  const g = window.__game, c = document.getElementById('game').getBoundingClientRect();
  let best = null, bd = 1e9;
  for (let y = c.top + 60; y < c.bottom - 10; y += 3) for (let x = c.left + 10; x < c.right - 10; x += 3) {
    const [a, b] = g.renderer.camera.screenToTile(x, y);
    if (a === tx && b === ty) { const el = document.elementFromPoint(x, y); if (el?.id !== 'game') continue; const d = Math.hypot(x - (c.left + c.width / 2), y - (c.top + c.height / 2)); if (d < bd) { bd = d; best = [x, y]; } }
  }
  return best;
}, [tx, ty]);
const S = () => page.evaluate(() => { const s = window.__game.state; return { day: s.day, folk: s.population, treasury: Math.round(s.treasury), roads: s.road.reduce((a, v) => a + (v ? 1 : 0), 0), zoned: s.zone.reduce((a, v) => a + (v ? 1 : 0), 0), blds: s.buildings.filter(Boolean).length, ms: s.milestone }; });

// 1. title, new charter
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
await wait(500);
await shot('01_title');
await page.fill('#t-seed', '4242');
await page.click('#t-new');
await wait(800);
await hide();
r.l1 = await page.evaluate(() => { const s = window.__game.state; const st = s.buildings.find((b) => b && b.kind === 'stake'); const n = s.nodes[0]; return { stake: !!st, nearNode: st ? Math.hypot(st.x - n.x, st.y - n.y) < 6 : false }; });
await page.evaluate(() => { const g = window.__game; g.paused = true; g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(g.state.founding.x, g.state.founding.y); });
await wait(400);
await shot('01_founded');
const f = await page.evaluate(() => { const s = window.__game.state; return { x: s.founding.x, y: s.founding.y }; });
// find a clear meadow row near the stake for a road: 9 tiles east-west, buildable, no water
const row = await page.evaluate(() => {
  const s = window.__game.state, f = s.founding, ok = (x, y) => { const i = x + y * 128; return s.bIndex[i] < 0 && !s.road[i] && (s.terrain[i] === 3 || s.terrain[i] === 4 || s.terrain[i] === 2); };
  for (const dy of [3, -3, 4, -4, 5, -5, 2, -2, 6, -6]) for (const dx of [-4, -2, -6, 0]) {
    const y = f.y + dy, x0 = f.x + dx; let good = true;
    for (let x = x0; x < x0 + 10 && good; x++) for (const yy of [y - 2, y - 1, y, y + 1, y + 2]) if (!ok(x, yy)) good = false;
    if (good) return { x0, y };
  }
  return null;
});
r.row = row;
// 2. roads: R and drag; the cost while dragging; Ctrl+Z
await page.keyboard.press('r'); await wait(200);
let A = await at(row.x0, row.y), B = await at(row.x0 + 9, row.y);
const s0 = await S();
await page.mouse.move(A[0], A[1]); await page.mouse.down(); await page.mouse.move((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, { steps: 5 }); await page.mouse.move(B[0], B[1], { steps: 5 }); await wait(250);
r.l2costWhileDragging = await page.evaluate(() => { const el = document.getElementById('tooltip'); return el && !el.classList.contains('hidden') ? el.textContent : null; });
await shot('02_road_drag');
await page.mouse.up(); await wait(300);
const s1 = await S();
await page.keyboard.press('Control+z'); await wait(300);
const s2 = await S();
r.l2 = { laid: s1.roads - s0.roads, cost: s0.treasury - s1.treasury, undone: s2.roads === s0.roads, refunded: s2.treasury === s0.treasury };
// lay it again for the rest
await page.mouse.move(A[0], A[1]); await page.mouse.down(); await page.mouse.move(B[0], B[1], { steps: 8 }); await page.mouse.up(); await wait(300);
// 3. zones: Z, drag Hearth beside the road; a far lot without a road
await page.keyboard.press('z'); await wait(200);
r.l3tool = await page.evaluate(() => JSON.stringify(window.__game.tool));
r.l3tabAfterZ = await page.evaluate(() => document.querySelector('#toolbar .tabs button.active')?.textContent);
A = await at(row.x0, row.y + 1); B = await at(row.x0 + 5, row.y + 2);
await page.mouse.move(A[0], A[1]); await page.mouse.down(); await page.mouse.move(B[0], B[1], { steps: 6 }); await page.mouse.up(); await wait(200);
// Market and Craft: the toolbar's zone buttons
const zoneBtn = async (name) => { const b = page.locator('#toolbar .items button', { hasText: name }).first(); if (await b.count()) { await b.click(); return true; } return false; };
r.l3market = await zoneBtn('Market');
A = await at(row.x0 + 6, row.y + 1); B = await at(row.x0 + 7, row.y + 2);
await page.mouse.move(A[0], A[1]); await page.mouse.down(); await page.mouse.move(B[0], B[1], { steps: 4 }); await page.mouse.up(); await wait(200);
r.l3craft = await zoneBtn('Craft');
A = await at(row.x0 + 2, row.y - 1); B = await at(row.x0 + 4, row.y - 2);
await page.mouse.move(A[0], A[1]); await page.mouse.down(); await page.mouse.move(B[0], B[1], { steps: 4 }); await page.mouse.up(); await wait(200);
// an island lot away from the road (Hearth again)
await zoneBtn('Hearth');
const far = await page.evaluate(([x0, y]) => { const s = window.__game.state; for (let dy = 6; dy < 20; dy++) for (const dx of [0, 3, 6, -3]) { const fx = x0 + dx, fy = y + dy; let ok = s.bIndex[fx + fy * 128] < 0 && s.terrain[fx + fy * 128] >= 2 && s.terrain[fx + fy * 128] <= 4; for (let yy = -4; yy <= 4 && ok; yy++) for (let xx = -4; xx <= 4; xx++) if (s.road[fx + xx + (fy + yy) * 128]) ok = false; if (ok) return { x: fx, y: fy }; } return null; }, [row.x0, row.y]);
r.far = far;
A = await at(far.x, far.y); await page.mouse.click(A[0], A[1]); await wait(200);
r.l3zones = await page.evaluate(() => { const s = window.__game.state; const c = [0, 0, 0, 0, 0]; for (const z of s.zone) c[z]++; return c; });
await page.keyboard.press('Escape'); await wait(100);
await page.keyboard.press('x'); await wait(100);
A = await at(far.x, far.y); await page.mouse.move(A[0] - 2, A[1]); await page.mouse.move(A[0], A[1]); await wait(300);
r.l3hoverFar = await page.evaluate(() => { const el = document.getElementById('tooltip'); return el && !el.classList.contains('hidden') ? el.textContent : null; });
await shot('03_zones_hover');
await page.mouse.move(640, 430); await page.keyboard.press('n'); await wait(500); await shot('03_growth_view'); await page.keyboard.press('n');
// 4. a Ley Spire near the node; the Mana view
const tab = async (name) => { await page.locator('#toolbar .tabs button', { hasText: name }).first().click(); await wait(150); };
const place = async (tabName, item, tx, ty, shotName) => {
  await tab(tabName);
  const b = page.locator('#toolbar .items button', { hasText: item }).first();
  if (!(await b.count())) return `no ${item} button`;
  if (await b.evaluate((e) => e.classList.contains('locked'))) { await b.hover(); await wait(200); const tip = await page.evaluate(() => document.getElementById('tooltip')?.textContent ?? ''); return `locked: ${tip.match(/Unlocks[^.]*|needs[^.]*/i)?.[0] ?? tip.slice(-80)}`; }
  await b.click(); await wait(150);
  const p = await at(tx, ty); if (!p) return 'tile off screen';
  await page.mouse.move(p[0] - 3, p[1]); await page.mouse.move(p[0], p[1]); await wait(300);
  if (shotName) await shot(shotName);
  const n0 = (await S()).blds;
  await page.mouse.click(p[0], p[1]); await wait(300);
  const n1 = (await S()).blds;
  await page.keyboard.press('Escape');
  return n1 > n0 ? 'placed' : 'not placed';
};
const roadSpot = (w = 1) => page.evaluate(([w, x0, y]) => { const s = window.__game.state; for (let x = x0; x < x0 + 10; x++) for (const yy of [y + 1, y - w]) { let ok = true; for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) { const i = x + a + (yy + b) * 128; if (s.bIndex[i] >= 0 || s.road[i] || !(s.terrain[i] >= 2 && s.terrain[i] <= 4)) ok = false; } if (ok) return [x, yy]; } return null; }, [w, row.x0, row.y]);
const spot = (dx, dy, w = 1) => page.evaluate(([dx, dy, w]) => { const s = window.__game.state, f = s.founding; for (let r = 0; r < 6; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const x = f.x + dx + xx, y = f.y + dy + yy; let ok = true; for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) { const i = x + a + (y + b) * 128; if (s.bIndex[i] >= 0 || s.road[i] || s.zone[i] || !(s.terrain[i] >= 2 && s.terrain[i] <= 4)) ok = false; } if (ok) return [x, y]; } return null; }, [dx, dy, w]);
let p = await spot(2, row.y - f.y > 0 ? -2 : 2);
r.l4 = await place('Ley', 'Spire', p[0], p[1], '04_spire_placing');
await page.mouse.move(640, 430); await page.keyboard.press('1'); await wait(500); await shot('04_mana_view'); await page.keyboard.press('1');
// 5. a Well
p = await roadSpot(1); r.wellAt = p;
r.l5 = await place('Water', 'Well', p[0], p[1], '05_well_placing');
await page.mouse.move(640, 430); await page.keyboard.press('2'); await wait(500); await shot('05_water_view'); await page.keyboard.press('2');
// 6. growth at speed 3
await page.keyboard.press('Escape');
const g0 = await S();
await page.click('#sp-3');
const tg = Date.now();
for (let k = 0; k < 90 && (await S()).day < g0.day + 2; k++) await wait(1000);
r.l6seconds = Math.round((Date.now() - tg) / 1000);
const g1 = await S();
r.l6 = { from: g0, to: g1, builders: await page.evaluate(() => window.__game.state.agents.filter((a) => a.kind === 3 || a.builder).length), sites: await page.evaluate(() => window.__game.state.buildings.filter((b) => b && b.state === 'building').length) };
await page.click('#sp-0');
await hide(); await shot('06_growth_speed3');
// 7. demand bars hover
for (const z of ['hearth', 'craft']) {
  const bar = await page.evaluate((z) => { const r = document.querySelector(`#demand .col[data-zone="${z}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, z);
  await page.mouse.move(bar[0], bar[1]); await wait(300);
  r[`l7_${z}`] = await page.evaluate(() => { const el = document.getElementById('tooltip'); return el && !el.classList.contains('hidden') ? el.textContent.slice(0, 160) : null; });
  if (z === 'hearth') await shot('07_demand_hover');
}
await page.mouse.move(640, 430);
// 8. services: a Watch Post and a Shrine of Aume (both open from the start) with their reach while placing
p = await roadSpot(1);
r.l8watch = await place('Services', 'Watch Post', p[0], p[1], '08_watch_placing');
p = await roadSpot(1);
r.l8shrine = await place('Services', 'Aume', p[0], p[1], '08_shrine_placing');
// 9. budget: the Hearth tax moves the net
await page.click('#btn-budget'); await wait(400);
const net0 = await page.evaluate(() => document.getElementById('tb-net').textContent);
const hb0 = await page.evaluate(() => window.__game.state.demand.hearth);
await page.evaluate(() => { const i = document.querySelector('#budget input[data-zone="hearth"]'); i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
await wait(400);
await shot('09_budget');
const net1 = await page.evaluate(() => document.getElementById('tb-net').textContent);
await page.evaluate(() => { const s = window.__game.state; for (let i = 0; i < 900; i++) window.__wardlight.tick(s); });
await wait(300);
const hb1 = await page.evaluate(() => window.__game.state.demand.hearth);
r.l9 = { tax: await page.evaluate(() => window.__game.state.taxRates.hearth), net0, net1, hearthBar: [hb0.toFixed(2), hb1.toFixed(2)] };
await page.evaluate(() => { const i = document.querySelector('#budget input[data-zone="hearth"]'); if (i) { i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } });
await page.keyboard.press('Escape'); await page.evaluate(() => document.getElementById('budget')?.classList.add('hidden'));
// 10. Hamlet: the real-time pace at 3× for 30 s is noted; then the days run fast, with the bot zoning where this walk's
// small town ran short, until Hamlet (at most 40 days), and its message and grant are checked
await page.click('#sp-3');
const t0 = Date.now(), d0 = (await S()).day;
await wait(30000);
r.l10pace = `${((await S()).day - d0)} days in ${Math.round((Date.now() - t0) / 1000)} s at 3x`;
await page.click('#sp-0');

r.l10days = await page.evaluate(() => { const g = window.__game, W = window.__wardlight, s = g.state, bot = new W.Bot(s), d = s.day; while (s.milestone < 1 && s.day < d + 40) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); } W.recomputeAll(s); g.renderer.invalidateAll(); g.ui.refresh(); return s.day - d; });
await wait(600);
r.l10 = { ...(await S()), msg: await page.evaluate(() => window.__game.state.messages.filter((m) => /is now a Hamlet/.test(m.text)).map((m) => m.text).slice(-1)[0] ?? null) };
await shot('10_hamlet');
p = await roadSpot(2) ?? await roadSpot(1);
r.l10healer = await place('Services', 'Healer', p[0], p[1], '10_healer_placing');
await hide();
// 11. every view by its key, for the eye
// first a mouse click on a button (the speed bar): the keys must still reach the game (the focus bug of 2-9)
await page.click('#sp-0'); await page.click('#sp-0');
const keyIds = [['1', 'mana'], ['2', 'water'], ['3', 'landvalue'], ['4', 'happiness'], ['5', 'traffic'], ['6', 'watch'], ['7', 'health'], ['8', 'fire'], ['9', 'school'], ['0', 'death'], ['-', 'faith'], ['=', 'leisure'], ['n', 'growth'], ['g', 'ward'], ['o', 'goods'], ['i', 'district'], ['m', 'miasma']];
r.l11missed = [];
let k = 0;
for (const [key, want] of keyIds) {
  await page.keyboard.press(key); await page.evaluate(() => { window.__game.renderer.overlayVersion++; }); await wait(300);
  const ov = await page.evaluate(() => window.__game.view.overlay);
  if (ov !== want) r.l11missed.push(`${key}→${ov}`);
  await shot(`11_view_${String(++k).padStart(2, '0')}_${ov}`, { x: 280, y: 150, width: 720, height: 450 });
  await page.keyboard.press('Escape'); await page.evaluate(() => { window.__game.view.overlay = null; });
}
// 12. F5, F9; reload offers Continue
const b4 = await S();
await page.keyboard.press('F5'); await wait(500);
await page.evaluate(() => { const s = window.__game.state; for (let i = 0; i < 300; i++) window.__wardlight.tick(s); });
await page.keyboard.press('F9'); await wait(900);
const af = await S();
await page.reload(); await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 }); await wait(600);
r.l12 = { same: b4.folk === af.folk && b4.treasury === af.treasury && b4.day === af.day, continueEnabled: await page.evaluate(() => !document.getElementById('t-continue').disabled) };
await shot('12_reload_title');
await page.click('#t-continue'); await wait(800); await hide();
r.l12continued = await S();
// 13. night: a frame every 20 ticks across dusk and dawn; the mean brightness must not drop to black between neighbours
await page.evaluate(() => { const g = window.__game; g.paused = true; g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(g.state.founding.x, g.state.founding.y); });
const lum = [];
for (let t = 500; t < 900 + 200; t += 25) {
  await page.evaluate((t) => { const s = window.__game.state; s.tick = Math.floor(s.tick / 900) * 900 + (t % 900) + (t >= 900 ? 900 : 0); }, t);
  await wait(120);
  lum.push([t, await page.evaluate(() => { const c = document.getElementById('game'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let sum = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; } return sum / n; })]);
  if (t === 650) await shot('13_night', { x: 280, y: 100, width: 720, height: 560 });
  if (t === 550) await shot('13_dusk', { x: 280, y: 100, width: 720, height: 560 });
}
r.l13 = lum.map(([t, v]) => `${t}:${Math.round(v)}`).join(' ');
r.l14errors = errors;
// the verdict, line by line
const fail = [];
if (!r.l1.stake || !r.l1.nearNode) fail.push('1 founding');
if (!(r.l2.laid > 0 && r.l2.cost > 0 && r.l2.undone && r.l2.refunded)) fail.push('2 road and undo');
if (r.l3tabAfterZ !== 'Zones' || !r.l3market || !r.l3craft || !/no road/.test(r.l3hoverFar ?? '')) fail.push('3 zones');
if (r.l4 !== 'placed') fail.push('4 spire');
if (r.l5 !== 'placed') fail.push('5 well');
if (!(r.l6.to.blds > r.l6.from.blds)) fail.push('6 growth');
if (!/heading to/.test(r.l7_hearth ?? '') || !/lots? can grow|cannot/.test(r.l7_craft ?? '')) fail.push('7 demand');
if (r.l8watch !== 'placed' || r.l8shrine !== 'placed') fail.push('8 services');
if (!(r.l9.tax === 20 && r.l9.net0 !== r.l9.net1)) fail.push('9 budget');
if (!/Hamlet/.test(r.l10.msg ?? '') || !/\+[\d,]+ crowns/.test(r.l10.msg) || r.l10healer !== 'placed') fail.push('10 Hamlet');
if (r.l11missed.length) fail.push(`11 views (${r.l11missed.join(' ')})`);
if (!(r.l12.same && r.l12.continueEnabled)) fail.push('12 save/load');
for (let i = 1; i < lum.length; i++) if (lum[i][1] < lum[i - 1][1] * 0.5) { fail.push(`13 a dark frame at ${lum[i][0]}`); break; }
if (errors.length) fail.push('14 console');
r.failed = fail;
console.log(JSON.stringify(r));
console.log(fail.length ? `HANDWALK FAILED: ${fail.join('; ')}` : 'HANDWALK OK');
await browser.close();
process.exit(fail.length ? 1 : 0);
