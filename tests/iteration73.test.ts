/** Iteration 73 (DESIGN 4.104, the loose ends): the airship sails from a lit Sky-Dock. The eggs, the wyvern, the riders and
 *  the duel were parked in the scope reset (phase 1b); the sextons' brawl and the Wandering Merchant in phase 1c. */
import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { buildRoad, roadPath } from '../src/sim/actions';
import { RoadType, type GameState } from '../src/sim/types';
import { dailyAirship } from '../src/sim/vehicles';
import { flatten } from './helpers';

const ok = (b: { state: string; work: number }) => { b.state = 'ok'; b.work = 0; };

/** A flat town with a road south of the stake. */
function town(seed = 73): { s: GameState; f: { x: number; y: number } } {
  const s = createGame(seed, 'Looseend');
  const f = s.founding;
  flatten(s, f.x - 40, f.y - 20, f.x + 40, f.y + 20);
  s.milestone = 8;
  s.treasury = 60000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 20, f.y + 5, f.x + 20, f.y + 5, false));
  recomputeAll(s);
  return { s, f };
}

describe('The Sky-Dock', () => {
  it('sends the airship only while the Dock is lit', () => {
    const { s, f } = town(74);
    const dock = placeBuildingRaw(s, 'skydock', f.x + 6, f.y + 2); ok(dock); dock.lit = false;
    for (let k = 0; k < 3; k++) { const w = placeBuildingRaw(s, 'craft', f.x - 10 + k, f.y + 4, 1); ok(w); w.stock = 60; }
    recomputeAll(s);
    dock.lit = false;
    s.day = 63;
    dailyAirship(s);
    expect(s.airship.status).toBe('docked'); // the Dock is unlit
    dock.lit = true;
    dailyAirship(s);
    expect(s.airship.status).toBe('away');
    expect(s.stats.airshipVoyages).toBe(1);
  });
});
