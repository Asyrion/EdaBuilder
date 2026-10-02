# Handoff: where Wardlight stands

Written at the close of iteration 53 (M14 part 3, PR #54). Update this file whenever a
session ends (see CLAUDE.md, "Session handoff").

## What the game is

A browser city builder (TypeScript + Vite, 2:1 isometric pixel art, a deterministic sim with
tests, deployed to GitHub Pages from `main`). Three playable peoples (Vellish, Grimmen,
Veshari) plus the Tallowkin, each with rules, buildings, a quest chapter and tales. The
design lives in `docs/DESIGN.md` (sections 4.1–4.84 are one per iteration; §7 the milestone
plan; §15 M14; §16 M15 and M16; §12 the decision log), the open list in
`docs/NEXT_STEPS.md`, the building and mechanic audit in `docs/AUDIT.md`.

## Milestones

- M1–M13 and M15 closed. M13 (the Tallowkin) closed in iteration 52; M15 (the painted set) in
  iterations 50–51.
- **M14 the depth pass** is open: parts 1 (supply has limits), 2 (services with staff and
  stakes) and 3 (wyrmcraft matured, iteration 53, DESIGN §4.84) are done; **part 4, the
  world pushes back, is the next item** (DESIGN §15, AUDIT.md §4 part 4); part 5 (the bot
  plays it all, and the Annals) follows.
- M16 the wild and the water (DESIGN §16) comes after M14.

## The next item

M14 part 4: the world pushes back. Weather of its own; the Crown's levy, favour, debt and
loans; gates and memory (the Vellish happiness gate, tales with an uncapped memory and
three grown chains); edicts as commitments and charters with a price that spills; festivals
seen; a daily challenge that can fail. Balance against the iteration 49 table (DESIGN
§4.80), which iteration 53 reproduced bit for bit. Plan it on the Plan panel first; the
audit's part 4 text has the numbers.

## Known issues (also in NEXT_STEPS.md "Known issues")

- The peoples' bots are too poor late: the Tallowkin bot never holds the 8,000 crowns for the
  Hall of Wicks and its lit share falls back to 73 % as it zones faster than it lights (the
  Hall of Wicks milestone is not reached by the bot; the player's game is whole). The Grimmen
  and Veshari bots end in brownout. All of this is M14 part 5's.
- **The bot holds no dragon.** In all six balance runs the storyteller never drew the
  Crown's gift within 150 days (it fires three to seven random tales a run), so nothing of
  M14 part 3 (lodge seats, feeding reach, hunger, the departed, odds, the sinks, the
  wonders' rows, the Court, golem duties) reaches the bot: the balance table equals the
  baseline bit for bit. Part 5 teaches it to keep a dragon, name a champion and use the
  sinks; a dev command lays an egg for the player today.
- The bot stands a Trade Depot on Vellish seed 42 (day 100, 8 goods exported) but not on the
  other seeds; it digs wells late.
- Seed 43 (Vellish) never reaches the Free City in 150 days; that is the seed, not a bug.

## Tools and conventions

- Tests: `npx vitest run` (56 files, 303 tests at this writing; `tests/wyrmcraft3.test.ts`
  is iteration 53's). Typecheck: `npx tsc --noEmit -p .`. Build: `npm run build`.
- Playtests: `scripts/playtestNN.mjs` with Playwright (`executablePath:
  '/opt/pw-browsers/chromium'`), against `npx vite preview --port 4173 --strictPort`;
  `window.__game` (state, view, renderer, ui, select, newGame) and `window.__wardlight`
  (actions, tick, recomputeAll, place, events, atlas, and since iteration 53 `wyrmcraft`,
  `beasts`, `vehicles`, `wyrm`, `maybeFireReturn`) are the hooks; a second game in one
  script starts through `__game.newGame(seed, name, 'valley', people)` because the title
  screen is hidden once a game runs; screenshots go to `shots/` (gitignored).
- Balance: `npx tsx scripts/balance.ts <seed> 150 - <people>`; the six-run table is Vellish
  42/43/44 and Grimmen/Veshari/Tallowkin 42; each DESIGN section records it against the
  previous one in brackets. The day line now prints dragons, materials, bouts, golems and the
  departed. The script's `computeLedger` call every ten days consumes rng, so a probe that
  prints every day diverges from the balance run itself; compare like with like. A bit-exact
  baseline is the standard: iteration 53's first draft drifted by two goods on one day and
  lost six per cent of the folk by day 150.
- Art: `npm run art` turns paintings in `inspirations/` into `public/art/sprites/*.png` and
  `public/art/sprites.json` as `art/sources.json` says (kinds building/prop/ground, islands
  for sheets, hand-set anchors, glow hues, recolour, sharpen and outline); `npm run
  art:check` writes `shots/import_check.png`; the atlas merges the manifest over the
  procedural sprites at boot (`SpriteAtlas.mergeOverrides`). The outputs are committed. The
  Great Cradle is the procedural `b_greatcradle` (a cradle at level 2).
- Sim: deterministic (`rngOf`/`commitRng`), `save.ts` defaults for new fields, `recomputeAll`
  after structural edits. The renderer never changes the sim. Multiplying a chance keeps the
  rng stream (a `chance` consumes one roll whatever the odds); adding a roll shifts every
  later one that day.
- Git: work on the session's `claude/...` branch, PR to `main`, merge, fast-forward the
  branch, check the Pages deploy. Commit messages carry no model names.

## What the user cares about (from the sessions so far)

- Depth over breadth: a mechanic exists only if the player can see it, decide about it and
  lose by it (DESIGN §15's rule).
- The visual set must read as one: outlines and crisp pixels on everything.
- Finish what was started; say so when something is not met rather than rounding up.
- Playtest findings arrive as lists; big ones become milestones with a design in DESIGN.md,
  small ones go into the next iteration.
