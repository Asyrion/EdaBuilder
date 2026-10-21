import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { run } from '../src/sim/sim';
import { AgentKind, Terrain, idx } from '../src/sim/types';
import { createScenario, SCENARIOS } from '../src/sim/scenario';
import { activeQuests } from '../src/sim/quests';
import { dailySurge } from '../src/sim/hazards';
import { updateMana } from '../src/sim/networks';
import { serialize, deserialize } from '../src/sim/save';

describe('Scenario charters', () => {
  it('the one-node valley has a single node with twice the flow', () => {
    const s = createScenario(5, 'One', 'onenode');
    expect(s.nodes.length).toBe(1);
    updateMana(s);
    expect(s.manaSupply).toBe(195); // 2x flow plus the Vein aspect
    expect(activeQuests(s)[0].id).toBe('z_onenode');
  });

  it('the island is ringed by Gloam within forty tiles of the founding node', () => {
    const s = createScenario(5, 'Isle', 'island');
    const f = s.founding;
    let farGreen = 0;
    let nearGrey = 0;
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const d = Math.hypot(x - f.x, y - f.y);
        const i = idx(x, y);
        if (d > 46 && !s.gloam[i] && s.terrain[i] !== Terrain.Water && s.terrain[i] !== Terrain.DeepWater) farGreen++;
        if (d < 26 && s.gloam[i]) nearGrey++;
      }
    expect(farGreen).toBe(0);
    expect(nearGrey).toBe(0);
    expect(activeQuests(s)[0].id).toBe('z_island');
  });

  it('the inherited collapse starts with debt, ruins, the dead walking and an overdraw', () => {
    const s = createScenario(5, 'Heir', 'inherited');
    expect(s.treasury).toBeLessThan(0);
    expect(s.buildings.filter((b) => b && b.state === 'ruin').length).toBeGreaterThan(0);
    expect(s.agents.filter((a) => a.kind === AgentKind.Restless).length).toBeGreaterThanOrEqual(6);
    expect(s.overdrawDays).toBe(3);
    expect(s.population).toBeGreaterThan(60);
    expect(activeQuests(s)[0].id).toBe('z_inherited');
    expect(s.cleanDays).toBe(0);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.scenario).toBe('inherited');
    run(b, 10);
  });

  it('every scenario has a goal and the open valley has no scenario quest', () => {
    expect(SCENARIOS.map((x) => x.id)).toEqual(['valley', 'onenode', 'island', 'atoll', 'inherited']);
    const s = createGame(3, 'V');
    expect(activeQuests(s).some((q) => q.id.startsWith('z_'))).toBe(false);
  });
});

describe('Quest counters', () => {
  it('a brownout that ends without a surge counts as survived', () => {
    const s = createGame(3, 'B');
    s.manaDemand = 500; s.manaSupply = 100;
    dailySurge(s);
    dailySurge(s);
    expect(s.overdrawDays).toBe(2);
    s.manaDemand = 50;
    dailySurge(s);
    expect(s.stats.brownoutsSurvived).toBe(1);
    dailySurge(s);
    expect(s.stats.brownoutsSurvived).toBe(1);
  });
});
