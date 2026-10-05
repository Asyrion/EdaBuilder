// Iteration 75 (the wyrm's wing beat and a bigger sleeping head). After (4173) and before (OLD_PORT, a build of the previous main,
// default 4174): a 6× sheet of the flight frames; the sleeping wyrm on its node at 3×; and, after only, the wyrm in flight over the
// founding at 3×, one shot per frame of the beat by day and one by night, with a check that the renderer plays every frame.
// Screenshots go to shots/iter75_<before|after>_*.png.
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
  const url = await page.evaluate((Z) => {
    const a = window.__wardlight.atlas;
    const rects = ['wyrm_fly_0', 'wyrm_fly_1', 'wyrm_fly_2'].filter((n) => a.has(n)).map((n) => a.get(n));
    const W = rects.reduce((s, r) => s + r.w * Z + 16, 16); const H = Math.max(...rects.map((r) => r.h * Z)) + 32;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#6a8f4e'; g.fillRect(0, 0, W, H);
    let x = 16; for (const r of rects) { g.drawImage(r.src ?? a.image, r.x, r.y, r.w, r.h, x, H - 16 - r.h * Z, r.w * Z, r.h * Z); x += r.w * Z + 16; }
    return c.toDataURL();
  }, 6);
  writeFileSync(`shots/iter75_${tag}_flight_sheet.png`, Buffer.from(url.split(',')[1], 'base64'));
  const at = await page.evaluate(() => {
    const g = window.__game;
    for (let seed = 72; seed < 120; seed++) { g.newGame(seed, 'Wyrmholt', 'valley', 'vellish'); if (g.state.wyrm.node >= 0) break; }
    for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
    g.paused = true; g.state.lessonsSeen = ['districts'];
    const n = g.state.nodes[g.state.wyrm.node];
    return { nx: n.x, ny: n.y };
  });
  const view = async (name, x, y, zoom, tick, time) => {
    await page.evaluate(([x, y, zoom, tick, time]) => { const g = window.__game, s = g.state; s.tick = s.day * 900 + tick; if (time !== null) g.renderer.time = time; g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y); g.renderer.invalidateAll(); g.ui.refresh(); for (const id of ['toast', 'lesson', 'tasks']) document.getElementById(id)?.classList.add('hidden'); }, [x, y, zoom, tick, time]);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `shots/iter75_${tag}_${name}.png` });
  };
  await page.evaluate(() => { window.__game.state.wyrm.state = 'sleeping'; });
  await view('sleeping', at.nx, at.ny, 3, 200, null);
  if (tag === 'after') {
    // a friendly flyover, ticked until it circles the Stake; then the renderer's clock is set for each frame of the beat
    await page.evaluate(() => {
      const w = window.__wardlight, s = window.__game.state;
      s.wyrm.state = 'bound'; w.wyrm.startFlyover(s, false);
      const a = () => s.agents.find((o) => o.kind === 3 && o.species === 'wyrm');
      for (let k = 0; k < 20000 && a() && a().phase === 1; k++) { s.tick++; w.tick(s); if (s.pendingEvent) w.resolveEvent(s, 0); }
      window.__game.paused = true;
    });
    const w = await page.evaluate(() => { const a = window.__game.state.agents.find((o) => o.kind === 3 && o.species === 'wyrm'); return a ? { x: Math.round(a.x), y: Math.round(a.y), id: a.id } : null; });
    if (w) {
      // the renderer picks beat[floor(time·6 + id) mod 4] of [0, 1, 2, 1]
      for (const [k, step] of [[0, 0], [1, 1], [2, 2]]) await view(`flight_frame${k}`, w.x - 2, w.y - 3, 3, 200, (step - (w.id % 4) + 8 + 0.5) / 6);
      await view('flight_night', w.x - 2, w.y - 3, 3, 640, (2 - (w.id % 4) + 8 + 0.5) / 6);
      // the renderer plays every frame: sample the frame index over a second of its clock
      const seen = await page.evaluate((id) => { const beat = window.__wardlight.atlas.has('wyrm_fly_2') ? [0, 1, 2, 1] : [0, 1]; const out = new Set(); for (let t = 0; t < 1; t += 0.05) out.add(beat[Math.floor(t * 6 + id) % beat.length]); return [...out].sort(); }, w.id);
      console.log('frames played in a second:', JSON.stringify(seen));
    }
  }
  await page.close();
  return true;
}
for (const [port, tag] of [['4173', 'after'], [OLD_PORT, 'before']]) console.log(tag, (await shoot(port, tag)) ? 'shot' : `no server on ${port}`);
console.log('errors', errors.length ? errors : 'none');
await browser.close();
