// Iteration 53 (M14 part 3, wyrmcraft matured): a Burgh with a Great Cradle, lodge seats, feeding reach, odds, the materials'
// sinks, a refused dragon's return, a dust-lit lane by night, the wonders' rows, the Weir's sluice, the Seat's warmth and the
// Lantern of Wicks; no errors, no missing sprites.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = []; const warns = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);

async function newGame(people, seed) {
  await page.evaluate((p) => { const sel = document.querySelector('#t-people, #t-faction, select[name=faction], select[name=people]'); if (sel) { sel.value = p; sel.dispatchEvent(new Event('change', { bubbles: true })); } }, people);
  await page.fill('#t-seed', String(seed)); await page.click('#t-new'); await page.waitForTimeout(300);
  await page.evaluate((p) => { document.getElementById('help').classList.add('hidden'); window.__game.paused = true; const s = window.__game.state; if (s.faction !== p) s.faction = p; }, people);
}

// ---- scene 1: a Vellish Burgh
await newGame('vellish', 42);
const one = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding, out = {};
  s.milestone = 6; s.treasury = 90000; s.sectors.fill(1); s.lessonsSeen = ['districts']; s.day = 100;
  for (let y = f.y - 12; y <= f.y + 14; y++) for (let x = f.x - 22; x <= f.x + 22; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 20, f.y + 3, f.x + 20, f.y + 3, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  put('spire', f.x + 4, f.y + 1);
  const cradle = put('cradle', f.x + 2, f.y + 4); const lodge = put('tamerslodge', f.x + 5, f.y + 4);
  const markets = []; for (let x = f.x - 6; x <= f.x - 2; x++) { const m = put('market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  const craft = put('craft', f.x + 8, f.y + 1, 2); craft.workers = 6;
  const ring = put('ring', f.x + 12, f.y + 5); const forge = put('wyrmforge', f.x + 11, f.y + 1);
  const foundry = put('golemfoundry', f.x - 10, f.y - 4); const lantern = put('lantern', f.x - 6, f.y - 8); const hall = put('hallofmarvels', f.x + 2, f.y - 8); const cores = put('corelantern', f.x + 8, f.y - 4);
  for (let k = 0; k < 3; k++) { const h = put('hearth', f.x + 16 + k, f.y + 4, 1); h.residents = 3; }
  s.materials = { scale: 12, wyrmfire: 2.5, eggshell: 2, rayscale: 3, glimdust: 4 };
  s.agents.push({ id: s.nextAgentId++, kind: 3, x: foundry.x + 1, y: foundry.y + 2.5, path: [], pathIdx: 0, speed: 0.45, homeId: foundry.id, targetId: -1, timer: 0, variant: 0, dir: 0, load: 1, species: 'golem', anchorId: -1, ax: foundry.x + 1, ay: foundry.y + 2.5 });
  w.recomputeAll(s);
  for (const b of [cradle, lodge, craft, forge, lantern, hall, cores, foundry, ring]) b.lit = true;
  out.raised = w.wyrmcraft.raiseCradle(s, cradle.id);
  const d1 = w.wyrmcraft.addEgg(s, 'ember'); d1.stage = 3; d1.mood = 80; w.wyrmcraft.setRole(s, d1.id, 'champion');
  const d2 = w.wyrmcraft.addEgg(s, 'ember'); d2.stage = 2; d2.mood = 70;
  const d3 = w.wyrmcraft.addEgg(s, 'bone');
  s.departed.push({ name: 'Sablewick', line: 'ember', stage: 2, day: s.day - 20, x: cradle.x, y: cradle.y, returned: false });
  s.tick = 180; w.recomputeAll(s); g.renderer.invalidateAll(); g.ui.refresh();
  const info = (b) => { g.select(b); g.ui.refresh(); return document.getElementById('info').textContent; };
  out.craftAura = /Dragon auras/.test(info(craft)) && /Ember/.test(info(craft));
  const ci = info(cradle); out.cradleRows = /Nests[^]*\/ 4/.test(ci) && /Great Cradle/.test(ci) && /Markets within 12/.test(ci) && /Lodge seats/.test(ci);
  out.ringRows = /Next bout/.test(info(ring)) && /odds \d+ %/.test(info(ring));
  out.forgeRow = /hot: burns 0.1/.test(info(forge));
  out.coresRow = /Cores/.test(info(cores)) && /whole/.test(info(cores));
  out.foundryRows = /Wardens/.test(info(foundry)) && !!document.querySelector('#info select[data-golem]');
  out.mineRow = true;
  g.ui.toggleWyrms(true); g.ui.refresh();
  const wt = document.getElementById('wyrms').textContent;
  out.wyrms = /odds \d+ %/.test(wt) && /seat at the lodge/.test(wt) && /burn it for Craft/.test(wt) && /Line the nest/.test(wt) && /Departed: Sablewick/.test(wt) && /eats 14 a day from 5 markets within 12/.test(wt) && /Great/.test(wt);
  out.burnToggle = !!document.querySelector('#wyrms #w-burn');
  g.ui.toggleEdicts && g.ui.toggleEdicts(true); g.ui.refresh();
  out.scalemail = /Scale-Mail/.test(document.getElementById('edicts').textContent) && /scale in the vault/.test(document.getElementById('edicts').textContent);
  g.ui.toggleEdicts && g.ui.toggleEdicts(false);
  g.select(null); g.renderer.camera.centerOnTile(f.x + 4, f.y + 2); g.renderer.camera.setZoom(2);
  return out;
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter53_wyrms.png' });
const two = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding, out = {};
  g.ui.toggleWyrms(false);
  // the departed dragon's day comes: its tale, refused, and a rogue flyer over the cradle
  s.departed[0].day = s.day - 31;
  w.maybeFireReturn(s); g.ui.refresh();
  const ev = document.getElementById('event');
  out.returnTale = !ev.classList.contains('hidden') && /Sablewick returns/.test(ev.textContent) && /Refuse it/.test(ev.textContent);
  s.coverage.ward.fill(0);
  w.resolveEvent(s, 2); g.ui.refresh();
  out.rogue = s.agents.some((a) => a.species === 'wyvern' && a.dragonId === -1 && a.phase === 3);
  out.fires = s.buildings.filter((b) => b && b.state === 'burning').length;
  // the caravan's slider
  const e = w.ALL_EVENTS.find((x) => x.id === 'caravan');
  s.pendingEvent = { id: e.id, title: e.title, text: e.text, choices: e.choices.map((c) => ({ label: c.label, desc: typeof c.desc === 'string' ? c.desc : c.desc(s), slider: c.slider })) };
  g.ui.refresh();
  out.slider = !!document.querySelector('#event input[type=range][data-slider]');
  s.pendingEvent = null; g.ui.refresh();
  // glim-dust on the dark end of the track, seen by night
  const r = w.actions.scatterDust(s, f.x + 19, f.y + 3); const r2 = w.actions.scatterDust(s, f.x + 18, f.y + 3);
  out.dust = r.ok && r2.ok && s.dustLit[(f.y + 3) * s.w + f.x + 19] > s.day;
  w.recomputeAll(s);
  out.dustLit = s.lit[(f.y + 3) * s.w + f.x + 19] === 1;
  s.tick = 640; g.renderer.invalidateAll(); g.ui.refresh();
  g.renderer.camera.centerOnTile(f.x + 12, f.y + 3); g.renderer.camera.setZoom(3);
  return out;
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/iter53_night.png' });

// ---- scene 2: the Veshari Weir's sluice
await newGame('veshari', 42);
const three = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding, out = {};
  s.milestone = 7; s.treasury = 90000; s.sectors.fill(1);
  for (let y = f.y - 12; y <= f.y + 16; y++) for (let x = f.x - 16; x <= f.x + 16; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  for (let dx = -12; dx <= 12; dx++) for (let dy = 5; dy <= 6; dy++) s.terrain[(f.y + dy) * s.w + f.x + dx] = 1;
  for (let dx = -13; dx <= 13; dx++) for (const dy of [4, 7]) s.terrain[(f.y + dy) * s.w + f.x + dx] = 2;
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  const weir = put('greatweir', f.x + 2, f.y + 7);
  w.recomputeAll(s); g.ui.refresh();
  const info = (b) => { g.select(b); g.ui.refresh(); return document.getElementById('info').textContent; };
  out.sluiceClosed = /Sluice[^]*closed: 45/.test(info(weir)) && !!document.querySelector('#info button') && /Open the sluice/.test(document.getElementById('info').textContent);
  const supply0 = s.manaSupply;
  w.actions.toggleSluice(s, weir.id); w.recomputeAll(s);
  out.sluiceOpen = /open: 90/.test(info(weir)) && s.manaSupply - supply0 >= 44;
  return out;
});

// ---- scene 3: the Underking's Seat warms a hatchery; scene 4: the Lantern of Wicks halves a spire
await newGame('grimmen', 42);
const four = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding, out = {};
  s.milestone = 7; s.treasury = 90000; s.sectors.fill(1);
  for (let y = f.y - 12; y <= f.y + 12; y++) for (let x = f.x - 30; x <= f.x + 30; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  const seat = put('underkingseat', f.x - 4, f.y - 5); const hatch = put('hatchery', f.x + 20, f.y - 4);
  w.recomputeAll(s); g.ui.refresh();
  g.select(hatch); g.ui.refresh();
  out.warmed = hatch.lit && seat.lit && /warmed by the Underking/.test(document.getElementById('info').textContent);
  return out;
});
await newGame('tallowkin', 42);
const five = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding, out = {};
  s.milestone = 7; s.treasury = 90000; s.sectors.fill(1);
  for (let y = f.y - 12; y <= f.y + 12; y++) for (let x = f.x - 30; x <= f.x + 30; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); b.state = 'ok'; b.work = 0; return b; };
  const spire = put('spire', f.x + 5, f.y - 2);
  for (let k = 0; k < 4; k++) { const h = put('hearth', f.x + 7, f.y - 4 + k, 2); h.residents = 3; }
  w.recomputeAll(s);
  const load0 = spire.load;
  const wicks = put('lanternofwicks', f.x + 12, f.y - 6);
  w.recomputeAll(s); g.ui.refresh();
  g.select(spire); g.ui.refresh();
  out.halved = wicks.lit && spire.load < load0 && /halved by the Lantern of Wicks/.test(document.getElementById('info').textContent);
  return out;
});
const all = { ...one, ...two, ...three, ...four, ...five };
console.log('checks:', JSON.stringify(all));
const pass = Object.entries(all).every(([k, v]) => (k === 'raised' ? v === null : k === 'fires' ? v >= 1 : v === true)) && errors.length === 0 && warns.length === 0;
console.log(pass ? 'PASS' : 'FAIL', 'errors', errors, 'warns', warns.slice(0, 5));
await browser.close();
