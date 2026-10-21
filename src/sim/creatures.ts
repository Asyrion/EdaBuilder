/**
 * Creatures: the agents that move off the roads. Since the scope reset (phase 1b, docs/PARKED.md) these are the wild's
 * herds (wild.ts), the fishers' boats (water.ts) and the airship of the Sky-Dock (vehicles.ts); the ambient creatures,
 * the Gloam-hounds, the dragons, the wyrm, the golems, the skyrays and the war-tigers are parked.
 */
import { airshipArrives } from './vehicles';
import { AgentKind, MAP_W, TICKS_PER_SEC, type GameState, type Species } from './types';
import { timeOfDay } from './world';
import { isWild, tickWildAgent } from './wild';
import { tickBoat } from './water';
import { Rng } from '../core/rng';

export function creatureCount(state: GameState, species?: Species): number {
  let n = 0;
  for (const a of state.agents) if (a.kind === AgentKind.Creature && (!species || a.species === species)) n++;
  return n;
}

export function isNight(state: GameState): boolean {
  const t = timeOfDay(state);
  return t < 0.24 || t > 0.78;
}

/** Every 50 ticks: the airship that has come home leaves the map (the wild and the boats keep their own numbers). */
export function updateCreatures(state: GameState): void {
  state.agents = state.agents.filter((a) => !(a.kind === AgentKind.Creature && a.species === 'airship' && a.timer < 0));
}

/** Every tick: the wild and the boats move on a stream of their own, the airship on no stream at all. */
export function tickCreatures(state: GameState): void {
  const dt = 1 / TICKS_PER_SEC;
  let wr: Rng | null = null; // the wild moves on a stream of its own (wild.ts), so herds add no roll to the main one
  const night = isNight(state);
  for (const a of state.agents) {
    if (a.kind !== AgentKind.Creature) continue;
    if (isWild(a.species)) {
      if (!wr) wr = new Rng((Math.imul(state.seed ^ 0x9e3779b9, 31) + Math.imul(state.tick, 2654435761)) >>> 0);
      tickWildAgent(state, a, wr, night, dt);
      continue;
    }
    if (a.species === 'boat') { // the fishers' boats row on the same side stream (water.ts, iteration 60)
      if (!wr) wr = new Rng((Math.imul(state.seed ^ 0x9e3779b9, 31) + Math.imul(state.tick, 2654435761)) >>> 0);
      tickBoat(state, a, wr, night, dt);
      continue;
    }
    if (a.species === 'airship') {
      // phase 0: leaving to the map edge (climbing); phase 1: returning to the dock (descending near it)
      if (a.path.length === 0) { a.timer = -1; continue; }
      const tx = (a.path[0] % MAP_W) + 0.5;
      const ty = ((a.path[0] / MAP_W) | 0) + 0.5;
      const dx = tx - a.x;
      const dy = ty - a.y;
      const dist = Math.hypot(dx, dy);
      const sp = a.speed * dt;
      a.alt = a.phase === 0 ? Math.min(70, (a.alt ?? 0) + 0.6) : dist < 12 ? Math.max(10, (a.alt ?? 70) - 0.6) : 70;
      if (dist <= sp) {
        a.x = tx; a.y = ty; a.path = []; a.timer = -1;
        if (a.phase === 1) airshipArrives(state);
      } else { a.x += (dx / dist) * sp; a.y += (dy / dist) * sp; a.dir = dx > 0 ? 0 : 2; }
    }
  }
}
