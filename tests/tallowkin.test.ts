import { describe, expect, it } from 'vitest';
import { createGame, nodeFlow, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { dailyBuildings } from '../src/sim/growth';
import { updateMana } from '../src/sim/networks';
import { ALL_EVENTS, descOf, resolveEvent } from '../src/sim/events';
import { checkMilestones } from '../src/sim/economy';
import { Bot } from '../src/sim/bot';
import { BUILDING_BY_KEY, WONDER_HALLS } from '../src/sim/catalog';
import { TALLOW_LIGHT, costOf, litShare, milestonesOf, type FactionId } from '../src/data/factions';
import { flatten } from './helpers';

/** A flat town: roads at dy 2 and 3, the founding node at the centre. */
function town(faction: FactionId = 'tallowkin') {
  const s = createGame(41, 'Wickmere', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 14, f.x + 20, f.y + 14);
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 2, f.x + 18, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 18, f.y + 3, f.x + 18, f.y + 3, false));
  s.treasury = 50000;
  recomputeAll(s);
  return s;
}
const count = (s: ReturnType<typeof town>, kind: string) => s.buildings.filter((b) => b && b.kind === kind).length;

describe('The Tallowkin of the Wick: rules', () => {
  it('spires reach a tile further and cost double', () => {
    const s = town();
    const v = town('vellish');
    const f = s.founding;
    expect(costOf(s, BUILDING_BY_KEY.spire)).toBe(800);
    expect(costOf(v, BUILDING_BY_KEY.spire)).toBe(400);
    expect(costOf(s, BUILDING_BY_KEY.hearth)).toBe(BUILDING_BY_KEY.hearth.cost);
    const t0 = s.treasury;
    expect(placeBuilding(s, 'spire', f.x - 4, f.y + 1).ok).toBe(true);
    expect(t0 - s.treasury).toBe(800);
    // a spire exactly 7 from the node (and far from the stake) links for them and not for the Vellish
    const ts = placeBuildingRaw(s, 'spire', f.x, f.y + 7);
    const vs = placeBuildingRaw(v, 'spire', f.x, f.y + 7);
    updateMana(s); updateMana(v);
    expect(ts.lit).toBe(true);
    expect(vs.lit).toBe(false);
    // and light 6 tiles instead of 5
    expect(s.lit[idx(f.x, f.y + 13)]).toBe(1);
    expect(s.lit[idx(f.x, f.y + 14)]).toBe(0);
  });

  it('a house three days dark is abandoned; a Vellish house is not, for that alone', () => {
    const dark = (faction: FactionId) => {
      const s = town(faction);
      const f = s.founding;
      const b = placeBuildingRaw(s, 'hearth', f.x + 14, f.y + 1);
      b.residents = 4; b.happiness = 60;
      recomputeAll(s);
      expect(b.lit).toBe(false);
      for (let d = 0; d < 5; d++) { b.watered = true; b.lit = false; dailyBuildings(s); s.day++; }
      return b;
    };
    expect(dark('tallowkin').state).toBe('abandoned');
    expect(dark('vellish').state).toBe('ok');
  });

  it('keep the vigil cheaply, or pay for sleeping; node mana ×1.2', () => {
    const s = town();
    const v = town('vellish');
    expect(s.nodes.length).toBe(v.nodes.length + 1);
    expect(s.manaSupply).toBeCloseTo(nodeFlow(s, s.nodeLinked) * 1.2, 3); // the linked nodes, every one a fifth stronger
    const vigil = ALL_EVENTS.find((e) => e.id === 'vigil')!;
    expect(descOf(vigil.choices[0], s)).toContain('60 stored mana');
    expect(descOf(vigil.choices[0], v)).toContain('120 stored mana');
    s.manaStorage = 200; v.manaStorage = 200;
    const fire = (g: ReturnType<typeof town>, c: number) => { g.pendingEvent = { id: 'vigil', title: vigil.title, text: vigil.text, choices: [] }; resolveEvent(g, c); };
    fire(s, 0); fire(v, 0);
    expect(200 - s.manaStorage).toBe(60);
    expect(200 - v.manaStorage).toBe(120);
    fire(s, 1); fire(v, 1);
    expect(s.modifiers.find((m) => m.label === 'Vigil skipped')!.value).toBe(-8);
    expect(v.modifiers.find((m) => m.label === 'Vigil skipped')!.value).toBe(-3);
  });
});

describe('The Tallowkin of the Wick: buildings', () => {
  it('a Wick-Tower glows in reach of a lit spire and relays nothing; the Candle-Shrine lights itself', () => {
    const v = town('vellish');
    for (const k of ['wicktower', 'candleshrine', 'lanternofwicks']) expect(placeBuilding(v, k, v.founding.x + 4, v.founding.y + 1).ok).toBe(false);
    const s = town();
    const f = s.founding;
    const t0 = s.treasury;
    expect(placeBuilding(s, 'wicktower', f.x + 10, f.y + 1).ok).toBe(true); // 10 from the node: beyond a spire's reach
    expect(t0 - s.treasury).toBe(250);
    const home = placeBuildingRaw(s, 'hearth', f.x + 12, f.y + 1);
    const far = placeBuildingRaw(s, 'spire', f.x + 16, f.y + 1); // 6 from the tower: a spire would relay to it, a tower must not
    recomputeAll(s);
    const tower = s.buildings.find((b) => b && b.kind === 'wicktower')!;
    expect(tower.lit).toBe(false);
    expect(home.lit).toBe(false);
    expect(placeBuilding(s, 'spire', f.x + 5, f.y + 4).ok).toBe(true); // links to the node at 6.4, reaches the tower at 5.8
    recomputeAll(s);
    expect(tower.lit).toBe(true);
    expect(home.lit).toBe(true);
    expect(far.lit).toBe(false);
    expect(count(s, 'candleshrine')).toBe(0);
    expect(placeBuilding(s, 'shrine', f.x - 4, f.y + 1).ok).toBe(false); // replaced
    expect(placeBuilding(s, 'candleshrine', f.x - 14, f.y + 1).ok).toBe(true);
    recomputeAll(s);
    expect(s.buildings.find((b) => b && b.kind === 'candleshrine')!.lit).toBe(true);
    expect(WONDER_HALLS).toContain('lanternofwicks');
  });
});

describe('The Tallowkin of the Wick: light', () => {
  it('milestones are named by light and gated on the lit share', () => {
    const s = town();
    const f = s.founding;
    expect(milestonesOf(s).map((m) => m.name)).toEqual(['Wick', 'Taper', 'Candle', 'Lamp', 'Lantern', 'Beacon-Street', 'Bright Town', 'Hall of Wicks', 'Lantern of Wicks']);
    expect(TALLOW_LIGHT.length).toBe(9);
    for (let k = 0; k < 6; k++) placeBuildingRaw(s, 'hearth', f.x + 12 + k, f.y + 1); // dark, out of the node's reach
    recomputeAll(s);
    expect(litShare(s)).toBeLessThan(0.5);
    s.population = 100;
    checkMilestones(s);
    expect(s.milestone).toBe(0);
    placeBuildingRaw(s, 'spire', f.x + 7, f.y + 1); placeBuildingRaw(s, 'spire', f.x + 13, f.y + 4);
    recomputeAll(s);
    expect(litShare(s)).toBeGreaterThanOrEqual(0.6);
    checkMilestones(s);
    expect(s.milestone).toBe(2);
  });

  it('a Tallowkin game begins between two nodes; other maps are untouched', () => {
    for (const seed of [41, 42, 43, 44]) {
      const t = createGame(seed, 'W', 'valley', 'tallowkin');
      const v = createGame(seed, 'W', 'valley', 'vellish');
      const f = t.founding;
      expect(f).toEqual(v.founding);
      expect(t.nodes.length).toBe(v.nodes.length + 1);
      const twin = t.nodes.find((n) => n !== t.nodes[0] && Math.max(Math.abs(n.x - f.x), Math.abs(n.y - f.y)) === 8)!;
      expect(twin).toBeTruthy();
      expect(twin.aspect).toBe('vein');
      expect(t.terrain[idx(twin.x, twin.y)]).toBe(Terrain.LeyNode);
      expect(v.nodes.every((n, i) => t.nodes[i].x === n.x && t.nodes[i].y === n.y)).toBe(true);
    }
    const g = createGame(41, 'W', 'valley', 'grimmen');
    const v = createGame(41, 'W', 'valley', 'vellish');
    expect(g.nodes.length).toBe(v.nodes.length);
  });
});

describe('The bot plays the Tallowkin', () => {
  it('keeps the town lit with Wick-Towers and reaches the Taper within twenty days', () => {
    const s = town();
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 20, { onDay: () => bot.step() });
    expect(count(s, 'wicktower')).toBeGreaterThan(0);
    expect(s.milestone).toBeGreaterThanOrEqual(1);
    expect(litShare(s)).toBeGreaterThanOrEqual(0.5);
    expect(s.buildings.filter((b) => b && b.state === 'ok' && !b.lit && b.problemDays > 3).length).toBe(0);
  });
  it('a Vellish bot raises no Wick-Tower', () => {
    const v = town('vellish');
    const bot = new Bot(v);
    for (let d = 0; d < 10; d++) bot.step();
    expect(count(v, 'wicktower')).toBe(0);
  });
});
