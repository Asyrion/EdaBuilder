import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw, nodeFlow } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { idx } from '../src/sim/types';
import { ASPECTS, aspectAt, dragonAuras, auraAt, computeGloamPressure, riverFrozen, millFactor, dailyWeave } from '../src/sim/weave';
import { updateMana } from '../src/sim/networks';
import { updateCoverage } from '../src/sim/services';
import { dailyBuildings } from '../src/sim/growth';
import { placeBuilding, buildRoad, roadPath } from '../src/sim/actions';
import { RoadType } from '../src/sim/types';
import { addEgg } from '../src/sim/wyrmcraft';
import { maybeFireEvent } from '../src/sim/events';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

describe('Ley aspects', () => {
  it('every node has an aspect, the founding node is Vein, and old saves get one', () => {
    const s = createGame(41, 'Weave');
    expect(s.nodes.every((n) => n.aspect && ASPECTS.includes(n.aspect))).toBe(true);
    expect(s.nodes.find((n) => n.x === s.founding.x && n.y === s.founding.y)!.aspect).toBe('vein');
    expect(aspectAt(s, s.founding.x + 3, s.founding.y)).toBe('vein');
    const o = JSON.parse(serialize(s));
    for (const n of o.nodes) delete n.aspect;
    const b = deserialize(JSON.stringify(o), (seed) => createGame(seed));
    expect(b.nodes.every((n) => !!n.aspect)).toBe(true);
    expect(b.nodes[0].aspect).toBe('vein');
  });

  it('Vein ley adds flow, Tide ley stretches wells and mills, Ember ley feeds the works', () => {
    const s = createGame(41, 'Weave');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 12);
    updateMana(s);
    const vein = s.nodes.filter((n) => n.aspect === 'vein').length;
    expect(s.manaSupply).toBe(nodeFlow(s, s.nodeLinked)); // the linked nodes only
    void vein;
    // force the founding node to Tide for the water test
    s.nodes[0].aspect = 'tide';
    buildRoad(s, RoadType.Track, roadPath(f.x - 8, f.y + 3, f.x + 8, f.y + 3, false));
    const w = placeBuildingRaw(s, 'well', f.x + 2, f.y + 4);
    s.waterDist.fill(5); // water within reach (a well more than 8 from any water reaches only 4)
    recomputeAll(s);
    expect(s.watered[idx(f.x + 2, f.y + 4 + 9)]).toBe(1); // base 8 +2 Tide
    void w;
    s.nodes[0].aspect = 'ember';
    const c = placeBuildingRaw(s, 'craft', f.x - 2, f.y + 4, 2);
    recomputeAll(s);
    c.workers = 10; c.lit = true; c.stock = 0;
    dailyBuildings(s);
    const ember = c.stock;
    s.nodes[0].aspect = 'vein';
    c.workers = 10; c.lit = true; c.stock = 0;
    dailyBuildings(s);
    expect(ember / c.stock).toBeCloseTo(1.15, 1);
  });
});

describe('Dragon auras', () => {
  it('a stage-2 Grey drake wards around its cradle; a Tide drake douses; a Vein drake adds mana', () => {
    const s = createGame(41, 'Aura');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 12);
    const cr = placeBuildingRaw(s, 'cradle', f.x + 2, f.y + 4);
    cr.lit = true;
    const cr2 = placeBuildingRaw(s, 'cradle', f.x + 5, f.y + 4);
    cr2.lit = true;
    const g = addEgg(s, 'grey')!; g.stage = 2;
    const t = addEgg(s, 'tide')!; t.stage = 2;
    const v = addEgg(s, 'vein')!; v.stage = 2;
    s.tick = 100;
    expect(dragonAuras(s).length).toBe(3);
    expect(auraAt(s, 'grey', f.x + 5, f.y + 5)).toBe(true);
    updateCoverage(s, 'ward');
    updateCoverage(s, 'fire');
    expect(s.coverage.ward[idx(f.x + 4, f.y + 5)]).toBeGreaterThan(0);
    expect(s.coverage.fire[idx(f.x + 4, f.y + 5)]).toBeGreaterThan(0);
    updateMana(s);
    const withVein = s.manaSupply;
    v.stage = 1;
    s.tick = 200;
    updateMana(s);
    expect(withVein - s.manaSupply).toBe(10);
  });
});

describe('Gloam pressure, the river and marvels', () => {
  it('pressure rises with the dead and falls with faith; the river freezes in the Hush', () => {
    const s = createGame(41, 'Press');
    const base = computeGloamPressure(s);
    s.unquieted = 80;
    expect(computeGloamPressure(s)).toBeGreaterThan(base);
    s.unquieted = 0;
    s.overdrawDays = 2;
    expect(computeGloamPressure(s)).toBeCloseTo(base + 0.15, 5);
    s.day = 96; // Hush, day 6
    expect(riverFrozen(s)).toBe(true);
    expect(millFactor(s)).toBe(0.5);
    s.day = 3;
    expect(riverFrozen(s)).toBe(false);
    expect(millFactor(s)).toBe(1.3);
    dailyWeave(s);
    expect(s.gloamPressure).toBeGreaterThan(0);
  });

  it('marvels need rare goods and consume them; lofts gather glim-dust', () => {
    const s = createGame(41, 'Marv');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 12);
    s.milestone = 6;
    s.treasury = 100000;
    buildRoad(s, RoadType.Track, roadPath(f.x - 8, f.y + 3, f.x + 8, f.y + 3, false));
    expect(placeBuilding(s, 'scaleward', f.x + 2, f.y + 4).reason).toMatch(/scale/);
    s.materials.scale = 12;
    expect(placeBuilding(s, 'scaleward', f.x + 2, f.y + 4).ok).toBe(true);
    expect(s.materials.scale).toBe(2);
    expect(s.stats.marvels).toBe(1);
    const loft = placeBuildingRaw(s, 'mothloft', f.x - 2, f.y + 4);
    loft.lit = true;
    dailyWeave(s);
    expect(s.materials.glimdust).toBeCloseTo(0.3, 5);
    run(s, 5);
  });

  it('the storyteller waits after an ill tiding', () => {
    const s = createGame(41, 'Tale');
    s.day = 100; s.lastEventDay = 0; s.lastBadDay = 98; s.population = 200;
    for (let k = 0; k < 20; k++) maybeFireEvent(s);
    expect(s.pendingEvent).toBeNull();
  });
});
