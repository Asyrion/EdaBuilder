/** Iteration 92 (NEXT_STEPS item 1, DESIGN §4.123): the quests that never complete. An audit of all 140 Charter tasks found
 *  13 that a well-played city could not finish, or whose text sent the player the wrong way; each is held here. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { QUESTS } from '../src/data/quests';
import { deserialize, serialize } from '../src/sim/save';
import { TICKS_PER_DAY, type Building, type GameState } from '../src/sim/types';
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

describe('Iteration 92: the Watch and the sexton count their rounds, not the threats they meet', () => {
  it('a Watch Post on a road completes "See the Watch at work" in a quiet city, and sextons no longer count', () => {
    const s = town();
    const f = s.founding;
    buildRoad(s, 1, roadPath(f.x - 8, f.y + 2, f.x + 8, f.y + 2, false));
    const post = placeBuildingRaw(s, 'watchpost', f.x + 2, f.y + 3)!;
    post.state = 'ok'; post.work = 0; post.lit = true;
    recomputeAll(s);
    s.stats.walkerLayings = 5; // a sexton's layings
    expect(Q('w_patrol').done(s)).toBe(false);
    run(s, TICKS_PER_DAY * 4);
    expect(s.stats.watchRounds).toBeGreaterThan(0);
    expect(s.questsDone).toContain('w_patrol');
  });

  it('a Boneyard on a road completes the sexton\'s task by its rounds, with no restless at all', () => {
    const s = town();
    const f = s.founding;
    buildRoad(s, 1, roadPath(f.x - 8, f.y + 2, f.x + 8, f.y + 2, false));
    const yard = placeBuildingRaw(s, 'boneyard', f.x - 3, f.y + 3)!;
    yard.state = 'ok'; yard.work = 0; yard.lit = true;
    recomputeAll(s);
    run(s, TICKS_PER_DAY * 4);
    expect(s.stats.restlessLaid).toBe(0);
    expect(s.stats.sextonRounds).toBeGreaterThan(0);
    expect(s.questsDone).toContain('w_sexton');
  });

  it('old saves get the new counters at zero', () => {
    const s = town();
    const raw = JSON.parse(serialize(s));
    delete raw.stats.watchRounds; delete raw.stats.sextonRounds;
    const r = deserialize(JSON.stringify(raw), (seed) => createGame(seed));
    expect(r.stats.watchRounds).toBe(0);
    expect(r.stats.sextonRounds).toBe(0);
  });
});

describe('Iteration 92: tasks that good play used to close off', () => {

  it('a lit Guildhall seats the council and opens the guild chapter, petition or none', () => {
    const s = town();
    s.milestone = 5;
    expect(Q('k_council').done(s)).toBe(false);
    const f = s.founding;
    const hall = placeBuildingRaw(s, 'guildhall', f.x + 4, f.y + 6)!;
    hall.state = 'ok'; hall.lit = true;
    expect(s.stats.councils).toBe(0);
    expect(Q('k_council').done(s)).toBe(true);
    expect(Q('k_boon').when(s)).toBe(true);
    expect(Q('k_hall').when(s)).toBe(true);
  });
});

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
