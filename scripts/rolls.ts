/** Extra rolls of the main stream: a seed's draws for the balance table (DESIGN 4.93). Roll 0 is the plain run; each extra roll on
 *  day 10 sends the run down another path from the same map, so a seed's draws show the noise a change has to clear. */
import { commitRng, rngOf } from '../src/sim/world';
import type { GameState } from '../src/sim/types';

export const ROLL_DAY = 10;

/** Draw `n` numbers from the main stream and throw them away. */
export function extraRolls(state: GameState, n: number): void {
  if (n <= 0) return;
  const r = rngOf(state);
  for (let k = 0; k < n; k++) r.next();
  commitRng(state, r);
}

/** The sixth argument of balance.ts: `roll=N`, `null` (one roll, iteration 61's flag) or nothing. */
export function rollsOf(arg: string | undefined): number {
  if (!arg) return 0;
  if (arg === 'null') return 1;
  const m = /^roll=(\d+)$/.exec(arg);
  if (!m) throw new Error(`balance.ts: the sixth argument is roll=N or null, not "${arg}"`);
  return Number(m[1]);
}
