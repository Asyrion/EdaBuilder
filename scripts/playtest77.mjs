// Iteration 77 (the sprites faced and fitted): the survey tool. From a running build (port 4173, "after") and, when served,
// the previous main (OLD_PORT, default 4174, "before"), it writes sheets of every building sprite over its footprint diamond
// (the yellow diamond is the footprint, the red edge its right face, where the procedural set keeps its door and gable):
//   shots/iter77_<tag>_heroes.png   the painted hero buildings, each beside its mirror, at 5×
//   shots/iter77_<tag>_zones.png    the painted zone houses, each beside its mirror, at 6×
//   shots/iter77_<tag>_all.png      every b_ sprite in the atlas over its diamond, at 3×
// then a town on seed 77: the Founding Stake at its four stages on a street of 2×2 halls, and the Hall of Wicks between two
// 3×3 wonders on a second street, by day and by night at 3×, after and before; no errors, no missing sprites.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

// footprints in tiles for the sheet: the zone houses are 1×1; a b_ sprite's key is its building (stages and tree stages stripped)
const SIZES = { stake: 2, cistern: 2, depot: 2, cartersyard: 2, ossuary: 2, sextonchapel: 2, boneyard: 2, lyceum: 2, nexus: 2, hallofwicks: 3, well: 1, seep: 1, tidewell: 1, spire: 1, wicktower: 1 };
const HEROES = ['b_stake_s0', 'b_stake_s1', 'b_stake_s2', 'b_stake_s3', 'b_cistern', 'b_depot', 'b_cartersyard', 'b_ossuary', 'b_sextonchapel', 'b_boneyard', 'b_lyceum', 'b_nexus', 'b_spire', 'b_wicktower', 'b_well', 'b_seep', 'b_tidewell', 'b_hallofwicks'];
const ZONES = ['hearth_l2', 'craft_l1', 'craft_l2', 'craft_l3', 'arcane_l2', 'market_l3'].flatMap((k) => [0, 1, 2, 3].map((v) => `${k}_v${v}`));

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
      g.strokeStyle = 'rgba(255,230,80,0.8)'; path(); g.stroke();
      g.strokeStyle = 'rgba(255,60,60,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(d[1][0], d[1][1]); g.lineTo(d[2][0], d[2][1]); g.stroke();
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.textAlign = 'center';
      g.fillText(r ? `${n}${m ? ' (mirror)' : ''} ${r.w}×${r.h}` : `${n} MISSING`, x0 + cellW / 2, y0 + cellH - 6);
    });
    return c.toDataURL();
  }, [names, Z, cols, mirror, sizes]);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

// the town: a street with the Stake's four stages shown by the milestone, 2×2 halls beside it, and the Hall of Wicks between two 3×3 wonders
const TOWN = () => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(77, 'Wickstead', 'valley', 'tallowkin');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.treasury = 999999; s.sectors.fill(1); s.vigilKept = true;
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 12; y <= f.y + 12; y++) for (let x = f.x - 16; x <= f.x + 18; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const Y = f.y + 2; // the Stake's street: the Stake and three 2×2 halls front it
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 14, Y, f.x + 16, Y, false));
  const put = (k, x, y) => { const b = w.place(s, k, x, y); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; } return b; };
  put('depot', f.x + 3, f.y); put('cistern', f.x + 6, f.y); put('cartersyard', f.x - 4, f.y);
  const Y2 = f.y + 9; // the wonders' street, far enough south that the castle's spires stay clear of the Stake
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 14, Y2, f.x + 16, Y2, false));
  const hall = put('hallofwicks', f.x - 1, Y2 + 1);
  put('hallofmarvels', f.x - 5, Y2 + 1); put('underkingseat', f.x + 3, Y2 + 1);
  w.recomputeAll(s);
  g.select(null);
  return { fx: f.x, fy: f.y, Y, Y2, hall: hall ? [hall.x, hall.y] : null };
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
  await page.screenshot({ path: `shots/iter77_${tag}_${name}.png` });
}

for (const [port, tag] of [['4173', 'after'], [OLD_PORT, 'before']]) {
  const page = await open(port);
  if (!page) { console.log(tag, `no server on ${port}`); continue; }
  await sheet(page, HEROES, 5, 6, true, `shots/iter77_${tag}_heroes.png`, SIZES);
  await sheet(page, ZONES, 6, 8, true, `shots/iter77_${tag}_zones.png`, SIZES);
  const all = await page.evaluate(() => Object.keys(window.__wardlight.atlas.sprites).filter((n) => /^b_[a-z]+$/.test(n)).sort());
  await sheet(page, all, 3, 8, false, `shots/iter77_${tag}_all.png`, SIZES);
  const town = await page.evaluate(TOWN);
  console.log(tag, 'sheets written;', all.length, 'b_ sprites; town', JSON.stringify(town));
  // the Stake's four stages: milestones 0, 3, 6, 7 (STAKE_STAGE_AT); the halls beside it stay
  for (const [st, ms] of [[0, 0], [1, 3], [2, 6], [3, 7]]) await shot(page, tag, `stake_s${st}_3x`, town.fx + 2, town.fy + 1, 3, 200, ms);
  await shot(page, tag, 'stake_s3_night_3x', town.fx + 2, town.fy + 1, 3, 640, 7);
  await shot(page, tag, 'hallofwicks_3x', town.fx, town.Y2 + 2, 3, 200, 7);
  await shot(page, tag, 'hallofwicks_night_3x', town.fx, town.Y2 + 2, 3, 640, 7);
  await shot(page, tag, 'town_2x', town.fx, town.Y + 3, 2, 200, 7);
  await page.close();
}
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
