/** Scope reset, phase 1b: a save or a replay that holds what was parked (dragons, the Warding Wall, their buildings, their
 *  commands) is refused with a reason, not loaded half-built (docs/PARKED.md). */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { CommandRunner, ReplayPlayer, stateFromHeader, verifyReplay, type ReplayHeader } from '../src/sim/commands';
import { MAP_H, MAP_W } from '../src/sim/types';

const load = (o: unknown) => () => deserialize(JSON.stringify(o), (seed) => createGame(seed));
const raw = () => JSON.parse(serialize(createGame(41, 'Parkwick')));

describe('A save holding parked things', () => {
  it('a parked building is refused and named', () => {
    const o = raw();
    const b = o.buildings.find((x: unknown) => x);
    o.buildings.push({ ...b, id: 9999, kind: 'cradle' });
    expect(load(o)).toThrow(SaveVersionError);
    expect(load(o)).toThrow(/parked.*the building "cradle"/);
  });

  it('dragons are refused and named', () => {
    const o = raw();
    o.dragons = [{}];
    expect(load(o)).toThrow(SaveVersionError);
    expect(load(o)).toThrow(/parked.*dragons/);
  });

  it('a stretch of the Warding Wall is refused and named; an empty wall loads', () => {
    const o = raw();
    const bytes = new Uint8Array(MAP_W * MAP_H);
    o.wall = { u8: Buffer.from(bytes).toString('base64') };
    expect(load(o)().day).toBe(o.day);
    bytes[MAP_W * 10 + 10] = 1;
    o.wall = { u8: Buffer.from(bytes).toString('base64') };
    expect(load(o)).toThrow(SaveVersionError);
    expect(load(o)).toThrow(/parked.*the Warding Wall/);
  });
});

describe('A replay holding a parked command', () => {
  const header: ReplayHeader = { seed: 67, name: 'Replaywick', scenario: 'valley', faction: 'vellish' };
  it('is refused by the player and by the verifier, naming the command', () => {
    const r = new CommandRunner(stateFromHeader(header), header);
    const file = JSON.parse(JSON.stringify(r.toFile('test')));
    file.commands.push({ t: 0, op: 'wall', args: [[1]] });
    expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(SaveVersionError);
    expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(/parked.*"wall" command/);
    expect(() => verifyReplay(file)).toThrow(SaveVersionError);
  });
});
