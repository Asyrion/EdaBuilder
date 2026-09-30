import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
// grow, then build a cradle + tamer near the founding node, add an egg through the seam event, grow it
await page.evaluate(() => {
  const g = window.__game, W = window.__wardlight, A = W.actions; const s = g.state;
  const bot = new W.Bot(s); for (let d = 0; d < 25; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
  if (s.pendingEvent) W.resolveEvent(s, 0);
  s.milestone = Math.max(4, s.milestone); s.treasury = 60000;
  const f = s.founding;
  // clear space next to the node
  for (let dy = 2; dy <= 5; dy++) for (let dx = -3; dx <= 4; dx++) A.bulldoze(s, f.x + dx, f.y + dy);
  A.buildRoad(s, 1, A.roadPath(f.x - 3, f.y + 6, f.x + 5, f.y + 6, false));
  console.log('cradle', JSON.stringify(A.placeBuilding(s, 'cradle', f.x - 1, f.y + 4)), 'tamer', JSON.stringify(A.placeBuilding(s, 'tamerslodge', f.x + 2, f.y + 4)), 'spire', JSON.stringify(A.placeBuilding(s, 'spire', f.x + 4, f.y + 5)));
  W.recomputeAll(s); g.renderer.invalidateAll();
});
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const s = g.state; s.lastEventDay = -100; const seam = window.__wardlight.ALL_EVENTS.find((e) => e.id === 'egg_seam'); s.pendingEvent = { id: 'egg_seam', title: seam.title, text: seam.text, choices: seam.choices.map((c) => ({ label: c.label, desc: c.desc })) }; g.ui.refresh(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/egg_event.png' });
await page.click('#event .choices button');
await page.waitForTimeout(200);
console.log('dragons after keep:', await page.evaluate(() => window.__game.state.dragons.map((d) => d.line + ':' + d.stage)));
// fast-forward 45 days feeding markets
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const s = g.state; for (let d = 0; d < 45; d++) { for (const b of s.buildings) if (b && b.kind === 'market') b.stock = 40; for (const b of s.buildings) if (b && b.kind === 'cradle') b.lit = true; for (let i = 0; i < 900; i++) W.tick(s); if (s.pendingEvent) W.resolveEvent(s, 0); for (const b of s.buildings) if (b && b.kind === 'cradle') b.lit = true; } W.recomputeAll(s); g.renderer.invalidateAll(); g.paused = true; });
console.log('dragons after 45 days:', await page.evaluate(() => window.__game.state.dragons.map((d) => `${d.name} ${d.line} stage${d.stage} mood${Math.round(d.mood)}`)), 'materials', await page.evaluate(() => JSON.stringify(window.__game.state.materials)));
await page.click('#btn-wyrms'); await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/wyrms_panel.png' });
await page.click('#w-close');
await page.evaluate(() => { const g = window.__game; const a = g.state.agents.find((x) => x.species === 'drake'); if (a) g.renderer.camera.centerOnTile(Math.floor(a.x), Math.floor(a.y)); g.renderer.camera.setZoom(4); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/drake.png' });
console.log('errors', errors);
await browser.close();
