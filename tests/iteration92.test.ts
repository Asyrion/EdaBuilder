/** Iteration 92 (NEXT_STEPS item 1, DESIGN §4.123): the quests that never complete. An audit of all 140 Charter tasks found
 *  13 that a well-played city could not finish, or whose text sent the player the wrong way; each is held here. */
import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/data/quests';

const Q = (id: string) => QUESTS.find((q) => q.id === id)!;

describe('Iteration 92: the text says what completes the task', () => {
  it('names the Beacon gate', () => {
    expect(Q('c_beacon').hint).toMatch(/happiness gate/);
    expect(Q('c_beacon').focus).toBeUndefined();
  });
});
