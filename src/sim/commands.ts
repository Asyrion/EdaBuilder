/**
 * The player's commands (iteration 67, DESIGN 4.98). Every change the player makes to the charter goes through one of these ops, in
 * the live game and in a replay alike. Each op does what the live code did before (its sim call, its recomputeAll, its road-path
 * bump, its undo snapshot) so live play is unchanged. A command is stamped with the tick it came in after; a replay applies the
 * commands of each tick before running the next, and the sim's determinism does the rest.
 */
import { buildRoad, bulldoze, paintDistrict, paintZone, placeBuilding, restoreSnapshot, setTax, takeSnapshot, terraform, type Snapshot, type TerraformOp } from './actions';
import { bumpRoadVersion } from './agents';
import { foundDaughter } from './charter';
import { construction } from './construction';
import { runDev } from './dev';
import { setQuarter, type QuarterId } from './districts';
import { repayLoan, takeLoan } from './economy';
import { setEdict } from './edicts';
import { SaveVersionError, parkedContentMessage, parkedPeopleMessage, serialize } from './save';
import { buySector } from './sectors';
import { recomputeAll, tick } from './sim';
import { createChallenge, createScenario } from './scenario';
import { setQuarry } from './wild';
import { createGame, deepenNode } from './world';
import type { GameState, RoadType, Scenario, WildSpecies, Zone } from './types';
import type { FactionId } from '../data/factions';

export interface Command { t: number; op: string; args: unknown[] }
/** What an op tells the UI: whether it took, why not, and anything to say. */
export interface CommandResult { ok: boolean; reason?: string | null; out?: string }

/** A charter's start: enough to create the same state again. */
export interface ReplayHeader { seed: number; name: string; scenario: Scenario | 'daily' | 'valley'; faction: FactionId; challenge?: string }
/** A replay file: the start, the commands, a checkpoint each day, the end. */
export interface ReplayFile {
  replay: 1;
  build: string;
  header: ReplayHeader;
  commands: Command[];
  checkpoints: Checkpoint[];
  endTick: number;
  checksum: string;
}
/** [day, rng state, treasury, folk] at the turn of each day. */
export type Checkpoint = [number, number, number, number];

const UNDO_DEPTH = 12;
const b = (s: GameState, id: number) => s.buildings.find((x) => x && x.id === id) ?? null;

/** The ops. Each one mutates the state exactly as the live code did before iteration 67. */
const OPS: Record<string, (s: GameState, r: CommandRunner, a: any[]) => CommandResult> = {
  // the map tools (src/ui/tools.ts): a snapshot first where the tool took one, then the action, then recomputeAll on success
  snap: (s, r, [label]) => { r.undoStack.push(takeSnapshot(s, String(label))); if (r.undoStack.length > UNDO_DEPTH) r.undoStack.shift(); return { ok: true }; },
  bulldoze: (s, _r, [x, y]) => { const res = bulldoze(s, x, y); if (res.ok) { bumpRoadVersion(); recomputeAll(s); } return res; },
  terraform: (s, _r, [op, x, y]) => { const res = terraform(s, op as TerraformOp, x, y); if (res.ok) recomputeAll(s); return res; },
  build: (s, _r, [key, x, y]) => { const res = placeBuilding(s, key, x, y); if (res.ok) { bumpRoadVersion(); recomputeAll(s); } return res; },
  road: (s, _r, [type, tiles]) => { const res = buildRoad(s, type as RoadType, tiles as number[]); if (res.ok) { bumpRoadVersion(); recomputeAll(s); } return res; },
  zone: (s, _r, [zone, x0, y0, x1, y1]) => { const res = paintZone(s, zone as Zone, x0, y0, x1, y1); if (res.ok) recomputeAll(s); return res; },
  district: (s, _r, [id, x0, y0, x1, y1]) => { const res = paintDistrict(s, id, x0, y0, x1, y1); if (res.ok) recomputeAll(s); return res; },
  undo: (s, r) => {
    const snap = r.undoStack.pop();
    if (!snap) return { ok: false, reason: 'Nothing to undo' };
    restoreSnapshot(s, snap);
    bumpRoadVersion();
    recomputeAll(s);
    return { ok: true, out: snap.label };
  },
  // the panels (src/main.ts's host)
  tax: (s, _r, [z, v]) => { setTax(s, z, v); return { ok: true }; },
  edict: (s, _r, [k, on, d]) => { const why = setEdict(s, k, !!on, d ?? 0); if (!why) recomputeAll(s); return { ok: !why, reason: why }; },
  loan: (s) => { const why = takeLoan(s); return { ok: !why, reason: why }; },
  repay: (s) => { const why = repayLoan(s); return { ok: !why, reason: why }; },
  sector: (s, _r, [k]) => { const why = buySector(s, k); if (!why) recomputeAll(s); return { ok: !why, reason: why }; },
  deepen: (s, _r, [i]) => { const why = deepenNode(s, i); if (!why) recomputeAll(s); return { ok: !why, reason: why }; },
  // the daughter charter builds roads: the path cache is bumped (it was not before iteration 67)
  daughter: (s, _r, [i, name]) => { const why = foundDaughter(s, i, name); if (!why) { bumpRoadVersion(); recomputeAll(s); } return { ok: !why, reason: why }; },
  quarter: (s, _r, [d, q]) => { const why = setQuarter(s, d, (q ?? null) as QuarterId | null); if (!why) recomputeAll(s); return { ok: !why, reason: why }; },
  lesson: (s, _r, [id]) => { if (!s.lessonsSeen.includes(id)) s.lessonsSeen.push(id); return { ok: true }; },
  priority: (s, _r, [id, p]) => { const x = b(s, id); if (!x) return { ok: false }; x.priority = p; x.lit = true; recomputeAll(s); return { ok: true }; },
  renameDistrict: (s, _r, [d, name]) => { s.districtNames[d] = String(name).trim().slice(0, 18); return { ok: true }; },
  quarry: (s, _r, [id, q]) => { const x = b(s, id); return { ok: !!x && setQuarry(s, x, (q || null) as WildSpecies | null) }; },
  dev: (s, _r, [id, arg, x, y]) => { const out = runDev(s, id, arg, { x, y }); recomputeAll(s); return { ok: true, out }; },
};
export const COMMAND_OPS = Object.keys(OPS);
/** The ops of the systems the scope reset parked: in phase 1b glim-dust, the Warding Wall and its gates, the dragons, the Scale
 *  Ward, wyrmfire, the Sky-Dock's wyvern and the golems; in 1c the tales, the guilds, the Wright's Lodge's vent and the
 *  Storm-Caller's rain. A replay that uses one is refused (docs/PARKED.md). */
export const PARKED_OPS = ['dust', 'gate', 'wall', 'training', 'replate', 'role', 'cradle', 'nest', 'burnWyrmfire', 'skydock', 'golem', 'tale', 'guild', 'vent', 'rain'];

/** Runs commands against a state: logs them while recording, and keeps the undo stack both the live game and a replay rebuild. */
export class CommandRunner {
  log: Command[] = [];
  undoStack: Snapshot[] = [];
  checkpoints: Checkpoint[] = [];
  private lastDay = -1;
  /** recording: false for a charter loaded from a save (a replay cannot cross a load), and while a replay plays */
  constructor(public state: GameState, public header: ReplayHeader | null, public recording = header !== null) {
    this.checkpoint();
  }
  exec(op: string, ...args: unknown[]): CommandResult {
    const fn = OPS[op];
    if (!fn) throw new Error(`unknown command ${op}`);
    const cmd: Command = { t: this.state.tick, op, args };
    if (this.recording) this.log.push(cmd);
    return fn(this.state, this, args as any[]);
  }
  /** After each tick: a checkpoint at the turn of each day. */
  checkpoint(): void {
    const s = this.state;
    if (s.day === this.lastDay) return;
    this.lastDay = s.day;
    this.checkpoints.push([s.day, s.rngState >>> 0, Math.round(s.treasury), s.population]);
  }
  /** The replay file of what has been recorded so far. */
  toFile(build: string): ReplayFile {
    if (!this.header) throw new Error('this charter was loaded from a save: a replay begins with a new charter');
    return { replay: 1, build, header: this.header, commands: this.log.slice(), checkpoints: this.checkpoints.slice(), endTick: this.state.tick, checksum: checksum(this.state) };
  }
}

/** An FNV-1a hash of the serialized state: two runs that end in the same state end with the same checksum. */
export function checksum(s: GameState): string {
  const text = serialize(s);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** A new charter from a header, with the module state a new game resets (the path cache, the dev's instant building). */
export function stateFromHeader(h: ReplayHeader): GameState {
  if (h.faction !== undefined && h.faction !== 'vellish') throw new SaveVersionError(parkedPeopleMessage(String(h.faction)));
  const s = h.scenario === 'daily' ? createChallenge(h.name, h.challenge) : h.scenario === 'valley' ? createGame(h.seed, h.name, 'valley', h.faction) : createScenario(h.seed, h.name, h.scenario as Scenario, h.faction);
  construction.instant = false;
  recomputeAll(s);
  bumpRoadVersion();
  return s;
}

/** Feeds a replay's commands into a running state: before each tick, every command stamped with the current tick. */
export class ReplayPlayer {
  runner: CommandRunner;
  next = 0;
  constructor(public file: ReplayFile, state: GameState) {
    const parked = file.commands.find((c) => PARKED_OPS.includes(c.op));
    if (parked) throw new SaveVersionError(parkedContentMessage(`the "${parked.op}" command`));
    this.runner = new CommandRunner(state, file.header, false);
  }
  get state(): GameState { return this.runner.state; }
  /** Apply the commands due now. Returns false if a command's tick has passed without it (the replay has diverged). */
  feed(): boolean {
    const cmds = this.file.commands;
    while (this.next < cmds.length && cmds[this.next].t === this.state.tick) { const c = cmds[this.next++]; this.runner.exec(c.op, ...c.args); }
    return !(this.next < cmds.length && cmds[this.next].t < this.state.tick);
  }
  get done(): boolean { return this.next >= this.file.commands.length && this.state.tick >= this.file.endTick; }
  /** The first day whose checkpoint differs from the recording's, or −1. */
  firstDivergence(): number {
    const a = this.file.checkpoints;
    const b = this.runner.checkpoints;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i].join() !== b[i].join()) return a[i][0];
    return -1;
  }
}

export interface ReplayVerdict { matches: boolean; checksum: string; expected: string; divergedOnDay: number; ticks: number }
/** Run a replay headless to its end and say whether it reproduces its recording. */
export function verifyReplay(file: ReplayFile): ReplayVerdict {
  const p = new ReplayPlayer(file, stateFromHeader(file.header));
  for (let guard = 0; guard < 10_000_000; guard++) {
    if (!p.feed()) break;
    if (p.done) break;
    if (p.state.gameOver) break;
    tick(p.state);
    p.runner.checkpoint();
  }
  const sum = checksum(p.state);
  return { matches: sum === file.checksum, checksum: sum, expected: file.checksum, divergedOnDay: p.firstDivergence(), ticks: p.state.tick };
}
