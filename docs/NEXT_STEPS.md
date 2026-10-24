# Next steps

The scope reset (since 2026-10-21) cuts the game back to its core with the Vellish alone. The plan is
`docs/RESET_PLAN.md`, one PR to `main` per phase; what each phase did is in `docs/RESET_LOG.md` (the dev board's "Done"
list reads its `## Phase …` sections), and what was parked, and how to bring it back, is in `docs/PARKED.md`. The list
before the reset (iterations 1 to 96, milestones M18 and M19, the known issues of then) is `docs/archive/NEXT_STEPS.md`;
its open items are parked.

## Prioritized ideas for the next iteration

1. **Phase 3: the art foundation and pixel art** (RESET_PLAN §3, Phase 3; DESIGN §7; `docs/ART_BIBLE.md`). Done:
   3-1 (the art bible and the master palette, 77 colours, decided by the user) and 3-2 (every sprite snapped to it,
   imported and painted; a test holds it) and 3-3 (pixel-exact on every display: `devicePixelRatio`, whole-pixel
   diamonds, rings and lines, the bloom at a whole factor) and 3-4 (the sprites drawn in code baked at build time,
   boot to the title 371 → 222 ms; `painted.ts` and `drawn.ts` merged into `handdrawn.ts`) and 3-5 (the sprite list,
   `docs/SPRITE_LIST.md`: 437 ok, 260 rework, 18 new, 79 replaced; the production list waits for the user's order).
   3-6: the renderer decision prepared (`docs/RENDERER_DECISION.md`: measurements, a probe of the palette night,
   the two ways; recommended: keep Canvas 2D). Next: the user's decision, then the art production in the order the
   user sets; phase 3 closes with both. Phase 2 is done (2-1 to 2-10; RESET_LOG has its acceptance).
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
- **The night costs two to three times the day** (RESET_LOG 3-6, a container without a GPU: 37 ms against 17 ms at
  zoom 2): the lighting pass. Phase 4.
- **The night's lit windows vary from one page load to the next** on the same build (RESET_LOG 3-2); phase 4 (lights).
- **Citizen looks 4 and 5** (the Grimmen and Tallowkin looks) can still be rolled in a Vellish game (RESET_PLAN §1.4,
  point 7; phase 3 with the citizens' sprites).
