/** Iteration 56 (the playtest batch): every building with a reach has a ring that says what the sim does, water rings are the
 *  water the building really gives, and the painted buildings stand at the procedural scale, facing the procedural way. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGame, placeBuildingRaw, waterReachOf } from '../src/sim/world';
import { recomputeAll } from '../src/sim/sim';
import { BUILDING_BY_KEY, BUILDINGS } from '../src/sim/catalog';
import { SECONDARY_REACH, reachesOf, reachesOfBuilding } from '../src/sim/reach';
import { FEED_REACH, LODGE_REACH } from '../src/sim/wyrmcraft';
import { HOSPICE_REACH, GLIMHOUSE_REACH } from '../src/sim/growth';
import { CARTERS_REACH } from '../src/sim/agents';
import { flatten } from './helpers';

describe('Reach rings', () => {
  it('every building with a service or water has a primary ring, and every secondary reach names a real building', () => {
    const s = createGame(56, 'Ringwick');
    for (const def of BUILDINGS) {
      const rs = reachesOf(s, def);
      if (def.service || def.waterRadius) {
        expect(rs[0]?.primary, `${def.key} has no ring`).toBe(true);
        expect(rs[0].r).toBeGreaterThan(0);
      }
    }
    for (const key of Object.keys(SECONDARY_REACH)) expect(BUILDING_BY_KEY[key], key).toBeDefined();
  });
  it("a water building rings the water it really gives: the near-water bonus, and a drought's shorter reach", () => {
    const s = createGame(56, 'Ringwick');
    const f = s.founding;
    flatten(s, f.x - 10, f.y - 10, f.x + 10, f.y + 10);
    const w = placeBuildingRaw(s, 'well', f.x + 4, f.y + 4);
    recomputeAll(s);
    const ring = reachesOfBuilding(s, w)[0];
    expect(ring.r).toBe(waterReachOf(s, w));
    expect(ring.label).toBe(`water ${ring.r}`);
    s.weather = { kind: 'drought', until: s.day + 5 };
    expect(reachesOfBuilding(s, w)[0].r).toBe(waterReachOf(s, w));
    expect(reachesOfBuilding(s, w)[0].r).toBeLessThan(ring.r);
  });
  it("the secondary reaches are the sim's own numbers", () => {
    const s = createGame(56, 'Ringwick');
    const r = (key: string) => reachesOf(s, BUILDING_BY_KEY[key]).filter((x) => !x.primary).map((x) => x.r);
    expect(r('cradle')).toEqual([FEED_REACH]);
    expect(r('tamerslodge')).toEqual([LODGE_REACH]);
    expect(r('hospice')).toEqual([HOSPICE_REACH]);
    expect(r('cartersyard')).toEqual([CARTERS_REACH]);
    expect(r('glimhouse')).toEqual([GLIMHOUSE_REACH]);
    expect(reachesOf(s, BUILDING_BY_KEY.hospice).find((x) => !x.primary)!.square).toBe(true);
  });
});

describe('The painted buildings at the procedural scale, facing the procedural way', () => {
  const manifest = JSON.parse(readFileSync('public/art/sprites.json', 'utf8')).sprites as Record<string, { w: number; h: number }>;
  const sources = (JSON.parse(readFileSync('art/sources.json', 'utf8')).sprites as { name: string; kind?: string; targetHeight?: number; anchor?: unknown; flip?: boolean; off?: boolean }[]).filter((e) => !e.off); // the paintings switched off in iteration 79 stay on the record but not in the atlas
  it('no hero sprite towers over its tile any more (heights as measured against the procedural twins)', () => {
    // b_well is drawn in code since iteration 79 (its painting is off), so it is no longer in the manifest
    expect(manifest.b_spire.h).toBeLessThanOrEqual(53);
    expect(manifest.b_nexus.h).toBeLessThanOrEqual(60);
    expect(manifest.b_cistern.h).toBeLessThanOrEqual(64);
    for (const k of [0, 1, 2, 3]) expect(manifest[`b_stake_s${k}`].h).toBeLessThanOrEqual(68);
  });
  it('a scaled hero stands centred on its tile, and the paintings fronted on the left face are mirrored', () => {
    for (const e of sources) if (e.name.startsWith('b_') && e.targetHeight) expect(e.anchor, e.name).toBe('centre');
    // the donkey carts (kind 'vehicle') face right by their own rule (iteration 57)
    const flipped = sources.filter((e) => e.flip && e.kind !== 'vehicle' && e.name.startsWith('b_') && !/_v\d+$/.test(e.name)).map((e) => e.name).sort();
    expect(flipped).toEqual(['b_cartersyard', 'b_cistern', 'b_lyceum', 'b_stake_s0', 'b_stake_s1', 'b_stake_s2']); // the depot is drawn in code since iteration 79; the zone houses' flips are pinned in tests/iteration82.test.ts, the buildings' looks' in iteration83
  });
});
