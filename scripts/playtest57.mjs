// Iteration 57 (M16 part 1, the wild): herds on the meadows by day, standing off lit ground; a Hunters' Lodge's panel with its
// quarry buttons and its grounds ring, the quarry chosen by a click; meat on a market's shelves and the hearth's happiness line;
// wolves at a dark edge on a Hush night; a contact sheet of every creature, painted beside procedural; the dawn and dusk
// brightness probe; no errors, no missing sprites.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open(noArt = false) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !(noArt && /404/.test(m.text()))) errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  if (noArt) await page.route('**/art/sprites.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(500);
  await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
  return page;
}

const page = await open();
// ---- scene 1: a deer herd by day, then a lit spire beside it
const one = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  const deer = s.wild.herds.filter((h) => h.sp === 'deer').sort((a, b) => b.head - a.head)[0];
  out.herds = s.wild.herds.length;
  out.deerHerd = !!deer;
  s.tick = Math.floor(s.tick / 900) * 900 + 450; // noon
  g.renderer.camera.centerOnTile(deer.x, deer.y); g.renderer.camera.setZoom(3);
  g.renderer.invalidateAll(); g.ui.refresh();
  const mine = () => s.agents.filter((a) => a.herdId === deer.id);
  out.deerAgents = mine().length;
  window.__deer = deer.id;
  return out;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter57_herd_day.png' });
const light = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  const deer = s.wild.herds.find((h) => h.id === window.__deer);
  const mine = () => s.agents.filter((a) => a.herdId === deer.id);
  // light the ground the herd stands on: a disc of lit tiles at its home (a spire's light, without the spire)
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) s.lit[(deer.y + dy) * s.w + deer.x + dx] = 1;
  const onLight = () => mine().filter((a) => { const x = Math.floor(a.x), y = Math.floor(a.y); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.lit[(y + dy) * s.w + x + dx]) return true; return false; }).length;
  out.onLightBefore = onLight();
  return out;
});
// run the sim ticks through the hook (creatures move), still at noon
await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight; const keep = s.tick; for (let k = 0; k < 150; k++) w.tick(s); g.renderer.invalidateAll(); });
const fled = await page.evaluate(() => {
  const s = window.__game.state, out = {};
  const deer = s.wild.herds.find((h) => h.id === window.__deer);
  const mine = s.agents.filter((a) => a.herdId === deer.id);
  out.deerOffLight = mine.filter((a) => { const x = Math.floor(a.x), y = Math.floor(a.y); return !s.lit[y * s.w + x]; }).length;
  out.deerCount = mine.length;
  return out;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter57_herd_fled.png' });

// ---- scene 2: a lodge beside the herd, its panel, a click on the quarry
const two = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  const deer = s.wild.herds.find((h) => h.id === window.__deer);
  s.milestone = 4; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts']; g.ui.lastMilestone = 4;
  let lodge = null;
  for (let r = 7; r < 14 && !lodge; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
    const x = deer.x + dx, y = deer.y + dy;
    let ok = true;
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) { const i = (y + fy) * s.w + x + fx; if (s.bIndex[i] >= 0 || s.terrain[i] <= 2 || s.terrain[i] >= 6 || s.road[i]) ok = false; }
    if (ok) { lodge = w.place(s, 'hunterslodge', x, y); break; }
  }
  lodge.state = 'ok'; lodge.work = 0; lodge.workers = 6;
  w.recomputeAll(s);
  g.select(lodge);
  g.ui.refresh();
  document.getElementById('toast').classList.add('hidden');
  window.__lodge = lodge.id;
  out.lodge = !!lodge;
  const btns = [...document.querySelectorAll('.quarry button')].map((b) => b.dataset.quarry);
  out.quarryButtons = btns.includes('hounds') && btns.includes('deer');
  out.panelGrounds = /The grounds/.test(document.getElementById('info').textContent) && /deer/.test(document.getElementById('info').textContent);
  return out;
});
await page.waitForTimeout(200);
await page.click('.quarry button[data-quarry="deer"]');
await page.waitForTimeout(200);
const chose = await page.evaluate(() => {
  const s = window.__game.state, out = {};
  const l = s.buildings.find((b) => b && b.id === window.__lodge);
  out.quarryChosen = l.quarry === 'deer';
  out.panelSaysDeer = /deer within 16/.test(document.getElementById('info').textContent);
  return out;
});
await page.screenshot({ path: 'shots/iter57_lodge_panel.png' });

// ---- scene 3: a market beside the lodge gets the meat, a hearth by it is happier
const three = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  const l = s.buildings.find((b) => b && b.id === window.__lodge);
  const free = (x, y) => s.bIndex[y * s.w + x] < 0 && s.terrain[y * s.w + x] > 2 && s.terrain[y * s.w + x] < 6;
  let m = null, h = null;
  for (let dy = -4; dy <= 4 && !h; dy++) for (let dx = -4; dx <= 4 && !h; dx++) { const x = l.x + dx, y = l.y + dy; if (!free(x, y)) continue; if (!m) { m = w.place(s, 'market', x, y); m.state = 'ok'; m.work = 0; } else { h = w.place(s, 'hearth', x, y); h.state = 'ok'; h.work = 0; h.residents = 2; } }
  l.meat = 10;
  w.wild.dailyMeat(s);
  out.marketMeat = m.meat;
  g.select(m); g.ui.refresh();
  out.marketRow = /Meat on the shelves/.test(document.getElementById('info').textContent);
  g.select(h); g.ui.refresh();
  out.hearthLine = /meat on the shelves/.test(document.getElementById('info').textContent);
  return out;
});
await page.screenshot({ path: 'shots/iter57_meat.png' });

// ---- scene 4: a Hush night, a wolf pack at the forest edge beside a dark hearth
const four = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  const pack = s.wild.herds.filter((h) => h.sp === 'wolf').sort((a, b) => b.head - a.head)[0];
  s.day = 95; s.tick = 95 * 900 + 640; // a Hush night
  let home = null;
  for (let r = 4; r < 12 && !home; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const x = pack.x + dx, y = pack.y + dy, i = y * s.w + x; if (s.bIndex[i] < 0 && s.terrain[i] > 2 && s.terrain[i] < 6 && !s.gloam[i]) { home = w.place(s, 'hearth', x, y); break; } }
  home.state = 'ok'; home.work = 0; home.residents = 3; home.level = 1;
  w.recomputeAll(s);
  for (let d = 0; d < 10 && !s.stats.hensTaken; d++) { s.day = 95 + d; w.wild.dailyWolves(s); }
  out.hens = s.stats.hensTaken;
  out.prey = pack.prey === home.id;
  s.day = 95 + 1;
  for (let k = 0; k < 200; k++) w.tick(s);
  s.tick = 96 * 900 + 640;
  const wolves = s.agents.filter((a) => a.herdId === pack.id);
  out.wolvesOut = wolves.length;
  out.wolfNearHome = wolves.some((a) => Math.hypot(a.x - home.x, a.y - home.y) < Math.hypot(pack.x - home.x, pack.y - home.y));
  g.select(null);
  const near = wolves.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[0];
  g.renderer.camera.centerOnTile((near.x + home.x) / 2, (near.y + home.y) / 2); g.renderer.camera.setZoom(4);
  document.getElementById('toast').classList.add('hidden');
  g.renderer.invalidateAll(); g.ui.refresh();
  return out;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter57_wolves_hush.png' });

// ---- the dawn and dusk brightness probe (iteration 55)
const dawn = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer, out = {};
  const c = document.createElement('canvas'); c.width = 32; c.height = 18; const x = c.getContext('2d', { willReadFrequently: true });
  const lum = () => { x.drawImage(document.getElementById('game'), 0, 0, 32, 18); const d = x.getImageData(0, 0, 32, 18).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2]; return t / (d.length / 4) / 3; };
  const day = Math.floor(s.tick / 900) * 900; const ls = [];
  for (const tk of [20, 26, 30, 33, 36, 40, 45, 50, 60, 340, 348, 352, 358, 365]) { s.tick = day + tk; r.render(s, g.view, 0.016); ls.push(lum()); }
  const sorted = [...ls].sort((a, b) => a - b);
  out.noBlackAtDawnOrDusk = sorted[0] > sorted[Math.floor(sorted.length / 2)] * 0.5;
  return out;
});

// ---- the contact sheet: every creature at 4×, painted (this page) beside procedural (a page with no manifest)
const NAMES = ['deer_0', 'elk_0', 'boar_0', 'goat_0', 'otter_0', 'heron_0', 'wolf_0', 'hound_0', 'tiger_0', 'thrumhare_0', 'wisp_0', 'golem_0', 'skyray_0', 'glimmoth_0', ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => `dragon_${l}_2_0`)];
const sheet = (names) => {
  const a = window.__wardlight.atlas, S = 4, cell = 34 * S;
  const c = document.createElement('canvas'); c.width = names.length * cell; c.height = cell;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#5c7846'; x.fillRect(0, 0, c.width, c.height);
  let missing = 0;
  names.forEach((n, k) => { const s = a.get(n); if (!s) { missing++; return; } x.drawImage(a.image, s.x, s.y, s.w, s.h, k * cell + (cell - s.w * S) / 2, cell - s.h * S - 6, s.w * S, s.h * S); });
  return { url: c.toDataURL(), missing };
};
const painted = await page.evaluate(sheet, NAMES);
const procPage = await open(true);
const procedural = await procPage.evaluate(sheet, NAMES);
const sheetPage = await browser.newPage({ viewport: { width: 1400, height: 400 } });
await sheetPage.setContent(`<body style="margin:0;background:#222"><img src="${painted.url}" style="display:block;image-rendering:pixelated"><img src="${procedural.url}" style="display:block;image-rendering:pixelated"></body>`);
await sheetPage.screenshot({ path: 'shots/iter57_creatures.png', fullPage: true });
const five = { contactSheetComplete: painted.missing === 0 && procedural.missing === 0 };

const all = { ...one, ...fled, ...two, ...chose, ...three, ...four, ...dawn, ...five };
console.log(JSON.stringify(all, null, 1));
const checks = {
  herdsOnTheMap: all.herds > 15 && all.deerAgents > 2,
  deerLeaveTheLight: all.deerOffLight === all.deerCount && all.deerCount > 0,
  lodgePanel: all.lodge && all.quarryButtons && all.panelGrounds,
  quarryByClick: all.quarryChosen && all.panelSaysDeer,
  meatOnTheShelves: all.marketMeat > 0 && all.marketRow && all.hearthLine,
  wolvesInTheHush: all.hens > 0 && all.prey && all.wolvesOut > 0,
  noBlackAtDawnOrDusk: all.noBlackAtDawnOrDusk,
  contactSheet: all.contactSheetComplete,
  noErrors: errors.length === 0,
  noMissingSprites: warns.length === 0,
};
console.log(JSON.stringify(checks, null, 1));
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
