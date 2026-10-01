import { describe, expect, it } from 'vitest';
import { createGame, placeBuildingRaw } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { RoadType, TICKS_PER_DAY, Zone } from '../src/sim/types';
import { buildRoad, roadPath } from '../src/sim/actions';
import { BUILDING_BY_KEY } from '../src/sim/catalog';
import { CARAVAN_EVERY, caravanDue, caravanSurplus, maybeFireCaravan, maybeFireEvent, resolveEvent } from '../src/sim/events';
import { QUESTS } from '../src/data/quests';
import { serialize, deserialize } from '../src/sim/save';
import { flatten } from './helpers';

function town() {
  const s = createGame(41, 'Caravans', 'valley');
  const f = s.founding;
  flatten(s, f.x - 16, f.y - 12, f.x + 16, f.y + 16);
  buildRoad(s, RoadType.Track, roadPath(f.x - 14, f.y + 2, f.x + 14, f.y + 2, false));
  s.milestone = 3;
  for (let k = 0; k < 4; k++) { const c = placeBuildingRaw(s, 'craft', f.x - 10 + k * 2, f.y + 1); c.state = 'ok'; c.work = 0; c.level = 2; c.stock = 40; }
  recomputeAll(s);
  return s;
}

describe('The Belerial caravan', () => {
  it('keeps its own rhythm at a standing depot: the first halts six days after the depot, then every twelve; none without one', () => {
    const s = town();
    expect(caravanDue(s)).toBeNull();
    for (let d = 0; d < 20; d++) { s.day++; maybeFireCaravan(s); }
    expect(s.pendingEvent).toBeNull();
    const depot = placeBuildingRaw(s, 'depot', s.founding.x + 4, s.founding.y - 2); depot.state = 'ok'; depot.work = 0;
    const d0 = s.day;
    maybeFireCaravan(s); // the day hook of the day the depot stands anchors the rhythm
    expect(s.pendingEvent).toBeNull();
    expect(caravanDue(s)).toBe(CARAVAN_EVERY / 2);
    let first = -1;
    for (let d = 0; d < 40 && first < 0; d++) { s.day++; maybeFireCaravan(s); if (s.pendingEvent) first = s.day; }
    expect(first).toBe(d0 + CARAVAN_EVERY / 2);
    expect(s.pendingEvent!.id).toBe('caravan');
    expect(caravanDue(s)).toBe(0);
    resolveEvent(s, 4); // send them on
    expect(caravanDue(s)).toBe(CARAVAN_EVERY);
    let second = -1;
    for (let d = 0; d < 40 && second < 0; d++) { s.day++; maybeFireCaravan(s); if (s.pendingEvent) second = s.day; }
    expect(second).toBe(first + CARAVAN_EVERY);
  });

  it('Trade sells every works\' surplus above ten at 1.5x the price, counts it, and the Ledger quest completes', () => {
    const s = town();
    const depot = placeBuildingRaw(s, 'depot', s.founding.x + 4, s.founding.y - 2); depot.state = 'ok'; depot.work = 0;
    s.day = 40;
    s.stats.lastCaravanDay = s.day - CARAVAN_EVERY;
    maybeFireCaravan(s);
    expect(s.pendingEvent?.id).toBe('caravan');
    expect(s.pendingEvent!.choices[0].desc).toMatch(/120 goods/);
    expect(caravanSurplus(s)).toBe(120);
    const t0 = s.treasury;
    resolveEvent(s, 0);
    expect(s.stats.caravanGoods).toBe(120);
    expect(s.treasury - t0).toBe(Math.round(120 * s.trade.priceGoods * 1.5));
    for (const b of s.buildings) if (b && BUILDING_BY_KEY[b.kind].zone === Zone.Craft) expect(b.stock).toBe(10);
    const q = QUESTS.find((x) => x.id === 'o_caravan')!;
    expect(q.done(s)).toBe(false);
    s.stats.caravanGoods = 200;
    expect(q.done(s)).toBe(true);
    // the rhythm survives a save, and an old save starts the count afresh
    const r = deserialize(serialize(s), (seed) => createGame(seed));
    expect(r.stats.lastCaravanDay).toBe(s.day);
    const o = JSON.parse(serialize(s)); delete o.stats.lastCaravanDay;
    expect(deserialize(JSON.stringify(o), (seed) => createGame(seed)).stats.lastCaravanDay).toBe(-1);
  });

  it('the storyteller never draws the caravan as a random tale, and a running game sees it on schedule', () => {
    const s = town();
    const depot = placeBuildingRaw(s, 'depot', s.founding.x + 4, s.founding.y - 2); depot.state = 'ok'; depot.work = 0;
    s.population = 400;
    const ids = new Set<string>();
    for (let k = 0; k < 400; k++) { s.day += 20; s.lastEventDay = s.day - 40; s.lastBadDay = s.day - 40; s.pendingEvent = null; maybeFireEvent(s); const pe = s.pendingEvent as { id: string } | null; if (pe) ids.add(pe.id); }
    expect(ids.size).toBeGreaterThan(3);
    expect(ids.has('caravan')).toBe(false);
    const g = town();
    const gd = placeBuildingRaw(g, 'depot', g.founding.x + 4, g.founding.y - 2); gd.state = 'ok'; gd.work = 0;
    const seen: number[] = [];
    run(g, TICKS_PER_DAY * 30, { onDay: (st) => { if (st.pendingEvent?.id === 'caravan') seen.push(st.day); if (st.pendingEvent) resolveEvent(st, st.pendingEvent.choices.length - 1); } });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[1] - seen[0]).toBe(CARAVAN_EVERY);
  });
});
