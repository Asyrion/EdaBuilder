/* The text of edicts and quests (iteration 89; the tales and the guilds are parked, DESIGN 4.120): src/data/content/text/*.json, read by the code
   through EDICT_TEXT.<id>.<field> (and EVENT_TEXT, QUEST_TEXT, GUILD_TEXT). This check reads both sides as files, so it
   still reports when an entry the code needs is gone (the import itself would only throw): every path the code reads must
   be a non-empty string in the JSON, and every JSON entry and field must be read by the code. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TEXT_KINDS: Record<string, { json: string; code: string; v: string }> = {
  edicts: { json: 'src/data/content/text/edicts.json', code: 'src/sim/edicts.ts', v: 'EDICT_TEXT' },
  quests: { json: 'src/data/content/text/quests.json', code: 'src/data/quests.ts', v: 'QUEST_TEXT' },
};

/** The paths a source reads from its text variable: `id.field` or `id.choices.N.field`. */
export function textRefs(src: string, v: string): string[] {
  const re = new RegExp(`\\b${v}(?:\\.([A-Za-z_$][\\w$]*)|\\[("[^"]+")\\])(?:\\.choices\\[(\\d+)\\])?\\.(\\w+)`, 'g');
  return [...src.matchAll(re)].map((m) => [m[1] ?? JSON.parse(m[2]), ...(m[3] ? ['choices', m[3]] : []), m[4]].join('.'));
}

/** The string leaves of a text file, as `id.field` and `id.choices.N.field`. */
function leaves(json: unknown, at: string[] = []): [string, unknown][] {
  if (json && typeof json === 'object') return Object.entries(json).flatMap(([k, v]) => leaves(v, [...at, k]));
  return [[at.join('.'), json]];
}

export function checkText(kind: string, json: unknown, src: string): string[] {
  const k = TEXT_KINDS[kind], errs: string[] = [];
  const have = new Map(leaves(json)), need = new Set(textRefs(src, k.v));
  for (const p of need) {
    const v = have.get(p);
    if (v === undefined) errs.push(`${kind} ${p}: ${k.code} reads it, but ${k.json} has no such text (the game would not load)`);
    else if (typeof v !== 'string' || !v.trim()) errs.push(`${kind} ${p}: must be text, not empty`);
  }
  for (const [p] of have) if (!need.has(p)) errs.push(`${kind} ${p}: nothing in ${k.code} reads it (a new entry needs its logic in code first)`);
  return errs;
}

export function checkAllText(root: string): string[] {
  return Object.entries(TEXT_KINDS).flatMap(([kind, k]) => {
    let json: unknown;
    try { json = JSON.parse(readFileSync(join(root, k.json), 'utf8')); } catch (e) { return [`${k.json}: ${(e as Error).message}`]; }
    return checkText(kind, json, readFileSync(join(root, k.code), 'utf8'));
  });
}
