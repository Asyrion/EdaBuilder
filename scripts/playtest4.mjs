import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { window.__game.newGame(42, 'Thornwick'); document.getElementById('help').classList.add('hidden'); document.getElementById('title').classList.add('hidden'); });
await page.evaluate(() => { const g = window.__game, W = window.__wardlight; const bot = new W.Bot(g.state); for (let d = 0; d < 20; d++) { for (let i = 0; i < 900; i++) W.tick(g.state); bot.step(); } W.recomputeAll(g.state); g.renderer.invalidateAll(); g.paused = true; g.state.milestone = 6; g.state.treasury = 60000; });
const f = await page.evaluate(() => window.__game.state.founding);
const tileToScreen = async (x, y) => page.evaluate(([x, y]) => { const cam = window.__game.renderer.camera; cam.centerOnTile(x, y); const wx = (x - y) * 16, wy = (x + y) * 8 + 8; return [(wx - cam.left) * cam.zoom, (wy - cam.top) * cam.zoom]; }, [x, y]);
// click the founding node
await page.keyboard.press('x');
let [sx, sy] = await tileToScreen(f.x, f.y);
await page.mouse.click(sx, sy);
await page.waitForTimeout(300);
console.log('node panel:', (await page.textContent('#info h2')));
await page.click('#n-deepen');
await page.waitForTimeout(300);
console.log('depth after deepen:', await page.evaluate(() => window.__game.state.nodes[0].depth), 'supply', await page.evaluate(() => window.__game.state.manaSupply));
await page.screenshot({ path: 'shots/node_panel.png' });
// undo a road
const roadsBefore = await page.evaluate(() => window.__game.state.road.reduce((a, b) => a + (b ? 1 : 0), 0));
await page.click('#toolbar .tabs button:has-text("Roads")');
await page.click('#toolbar .items button:has-text("Dirt Track")');
[sx, sy] = await tileToScreen(f.x - 20, f.y + 20);
const [ex, ey] = await tileToScreen(f.x - 12, f.y + 20);
await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(ex, ey, { steps: 5 }); await page.mouse.up();
const roadsAfter = await page.evaluate(() => window.__game.state.road.reduce((a, b) => a + (b ? 1 : 0), 0));
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
const roadsUndone = await page.evaluate(() => window.__game.state.road.reduce((a, b) => a + (b ? 1 : 0), 0));
console.log('roads before/after/undone:', roadsBefore, roadsAfter, roadsUndone);
// rename a district via the edicts modal
await page.evaluate(() => { const g = window.__game; window.__wardlight.actions.paintDistrict(g.state, 5, g.state.founding.x - 6, g.state.founding.y - 2, g.state.founding.x + 6, g.state.founding.y + 6); });
await page.click('#btn-edicts'); await page.waitForTimeout(200);
await page.selectOption('#e-scope', '5'); await page.waitForTimeout(200);
await page.fill('#e-rename', 'Old Kiln'); await page.press('#e-rename', 'Enter'); await page.waitForTimeout(200);
console.log('renamed:', await page.evaluate(() => window.__game.state.districtNames[5]), '| stats:', (await page.textContent('#edicts .dstats')).replace(/\s+/g, ' ').slice(0, 140));
await page.screenshot({ path: 'shots/district_stats.png' });
await page.click('#e-close');
// place a depot through the toolbar
await page.click('#toolbar .tabs button:has-text("Leisure")');
await page.click('#toolbar .items button:has-text("Trade Depot")');
console.log('depot tool hint:', (await page.textContent('#toolbar .hint')).slice(0, 80));
console.log('errors', errors);
await browser.close();
