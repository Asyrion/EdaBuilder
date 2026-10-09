/** Iteration 93 (DESIGN §4.124): what a task still needs. Under each open task the Ledger shows a live line read from the city:
 *  a building not built, being built, unlit or in ruins, or a counter against its target. */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/world';
import { recomputeAll, run } from '../src/sim/sim';
import { buildRoad, placeBuilding, roadPath } from '../src/sim/actions';
import { Bot } from '../src/sim/bot';
import { NOT_PLAIN_BUILD, QUESTS, buildStatus, questStatus } from '../src/data/quests';
import { deserialize, serialize } from '../src/sim/save';
import { TICKS_PER_DAY } from '../src/sim/types';
import { construction } from '../src/sim/construction';
import type { FactionId } from '../src/data/factions';
import { flatten } from './helpers';

const Q = (id: string) => QUESTS.find((q) => q.id === id)!;
const PEOPLES: FactionId[] = ['vellish', 'grimmen', 'veshari', 'tallowkin'];

describe('Iteration 93: every task says what it still needs', () => {
  it('the list of "build X" tasks with a larger goal matches their conditions', () => {
    const plain = (q: (typeof QUESTS)[number]) => /^\(s\) => has\(s, ['"]\w+['"]\)$/.test(q.done.toString().replace(/\s+/g, ' '));
    const builds = QUESTS.filter((q) => q.focus && 'build' in q.focus);
    for (const q of builds) expect(NOT_PLAIN_BUILD.has(q.id), q.id).toBe(!plain(q));
    for (const id of NOT_PLAIN_BUILD) expect(builds.some((q) => q.id === id), id).toBe(true);
  });

  it('every building task has a line, and no line throws or comes back empty, early, a month in and from an old save, for every people', () => {
    for (const people of PEOPLES) {
      const s = createGame(42, 'Lines', 'valley', people);
      const states = [s];
      const bot = new Bot(s);
      run(s, TICKS_PER_DAY * 30, { onDay: () => bot.step() });
      states.push(s);
      const raw = JSON.parse(serialize(s));
      delete raw.stats.watchRounds;
      states.push(deserialize(JSON.stringify(raw), (seed) => createGame(seed)));
      const fresh = createGame(7, 'Fresh', 'valley', people);
      states.push(fresh);
      for (const st of states) for (const q of QUESTS) {
        const line = questStatus(st, q);
        if (q.focus && 'build' in q.focus && !NOT_PLAIN_BUILD.has(q.id)) expect(line, `${people} ${q.id}`).toBeTruthy();
        if (line !== null) expect(line.length, `${people} ${q.id}`).toBeGreaterThan(3);
      }
    }
  });

  it('a Cistern\'s line walks from not built, through being built, to unlit, then the task is done', () => {
    construction.instant = false; // the site rises over days here
    const s = createGame(42, 'Cistern');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 10);
    s.treasury = 99999; s.milestone = 1; s.sectors.fill(1);
    expect(questStatus(s, Q('l_cistern'))).toMatch(/unlocks at/);
    s.milestone = 2;
    expect(questStatus(s, Q('l_cistern'))).toMatch(/^Not built yet/);
    buildRoad(s, 1, roadPath(f.x - 10, f.y + 2, f.x + 10, f.y + 2, false));
    expect(placeBuilding(s, 'cistern', f.x - 6, f.y + 3).ok).toBe(true);
    recomputeAll(s);
    expect(questStatus(s, Q('l_cistern'))).toMatch(/Being built: \d+ %/);
    const site = s.buildings.find((b) => b && b.kind === 'cistern')!;
    site.work = Math.round(site.workTotal! / 2);
    expect(questStatus(s, Q('l_cistern'))).toMatch(/Being built: 50 %/);
    site.state = 'ok'; site.work = 0; site.lit = false;
    expect(buildStatus(s, 'cistern')).toMatch(/unlit/);
    site.lit = true;
    expect(buildStatus(s, 'cistern')).toBe('Built.');
    site.state = 'ruin';
    expect(buildStatus(s, 'cistern')).toMatch(/ruins/);
    construction.instant = true;
  });

  it('a Grimmen Seep answers for the Well, and the counters follow the city', () => {
    const g = createGame(42, 'Hold', 'valley', 'grimmen');
    expect(questStatus(g, Q('f_well'))).toMatch(/Seep/);
    const s = createGame(42, 'Counts');
    s.milestone = 2;
    s.buildings.push({ id: 9001, kind: 'wardlantern', x: 0, y: 0, w: 1, h: 1, state: 'ok', level: 1, lit: false } as never);
    expect(questStatus(s, Q('g_burn'))).toMatch(/unlit/); // an unlit lantern burns nothing: the line says so first
    (s.buildings.at(-1) as { lit: boolean }).lit = true;
    s.stats.gloamBurned = 12;
    expect(questStatus(s, Q('g_burn'))).toBe('12 of 50 tiles of Gloam burned back.');
    s.stats.gloamBurned = 80;
    expect(questStatus(s, Q('g_burn'))).toBe('50 of 50 tiles of Gloam burned back.');
    s.educated = 0.296; // not yet 30: never shown as met
    expect(questStatus(s, Q('a_academy'))).toMatch(/29 % of the folk educated, of 30 %/);
  });

  it('the Watch task says when a watchman is out', () => {
    const s = createGame(41, 'Watch');
    const f = s.founding;
    flatten(s, f.x - 12, f.y - 8, f.x + 12, f.y + 10);
    s.treasury = 99999;
    expect(questStatus(s, Q('w_patrol'))).toMatch(/Not built yet/);
    buildRoad(s, 1, roadPath(f.x - 8, f.y + 2, f.x + 8, f.y + 2, false));
    placeBuilding(s, 'watchpost', f.x + 2, f.y + 3);
    const post = s.buildings.find((b) => b && b.kind === 'watchpost')!;
    post.state = 'ok'; post.work = 0;
    recomputeAll(s);
    expect(questStatus(s, Q('w_patrol'))).toMatch(/No watchman out yet/);
    run(s, TICKS_PER_DAY);
    if (!s.questsDone.includes('w_patrol')) expect(questStatus(s, Q('w_patrol'))).toMatch(/out on patrol/);
  });
});
