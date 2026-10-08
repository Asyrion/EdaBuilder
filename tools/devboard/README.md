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
  and Guilds are read-only, scanned from their TypeScript, until part 3 moves their text to JSON.
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

- **Project tabs** (DESIGN §4.119): **Next steps** (`docs/NEXT_STEPS.md`'s open list and the iterations done; a `§4.NN`
  chip opens that DESIGN section), **GitHub** (milestones and issues through the logged-in `gh api`: add, edit, comment,
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
| `tracker.ts` | NEXT_STEPS, the DESIGN index and sections, the balance cache (read-only) |
| `github.ts` | milestones, issues, labels and their writes through `gh api` |
| `session.ts` | Send to Claude: the `claude-cli://` link, a console, or a GitHub issue |
| `selftest.ts` | edits every entry on a temp copy and restores it byte for byte; refusals; HTTP guards |
| `public/` | the page (plain HTML, CSS and JS, no build step; `project.js` the project tabs, the send dialog and the composer) |

## Next (NEXT_STEPS item 1)

`ROADMAP.md` holds the board's roadmap (part 3, then 14 brainstormed ideas in three phases), and `NEXT_STEPS.md` the
proposed order.

- **Part 3:**
  - asset prompts: a brief, a draft from the house art rules, "Refine with Claude" (`claude -p`), kept in `art/prompts/`;
  - a pipeline registry: the paintings importer runs from the board. The Tripo Studio and Aseprite pipelines start as
    hand-offs to Claude and become buttons once they are written into the docs (the user's plan).
