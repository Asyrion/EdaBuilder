/** Vehicles: floating carts, river barges (Quay), the airship (Sky-Dock). See DESIGN.md 4.36. The drake riders, the golem haulers,
 *  the Tide drakes' barges and the Dock's wyvern are parked (scope reset, phase 1b). */
import { BUILDING_BY_KEY } from './catalog';
import { isGoodsSource } from './growth';
import { AgentKind, MAP_H, MAP_W, Zone, idx, inBounds, isWater, type Agent, type Building, type GameState } from './types';
import { commitRng, forEachBuilding, pushMessage, rngOf } from './world';
import { marketStockCap } from './agents';
import { effects } from './hazards';
import { galeToday } from './gales';
import { modifierSum } from './edicts';
import { seasonOf } from './world';
import { MOORINGS } from './catalog';

export const FLOAT_VARIANT = 3; // cart variant: hovers, ignores congestion, 1 mana while moving
export const BARGE_VARIANT = 4; // cart variant: travels water between quays
export const BARGE_LOAD = 40;
export const QUAY_REACH = 8;
export const AIRSHIP_LOAD = 200;
export const AIRSHIP_DAYS = 10;

// ---------- floating carts ----------
export function floatingTarget(s: GameState): number {
  let n = 0;
  forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Arcane && b.level >= 3 && b.state === 'ok') n++; });
  return n * 2;
}
export function floatingCarts(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Cart && a.variant === FLOAT_VARIANT) n++;
  return n;
}
/** Mana drawn by floating carts that are moving right now. */
export function floatingMana(s: GameState): number {
  let n = 0;
  for (const a of s.agents) if (a.kind === AgentKind.Cart && a.variant === FLOAT_VARIANT && a.pathIdx < a.path.length) n++;
  return n;
}

export function waterPath(s: GameState, start: number, goal: number, maxNodes = 9000): number[] | null {
  if (!isWater(s.terrain[start]) || !isWater(s.terrain[goal])) return null;
  const gx = goal % MAP_W;
  const gy = (goal / MAP_W) | 0;
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open: [number, number][] = [[0, start]];
  g.set(start, 0);
  const closed = new Set<number>();
  let expanded = 0;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path = [cur];
      let c = cur;
      while (came.has(c)) { c = came.get(c)!; path.push(c); }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) return null;
    const x = cur % MAP_W;
    const y = (cur / MAP_W) | 0;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of nb) {
      if (!inBounds(nx, ny)) continue;
      const j = idx(nx, ny);
      if (!isWater(s.terrain[j])) continue;
      const ng = g.get(cur)! + 1;
      if (ng < (g.get(j) ?? Infinity)) {
        g.set(j, ng);
        came.set(j, cur);
        open.push([ng + Math.abs(nx - gx) + Math.abs(ny - gy), j]);
      }
    }
  }
  return null;
}

export function waterTileOf(s: GameState, b: Building): number {
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (inBounds(x, y) && isWater(s.terrain[idx(x, y)])) return idx(x, y);
    }
  return -1;
}

// ---------- barges ----------
/** Every mooring a barge may sail from: the quays. */
export function quays(s: GameState): Building[] {
  const out: Building[] = [];
  forEachBuilding(s, (b) => { if (MOORINGS.includes(b.kind) && b.state === 'ok') out.push(b); });
  return out;
}
function near(s: GameState, q: Building, test: (b: Building) => boolean): Building[] {
  const out: Building[] = [];
  forEachBuilding(s, (b) => { if (b.state === 'ok' && Math.abs(b.x - q.x) <= QUAY_REACH && Math.abs(b.y - q.y) <= QUAY_REACH && test(b)) out.push(b); });
  return out;
}

/** Send one barge from a mooring to the other mooring whose markets are emptiest. Returns the goods sent, 0 if none sailed. */
function sendBarge(s: GameState, from: Building, qs: Building[]): { total: number; to: Building } | null {
  const sources = near(s, from, (b) => isGoodsSource(b) && b.stock > 8);
  const avail = sources.reduce((n, b) => n + (b.stock - 8), 0);
  if (avail < 10) return null;
  // the emptiest destination
  let best: Building | null = null;
  let bestNeed = 0;
  for (const to of qs) {
    if (to === from) continue;
    const markets = near(s, to, (b) => BUILDING_BY_KEY[b.kind].zone === Zone.Market);
    const need = markets.reduce((n, m) => n + Math.max(0, marketStockCap(m) - m.stock), 0);
    if (need > bestNeed) { bestNeed = need; best = to; }
  }
  if (!best || bestNeed < 10) return null;
  const w0 = waterTileOf(s, from);
  const w1 = waterTileOf(s, best);
  if (w0 < 0 || w1 < 0) return null;
  const path = waterPath(s, w0, w1);
  if (!path) return null;
  let load = Math.min(seasonOf(s) === 0 ? BARGE_LOAD * 1.5 : BARGE_LOAD, avail, bestNeed);
  const total = load;
  for (const src of sources) {
    if (load <= 0) break;
    const t = Math.min(src.stock - 8, load);
    src.stock -= t;
    load -= t;
  }
  const a: Agent = {
    id: s.nextAgentId++, kind: AgentKind.Cart, x: (w0 % MAP_W) + 0.5, y: ((w0 / MAP_W) | 0) + 0.5, path, pathIdx: 0, speed: 0.9,
    homeId: from.id, targetId: best.id, timer: 0, variant: BARGE_VARIANT, dir: 0, load: total,
  };
  s.agents.push(a);
  s.stats.bargeTrips++;
  effects.push({ x: from.x, y: from.y, kind: 'bell', tick: s.tick });
  return { total, to: best };
}

/** Daily: every quay sends a barge to a quay whose markets are emptier, along the water. */
export function dailyBarges(s: GameState): void {
  const qs = quays(s);
  if (qs.length < 2 || galeToday(s) || modifierSum(s, 'barges') < 0) return; // the bargemen may be on strike
  const rng = rngOf(s);
  for (const from of qs) {
    if (s.agents.some((a) => a.kind === AgentKind.Cart && a.variant === BARGE_VARIANT && a.homeId === from.id)) continue;
    const sent = sendBarge(s, from, qs);
    if (sent && rng.chance(0.15)) pushMessage(s, `A barge casts off from the quay at (${from.x},${from.y}) with ${Math.round(sent.total)} goods for the markets at (${sent.to.x},${sent.to.y}).`, 'info');
  }
  commitRng(s, rng);
}

export function deliverBarge(s: GameState, a: Agent): void {
  const to = s.buildings.find((b) => b && b.id === a.targetId);
  if (!to) return;
  const markets = near(s, to, (b) => BUILDING_BY_KEY[b.kind].zone === Zone.Market).sort((x, y) => x.stock - y.stock);
  let left = a.load;
  for (const m of markets) {
    if (left <= 0) break;
    const room = marketStockCap(m) - m.stock;
    const t = Math.min(room, left, Math.max(6, left / 2));
    m.stock += t;
    left -= t;
  }
  s.goodsSold += a.load - left;
  s.stats.goodsDelivered += a.load - left;
  a.load = 0;
}

// ---------- airship ----------
export interface AirshipState { status: 'none' | 'docked' | 'away'; goods: number; since: number; voyages: number }
/** Surplus goods gathered from the works' shelves for a run beyond the Gloam, up to `cap`; nothing under 20. */
function gatherSurplus(s: GameState, cap: number): number {
  let goods = 0;
  forEachBuilding(s, (b) => {
    if (goods >= cap || !isGoodsSource(b) || b.state !== 'ok' || b.stock <= 10) return;
    const t = Math.min(b.stock - 10, cap - goods);
    b.stock -= t;
    goods += t;
  });
  return goods;
}
export function skyDock(s: GameState): Building | null {
  let out: Building | null = null;
  forEachBuilding(s, (b) => { if (b.kind === 'skydock' && b.state === 'ok') out = out ?? b; });
  return out;
}

/** Daily: the airship leaves on day 3 of each season with the city's surplus and returns ten days later with crowns. */
export function dailyAirship(s: GameState): void {
  const dock = skyDock(s);
  const air = s.airship;
  if (!dock) {
    if (air.status !== 'none') { air.status = 'none'; s.agents = s.agents.filter((a) => !(a.kind === AgentKind.Creature && a.species === 'airship')); }
    return;
  }
  if (air.status === 'none') air.status = 'docked';
  if (air.status === 'docked' && dock.lit && s.day % 30 === 3) {
    const goods = gatherSurplus(s, AIRSHIP_LOAD);
    if (goods < 20) return;
    air.status = 'away';
    air.goods = goods;
    air.since = s.day;
    air.voyages++;
    s.stats.airshipVoyages++;
    spawnAirship(s, dock, true);
    effects.push({ x: dock.x, y: dock.y, kind: 'horn', tick: s.tick });
    pushMessage(s, `The airship casts off from the Sky-Dock with ${Math.round(goods)} goods for the wardlights beyond the Gloam. Ten days there and back.`, 'info', true, { x: dock.x, y: dock.y });
  } else if (air.status === 'away' && s.day - air.since >= AIRSHIP_DAYS && !s.agents.some((a) => a.kind === AgentKind.Creature && a.species === 'airship')) {
    spawnAirship(s, dock, false);
  }
}

function spawnAirship(s: GameState, dock: Building, leaving: boolean): void {
  const cx = dock.x + 1;
  const cy = dock.y + 1;
  const edge = cx < MAP_W / 2 ? MAP_W - 2 : 1;
  const a: Agent = {
    id: s.nextAgentId++, kind: AgentKind.Creature, x: leaving ? cx + 0.5 : edge + 0.5, y: cy + 0.5, path: [leaving ? idx(edge, cy) : idx(cx, cy)], pathIdx: 0, speed: 2.2,
    homeId: dock.id, targetId: -1, timer: 0, variant: 0, dir: 0, load: leaving ? 1 : 0, species: 'airship', anchorId: -1, ax: cx + 0.5, ay: cy + 0.5, alt: leaving ? 10 : 70, phase: leaving ? 0 : 1,
  };
  s.agents.push(a);
}

/** The airship is home: pay out. */
export function airshipArrives(s: GameState): void {
  const air = s.airship;
  const dock = skyDock(s);
  const crowns = Math.round(air.goods * s.trade.priceGoods * 1.6);
  s.treasury += crowns;
  s.stats.airshipCrowns += crowns;
  if (dock) effects.push({ x: dock.x, y: dock.y, kind: 'horn', tick: s.tick });
  air.status = 'docked';
  pushMessage(s, `The airship is home: ${Math.round(air.goods)} goods sold beyond the Gloam for ${crowns} crowns.`, 'good', true, dock ? { x: dock.x, y: dock.y } : undefined);
  air.goods = 0;
}

export { BUILDING_BY_KEY };
