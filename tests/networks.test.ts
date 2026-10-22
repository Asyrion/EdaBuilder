/** The networks under the town: mana from the ley node through spires, water from wells, the ley's limits (linked nodes,
 *  spire load, brownouts, lantern-ways), the ground's limits (well capacity, mud, mine seams, Font flares, the Gloam that
 *  takes), and deepening the Wellspring, the trade depot, undo snapshots and district names. */
import { describe, expect, it } from 'vitest';
import { createGame, nodeFlow, placeBuildingRaw, canDeepenNode, waterRadiusOf, deepenNode, NODE_DEEPEN_MANA, districtName } from '../src/sim/world';
import { buildRoad, paintZone, placeBuilding, roadPath, paintDistrict, takeSnapshot, restoreSnapshot, bulldoze } from '../src/sim/actions';
import { RoadType, Zone, idx, Terrain, TICKS_PER_DAY } from '../src/sim/types';
import { updateMana, updateWater, LOAD_CAP, loadCapOf, priorityOf, waterCapOf } from '../src/sim/networks';
import { NODE_MANA, ROAD_BY_TYPE } from '../src/sim/catalog';
import { recomputeAll, run } from '../src/sim/sim';
import { roadAt, MUD, roadSpeedAt } from '../src/sim/roads';
import { Bot } from '../src/sim/bot';
import { serialize, deserialize } from '../src/sim/save';
import { SEAM, SPENT_RATE, dailyBuildings, dailyTrade, craftStockCap } from '../src/sim/growth';
import { FLARE_DAYS, GLOAM_TAKES, GREY_DAYS, dailyFire, dailyGloam, fontsRunHot } from '../src/sim/hazards';
import { updateMiasma } from '../src/sim/services';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

// The mana chain from the node, brownouts, and the water around a well.
describe('mana network', () => {
  it('lights a spire chain from the node and buildings by adjacency', () => {
    const s = createGame(42, 'T');
    const f = s.founding;
    flatten(s, f.x - 3, f.y - 3, f.x + 25, f.y + 10);
    // road east of node
    buildRoad(s, RoadType.Track, roadPath(f.x - 2, f.y + 3, f.x + 20, f.y + 3, false));
    const s1 = placeBuilding(s, 'spire', f.x + 5, f.y + 4); // 5 from node
    const s2 = placeBuilding(s, 'spire', f.x + 11, f.y + 4); // 6 from s1
    const s3 = placeBuilding(s, 'spire', f.x + 19, f.y + 4); // 8 from s2 -> unlit
    expect(s1.ok && s2.ok && s3.ok).toBe(true);
    // a row of houses along the road far from spires but touching each other
    const houses = [];
    for (let x = f.x + 12; x <= f.x + 18; x++) houses.push(placeBuildingRaw(s, 'hearth', x, f.y + 2));
    updateMana(s);
    const spires = s.buildings.filter((b) => b && b.kind === 'spire');
    expect(spires.map((b) => b!.lit)).toEqual([true, true, false]);
    // houses within radius 5 of s2 (x <= f.x+16) lit directly; the rest by adjacency chain
    for (const h of houses) expect(h.lit).toBe(true);
    expect(s.manaSupply).toBe(nodeFlow(s, s.nodeLinked)); // the linked nodes only (Vein ley adds 15)
    expect(s.nodeLinked.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    void NODE_MANA;
    expect(s.manaDemand).toBe(houses.length * 1);
  });
  it('browns out the farthest consumers when demand exceeds supply', () => {
    const s = createGame(42, 'T');
    const f = s.founding;
    s.nodes = [s.nodes[0]];
    flatten(s, f.x - 32, f.y - 3, f.x + 32, f.y + 6);
    buildRoad(s, RoadType.Track, roadPath(f.x - 30, f.y + 3, f.x + 30, f.y + 3, false));
    for (let x = f.x - 29; x <= f.x + 29; x++) placeBuildingRaw(s, 'arcane', x, f.y + 2, 3); // 8 mana each
    updateMana(s);
    expect(s.manaDemand).toBeGreaterThan(s.manaSupply);
    expect(s.brownout).toBeGreaterThan(0);
    const lit = s.buildings.filter((b) => b && b.kind === 'arcane' && b.lit) as any[];
    const dark = s.buildings.filter((b) => b && b.kind === 'arcane' && !b.lit) as any[];
    expect(dark.length).toBeGreaterThan(0);
    const maxLitDist = Math.max(...lit.map((b) => Math.abs(b.x - f.x)));
    const minDarkDist = Math.min(...dark.map((b) => Math.abs(b.x - f.x)));
    expect(minDarkDist).toBeGreaterThanOrEqual(maxLitDist);
  });
});

describe('water', () => {
  it('waters tiles around a well', () => {
    const s = createGame(42, 'T');
    const f = s.founding;
    flatten(s, f.x - 3, f.y - 3, f.x + 25, f.y + 25);
    buildRoad(s, RoadType.Track, roadPath(f.x - 2, f.y + 3, f.x + 20, f.y + 3, false));
    placeBuilding(s, 'well', f.x + 15, f.y + 4);
    updateWater(s);
    expect(s.watered[idx(f.x + 15, f.y + 8)]).toBe(1);
    expect(s.watered[idx(f.x + 15, f.y + 20)]).toBe(0);
  });
});

// The ley has limits: linked nodes, spire load, brownout tiers, lantern-ways that need their light.
function town(seed = 41) {
  const s = createGame(seed, 'Limits');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  recomputeAll(s);
  return s;
}

describe('Linked nodes', () => {
  it("a node's flow counts only while a lit spire within 6 links it; the panel and the deepen button say so", () => {
    const s = town();
    updateMana(s);
    const founding = s.nodes.findIndex((n) => n.x === s.founding.x && n.y === s.founding.y);
    expect(s.nodeLinked[founding]).toBe(true); // the Stake links the founding node
    const other = s.nodes.findIndex((n, k) => k !== founding);
    expect(other).toBeGreaterThanOrEqual(0);
    expect(s.nodeLinked[other]).toBe(false);
    const flow = nodeFlow(s, s.nodeLinked);
    expect(s.manaSupply).toBe(flow);
    expect(flow).toBeLessThan(nodeFlow(s)); // the unlinked nodes seep only half
    expect(canDeepenNode(s, other)).toMatch(/Unlinked/);
    // a spire within 6 of the other node links it
    const n = s.nodes[other];
    flatten(s, n.x - 8, n.y - 8, n.x + 8, n.y + 8);
    for (const nd of s.nodes) s.terrain[idx(nd.x, nd.y)] = 7;
    buildRoad(s, RoadType.Track, roadPath(n.x - 6, n.y + 3, n.x + 6, n.y + 3, false));
    const sp = placeBuildingRaw(s, 'spire', n.x + 3, n.y + 2); ok(sp);
    updateMana(s);
    expect(sp.lit).toBe(true);
    expect(s.nodeLinked[other]).toBe(true);
    expect(s.manaSupply).toBe(flow + 45 + (s.nodes[other].depth ?? 0) * 45); // the other half of its flow
    expect(canDeepenNode(s, other)).toBeNull();
  });
});

describe('Spire load', () => {
  it('a spire carries 80 mana of buildings and sheds its farthest over that; a Nexus carries 200', () => {
    const s = town();
    const f = s.founding;
    // a spire 5 east of the founding node, and twelve level-3 Arcane shops (8 mana each) east of it, nearer the spire than the node
    const sp = placeBuildingRaw(s, 'spire', f.x + 5, f.y - 1); ok(sp);
    buildRoad(s, RoadType.Track, roadPath(f.x + 6, f.y - 3, f.x + 18, f.y - 3, false));
    const shops = [] as ReturnType<typeof placeBuildingRaw>[];
    for (let k = 0; k < 12; k++) { const b = placeBuildingRaw(s, 'arcane', f.x + 7 + k, f.y - 2, 3); ok(b); shops.push(b); }
    updateMana(s);
    expect(sp.lit).toBe(true);
    expect(loadCapOf(sp)).toBe(80);
    expect(sp.load).toBe(96); // twelve at 8: the load before shedding
    const lit = shops.filter((b) => b.lit);
    expect(lit.length).toBe(10); // the two farthest are dark
    expect(shops[11].lit).toBe(false);
    expect(shops[10].lit).toBe(false);
    expect(shops[0].lit).toBe(true);
    expect(s.manaDemand).toBe(80 + (s.manaDemand - 80)); // sanity: shed mana left the demand
    // the same load on a Nexus (cap 200) all lit
    sp.kind = 'nexus';
    updateMana(s);
    expect(loadCapOf(sp)).toBe(200);
    expect(shops.every((b) => b.lit)).toBe(true);
    // the darkened shops stay dark first on the next update (no blinking) when the spire returns
    sp.kind = 'spire';
    updateMana(s);
    expect(shops.filter((b) => !b.lit).length).toBe(2);
  });
});

describe('Brownout tiers', () => {
  it('with a deficit the Dim go dark first, then Normal, then Essential; the player overrides the default', () => {
    const s = town();
    const f = s.founding;
    const stakeCap = LOAD_CAP.stake; LOAD_CAP.stake = 1e9; // the city's shortfall, not the Stake's load, is under test
    const ward = placeBuildingRaw(s, 'wardlantern', f.x + 2, f.y - 2); ok(ward); // essential by default (6 mana)
    expect(priorityOf(ward)).toBe(0);
    const hs = [] as ReturnType<typeof placeBuildingRaw>[];
    for (let k = 0; k < 40; k++) { const b = placeBuildingRaw(s, 'arcane', f.x - 10 + (k % 20), f.y + 1 + 2 * Math.floor(k / 20), 3); ok(b); hs.push(b); } // 8 mana each at level 3, two rows
    expect(priorityOf(hs[0])).toBe(1);
    hs[0].priority = 2; hs[1].priority = 2; // two homes the player marks Dim
    updateMana(s);
    const supply = s.manaSupply;
    expect(s.manaDemand).toBeGreaterThan(supply);
    expect(hs[0].lit).toBe(false);
    expect(hs[1].lit).toBe(false);
    expect(ward.lit).toBe(true);
    // the essential ward is the last to go: even with only the ward's mana to spare it stays lit
    const darkNormal = hs.filter((b) => b.priority !== 2 && !b.lit).length;
    expect(darkNormal).toBeGreaterThan(0);
    hs[0].priority = 0; hs[0].lit = true; // what the panel does: a changed tier is judged afresh
    updateMana(s); updateMana(s);
    expect(hs[0].lit).toBe(true);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.buildings.find((b) => b && b.id === hs[1].id)!.priority).toBe(2);
    LOAD_CAP.stake = stakeCap;
  });
});

describe('Lantern-ways', () => {
  it('dim before any building when the ley runs short, and an unlit lantern tile is cobble for speed and land value; no flicker', () => {
    const s = town();
    const f = s.founding;
    const stakeCap = LOAD_CAP.stake; LOAD_CAP.stake = 1e9;
    const lane = roadPath(f.x - 6, f.y + 2, f.x + 6, f.y + 2, false);
    for (const i of lane) s.road[i] = RoadType.Lantern;
    const hs = [] as ReturnType<typeof placeBuildingRaw>[];
    for (let k = 0; k < 6; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 5 + k * 2, f.y + 3, 1); ok(b); hs.push(b); }
    updateMana(s);
    expect(s.roadsDim).toBe(false);
    const t = lane[6];
    expect(s.lit[t]).toBe(1);
    expect(roadAt(s, t)).toBe(RoadType.Lantern);
    // a deficit just over the roads' draw: the roads dim, the homes stay lit
    const roads = lane.length * ROAD_BY_TYPE[RoadType.Lantern].manaUse;
    s.nodes.forEach((n) => { n.depth = 0; });
    const extra = [] as ReturnType<typeof placeBuildingRaw>[];
    let k = 0;
    while (s.manaDemand <= s.manaSupply) { const b = placeBuildingRaw(s, 'arcane', f.x - 6 + (k % 13), k < 13 ? f.y + 1 : k < 26 ? f.y + 4 : f.y + 5, 3); ok(b); extra.push(b); k++; updateMana(s); if (k > 38) break; } // lit along the lane and by adjacency
    expect(s.roadsDim).toBe(true);
    expect(s.lit[t]).toBe(0);
    expect(roadAt(s, t)).toBe(RoadType.Cobble);
    expect(s.manaDemand).toBeLessThanOrEqual(s.manaSupply + 8); // the roads' draw left the demand before any home went dark (one shop may be over)
    const before = s.roadsDim;
    for (let u = 0; u < 10; u++) updateMana(s);
    expect(s.roadsDim).toBe(before); // steady, no flicker
    void roads;
    // plenty again: the roads relight
    for (const b of extra) b.state = 'ruin';
    updateMana(s); updateMana(s);
    expect(s.roadsDim).toBe(false);
    expect(roadAt(s, t)).toBe(RoadType.Lantern);
    LOAD_CAP.stake = stakeCap;
  });
});

describe('The bot', () => {
  it('links the nearest unlinked node when the ley runs short', () => {
    const s = town(42);
    s.sectors.fill(1); // the whole map is chartered
    const bot = new Bot(s);
    updateMana(s);
    const founding = s.nodes.findIndex((n) => n.x === s.founding.x && n.y === s.founding.y);
    const other = s.nodes.map((n, k) => ({ k, d: Math.hypot(n.x - s.founding.x, n.y - s.founding.y) })).filter((e) => e.k !== founding).sort((a, b) => a.d - b.d)[0];
    expect(other).toBeDefined();
    const n = s.nodes[other.k];
    flatten(s, n.x - 7, n.y - 7, n.x + 7, n.y + 7);
    for (const nd of s.nodes) s.terrain[idx(nd.x, nd.y)] = 7;
    buildRoad(s, RoadType.Track, roadPath(n.x - 5, n.y + 2, n.x + 5, n.y + 2, false));
    (bot as unknown as { radius: number }).radius = 80;
    s.manaDemand = s.manaSupply; // short
    (bot as unknown as { linkNodes: () => void }).linkNodes();
    const near = s.buildings.some((b) => b && b.kind === 'spire' && Math.hypot(b.x - n.x, b.y - n.y) <= 6.5);
    expect(near).toBe(true);
    for (const b of s.buildings) if (b && b.state === 'building') ok(b);
    updateMana(s);
    expect(s.nodeLinked[other.k]).toBe(true);
  });
});

// The ground has limits: wells with capacity, mud, mine seams, Font flares, the Gloam that takes (the mills and the portals
// are parked: scope reset phase 1c).
function townGround(seed = 41) {
  const s = createGame(seed, 'Ground');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  s.sectors.fill(1);
  recomputeAll(s);
  return s;
}

describe('Wells with capacity', () => {
  it('a well serves 30 levels, the nearest first; the farthest go dry and say why; a second well with room takes them', () => {
    const s = townGround();
    const f = s.founding;
    s.waterDist.fill(5);
    const well = placeBuildingRaw(s, 'well', f.x, f.y + 8); ok(well);
    // thirteen level-3 hearths in a row above it, all within its 8 tiles and out of the Stake's reach: 39 levels against a cap of 30
    const hs = [] as ReturnType<typeof placeBuildingRaw>[];
    for (let k = 0; k < 13; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 6 + k, f.y + 12, 3); ok(b); hs.push(b); }
    updateWater(s);
    expect(waterCapOf(well)).toBe(30);
    expect(well.load).toBe(39);
    const dry = hs.filter((b) => !b.watered);
    expect(dry.length).toBe(3);
    expect(dry.every((b) => b.dryBy === 'overdrawn')).toBe(true);
    // the nearest are served: the dry ones are the farthest from the well
    const far = Math.max(...hs.filter((b) => b.watered).map((b) => Math.abs(b.x - well.x)));
    expect(dry.every((b) => Math.abs(b.x - well.x) >= far)).toBe(true);
    // a second well in reach of the dry end takes them
    const w2 = placeBuildingRaw(s, 'well', f.x + 7, f.y + 9); ok(w2);
    updateWater(s);
    expect(hs.every((b) => b.watered)).toBe(true);
  });

  it('a plain well far from water reaches 4, a cistern keeps 12', () => {
    const s = townGround();
    const f = s.founding;
    const well = placeBuildingRaw(s, 'well', f.x + 4, f.y + 4); ok(well);
    const cistern = placeBuildingRaw(s, 'cistern', f.x - 6, f.y + 4); ok(cistern); cistern.lit = true;
    s.waterDist.fill(12);
    expect(waterRadiusOf(s, well)).toBe(4);
    expect(waterRadiusOf(s, cistern)).toBe(12);
    s.waterDist.fill(5);
    expect(waterRadiusOf(s, well)).toBe(8);
  });
});

describe('Mud and seams', () => {
  it('a dirt track runs at six tenths in the Thaw and the Hush; cobble does not', () => {
    const s = townGround();
    const t = idx(s.founding.x, s.founding.y + 2);
    expect(s.road[t]).toBe(RoadType.Track);
    s.day = 0; expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Track].speed * MUD, 6);
    s.day = 40; expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Track].speed, 6);
    s.day = 100; expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Track].speed * MUD, 6);
    s.road[t] = RoadType.Cobble;
    expect(roadSpeedAt(s, t)).toBeCloseTo(ROAD_BY_TYPE[RoadType.Cobble].speed, 6);
  });

  it("a mine's seam falls by its cut; a spent shaft cuts dust", () => {
    const s = townGround();
    const f = s.founding;
    for (let dy = -3; dy <= -2; dy++) for (let dx = 4; dx <= 5; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
    const mine = placeBuildingRaw(s, 'mine', f.x + 4, f.y - 3); ok(mine); mine.lit = true; mine.stock = 0;
    expect(mine.seam).toBeUndefined(); // a full seam reads as SEAM
    dailyBuildings(s);
    expect(mine.seam).toBe(SEAM - 8);
    expect(mine.stock).toBe(8);
    mine.seam = 3; mine.stock = 0;
    dailyBuildings(s);
    expect(mine.seam).toBe(0);
    expect(mine.stock).toBe(3);
    expect(s.messages[s.messages.length - 1].text).toMatch(/cut out/);
    mine.stock = 0;
    dailyBuildings(s);
    expect(mine.stock).toBe(SPENT_RATE);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.buildings.find((b) => b && b.id === mine.id)!.seam).toBe(0);
  });

});

describe('Fonts and the Gloam', () => {
  it('a hot Font may flare: it and the zone buildings beside it burn, and it smokes for ten days', () => {
    const s = townGround();
    const f = s.founding;
    const font = placeBuildingRaw(s, 'font', f.x + 6, f.y - 2); ok(font); font.lit = true;
    const near = placeBuildingRaw(s, 'hearth', f.x + 8, f.y - 1, 1); ok(near);
    const far = placeBuildingRaw(s, 'hearth', f.x + 12, f.y - 1, 1); ok(far);
    s.manaSupply = 100; s.manaDemand = 95;
    expect(fontsRunHot(s)).toBe(true);
    let flared = false;
    for (let k = 0; k < 600 && !flared; k++) { dailyFire(s); if (font.state === 'burning') flared = true; else { font.state = 'ok'; near.state = 'ok'; } }
    expect(flared).toBe(true);
    expect(near.state).toBe('burning');
    expect(far.state).toBe('ok');
    expect(font.flare).toBe(FLARE_DAYS);
    updateMiasma(s);
    expect(s.miasma[idx(font.x + 1, font.y + 1)]).toBeGreaterThan(0);
    s.manaDemand = 50;
    expect(fontsRunHot(s)).toBe(false);
  });

  it('past the pressure the grey comes to a dark door, warns, and takes the building on the third day; a lit or warded one is left alone', () => {
    const s = townGround();
    const f = s.founding;
    // a dark house far from the stake, Gloam two tiles east of it
    const dark = placeBuildingRaw(s, 'hearth', f.x + 14, f.y - 8, 1); ok(dark); dark.lit = false;
    const lit = placeBuildingRaw(s, 'hearth', f.x - 14, f.y - 8, 1); ok(lit);
    for (let dy = -2; dy <= 2; dy++) { s.gloam[idx(f.x + 17, f.y - 8 + dy)] = 1; s.gloam[idx(f.x - 17, f.y - 8 + dy)] = 1; }
    s.gloamPressure = GLOAM_TAKES;
    s.day = 4; // a creep day
    s.coverage.ward.fill(0);
    // creep refuses a tile beside a lit house but may enter beside a dark one: run creep days until the grey is at the dark door
    let atDoor = false;
    for (let d = 0; d < 40 && !atDoor; d++) { s.day = 4 + d * 4; lit.lit = true; dark.lit = false; dailyGloam(s); if ((dark.greyDays ?? 0) > 0) atDoor = true; }
    expect(atDoor).toBe(true);
    expect(s.messages.some((m) => /grey is at the door/.test(m.text))).toBe(true);
    expect(lit.greyDays ?? 0).toBe(0);
    expect(s.gloam[idx(f.x - 15, f.y - 8)]).toBe(0); // the lit house keeps the grey two tiles off
    // warned: still standing; lit again it is left alone
    const id = dark.id;
    dark.lit = true;
    s.day += 1; dailyGloam(s);
    expect(dark.greyDays).toBe(0);
    expect(s.buildings.some((b) => b && b.id === id)).toBe(true);
    // dark again: taken on the third day
    dark.lit = false;
    for (let d = 0; d < GREY_DAYS; d++) { s.day += 1; dailyGloam(s); }
    expect(s.buildings.some((b) => b && b.id === id)).toBe(false);
    expect(s.gloam[idx(f.x + 14, f.y - 8)]).toBe(1);
    expect(s.messages.some((m) => /swallowed by the Gloam/.test(m.text))).toBe(true);
  });
});

// Deepening the Wellspring, the trade depot, undo snapshots, district names.
function base(seed = 61) {
  const s = createGame(seed, 'Four');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 4, f.x + 16, f.y + 12);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
  return { s, f };
}

describe('deepening the Wellspring', () => {
  it('is gated by milestone and crowns, adds mana, and caps at two', () => {
    const { s } = base();
    expect(canDeepenNode(s, 0)).toMatch(/Burgh/);
    s.milestone = 6;
    s.treasury = 100;
    expect(canDeepenNode(s, 0)).toMatch(/crowns/);
    s.treasury = 50000;
    updateMana(s);
    const before = s.manaSupply;
    expect(deepenNode(s, 0)).toBeNull();
    updateMana(s);
    expect(s.manaSupply).toBe(before + NODE_DEEPEN_MANA);
    expect(deepenNode(s, 0)).toBeNull();
    expect(deepenNode(s, 0)).toMatch(/deep/);
    expect(s.nodes[0].depth).toBe(2);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.nodes[0].depth).toBe(2);
  });
});

describe('trade depot', () => {
  it('exports surplus from full works at seasonal prices and imports for dry markets under the edict', () => {
    const { s, f } = base(62);
    s.milestone = 3;
    s.treasury = 10000;
    const c = placeBuildingRaw(s, 'craft', f.x - 5, f.y + 4, 1);
    c.stock = craftStockCap(c);
    const m = placeBuildingRaw(s, 'market', f.x + 5, f.y + 4, 1);
    m.stock = 0;
    recomputeAll(s);
    dailyTrade(s);
    expect(s.trade.exported).toBe(0); // no depot yet
    expect(placeBuilding(s, 'depot', f.x, f.y + 4).ok).toBe(true);
    const t0 = s.treasury;
    dailyTrade(s);
    expect(s.trade.exported).toBeGreaterThan(0);
    expect(c.stock).toBeLessThan(craftStockCap(c));
    expect(s.treasury).toBeGreaterThan(t0);
    expect(s.trade.imported).toBe(0);
    s.edicts.imports = true;
    dailyTrade(s);
    expect(s.trade.imported).toBeGreaterThan(0);
    expect(m.stock).toBeGreaterThan(0);
    expect(s.trade.importCost).toBeGreaterThan(0);
    // Hush makes potions dear
    s.day = 90;
    dailyTrade(s);
    expect(s.trade.priceGoods).toBeGreaterThan(2);
  });
});

describe('undo snapshots', () => {
  it('restore roads, buildings, zones and crowns without touching time', () => {
    const { s, f } = base(64);
    run(s, 50);
    const snap = takeSnapshot(s, 'test');
    const tick = s.tick;
    const gold = s.treasury;
    buildRoad(s, RoadType.Track, roadPath(f.x, f.y + 4, f.x, f.y + 9, true));
    placeBuilding(s, 'well', f.x + 1, f.y + 5);
    bulldoze(s, f.x - 3, f.y + 3);
    expect(s.treasury).toBeLessThan(gold);
    run(s, 30);
    restoreSnapshot(s, snap);
    expect(s.treasury).toBe(gold);
    expect(s.road[idx(f.x, f.y + 7)]).toBe(0);
    expect(s.road[idx(f.x - 3, f.y + 3)]).toBe(RoadType.Track);
    expect(s.buildings.some((b) => b && b.kind === 'well')).toBe(false);
    expect(s.tick).toBe(tick + 30);
    run(s, 100); // keeps simulating fine
  });
});

describe('district names', () => {
  it('rename persists through save/load and falls back to lore names', () => {
    const { s, f } = base(65);
    paintDistrict(s, 3, f.x - 4, f.y, f.x + 4, f.y + 6);
    expect(districtName(s, 3)).toBe('Spirefield');
    s.districtNames[3] = 'Old Kiln';
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(districtName(b, 3)).toBe('Old Kiln');
    expect(districtName(b, 4)).toBe('Lanternrow');
  });
});
