# The sprite list (scope reset phase 3-5)

Every sprite the game has, measured against `docs/ART_BIBLE.md` and judged by eye, with a status:
- **ok:** it meets the bible.
- **rework:** it exists, and the reason says what to fix.
- **new:** a painting is wanted where there is none, or a known problem.
- **replaced:** drawn in code, but a painting of the same name covers it, so the game never shows it.

This list decides what the art production of phase 3 makes. **The user decides the order.**

- **The measured table:** `docs/SPRITE_LIST.generated.md`, made by `npx tsx scripts/spriteList.ts`. It has one row per
  family (the numbered variants of one thing), with the size, the share of the outline in ink (§3), right against left
  lightness (§2), the colours, the drawn height, and the reasons.
- **The sheets:** `shots/spritelist_<area>.png`, every sprite at 3×, framed by its family's status (green ok, yellow
  rework, red new, grey replaced).

## The count (2026-10-23, main after phase 3-4)

| Area | ok | rework | new | replaced |
|---|---|---|---|---|
| Zones (48 houses, 4 lot marks) | 28 | 24 | 0 | 48 |
| Services and supply | 42 | 55 | 10 | 5 |
| Roads | 0 | 48 | 0 | 0 |
| Terrain | 48 | 0 | 8 | 15 |
| Trees and plants | 211 | 120 | 0 | 11 |
| Citizens, builders, carts, the restless | 95 | 8 | 0 | 0 |
| Interface (icons, cursors, flames) | 13 | 5 | 0 | 0 |
| **All 794** (797 less three aliases) | **437** | **260** | **18** | **79** |

Large numbers are large families: 108 bushes, 37 wells, 48 road tiles. The production list below counts the things to
make.

## What the art production has to make

### New: a painting wanted (eight buildings, two terrains, one missing sprite)
1. **Water and deep water:** four frames each, still drawn in code (RESET_PLAN: "procedural → new").
2. **Buildings still drawn in code:**
   - Watch House (2×2), Brigade Hall (`veshari`, 2×2), Temple (3×3, three stages), Ward Lantern (1×1), Garden
     (1×1), Market Square (2×2), Thrum Font (2×2), Mine (2×2).
   - The Temple is drawn by hand in code (`handdrawn.ts`, iteration 65) and reads well; it is on the list because
     RESET_PLAN names it. The Lantern of Vell has both a hand-drawn sprite and a painting (`b_lantern_v0`), passes every
     check, and stays.
3. **Bridges:** there is no bridge sprite; a road over water is a plank-coloured diamond under the road tile (RESET_PLAN
   names bridges with the roads).

### Rework
4. **Roads:** three kinds × 16 joints, drawn in code with two or three colours (RESET_PLAN: "to rework").
5. **Ruins** (`ruin`, `ruin2`, `ruin3`, 1×1 to 3×3): three colours, the outline on 58–67 % of the edge.
6. **Bushes (108) and glimwood (10):** the paintings the palette holds worst (3-1: ΔE 0.04–0.06). Either two more
   palette steps for their light greens and pinks, or repainted.
7. **Gloam trees (2):** four or five colours, flat.
8. **Citizen looks 4 and 5:** the Grimmen and Tallowkin looks. A Vellish game still rolls them (`agents.ts`,
   `rng.int(6)`): strike them from the roll, not repaint them (a code change, the known issue).
9. **Two icons** (`icon_noroad` 66 %, `icon_unhappy` 57 % of the edge in ink): close their outline.
10. **"Probably lit from the left"** (§2):
    - The families: one of four houses in each of six zone families (hearth L1 and L2, market L1, craft L3, arcane
      L2 and L3); 20 of 38 wells; one shrine of 12, one watch post of three, one academy of two.
    - The number is right/left lightness under 0.8, and it is only a pointer.
      - **What the eye confirmed:** a roof slope across the anchor or the material (white plaster left, brown timber
        right) fools it. It flagged the procedural boxes, plainly lit from the right, at 0.97, so the threshold went
        down to 0.8.
      - Under 0.8 the eye agreed for the clearest: the mossy tower (craft L3) and the thatched cottage (hearth L1).
    - A painting lit from the left is a mirror (`flip` in `art/sources.json`) when its front allows it, or a repaint.

### Judged by eye, not by the number
- **Fine as they are:**
  - the zones' four lot marks and the cursors: translucent tile marks, flat on purpose;
  - the flames and the restless: effects, light rather than paint, no outline;
  - the white tile: a mask.
- **Fallbacks:** the three carts drawn in code (`cart_0..2`) are shown only when no painted cart exists. The 62 painted
  cart images (goods and stone, with their left-facing twins) cover them, so they are fallbacks, not art to make.

## Replaced, and what to do with them
**The 79 replaced sprites** (all 48 zone houses drawn in code, 15 ground tiles, 11 trees, 5 buildings) are packed into
the baked atlas for nothing. They take **41 % of its area** (180,740 of 436,117 pixels). Dropping them from the bake
when a painting of the name exists would shrink the atlas by that much. It is small work for the pipeline, not for the
artist, and waits for the user's word with the rest of the list.

## Not sprites
RESET_PLAN's list also names the tool icons and the views' legends. In the game they are HTML (`ui.ts`, `overlays.ts`),
not sprites, so they belong to phase 5 (UX).
