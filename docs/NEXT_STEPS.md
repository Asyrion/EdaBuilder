# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 2: sharpen the core loop, the rest** (RESET_PLAN §3, Phase 2; DESIGN §2). Done: 2-1 (growth from the lots
   that can grow, why a lot does not) and 2-2 (a lot grows only in light and water; the Font 100 mana for 4,500; the
   surge's countdown). Next, one change at a time with the bot corridor: **the city's income against its mana** (the
   2-2 corridor, 1,218, is income-bound: the bot buys Fonts as fast as its taxes allow; candidates: the zones' mana use
   by level, the taxes' yield, the node deepening's price and milestone), demand with its factors shown, traffic
   (whether jams steer carts again, deterministically), then the P2 items (services, the budget and the Crown favour
   that stands still, happiness terms, milestone pacing, hazards' warnings).
2. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7).
3. **Phase 4: shaders and effects** (RESET_PLAN §3, Phase 4).
4. **Phase 5: UX and feedback** (RESET_PLAN §3, Phase 5).
5. **Phase 6: performance and stability** (RESET_PLAN §3, Phase 6).

## Known issues

- **The bot corridor** after 2-2: the six-seed mean is 1,218 folk on day 150 (1,937 in 2-1, which rode on dark houses
  that drew no mana; 1,177 in 1d-1); seed 42 has 1,139 and 1,332 against phase 0's 3,194; seed 45 stays at Market Town.
  RESET_LOG 2-2.
- **The Crown favour stands still** at 50 since its movers, the tales (1c-1) and the relics (1c-2), were parked.
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
- **`devicePixelRatio` is ignored** (`renderer.ts`): on a 125 % or 150 % display the browser scales the canvas and the
  pixels blur (RESET_PLAN §1.4, point 8; phase 3).
