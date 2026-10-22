# Handoff: where Wardlight stands

Written for a new session, after phase 1 of the scope reset (2026-10-22). The handoff before the reset, with its
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
- **The game now:** 27 buildings, 3 roads, 9 milestones, 21 Ledger tasks, 7 edicts, 13 daily systems, a top bar of 5
  buttons. `docs/DESIGN.md` is the slim design with the numbers.
- **The archive:** branches `archive/full-scope` (`main` before the reset, `ac4e05f`), `archive/core-iter4`,
  `archive/core-iter5-art`; the old docs in `docs/archive/`.

## The next item

**Phase 2, the rest** (`docs/NEXT_STEPS.md` item 1). Phase 2-1 (growth from the lots that can grow, and why a lot does
not) is done; next is mana (RESET_PLAN §3 "Phase 2", P1), one change at a time against the bot corridor. Plan it on the
Plan panel first.

## Known issues

- **The bot corridor.** Seed 42 on day 150: 3,194 folk in phase 0, 1,011 after 1d-1, 1,397 and 2,606 (two draws)
  after phase 2-1; the six-seed mean (42, 1, 7, 13, 21, 45; two draws) went 1,177 → 1,937. Phase 1 lost the caravan's
  mid-game (1c-1) and the jam-free first paths (1d-1); 2-1 won it back by letting a filling city keep growing.
  `core-loop.test.ts` holds seed 42 on day 100 at 2,855 folk and the Burgh (±50 %), re-anchored openly in 2-1.
- **The Crown favour stands still** at 50 (its movers were parked). Phase 2 decides: a mover in the core, or it goes.
- **Citizen looks 4 and 5** can be rolled in a Vellish game (`agents.ts`, `rng.int(6)`); **`devicePixelRatio` is
  ignored** (`renderer.ts`). Both phase 3.
- **GitHub Actions** ran no jobs while the repositories were private (no runner assigned, `runner_id 0`). The user made
  EdaBuilder public for the Pages deploy; eda-lore's `validate` check failed the same way on its PR 6 (merged after a
  local `npm run validate`).

## How a session works now

- **Verification per iteration** (CLAUDE.md "Scope reset"): `npx tsc --noEmit -p .`, `npx vitest run` (15 suites, about
  273 tests), `npm run build`, `node scripts/smoke.mjs` against `npx vite preview --port 4173 --strictPort`; for a UI
  change `node scripts/checklist.mjs` (prints CHECKLIST OK) and the hand lines of `docs/CORE_CHECKLIST.md`; for a sim
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

## What the user cares about

- Depth over breadth: a mechanic exists only if the player can see it, decide about it and lose by it.
- The visual set reads as one: outlines and crisp pixels on everything; screenshots whenever graphics change.
- Honest numbers: a loss is a loss, a floor not met is not met.
- Reports in German, leading with the outcome; the user does not watch the tool calls.
