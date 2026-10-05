// Iteration 78 (the scale of things): iteration 77's survey tool with a citizen standing at every tile's front corner, so each
// building is judged against the folk. From a running build (port 4173, "after") and, when served, the previous main
// (OLD_PORT, default 4174, "before"), it writes sheets of building sprites over their footprint diamonds (yellow; the red edge
// is the right face), a citizen beside each:
//   shots/iter78_<tag>_small.png    the 1×1 buildings, painted and drawn, at 6×
//   shots/iter78_<tag>_zones.png    the level-1 zone houses of every people, at 6×
//   shots/iter78_<tag>_all.png      every b_ sprite in the atlas over its diamond, at 3×
// then a street on seed 78: the three wells, the spire, level-1 and level-2 houses, a craft, a market, the depot, the cistern, a
// watchpost and a healer, sixteen folk on the road, at 2×, 4× and 6×, after and before; no errors, no missing sprites.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

// footprints in tiles for the sheet: the zone houses are 1×1; a b_ sprite's key is its building (stages and tree stages stripped)
const SIZES = { academy: 2, stake: 2, cistern: 2, depot: 2, cartersyard: 2, ossuary: 2, sextonchapel: 2, boneyard: 2, lyceum: 2, nexus: 2, hallofwicks: 3, well: 1, seep: 1, tidewell: 1, spire: 1, wicktower: 1 };
const SMALL = ['b_well', 'b_tidewell', 'b_seep', 'b_wardlantern', 'b_shrine', 'b_candleshrine', 'b_fishershut', 'b_smokehouse', 'b_reedcutters', 'b_healer', 'b_torrentmill', 'b_mothloft', 'b_watchpost', 'b_spire', 'b_wicktower', 'b_garden', 'b_quarry', 'b_quay', 'b_weir', 'b_landing', 'b_stoneward', 'b_portalarch', 'b_eggshellfont', 'b_academy'];
const ZONES = ['', '_grimmen', '_veshari', '_tallowkin'].flatMap((p) => ['hearth_l1', 'craft_l1', 'market_l1', 'arcane_l1'].flatMap((k) => [0, 1].map((v) => `${k}_v${v}${p}`)));

async function open(port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${port} console: ${m.text()}`); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  try { await page.goto(`http://localhost:${port}/`, { timeout: 8000 }); } catch { await page.close(); return null; }
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  return page;
}

/** A sheet of named sprites over their footprint diamonds; with mirror, each beside its mirrored twin. */
async function sheet(page, names, Z, cols, mirror, file, sizes) {
  const url = await page.evaluate(([names, Z, cols, mirror, sizes]) => {
    const a = window.__wardlight.atlas;
    const items = names.flatMap((n) => (mirror ? [[n, false], [n, true]] : [[n, false]]));
    const foot = (n) => { if (!/^b_/.test(n)) return 1; const k = n.replace(/^b_/, '').replace(/_(s\d|\d)$/, ''); return sizes[k] ?? (a.get(n).w > 70 ? 3 : a.get(n).w > 40 ? 2 : 1); };
    const rs = items.map(([n, m]) => (m ? a.mirrored(n) : a.get(n)));
    const cellW = Math.max(...items.map(([n], i) => Math.max(rs[i]?.w ?? 0, foot(n) * 32))) * Z + 16;
    const cellH = Math.max(...items.map(([n], i) => Math.max(rs[i]?.h ?? 0, foot(n) * 16) + 8)) * Z + 28;
    const c = document.createElement('canvas'); c.width = cols * cellW; c.height = Math.ceil(items.length / cols) * cellH;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#2b3a2b'; g.fillRect(0, 0, c.width, c.height);
    items.forEach(([n, m], i) => {
      const r = rs[i]; const f = foot(n);
      const x0 = (i % cols) * cellW, y0 = Math.floor(i / cols) * cellH;
      g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, cellW - 1, cellH - 1);
      const top = [x0 + cellW / 2, y0 + cellH - 22 - f * 16 * Z];
      const d = [[0, 0], [f * 16, f * 8], [0, f * 16], [-f * 16, f * 8]].map(([x, y]) => [top[0] + x * Z, top[1] + y * Z]);
      const path = () => { g.beginPath(); d.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
      g.fillStyle = '#6a8f4e'; path(); g.fill();
      if (r) g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, top[0] - r.ax * Z, top[1] - r.ay * Z, r.w * Z, r.h * Z);
      const cit = a.get('cit_0_0'); // a citizen (12 px tall) at the tile's front corner, the yardstick
      if (cit) g.drawImage(cit.src ?? a.image, cit.x, cit.y, cit.w, cit.h, d[2][0] + 6 * Z - cit.ax * Z, d[2][1] - cit.ay * Z, cit.w * Z, cit.h * Z);
      g.strokeStyle = 'rgba(255,230,80,0.8)'; path(); g.stroke();
      g.strokeStyle = 'rgba(255,60,60,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(d[1][0], d[1][1]); g.lineTo(d[2][0], d[2][1]); g.stroke();
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.textAlign = 'center';
      g.fillText(r ? `${n}${m ? ' (mirror)' : ''} ${r.w}×${r.h} ${(r.h / 12).toFixed(1)} folk` : `${n} MISSING`, x0 + cellW / 2, y0 + cellH - 6);
    });
    return c.toDataURL();
  }, [names, Z, cols, mirror, sizes]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

// the street: the small buildings and the houses in a row above a road, the halls below it, sixteen folk on the road
const TOWN = () => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(78, 'Scaleton', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 999999; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 12; y <= f.y + 12; y++) for (let x = f.x - 16; x <= f.x + 18; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const Y = f.y + 5;
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 14, Y, f.x + 16, Y, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; } return b; };
  put('well', f.x - 6, Y - 1); put('seep', f.x - 4, Y - 1); put('tidewell', f.x - 2, Y - 1); put('spire', f.x, Y - 1);
  put('hearth', f.x + 2, Y - 1, 1); put('hearth', f.x + 4, Y - 1, 2); put('craft', f.x + 6, Y - 1, 1); put('market', f.x + 8, Y - 1, 1);
  put('shrine', f.x + 10, Y - 1); put('wardlantern', f.x + 12, Y - 1);
  put('depot', f.x - 6, Y + 1); put('cistern', f.x - 3, Y + 1); put('watchpost', f.x, Y + 1); put('healer', f.x + 2, Y + 1); put('fishershut', f.x + 4, Y + 1); put('smokehouse', f.x + 6, Y + 1);
  w.recomputeAll(s);
  for (let k = 0; k < 16; k++) s.agents.push({ id: 90000 + k, kind: 0, x: f.x - 7 + k * 1.2, y: Y + 0.5, path: [], pathIdx: 0, timer: 0, variant: k % 6, speed: 0, home: -1 });
  g.select(null);
  return { fx: f.x, Y };
};
async function shot(page, tag, name, x, y, zoom, tick, milestone) {
  await page.evaluate(([x, y, zoom, tick, milestone]) => {
    const g = window.__game, s = g.state;
    s.milestone = milestone;
    for (const b of s.buildings) if (b) b.lit = true;
    s.tick = s.day * 900 + tick;
    g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y);
    g.renderer.invalidateAll(); g.ui.refresh();
    for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  }, [x, y, zoom, tick, milestone]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `shots/iter78_${tag}_${name}.png` });
}

for (const [port, tag] of [['4173', 'after'], [OLD_PORT, 'before']]) {
  const page = await open(port);
  if (!page) { console.log(tag, `no server on ${port}`); continue; }
  await sheet(page, SMALL, 6, 8, false, `shots/iter78_${tag}_small.png`, SIZES);
  await sheet(page, ZONES, 6, 8, false, `shots/iter78_${tag}_zones.png`, SIZES);
  const all = await page.evaluate(() => Object.keys(window.__wardlight.atlas.sprites).filter((n) => /^b_[a-z]+$/.test(n)).sort());
  await sheet(page, all, 3, 8, false, `shots/iter78_${tag}_all.png`, SIZES);
  const town = await page.evaluate(TOWN);
  console.log(tag, 'sheets written;', all.length, 'b_ sprites; street', JSON.stringify(town));
  await shot(page, tag, 'wells_6x', town.fx - 3, town.Y, 6, 200, 8);
  await shot(page, tag, 'houses_6x', town.fx + 5, town.Y, 6, 200, 8);
  await shot(page, tag, 'street_4x', town.fx + 2, town.Y, 4, 200, 8);
  await shot(page, tag, 'street_2x', town.fx + 2, town.Y, 2, 200, 8);
  await shot(page, tag, 'street_night_4x', town.fx + 2, town.Y, 4, 640, 8);
  await page.close();
}
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
