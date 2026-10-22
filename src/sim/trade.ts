/** Trade routes: the Gloam road. The river barges, the airship, the arches and the Twin Road to a daughter wardlight are
 *  parked (scope reset phase 1c). See DESIGN.md 4.45. */
import { type Building, type GameState } from './types';

export interface TradeRoute {
  kind: 'road';
  name: string;
  at: { x: number; y: number };
  to: { x: number; y: number } | null;
  note: string;
  open: boolean;
}

function okOf(s: GameState, kind: string): Building[] {
  return s.buildings.filter((b): b is Building => !!b && b.kind === kind && b.state === 'ok');
}

/** Every route the city has, open or not, for the Ledger. */
export function tradeRoutes(s: GameState): TradeRoute[] {
  const out: TradeRoute[] = [];
  const depots = okOf(s, 'depot');
  if (depots.length) out.push({ kind: 'road', name: 'The Gloam road', at: depots[0], to: null, note: `${depots.length} depot${depots.length > 1 ? 's' : ''}: surplus sold to the Crown at ${s.trade.priceGoods.toFixed(1)} a good`, open: true });
  return out;
}
