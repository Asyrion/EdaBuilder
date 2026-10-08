/* The dev board's data check (iteration 87, DESIGN 4.118): validateContent (src/sim/contentCheck.ts) over the content files,
   and the art rule of tests/sprites.test.ts (every non-zone building has a b_<key> sprite drawn in code). Prints one line,
   `VALIDATE_JSON {"ok": ..., "checks": [{name, errors}]}`. The board runs it after every save, in a fresh process so the
   files are read anew. Run by hand: npx tsx tools/devboard/validate.ts */
import { generateSprites } from '../../src/render/sprites';
import { BUILDINGS } from '../../src/sim/catalog';
import { validateContent } from '../../src/sim/contentCheck';

const checks: [string, () => string[]][] = [
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
