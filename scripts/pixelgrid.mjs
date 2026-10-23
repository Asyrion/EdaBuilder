// The pixel grid at 100, 125 and 150 % (scope reset phase 3-3, docs/ART_BIBLE.md §1), against `npx vite preview` on a
// port (default 4173): a town of seed 42 at zoom level 2, by day, for each device scale factor.
//   node scripts/pixelgrid.mjs [port] [tag]   → shots/pixelgrid_<tag>_<dpr>.png and one json line per ratio:
//   - colours: distinct colours in a 400×300 crop of the screen; a browser that rescales the canvas blends neighbours into
//     new colours, so the count grows with the blur
//   - even: the share of the crop's horizontal runs of one colour whose length is a whole multiple of the art pixel's
//     size in device pixels (zoom level 2 times the ratio, rounded as the game rounds it): 1.0 is an even grid
//   - edge: distinct colours in the back buffer with the Happiness view on (an antialiased diamond adds blends)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const port = process.argv[2] ?? '4173', tag = process.argv[3] ?? 'now';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const dpr of [1, 1.25, 1.5]) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
  await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.getElementById('help-close')?.click();
    const g = window.__game, W = window.__wardlight, s = g.state, bot = new W.Bot(s);
    g.paused = true;
    for (let d = 0; d < 20; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
    s.tick = Math.floor(s.tick / 900) * 900 + 200;
    W.recomputeAll(s); g.renderer.invalidateAll();
    g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 2);
  });
  await page.addStyleTag({ content: '#toast, #lesson, .modal, #topbar, #left, #views, #demand, #log, #minimap, #tasks, #perf, #clock { display: none !important; }' });
  await page.waitForTimeout(800);
  const crop = { x: 300, y: 200, width: 400, height: 300 };
  await page.screenshot({ path: `shots/pixelgrid_${tag}_${dpr}.png`, clip: crop });
  // the screen as device pixels: drawn from the canvas itself, which a CSS-scaled canvas is not; so read the screenshot
  const shot = await page.screenshot({ clip: crop });
  const stats = await page.evaluate(async ({ b64, dpr }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const cols = new Set(); for (let i = 0; i < d.length; i += 4) cols.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    // the art pixel in device pixels, as the game picks it (zoomScales: level 2) or, for a build that ignores the ratio, 2 × dpr
    const cam = window.__game.renderer.camera;
    const size = cam.scale ?? 2 * dpr;
    let even = 0, runs = 0;
    for (let y = 0; y < c.height; y += 3) {
      let run = 1;
      for (let xx = 1; xx <= c.width; xx++) {
        const o = (y * c.width + xx) * 4, p = (y * c.width + xx - 1) * 4;
        if (xx < c.width && d[o] === d[p] && d[o + 1] === d[p + 1] && d[o + 2] === d[p + 2]) { run++; continue; }
        if (xx > 1 && xx < c.width) { runs++; if (Math.abs(run / size - Math.round(run / size)) < 1e-6) even++; }
        run = 1;
      }
    }
    // the back buffer with the Happiness view, for antialiased edges
    const g = window.__game; g.view.overlay = 'happiness'; g.renderer.overlayVersion++;
    await new Promise((r) => setTimeout(r, 400));
    const back = g.renderer.back, bd = back.getContext('2d').getImageData(0, 0, back.width, back.height).data;
    const bc = new Set(); for (let i = 0; i < bd.length; i += 4) bc.add((bd[i] << 16) | (bd[i + 1] << 8) | bd[i + 2]);
    g.view.overlay = null;
    return { canvas: [g.renderer.screen.width, g.renderer.screen.height], size, colours: cols.size, even: +(even / runs).toFixed(3), edge: bc.size };
  }, { b64: shot.toString('base64'), dpr });
  console.log(JSON.stringify({ tag, dpr, ...stats }));
  await ctx.close();
}
await browser.close();
