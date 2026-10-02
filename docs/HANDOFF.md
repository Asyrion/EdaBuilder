# Handoff: where Wardlight stands

Written at the close of iteration 52 (M13 part 2, PR #52). Update this file whenever a
session ends (see CLAUDE.md, "Session handoff").

## What the game is

A browser city builder (TypeScript + Vite, 2:1 isometric pixel art, a deterministic sim with
tests, deployed to GitHub Pages from `main`). Three playable peoples (Vellish, Grimmen,
Veshari) plus the Tallowkin, each with rules, buildings, a quest chapter and tales. The
design lives in `docs/DESIGN.md` (sections 4.1–4.83 are one per iteration; §7 the milestone
plan; §15 M14; §16 M15 and M16; §12 the decision log), the open list in
`docs/NEXT_STEPS.md`, the building and mechanic audit in `docs/AUDIT.md`.

## Milestones

- M1–M13 and M15 closed. M13 (the Tallowkin) closed in iteration 52; M15 (the painted set) in
  iterations 50–51.
- **M14 the depth pass** is open: parts 1 (supply has limits) and 2 (services with staff and
  stakes) are done; **part 3, wyrmcraft matured, is the next item** (DESIGN §15, AUDIT.md §4
  part 3); parts 4 (the world pushes back) and 5 (the bot plays it all, and the Annals)
  follow.
- M16 the wild and the water (DESIGN §16) comes after M14.

## The next item

M14 part 3: wyrmcraft matured. Lines that do what they say (each dragon line's aura a real,
shown effect); the Great Cradle; lodges with a capacity; feeding reach; departed dragons that
return; roles with a price; champions who can lose a bout; materials with sinks; marvels and
wonders with a role of their own; the Wyrm-Court after the binding; golems assigned to a
works. Balance against the iteration 49 table (DESIGN §4.80). Plan it on the Plan panel
first; the audit's part 3 text has the numbers.

## Known issues (also in NEXT_STEPS.md "Known issues")

- The peoples' bots are too poor late: the Tallowkin bot never holds the 8,000 crowns for the
  Hall of Wicks and its lit share falls back to 73 % as it zones faster than it lights (the
  Hall of Wicks milestone is not reached by the bot; the player's game is whole). The Grimmen
  and Veshari bots end in brownout. All of this is M14 part 5's.
- The bot never builds a Trade Depot on its own (iteration 47 note); it digs wells late.
- Seed 43 (Vellish) never reaches the Free City in 150 days; that is the seed, not a bug.

## Tools and conventions

- Tests: `npx vitest run` (55 files, 278 tests at this writing). Typecheck: `npx tsc
  --noEmit -p .`. Build: `npm run build`.
- Playtests: `scripts/playtestNN.mjs` with Playwright (`executablePath:
  '/opt/pw-browsers/chromium'`), against `npx vite preview --port 4173 --strictPort`;
  `window.__game` (state, view, renderer, ui, select) and `window.__wardlight` (actions,
  tick, recomputeAll, place, events, atlas) are the hooks; screenshots go to `shots/`
  (gitignored).
- Balance: `npx tsx scripts/balance.ts <seed> 150 - <people>`; the six-run table is Vellish
  42/43/44 and Grimmen/Veshari/Tallowkin 42; each DESIGN section records it against the
  previous one in brackets.
- Art: `npm run art` turns paintings in `inspirations/` into `public/art/sprites/*.png` and
  `public/art/sprites.json` as `art/sources.json` says (kinds building/prop/ground, islands
  for sheets, hand-set anchors, glow hues, recolour, sharpen and outline); `npm run
  art:check` writes `shots/import_check.png`; the atlas merges the manifest over the
  procedural sprites at boot (`SpriteAtlas.mergeOverrides`). The outputs are committed.
- Sim: deterministic (`rngOf`/`commitRng`), `save.ts` defaults for new fields, `recomputeAll`
  after structural edits. The renderer never changes the sim.
- Git: work on the session's `claude/...` branch, PR to `main`, merge, fast-forward the
  branch, check the Pages deploy. Commit messages carry no model names.

## What the user cares about (from the sessions so far)

- Depth over breadth: a mechanic exists only if the player can see it, decide about it and
  lose by it (DESIGN §15's rule).
- The visual set must read as one: outlines and crisp pixels on everything.
- Finish what was started; say so when something is not met rather than rounding up.
- Playtest findings arrive as lists; big ones become milestones with a design in DESIGN.md,
  small ones go into the next iteration.
