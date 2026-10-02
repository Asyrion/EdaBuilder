# Handoff: where Wardlight stands

Written at the close of iteration 55 (M14 part 5, the bot plays it all, and the Annals), which
closed M14. Update this file whenever a session ends (see CLAUDE.md, "Session handoff").

## What the game is

A browser city builder (TypeScript + Vite, 2:1 isometric pixel art, a deterministic sim with
tests, deployed to GitHub Pages from `main`). Three playable peoples (Vellish, Grimmen,
Veshari) plus the Tallowkin, each with rules, buildings, a quest chapter and tales. The
design lives in `docs/DESIGN.md` (sections 4.1–4.86 are one per iteration; §7 the milestone
plan; §15 M14; §16 M15 and M16; §12 the decision log), the open list in
`docs/NEXT_STEPS.md`, the building and mechanic audit in `docs/AUDIT.md`.

## Milestones

- M1–M15 are closed. M14 (the depth pass) closed in iteration 55 with part 5 (DESIGN §4.86,
  AUDIT.md §4 part 5); M13 (the Tallowkin) in iteration 52; M15 (the painted set) in 50–51.
- **M16 the wild and the water** (DESIGN §16) is next, in two parts: **part 1, the wild** is
  the next item.

## The next item

M16 part 1, the wild (DESIGN §16, "M16 The wild and the water", and NEXT_STEPS item 1):
- herds of deer and elk on the meadows that flee lit ground; boar, otters, herons, goats, and
  wolves in the Hush;
- the Hunters' Lodge hunting a chosen quarry for hides, meat and trophies as goods with their own
  prices on the Gloam road, and a Hearth happiness line for meat on the shelves;
- herds that thin where the city spreads;
- a Hunters' edict and two tales;
- the animals folder's creature sheets through `npm run art`.

Plan it on the Plan panel first. The bot now plays the levers (DESIGN §4.86), so it can learn the
hunt in the same iteration if the plan says so.

## Known issues (also in NEXT_STEPS.md "Known issues")

- **The bot after part 5.**
  - **Folk:** the light-first rule costs Vellish seeds 42 and 44 a third and half of their folk
    against iteration 54 (1,942 and 1,280). In exchange all three Vellish seeds take the Burgh by
    day 42, seed 43 lights the first Beacon, and the Tallowkin reach the Lantern of Wicks.
  - **Loans:** both last gates ride on the Crown's loan, with 70,000 still owed at day 150.
  - **Breadth:** only the Veshari bot stands a cradle and a depot in the final table. Walls appear
    only where hounds came (Vellish 43). Breeding never happens.
  - **Variance:** the runs swing a lot between passes. A wider table (three seeds a people) would
    be a better measure than one seed.
- **The Grimmen fall in the Ember** (iterations 54 and 55): a third of the folk leave between days
  60 and 70 with no home abandoned (mana demand 340 to 218, happiness to 51). Worth a probe.
- **Bugs fixed this session** that a future reader may meet in old notes:
  - the screen that went black at dawn and dusk (hotfix PR #56, a blend mode left set by the light
    pass);
  - the Hall of Wicks the vigil never unlocked;
  - tales refused in a city in debt ("0 crowns asked").
- Seed 43 (Vellish) used to never reach the Free City; with the part 5 bot it does (day 123).

## Tools and conventions

- Tests: `npx vitest run` (58 files, 342 tests at this writing; `tests/iteration55.test.ts`
  is iteration 55's). Typecheck: `npx tsc --noEmit -p .`. Build: `npm run build`.
- Playtests: `scripts/playtestNN.mjs` with Playwright (`executablePath:
  '/opt/pw-browsers/chromium'`), against `npx vite preview --port 4173 --strictPort`;
  `window.__game` (state, view, renderer, ui, select, newGame) and `window.__wardlight`
  (actions, tick, recomputeAll, place, events, atlas, `wyrmcraft`, `beasts`, `vehicles`,
  `wyrm`, `maybeFireReturn`, and since iteration 54 `weave`, `economy`, `edicts`,
  `districts`, `events`, `scenario`, and since iteration 55 `save` {serialize, deserialize}, `dev`
  {runDev} and `factions` {canBuild, specialLock}) are the hooks; a second game in one script starts
  through `__game.newGame(seed, name, 'valley', people)` (`'daily'` for the challenge)
  because the title screen is hidden once a game runs; the panels open through
  `__game.ui.toggleBudget(true)` / `toggleEdicts(true)` and `ui.edictScope`; screenshots go
  to `shots/` (gitignored).
- Balance: `npx tsx scripts/balance.ts <seed> 150 - <people>`; the six-run table is Vellish
  42/43/44 and Grimmen/Veshari/Tallowkin 42; each DESIGN section records it against the
  previous one in brackets. The day line prints dragons, materials, bouts, golems, the
  departed and (iteration 54) the charter upkeep; the summary prints the weather days, the
  levies, favour, pleadings, the loan, the fox audits and the pilgrims' shrines. The
  script's `computeLedger` call every ten days consumes rng, so a probe that prints every
  day diverges from the balance run itself; compare like with like. A bit-exact baseline is
  the standard for a change that should not move the world: iteration 53's first draft
  drifted by two goods on one day and lost six per cent of the folk by day 150. Iteration
  54 moved every row on purpose (the gates, the charter's price, the rain), and §4.85 names
  the reason for each; the next baseline is §4.85's table.
- Art: `npm run art` turns paintings in `inspirations/` into `public/art/sprites/*.png` and
  `public/art/sprites.json` as `art/sources.json` says (kinds building/prop/ground, islands
  for sheets, hand-set anchors, glow hues, recolour, sharpen and outline); `npm run
  art:check` writes `shots/import_check.png`; the atlas merges the manifest over the
  procedural sprites at boot (`SpriteAtlas.mergeOverrides`). The outputs are committed. The
  Great Cradle is the procedural `b_greatcradle` (a cradle at level 2).
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
