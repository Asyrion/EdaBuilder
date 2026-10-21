// Iteration 89 (DESIGN 4.120): the text of the edicts and quests is data in src/data/content/text/, read by
// the code by id. The move changed no text (the dump before and after matched, string for string); these tests hold the
// two sides together, and the prompt studio's draft to the house art rules.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDICTS } from '../src/sim/edicts';
import { QUESTS } from '../src/data/quests';
import EDICT_TEXT from '../src/data/content/text/edicts.json';
import { checkAllText, checkText, textRefs } from '../tools/devboard/textCheck';
import { draftFor, houseRules, yardstick } from '../tools/devboard/prompts';

describe('the text as data', () => {
  it('every text the code reads is there, and every text is read', () => expect(checkAllText('.')).toEqual([]));

  it('the definitions carry their text, by id', () => {
    expect(EDICTS.every((e) => e.name && e.desc && e.flavor)).toBe(true);
    expect(QUESTS.every((q) => q.chapter && q.title && q.hint)).toBe(true);
    expect(EDICTS.find((e) => e.key === 'curfew')!.name).toBe(EDICT_TEXT.curfew.name);
  });

  it('the check reads choices and quoted ids, and reports a gap and a stray', () => {
    expect(textRefs('X_TEXT.a.title; X_TEXT["b-c"].choices[1].desc!', 'X_TEXT')).toEqual(['a.title', 'b-c.choices.1.desc']);
    const src = readFileSync('src/sim/edicts.ts', 'utf8');
    const gap: Record<string, unknown> = { ...EDICT_TEXT };
    delete gap.curfew;
    expect(checkText('edicts', gap, src).join('\n')).toMatch(/curfew\.name: .* would not load/);
    expect(checkText('edicts', { ...EDICT_TEXT, stray: { name: 'x' } }, src).join('\n')).toMatch(/stray\.name: nothing in src\/sim\/edicts\.ts reads it/);
  });
});

describe('the prompt studio', () => {
  const b = (key: string, w: number, category = 'service', faction?: string[]) => ({ key, name: key, category, w, h: w, desc: 'A thing. It does more.', faction });
  it('takes the yardstick of DESIGN 4.109', () => {
    expect(yardstick(b('well', 1)).citizens).toBe('1.5');
    expect(yardstick(b('shrine', 1)).citizens).toBe('2.5');
    expect(yardstick(b('smokehouse', 1)).citizens).toBe('2.8');
    expect(yardstick(b('academy', 2)).citizens).toBe('5.5');
    expect(yardstick(b('greatgate', 3, 'wonder')).citizens).toBe('free');
  });
  it('drafts with the house rules: one subject on white, the front on the right, the footprint', () => {
    const d = draftFor(b('smokehouse', 1), 'b_smokehouse', 'Smoke curls from a reed roof.');
    expect(d).toMatch(/Smoke curls from a reed roof\./);
    expect(d).toMatch(/plain flat white background/);
    expect(d).toMatch(/right-hand face/);
    expect(d).toMatch(/Footprint: 1 by 1 tiles/);
    expect(houseRules().length).toBe(5);
  });
});
