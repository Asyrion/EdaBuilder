# The renderer decision: keep Canvas 2D, or a WebGL2 path

**Status: prepared in phase 3-6 (2026-10-24), the user decides.** RESET_PLAN §8 point 3 puts the decision at the end of
phase 3, because phase 4 (shaders and effects) is built on it. Nothing in the game changed for this paper. Every number
below comes from a run named beside it.

## What phase 4 wants from the renderer (RESET_PLAN §3 "Phase 4")
| Effect | Prio | Canvas 2D | WebGL2 |
|---|---|---|---|
| Day and night as a palette shift instead of the grey multiply | 1 | 4–6 atlases baked and crossfaded | a palette lookup in the shader |
| Lights (windows, lanterns, spires) refined | 1 | there already, refine | there already, refine |
| Water animated (glitter, foam) | 1 | frame strips on their own layer (cheaper than today's chunk rebuild) | a UV shader |
| Particles, smoke, dust, glyphs | 2 | there already; batch by colour | instancing |
| Bloom on magic only | 2 | there already (now on whole pixels) | threshold and blur |
| The Gloam's edge (fog, motes) | 2 | sprites and particles | a shader |
| Wind in the trees; weather | 3 | sway frames; particles | vertex shear; particles |

RESET_PLAN's own advice was to do the Canvas variants first, and WebGL2 only once the palette is indexed and profiling
shows a need.

## What changed since that advice
- **The palette is indexed.** Every pixel of every sprite is one of 77 colours (3-2), so a night is a table of 77
  colours, not an image filter.
- **The sprites drawn in code are baked at build time** (3-4). A night atlas could be baked there too.
- **The picture is pixel-exact on every display** (3-3), and the tests hold it.

## Measured
**Frame cost today** (`PERF_DPR=… PERF_TOD=… node scripts/perf.mjs`, 1600×900, seed 42 at day 110, 471 buildings,
738 agents).

| Display, time | Zoom 1 | Zoom 2 | Zoom 3 |
|---|---|---|---|
| 100 %, day | 37.5 ms (render 31.1: objects 7.6, blit 19.1) | 17.3 ms (render 12.2) | 17.2 ms (render 6.4) |
| 100 %, night | **97.1 ms** (render 81.5: lighting 69) | **37.0 ms** (render 27.9: lighting 8.8, blit 13.2) | 25.1 ms (render 17.3) |
| 150 %, day | 25.8 ms (render 13.6) | 20.3 ms (render 8.6) | 16.6 ms (render 5.1) |
| 150 %, night | 73.8 ms (render 51.1) | 47.3 ms (render 29.5) | 26.2 ms (render 21.6) |

- **The measuring machine is a container without a GPU:** Chromium draws Canvas 2D in software there. The ratios
  count; the absolute numbers will be lower on a machine whose browser accelerates the canvas.
- **By day the game holds 60 frames a second at zoom 2 and 3** (16.7 ms is the screen's own beat). At zoom 1 the final
  blit dominates.
- **By night every frame costs two to three times as much.** The lighting pass is the cause: a light map multiplied
  over the whole picture, each light drawn into it, then the emissive layer added twice for the bloom. At zoom 1 that
  is 69 ms. It is the first thing a GPU would take, and also the first thing a palette night would remove.

**The probe of the Canvas path for prio 1** (`node scripts/probe_palette.mjs`; shots `shots/probe_*.png`):
- The loaded atlas (1024×1293, the drawn sprites and the paintings) remapped through a rough night table in the page
  takes **33 ms, once**. One such atlas holds **5.1 MB**; four to six (dawn, day, dusk, night, and the steps between)
  hold 20–31 MB.
- 315,138 pixels map through the table. The 14,545 that do not are the glow layers, which are light and stay.
- **A lesson from the probe:**
  - The first table kept the light and ley ramps as they were, and every thatched roof glowed at night: the thatch
    shares the light ramp's yellows.
  - A palette night has to darken every ramp and take its light from the glow layers, which already exist. It cannot
    take it from keeping colours.
- **What a palette night saves:** the full-screen multiply. The lights and the emissive glow stay, but over a picture
  that is already dark.
- **What a crossfade at dusk costs:** the objects drawn twice for the length of the fade (about 2.5 ms more at zoom 2).

**What WebGL2 would cost:**
- **The renderer:** `renderer.ts` (1,155 lines, 123 canvas calls), `pixels.ts`, the chunk caches, the light map, the
  emissive layer and the bloom are written for Canvas 2D; the overlays, lines and text would need their own pass. The
  sim, the UI and the atlas data would not change.
- **The package:**
  - PixiJS v8.22 is **841 KB minified, 237 KB gzipped** (`npm pack pixi.js@8.22.0`, `dist/pixi.min.mjs`; tree-shaking
    takes some away).
  - The whole game is 374 KB of JS today.
  - A batch renderer of our own adds little code, but a quad batcher, a texture atlas upload, the blend modes, the
    lines and the text are all ours to write and keep.
- **The pixel grid:** WebGL can keep it (nearest sampling, whole-number scales, the same device-pixel canvas). The
  pixel-grid script and the hand walk would check it as they do now.

## The two ways
**A. Keep Canvas 2D. Phase 4 builds its prio-1 effects on the indexed palette.**
- Day, dusk and night tables in `art/` (a decision for the bible), their atlases baked at build time or remapped at load
  (33 ms each), and a crossfade at dusk.
- The water as frame strips on a layer of its own. The lighting pass reworked so the night's cost falls (no
  full-screen multiply over a dark atlas).
- **Cost:** M, as RESET_PLAN said. **Risk:** low; every step is measurable against today.
- **What it rules out:** a per-pixel palette lookup, true blur, and water done in a shader. It does not rule out
  WebGL2 later: the atlas, the palette and the tables carry over.

**B. A WebGL2 renderer now** (PixiJS v8, or our own batcher).
- Night, water and bloom as shaders. The night's cost goes to the GPU.
- **Cost:** L. The renderer is rewritten before any effect is added. PixiJS adds about 237 KB gzipped; our own batcher
  adds code to keep.
- **Risk:** medium. Every check of phase 3 (the pixel grid, the night, the views, the hand walk) has to pass again.
- **What it rules out:** nothing for the effects; it spends phase 4's first weeks on the engine instead of the look.

## My recommendation
**A: keep Canvas 2D, and take phase 4's prio 1 on the indexed palette.** Three reasons:
1. The palette work of phase 3 makes the Canvas path cheaper than RESET_PLAN assumed: a 77-colour table, 33 ms to
   remap, 5 MB an atlas.
2. The one real cost, the night, is a pass that a palette night removes, measurable before and after.
3. WebGL2 stays open, and the data carries over.

Revisit WebGL2 at phase 6 (performance) if, on the user's own machine, the night after phase 4 stays under 60 frames a
second at zoom 2.

## Open for the user
- **Which way, A or B.** If B: PixiJS or our own batcher.
- **Whether the night may get its own hand-picked palette** (a table in `art/`, decided like the master palette), or
  stays a computed darkening.
- **A number from the user's machine would help:** the frame time at night, zoom 2. The game shows it bottom left
  (`fps · render ms`).
