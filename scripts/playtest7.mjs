import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.mouse.click(700, 500); // user gesture -> audio init
await page.waitForTimeout(2500);
console.log('music bars scheduled:', await page.evaluate(() => window.__game.audio.music ? window.__game.audio.music.bar : 'no music'), 'ctx state:', await page.evaluate(() => window.__game.audio.ctx && window.__game.audio.ctx.state));
// build a scene: wall + gates + ring + wyvern courier
await page.evaluate(() => {
  const g = window.__game, W = window.__wardlight, A = W.actions; const s = g.state;
  const bot = new W.Bot(s); for (let d = 0; d < 20; d++) { for (let i = 0; i < 900; i++) W.tick(s); bot.step(); }
  if (s.pendingEvent) W.resolveEvent(s, 0);
  s.milestone = 5; s.treasury = 90000;
  const f = s.founding;
  for (let dy = 2; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) A.bulldoze(s, f.x + dx, f.y + dy);
  A.buildRoad(s, 1, A.roadPath(f.x - 8, f.y + 6, f.x + 8, f.y + 6, false));
  A.buildRoad(s, 1, A.roadPath(f.x, f.y + 6, f.x, f.y + 14, true));
  A.placeBuilding(s, 'cradle', f.x - 1, f.y + 4); A.placeBuilding(s, 'tamerslodge', f.x + 2, f.y + 4); A.placeBuilding(s, 'spire', f.x + 4, f.y + 5);
  A.placeBuilding(s, 'ring', f.x - 8, f.y + 7);
  A.buildWall(s, A.roadPath(f.x - 10, f.y + 11, f.x + 10, f.y + 11, false));
  A.placeGate(s, 2, f.x, f.y + 11); A.placeGate(s, 3, f.x + 6, f.y + 11);
  W.recomputeAll(s);
  const cr = s.buildings.find((b) => b && b.kind === 'cradle');
  s.dragons.push({ id: 900, name: 'Cinder', line: 'ember', stage: 3, days: 0, cradleId: cr.id, role: 'courier', roleTarget: -1, mood: 90, hungry: 0, training: 'gentle', agentId: -1, born: s.day });
  s.dragons.push({ id: 901, name: 'Ossa', line: 'bone', stage: 2, days: 0, cradleId: cr.id, role: 'champion', roleTarget: -1, mood: 80, hungry: 0, training: 'gentle', agentId: -1, born: s.day });
  for (const b of s.buildings) if (b && b.kind === 'craft') b.stock = 50;
  for (let i = 0; i < 300; i++) W.tick(s);
  g.renderer.invalidateAll(); g.paused = true;
  g.renderer.camera.centerOnTile(f.x, f.y + 8); g.renderer.camera.setZoom(3);
});
await page.waitForTimeout(500);
console.log('agents:', await page.evaluate(() => window.__game.state.agents.filter((a) => a.kind === 3 && (a.species === 'wyvern' || a.species === 'drake')).map((a) => `${a.species}@${a.x.toFixed(0)},${a.y.toFixed(0)} alt${a.alt} phase${a.phase} load${a.load}`)));
await page.screenshot({ path: 'shots/iter9_day.png' });
await page.evaluate(() => { const g = window.__game; g.state.tick = Math.floor(g.state.tick / 900) * 900 + 640; });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/iter9_night.png' });
await page.click('#btn-wyrms'); await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/iter9_wyrms.png' });
console.log('errors', errors);
await browser.close();
