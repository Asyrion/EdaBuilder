// Iteration 56 (the playtest batch): a night street like the playtest screenshot (the Founding Stake, a well, a spire, houses),
// a selected well whose ring now shows over the houses with its label, a well being placed with every well's water, a cradle's
// feeding reach, the painted heroes measured against their procedural twins, and the scene before (OLD_ART=<dir> serves the
// previous sprites) and after; no errors, no missing sprites.
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
const OLD = process.env.OLD_ART;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open({ old = false, noArt = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  // the page without paintings asks for the manifest and gets the 404 it was given: that one is ours, not the game's
  page.on('console', (m) => { if (m.type() === 'error' && !(noArt && /404/.test(m.text()))) errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  if (noArt) await page.route('**/art/sprites.json', (r) => r.fulfill({ status: 404, body: '' }));
  if (old && OLD) await page.route('**/art/**', (r) => { const f = `${OLD}/${new URL(r.request().url()).pathname.split('/art/')[1]}`; return existsSync(f) ? r.fulfill({ status: 200, body: readFileSync(f), contentType: f.endsWith('.json') ? 'application/json' : 'image/png' }) : r.continue(); });
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(400);
  return page;
}

// the screenshot's street, at night: returns handles for the checks
const SCENE = () => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  document.getElementById('help').classList.add('hidden'); g.paused = true;
  s.milestone = 6; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  for (let y = f.y - 12; y <= f.y + 14; y++) for (let x = f.x - 16; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 12, f.y + 3, f.x + 16, f.y + 3, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 6, f.y - 8, f.x + 6, f.y + 12, true));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  const spire = put('spire', f.x + 3, f.y + 4);
  const well = put('well', f.x - 3, f.y + 4);
  const homes = [];
  for (let k = 0; k < 6; k++) homes.push(put('hearth', f.x + 7 + k, f.y + 4, 2), put('hearth', f.x + 7 + k, f.y + 2, 1));
  for (let k = 0; k < 4; k++) homes.push(put('hearth', f.x - 4 + k, f.y + 2, 2));
  w.recomputeAll(s);
  s.tick = 630; // midnight of day 0
  g.select(null);
  g.renderer.camera.centerOnTile(f.x + 2, f.y + 3); g.renderer.camera.setZoom(2);
  g.renderer.invalidateAll(); g.ui.refresh();
  document.getElementById('toast').classList.add('hidden');
  return { well: well.id, spire: spire.id };
};

// ---- the scene before and after
const after = await open();
await after.evaluate(SCENE);
await after.waitForTimeout(500);
await after.screenshot({ path: 'shots/iter56_scene_after.png' });
if (OLD) { const before = await open({ old: true }); await before.evaluate(SCENE); await before.waitForTimeout(500); await before.screenshot({ path: 'shots/iter56_scene_before.png' }); await before.close(); }

await after.close();

// ---- the rings: a fresh page with the scene, counted on the back buffer
async function scenePage() { const p = await open(); await p.evaluate(SCENE); return p; }
const p1 = await scenePage();
const ringChecks = await p1.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer, out = {};
  const px = () => r.back.getContext('2d').getImageData(0, 0, r.back.width, r.back.height).data;
  // anti-aliased one-pixel lines mix with the ground, so the colour tests are loose
  const isGold = (d, i) => d[i] > 150 && d[i + 1] > 120 && d[i] - d[i + 2] > 50;
  const isCyan = (d, i) => d[i + 2] > 150 && d[i + 1] > 140 && d[i + 2] - d[i] > 40;
  const isViolet = (d, i) => d[i] > 170 && d[i + 2] > 220 && d[i + 1] < 205 && d[i + 2] - d[i + 1] > 40;
  const homes = s.buildings.filter((b) => b && b.kind === 'hearth');
  const well = s.buildings.find((b) => b && b.kind === 'well');
  // a mask of the houses' pixels: rendered with and without them (nothing selected)
  g.select(null); r.render(s, g.view, 0.016); const a = px();
  const saved = homes.map((h) => ({ h, k: s.buildings.indexOf(h) }));
  for (const { h, k } of saved) { s.buildings[k] = null; s.bIndex[h.y * s.w + h.x] = -1; }
  r.render(s, g.view, 0.016); const b = px();
  for (const { h, k } of saved) { s.buildings[k] = h; s.bIndex[h.y * s.w + h.x] = k; }
  const mask = new Uint8Array(a.length / 4);
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) mask[i / 4] = 1;
  // the well selected at midnight: gold outline pixels, and how many land on the houses
  g.select(well); r.render(s, g.view, 0.016); const c = px();
  let gold = 0, goldOnHomes = 0;
  for (let i = 0; i < c.length; i += 4) if (isGold(c, i) && !isGold(a, i)) { gold++; if (mask[i / 4]) goldOnHomes++; }
  out.wellRingVisible = gold > 150;
  out.wellRingOverHouses = goldOnHomes > 3; // drawn under the objects before, a ring could not land on a house at all
  out.wellRingPixels = `${gold} (${goldOnHomes} over houses)`;
  // a well being placed: its own ring in cyan, and the standing well's water around it
  g.select(null);
  g.view.ghost = { key: 'well', x: s.founding.x + 12, y: s.founding.y + 8, ok: true, radius: 8 };
  r.render(s, g.view, 0.016); const d = px();
  const faintGold = (q, i) => q[i] > 110 && q[i] - q[i + 2] > 40 && q[i + 1] > 80; // the kin's outline is half as bright as the own ring
  let cyan = 0, kin = 0; for (let i = 0; i < d.length; i += 4) { if (isCyan(d, i) && !isCyan(a, i)) cyan++; if (faintGold(d, i) && !faintGold(a, i)) kin++; }
  out.placingRing = cyan > 150;
  out.placingKinRings = kin > 50;
  g.view.ghost = null;
  // a cradle selected: its feeding reach in violet
  const w = window.__wardlight;
  const cr = w.place(s, 'cradle', s.founding.x - 8, s.founding.y + 6); cr.state = 'ok'; cr.work = 0; w.recomputeAll(s);
  g.select(cr); r.render(s, g.view, 0.016); const e = px();
  let vio = 0; for (let i = 0; i < e.length; i += 4) if (isViolet(e, i)) vio++;
  out.cradleFeedRing = vio > 100;
  g.select(well); r.render(s, g.view, 0.016);
  return out;
});
await p1.screenshot({ path: 'shots/iter56_well_ring.png' });
await p1.close();

// ---- the painted heroes measured against their procedural twins (opaque boxes, in the browser's own atlas)
const heroes = ['b_well', 'b_seep', 'b_tidewell', 'b_cistern', 'b_depot', 'b_cartersyard', 'b_ossuary', 'b_sextonchapel', 'b_boneyard', 'b_lyceum', 'b_hallofwicks', 'b_spire', 'b_wicktower', 'b_nexus'];
const towers = ['b_spire', 'b_wicktower', 'b_nexus'];
const heights = async (noArt) => {
  const p = await open({ noArt });
  const h = await p.evaluate((names) => {
    const at = window.__wardlight.atlas; const img = at.image;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const out = {};
    for (const n of names) { const s = at.sprites[n]; const d = x.getImageData(s.x, s.y, s.w, s.h).data; let y0 = s.h, y1 = -1; for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) if (d[(yy * s.w + xx) * 4 + 3] > 20) { if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } out[n] = y1 - y0 + 1; }
    return out;
  }, heroes);
  await p.close();
  return h;
};
const proc = await heights(true);
const imp = await heights(false);
const ratios = Object.fromEntries(heroes.map((n) => [n, +(imp[n] / proc[n]).toFixed(2)]));
const scale = { heroesAtScale: heroes.every((n) => ratios[n] <= (towers.includes(n) ? 1.4 : 1.2)) };

const all = { ...ringChecks, ...scale };
console.log('ratios:', JSON.stringify(ratios));
console.log('checks:', JSON.stringify(all));
const pass = Object.entries(all).every(([k, v]) => k === 'wellRingPixels' || v === true) && errors.length === 0 && warns.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors.slice(0, 5), 'warns', warns.slice(0, 5));
await browser.close();
