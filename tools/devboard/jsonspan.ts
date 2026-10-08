/* Lossless JSON editing for the dev board: a parser that remembers where every value sits in the text, and a patcher
   that rewrites only the parts of a value that changed. The content files are laid out by hand (one entry a block, short
   objects on one line, numbers as written), so a save must leave every untouched byte as it was: an unchanged `1.0`
   stays `1.0`, an unchanged member keeps its line, a new member follows its siblings' layout. */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Member { key: string; keyStart: number; node: Node }
export interface Node {
  kind: 'obj' | 'arr' | 'str' | 'num' | 'bool' | 'null';
  start: number; end: number; value: Json;
  members?: Member[]; items?: Node[];
}

export function parse(text: string): Node {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (what: string): never => {
    const line = text.slice(0, i).split('\n').length;
    throw new Error(`JSON: ${what} at line ${line}`);
  };
  const str = (): string => {
    const s = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) fail('unterminated string');
    i++;
    return JSON.parse(text.slice(s, i)) as string;
  };
  const value = (): Node => {
    ws();
    const start = i, c = text[i];
    if (c === '{') {
      i++;
      const members: Member[] = [], out: { [k: string]: Json } = {};
      ws();
      if (text[i] === '}') { i++; return { kind: 'obj', start, end: i, value: out, members }; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('expected a key');
        const keyStart = i, key = str();
        ws();
        if (text[i] !== ':') fail('expected ":"');
        i++;
        const node = value();
        members.push({ key, keyStart, node });
        out[key] = node.value;
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; break; }
        fail('expected "," or "}"');
      }
      return { kind: 'obj', start, end: i, value: out, members };
    }
    if (c === '[') {
      i++;
      const items: Node[] = [];
      ws();
      if (text[i] === ']') { i++; return { kind: 'arr', start, end: i, value: [], items }; }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; break; }
        fail('expected "," or "]"');
      }
      return { kind: 'arr', start, end: i, value: items.map(n => n.value), items };
    }
    if (c === '"') { const v = str(); return { kind: 'str', start, end: i, value: v }; }
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) fail('unexpected character');
    i += m![0].length;
    const raw = m![0];
    if (raw === 'true' || raw === 'false') return { kind: 'bool', start, end: i, value: raw === 'true' };
    if (raw === 'null') return { kind: 'null', start, end: i, value: null };
    return { kind: 'num', start, end: i, value: Number(raw) };
  };
  const root = value();
  ws();
  if (i < text.length) fail('trailing text');
  return root;
}

export function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as Json[]).length && a.every((x, k) => same(x, (b as Json[])[k]));
  const ka = Object.keys(a), kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every(k => k in (b as object) && same(a[k], (b as Record<string, Json>)[k]));
}

/** The file's own spacing inside one-line objects and arrays: `{ "a": 1 }` or `{"a": 1}`. */
export interface Style { pad: boolean }
export function styleOf(text: string): Style {
  const padded = (text.match(/\{ "/g) ?? []).length, tight = (text.match(/\{"/g) ?? []).length;
  return { pad: padded >= tight };
}

/** One line, in the file's style. */
export function compact(v: Json, st: Style): string {
  if (Array.isArray(v)) return `[${v.map(x => compact(x, st)).join(', ')}]`;
  if (v && typeof v === 'object') {
    const body = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x, st)}`).join(', ');
    return body ? (st.pad ? `{ ${body} }` : `{${body}}`) : '{}';
  }
  return JSON.stringify(v);
}

const lineStart = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;
const indentAt = (text: string, at: number) => {
  const s = lineStart(text, at);
  return /^[ \t]*/.exec(text.slice(s, at))![0];
};
const multiline = (text: string, n: Node) => text.slice(n.start, n.end).includes('\n');

/** The text `n` becomes when its value is `v`: untouched parts copied, changed parts rewritten in the file's layout. */
export function patch(text: string, n: Node, v: Json, st: Style): string {
  if (same(n.value, v)) return text.slice(n.start, n.end);
  const isObj = (x: Json): x is { [k: string]: Json } => !!x && typeof x === 'object' && !Array.isArray(x);
  if (n.kind === 'obj' && isObj(v) && n.members!.some(m => m.key in v)) return patchObj(text, n, v, st);
  if (n.kind === 'arr' && Array.isArray(v) && v.length === n.items!.length && v.length > 0) {
    let out = '', at = n.start;
    n.items!.forEach((it, k) => { out += text.slice(at, it.start) + patch(text, it, v[k], st); at = it.end; });
    return out + text.slice(at, n.end);
  }
  if (n.kind === 'arr' && Array.isArray(v) && multiline(text, n) && n.items!.length > 0) {
    // a list laid out one item a line: keep that, each item on its own line at the first item's indent
    const ind = indentAt(text, n.items![0].start), close = indentAt(text, n.end - 1);
    if (!v.length) return '[]';
    const items = v.map((x, k) => k < n.items!.length ? patch(text, n.items![k], x, st) : compact(x, st));
    return `[\n${items.map(s => ind + s).join(',\n')}\n${close}]`;
  }
  return compact(v, st);
}

function patchObj(text: string, n: Node, v: { [k: string]: Json }, st: Style): string {
  const ms = n.members!, keep = ms.filter(m => m.key in v);
  // the text between two kept members is the separator of the first of them (`,\n    ` or `, `)
  const seps: string[] = [];
  for (let k = 0; k < ms.length - 1; k++) seps.push(text.slice(ms[k].node.end, ms[k + 1].keyStart));
  const defaultSep = seps.length ? seps[seps.length - 1] : (multiline(text, n) ? ',\n' + indentAt(text, ms[0].keyStart) : ', ');
  let out = text.slice(n.start, ms[0].keyStart);
  keep.forEach((m, k) => {
    out += text.slice(m.keyStart, m.node.start) + patch(text, m.node, v[m.key], st);
    if (k < keep.length - 1) {
      const idx = ms.indexOf(m);
      out += idx < seps.length ? seps[idx] : defaultSep;
    }
  });
  const added = Object.keys(v).filter(k => !ms.some(m => m.key === k));
  for (const k of added) out += defaultSep + `${JSON.stringify(k)}: ${compact(v[k], st)}`;
  const last = ms[ms.length - 1];
  return out + text.slice(last.node.end, n.end);
}

/** Where a collection sits in its file: the node at `path` (keys from the root). */
export function nodeAt(root: Node, path: readonly string[]): Node {
  let n = root;
  for (const k of path) {
    const m = n.members?.find(x => x.key === k);
    if (!m) throw new Error(`no "${path.join('.')}" in the file`);
    n = m.node;
  }
  return n;
}

/** The separator between a collection's last two entries, used to add one more after them. */
export function entrySep(text: string, starts: number[], ends: number[], col: Node): string {
  if (starts.length >= 2) return text.slice(ends[ends.length - 2], starts[starts.length - 1]);
  return multiline(text, col) || !starts.length ? ',\n' + (starts.length ? indentAt(text, starts[0]) : '  ') : ', ';
}
