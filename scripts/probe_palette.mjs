// A probe for the renderer decision (scope reset phase 3-6, docs/RENDERER_DECISION.md): can Canvas 2D do RESET_PLAN phase 4's
// first wish, the night as a palette shift instead of a grey multiply? Every sprite is on the 77-colour master palette
// (phase 3-2), so a night is a table of 77 colours. This remaps the loaded atlas through a rough night table (darker,
// cooler, every ramp but the ink), times it, sizes the memory of a few such atlases, and shoots the same town three
// ways: the day, the night as the game draws it (multiply and lights), and the day's light on the night atlas (the
// palette's night alone, before any light is added). Nothing in the game changes.
//   node scripts/probe_palette.mjs [port]   → shots/probe_{day,night_multiply,night_palette}.png and one json line
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const port = process.argv[2] ?? '4173';
const pal = JSON.parse(readFileSync('art/palette.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas, null, { timeout: 120000 });
await page.fill('#t-seed', '42'); await page.click('#t-new'); await page.waitForTimeout(500);
await page.evaluate(() => {
  document.getElementById('help-close')?.click();
  const g = window.__game, W = window.__wardlight, s = g.state, bot = new W.Bot(s);
  g.paused = true;
  for (let d = 0; d < 40; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
  W.recomputeAll(s); g.renderer.invalidateAll();
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 2);
});
await page.addStyleTag({ content: '#toast, #lesson, .modal { display: none !important; }' });
const clip = { x: 280, y: 60, width: 780, height: 620 };
const at = async (tick, name) => { await page.evaluate((t) => { const s = window.__game.state; s.tick = Math.floor(s.tick / 900) * 900 + t; window.__game.renderer.invalidateAll(); }, tick); await page.waitForTimeout(900); await page.screenshot({ path: `shots/${name}.png`, clip }); };
await at(200, 'probe_day');
await at(650, 'probe_night_multiply');
const r = await page.evaluate((pal) => {
  // the rough night table, in OKLab: lightness × 0.55, chroma × 0.7, a cool shift; the light and ley ramps keep their colours
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const unlin = (c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  const toLab = ([r, g, b]) => { r = lin(r); g = lin(g); b = lin(b); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
  const toRgb = ([L, a, b]) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]; };
  const table = new Map();
  for (const ramp of pal.ramps) for (const h of ramp.colors) {
    const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    // only the ink stays: a first run kept the light and ley ramps too, and every thatched roof glowed, since the thatch
    // shares the light ramp's yellows (the palette is shared across materials; a night must take its light from the glow
    // layers, not from keeping colours)
    if (ramp.id === 'ink') { table.set(key, rgb); continue; }
    const [L, a, b] = toLab(rgb);
    table.set(key, toRgb([L * 0.55, a * 0.7 - 0.01, b * 0.7 - 0.035]));
  }
  const g = window.__game, atlas = g.renderer.atlas ?? window.__wardlight.atlas;
  const src = atlas.image;
  const t0 = performance.now();
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let mapped = 0, missed = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = table.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (n) { d[i] = n[0]; d[i + 1] = n[1]; d[i + 2] = n[2]; mapped++; } else missed++; // a glow layer's pixels are off the palette and stay
  }
  ctx.putImageData(img, 0, 0);
  const ms = performance.now() - t0;
  // swap it in for the shot (the day's light on the night palette)
  atlas.image = c;
  g.renderer.invalidateAll();
  return { atlas: [src.width, src.height], remapMs: Math.round(ms), mapped, offPalette: missed, mbPerAtlas: +((src.width * src.height * 4) / 1048576).toFixed(1) };
}, pal);
await at(200, 'probe_night_palette');
console.log(JSON.stringify(r));
await browser.close();
