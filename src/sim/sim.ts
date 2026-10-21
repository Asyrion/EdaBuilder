/** Fixed-tick orchestrator. Deterministic given the same state and commands. */
import { dailyDrainage } from './marsh';
import { factionOf } from '../data/factions';
import { DAYS_PER_SEASON, SEASON_NAMES, SERVICE_TYPES, TICKS_PER_DAY, type GameState } from './types';
import { maybeFireCalendar, maybeFireCaravan, maybeFireEvent, maybeFireRiot, maybeFireAirship } from './events';
import { seasonOf } from './world';
import { tickCreatures, updateCreatures } from './creatures';
import { checkQuests } from './quests';
import { dailyAirship, dailyBarges } from './vehicles';
import { dailyWild } from './wild';
import { dailyWater } from './water';
import { dailyDaughter } from './charter';
import { dailyWeather, dailyWeave, hasMarvel } from './weave';
import { dailyGuilds } from './guilds';
import { dailyTwinRoad } from './trade';
import { dailyRelics } from './relics';
import { dailyConstruction, tickConstruction } from './construction';
import { dailyWalkers, tickWalkers } from './walkers';
import { setQuarterSnapshot } from './districts';
import { updateMana, updateWater } from './networks';
import { updateAllCoverage, updateCoverage, updateLandValue, updateMiasma } from './services';
import { dailyBuildings, trySpawnBuildings, updateDemand, updateSocial } from './growth';
import { checkMilestones, crownLevy, dailyEconomy } from './economy';
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
  setQuarterSnapshot(state.districtQuarters, state.district);
  if (state.gameOver || state.pendingEvent) return;
  state.tick++;
  const t = state.tick;
  tickAgents(state);
  tickCreatures(state);
  tickConstruction(state);
  tickWalkers(state);
  if (t % 10 === 0) trySpawnBuildings(state, 3);
  if (t % 50 === 20) updateCreatures(state);
  if (t % 50 === 30) checkQuests(state);
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
    dailyWeather(state); // the sky first: everything below reads it
    dailyBuildings(state);
    state.stats.fullDays = state.goodsShort === 0 ? state.stats.fullDays + 1 : 0;
    updateSocial(state);
    dailyTraffic(state);
    dailyAgents(state);
    dailyWalkers(state);
    dailyFire(state);
    dailySurge(state);
    dailyDeath(state);
    dailyGloam(state);
    dailyBarges(state);
    dailyAirship(state);
    dailyTwinRoad(state);
    dailyEconomy(state);
    dailyWild(state); // the herds, the wolves and the hunt for game (iteration 58)
    dailyWater(state); // the shoals, the fish, the reeds and the fords (iteration 60)
    dailyDrainage(state); // the Drainage edict cuts the nearest marsh to meadow (iteration 85)
    dailyDaughter(state);
    dailyWeave(state);
    dailyGuilds(state);
    dailyConstruction(state);
    dailyRelics(state);
    state.cleanDays = state.treasury > 0 && !state.buildings.some((b) => b && b.state === 'ruin') && !state.agents.some((a) => a.kind === 2) ? state.cleanDays + 1 : 0;
    checkMilestones(state);
    state.modifiers = state.modifiers.filter((m) => m.until > state.day);
    if (Object.values(state.districtQuarters).some(Boolean)) state.stats.quarterDays++;
  if (state.day % DAYS_PER_SEASON === 0) seasonMessage(state);
    if (state.day % DAYS_PER_SEASON === 0 && state.day > 0) crownLevy(state); // the season tick: the Crown's Thaw levy (iteration 54)
    maybeFireAirship(state);
    maybeFireCalendar(state);
    maybeFireCaravan(state);
    maybeFireRiot(state);
    maybeFireEvent(state);
    dailyChatter(state);
    hooks?.onDay?.(state);
  }
}

const SEASON_TEXT = [
  'The Thaw. Ice cracks on the river and the herb yards are dug over. A new year for the wardlight.',
  'Bloom. Glimherb spirals up around the node; the stills run sweet and folk are merry.',
  'Ember. Harvest carts on every road. The trees along the Gloam turn the colour of old fire.',
  'The Hush. Long nights, cold hearths that drink more mana, and the Gloam creeping closer under the dark.',
];

function seasonMessage(state: GameState): void {
  const season = seasonOf(state);
  let text = SEASON_TEXT[season];
  if (season === 3 && !factionOf(state).rules.riverFreezes) text = 'The Hush. Long nights and cold hearths; from the fifth night the Sable rises and the homes on the bank lose heart.';
  if (state.day > 0) pushMessage(state, `${SEASON_NAMES[season]} begins. ${text}`, season === 3 ? 'warn' : 'milestone', true);
  if (state.dirtyChunks) for (let i = 0; i < 256; i++) state.dirtyChunks.add(i);
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
