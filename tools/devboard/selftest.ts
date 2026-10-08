/* The dev board's self-test (no network, no browser, nothing written to the repository: edits run on a copy in the temp
   folder). Every entry of every kind loads; a one-number edit changes exactly one line and putting the value back restores
   the file byte for byte; a duplicate and its delete leave the file as it was; a used id can't be deleted; a stale hash
   is refused; undo restores; the HTTP guards refuse foreign hosts, writes without the board's header and paths out of
   data/. Prints DEV BOARD SELFTEST OK or the failures. Run: npm run devboard:selftest (iteration 87, DESIGN 4.118). */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BadRequest, Conflict, Content, hashOf } from './content';
import { CODE_KINDS, KINDS } from './kinds';
import type { Json } from './jsonspan';
import { unions } from './schema';
import { codeEntries, server } from './server';

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
  server.close();
  if (fails.length) { console.log('DEV BOARD SELFTEST FAIL\n' + fails.slice(0, 40).join('\n')); process.exitCode = 1; }
  else console.log(`DEV BOARD SELFTEST OK (${edits} entries edited and restored, ${Object.keys(KINDS).length} kinds)`);
});
