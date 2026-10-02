import { describe, expect, it } from 'vitest';
import { createGame, canPlaceBuilding } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { RoadType, idx } from '../src/sim/types';
import { buildRoad, roadPath, paintZone } from '../src/sim/actions';
import { SECTOR, SECTORS_X, sectorOf, inCharter, canBuySector, buySector, sectorCost, charteredCount, adjacentToCharter } from '../src/sim/sectors';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function outsideSector(s: ReturnType<typeof createGame>): number {
  for (let k = 0; k < s.sectors.length; k++) if (!s.sectors[k] && adjacentToCharter(s, k)) return k;
  return -1;
}

describe('Map sectors', () => {
  it('a new game charters the founding sector and its near neighbours only', () => {
    const s = createGame(31, 'Sect');
    const fk = sectorOf(s.founding.x, s.founding.y);
    expect(s.sectors[fk]).toBe(1);
    expect(charteredCount(s)).toBeGreaterThanOrEqual(1);
    expect(charteredCount(s)).toBeLessThan(s.sectors.length);
    expect(inCharter(s, s.founding.x, s.founding.y)).toBe(true);
  });

  it('refuses buildings, roads and zones beyond the Charter', () => {
    const s = createGame(31, 'Sect');
    const k = outsideSector(s);
    expect(k).toBeGreaterThanOrEqual(0);
    const x = (k % SECTORS_X) * SECTOR + 10;
    const y = Math.floor(k / SECTORS_X) * SECTOR + 10;
    flatten(s, x - 4, y - 4, x + 6, y + 6);
    expect(canPlaceBuilding(s, 'well', x, y)).toMatch(/Charter/);
    expect(buildRoad(s, RoadType.Track, roadPath(x, y, x + 4, y, false)).ok).toBe(false);
    paintZone(s, 1, x, y + 2, x + 3, y + 2);
    expect(s.zone[idx(x, y + 2)]).toBe(0);
  });

  it('buying needs Hamlet, adjacency and crowns; it charters the sector and burns the Gloam back', () => {
    const s = createGame(31, 'Sect');
    const k = outsideSector(s);
    expect(canBuySector(s, k)).toMatch(/Hamlet/);
    s.milestone = 1;
    s.treasury = 100;
    expect(canBuySector(s, k)).toMatch(/crowns/);
    s.treasury = 50000;
    const cost = sectorCost(s, k);
    expect(cost).toBeGreaterThanOrEqual(2500);
    const x0 = (k % SECTORS_X) * SECTOR;
    const y0 = Math.floor(k / SECTORS_X) * SECTOR;
    let gloamIn = 0;
    for (let y = y0 + 4; y < y0 + SECTOR - 4; y++) for (let x = x0 + 4; x < x0 + SECTOR - 4; x++) if (s.gloam[idx(x, y)] && Math.min(x, y, 127 - x, 127 - y) >= 4) gloamIn++;
    expect(buySector(s, k)).toBeNull();
    expect(s.sectors[k]).toBe(1);
    expect(s.treasury).toBe(50000 - cost);
    expect(s.stats.sectorsBought).toBe(1);
    let left = 0;
    for (let y = y0; y < y0 + SECTOR; y++) for (let x = x0; x < x0 + SECTOR; x++) if (s.gloam[idx(x, y)] && Math.min(x, y, 127 - x, 127 - y) >= 4) left++;
    expect(left).toBe(0);
    void gloamIn;
    expect(canBuySector(s, k)).toMatch(/Already/);
    // a sector not touching the Charter cannot be bought
    let far = -1;
    for (let j = 0; j < s.sectors.length; j++) if (!s.sectors[j] && !adjacentToCharter(s, j)) far = j;
    if (far >= 0) expect(canBuySector(s, far)).toMatch(/touch/);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.sectors[k]).toBe(1);
    run(b, 5);
  });

  it('a save from before sectors owns the whole map', () => {
    const s = createGame(31, 'Old');
    const o = JSON.parse(serialize(s)); o.version = 6; // a save from before iteration 55 says 6
    delete o.sectors;
    const b = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(charteredCount(b)).toBe(b.sectors.length);
  });
});
