// Iteration 61 (the bot's depot, the hunt and the fish): the bot plays Vellish seed 42 in the browser to day 125. Its depot
// stands and sells down the Gloam road (the Budget's trade rows), its reed-cutters thatch a street of homes, and before the
// Thaw's high water it bridges the fords no Weir holds (or raises a Weir). Shots of each, the depot's panel, a dawn and dusk
// probe, no errors and no missing sprites.
import { chromium } from 'playwright';
const DAYS = Number(process.env.DAYS ?? 125);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(600);
await page.evaluate(() => {
  const g = window.__game;
  g.newGame(42, 'Botwick', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  window.__bot = new window.__wardlight.Bot(g.state);
  window.__road = 0;
});
// the bot's days, five at a time (as the balance run: the bot steps once each new day)
for (let d = 0; d < DAYS; d += 5) {
  const r = await page.evaluate((until) => {
    const g = window.__game, s = g.state, w = window.__wardlight;
    while (s.day < until && !s.gameOver) {
      const day = s.day;
      w.tick(s);
      if (s.day !== day) { window.__bot.step(); window.__road += s.tradeIncomeToday ?? 0; }
      else if (s.pendingEvent) w.resolveEvent(s, 0); // a tale mid-day stops the sim: answer it
    }
    return { day: s.day, pop: s.population, treasury: Math.round(s.treasury) };
  }, Math.min(DAYS, d + 5));
  if (r.day % 25 === 0) console.log('day', JSON.stringify(r));
}

const seen = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, W = w.water, bot = window.__bot;
  const of = (k) => s.buildings.filter((b) => b && b.kind === k);
  const bridges = [];
  for (let i = 0; i < s.road.length; i++) if (s.road[i] >= 2 && s.terrain[i] === 1 && W.fordable(s, i)) bridges.push(i);
  const fords = [];
  for (let i = 0; i < s.road.length; i++) if (s.road[i] && W.isFordTile(s, i)) fords.push(i);
  const thatchedNow = s.buildings.filter((b) => b && W.thatched(s, b)).length;
  return {
    day: s.day, pop: s.population, depot: of('depot').map((b) => [b.x, b.y]), depotDay: bot.depotDay, roadCrowns: Math.round(window.__road),
    huntCrowns: s.stats.huntCrowns, fishCrowns: s.stats.fishCrowns, smoked: s.stats.fishSmoked, cutters: of('reedcutters').map((b) => [b.x, b.y]),
    thatched: s.stats.homesThatched, thatchedNow, weirs: of('weir').map((b) => [b.x, b.y]), bridged: bot.fordsBridged, bridges: bridges.map((i) => [i % s.w, (i / s.w) | 0]),
    fords: fords.length, goal: bot.goal ? bot.goal.kind : 'none',
  };
});
console.log('city', JSON.stringify(seen));

const shoot = async (name, x, y, zoom = 3, select = null) => {
  await page.evaluate(({ x, y, zoom, select }) => {
    const g = window.__game, s = g.state;
    s.tick = s.day * 900 + 200; // noon
    g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y);
    g.select(select ? s.buildings.find((b) => b && b.x === select[0] && b.y === select[1]) ?? null : null);
    g.renderer.invalidateAll(); g.ui.refresh();
    for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden');
  }, { x, y, zoom, select });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `shots/iter61_${name}.png` });
};
if (seen.depot.length) {
  const [x, y] = seen.depot[0];
  await shoot('depot', x, y, 3, [x, y]);
  const info = await page.evaluate(() => document.getElementById('info').innerText.slice(0, 500));
  console.log('depot panel:', info.replace(/\n/g, ' | '));
}
if (seen.cutters.length) { const [x, y] = seen.cutters[0]; await shoot('cutters', x, y, 3, [x, y]); }
if (seen.weirs.length) { const [x, y] = seen.weirs[0]; await shoot('weir', x, y, 3, [x, y]); }
if (seen.bridges.length) {
  const [x, y] = seen.bridges[0];
  // the second year's Thaw: the unheld fords under water, the bridge open
  const ford = await page.evaluate(() => { const s = window.__game.state, W = window.__wardlight.water; s.day = 122; W.dailyFords(s); return { closed: s.water.closed.length }; });
  console.log('high water', JSON.stringify(ford));
  await shoot('bridge_thaw', x, y, 4);
}
// the Budget: the Gloam road's rows
await page.evaluate(() => { const g = window.__game; g.select(null); g.ui.toggleBudget(true); g.ui.refresh(); });
await page.waitForTimeout(400);
const budget = await page.evaluate(() => (document.getElementById('budget') ?? document.body).innerText);
console.log('budget rows:', budget.split('\n').filter((l) => /hide|smoked|trade|Gloam|export|relic|troph/i.test(l)).slice(0, 10).join(' | '));
await page.screenshot({ path: 'shots/iter61_budget.png' });
await page.evaluate(() => window.__game.ui.toggleBudget(false));

const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  const base = s.day * 900;
  for (let t = 520; t <= 900; t += 40) { s.tick = base + t; r.render(s, g.view, 0.016); ctx.drawImage(r.back, 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');
console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
