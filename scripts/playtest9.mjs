import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(21, 'Scalewatch'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.waitForTimeout(300);
// layout check: services tab (tallest) + ledger; measure overlaps
await page.click('#toolbar .tabs button:nth-child(5)');
await page.waitForTimeout(200);
const boxes = await page.evaluate(() => Object.fromEntries(['toolbar', 'tasks', 'demand', 'log', 'views', 'info'].map((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return [id, e.classList.contains('hidden') ? null : [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]]; })));
console.log('boxes', JSON.stringify(boxes));
const ov = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
console.log('toolbar/tasks overlap:', ov(boxes.toolbar, boxes.tasks), 'tasks/demand overlap:', ov(boxes.tasks, boxes.demand));
await page.screenshot({ path: 'shots/iter11_layout.png' });
// the sleeping wyrm at its node
await page.evaluate(() => {
  const g = window.__game, s = g.state; const n = s.nodes[s.wyrm.node];
  g.paused = true; g.renderer.camera.centerOnTile(n.x, n.y); g.renderer.camera.setZoom(3);
  g.selectedNode = s.wyrm.node; g.ui.refresh();
});
await page.waitForTimeout(400);
console.log('wyrm', await page.evaluate(() => JSON.stringify(window.__game.state.wyrm)));
await page.screenshot({ path: 'shots/iter11_sleeping.png' });
await page.evaluate(() => { const g = window.__game, s = g.state; s.wyrm.state = 'awake'; s.wyrm.waking = 100; const n = s.nodes[s.wyrm.node]; g.renderer.invalidateAll(); s.tick = Math.floor(s.tick / 900) * 900 + 640; g.ui.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter11_awake_night.png' });
// flyover over the city
await page.evaluate(() => {
  const g = window.__game, s = g.state, W = window.__wardlight, A = W.actions; const f = s.founding;
  s.tick = Math.floor(s.tick / 900) * 900 + 300;
  const bot = new W.Bot(s); for (let d = 0; d < 12; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); if (s.pendingEvent) W.resolveEvent(s, 0); }
  s.wyrm.state = 'awake';
  W.wyrm.refuse(s);
  const a = s.agents.find((x) => x.species === 'wyrm');
  for (let i = 0; i < 260; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true; g.renderer.camera.centerOnTile(Math.floor(a.x), Math.floor(a.y)); g.renderer.camera.setZoom(2);
});
await page.waitForTimeout(400);
console.log('flying', await page.evaluate(() => { const a = window.__game.state.agents.find((x) => x.species === 'wyrm'); return a ? `${a.x.toFixed(0)},${a.y.toFixed(0)} alt${a.alt} phase${a.phase} fires${window.__game.state.wyrm.fires}` : 'gone'; }));
await page.screenshot({ path: 'shots/iter11_flyover.png' });
await page.click('#btn-wyrms'); await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/iter11_wyrms.png' });
console.log('errors', errors);
await browser.close();
