import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx, isWater } from '../src/sim/types';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { updateMana } from '../src/sim/networks';
import { riverFrozen } from '../src/sim/weave';
import { BARGE_VARIANT, dailyBarges } from '../src/sim/vehicles';
import { tickAgents } from '../src/sim/agents';
import { addEgg } from '../src/sim/wyrmcraft';
import { checkMilestones } from '../src/sim/economy';
import { distanceMap } from '../src/sim/terrain';
import { serialize, deserialize } from '../src/sim/save';
import { Bot } from '../src/sim/bot';
import { FACTIONS, VESHARI_MOORINGS, milestonesOf, moorings, type FactionId } from '../src/data/factions';
import { flatten } from './helpers';

/** A town on a two-wide water strip south of the founding: roads at dy 2, 3 and 9, shore at dy 4 and 7, water at dy 5 and 6. */
function town(faction: FactionId = 'veshari') {
  const s = createGame(41, 'Sablemouth', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  for (let dx = -12; dx <= 12; dx++) for (let dy = 5; dy <= 6; dy++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Water;
  for (let dx = -13; dx <= 13; dx++) for (const dy of [4, 7]) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Shore;
  for (const dy of [5, 6]) { s.terrain[idx(f.x - 13, f.y + dy)] = Terrain.Shore; s.terrain[idx(f.x + 13, f.y + dy)] = Terrain.Shore; }
  s.waterDist = distanceMap((i) => isWater(s.terrain[i]), 15);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 9, f.x + 14, f.y + 9, false));
  s.treasury = 50000;
  recomputeAll(s);
  return s;
}
const count = (s: ReturnType<typeof town>, kind: string) => s.buildings.filter((b) => b && b.kind === kind).length;

describe('The Veshari of the Sable: rules', () => {
  it('value the bank twice over and dry ground less; the river never freezes for them', () => {
    const v = town('vellish');
    const g = town('veshari');
    const f = g.founding;
    const bank = idx(f.x, f.y + 4);
    expect(g.waterDist[bank]).toBe(1);
    expect(g.landValue[bank] - v.landValue[bank]).toBe(10); // (5 - 1) × 2.5 again
    // the first tile up the founding's column that is more than 8 from any water on both maps
    let dry = -1;
    for (let dy = -1; dy >= -11 && dry < 0; dy--) { const i = idx(f.x, f.y + dy); if (g.waterDist[i] > 8 && v.waterDist[i] > 8) dry = i; }
    expect(dry).toBeGreaterThan(0);
    expect(v.landValue[dry] - g.landValue[dry]).toBe(6);
    v.day = 96; g.day = 96; // Hush, day 6
    expect(riverFrozen(v)).toBe(true);
    expect(riverFrozen(g)).toBe(false);
  });

  it('draw a third more from Torrent Mills and a fifth less from the Veins', () => {
    const v = town('vellish');
    const g = town('veshari');
    expect(g.manaSupply / v.manaSupply).toBeCloseTo(0.8, 5);
    const delta = (s: ReturnType<typeof town>) => { const before = s.manaSupply; placeBuildingRaw(s, 'torrentmill', s.founding.x + 4, s.founding.y + 4); updateMana(s); return s.manaSupply - before; };
    const dv = delta(v);
    const dg = delta(g);
    expect(dv).toBeGreaterThan(0);
    expect(dg / dv).toBeCloseTo(1.33, 5);
  });
});

describe('The Veshari of the Sable: buildings', () => {
  it('the Vellish build none of them; a tide-well must touch water and waters a home nine tiles away', () => {
    const v = town('vellish');
    for (const k of ['tidewell', 'landing', 'tidepool']) expect(placeBuilding(v, k, v.founding.x, v.founding.y + 4).ok).toBe(false);
    const s = town();
    const f = s.founding;
    expect(placeBuilding(s, 'tidewell', f.x - 2, f.y + 1)).toMatchObject({ ok: false, reason: 'Must touch river or lake water' });
    expect(placeBuilding(s, 'tidewell', f.x - 2, f.y + 4).ok).toBe(true);
    const home = placeBuildingRaw(s, 'hearth', f.x - 2, f.y - 5);
    recomputeAll(s);
    expect(home.watered).toBe(true);
    expect(placeBuilding(s, 'landing', f.x + 2, f.y + 1).ok).toBe(false);
    expect(placeBuilding(s, 'landing', f.x + 2, f.y + 4).ok).toBe(true);
  });

  it('a barge sails from a landing to a landing', () => {
    const s = town();
    const f = s.founding;
    const la = placeBuildingRaw(s, 'landing', f.x - 11, f.y + 4);
    const lb = placeBuildingRaw(s, 'landing', f.x + 11, f.y + 4);
    const c = placeBuildingRaw(s, 'craft', f.x - 10, f.y + 1, 2); c.stock = 60;
    const m = placeBuildingRaw(s, 'market', f.x + 10, f.y + 1, 2); m.stock = 0;
    recomputeAll(s);
    expect(moorings(s)).toBe(2);
    dailyBarges(s);
    const barge = s.agents.find((a) => a.kind === AgentKind.Cart && a.variant === BARGE_VARIANT)!;
    expect(barge).toBeTruthy();
    expect(barge.homeId).toBe(la.id);
    expect(barge.targetId).toBe(lb.id);
    for (let k = 0; k < 3000 && s.agents.includes(barge); k++) { tickAgents(s); s.tick++; }
    expect(s.agents.includes(barge)).toBe(false);
    expect(m.stock).toBeGreaterThan(0);
    expect(s.stats.bargeTrips).toBe(1);
  });

  it('a Tide Pool takes the water lines and no other; a hatchery still refuses them', () => {
    const s = town();
    const f = s.founding;
    s.milestone = 4;
    const pool = placeBuildingRaw(s, 'tidepool', f.x + 10, f.y + 7);
    pool.lit = true;
    recomputeAll(s);
    pool.lit = true;
    expect(addEgg(s, 'ember')).toBeNull();
    expect(addEgg(s, 'tide')).toBeTruthy();
    expect(addEgg(s, 'storm')).toBeTruthy();
    expect(addEgg(s, 'glim')).toBeNull(); // a pool holds two
    s.dragons.pop();
    expect(addEgg(s, 'glim')).toBeTruthy();
    const g = createGame(41, 'Underhill', 'valley', 'grimmen');
    flatten(g, g.founding.x - 10, g.founding.y - 10, g.founding.x + 10, g.founding.y + 10);
    g.milestone = 4;
    const h = placeBuildingRaw(g, 'hatchery', g.founding.x + 2, g.founding.y + 2);
    h.lit = true;
    expect(addEgg(g, 'tide')).toBeNull();
    expect(addEgg(g, 'bone')).toBeTruthy();
  });
});

describe('The Veshari of the Sable: reach', () => {
  it('milestones are named by reach and gated on moorings', () => {
    const s = town();
    const f = s.founding;
    expect(milestonesOf(s).map((m) => m.name)).toEqual(['The Bank', 'Jetty', 'Quayside', 'Harbour', 'Haven', 'River-Market', 'Weirhold', "Vesh's Court", 'Sable Crown']);
    expect(VESHARI_MOORINGS.length).toBe(9);
    s.population = 100; // Quayside needs 100 folk and 2 moorings
    checkMilestones(s);
    expect(s.milestone).toBe(0);
    placeBuildingRaw(s, 'landing', f.x - 4, f.y + 4);
    checkMilestones(s);
    expect(s.milestone).toBe(1);
    placeBuildingRaw(s, 'landing', f.x + 4, f.y + 4);
    checkMilestones(s);
    expect(s.milestone).toBe(2);
  });

  it('a Veshari game begins within six tiles of water; the Vellish map differs only by water and shore', () => {
    for (const seed of [41, 42, 43, 44]) {
      const g = createGame(seed, 'S', 'valley', 'veshari');
      const v = createGame(seed, 'S', 'valley', 'vellish');
      const f = g.founding;
      expect(f).toEqual(v.founding);
      let near = false;
      for (let dy = -6; dy <= 6 && !near; dy++) for (let dx = -6; dx <= 6; dx++) if (g.terrain[idx(f.x + dx, f.y + dy)] === Terrain.Water) { near = true; break; }
      expect(near).toBe(true);
      for (let i = 0; i < g.terrain.length; i++) {
        if (g.terrain[i] === v.terrain[i]) continue;
        expect([Terrain.Water, Terrain.Shore]).toContain(g.terrain[i]);
        expect(v.terrain[i]).not.toBe(Terrain.LeyNode);
      }
      expect(g.nodes).toEqual(v.nodes);
    }
  });

  it('a loaded game reads its water map from the saved terrain', () => {
    // a seed whose Veshari start had to cut a channel (the Vellish map of that seed has other water distances)
    let seed = 41;
    let s = createGame(seed, 'S', 'valley', 'veshari');
    const sameAsVellish = (g: ReturnType<typeof createGame>) => { const w = createGame(seed, 'S', 'valley', 'vellish').waterDist; return g.waterDist.every((d, i) => d === w[i]); };
    while (seed < 80 && sameAsVellish(s)) s = createGame(++seed, 'S', 'valley', 'veshari');
    expect(seed).toBeLessThan(80);
    const t = deserialize(serialize(s), (sd) => createGame(sd));
    const fresh = distanceMap((i) => isWater(t.terrain[i]), 15);
    expect(Array.from(t.waterDist)).toEqual(Array.from(fresh));
    const v = createGame(seed, 'S', 'valley', 'vellish');
    expect(Array.from(v.waterDist)).not.toEqual(Array.from(fresh)); // before the fix a load took the Vellish map's distances
  });
});

describe('The bot plays the Veshari', () => {
  it('sinks tide-wells, lays landings and reaches the Jetty within twenty days', () => {
    const s = town();
    const bot = new Bot(s);
    const hills0 = s.terrain.filter((t) => t === Terrain.Hills).length;
    run(s, TICKS_PER_DAY * 20, { onDay: () => bot.step() });
    expect(count(s, 'tidewell')).toBeGreaterThan(0);
    expect(count(s, 'well')).toBe(0);
    expect(count(s, 'landing')).toBeGreaterThanOrEqual(1);
    expect(s.milestone).toBeGreaterThanOrEqual(1);
    expect(s.terrain.filter((t) => t === Terrain.Hills).length).toBe(hills0); // nothing levelled, nothing delved
  });

  it('a Vellish bot lays no landing', () => {
    const v = town('vellish');
    const bot = new Bot(v);
    for (let d = 0; d < 10; d++) bot.step();
    expect(count(v, 'landing')).toBe(0);
    expect(FACTIONS.veshari.playable).toBe(true);
  });
});
