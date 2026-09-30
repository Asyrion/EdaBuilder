import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const bot = new W.Bot(g.state); for (let d = 0; d < 30; d++) { for (let i = 0; i < 900; i++) W.tick(g.state); bot.step(); } W.recomputeAll(g.state); g.renderer.invalidateAll(); g.paused = true; g.state.milestone = Math.max(2, g.state.milestone); g.state.treasury = 20000; });
const f = await page.evaluate(() => window.__game.state.founding);
const tileToScreen = async (x, y) => page.evaluate(([x, y]) => { const cam = window.__game.renderer.camera; const wx = (x - y) * 16, wy = (x + y) * 8 + 8; return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom]; }, [x, y]);
const center = async (x, y) => page.evaluate(([x, y]) => { window.__game.renderer.camera.centerOnTile(x, y); window.__game.renderer.camera.setZoom(2); }, [x, y]);
// draw a wall through the Services tab
await page.click('#toolbar .tabs button:has-text("Services")');
await page.click('#toolbar .items button:has-text("Warding Wall")');
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const f = g.state.founding; for (let y = f.y + 30; y <= f.y + 34; y++) for (let x = f.x - 10; x <= f.x + 10; x++) { const i = y * 128 + x; if (i >= 0 && i < g.state.gloam.length && g.state.terrain[i] !== 0 && g.state.terrain[i] !== 1) g.state.gloam[i] = 1; } W.recomputeAll(g.state); g.renderer.invalidateAll(); });
await center(f.x, f.y + 26);
let [ax, ay] = await tileToScreen(f.x - 12, f.y + 26);
let [bx, by] = await tileToScreen(f.x + 12, f.y + 26);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
console.log('wall tiles:', await page.evaluate(() => window.__game.state.wall.reduce((a, b) => a + (b ? 1 : 0), 0)), 'diag:', await page.evaluate(() => { const g = window.__game, A = window.__wardlight.actions; const f = g.state.founding; const tiles = A.roadPath(f.x - 12, f.y + 26, f.x + 12, f.y + 26, false); const pv = A.previewWall(g.state, tiles); const t = tiles.map((i) => [g.state.terrain[i], g.state.bIndex[i] >= 0 ? 'B' : '', g.state.road[i] ? 'R' : '', g.state.gloam[i] ? 'G' : ''].join('')); return JSON.stringify({ cost: pv.cost, valid: pv.valid.filter(Boolean).length, tool: g.tools.tool, milestone: g.state.milestone, treasury: g.state.treasury, t: t.slice(0, 12) }); }));
// force a Hush night with hounds near the wall
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; if (g.state.pendingEvent) window.__wardlight.resolveEvent(g.state, 0); g.state.day = 95; g.state.tick = 95 * 900 + 405; for (let i = 0; i < 400; i++) W.tick(g.state); const h = g.state.agents.find((a) => a.species === 'hound'); if (h) g.renderer.camera.centerOnTile(Math.floor(h.x), Math.floor(h.y)); else g.renderer.camera.centerOnTile(g.state.founding.x, g.state.founding.y + 12); g.renderer.camera.setZoom(3); });
await page.waitForTimeout(500);
console.log('hounds:', await page.evaluate(() => window.__game.state.agents.filter((a) => a.species === 'hound').length), 'creatures:', await page.evaluate(() => window.__game.state.agents.filter((a) => a.kind === 3).length), 'diag:', await page.evaluate(() => { const g = window.__game; const s = g.state; const near = s.buildings.filter((b) => b && b.state === 'ok' && s.gloamDist[b.y * 128 + b.x] <= 14).length; return JSON.stringify({ near, day: s.day, tick: s.tick, pending: !!s.pendingEvent, gloam: s.stats.gloamTiles, houndsTotal: s.stats.houndsTotal, pop: s.population }); }));
await page.screenshot({ path: 'shots/wall_night.png' });
console.log('errors', errors);
await browser.close();
