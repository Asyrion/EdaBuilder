/** JSON serialization of GameState. Typed arrays are base64-encoded. */
import { SAVE_VERSION, type GameState } from './types';
import { markAllDirty } from './world';

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(s, 'binary').toString('base64');
}
function fromB64(s: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Everything is saved, the derived layers too (scope reset phase 1d, save version 8): a load rebuilds nothing, so a charter
 *  saved and loaded runs on exactly as it would have. Only the render's bookkeeping stays out. */
const SKIP = new Set(['dirtyChunks', 'zoneList', 'zoneListDirty']);

function packArray(v: Uint8Array | Int32Array | Uint16Array): Record<string, string> {
  if (v instanceof Uint8Array) return { u8: toB64(v) };
  if (v instanceof Int32Array) return { i32: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  return { u16: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
}
function isPacked(v: unknown): v is Record<string, string> {
  return !!v && typeof v === 'object' && ('u8' in v || 'i32' in v || 'u16' in v);
}
function unpackArray(v: Record<string, string>): Uint8Array | Int32Array | Uint16Array {
  if ('u8' in v) return fromB64(v.u8);
  const b = fromB64(v.i32 ?? v.u16);
  return 'i32' in v ? new Int32Array(b.buffer, b.byteOffset, b.byteLength / 4) : new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
}

export function serialize(state: GameState): string {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (SKIP.has(k)) continue;
    if (v instanceof Uint8Array || v instanceof Int32Array || v instanceof Uint16Array) o[k] = packArray(v);
    else if (k === 'coverage') o[k] = Object.fromEntries(Object.entries(v as Record<string, Uint8Array>).map(([t, a]) => [t, packArray(a)]));
    else o[k] = v;
  }
  return JSON.stringify(o);
}

/** A save this Wardlight cannot read: refused with a reason the title screen and the import show (iteration 55). */
export class SaveVersionError extends Error {}
/** The refusal of a save (or a replay) from before the scope reset's save version 8 (phase 1d, docs/RESET_PLAN.md §9). */
export function oldSaveMessage(version: number | string): string {
  return `This charter was saved by an older Wardlight (version ${version}). The game was cut back to its core, and old charters cannot be loaded: found a new one.`;
}

export function deserialize(json: string, fresh: (seed: number) => GameState): GameState {
  const o = JSON.parse(json) as Record<string, any>;
  if (typeof o.seed !== 'number') throw new Error('Not a Wardlight save');
  const saved = typeof o.version === 'number' ? o.version : 6;
  if (saved > SAVE_VERSION) throw new SaveVersionError(`This charter was saved by a newer Wardlight (save version ${saved}); this one reads version ${SAVE_VERSION}.`);
  if (saved < SAVE_VERSION) throw new SaveVersionError(oldSaveMessage(saved));
  const state = fresh(o.seed);
  for (const [k, v] of Object.entries(o)) {
    if (!(k in state)) continue;
    if (isPacked(v)) (state as any)[k] = unpackArray(v);
    else if (k === 'coverage') state.coverage = Object.fromEntries(Object.entries(v as Record<string, Record<string, string>>).map(([t, a]) => [t, unpackArray(a)])) as GameState['coverage'];
    else (state as any)[k] = v;
  }
  state.zoneListDirty = true;
  state.dirtyChunks = new Set();
  markAllDirty(state);
  return state;
}
