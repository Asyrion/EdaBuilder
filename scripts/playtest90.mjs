// Iteration 90 (hotfix, the slow first load): main's build (port 4174) against this one (4173).
//   1. Start-up on a throttled line (CDP: 100 ms latency, 10 Mbit/s, an empty cache): the time to the game and the requests.
//   2. Every sprite in the atlas (body and glow) and its rect, read from both builds: they must be identical.
//   3. The loading line while the sheet arrives, and the town by day: shots/iter90_loading.png, iter90_town_2x.png.
// Run both previews first: `npx vite preview --port 4173` here and main's build on 4174.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const warns = [];

async function timedLoad(port, shot) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${port} console: ${m.text()}`); if (/missing sprite|failed to load/.test(m.text())) warns.push(`${port}: ${m.text()}`); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: (10e6 / 8), uploadThroughput: (10e6 / 8) });
  let requests = 0;
  let bytes = 0;
  page.on('request', () => requests++);
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'commit' });
  let line = null;
  if (shot) {
    await page.waitForFunction(() => /Unpacking/.test(document.getElementById('boot')?.textContent ?? ''), null, { timeout: 60000 });
    line = await page.evaluate(() => document.getElementById('boot')?.textContent);
    await page.screenshot({ path: shot });
  }
  await page.waitForFunction(() => window.__game, null, { timeout: 15 * 60000, polling: 100 });
  const ms = Date.now() - t0;
  const out = { port, seconds: Math.round(ms / 100) / 10, requests, mb: Math.round(bytes / 1e5) / 10, line, bootLineGone: await page.evaluate(() => !document.getElementById('boot')) };
  await context.close();
  return out;
}

/** Every sprite's rect and a hash of its pixels (body, then glow), read from the finished atlas. */
async function spritePrints(port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(`${port}: ${e}`));
  page.on('console', (m) => { if (/missing sprite|failed to load/.test(m.text())) warns.push(`${port}: ${m.text()}`); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__game && window.__wardlight?.atlas, null, { timeout: 5 * 60000 });
  const prints = await page.evaluate(() => {
    const atlas = window.__wardlight.atlas;
    const img = atlas.image;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const hash = (x, y, w, h) => {
      let a = 0x811c9dc5;
      for (let r = 0; r < h; r++) for (let k = ((y + r) * c.width + x) * 4, e = k + w * 4; k < e; k++) a = Math.imul(a ^ data[k], 16777619);
      return (a >>> 0).toString(16);
    };
    const out = {};
    for (const [name, s] of Object.entries(atlas.sprites)) {
      out[name] = { rect: [s.x, s.y, s.w, s.h, s.ax, s.ay, s.glow?.x ?? -1, s.glow?.y ?? -1], body: hash(s.x, s.y, s.w, s.h), glow: s.glow ? hash(s.glow.x, s.glow.y, s.w, s.h) : '', imported: atlas.imported.has(name) };
    }
    return { size: [c.width, c.height], whole: hash(0, 0, c.width, c.height), sprites: out };
  });
  return { page, prints };
}

const fast = await timedLoad('4173', 'shots/iter90_loading.png');
console.log('this build, throttled', JSON.stringify(fast));
const slow = await timedLoad('4174', null);
console.log('main, throttled     ', JSON.stringify(slow));

const a = await spritePrints('4174');
const b = await spritePrints('4173');
const names = Object.keys(a.prints.sprites);
const diff = [];
for (const n of names) {
  const x = a.prints.sprites[n], y = b.prints.sprites[n];
  if (!y || JSON.stringify(x) !== JSON.stringify(y)) diff.push(n);
}
const extra = Object.keys(b.prints.sprites).filter((n) => !(n in a.prints.sprites));
console.log('atlas', JSON.stringify({ main: a.prints.size, here: b.prints.size, wholeSame: a.prints.whole === b.prints.whole, sprites: names.length, imported: names.filter((n) => a.prints.sprites[n].imported).length, different: diff.length, onlyHere: extra.length }));
if (diff.length) console.log('  differ:', diff.slice(0, 20).join(', '));
await a.page.close();

// the town by day, from this build
const town = await b.page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(42, 'Eelwick', 'valley', 'vellish');
  const s = g.state, f = s.founding;
  g.paused = true;
  s.milestone = 6; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts']; s.day = 40; s.tick = 40 * 900 + 300;
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7 && s.terrain[i] !== 1) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 14, f.y + 5, f.x + 14, f.y + 5, false));
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x, f.y - 6, f.x, f.y + 11, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.residents = 8; b.workers = 8; b.lit = true; b.happiness = 70; } return b; };
  let n = 0;
  for (let k = 0; k < 6; k++) { if (put('hearth', f.x - 13 + k * 2, f.y + 4, 1 + (k % 3))) n++; if (put('market', f.x + 2 + k * 2, f.y + 4, 1 + (k % 2))) n++; }
  for (let k = 0; k < 6; k++) { if (put('craft', f.x - 13 + k * 2, f.y + 6, 1 + (k % 2))) n++; if (put('arcane', f.x + 2 + k * 2, f.y + 6, 1)) n++; }
  w.recomputeAll(s);
  ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x, f.y + 4);
  g.renderer.invalidateAll(); g.ui.refresh();
  return { placed: n };
});
await b.page.waitForTimeout(800);
await b.page.screenshot({ path: 'shots/iter90_town_2x.png' });
console.log('town', JSON.stringify(town));
await b.page.close();

console.log('errors', errors.length ? errors : 'none');
console.log('warnings', warns.length ? [...new Set(warns)].slice(0, 10) : 'none');
const ok = diff.length === 0 && extra.length === 0 && errors.length === 0 && fast.bootLineGone && fast.seconds < slow.seconds;
console.log(ok ? 'PLAYTEST 90 OK' : 'PLAYTEST 90 FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
