# Handoff: where Wardlight stands

Written at the close of iteration 62 (the balance table; DESIGN §4.93). Iteration 61 (the bot's depot, the hunt and
the fish, §4.92) and 60 (M16 part 2, the water; M16 closed) came just before it. Update this file whenever a session ends (see CLAUDE.md, "Session handoff").

## What the game is

A browser city builder (TypeScript + Vite, 2:1 isometric pixel art, a deterministic sim with
tests, deployed to GitHub Pages from `main`). Three playable peoples (Vellish, Grimmen,
Veshari) plus the Tallowkin, each with rules, buildings, a quest chapter and tales. The
design lives in `docs/DESIGN.md` (sections 4.1–4.93 are one per iteration; §7 the milestone
plan; §15 M14; §16 M15 and M16; §12 the decision log), the open list in
`docs/NEXT_STEPS.md`, the building and mechanic audit in `docs/AUDIT.md`.

## Milestones

- M1–M15 are closed. M14 (the depth pass) closed in iteration 55 with part 5 (DESIGN §4.86,
  AUDIT.md §4 part 5); M13 (the Tallowkin) in iteration 52; M15 (the painted set) in 50–51.
- Iteration 56 (DESIGN §4.87) was a playtest batch between milestones: the painted heroes
  scaled to their procedural twins, nine left-fronted paintings mirrored, and reach rings drawn
  above the buildings with labels and secondary reaches.
- Iteration 57 (DESIGN §4.88) was another batch between milestones, at the user's request: the
  uploaded donkey-cart sheets became the road carts, and the first-cart quest's Show me finds one.
- Iteration 59 (DESIGN §4.90), at the user's request after a playtest screenshot: every building
  turns toward its road by a mirror.
- **M16 the wild and the water** (DESIGN §16) is closed. Part 1, the wild (iteration 58, §4.89):
  herds, the lodge's quarry, meat on the shelves, wolves, the Close Season, two tales, the animal
  sheets. Part 2, the water (iteration 60, §4.91): shoals, Fishers' Huts and boats, fish that spoil,
  the Smokehouse, reeds and thatch, the lake's land and wells, the Water Garden, the ford and the
  Weir, the spawning run.
- No milestone is open. The rest of the list is items, not milestones.

## The next item

The two open items at the head of NEXT_STEPS are both **the user's decisions**. Ask before starting either.
1. **The depot's road does not pay.** A depot carries 8 goods a day at 2–4 crowns against 25 a day of upkeep
   (DESIGN §4.92). The choices are more carts, a lower upkeep, or the hunt's goods outside the carts' budget. It is a
   sim change, so it is measured with `scripts/table.ts --compare origin/main`.
2. **A wider balance bar.** The default table sees a tenth over all four peoples, but only a fifth for the Vellish and
   three tenths for the Tallowkin (DESIGN §4.93).

Plan it on the Plan panel first.

## Known issues (also in NEXT_STEPS.md "Known issues")

- **The bot after part 5.**
  - **Folk:** the light-first rule costs Vellish seeds 42 and 44 a third and half of their folk
    against iteration 54 (1,942 and 1,280). In exchange all three Vellish seeds take the Burgh by
    day 42, seed 43 lights the first Beacon, and the Tallowkin reach the Lantern of Wicks.
  - **Loans:** both last gates ride on the Crown's loan, with 70,000 still owed at day 150.
  - **Breadth:** since iteration 61, ten of twelve bot runs stand a depot (the Tallowkin none). Walls appear
    only where hounds came (Vellish 43). Breeding never happens.
  - **Variance:** the runs swing a lot between passes. Iteration 60 measured it: one extra roll of
    the main stream on day 10 sends Tallowkin 42 from 3,003 folk to 1,396, and Vellish 43 from 2,903
    to 1,579, each losing two gates. A single-seed row cannot show a change of a tenth (NEXT_STEPS
    item 2).
- **The Grimmen fall in the Ember** (iterations 54 and 55): a third of the folk leave between days
  60 and 70 with no home abandoned (mana demand 340 to 218, happiness to 51). Worth a probe.
- **Bugs fixed this session** that a future reader may meet in old notes:
  - the screen that went black at dawn and dusk (hotfix PR #56, a blend mode left set by the light
    pass);
  - the Hall of Wicks the vigil never unlocked;
  - tales refused in a city in debt ("0 crowns asked").
- Seed 43 (Vellish) used to never reach the Free City; with the part 5 bot it does (day 123).
- **Head-on paintings and a road behind** (iteration 59). Every building turns toward its road
  by a mirror, but the painted houses drawn head-on (most level-2 hearths, the craft levels, the
  arcane level 2, the last Stake stage) cannot turn their front to a road behind them. Only new
  three-quarter paintings would fix that.

## Tools and conventions

- Tests: `npx vitest run` (65 files, 407 tests at this writing; `tests/iteration62.test.ts` is
  the balance table's, `tests/iteration61.test.ts` the bot's depot's, `tests/iteration60.test.ts` the water's, `tests/iteration59.test.ts` the facing's, `tests/iteration58.test.ts` the wild's, `tests/iteration57.test.ts` the carts'). Typecheck: `npx tsc --noEmit -p .`. Build: `npm run build`.
- Playtests: `scripts/playtestNN.mjs` with Playwright (`executablePath:
  '/opt/pw-browsers/chromium'`), against `npx vite preview --port 4173 --strictPort`;
  `window.__game` (state, view, renderer, ui, select, newGame) and `window.__wardlight`
  (actions, tick, recomputeAll, place, events, atlas, `wyrmcraft`, `beasts`, `vehicles`,
  `wyrm`, `maybeFireReturn`, and since iteration 54 `weave`, `economy`, `edicts`,
  `districts`, `events`, `scenario`, and since iteration 55 `save` {serialize, deserialize}, `dev`
  {runDev} and `factions` {canBuild, specialLock}, and since iteration 59 `facing` {faceLeft}, and since iteration 60 `water` (the whole module: `forgetWaters`, `watersOf`, `dailyFords`, …)) are the hooks; a second game in one script starts
  through `__game.newGame(seed, name, 'valley', people)` (`'daily'` for the challenge)
  because the title screen is hidden once a game runs; the panels open through
  `__game.ui.toggleBudget(true)` / `toggleEdicts(true)` and `ui.edictScope`; screenshots go
  to `shots/` (gitignored).
- Balance: since iteration 62 the bar is the balance table, `npx tsx scripts/table.ts --compare
  origin/main` (four peoples × seeds 42–44 × two draws, about 11 minutes a side on four cores; DESIGN §4.93). It
  reports every row, σ within seeds, the paired Δ and a verdict ("seen" past 2·SE). A single run is still
  `npx tsx scripts/balance.ts <seed> 150 - <people> [roll=N]`. Before iteration 62 the six-run table was Vellish
  42/43/44 and Grimmen/Veshari/Tallowkin 42; each DESIGN section records it against the
  previous one in brackets. The day line prints dragons, materials, bouts, golems, the
  departed and (iteration 54) the charter upkeep; the summary prints the weather days, the
  levies, favour, pleadings, the loan, the fox audits and the pilgrims' shrines. The
  script's `computeLedger` call every ten days consumes rng, so a probe that prints every
  day diverges from the balance run itself; compare like with like. A bit-exact baseline is
  the standard for a change that should not move the world: iteration 53's first draft
  drifted by two goods on one day and lost six per cent of the folk by day 150. Iteration
  54 moved every row on purpose (the gates, the charter's price, the rain), and §4.85 names
  the reason for each. Iteration 55 moved them again (the bot's levers, §4.86); iteration 56
  matched §4.86's Vellish 42 bit for bit. The next baseline is §4.86's table.
- Art: `npm run art` turns paintings in `inspirations/` into `public/art/sprites/*.png` and
  `public/art/sprites.json` as `art/sources.json` says (kinds building/prop/ground, islands
  for sheets, hand-set anchors, glow hues, recolour, sharpen and outline); `npm run
  art:check` writes `shots/import_check.png`; the atlas merges the manifest over the
  procedural sprites at boot (`SpriteAtlas.mergeOverrides`). The outputs are committed. The
  Great Cradle is the procedural `b_greatcradle` (a cradle at level 2).
  - A hero painting gets `targetHeight` = its procedural twin's opaque height × 1.15 (× 1.3 for
    towers) and `anchor: 'centre'`; a test holds every `b_` sprite with a `targetHeight` to the
    centre anchor.
  - `flip: true` mirrors a painting (and its glow) before scaling. Procedural buildings face
    lower-right (door and gable on the right face), so a painting fronted on the left gets
    `flip`. The flip list is pinned in `tests/iteration56.test.ts`.
- Sim: deterministic (`rngOf`/`commitRng`), `save.ts` defaults for new fields, `recomputeAll`
  after structural edits. The renderer never changes the sim. Multiplying a chance keeps the
  rng stream (a `chance` consumes one roll whatever the odds); adding a roll shifts every
  later one that day. Anything that must not touch the main stream (the weather, the fox
  audit) draws from `new Rng(hashString(seed:…))`, a side stream keyed by the seed and the
  day or season, which the forecast can also read ahead.
- Git: work on the session's `claude/...` branch, PR to `main`, merge, fast-forward the
  branch, check the Pages deploy. Commit messages carry no model names.

## What the user cares about (from the sessions so far)

- Depth over breadth: a mechanic exists only if the player can see it, decide about it and
  lose by it (DESIGN §15's rule).
- The visual set must read as one: outlines and crisp pixels on everything.
- Finish what was started; say so when something is not met rather than rounding up.
- Playtest findings arrive as lists; big ones become milestones with a design in DESIGN.md,
  small ones go into the next iteration.

## Learned in iteration 58 (not yet said elsewhere)

- **The wild is on side streams** (`src/sim/wild.ts`: `sideRng` by seed, day and tag, and a
  per-tick stream for the steps in `tickCreatures`). A city whose bot buys no game lodge and loses
  no hen is bit-identical (Vellish 44). Keep new wild rolls there.
- **Wild agents** carry `herdId`; `syncWildAgents` keeps them in step with the head counts daily.
  A save without `wild` resets to an unseeded wild in `deserialize` and seeds on the next day.
- **The bot's hunt pays little:** five of six bot cities have no depot. Hides pile up unsold, and
  only one city in six has meat on a shelf at day 150 (DESIGN §4.89).
- **`window.__wardlight.wild`** is the wild module, for playtests (`dailyMeat`, `dailyWolves`,
  `setQuarry`).
- **The importer's `hop` key:** a creature painting serves as both frames, the second a pixel
  higher.
- **Tests:** 61 files, 369 tests.

## Learned in iteration 55 (not yet said elsewhere)

- **The bot** (`src/sim/bot.ts`, tale policy in `src/sim/botPolicy.ts`):
  - It spends in an order: essentials, then one goal (`pickGoal`: the people's hall, the first
    cradle, the cheapest mana), then growth.
  - The goal's price is a reserve only when urgent. Growth reads `spendable()`, streets read the
    treasury.
  - `balance.ts` prints a `bot:` line (taxes, edicts, tales off choice 0, loans, hounds and walls,
    depot, Fonts, the charter, the goal, dragons, halls) and a `tales:` line, so a run explains
    itself.
  - The baseline bot grew its grid mostly through failed service placements. Expansion is now
    explicit (a zone in demand short of lots), so watch the radius when changing what it buys.
- **Saves:**
  - `SAVE_VERSION` is 7. A new field gets its default from `createGame` through the fill.
  - A field whose old saves need a different value gets `MIGRATIONS[7]` and a bump to 8.
  - Tests that fake an old save must set `o.version = 6`.
- **Dev commands** take `{kind:'number'}` arguments, lists that follow the state, and an `arg2`.
  `devDefaultArg` gives the value the panel would pass.
- **A brightness probe** catches render regressions the eye misses: sample the `#game` canvas after
  each `renderer.render` into a 32×18 canvas, then look for frames under a quarter of the median.
  `scripts/playtest55.mjs` renders dawn and dusk ticks for it.
- **The light pass** must leave the context in `source-over`. Every frame now starts there anyway.

## Learned in iteration 56 (not yet said elsewhere)

- **Rings:** `src/sim/reach.ts` `reachesOf(state, def, b?)` is the one list of a building's
  reaches (primary from `waterReachOf`/`influenceRadius`, then `SECONDARY_REACH`, each a sim
  constant). A new reach in the sim should get a constant and a row there. The renderer fills the
  ring under the objects and queues the outline and label in `topRings`, drawn after lighting.
- **Measuring sprites:** to compare an imported sprite with its procedural twin in the browser,
  open one page with `art/sprites.json` routed to a 404 (the procedural-only atlas) and one
  without, then measure opaque boxes in `__wardlight.atlas`. `scripts/playtest56.mjs` does it.
  With `OLD_ART=<dir>` it serves an older `public/art` for a before shot.
- **Ring pixels in a playtest:** the back buffer (`renderer.back`) after `renderer.render` is
  what to count. A mask of the houses comes from rendering with and without them.

## Learned in iteration 57 (not yet said elsewhere)

- **Vehicles in the importer:** `kind: 'vehicle'` scales by `scale` (a fraction of the painting),
  not a target height, so one sheet's carts share one donkey size; measure the animal per sheet
  and set the factor from it. `mirrored: true` writes the `_l` twin. A new cart sheet goes in the
  same way; the pools are counted at render time (`countVariants('cartp_goods_')`), so adding
  carts needs no code.
- **Gridded sheets:** `keyBackground` floods from the four corners only, so a sheet drawn in a
  grid keys only its outer margin. A `rect` entry is now cut first and keyed after; use it for
  any gridded sheet, with the cell inset past the lines (find them by counting non-white pixels
  per row and column).
- **Uploaded images** arrive as webp; ImageMagick's `convert` turns them into the png the
  importer reads.
- **Agents with `timer > 0` are not drawn** (resting inside a building), so a playtest that
  places agents by hand must give them `timer: 0`. A hand-built town fills carts only once its
  works have `stock >= 4`; `scripts/playtest57.mjs` tops the stock up each tick.

## Learned in iteration 59 (not yet said elsewhere)

- **Facing:** `src/render/facing.ts` `faceLeft(state, footprint)` is the one rule; the renderer
  draws `atlas.mirrored(name)` when it is true. A `SpriteRect` may carry `src` (the mirrored
  sheet); every draw path reads `s.src ?? atlas.image`, so a new draw path must too.
- **No facing cache:** `roadVersion` is bumped by the UI tools and the portals, not by every road
  write (the bot, dev commands, undo), so anything keyed on it can go stale.
- **A before build beside the after:** a `git worktree` at the previous commit, `node_modules`
  symlinked, `vite build --outDir <dir>`, and `vite preview --outDir <dir> --port 4174`;
  `OLD_PORT=4174 node scripts/playtest59.mjs` shoots both.
- **Judging a painting's facing** needs 5× or more beside its mirror; at 3× the head-on houses
  read as left-fronted, which they are not.

## Learned in iteration 62 (not yet said elsewhere)

- **`table.ts` worktrees** go in the OS temp dir with `node_modules` symlinked, and are removed in a `finally`. If a run
  is killed, `git worktree list` shows the leftovers; `git worktree remove --force <dir>` clears them.
- **The ref side runs this tree's `balance.ts` and `rolls.ts`**, so an old ref prints the same `json:` line. A ref
  older than iteration 61 prints `depotDay` and `roadCrowns` as missing, which the table does not read.
- **`tsc -p .` covers `scripts/`**, so the balance scripts are typechecked with the game.

## Learned in iteration 61 (not yet said elsewhere)

- **A table with its own yardstick.** Run each seed four ways (main and branch, each plain and with `null`), from a
  `git worktree` of `origin/main` with the branch's `balance.ts` copied in. Three runs at a time on this container's
  four cores take about 25 minutes for twelve. A `runsix.sh` that pipes the six seeds through `xargs -P 3` is enough.
- **The local `main` can be stale** (it stood at iteration 55's merge). Worktrees of main come from `origin/main` after
  a `git fetch`.
- **A goal probe** (a script that runs the bot and prints `bot.goal`, `bot.reserve`, the treasury and the ledger every
  day) found both of this iteration's draft faults: a depot goal never paid from an unheld purse, and an imports bill.
- **What reads the treasury, not the purse:** streets and bridges, the Tallowkin's Wick-Towers (`brighten`), the
  spires (`keepLit`), the wells and the mine. A goal's reserve does not stop them.
- **Playtests that start a game by `__game.newGame`** must hide `#title` and set `lessonsSeen = ['districts']`, or the
  title screen and the lesson card cover the shots. `scripts/playtest61.mjs` drives the bot in the browser:
  `new __wardlight.Bot(state)`, ticks, `bot.step()` on each new day.

## Learned in iteration 60 (not yet said elsewhere)

- **The water is derived.**
  - `watersOf(state)` in `src/sim/water.ts` works out the bodies, open water and lake distance from the
    terrain, cached by the terrain array.
  - A test or a playtest that paints water must call `forgetWaters(state)` and rebuild `state.waterDist`
    (`distanceMap`), and should set `state.water.fish = []` so the shoals refill.
  - Read `state.water.fish` only after `ensureShoals(state)`: a new map's shoals are filled on first use.
    The spawning run's first version read them before, and never fired.
- **Fords and paths.** A closed ford is skipped in the road A* (`fordClosed`), and `dailyFords` bumps
  `roadVersion` when the set changes.
- **A pending tale stops the sim.** `tick` returns at once while `state.pendingEvent` is set. A playtest
  that runs days must answer tales (`__wardlight.resolveEvent(s, 0)`) or it runs one day.
- **Killing background balance runs.** `pkill -f balance.ts` matches the shell running it and kills it
  too. Use `ps -eo pid,args | grep "[b]alance.ts" | awk '{print $1}' | xargs kill`.
- **Probing a run.** A `git worktree` per probe (`node_modules` symlinked), a `sed` on the one line the
  probe changes, and the balance run from inside the worktree. A null probe (one extra `rngOf`/`commitRng`
  draw on day 10) is the yardstick for the noise.
