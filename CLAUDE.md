# Wardlight: how a Claude session works on this repository

Read `docs/HANDOFF.md` first: it says where the project stands and what comes next. Then
`docs/NEXT_STEPS.md` (the ordered list of open work) and the DESIGN.md sections it points
to. Do not re-audit the game or re-plan the milestones: the plan is written down, and the
order of the list is itself a decision the user made.

## Scope reset (since 2026-10-21; the user's decision, it overrides the rules below until the reset is done)

The game is being cut back to its core with one people, the Vellish (`docs/RESET_PLAN.md`, the user's answers in its §9).
- **The list is `docs/RESET_PLAN.md`**, phase by phase (0, 1a–1d, 2–6). NEXT_STEPS' milestones M18/M19 and GitHub issues
  labelled `parked` are parked; nothing parked comes back without the user's approval (`docs/PARKED.md` says how).
- **Unchanged:** one plan per "Continue" on the Plan panel, and shipping autonomously (PR to `main` per phase, merge,
  fast-forward, Pages check).
- **Verification per iteration** (instead of rule 4 below): `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`,
  `node scripts/smoke.mjs` against `npx vite preview --port 4173` (instead of a new `playtestNN.mjs`), and for a sim
  change the bot corridor: `npx tsx scripts/balance.ts <seed> 150` for seed 42 and five more (Vellish only, instead of
  the wide bar over five peoples), its numbers against the phase 0 baseline in `docs/RESET_LOG.md`. Losses are reported
  as losses. The checklist `docs/CORE_CHECKLIST.md` is walked when the UI changes.
- **Docs** (instead of rule 5 below): a section per phase in `docs/RESET_LOG.md`, not a `### 4.NN` in DESIGN.md;
  README and the in-game help follow what is removed. `docs/PARKED.md` gets a row for everything parked.
- **Saves:** the reset breaks old saves on purpose (version 8 refuses older ones with a message); no migrations from 7.
- **The archive:** `archive/full-scope` is `main` before the reset (`ac4e05f`); `archive/core-iter4` and
  `archive/core-iter5-art` are the core before the scope grew. The session could not push tags, so these are branches.

## The standing process (the user's rules)

1. **One iteration per "Continue".** Every iteration starts with a plan on the Plan panel
   (EnterPlanMode, write the plan file, ExitPlanMode) and waits for approval before any
   edit. The plan names the DESIGN section it implements and the verification it will run.
2. **Finish the oldest open milestone before starting the next.** Never reorder the list
   silently; if an order change seems right, say why and let the user decide.
3. **Ship autonomously once approved:** commit often, open the PR, merge it, fast-forward
   the working branch onto main, and check the Pages deploy of the merge commit
   (`actions/runs?branch=main`). The user does not merge by hand.
4. **The verification bar, every iteration:** `npx tsc --noEmit -p .`, `npx vitest run`,
   `npm run build`, a Playwright playtest script (`scripts/playtestNN.mjs` against
   `npx vite preview --port 4173`), and for any sim change the wide balance bar
   (`npx tsx scripts/table.ts --bar wide --compare origin/main`: six seeds a people, draws added
   until each people's floor is a tenth of its folk; DESIGN §4.95), with each people's verdict
   and gates reported; the quick table (no `--bar`) is for probes during an iteration; one control
   seed (`npx tsx scripts/balance.ts 42 150`) for art-only changes. The bar's runs are cached in
   `balance/cache/` by what they read (DESIGN §4.102): commit that folder with the iteration, so the
   next bar finds main's side already run. Report the numbers honestly,
   losses included, and a floor not met as not met.
5. **Docs stay current:** DESIGN.md gets a `### 4.NN` section per iteration with the
   balance table and a decision-log entry; NEXT_STEPS.md gets "Done in iteration NN" and the
   reordered list; README.md's feature list and the in-game help follow.
6. **Determinism:** no `Math.random` in `src/sim`; use `rngOf`/`commitRng`. New state
   fields get a default in `save.ts` so old saves load.
7. **Art:** sprites come from the paintings in eda-lore's `inspirations/` (`../eda-lore` or `EDA_LORE`) through `npm run art`
   (`art/sources.json`, hand-set anchors, `npm run art:check` judged by eye) or from the
   procedural painter; every building must have a sprite (a test holds it); imported sprites
   are sharpened and outlined so they read as one set with the procedural ones.
   **Whenever an iteration adds or changes buildings or other graphics, show the user
   screenshots** in the final message (the sprites before and after, and in game), not only a
   description.
8. **Writing to the user:** lead with the outcome, say what was verified, name what was not,
   end with what comes next. The user does not watch the tool calls.

## Dev board (the user's ask, 2026-10-08)

`npm run devboard` serves http://127.0.0.1:8771, a local page to browse and edit the content in `src/data/content/`
(buildings, roads, milestones), with each building's sprites and art status, checked by `validateContent`
after every save; `tools/devboard/README.md` has the details. At the start of a session on the user's machine, check it
answers (`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8771/` gives 200) and start it in the background if not
(`dev-board` in `.claude/launch.json`); never a second instance on another port. New content goes into
`src/data/content/` (not code), and a new kind of content gets its entry in `tools/devboard/kinds.ts` in the same
iteration. `npm run devboard:selftest` must pass when the board changes. The generic recipe is the skill
`.claude/skills/game-dev-board/SKILL.md`. Its project tabs (`tracker.ts`, `github.ts`, `session.ts`, `public/project.js`)
show NEXT_STEPS, GitHub and the balance cache, and "Send to Claude" hands a task to Claude Code on the user's PC or to a
GitHub issue labelled `dev-board`; a send makes no commits, and a session started from one follows this process as any
other. Its art side (`prompts.ts`, `pipelines.ts`, `pipelines.json`, `textCheck.ts`, `public/art.js`) keeps image prompts in
`art/prompts/` and runs the art pipelines. The text of edicts, events,
quests and guilds is in `src/data/content/text/` (read by id; a new one still starts in code). The art pipelines (the paintings
importer, Tripo Studio by hand or through the Tripo CLI, Aseprite) are written in `docs/ART_PIPELINES.md` and run from a
sprite's Art panel (`tools/devboard/tripo.ts`, `scripts/aseprite.ts`); a change to one goes into that doc and
`tools/devboard/pipelines.json` together.

## Session handoff

A session should end after a milestone closes, or once its context has been compacted twice
(a fresh session reads the repository better than a compressed memory). When either is
true, do these in order, as the last work of the session:
1. Update `docs/HANDOFF.md` (state of play, next item, known issues, anything learned that
   the docs do not yet say), commit, merge, deploy.
2. Tell the user, in the final message, that it is time to start a new chat, and give them
   the exact text to paste as the first message. It is always this, with the next item
   filled in:

   > Read CLAUDE.md and docs/HANDOFF.md, then continue with the next item in
   > docs/NEXT_STEPS.md: <item>. Plan it on the Plan panel first.

   After that the user says "Continue" for each iteration, as before.
