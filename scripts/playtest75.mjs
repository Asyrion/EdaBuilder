// Iteration 75 (markets want a good road): a street with two markets, one on a dirt track and one on cobbles, each panel's
// "Road at the door" row (shots); the same street in the Thaw's mud and with a lit Lantern-way; the Budget's market tithe for
// the track against the cobbles; then a bot city (seed 42, Vellish) driven in the browser to day 60: the doors it paved,
// counted and shot. A dusk brightness probe; no errors, no missing sprites.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  await page.fill('#t-seed', '74'); await page.click('#t-new'); await page.waitForTimeout(400);
  return page;
}
const HIDE = () => { ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden')); document.querySelectorAll('.lesson').forEach((e) => e.classList.add('hidden')); };

const page = await open();
const street = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  s.milestone = 4; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts']; s.day = 40; s.tick = 40 * 900 + 180;
  for (let y = f.y - 10; y <= f.y + 12; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 14, f.y + 5, f.x + 14, f.y + 5, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.residents = 8; b.workers = 8; b.lit = true; b.happiness = 70; } return b; };
  const west = put('market', f.x - 6, f.y + 4, 2);
  const east = put('market', f.x + 6, f.y + 4, 2);
  for (let k = 0; k < 3; k++) put('craft', f.x - 1 + k, f.y + 4, 1);
  for (let k = 0; k < 6; k++) put('hearth', f.x - 8 + k * 3, f.y + 7, 1);
  w.recomputeAll(s);
  for (const b of s.buildings) if (b) { b.workers = 8; b.residents = 8; b.happiness = 70; b.lit = true; }
  // the east door cobbled
  const door = (b) => { for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) { const i = (b.y + dy) * s.w + b.x + dx; if (s.road[i]) return i; } return -1; };
  w.actions.buildRoad(s, 2, [door(east)]);
  ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(f.x, f.y + 3);
  g.select(west); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  const rowOf = () => (document.getElementById('info')?.textContent.match(/Roadat the door[^⚠]*?(?=Goods|Meat|Fish|Brownout|Level|Land|$)/) ?? [null])[0];
  const westRow = rowOf();
  g.select(east); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  const eastRow = rowOf();
  g.select(west); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { westRow, eastRow, westDoor: s.road[door(west)], eastDoor: s.road[door(east)], ledgerMarket: Math.round(w.economy.computeLedger(s).taxMarket * 10) / 10 };
});
console.log('street', JSON.stringify(street));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter75_track_panel.png' });
await page.evaluate(() => { const g = window.__game, s = g.state; const east = s.buildings.filter((b) => b && b.kind === 'market')[1]; g.select(east); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden'); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter75_cobble_panel.png' });

// the Thaw's mud, and a lit Lantern-way at the east door
const seasons = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  const [west, east] = s.buildings.filter((b) => b && b.kind === 'market');
  const door = (b) => { for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) { const i = (b.y + dy) * s.w + b.x + dx; if (s.road[i]) return i; } return -1; };
  const rowOf = () => (document.getElementById('info')?.textContent.match(/Roadat the door[^⚠]*?(?=Goods|Meat|Fish|Brownout|Level|Land|$)/) ?? [null])[0];
  s.day = 10; s.tick = 10 * 900 + 180; // the Thaw
  const mudBoth = w.economy.computeLedger(s).taxMarket;
  g.select(west); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  const mudRow = rowOf();
  s.road[door(east)] = 3; s.lit[door(east)] = 1; // a lit Lantern-way
  g.select(east); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  const lanternRow = rowOf();
  g.ui.toggleBudget(true); g.ui.refresh();
  return { mudRow, lanternRow, ledgerMud: Math.round(mudBoth * 10) / 10, ledgerNow: Math.round(w.economy.computeLedger(s).taxMarket * 10) / 10 };
});
console.log('seasons', JSON.stringify(seasons));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter75_lantern_budget.png' });
await page.evaluate(() => { window.__game.ui.toggleBudget(false); });

// a dusk brightness probe
const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; g.select(null); const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  const t0 = s.day * 900;
  for (let t = 560; t <= 680; t += 20) { s.tick = t0 + t; r.render(s, g.view, 0.016); ctx.drawImage(document.getElementById('game'), 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');

// the bot's paving: seed 42, Vellish, to day 60
await page.evaluate(() => {
  const g = window.__game;
  g.newGame(42, 'Botwick', 'valley', 'vellish');
  for (const id of ['help', 'title']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  g.state.lessonsSeen = ['districts'];
  window.__bot = new window.__wardlight.Bot(g.state);
});
const DAYS = 60;
for (let d = 0; d < DAYS; d += 5) {
  const r = await page.evaluate((until) => {
    const g = window.__game, s = g.state, w = window.__wardlight;
    while (s.day < until && !s.gameOver) {
      const day = s.day;
      w.tick(s);
      if (s.day !== day) window.__bot.step();
      else if (s.pendingEvent) w.resolveEvent(s, 0);
    }
    return { day: s.day, pop: s.population, treasury: Math.round(s.treasury), paved: window.__bot.doorsPaved, milestone: s.milestone };
  }, Math.min(DAYS, d + 5));
  if (r.day % 20 === 0) console.log('bot day', JSON.stringify(r));
}
const paved = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, bot = window.__bot;
  const markets = s.buildings.filter((b) => b && b.kind === 'market' && b.state === 'ok');
  const door = (b) => { for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) { const i = (b.y + dy) * s.w + b.x + dx; if (s.road[i]) return i; } return -1; };
  const tiers = markets.map((b) => s.road[door(b)]);
  const cob = markets.find((b) => s.road[door(b)] === 2) ?? markets[0];
  if (cob) { g.renderer.camera.setZoom(3); g.renderer.camera.centerOnTile(cob.x, cob.y); g.select(cob); }
  g.ui.refresh(); ['toast', 'lesson'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  return { markets: markets.length, onCobble: tiers.filter((t) => t === 2).length, onTrack: tiers.filter((t) => t === 1).length, paved: bot.doorsPaved, day: s.day, milestone: s.milestone, treasury: Math.round(s.treasury), ledgerMarket: Math.round(w.economy.computeLedger(s).taxMarket) };
});
console.log('bot paved', JSON.stringify(paved));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter75_bot_paved.png' });

console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await page.close();
await browser.close();
