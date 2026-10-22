/** Scope reset, phase 1d: save version 8. Every layer is saved and a load recomputes nothing; a save or a replay from before
 *  (save version 7 and older, replay format 1) is refused with a message, whatever it holds (docs/RESET_PLAN.md §9). */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { CommandRunner, REPLAY_VERSION, ReplayPlayer, stateFromHeader, type ReplayHeader } from '../src/sim/commands';
import { SAVE_VERSION } from '../src/sim/types';

const raw = () => JSON.parse(serialize(createGame(41, 'Eightwick')));
const load = (o: unknown) => () => deserialize(JSON.stringify(o), (seed) => createGame(seed));

describe('Save version 8', () => {
  it('writes version 8 and the derived layers', () => {
    const o = raw();
    expect(SAVE_VERSION).toBe(8);
    expect(o.version).toBe(8);
    for (const k of ['lit', 'watered', 'landValue', 'miasma', 'gloamDist', 'waterDist', 'traffic']) expect(o[k], k).toBeDefined();
    expect(Object.keys(o.coverage).length).toBeGreaterThan(0);
  });

  for (const v of [7, 6, undefined]) {
    it(`a save of version ${v ?? 'none'} is refused with the reset's message`, () => {
      const o = raw();
      if (v === undefined) delete o.version; else o.version = v;
      expect(load(o)).toThrow(SaveVersionError);
      expect(load(o)).toThrow(new RegExp(`older Wardlight \\(version ${v ?? 6}\\).*cut back to its core`));
    });
  }
});

describe('Replay format 2', () => {
  const header: ReplayHeader = { seed: 67, name: 'Replaywick', scenario: 'valley', faction: 'vellish' };
  it('a new replay is format 2 and plays; one of format 1 is refused', () => {
    const r = new CommandRunner(stateFromHeader(header), header);
    const file = JSON.parse(JSON.stringify(r.toFile('test')));
    expect(file.replay).toBe(REPLAY_VERSION);
    expect(() => new ReplayPlayer(file, stateFromHeader(header))).not.toThrow();
    file.replay = 1;
    expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(SaveVersionError);
    expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(/older Wardlight \(version replay 1\)/);
  });
});
