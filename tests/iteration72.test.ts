/** Iteration 72 (DESIGN 4.103, golem haulers): a bound Concord Warden in harness hauls a stone cart of 30 from one Craft works,
 *  slow and tireless; the donkey carts balk at Gloam-hounds within 4 tiles and the haulers, the floating carts and the barges do
 *  not; a works lost or a surge ends the duty; the hauler is drawn as a vehicle; old saves load. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, type Agent, type Building, type GameState } from '../src/sim/types';
import { GOLEM_POST_REACH, dailyBeasts, haulerGolems, labourGolems, setGolemDuty, surgeMaddensGolems, syncHaulers } from '../src/sim/beasts';
import { CART_BALK_TICKS, CART_FEAR_REACH, FLOAT_VARIANT, GOLEM_LOAD, GOLEM_REST, GOLEM_SPEED, GOLEM_VARIANT, isDonkeyCart, isGolemCart } from '../src/sim/vehicles';
import { roadTileOf, tickAgents } from '../src/sim/agents';
import { generateSprites } from '../src/render/sprites';
import { cartMirrored, cartSpriteName } from '../src/render/carts';
import { deserialize, serialize } from '../src/sim/save';
import { ANNALS } from '../src/data/annals';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A street: a road east to west, a Craft works and a Market on it, a lit Golem Foundry south of it with one bound warden. */
function street(): { s: GameState; works: Building; market: Building; foundry: Building; g: Agent } {
  const s = createGame(72, 'Harness');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 10, f.x + 30, f.y + 14);
  s.milestone = 6;
  s.treasury = 50000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 4, f.x + 14, f.y + 4, false));
  const works = placeBuildingRaw(s, 'craft', f.x - 6, f.y + 3, 1); ok(works); works.workers = 4; works.lit = true;
  const market = placeBuildingRaw(s, 'market', f.x + 8, f.y + 3, 1); ok(market); market.workers = 2; market.lit = true;
  const foundry = placeBuildingRaw(s, 'golemfoundry', f.x, f.y + 5); ok(foundry); foundry.lit = true;
  recomputeAll(s);
  const g: Agent = { id: s.nextAgentId++, kind: AgentKind.Creature, x: foundry.x + 1, y: foundry.y + 2.5, path: [], pathIdx: 0, speed: 0.45, homeId: foundry.id, targetId: -1, timer: 0, variant: 0, dir: 0, load: 1, species: 'golem', anchorId: -1, ax: foundry.x + 1, ay: foundry.y + 2.5 };
  s.agents.push(g);
  s.agents = s.agents.filter((a) => a.kind !== AgentKind.Cart); // the street's own carts stay out of the counts
  return { s, works, market, foundry, g };
}
const golemCarts = (s: GameState) => s.agents.filter(isGolemCart);
const cart = (s: GameState, variant: number, x: number, y: number, path: number[]): Agent => {
  const a: Agent = { id: s.nextAgentId++, kind: AgentKind.Cart, x: x + 0.5, y: y + 0.5, path, pathIdx: 0, speed: 0.8, homeId: -1, targetId: -1, timer: 0, variant, dir: 0, load: 0 };
  s.agents.push(a);
  return a;
};

describe('The hauler duty', () => {
  it('puts a warden in harness at a Craft works: a golem cart appears at its road, and labour, a far works and a wild warden are refused', () => {
    const { s, works, g } = street();
    expect(labourGolems(s)).toBe(1);
    expect(setGolemDuty(s, g.id, 'haul', works.id)).toBeNull();
    expect(g.duty).toBe('haul');
    expect(g.targetId).toBe(works.id);
    expect(labourGolems(s)).toBe(0);
    expect(haulerGolems(s).length).toBe(1);
    const carts = golemCarts(s);
    expect(carts.length).toBe(1);
    expect(carts[0].homeId).toBe(works.id);
    expect(carts[0].golemId).toBe(g.id);
    expect(carts[0].speed).toBe(GOLEM_SPEED);
    const rt = roadTileOf(s, works);
    expect([Math.floor(carts[0].x), Math.floor(carts[0].y)]).toEqual([rt % s.w, Math.floor(rt / s.w)]);
    expect(isDonkeyCart(carts[0])).toBe(false);
    // the same duty again replaces the cart rather than doubling it
    expect(setGolemDuty(s, g.id, 'haul', works.id)).toBeNull();
    expect(golemCarts(s).length).toBe(1);
    // back to labour: the cart goes
    expect(setGolemDuty(s, g.id, 'labour')).toBeNull();
    expect(golemCarts(s).length).toBe(0);
    expect(g.duty).toBeUndefined();
    // a works out of reach, a works with no road, and a wild warden
    const far = placeBuildingRaw(s, 'craft', s.founding.x + GOLEM_POST_REACH + 8, s.founding.y + 3, 1); ok(far);
    expect(setGolemDuty(s, g.id, 'haul', far.id)).toMatch(/Too far/);
    const noRoad = placeBuildingRaw(s, 'craft', s.founding.x - 6, s.founding.y - 4, 1); ok(noRoad);
    expect(setGolemDuty(s, g.id, 'haul', noRoad.id)).toMatch(/no road/);
    expect(setGolemDuty(s, g.id, 'haul', -1)).toMatch(/Craft works/);
    g.load = 0;
    expect(setGolemDuty(s, g.id, 'haul', works.id)).toMatch(/wild/);
    expect(golemCarts(s).length).toBe(0);
  });

  it('hauls 30 goods a trip from its works to the market, and rests 20 ticks there, not 150 and more', () => {
    const { s, works, market, g } = street();
    works.stock = 45;
    market.stock = 0;
    market.level = 2; // room for 40
    setGolemDuty(s, g.id, 'haul', works.id);
    const c = golemCarts(s)[0];
    let departed = 0;
    let arrivedAt = -1;
    for (let k = 0; k < 6000 && arrivedAt < 0; k++) {
      s.tick++;
      tickAgents(s);
      if (c.load > 0 && !departed) departed = c.load;
      if (departed && c.load === 0 && c.targetId !== -1) arrivedAt = k;
    }
    expect(departed).toBe(GOLEM_LOAD);
    expect(works.stock).toBe(15);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(market.stock).toBe(GOLEM_LOAD);
    expect(s.stats.golemHauls).toBe(GOLEM_LOAD);
    expect(s.stats.goodsDelivered).toBe(GOLEM_LOAD);
    expect(c.timer).toBe(GOLEM_REST);
    expect(c.speed).toBeLessThan(0.8);
    // a smaller market: the warden loads what it has room for, never more than 30, never under 6
    const small = placeBuildingRaw(s, 'market', s.founding.x + 10, s.founding.y + 3, 1); ok(small); small.workers = 2; small.lit = true; small.stock = 12;
    recomputeAll(s);
    market.stock = 40;
    works.stock = 45;
    c.timer = 0;
    let load2 = 0;
    for (let k = 0; k < 3000 && !load2; k++) { s.tick++; tickAgents(s); if (c.load > 0) load2 = c.load; }
    expect(load2).toBe(8);
    // the warden itself stands at its works, in harness, and is not labour
    expect(g.path.length).toBe(0);
    expect(labourGolems(s)).toBe(0);
  });

  it('ends when the works is lost (the warden walks back to labour) or when a surge frees the warden', () => {
    const { s, works, g } = street();
    setGolemDuty(s, g.id, 'haul', works.id);
    works.state = 'ruin';
    syncHaulers(s);
    expect(g.duty).toBeUndefined();
    expect(golemCarts(s).length).toBe(0);
    expect(s.messages.some((m) => /nothing left to haul/.test(m.text))).toBe(true);
    ok(works);
    setGolemDuty(s, g.id, 'haul', works.id);
    expect(golemCarts(s).length).toBe(1);
    // a cart lost from the list comes back on the daily sync
    s.agents = s.agents.filter((a) => !isGolemCart(a));
    dailyBeasts(s);
    expect(golemCarts(s).length).toBe(1);
    expect(surgeMaddensGolems(s)).toBe(1);
    expect(g.load).toBe(0);
    expect(golemCarts(s).length).toBe(0);
  });
});

describe('Donkeys balk at hounds', () => {
  it('a donkey cart with a hound within 4 tiles stops for 60 ticks and the carters complain once a day; a hauler and a floating cart go on', () => {
    const { s, works, g } = street();
    const f = s.founding;
    const y = f.y + 4;
    const path = [1, 2, 3, 4, 5, 6].map((k) => (y) * s.w + f.x - 10 + k);
    const donkey = cart(s, 1, f.x - 10, y, path);
    const stone = cart(s, 0, f.x - 10, y, path.slice());
    const floating = cart(s, FLOAT_VARIANT, f.x - 10, y, path.slice());
    setGolemDuty(s, g.id, 'haul', works.id);
    const hauler = golemCarts(s)[0];
    hauler.x = f.x - 10 + 0.5; hauler.y = y + 0.5; hauler.path = path.slice(); hauler.pathIdx = 0;
    expect(hauler.variant).toBe(GOLEM_VARIANT);
    // a hound two tiles north of the road
    s.agents.push({ id: s.nextAgentId++, kind: AgentKind.Creature, x: f.x - 9 + 0.5, y: y - 2 + 0.5, path: [], pathIdx: 0, speed: 1.3, homeId: -1, targetId: -1, timer: 0, variant: 0, dir: 0, load: 0, species: 'hound', anchorId: -1, ax: f.x, ay: y - 20 });
    const day = s.day;
    s.tick++;
    tickAgents(s);
    expect(donkey.timer).toBe(CART_BALK_TICKS);
    expect(stone.timer).toBe(CART_BALK_TICKS);
    expect(donkey.x).toBe(f.x - 10 + 0.5);
    expect(hauler.timer).toBe(0);
    expect(hauler.x).toBeGreaterThan(f.x - 10 + 0.5);
    expect(floating.timer).toBe(0);
    expect(floating.x).toBeGreaterThan(f.x - 10 + 0.5);
    expect(s.stats.cartsBalked).toBe(2);
    expect(s.stats.lastBalkDay).toBe(day);
    expect(s.messages.filter((m) => /donkeys balk/.test(m.text)).length).toBe(1);
    // the hound gone far: the donkey goes on once its wait is over
    for (const h of s.agents) if (h.species === 'hound') { h.x = f.x + 20; h.y = y - 2; }
    for (let k = 0; k < CART_BALK_TICKS + 2; k++) { s.tick++; tickAgents(s); }
    expect(donkey.x).toBeGreaterThan(f.x - 10 + 0.5);
    expect(s.stats.cartsBalked).toBe(2);
    expect(s.messages.filter((m) => /donkeys balk/.test(m.text)).length).toBe(1);
    // a hound just past the reach does not count
    const h = s.agents.find((a) => a.species === 'hound')!;
    h.x = donkey.x + CART_FEAR_REACH + 0.6; h.y = donkey.y;
    const x0 = donkey.x;
    s.tick++;
    tickAgents(s);
    expect(donkey.timer).toBe(0);
    expect(donkey.x).toBeGreaterThan(x0);
  });

  it('a street without hounds moves exactly as before: no roll is drawn and no timer set', () => {
    const { s } = street();
    const f = s.founding;
    const y = f.y + 4;
    const path = [1, 2, 3].map((k) => y * s.w + f.x - 10 + k);
    const donkey = cart(s, 1, f.x - 10, y, path);
    s.tick++;
    tickAgents(s);
    expect(donkey.timer).toBe(0);
    expect(s.stats.cartsBalked).toBe(0);
  });
});

describe('The hauler is drawn as a vehicle', () => {
  it('has a procedural sprite at the carts\' scale with a glowing rune, picked by its variant and mirrored when it heads left', () => {
    const d = generateSprites().find((x) => x.name === `cart_${GOLEM_VARIANT}`)!;
    expect(d).toBeDefined();
    expect(d.p.w).toBeLessThanOrEqual(28);
    let top = -1, bottom = -1, left = 99, right = -1;
    for (let y = 0; y < d.p.h; y++) for (let x = 0; x < d.p.w; x++) if (d.p.get(x, y) > 0) { if (top < 0) top = y; bottom = y; left = Math.min(left, x); right = Math.max(right, x); }
    expect(bottom - top + 1).toBeLessThanOrEqual(18); // a citizen (12) and a half
    expect(bottom).toBe(d.ay); // feet and wheels on the anchor row
    expect(d.ax).toBeGreaterThan(left);
    expect(d.ax).toBeLessThan(right);
    expect(d.glow).toBeDefined();
    let glow = 0;
    for (let y = 0; y < d.glow!.h; y++) for (let x = 0; x < d.glow!.w; x++) if (d.glow!.get(x, y) > 0) glow++;
    expect(glow).toBeGreaterThan(0);
    expect(cartSpriteName({ id: 3, variant: GOLEM_VARIANT, dir: 0 }, () => 25)).toBe(`cart_${GOLEM_VARIANT}`);
    expect(cartMirrored({ variant: GOLEM_VARIANT, dir: 0 })).toBe(false);
    expect(cartMirrored({ variant: GOLEM_VARIANT, dir: 3 })).toBe(false);
    expect(cartMirrored({ variant: GOLEM_VARIANT, dir: 2 })).toBe(true);
    expect(cartMirrored({ variant: GOLEM_VARIANT, dir: 1 })).toBe(true);
    expect(cartMirrored({ variant: 1, dir: 2 })).toBe(false); // the donkeys have painted twins
  });

  it('the Foundry says so, and the Annals count the hauls and the balks', () => {
    expect(BUILDING_BY_KEY.golemfoundry.desc).toMatch(/haul/);
    const rows = ANNALS.flatMap((c) => c.rows.map((r) => r.stat));
    expect(rows).toContain('golemHauls');
    expect(rows).toContain('cartsBalked');
  });
});

describe('Saves', () => {
  it('keep a warden in harness and its cart; an old save without the new counters loads with them at zero', () => {
    const { s, works, g } = street();
    setGolemDuty(s, g.id, 'haul', works.id);
    s.stats.golemHauls = 90;
    const back = deserialize(serialize(s), (seed) => createGame(seed, 'Harness'));
    const g2 = back.agents.find((a) => a.id === g.id)!;
    expect(g2.duty).toBe('haul');
    expect(golemCarts(back).length).toBe(1);
    expect(golemCarts(back)[0].golemId).toBe(g.id);
    expect(back.stats.golemHauls).toBe(90);
    const o = JSON.parse(serialize(s));
    delete o.stats.golemHauls;
    delete o.stats.cartsBalked;
    delete o.stats.lastBalkDay;
    const old = deserialize(JSON.stringify(o), (seed) => createGame(seed, 'Harness'));
    expect(old.stats.golemHauls).toBe(0);
    expect(old.stats.cartsBalked).toBe(0);
    expect(old.stats.lastBalkDay).toBe(-1);
  });
});
