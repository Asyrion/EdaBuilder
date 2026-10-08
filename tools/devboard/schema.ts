/* What the dev board's forms offer beyond the values themselves: the string unions declared in src/ (`export type Pool =
   'treasure' | 'boss' | ...`), read from the game's own source so a new value in the code shows up in the forms, and the
   field hints of hints.json that point fields at them. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every `type X = 'a' | 'b' | Y` in src/ whose members are string literals or other such unions. */
export function unions(root: string): Record<string, string[]> {
  const raw: Record<string, string[][]> = {};
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(d => d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []);
  for (const f of files(join(root, 'src'))) {
    // comments out first (they hold semicolons); a `//` inside a string only cuts that line, never a type
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const m of text.matchAll(/^export type (\w+) =([^;]*);/gm)) {
      const body = m[2];
      const parts = body.split('|').map(s => s.trim()).filter(Boolean);
      if (!parts.length || !parts.every(p => /^'[^']*'$/.test(p) || /^[A-Z]\w*$/.test(p))) continue;
      (raw[m[1]] ??= []).push(parts);
    }
  }
  const out: Record<string, string[]> = {};
  const resolve = (name: string, seen: Set<string>): string[] | null => {
    if (out[name]) return out[name];
    const defs = raw[name];
    if (!defs || seen.has(name)) return null;
    seen.add(name);
    for (const parts of defs) {
      const vals: string[] = [];
      let ok = true;
      for (const p of parts) {
        if (p.startsWith("'")) vals.push(p.slice(1, -1));
        else { const r = resolve(p, seen); if (r) vals.push(...r); else ok = false; }
      }
      if (ok) return (out[name] = [...new Set(vals)]);
    }
    return null;
  };
  for (const name of Object.keys(raw)) resolve(name, new Set());
  return out;
}

export function hints(root: string): Record<string, Record<string, Record<string, unknown>>> {
  const h = JSON.parse(readFileSync(join(root, 'tools/devboard/hints.json'), 'utf8'));
  delete h._comment;
  return h;
}
