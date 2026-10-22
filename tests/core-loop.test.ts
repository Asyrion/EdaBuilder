/** The core loop's smoke tests (scope reset, phase 0, docs/RESET_PLAN.md): road, zones, mana, water, tax, demand,
 *  save/load and a bot corridor. Core APIs only, so the file outlives the reset's phase 1 unchanged. */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { buildRoad, paintZone, placeBuilding, roadPath } from '../src/sim/actions';
import { RoadType, TICKS_PER_DAY, Zone } from '../src/sim/types';
import { serialize, deserialize } from '../src/sim/save';
import { updateDemand } from '../src/sim/growth';
import { Bot } from '../src/sim/bot';
import { flatten } from './helpers';

/** A street grid by the founding stake: three roads across, three down, four zones, two wells, two spires. */
function town(seed = 42) {
  const s = createGame(seed, 'Core');
  const sx = s.founding.x + 2;
  const sy = s.founding.y + 1;
  flatten(s, sx - 12, sy - 2, sx + 12, sy + 12);
  for (let k = 0; k < 3; k++) buildRoad(s, RoadType.Track, roadPath(sx - 10, sy + k * 5, sx + 10, sy + k * 5, false));
  for (let k = 0; k < 3; k++) buildRoad(s, RoadType.Track, roadPath(sx - 10 + k * 10, sy, sx - 10 + k * 10, sy + 10, true));
  paintZone(s, Zone.Hearth, sx - 9, sy + 1, sx + 9, sy + 4);
  paintZone(s, Zone.Market, sx - 9, sy + 6, sx + 9, sy + 6);
  paintZone(s, Zone.Craft, sx - 9, sy + 7, sx + 9, sy + 9);
  placeBuilding(s, 'well', sx - 11, sy + 1);
  placeBuilding(s, 'well', sx + 11, sy + 6);
  placeBuilding(s, 'spire', sx - 4, sy + 1);
  placeBuilding(s, 'spire', sx + 4, sy + 6);
  return s;
}

// Seed 42's bot run on main at ac4e05f (docs/RESET_LOG.md, phase 0). The corridor is wide on purpose: the reset's
// phase 1 parks systems the bot plays, and one extra roll can move a seed a long way (HANDOFF, known issues).
const BOT_POP_100 = 1945;
const BOT_MILESTONE_100 = 6;

describe('core loop', () => {
  it('grows homes along a road, lit by spires and watered by wells, in 30 days', () => {
    const s = town();
    run(s, TICKS_PER_DAY * 30);
    const homes = s.buildings.filter((b) => b && b.kind === 'hearth');
    expect(s.population).toBeGreaterThan(0);
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.some((b) => b!.lit)).toBe(true);
    expect(homes.some((b) => b!.watered)).toBe(true);
    expect(Number.isFinite(s.treasury)).toBe(true);
  });

  it('a higher hearth tax lowers hearth demand', () => {
    const low = town(11);
    const high = town(11);
    run(low, TICKS_PER_DAY * 10);
    run(high, TICKS_PER_DAY * 10);
    low.taxRates.hearth = 10;
    high.taxRates.hearth = 20;
    for (let k = 0; k < 8; k++) { updateDemand(low); updateDemand(high); }
    expect(high.demand.hearth).toBeLessThan(low.demand.hearth);
  });

  // Found in phase 0, fixed in phase 1d (save version 8): the load recomputed the derived layers and blended the demand a step,
  // and the path cache outlived it. Now every layer is saved and nothing is recomputed, and the path cache is a pure memo
  // (emptied each day with the traffic), so a charter saved at any tick runs on exactly as it would have.
  it('a save in the middle of a run changes nothing', () => {
    for (const [seed, extra] of [[42, 0], [5, 437]]) {
      const a = town(seed);
      run(a, TICKS_PER_DAY * 20);
      const b0 = town(seed);
      run(b0, TICKS_PER_DAY * 10 + extra);
      const b = deserialize(serialize(b0), (s) => createGame(s));
      run(b, TICKS_PER_DAY * 10 - extra);
      expect(b.tick).toBe(a.tick);
      expect(b.population).toBe(a.population);
      expect(b.treasury).toBe(a.treasury);
      expect(serialize(b)).toBe(serialize(a));
    }
  });

  it('the bot grows seed 42 inside its corridor in 100 days', () => {
    const s = createGame(42, 'Botwick');
    const bot = new Bot(s);
    run(s, TICKS_PER_DAY * 100, { onDay: () => bot.step() });
    expect(s.population).toBeGreaterThanOrEqual(Math.floor(BOT_POP_100 * 0.5));
    expect(s.population).toBeLessThanOrEqual(Math.ceil(BOT_POP_100 * 1.5));
    expect(s.milestone).toBeGreaterThanOrEqual(BOT_MILESTONE_100 - 1);
  }, 300_000);
});
