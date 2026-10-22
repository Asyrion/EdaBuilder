# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 2: sharpen the core loop, the P2 items** (RESET_PLAN §3, Phase 2; DESIGN §2). Done: the P1 items (2-1 to
   2-5), 2-6 (the Crown's favour struck out) and 2-7 (the bot serves its town by the gaps; the Growth view on N). Next,
   one change at a time with the bot corridor: hazards (the fire's spread, 22 % a day to an uncovered neighbour and two
   days to burn down, judged with the services now filled; a herald, a remedy and a view for each hazard), happiness
   terms (about six, listed in the inspector), milestone pacing (half the runs reach the Beacon in 150 days).
2. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7).
3. **Phase 4: shaders and effects** (RESET_PLAN §3, Phase 4).
4. **Phase 5: UX and feedback** (RESET_PLAN §3, Phase 5).
5. **Phase 6: performance and stability** (RESET_PLAN §3, Phase 6).

## Known issues

- **The bot corridor** after 2-7: the six-seed mean is 2,645 folk on day 150 (2,063 in 2-5/2-6); seed 42 has 3,254 and
  2,148 against phase 0's 3,194; half the runs reach the Beacon of Eda; the draws of a seed spread wide (up to 2,376),
  and seed 13 is the weakest. RESET_LOG 2-7.
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
- **`devicePixelRatio` is ignored** (`renderer.ts`): on a 125 % or 150 % display the browser scales the canvas and the
  pixels blur (RESET_PLAN §1.4, point 8; phase 3).
