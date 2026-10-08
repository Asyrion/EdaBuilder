// Iteration 88 (the dev board, part 2, DESIGN 4.119): the board's project side in a browser, against a running board
// (`npm run devboard`) started with fake `gh` and `claude` first on PATH (DEVBOARD_TERMINAL pointing at a fake terminal),
// so nothing reaches GitHub and no session opens. FAKES=<dir> names that folder; its `log` records every call.
//   shots/iter88_{next,design,github,balance,send,composer,created}.png
//   node scripts/playtest88.mjs   (board on http://127.0.0.1:8771)
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const FAKES = process.env.FAKES ?? '/tmp/claude-0/eda/fakes', LOG = `${FAKES}/log`;
const log = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (k) => page.screenshot({ path: `shots/iter88_${k}.png`, fullPage: true });
const out = {};

await page.goto('http://127.0.0.1:8771/');
await page.waitForSelector('[data-tab=next]');
await page.click('[data-tab=next]');
await page.waitForSelector('[data-send-next="1"]');
out.openItems = await page.locator('[data-send-next]').count();
out.doneIterations = await page.locator('details.done').count();
await shot('next');

// a DESIGN section from a done iteration
await page.locator('details.done').first().locator('[data-design]').first().click();
await page.waitForSelector('pre.design');
out.design = (await page.textContent('pre.design')).slice(0, 60);
await shot('design');
await page.click('[data-close]');

// Send the first item: the repo's own first message, to Claude Code on this PC (the fake terminal)
await page.click('[data-send-next="1"]');
out.firstMessage = (await page.inputValue('#sx')).split('\n')[0];
await page.click('[data-send-to="pc"]');
await page.waitForSelector('#smsg .banner');
out.pcResult = await page.textContent('#smsg');
await page.click('[data-send-to="issue"]');
await page.waitForFunction(() => /issue #/.test(document.querySelector('#smsg')?.textContent ?? ''));
out.issueResult = await page.textContent('#smsg');
await shot('send');
await page.click('[data-close]');

// GitHub tab (the fake's fixture)
await page.click('[data-tab=github]');
await page.waitForSelector('[data-send-issue]');
out.issues = await page.locator('[data-send-issue]').count();
await shot('github');

// Balance tab
await page.click('[data-tab=balance]');
await page.waitForSelector('svg.chart');
out.balanceFiles = await page.locator('svg.chart').count();
out.thisTree = await page.locator('.chip.ok', { hasText: 'this tree' }).count();
await shot('balance');

// a content card's Send, then the composer: write the task, create the entry, then delete it
await page.click('[data-tab=buildings]');
await page.click('[data-send-entry="buildings|0|well"]');
out.entryTask = (await page.inputValue('#sx')).includes('src/data/content/buildings.json');
await page.click('[data-close]');
await page.click('[data-compose]');
await page.selectOption('#ck', 'building');
await page.fill('#cn', 'Lantern Market'); await page.fill('#cy', 'lanternmarket');
await page.fill('#ci', 'A night market under spire light: trade after dark.');
await page.locator('#modal .checks input[value=tallowkin]').check();
await shot('composer');
await page.click('[data-compose-create]');
await page.waitForSelector('#sx');
out.composedTask = (await page.inputValue('#sx')).includes('already exists in src/data/content/buildings.json');
await page.click('[data-close]');
await page.fill('#q', 'lanternmarket'); await page.waitForTimeout(4000);
out.needsArt = await page.locator('.card', { hasText: 'Lantern Market' }).locator('.chip.bad', { hasText: 'needs art' }).count();
await shot('created');
page.on('dialog', (d) => d.accept());
await page.click('[data-edit="0|lanternmarket"]');
await page.click('[data-delete]');
await page.waitForTimeout(3000);
out.deleted = !readFileSync('src/data/content/buildings.json', 'utf8').includes('lanternmarket');

const L = log();
out.terminalRan = /term .*claude Read CLAUDE\.md and docs\/HANDOFF\.md/.test(L);
out.issueFiled = /"labels":\["dev-board"\]/.test(L);
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
