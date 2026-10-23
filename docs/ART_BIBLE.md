# Wardlight: the art bible

**Status: decided by the user on 2026-10-23 ("Palette passt so"); at work since phase 3-2.** This file and
`art/palette.json` bind every sprite: the importer, the procedural painter and anything drawn in code. A test holds the
sheet and the painted sprites to the palette (`tests/render-atlas.test.ts`, "the master palette").

## 1. Scale and projection

- **2:1 dimetric.** A tile is 32 × 16 px; a building of w × h tiles stands on a diamond 32·(w+h)/2 wide.
- **A citizen is 12 px tall.** That is the yardstick: a door is about 10 px, a storey 8–10 px, a tree 1–2 storeys.
- **Integer zoom in device pixels** (phase 3-3): the canvas is the window's size times `devicePixelRatio`. Each of
  the four zoom levels is a whole number of device pixels per art pixel (`zoomScales`, `camera.ts`): at 100 % 1, 2, 3,
  4; at 125 % 1, 3, 4, 5; at 150 % 2, 3, 5, 6. So the grid is even on every display. Smoothing off, the camera on
  whole pixels.
- **No vector antialiasing in the game picture:**
  - the views' diamonds, the reach rings and their fills, the selection, the grid, the rune rings and the ley lines are
    whole pixels (`src/render/pixels.ts`);
  - the light map and the bloom are soft by design, scaled by a whole factor;
  - the one exception is the reach labels' text, an interface over the scene.

## 2. Light

- **Light comes from the front right.** The right face of a building is the lit one, the left face one ramp step darker,
  the roof's far slope two steps darker than its near slope.
- **The steps of a ramp are the shading.** A face is painted in one ramp: its colour, one step down for the shadowed
  face, one step up for the edge that catches the light. A shade never leaves its ramp for a grey.
- **Night is the renderer's work,** not the sprite's: windows, lanterns and ley glow are a separate glow layer
  (`*_glow` in the sheet).

## 3. Outline

- **1 px `#1a1420` outside** every sprite (the `ink` ramp's light step); `#0e0a14` is the shadow on the ground.
- **Inside, selectively:** an inner line only where two masses of the same ramp meet (a roof over a wall of the same
  colour), in the darker step of that ramp, never in ink.

## 4. The master palette

`art/palette.json`: **77 colours in 17 ramps**, each dark to light. The swatch (`node scripts/palette.mjs --swatch`,
`shots/palette_swatch.png`) shows them, and under them where each of the 112 art colours of today's `PAL` would land.

| Ramp | Steps | Colours | Roles today (`src/render/palette.ts`) |
|---|---|---|---|
| ink | 2 | `#0e0a14` `#1a1420` | shadow, outline |
| grass | 5 | `#2e522d` `#46753c` `#5a8f3f` `#75ac4b` `#96c45f` | grass, meadow, hill grass, moss |
| turf | 6 | `#194d2c` `#2c7439` `#3a783f` `#4b9939` `#5da73b` `#81a83f` | the ground tiles' texture (grass, meadow, forest, hills) |
| foliage | 5 | `#103d1c` `#2b6b33` `#33812c` `#56a339` `#7ccc7d` | leaves |
| earth | 4 | `#7a6748` `#947557` `#b09369` `#cab47a` | dirt, sand, sod |
| wood | 4 | `#544433` `#7e5337` `#aa794b` `#c79b63` | trunk, timber, carts |
| stone | 5 | `#38352e` `#615f58` `#807e79` `#9c9991` `#b2b5b9` | rock, stone, cobbles, iron, smoke |
| plaster | 4 | `#bfad8b` `#e0c893` `#d3cbc2` `#eadec0` | whitewash, plaster, parchment, bone |
| thatch | 5 | `#805e2c` `#946d39` `#b2893c` `#c19b49` `#e2cc61` | thatch, gold |
| roofRed | 6 | `#4c1215` `#593429` `#923741` `#784332` `#a9513c` `#cb7d40` | tile, shingle, brick, banner, copper |
| roofSlate | 3 | `#414b53` `#5a7ba8` `#8da5c9` | slate, bluewash |
| roofGreen | 5 | `#5a6757` `#4a6f46` `#407d7f` `#71903a` `#4fa697` | moss roof, copper roof, verdigris, sage |
| water | 5 | `#2e5585` `#3a77a4` `#599fc3` `#aadcee` `#dfe6e3` | water, highlights, mist |
| ley | 5 | `#1c6087` `#2ca6d8` `#6adbf1` `#8ce5cc` `#b7faeb` | ley, leystone, glass, the restless |
| light | 4 | `#dc4e3a` `#fea34f` `#fed067` `#fcec8e` | lit windows, lamps, embers, fire, runes |
| gloam | 6 | `#2c2624` `#2f3360` `#3c3a53` `#595766` `#714d92` `#9c7dcf` | the Gloam, arcane violet, dark windows |
| accent | 3 | `#cf88d0` `#d992ac` `#f4f7f1` | blossom, crystal, white |

The four zone colours (`zoneHearth` … `zoneArcane`) are UI tints, not art, and stay out of the palette.

**A new colour** comes only through this file: a row in the table above and in `art/palette.json`, with the sprite
that needs it and its A/B line (`scripts/palette.mjs --ab`). A colour that is only a shade of a ramp is a new step of that
ramp, not a new ramp.

## 5. How the palette was made, and what it costs the paintings

- **The sheet as it is:** 566 imported sprites with 8,857 distinct colours (each painting is quantized on its own to
  24–32 colours). 15 % of the pixels lie on `PAL` exactly, 56 % within ΔE 0.03 of it (OKLab).
- **Derived** (`scripts/palette.mjs --derive`): every sheet colour joins the ramp of its nearest `PAL` role; each
  ramp is clustered in OKLab (k-means, weighted by pixel count, seeded from its roles) to its number of steps; near twins
  (ΔE < 0.025) merge. 65 colours.
- **By hand, from the A/B sheet:**
  - The red barn turned brown and a grey-green roof turned grey. Seven colours the paintings miss most were added (deep
    and crimson red, a teal, a pink, an indigo, a dark and a light leaf green; `--gaps`), and a sage for the roofs.
  - The ground tiles' texture fell onto one green, so they got a **turf ramp of six**.
  - Thatch got two steps.
  - Three near twins went.
- **The snap:** the nearest colour in OKLab with hue and chroma counting twice as much as lightness (`chroma: 2` in the
  file), no dither. At 1 a deep red took the brown of its lightness; at 3 the bushes smeared.
- **The cost, every sprite:** the mean ΔE over the sheet is **0.023** (a just-visible step is about 0.02–0.03). Only
  2,810 of 199,229 pixels (1.4 %) end farther than 0.06 from their colour. In a town of seed 42 on day 40
  (`--scene`), 1.6 % of the screen's pixels change by more than 20 levels and the mean saturation falls about 4 %.
  The ones that change most are bushes and glimwood trees (ΔE 0.04–0.06), whose light greens and pinks the palette
  only nearly holds.
- **The A/B sheet** (`shots/palette_ab.png`; original, master palette, today's `PAL`, at 3×). Of the 32 sprites
  in the sample, the master palette is as close as `PAL` or closer for 30. `PAL` is closer for the boneyard (0.021
  against 0.032) and the mushroom (0.017 against 0.020). The master palette's largest change is the bush (0.036), `PAL`'s
  the shore (0.060).

## 6. How the palette is put to work (phase 3-2)

- **One snap, written twice:**
  - `scripts/lib/palette.mjs` for the art scripts, `src/render/master.ts` for the game.
  - The nearest colour in OKLab, hue and chroma weighed by `snap.chroma`, no dither, the alpha kept.
  - A test holds the two to the same choice on 2,000 colours.
- **The importer** (`scripts/importSprites.mjs`) snaps every sprite after its quantize and outline: the ground families,
  the vehicles and the `pixel: true` sprites too. The glow layers keep their colours (light, not paint).
- **The procedural and drawn sprites** are snapped as the atlas packs them (`pack()` in `src/render/atlas.ts`), so the
  painter's alpha blends land on the palette as well. `PAL` stays the painter's list of names; where each name lands
  is the swatch's lower half. The glow layers keep their colours.
- **Baked at build time** (phase 3-4): `npm run build` runs `scripts/bakeAtlas.ts`, which paints, snaps and packs
  them exactly as the boot would (`packLayout`, `atlasPixels`) into `public/art/atlas.<hash>.png` + `atlas.json`. The
  game loads that; the dev server always paints at boot. A test holds the baked sheet to the painted one pixel for
  pixel.
- **Where every sprite stands against this bible:** `docs/SPRITE_LIST.md` (phase 3-5; measured by
  `scripts/spriteList.ts`).
- **Not snapped, by intent:** the renderer's own tints (lights, the night, the views, particles), the UI.
- **A new sprite needs nothing extra:** it is snapped on import or at boot. A colour it cannot keep needs a palette
  change (§4).

## 7. Decided, and open

- **Decided:** 77 colours (not the 48–64 RESET_PLAN guessed; fewer flattened the ground and the reds) and the chroma
  weight of 2.
- **Open:** bushes and glimwood are the weakest (ΔE 0.04–0.06). In phase 3's sprite list, two more steps for them, or
  repainting.
