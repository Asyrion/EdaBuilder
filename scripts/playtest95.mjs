// Iteration 95 (the Patagoi Atoll): the title screen with the new charter, a new atoll (the great isle, the minimap), a bridge
// laid over a shoal bar, and the same bridge in a sea-gale in the Hush (under the surf), a Cobble one holding beside it.
//   shots/iter95_title.png, iter95_atoll_1x.png, iter95_bridge.png, iter95_gale.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__wardlight, null, { timeout: 120000 });
await page.waitForTimeout(800);
const title = await page.evaluate(() => [...document.querySelectorAll('.scenarios [data-sc]')].map((b) => `${b.dataset.sc}: ${b.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}`));
await page.screenshot({ path: 'shots/iter95_title.png' });
await page.click('.scenarios [data-sc="atoll"]').catch(() => {});
const picked = await page.evaluate(() => document.querySelector('.scenarios [data-sc="atoll"]')?.className ?? '');
const info = await page.evaluate(() => {
  const g = window.__game, w = window.__wardlight;
  g.newGame(42, 'Isleby', 'atoll', 'vellish');
  const s = g.state, f = s.founding;
  g.paused = true;
  ['toast', 'lesson', 'help', 'title'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  s.lessonsSeen = ['districts']; s.treasury = 99999; s.milestone = 3; s.sectors.fill(1);
  s.tick = s.day * 900 + 300;
  // a bridge: from the great isle's east coast over the bar to the near isle, a Track beside a Cobble
  let row = -1;
  for (let dy = -2; dy <= 2 && row < 0; dy++) { let water = 0; for (let x = f.x; x < f.x + 40; x++) if (s.terrain[(f.y + dy) * s.w + x] === 1) water++; if (water >= 4) row = f.y + dy; }
  const tiles = [];
  for (let x = f.x; x < f.x + 40; x++) { const t = s.terrain[row * s.w + x]; if (t === 1 || (t !== 0 && tiles.length)) tiles.push(x); if (t === 0 && tiles.length) break; }
  return { row, scenario: s.scenario, nodes: s.nodes.length, founding: f, water: tiles.length };
});
await page.evaluate(() => { const g = window.__game; g.renderer.camera.setZoom(1); g.renderer.camera.centerOnTile(g.state.founding.x + 6, g.state.founding.y); g.renderer.invalidateAll(); g.ui.refresh(); });
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/iter95_atoll_1x.png' });
// lay a Track and a Cobble over the shallows, east of the great isle
const bridge = await page.evaluate(() => {
  const g = window.__game, s = g.state, w = window.__wardlight, f = s.founding;
  const find = (dy0) => { for (let dy = dy0; dy < dy0 + 8; dy++) { const xs = []; for (let x = f.x; x < f.x + 40; x++) if (s.terrain[(f.y + dy) * s.w + x] === 1) xs.push(x); if (xs.length >= 5) return { y: f.y + dy, x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2 }; } return null; };
  const a = find(-4), b = find(3);
  let cost = 0; const built = [];
  for (const [spot, kind] of [[a, 1], [b, 2]]) if (spot) { const path = w.actions.roadPath(spot.x0, spot.y, spot.x1, spot.y, false); const r = w.actions.buildRoad(s, kind, path); built.push(r.ok !== false); cost += r.cost ?? 0; }
  w.recomputeAll(s);
  g.renderer.camera.setZoom(2); const m = a ?? b; if (m) g.renderer.camera.centerOnTile((m.x0 + m.x1) >> 1, m.y + 2);
  g.renderer.invalidateAll(); g.ui.refresh();
  return { track: a, cobble: b, cost: Math.round(cost), built };
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/iter95_bridge.png' });
// the same, on the first gale day of the first Hush
const gale = await page.evaluate((bridgeSpots) => {
  const g = window.__game, s = g.state, w = window.__wardlight;
  const { galeStarts } = window.__wardlight.gales;
  s.day = 90 + galeStarts(s.seed, 0)[0];
  s.tick = s.day * 900 + 300;
  w.water.dailyFords(s);
  g.renderer.invalidateAll(); g.ui.refresh();
  const onRow = (spot) => s.water.closed.filter((i) => Math.floor(i / s.w) === spot.y && s.terrain[i] === 1).length;
  return { closed: s.water.closed.length, trackRowClosed: bridgeSpots.a ? onRow(bridgeSpots.a) : 0, cobbleRowClosed: bridgeSpots.b ? onRow(bridgeSpots.b) : 0, galeDays: s.stats.galeDays, messages: s.messages.slice(-3).map((m) => m.text) };
}, { a: bridge.track, b: bridge.cobble });
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/iter95_gale.png' });
console.log(JSON.stringify({ title, picked, info, bridge, gale, errors }, null, 1));
const ok = title.length === 5 && title.some((t) => t.startsWith('atoll')) && info.scenario === 'atoll' && info.nodes === 6 && gale.closed > 0 && gale.trackRowClosed > 0 && gale.cobbleRowClosed === 0 && bridge.built.every(Boolean) && !errors.length;
console.log(ok ? 'PLAYTEST 95 OK' : 'PLAYTEST 95 FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
