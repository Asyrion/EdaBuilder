/** Saves and replays: save version 8 (every layer saved, a load recomputes nothing, an older save or replay refused with a
 *  message), a save carrying its version, and replays that reproduce their recording bit for bit. */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { recomputeAll, tick } from '../src/sim/sim';
import { SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { COMMAND_OPS, CommandRunner, REPLAY_VERSION, ReplayPlayer, checksum, stateFromHeader, verifyReplay, type ReplayHeader } from '../src/sim/commands';
import { RoadType, SAVE_VERSION, TICKS_PER_DAY, Zone, idx, type GameState } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { flatten } from './helpers';

// Save version 8: a save or a replay from before the scope reset (save version 7 and older, replay format 1) is refused with a
// message, whatever it holds (docs/RESET_PLAN.md §9).
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

// A save round-trips its fields and carries its version.
function town(seed = 55) {
  const s = createGame(seed, 'Annalwick');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 14, f.x + 18, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 2, f.x + 16, f.y + 2, false));
  s.treasury = 50000;
  s.milestone = 3;
  recomputeAll(s);
  return s;
}
describe('Saves carry their version', () => {
  it('a save round-trips its fields; an older or a newer save is refused with the reason (save version 8, phase 1d)', () => {
    const s = town();
    // a version 8 save from before phase 2-6 carries the Crown's favour: it loads, and the field is dropped
    const old = JSON.parse(serialize(s)); old.crownFavour = 61;
    const r = deserialize(JSON.stringify(old), (seed) => createGame(seed));
    expect(r.version).toBe(SAVE_VERSION);
    expect('crownFavour' in r).toBe(false);
    expect(r.stats).toEqual(s.stats);
    const o = JSON.parse(serialize(s));
    o.version = 99;
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(SaveVersionError);
    expect(() => deserialize(JSON.stringify(o), (seed) => createGame(seed))).toThrow(/version 99/);
  });
});

// Replays: every player change goes through one command, a replay file holds them, and a replay reproduces its recording bit
// for bit; a missing command is found on the first day it shows; every op is callable.
/** A short charter played through commands the way the UI sends them: snapshots before map actions, a drag of bulldozes, an undo,
 *  panel commands. */
function play(header: ReplayHeader, days: number): { runner: CommandRunner; s: GameState } {
  const s = stateFromHeader(header);
  const r = new CommandRunner(s, header);
  const f = s.founding;
  const at: Record<number, () => void> = {
    5: () => { r.exec('snap', 'road'); r.exec('road', RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 10, f.y + 3, false)); },
    9: () => { r.exec('snap', 'zone'); r.exec('zone', Zone.Hearth, f.x - 5, f.y + 4, f.x + 6, f.y + 5); },
    14: () => { r.exec('snap', 'road'); r.exec('road', RoadType.Track, roadPath(f.x + 4, f.y + 3, f.x + 4, f.y + 12, true)); },
    20: () => { r.exec('snap', 'zone'); r.exec('zone', Zone.Market, f.x + 5, f.y + 6, f.x + 6, f.y + 10); },
    26: () => { r.exec('snap', 'build'); r.exec('build', 'well', f.x + 2, f.y + 2); }, // a building draws from the main stream
    31: () => { r.exec('snap', 'bulldoze'); for (let k = 0; k < 3; k++) r.exec('bulldoze', f.x - 6 + k, f.y + 3); },
    32: () => { r.exec('undo'); },
    40: () => { r.exec('tax', 'hearth', 12); r.exec('lesson', 'districts'); r.exec('priority', s.buildings.find((b) => b && b.kind !== 'stake')?.id ?? -1, 0); },
    55: () => { r.exec('edict', 'curfew', true, 0); r.exec('loan'); r.exec('renameDistrict', 1, 'Lowgate'); },
  };
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const k = s.tick;
      if (k % 50 === 0 && at[k / 50]) at[k / 50]();
      tick(s);
      r.checkpoint();
    }
  }
  return { runner: r, s };
}
/** The replay of a recording, run to its end in a fresh state. */
function replay(file: ReturnType<CommandRunner['toFile']>): GameState {
  const p = new ReplayPlayer(file, stateFromHeader(file.header));
  for (let g = 0; g < 5_000_000 && !p.done; g++) { if (!p.feed() || p.done) break; tick(p.state); p.runner.checkpoint(); }
  return p.state;
}

const vellish: ReplayHeader = { seed: 67, name: 'Replaywick', scenario: 'valley', faction: 'vellish' };

describe('A replay reproduces its recording', () => {
  it('a Vellish charter of twelve days: the same state bit for bit, every checkpoint equal, the verifier says match', () => {
    const { runner, s } = play(vellish, 12);
    const file = runner.toFile('test');
    expect(file.commands.length).toBeGreaterThan(15);
    expect(file.commands.some((c) => c.op === 'undo')).toBe(true);
    const again = replay(JSON.parse(JSON.stringify(file)));
    expect(serialize(again)).toBe(serialize(s));
    const v = verifyReplay(JSON.parse(JSON.stringify(file)));
    expect(v.matches).toBe(true);
    expect(v.divergedOnDay).toBe(-1);
    expect(v.checksum).toBe(checksum(s));
  }, 120_000);

  it('a missing command is found: the verifier names the first day the recording and the replay part', () => {
    const { runner } = play(vellish, 6);
    const file = JSON.parse(JSON.stringify(runner.toFile('test')));
    const at = file.commands.findIndex((c: { op: string }) => c.op === 'build');
    file.commands.splice(at, 1); // the well that drew from the main stream
    const v = verifyReplay(file);
    expect(v.matches).toBe(false);
    expect(v.divergedOnDay).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('a charter loaded from a save records nothing: a replay begins with a new charter', () => {
    const s = stateFromHeader(vellish);
    const r = new CommandRunner(s, null);
    r.exec('tax', 'hearth', 11);
    expect(r.log.length).toBe(0);
    expect(() => r.toFile('test')).toThrow();
  });
});

describe('The commands', () => {
  it('every op runs without throwing on a fresh charter, whether or not it takes', () => {
    const s = stateFromHeader(vellish);
    const r = new CommandRunner(s, vellish);
    const f = s.founding;
    const args: Record<string, unknown[]> = {
      snap: ['test'], bulldoze: [f.x, f.y], terraform: ['clear', f.x + 3, f.y + 3], build: ['well', f.x + 2, f.y + 2],
      road: [RoadType.Track, [idx(f.x + 3, f.y + 3)]], zone: [Zone.Hearth, f.x, f.y, f.x + 1, f.y + 1],
      district: [1, f.x, f.y, f.x + 2, f.y + 2], undo: [],
      tax: ['market', 9], edict: ['curfew', true, 0], loan: [], repay: [], sector: [0], deepen: [0], daughter: [0, 'Twin'],
      quarter: [1, null], lesson: ['districts'], priority: [-1, 0], renameDistrict: [1, 'A'],
      sluice: [-1], quarry: [-1, 'deer'], dev: ['addcrowns', '100', f.x, f.y],
    };
    for (const op of COMMAND_OPS) {
      expect(args[op], `a test call for ${op}`).toBeDefined();
      expect(() => r.exec(op, ...args[op]), op).not.toThrow();
    }
    expect(r.log.length).toBe(COMMAND_OPS.length);
  });

});
