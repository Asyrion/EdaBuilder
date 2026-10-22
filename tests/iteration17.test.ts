import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { dailySurge } from '../src/sim/hazards';

describe('Quest counters', () => {
  it('a brownout that ends without a surge counts as survived', () => {
    const s = createGame(3, 'B');
    s.manaDemand = 500; s.manaSupply = 100;
    dailySurge(s);
    dailySurge(s);
    expect(s.overdrawDays).toBe(2);
    s.manaDemand = 50;
    dailySurge(s);
    expect(s.stats.brownoutsSurvived).toBe(1);
    dailySurge(s);
    expect(s.stats.brownoutsSurvived).toBe(1);
  });
});
