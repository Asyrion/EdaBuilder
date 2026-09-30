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

## Done in iteration 4

- Trade Depot with seasonal prices and an Import Goods edict.
- Three yearly calendar festivals (Thaw-day, the Remembrance, the Hush vigil).
- Ley node panel with "Deepen the Wellspring" (twice per node) for the mana ceiling.
- Undo (Ctrl+Z, 12 steps) for roads, zones, districts, buildings and bulldozing.
- District statistics and renaming; daily autosave; quarter-resolution light map at 1×.
- Night flicker fixed (strobing particle lights, unison flicker, brownout boundary blinking).

## Done in iteration 5 (art pass)

- Fantasy building features across all zones and civic buildings; new wall and roof
  materials; standing-stone ley nodes; glimwood, mushrooms and Gloam trees; spire rings.
- Night bloom pass, ground rune rings, glowing Tallowkin eyes, cart lanterns.
- Richer UI panel styling and an animated title sigil.

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
- **Mana** is still the late-game budget: 4–6 nodes, deepened twice, plus Thrum Fonts carry
  roughly 3,000–4,000 folk. Past that the intended answer is a second charter, not more spires.
- **Undo** covers player actions only; a building the Gloam or a fire removed is not undoable.
- The GitHub Pages workflow deploys from `main` only; a branch preview would need a second
  job.

## Prioritized ideas for the next iteration

1. **Per-district problem summary** in the district overlay (unlit / dry / no goods
   counts) to replace per-building icon clutter in dense districts.
2. **Scenario charters.** Pre-built maps with a goal and a twist (a valley with one node,
   a Gloam-locked island, a city inherited mid-collapse) selectable from the title screen.
3. **A second charter.** Endgame: found a daughter wardlight on the same map, sharing
   the treasury, once the first is a Beacon.
4. **Hand-made art pass.** The procedural set now has a fantasy silhouette; hand-drawn
   replacements through the atlas manifest would still lift the temple, the Lantern of Vell
   and citizen sprites most.
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
