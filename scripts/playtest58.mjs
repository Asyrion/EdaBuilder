// Iteration 58 (every building faces its road): a crossroads with houses, works, shops and services on all four sides of
// two roads, by day and by night, at 2× and 4×, after (port 4173) and before (OLD_PORT, the previous build, if served);
// each building's facing against the side of its road; the mirrored sprites are the ones drawn; the ghost turns to its
// road while placing; a dusk brightness probe; no errors, no missing sprites.
import { chromium } from 'playwright';
const OLD_PORT = process.env.OLD_PORT;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open(port = 4173) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${port} console: ${m.text()}`); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(400);
  return page;
}

// a crossroads east of the Stake: a road along x and one along y; on each side a row of buildings, one tile off the road
const SCENE = (tick) => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  document.getElementById('help').classList.add('hidden'); g.paused = true;
  s.milestone = 6; s.treasury = 999999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  const X = f.x + 4, Y = f.y + 4; // the crossing
  for (let y = Y - 12; y <= Y + 12; y++) for (let x = X - 12; x <= X + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; s.road[i] = 0; const k = s.bIndex[i]; if (k >= 0 && s.buildings[k] && s.buildings[k].kind !== 'stake') { const b = s.buildings[k]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.bIndex[yy * s.w + xx] = -1; s.buildings[k] = null; } }
  w.actions.buildRoad(s, 2, w.actions.roadPath(X - 11, Y, X + 11, Y, false));
  w.actions.buildRoad(s, 2, w.actions.roadPath(X, Y - 11, X, Y + 11, true));
  const put = (k, x, y, lvl, v) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; if (v !== undefined) b.variant = v; } return b; };
  const kinds = [['hearth', 1], ['hearth', 2], ['hearth', 3], ['craft', 1], ['craft', 2], ['craft', 3], ['market', 2], ['market', 3], ['arcane', 2]];
  const placed = [];
  kinds.forEach(([k, l], n) => {
    const a = 2 + n, v = n % 4;
    placed.push({ b: put(k, X + a, Y - 1, l, v), road: '+y' }); // north of the x-road: the road is on its +y face (lower-left)
    placed.push({ b: put(k, X + a, Y + 1, l, v), road: '-y' }); // south of it: the road is behind, on its −y face
    placed.push({ b: put(k, X - 1, Y + a, l, v), road: '+x' }); // west of the y-road: the road on its +x face (lower-right)
    placed.push({ b: put(k, X + 1, Y + a, l, v), road: '-x' }); // east of it: the road behind, on its −x face
  });
  // 2×2 services on the far quarter
  for (const [k, x, y, road] of [['watchhouse', X - 2, Y - 4, '+x'], ['hospice', X - 4, Y - 2, '+y'], ['academy', X - 4, Y + 1, '-y'], ['veshari', X + 1, Y - 4, '-x']]) placed.push({ b: put(k, x, y), road });
  w.recomputeAll(s);
  s.tick = tick;
  g.select(null);
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(X + 2, Y + 2);
  g.renderer.invalidateAll(); g.ui.refresh();
  for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  const fl = w.facing?.faceLeft;
  const want = { '+x': false, '-y': false, '+y': true, '-x': true };
  return { n: placed.filter((p) => p.b).length, wrong: fl ? placed.filter((p) => p.b && fl(s, p.b) !== want[p.road]).map((p) => `${p.b.kind}@${p.b.x},${p.b.y} ${p.road}`) : null, X, Y };
};

async function shots(page, tag) {
  for (const [tick, when] of [[180, 'day'], [630, 'night']]) {
    await page.evaluate(SCENE, tick);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/iter58_${tag}_${when}_2x.png` });
    await page.evaluate(() => { const g = window.__game, f = g.state.founding; g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(f.x + 6, f.y + 6); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/iter58_${tag}_${when}_4x.png` });
  }
}

const page = await open();
const scene = await page.evaluate(SCENE, 180);
console.log('scene', scene.n, 'buildings; facing wrong for', scene.wrong.length ? scene.wrong : 'none');
await shots(page, 'after');
// the drawn sprites: count mirrored draws in one frame (spy on the atlas), against the buildings that face left
const drawn = await page.evaluate(() => {
  const g = window.__game, s = g.state, a = window.__wardlight.atlas, fl = window.__wardlight.facing.faceLeft;
  g.renderer.camera.setZoom(1); g.renderer.camera.centerOnTile(s.founding.x + 4, s.founding.y + 4);
  const names = []; const orig = a.mirrored.bind(a); a.mirrored = (n) => { names.push(n); return orig(n); };
  g.renderer.render(s, g.view, 0.016); a.mirrored = orig;
  const left = s.buildings.filter((b) => b && fl(s, b)).length;
  const r = a.mirrored('hearth_l1_v0'), o = a.get('hearth_l1_v0');
  return { mirroredDraws: names.length, faceLeft: left, rectOk: r.w === o.w && r.ax === o.w - o.ax && r.x === a.image.width - o.x - o.w && !!r.src };
});
console.log('mirrored draws', drawn.mirroredDraws, 'buildings facing left (whole map)', drawn.faceLeft, 'mirror rect', drawn.rectOk ? 'ok' : 'WRONG');
// the ghost turns to its road
const ghost = await page.evaluate(() => {
  const g = window.__game, s = g.state, a = window.__wardlight.atlas, f = s.founding; const X = f.x + 4, Y = f.y + 4;
  const names = []; const orig = a.mirrored.bind(a); a.mirrored = (n) => { names.push(n); return orig(n); };
  g.view.ghost = { key: 'watchpost', x: X + 11, y: Y - 1, ok: true, radius: 0 }; g.renderer.render(s, g.view, 0.016); const north = names.includes('b_watchpost');
  names.length = 0; g.view.ghost = { key: 'watchpost', x: X + 1, y: Y + 11, ok: true, radius: 0 }; g.renderer.render(s, g.view, 0.016); const east = names.includes('b_watchpost');
  a.mirrored = orig; g.view.ghost = null;
  return { north, east };
});
console.log('ghost north of the road mirrored', ghost.north, '(want true); east of the y-road mirrored', ghost.east, '(want true)');
const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  for (let t = 560; t <= 700; t += 20) { s.tick = t; r.render(s, g.view, 0.016); ctx.drawImage(r.back, 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');
await page.close();

if (OLD_PORT) { const old = await open(Number(OLD_PORT)); await shots(old, 'before'); await old.close(); }
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
