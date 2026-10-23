# Art pipelines

How a sprite gets into Wardlight. There are three pipelines, and all of them end in the same place: an entry in
`art/sources.json`, then `npm run art`, then the sprite judged by eye in the game.

- **The paintings importer:** a painting becomes a sprite.
- **Tripo Studio:** a painting made from the sprite's prompt, by you (Route 1) or by Claude through the Tripo CLI
  (Route 2), then brought in through the importer.
- **Aseprite:** a sprite redrawn as clean, editable pixel art.

The dev board runs all three from a building's **Art** panel, or from any sprite opened by name on the Art & pipelines
tab (`tools/devboard/pipelines.json`). Each one can also go to a Claude session through Send to Claude.

The Tripo and Aseprite steps come from the user's Azyrion Tamer project, where they are proven: docs 06 §0 and §2b, and
docs 04 §2 and §11 there. The decisions are in `docs/archive/DESIGN.md` §4.80–§4.87 and §4.122 (a `§4.NN` below points there too).

## The house rules every sprite keeps

- **The citizen is the yardstick** (DESIGN §4.109). A citizen is 12 px. The caps, in citizens:

  | What | Cap | Example |
  |---|---|---|
  | wells | 1.5 | |
  | posts and small shrines | 2.5 | |
  | one-tile sheds and cottages | 2.8 | Tallowkin 3.2 |
  | two-storey houses | 4 | |
  | halls | 5.5 | |
  | towers and wonders | free | |

- **The front is on the right face** (§4.90). A painting fronted on its left gets `flip: true`.
- **The importer sharpens and outlines a painting,** so the set reads as one. A sprite drawn at its game size
  (`pixel: true`) is taken as drawn.
- **Every sprite is then snapped to the master palette** (`art/palette.json`, `docs/ART_BIBLE.md` §6; phase 3-2), the
  pixel sprites too. The glow layers are not. A colour a painting needs and the palette lacks is a palette change,
  never a skipped snap.
- **The sprites drawn in code** (`src/render/sprites.ts`, `handdrawn.ts`) are baked into `public/art/atlas.<hash>.png`
  by `npm run build` (`scripts/bakeAtlas.ts`, `npm run bake` alone; phase 3-4). The files are build output, not
  committed. `npm run dev` paints them at boot, so an edit shows at once.
- **Paintings live in eda-lore's `inspirations/<folder>/` and are committed there** (since the scope reset, 1d-2): a
  sibling checkout, `EDA_LORE` or `../eda-lore` (`scripts/lib/lore.mjs`); `npm run art` stops with a message without
  it, the build and the tests do not need it. An entry's `src` is the path inside eda-lore. Only images that are used go in. Rounds, contact
  sheets and previews are never committed.
- **Every sprite is shown to the user in the game before its commit,** old beside new, by day and night
  (CLAUDE.md rule 7).

## 1. The paintings importer

`scripts/importSprites.mjs`; its header lists every key.

1. Copy the painting into eda-lore's `inspirations/<folder>/` (and commit it there). On the board, drop it on the Art panel.
2. Pick its item on the sheet: `node scripts/importSprites.mjs --islands <src> [white]` lists the islands, and the board
   draws them over the painting. A `white` of about 200 keys out a light-grey shadow or grid paper.
3. Add its entry to `art/sources.json`:
   - `name` (the sprite it replaces), `src`, `island`;
   - `w`/`h` (the footprint in tiles);
   - `targetHeight` from the yardstick;
   - `anchor: 'centre'`;
   - `flip` if it is fronted on the left;
   - `shift: { x: 0, y: 6 }` for a small object that should stand in the middle of its tile.
4. Run `npm run art -- --check`. It writes `public/art/sprites`, the packed sheet in `public/art/sheets`,
   `sprites.json`, and the check sheet `shots/import_check.png`. Commit the sprites, the sheet and the manifest.
5. Judge it by eye beside the code sprite and a citizen, then set `checked: true`.

Tests to keep green: `tests/iteration56` (the flip list and height caps), `iteration77` (anchors), `iteration78` (the
yardstick), `iteration84` (no painting twice), `sprites.test`.

## 2. Tripo Studio

Both routes start from the sprite's prompt and end in the importer. **Claude asks which route to use first.**

| | Route 1: you generate | Route 2: Claude generates |
|---|---|---|
| Who runs the generator | You, in Tripo Studio (Image tab, Nano Banana 2) | Claude, through the Tripo CLI on your Studio credits |
| The prompt | The Art panel's prompt (draft, then Refine with Claude) | The same |
| A round | 4 images, 1:1 | 4 images, 1:1, about 8 Studio credits |
| The pick | You choose and drop it on the Art panel | Claude shows a numbered contact sheet with each image measured and recommends one; you choose |
| Login | (in Studio) | Once, in your own terminal: `tripo auth login` (email and code; about 2 h; Claude never sees the code) |

**The prompt rules** (both routes; the board's draft in `tools/devboard/prompts.ts` follows them):
- Under 1000 characters: Tripo's Image tab caps it, and the board counts.
- Positive phrasing. A negation names what it forbids and invites it ("no text" brings text).
- The exclusions go in Tripo's negative-prompt field (Route 1; the CLI has no flag for it): `text, letters, watermark,
  border, frame, grid lines, gradient, drop shadow, blur, photo, several buildings`.
- One subject, whole, on plain flat white. The importer keys white out. Not Tamer's magenta: that game's slicer keys
  magenta, this importer keys white.
- The isometric 2:1 view, the front on the right face, the footprint and the height in citizens.
- The look of the eda-lore sheets: crisp pixels, a dark outline, muted earthy colours, warm lantern light, blue
  ley-light accents. For a building of one people, that people's materials.
- 1:1, four images a run: one in four usually misses.

**Route 1, step by step:**
1. Copy the prompt from the Art panel into Tripo Studio's Image tab (Nano Banana 2, 1:1), and the exclusions into the
   negative-prompt field.
2. Generate 4 and keep the best one. Another run with the prompt adjusted where it missed beats fixing a bad one.
3. Drop it on the Art panel (Tripo Studio selected). It is saved as eda-lore's `inspirations/tripo/<sprite>.png`.
4. Then the importer, steps 2–5.

**Route 2, step by step:**
1. Once: `npm install -g @tripo3d/cli` (v0.8.1; npm marks it deprecated, it still works), then `tripo auth login` in
   your own terminal. The Art panel shows `tripo auth whoami`. The Tripo API (platform.tripo3d.ai) is billed separately
   from the subscription and is not used.
2. "Generate 4 with Tripo" runs:

   ```
   tripo image "<prompt>" -m gemini_3.1_flash_image_preview -n 4 --scale 1:1
   ```

   The board starts the CLI without a shell (on Windows it runs the package's own entry with Node), so the prompt is
   never read by one.
3. **CLI 0.8.1's bug:** it can end with "no image URLs in result", or return while the task still runs. So the board
   takes the task id from its "Task created" line and polls:

   ```
   tripo image get <id> --output-format json
   ```

   It polls until `status` is success, then downloads the four `urls` (signed links, valid a few hours) into
   `art/tripo/<sprite>/round<n>/A_r<n>_<i>.<ext>`. That folder is ignored by git.
4. The round shows as a contact sheet. Each image is measured: how much of it is white, whether its corners are flat
   white (what the importer keys out), and its size. Claude recommends one: the flat white, one subject whole, the front
   on the right, the design the brief asked for. You choose.
5. Not right yet? Another round with the prompt rewritten where this one missed.
6. "Use this one" turns the pick into a PNG (Tripo may send WebP or JPEG; the importer reads PNG) and saves it as
   eda-lore's `inspirations/tripo/<sprite>.png`.
7. Then the importer, steps 2–5. Only the image used is committed; the rounds stay in `art/tripo/` and in your Tripo
   account.

**Not covered here:** Tripo's image-to-3D. The game is 2D, and its 3D-bake route is not built.

## 3. Aseprite

A redraw turns a sprite into clean, editable pixel art. It is the standard step after a generator image that came in
soft, or for a sprite that needs hand work. Aseprite 1.3.18 runs headless on your PC: `ASEPRITE`, else the Steam install
(`C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe`), else `aseprite` on the PATH.

1. **Trace:** `npx tsx scripts/aseprite.ts <sprite> trace [--colors 24] [--from <png>]`.
   - It takes the sprite as the game has it: imported, else drawn in code.
   - It writes `art/aseprite/<sprite>.aseprite`:
     - indexed, with index 0 transparent;
     - the colours cut to a palette by median cut in Lab;
     - the darkest colour is the ink, and a darkened copy of it is added when the sprite has no outline;
     - the silhouette's edge is drawn in ink;
     - a speck with no neighbour goes, and a stray pixel unlike its four agreeing neighbours takes theirs.
   - Beside it go `<sprite>.trace.png` and an 8× preview.
   - **From then on the `.aseprite` is the source of truth.** It is never traced over without `--force`.
2. **Edit:** open the `.aseprite` in Aseprite and redraw what needs it.
3. **Export:** `npx tsx scripts/aseprite.ts <sprite> export` writes `art/aseprite/export/<sprite>.png` and its 8× preview.
4. **Review:** the 8× preview beside the sprite the game has now, and the `.aseprite`, are shown to you. Nothing is
   installed before you have seen them (Tamer's rule). On the board, Install waits for a tick.
5. **Install:** `npx tsx scripts/aseprite.ts <sprite> install`.
   - Its `art/sources.json` entry points at the export with `pixel: true`: taken as drawn (cropped and anchored, never
     keyed, scaled, sharpened, quantized or outlined).
   - The entry keeps the old entry's kind, footprint, anchor and shift; the old entry is switched off (`off: true`) and
     kept for the record.
   - Then `npm run art` runs.
6. **Commit:** the `.aseprite` and the export, with the sprites, the sheet and the manifest. The trace files and previews
   are ignored by git.

The board runs each step in the background, one at a time with the importer (both write the art the game loads), and
shows its log.

## On the dev board

| Pipeline | What runs on the board | Its files |
|---|---|---|
| Paintings importer | drop, islands, entry, import, checked | `tools/devboard/pipelines.ts` |
| Tripo Studio | the login, Generate 4, the round's contact sheet with its measures, Use this one; then the importer | `tools/devboard/tripo.ts` |
| Aseprite | Trace (with `--force`), Export, the previews, Install after the review tick | `scripts/aseprite.ts`, `scripts/aseprite/build_sprite.lua` |

**Tested here, not on your PC:** the self-test (`npm run devboard:selftest`) runs the
Tripo and Aseprite steps against fakes that answer as the real tools do (the CLI's task line, its bug, the poll, the
downloads; the Lua build and the export). The real Tripo CLI with your login and real Aseprite run on your PC; the
commands are Tamer's proven ones.
