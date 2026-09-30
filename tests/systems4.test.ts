import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, deepenNode, canDeepenNode, NODE_DEEPEN_MANA, districtName } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, paintDistrict, placeBuilding, roadPath, takeSnapshot, restoreSnapshot, bulldoze } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Zone, idx } from '../src/sim/types';
import { dailyTrade, craftStockCap } from '../src/sim/growth';
import { updateMana } from '../src/sim/networks';
import { maybeFireCalendar, resolveEvent } from '../src/sim/events';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

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

describe('calendar festivals', () => {
  it('fire on their season day once a year and record the choice', () => {
    const { s } = base(63);
    s.population = 100;
    s.day = 2; // founding Thaw: no festival
    maybeFireCalendar(s);
    expect(s.pendingEvent).toBeNull();
    s.day = 75; // Remembrance
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('remembrance');
    resolveEvent(s, 1);
    expect(s.firedEvents.some((f) => f === 'remembrance@0:1')).toBe(true);
    maybeFireCalendar(s);
    expect(s.pendingEvent).toBeNull();
    s.day = 91; // Hush vigil
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('vigil');
    resolveEvent(s, 0);
    expect(s.modifiers.some((m) => m.kind === 'gloamHold')).toBe(true);
    s.day = 122; // next year's Thaw-day
    maybeFireCalendar(s);
    expect(s.pendingEvent?.id).toBe('thawday');
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
