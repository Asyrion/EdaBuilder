// Iteration 87 (DESIGN 4.118): the content is data in src/data/content/, read by catalog.ts and relics.ts and checked by
// validateContent; the check catches the mistakes a hand or the dev board could make.
import { describe, expect, it } from 'vitest';
import { BUILDINGS, MILESTONES, ROADS } from '../src/sim/catalog';
import { validateContent } from '../src/sim/contentCheck';

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
