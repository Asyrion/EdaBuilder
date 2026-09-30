# Next steps

## Known issues

- **Software-rendered performance.** Under headless Chromium with SwiftShader a 500-building,
  800-agent city renders in ~10 ms at 2–3× zoom but ~28 ms at 1× (the full-resolution blit
  and light pass dominate in software). On a GPU-backed browser this is well under the
  16 ms budget, but 1× zoom on a very large city should be re-measured on real hardware
  and, if needed, the light map dropped to quarter resolution at 1×.
- **Problem icons can get noisy** in a dense, under-served city (each dry/unlit building
  shows one). CS1 does the same, but a per-district summary or icon fading with zoom would
  read better.
- **The bot player is a test tool**, not a demo: it zones aggressively and sometimes leaves
  water gaps that a human would fix in seconds.
- **Agents walk on the tile grid**, so citizens occasionally cut a corner visually where a
  road turns. Restless that lose their road hop to the nearest one.
- **Cross-chunk depth**: props are cached per ground chunk and depth-sorted per frame, but a
  very tall tree directly behind a tall building on a chunk boundary can overlap by a pixel
  or two.
- **No undo** for roads and bulldozing; misclicks cost crowns.
- **Autosave** writes every three game days; a crash between saves loses up to three days.
- The GitHub Pages workflow deploys from `main` only; a branch preview would need a second
  job.

## Prioritized ideas for the next iteration

1. **Goods flow.** Craft districts produce potions/leystone that markets must receive by
   cart; unmet supply lowers market happiness. Turns carts from decoration into logistics
   and makes traffic matter more.
2. **Districts and policies** (CS1's best late-game layer): curfews, tithe exemptions,
   "no stills near the well", Grimmen sextons, Tallowkin spire-wrights. Cheap to add on top
   of the coverage maps.
3. **Seasons.** The lore already has Thaw/Bloom/Ember/Hush; make the Hush matter: longer
   nights, gloam creeps faster, mana demand for warmth rises.
4. **Hand-made art pass.** The atlas manifest is ready; the biggest wins are level-3
   townhouses, the temple, and citizen sprites with real walk cycles.
5. **Sound design pass.** Positional emitters (river, fire crackle, market chatter) and a
   simple generative melody for milestones.
6. **Events with choices.** A pilgrim caravan, a Concord relic found in the hills, a
   petition from the guilds: modal choices with lore consequences.
7. **Terraforming** (drain a marsh, clear forest) and the ability to buy map sectors like
   CS1's tile purchase, with the Gloam retreating as sectors are chartered.
8. **Accessibility.** Colour-blind-safe overlay ramps, scalable UI, remappable keys.
9. **Mobile/touch** controls (pinch zoom, two-finger pan).
10. **Replays and challenge seeds.** The sim is deterministic; a command log would allow
    replays and daily-seed challenges.
