/** Iteration 81 (DESIGN 4.112, the Brickworks): the drawing of iteration 80 given to a building of its own, 3×3 at the Village.
 *  Ten hands make goods of brick for the carts, the kiln lights it, and a building site within 12 tiles of a staffed one rises
 *  half again as fast; zone lots are untouched. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { BUILDING_BY_KEY, MILESTONES, isBuildingUnlocked } from '../src/sim/catalog';
import { BASE_RATE, BRICK_REACH, BRICK_SPEED, brickworksNear, construction, tickConstruction } from '../src/sim/construction';
import { craftStockCap, dailyBuildings, isGoodsSource } from '../src/sim/growth';
import { reachesOf } from '../src/sim/reach';
import { AgentKind, type Building, type GameState } from '../src/sim/types';
import { flatten } from './helpers';

beforeAll(() => { construction.instant = false; });
afterAll(() => { construction.instant = true; });

function town(): GameState {
  const s = createGame(81, 'Brickwick');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 30, f.x + 30, f.y + 30);
  s.sectors.fill(1);
  s.milestone = 3;
  s.agents = s.agents.filter((a) => a.kind !== AgentKind.Builder);
  return s;
}
function works(s: GameState, x: number, y: number, workers = 10): Building {
  const b = placeBuildingRaw(s, 'brickworks', x, y);
  b.state = 'ok';
  b.workers = workers;
  return b;
}
function site(s: GameState, key: string, x: number, y: number): Building {
  const b = placeBuildingRaw(s, key, x, y);
  b.state = 'building';
  b.work = b.workTotal = 3000;
  return b;
}

describe('The Brickworks', () => {
  it('is a 3×3 building of the Village that makes goods for the carts and lights itself', () => {
    const d = BUILDING_BY_KEY.brickworks;
    expect([d.w, d.h, d.unlock, d.goodsRate, d.selfLit, d.manaUse]).toEqual([3, 3, 3, 6, true, 0]);
    expect(MILESTONES[3].unlocks).toContain('brickworks');
    expect(isBuildingUnlocked(2, 'brickworks')).toBe(false);
    expect(isBuildingUnlocked(3, 'brickworks')).toBe(true);
  });

  it('ten hands make six goods a day for the carts, half that unlit', () => {
    const s = town();
    const bw = works(s, s.founding.x - 10, s.founding.y - 10);
    expect(isGoodsSource(bw)).toBe(true);
    expect(craftStockCap(bw)).toBeGreaterThanOrEqual(12);
    bw.lit = true;
    dailyBuildings(s);
    expect(bw.stock).toBeCloseTo(6, 5);
    bw.stock = 0;
    bw.lit = false;
    bw.workers = 10;
    dailyBuildings(s);
    expect(bw.stock).toBeCloseTo(3, 5);
  });

  it('a site within its reach rises half again as fast while it is staffed; one beyond, or an empty works, gives nothing', () => {
    const s = town();
    const f = s.founding;
    const bw = works(s, f.x - 10, f.y - 10);
    const near = site(s, 'watchhouse', f.x - 10 + 1 + 8, f.y - 10 + 1); // 8 tiles from its centre
    const far = site(s, 'watchhouse', f.x - 10 + 1 + BRICK_REACH + 4, f.y - 10 + 1);
    expect(brickworksNear(s, near)?.id).toBe(bw.id);
    expect(brickworksNear(s, far)).toBeNull();
    tickConstruction(s);
    expect(3000 - near.work).toBeCloseTo(BASE_RATE * BRICK_SPEED, 5);
    expect(3000 - far.work).toBeCloseTo(BASE_RATE, 5);
    bw.workers = 0;
    expect(brickworksNear(s, near)).toBeNull();
    const w = near.work;
    tickConstruction(s);
    expect(w - near.work).toBeCloseTo(BASE_RATE, 5);
  });

  it('a works still being built speeds nothing, itself included; zone lots rise as before', () => {
    const s = town();
    const f = s.founding;
    const bw = works(s, f.x - 10, f.y - 10);
    bw.state = 'building';
    bw.work = bw.workTotal = 3000;
    const near = site(s, 'watchhouse', f.x - 4, f.y - 9);
    expect(brickworksNear(s, near)).toBeNull();
    expect(brickworksNear(s, bw)).toBeNull();
    bw.state = 'ok';
    const lot = site(s, 'hearth', f.x - 5, f.y - 8);
    tickConstruction(s);
    expect(3000 - lot.work).toBe(1);
  });

  it('has a ring for its builders\' reach', () => {
    const s = town();
    const bw = works(s, s.founding.x - 10, s.founding.y - 10);
    expect(reachesOf(s, BUILDING_BY_KEY.brickworks, bw).some((r) => r.r === BRICK_REACH && /bricks/.test(r.label))).toBe(true);
  });
});
