// Iteration 45, M14 part 1a: the ley has limits. Linked nodes, spire load, brownout tiers, lantern-ways that need their light.
import { describe, expect, it } from 'vitest';
import { createGame, nodeFlow, placeBuildingRaw, canDeepenNode } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { RoadType, idx } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { LOAD_CAP, loadCapOf, priorityOf, updateMana } from '../src/sim/networks';
import { roadAt } from '../src/sim/roads';
import { ROAD_BY_TYPE } from '../src/sim/catalog';
import { Bot } from '../src/sim/bot';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 41) {
  const s = createGame(seed, 'Limits', 'valley');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  s.milestone = 6;
  s.treasury = 80000;
  recomputeAll(s);
  return s;
}
const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

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
    expect(s.manaSupply).toBe(flow + 45 + ((s.nodes[other].aspect === 'vein' ? 15 : 0)) + (s.nodes[other].depth ?? 0) * 45); // the other half of its flow, and its Vein
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
