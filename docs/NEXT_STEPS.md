# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 2: sharpen the core loop, the rest** (RESET_PLAN §3, Phase 2; DESIGN §2). Done in 2-1: growth draws among the
   lots that can grow, and every lot says why it does or does not (hover, Growth view). Next, one change at a time with
   the bot corridor: **mana** (the O(spires²) chain, the cap at 3–4k folk, the surge warned with a countdown; with faster
   growth, unlit houses are now the common block: 273 in the checklist's day-40 city), demand with its factors shown,
   traffic (whether jams steer carts again, deterministically), then the P2 items (services, the budget and the Crown
   favour that stands still, happiness terms, milestone pacing, hazards' warnings).
2. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7).
3. **Phase 4: shaders and effects** (RESET_PLAN §3, Phase 4).
4. **Phase 5: UX and feedback** (RESET_PLAN §3, Phase 5).
5. **Phase 6: performance and stability** (RESET_PLAN §3, Phase 6).

## Known issues

- **The bot corridor** after 2-1: the six-seed mean is 1,937 folk on day 150 (1,177 in 1d-1); seed 42 has 1,397 and
  2,606 against phase 0's 3,194. The two draws of a seed now differ more (seed 45: 2,356 and 910). RESET_LOG 2-1.
- **The Crown favour stands still** at 50 since its movers, the tales (1c-1) and the relics (1c-2), were parked.
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
- **`devicePixelRatio` is ignored** (`renderer.ts`): on a 125 % or 150 % display the browser scales the canvas and the
  pixels blur (RESET_PLAN §1.4, point 8; phase 3).
