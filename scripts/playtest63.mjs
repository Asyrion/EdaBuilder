// Iteration 63 (the caravan in the books): the bot plays Vellish seed 42 in the browser to day 100. The Belerial caravan halts at
// its depot every twelve days; its take is in the Budget's caravan row (the last take and the charter's total), in the 10-day
// ledger history, on the depot's panel and in the Annals. Shots of the Budget and the depot panel, a dawn and dusk probe, no errors.
import { chromium } from 'playwright';
const DAYS = Number(process.env.DAYS ?? 100);
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
  g.state.lessonsSeen = ['districts']; // the lesson card would cover the shots
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
  const s = window.__game.state;
  const depot = s.buildings.find((b) => b && b.kind === 'depot');
  return { day: s.day, pop: s.population, depot: depot ? [depot.x, depot.y] : null, caravanCrowns: s.stats.caravanCrowns, last: s.stats.lastCaravanCrowns, lastDay: s.stats.lastCaravanDay, goods: s.stats.caravanGoods, road: Math.round(window.__road), history: s.ledgerHistory.slice(-12) };
});
console.log('city', JSON.stringify(seen));

// the day after a caravan: run on to its next halt and one more day, so the history's last line carries the take
const after = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  const start = s.stats.caravanCrowns;
  let guard = 0;
  while (s.stats.caravanCrowns === start && guard++ < 900 * 14) {
    const day = s.day;
    w.tick(s);
    if (s.day !== day) window.__bot.step();
    else if (s.pendingEvent) w.resolveEvent(s, 0);
  }
  return { day: s.day, take: s.stats.lastCaravanCrowns, total: s.stats.caravanCrowns, history: s.ledgerHistory.slice(-3) };
});
console.log('a halt', JSON.stringify(after));

await page.evaluate(() => { const g = window.__game; g.select(null); g.ui.toggleBudget(true); g.ui.refresh(); });
await page.waitForTimeout(400);
const budget = await page.evaluate(() => document.getElementById('budget').innerText);
const row = budget.split('\n').find((l) => /Belerial caravan/.test(l)) ?? 'NO CARAVAN ROW';
const hist = budget.split('\n').find((l) => /Last 10 days/.test(l)) ?? '';
console.log('budget row:', row.replace(/\t/g, ' | '));
console.log('history:', hist.slice(0, 160));
await page.screenshot({ path: 'shots/iter63_budget.png' });
await page.evaluate(() => window.__game.ui.toggleBudget(false));

if (seen.depot) {
  await page.evaluate(([x, y]) => {
    const g = window.__game, s = g.state;
    s.tick = s.day * 900 + 200;
    g.renderer.camera.setZoom(3); g.renderer.camera.centerOnTile(x, y);
    g.select(s.buildings.find((b) => b && b.kind === 'depot'));
    g.renderer.invalidateAll(); g.ui.refresh();
  }, seen.depot);
  await page.waitForTimeout(450);
  const info = await page.evaluate(() => document.getElementById('info').innerText);
  console.log('depot panel caravan:', (info.split('\n').find((l) => /sold so far/.test(l)) ?? info.replace(/\n/g, ' | ')).slice(0, 220));
  await page.screenshot({ path: 'shots/iter63_depot.png' });
}

// the Annals carry the crowns
await page.evaluate(() => { const g = window.__game; g.select(null); g.ui.toggleAnnals?.(true); g.ui.refresh(); });
await page.waitForTimeout(300);
const annals = await page.evaluate(() => (document.getElementById('annals')?.innerText ?? ''));
console.log('annals:', annals.split('\n').filter((l) => /caravan/i.test(l)).join(' | ').slice(0, 240) || 'annals panel not opened');

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
