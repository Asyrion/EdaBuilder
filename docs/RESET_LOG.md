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

## Phase 1a: the peoples down to the Vellish (2026-10-21)

**Done.**
- **The seam:** `src/data/factions.ts` holds the Vellish alone (`FactionId = 'vellish'`) with `factionOf`,
  `FactionRules`, `NEUTRAL_RULES`, `buildsFor`, `canBuild`, `costOf`, `milestonesOf` and `nextGate`. The rule fields only
  the other peoples used (`gateHold`, `noCraft`, `marketStock`, `marketJobs`, `stiltHomes`) are gone.
  `tests/factions.test.ts` still proves the seam with a throwaway people.
- **Parked:**
  - the Grimmen, the Veshari (as a people), the Tallowkin and the Fen-Nex: 17 buildings, their milestone lists and
    gates, their starts (`terrain.ts`, `atoll.ts`), 24 quests of their chapters plus the two Fen-Nex tasks, 9 tales,
    the Deep Cut edict, the Delve, the Weir's sluice
  - their walkers: the stone-sexton, the bargeman and the lamplighter
  - the Fen-Nex caravans, the Fen Den's eggs, the Underking's Seat, the Lantern of Wicks, the Forge-Temple
  - the bot's `quarry`/`moor`/`brighten`/`trade`, and the challenge's people draw
- **Content, art and UI:**
  - **Sprites:** the zone looks per people are gone, 192 drawn and 144 imported. So are 32 imported and 17 drawn
    building looks, the fox citizen and 36 walker frames. `art/sources.json` went from 807 to 631 entries, and
    `npm run art` was rerun: the packed sheet is now 2048×443 instead of 2048×612, and 266 PNGs are gone.
  - **Title screen:** the peoples row is gone, and the top bar no longer names the people.
  - **Fire hall:** it is shown as the **Water-Mages' Hall** (the user's choice). Its key stays `veshari`.
  - **Help and texts:** cut to match. The texts of the Ledger tasks no longer name parked buildings.
- **Saves and replays:** a charter or replay whose people is not the Vellish is refused with a message
  (`parkedPeopleMessage`). A test holds it.
- **Tests:** the 9 test files of the peoples are gone. 14 mixed files are cut to the Vellish. Shared behaviour moved
  onto the Vellish: the bot's loan bridge now builds the Lantern of Vell, goal abandonment uses the Great Gate, and the
  Atoll save and replay run on the Vellish. Eight playtests of the peoples' iterations are gone. The mixed ones stay
  until 1d.
- **Scripts and dev board:** `table.ts` defaults to the Vellish, and `balance.ts` drops the people fields of its day
  line (its `json:` line is unchanged). The dev board's prompts and selftest are adapted.

**Measured.**

| Check | Result |
|---|---|
| Bit-identity: `npx tsx scripts/balance.ts <seed> 150`, main vs. branch, the whole `json:` line | **identical on all six seeds** (42, 1, 7, 13, 21, 45) |
| Their numbers (folk, milestone, treasury, loan) | 42: 3,194 / 8 / 6,319 / 0 · 1: 2,812 / 7 / 2,335 / 0 · 7: 1,421 / 6 / 2,995 / 0 · 13: 2,587 / 7 / 272 / 0 · 21: 2,583 / 8 / 3,603 / 70,000 · 45: 2,864 / 8 / 5,976 / 70,000 |
| `scripts/smoke.mjs` | SMOKE OK; the same city as phase 0 (835 folk, day 30), no page errors |
| Bundle | JS 811 KB (276 KB gzip), was 882 KB (295 KB) |
| `npm run devboard:selftest` | OK |

Seeds 21 and 45 end owing the Crown's 70,000 loan on main too. That is the bot's habit (HANDOFF's known issues), not
this phase.

**What stays with a people's name, on purpose.** These belong to the base game and are parked with their systems in
1b/1c:
- the fire hall's key `veshari`
- the Fen-Nex **visitor** quarter (the `fennex` tales, the fox audit, the `fen` dragon line)
- the Grimmen boneyard tale and the "Grimmen crews" of the Level-hills tool
- the Tallowkin wardens (Spire Wardens edict), spire-wrights and bore-singers in the texts
- the grey and candle-eyed citizens: `cit_4` and `cit_5`, which `rng.int(6)` draws in Vellish games too
- flavour lines in `buildings.json`

**Found.**
- **The building data had its own layout.** A plain `JSON.stringify` would have rewritten every line of
  `buildings.json`, so the 17 entries were cut as text. The dev board writes the same layout.
- **Old single sprite PNGs are never deleted by the importer.** The parked ones were deleted by hand. Phase 1d drops
  the single PNGs altogether.
