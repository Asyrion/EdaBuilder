/** Player commands. All mutate GameState and return a result string (null = ok). */
import { BUILDING_BY_KEY, BULLDOZE_COST, ROAD_BY_TYPE, isBuildingUnlocked, isRoadUnlocked, isZoneUnlocked } from './catalog';
import { RoadType, Terrain, Zone, idx, inBounds, isWater, type GameState } from './types';
import { canPlaceBuilding, markDirty, placeBuildingRaw, pushMessage, removeBuilding, buildingAt } from './world';

export interface ActionResult {
  ok: boolean;
  reason?: string;
  cost?: number;
}

export function roadTileCost(state: GameState, type: RoadType, i: number): number {
  const def = ROAD_BY_TYPE[type];
  const t = state.terrain[i];
  if (t === Terrain.DeepWater) return -1;
  if (t === Terrain.LeyNode) return -1;
  if (state.bIndex[i] >= 0) return -1;
  if (state.gloam[i]) return -1;
  let cost = def.cost;
  if (t === Terrain.Water) cost *= 4; // bridge
  if (t === Terrain.Hills) cost *= 3; // cut into rock
  if (t === Terrain.Forest) cost += 5;
  if (state.road[i] === type) return 0;
  if (state.road[i] && state.road[i] > type) return -1; // no downgrade by drawing
  if (state.road[i]) cost = Math.max(0, cost - ROAD_BY_TYPE[state.road[i]].cost);
  return cost;
}

/** L-shaped path from a to b (horizontal first then vertical, or as chosen). */
export function roadPath(ax: number, ay: number, bx: number, by: number, verticalFirst: boolean): number[] {
  const tiles: number[] = [];
  let x = ax;
  let y = ay;
  const push = () => {
    if (inBounds(x, y)) tiles.push(idx(x, y));
  };
  push();
  if (verticalFirst) {
    while (y !== by) {
      y += Math.sign(by - y);
      push();
    }
    while (x !== bx) {
      x += Math.sign(bx - x);
      push();
    }
  } else {
    while (x !== bx) {
      x += Math.sign(bx - x);
      push();
    }
    while (y !== by) {
      y += Math.sign(by - y);
      push();
    }
  }
  return tiles;
}

export function previewRoad(state: GameState, type: RoadType, tiles: number[]): { cost: number; valid: boolean[] } {
  let cost = 0;
  const valid: boolean[] = [];
  for (const i of tiles) {
    const c = roadTileCost(state, type, i);
    valid.push(c >= 0);
    if (c > 0) cost += c;
  }
  return { cost, valid };
}

export function buildRoad(state: GameState, type: RoadType, tiles: number[]): ActionResult {
  if (!isRoadUnlocked(state.milestone, type)) return { ok: false, reason: 'Not yet unlocked' };
  const { cost } = previewRoad(state, type, tiles);
  if (cost > state.treasury) return { ok: false, reason: 'Not enough crowns' };
  let built = 0;
  for (const i of tiles) {
    const c = roadTileCost(state, type, i);
    if (c < 0) continue;
    if (state.road[i] === type) continue;
    state.road[i] = type;
    state.zone[i] = Zone.None;
    built++;
    markDirty(state, i % state.w, (i / state.w) | 0);
  }
  if (built === 0) return { ok: false, reason: 'Nothing to build there' };
  state.treasury -= cost;
  state.zoneListDirty = true;
  return { ok: true, cost };
}

export function paintZone(state: GameState, zone: Zone, x0: number, y0: number, x1: number, y1: number): ActionResult {
  if (zone !== Zone.None && !isZoneUnlocked(state.milestone, zone)) return { ok: false, reason: 'Not yet unlocked' };
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  let n = 0;
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (state.road[i]) continue;
      const t = state.terrain[i];
      if (isWater(t) || t === Terrain.Hills || t === Terrain.LeyNode) continue;
      if (state.bIndex[i] >= 0) {
        const b = state.buildings[state.bIndex[i]];
        if (b && BUILDING_BY_KEY[b.kind].category === 'zone' && zone === Zone.None) {
          // de-zoning removes the building
          removeBuilding(state, b);
        } else continue;
      }
      if (state.zone[i] !== zone) {
        state.zone[i] = zone;
        n++;
        markDirty(state, x, y);
      }
    }
  state.zoneListDirty = true;
  return n > 0 ? { ok: true, cost: 0 } : { ok: false, reason: 'Nothing zoned' };
}

export function placeBuilding(state: GameState, key: string, x: number, y: number): ActionResult {
  const def = BUILDING_BY_KEY[key];
  if (!def) return { ok: false, reason: 'Unknown building' };
  if (!isBuildingUnlocked(state.milestone, key)) return { ok: false, reason: 'Not yet unlocked' };
  if (def.wonder && state.buildings.some((b) => b && b.kind === key)) return { ok: false, reason: 'Only one may be raised' };
  const why = canPlaceBuilding(state, key, x, y);
  if (why) return { ok: false, reason: why };
  if (def.cost > state.treasury) return { ok: false, reason: 'Not enough crowns' };
  state.treasury -= def.cost;
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) state.zone[idx(x + dx, y + dy)] = Zone.None;
  placeBuildingRaw(state, key, x, y);
  state.zoneListDirty = true;
  if (def.wonder) pushMessage(state, `${def.name} rises over ${state.cityName}. ${def.flavor}`, 'milestone');
  return { ok: true, cost: def.cost };
}

/** Bulldoze: removes building, road, or zone at tile. */
export function bulldoze(state: GameState, x: number, y: number): ActionResult {
  if (!inBounds(x, y)) return { ok: false };
  const i = idx(x, y);
  const b = buildingAt(state, x, y);
  if (b) {
    if (b.kind === 'stake') return { ok: false, reason: 'The Founding Stake cannot be removed' };
    const cost = b.state === 'ruin' ? 0 : BULLDOZE_COST * b.w * b.h;
    if (cost > state.treasury) return { ok: false, reason: 'Not enough crowns' };
    state.treasury -= cost;
    removeBuilding(state, b);
    return { ok: true, cost };
  }
  if (state.road[i]) {
    state.road[i] = RoadType.None;
    state.treasury -= BULLDOZE_COST;
    markDirty(state, x, y);
    return { ok: true, cost: BULLDOZE_COST };
  }
  if (state.zone[i]) {
    state.zone[i] = Zone.None;
    state.zoneListDirty = true;
    markDirty(state, x, y);
    return { ok: true, cost: 0 };
  }
  return { ok: false };
}

export function setTax(state: GameState, zone: keyof GameState['taxRates'], rate: number): void {
  state.taxRates[zone] = Math.max(0, Math.min(30, Math.round(rate)));
}

/** Paint (or clear with 0) a district over a rectangle. Districts cover any land tile. */
export function paintDistrict(state: GameState, district: number, x0: number, y0: number, x1: number, y1: number): ActionResult {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  let n = 0;
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (isWater(state.terrain[i])) continue;
      if (state.district[i] !== district) {
        state.district[i] = district;
        n++;
      }
    }
  return n > 0 ? { ok: true, cost: 0 } : { ok: false, reason: 'Nothing changed' };
}

/** Snapshot of everything a player action can change, for undo. Agents and time are left alone. */
export interface Snapshot {
  road: Uint8Array;
  zone: Uint8Array;
  district: Uint8Array;
  bIndex: Int32Array;
  buildings: string; // JSON of the buildings array
  nextBuildingId: number;
  treasury: number;
  label: string;
}

export function takeSnapshot(state: GameState, label: string): Snapshot {
  return {
    road: state.road.slice(),
    zone: state.zone.slice(),
    district: state.district.slice(),
    bIndex: state.bIndex.slice(),
    buildings: JSON.stringify(state.buildings),
    nextBuildingId: state.nextBuildingId,
    treasury: state.treasury,
    label,
  };
}

export function restoreSnapshot(state: GameState, snap: Snapshot): void {
  state.road.set(snap.road);
  state.zone.set(snap.zone);
  state.district.set(snap.district);
  state.bIndex.set(snap.bIndex);
  state.buildings = JSON.parse(snap.buildings);
  state.nextBuildingId = snap.nextBuildingId;
  state.treasury = snap.treasury;
  state.zoneListDirty = true;
  const ids = new Set(state.buildings.filter(Boolean).map((b) => b!.id));
  for (const a of state.agents) {
    if (a.homeId >= 0 && !ids.has(a.homeId)) a.homeId = -1;
    if (a.targetId >= 0 && !ids.has(a.targetId)) { a.targetId = -1; a.path = []; a.pathIdx = 0; }
  }
}
