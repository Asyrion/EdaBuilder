// Iteration 73 (the loose ends): six scenes in Chromium. A cradle with the Gloam at its door (the panel's warning, then the eggs gone
// grey); the Sky-Dock's button and a wyvern sent on the run (the panel while it is away); a mounted drake in the air on its way to a
// restless far from its cradle; sextons on the square on a brawl's day, and the brawl tale's fifth choice; the great wyrm's duel
// with the Vein-Wyrm over the city; the Wandering Merchant's second-visit dialog; a dusk brightness probe; no errors, no missing
// sprites.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = []; const warns = [];

async function open(seed = '73') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/missing sprite|failed to load/.test(m.text())) warns.push(m.text()); });
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
  await page.waitForTimeout(600);
  await page.fill('#t-seed', seed); await page.click('#t-new'); await page.waitForTimeout(400);
  return page;
}

// the town: a road, a lit cradle with two eggs, a Sky-Dock, a Wyrm-Court, a Guildhall, a Boneyard, Craft works and a Market
const TOWN = () => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  g.paused = true;
  s.milestone = 8; s.treasury = 99999; s.sectors.fill(1); s.lessonsSeen = ['districts'];
  for (let y = f.y - 16; y <= f.y + 16; y++) for (let x = f.x - 30; x <= f.x + 30; x++) { const i = y * s.w + x; if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 24, f.y + 5, f.x + 24, f.y + 5, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.residents = 8; b.workers = 8; b.lit = true; } return b; };
  const cradle = put('cradle', f.x - 2, f.y + 2);
  const dock = put('skydock', f.x + 4, f.y + 2);
  put('wyrmcourt', f.x + 10, f.y + 1);
  put('guildhall', f.x + 16, f.y + 3); // 2×2: its lower row touches the road
  put('boneyard', f.x - 20, f.y + 3);
  for (let k = 0; k < 4; k++) { const c = put('craft', f.x - 12 + k, f.y + 4, 1); c.stock = 60; }
  put('market', f.x + 8, f.y + 4, 2);
  for (let k = 0; k < 6; k++) put('hearth', f.x - 12 + k, f.y + 7, 1);
  w.recomputeAll(s);
  cradle.lit = true; dock.lit = false;
  const e1 = w.wyrmcraft.addEgg(s, 'ember'), e2 = w.wyrmcraft.addEgg(s, 'sky');
  s.tick = 180;
  ['toast', 'lesson', 'help'].forEach((id) => document.getElementById(id)?.classList.add('hidden')); document.querySelectorAll('.lesson').forEach((e) => e.classList.add('hidden'));
  g.select(null);
  return { cradle: cradle.id, dock: dock.id, eggs: [e1 && e1.line, e2 && e2.line], f: [f.x, f.y] };
};

const page = await open();
const town = await page.evaluate(TOWN);
console.log('town', JSON.stringify(town));

// 1. the eggs go grey: the Gloam painted at the cradle's door, one day: the warning and the panel line; three days: grey
const grey = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  const c = s.buildings.find((b) => b && b.kind === 'cradle');
  for (let dy = 0; dy < 2; dy++) for (let dx = 1; dx <= 3; dx++) s.gloam[(c.y + dy) * s.w + c.x - dx] = 1;
  w.wyrmcraft.dailyGreyEggs(s);
  g.renderer.invalidateAll();
  g.renderer.camera.setZoom(3); g.renderer.camera.centerOnTile(c.x + 3, c.y + 2);
  g.select(c); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { grey: c.grey, warning: s.messages.filter((m) => /greying/.test(m.text)).length, panel: (document.getElementById('info')?.textContent.match(/The Gloam[^⚠]*/) ?? [null])[0] };
});
console.log('grey day 1', JSON.stringify(grey));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter73_grey_warning.png' });
const grey3 = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  w.wyrmcraft.dailyGreyEggs(s); w.wyrmcraft.dailyGreyEggs(s);
  g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { grey: s.buildings.find((b) => b && b.kind === 'cradle').grey, lines: s.dragons.map((d) => d.line), greyed: s.stats.eggsGreyed, msg: s.messages.filter((m) => /gone grey/.test(m.text)).length };
});
console.log('grey day 3', JSON.stringify(grey3));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter73_grey_turned.png' });

// 2. the Sky-Dock's wyvern: the button, the run sent on day 3, the panel while it is away
const dock = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  { const c = s.buildings.find((b) => b && b.kind === 'cradle'); for (let dy = 0; dy < 2; dy++) for (let dx = 1; dx <= 3; dx++) s.gloam[(c.y + dy) * s.w + c.x - dx] = 0; w.recomputeAll(s); } // the Gloam cut back, or the charter ends at the founding node
  for (const d of s.dragons) { d.stage = 3; d.days = 0; }
  s.dragons[0].line = 'sky';
  w.tick(s); // the agents
  const dk = s.buildings.find((b) => b && b.kind === 'skydock');
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(dk.x + 6, dk.y);
  g.select(dk); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  const btn = Array.from(document.querySelectorAll('#info button')).find((b) => /wyvern/.test(b.textContent));
  const before = btn ? btn.textContent : null;
  if (btn) btn.click();
  s.day = 33; s.tick = 33 * 900 + 180;
  w.vehicles.dailyAirship(s);
  w.tick(s);
  g.select(dk); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  const row = (document.getElementById('info')?.textContent.match(/Wyvern[^·]*goods/) ?? [null])[0];
  return { button: before, wyvern: s.airship.wyvern, status: s.airship.status, goods: s.airship.goods, away: s.dragons.filter((d) => d.voyage !== undefined).map((d) => `${d.name} back ${d.voyage}`), agents: s.agents.filter((a) => a.species === 'wyvern').length, row, msg: s.messages.slice(-1)[0]?.text };
});
console.log('dock', JSON.stringify(dock));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter73_skydock_away.png' });

// 3. a mounted drake: the role from the sim, a restless far east, the drake in the air on its way
const mount = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  s.day = 40; s.airship.status = 'docked'; s.airship.wyvernId = -1; for (const d of s.dragons) delete d.voyage;
  const d = s.dragons[1]; d.stage = 2; d.days = 0;
  const why = w.wyrmcraft.setRole(s, d.id, 'mount');
  s.tick = s.day * 900 + 895;
  const fired = [];
  for (let k = 0; k < 60; k++) { w.tick(s); if (s.pendingEvent) { fired.push(s.pendingEvent.id); w.resolveEvent(s, 0); } } // past the day's turn and a creature update (every 50 ticks): the dragons' agents come out; a tale answered
  const rx = Math.min(s.w - 3, f.x + 28), ry = f.y + 5;
  s.agents.push({ id: s.nextAgentId++, kind: 2, x: rx + 0.5, y: ry + 0.5, path: [], pathIdx: 0, speed: 0.4, homeId: -1, targetId: -1, timer: 9999, variant: 0, dir: 0, load: 0 });
  const a = s.agents.find((o) => o.dragonId === d.id);
  let air = 0;
  for (let k = 0; k < 400 && !(a && (a.alt ?? 0) >= 20 && a.x > f.x + 14); k++) { w.tick(s); if (s.pendingEvent) { fired.push(s.pendingEvent.id); w.resolveEvent(s, 0); } if (a && (a.alt ?? 0) > 10) air++; }
  if (a) { g.renderer.camera.setZoom(4); g.renderer.camera.centerOnTile(Math.floor(a.x), Math.floor(a.y)); }
  g.select(null); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { why, fired, day: s.day, dragons: s.dragons.map((x) => `${x.name}:${x.stage}:${x.role}:${x.voyage}`), creatures: s.agents.filter((o) => o.kind === 3).map((o) => o.species), role: d.role, species: a && a.species, alt: a && a.alt, x: a && +a.x.toFixed(1), airTicks: air, restless: s.agents.filter((o) => o.kind === 2).length };
});
console.log('mount', JSON.stringify(mount));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter73_mount_flying.png' });
const rescued = await page.evaluate(() => { const s = window.__game.state, w = window.__wardlight; for (let k = 0; k < 1500 && s.agents.some((o) => o.kind === 2); k++) w.tick(s); return { restless: s.agents.filter((o) => o.kind === 2).length, mountRescues: s.stats.mountRescues }; });
console.log('rescued', JSON.stringify(rescued));

// 4. sextons at the brawl: a day for the walkers to appear, then the brawl's day; the tale with its fifth choice
const brawl = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  s.tick = s.day * 900 + 890;
  for (let k = 0; k < 20; k++) w.tick(s); // past the day's turn: the walkers come out
  const sextons = () => s.agents.filter((a) => a.kind === 4 && a.job === 'sexton');
  s.guilds.brawlDay = s.day;
  const hall = s.buildings.find((b) => b && b.kind === 'guildhall');
  let k = 0;
  for (; k < 6000 && !s.stats.brawlsParted; k++) w.tick(s);
  const sx = sextons()[0];
  g.renderer.camera.setZoom(3); g.renderer.camera.centerOnTile(hall.x, hall.y + 2);
  g.select(null); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { sextons: sextons().length, parted: s.stats.brawlsParted, ticks: k, at: sx ? [+sx.x.toFixed(1), +sx.y.toFixed(1)] : null, hall: [hall.x, hall.y], log: sx && sx.log };
});
console.log('brawl', JSON.stringify(brawl));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter73_sextons_square.png' });
const tale = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  const def = w.events.ALL_EVENTS.find((e) => e.id === 'guildwar_carters');
  s.pendingEvent = { id: def.id, title: def.title, text: w.events.textOf(def, s), choices: def.choices.map((c) => ({ label: c.label, desc: w.events.descOf(c, s) })) };
  g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { choices: s.pendingEvent.choices.map((c) => c.label), fifth: s.pendingEvent.choices[4].desc };
});
console.log('brawl tale', JSON.stringify(tale));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter73_brawl_tale.png' });
await page.evaluate(() => { window.__game.state.pendingEvent = null; window.__game.ui.refresh(); });

// 5. the merchant's second visit: the dialog with her memory
const merchant = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  s.merchant = { visits: 2, spent: 7600, eggs: 2, talks: 2 };
  const def = w.events.ALL_EVENTS.find((e) => e.id === 'merchant');
  s.pendingEvent = { id: def.id, title: def.title, text: w.events.textOf(def, s), choices: def.choices.map((c) => ({ label: c.label, desc: w.events.descOf(c, s) })) };
  g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { text: s.pendingEvent.text, egg: s.pendingEvent.choices[0].desc, favour: s.pendingEvent.choices[4].desc };
});
console.log('merchant', JSON.stringify(merchant));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter73_merchant.png' });
await page.evaluate(() => { window.__game.state.pendingEvent = null; window.__game.ui.refresh(); });

// a dusk brightness probe over a few frames
const dusk = await page.evaluate(() => {
  const g = window.__game, s = g.state, r = g.renderer; g.select(null); const c = document.createElement('canvas'); c.width = 32; c.height = 18; const ctx = c.getContext('2d'); const out = [];
  const t0 = s.day * 900;
  for (let t = 560; t <= 680; t += 20) { s.tick = t0 + t; r.render(s, g.view, 0.016); ctx.drawImage(document.getElementById('game'), 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; out.push(Math.round(sum / (32 * 18 * 3))); }
  return out;
});
const med = [...dusk].sort((a, b) => a - b)[dusk.length >> 1];
console.log('dusk brightness', dusk.join(' '), dusk.every((v) => v >= med / 4) ? 'ok' : 'DARK FRAME');
await page.close();

// 6. the duel: a map with a Sleeping Wyrm, a great wyrm of the city's own, a hostile flyover met in the air
const duelPage = await open('73');
const duel = await duelPage.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  let seed = 80;
  for (; seed < 140; seed++) { g.newGame(seed, 'Duelwick', 'valley', 'vellish'); if (g.state.wyrm.node >= 0) break; }
  const s = g.state, f = s.founding;
  document.getElementById('title')?.classList.add('hidden');
  g.paused = true; s.lessonsSeen = ['districts']; s.milestone = 8; s.treasury = 99999;
  for (let y = f.y - 14; y <= f.y + 14; y++) for (let x = f.x - 14; x <= f.x + 14; x++) { const i = y * s.w + x; if (i >= 0 && i < s.terrain.length && s.terrain[i] !== 7) s.terrain[i] = 3; }
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; b.residents = 8; b.workers = 8; b.lit = true; } return b; };
  w.actions.buildRoad(s, 1, w.actions.roadPath(f.x - 10, f.y + 4, f.x + 10, f.y + 4, false));
  for (let k = 0; k < 8; k++) put('hearth', f.x - 8 + k, f.y + 2, 2);
  for (let k = 0; k < 4; k++) put('craft', f.x - 4 + k, f.y + 6, 1);
  const cradle = put('cradle', f.x + 4, f.y - 2);
  w.recomputeAll(s); cradle.lit = true;
  s.wyrm.state = 'awake';
  const gw = w.wyrmcraft.addEgg(s, 'sky'); gw.stage = 4; gw.days = 0;
  for (let k = 0; k < 60; k++) { w.tick(s); if (s.pendingEvent) w.resolveEvent(s, 0); } // a creature update spawns the great wyrm's flyer
  w.wyrm.startFlyover(s, true);
  const duelist = s.agents.find((a) => a.dragonId === gw.id);
  const wyrmA = () => s.agents.find((a) => a.species === 'wyrm');
  let k = 0;
  for (; k < 6000 && wyrmA() && !(duelist && duelist.load === 1); k++) w.tick(s);
  const wa = wyrmA();
  const cx = wa ? wa.x : f.x, cy = wa ? wa.y : f.y;
  g.renderer.camera.setZoom(2); g.renderer.camera.centerOnTile(Math.floor(cx), Math.floor(cy));
  ['toast', 'lesson', 'help'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  g.select(null); g.renderer.invalidateAll(); g.ui.refresh(); document.getElementById('toast')?.classList.add('hidden');
  return { seed, gw: gw.name, duelistPhase: duelist && duelist.phase, met: duelist && duelist.load, ticks: k, wyrm: wa ? { phase: wa.phase, timer: wa.timer, variant: wa.variant, at: [+wa.x.toFixed(1), +wa.y.toFixed(1)] } : null, duelistAt: duelist && [+duelist.x.toFixed(1), +duelist.y.toFixed(1), duelist.alt], duels: s.stats.wyrmDuels, msg: s.messages.filter((m) => /rises from its cradle/.test(m.text)).length };
});
console.log('duel', JSON.stringify(duel));
await duelPage.waitForTimeout(400);
await duelPage.screenshot({ path: 'shots/iter73_duel.png' });
await duelPage.close();

console.log('errors', errors.length ? errors : 'none', 'missing', warns.length ? warns : 'none');
await browser.close();
