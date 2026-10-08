/* The dev board's self-test (no network, no browser, nothing written to the repository: edits run on a copy in the temp
   folder). Every entry of every kind loads; a one-number edit changes exactly one line and putting the value back restores
   the file byte for byte; a duplicate and its delete leave the file as it was; a used id can't be deleted; a stale hash
   is refused; undo restores; the HTTP guards refuse foreign hosts, writes without the board's header and paths out of
   data/. Prints DEV BOARD SELFTEST OK or the failures. Run: npm run devboard:selftest (iteration 87, DESIGN 4.118). */
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BadRequest, Conflict, Content, hashOf } from './content';
import { CODE_KINDS, KINDS } from './kinds';
import type { Json } from './jsonspan';
import { unions } from './schema';
import { codeEntries, server } from './server';
import { toClaude, toIssue } from './session';
import { balance, designIndex, designSection, nextSteps } from './tracker';

const REPO = resolve(import.meta.dirname, '../..');
const fails: string[] = [];
const check = (ok: unknown, what: string) => { if (!ok) fails.push(what); };
const throws = (fn: () => unknown, cls: new (...a: never[]) => Error, what: string) => {
  try { fn(); fails.push(`${what}: no error`); } catch (e) { check(e instanceof cls, `${what}: ${(e as Error).message}`); }
};

const tmp = mkdtempSync(join(tmpdir(), 'devboard-selftest-'));
cpSync(join(REPO, 'src'), join(tmp, 'src'), { recursive: true });   // src/data/content and the code the reference scan reads
const c = new Content(tmp);

/** The path to the first number in a value, if any. */
function firstNumber(v: Json, path: (string | number)[] = []): (string | number)[] | null {
  if (typeof v === 'number') return path;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const p = firstNumber(v[i], [...path, i]); if (p) return p; } return null; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { const p = firstNumber(x, [...path, k]); if (p) return p; } }
  return null;
}
function bump(v: Json, path: (string | number)[]): Json {
  const out = JSON.parse(JSON.stringify(v));
  if (!path.length) return (v as number) + 1;
  let o = out;
  for (const p of path.slice(0, -1)) o = o[p];
  o[path[path.length - 1]] += 1;
  return out;
}

let edits = 0;
for (const name of Object.keys(KINDS)) {
  const { entries, errors } = c.entries(name);
  check(!errors.length, `${name} loads: ${errors.join('; ')}`);
  check(entries.length > 0, `${name} has entries`);
  for (const e of entries) {
    const file = KINDS[name].sources[e.src].file, before = readFileSync(join(tmp, file), 'utf8');
    const p = firstNumber(e.data);
    if (!p) continue;
    const changed = bump(e.data, p);
    c.save(name, e.src, e.key, changed, e.hash);
    const mid = readFileSync(join(tmp, file), 'utf8');
    const a = before.split('\n'), b = mid.split('\n');
    check(a.length === b.length && a.filter((l, i) => l !== b[i]).length === 1, `${name} ${e.key}: a one-number edit changes one line`);
    c.save(name, e.src, e.key, e.data, hashOf(changed));
    check(readFileSync(join(tmp, file), 'utf8') === before, `${name} ${e.key}: putting the value back restores the file`);
    edits++;
  }
}

// duplicate and delete
for (const [name, k] of Object.entries(KINDS)) {
  const e = c.entries(name).entries[0], file = k.sources[e.src].file, before = readFileSync(join(tmp, file), 'utf8');
  const data = JSON.parse(JSON.stringify(e.data));
  const id = 'selftestCopy';
  if (k.idKey) data[k.idKey] = id;
  const r = c.create(name, e.src, data, k.shape === 'map' ? id : undefined, e.key);
  const made = c.entries(name).entries.find(x => x.key === r.key && x.src === e.src)!;
  check(made && JSON.stringify(made.data) === JSON.stringify(data), `${name}: a duplicate holds what was sent`);
  JSON.parse(readFileSync(join(tmp, file), 'utf8'));
  c.remove(name, e.src, r.key, made.hash);
  check(readFileSync(join(tmp, file), 'utf8') === before, `${name}: duplicate then delete leaves the file as it was`);
}

// guards
throws(() => c.remove('buildings', 0, 'well', c.entries('buildings').entries.find(e => e.key === 'well')!.hash), Conflict, 'a building a milestone unlocks can not be deleted');
throws(() => c.save('buildings', 0, 'well', {}, 'stale'), Conflict, 'a stale hash is refused');
throws(() => c.abs('../package.json'), BadRequest, 'a path out of data/ is refused');
throws(() => c.create('buildings', 0, { key: 'well' }), BadRequest, 'an id that exists is refused');
throws(() => c.create('buildings', 0, { key: 'bad id!' }), BadRequest, 'a malformed id is refused');
{
  const file = join(tmp, 'src/data/content/roads.json'), e = c.entries('roads').entries[0], before = readFileSync(file, 'utf8');
  c.save('roads', 0, e.key, { ...(e.data as object), cost: 999 }, e.hash);
  const u = c.undoList()[0];
  c.undo(u.i);
  check(readFileSync(file, 'utf8') === before, 'undo restores the file');
}
check((unions(REPO).BuildingCategory ?? []).includes('wonder') && (unions(REPO).FactionId ?? []).includes('grimmen'), 'the string unions are read from src/');
for (const name of Object.keys(CODE_KINDS)) check(codeEntries(name).length > 0, `the ${name} in code are found`);
rmSync(tmp, { recursive: true, force: true });

// the project side (iteration 88): the parsers over the real docs and cache, and Send to Claude against fakes
{
  const ns = nextSteps(readFileSync(join(REPO, 'docs/NEXT_STEPS.md'), 'utf8'));
  check(ns.open.length >= 3 && ns.open.every((o, i) => o.n === i + 1 && o.title), 'NEXT_STEPS: the open list is read in order, each with a title');
  check(ns.done.length >= 80 && ns.done[0].n > ns.done[ns.done.length - 1].n && ns.done.every((d) => d.bullets.length), 'NEXT_STEPS: every "Done in iteration" is read, newest first, with its bullets');
  const fixture = '## Prioritized ideas for the next iteration\n\n1. **First** one\n   more\n2. **Second §4.7** two\n\n## Done in iteration 3 (x)\n\n- a\n  b\n';
  const f = nextSteps(fixture);
  check(f.open.length === 2 && f.open[0].text === 'one more' && f.open[1].design[0] === '§4.7' && f.done[0].bullets[0] === 'a b', 'NEXT_STEPS: the fixture parses');
  const di = designIndex(readFileSync(join(REPO, 'docs/DESIGN.md'), 'utf8'));
  const nums = di.map((h) => Number(h.id.split('.')[1])), headings = (readFileSync(join(REPO, 'docs/DESIGN.md'), 'utf8').match(/^### 4\.\d+/gm) ?? []).length;
  check(nums.length === headings && new Set(nums).size === nums.length && nums.includes(1) && Math.max(...nums) >= 118, 'DESIGN: every 4.NN section is indexed once (in the file\'s own order)');
  check((designSection(readFileSync(join(REPO, 'docs/DESIGN.md'), 'utf8'), '4.118') ?? '').includes('content as data'), 'DESIGN: a section is read whole');
  const b = balance(REPO);
  check(b.files.length > 0 && b.files.every((x) => Object.keys(x.stats).length === 4), 'balance: every cache file read, four peoples each');

  const bin = mkdtempSync(join(tmpdir(), 'devboard-fakes-')), log = join(bin, 'log');
  const script = (name: string, body: string) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  script('gh', `echo "gh $*" >> ${log}; cat >> ${log}; case "$*" in *labels/dev-board*) echo '{}';; *issues*POST*) echo '{"number":999,"html_url":"https://example.invalid/issues/999"}';; *) echo '[]';; esac`);
  script('claude', `echo "claude $*" >> ${log}`);
  script('term', `echo "term $*" >> ${log}`);
  script('open', `echo "open $*" >> ${log}`);
  const env = { PATH: process.env.PATH, L: process.env.DEVBOARD_FAKE_LINK, O: process.env.DEVBOARD_FAKE_OPEN, T: process.env.DEVBOARD_TERMINAL };
  process.env.PATH = bin + ':' + process.env.PATH;
  process.env.DEVBOARD_TERMINAL = join(bin, 'term'); process.env.DEVBOARD_FAKE_OPEN = join(bin, 'open');
  const wait = () => { const t = Date.now() + 1500; while (Date.now() < t && !existsSync(log)) { /* the detached fake writes soon */ } };
  try {
    process.env.DEVBOARD_FAKE_LINK = '0';
    const r1 = toClaude(REPO, 'Plan the next item.', 'next');
    wait();
    check(r1.how === 'terminal' && !!r1.file && readFileSync(r1.file, 'utf8') === 'Plan the next item.', 'send: without the link, a terminal with the task (and its copy in a file)');
    process.env.DEVBOARD_FAKE_LINK = '1';
    const r2 = toClaude(REPO, 'x'.repeat(6000), 'long');
    check(r2.how === 'link' && !!r2.file, 'send: with the link, a long task goes to a file and the link points at it');
    const r3 = toIssue(REPO, 'A title', 'A task');
    check(r3.number === 999, 'send: a GitHub issue through gh');
    const t = Date.now() + 2000; while (Date.now() < t && !/open claude-cli/.test(existsSync(log) ? readFileSync(log, 'utf8') : '')) { /* wait for the fakes */ }
    const L = readFileSync(log, 'utf8');
    check(/term .*claude Plan the next item\./.test(L), 'send: the terminal runs claude with the task');
    check(/open claude-cli:\/\/open\?cwd=.*&q=EdaBuilder%20task%20from%20the%20dev%20board/.test(L), 'send: the link opens this checkout with the pointer');
    check(/"labels":\["dev-board"\]/.test(L), 'send: the issue carries the dev-board label');
    for (const f of [r1.file!, r2.file!]) rmSync(f, { force: true });
  } finally {
    process.env.PATH = env.PATH;
    for (const [k, v] of [['DEVBOARD_FAKE_LINK', env.L], ['DEVBOARD_FAKE_OPEN', env.O], ['DEVBOARD_TERMINAL', env.T]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    rmSync(bin, { recursive: true, force: true });
  }
}

// HTTP guards (the server on a free port; nothing here writes)
const call = (port: number, method: string, path: string, headers: Record<string, string>, body?: string) => new Promise<number>(ok => {
  const r = request({ host: '127.0.0.1', port, method, path, headers }, res => { res.resume(); ok(res.statusCode ?? 0); });
  r.on('error', () => ok(0));
  r.end(body);
});
server.listen(0, '127.0.0.1', async () => {
  const port = (server.address() as { port: number }).port, h = { Host: `127.0.0.1:${port}` };
  check(await call(port, 'GET', '/', h) === 200, 'the page is served');
  check(await call(port, 'GET', '/api/state', { Host: 'evil.example' }) === 403, 'a foreign Host is refused');
  check(await call(port, 'POST', '/api/delete', { ...h, 'Content-Type': 'application/json' }, '{}') === 403, 'a write without X-Dev-Board is refused');
  check(await call(port, 'POST', '/api/delete', { ...h, 'X-Dev-Board': '1', 'Content-Type': 'text/plain' }, '{}') === 403, 'a write that is not JSON is refused');
  check(await call(port, 'GET', '/../package.json', h) === 404, 'no files outside the page');
  for (const p of ['/api/send', '/api/github/issue', '/api/github/comment', '/api/github/milestone'])
    check(await call(port, 'POST', p, { ...h, 'Content-Type': 'application/json' }, '{}') === 403, `${p} without X-Dev-Board is refused`);
  check(await call(port, 'GET', '/api/tracker', h) === 200 && await call(port, 'GET', '/api/design/4.118', h) === 200, 'the tracker and a DESIGN section are served');
  server.close();
  if (fails.length) { console.log('DEV BOARD SELFTEST FAIL\n' + fails.slice(0, 40).join('\n')); process.exitCode = 1; }
  else console.log(`DEV BOARD SELFTEST OK (${edits} entries edited and restored, ${Object.keys(KINDS).length} kinds)`);
});
