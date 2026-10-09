/** Iteration 92 (NEXT_STEPS item 1, DESIGN §4.123): the quests that never complete. An audit of all 140 Charter tasks found
 *  13 that a well-played city could not finish, or whose text sent the player the wrong way; each is held here. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { BREED_DAY, canBreed, dailyBreeding } from '../src/sim/breeding';
import { addEgg, cradleAccepts } from '../src/sim/wyrmcraft';
import { QUESTS } from '../src/data/quests';
import { checkQuests } from '../src/sim/quests';
import { deserialize, serialize } from '../src/sim/save';
import { DAYS_PER_SEASON, TICKS_PER_DAY, type Building, type GameState } from '../src/sim/types';
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
    expect(s.stats.walkerKills).toBe(0);
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
  it('a Great Weir standing when the first Hush ends weathers the flood', () => {
    const s = town(41, 'veshari');
    stands(s, 'greatweir');
    s.day = 4 * DAYS_PER_SEASON - 1;
    expect(Q('v_flood').done(s)).toBe(false);
    s.day = 4 * DAYS_PER_SEASON;
    expect(Q('v_flood').done(s)).toBe(true);
  });

  it('the duel stays closed while the Vein-Wyrm is bound: a bound wyrm never flies over in anger', () => {
    const s = town();
    s.stats.greatWyrms = 1;
    s.wyrm.state = 'awake';
    expect(Q('k_duel').when(s)).toBe(true);
    s.wyrm.state = 'bound';
    expect(Q('k_duel').when(s)).toBe(false);
  });

  it('"Clear the bridge" is open only while a wyrm lairs', () => {
    const s = town();
    s.stats.wyrmsLaired = 1;
    s.marshWyrms = [{ id: 1, x: 5, y: 5, lair: 1234, nest: -1 }];
    expect(Q('w_wyrm').when(s)).toBe(true);
    s.marshWyrms[0].lair = -1; // Bloom ended, or the bridge was guarded: the task leaves the Ledger
    expect(Q('w_wyrm').when(s)).toBe(false);
    s.stats.wyrmsDriven = 1; // a drive-off ends the lair in the same stroke, and still pays
    checkQuests(s);
    expect(s.questsDone).toContain('w_wyrm');
  });

  it('every people\'s cradle takes the vein egg', () => {
    for (const kind of ['cradle', 'hatchery', 'tidepool']) expect(cradleAccepts({ kind } as Building, 'vein')).toBe(true);
    expect(cradleAccepts({ kind: 'hatchery' } as Building, 'tide')).toBe(false);
  });

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

describe('Iteration 92: breeding weighs every pair', () => {
  function cradleTown() {
    const s = town();
    const f = s.founding;
    const c = placeBuildingRaw(s, 'cradle', f.x + 3, f.y + 3)!;
    c.level = 2; // a Great Cradle: four slots
    recomputeAll(s);
    return { s, c };
  }
  it('a Great Cradle of ember, ember and vein (attuned to vein) breeds the vein and an ember', () => {
    const { s, c } = cradleTown();
    const ds = [addEgg(s, 'ember')!, addEgg(s, 'ember')!, addEgg(s, 'vein')!];
    for (const d of ds) { d.stage = 2; d.mood = 80; }
    const chk = canBreed(s, c);
    expect(chk.ok).toBe(true);
    expect(chk.line).toBe('vein');
    expect(chk.second).toBe('ember');
    s.day = BREED_DAY;
    c.lit = true;
    dailyBreeding(s);
    const egg = s.dragons[3];
    expect([egg?.line, egg?.second, egg?.trueblood]).toEqual(['vein', 'ember', undefined]);
    expect(s.stats.crossEggs).toBe(1);
  });
  it('mirror crosses still lay a trueblood, and a plain dragon with a crossed one of its line breeds nothing', () => {
    const { s, c } = cradleTown();
    const a = addEgg(s, 'vein')!; const b = addEgg(s, 'ember')!;
    a.stage = 2; b.stage = 2; a.mood = 80; b.mood = 80;
    a.second = 'ember'; b.second = 'vein';
    const chk = canBreed(s, c);
    expect([chk.ok, chk.line, chk.second, chk.trueblood]).toEqual([true, 'vein', 'ember', true]);
    b.line = 'vein'; b.second = undefined; // plain vein beside vein+ember: the egg would copy the crossed parent
    expect(canBreed(s, c).ok).toBe(false);
  });
  it('two crossed dragons of one first line and different second lines lay a trueblood', () => {
    const { s, c } = cradleTown();
    const a = addEgg(s, 'vein')!; const b = addEgg(s, 'vein')!;
    a.stage = 2; b.stage = 2; a.mood = 80; b.mood = 80;
    expect(canBreed(s, c).ok).toBe(false); // two of one line, uncrossed: nothing new
    a.second = 'grey'; b.second = 'sky';
    const chk = canBreed(s, c);
    expect(chk.ok).toBe(true);
    expect(chk.trueblood).toBe(true);
    expect(chk.line).toBe('vein');
    expect(chk.second).toBe('sky');
    s.day = BREED_DAY;
    c.lit = true;
    dailyBreeding(s);
    const egg = s.dragons[2];
    expect([egg?.line, egg?.second, egg?.trueblood]).toEqual(['vein', 'sky', true]);
    expect(s.stats.truebloods).toBe(1);
    a.second = 'sky'; // the same lines exactly
    expect(canBreed(s, c).ok).toBe(false);
  });
});

describe('Iteration 92: the text says what completes the task', () => {
  it('names the four markets, the Weir, the stirring, each people\'s Beacon gate and the Grimmen\'s cutting', () => {
    expect(Q('o_full').title + Q('o_full').hint).toMatch(/four/i);
    expect(Q('v_flood').hint).toMatch(/Great Weir/);
    expect(Q('v_find').title).toMatch(/Stir/);
    expect(Q('c_beacon').hint).toMatch(/your people's gate/);
    expect(Q('c_beacon').focus).toBeUndefined(); // no "Show me" to a Lantern three peoples cannot build
    expect(Q('g_burn').hint).toMatch(/stone-sexton/);
  });
  it('the four-market task stays on the Ledger while the shelves are full', () => {
    const s = town();
    s.goodsShort = 0;
    expect(Q('o_full').when(s)).toBe(false);
    for (let k = 0; k < 4; k++) stands(s, 'market');
    expect(Q('o_full').when(s)).toBe(true);
  });
});
