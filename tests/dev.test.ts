import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { DEV_COMMANDS, DEV_GROUPS, devDefaultArg, runDev } from '../src/sim/dev';
import { idx } from '../src/sim/types';
import { construction } from '../src/sim/construction';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

describe('Dev tools', () => {
  it('every command runs on a fresh charter without throwing, and uses are counted and chronicled', () => {
    const s = createGame(41, 'Dev');
    const f = s.founding;
    flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
    placeBuildingRaw(s, 'guildhall', f.x - 5, f.y + 3);
    recomputeAll(s);
    expect(DEV_GROUPS.length).toBeGreaterThanOrEqual(5); // the Wyrms group is parked (reset 1b)
    const at = { x: f.x + 8, y: f.y + 8 };
    let n = 0;
    for (const c of DEV_COMMANDS) {
      if (c.id === 'day' || c.id === 'season') continue; // run separately below
      const arg = devDefaultArg(c, s); // a list's first option or a number's default (iteration 55)
      const out = runDev(s, c.id, arg, at);
      expect(typeof out).toBe('string');
      n++;
      s.pendingEvent = null; // events and petitions would pause the game
    }
    expect(s.stats.devUses).toBe(n);
    expect(s.chronicle.some((c) => c.text.includes('dev tools'))).toBe(true);
    expect(s.chronicle.filter((c) => c.text.includes('dev tools')).length).toBe(1);
    expect(runDev(s, 'nope', '', at)).toBe('Unknown command');
    construction.instant = true; // the toggle flipped it off
  });

  it('commands do what they say: crowns, gloam, relics, guilds, finish', () => {
    const s = createGame(41, 'Dev');
    const f = s.founding;
    flatten(s, f.x - 14, f.y - 10, f.x + 14, f.y + 14);
    recomputeAll(s);
    const at = { x: f.x + 8, y: f.y - 6 };
    const t0 = s.treasury;
    runDev(s, 'crowns', '', at);
    expect(s.treasury - t0).toBe(10000);
    runDev(s, 'gloam', '', at);
    expect(s.gloam[idx(at.x, at.y)]).toBe(1);
    runDev(s, 'cleargloam', '', at);
    expect(s.gloam[idx(at.x, at.y)]).toBe(0);
    runDev(s, 'relic', 'saltspoons', at);
    expect(s.relics.complete).toEqual(['saltspoons']);
    runDev(s, 'guildup', 'sextons', at);
    expect(s.guilds.standing.sextons).toBe(75);
    const m0 = s.milestone;
    runDev(s, 'milestone', '', at);
    expect(s.milestone).toBe(m0 + 1);
    runDev(s, 'event', 'thawday', at);
    expect(s.pendingEvent?.id).toBe('thawday');
    s.pendingEvent = null;
    construction.instant = false;
    placeBuildingRaw(s, 'well', f.x - 4, f.y + 3, 1, true);
    expect(s.buildings.some((b) => b && b.state === 'building')).toBe(true);
    runDev(s, 'finish', '', at);
    expect(s.buildings.some((b) => b && b.state === 'building')).toBe(false);
    construction.instant = true;
    const d0 = s.day;
    runDev(s, 'day', '', at);
    expect(s.day).toBe(d0 + 1);
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.stats.devUses).toBe(s.stats.devUses);
  });
});
