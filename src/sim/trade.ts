/** Trade routes: the Gloam road, the river, the sky, the arches and the Twin Road to a daughter wardlight. See DESIGN.md 4.45. */
import { BUILDING_BY_KEY } from './catalog';
import { Zone, type Building, type GameState } from './types';
import { marketStockCap } from './agents';
import { riverFrozen } from './weave';
import { forEachBuilding } from './world';
import { MOORINGS } from '../data/factions';
import { hallActive } from './guilds';

export interface TradeRoute {
  kind: 'road' | 'river' | 'sky' | 'portal' | 'twin';
  name: string;
  at: { x: number; y: number };
  to: { x: number; y: number } | null;
  note: string;
  open: boolean;
}

export const TWIN_REACH = 12;
export const TWIN_LOAD = 30;
export const TWIN_TOLL = 1; // crowns per good, paid by the Crown

function okOf(s: GameState, kind: string): Building[] {
  return s.buildings.filter((b): b is Building => !!b && b.kind === kind && b.state === 'ok');
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** The depot nearest the daughter's stake within reach, and the farthest depot from it (the mother's). */
export function twinDepots(s: GameState): [Building, Building] | null {
  const d = s.daughter;
  if (!d) return null;
  const depots = okOf(s, 'depot');
  let near: Building | null = null;
  let far: Building | null = null;
  for (const b of depots) {
    const dd = dist(b, d);
    if (dd <= TWIN_REACH && (!near || dd < dist(near, d))) near = b;
    if (dd > TWIN_REACH + 8 && (!far || dd > dist(far, d))) far = b;
  }
  return near && far ? [far, near] : null;
}

/** Every route the city has, open or not, for the Ledger. */
export function tradeRoutes(s: GameState): TradeRoute[] {
  const out: TradeRoute[] = [];
  const depots = okOf(s, 'depot').concat(hallActive(s, 'cartersyard') ? okOf(s, 'cartersyard') : []);
  if (depots.length) out.push({ kind: 'road', name: 'The Gloam road', at: depots[0], to: null, note: `${depots.length} depot${depots.length > 1 ? 's' : ''}: surplus sold to the Crown at ${s.trade.priceGoods.toFixed(1)} a good${s.trade.priceHides !== undefined ? `, hides at ${s.trade.priceHides}, salted meat at ${s.trade.priceMeat}, trophies at ${s.trade.priceTrophy}` : ''}${s.trade.priceFish !== undefined ? `, smoked fish at ${s.trade.priceFish}` : ''}${s.stats.relicsSold ? `; ${s.stats.relicsSold} relics sold` : ''}${s.relicStock > 10 ? `; ${s.relicStock} loose relics in the camp` : ''}`, open: true });
  const quays = MOORINGS.flatMap((k) => okOf(s, k));
  if (quays.length) {
    const open = quays.length >= 2 && !riverFrozen(s);
    out.push({ kind: 'river', name: 'River barges', at: quays[0], to: quays[1] ?? null, note: quays.length < 2 ? 'one mooring: nowhere to send a barge' : riverFrozen(s) ? 'the river is frozen until the Thaw' : `${quays.length} moorings; ${s.stats.bargeTrips} barges sent`, open });
  }
  const docks = okOf(s, 'skydock');
  if (docks.length) out.push({ kind: 'sky', name: 'The airship of the wardlights', at: docks[0], to: null, note: s.airship.status === 'away' ? `away with ${Math.round(s.airship.goods)} goods` : `${s.stats.airshipVoyages} voyages, ${s.stats.airshipCrowns} crowns`, open: docks[0].lit });
  const arches = okOf(s, 'portalarch').filter((b) => b.lit);
  if (arches.length) out.push({ kind: 'portal', name: 'The arches', at: arches[0], to: arches[1] ?? null, note: arches.length < 2 ? 'one lit arch leads nowhere' : `${arches.length} lit arches; ${s.stats.portalTrips} cart passages`, open: arches.length >= 2 });
  if (s.daughter) {
    const td = twinDepots(s);
    out.push({ kind: 'twin', name: `The Twin Road to ${s.daughter.name}`, at: td ? td[0] : s.daughter, to: td ? td[1] : null, note: td ? `${s.stats.twinGoods} goods carried; the Crown pays ${TWIN_TOLL} a good` : `needs a depot within ${TWIN_REACH} tiles of the daughter's stake and one in the mother city`, open: !!td });
  }
  return out;
}

/** Daily: works with surplus near the mother depot fill the markets near the daughter depot; the Crown pays a toll. */
export function dailyTwinRoad(s: GameState): number {
  const td = twinDepots(s);
  if (!td) return 0;
  const [from, to] = td;
  const sources: Building[] = [];
  const sinks: Building[] = [];
  forEachBuilding(s, (b) => {
    if (b.state !== 'ok') return;
    const def = BUILDING_BY_KEY[b.kind];
    if (dist(b, from) <= TWIN_REACH && (def.zone === Zone.Craft || def.goodsRate) && b.stock > 8) sources.push(b);
    if (dist(b, to) <= TWIN_REACH && def.zone === Zone.Market && b.stock < marketStockCap(b)) sinks.push(b);
  });
  let avail = 0;
  for (const b of sources) avail += b.stock - 8;
  let need = 0;
  for (const m of sinks) need += marketStockCap(m) - m.stock;
  let load = Math.min(TWIN_LOAD, avail, need);
  if (load < 1) return 0;
  const total = load;
  for (const b of sources) { if (load <= 0) break; const t = Math.min(b.stock - 8, load); b.stock -= t; load -= t; }
  let put = total;
  for (const m of sinks) { if (put <= 0) break; const t = Math.min(marketStockCap(m) - m.stock, put); m.stock += t; put -= t; }
  s.stats.twinGoods += Math.round(total);
  s.stats.goodsDelivered += Math.round(total);
  s.treasury += Math.round(total * TWIN_TOLL);
  s.tradeIncomeToday += Math.round(total * TWIN_TOLL);
  return total;
}
