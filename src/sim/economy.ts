import { factionOf, milestonesOf } from '../data/factions';
/** Daily tithe: taxes and upkeep. */
import { inFenNex } from './lore';
import { quarterOf } from './districts';
import { BUILDING_BY_KEY, ROAD_BY_TYPE, WALL_UPKEEP } from './catalog';
import { Zone, type Building, type GameState } from './types';
import { forEachBuilding, pushMessage } from './world';
import { edictOn, edictUpkeep, modifierSum } from './edicts';
import { capacityOf } from './growth';

export function taxOf(state: GameState, zone: Zone): number {
  switch (zone) {
    case Zone.Hearth: return state.taxRates.hearth;
    case Zone.Market: return state.taxRates.market;
    case Zone.Craft: {
      // a cap is a ceiling: two caps give the lower one, not their sum
      let cap = 0;
      for (const m of state.modifiers) if (m.kind === 'craftTax' && !m.district && (cap === 0 || m.value < cap)) cap = m.value;
      return cap > 0 ? Math.min(state.taxRates.craft, cap) : state.taxRates.craft;
    }
    case Zone.Arcane: return state.taxRates.arcane;
    default: return 0;
  }
}

/** Projected ledger for the current day (used for the UI and for the actual daily collection). */
export function computeLedger(state: GameState) {
  const l = { taxHearth: 0, taxMarket: 0, taxCraft: 0, taxArcane: 0, artifacts: 0, trade: 0, upkeepRoads: 0, upkeepBuildings: 0, upkeepEdicts: 0, grants: 0, net: 0 };
  const unrestMod = (1 - state.unrest * 0.5) * (1 + modifierSum(state, 'tithe'));
  // a Market Square's trade: markets within 8 of a square pay 15 % more
  const squares = state.buildings.filter((q) => q && q.kind === 'square' && q.state === 'ok') as Building[];
  const nearSquare = (b: Building) => squares.some((q) => Math.abs(q.x - b.x) <= 8 && Math.abs(q.y - b.y) <= 8);
  forEachBuilding(state, (b) => {
    const def = BUILDING_BY_KEY[b.kind];
    if (b.state === 'ruin') return;
    if (def.category === 'zone') {
      if (b.state !== 'ok') return;
      const occupants = def.zone === Zone.Hearth ? b.residents : b.workers;
      const rate = taxOf(state, def.zone!) / 10;
      const levelMult = 1 + (b.level - 1) * 0.35;
      const happyMod = 0.6 + (b.happiness / 100) * 0.6;
      const t = occupants * (def.tax ?? 0) * rate * levelMult * happyMod * unrestMod;
      switch (def.zone) {
        case Zone.Hearth: l.taxHearth += t; break;
        case Zone.Market: { const q = quarterOf(state, b); if (!inFenNex(state, b) && q !== 'temple') l.taxMarket += t * (edictOn(state, 'lanternlevy', b) ? 1.2 : 1) * (q === 'market' ? 1.1 : 1) * (nearSquare(b) ? 1.15 : 1); break; }
        case Zone.Craft: l.taxCraft += t; break;
        case Zone.Arcane: l.taxArcane += t; break;
      }
    } else {
      l.upkeepBuildings += def.upkeep * (b.state === 'abandoned' ? 0.5 : 1) * (quarterOf(state, b) === 'scholars' ? 1.1 : 1);
    }
  });
  for (let i = 0; i < state.road.length; i++) {
    if (state.road[i]) l.upkeepRoads += ROAD_BY_TYPE[state.road[i]].upkeep;
    if (state.wall[i]) l.upkeepRoads += WALL_UPKEEP;
  }
  l.upkeepEdicts = edictUpkeep(state);
  l.artifacts = state.artifactsSold;
  l.trade = state.tradeIncomeToday;
  // exports are already banked when they happen; shown for information
  l.net = l.taxHearth + l.taxMarket + l.taxCraft + l.taxArcane + l.artifacts - l.upkeepRoads - l.upkeepBuildings - l.upkeepEdicts;
  return l;
}

export function dailyEconomy(state: GameState): void {
  const l = computeLedger(state);
  state.treasury += l.net;
  state.ledger = l;
  state.ledgerHistory.push(Math.round(l.net));
  if (state.ledgerHistory.length > 30) state.ledgerHistory.shift();
  if (state.treasury < -8000) {
    state.bankruptDays++;
    if (state.bankruptDays === 1) pushMessage(state, 'The treasury is deep in debt. The Crown gives you five days to recover before the Charter is revoked.', 'bad');
    else if (state.bankruptDays < 5) pushMessage(state, `Debt warning: ${5 - state.bankruptDays} day(s) until the Crown revokes your Charter.`, 'bad');
    if (state.bankruptDays >= 5 && !state.gameOver) {
      state.gameOver = 'The Crown revokes your Charter. A new Warden-Reeve will be sent, with a smaller purse.';
      pushMessage(state, state.gameOver, 'bad');
    }
  } else state.bankruptDays = 0;
}

export function checkMilestones(state: GameState): void {
  const MS = milestonesOf(state);
  const gate = factionOf(state).rules.milestoneGate;
  // the Vellish Beacon of Eda needs the Lantern of Vell standing and lit: the Crown names no Beacon without one
  const beaconLit = () => state.faction !== 'vellish' || state.buildings.some((b) => b && b.kind === 'lantern' && b.state === 'ok' && b.lit);
  while (state.milestone + 1 < MS.length && state.population >= MS[state.milestone + 1].pop && (!gate || gate(state, state.milestone + 1)) && (state.milestone + 1 < MS.length - 1 || beaconLit())) {
    state.milestone++;
    const m = MS[state.milestone];
    state.treasury += m.grant;
    state.ledger.grants += m.grant;
    pushMessage(state, `${state.cityName} is now a ${m.name}! ${m.text} (+${m.grant} crowns)`, 'milestone');
  }
}

export function totalCapacity(state: GameState, zone: Zone): number {
  let c = 0;
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone === zone) c += capacityOf(b, state);
  });
  return c;
}
