import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { computeGloamPressure, dailyGloamPressure } from '../src/sim/hazards';

describe('Gloam pressure', () => {
  it('pressure rises with the dead and with overdraw', () => {
    const s = createGame(41, 'Press');
    const base = computeGloamPressure(s);
    s.unquieted = 80;
    expect(computeGloamPressure(s)).toBeGreaterThan(base);
    s.unquieted = 0;
    s.overdrawDays = 2;
    expect(computeGloamPressure(s)).toBeCloseTo(base + 0.15, 5);
    dailyGloamPressure(s);
    expect(s.gloamPressure).toBeGreaterThan(0);
  });
});
