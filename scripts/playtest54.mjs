// Iteration 54 (M14 part 4, the world pushes back): a Vellish Burgh in the Bloom with rain in the top bar and the forecast,
// the next gate under the title, the Budget panel's levy, favour and loan rows and a loan taken, an edict refused within
// ten days, a charter locked with its cost shown, the Lantern Fair in the forecast, the pilgrims' tale; a daily-challenge
// game failing on day 61; no errors, no missing sprites.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; const warns = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);

let started = false;
async function newGame(people, seed, scenario = 'valley') {
  if (!started) {
    await page.fill('#t-seed', String(seed)); await page.click('#t-new'); await page.waitForTimeout(300);
    started = true;
  }
  await page.evaluate(([p, sd, sc]) => { window.__game.newGame(sd, 'Playtest', sc, p); }, [people, seed, scenario]);
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; });
}

// ---- scene 1: a Vellish Burgh in the Bloom
await newGame('vellish', 42);
const one = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding, out = {};
  s.milestone = 6; s.treasury = 60000; s.sectors.fill(1); s.lessonsSeen = ['districts']; s.population = 1200; s.happiness = 58;
  for (let y = f.y - 12; y <= f.y + 14; y++) for (let x = f.x - 22; x <= f.x + 22; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 20, f.y + 3, f.x + 20, f.y + 3, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  put('spire', f.x + 4, f.y + 1);
  const obs = put('observatory', f.x - 8, f.y - 6); const gh = put('guildhall', f.x - 3, f.y - 6);
  for (let k = 0; k < 6; k++) { const h = put('hearth', f.x + 8 + k, f.y + 4, 1); h.residents = 3; }
  const craft = put('craft', f.x + 10, f.y - 2, 2); craft.workers = 6;
  const m = put('market', f.x - 6, f.y + 4, 2); m.workers = 6; m.stock = 40;
  w.actions.paintDistrict(s, 1, f.x + 7, f.y - 8, f.x + 20, f.y + 8);
  // the Bloom's first rain, read from the seed
  const rain = w.weave.seasonWeather(s.seed, 1).find((x) => x.kind === 'rain') ?? w.weave.seasonWeather(s.seed, 5).find((x) => x.kind === 'rain');
  out.rainFound = !!rain;
  s.day = rain.start - 2;
  w.recomputeAll(s);
  for (const b of [obs, gh, craft]) b.lit = true;
  s.population = 1200; s.treasury = 60000; // after the road's price and the recompute
  s.tick = 180; g.renderer.invalidateAll(); g.ui.refresh();
  out.nextGate = /next Free City: 1,500 folk, happiness 66/.test(document.getElementById('tb-title').textContent);
  g.ui.toggleTasks && g.ui.toggleTasks(true); g.ui.refresh();
  const fc = () => (document.querySelector('#tasks .forecast') || { textContent: '' }).textContent;
  out.forecastRain = /Rain in 2 days, 2 days of it/.test(fc());
  s.day = rain.start; w.weave.dailyWeather(s); g.ui.refresh();
  out.topbarRain = /· rain$/.test(document.getElementById('tb-date').textContent);
  out.chronicleRain = s.messages.some((x) => /^Rain over Playtest for 2 days/.test(x.text));
  out.forecastToday = /Rain today and for 1 more day/.test(fc());
  // the Lantern Fair: Bloom 12, three days off, with a Guildhall standing
  s.day = 30 + 12 - 3; s.weather = null; g.ui.refresh();
  out.fair = /The Lantern Fair in 3 days/.test(fc());
  // the Budget panel: levy, favour, loan
  g.ui.toggleBudget(true); g.ui.refresh();
  const bt = () => document.getElementById('budget').textContent;
  out.levyRow = /Thaw levy/.test(bt()) && /−2,500 in \d+ days/.test(bt());
  out.favourRow = /The Crown's favour/.test(bt()) && /50 \/ 100/.test(bt());
  out.charterRow = /Charters \(a crown a building\)/.test(bt());
  document.querySelector('#budget #b-loan').click();
  out.loanTaken = s.loan === 60000 && s.treasury === 120000 && /60,000 out at 0.5 %\/day/.test(bt()) && !!document.querySelector('#budget #b-repay');
  out.interestRow = /Interest/.test(bt()) && /−300/.test(bt());
  g.ui.toggleBudget(false);
  // the Edicts panel: an edict made cannot be repealed for ten days; a charter holds thirty and costs a crown a building
  g.ui.toggleEdicts(true); g.ui.refresh();
  const et = () => document.getElementById('edicts').textContent;
  const box = document.querySelector('#edicts input[data-key="curfew"]');
  box.click();
  out.edictOn = s.edicts.curfew === true && s.edictSince.curfew === s.day && /runs 10 more days/.test(et());
  document.querySelector('#edicts input[data-key="curfew"]').click();
  out.edictHeld = s.edicts.curfew === true && /Runs 10 more days/.test(document.getElementById('toast').textContent);
  out.edictIntro = /holds 10 days once made and costs 200 crowns to repeal/.test(et());
  g.ui.edictScope = 1; g.ui.refreshEdicts();
  document.querySelector('#edicts button[data-quarter="craft"]').click();
  out.charterSet = s.districtQuarters[1] === 'craft' && s.quarterSince[1] === s.day;
  out.charterLine = /The Crown takes \d+ crowns a day for it/.test(et()) && /the charter holds 30 more days/.test(et());
  out.charterHeldButtons = document.querySelector('#edicts button[data-quarter="hearth"]').disabled && document.querySelector('#edicts button[data-quarter=""]').disabled;
  g.ui.toggleEdicts(false);
  // the pilgrims' tale, a month after they were welcomed
  s.pilgrimsDay = s.day - 30; s.lastBadDay = -30; s.lastEventDay = -30; s.pendingEvent = null;
  for (let k = 0; k < 80 && !s.pendingEvent; k++) { s.lastEventDay = -30; w.maybeFireEvent(s); }
  g.ui.refresh();
  const ev = document.getElementById('event');
  out.pilgrims = !!s.pendingEvent && s.pendingEvent.id === 'pilgrims_shrine' && !ev.classList.contains('hidden') && /The pilgrims ask for a shrine/.test(ev.textContent);
  g.select(null); g.renderer.camera.centerOnTile(f.x + 2, f.y + 1); g.renderer.camera.setZoom(2);
  return out;
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter54_burgh.png' });
const two = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  w.resolveEvent(s, 0); g.ui.refresh();
  out.shrine = s.buildings.some((b) => b && b.kind === 'shrine') && s.stats.pilgrimShrines === 1;
  g.ui.toggleBudget(true); g.ui.refresh();
  g.renderer.invalidateAll();
  return out;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter54_budget.png' });

// ---- scene 2: the daily challenge, lost on day 61
await newGame('vellish', 0, 'daily');
const three = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  out.daily = !!s.challenge && s.challengeDay === -1;
  out.people = s.faction;
  out.peopleFromDate = w.scenario ? w.scenario.challengePeople(s.challenge) === s.faction : true;
  s.day = 60; s.treasury = 3000;
  for (let i = 0; i < 1000; i++) w.tick(s);
  out.day61 = s.day === 61;
  out.failed = s.challengeDay === -2 && s.messages.some((m) => m.kind === 'bad' && /challenge .* is lost/.test(m.text));
  g.ui.toggleTasks && g.ui.toggleTasks(true); g.ui.refresh();
  const sc = (document.querySelector('#tasks .score') || { textContent: '' }).textContent;
  out.failedLine = /Failed/.test(sc) && /failed, no Market Town by day 60/.test(sc);
  out.copyButton = !!document.querySelector('#tasks #q-copy');
  return out;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter54_daily.png' });
const all = { ...one, ...two, ...three };
console.log('checks:', JSON.stringify(all));
const pass = Object.entries(all).every(([k, v]) => (k === 'people' ? typeof v === 'string' : v === true)) && errors.length === 0 && warns.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors, 'warns', warns.slice(0, 5));
await browser.close();
