# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 2: sharpen the core loop, the P2 items** (RESET_PLAN §3, Phase 2; DESIGN §2). Done: the P1 items, 2-1
   (growth from the lots that can grow, why a lot does not), 2-2 (light and water for a lot; the Font; the surge's
   countdown), 2-3 (the bot's streets; the budget by kind), 2-4 (the demand bars' factors) and 2-5 (paths follow every
   road; yesterday's jams steer the carts). Next, one change at a time with the bot corridor: the Crown favour that
   stands still (a mover in the core, or it goes), services (reach and costs without the walkers), happiness terms
   (about six, listed in the inspector), milestone pacing (now that runs reach the Beacon in 150 days), hazards' warnings
   (a herald, a remedy and a view for each).
2. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7).
3. **Phase 4: shaders and effects** (RESET_PLAN §3, Phase 4).
4. **Phase 5: UX and feedback** (RESET_PLAN §3, Phase 5).
5. **Phase 6: performance and stability** (RESET_PLAN §3, Phase 6).

## Known issues

- **The bot corridor** after 2-5: the six-seed mean is 2,063 folk on day 150 (1,800 in 2-3/2-4); seed 42 has 2,155 and
  1,847 against phase 0's 3,194; every run reaches the Burgh, three the Beacon of Eda. RESET_LOG 2-5.
- **The Crown favour stands still** at 50 since its movers, the tales (1c-1) and the relics (1c-2), were parked.
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
- **`devicePixelRatio` is ignored** (`renderer.ts`): on a 125 % or 150 % display the browser scales the canvas and the
  pixels blur (RESET_PLAN §1.4, point 8; phase 3).
