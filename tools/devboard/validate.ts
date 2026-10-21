/* The dev board's data check (iteration 87, DESIGN 4.118): validateContent (src/sim/contentCheck.ts) over the content files,
   and the art rule of tests/sprites.test.ts (every non-zone building has a b_<key> sprite drawn in code). Prints one line,
   `VALIDATE_JSON {"ok": ..., "checks": [{name, errors}]}`. The board runs it after every save, in a fresh process so the
   files are read anew. Iteration 89 adds the text of edicts, events, quests and guilds (textCheck.ts: every text the code
   reads is there, and every text is read) and the prompts in art/prompts/ (each names a sprite or building that exists).
   Run by hand: npx tsx tools/devboard/validate.ts */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAllText } from './textCheck';
import { generateSprites } from '../../src/render/sprites';
import { BUILDINGS } from '../../src/sim/catalog';
import { validateContent } from '../../src/sim/contentCheck';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** Each prompt file parses, names its own sprite, and the sprite is drawn, imported or a building's (b_<key>, _vN, _sN). */
function checkPrompts(sprites: Set<string>): string[] {
  const dir = join(ROOT, 'art/prompts'), keys = new Set(BUILDINGS.map((b) => b.key)), errs: string[] = [];
  if (!existsSync(dir)) return errs;
  let manifest: Record<string, unknown> = {};
  try { manifest = JSON.parse(readFileSync(join(ROOT, 'public/art/sprites.json'), 'utf8')).sprites; } catch { /* none */ }
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const name = f.replace(/\.json$/, '');
    let d: { sprite?: string; building?: string };
    try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { errs.push(`art/prompts/${f}: ${(e as Error).message}`); continue; }
    if (d.sprite !== name) errs.push(`art/prompts/${f}: names sprite "${d.sprite}", not ${name}`);
    const m = /^b_(.+?)(?:_[vs]\d+)?$/.exec(name);
    if (!sprites.has(name) && !(name in manifest) && !(m && keys.has(m[1])) && !(d.building && keys.has(d.building)))
      errs.push(`art/prompts/${f}: no sprite or building ${name}`);
    if (d.building && !keys.has(d.building)) errs.push(`art/prompts/${f}: no building ${d.building}`);
  }
  return errs;
}

const checks: [string, () => string[]][] = [
  ['text (edicts, quests)', () => checkAllText(ROOT)],
  ['art sources (art/sources.json)', () => {
    const live = (JSON.parse(readFileSync(join(ROOT, 'art/sources.json'), 'utf8')).sprites as { name: string; off?: boolean }[]).filter((e) => !e.off).map((e) => e.name);
    return [...new Set(live.filter((n, i) => live.indexOf(n) !== i))].map((n) => `art/sources.json: ${n} has two live entries (switch the old one off)`);
  }],
  ['prompts (art/prompts)', () => checkPrompts(new Set(generateSprites().map((d) => d.name)))],
  ['content', () => validateContent()],
  ['art (tests/sprites.test.ts)', () => {
    const names = new Set(generateSprites().map((d) => d.name));
    return BUILDINGS.filter((d) => d.category !== 'zone' && !names.has(`b_${d.key}`) && !names.has(`b_${d.key}_0`))
      .map((d) => `building ${d.key}: needs art: no b_${d.key} sprite drawn in code (src/render/sprites.ts), so the game would show nothing`);
  }],
];
const out = checks.map(([name, run]) => {
  try { return { name, errors: run() }; } catch (e) { return { name, errors: [`the check itself failed: ${e instanceof Error ? e.message : String(e)}`] }; }
});
console.log('VALIDATE_JSON ' + JSON.stringify({ ok: out.every((c) => !c.errors.length), checks: out }));
