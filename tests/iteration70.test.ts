/** Iteration 70 (DESIGN 4.101, the losses named): every loss names its cause; old saves load. The wyrm's razing and the hounds'
 *  Hush siege were parked in the scope reset (phase 1b); the causes left are the Gloam, the restless and the Crown. */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { deserialize, serialize } from '../src/sim/save';

describe('Causes and old saves', () => {
  it('a save without a loss cause loads with none', () => {
    const s = createGame(70, 'Losswick');
    s.lostTo = 'restless';
    const o = JSON.parse(serialize(s));
    delete o.lostTo;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'x'));
    expect(old.lostTo).toBeUndefined();
  });
});
