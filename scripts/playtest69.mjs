// Iteration 69 (the Great Gate and the Heart of Belregi). A walled town on seed 69: a Warding Wall north–south east of the stake,
// a road east through a Belregi gate, the Great Gate raised through the real placement rule in the angle of the gate and the road,
// an Uzulim gate up the wall. Shots: the Gate by day and by night at 3×, its rings when selected, its panel, a mirrored Gate, the
// High Warden's tale with the record recited, the obelisks, the waking; and a sprite sheet at 3× and 8×.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
async function sheet(names, zoom, file) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(400);
  const url = await page.evaluate(([names, Z]) => {
    const a = window.__wardlight.atlas;
    const rects = names.map((n) => a.get(n)).filter(Boolean);
    const W = rects.reduce((s, r) => s + r.w * Z + 12, 12); const H = Math.max(...rects.map((r) => r.h * Z)) + 24;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6a8f4e'; g.fillRect(0, 0, W, H);
    let x = 12; for (const r of rects) { g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, x, H - 12 - r.h * Z, r.w * Z, r.h * Z); x += r.w * Z + 12; }
    return c.toDataURL();
  }, [names, zoom]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  await page.close();
}
await sheet(['gate_2', 'b_greatgate', 'b_lantern', 'b_wyrmcourt'], 3, 'shots/iter69_sheet_3x.png');
await sheet(['b_greatgate'], 8, 'shots/iter69_greatgate_8x.png');

const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(600);
const town = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(69, 'Gatewick', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 6; s.treasury = 999999; s.sectors.fill(1); s.day = 60; s.tick = 60 * 900;
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 26; y <= f.y + 20; y++) for (let x = f.x - 16; x <= f.x + 26; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  // the wall north–south at gx, a road east along Y through a Belregi gate, an Uzulim gate up the wall, a second Belregi gate further up
  const gx = f.x + 12; const Y = f.y + 4;
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 12, Y, f.x + 22, Y, false));
  w.actions.buildRoad(s, 2, w.actions.roadPath(gx - 6, Y - 14, gx - 6, Y, true));
  for (let y = f.y - 24; y <= f.y + 18; y++) if (!s.road[at(gx, y)]) s.wall[at(gx, y)] = 1;
  const gate = w.actions.placeGate(s, 2, gx, Y);
  const uz = w.actions.placeGate(s, 3, gx, Y - 18);
  // the Great Gate in the angle west of the gate and north of the road: through the real placement rule
  const refusal = w.actions.placeBuilding(s, 'greatgate', gx - 5, Y - 12); // beside the wall and a road, no gate: refused
  const placed = w.actions.placeBuilding(s, 'greatgate', gx - 3, Y - 3);
  const gg = s.buildings.find((b) => b && b.kind === 'greatgate');
  gg.state = 'ok'; gg.work = 0; gg.lit = true; gg.age = 20;
  // a second Great Gate is refused: one per city
  const twice = w.actions.placeBuilding(s, 'greatgate', gx + 1, Y + 1);
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; } return b; };
  for (let k = 0; k < 8; k++) { put('hearth', f.x - 8 + k, Y - 1, 2); put('market', f.x - 8 + k, Y + 1, 1); }
  put('shrine', f.x - 10, Y + 1);
  // spires from the founding node to the Gate, so it is lit by the sim and not by hand
  for (const [x, y] of [[f.x + 2, f.y - 1], [f.x + 6, Y - 3], [gx - 4, Y - 5]]) put('spire', x, y);
  // the record the High Warden will recite: pilgrims welcomed, the Lantern Fair shut out
  s.firedEvents.push('pilgrims:0', 'pilgrims_shrine:0', 'lanternfair:1');
  w.recomputeAll(s);
  g.select(null);
  return { lit: gg.lit, supply: s.manaSupply, demand: s.manaDemand, gx, Y, gate: gate.ok, uz: uz.ok, refusal: refusal.reason, placed: placed.ok, twice: twice.reason, g: [gg.x, gg.y], fx: f.x };
});
console.log('town', JSON.stringify(town));
async function shot(name, x, y, zoom, tick, fn) {
  await page.evaluate(([x, y, zoom, tick]) => {
    const g = window.__game, s = g.state;
    for (const b of s.buildings) if (b) b.lit = true; // the hand-built town has no spires: the night shots show the lit glow
    s.tick = s.day * 900 + tick;
    g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y);
    g.renderer.invalidateAll(); g.ui.refresh();
    for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  }, [x, y, zoom, tick]);
  if (fn) await page.evaluate(fn);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `shots/iter69_${name}.png` });
}
const [ggx, ggy] = town.g;
await shot('gate_day_3x', ggx + 2, ggy, 3, 200);
await shot('gate_night_3x', ggx + 2, ggy, 3, 640);
await shot('gate_day_2x', ggx + 2, ggy - 4, 2, 200);
// selected: the rings and the panel
await shot('gate_selected_2x', ggx + 1, ggy + 1, 2, 200, () => { const g = window.__game; g.select(g.state.buildings.find((b) => b && b.kind === 'greatgate')); g.ui.refresh(); });
const panel = await page.evaluate(() => document.getElementById('info')?.innerText ?? document.querySelector('.info')?.innerText ?? '');
console.log('panel:', panel.replace(/\n+/g, ' | ').slice(0, 900));
await page.evaluate(() => window.__game.select(null));
// the reaches the sim reports
const reach = await page.evaluate(([gx, Y, g]) => { const w = window.__wardlight, s = window.__game.state; w.recomputeAll(s); const gg = s.buildings.find((b) => b && b.kind === 'greatgate'); const cov = (t, x, y) => s.coverage[t][y * s.w + x]; return { lit: gg.lit, belregiFaithAt11East: cov('faith', gx + 11, Y), belregiFaithAt13East: cov('faith', gx + 13, Y), gateWardAt18West: cov('ward', g[0] + 1 - 18, g[1] + 1), gateWardAt23West: cov('ward', g[0] + 1 - 23, g[1] + 1) }; }, [town.gx, town.Y, town.g]);
console.log('coverage', JSON.stringify(reach));
// the High Warden: ten days after the Gate stands lit
const warden = await page.evaluate(() => {
  const w = window.__wardlight, g = window.__game, s = g.state;
  s.heart.day = s.day - 10;
  w.events.maybeFireHeart(s);
  g.ui.refresh();
  return s.pendingEvent ? { id: s.pendingEvent.id, text: s.pendingEvent.text, choices: s.pendingEvent.choices.map((c) => c.label) } : null;
});
console.log('warden', JSON.stringify(warden));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter69_warden.png' });
// set the Heart; twenty days on, the obelisks (an Uzulim gate stands)
const obel = await page.evaluate(() => {
  const w = window.__wardlight, g = window.__game, s = g.state;
  w.resolveEvent(s, 0);
  w.recomputeAll(s);
  s.day += 20;
  w.events.maybeFireHeart(s);
  g.ui.refresh();
  return { held: s.heart.held, id: s.pendingEvent?.id, text: s.pendingEvent?.text };
});
console.log('obelisks', JSON.stringify(obel));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter69_obelisks.png' });
const wake = await page.evaluate(() => {
  const w = window.__wardlight, g = window.__game, s = g.state;
  w.resolveEvent(s, 1); // share it
  while (Math.floor(s.day / 30) % 4 !== 3 || s.day - s.heart.day < 20) s.day++;
  w.events.maybeFireHeart(s);
  g.ui.refresh();
  return { held: s.heart.held, day: s.day, id: s.pendingEvent?.id, text: s.pendingEvent?.text };
});
console.log('wakes', JSON.stringify(wake));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter69_wakes.png' });
await page.evaluate(() => { const w = window.__wardlight, s = window.__game.state; w.resolveEvent(s, 2); window.__game.ui.refresh(); });
// the Heart set: the Gate by night again (the ward ring reaches 20 again once shared), and a Gate mirrored to a road on its left
const mirror = await page.evaluate(([gx, Y]) => {
  const w = window.__wardlight, s = window.__game.state;
  const at = (x, y) => y * s.w + x;
  // a second walled town piece far west: wall east–west, a gate, a road north–south on the Gate's left
  const fx = gx - 26; const wy = Y - 16;
  for (let x = fx - 6; x <= fx + 6; x++) s.wall[at(x, wy)] = 1;
  w.actions.buildRoad(s, 2, w.actions.roadPath(fx, wy - 6, fx, wy + 8, true));
  w.actions.placeGate(s, 2, fx, wy);
  const b = w.place(s, 'greatgate', fx + 1, wy + 1);
  b.state = 'ok'; b.work = 0; b.lit = true;
  w.recomputeAll(s);
  return { x: b.x, y: b.y, left: w.facing.faceLeft(s, { x: b.x, y: b.y, w: 3, h: 3 }) };
}, [town.gx, town.Y]);
console.log('second gate, mirrored:', JSON.stringify(mirror));
await shot('gate_mirrored_3x', mirror.x + 1, mirror.y + 1, 3, 200);
// a few days of the sim with the Gate standing: pilgrims walk, pilgrims of the Pass lodge on the 15th
const days = await page.evaluate(() => {
  const w = window.__wardlight, g = window.__game, s = g.state;
  while (s.day % 30 !== 13) s.day++;
  s.tick = s.day * 900;
  const start = s.day;
  let guard = 0;
  while (s.day < start + 3 && guard++ < 5000) { if (s.pendingEvent) w.resolveEvent(s, 0); w.tick(s); }
  const walkers = s.agents.filter((a) => a.job === 'pilgrim' && s.buildings.some((b) => b && b.id === a.anchorId && b.kind === 'greatgate')).length;
  return { day: s.day, gatePilgrims: s.stats.gatePilgrims, gateAlms: s.stats.gateAlms, walkers };
});
console.log('days', JSON.stringify(days));
await shot('pilgrims_3x', ggx - 2, ggy + 3, 3, 300);
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
