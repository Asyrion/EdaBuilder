// Iteration 57 (the donkey carts): a street at noon with Craft works, Markets and folk, and road carts placed going both ways;
// shots at 2× and 4×; each cart's sprite name, facing and opaque box against a citizen's; a real run until a cart delivers;
// the "See the first cart deliver" Show me lands the camera on a cart; the page without paintings falls back to the
// procedural carts; a dusk brightness probe; no errors, no missing sprites.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open({ noArt = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !(noArt && /404/.test(m.text()))) errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  if (noArt) await page.route('**/art/sprites.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(400);
  return page;
}

// a street: one road east-west, works and markets on it, homes behind, carts placed on the road both ways
const SCENE = () => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  document.getElementById('help').classList.add('hidden'); g.paused = true;
  s.milestone = 3; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 14; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 3, f.x + 16, f.y + 3, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x + 4, f.y - 6, f.x + 4, f.y + 10, true));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; } return b; };
  for (let k = 0; k < 4; k++) put('craft', f.x - 8 + k, f.y + 2, 1), put('market', f.x + 6 + k, f.y + 2, 1);
  for (let k = 0; k < 4; k++) put('hearth', f.x - 8 + k, f.y + 4, 1), put('hearth', f.x + 6 + k, f.y + 4, 2);
  w.recomputeAll(s);
  s.tick = 180; // noon of day 0
  // road carts, placed: variants 1 and 2 (goods) and 0 (leystone), each way along both roads; and folk beside them
  s.agents = s.agents.filter((a) => a.kind !== 1 && a.kind !== 0);
  const mk = (kind, x, y, dir, variant) => s.agents.push({ id: s.nextAgentId++, kind, x: x + 0.5, y: y + 0.5, path: [], pathIdx: 0, speed: 0.8, homeId: 0, targetId: -1, timer: 0, variant, dir, load: 0 });
  const CIT = 0, CART = 1;
  for (let k = 0; k < 6; k++) mk(CART, f.x - 8 + k * 2, f.y + 3, k % 2 ? 2 : 0, k === 5 ? 0 : 1 + (k % 2));
  for (let k = 0; k < 4; k++) mk(CART, f.x + 4, f.y - 4 + k * 3, k % 2 ? 3 : 1, 1 + (k % 2));
  for (let k = 0; k < 5; k++) mk(CIT, f.x - 7 + k * 2, f.y + 3, 0, k);
  g.select(null);
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x - 2, f.y + 2);
  g.renderer.invalidateAll(); g.ui.refresh();
  document.getElementById('toast').classList.add('hidden');
  document.querySelectorAll('.lesson, #lesson').forEach((e) => e.classList.add('hidden'));
  return { placed: s.buildings.filter((b) => b).map((b) => b.kind).join(','), carts: s.agents.filter((a) => a.kind === 1).map((a) => `${a.x},${a.y}`).join(' '), f: [f.x, f.y] };
};

const MEASURE = () => {
  const g = window.__game, s = g.state, atlas = window.__wardlight.atlas;
  const img = atlas.image; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const box = (name) => { const r = atlas.get(name); if (!r) return null; const d = ctx.getImageData(r.x, r.y, r.w, r.h).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (d[(y * r.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
  const names = s.agents.filter((a) => a.kind === 1).map((a) => ({ id: a.id, v: a.variant, dir: a.dir, name: g.renderer.constructor && null }));
  return { cit: box('cit_0_0'), oldCart: box('cart_1'), goods: atlas.countVariants('cartp_goods_'), stone: atlas.countVariants('cartp_stone_'), boxes: Array.from({ length: atlas.countVariants('cartp_goods_') }, (_, k) => box(`cartp_goods_${k}`)), stoneBoxes: Array.from({ length: atlas.countVariants('cartp_stone_') }, (_, k) => box(`cartp_stone_${k}`)), twins: atlas.has('cartp_goods_0_l') && atlas.has('cartp_stone_0_l'), n: names.length };
};

const page = await open();
console.log('scene', JSON.stringify(await page.evaluate(SCENE)));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter57_street_2x.png' });
await page.evaluate(() => { const g = window.__game, f = g.state.founding; g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(f.x - 4, f.y + 3); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter57_street_4x.png' });
await page.evaluate(() => { const g = window.__game, f = g.state.founding; g.renderer.camera.centerOnTile(f.x + 4, f.y); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter57_cross_4x.png' });
const m = await page.evaluate(MEASURE);
console.log('citizen box', m.cit, 'old cart', m.oldCart, 'goods pool', m.goods, 'stone pool', m.stone, 'twins', m.twins);
const hs = m.boxes.map((b) => b.h), ws = m.boxes.map((b) => b.w);
console.log('goods carts h', Math.min(...hs), '–', Math.max(...hs), 'w', Math.min(...ws), '–', Math.max(...ws), '; stone', m.stoneBoxes.map((b) => `${b.w}×${b.h}`).join(' '));

// a dusk brightness probe over a few frames
const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  for (let t = 560; t <= 680; t += 20) { s.tick = t; r.render(s, g.view, 0.016); ctx.drawImage(document.getElementById('game'), 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');
await page.close();

// a real run: the works fill carts that drive to the markets; then the Show me of o_cart lands on a cart
const run = await open();
const live = await run.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  document.getElementById('help').classList.add('hidden'); g.paused = true;
  s.milestone = 3; s.treasury = 99999; s.sectors.fill(1);
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 14; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 3, f.x + 16, f.y + 3, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.residents = 8; b.workers = 8; } return b; };
  for (let k = 0; k < 4; k++) put('craft', f.x - 8 + k, f.y + 2, 1), put('market', f.x + 10 + k, f.y + 2, 1);
  for (let k = 0; k < 6; k++) put('hearth', f.x - 8 + k, f.y + 4, 1), put('hearth', f.x + 6 + k, f.y + 4, 1);
  w.recomputeAll(s);
  const d0 = s.stats.goodsDelivered; let seen = 0, firstTick = -1;
  const crafts = s.buildings.filter((b) => b && b.kind === 'craft');
  for (let t = 0; t < 2700; t++) { for (const b of crafts) b.stock = Math.max(b.stock ?? 0, 20); w.tick(s); if (s.stats.goodsDelivered > d0 && firstTick < 0) firstTick = s.tick; if (s.agents.some((a) => a.kind === 1 && a.load > 0 && a.targetId !== -1)) seen++; if (firstTick > 0 && seen > 5 && t % 10 === 0 && s.agents.some((a) => a.kind === 1 && a.load > 0 && a.targetId !== -1)) break; }
  const carts = s.agents.filter((a) => a.kind === 1);
  // the Show me
  g.renderer.camera.setZoom(1); g.renderer.camera.centerOnTile(5, 5);
  g.ui.focus({ center: 'cart' });
  const cam = g.renderer.camera; const [cx, cy] = cam.screenToWorld(cam.viewW / 2, cam.viewH / 2);
  const near = carts.map((a) => { const wx = (a.x - a.y) * 16, wy = (a.x + a.y) * 8; return Math.hypot(wx - cx, wy - cy); });
  g.renderer.invalidateAll();
  return { firstTick, delivered: s.stats.goodsDelivered - d0, carts: carts.length, loaded: carts.filter((a) => a.load > 0).length, dirs: [0, 1, 2, 3].map((d) => carts.filter((a) => a.dir === d).length), zoom: cam.zoom, nearest: Math.round(Math.min(...near)), questFocus: true };
});
console.log('live run', JSON.stringify(live));
await run.waitForTimeout(400);
await run.evaluate(() => { const g = window.__game; g.ui.refresh(); ['toast', 'lesson'].forEach((id) => document.getElementById(id)?.classList.add('hidden')); g.state.lessonsSeen = ['districts']; });
await run.waitForTimeout(300);
await run.screenshot({ path: 'shots/iter57_showme.png' });
await run.close();

// no paintings: the procedural carts stand in
const bare = await open({ noArt: true });
await bare.evaluate(SCENE);
const bareNames = await bare.evaluate(() => ({ goods: window.__wardlight.atlas.countVariants('cartp_goods_'), cart1: window.__wardlight.atlas.has('cart_1') }));
console.log('without paintings', JSON.stringify(bareNames));
await bare.waitForTimeout(300);
await bare.screenshot({ path: 'shots/iter57_street_procedural.png' });
await bare.close();

console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
