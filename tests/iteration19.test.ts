import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { Terrain, idx } from '../src/sim/types';
import { terraform, takeSnapshot, restoreSnapshot } from '../src/sim/actions';
import { createChallenge, challengeSeed, todayKey } from '../src/sim/scenario';
import { activeQuests } from '../src/sim/quests';
import { DEFAULT_KEYS, keyFor } from '../src/ui/keys';
import { serialize, deserialize } from '../src/sim/save';

describe('Terraforming', () => {
  it('clears forest, plants glimwood and levels hills by unlock, costs crowns, and undoes', () => {
    const s = createGame(23, 'Land');
    const f = s.founding;
    const i = idx(f.x + 6, f.y + 6);
    s.terrain[i] = Terrain.Forest;
    const snap = takeSnapshot(s, 'terrain');
    const t0 = s.treasury;
    expect(terraform(s, 'clear', f.x + 6, f.y + 6).ok).toBe(true);
    expect(s.terrain[i]).toBe(Terrain.Grass);
    expect(s.treasury).toBe(t0 - 40);
    expect(terraform(s, 'clear', f.x + 6, f.y + 6).ok).toBe(false);
    expect(terraform(s, 'plant', f.x + 6, f.y + 6).reason).toMatch(/unlock/);
    s.milestone = 2;
    expect(terraform(s, 'plant', f.x + 6, f.y + 6).ok).toBe(true);
    expect(s.terrain[i]).toBe(Terrain.Forest);
    s.terrain[i] = Terrain.Hills;
    expect(terraform(s, 'level', f.x + 6, f.y + 6).reason).toMatch(/unlock/);
    s.milestone = 4;
    expect(terraform(s, 'level', f.x + 6, f.y + 6).ok).toBe(true);
    expect(s.terrain[i]).toBe(Terrain.Grass);
    expect(s.stats.terraformed).toBe(3);
    restoreSnapshot(s, snap);
    expect(s.terrain[i]).toBe(Terrain.Forest);
    expect(s.treasury).toBe(t0);
  });
});

describe('Daily challenge', () => {
  it('derives one seed per date, sets the goal quest and survives save/load', () => {
    expect(todayKey(new Date(Date.UTC(2026, 9, 1)))).toBe('2026-10-01');
    expect(challengeSeed('2026-10-01')).toBe(challengeSeed('2026-10-01'));
    expect(challengeSeed('2026-10-01')).not.toBe(challengeSeed('2026-10-02'));
    const s = createChallenge('Race', '2026-10-01');
    expect(s.challenge).toBe('2026-10-01');
    expect(s.seed).toBe(challengeSeed('2026-10-01'));
    expect(activeQuests(s)[0].id).toBe('z_daily');
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.challenge).toBe('2026-10-01');
    run(b, 5);
  });
});

describe('Key bindings', () => {
  it('have defaults and resolve a bound key to its action', () => {
    expect(keyFor(DEFAULT_KEYS, ' ')).toBe('pause');
    expect(keyFor(DEFAULT_KEYS, 'b')).toBe('bulldoze');
    expect(keyFor({ ...DEFAULT_KEYS, bulldoze: 'q' }, 'q')).toBe('bulldoze');
    expect(keyFor({ ...DEFAULT_KEYS, bulldoze: 'q' }, 'b')).toBeNull();
  });
});

describe('Daily challenge result', () => {
  it('records the day the goal was met', async () => {
    const { createChallenge: cc } = await import('../src/sim/scenario');
    const { checkQuests } = await import('../src/sim/quests');
    const s = cc('Race', '2026-10-01');
    s.milestone = 5;
    s.day = 40;
    checkQuests(s);
    expect(s.challengeDay).toBe(40);
    expect(s.questsDone).toContain('z_daily');
  });
});
