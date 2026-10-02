import { factionOf, milestonesOf } from '../data/factions';
/** Daily tithe: taxes and upkeep; and, since iteration 54, the Crown that wants: favour, the Thaw levy, debt interest and a loan. */
import { inFenNex } from './lore';
import { charterUpkeep, districtUnlockNotes, quarterOf, templeQuarterStands, TEMPLE_TITHE_SHARE } from './districts';
import { BUILDING_BY_KEY, ROAD_BY_TYPE, WALL_UPKEEP } from './catalog';
import { Zone, type Building, type GameState } from './types';
import { GROWING_HALLS, forEachBuilding, markDirtyAround, pushMessage, stakeHallName, stakeStage } from './world';
import { edictOn, edictUpkeep, modifierSum } from './edicts';
import { capacityOf } from './growth';
import { litWonders } from './weave';

// ---------- the Crown ----------
/** The Thaw levy: LEVY_RATE of the treasury above LEVY_FLOOR, each first day of the Thaw. */
export const LEVY_FLOOR = 10000;
export const LEVY_RATE = 0.05;
/** Favour 0..100, FAVOUR_NEUTRAL at the start: each point from neutral is FAVOUR_STEP off the levy and the sector prices; under FAVOUR_AUDIT the Crown's auditors withhold the next grant. */
export const FAVOUR_NEUTRAL = 50;
export const FAVOUR_STEP = 0.003;
export const FAVOUR_AUDIT = 20;
/** A debt costs DEBT_INTEREST a day; the Crown's loan is LOAN_PER_MILESTONE × milestone at LOAN_INTEREST a day; the Charter is revoked after five days under debtLine. */
export const DEBT_INTEREST = 0.01;
export const LOAN_PER_MILESTONE = 10000;
export const LOAN_INTEREST = 0.005;
export const DEBT_DAYS = 5;

export function favourFactor(state: GameState): number {
  return 1 - (state.crownFavour - FAVOUR_NEUTRAL) * FAVOUR_STEP;
}
export function addFavour(state: GameState, delta: number): void {
  state.crownFavour = Math.max(0, Math.min(100, state.crownFavour + delta));
}
/** The treasury the Charter is revoked under, after DEBT_DAYS days: −8,000 × (1 + milestone/2). */
export function debtLine(state: GameState): number {
  return -8000 * (1 + state.milestone / 2);
}
export function loanLimit(state: GameState): number {
  return LOAN_PER_MILESTONE * Math.max(1, state.milestone);
}
/** Take the Crown's loan: loanLimit crowns at LOAN_INTEREST a day, one at a time. The reason it cannot be, or null. */
export function takeLoan(state: GameState): string | null {
  if (state.loan > 0) return 'A loan is out already: repay it first';
  const amount = loanLimit(state);
  state.loan = amount;
  state.treasury += amount;
  pushMessage(state, `The Crown's loan: ${amount.toLocaleString()} crowns under the wyrm-seal, at half a crown in a hundred a day until repaid.`, 'info', true);
  return null;
}
export function repayLoan(state: GameState): string | null {
  if (state.loan <= 0) return 'No loan is out';
  if (state.treasury < state.loan) return `Needs ${Math.round(state.loan).toLocaleString()} crowns in the treasury`;
  state.treasury -= state.loan;
  pushMessage(state, `${Math.round(state.loan).toLocaleString()} crowns ride back to Vell-on-Sable: the Crown's loan is repaid.`, 'good', true);
  state.loan = 0;
  return null;
}
/** The grant a milestone pays this city: lifted a tenth by each lit wonder hall; withheld while the Crown's favour is under FAVOUR_AUDIT. */
export function grantFor(state: GameState, grant: number): number {
  if (state.crownFavour < FAVOUR_AUDIT) return 0;
  return Math.round(grant * (1 + 0.1 * litWonders(state).length));
}
/** The levy the Crown would take at the next Thaw from the treasury as it stands. */
export function levyDue(state: GameState): number {
  return Math.round(Math.max(0, state.treasury - LEVY_FLOOR) * LEVY_RATE * favourFactor(state));
}
/** The first day of the Thaw: the Crown levies LEVY_RATE of the treasury above LEVY_FLOOR, less or more by favour. */
export function crownLevy(state: GameState): void {
  if (state.day % 120 !== 0 || state.day <= 0) return;
  const levy = levyDue(state);
  if (levy < 1) { pushMessage(state, `The Crown's assessors find the treasury under ${LEVY_FLOOR.toLocaleString()} crowns and levy nothing this Thaw.`, 'info'); return; }
  state.treasury -= levy;
  state.stats.levies++;
  state.stats.levied += levy;
  state.ledger.levy = levy;
  const f = favourFactor(state);
  pushMessage(state, `The Crown's Thaw levy: ${levy.toLocaleString()} crowns, ${Math.round(LEVY_RATE * 100)} % of the treasury above ${LEVY_FLOOR.toLocaleString()}${f !== 1 ? ` (${f < 1 ? 'less' : 'more'} by ${Math.round(Math.abs(1 - f) * 100)} % for the Crown's favour)` : ''}, ride to Vell-on-Sable under guard.`, 'warn', true);
}

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
  const l = { taxHearth: 0, taxMarket: 0, taxCraft: 0, taxArcane: 0, artifacts: 0, trade: 0, upkeepRoads: 0, upkeepBuildings: 0, upkeepEdicts: 0, upkeepCharters: 0, charterTithe: 0, interest: 0, levy: 0, grants: 0, net: 0 };
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
  l.upkeepCharters = charterUpkeep(state); // a crown a building a day in every chartered district (iteration 54)
  l.charterTithe = templeQuarterStands(state) ? l.taxMarket * TEMPLE_TITHE_SHARE : 0; // the Vigils take a tenth of the whole city's market tithe
  l.interest = (state.treasury < 0 ? -state.treasury * DEBT_INTEREST : 0) + state.loan * LOAN_INTEREST;
  l.artifacts = state.artifactsSold;
  l.trade = state.tradeIncomeToday;
  // exports are already banked when they happen; shown for information
  l.net = l.taxHearth + l.taxMarket + l.taxCraft + l.taxArcane + l.artifacts - l.upkeepRoads - l.upkeepBuildings - l.upkeepEdicts - l.upkeepCharters - l.charterTithe - l.interest;
  return l;
}

export function dailyEconomy(state: GameState): void {
  const l = computeLedger(state);
  state.treasury += l.net;
  state.ledger = l;
  state.ledgerHistory.push(Math.round(l.net + l.trade)); // trade joins the history (iteration 54)
  if (state.ledgerHistory.length > 30) state.ledgerHistory.shift();
  const line = debtLine(state);
  if (state.treasury < line) {
    state.bankruptDays++;
    if (state.bankruptDays === 1) pushMessage(state, `The treasury is under the Crown's line of ${Math.round(line).toLocaleString()} crowns. The Crown gives you ${DEBT_DAYS} days to recover before the Charter is revoked.`, 'bad');
    else if (state.bankruptDays < DEBT_DAYS) pushMessage(state, `Debt warning: ${DEBT_DAYS - state.bankruptDays} day(s) until the Crown revokes your Charter.`, 'bad');
    if (state.bankruptDays >= DEBT_DAYS && !state.gameOver) {
      state.gameOver = 'The Crown revokes your Charter. A new Warden-Reeve will be sent, with a smaller purse.';
      pushMessage(state, state.gameOver, 'bad');
    }
  } else state.bankruptDays = 0;
}

export function checkMilestones(state: GameState): void {
  const MS = milestonesOf(state);
  const gate = factionOf(state).rules.milestoneGate;
  // the Tallowkin's lit share must hold the next gate three days running (iteration 54); the counter moves once a day, here
  const held = factionOf(state).rules.gateHold;
  if (held) state.litHeld = held(state, state.milestone + 1) ? state.litHeld + 1 : 0;
  // the Vellish Beacon of Eda needs the Lantern of Vell standing and lit: the Crown names no Beacon without one
  const beaconLit = () => state.faction !== 'vellish' || state.buildings.some((b) => b && b.kind === 'lantern' && b.state === 'ok' && b.lit);
  const stage0 = stakeStage(state);
  while (state.milestone + 1 < MS.length && state.population >= MS[state.milestone + 1].pop && (!gate || gate(state, state.milestone + 1)) && (state.milestone + 1 < MS.length - 1 || beaconLit())) {
    state.milestone++;
    const m = MS[state.milestone];
    const halls = litWonders(state).length; // every lit wonder hall lifts the grant a tenth (iteration 53)
    const grant = grantFor(state, m.grant);
    state.treasury += grant;
    state.ledger.grants += grant;
    if (grant > 0) pushMessage(state, `${state.cityName} is now a ${m.name}! ${m.text} (+${grant.toLocaleString()} crowns${halls ? `, a tenth more for each of ${halls} lit wonder hall${halls === 1 ? '' : 's'}` : ''})`, 'milestone');
    else pushMessage(state, `${state.cityName} is now a ${m.name}! ${m.text} The Crown's auditors hold the grant of ${m.grant.toLocaleString()} crowns: its favour stands at ${Math.round(state.crownFavour)}, under ${FAVOUR_AUDIT}.`, 'milestone');
    for (const line of districtUnlockNotes(state.milestone)) pushMessage(state, line, 'milestone');
    if (held) state.litHeld = 0;
  }
  if (stakeStage(state) !== stage0) {
    forEachBuilding(state, (b) => { if (GROWING_HALLS.includes(b.kind)) markDirtyAround(state, b.x, b.y); });
    pushMessage(state, `The halls are raised anew: the Founding Stake, the Guildhall and the Temple become ${stakeHallName(state).replace(/^the /, '')}s of their kind.`, 'info');
  }
}

export function totalCapacity(state: GameState, zone: Zone): number {
  let c = 0;
  forEachBuilding(state, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone === zone) c += capacityOf(b, state);
  });
  return c;
}
