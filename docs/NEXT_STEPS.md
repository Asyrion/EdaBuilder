# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7). Phase 2 is done (2-1 to 2-10;
   RESET_LOG has its acceptance, with the one point only a hand session can prove: a new player at the Village in 20
   minutes).
2. **Phase 4: shaders and effects** (RESET_PLAN §3, Phase 4).
3. **Phase 5: UX and feedback** (RESET_PLAN §3, Phase 5).
4. **Phase 6: performance and stability** (RESET_PLAN §3, Phase 6).

## Known issues

- **The bot corridor** after 2-7: the six-seed mean is 2,645 folk on day 150 (2,063 in 2-5/2-6); seed 42 has 3,254 and
  2,148 against phase 0's 3,194; half the runs reach the Beacon of Eda; the draws of a seed spread wide (up to 2,376),
  and seed 13 is the weakest. RESET_LOG 2-7.
- **Fire is the one hazard that costs the bot** (2-8: 66 buildings burned a run, nearly all outside a hall's reach;
  two runs end with no hall reaching any zone building). The surge, the restless and the Gloam barely touch it.
  RESET_LOG 2-8.
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
- **`devicePixelRatio` is ignored** (`renderer.ts`): on a 125 % or 150 % display the browser scales the canvas and the
  pixels blur (RESET_PLAN §1.4, point 8; phase 3).
