// Iteration 94 (lit views at night, trees by region): the same three forests and a night view, from main's build (port 4174,
// "before") and this one (4173, "after").   shots/iter94_{before,after}_{wood,node,river,night}.png
// usage: node scripts/playtest94.mjs [4173 after | 4174 before]
import { chromium } from 'playwright';
const port = process.argv[2] ?? '4173';
const tag = port === '4174' ? 'before' : 'after';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__game && window.__wardlight, null, { timeout: 120000 });
const spots = await page.evaluate(() => {
  const g = window.__game;
  g.newGame(42, 'Groves', 'valley', 'vellish');
  const s = g.state;
  g.paused = true;
  ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  const W = s.w, H = s.h, T = (x, y) => s.terrain[y * W + x];
  const forestAt = (x, y, r) => { let n = 0, t = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { t++; if (T(x + dx, y + dy) === 5) n++; } return n / t; };
  const dist = (x, y, pts) => Math.min(...pts.map((p) => Math.hypot(p.x - x, p.y - y)));
  const waterD = (x, y) => { let best = 99; for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) if (T(x + dx, y + dy) <= 1) best = Math.min(best, Math.hypot(dx, dy)); return best; };
  let wood = null, node = null, river = null;
  for (let y = 14; y < H - 14; y++) for (let x = 14; x < W - 14; x++) {
    if (T(x, y) !== 5 || s.gloam[y * W + x]) continue;
    const f = forestAt(x, y, 5);
    if (f < 0.6) continue;
    const dn = dist(x, y, s.nodes), dw = waterD(x, y);
    if (!wood && dn > 18 && dw > 12) wood = { x, y };
    if (!node && dn < 4) node = { x, y };
    if (!river && dw < 4 && dn > 12) river = { x, y };
  }
  return { wood, node, river, founding: s.founding };
});
const shot = async (name, p, zoom = 2, wait = 600) => {
  if (!p) return false;
  await page.evaluate(([p, zoom]) => { const g = window.__game; g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(p.x, p.y); g.renderer.invalidateAll(); g.ui.refresh(); }, [p, zoom]);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `shots/iter94_${tag}_${name}.png` });
  return true;
};
await page.evaluate(() => { const s = window.__game.state; s.tick = s.day * 900 + 300; });
const got = { wood: await shot('wood', spots.wood), node: await shot('node', spots.node), river: await shot('river', spots.river) };
// night, the Mana view on, over the founding: the lights stay on in a view
const night = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  s.milestone = 3; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  for (let y = f.y - 6; y <= f.y + 8; y++) for (let x = f.x - 12; x <= f.x + 12; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7 && s.terrain[i] !== 1) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
  for (let k = 0; k < 6; k++) { const b = w.place(s, 'hearth', f.x - 8 + k * 3, f.y + 4, 1); if (b) { b.state = 'ok'; b.work = 0; b.lit = true; b.workers = 6; b.residents = 6; } }
  const sp = w.place(s, 'spire', f.x + 1, f.y + 3); if (sp) { sp.state = 'ok'; sp.work = 0; sp.lit = true; }
  w.recomputeAll(s);
  for (const b of s.buildings) if (b) b.lit = true;
  s.tick = s.day * 900 + 630; // midnight (the game starts at dawn: time of day 0 is tick 630)
  return !!sp;
});
await shot('night', spots.founding, 3, 900);
await page.keyboard.press('1'); // the Mana view
await page.waitForTimeout(500);
await shot('night_view', spots.founding, 3, 900);
console.log(JSON.stringify({ tag, spots, got, night, errors }));
console.log(errors.length ? 'PLAYTEST 94 FAILED' : 'PLAYTEST 94 OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
