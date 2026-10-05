# Handoff: where Wardlight stands

Written at the close of iteration 70 (two ways to lose; DESIGN §4.101). Iterations 69 (the Great Gate, §4.100), 68
(the plan's gaps written down, §4.99, §17) and 67 (replays, §4.98) came just before it. Update this file whenever a session ends (see CLAUDE.md, "Session handoff").

## What the game is

A browser city builder (TypeScript + Vite, 2:1 isometric pixel art, a deterministic sim with
tests, deployed to GitHub Pages from `main`). Three playable peoples (Vellish, Grimmen,
Veshari) plus the Tallowkin, each with rules, buildings, a quest chapter and tales. The
design lives in `docs/DESIGN.md` (sections 4.1–4.99 are one per iteration; §7 the milestone
plan; §15 M14; §16 M15 and M16; §17 M17–M19 and the single items still to build; §12 the decision log), the open list in
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

NEXT_STEPS item 1, **golem haulers** (DESIGN §17.4 C, §8.4).
- The Golem Foundry fields slow, tireless carts that carry 30 and are not scared by hounds. They are drawn as
  vehicles.
- Bound golems are in `src/sim/beasts.ts`, carts in `src/render/carts.ts` and `vehicles.ts`.
- Plan it on the Plan panel first.

Built since iteration 68:
- the Great Gate (item A), in iteration 69: `src/sim/gate.ts`, `HEART_EVENTS` in `events.ts`, and `drawGreatGate`
  in `drawn.ts`;
- the two ways to lose (item B), in iteration 70: `src/sim/hounds.ts`, `refuse`/`razeStake` in `wyrm.ts`, and
  `state.lostTo`.

**The list ahead** (written in iteration 68 from an audit of DESIGN.md against the code, in the user's order):
- **Three single items** (the Great Gate and the two ways to lose are done): golem haulers; loose ends; markets and the road
  (AUDIT B40).
- **Then three milestones**, each part one iteration:
  - **M17**, the marsh and the atoll: marsh terrain and the Drainage edict, marsh-wyrms, the Patagoi Atoll;
  - **M18**, the Fen-Nex: the people, then their game;
  - **M19**, the Belerial: striders for everyone, the people, then their game.
- A new people runs the wide bar with its own row in the table (the table's people list grows).
- DESIGN §17 has the subtasks.

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

- Tests: `npx vitest run` (72 files, 462 tests at this writing; `tests/iteration70.test.ts` is the two losses', `tests/iteration69.test.ts` the Great Gate's, `tests/iteration67.test.ts` the replays',
  `tests/iteration66.test.ts` the
  keyboard's, `tests/iteration65.test.ts` the drawn art's, `tests/iteration64.test.ts` the wide bar's, `tests/iteration63.test.ts` the caravan's books, `tests/iteration62.test.ts` the balance table's, `tests/iteration61.test.ts` the bot's depot's, `tests/iteration60.test.ts` the water's, `tests/iteration59.test.ts` the facing's, `tests/iteration58.test.ts` the wild's, `tests/iteration57.test.ts` the carts'). Typecheck: `npx tsc --noEmit -p .`. Build: `npm run build`.
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
- Balance: since iteration 64 the bar for a sim change is `npx tsx scripts/table.ts --bar wide --compare
  origin/main` (DESIGN §4.95): six seeds, draws added where the floor is over a tenth, every run cached. A full
  comparison takes about 2¼ hours, longer than a background job's two-hour limit. Commit first (the working tree is
  cached only when clean) and rerun the same command after a stop: it resumes from the cache. Before that, the quick
  table was `npx tsx scripts/table.ts --compare
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

## Learned in iteration 70 (not yet said elsewhere)

- **Probe before designing a rule that bites.** The probe (a tick loop with the bot, counting hound arrivals at hearth
  doors by watching `a.timer` jump) showed that hounds besiege bot cities' edges for whole Hushes without harm. The rule
  was shaped by that, and not after a bar.
- **A hound's arrival** at its target is the harass branch in `creatures.ts` (`a.timer = 40 + rng.int(40)`). Anything
  that reacts to a hound at a door hooks there, without a roll.
- **The sim's day turns at mid-morning** (`timeOfDay`: tick 0 is 0.3), so a whole night lies in one `s.day`. The day is
  a night's key.
- **A loss needs `lostTo`** beside `gameOver`, or the game-over screen falls back to the Gloam's title.
- **The bot's tale policy only sees the state right after a choice.** A choice whose cost comes later (the razing
  flight) must leave a mark in state (`wyrm.razing`) for `worth` to read.
- **The bar per people:** `--peoples <one>` keeps each background job under two hours. Iteration 70 ran the four
  peoples as four jobs from one worktree, sharing its cache.

## Learned in iteration 69 (not yet said elsewhere)

- **Tales on their own rhythm.** A chain that must not touch the main stream fires from a `maybeFire…` beside
  `maybeFireWyrm`, with its tales outside the storyteller's pool and only in `ALL_EVENTS` (so `resolveEvent` finds them).
  The pool filters by `when` before its roll, so a new pool tale whose `when` is false never moves the stream either.
- **Per-city tale text:** set `pendingEvent.text` when firing (`heartText`), as `maybeFireReturn` does. `EventDef.text` is
  the generic line.
- **A gate tile has no free edge.** It has wall on two sides and road on two, so a building that must "touch" one must
  count a corner (`touchesBelregiGate`).
- **Lit by the sim in a playtest:** a few spires from the founding node (`w.place(s, 'spire', …)`) light a hand-built
  town for real, so ticks keep it lit. Setting `b.lit = true` by hand lasts only until the next `updateMana`.
- **The bar from a worktree.** The table reads the working tree for the branch side, so editing `src/` while it runs
  would mix code. Iteration 69 ran it from a `git worktree` of the committed sim, with `node_modules` symlinked, and went
  on working in the main tree.

## Learned in iteration 68 (not yet said elsewhere)

- **NEXT_STEPS drifted from DESIGN.** The design's promises in §8, §11, §13.13 and §14.2 were never all copied into
  NEXT_STEPS, and the lists parted. Since iteration 68 every unbuilt promise points to its place in DESIGN §17. When a
  new idea is designed, put it in NEXT_STEPS in the same iteration.

## Learned in iteration 67 (not yet said elsewhere)

- **Every player change goes through `exec`.** A new player action must be a new op in `src/sim/commands.ts` (`OPS`)
  that `main.ts` or `tools.ts` calls through `this.cmd(...)` / `host.exec(...)`. It must never be a direct write to
  `state`, or replays diverge. The op does its own `recomputeAll` (and `bumpRoadVersion` if it touches roads or
  buildings); `onAction` no longer recomputes. `tests/iteration67.test.ts` fails if an op has no test call.
- **Divergence hunting:** a replay that fails names its first day. Replay to that day with `ReplayPlayer` and compare
  `serialize` with the recording's state at the same tick. The usual causes are a module-level cache read by both the UI
  and the sim (the aura cache was one), or a write the UI makes outside a command.
- **The UI may read sim helpers, not fill sim caches with different inputs.** If a render or panel path calls something
  the sim also caches, its key must cover everything the result depends on.
- **Playtests and speed:** the top bar stops at 3× (30 ticks a second). A playtest that needs weeks sets
  `__game.speed` higher, and the loop's cap of 12 ticks a frame holds. `__game.runner.log` is the live log, and
  `__game.replay` / `__game.replayEnded` show the replay's state.
- **`scripts/playtest67.mjs`** writes its exported replay to `shots/iter67.wardlight-replay.json` (shots/ is not
  committed). The file matches only on the build that recorded it.

## Learned in iteration 66 (not yet said elsewhere)

- **Keyboard focus** lives in `src/ui/focus.ts`:
  - `shortcutTarget` guards the game's keys;
  - `watchDialogs` handles every `.modal`;
  - `keepFocusThroughRebuilds` handles panels that rebuild their HTML;
  - `roving` handles the toolbar;
  - `REGIONS` is the F6 order.
  - A new panel joins the F6 order through `REGIONS`. A new dialog needs only the `modal` class.
- **The map canvas comes after `#ui` in the page** (for the Tab order); the z-index keeps the UI on top.
- **Playtests that press keys** must mind focus. A shortcut fires only with focus on the page or the map, so focus
  `#game` first (`page.focus('#game')`).
- **Screenshots of every visible change** go in the final message: the user's rule since iteration 65 (CLAUDE.md
  rule 7).

## Learned in iteration 65 (not yet said elsewhere)

- **Drawing a building in code** (`src/render/drawn.ts`):
  - `projector(ay)` maps footprint units to the sprite: 24 units a side for 3×3, the anchor at (49, ay);
  - `box` draws the left face, the right face and the top;
  - `revolve` draws a round solid in ellipse slices.
  - Draw back to front by x + y (the smaller sum is nearer the viewer), and remember the light comes from the right.
  - Check by eye at 3× and 8×: `scripts/playtest65.mjs` writes sheets from a running build.
- **A night shot needs lit buildings.** An unlit building draws no glow, and a hand-built town without spires is
  unlit, so a playtest sets `b.lit = true` before rendering. The renderer does not tick the sim.

## Learned in iteration 64 (not yet said elsewhere)

- **Two draws underestimate σ.** σ within seeds on six seeds and up to eight draws is 1.2–2.2 times §4.93's two-draw
  estimate (Vellish about 430, Veshari about 320). Read any floor from a quick table as optimistic.
- **A background job stops at two hours** and leaves the table's worktrees in the temp dir (`git worktree list`, then
  `git worktree remove --force`). The cache keeps every finished run.

## Learned in iteration 63 (not yet said elsewhere)

- **Income outside the ledger.** A tale's choice can pay into the treasury with no ledger row: the Belerial caravan, the
  airship, the relic auctions, the grants. Before judging a building by its ledger, look for the tales its presence
  fires (`maybeFireCaravan` needs a depot).
- **A take counted at the tale:** `resolveEvent` measures the treasury's rise across a choice. That is how the caravan's
  crowns are counted, and the same works for any other tale that pays.
- **Main's depot count in the table** misses depots bought as a service (the bot prints no depot day for them). The
  branch side counts them through the caravan's crowns.

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
