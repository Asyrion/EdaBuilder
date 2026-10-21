/** Iteration 92 (NEXT_STEPS item 1, DESIGN §4.123): the quests that never complete. An audit of all 140 Charter tasks found
 *  13 that a well-played city could not finish, or whose text sent the player the wrong way; each is held here. */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { QUESTS } from '../src/data/quests';
import { type Building, type GameState } from '../src/sim/types';
import { flatten } from './helpers';

const Q = (id: string) => QUESTS.find((q) => q.id === id)!;
function town(seed = 41, faction?: Parameters<typeof createGame>[3]) {
  const s = createGame(seed, 'Audit', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
  return s;
}
/** A finished building of this kind, for a quest condition that only counts them. */
const stands = (s: GameState, kind: string) => s.buildings.push({ id: 9000 + s.buildings.length, kind, x: 0, y: 0, state: 'ok', level: 1, lit: true } as unknown as Building);

describe('Iteration 92: the text says what completes the task', () => {
  it('names the four markets and the Beacon gate', () => {
    expect(Q('o_full').title + Q('o_full').hint).toMatch(/four/i);
    expect(Q('c_beacon').hint).toMatch(/happiness gate/);
    expect(Q('c_beacon').focus).toBeUndefined();
  });
  it('the four-market task stays on the Ledger while the shelves are full', () => {
    const s = town();
    s.goodsShort = 0;
    expect(Q('o_full').when(s)).toBe(false);
    for (let k = 0; k < 4; k++) stands(s, 'market');
    expect(Q('o_full').when(s)).toBe(true);
  });
});
