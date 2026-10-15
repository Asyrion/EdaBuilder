// Iteration 96 (the Fen-Nex of the Reach): the title screen with five peoples, a sheet of the new buildings beside the
// buildings they stand for, the Fen-Nex houses beside the Vellish ones, a fen start by day and night, a stilt street on the
// marsh with a Caravanserai, a Fox-Post, a Fen Den and fox-folk on the road, the Caravanserai's panel and the greyed Craft zone.
//   shots/iter96_title.png, iter96_buildings.png, iter96_zones.png, iter96_start_1x.png, iter96_start_night.png,
//   iter96_street_4x.png, iter96_street_night_4x.png, iter96_panel.png, iter96_zones_menu.png
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const missing = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/missing sprite|failed to load/.test(m.text())) missing.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
await page.waitForTimeout(800);
const peoples = await page.evaluate(() => [...document.querySelectorAll('.peoples [data-fac]')].map((b) => b.dataset.fac));
await page.click('.peoples [data-fac="fennex"]').catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter96_title.png' });

/** A sheet of sprites over their footprint diamonds at Z×, a citizen (cit_0) and a fox-folk citizen (cit_6) at each front corner. */
async function sheet(names, Z, cols, file) {
  const url = await page.evaluate(([names, Z, cols]) => {
    const a = window.__wardlight.atlas;
    const foot = (n) => (/^b_(caravanserai|fenden|depot|cradle)/.test(n) ? 2 : 1);
    const rs = names.map((n) => a.get(n));
    const cellW = Math.max(...names.map((n, i) => Math.max(rs[i]?.w ?? 0, foot(n) * 32))) * Z + 24;
    const cellH = Math.max(...names.map((n, i) => Math.max(rs[i]?.h ?? 0, foot(n) * 16) + 8)) * Z + 28;
    const c = document.createElement('canvas'); c.width = cols * cellW; c.height = Math.ceil(names.length / cols) * cellH;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#2b3a2b'; g.fillRect(0, 0, c.width, c.height);
    names.forEach((n, i) => {
      const r = rs[i]; const f = foot(n);
      const x0 = (i % cols) * cellW, y0 = Math.floor(i / cols) * cellH;
      g.strokeStyle = '#000'; g.strokeRect(x0 + 0.5, y0 + 0.5, cellW - 1, cellH - 1);
      const top = [x0 + cellW / 2, y0 + cellH - 22 - f * 16 * Z];
      const d = [[0, 0], [f * 16, f * 8], [0, f * 16], [-f * 16, f * 8]].map(([x, y]) => [top[0] + x * Z, top[1] + y * Z]);
      g.fillStyle = '#6a8f4e'; g.beginPath(); d.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      if (r) g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, top[0] - r.ax * Z, top[1] - r.ay * Z, r.w * Z, r.h * Z);
      for (const [k, cn] of [[0, 'cit_0_0'], [1, 'cit_6_0']]) { const cit = a.get(cn); if (cit) g.drawImage(cit.src ?? a.image, cit.x, cit.y, cit.w, cit.h, d[2][0] + (6 + k * 8) * Z - cit.ax * Z, d[2][1] - cit.ay * Z, cit.w * Z, cit.h * Z); }
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.textAlign = 'center';
      g.fillText(r ? `${n} ${(r.h / 12).toFixed(1)} folk` : `${n} MISSING`, x0 + cellW / 2, y0 + cellH - 6);
    });
    return c.toDataURL();
  }, [names, Z, cols]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
await sheet(['b_depot', 'b_caravanserai', 'b_cradle', 'b_fenden', 'b_watchpost', 'b_foxpost'], 5, 2, 'shots/iter96_buildings.png');
const ZONES = ['hearth', 'market', 'arcane'].flatMap((z) => [1, 2, 3].flatMap((l) => [`${z}_l${l}_v0`, `${z}_l${l}_v0_fennex`, `${z}_l${l}_v1_fennex`]));
await sheet(ZONES, 4, 6, 'shots/iter96_zones.png');
const atlasHas = await page.evaluate(() => ['b_caravanserai', 'b_foxpost', 'b_fenden', 'hearth_l1_v0_fennex', 'market_l3_v3_fennex', 'arcane_l2_v1_fennex', 'cit_6_3'].filter((n) => !window.__wardlight.atlas.get(n)));

// a fen start, by day and by night
const start = await page.evaluate(() => {
  const g = window.__game;
  g.newGame(42, 'Foxmere', 'valley', 'fennex');
  for (const id of ['toast', 'lesson', 'help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state, f = s.founding;
  let marsh = 0; for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) if (s.terrain[(f.y + dy) * s.w + f.x + dx] === 9) marsh++;
  s.tick = s.day * 900 + 250;
  g.renderer.camera.setZoom(1); g.renderer.camera.centerOnTile(f.x, f.y); g.renderer.invalidateAll(); g.ui.refresh();
  return { faction: s.faction, marshNear: marsh, gate: document.body.innerText.includes('trade route') };
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/iter96_start_1x.png' });
await page.evaluate(() => { const g = window.__game; g.state.tick = g.state.day * 900 + 640; g.renderer.camera.setZoom(2); g.renderer.invalidateAll(); });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/iter96_start_night.png' });

// a street: stilt homes on the marsh, markets, the three new buildings, fox-folk on the road
const street = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight, s = g.state, f = s.founding;
  s.milestone = 5; s.treasury = 999999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  const at = (x, y) => y * s.w + x;
  const Y = f.y + 5;
  for (let y = Y - 4; y <= Y + 4; y++) for (let x = f.x - 12; x <= f.x + 14; x++) { const i = at(x, y); if (s.terrain[i] === 7) continue; s.terrain[i] = y < Y && (x + y) % 3 !== 0 ? 9 : 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k]) w.actions.bulldoze(s, x, y); }
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 12, Y, f.x + 14, Y, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; b.watered = true; } return b; };
  let stilts = 0;
  for (let x = f.x - 10; x <= f.x + 12; x += 1) { const ok = w.actions.paintZone(s, 1, x, Y - 1, x, Y - 1).ok; if (ok && s.terrain[at(x, Y - 1)] === 9) stilts++; if (ok) put('hearth', x, Y - 1, 1 + (x & 1) + (x % 5 === 0 ? 1 : 0)); }
  const craft = w.actions.paintZone(s, 3, f.x - 2, Y + 1, f.x, Y + 1);
  put('caravanserai', f.x - 10, Y + 1); put('foxpost', f.x - 7, Y + 1); put('fenden', f.x + 8, Y + 1);
  for (let x = f.x - 6; x <= f.x + 6; x += 1) put('market', x, Y + 1, 1 + (x & 1) + (x % 4 === 0 ? 1 : 0));
  w.recomputeAll(s);
  for (let k = 0; k < 16; k++) s.agents.push({ id: 90000 + k, kind: 0, x: f.x - 9 + k * 1.3, y: Y + 0.5, path: [], pathIdx: 0, timer: 0, variant: k % 2 ? 6 : k % 6, speed: 0, home: -1 });
  g.select(null);
  return { fx: f.x, Y, stilts, craftRefused: !craft.ok, craftReason: craft.reason };
});
for (const [name, tick] of [['street_4x', 250], ['street_night_4x', 640]]) {
  await page.evaluate(([x, y, tick]) => { const g = window.__game, s = g.state; s.tick = s.day * 900 + tick; g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(x, y); g.renderer.invalidateAll(); g.ui.refresh(); }, [street.fx - 1, street.Y, tick]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/iter96_${name}.png` });
}
const panel = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  w.tick(s); // a day's trade for the panel's numbers
  const c = s.buildings.find((b) => b && b.kind === 'caravanserai');
  s.tick = s.day * 900 + 250; g.renderer.invalidateAll();
  g.select(c); g.ui.refresh();
  return document.body.innerText.match(/The caravans[^\n]*\n?[^\n]*/)?.[0] ?? '';
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter96_panel.png' });
const menu = await page.evaluate(() => {
  const g = window.__game;
  g.select(null);
  g.ui.category = 'zones'; g.ui.refreshItems(); g.ui.refresh();
  return document.body.innerText.includes('Craft');
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter96_zones_menu.png' });
console.log(JSON.stringify({ peoples, atlasHas, start, street, panel, menu, errors, missing }, null, 1));
const ok = peoples.includes('fennex') && !atlasHas.length && start.faction === 'fennex' && start.marshNear > 15 && street.stilts > 0 && street.craftRefused && panel.length > 0 && !errors.length && !missing.length;
console.log(ok ? 'PLAYTEST 96 OK' : 'PLAYTEST 96 FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
