// Iteration 55 (M14 part 5, the bot plays it all, and the Annals): a Vellish town the bot has played for thirty days, the
// Annals opened with N and from the top bar and closed with Esc; the five new dev commands driven from the panel (a number
// input, a second argument); an old version-6 save imported and a version-99 save refused with its reason; a Tallowkin
// Hall of Wicks unlocked by the vigil festival itself; no errors, no missing sprites.
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

// ---- scene 1: thirty days of the bot on a Vellish valley, then the Annals
await newGame('vellish', 42);
const one = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  const bot = new w.Bot(s);
  for (let d = 0; d < 30; d++) { for (let i = 0; i < 900; i++) w.tick(s, { onDay: () => bot.step() }); }
  out.botDays = s.day >= 30;
  out.botGrew = s.population > 300;
  out.botTithe = s.taxRates.hearth >= 6 && s.taxRates.hearth <= 10;
  g.renderer.invalidateAll(); g.ui.refresh();
  g.renderer.camera.centerOnTile(s.founding.x + 2, s.founding.y + 1); g.renderer.camera.setZoom(2);
  return out;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter55_bottown.png' });
// the hotfix of this session: the light pass left 'multiply' set at dawn and dusk and the next frames went black
const dawn = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer, out = {};
  const c = document.createElement('canvas'); c.width = 32; c.height = 18; const x = c.getContext('2d', { willReadFrequently: true });
  const lum = () => { x.drawImage(document.getElementById('game'), 0, 0, 32, 18); const d = x.getImageData(0, 0, 32, 18).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2]; return t / (d.length / 4) / 3; };
  const tick0 = s.tick, day = Math.floor(s.tick / 900) * 900;
  const ls = [];
  for (const tk of [20, 26, 30, 33, 36, 40, 45, 50, 60, 340, 348, 352, 358, 365]) { s.tick = day + tk; r.render(s, g.view, 0.016); ls.push(lum()); }
  s.tick = tick0;
  const sorted = [...ls].sort((a, b) => a - b);
  out.noBlackAtDawnOrDusk = sorted[0] > sorted[Math.floor(sorted.length / 2)] * 0.5;
  return out;
});
await page.keyboard.press('n');
await page.waitForTimeout(200);
const two = await page.evaluate(() => {
  const s = window.__game.state, out = {};
  const el = document.getElementById('annals');
  out.annalsByKey = !el.classList.contains('hidden');
  const t = el.textContent;
  out.annalsChapters = ['The folk', 'Goods & trade', 'The Crown & the Charter', 'The ley', 'The grey edge', 'The dead', 'Seasons & weather', 'Walkers', 'Wyrmcraft', 'The Vein-Wyrm', 'Beasts', 'Guilds & relics', 'The land'].every((c) => t.includes(c));
  out.annalsRows = /Thaw levies paid/.test(t) && /Hound raids/.test(t) && /Days of rain/.test(t) && /Tales heard/.test(t);
  out.annalsPeak = t.includes(s.stats.peakPopulation.toLocaleString());
  out.annalsTooltip = !!el.querySelector('.arow[title*="Crown\'s levy"]');
  return out;
});
await page.screenshot({ path: 'shots/iter55_annals.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const three = await page.evaluate(() => {
  const out = {};
  out.annalsEsc = document.getElementById('annals').classList.contains('hidden');
  document.getElementById('btn-annals').click();
  out.annalsButton = !document.getElementById('annals').classList.contains('hidden');
  document.querySelector('#annals #an-close').click();
  out.annalsClose = document.getElementById('annals').classList.contains('hidden');
  return out;
});

// ---- scene 2: the five new dev commands from the panel
const four = await page.evaluate(() => {
  const g = window.__game, s = g.state, out = {};
  g.ui.toggleDev(true);
  const panel = document.getElementById('dev');
  const click = (id) => panel.querySelector(`button[data-id="${id}"]`).click();
  const day0 = s.day;
  const num = panel.querySelector('input[data-arg="setday"]');
  out.dayInput = !!num && Number(num.value) === day0 + 30;
  num.value = String(day0 + 20);
  click('setday');
  out.dayJumped = s.day === day0 + 20 && Math.floor(s.tick / 900) === s.day;
  panel.querySelector('select[data-arg="river"]').value = 'flood';
  click('river');
  out.flooded = window.__wardlight.weave.flooding(s);
  panel.querySelector('select[data-arg="standing"]').value = 'crown';
  panel.querySelector('input[data-arg2="standing"]').value = '15';
  click('standing');
  out.favour = s.crownFavour === 15;
  const done0 = s.questsDone.length;
  click('quest');
  out.quest = s.questsDone.length === done0 + 1;
  s.firedEvents.push('stormcaller:0', 'pilgrims:0');
  panel.querySelector('select[data-arg="forget"]').value = 'tales';
  click('forget');
  out.forgot = s.firedEvents.includes('stormcaller:0') && !s.firedEvents.includes('pilgrims:0');
  out.devCounted = s.stats.devUses >= 5;
  return out;
});
await page.screenshot({ path: 'shots/iter55_dev.png' });

// ---- scene 3: an old save imported, a newer one refused
const five = await page.evaluate(async () => {
  const g = window.__game, w = window.__wardlight, out = {};
  g.ui.toggleDev(false);
  const o = JSON.parse(w.save.serialize(g.state));
  out.writesSeven = o.version === 7;
  o.version = 6; delete o.crownFavour; delete o.departed; delete o.stats.levies;
  g.importJson(new File([JSON.stringify(o)], 'old.wardlight.json'));
  await new Promise((r) => setTimeout(r, 300));
  out.oldLoaded = /Charter imported/.test(document.getElementById('toast').textContent) && g.state.crownFavour === 50 && g.state.stats.levies === 0 && g.state.version === 7;
  o.version = 99;
  g.importJson(new File([JSON.stringify(o)], 'new.wardlight.json'));
  await new Promise((r) => setTimeout(r, 300));
  out.newRefused = /newer Wardlight \(save version 99\)/.test(document.getElementById('toast').textContent);
  return out;
});
await page.screenshot({ path: 'shots/iter55_refused.png' });

// ---- scene 4: the Tallowkin keep the vigil, and the Hall of Wicks opens
await newGame('tallowkin', 42);
const six = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, out = {};
  s.milestone = 5; s.treasury = 20000;
  const f = s.founding; // folk the daily count will find: the vigil is asked of a city of more than forty
  for (let k = 0; k < 10; k++) { const b = w.place(s, 'hearth', f.x - 6 + k, f.y + 4, 2); b.state = 'ok'; b.work = 0; b.residents = 8; }
  w.recomputeAll(s);
  out.lockedBefore = /vigil/.test(w.factions.specialLock(s, 'hallofwicks') || '');
  s.day = 90; s.tick = 90 * 900; // the eve of the Hush
  for (let i = 0; i < 900 && !s.pendingEvent; i++) w.tick(s);
  out.vigilAsked = !!s.pendingEvent && s.pendingEvent.id === 'vigil';
  w.resolveEvent(s, 0);
  out.recordedAsFestival = s.firedEvents.some((f) => /^vigil@0:0$/.test(f));
  out.hallOpen = w.factions.specialLock(s, 'hallofwicks') === null && w.factions.canBuild(s, 'hallofwicks');
  g.ui.refresh();
  return out;
});
await page.screenshot({ path: 'shots/iter55_tallowkin.png' });

const all = { ...one, ...dawn, ...two, ...three, ...four, ...five, ...six };
console.log('checks:', JSON.stringify(all));
const pass = Object.values(all).every((v) => v === true) && errors.length === 0 && warns.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors, 'warns', warns.slice(0, 5));
await browser.close();
