# Next steps

## Done in iteration 2

- Goods flow by cart from Craft works to Markets, with shortages and gluts feeding demand.
- Seasons (30 days each) with a long-night Hush that stresses mana and lets the Gloam grow.
- Seven story events with choices and timed modifiers; the game pauses to ask.
- Seven city edicts with daily upkeep.
- Problem icons only after two days of trouble and only at 2× zoom or closer.
- A "no goods" icon and goods rows in the building inspector; goods stat in the top bar.

## Done in iteration 3

- Districts (8 named, painted) with edicts settable per district; district overlay with labels.
- Crystal Mines in the hills, leystone carted to Arcane districts, artifacts sold for crowns;
  roads may cut through hills; Goods overlay.
- Three one-time event chains that follow earlier choices.
- Camera-driven ambience (river, fire, market murmur) and a generative milestone melody.
- Colour-blind overlay ramps and UI scale in the menu; 4-frame walk cycle; wells and
  spires no longer catch fire.

## Known issues

- **Software-rendered performance.** Under headless Chromium with SwiftShader a 500-building,
  800-agent city renders in ~10 ms at 2–3× zoom but ~28 ms at 1× (the full-resolution blit
  and light pass dominate in software). On a GPU-backed browser this is well under the
  16 ms budget, but 1× zoom on a very large city should be re-measured on real hardware
  and, if needed, the light map dropped to quarter resolution at 1×.
- **Problem icons** now wait two days and hide at 1× zoom, but a dense unlit district still
  shows one per building; a per-district summary would read better.
- **The bot player is a test tool**, not a demo: it zones aggressively and sometimes leaves
  water gaps that a human would fix in seconds.
- **Agents walk on the tile grid**, so citizens occasionally cut a corner visually where a
  road turns. Restless that lose their road hop to the nearest one.
- **Cross-chunk depth**: props are cached per ground chunk and depth-sorted per frame, but a
  very tall tree directly behind a tall building on a chunk boundary can overlap by a pixel
  or two.
- **Mana is the late-game ceiling.** 4–6 nodes give 360–540 mana/day, which carries roughly
  450–600 buildings before Thrum Fonts (40 mana, 6,500 crowns) are needed. This is
  intentional, but a second tier of node upgrades ("deepen the Wellspring") would give
  players a clearer path past 3,000 folk.
- **No undo** for roads and bulldozing; misclicks cost crowns.
- **Autosave** writes every three game days; a crash between saves loses up to three days.
- The GitHub Pages workflow deploys from `main` only; a branch preview would need a second
  job.

## Prioritized ideas for the next iteration

1. **District statistics and naming.** Per-district population, happiness and income in
   the district overlay, and player-renamable districts.
2. **Trade depot.** Export surplus goods and leystone at a road that reaches the map
   edge, with prices that drift by season; import when short.
3. **More chains and a calendar of festivals.** Thaw-day, the Hush vigil, a Concord
   remembrance, each with a small choice.
4. **Hand-made art pass.** The atlas manifest is ready; the biggest wins are level-3
   townhouses, the temple, and citizen sprites with real walk cycles.
5. **Sound design pass.** Positional emitters (river, fire crackle, market chatter) and a
   simple generative melody for milestones.
6. **Remappable keys.** The key table is centralised in the help overlay but not yet
   configurable.
7. **Terraforming** (drain a marsh, clear forest) and the ability to buy map sectors like
   CS1's tile purchase, with the Gloam retreating as sectors are chartered.
8. **Accessibility.** Colour-blind-safe overlay ramps, scalable UI, remappable keys.
9. **Mobile/touch** controls (pinch zoom, two-finger pan).
10. **Replays and challenge seeds.** The sim is deterministic; a command log would allow
    replays and daily-seed challenges.
