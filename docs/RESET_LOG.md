# Scope reset: the log

One section per phase of `docs/RESET_PLAN.md`: what was done, what was measured, and what was found. Losses are
written as losses. The numbers of phase 0 are the baseline every later phase is compared against.

## Phase 0: safeguards (2026-10-21)

**Done.**
- **Archive:** `archive/full-scope` (`ac4e05f`, `main` before the reset, iteration 96), `archive/core-iter4` (`283a3fc`) and
  `archive/core-iter5-art` (`4b61531`). These are branches, not tags, because the session's push of tags was refused
  (HTTP 403).
- `docs/PARKED.md`: what each phase parks, where it came from, how it comes back.
- `tests/core-loop.test.ts`: the core loop's smoke tests (core APIs only).
- `docs/CORE_CHECKLIST.md`: 14 steps by hand.
- `scripts/smoke.mjs`: the smoke playtest that replaces a playtest per iteration.
- CLAUDE.md's "Scope reset" section (the process during the reset); NEXT_STEPS' open list is the reset's phases, and the
  old list is parked.
- The open GitHub issues (105–124; 101–104 were already closed) are labelled `parked` and left open, without a comment each (twenty identical comments would be noise); eda-lore PR 5 is labelled `parked` with one comment.
- No file in `src/` changed: the game plays as before.

**Baseline (main at `ac4e05f`, this container: 4 cores, headless Chromium without a GPU).**

| Measure | Value |
|---|---|
| Bot, seed 42, 150 days (`npx tsx scripts/balance.ts 42 150`) | 3,194 folk, milestone 8 (Beacon of Eda on day 128), treasury 6,319, no loan, 255 s wall |
| Its milestone days | Hamlet 3, Thorp 8, Village 12, Township 17, Market Town 23, Burgh 42, Free City 123, Beacon 128 |
| Bot, seed 42, day 100 (the corridor in `core-loop.test.ts`) | 1,945 folk, milestone 6 |
| Sim speed, headless, with the bot | about 1.7 s per game day at 2–3k folk |
| `npx vitest run` | 95 files, 622 tests, all green, 265 s (`iteration93.test.ts` alone 111 s) |
| Bundle | `dist/` 5.9 MB; JS 882 KB (295 KB gzip); CSS 15 KB |
| Boot to a playable page (`scripts/smoke.mjs`, preview build) | about 0.9 s |
| Frame time (`node scripts/perf.mjs 110`: 1,522 folk, 638 buildings, 1,007 agents, day 110) | zoom 1: 39.8 ms average (render 31.1 ms, 2,464 sprites); zoom 2: 17.5 ms (render 10.0 ms); zoom 3: 16.7 ms (render 7.1 ms); running at 3× speed, zoom 2: 20.7 ms |
| Save size (`smoke.mjs`, day 30, 835 folk) | 545 KB of JSON |

The frame times come from software rendering and are only comparable with each other in this container, not with a
player's machine.

**Found.**
- **Save/load is not deterministic over days.** `deserialize()` ends with `recomputeAll()` (`src/sim/sim.ts:44`), and its
  `updateDemand()` blends the saved demand one more step (`src/sim/growth.ts:545`). The four bars differ right after a
  load, the zone draws differ from the next day, and on seed 5 a festival tale fires on day 18 that the unbroken run
  never sees. The old round-trip test in `tests/sim.test.ts` compares only 500 ticks and misses it. The new test holds
  it as `it.fails`; the fix belongs to phase 1d (save version 8): no demand step on load, or the saved demand restored
  after the recompute.
- `scripts/perf.mjs` and `smoke.mjs` show no page errors. Typecheck and build are clean; Vite warns about the one large
  chunk (882 KB).
