import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run, tick } from '../src/sim/sim';
import { AgentKind, Terrain, Zone, idx } from '../src/sim/types';
import { dailyStorms, dailyTigers, maybeSpawnTiger, startStorm, forestTiles, marketDistrict } from '../src/sim/lore';
import { tickCreatures } from '../src/sim/creatures';
import { paintDistrict } from '../src/sim/actions';
import { marketStockCap, setFenNex, dailyRestless, spawnRestless } from '../src/sim/agents';
import { computeLedger } from '../src/sim/economy';
import { updateCoverage } from '../src/sim/services';
import { resolveEvent, ALL_EVENTS } from '../src/sim/events';
import { addEgg, lineIndex } from '../src/sim/wyrmcraft';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town(seed = 19) {
  const s = createGame(seed, 'Fen');
  const f = s.founding;
  flatten(s, f.x - 20, f.y - 8, f.x + 20, f.y + 12);
  s.milestone = 7;
  s.treasury = 100000;
  return { s, f };
}

describe('Mana-storms', () => {
  it('drift, warp levels under them, and die under wards or after four days', () => {
    const { s, f } = town();
    const bs = [];
    for (let k = 0; k < 6; k++) { const b = placeBuildingRaw(s, 'hearth', f.x - 3 + k, f.y + 4, 2); b.residents = 2; bs.push(b); }
    recomputeAll(s);
    startStorm(s, f.x, f.y + 4);
    expect(s.storms.length).toBe(1);
    let warped = 0;
    for (let d = 0; d < 3; d++) { s.storms[0].x = f.x; s.storms[0].y = f.y + 4; dailyStorms(s); warped = s.stats.stormWarps; }
    expect(warped).toBeGreaterThan(0);
    expect(bs.some((b) => b.level !== 2)).toBe(true);
    s.day += 10;
    dailyStorms(s);
    expect(s.storms.length).toBe(0);
    startStorm(s, f.x, f.y + 4);
    const w = placeBuildingRaw(s, 'wardlantern', f.x, f.y + 6);
    w.lit = true;
    updateCoverage(s, 'ward');
    s.storms[0].vx = 0; s.storms[0].vy = 0;
    dailyStorms(s);
    expect(s.storms.length).toBe(0);
  });
});

describe('War-tigers', () => {
  it('come out of big forests at night, stalk hearths, and are killed by hunters', () => {
    const { s, f } = town();
    for (let y = 2; y < 40; y++) for (let x = 2; x < 20; x++) if (!(Math.abs(x - f.x) < 20 && Math.abs(y - f.y) < 8)) s.terrain[idx(x, y)] = Terrain.Forest;
    expect(forestTiles(s)).toBeGreaterThanOrEqual(220);
    s.day = 70; // Ember
    const h = placeBuildingRaw(s, 'hearth', f.x, f.y + 4); h.residents = 3;
    recomputeAll(s);
    for (let k = 0; k < 400 && s.stats.tigersTotal === 0; k++) maybeSpawnTiger(s, true);
    expect(s.stats.tigersTotal).toBe(1);
    const tg = s.agents.find((a) => a.kind === AgentKind.Creature && a.species === 'tiger')!;
    s.tick = 650; // night
    for (let k = 0; k < 200; k++) tickCreatures(s);
    expect(Math.hypot(tg.x - h.x, tg.y - h.y)).toBeLessThan(Math.hypot(tg.ax! - h.x, tg.ay! - h.y) + 1);
    const lodge = placeBuildingRaw(s, 'hunterslodge', Math.floor(tg.x) + 2, Math.floor(tg.y));
    let killed = 0;
    for (let d = 0; d < 60 && !killed; d++) killed = dailyTigers(s, new Set());
    expect(killed).toBe(1);
    expect(s.stats.tigersKilled).toBe(1);
    expect(lodge.kind).toBe('hunterslodge');
  });
});

describe('The Fen-Nex quarter', () => {
  it('makes the market district tithe-free with double shelves, and its gift can be a fen-drake', () => {
    const { s, f } = town();
    for (let k = 0; k < 3; k++) { const m = placeBuildingRaw(s, 'market', f.x + k, f.y + 4, 2); m.workers = 4; m.stock = 10; }
    paintDistrict(s, 2, f.x - 2, f.y + 2, f.x + 4, f.y + 6);
    recomputeAll(s);
    expect(marketDistrict(s)).toBe(2);
    const m = s.buildings.find((b) => b && b.kind === 'market')!;
    setFenNex(0, s.district);
    expect(marketStockCap(m)).toBe(40);
    const before = computeLedger(s).taxMarket;
    expect(before).toBeGreaterThan(0);
    const ev = ALL_EVENTS.find((e) => e.id === 'fennex')!;
    s.pendingEvent = { id: 'fennex', title: ev.title, text: ev.text, choices: [] };
    resolveEvent(s, 1);
    expect(s.fenNex).toBe(2);
    setFenNex(s.fenNex, s.district);
    expect(marketStockCap(m)).toBe(80);
    expect(computeLedger(s).taxMarket).toBe(0);
    placeBuildingRaw(s, 'cradle', f.x - 6, f.y + 4);
    const d = addEgg(s, 'fen')!;
    expect(d.line).toBe('fen');
    expect(lineIndex('fen')).toBe(8);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.fenNex).toBe(2);
    tick(b);
  });
});

describe('Font of Quieting', () => {
  it('lays the restless down more easily', () => {
    const { s, f } = town();
    recomputeAll(s);
    for (let k = 0; k < 20; k++) spawnRestless(s, f.x + (k % 5), f.y + 4 + Math.floor(k / 5));
    const n0 = s.agents.filter((a) => a.kind === AgentKind.Restless).length;
    dailyRestless(s);
    const without = n0 - s.agents.filter((a) => a.kind === AgentKind.Restless).length;
    const font = placeBuildingRaw(s, 'fontquieting', f.x - 8, f.y + 4);
    font.lit = true;
    let cleared = 0;
    for (let r = 0; r < 3; r++) { const n = s.agents.filter((a) => a.kind === AgentKind.Restless).length; cleared += dailyRestless(s); void n; }
    expect(cleared).toBeGreaterThan(without);
    run(s, 5);
  });
});
