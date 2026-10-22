/** Scope reset, phase 1c-2: a save or a replay that holds what was parked (the wild, the water's extras, the vehicles, the
 *  scenarios, the daughter charter, the daily challenge, terraforming, the relics, the marvels and their buildings) is
 *  refused with a reason; old creatures, barges and floating carts are dropped and the marsh turns to meadow on load
 *  (docs/PARKED.md). */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { SaveVersionError, deserialize, serialize } from '../src/sim/save';
import { CommandRunner, ReplayPlayer, stateFromHeader, type ReplayHeader } from '../src/sim/commands';
import { Terrain } from '../src/sim/types';

const load = (o: unknown) => () => deserialize(JSON.stringify(o), (seed) => createGame(seed));
const raw = () => JSON.parse(serialize(createGame(41, 'Parkwick')));
const agent = (id: number, kind: number, variant = 0) => ({ id, kind, x: 40.5, y: 40.5, path: [], pathIdx: 0, speed: 1, homeId: -1, targetId: -1, timer: 0, variant, dir: 0, load: 0 });

describe('A save holding parked things', () => {
  for (const kind of ['hunterslodge', 'fishershut', 'skydock', 'worldtree', 'portalarch', 'torrentmill', 'chartroom']) {
    it(`a ${kind} is refused and named`, () => {
      const o = raw();
      const b = o.buildings.find((x: unknown) => x);
      o.buildings.push({ ...b, id: 9999, kind });
      expect(load(o)).toThrow(SaveVersionError);
      expect(load(o)).toThrow(new RegExp(`parked.*the building "${kind}"`));
    });
  }

  it('a glowvine lane, another scenario, a daughter wardlight and a daily challenge are refused', () => {
    const glow = raw();
    const road = deserialize(JSON.stringify(raw()), (seed) => createGame(seed)).road;
    road[road.findIndex((r) => r > 0)] = 4;
    glow.road = JSON.parse(serialize({ ...createGame(41, 'Parkwick'), road })).road;
    expect(load(glow)).toThrow(/parked.*a glowvine lane/);
    expect(load({ ...raw(), scenario: 'atoll' })).toThrow(/parked.*the scenario "atoll"/);
    expect(load({ ...raw(), daughter: { node: 1, x: 10, y: 10, name: 'Newlight', day: 3, twin: -1 } })).toThrow(/parked.*a daughter wardlight/);
    expect(load({ ...raw(), challenge: '2026-10-01' })).toThrow(/parked.*a daily challenge/);
    expect(load({ ...raw(), scenario: 'valley' })).not.toThrow();
  });

  it('old creatures, barges and floating carts are dropped, and the marsh turns to meadow', () => {
    const o = raw();
    const n = o.agents.length;
    o.agents.push({ ...agent(99990, 3), species: 'deer', herdId: 1 }, agent(99991, 1, 3), agent(99992, 1, 4), agent(99993, 1, 1));
    const s0 = createGame(41, 'Parkwick');
    const t = s0.terrain.slice();
    const i = t.findIndex((v) => v === Terrain.Grass);
    t[i] = Terrain.Marsh;
    o.terrain = JSON.parse(serialize({ ...s0, terrain: t })).terrain;
    const s = load(o)();
    expect(s.agents.length).toBe(n + 1); // the goods cart (variant 1) stays
    expect(s.agents.some((a) => (a.kind as number) === 3)).toBe(false);
    expect(s.agents.some((a) => a.variant === 3 || a.variant === 4)).toBe(false);
    expect(s.terrain[i]).toBe(Terrain.Meadow);
    expect(s.terrain.includes(Terrain.Marsh)).toBe(false);
  });
});

describe('A replay of the parked', () => {
  const header: ReplayHeader = { seed: 67, name: 'Replaywick', scenario: 'valley', faction: 'vellish' };
  for (const op of ['terraform', 'daughter', 'quarry']) {
    it(`a replay using "${op}" is refused`, () => {
      const r = new CommandRunner(stateFromHeader(header), header);
      const file = JSON.parse(JSON.stringify(r.toFile('test')));
      file.commands.push({ t: 0, op, args: [0] });
      expect(() => new ReplayPlayer(file, stateFromHeader(header))).toThrow(new RegExp(`parked.*"${op}" command`));
    });
  }

  it('a replay of another scenario or of the daily challenge is refused', () => {
    expect(() => stateFromHeader({ ...header, scenario: 'atoll' })).toThrow(SaveVersionError);
    expect(() => stateFromHeader({ ...header, scenario: 'daily', challenge: '2026-10-01' })).toThrow(/parked.*a daily challenge/);
  });
});
