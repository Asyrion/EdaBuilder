/** Iteration 67 (replays): every player change through one command, a replay file, and a replay that reproduces its recording bit
 *  for bit; a missing command found on the first day it shows; the aura cache keyed by the dragons; every op callable. */
import { describe, expect, it } from 'vitest';
import { COMMAND_OPS, CommandRunner, ReplayPlayer, checksum, stateFromHeader, verifyReplay, type ReplayHeader } from '../src/sim/commands';
import { serialize } from '../src/sim/save';
import { tick } from '../src/sim/sim';
import { dragonAuras } from '../src/sim/weave';
import { RoadType, TICKS_PER_DAY, Zone, idx, type GameState } from '../src/sim/types';
import { roadPath } from '../src/sim/actions';

/** A short charter played through commands the way the UI sends them: snapshots before map actions, a drag of bulldozes, an undo,
 *  panel commands, tales answered as they come. */
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
      if (s.pendingEvent) r.exec('tale', 0, null);
      tick(s);
      r.checkpoint();
    }
  }
  return { runner: r, s };
}
/** The replay of a recording, run to its end in a fresh state. */
function replay(file: ReturnType<CommandRunner['toFile']>): GameState {
  const p = new ReplayPlayer(file, stateFromHeader(file.header));
  for (let g = 0; g < 5_000_000 && !p.done; g++) { if (!p.feed() || p.done || p.stuck) break; tick(p.state); p.runner.checkpoint(); }
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

  it('the daily challenge replays with its own date; the Grimmen and the Veshari too', () => {
    for (const h of [
      { seed: 0, name: 'Dailywick', scenario: 'daily', faction: 'vellish', challenge: '2026-10-03' },
      { seed: 68, name: 'Deepwick', scenario: 'valley', faction: 'grimmen' },
      { seed: 69, name: 'Banksby', scenario: 'valley', faction: 'veshari' },
    ] as ReplayHeader[]) {
      const { runner } = play(h, 4);
      const v = verifyReplay(JSON.parse(JSON.stringify(runner.toFile('test'))));
      expect(v.matches, h.name).toBe(true);
    }
  }, 240_000);

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
      snap: ['test'], bulldoze: [f.x, f.y], terraform: ['clear', f.x + 3, f.y + 3], dust: [f.x, f.y], build: ['well', f.x + 2, f.y + 2],
      gate: [2, f.x, f.y], road: [RoadType.Track, [idx(f.x + 3, f.y + 3)]], zone: [Zone.Hearth, f.x, f.y, f.x + 1, f.y + 1],
      district: [1, f.x, f.y, f.x + 2, f.y + 2], wall: [[idx(f.x + 8, f.y + 8)]], undo: [],
      tax: ['market', 9], edict: ['curfew', true, 0], loan: [], repay: [], sector: [0], deepen: [0], daughter: [0, 'Twin'],
      quarter: [1, null], lesson: ['districts'], priority: [-1, 0], renameDistrict: [1, 'A'], training: [-1, 'gentle'],
      vent: [-1], replate: [-1], rain: [-1], role: [-1, 'none', -1], cradle: [-1], nest: [-1], burnWyrmfire: [true],
      sluice: [-1], skydock: [], golem: [-1, 'labour', -1], quarry: [-1, 'deer'], tale: [0, null], guild: ['carters'], dev: ['addcrowns', '100', f.x, f.y],
    };
    for (const op of COMMAND_OPS) {
      expect(args[op], `a test call for ${op}`).toBeDefined();
      expect(() => r.exec(op, ...args[op]), op).not.toThrow();
    }
    expect(r.log.length).toBe(COMMAND_OPS.length);
  });

  it('the auras follow a role changed inside their 50-tick window', () => {
    const s = stateFromHeader(vellish);
    const cradle = s.buildings.find((b) => b)!;
    s.dragons.push({ id: 1, name: 'Ash', line: 'ember', stage: 2, days: 0, cradleId: cradle.id, role: 'none', roleTarget: -1, mood: 80, hungry: 0, training: 'gentle', agentId: -1, born: 0 } as GameState['dragons'][number]);
    expect(dragonAuras(s).length).toBe(1);
    s.dragons[0].role = 'courier'; // a courier radiates no aura; the tick and the dragon count are unchanged
    expect(dragonAuras(s).length).toBe(0);
  });
});
