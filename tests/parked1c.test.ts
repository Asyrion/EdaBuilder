/** Scope reset, phase 1c: a save or a replay that holds what was parked (the tales, the guilds, the weave, the forecast, the
 *  walkers, their buildings and commands) is refused with a reason; old walkers and the nodes' ley aspects are dropped on load
 *  (docs/PARKED.md). */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { CommandRunner, ReplayPlayer, stateFromHeader, type ReplayHeader } from '../src/sim/commands';

const load = (o: unknown) => () => deserialize(JSON.stringify(o), (seed) => createGame(seed));
const raw = () => JSON.parse(serialize(createGame(41, 'Parkwick')));

describe('A save holding parked things', () => {
  for (const kind of ['guildhall', 'observatory']) {
    it(`a ${kind} is refused and named`, () => {
      const o = raw();
      const b = o.buildings.find((x: unknown) => x);
      o.buildings.push({ ...b, id: 9999, kind });
      expect(load(o)).toThrow(SaveVersionError);
      expect(load(o)).toThrow(new RegExp(`parked.*the building "${kind}"`));
    });
  }

  it('an old walker is dropped and the nodes lose their aspects', () => {
    const o = raw();
    const n = o.agents.length;
    o.agents.push({ id: 99999, kind: 5, x: 40.5, y: 40.5, path: [], pathIdx: 0, speed: 1, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, job: 'sexton', log: ['Salted a grave'] });
    for (const node of o.nodes) node.aspect = 'vein';
    const s = load(o)();
    expect(s.agents.length).toBe(n);
    expect(s.agents.some((x) => (x.kind as number) === 5)).toBe(false);
    expect(s.nodes.length).toBeGreaterThan(0);
    expect(s.nodes.every((node) => !('aspect' in node))).toBe(true);
  });
});

describe('A replay holding a parked command', () => {
  const header: ReplayHeader = { seed: 67, name: 'Replaywick', scenario: 'valley', faction: 'vellish' };
  for (const op of ['tale', 'guild']) {
    it(`"${op}" is refused by the player, naming the command`, () => {
      const r = new CommandRunner(stateFromHeader(header), header);
      const file = JSON.parse(JSON.stringify(r.toFile('test')));
      file.commands.push({ t: 0, op, args: [0] });
      expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(SaveVersionError);
      expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(new RegExp(`parked.*"${op}" command`));
    });
  }
});
