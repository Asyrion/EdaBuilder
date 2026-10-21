/**
 * The bot's tale policy (iteration 55, M14 part 5): answer a tale greedily instead of with choice 0.
 * Each choice is played on a copy of the state and the copy is scored; the best gain wins, the lowest index on a tie.
 * The live state is never touched (its rng included), so a run with the policy stays deterministic.
 */
import { VELLISH_HAPPINESS, milestonesOf } from '../data/factions';
import { computeLedger } from './economy';
import { resolveEvent } from './events';
import type { GameState, Modifier } from './types';

/** Crowns a timed effect is worth per unit of its value per day, for this city (a first guess the balance runs settle). */
function modifierWeight(s: GameState, kind: Modifier['kind'], happyW: number): number {
  const folk = Math.max(50, s.population);
  switch (kind) {
    case 'happiness': return happyW;
    case 'unrest': return -15 * happyW; // unrest costs every building 15 happiness a unit
    case 'health': return 8 * happyW; // the hearths' "health of the city" term, and fewer deaths
    case 'deaths': return -folk * 0.05;
    case 'watch': return 5 * happyW;
    case 'mana': return s.manaSupply * (s.brownout > 0 ? 3 : 1);
    case 'goods': return Math.max(20, s.goodsProduced) * 2;
    case 'price': return Math.max(20, s.trade.exported) * 2;
    case 'gloamHold': return 20;
    case 'rain': return 20;
    case 'barges': return 30;
    case 'wrights': return -30;
    default: return 0; // tithe and craftTax reach the score through ten days of the ledger
  }
}

/** What the city holds, in crowns: the purse, ten days of the ledger, the timed effects, favour, standings, relics and roofs. */
export function worth(s: GameState): number {
  if (s.gameOver) return -1e9;
  const next = s.milestone + 1;
  const underGate = s.faction === 'vellish' && next < milestonesOf(s).length && s.happiness < VELLISH_HAPPINESS(next) + 2;
  const happyW = Math.max(5, s.population * 0.02) * (underGate ? 3 : 1);
  let w = s.treasury < 0 ? s.treasury * 3 : s.treasury;
  w -= s.loan;
  w += computeLedger(s).net * 10;
  for (const m of s.modifiers) {
    const days = Math.max(0, m.until - s.day);
    if (!days) continue;
    w += m.value * days * modifierWeight(s, m.kind, happyW) * (m.district === undefined ? 1 : 0.5);
  }
  w += s.crownFavour * 40;
  for (const v of Object.values(s.guilds.standing)) w += v * 15;
  w += s.educated * 20000;
  w += s.relicStock * 120;
  let roofs = 0;
  for (const b of s.buildings) if (b && b.state === 'ok') roofs++;
  w += roofs * 400 + s.population * 3;
  w -= s.unrest * 3000;
  w += s.happiness * happyW;
  return w;
}

export interface TaleAnswer { choice: number; amount?: number; gain: number }

/** The best answer to the pending tale by `worth`, each choice tried on a copy (a slider at none and at all). */
export function chooseTale(s: GameState): TaleAnswer {
  const pe = s.pendingEvent;
  if (!pe) return { choice: 0, gain: 0 };
  const base = worth(s);
  let best: TaleAnswer = { choice: 0, gain: -Infinity };
  pe.choices.forEach((c, k) => {
    for (const amount of c.slider ? [0, c.slider.max] : [undefined]) {
      const copy = structuredClone(s);
      resolveEvent(copy, k, amount);
      const gain = worth(copy) - base;
      if (gain > best.gain + 1e-6) best = { choice: k, amount, gain };
    }
  });
  return best;
}
