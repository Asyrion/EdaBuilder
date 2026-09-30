import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { buildRoad, bulldoze, paintZone, placeBuilding, previewRoad, roadPath } from '../src/sim/actions';
import { RoadType, Zone, idx } from '../src/sim/types';
import { START_TREASURY } from '../src/sim/catalog';
import { flatten } from './helpers';

function fresh() {
  const s = createGame(42, 'T');
  flatten(s, s.founding.x - 10, s.founding.y - 5, s.founding.x + 10, s.founding.y + 12);
  return s;
}

describe('roads', () => {
  it('builds an L-shaped path and charges crowns', () => {
    const s = fresh();
    const f = s.founding;
    const tiles = roadPath(f.x - 5, f.y + 3, f.x + 5, f.y + 6, false);
    expect(tiles.length).toBe(11 + 3);
    const before = s.treasury;
    const pv = previewRoad(s, RoadType.Track, tiles);
    const r = buildRoad(s, RoadType.Track, tiles);
    expect(r.ok).toBe(true);
    expect(before - s.treasury).toBe(pv.cost);
    expect(s.road[idx(f.x, f.y + 3)]).toBe(RoadType.Track);
  });
  it('refuses locked road types', () => {
    const s = fresh();
    const f = s.founding;
    const r = buildRoad(s, RoadType.Lantern, roadPath(f.x - 3, f.y + 3, f.x + 3, f.y + 3, false));
    expect(r.ok).toBe(false);
  });
  it('cannot build through a ley node', () => {
    const s = fresh();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 3, f.y, f.x + 3, f.y, false));
    expect(s.road[idx(f.x, f.y)]).toBe(0);
    expect(s.road[idx(f.x - 3, f.y)]).toBe(RoadType.Track);
  });
});

describe('zones and buildings', () => {
  it('paints zones only on buildable land, never on roads', () => {
    const s = fresh();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    paintZone(s, Zone.Hearth, f.x - 6, f.y + 2, f.x + 6, f.y + 4);
    expect(s.zone[idx(f.x, f.y + 3)]).toBe(0);
    expect(s.zone[idx(f.x, f.y + 4)]).toBe(Zone.Hearth);
  });
  it('places a well next to a road and refuses one that is not', () => {
    const s = fresh();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    const ok = placeBuilding(s, 'well', f.x - 4, f.y + 4);
    expect(ok.ok).toBe(true);
    expect(s.treasury).toBeLessThan(START_TREASURY);
    const bad = placeBuilding(s, 'well', f.x - 4, f.y + 9);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/road/);
  });
  it('refuses locked buildings and wonders twice', () => {
    const s = fresh();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    expect(placeBuilding(s, 'academy', f.x - 4, f.y + 4).ok).toBe(false);
    s.milestone = 7;
    s.treasury = 100000;
    expect(placeBuilding(s, 'lantern', f.x - 4, f.y + 4).ok).toBe(true);
    expect(placeBuilding(s, 'lantern', f.x + 1, f.y + 4).ok).toBe(false);
  });
  it('bulldozes buildings and roads', () => {
    const s = fresh();
    const f = s.founding;
    buildRoad(s, RoadType.Track, roadPath(f.x - 6, f.y + 3, f.x + 6, f.y + 3, false));
    placeBuilding(s, 'well', f.x - 4, f.y + 4);
    expect(s.bIndex[idx(f.x - 4, f.y + 4)]).toBeGreaterThanOrEqual(0);
    expect(bulldoze(s, f.x - 4, f.y + 4).ok).toBe(true);
    expect(s.bIndex[idx(f.x - 4, f.y + 4)]).toBe(-1);
    expect(bulldoze(s, f.x - 4, f.y + 3).ok).toBe(true);
    expect(s.road[idx(f.x - 4, f.y + 3)]).toBe(0);
  });
});

describe('road autotile redraw', () => {
  it('dirties the neighbouring chunk when a later road joins an existing one across a chunk edge', async () => {
    const { CHUNK, CHUNKS_X } = await import('../src/sim/world');
    const s = fresh();
    const f = s.founding;
    // a horizontal road, then a vertical road joining it from below, chosen so the join crosses a chunk boundary
    const cx = Math.floor(f.x / CHUNK) * CHUNK; // x on a chunk edge
    buildRoad(s, RoadType.Track, roadPath(cx - 4, f.y + 3, cx + 4, f.y + 3, false));
    s.dirtyChunks!.clear();
    buildRoad(s, RoadType.Track, roadPath(cx - 1, f.y + 4, cx - 1, f.y + 8, true)); // ends adjacent to the tile at (cx-1, f.y+3)
    const chunkOf = (x: number, y: number) => Math.floor(y / CHUNK) * CHUNKS_X + Math.floor(x / CHUNK);
    // the existing road tile above the join must be redrawn, and so must the tile at the boundary x=cx
    expect(s.dirtyChunks!.has(chunkOf(cx - 1, f.y + 3))).toBe(true);
    expect(s.dirtyChunks!.has(chunkOf(cx, f.y + 4))).toBe(true);
  });
});
