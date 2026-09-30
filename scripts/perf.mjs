// Builds a large city with the bot in-page, then measures frame times at each zoom and takes screenshots.
import { chromium } from 'playwright';
const days = Number(process.argv[2] ?? 110);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
const t0 = Date.now();
await page.evaluate((days) => {
  const g = window.__game;
  const W = window.__wardlight;
  const bot = new W.Bot(g.state);
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 900; i++) W.tick(g.state);
    bot.step();
  }
  W.recomputeAll(g.state);
  g.renderer.invalidateAll();
  g.paused = true;
}, days);
console.log('built city in', Date.now() - t0, 'ms');
const stats = await page.evaluate(() => { const s = window.__game.state; return { pop: s.population, bld: s.buildings.filter(Boolean).length, agents: s.agents.length, day: s.day, ms: s.milestone }; });
console.log(stats);
await page.evaluate(() => { const g = window.__game; g.renderer.camera.centerOnTile(g.state.founding.x + 2, g.state.founding.y + 6); });
for (const zoom of [1, 2, 3]) {
  await page.evaluate((z) => { window.__game.renderer.camera.setZoom(z); }, zoom);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => new Promise((res) => {
    const times = [];
    let last = performance.now();
    let n = 0;
    function f(t) { times.push(t - last); last = t; if (++n < 90) requestAnimationFrame(f); else res({ avg: times.reduce((a, b) => a + b, 0) / times.length, max: Math.max(...times.slice(5)), render: window.__game.renderer.stats.ms, drawn: window.__game.renderer.stats.drawn, st: JSON.stringify(window.__game.renderer.stats) }); }
    requestAnimationFrame(f);
  }));
  console.log(`zoom ${zoom}: frame avg ${r.avg.toFixed(1)} ms, max ${r.max.toFixed(1)} ms, render ${r.render.toFixed(1)} ms, ${r.drawn} sprites`, r.st);
  await page.screenshot({ path: `shots/city_z${zoom}.png` });
}
// unpaused at 3x: measure with sim running
await page.evaluate(() => { const g = window.__game; g.renderer.camera.setZoom(2); g.paused = false; g.speed = 3; });
await page.waitForTimeout(500);
const r = await page.evaluate(() => new Promise((res) => {
  const times = []; let last = performance.now(); let n = 0;
  function f(t) { times.push(t - last); last = t; if (++n < 120) requestAnimationFrame(f); else res({ avg: times.reduce((a, b) => a + b, 0) / times.length, max: Math.max(...times.slice(5)) }); }
  requestAnimationFrame(f);
}));
console.log(`running 3x zoom 2: frame avg ${r.avg.toFixed(1)} ms, max ${r.max.toFixed(1)} ms`);
// night shot
await page.evaluate(() => { const g = window.__game; g.paused = true; g.state.tick = Math.floor(g.state.tick / 900) * 900 + 640; });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/city_night.png' });
await page.evaluate(() => { const g = window.__game; g.renderer.camera.setZoom(3); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/city_night_z3.png' });
console.log('errors', errors);
await browser.close();
