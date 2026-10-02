# Wardlight: how a Claude session works on this repository

Read `docs/HANDOFF.md` first: it says where the project stands and what comes next. Then
`docs/NEXT_STEPS.md` (the ordered list of open work) and the DESIGN.md sections it points
to. Do not re-audit the game or re-plan the milestones: the plan is written down, and the
order of the list is itself a decision the user made.

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
   `npx vite preview --port 4173`), and the balance runs (`npx tsx scripts/balance.ts <seed>
   150 - <people>`, the six-run table: Vellish 42/43/44, Grimmen/Veshari/Tallowkin 42) for any
   sim change; one control seed for art-only changes. Report the numbers honestly, losses
   included.
5. **Docs stay current:** DESIGN.md gets a `### 4.NN` section per iteration with the
   balance table and a decision-log entry; NEXT_STEPS.md gets "Done in iteration NN" and the
   reordered list; README.md's feature list and the in-game help follow.
6. **Determinism:** no `Math.random` in `src/sim`; use `rngOf`/`commitRng`. New state
   fields get a default in `save.ts` so old saves load.
7. **Art:** sprites come from the paintings in `inspirations/` through `npm run art`
   (`art/sources.json`, hand-set anchors, `npm run art:check` judged by eye) or from the
   procedural painter; every building must have a sprite (a test holds it); imported sprites
   are sharpened and outlined so they read as one set with the procedural ones.
8. **Writing to the user:** lead with the outcome, say what was verified, name what was not,
   end with what comes next. The user does not watch the tool calls.

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
