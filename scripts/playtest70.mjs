// Iteration 70 (two ways to lose). Two charters on seed 70, each taken to its end in Chromium:
// - the wyrm: woken and refused twice, its last asking shown, refused a third time, the razing flight over the Stake, the game-over;
// - the hounds: a Hush town with three painted districts, hounds at the doors (driven through the sim's own houndAtDoor), a home's
//   panel at two nights, the Districts view with fled homes, the Advisor's warning, the third district emptied and the game-over;
// and the Annals' new rows. Screenshots go to shots/iter70_*.png.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight && window.__wardlight.atlas);
await page.waitForTimeout(600);
const snap = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `shots/iter70_${name}.png` }); };
const view = (x, y, zoom) => page.evaluate(([x, y, zoom]) => { const g = window.__game; g.renderer.camera.setZoom(zoom); g.renderer.camera.centerOnTile(x, y); g.renderer.invalidateAll(); g.ui.refresh(); for (const id of ['toast', 'lesson']) document.getElementById(id)?.classList.add('hidden'); }, [x, y, zoom]);

/** A cleared valley round the stake with a street of homes, markets and spires; returns the founding. */
const town = (seed, name) => page.evaluate(([seed, name]) => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(seed, name, 'valley', 'vellish');
  for (const id of ['help', 'title', 'gameover']) document.getElementById(id)?.classList.add('hidden');
  g.paused = true;
  const s = g.state; const f = s.founding;
  s.lessonsSeen = ['districts']; s.milestone = 6; s.treasury = 50000; s.sectors.fill(1);
  const at = (x, y) => y * s.w + x;
  for (let y = f.y - 16; y <= f.y + 16; y++) for (let x = f.x - 18; x <= f.x + 18; x++) { const i = at(x, y); if (s.terrain[i] !== 7) s.terrain[i] = 3; s.gloam[i] = 0; }
  const Y = f.y + 4;
  w.actions.buildRoad(s, 2, w.actions.roadPath(f.x - 14, Y, f.x + 14, Y, false));
  const put = (k, x, y, lvl) => { const b = w.place(s, k, x, y, lvl); if (b) { b.state = 'ok'; b.work = 0; } return b; };
  for (let k = 0; k < 12; k++) { const h = put('hearth', f.x - 6 + k, Y - 1, 1); if (h) h.residents = 4; put('market', f.x - 6 + k, Y + 1, 1); }
  for (const [x, y] of [[f.x + 2, f.y - 1], [f.x - 4, Y - 3], [f.x + 7, Y - 3]]) put('spire', x, y);
  w.recomputeAll(s);
  g.select(null);
  return { fx: f.x, fy: f.y, Y, node: s.wyrm.node };
}, [seed, name]);

// ---- the wyrm
let t = await town(70, 'Wyrmwick');
for (let seed = 71; t.node < 0 && seed < 90; seed++) t = await town(seed, 'Wyrmwick');
const asking = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  s.wyrm.state = 'awake'; s.wyrm.tributeDay = s.day; s.wyrm.starved = 2;
  w.maybeFireEvent; // the wyrm's tales fire on their own terms
  w.events.maybeFireWyrm(s);
  g.ui.refresh();
  return { title: s.pendingEvent?.title, refuse: s.pendingEvent?.choices[2].desc, advisor: document.querySelector('#tasks .advice')?.innerText };
});
console.log('last asking', JSON.stringify(asking));
await view(t.fx, t.fy, 2);
await snap('wyrm_last_asking');
// refuse a third time and fly: stop mid-flight for a shot of the wyrm over the town
await page.evaluate(() => { const w = window.__wardlight, s = window.__game.state; w.resolveEvent(s, 2); window.__game.ui.refresh(); });
const mid = await page.evaluate(() => {
  const s = window.__game.state; const c = window.__wardlight.creatures ?? null;
  let k = 0;
  const wyrm = () => s.agents.find((a) => a.kind === 3 && a.species === 'wyrm');
  while (k++ < 40000 && wyrm() && Math.hypot(wyrm().x - s.founding.x, wyrm().y - s.founding.y) > 6) { s.tick++; window.__wardlight.tick(s); if (s.pendingEvent) window.__wardlight.resolveEvent(s, 0); }
  const a = wyrm();
  return { razing: s.wyrm.razing, at: a ? [Math.round(a.x), Math.round(a.y)] : null, ticks: k };
});
console.log('razing flight', JSON.stringify(mid));
if (mid.at) await view(mid.at[0], mid.at[1], 2);
await snap('wyrm_razing_flight');
const over = await page.evaluate(() => {
  const g = window.__game, s = g.state;
  let k = 0;
  while (k++ < 4000 && !s.gameOver) { window.__wardlight.tick(s); if (s.pendingEvent) window.__wardlight.resolveEvent(s, 0); }
  g.ui.refresh();
  return { lostTo: s.lostTo, gameOver: s.gameOver, stake: s.buildings.find((b) => b && b.kind === 'stake')?.state, title: document.querySelector('#gameover h2')?.textContent, cause: document.querySelectorAll('#gameover p')[1]?.textContent };
});
console.log('wyrm game over', JSON.stringify(over));
await snap('wyrm_gameover');

// ---- the hounds
t = await town(70, 'Houndwick');
const setup = await page.evaluate(([fx, Y]) => {
  const g = window.__game, w = window.__wardlight, s = g.state;
  document.getElementById('gameover')?.classList.add('hidden');
  s.day = 95; s.tick = 95 * 900 + 700; // a night in the Hush
  w.events; // (hounds are driven through the sim's own houndAtDoor below)
  // three painted districts of four homes each, west, middle and east along the street
  for (let d = 1; d <= 3; d++) w.actions.paintDistrict(s, d, fx - 6 + (d - 1) * 4, Y - 1, fx - 3 + (d - 1) * 4, Y - 1);
  w.recomputeAll(s);
  return { districts: [1, 2, 3].map((d) => s.buildings.filter((b) => b && b.kind === 'hearth' && s.district[b.y * s.w + b.x] === d).length) };
}, [t.fx, t.Y]);
console.log('hush town', JSON.stringify(setup));
// two nights at one home's door: its panel
const two = await page.evaluate(([fx, Y]) => {
  const g = window.__game, s = g.state, H = window.__wardlight.hounds;
  const b = s.buildings.find((o) => o && o.kind === 'hearth' && o.x === fx - 6 && o.y === Y - 1);
  for (let n = 0; n < 2; n++) { H.houndAtDoor(s, b); s.day++; }
  g.select(b); g.ui.refresh();
  return { hounded: b.hounded, panel: document.getElementById('info')?.innerText.match(/Hounds at the door[^\n]*\n?[^\n]*/)?.[0] };
}, [t.fx, t.Y]);
console.log('two nights', JSON.stringify(two));
await view(t.fx - 6, t.Y, 3);
await snap('hounds_two_nights');
// the first district emptied: the Districts view and the Advisor
const first = await page.evaluate(() => {
  const g = window.__game, s = g.state, H = window.__wardlight.hounds;
  const homes = (d) => s.buildings.filter((b) => b && b.kind === 'hearth' && s.district[b.y * s.w + b.x] === d);
  const start = s.day;
  for (const b of homes(1).slice(0, 2)) { s.day = start; for (let n = 0; n < 3; n++) { H.houndAtDoor(s, b); s.day++; } }
  const b2 = homes(2)[0]; s.day = start; for (let n = 0; n < 3; n++) { H.houndAtDoor(s, b2); s.day++; }
  g.select(null);
  window.__game.view.overlay = 'district'; g.ui.refreshViews?.(); g.ui.refresh();
  return { emptied: s.hush.emptied, fled: s.stats.houndFled, advisor: document.querySelector('#tasks .advice')?.innerText };
});
console.log('first emptied', JSON.stringify(first));
await view(t.fx - 2, t.Y, 3);
await snap('hounds_districts_view');
const end = await page.evaluate(() => {
  const g = window.__game, s = g.state, H = window.__wardlight.hounds;
  const homes = (d) => s.buildings.filter((b) => b && b.kind === 'hearth' && s.district[b.y * s.w + b.x] === d);
  const start = s.day;
  for (const d of [2, 3]) for (const b of homes(d).slice(0, 2)) { if (b.fled !== undefined) continue; s.day = start; for (let n = 0; n < 3; n++) { H.houndAtDoor(s, b); s.day++; } }
  window.__game.view.overlay = null;
  g.ui.refresh();
  return { lostTo: s.lostTo, gameOver: s.gameOver, title: document.querySelector('#gameover h2')?.textContent, cause: document.querySelectorAll('#gameover p')[1]?.textContent };
});
console.log('hounds game over', JSON.stringify(end));
await snap('hounds_gameover');
// the Annals
await page.evaluate(() => { document.getElementById('gameover')?.classList.add('hidden'); window.__game.ui.toggleAnnals(true); });
const annals = await page.evaluate(() => document.getElementById('annals')?.innerText.split('\n').filter((l) => /hounds|refusals/i.test(l)));
console.log('annals', JSON.stringify(annals));
await snap('annals');
console.log('errors', errors.length ? errors : 'none');
await browser.close();
