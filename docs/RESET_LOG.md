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
| `npx tsc --noEmit -p .`, `npm run build` | clean |
| `npx vitest run` | 87 files, 554 tests, all green (was 96 files, 626 tests: the peoples' 9 files and their cases are gone, one test of the refusal is new), 317 s on a busy container |
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

## Phase 1b: creatures, dragons, wyrms, beasts, hounds and the Warding Wall (2026-10-21)

**Done.**
- **Parked:**
  - the ambient creatures (glimmoths, thrumhares, wisps); `creatures.ts` keeps only the wild, the fishers' boats and the
    airship's flight
  - wyrmcraft and breeding: eggs, cradles and the Great Cradle, drakes, wyverns, roles, bouts, the Wyrm-Ring, auras,
    the materials (scale, wyrmfire, eggshell, rayscale, glim-dust), the Moth-Loft, the Ray Mirror and the glim-dust tool
  - the Sleeping Wyrm and the Wyrm-Court; the marsh-wyrms
  - the Concord Wardens, the Golem Foundry and its haulers; the skyrays and the Ley Beacon; the Drake Mews and its riders
  - the Gloam-hounds and the Hush siege; the Warding Wall and its Belregi and Uzulim gates; the Great Gate and the
    Heart of Belregi (it needs a Belregi gate, so it went here and not in 1c)
  - the war-tigers, the mana-storms and the Fen-Nex visitor quarter (`lore.ts`)
  - the Sky-Dock's wyvern, the tide barges and the tamer walker
- **Content:** 14 buildings, 4 edicts (beastmasters, bounty, wyrmpeace, scalemail), 14 tales, 34 Ledger tasks and the
  Annals' chapters Wyrmcraft, The Vein-Wyrm and Beasts. The losses "wyrm" and "hounds" are gone; three remain.
- **Kept, with a neutral value:**
  - The Hunters' Lodge hunts the fullest herd in its grounds unless its panel names a quarry ("Fullest herd" is the
    first button). The bot builds one lodge for game from day 20 instead of one per thirty hounds.
  - The Sky-Dock keeps its airship. Its tale's first choice gives Craft +10 % without rayscale.
  - Three tale choices that pointed at parked things are kept at their index, so `chose()`, the bot and old firedEvents
    still read the same numbers: the caravan's "Trade news" and the merchant's "Ask after the egg" do nothing, and the
    merchant's prices no longer fall with eggs bought.
  - The ley aspects keep their type, `DragonLine`, and their rules.
- **Saves and replays:** a save that holds a parked building, a dragon or a stretch of wall is refused with a message
  that names it (`parkedContentIn`). A replay that uses a parked command (`PARKED_OPS`) is refused too. Old creatures in
  a save are dropped on load, and so are the stats the parked systems kept. `tests/parked1b.test.ts` holds it.
- **UI:** the Wyrms button and modal; the wall, gates and glim-dust tools; the parked inspector rows, node panel,
  minimap pixels, help bullets and game-over causes; the audio cues howl, roar, growl, stomp, storm and song.
- **Art:** 34 entries of `art/sources.json` and their PNGs; the drawn painters of the dragons, the wyvern, the wyrm,
  the wall, the gates, the golem cart, the tiger, the rider, the hound, the skyray and the 14 buildings. `npm run art`
  was rerun: the sheet is 2048×403 (was 2048×443), 747 images.
- **Tests:** 8 files were deleted at the start of the phase and `iteration69` with the Great Gate. 36 mixed files were
  cut to the core, and one refusal test is new. Three agents trimmed the test files in parallel; I checked their
  reports and ran the whole suite. The playtests of these systems are gone: 5, 6, 7, 53, 69, 70, 72, 73, 74, 76, 86 and
  `dbg_fly`.

**Measured.** Bit-identity with main is no longer possible: from day 1 the glimmoths drew from the main stream at
night, and the hounds' fear and the golems' labour changed the cities. So the measure is the bot corridor, with two
draws per seed (`npx tsx scripts/table.ts --compare origin/main --seeds 42,1,7,13,21,45 --draws 2`). Draw 0 of main is
the phase 0 baseline, bit for bit.

| Seed | Phase 0 (main), draw 0 | 1b, draw 0 | Main, draw 1 | 1b, draw 1 |
|---|---|---|---|---|
| 42 | 3,194 / 8 / 6,319 / 0 | 1,296 / 6 / 2,866 / 0 | 2,664 / 8 / 254 / 70,000 | 2,370 / 7 / 2,515 / 70,000 |
| 1 | 2,812 / 7 / 2,335 / 0 | 1,949 / 7 / 3,126 / 0 | 1,750 / 7 / 19,315 / 0 | 2,927 / 7 / 550 / 0 |
| 7 | 1,421 / 6 / 2,995 / 0 | 1,979 / 7 / 1,663 / 0 | 1,855 / 7 / 5,461 / 0 | 1,451 / 6 / 3,566 / 0 |
| 13 | 2,587 / 7 / 272 / 0 | 2,032 / 7 / 1,689 / 0 | 1,936 / 7 / 18,608 / 0 | 3,134 / 8 / 3,569 / 0 |
| 21 | 2,583 / 8 / 3,603 / 70,000 | 2,137 / 7 / 6,483 / 0 | 2,562 / 8 / 3,726 / 70,000 | 2,957 / 8 / 918 / 70,000 |
| 45 | 2,864 / 8 / 5,976 / 70,000 | 2,202 / 8 / 54,625 / 70,000 | 2,683 / 8 / 28,776 / 70,000 | 2,325 / 8 / 27,603 / 70,000 |

Each cell is folk / milestone / treasury / loan on day 150.

- **The verdict:** a mean of 2,230 folk against 2,409, Δ −179 (−7.4 %) paired by seed, **within the noise** (2·SE 420).
  The gates: Burgh in all 24 runs; Free City in 10 of 12 (main 11 of 12), median day 116 (main 123); Beacon of Eda in 4
  of 12 (main 6 of 12). No run lost the charter.
- **The drops over a quarter, one by one.** On draw 0, seed 42 falls by 59 %, seed 1 by 31 % and seed 7 rises by 39 %.
  The second draw tells these apart from a change: seed 42 reaches 2,370 (main 2,664), and seed 1 reaches 2,927 (main
  1,750). The project's own measure (DESIGN §4.93) moves a Vellish run by up to half its folk on one extra roll.
- **One real loss, from the removal:** the caravan pays a mean of 23,995 crowns over a run, against 33,747 on main
  (−29 %), because its "sell the vault" choice sold the scale and wyrmfire the dragons made. The Gloam road's own crowns
  are about the same (1,482 against 1,585).
- The corridor test in `tests/core-loop.test.ts` (seed 42, day 100) stays green.

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .`, `npm run build` | clean |
| `npx vitest run` | 79 files, 440 tests, all green, 213 s (was 87 files, 554 tests, 317 s) |
| `scripts/smoke.mjs` | SMOKE OK; 848 folk on day 30, no page errors, save 466 KB (was 545 KB) |
| Bundle | JS 606 KB (206 KB gzip), was 811 KB (276 KB) |
| `npm run devboard:selftest` | OK |
| Screenshots, seed 42 at day 40, main against the branch | the top bar without "Wyrms", the Services tab without the wall and gates, the city by day and by night without the skyray swarm; no page errors |

**What stays with a parked name, on purpose.** These are what `grep -rniE "dragon|wyrm|golem|hound|skyray|tiger|glimmoth|wisp|wyvern" src` still finds:
- the type `DragonLine` of the ley aspects (`weave.ts`, `types.ts`, `dev.ts`)
- the refusal of parked saves and commands (`save.ts`, `commands.ts`) and the comments that say what was parked
- the Crown's "wyrm-seal" on the loan (`economy.ts`) and a wyrm in the airship captain's story (lore)
- the wolf winter's tale (wolves are the wild's), and `wisps` as a drawn decoration on four buildings (`sprites.ts`)

**Found.**
- **The save bug of phase 0 is still there.** The demand still moves on load. Seed 5 now comes back equal over the
  test's twenty days by chance, so the `it.fails` test moved to seed 42, where the population still drifts (185 against
  160 ten days after a load). It is fixed in 1d.
- **`lostTo` does not survive a save.** `deserialize` copies only the keys a fresh state has, and `createGame` never sets
  `lostTo`, so an ended charter saved and loaded forgets its cause. This is older than the reset; it goes with the save
  work in 1d.
