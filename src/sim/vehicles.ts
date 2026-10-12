/** Vehicles: floating carts, river barges (Quay), drake riders (Drake Mews), the airship (Sky-Dock). See DESIGN.md 4.36. */
import { BUILDING_BY_KEY } from './catalog';
import { isGoodsSource } from './growth';
import { AgentKind, MAP_H, MAP_W, Zone, idx, inBounds, isWater, type Agent, type Building, type Dragon, type GameState } from './types';
import { commitRng, forEachBuilding, pushMessage, rngOf } from './world';
import { marketStockCap } from './agents';
import { effects } from './hazards';
import { riverFrozen } from './weave';
import { galeToday } from './gales';
import { modifierSum } from './edicts';
import { seasonOf } from './world';
import { MOORINGS } from '../data/factions';

export const FLOAT_VARIANT = 3; // cart variant: hovers, ignores congestion, 1 mana while moving
export const BARGE_VARIANT = 4; // cart variant: travels water between quays
export const GOLEM_VARIANT = 6; // cart variant: a Concord Warden in harness, hauling from one works (iteration 72)
export const GOLEM_LOAD = 30; // goods a golem hauler carries a trip (a donkey cart carries 12)
export const GOLEM_SPEED = 0.45; // a hauler's pace (a donkey cart's is 0.8)
export const GOLEM_REST = 20; // ticks a hauler stands at a market before turning back (a donkey rests 150 + rng 450)
export const CART_FEAR_REACH = 4; // a donkey cart balks with a Gloam-hound this near (tiles)
export const CART_BALK_TICKS = 60; // and stands this long before it tries again
export const BARGE_LOAD = 40;
export const QUAY_REACH = 8;
export const RIDER_RANGE = 40;
export const AIRSHIP_LOAD = 200;
export const AIRSHIP_DAYS = 10;
export const WYVERN_LOAD = 100; // the Sky-Dock's wyvern carries half the airship's load (iteration 73)
export const WYVERN_DAYS = 5; // and is back in half the time, needing no mana

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

// ---------- golem haulers (iteration 72) ----------
export function isGolemCart(a: Agent): boolean {
  return a.kind === AgentKind.Cart && a.variant === GOLEM_VARIANT;
}
/** The donkey carts (the stone cart 0 and the goods carts 1–2) are the ones a hound can scare; floating carts, barges and haulers are not. */
export function isDonkeyCart(a: Agent): boolean {
  return a.kind === AgentKind.Cart && a.variant <= 2;
}
/** A golem cart for a warden in harness at this works, standing on the works' road tile. No rng. */
export function spawnGolemCart(s: GameState, golem: Agent, works: Building, roadTile: number): Agent {
  const a: Agent = {
    id: s.nextAgentId++, kind: AgentKind.Cart, x: (roadTile % MAP_W) + 0.5, y: ((roadTile / MAP_W) | 0) + 0.5, path: [], pathIdx: 0, speed: GOLEM_SPEED,
    homeId: works.id, targetId: -1, timer: 0, variant: GOLEM_VARIANT, dir: 0, load: 0, golemId: golem.id,
  };
  s.agents.push(a);
  return a;
}
/** Golem carts whose warden is gone, wild or off haul duty are removed; returns how many went. */
export function pruneGolemCarts(s: GameState): number {
  const haulers = new Set<number>();
  for (const a of s.agents) if (a.kind === AgentKind.Creature && a.species === 'golem' && a.load > 0 && a.duty === 'haul') haulers.add(a.id);
  const before = s.agents.length;
  s.agents = s.agents.filter((a) => !isGolemCart(a) || (a.golemId !== undefined && haulers.has(a.golemId) && s.buildings.some((b) => b && b.id === a.homeId && b.state === 'ok')));
  return before - s.agents.length;
}

// ---------- water pathfinding ----------
/** A* over water tiles (bridges pass overhead). Returns tile indices or null. */
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
/** Every mooring a barge may sail from: quays, and the Veshari's landings. */
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

/** Send one barge from a mooring to the other mooring whose markets are emptiest; a dragon's barge carries its id. Returns the goods sent, 0 if none sailed. */
function sendBarge(s: GameState, from: Building, qs: Building[], dragonId = -1): { total: number; to: Building } | null {
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
  if (dragonId >= 0) a.dragonId = dragonId;
  s.agents.push(a);
  s.stats.bargeTrips++;
  effects.push({ x: from.x, y: from.y, kind: 'bell', tick: s.tick });
  return { total, to: best };
}

/** Daily: every quay sends a barge to a quay whose markets are emptier, along the water; then the Tide dragons swim theirs. */
export function dailyBarges(s: GameState): void {
  dailyQuayBarges(s);
  dailyTideBarges(s);
}
function dailyQuayBarges(s: GameState): void {
  const qs = quays(s);
  if (qs.length < 2 || riverFrozen(s) || galeToday(s) || modifierSum(s, 'barges') < 0) return; // the bargemen may be on strike
  const rng = rngOf(s);
  for (const from of qs) {
    if (s.agents.some((a) => a.kind === AgentKind.Cart && a.variant === BARGE_VARIANT && a.homeId === from.id && a.dragonId === undefined)) continue;
    const sent = sendBarge(s, from, qs);
    if (sent && rng.chance(0.15)) pushMessage(s, `A barge casts off from the quay at (${from.x},${from.y}) with ${Math.round(sent.total)} goods for the markets at (${sent.to.x},${sent.to.y}).`, 'info');
  }
  commitRng(s, rng);
}

/** A Tide dragon's mooring: the nearest within TIDE_REACH of its cradle. */
export const TIDE_REACH = 12;
export function tideMooring(s: GameState, d: Dragon): Building | null {
  const cradle = s.buildings.find((b) => b && b.id === d.cradleId);
  if (!cradle) return null;
  let best: Building | null = null;
  let bd = TIDE_REACH + 0.001;
  for (const q of quays(s)) {
    const dist = Math.hypot(q.x - cradle.x, q.y - cradle.y);
    if (dist < bd) { bd = dist; best = q; }
  }
  return best;
}
/** Does this dragon swim a barge: a Tide line at drake or older, radiating its aura (no role, or a warden). */
export function swimsBarges(d: Dragon): boolean {
  return d.line === 'tide' && d.stage >= 2 && (d.role === 'none' || d.role === 'warden');
}
/** Daily: every Tide dragon radiating its aura swims one barge from the mooring nearest its cradle: no crew, no strike, beside the mooring's own barge (iteration 53). */
export function dailyTideBarges(s: GameState): void {
  const qs = quays(s);
  if (qs.length < 2 || riverFrozen(s) || galeToday(s)) return;
  const rng = rngOf(s);
  for (const d of s.dragons) {
    if (!swimsBarges(d)) continue;
    const from = tideMooring(s, d);
    if (!from) continue;
    if (s.agents.some((a) => a.kind === AgentKind.Cart && a.variant === BARGE_VARIANT && a.dragonId === d.id)) continue;
    const sent = sendBarge(s, from, qs, d.id);
    if (!sent) continue;
    s.stats.tideTrips++;
    if (rng.chance(0.3)) pushMessage(s, `${d.name} swims out beside a barge from the quay at (${from.x},${from.y}): ${Math.round(sent.total)} goods for the markets at (${sent.to.x},${sent.to.y}), and no bargeman aboard.`, 'info', true, { x: from.x, y: from.y });
  }
  commitRng(s, rng);
}

/** A barge has reached its quay: fill the emptiest markets nearby. */
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

// ---------- drake riders ----------
export function riderTarget(s: GameState): number {
  let n = 0;
  forEachBuilding(s, (b) => { if (b.kind === 'drakemews' && b.state === 'ok' && b.lit) n += 2; });
  return Math.min(4, n);
}

// ---------- airship ----------
export interface AirshipState { status: 'none' | 'docked' | 'away'; goods: number; since: number; tale: number; voyages: number; wyvern?: boolean; wyvernId?: number; wyvernTale?: number }
export function newAirship(): AirshipState {
  return { status: 'none', goods: 0, since: -1, tale: 0, voyages: 0, wyvern: false, wyvernId: -1, wyvernTale: 0 };
}
/** The wyvern the Dock would send: a wyvern-stage dragon with no role or a courier's, at home (iteration 73). */
export function dockWyvern(s: GameState): Dragon | null {
  return s.dragons.find((d) => d.stage >= 3 && (d.role === 'none' || d.role === 'courier') && d.voyage === undefined) ?? null;
}
/** The Dock's panel: send a wyvern instead of the airship, or the airship again. The reason it cannot, or null. */
export function toggleSkyDockWyvern(s: GameState): string | null {
  if (!skyDock(s)) return 'No Sky-Dock stands';
  s.airship.wyvern = !s.airship.wyvern;
  return null;
}
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
/** Day 3 in wyvern mode: a wyvern flies the surplus out, no mana asked, back in WYVERN_DAYS. False when none could go. */
function sendWyvern(s: GameState, dock: Building): boolean {
  const air = s.airship;
  const d = dockWyvern(s);
  if (!d) return false;
  const goods = gatherSurplus(s, WYVERN_LOAD);
  if (goods < 20) return false;
  air.status = 'away';
  air.goods = goods;
  air.since = s.day;
  air.wyvernId = d.id;
  d.voyage = s.day + WYVERN_DAYS;
  s.agents = s.agents.filter((a) => !(a.kind === AgentKind.Creature && (a.species === 'drake' || a.species === 'wyvern') && a.dragonId === d.id));
  s.stats.wyvernVoyages++;
  effects.push({ x: dock.x, y: dock.y, kind: 'horn', tick: s.tick });
  pushMessage(s, `${d.name} takes the Sky-Dock's run with ${Math.round(goods)} goods in its panniers, for the wardlights beyond the Gloam. No mana, and back in ${WYVERN_DAYS} days.`, 'info', true, { x: dock.x, y: dock.y });
  return true;
}
/** The wyvern is home: pay out, and one time in two it brings a tale of the rival wardlight. */
function wyvernReturns(s: GameState, dock: Building | null): void {
  const air = s.airship;
  const crowns = Math.round(air.goods * s.trade.priceGoods * 1.6);
  s.treasury += crowns;
  s.stats.airshipCrowns += crowns;
  const d = s.dragons.find((x) => x.id === air.wyvernId);
  if (d) delete d.voyage;
  air.wyvernId = -1;
  air.status = 'docked';
  const rng = rngOf(s);
  const tale = rng.chance(0.5);
  commitRng(s, rng);
  if (tale) air.wyvernTale = s.day;
  if (dock) effects.push({ x: dock.x, y: dock.y, kind: 'horn', tick: s.tick });
  pushMessage(s, `${d ? d.name : 'The wyvern'} is home from beyond the Gloam: ${Math.round(air.goods)} goods sold for ${crowns} crowns.${tale ? ' It did not come back alone.' : ''}`, 'good', true, dock ? { x: dock.x, y: dock.y } : undefined);
  air.goods = 0;
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
    if ((air.wyvernId ?? -1) >= 0) { const d = s.dragons.find((x) => x.id === air.wyvernId); if (d) delete d.voyage; air.wyvernId = -1; air.goods = 0; } // the Dock gone, the wyvern finds its own way home
    return;
  }
  if (air.status === 'none') air.status = 'docked';
  if (air.status === 'away' && (air.wyvernId ?? -1) >= 0) { if (s.day - air.since >= WYVERN_DAYS) wyvernReturns(s, dock); return; }
  if (air.status === 'docked' && air.wyvern && s.day % 30 === 3 && sendWyvern(s, dock)) return; // the wyvern instead of the airship (iteration 73); with none to send, the airship goes if the Dock is lit
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

/** The airship is home: pay out and maybe bring a tale. */
export function airshipArrives(s: GameState): void {
  const air = s.airship;
  const dock = skyDock(s);
  const crowns = Math.round(air.goods * s.trade.priceGoods * 1.6);
  s.treasury += crowns;
  s.stats.airshipCrowns += crowns;
  if (dock) effects.push({ x: dock.x, y: dock.y, kind: 'horn', tick: s.tick });
  air.status = 'docked';
  const rng = rngOf(s);
  const tale = rng.chance(0.5);
  commitRng(s, rng);
  if (tale) air.tale = s.day;
  pushMessage(s, `The airship is home: ${Math.round(air.goods)} goods sold beyond the Gloam for ${crowns} crowns.${tale ? ' The captain has a story.' : ''}`, 'good', true, dock ? { x: dock.x, y: dock.y } : undefined);
  air.goods = 0;
}

export { BUILDING_BY_KEY };
