# EdaBuilder dev board

A local web page for EdaBuilder's content (iteration 87, DESIGN §4.118), built from the `game-dev-board` skill
(`.claude/skills/game-dev-board/SKILL.md`). Its code was ported from Ossuary's board.

```
npm run devboard              # http://127.0.0.1:8771
npm run devboard -- --open    # and open the browser
npm run devboard:selftest     # the board's own checks
```

One instance serves every session and worktree: if `http://127.0.0.1:8771/` answers, it is running; don't start a
second one on another port.

## What it does

- **Tabs:** Buildings, Roads, Milestones and Relic sets (`src/data/content/*.json`) are editable. Edicts, Events, Quests
  and Guilds (`src/data/content/text/*.json`, iteration 89) are **text only**: their wording is edited here, but each
  one's logic is in code by id, so a new one, a delete or a rename is refused (Send to Claude). Art sources
  (`art/sources.json`) are edited by position, since a sprite's switched-off entries keep its name.
- **Building cards:**
  - the looks the game would show: the zone houses by level and variant, others `b_<key>` and its `_vN` variants. The
    imported ones (`public/art/sprites.json`) and the ones the painter draws in code (`art.ts` renders them to the temp
    folder) are shown pixelated;
  - **art status:** `needs art` (no `b_<key>` drawn in code, which `tests/sprites.test.ts` requires), `N imported` or
    `drawn in code`, the `art/sources.json` entries, the unchecked ones, and paintings missing from `inspirations/`.
- **Forms** are built from the values; choices come from the string unions in `src/` and `hints.json`.
- **Saves change only what you changed** (`jsonspan.ts`): a one-number edit is a one-line diff. "Preview change" shows
  the diff. A stale edit is refused, and every write can be undone from the header.
- **Checks after every save** (`validate.ts`): `validateContent` (`src/sim/contentCheck.ts`) and the sprite rule. The
  header chip and the cards show what they report.
- **Used by:** where a key appears in the content and in `src/`. Delete and rename are refused while anything uses it.
  The code scan matches the key as any quoted string, so a short common key can be refused by an unrelated match; that
  errs on the side of keeping data the code needs.

- **Project tabs** (DESIGN §4.119): **Next steps** (`docs/NEXT_STEPS.md`'s open list and the reset's phases done from
  `docs/RESET_LOG.md`; a "DESIGN §N" chip opens that section of `docs/DESIGN.md`), **GitHub** (milestones and issues through the logged-in `gh api`: add, edit, comment,
  close, new and closed milestones; cached 12 s, stale data kept offline) and **Balance** (`balance/cache` as a chart of
  mean folk ±2·SE per people, and a table per seed; the file of the working tree's sim key is marked "this tree").
- **Send to Claude** on every next-steps item, issue, card and editor, and from **New element** (the composer): the task
  (editable) goes to **Claude Code on this PC** (the `claude-cli://` link when the CLI's handler is registered, else a new
  console running `claude "<task>"`; a long task goes to a file in the temp folder and the prompt points at it), to a
  **GitHub issue** labelled `dev-board`, or to the clipboard. A send makes no commits. Without the CLI, the page copies
  the task and says how to install it.

Don't edit content on the board while a balance bar runs from the same checkout: each run reads the files when it
starts, so an edit mid-bar leaks into the runs (DESIGN §4.118).

A new building made on the board is data. A sprite (drawn in code or imported from a painting) and any new rule still
need work outside the board; the card shows "needs art" until it has a sprite.

## Adding a kind

One entry in `kinds.ts` (its file, where the collection sits, list or map, id and label fields, the card's fields), field
hints in `hints.json`, and its checks in `src/sim/contentCheck.ts`. No page code.

## Files

| File | What |
|---|---|
| `server.ts` | HTTP on 127.0.0.1, guards, routes, the fresh-process runners for the checks and the art status, sprites |
| `content.ts` | load, save, create, delete, undo, references |
| `jsonspan.ts` | position-keeping JSON parser and the patcher that rewrites only changed spans |
| `kinds.ts`, `hints.json`, `schema.ts` | what is shown and how its fields are edited |
| `art.ts` | each building's looks and art status; the sprites drawn in code as PNG |
| `validate.ts` | `validateContent` and the sprite rule, one `VALIDATE_JSON` line |
| `tracker.ts` | NEXT_STEPS, RESET_LOG's phases, the DESIGN index and sections, the balance cache (read-only) |
| `github.ts` | milestones, issues, labels and their writes through `gh api` |
| `session.ts` | Send to Claude: the `claude-cli://` link, a console, or a GitHub issue |
| `selftest.ts` | edits every entry on a temp copy and restores it byte for byte; refusals; HTTP guards |
| `textCheck.ts` | the text kinds: every text the code reads is there, and every text is read |
| `prompts.ts` | the prompt studio: house rules, yardstick, draft, lore, Refine with Claude (`claude -p` jobs) |
| `pipelines.ts`, `pipelines.json` | the pipelines registry; the paintings importer's upload, islands and runs; the Aseprite steps' runs (one at a time with the import); hand-off tasks |
| `tripo.ts` | Tripo Studio Route 2: whoami, a round of four through the CLI (polled by task id), the rounds kept |
| `public/` | the page (plain HTML, CSS and JS, no build step; `project.js` the project tabs, the send dialog and the composer; `art.js` the Art panel and the Art & pipelines tab) |

## The art side (iteration 89, DESIGN 4.120)

- **Art panel** (the Art button on a building card; any other sprite from the Art & pipelines tab):
  - a brief;
  - a draft from the house rules (`prompts.ts`: one subject on white, the isometric 2:1 view, the front on the right
    face, the footprint and the citizen yardstick, the eda-lore look);
  - **Refine with Claude:** `claude -p` in the background, with the building, its people and the lore that names it;
    without the CLI the task opens in Send to Claude;
  - saved as `art/prompts/<sprite>.json`, undoable.
- **Pipelines** (`pipelines.json`, `pipelines.ts`):
  - **The paintings importer runs here:**
    1. drop a PNG (into eda-lore's `inspirations/<folder>/`, `EDA_LORE` or `../eda-lore`, never over another) or choose one;
    2. click its island on the sheet;
    3. fill its `art/sources.json` entry;
    4. run the import (`importSprites.mjs --check`, one at a time, about 90 s, its log on the page);
    5. judge the sprite beside the code one and mark it checked; Send to Claude hands over the tests and the commit.
  - **Tripo Studio** (iteration 91, `tripo.ts`, `docs/ART_PIPELINES.md`):
    - Route 1: you generate in Studio and drop the pick (saved as eda-lore's `inspirations/tripo/<sprite>.png`);
    - Route 2: the login state (`tripo auth whoami`; you log in once in your own terminal), then "Generate 4" (`tripo
      image`, Nano Banana 2, polled by task id past the CLI's bug), with the round in `art/tripo/` (ignored by git);
    - the round shows as a contact sheet, each image measured;
    - "Use this one" makes the pick a PNG, and the importer's steps follow.

    `TRIPO` overrides the CLI and `DEVBOARD_TRIPO_POLL_MS` the poll.
  - **Aseprite** (`scripts/aseprite.ts`):
    - trace (`--force` to trace over an `.aseprite`), export, and the 8× previews beside the game's sprite;
    - install after the review tick: the entry becomes `pixel: true`, the old one is switched off, and the importer runs.

    `ASEPRITE` names the program. All of it runs one step at a time, together with the importer.
  - Every pipeline keeps its hand-off task: "Send it to Claude instead".
- **Checks:** every text the code reads is in the JSON and every text is read (`textCheck.ts`); each prompt names a
  sprite or building; no two live art sources share a name.

Don't run the balance bar while an import runs or the content is edited from the same checkout.

## Next

`ROADMAP.md` holds the board's roadmap (parts 1 to 3 built, then 14 brainstormed ideas in three phases), and
`NEXT_STEPS.md` the proposed order.
