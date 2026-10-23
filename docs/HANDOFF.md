# Handoff: where Wardlight stands

Written for a new session, after phase 1 of the scope reset (2026-10-22), brought up to date at the end of phase 2 (2-10, 2026-10-23). The handoff before the reset, with its
"Learned in iteration NN" notes, is `docs/archive/HANDOFF.md`.

## State of play

- **The scope reset** (the user's decision of 2026-10-21; CLAUDE.md "Scope reset" overrides the standing process where
  it says so) cuts the game back to its core with one people, the Vellish. The plan is `docs/RESET_PLAN.md` (the user's
  answers in its §9); each phase's record is `docs/RESET_LOG.md`; what was parked, with how to bring it back, is
  `docs/PARKED.md`. Nothing parked comes back without the user's approval.
- **Phase 1 is complete:** 0 (safeguards and baselines), 1a (the peoples), 1b (the creatures and the Wall), 1c-1 (the
  tales, the weave, guilds, walkers, forecast, Annals), 1c-2 (the world add-ons, the content cut, Help into the Menu),
  1d-1 (save version 8, the save bugs, dead code, module globals) and 1d-2 (themed test suites, five browser scripts, the
  single sprites out of the build, the paintings in eda-lore, the docs archived and rewritten).
- **Phase 2 is complete** (2-1 to 2-10): growth from the lots that can grow and why a lot does not, mana and the surge's
  countdown, the bot's streets, the demand bars' factors, traffic, the Crown's favour struck out, services by the gaps,
  the hazards' heralds and views, happiness in six groups, the hand walk as a script. Its acceptance is in RESET_LOG
  2-10; the one point a machine cannot prove (a new player at the Village in 20 minutes) waits for the user's own session.
- **The game now:** 27 buildings, 3 roads, 9 milestones, 21 Ledger tasks, 7 edicts, 13 daily systems, a top bar of 5
  buttons. `docs/DESIGN.md` is the slim design with the numbers.
- **The archive:** branches `archive/full-scope` (`main` before the reset, `ac4e05f`), `archive/core-iter4`,
  `archive/core-iter5-art`; the old docs in `docs/archive/`.

## The next item

**Phase 3: the art foundation and pixel art** (`docs/NEXT_STEPS.md` item 1; RESET_PLAN §3 "Phase 3", DESIGN §7). Its
tasks in the plan's order: the Art Bible (`docs/ART_BIBLE.md`: tile 32×16, light from the front right, the outline, one
master palette of 48–64 colours in ramps), pixel-perfect drawing (`devicePixelRatio`, shadows and fog as pixel sprites),
the pipeline tidied, the sprite list with a status per sprite, and the renderer decision at the end. Phase 3 changes
graphics: show the user screenshots before and after (CLAUDE.md rule 7). Plan the first step on the Plan panel first.

## Known issues

- **The bot corridor.** Seed 42 on day 150: 3,194 folk in phase 0, 1,011 after 1d-1, 2,155 · 1,847 after 2-5, 3,254 ·
  2,148 after 2-7; the six-seed mean (42, 1, 7, 13, 21, 45; two draws) went 1,177 (1d-1) → 1,937 → 1,218 → 1,800 →
  2,063 → 2,645 (2-7). `core-loop.test.ts` holds seed 42 on day 100 at 2,648 folk and the Beacon (±50 %; 2-7 has 2,897).
- **The bot is a measuring instrument and follows the rules:** in 2-2 its `keepLit`/`keepWatered` had to aim at dark
  and dry lots, or it raised no spire at all. A rule change that hides the bot's trigger needs the same look. In 2-3 its
  street grid was what bound its income (two in three street tiles empty); before turning an economic knob, look at the
  ledger (`computeLedger`, now with `upkeepBy` and `roadTiles`) and ask whether the player or the rules are at fault.
- **Hazards (2-8):** fire costs the bot 66 buildings a run, nearly all outside a hall's reach; two of twelve runs end
  with no hall reaching any zone building. The surge, the restless and the Gloam barely touch the bot (one Gloam taking
  in twelve runs): whether they have teeth is for milestone pacing and a hand session.
- **Citizen looks 4 and 5** can be rolled in a Vellish game (`agents.ts`, `rng.int(6)`); **`devicePixelRatio` is
  ignored** (`renderer.ts`). Both phase 3.
- **GitHub Actions** ran no jobs while the repositories were private (no runner assigned, `runner_id 0`). The user made
  EdaBuilder public for the Pages deploy; eda-lore's `validate` check failed the same way on its PR 6 (merged after a
  local `npm run validate`).

## How a session works now

- **Verification per iteration** (CLAUDE.md "Scope reset"): `npx tsc --noEmit -p .`, `npx vitest run` (15 suites, about
  295 tests), `npm run build`, `node scripts/smoke.mjs` against `npx vite preview --port 4173 --strictPort`; for a UI
  change `node scripts/checklist.mjs` (prints CHECKLIST OK) and `node scripts/handwalk.mjs` (the lines of
  `docs/CORE_CHECKLIST.md` with a real mouse and keys, prints HANDWALK OK), **and look at its shots**
  (`shots/handwalk_*.png`: the views' colours, the night, the reach rings); report a line not walked as not walked; for a sim
  change the bot corridor, six seeds: `npx tsx scripts/table.ts --compare origin/main --seeds 42,1,7,13,21,45 --draws 2
  --days 150` (cached in `balance/cache/`: commit the folder), against RESET_LOG's numbers. Losses are reported as losses.
- **Docs:** a `## Phase …` section in `docs/RESET_LOG.md` per PR (the dev board's Done list reads it); `docs/NEXT_STEPS.md`
  keeps the open list in the format the board reads (`N. **Title** text`, "DESIGN §N" chips); `docs/DESIGN.md` is fixed
  when a number in it changes.
- **Art:** `npm run art` reads the paintings from a sibling eda-lore checkout (`EDA_LORE` or `../eda-lore`) and stops
  with a message without it. It writes the sheets and `sprites.json` to `public/art/` (commit both) and the single PNGs
  to `art/build/sprites/` (ignored). The build and the tests need no eda-lore. A new painting is committed in eda-lore.
- **Tests:** the themed suites in `tests/` (core-loop, roads, networks, growth, economy, hazards, districts, save, bot,
  ui, render-atlas, art-pipeline, content, balance-tools, terrain); no `iterationNN` files. A new test goes into its theme.
- **Browser hooks:** `window.__game` (state, view, renderer, ui, newGame) and `window.__wardlight` (tick, recomputeAll,
  Bot, atlas, save, createGame, …). Playwright launches with `executablePath: '/opt/pw-browsers/chromium'`.
- **Determinism:** no `Math.random` in `src/sim`. Saves are version 8 and hold every layer; a load recomputes nothing, so
  a new state field must be serialized (`save.ts`), and `tests/core-loop.test.ts` holds a save mid-day to run on bit for bit (`tests/save.test.ts` the format).
- **Shipping:** PR to `main` per phase, merge it yourself, fast-forward the working branch, check the Pages deploy
  (`actions/runs?branch=main`).

## Learned in phase 1 (not said elsewhere)

- Waiting on a background table with `pgrep -f "scripts/table.ts"` never ends: the loop's own command line matches. Read
  the result files instead.
- The path cache is per state and a pure memo of the roads and their speeds (emptied on `roadVersion` and each season),
  so a run and a loaded save route the same. Letting the day's jams steer A* again costs 28 % (1d-1's first attempt).
- `construction.instant` stays a module switch: the test setup turns it on, a replay turns it off.

## Learned in phase 2 (not said elsewhere)

- `growthBlock(state, i)` (`growth.ts`) is the one answer to "why does this lot not grow"; the hover tooltip, the Growth
  view (N) and the bot's `darkLots`/dry lots all read it. A new growth condition gets a reason there first.
- The road version is per state (`bumpRoadVersion` in `agents.ts`, called from `actions.ts`); the path cache is emptied
  daily in `dailyTraffic`, so yesterday's jams steer A* (`JAM_ROUTE = 0.5`) without a per-tick cost.
- The bot's `fillServiceGap` runs first in its day: widest coverage gap (≥ 10 % of zoned buildings) first, barred by
  upkeep (net − upkeep < 100, except before day 30 with upkeep ≤ 20), mana (an Academy is allowed at ≤ 5 % brownout) or
  room. Without the day-30 rule seed 42 crashed to about 500 folk on Academy upkeep.
- The draws of one seed spread wide (up to 2,376 folk on day 150): judge a change by the six-seed mean and the count of
  runs above and below main, never by one run.
- `scripts/hazards.ts` is the hazards table (fires spread / uncovered, burned, surges, restless, Gloam, fire reach), read
  from the counters in `state.stats`; `fireRisk` (`hazards.ts`) is the one ignition formula the sim and the view share.
- An info view's tint lies over buildings at 35 % (`renderer.ts`), so a colour meant to read on a building needs full
  alpha (the Fire brigade view's red and amber); the ground pass is the only one under the sprites.
- A happiness term needs a group (`add(group, label, v)` in `happinessTerms`); `happinessGroups` and the inspector read
  them, and the test fails on a term without one. Cutting the formula to six real terms was offered in 2-9 and declined.
- A button clicked with the mouse gives its focus back (`ui.ts`, 2-10); without that, `shortcutTarget` gave the focused
  button every key and the game's shortcuts died until a click on the map. A test with `page.keyboard` must click a
  button first to catch a regression; `handwalk.mjs` does (the speed bar, then the seventeen view keys).
- An info view's colour on a building needs full strength (the 35 % tint over the sprites): the service views' red was
  as faint as a red roof until 2-10.
- Two views must not share a key (`ui.test.ts` holds it); the Growth view's `6` silently opened Watch for six iterations.

## What the user cares about

- Depth over breadth: a mechanic exists only if the player can see it, decide about it and lose by it.
- The visual set reads as one: outlines and crisp pixels on everything; screenshots whenever graphics change.
- Honest numbers: a loss is a loss, a floor not met is not met.
- Reports in German, leading with the outcome; the user does not watch the tool calls.
