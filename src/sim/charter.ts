/** The daughter charter: the endgame. A Beacon of Eda may found a second wardlight on another node. See DESIGN.md 4.39. */
import { BUILDING_BY_KEY } from './catalog';
import { buildRoad, paintDistrict, roadPath } from './actions';
import { districtsInUse } from './edicts';
import { districtSlots } from './districts';
import { MAX_DISTRICTS, RoadType, Terrain, Zone, idx, inBounds, type GameState } from './types';
import { canPlaceBuilding, forEachBuilding, markDirtyAround, placeBuildingRaw, pushMessage } from './world';
import { sectorOf } from './sectors';

export const DAUGHTER_GRANT = 15000;
export const DAUGHTER_MIN_DIST = 30;
export const TWIN_POP = 500;
export const TWIN_RADIUS = 30;

export interface DaughterState { node: number; x: number; y: number; name: string; day: number; twin: number }

export function canFoundDaughter(s: GameState, ni: number): string | null {
  if (s.daughter) return `A daughter wardlight already stands: ${s.daughter.name}`;
  if (s.milestone < 8) return 'Unlocks at Beacon of Eda';
  const n = s.nodes[ni];
  if (!n) return 'No such node';
  if (n.x === s.founding.x && n.y === s.founding.y) return 'This is the founding Wellspring';
  if (Math.hypot(n.x - s.founding.x, n.y - s.founding.y) < DAUGHTER_MIN_DIST) return `Too near the first wardlight (${DAUGHTER_MIN_DIST} tiles)`;
  if (!stakeSpot(s, ni)) return 'No room for a stake beside this node';
  return null;
}

/** A free 2x2 grass spot beside the node. */
function stakeSpot(s: GameState, ni: number): [number, number] | null {
  const n = s.nodes[ni];
  for (let r = 2; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = n.x + dx;
        const y = n.y + dy;
        if (!inBounds(x + 1, y + 1)) continue;
        let ok = true;
        for (let yy = y; yy <= y + 1 && ok; yy++) for (let xx = x; xx <= x + 1; xx++) { const i = idx(xx, yy); const t = s.terrain[i]; if ((t !== Terrain.Grass && t !== Terrain.Meadow && t !== Terrain.Forest) || s.bIndex[i] >= 0 || s.road[i] || s.gloam[i]) { ok = false; break; } }
        if (ok) return [x, y];
      }
  return null;
}

/** Found the daughter wardlight: a second stake, a road stub, a district, a grant. */
export function foundDaughter(s: GameState, ni: number, name: string): string | null {
  const why = canFoundDaughter(s, ni);
  if (why) return why;
  const spot = stakeSpot(s, ni)!;
  const [x, y] = spot;
  // clear forest under and beside the stake so the stub can be laid
  for (let yy = y - 1; yy <= y + 2; yy++) for (let xx = x - 1; xx <= x + 2; xx++) if (inBounds(xx, yy) && s.terrain[idx(xx, yy)] === Terrain.Forest) s.terrain[idx(xx, yy)] = Terrain.Grass;
  // the Crown charters the daughter's sector with the stake
  s.sectors[sectorOf(x, y)] = 1;
  placeBuildingRaw(s, 'stake', x, y);
  markDirtyAround(s, x, y);
  // a road stub along the stake's south edge
  const stub = roadPath(x - 1, y + 2, x + 2, y + 2, false).filter((i) => s.bIndex[i] < 0 && !s.gloam[i] && s.terrain[i] !== Terrain.LeyNode);
  if (stub.length) buildRoad(s, RoadType.Track, stub);
  // a district around it, the next free name
  const used = new Set(districtsInUse(s));
  let d = 0;
  for (let k = 1; k <= Math.min(MAX_DISTRICTS, districtSlots(s)); k++) if (!used.has(k)) { d = k; break; }
  if (d) {
    paintDistrict(s, d, x - 6, y - 6, x + 7, y + 7);
    s.districtNames[d] = name.slice(0, 18);
  }
  s.daughter = { node: ni, x, y, name, day: s.day, twin: -1 };
  s.treasury += DAUGHTER_GRANT;
  s.stats.daughters++;
  pushMessage(s, `${name} is founded on the node at (${s.nodes[ni].x},${s.nodes[ni].y}): a daughter wardlight of ${s.cityName}. The Crown's grant of ${DAUGHTER_GRANT} crowns is paid. Both share one treasury and one Charter.`, 'milestone', true, { x, y });
  return null;
}

/** Folk living within TWIN_RADIUS of the daughter's stake. */
export function daughterPopulation(s: GameState): number {
  const d = s.daughter;
  if (!d) return 0;
  let n = 0;
  forEachBuilding(s, (b) => {
    if (BUILDING_BY_KEY[b.kind].zone !== Zone.Hearth || b.state !== 'ok') return;
    if (Math.hypot(b.x - d.x, b.y - d.y) <= TWIN_RADIUS) n += b.residents;
  });
  return n;
}

/** Daily: the Twin Beacon, once. */
export function dailyDaughter(s: GameState): void {
  const d = s.daughter;
  if (!d || d.twin >= 0) return;
  if (daughterPopulation(s) >= TWIN_POP) {
    d.twin = s.day;
    s.treasury += 10000;
    pushMessage(s, `${d.name} holds ${TWIN_POP} folk: ${s.cityName} and ${d.name} are the Twin Beacons of the valley. Vell-on-Sable sends 10,000 crowns and a second seal for the Charter.`, 'milestone', true, { x: d.x, y: d.y });
  }
}

export { canPlaceBuilding };
