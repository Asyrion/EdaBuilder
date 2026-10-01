import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { run, recomputeAll } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { addEgg, dailyDragons, freeCradle, setRole, setTraining, delverBonus, wardenDistricts, STAGE_DAYS } from '../src/sim/wyrmcraft';
import { ALL_EVENTS, resolveEvent } from '../src/sim/events';
import { updateCoverage } from '../src/sim/services';
import { updateCreatures } from '../src/sim/creatures';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function nest(seed = 91) {
  const s = createGame(seed, 'Nest');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 4, f.x + 16, f.y + 12);
  s.milestone = 4;
  s.treasury = 50000;
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 3, f.x + 14, f.y + 3, false));
  expect(placeBuilding(s, 'cradle', f.x + 12, f.y + 4).ok).toBe(false); // too far from ley
  expect(placeBuilding(s, 'cradle', f.x + 2, f.y + 4).ok).toBe(true);
  expect(placeBuilding(s, 'tamerslodge', f.x + 5, f.y + 4).ok).toBe(true);
  const markets = [];
  for (let x = f.x - 6; x <= f.x - 2; x++) { const m = placeBuildingRaw(s, 'market', x, f.y + 4, 2); m.workers = 6; m.stock = 40; markets.push(m); }
  recomputeAll(s);
  const cradle = s.buildings.find((b) => b && b.kind === 'cradle')!;
  cradle.lit = true;
  return { s, f, cradle, markets };
}

describe('Wyrmcraft', () => {
  it('cradles hold two eggs; an ember egg hatches, grows to a drake and sheds materials', () => {
    const { s, cradle, markets } = nest();
    expect(freeCradle(s)?.id).toBe(cradle.id);
    const d = addEgg(s, 'ember')!;
    expect(d).toBeTruthy();
    expect(addEgg(s, 'bone')).toBeTruthy();
    expect(addEgg(s, 'glim')).toBeNull(); // full
    for (let k = 0; k < STAGE_DAYS[0]; k++) { cradle.lit = true; dailyDragons(s); }
    expect(d.stage).toBe(1);
    expect(s.materials.eggshell).toBeGreaterThan(0);
    // fed and trained: reaches drake
    for (let k = 0; k < 60 && d.stage < 2; k++) { for (const m of markets) m.stock = 40; cradle.lit = true; dailyDragons(s); }
    expect(d.stage).toBe(2);
    expect(s.materials.scale).toBeGreaterThan(5);
    expect(d.mood).toBeGreaterThan(40);
  });
  it('cold cradles stall eggs and starved dragons leave', () => {
    const { s, cradle, markets } = nest(92);
    const d = addEgg(s, 'bone')!;
    cradle.lit = false;
    for (let k = 0; k < 10; k++) dailyDragons(s);
    expect(d.stage).toBe(0);
    expect(d.days).toBe(0);
    cradle.lit = true;
    for (let k = 0; k < 30; k++) dailyDragons(s);
    expect(d.stage).toBe(1);
    for (const m of markets) m.stock = 0;
    for (let k = 0; k < 12; k++) dailyDragons(s);
    expect(s.dragons.length).toBe(0);
  });
  it('training speeds growth; roles need a drake; wardens boost coverage and delvers mine', () => {
    const { s, f, cradle, markets } = nest(93);
    const d = addEgg(s, 'ember')!;
    setTraining(s, d.id, 'hard');
    for (let k = 0; k < 30; k++) dailyDragons(s);
    expect(setRole(s, d.id, 'warden', 1)).toMatch(/drake/);
    let days = 0;
    for (; days < 60 && d.stage < 2; days++) { for (const m of markets) m.stock = 40; cradle.lit = true; dailyDragons(s); }
    expect(days).toBeLessThan(STAGE_DAYS[1]); // hard training is faster than the nominal 20 days
    // warden of district 1
    for (let y = f.y; y <= f.y + 6; y++) for (let x = f.x - 8; x <= f.x + 8; x++) s.district[idx(x, y)] = 1;
    expect(setRole(s, d.id, 'warden', 1)).toBeNull();
    expect(wardenDistricts(s).has(1)).toBe(true);
    updateCoverage(s, 'watch');
    expect(s.coverage.watch[idx(f.x, f.y + 2)]).toBeGreaterThan(100);
    // delver
    for (let y = f.y + 7; y <= f.y + 8; y++) for (let x = f.x; x <= f.x + 1; x++) s.terrain[idx(x, y)] = Terrain.Hills;
    const mine = placeBuildingRaw(s, 'mine', f.x, f.y + 7);
    expect(setRole(s, d.id, 'delver', mine.id)).toBeNull();
    expect(delverBonus(s, mine)).toBe(6);
    // a drake agent appears near its cradle
    updateCreatures(s);
    expect(s.agents.some((a) => a.kind === AgentKind.Creature && a.species === 'drake' && a.dragonId === d.id)).toBe(true);
  });
  it('egg events keep, sell or give the egg, and poachers need a cradle', () => {
    const { s } = nest(94);
    const first = ALL_EVENTS.find((e) => e.id === 'egg_first')!;
    expect(first.when(s)).toBe(true);
    const seam = ALL_EVENTS.find((e) => e.id === 'egg_seam')!;
    const t0 = s.treasury;
    s.pendingEvent = { id: 'egg_seam', title: seam.title, text: seam.text, choices: seam.choices.map((c) => ({ label: c.label, desc: String(c.desc) })) };
    resolveEvent(s, 0);
    expect(s.dragons.length).toBe(1);
    expect(s.dragons[0].line).toBe('ember');
    s.pendingEvent = { id: 'egg_seam', title: seam.title, text: seam.text, choices: [] };
    resolveEvent(s, 1);
    expect(s.treasury).toBe(t0 + 1500);
    const poach = ALL_EVENTS.find((e) => e.id === 'egg_poachers')!;
    expect(poach.when(s)).toBe(true);
    s.buildings = s.buildings.map((b) => (b && b.kind === 'cradle' ? null : b));
    expect(poach.when(s)).toBe(false);
  });
  it('dragons and materials round-trip through save/load and survive a long run', () => {
    const { s, markets } = nest(95);
    addEgg(s, 'glim');
    run(s, TICKS_PER_DAY * 5, { onDay: () => { for (const m of markets) m.stock = 40; } });
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.dragons.length).toBe(1);
    expect(b.dragons[0].name).toBe(s.dragons[0].name);
    expect(b.materials.scale).toBe(s.materials.scale);
    run(b, TICKS_PER_DAY * 2);
  });
});
