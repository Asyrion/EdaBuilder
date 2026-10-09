// Iteration 91 (the Tripo Studio and Aseprite pipelines, DESIGN 4.122, docs/ART_PIPELINES.md), on the board
// (http://127.0.0.1:8771) started with fakes: TRIPO and ASEPRITE pointing at scripts that answer as the real tools do (the
// CLI's "Task created" line and its "no image URLs" bug, a poll that runs and then succeeds with four URLs on a local
// server; the Lua build and the export), DEVBOARD_TRIPO_POLL_MS=300. On the Quarry:
//  - Tripo Route 2: logged in, Generate 4, the contact sheet measured, Use this one → inspirations/tripo/b_quarry.png and
//    its islands drawn;
//  - Aseprite: Trace, Export, the 8× previews, Install refused before the review tick, then installed (pixel: true, the
//    importer run) and the sprite in the manifest.
// Leaves art and inspirations changed: revert with
//   git checkout art/sources.json public/art && git clean -fdq public/art && rm -rf inspirations/tripo art/tripo art/aseprite art/prompts
//   shots/iter91_{tripo,picked,trace,export,installed}.png
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [], out = {};
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
const shot = (k) => page.screenshot({ path: `shots/iter91_${k}.png`, fullPage: true });
const sources = () => JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites;

await page.goto('http://127.0.0.1:8771/');
await page.waitForSelector('[data-tab=buildings]');
await page.click('[data-tab=buildings]');
await page.fill('#q', 'quarry'); await page.waitForTimeout(400);
await page.click('[data-art^="b_quarry|"]');
await page.waitForSelector('#ap');

// Tripo Studio, Route 2
await page.selectOption('#ap', 'tripo');
await page.waitForSelector('#apipe .chip.ok:has-text("logged in")');
out.loggedIn = true;
await page.click('[data-tripo-go]');
await page.waitForSelector('#apipe .contact figure', { timeout: 30000 });
await page.waitForFunction(() => [...document.querySelectorAll('#apipe .contact .m')].length === 4 && [...document.querySelectorAll('#apipe .contact .m')].every((m) => /% white/.test(m.textContent)), null, { timeout: 15000 });
out.round = await page.$$eval('#apipe .contact .m', (ms) => ms.map((m) => m.textContent.trim()));
out.roundFiles = existsSync('art/tripo/b_quarry/round1/A_r1_1.png');
await shot('tripo');
await page.click('[data-tripo-use="b_quarry/round1/A_r1_1.png"]');
await page.waitForSelector('#asheet .box', { timeout: 30000 });
out.picked = existsSync('inspirations/tripo/b_quarry.png');
await shot('picked');

// Aseprite
await page.selectOption('#ap', 'aseprite');
await page.waitForSelector('[data-ase="trace"]');
await page.click('[data-ase="trace"]');
await page.waitForSelector('img[src*="b_quarry.trace_8x.png"]', { timeout: 60000 });
out.traced = existsSync('art/aseprite/b_quarry.aseprite');
await shot('trace');
await page.waitForFunction(() => !document.querySelector('[data-ase="export"]')?.disabled, null, { timeout: 15000 });
await page.click('[data-ase="export"]');
await page.waitForSelector('img[src*="export/b_quarry_8x.png"]', { timeout: 60000 });
out.exported = existsSync('art/aseprite/export/b_quarry.png');
await shot('export');
await page.waitForFunction(() => !document.querySelector('[data-ase="install"]')?.disabled, null, { timeout: 15000 });
await page.click('[data-ase="install"]');
await page.waitForTimeout(800);
out.installRefusedBeforeReview = !sources().some((e) => e.name === 'b_quarry' && e.pixel);
await page.check('#areviewed');
await page.click('[data-ase="install"]');
await page.waitForFunction(() => /done|failed/.test(document.querySelector('#apipe pre.log')?.previousElementSibling?.textContent ?? '') && /install/.test(document.querySelector('#apipe pre.log')?.previousElementSibling?.textContent ?? ''), null, { timeout: 300000 });
out.installState = await page.textContent('#apipe pre.log + *, #apipe .small:has(+ pre.log)').catch(() => '');
const entry = sources().find((e) => e.name === 'b_quarry' && e.pixel);
out.entry = entry ? { src: entry.src, w: entry.w, h: entry.h, anchor: entry.anchor } : null;
out.inManifest = !!JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites.b_quarry;
await page.waitForTimeout(2500);
await shot('installed');
out.calls = readFileSync('/tmp/claude-0/eda/fakes91/args', 'utf8').split('\n').filter(Boolean).map((l) => l.slice(0, 90));
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
