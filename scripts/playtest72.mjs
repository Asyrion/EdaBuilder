// Iteration 72 (golem haulers): a street at noon with Craft works, Markets and a lit Golem Foundry; a bound warden put in
// harness through the sim (setGolemDuty 'haul'); a real run with the stock topped up until the hauler delivers 30; haulers placed
// going both ways beside donkey carts at 2× and 4×; a night with a hound by a donkey cart (it balks) and the hauler passing;
// the Foundry panel with the new option; a sheet of the hauler beside a donkey cart, a citizen and a warden at 8×; a dusk
// brightness probe; no errors, no missing sprites.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  await page.fill('#t-seed', '72'); await page.click('#t-new'); await page.waitForTimeout(400);
  return page;
}

// the street: a road east-west, works west of the foundry, markets east, homes behind, a lit foundry with one bound warden
const TOWN = () => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  document.getElementById('help').classList.add('hidden'); g.paused = true;
  s.milestone = 6; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  for (let y = f.y - 10; y <= f.y + 14; y++) for (let x = f.x - 16; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 12, f.y + 3, f.x + 16, f.y + 3, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.residents = 8; b.workers = 8; b.lit = true; } return b; };
  for (let k = 0; k < 4; k++) put('craft', f.x - 10 + k, f.y + 2, 1), put('market', f.x + 8 + k, f.y + 2, 2);
  for (let k = 0; k < 4; k++) put('hearth', f.x - 10 + k, f.y + 5, 1), put('hearth', f.x + 8 + k, f.y + 5, 2);
  const fd = put('golemfoundry', f.x - 2, f.y + 4);
  w.recomputeAll(s);
  const golem = { id: s.nextAgentId++, kind: 3, x: fd.x + 1, y: fd.y + 2.5, path: [], pathIdx: 0, speed: 0.45, homeId: fd.id, targetId: -1, timer: 0, variant: 0, dir: 0, load: 1, species: 'golem', anchorId: -1, ax: fd.x + 1, ay: fd.y + 2.5 };
  s.agents.push(golem);
  const works = s.buildings.find((b) => b && b.kind === 'craft');
  const why = w.beasts.setGolemDuty(s, golem.id, 'haul', works.id);
  s.tick = 180; // noon of day 0
  g.select(null);
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x - 1, f.y + 2);
  g.renderer.invalidateAll(); g.ui.refresh();
  document.getElementById('toast').classList.add('hidden');
  document.querySelectorAll('.lesson, #lesson').forEach((e) => e.classList.add('hidden'));
  return { why, golemId: golem.id, foundry: fd.id, works: works.id, haulers: s.agents.filter((a) => a.kind === 1 && a.variant === 6).length, f: [f.x, f.y] };
};

const page = await open();
const town = await page.evaluate(TOWN);
console.log('town', JSON.stringify(town));

// 1. a real run: the works fill the donkey carts and the hauler; the first haul of 30 arrives
const live = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  const crafts = s.buildings.filter((b) => b && b.kind === 'craft');
  let firstHaul = -1, loadSeen = 0, rests = [];
  const hauler = () => s.agents.find((a) => a.kind === 1 && a.variant === 6);
  for (let t = 0; t < 6000 && (firstHaul < 0 || t < 300); t++) {
    for (const b of crafts) b.stock = Math.max(b.stock ?? 0, 40);
    const h0 = hauler();
    const before = h0 ? h0.load : 0;
    w.tick(s);
    const h = hauler();
    if (h && h.load > loadSeen) loadSeen = h.load;
    if (h && before > 0 && h.load === 0 && firstHaul < 0) { firstHaul = s.tick; rests.push(h.timer); }
  }
  const h = hauler();
  const carts = s.agents.filter((a) => a.kind === 1);
  return { firstHaul, loadSeen, hauled: s.stats.golemHauls, delivered: s.stats.goodsDelivered, restAfter: rests[0], haulerSpeed: h && h.speed, carts: carts.length, donkeys: carts.filter((a) => a.variant <= 2).length, golemDuty: s.agents.find((a) => a.species === 'golem').duty, balked: s.stats.cartsBalked };
});
console.log('live run', JSON.stringify(live));

// 2. the street at noon: haulers placed going both ways beside donkey carts
const SCENE = () => {
  const g = window.__game, s = g.state, f = s.founding;
  s.tick = 180; g.paused = true;
  const works = s.buildings.find((b) => b && b.kind === 'craft');
  s.agents = s.agents.filter((a) => a.kind !== 1 && a.kind !== 0);
  const mk = (kind, x, y, dir, variant, load = 0) => s.agents.push({ id: s.nextAgentId++, kind, x: x + 0.5, y: y + 0.5, path: [], pathIdx: 0, speed: 0.8, homeId: works.id, targetId: -1, timer: 0, variant, dir, load, golemId: variant === 6 ? s.agents.find((a) => a.species === 'golem').id : undefined });
  const y = f.y + 3;
  mk(1, f.x - 8, y, 0, 6, 30); // the hauler, heading east (right)
  mk(1, f.x - 5, y, 0, 1, 12);
  mk(1, f.x - 2, y, 2, 2);
  mk(1, f.x + 1, y, 2, 6); // a hauler heading west (left)
  mk(1, f.x + 4, y, 0, 0);
  mk(1, f.x + 7, y, 3, 6, 30);
  for (let k = 0; k < 5; k++) mk(0, f.x - 7 + k * 3, y, k % 2 ? 2 : 0, k);
  g.select(null);
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x - 1, f.y + 2);
  g.renderer.invalidateAll(); g.ui.refresh();
  return s.agents.filter((a) => a.kind === 1).map((a) => `${a.variant}@${a.x},${a.y}d${a.dir}`).join(' ');
};
console.log('scene', await page.evaluate(SCENE));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter72_street_2x.png' });
await page.evaluate(() => { const g = window.__game, f = g.state.founding; g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(f.x - 4, f.y + 3); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter72_street_4x.png' });
await page.evaluate(() => { const g = window.__game, f = g.state.founding; g.renderer.camera.centerOnTile(f.x + 3, f.y + 3); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter72_street_east_4x.png' });

// 3. the night: a hound by a donkey cart; the donkey balks and stands, the hauler passes
const night = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  const y = f.y + 3;
  s.tick = 630; // midnight
  s.agents = s.agents.filter((a) => a.kind !== 1 && a.kind !== 0);
  const works = s.buildings.find((b) => b && b.kind === 'craft');
  const path = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => y * s.w + f.x - 9 + k);
  const golem = s.agents.find((a) => a.species === 'golem');
  const donkey = { id: s.nextAgentId++, kind: 1, x: f.x - 9 + 0.5, y: y + 0.5, path: path.slice(), pathIdx: 0, speed: 0.8, homeId: works.id, targetId: -1, timer: 0, variant: 1, dir: 0, load: 12 };
  const hauler = { id: s.nextAgentId++, kind: 1, x: f.x - 5 + 0.5, y: y + 0.5, path: path.slice(4), pathIdx: 0, speed: 0.45, homeId: works.id, targetId: -1, timer: 0, variant: 6, dir: 0, load: 30, golemId: golem.id };
  s.agents.push(donkey, hauler);
  for (let k = 0; k < 2; k++) s.agents.push({ id: s.nextAgentId++, kind: 3, x: f.x - 8 + k + 0.5, y: y - 2 + 0.5, path: [], pathIdx: 0, speed: 0, homeId: -1, targetId: -1, timer: 9999, variant: 0, dir: 2, load: 0, species: 'hound', anchorId: -1, ax: f.x - 8, ay: y - 2 });
  const d0 = s.stats.cartsBalked;
  const x0 = donkey.x, hx0 = hauler.x;
  for (let k = 0; k < 12; k++) { s.tick++; w.tick(s); }
  const msg = s.messages.filter((m) => /donkeys balk/.test(m.text)).length;
  g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(f.x - 6, y);
  g.renderer.invalidateAll(); g.ui.refresh();
  document.getElementById('toast').classList.add('hidden');
  return { donkeyMoved: +(donkey.x - x0).toFixed(2), donkeyTimer: donkey.timer, haulerMoved: +(hauler.x - hx0).toFixed(2), haulerTimer: hauler.timer, balked: s.stats.cartsBalked - d0, message: msg, tod: w.hounds ? 'night' : '?' };
});
console.log('night', JSON.stringify(night));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter72_night_balk_4x.png' });

// 4. the Foundry panel: the warden's duty select with the haul option
const panel = await page.evaluate(() => {
  const g = window.__game, s = g.state;
  s.tick = 180;
  const fd = s.buildings.find((b) => b && b.kind === 'golemfoundry');
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(fd.x + 4, fd.y);
  g.select(fd);
  g.ui.refresh();
  const sel = document.querySelector('select[data-golem]');
  return { options: sel ? Array.from(sel.options).map((o) => o.value + (o.selected ? '*' : '')) : null, text: sel ? Array.from(sel.options).filter((o) => o.value.startsWith('haul')).map((o) => o.textContent)[0] : null, hauled: document.getElementById('info')?.textContent.match(/Hauled[^\n]*/)?.[0] ?? (document.body.textContent.match(/goods by wardens in harness[^.]*/) ?? [null])[0] };
});
console.log('panel', JSON.stringify(panel));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter72_foundry_panel.png' });

// 5. a dusk brightness probe over a few frames
const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; g.select(null); const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  for (let t = 560; t <= 680; t += 20) { s.tick = t; r.render(s, g.view, 0.016); ctx.drawImage(document.getElementById('game'), 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');

// 6. the sheet: the hauler and its mirror beside a donkey cart, the procedural cart, a citizen and a warden, at 8×
const sheet = await page.evaluate(() => {
  const a = window.__wardlight.atlas; const Z = 8;
  const names = ['cart_6', 'cart_6!m', 'cartp_goods_0', 'cart_1', 'cit_0_0', 'golem_0'];
  const rects = names.map((n) => (n.endsWith('!m') ? a.mirrored(n.slice(0, -2)) : a.get(n))).filter(Boolean);
  const W = rects.reduce((s, r) => s + r.w * Z + 16, 16); const H = Math.max(...rects.map((r) => r.h * Z)) + 32;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#6a8f4e'; g.fillRect(0, 0, W, H);
  let x = 16; for (const r of rects) { g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, x, H - 16 - r.h * Z, r.w * Z, r.h * Z); x += r.w * Z + 16; }
  const box = (r) => { const cc = document.createElement('canvas'); cc.width = r.w; cc.height = r.h; const cx = cc.getContext('2d'); cx.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); const d = cx.getImageData(0, 0, r.w, r.h).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < r.h; y++) for (let xx = 0; xx < r.w; xx++) if (d[(y * r.w + xx) * 4 + 3] > 0) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return `${x1 - x0 + 1}×${y1 - y0 + 1}`; };
  return { url: c.toDataURL(), boxes: names.map((n, i) => `${n} ${rects[i] ? box(rects[i]) : 'missing'}`) };
});
writeFileSync('shots/iter72_sheet_8x.png', Buffer.from(sheet.url.split(',')[1], 'base64'));
console.log('sheet boxes', sheet.boxes.join(' | '));

console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await page.close();
await browser.close();
