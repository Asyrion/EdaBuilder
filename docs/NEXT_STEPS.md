# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 2: sharpen the core loop** (RESET_PLAN §3, Phase 2; DESIGN §2). The CS1 loop made consistent, readable and
   fair, in two or three iterations, one change at a time with the bot corridor. P1 first: growth that follows demand,
   "why does this not grow?" per tile (hover and overlay), demand with its factors shown, mana (the O(spires²) and the cap
   at 3–4k folk, the surge warned), traffic (whether jams steer carts again, deterministically). Also from phase 1: the
   corridor's fall since phase 0 (the caravan carried the mid-game; RESET_LOG 1c-1 and 1d-1) and the Crown favour that
   stands still.
2. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7).
3. **Phase 4: shaders and effects** (RESET_PLAN §3, Phase 4).
4. **Phase 5: UX and feedback** (RESET_PLAN §3, Phase 5).
5. **Phase 6: performance and stability** (RESET_PLAN §3, Phase 6).

## Known issues

- **The bot corridor is lower than in phase 0:** seed 42 has 1,011 folk on day 150 against 3,194, the six-seed mean
  1,177 (RESET_LOG 1d-1). The caravan carried the mid-game economy (1c-1), and routing no longer rides on jam-free
  first paths (1d-1). Phase 2's.
- **The Crown favour stands still** at 50 since its movers, the tales (1c-1) and the relics (1c-2), were parked.
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
- **`devicePixelRatio` is ignored** (`renderer.ts`): on a 125 % or 150 % display the browser scales the canvas and the
  pixels blur (RESET_PLAN §1.4, point 8; phase 3).
