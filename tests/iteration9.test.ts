import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, callRain, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { updateMiasma } from '../src/sim/services';
import { ALL_EVENTS } from '../src/sim/events';
import { flatten } from './helpers';

function town(seed = 101) {
  const s = createGame(seed, 'Nine');
  const f = s.founding;
  flatten(s, f.x - 18, f.y - 4, f.x + 18, f.y + 14);
  s.milestone = 5;
  s.treasury = 80000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 16, f.y + 3, f.x + 16, f.y + 3, false));
  const markets = [];
  for (let x = f.x - 6; x <= f.x - 2; x++) { const m = placeBuildingRaw(s, 'market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  const crafts = [];
  for (let x = f.x + 9; x <= f.x + 12; x++) { const c = placeBuildingRaw(s, 'craft', x, f.y + 4, 2); c.workers = 8; c.stock = 50; crafts.push(c); }
  recomputeAll(s);
  return { s, f, markets, crafts };
}

describe("Storm-Caller's Peak and visitors", () => {
  it('calls rain: fires out, miasma washed, cooldown', () => {
    const t = town(105);
    const { s, f } = t;
    for (let yy = f.y + 6; yy <= f.y + 6; yy++) s.terrain[idx(f.x, yy)] = Terrain.Hills;
    buildRoad(s, RoadType.Track, roadPath(f.x, f.y + 4, f.x, f.y + 5, true));
    s.milestone = 5;
    expect(placeBuilding(s, 'stormpeak', f.x, f.y + 6).ok).toBe(false); // no caller yet
    s.firedEvents.push('stormcaller:0'); // the storm caller was given the hills
    const r = placeBuilding(s, 'stormpeak', f.x, f.y + 6);
    expect(r.ok).toBe(true);
    const peak = s.buildings.find((b) => b && b.kind === 'stormpeak')!;
    peak.lit = true;
    t.crafts[0].state = 'burning';
    updateMiasma(s);
    const before = s.miasma[idx(t.crafts[0].x, t.crafts[0].y)];
    expect(callRain(s, peak.id).ok).toBe(true);
    expect(t.crafts[0].state).toBe('ok');
    updateMiasma(s);
    expect(s.miasma[idx(t.crafts[0].x, t.crafts[0].y)]).toBeLessThan(before);
    expect(callRain(s, peak.id).ok).toBe(false);
    expect(peak.cooldown).toBe(3);
  });
  it('caravan trade sells surplus', () => {
    const t = town(106);
    const { s, f } = t;
    placeBuilding(s, 'depot', f.x - 12, f.y + 4);
    const caravan = ALL_EVENTS.find((e) => e.id === 'caravan')!;
    expect(caravan.when(s)).toBe(true);
    const t0 = s.treasury;
    caravan.choices[0].apply(s);
    expect(s.treasury).toBeGreaterThan(t0);
    expect(t.crafts.every((c) => c.stock <= 10)).toBe(true);
    const storm = ALL_EVENTS.find((e) => e.id === 'stormcaller')!;
    storm.choices[0].apply(s);
    expect(s.modifiers.some((m) => m.kind === 'rain')).toBe(true);
  });
  it('a long run with all of it stays finite', () => {
    const t = town(107);
    run(t.s, TICKS_PER_DAY * 4, { onDay: () => { for (const m of t.markets) m.stock = 20; } });
    for (const a of t.s.agents) { expect(Number.isFinite(a.x)).toBe(true); expect(Number.isFinite(a.y)).toBe(true); }
    expect(t.s.gameOver).toBeNull();
  });
});
