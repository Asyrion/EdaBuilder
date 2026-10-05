// Iteration 72 (the wyrm redrawn after the user's painting, inspirations/wyrm). Before (OLD_PORT, a build of the previous main,
// default 4174) and after (4173): a sheet of the coils (back and front halves laid together, as the renderer draws them round the
// node) and the two flight frames at 4×; and in game at 3× the wyrm asleep, awake and dead on its node, and in flight over the
// founding by day and by night. Screenshots go to shots/iter72_<before|after>_*.png.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const OLD_PORT = process.env.OLD_PORT ?? '4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];

async function shoot(port, tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
  try { await page.goto(`http://localhost:${port}/`, { timeout: 8000 }); } catch { await page.close(); return false; }
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  // the sheet: each coil's back and front together, then the flight frames
  const url = await page.evaluate((Z) => {
    const a = window.__wardlight.atlas;
    const items = [['wyrm_sleeping_back', 'wyrm_sleeping_front'], ['wyrm_awake_back', 'wyrm_awake_front'], ['wyrm_dead_back', 'wyrm_dead_front'], ['wyrm_fly_0'], ['wyrm_fly_1']].map((ns) => ns.map((n) => a.get(n)).filter(Boolean));
    const W = items.reduce((s, r) => s + Math.max(...r.map((x) => x.w)) * Z + 16, 16);
    const H = Math.max(...items.flat().map((r) => r.h * Z)) + 32;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6a8f4e'; g.fillRect(0, 0, W, H);
    let x = 16;
    for (const r of items) { for (const s of r) g.drawImage(s.src ?? a.image, s.x, s.y, s.w, s.h, x, H - 16 - s.h * Z, s.w * Z, s.h * Z); x += Math.max(...r.map((s) => s.w)) * Z + 16; }
    return c.toDataURL();
  }, 4);
  writeFileSync(`shots/iter72_${tag}_sheet.png`, Buffer.from(url.split(',')[1], 'base64'));
  // a game whose map has a wyrm
  const at = await page.evaluate(() => {
    const g = window.__game;
    for (let seed = 72; seed < 120; seed++) {
      g.newGame(seed, 'Wyrmholt', 'valley', 'vellish');
      if (g.state.wyrm.node >= 0) break;
    }
    for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
    g.paused = true;
    const s = g.state; s.lessonsSeen = ['districts'];
    const n = s.nodes[s.wyrm.node];
    return { nx: n.x, ny: n.y, fx: s.founding.x, fy: s.founding.y };
  });
  const view = async (name, x, y, zoom, tick, fn) => {
    await page.evaluate(([x, y, zoom, tick]) => { const g = window.__game, s = g.state; s.tick = s.day * 900 + tick; g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y); g.renderer.invalidateAll(); g.ui.refresh(); for (const id of ['toast', 'lesson', 'tasks']) document.getElementById(id)?.classList.add('hidden'); }, [x, y, zoom, tick]);
    if (fn) await page.evaluate(fn);
    await page.waitForTimeout(450);
    await page.screenshot({ path: `shots/iter72_${tag}_${name}.png` });
  };
  for (const st of ['sleeping', 'awake', 'dead']) {
    await page.evaluate((st) => { window.__game.state.wyrm.state = st; }, st);
    await view(st, at.nx, at.ny, 3, 200);
  }
  // in flight over the founding: a friendly flyover, ticked until it circles the Stake
  await page.evaluate(() => {
    const w = window.__wardlight, s = window.__game.state;
    s.wyrm.state = 'bound';
    w.wyrm.startFlyover(s, false);
    const a = () => s.agents.find((o) => o.kind === 3 && o.species === 'wyrm');
    for (let k = 0; k < 20000 && a() && a().phase === 1; k++) { s.tick++; w.tick(s); if (s.pendingEvent) w.resolveEvent(s, 0); }
    for (let k = 0; k < 30 && a(); k++) { s.tick++; w.tick(s); }
  });
  const pos = await page.evaluate(() => { const a = window.__game.state.agents.find((o) => o.kind === 3 && o.species === 'wyrm'); return a ? [Math.round(a.x), Math.round(a.y), Math.round(a.alt ?? 0)] : null; });
  console.log(tag, 'wyrm aloft at', JSON.stringify(pos));
  if (pos) {
    await view('flight_day', pos[0] - 2, pos[1] - 3, 3, 200);
    await view('flight_night', pos[0] - 2, pos[1] - 3, 3, 640);
  }
  await page.close();
  return true;
}
for (const [port, tag] of [['4173', 'after'], [OLD_PORT, 'before']]) console.log(tag, (await shoot(port, tag)) ? 'shot' : `no server on ${port}`);
console.log('errors', errors.length ? errors : 'none');
await browser.close();
