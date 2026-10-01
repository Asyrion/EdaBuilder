import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { AgentKind, RoadType, TICKS_PER_DAY, Terrain, idx } from '../src/sim/types';
import { TERRAFORM, buildRoad, placeBuilding, roadPath, terraform } from '../src/sim/actions';
import { capacityOf, dailyBuildings } from '../src/sim/growth';
import { dailyAgents } from '../src/sim/agents';
import { EDICTS, edictOn, edictUpkeep, edictsFor } from '../src/sim/edicts';
import { GUILDS } from '../src/sim/guilds';
import { Bot } from '../src/sim/bot';
import { GRIMMEN_STONE, stoneQuarried } from '../src/data/factions';
import { flatten } from './helpers';

function town(faction: 'vellish' | 'grimmen' = 'grimmen', hills = true) {
  const s = createGame(41, 'Underhill', 'valley', faction);
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  if (hills) for (let dy = 4; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) s.terrain[idx(f.x + dx, f.y + dy)] = Terrain.Hills;
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  buildRoad(s, RoadType.Track, roadPath(f.x - 10, f.y + 3, f.x + 10, f.y + 3, false));
  s.treasury = 50000;
  return s;
}
const hearths = (s: ReturnType<typeof town>) => s.buildings.filter((b) => b && b.kind === 'hearth').length;

describe("The bot's bulldozer asks before it digs", () => {
  it('never clears homes for a seep that cannot stand there', () => {
    const s = town('grimmen', false); // no hills anywhere near: no seep can stand
    const f = s.founding;
    for (let dx = -8; dx <= 8; dx++) { const b = placeBuildingRaw(s, 'hearth', f.x + dx, f.y + 1); b.residents = 3; }
    recomputeAll(s);
    for (const b of s.buildings) if (b && b.kind === 'hearth') b.watered = false;
    const bot = new Bot(s);
    const n0 = hearths(s);
    expect(n0).toBe(17);
    (bot as any).keepWatered();
    expect(hearths(s)).toBe(n0);
    expect(s.buildings.some((b) => b && b.kind === 'seep')).toBe(false);
  });

  it('still clears a home when the seep can stand in its place', () => {
    const s = town();
    const f = s.founding;
    for (let dx = -10; dx <= 10; dx++) { const b = placeBuildingRaw(s, 'hearth', f.x + dx, f.y + 4); b.residents = 3; } // the whole hill row beside the street
    recomputeAll(s);
    for (const b of s.buildings) if (b && b.kind === 'hearth') b.watered = false;
    const bot = new Bot(s);
    const n0 = hearths(s);
    (bot as any).keepWatered();
    expect(s.buildings.some((b) => b && b.kind === 'seep')).toBe(true);
    expect(hearths(s)).toBeLessThan(n0);
  });
});

describe('The Delve', () => {
  it('turns grass into hill land for the Grimmen and counts a stone cut', () => {
    const s = town();
    const f = s.founding;
    s.milestone = 2;
    const x = f.x - 3, y = f.y - 4;
    expect(s.terrain[idx(x, y)]).toBe(Terrain.Grass);
    const t0 = s.treasury;
    const r = terraform(s, 'delve', x, y);
    expect(r.ok).toBe(true);
    expect(s.terrain[idx(x, y)]).toBe(Terrain.Hills);
    expect(s.stats.stoneCut).toBe(1);
    expect(s.stats.terraformed).toBe(1);
    expect(t0 - s.treasury).toBe(TERRAFORM.delve.cost);
    s.terrain[idx(x + 1, y)] = Terrain.Forest;
    expect(terraform(s, 'delve', x + 1, y)).toMatchObject({ ok: false, reason: 'Only grass or meadow can be delved' });
    expect(terraform(s, 'delve', x + 1, y + 1)).toMatchObject({ ok: true }); // meadow or grass beside it
  });

  it('is refused to the Vellish, and clearing or planting cuts no stone', () => {
    const v = town('vellish');
    const f = v.founding;
    v.milestone = 4;
    const r = terraform(v, 'delve', f.x - 3, f.y - 4);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Vellish do not delve/);
    expect(terraform(v, 'plant', f.x - 3, f.y - 4).ok).toBe(true);
    expect(terraform(v, 'clear', f.x - 3, f.y - 4).ok).toBe(true);
    expect(terraform(v, 'level', f.x, f.y + 4).ok).toBe(true);
    expect(v.stats.terraformed).toBe(3);
    expect(v.stats.stoneCut).toBe(1);
  });
});

describe('The Quarry', () => {
  it('is Grimmen-only, dug into hills, counts four stone and dresses stone for the carts', () => {
    const v = town('vellish');
    expect(placeBuilding(v, 'quarry', v.founding.x, v.founding.y + 4).ok).toBe(false);
    const s = town();
    const f = s.founding;
    s.milestone = 1;
    expect(placeBuilding(s, 'quarry', f.x, f.y + 1)).toMatchObject({ ok: false, reason: 'Must be dug into hills' });
    const stone0 = stoneQuarried(s);
    expect(placeBuilding(s, 'quarry', f.x, f.y + 4).ok).toBe(true);
    const q = s.buildings.find((b) => b && b.kind === 'quarry')!;
    expect(q.state).toBe('ok');
    expect(stoneQuarried(s) - stone0).toBe(4);
    placeBuildingRaw(s, 'market', f.x + 4, f.y + 1);
    for (let dx = -6; dx <= -2; dx++) { const b = placeBuildingRaw(s, 'hearth', f.x + dx, f.y + 1); b.residents = 4; }
    recomputeAll(s);
    run(s, TICKS_PER_DAY);
    expect(q.stock).toBeGreaterThan(0);
    expect(s.jobs).toBeGreaterThanOrEqual(8);
    q.stock = 20;
    dailyAgents(s);
    expect(s.agents.some((a) => a.kind === AgentKind.Cart && a.homeId === q.id)).toBe(true);
    run(s, TICKS_PER_DAY * 2);
    expect(s.stats.goodsDelivered).toBeGreaterThan(0);
    const m = s.buildings.find((b) => b && b.kind === 'market')!;
    expect(m.stock).toBeGreaterThan(0);
  });
});

describe('The Deep Cut', () => {
  it('lets a hill hearth dig its third level without schooling and hold two more', () => {
    const dig = (edict: boolean) => {
      const s = town();
      const f = s.founding;
      s.milestone = 3;
      const b = placeBuildingRaw(s, 'hearth', f.x - 2, f.y + 4);
      b.residents = 4;
      recomputeAll(s);
      const i = idx(b.x, b.y);
      s.educated = 0;
      s.coverage.school[i] = 0;
      if (edict) s.edicts.deepcut = true;
      for (let d = 0; d < 24; d++) {
        b.lit = true; b.watered = true; s.landValue[i] = 70;
        dailyBuildings(s);
        s.day++;
      }
      return { s, b };
    };
    const a = dig(false);
    expect(a.b.level).toBe(2);
    const g = dig(true);
    expect(g.b.level).toBe(3);
    expect(capacityOf(g.b, g.s)).toBe(16);
    expect(capacityOf(g.b)).toBe(14);
    expect(edictUpkeep(g.s)).toBe(2); // 1.5 a day per hill hearth, rounded
  });

  it('does not exist for the Vellish, and no guild petitions for it', () => {
    const v = town('vellish');
    v.edicts.deepcut = true;
    expect(edictOn(v, 'deepcut')).toBe(false);
    expect(edictUpkeep(v)).toBe(0);
    expect(edictsFor(v).length).toBe(EDICTS.length - 1);
    expect(edictsFor(town()).length).toBe(EDICTS.length);
    expect(Object.values(GUILDS).every((g) => g.edict !== 'deepcut')).toBe(true);
  });
});

describe('The bot plays the deep game', () => {
  it('delves beside its streets when stone is short and cuts a quarry when goods are', () => {
    const s = town();
    s.milestone = 2; // the Hold needs 12 stone; the town has none
    expect(stoneQuarried(s)).toBeLessThan(GRIMMEN_STONE[3]);
    const bot = new Bot(s);
    const hills0 = s.terrain.filter((t) => t === Terrain.Hills).length;
    bot.step();
    expect(s.stats.stoneCut).toBe(4);
    let delved = 0;
    for (let i = 0; i < s.terrain.length; i++) {
      if (s.terrain[i] !== Terrain.Hills) continue;
      const x = i % s.w, y = Math.floor(i / s.w);
      if (y >= s.founding.y + 4 && y <= s.founding.y + 10 && Math.abs(x - s.founding.x) <= 10) continue; // the fixture's band
      const adj = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)].some((j) => s.road[j]);
      if (adj) delved++;
    }
    expect(delved).toBeGreaterThanOrEqual(4);
    expect(s.terrain.filter((t) => t === Terrain.Hills).length).toBe(hills0 + 4);
    s.goodsShort = 1;
    bot.step();
    expect(s.buildings.filter((b) => b && b.kind === 'quarry').length).toBe(1);
  });

  it('a Vellish bot never delves', () => {
    const v = town('vellish');
    v.milestone = 4;
    const bot = new Bot(v);
    const hills0 = v.terrain.filter((t) => t === Terrain.Hills).length;
    for (let d = 0; d < 10; d++) bot.step();
    expect(v.stats.stoneCut).toBe(0);
    expect(v.terrain.filter((t) => t === Terrain.Hills).length).toBe(hills0);
  });
});
