/** Content as data: the buildings, roads and milestones in src/data/content/ checked by validateContent, the text of edicts
 *  and quests read by id, and the dev board's prompt studio. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, MILESTONES, ROADS } from '../src/sim/catalog';
import { validateContent } from '../src/sim/contentCheck';
import { EDICTS } from '../src/sim/edicts';
import { QUESTS } from '../src/data/quests';
import EDICT_TEXT from '../src/data/content/text/edicts.json';
import { checkAllText, checkText, textRefs } from '../tools/devboard/textCheck';
import { draftFor, houseRules, yardstick } from '../tools/devboard/prompts';

// The content is data in src/data/content/, read by catalog.ts and relics.ts and checked by validateContent; the check catches
// the mistakes a hand or the dev board could make.
describe('content as data', () => {
  it('the content files are valid', () => expect(validateContent()).toEqual([]));

  it('zones and road types are mapped from their names to the enums', () => {
    expect(BUILDINGS.find((b) => b.key === 'hearth')!.zone).toBe(1);
    expect(BUILDINGS.find((b) => b.key === 'arcane')!.zone).toBe(4);
    expect(ROADS.map((r) => r.type)).toEqual([1, 2, 3]); // the glowvine lane (4) is parked (scope reset phase 1c)
  });

  it('catches a duplicate key, an unknown unlock and a zone house without levels', () => {
    const well = BUILDINGS.find((b) => b.key === 'well')!;
    const hearth = BUILDINGS.find((b) => b.key === 'hearth')!;
    const bad = [...BUILDINGS, { ...well }, { ...hearth, key: 'hut', capacity: [4] }, { ...well, key: 'late', unlock: 42 }];
    const errs = validateContent(bad).join('\n');
    expect(errs).toMatch(/well: the key is used twice/);
    expect(errs).toMatch(/hut: a zone building needs three capacities/);
    expect(errs).toMatch(/late: unlock 42 is not a milestone/);
  });

  it('catches a milestone unlocking something unknown', () => {
    const ms = MILESTONES.map((m, i) => (i === 1 ? { ...m, unlocks: [...m.unlocks, 'nothing'] } : m));
    expect(validateContent(BUILDINGS, ROADS, ms).join('\n')).toMatch(/unlocks unknown "nothing"/);
  });
});

// The text of the edicts and quests is data in src/data/content/text/, read by the code by id. These tests hold the two sides
// together, and the prompt studio's draft to the house art rules.
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
