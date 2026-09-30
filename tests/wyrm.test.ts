import { describe, expect, it } from 'vitest';
import { createGame, deepenNode, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run, tick } from '../src/sim/sim';
import { AgentKind, TICKS_PER_DAY } from '../src/sim/types';
import { WYRM_DIES_AFTER, WYRM_EATS, WYRM_MIN_DIST, WYRM_SULK_AFTER, bind, chooseWyrmNode, dailyWyrm, lairWard, marketGoods, payTribute, refuse, spiresAtWyrm, startFlyover, wyrmGuards, wyrmNode, wyrmTribute } from '../src/sim/wyrm';
import { maybeFireWyrm, resolveEvent } from '../src/sim/events';
import { updateCoverage } from '../src/sim/services';
import { computeBuildingHappiness } from '../src/sim/growth';
import { tickCreatures } from '../src/sim/creatures';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function withWyrm(seed = 21) {
  const s = createGame(seed, 'Scale');
  expect(s.wyrm.node).toBeGreaterThanOrEqual(0);
  const n = wyrmNode(s)!;
  flatten(s, n.x - 8, n.y - 8, n.x + 8, n.y + 8);
  s.treasury = 200000;
  s.milestone = 7;
  return { s, n };
}

function markets(s: ReturnType<typeof createGame>, n: number, stock = 60) {
  const f = s.founding;
  flatten(s, f.x - 10, f.y + 2, f.x + 10, f.y + 6);
  const out = [];
  for (let k = 0; k < n; k++) { const m = placeBuildingRaw(s, 'market', f.x - 8 + k * 2, f.y + 4, 2); m.stock = stock; out.push(m); }
  return out;
}

describe('The Sleeping Wyrm', () => {
  it('sleeps on the node farthest from the founding node, at least 40 tiles away', () => {
    for (const seed of [1, 21, 42, 77]) {
      const s = createGame(seed, 'S');
      const n = wyrmNode(s);
      if (!n) { expect(chooseWyrmNode(s.nodes, s.founding)).toBe(-1); continue; }
      const d = Math.hypot(n.x - s.founding.x, n.y - s.founding.y);
      expect(d).toBeGreaterThanOrEqual(WYRM_MIN_DIST);
      for (const o of s.nodes) expect(Math.hypot(o.x - s.founding.x, o.y - s.founding.y)).toBeLessThanOrEqual(d);
      expect(s.wyrm.state).toBe('sleeping');
    }
  });

  it('spires at its node wake it over days; deepening wakes it at once', () => {
    const { s, n } = withWyrm();
    const sp = placeBuildingRaw(s, 'spire', n.x + 2, n.y + 1);
    sp.lit = true;
    expect(spiresAtWyrm(s)).toBe(1);
    for (let d = 0; d < 20; d++) dailyWyrm(s);
    expect(s.wyrm.state).toBe('sleeping');
    expect(s.wyrm.waking).toBeGreaterThan(50);
    for (let d = 0; d < 20; d++) dailyWyrm(s);
    expect(s.wyrm.state).toBe('awake');
    expect(s.chronicle.some((e) => /uncoils/.test(e.text))).toBe(true);
    // deepening
    const t = withWyrm(42);
    t.s.milestone = 6;
    expect(deepenNode(t.s, t.s.wyrm.node)).toBeNull();
    expect(t.s.wyrm.state).toBe('awake');
  });

  it('asks tribute through the event system; paying raises the price, refusing sends it flying and burning', () => {
    const { s } = withWyrm();
    s.wyrm.state = 'awake';
    s.wyrm.tributeDay = s.day;
    maybeFireWyrm(s);
    expect(s.pendingEvent?.id).toBe('wyrm_tribute');
    const price = wyrmTribute(s);
    const before = s.treasury;
    resolveEvent(s, 0);
    expect(s.treasury).toBe(before - price);
    expect(s.wyrm.tributeDay).toBeGreaterThan(s.day);
    expect(wyrmTribute(s)).toBeGreaterThan(price);
    expect(s.stats.wyrmTributes).toBe(1);
    // refusal
    markets(s, 3);
    recomputeAll(s);
    refuse(s);
    const w = s.agents.find((a) => a.kind === AgentKind.Creature && a.species === 'wyrm');
    expect(w).toBeTruthy();
    expect(w!.load).toBe(1);
    expect(s.wyrm.flyover).toBeGreaterThan(0);
    let fires = 0;
    for (let k = 0; k < 4000 && s.wyrm.flyover > 0; k++) { tickCreatures(s); s.tick++; }
    expect(s.wyrm.flyover).toBe(0);
    expect(s.agents.some((a) => a.species === 'wyrm')).toBe(false);
    expect(s.wyrm.state).toBe('sleeping');
    expect(s.wyrm.waking).toBe(50);
    for (const b of s.buildings) if (b && b.state === 'burning') fires++;
    expect(fires).toBeLessThanOrEqual(4);
    expect(s.stats.wyrmFlyovers).toBe(1);
  });

  it('goods tribute takes from the shelves, and too few goods counts as a refusal', () => {
    const { s } = withWyrm();
    s.wyrm.state = 'awake';
    markets(s, 5, 60);
    const before = marketGoods(s);
    expect(payTribute(s, 'goods')).toMatch(/goods laid/);
    expect(marketGoods(s)).toBeLessThan(before - 100);
    const t = withWyrm(42);
    t.s.wyrm.state = 'awake';
    markets(t.s, 1, 20);
    payTribute(t.s, 'goods');
    expect(t.s.wyrm.refused).toBe(1);
  });

  it('binding needs a lit Wyrm-Court and schooling; bound it wards its lair, keeps happiness up and eats', () => {
    const { s, n } = withWyrm();
    s.wyrm.state = 'awake';
    const f = s.founding;
    flatten(s, f.x - 6, f.y - 8, f.x + 6, f.y - 2);
    const court = placeBuildingRaw(s, 'wyrmcourt', f.x - 2, f.y - 6);
    court.lit = true;
    s.educated = 0.1;
    maybeFireWyrm(s);
    expect(s.pendingEvent?.id).toBe('wyrm_binding');
    resolveEvent(s, 0); // fails: not educated
    expect(s.wyrm.state).toBe('awake');
    expect(s.wyrm.tributeDay).toBe(s.day);
    s.wyrm.tributeDay = -1;
    s.wyrm.askedBind = -100;
    s.educated = 0.5;
    maybeFireWyrm(s);
    resolveEvent(s, 0);
    expect(s.wyrm.state).toBe('bound');
    expect(wyrmGuards(s)).toBe(true);
    expect(lairWard(s, n.x + 10, n.y)).toBeGreaterThan(0.5);
    updateCoverage(s, 'ward');
    expect(s.coverage.ward[n.y * s.w + n.x + 12]).toBeGreaterThan(100);
    // happiness bonus
    const ms = markets(s, 4, 80);
    recomputeAll(s);
    const h1 = computeBuildingHappiness(s, ms[0]);
    s.wyrm.sulking = 5;
    const h2 = computeBuildingHappiness(s, ms[0]);
    expect(h1 - h2).toBeCloseTo(10, 5);
    s.wyrm.sulking = 0;
    // eats
    const g0 = marketGoods(s);
    dailyWyrm(s);
    expect(g0 - marketGoods(s)).toBeCloseTo(WYRM_EATS, 5);
    expect(s.wyrm.fedDays).toBe(1);
  });

  it('starved it sulks, then dies; its bones quiet the dead', () => {
    const { s } = withWyrm();
    bind(s);
    for (let d = 0; d < WYRM_SULK_AFTER; d++) dailyWyrm(s);
    expect(s.wyrm.sulking).toBe(1);
    expect(wyrmGuards(s)).toBe(false);
    s.day = 100;
    s.wyrm.sulking = 2;
    maybeFireWyrm(s);
    expect(s.pendingEvent?.id).toBe('wyrm_sulks');
    resolveEvent(s, 2); // let it sulk
    for (let d = 0; d < WYRM_DIES_AFTER; d++) dailyWyrm(s);
    expect(s.wyrm.state).toBe('dead');
    expect(s.chronicle.some((e) => /bones/.test(e.text))).toBe(true);
  });

  it('a fed guardian flies over each season without burning and lays a vein egg after a season', () => {
    const { s } = withWyrm();
    markets(s, 8, 200);
    s.day = 0;
    bind(s);
    s.wyrm.bound = -10;
    for (let d = 0; d < 31; d++) { s.day++; for (const b of s.buildings) if (b && b.kind === 'market') b.stock = 200; dailyWyrm(s); }
    expect(s.stats.wyrmFlyovers).toBeGreaterThanOrEqual(1);
    expect(s.wyrm.fedDays).toBeGreaterThanOrEqual(30);
    maybeFireWyrm(s);
    expect(s.pendingEvent?.id).toBe('egg_vein');
    resolveEvent(s, 1);
    expect(s.wyrm.fedDays).toBe(0);
    // benign flyover burns nothing
    const before = s.stats.firesTotal;
    startFlyover(s, false);
    for (let k = 0; k < 4000 && s.wyrm.flyover > 0; k++) { tickCreatures(s); s.tick++; }
    expect(s.stats.firesTotal).toBe(before);
  });

  it('survives the sim loop and save/load', () => {
    const { s } = withWyrm();
    s.wyrm.waking = 33;
    run(s, TICKS_PER_DAY * 3);
    const b = deserialize(serialize(s), (seed) => createGame(seed));
    expect(b.wyrm).toEqual(s.wyrm);
    expect(b.stats.wyrmTributes).toBe(0);
    tick(b);
  });
});
