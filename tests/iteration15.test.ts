import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, Terrain, idx } from '../src/sim/types';
import { dailyAgents, tickAgents } from '../src/sim/agents';
import { updateCreatures, tickCreatures } from '../src/sim/creatures';
import { spawnRestless } from '../src/sim/agents';
import { updateMana } from '../src/sim/networks';
import { FLOAT_VARIANT, BARGE_VARIANT, dailyBarges, waterPath, floatingTarget, floatingMana, dailyAirship, airshipArrives } from '../src/sim/vehicles';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function base(seed = 17) {
  const s = createGame(seed, 'Barge');
  const f = s.founding;
  flatten(s, f.x - 30, f.y - 8, f.x + 30, f.y + 14);
  s.milestone = 8;
  s.treasury = 200000;
  return { s, f };
}

describe('Floating carts', () => {
  it('level-3 Arcane workshops put hovering carts on the road that draw mana while moving and add no traffic', () => {
    const { s, f } = base();
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    for (let k = 0; k < 4; k++) { const c = placeBuildingRaw(s, 'craft', f.x - 8 + k, f.y + 4, 2); c.stock = 50; c.workers = 6; }
    for (let k = 0; k < 3; k++) { const m = placeBuildingRaw(s, 'market', f.x + 4 + k, f.y + 4, 2); m.workers = 4; }
    const a = placeBuildingRaw(s, 'arcane', f.x, f.y + 4, 3);
    recomputeAll(s);
    expect(floatingTarget(s)).toBe(2);
    dailyAgents(s);
    const floats = s.agents.filter((x) => x.kind === AgentKind.Cart && x.variant === FLOAT_VARIANT);
    expect(floats.length).toBe(2);
    s.agents = s.agents.filter((x) => !(x.kind === AgentKind.Cart && x.variant !== FLOAT_VARIANT));
    let moving = 0;
    for (let k = 0; k < 400; k++) { tickAgents(s); s.tick++; if (floatingMana(s) > 0) moving++; }
    expect(moving).toBeGreaterThan(0);
    const road = idx(f.x - 2, f.y + 3);
    // no traffic from the hover lane: only mule carts and citizens count, and there are none
    expect(s.traffic[road]).toBe(0);
    a.level = 1;
    expect(floatingTarget(s)).toBe(0);
    updateMana(s);
  });
});

describe('Barges and Quays', () => {
  it('water paths, and a barge carrying goods from works near one quay to markets near another', () => {
    const { s, f } = base();
    // a straight river along y = f.y + 8 from x-20 to x+20
    for (let x = f.x - 20; x <= f.x + 20; x++) s.terrain[idx(x, f.y + 8)] = Terrain.Water;
    buildRoad(s, RoadType.Track, roadPath(f.x - 20, f.y + 6, f.x + 20, f.y + 6, false));
    const qa = placeBuildingRaw(s, 'quay', f.x - 18, f.y + 7);
    const qb = placeBuildingRaw(s, 'quay', f.x + 18, f.y + 7);
    expect(waterPath(s, idx(f.x - 18, f.y + 8), idx(f.x + 18, f.y + 8))!.length).toBe(37);
    const c = placeBuildingRaw(s, 'craft', f.x - 16, f.y + 5, 2); c.stock = 60;
    const m = placeBuildingRaw(s, 'market', f.x + 16, f.y + 5, 2); m.stock = 0;
    recomputeAll(s);
    dailyBarges(s);
    const barge = s.agents.find((x) => x.kind === AgentKind.Cart && x.variant === BARGE_VARIANT)!;
    expect(barge).toBeTruthy();
    expect(barge.homeId).toBe(qa.id);
    expect(barge.targetId).toBe(qb.id);
    expect(barge.load).toBeGreaterThan(0);
    expect(c.stock).toBeLessThan(60);
    expect(s.stats.bargeTrips).toBe(1);
    for (let k = 0; k < 3000 && s.agents.includes(barge); k++) { tickAgents(s); s.tick++; }
    expect(s.agents.includes(barge)).toBe(false);
    expect(m.stock).toBeGreaterThan(0);
    // no second barge while one is out; a new one the next day
    dailyBarges(s);
    expect(s.agents.filter((x) => x.variant === BARGE_VARIANT).length).toBe(1);
  });
});

describe('Drake riders', () => {
  it('fly from a lit mews to the restless and lay them down', () => {
    const { s, f } = base();
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    const mews = placeBuildingRaw(s, 'drakemews', f.x, f.y + 4);
    mews.lit = true;
    recomputeAll(s);
    mews.lit = true;
    updateCreatures(s);
    expect(s.agents.filter((a) => a.kind === AgentKind.Creature && a.species === 'rider').length).toBe(2);
    expect(spawnRestless(s, f.x + 8, f.y + 3)).toBe(true);
    for (let k = 0; k < 600 && s.agents.some((a) => a.kind === AgentKind.Restless); k++) { tickCreatures(s); s.tick++; }
    expect(s.agents.some((a) => a.kind === AgentKind.Restless)).toBe(false);
    expect(s.stats.riderRescues).toBe(1);
    mews.lit = false;
    updateCreatures(s);
    expect(s.agents.some((a) => a.species === 'rider')).toBe(false);
  });
});

describe('The airship', () => {
  it('leaves on day 3 with surplus goods, returns ten days later with crowns and maybe a tale', () => {
    const { s, f } = base();
    buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
    const dock = placeBuildingRaw(s, 'skydock', f.x, f.y + 4);
    dock.lit = true;
    for (let k = 0; k < 4; k++) { const c = placeBuildingRaw(s, 'craft', f.x - 8 + k * 2, f.y + 4, 3); c.stock = 60; }
    recomputeAll(s);
    dock.lit = true;
    s.day = 33;
    dailyAirship(s);
    expect(s.airship.status).toBe('away');
    expect(s.airship.goods).toBeGreaterThanOrEqual(150);
    expect(s.agents.some((a) => a.species === 'airship')).toBe(true);
    for (let k = 0; k < 4000 && s.agents.some((a) => a.species === 'airship' && a.timer >= 0); k++) tickCreatures(s);
    updateCreatures(s);
    expect(s.agents.some((a) => a.species === 'airship')).toBe(false);
    s.day = 43; // ten days there and back
    dailyAirship(s);
    expect(s.agents.some((a) => a.species === 'airship' && a.phase === 1)).toBe(true);
    const before = s.treasury;
    airshipArrives(s);
    expect(s.treasury).toBeGreaterThan(before);
    expect(s.airship.status).toBe('docked');
    expect(s.stats.airshipCrowns).toBeGreaterThan(0);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.airship.status).toBe('docked');
    run(b, 5);
  });
});
