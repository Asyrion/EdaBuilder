/** Fixed-tick orchestrator. Deterministic given the same state and commands. */
import { SERVICE_TYPES, TICKS_PER_DAY, type GameState } from './types';
import { updateMana, updateWater } from './networks';
import { updateAllCoverage, updateCoverage, updateLandValue, updateMiasma } from './services';
import { dailyBuildings, trySpawnBuildings, updateDemand, updateSocial } from './growth';
import { checkMilestones, dailyEconomy } from './economy';
import { dailyAgents, dailyTraffic, tickAgents } from './agents';
import { dailyDeath, dailyFire, dailyGloam, dailySurge, recomputeGloamDist } from './hazards';
import { pushMessage } from './world';
import { FLAVOR_CHATTER } from '../data/flavor';
import { rngOf, commitRng } from './world';

export interface SimHooks {
  onDay?: (state: GameState) => void;
}

/** Full recompute of derived layers (after load or big edits). */
export function recomputeAll(state: GameState): void {
  updateMana(state);
  updateWater(state);
  updateMiasma(state);
  updateAllCoverage(state);
  recomputeGloamDist(state);
  updateLandValue(state);
  updateDemand(state);
}

export function tick(state: GameState, hooks?: SimHooks): void {
  if (state.gameOver) return;
  state.tick++;
  const t = state.tick;
  tickAgents(state);
  if (t % 10 === 0) trySpawnBuildings(state, 3);
  const slice = t % 50;
  if (slice === 5) updateMana(state);
  else if (slice === 15) updateWater(state);
  else if (slice === 25) updateMiasma(state);
  else if (slice === 35) updateLandValue(state);
  else if (slice === 45) updateDemand(state);
  // one coverage type every 6 ticks (all 8 within ~50 ticks)
  if (t % 6 === 0) updateCoverage(state, SERVICE_TYPES[Math.floor(t / 6) % SERVICE_TYPES.length]);
  if (t % TICKS_PER_DAY === 0) {
    state.day++;
    dailyBuildings(state);
    updateSocial(state);
    dailyEconomy(state);
    dailyTraffic(state);
    dailyAgents(state);
    dailyFire(state);
    dailySurge(state);
    dailyDeath(state);
    dailyGloam(state);
    checkMilestones(state);
    dailyChatter(state);
    hooks?.onDay?.(state);
  }
}

function dailyChatter(state: GameState): void {
  const rng = rngOf(state);
  if (state.population > 10 && rng.chance(0.18)) {
    const pool = FLAVOR_CHATTER.filter((c) => c.when(state));
    if (pool.length) pushMessage(state, `"${rng.pick(pool).text}"`, 'info');
  }
  commitRng(state, rng);
}

/** Advance n ticks (for headless runs and tests). */
export function run(state: GameState, ticks: number, hooks?: SimHooks): void {
  for (let i = 0; i < ticks; i++) tick(state, hooks);
}
