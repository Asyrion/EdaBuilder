// Iteration 60 (M16 part 2, the water): a lakeside town painted east of the stake (a lake with open water, a shore, a
// 2-wide river west of it). Fishers' Huts with boats out by day and moored at night; fish on a market's shelf and the
// hearth's happiness line; a smokehouse; reed-cutters thatching the level-1 homes; a water garden on the lake shore; a ford
// over the river beside a cobbled bridge, under water in the Thaw's first days; the panels; a dawn and dusk probe; no errors.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(600);
await page.fill('#t-seed', '60'); await page.click('#t-new'); await page.waitForTimeout(400);

const town = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, W = w.water, f = s.founding;
  document.getElementById('help').classList.add('hidden'); g.paused = true;
  s.milestone = 6; s.treasury = 999999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  const T = { Water: 1, Deep: 0, Shore: 2, Grass: 3 };
  const at = (x, y) => y * s.w + x;
  // clear the ground, then paint the lake and the river
  for (let y = f.y - 26; y <= f.y + 26; y++) for (let x = f.x - 22; x <= f.x + 30; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = T.Grass; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  const L = { x: f.x + 18, y: f.y + 10 };
  for (let y = L.y - 6; y <= L.y + 6; y++) for (let x = L.x - 7; x <= L.x + 7; x++) if ((x - L.x) ** 2 / 49 + (y - L.y) ** 2 / 36 <= 1.05) s.terrain[at(x, y)] = Math.abs(x - L.x) <= 3 && Math.abs(y - L.y) <= 2 ? T.Deep : T.Water;
  for (let y = L.y - 8; y <= L.y + 8; y++) for (let x = L.x - 9; x <= L.x + 9; x++) { const i = at(x, y); if (s.terrain[i] <= 1) continue; let wet = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.terrain[at(x + dx, y + dy)] <= 1) wet = true; if (wet) s.terrain[i] = T.Shore; }
  const RX = f.x - 8;
  for (let y = f.y - 24; y <= f.y + 24; y++) { s.terrain[at(RX, y)] = T.Water; s.terrain[at(RX + 1, y)] = T.Water; s.terrain[at(RX - 1, y)] = T.Shore; s.terrain[at(RX + 2, y)] = T.Shore; }
  // the derived water maps
  const n = s.w * s.h; const wd = new Uint8Array(n).fill(15); const q = [];
  for (let i = 0; i < n; i++) if (s.terrain[i] <= 1) { wd[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const j = q[h]; const x = j % s.w, y = (j / s.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = at(x + dx, y + dy); if (x + dx < 0 || y + dy < 0 || x + dx >= s.w || y + dy >= s.h) continue; if (wd[k] > wd[j] + 1) { wd[k] = wd[j] + 1; q.push(k); } } }
  s.waterDist = wd;
  W.forgetWaters(s); s.water.fish = []; s.wild.herds = []; s.agents = s.agents.filter((a) => a.herdId === undefined);
  // the roads: a high street west to east over the river (a ford) and a cobbled bridge south of it
  const Y = f.y + 3;
  w.actions.buildRoad(s, 1, w.actions.roadPath(RX - 6, Y, L.x - 9, Y, false));
  w.actions.buildRoad(s, 2, w.actions.roadPath(RX - 6, Y + 8, f.x + 4, Y + 8, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 4, Y, f.x + 4, Y + 8, true));
  w.actions.buildRoad(s, 1, w.actions.roadPath(L.x - 9, Y, L.x - 9, L.y + 5, true));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; } return b; };
  const hut1 = put('fishershut', L.x - 8, L.y - 1); hut1.workers = 4;
  const hut2 = put('fishershut', L.x - 8, L.y + 3); hut2.workers = 2;
  const smoke = put('smokehouse', L.x - 10, L.y + 2); smoke.workers = 2;
  const reeds = put('reedcutters', L.x - 8, L.y - 4); reeds.workers = 3;
  const weirB = null;
  const market = put('market', L.x - 10, Y - 1, 2);
  const homes = [];
  for (let k = 0; k < 6; k++) homes.push(put('hearth', L.x - 16 + k, Y + 1, 1), put('hearth', L.x - 16 + k, Y - 1, 1));
  const garden = put('watergarden', L.x - 9, L.y + 7 - 1);
  const well = put('well', L.x - 10, L.y - 3);
  for (const [dx, dy] of [[1, 0], [6, 0], [11, 0], [11, 5]]) put('spire', f.x + dx, f.y + dy); // light from the node, chained along the street
  for (const h of homes) if (h) h.residents = 3;
  w.recomputeAll(s);
  g.select(null);
  return { hut1: hut1.id, hut2: hut2.id, smoke: smoke.id, reeds: reeds.id, market: market.id, garden: !!garden, well: well?.id ?? -1, homes: homes.filter(Boolean).length, L, RX, Y, weir: weirB };
});
console.log('town', JSON.stringify(town));

// run the Ember (day 60–64): boats out, fish, thatch
const run = await page.evaluate(async ({ L }) => {
  const g = window.__game, s = g.state, w = window.__wardlight, W = w.water;
  s.day = 60; s.tick = 60 * 900;
  const tales = [];
  for (let t = 0; t < 900 * 8; t++) { if (s.pendingEvent) { tales.push(s.pendingEvent.id); w.resolveEvent(s, 0); } w.tick(s); }
  s.tick = s.day * 900 + 180; // noon
  const boats = s.agents.filter((a) => a.kind === 3 && a.species === 'boat');
  const hut = s.buildings.find((b) => b && b.kind === 'fishershut');
  const body = W.bodyOf(s, hut);
  const wt = W.watersOf(s);
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(L.x - 4, L.y);
  g.renderer.invalidateAll(); g.ui.refresh();
  for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  return { tales, day: s.day, boats: boats.length, onWater: boats.every((a) => wt.body[Math.floor(a.y) * s.w + Math.floor(a.x)] === body), caught: s.stats.fishCaught, spoiled: s.stats.fishSpoiled, smoked: s.stats.fishSmoked, fishAt: s.water.fishAt.length / 2, thatched: s.stats.homesThatched, shoal: Math.round(s.water.fish[body]), cap: Math.round(W.shoalCap(wt, body)) };
}, { L: town.L });
console.log('ember run', JSON.stringify(run));
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter60_lake_noon_2x.png' });
await page.evaluate(({ L }) => { const g = window.__game; g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(L.x - 7, L.y); }, { L: town.L });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter60_lake_noon_4x.png' });

// the panels: the hut, the market, a thatched home
const panels = await page.evaluate(({ hut1, market }) => {
  const g = window.__game, s = g.state;
  const pick = (id) => s.buildings.find((b) => b && b.id === id);
  g.select(pick(hut1)); g.ui.refresh();
  const hutText = document.getElementById('info').innerText;
  g.select(pick(market)); g.ui.refresh();
  const marketText = document.getElementById('info').innerText;
  const home = s.buildings.find((b) => b && b.kind === 'hearth' && (b.thatchUntil ?? -1) > s.day);
  g.select(home ?? null); g.ui.refresh();
  const homeText = document.getElementById('info').innerText;
  return { hut: /Fishing/.test(hutText) && /The shoal/.test(hutText) && /On the racks/.test(hutText), market: /Fish on the shelves/.test(marketText), home: !!home && /thatched for/.test(homeText), fishLine: /fish on the shelves/.test(homeText), hutText: hutText.slice(0, 400) };
}, { hut1: town.hut1, market: town.market });
console.log('panels', JSON.stringify({ hut: panels.hut, market: panels.market, home: panels.home, fishLine: panels.fishLine }));
console.log(panels.hutText.replace(/\n/g, ' | '));
await page.evaluate(({ hut1 }) => { const g = window.__game; g.select(g.state.buildings.find((b) => b && b.id === hut1)); g.ui.refresh(); }, { hut1: town.hut1 });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter60_hut_panel.png' });

// night: the boats come in to their moorings
const night = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, W = w.water;
  g.select(null);
  for (let t = 0; t < 600; t++) { if (s.pendingEvent) w.resolveEvent(s, 0); w.tick(s); }
  const day = s.day; s.tick = day * 900 + 640; // midnight
  for (let t = 0; t < 400; t++) { if (s.pendingEvent) w.resolveEvent(s, 0); w.tick(s); s.tick = day * 900 + 640; }
  const boats = s.agents.filter((a) => a.kind === 3 && a.species === 'boat');
  const moored = boats.filter((a) => { const h = s.buildings.find((b) => b && b.id === a.anchorId); const m = W.mooringOf(s, h); return Math.floor(a.x) + Math.floor(a.y) * s.w === m; }).length;
  g.renderer.invalidateAll();
  return { boats: boats.length, moored };
});
console.log('night', JSON.stringify(night));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter60_lake_night_4x.png' });

// the ford: the Thaw's high water closes it; the cobbled bridge stays open
const ford = await page.evaluate(({ RX, Y }) => {
  const g = window.__game, s = g.state, w = window.__wardlight, W = w.water;
  const i = Y * s.w + RX;
  const out = { isFord: W.isFordTile(s, i), bridge: !W.isFordTile(s, (Y + 8) * s.w + RX) };
  s.day = 121; W.dailyFords(s);
  out.closedThaw = W.fordClosed(s, i);
  s.day = 135; W.dailyFords(s);
  out.openAfter = !W.fordClosed(s, i);
  s.day = 122; W.dailyFords(s); s.tick = s.day * 900 + 180; // noon in the Thaw: the ford under water, the bridge beside it
  g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(RX, Y + 4); g.renderer.invalidateAll();
  return out;
}, { RX: town.RX, Y: town.Y });
console.log('ford', JSON.stringify(ford));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter60_ford_thaw_4x.png' });

const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  const base = s.day * 900;
  for (let t = 520; t <= 900; t += 40) { s.tick = base + t; r.render(s, g.view, 0.016); ctx.drawImage(r.back, 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
