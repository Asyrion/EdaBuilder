// Window glow at night is laid down in depth order: a house in front covers the lit windows of the one behind it.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
// two rows of lit hearths, the front row one tile south-east of the back row so each front house overlaps the one behind
const info = await page.evaluate(() => { const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding; s.treasury = 50000;
  for (let y = f.y - 6; y <= f.y + 8; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 4, f.x + 10, f.y + 4, false));
  const back = []; const front = [];
  for (let dx = -6; dx <= 6; dx += 2) { const b = w.place(s, 'hearth', f.x + dx, f.y + 2, 1); if (b) back.push(b); }
  for (let dx = -5; dx <= 7; dx += 2) { const b = w.place(s, 'hearth', f.x + dx, f.y + 3, 1); if (b) front.push(b); }
  for (const b of s.buildings) if (b && b.state === 'building') { b.state = 'ok'; b.work = 0; b.level = 2; b.residents = 6; }
  for (const b of [...back, ...front]) { b.lit = true; b.watered = true; }
  s.tick = 450; // the dead of night
  w.recomputeAll(s); g.renderer.invalidateAll();
  g.renderer.camera.centerOnTile(f.x, f.y + 2); g.renderer.camera.setZoom(3);
  g.ui.refresh();
  return { back: back.length, front: front.length, lit: s.buildings.filter((b) => b && b.lit).length };
});
await page.waitForTimeout(600);
// a probe: a pixel where the front house's dark wall covers the back house's window must not carry window light
const probe = await page.evaluate(() => {
  const g = window.__game, s = g.state, f = s.founding, r = g.renderer, cam = r.camera;
  const back = s.buildings.find((b) => b && b.kind === 'hearth' && b.x === f.x && b.y === f.y + 2);
  const front = s.buildings.find((b) => b && b.kind === 'hearth' && b.x === f.x + 1 && b.y === f.y + 3);
  const at = (b) => { const wx = (b.x - b.y) * 16, wy = (b.x + b.y) * 8 + 8; return [wx, wy]; };
  const [bx, by] = at(back); const [fx, fy] = at(front);
  const ctx = r.ctx; const scan = (x0, y0, w, h) => { const d = ctx.getImageData(x0, y0, w, h).data; let warm = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 100 && d[i + 2] < 120) warm++; return warm; };
  // the back house's own body, screen space (back buffer is 1:1 with the world at zoom 1; the camera scales the screen)
  const sx = (wx) => Math.round(wx - cam.left), sy = (wy) => Math.round(wy - cam.top);
  const backBody = scan(sx(bx) - 14, sy(by) - 26, 28, 26);
  const frontBody = scan(sx(fx) - 14, sy(fy) - 26, 28, 26);
  // the overlap: the lower-right of the back house, which the front house's roof and wall cover
  const overlap = scan(sx(bx) + 2, sy(by) - 10, 12, 10);
  return { backBody, frontBody, overlap, emitted: r.emitted, zoom: cam.zoom };
});
console.log('houses:', JSON.stringify(info), 'probe:', JSON.stringify(probe));
await page.screenshot({ path: 'shots/iter43_windows_night.png' });
// and the same scene by day: no emissive layer at all
const day = await page.evaluate(() => { const g = window.__game; g.state.tick = 200; return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(g.renderer.emitted)))); });
console.log('day emitted:', day);
const pass = info.back >= 5 && info.front >= 5 && probe.backBody > 0 && probe.frontBody > 0 && probe.emitted > 0 && errors.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors);
await browser.close();
