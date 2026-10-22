/** Roads and what stands on them: laying roads and their cost, painting zones and placing buildings, the charter's sectors
 *  and buying land, road corners and districts in steps with the demand bars and the Founding Stake, the reach rings and the
 *  painted buildings' scale, and the road at a market's door. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGame, canPlaceBuilding, STAKE_STAGE_AT, placeBuildingRaw, roadInRing, stakeHallName, stakeSpriteName, stakeStage, touchesRoad, waterReachOf } from '../src/sim/world';
import { buildRoad, bulldoze, paintZone, placeBuilding, previewRoad, roadPath, paintDistrict } from '../src/sim/actions';
import { RoadType, Zone, idx, MAX_DISTRICTS, type Building, type GameState } from '../src/sim/types';
import { START_TREASURY, BUILDING_BY_KEY, BUILDINGS } from '../src/sim/catalog';
import { run, recomputeAll } from '../src/sim/sim';
import { SECTOR, SECTORS_X, sectorOf, inCharter, canBuySector, buySector, sectorCost, charteredCount, adjacentToCharter } from '../src/sim/sectors';
import { serialize, deserialize } from '../src/sim/save';
import { findPath, roadTileOf } from '../src/sim/agents';
import { demandExplain, demandReasons, trySpawnBuildings, updateDemand, HOSPICE_REACH } from '../src/sim/growth';
import { DISTRICT_SLOTS, charterLocked, districtInUse, districtOpenAt, districtSlots, districtUnlockNotes, setQuarter } from '../src/sim/districts';
import { activeQuests } from '../src/sim/quests';
import { SECONDARY_REACH, reachesOf, reachesOfBuilding } from '../src/sim/reach';
import { MARKET_MUD_TRADE, MARKET_ROAD_TRADE, marketRoadMultAt, marketRoadWords, muddySeason } from '../src/sim/roads';
import { computeLedger } from '../src/sim/economy';
import { Bot } from '../src/sim/bot';
import { flatten } from './helpers';

// Laying roads (cost, locked types, the ley node), painting zones, placing and bulldozing buildings.
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

// The charter: sectors, buying the next one, building only inside it, and the sectors in a save.
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

});

// Road corners, districts in steps, the demand bars explained, the Founding Stake that grows.
function town(seed = 41) {
  const s = createGame(seed, 'Cornerwick');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 2, f.x + 5, f.y + 2, false)); // ends at f.x + 5
  s.sectors.fill(1);
  s.treasury = 50000;
  recomputeAll(s);
  return s;
}

describe('A road at the corner', () => {
  it('a corner counts for a 1×1 and a 2×2, a bare ring refuses, and a hall may stand corner-to-road', () => {
    const s = town();
    const f = s.founding;
    expect(touchesRoad(s, f.x + 6, f.y + 3, 1, 1)).toBe(true); // diagonal to the road's end
    expect(roadInRing(s, f.x + 6, f.y + 3)).toBe(true);
    expect(roadInRing(s, f.x + 7, f.y + 3)).toBe(false);
    expect(touchesRoad(s, f.x + 6, f.y + 3, 2, 2)).toBe(true);
    expect(touchesRoad(s, f.x + 7, f.y + 3, 2, 2)).toBe(false);
    expect(canPlaceBuilding(s, 'well', f.x + 6, f.y + 3)).toBeNull();
    expect(canPlaceBuilding(s, 'well', f.x + 8, f.y + 3)).toBe('Must touch a road (a corner counts)');
  });

  it('the door prefers a side and falls back to the corner; a zone tile diagonal to the road end grows', () => {
    const s = town();
    const f = s.founding;
    const side = placeBuildingRaw(s, 'hearth', f.x, f.y + 3);
    expect(roadTileOf(s, side)).toBe(idx(f.x, f.y + 2));
    const corner = placeBuildingRaw(s, 'hearth', f.x + 6, f.y + 3);
    expect(roadTileOf(s, corner)).toBe(idx(f.x + 5, f.y + 2));
    const far = placeBuildingRaw(s, 'hearth', f.x + 8, f.y + 3);
    expect(roadTileOf(s, far)).toBe(-1);
    // growth on the diagonal lot
    const t = town(43);
    const g = t.founding;
    const i = idx(g.x + 6, g.y + 3);
    t.zone[i] = Zone.Hearth;
    t.lit[i] = 1; t.watered[i] = 1; // since phase 2-2 a lot grows only in light and water; this test is about the road
    t.demand.hearth = 1;
    for (let k = 0; k < 400 && t.bIndex[i] < 0; k++) trySpawnBuildings(t, 5);
    expect(t.bIndex[i]).toBeGreaterThanOrEqual(0);
    expect(t.buildings[t.bIndex[i]]!.kind).toBe('hearth');
  });
});

describe('Districts in steps', () => {
  it('slots open 2/4/6/8 at the Hamlet, Village, Market Town and Burgh; painting past the slots is refused with the milestone', () => {
    const s = town();
    const f = s.founding;
    expect(DISTRICT_SLOTS).toEqual([[1, 2], [3, 4], [5, 6], [6, 8]]);
    const bySlot = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => { s.milestone = m; return districtSlots(s); });
    expect(bySlot).toEqual([0, 2, 2, 4, 4, 6, 8, 8]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(districtOpenAt)).toEqual([1, 1, 3, 3, 5, 5, 6, 6]);
    s.milestone = 1;
    expect(paintDistrict(s, 2, f.x - 8, f.y - 4, f.x - 2, f.y).ok).toBe(true);
    const r = paintDistrict(s, 3, f.x + 2, f.y - 4, f.x + 8, f.y);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/opens at the Village$/);
    expect(paintDistrict(s, 0, f.x - 8, f.y - 4, f.x - 2, f.y).ok).toBe(true); // clearing is always allowed
    expect(paintDistrict(s, MAX_DISTRICTS + 1, f.x, f.y, f.x, f.y).reason).toBe('No such district');
    s.milestone = 3;
    expect(paintDistrict(s, 3, f.x + 2, f.y - 4, f.x + 8, f.y).ok).toBe(true);
    expect(districtInUse(s, 3)).toBe(true);
  });

  it('an old save with six districts at the Hamlet keeps them, may extend them, but cannot paint a seventh', () => {
    const s = town();
    const f = s.founding;
    s.milestone = 6;
    for (let d = 1; d <= 6; d++) expect(paintDistrict(s, d, f.x - 12 + d * 3, f.y - 6, f.x - 10 + d * 3, f.y - 4).ok).toBe(true);
    const o = JSON.parse(serialize(s));
    o.milestone = 1;
    const u = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(districtInUse(u, 6)).toBe(true);
    expect(districtSlots(u)).toBe(2);
    expect(paintDistrict(u, 6, f.x + 8, f.y - 6, f.x + 10, f.y - 4).ok).toBe(true);
    expect(paintDistrict(u, 7, f.x + 12, f.y - 6, f.x + 14, f.y - 4).ok).toBe(false);
    expect(u.lessonsSeen).toEqual([]);
    u.lessonsSeen.push('districts');
    expect(deserialize(serialize(u), (seed) => createGame(seed)).lessonsSeen).toEqual(['districts']);
  });

  it('charters open in steps, the notes name them, and the Districts chapter pins first', () => {
    const s = town();
    s.milestone = 1;
    expect(setQuarter(s, 1, 'hearth')).toBeNull();
    expect(setQuarter(s, 1, 'market')).toBe('Opens at the Village');
    expect(s.districtQuarters[1]).toBe('hearth');
    expect(charterLocked(s, 'temple')).toBe('Opens at the Market Town');
    expect(charterLocked(s, 'scholars')).toBe('Opens at the Township');
    s.milestone = 5; s.day += 30; // the hearth charter's thirty-day hold has run (iteration 54)
    expect(setQuarter(s, 1, 'temple')).toBeNull();
    s.day += 30;
    expect(setQuarter(s, 1, null)).toBeNull();
    expect(s.districtQuarters[1]).toBeUndefined();
    expect(districtUnlockNotes(1)).toEqual([]);
    expect(districtUnlockNotes(2)).toEqual([]);
    expect(districtUnlockNotes(3)).toEqual(['Two more districts open: four of eight.', 'The Market charter is yours.']);
    expect(districtUnlockNotes(4)).toEqual(["The Scholars' charter is yours."]);
    expect(districtUnlockNotes(5)).toEqual(['Two more districts open: six of eight.', 'The Temple charter is yours.']);
    expect(districtUnlockNotes(6)).toEqual(['The last two districts open.']);
    s.milestone = 1;
    paintDistrict(s, 1, s.founding.x - 8, s.founding.y - 4, s.founding.x - 2, s.founding.y); // a painted district opens the charter task
    expect(activeQuests(s, 3, 'Districts')[0].id).toBe('x_charter');
    expect(activeQuests(s, 3)[0].chapter).not.toBe('Districts');
  });
});

describe('The demand bars explained', () => {
  it('says the sign, the verdict, the numbers and the advice; the old four lines stay', () => {
    const s = town();
    s.population = 140;
    updateDemand(s);
    s.demand.hearth = 0.62;
    s.demand.market = -0.3;
    s.demand.craft = 0.02;
    s.demand.arcane = -0.5;
    const h = demandExplain(s, 'hearth');
    expect(h.sign).toBe('+');
    expect(h.headline).toBe('Hearths +62 %: folk want more homes.');
    expect(h.detail).toMatch(/^\d+ jobs for \d+ hands/);
    expect(h.advice).toBe('New hearths grow where you zone them beside a road.');
    const m = demandExplain(s, 'market');
    expect(m.headline).toBe('Markets −30 %: more shops than the folk can fill.');
    expect(m.detail).toMatch(/market jobs, \d+ wanted for 140 folk/);
    expect(m.advice).toMatch(/^New markets will not grow/);
    const c = demandExplain(s, 'craft');
    expect(c.sign).toBe('0');
    expect(c.headline).toMatch(/^Craft works about even:/);
    const a = demandExplain(s, 'arcane');
    expect(a.advice).toBe('Arcane shops open at the Township.');
    s.milestone = 4;
    updateDemand(s);
    s.demand.arcane = -0.5;
    expect(demandExplain(s, 'arcane').advice).toMatch(/an Academy/);
    expect(demandReasons(s).length).toBe(4);
    expect(demandReasons(s)[0]).toMatch(/^Hearth:/);
  });
});

describe('The Founding Stake that grows', () => {
  it('stages by milestone, the sprite name falls back, the hall is named by the people, and the imported sprites are in the manifest', () => {
    const s = town();
    expect(STAKE_STAGE_AT).toEqual([0, 3, 6, 7]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((m) => { s.milestone = m; return stakeStage(s); })).toEqual([0, 0, 0, 1, 1, 1, 2, 3, 3]);
    expect(stakeSpriteName(2, (n) => n === 'b_stake_s2')).toBe('b_stake_s2');
    expect(stakeSpriteName(1, () => false)).toBe('b_stake');
    s.milestone = 0;
    expect(stakeHallName(s)).toBe('the founding hall');
    s.milestone = 6;
    expect(stakeHallName(s)).toBe("the Burgh's hall");
    const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8'));
    for (const k of [0, 1, 2, 3]) {
      const e = manifest.sprites[`b_stake_s${k}`];
      expect(e.file).toBe(`sprites/b_stake_s${k}.png`);
      expect(e.w).toBeLessThanOrEqual(68); // at most the 2×2 footprint and its outline; since iteration 56 scaled to the procedural hall and centred
      expect(e.ax).toBe(Math.round(e.w / 2));
      expect(typeof e.ax).toBe('number');
      expect(typeof e.ay).toBe('number');
    }
  });
});

/** Every building with a reach has a ring that says what the sim does, water rings are the water the building really gives,
 *  and the painted buildings stand at the procedural scale, facing the procedural way. */
describe('Reach rings', () => {
  it('every building with a service or water has a primary ring, and every secondary reach names a real building', () => {
    const s = createGame(56, 'Ringwick');
    for (const def of BUILDINGS) {
      const rs = reachesOf(s, def);
      if (def.service || def.waterRadius) {
        expect(rs[0]?.primary, `${def.key} has no ring`).toBe(true);
        expect(rs[0].r).toBeGreaterThan(0);
      }
    }
    for (const key of Object.keys(SECONDARY_REACH)) expect(BUILDING_BY_KEY[key], key).toBeDefined();
  });
  it("a water building rings the water it really gives, the near-water bonus included", () => {
    const s = createGame(56, 'Ringwick');
    const f = s.founding;
    flatten(s, f.x - 10, f.y - 10, f.x + 10, f.y + 10);
    const w = placeBuildingRaw(s, 'well', f.x + 4, f.y + 4);
    recomputeAll(s);
    const ring = reachesOfBuilding(s, w)[0];
    expect(ring.r).toBe(waterReachOf(s, w));
    expect(ring.label).toBe(`water ${ring.r}`);
  });
  it("the secondary reaches are the sim's own numbers", () => {
    const s = createGame(56, 'Ringwick');
    const r = (key: string) => reachesOf(s, BUILDING_BY_KEY[key]).filter((x) => !x.primary).map((x) => x.r);
    expect(r('hospice')).toEqual([HOSPICE_REACH]);
    expect(reachesOf(s, BUILDING_BY_KEY.hospice).find((x) => !x.primary)!.square).toBe(true);
  });
});

describe('The painted buildings at the procedural scale, facing the procedural way', () => {
  const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number }>;
  const sources = (JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as { name: string; kind?: string; targetHeight?: number; anchor?: unknown; flip?: boolean; off?: boolean }[]).filter((e) => !e.off); // the paintings switched off in iteration 79 stay on the record but not in the atlas
  it('no hero sprite towers over its tile any more (heights as measured against the procedural twins)', () => {
    // b_well is drawn in code since iteration 79 (its painting is off), so it is no longer in the manifest
    expect(manifest.b_spire.h).toBeLessThanOrEqual(53);
    expect(manifest.b_nexus.h).toBeLessThanOrEqual(60);
    expect(manifest.b_cistern.h).toBeLessThanOrEqual(64);
    for (const k of [0, 1, 2, 3]) expect(manifest[`b_stake_s${k}`].h).toBeLessThanOrEqual(68);
  });
  it('a scaled hero stands centred on its tile, and the paintings fronted on the left face are mirrored', () => {
    for (const e of sources) if (e.name.startsWith('b_') && e.targetHeight) expect(e.anchor, e.name).toBe('centre');
    // the donkey carts (kind 'vehicle') face right by their own rule (iteration 57)
    const flipped = sources.filter((e) => e.flip && e.kind !== 'vehicle' && e.name.startsWith('b_') && !/_v\d+$/.test(e.name)).map((e) => e.name).sort();
    expect(flipped).toEqual(['b_cistern', 'b_stake_s0', 'b_stake_s1', 'b_stake_s2']); // the carters' yard and the lyceum are parked (phase 1c); the depot is drawn in code since iteration 79; the zone houses' flips are pinned in tests/iteration82.test.ts, the buildings' looks' in iteration83
  });
});

/** Markets want a good road (DESIGN 4.106): the road at a market's door scales its tithe (a dirt track a tenth less, a fifth
 *  in the mud; cobbles in full; a lit Lantern-way a tenth more); the panel says so; the bot paves its market doors from
 *  Market Town. */
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A street: a dirt track, two markets of one size on it (west and east), a works between. */
function street(): { s: GameState; west: Building; east: Building; works: Building } {
  const s = createGame(74, 'Cobblewick');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 8, f.x + 20, f.y + 12);
  s.milestone = 3;
  s.treasury = 50000;
  s.day = 40; // Bloom: no mud
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 5, f.x + 14, f.y + 5, false));
  const west = placeBuildingRaw(s, 'market', f.x - 6, f.y + 4, 1); ok(west); west.workers = 4; west.happiness = 70; west.lit = true;
  const east = placeBuildingRaw(s, 'market', f.x + 6, f.y + 4, 1); ok(east); east.workers = 4; east.happiness = 70; east.lit = true;
  const works = placeBuildingRaw(s, 'craft', f.x, f.y + 4, 1); ok(works); works.workers = 4; works.happiness = 70; works.lit = true;
  recomputeAll(s);
  west.workers = 4; east.workers = 4; works.workers = 4; west.happiness = 70; east.happiness = 70; works.happiness = 70;
  return { s, west, east, works };
}

describe('The road at the door', () => {
  it('scales by tier: a track a tenth less and a fifth in the mud, cobbles in full, a lit Lantern-way a tenth more, no road a fifth less', () => {
    const { s, west } = street();
    const door = roadTileOf(s, west);
    expect(s.road[door]).toBe(RoadType.Track);
    expect(muddySeason(s)).toBe(false);
    expect(marketRoadMultAt(s, door)).toBe(MARKET_ROAD_TRADE[RoadType.Track]);
    expect(marketRoadMultAt(s, door)).toBe(0.9);
    s.day = 10; // the Thaw
    expect(muddySeason(s)).toBe(true);
    expect(marketRoadMultAt(s, door)).toBe(MARKET_MUD_TRADE);
    s.day = 100; // the Hush
    expect(marketRoadMultAt(s, door)).toBe(0.8);
    s.day = 40;
    s.road[door] = RoadType.Cobble;
    expect(marketRoadMultAt(s, door)).toBe(1);
    s.day = 10;
    expect(marketRoadMultAt(s, door)).toBe(1); // cobbles do not mud
    s.day = 40;
    s.road[door] = RoadType.Lantern;
    s.lit[door] = 0;
    expect(marketRoadMultAt(s, door)).toBe(1); // unlit: a cobbled road
    s.lit[door] = 1;
    expect(marketRoadMultAt(s, door)).toBe(1.1);
    expect(marketRoadMultAt(s, -1)).toBe(0.8);
  });

  it('names the tier in the panel\'s words', () => {
    const { s, west } = street();
    const door = roadTileOf(s, west);
    expect(marketRoadWords(s, door)).toMatch(/^Dirt Track: trade × 0\.9, × 0\.8 in the mud/);
    s.day = 10;
    expect(marketRoadWords(s, door)).toMatch(/in the mud of this season/);
    s.day = 40;
    s.road[door] = RoadType.Cobble;
    expect(marketRoadWords(s, door)).toMatch(/^Cobbled Road: trade in full/);
    s.road[door] = RoadType.Lantern;
    s.lit[door] = 0;
    expect(marketRoadWords(s, door)).toMatch(/unlit \(counts as cobbled\)/);
    s.lit[door] = 1;
    expect(marketRoadWords(s, door)).toMatch(/^Lantern-way: trade × 1\.1/);
    expect(marketRoadWords(s, -1)).toMatch(/no road/);
    expect(BUILDING_BY_KEY.market.desc).toMatch(/cobbled road at the door trades in full/);
  });

  it('scales the market tithe only: two markets alike, one door cobbled, pay 0.95 of both cobbled; Craft and Hearth tithes are untouched', () => {
    const { s, west, east } = street();
    const a = roadTileOf(s, west);
    const b = roadTileOf(s, east);
    const both = () => { s.road[a] = RoadType.Cobble; s.road[b] = RoadType.Cobble; return computeLedger(s); };
    const one = () => { s.road[a] = RoadType.Track; s.road[b] = RoadType.Cobble; return computeLedger(s); };
    const l2 = both();
    const l1 = one();
    expect(l2.taxMarket).toBeGreaterThan(0);
    expect(l1.taxMarket / l2.taxMarket).toBeCloseTo(0.95, 3);
    expect(l1.taxCraft).toBe(l2.taxCraft);
    expect(l1.taxHearth).toBe(l2.taxHearth);
    s.day = 10; // the mud: 0.9 of both cobbled
    expect(one().taxMarket / both().taxMarket).toBeCloseTo(0.9, 3);
    s.day = 40;
    s.road[a] = RoadType.Lantern; s.lit[a] = 1; s.road[b] = RoadType.Cobble;
    expect(computeLedger(s).taxMarket / l2.taxMarket).toBeCloseTo(1.05, 3);
  });
});

describe('The bot paves its market doors', () => {
  it('cobbles one track-side door a day from Market Town, the nearest its centre first, when the treasury holds it; not before, not when poor', () => {
    const { s, west, east } = street();
    const bot = new Bot(s);
    const pave = () => (bot as unknown as { paveDoors: () => void }).paveDoors();
    const a = roadTileOf(s, west);
    const b = roadTileOf(s, east);
    s.milestone = 0;
    pave();
    expect(bot.doorsPaved).toBe(0);
    expect(s.road[a]).toBe(RoadType.Track);
    s.milestone = 1;
    s.treasury = 100;
    pave();
    expect(bot.doorsPaved).toBe(0);
    s.treasury = 5000;
    const t0 = s.treasury;
    pave();
    expect(bot.doorsPaved).toBe(1);
    expect([s.road[a], s.road[b]].filter((r) => r === RoadType.Cobble).length).toBe(1);
    expect(s.treasury).toBeLessThan(t0);
    pave();
    expect(bot.doorsPaved).toBe(2);
    expect(s.road[a]).toBe(RoadType.Cobble);
    expect(s.road[b]).toBe(RoadType.Cobble);
    pave();
    expect(bot.doorsPaved).toBe(2); // nothing left to pave
    expect(marketRoadMultAt(s, a)).toBe(1);
  });
});

// Phase 2-5 of the scope reset: the path cache is the state's own and follows every road the actions write.
describe('paths follow every road', () => {
  /** A ring of track around a 10×10 block by the stake, and two tiles on opposite sides of it. */
  function ring() {
    const s = createGame(42, 'Paths');
    const f = s.founding;
    const x0 = f.x - 14, y0 = f.y + 6;
    flatten(s, x0 - 1, y0 - 1, x0 + 11, y0 + 11);
    s.treasury = 1e6;
    for (const [ax, ay, bx, by, v] of [[x0, y0, x0 + 10, y0, false], [x0, y0 + 10, x0 + 10, y0 + 10, false], [x0, y0, x0, y0 + 10, true], [x0 + 10, y0, x0 + 10, y0 + 10, true]] as [number, number, number, number, boolean][]) buildRoad(s, RoadType.Track, roadPath(ax, ay, bx, by, v));
    return { s, x0, y0, a: idx(x0 + 5, y0), b: idx(x0 + 5, y0 + 10) };
  }

  it('a road built by the action (not a command) is in the next path at once; one bulldozed is out of it', () => {
    const { s, x0, y0, a, b } = ring();
    const around = findPath(s, a, b)!;
    expect(around.length).toBe(21); // 5 + 10 + 5 steps, both ways round the block are as long
    buildRoad(s, RoadType.Track, roadPath(x0 + 5, y0, x0 + 5, y0 + 10, true)); // straight across
    const across = findPath(s, a, b)!;
    expect(across.length).toBe(11);
    bulldoze(s, x0 + 5, y0 + 5);
    expect(findPath(s, a, b)!.length).toBe(21);
  });

  it('two states keep their own paths: a road in one is not a road in the other', () => {
    const one = ring(), two = ring();
    expect(findPath(two.s, two.a, two.b)!.length).toBe(21);
    buildRoad(one.s, RoadType.Track, roadPath(one.x0 + 5, one.y0, one.x0 + 5, one.y0 + 10, true));
    expect(findPath(one.s, one.a, one.b)!.length).toBe(11);
    expect(findPath(two.s, two.a, two.b)!.length).toBe(21);
  });

  it('no path cuts a corner: every step of every walking agent in a bot town is a road tile beside the last', () => {
    const s = createGame(42, 'Corners');
    const bot = new Bot(s);
    run(s, 900 * 30, { onDay: () => bot.step() });
    let paths = 0;
    for (const a of s.agents) {
      if (a.path.length < 2) continue;
      paths++;
      for (let k = 1; k < a.path.length; k++) {
        const p = a.path[k - 1], q = a.path[k];
        expect(Math.abs((p % 128) - (q % 128)) + Math.abs(((p / 128) | 0) - ((q / 128) | 0))).toBe(1);
        expect(s.road[q]).toBeGreaterThan(0);
      }
    }
    expect(paths).toBeGreaterThan(200);
  }, 120_000);
});
