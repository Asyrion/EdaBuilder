---
name: game-dev-board
description: Build a local "dev board" web page for a game project, where the developer browses, creates, edits, validates, duplicates and deletes game content (items, enemies, creatures, levels or floors, artifacts, NPCs, loot tables, quests, shops, anything data-driven) in a browser instead of editing data files by hand. Use when the user asks for a dev webpage, dev board, content editor, admin panel, data dashboard, item/enemy/level editor or "a page like the one in my other project" for a game, in any engine (Godot, Unity, Unreal, Bevy, LÖVE, custom). Also use to add a new content kind or tab to an existing dev board.
---

# Game dev board

A dev board is a small local web app that sits next to a game repository. It reads the game's own data files,
shows every content kind in its own tab, lets the developer edit or create entries through generated forms, writes
the files back exactly the way the engine expects them, and runs the game's own validation after each save. It is a
developer tool: it runs on the developer's machine, serves only `127.0.0.1`, and never ships with the game.

The files on disk stay the source of truth. The board is a view and an editor of them, so edits made by hand, by the
engine's editor or by another session show up on the next poll, and a board edit is an ordinary diff in git.

## 0. Discover before you build

Read the target repository before writing code. Find out and write down (in the board's README or the project docs):

1. **Engine and language**, and how the game is run headless (for validation).
2. **Content kinds**: every folder of data files that describes game content. Typical kinds by genre:
   - roguelike / dungeon crawler: items, weapons, armour, consumables, artifacts or relics, enemies, bosses, floors or
     levels, room templates, loot / drop tables, spawn tables, status effects, events, shops, characters or classes
   - RPG / creature tamer: creatures or species, moves, abilities, traits, items, trainers or NPCs, maps, encounter
     zones, shops, quests, dialogue
   - other: cards, recipes, upgrades, waves, achievements, localisation strings
3. **File format** of each kind (JSON, YAML, TOML, CSV, Godot `.tres`, Unity ScriptableObject `.asset`, Lua tables,
   Rust/RON, a database, or data hard-coded in source).
4. **Schema source**: where the fields and their types are defined (a class with exported fields, a JSON schema, a
   struct, a TypeScript type). Prefer reading the schema from that source over hard-coding it in the board, so a new
   field in the game appears on the board without a board change.
5. **Ids and references**: the id field of each kind, and every field that points at another kind (an enemy's drop
   table, a floor's enemy pool, an item's status effect). These become pickers and "used by" lists.
6. **Art**: where sprites, icons and portraits live and how an entry finds its picture (by id, by a path field).
7. **Validation**: does the game already have a data check (a validate function, a test, a CI step)? The board calls
   it; it does not reimplement it.
8. **Task tracking** (optional): GitHub issues and milestones, a roadmap file, a TODO list.

If content is hard-coded in source, stop and propose moving it to data files first (one file per entry, one folder
per kind). A board over source code is fragile; a board over data files is easy.

Then ask the user only what the repository cannot answer, with buttons where the tool allows it:

- Which kinds come first (offer the discovered list, recommend the ones edited most often).
- Optional extras wanted now (tracker, git status, art upload, balance views; see section 7).
- Port and how they start it (default: a free port, a start script, and an entry in the project instructions).

## 1. Architecture

Keep it boring and dependency-free so it runs on any machine that runs the game's tools:

- **Server**: one Python script on the standard library (`http.server.ThreadingHTTPServer`, `json`, `subprocess`,
  `hashlib`). No framework, no `pip install`. Python is chosen because game tooling usually has it; if the project's
  tooling is Node or something else, use that instead, still without dependencies.
- **Page**: one `index.html` plus a few plain `.js` files served by the same server. No build step, no bundler, no
  framework, no CDN (it must work offline). Vanilla JS with template strings and event delegation is enough.
- **Modules** (one file each, so the server stays readable):
  - `server` — HTTP routing, guards, start-up arguments
  - `content` — the kinds registry, loading, saving, references, undo, validation runner
  - one **format adapter** per file format (read to plain JSON, write back losslessly)
  - `selftest` — the checks from section 8
  - optional extras (tracker, git info, uploads), each its own module the server can live without
- A **start script** for the user's OS (double-click: start the server, open the browser) and a run configuration for
  the editor or agent tooling if the project has one.
- Place it in the game repo under a tools folder, excluded from the game build / export.

## 2. The kinds registry

All content handling is driven by one declarative table, so a new kind is one entry, not new code:

```python
KINDS = {
    # board kind: folder(s) or glob, format, schema source, id field, label field, picture rule
    "items":   {"glob": "data/items/*.json",   "format": "json", "schema": "Item",   "id": "id", "label": "name", "art": "icon"},
    "enemies": {"glob": "data/enemies/*.json", "format": "json", "schema": "Enemy",  "id": "id", "label": "name", "art": "sprite"},
}
```

- Load every file of every kind into `{file, hash, data}`; one broken file is reported, it never hides the others.
- Cache by a **signature** of the data folders (paths, mtimes, sizes) and recompute only when it changes. Include the
  schema sources and art folders in the signature, so a new field or a new sprite shows up.
- **Schema**: parse the field list (name, type, default, enum values, range hints, doc comments) from the schema
  source. Where the source cannot say enough, a small overrides file next to the board adds hints (widget, min/max,
  which kind a string field references, help text). Fall back to inferring types from existing entries only when there
  is no schema source at all.
- **Field type → widget**: string → text; long text → textarea; int / float → number with step; bool → checkbox;
  enum → select; colour → colour input; reference → searchable select of the target kind's ids with their labels and
  icons; list of references → chip list with add / remove / reorder; list of sub-objects (drop table rows, wave
  entries, stat blocks) → an inline table with add / remove / reorder; nested object → fieldset; file path → picker
  of existing files plus preview; weighted tables (`[["goblin", 2], ["rat", 1]]`) → one `goblin 2` row a line; tile
  grids (lists of strings) → a monospace textarea, a row a line. Anything else gets a JSON field for that value, and the
  whole entry always has a JSON view as the escape hatch.
- Reading a form back must give exactly the original value when nothing was touched: keep key order, keep the order
  of ticked list values (new ones after), keep `null` vs absent vs `""`, and drop empty objects the form invented.

## 3. Lossless writing (the most important rule)

A save must change only what the user changed. Reviewers read board edits as git diffs; a save that reorders keys,
reformats numbers or drops unknown fields is a bug.

- Keep key order, indentation, quoting style, newline style (`\n` vs `\r\n`), trailing newline and encoding.
- Keep every property the board does not know (fields from a newer schema, editor metadata, comments where the format
  has them).
- Keep number formatting: an unchanged `1.0` stays `1.0`, not `1`.
- Values the board cannot represent travel as an opaque `{"$raw": "<original text>"}` and are written back verbatim.
- Engine-specific formats (Godot `.tres` sections and sub-resource ids, Unity YAML anchors and GUIDs) need a real
  parser and writer that preserves ids; never regenerate ids that already exist.
- New files are created from a template that matches what the engine itself writes (header, ids, defaults), so opening
  and saving them in the engine produces no diff.
- Write atomically: temp file in the same folder, then replace.

The self-test proves this: every existing file read and written back unchanged must be byte-identical.

## 4. Safety and concurrency

The board writes into a repository, so guard it like a real service:

- Bind to `127.0.0.1` only. Reject requests whose `Host` header is not `127.0.0.1` / `localhost` (DNS rebinding).
- Write requests require `Content-Type: application/json` and a custom header (e.g. `X-Dev-Board: 1`); a foreign web
  page cannot send both without a CORS preflight, which the server never answers.
- Every path from the client is resolved and checked to lie inside the allowed folder; refuse traversal and symlinks
  out. Ids match a strict pattern (e.g. `^[a-z][a-z0-9_]*$`), and the file name derives from the id.
- **Optimistic concurrency**: the page sends the hash of what it loaded (of the entry, when one file holds many entries,
  so edits to other entries of the same file don't block it); the server refuses the save with `409`
  when the file on disk changed meanwhile ("changed by someone else, reload"). Never silently overwrite.
- **Undo**: before every write or delete, keep the old text in a backup folder outside the repository; offer "undo"
  for recent saves, refused if the file changed after that save.
- **Diff preview**: an endpoint returns the unified diff a save would write; the editor shows it before saving.
- **Delete** is refused while any other entry still references the id; the error lists the referrers.
- **Rename** of an id is a separate action that updates every reference in one go (with a preview), or is refused.
- Errors reach the page as JSON with a readable message (400 bad input, 409 conflict, 502 external tool failed,
  500 with the exception text); a failed request never kills the server.
- Files that must never leave the machine (licensed or borrowed art, secrets) are never served beyond localhost,
  never uploaded, never copied into the repository by the board.

## 5. Validation

- After every save, run the game's own validation headless (engine CLI with a tiny script that calls the validator and
  prints one machine-readable line such as `VALIDATE_JSON {...}`). Parse that line, ignore the engine's other output,
  enforce a timeout, and report a validator crash as a validation result, not as a failed save.
- Validate in the background on load too (debounced), and show the result as a status chip: OK / n errors /
  n warnings / running / validator unavailable.
- Map each message to its entry where possible and mark the entry in its list.
- Board-side checks cover what needs no engine: required fields, duplicate ids, dangling references, numbers outside
  their hinted range, missing art. If the game has no validator, propose adding one to the game (the board then calls
  it), rather than growing a second rule set in the board.

## 6. The page

- **Header**: project name, validation chip, last refresh time, search box, "New" button for the current kind.
- **Tabs**: one per kind with entry counts, plus an overview tab. Remember the open tab and filters in
  `localStorage`.
- **Lists**: cards or table rows with picture, id, label and the 3–5 fields that matter most for that kind (an
  enemy's HP / damage / floor range; an item's rarity / slot / price). Search across all fields; filters for enums
  (rarity, type, floor); sort by any column.
- **Editor**: a modal or side panel with the generated form, grouped like the schema, with help text from the schema
  comments. Buttons: Save (with diff preview), Duplicate (new id, same data), Delete (with reference check), Cancel.
  Unsaved changes are kept in a draft and survive the 10-second poll; the poll never overwrites a form being edited.
- **Cross references**: every entry shows "used by" (which floors spawn this enemy, which loot tables drop this item)
  with links that open those entries.
- **Pictures**: show sprites with `image-rendering: pixelated` at integer zoom for pixel art; show a placeholder and a
  "missing art" badge when there is none. Animated sheets can play in a small canvas player.
- **Live updates**: poll a cheap state endpoint every ~10 s; re-render only when the content signature changed.
- **Toasts** for save / undo / errors; keyboard: `/` focuses search, `Esc` closes, `Ctrl+S` saves.
- Light and dark theme from CSS variables, readable at laptop widths, no horizontal scroll.

## 7. Optional extras (offer, don't assume)

Each one is its own module, can be switched off, and the board works without it.

- **Balance views** per kind: sortable stat tables, curves across levels or floors (enemy HP per floor, gold per
  floor, drop chance per rarity), totals that make outliers obvious. Read-only views of the same data.
- **Tracker**: milestones and issues from GitHub through the logged-in `gh` CLI (`gh api ...`), with add / edit /
  comment / close; a roadmap table read from and written to a markdown file. Cache GitHub data for ~10 s; on a
  GitHub error keep showing the last good data marked stale.
- **Git status**: branch, ahead / behind, dirty files, other worktrees, recent commits.
- **Art pipeline**: upload a reference image for an entry into the project's source-art folder, art-completeness
  checklists per entry (icon, sprite, animations present?), a queue of entries without art.
- **Hand-off to an agent session**: a button that writes a task description for an entry (e.g. "make the sprite for
  this new enemy") to a file and opens a coding-agent session on the repository with it.
- **Playtest hooks**: if the game has a debug menu or command-line flags, a button that launches the game straight
  into the entry (spawn this enemy, start on this floor, give this item).

## 8. Self-test

A script with no network, no engine and no writes to the repository, run by the project's check / CI step:

1. Every data file of every kind round-trips byte for byte through its format adapter.
2. An edit and a create on a temporary copy of the data write exactly what the form sent, and the result loads again.
3. Delete is refused for a referenced id; undo restores the previous bytes.
4. In a headless browser: open every entry's editor, read the form back without touching it, and compare with the
   data. Any difference is a widget bug that would corrupt that entry on its next save.
5. The HTTP guards hold: a foreign `Host` is refused, a write without the custom header or JSON type is refused, a
   path with `..` is refused, a stale hash gets `409`.
6. It prints one final line (`DEV BOARD SELFTEST OK` / `FAIL: ...`) and exits non-zero on failure.

## 9. Running it

- Default port fixed per project (e.g. 8765) and overridable with `--port`; `--root` points at the checkout;
  `--open` opens the browser.
- **One instance serves every session and worktree.** Before starting, check whether it already answers
  (`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/` → 200 means running; leave it alone). Never start
  a second instance on another port.
- When several git worktrees exist, read and write the main checkout (first entry of `git worktree list`) so every
  session sees the same files, unless `--root` says otherwise.
- Add a short section to the project's agent instructions (CLAUDE.md or equivalent): where the board lives, how to
  start it, that the session checks it is running at start, and that new content kinds are added through the
  registry.

## 10. How to deliver it

Build in small, testable steps and show each one running:

1. **Read-only board**: registry, loaders, tabs, lists, pictures, search. Verify every existing entry loads.
2. **Edit**: generated forms, lossless save, hash conflict check, diff preview, validation after save.
3. **Create / duplicate / delete / undo** with reference checks.
4. **Cross references and balance views.**
5. **Extras** the user chose.

For each step: run the self-test, start the server, exercise the API with `curl` (load, save, conflict, refused
write), and look at the page in a headless browser (Playwright screenshot of each tab and the editor) before calling
it done. Report measured results (files loaded, round-trip failures, validator output), not impressions.

Follow the project's own rules on top of this skill: its commit and issue conventions, its check script, its rules on
what may be committed, and any "every feature needs a debug option" style requirement (the board's playtest hooks can
satisfy it).

## Checklist

- [ ] Discovery notes written: kinds, formats, schema source, ids, references, art, validator, tracker
- [ ] Standard-library server, no build step, no CDN, binds 127.0.0.1, Host check, custom write header
- [ ] Kinds registry drives everything; adding a kind needs no new code
- [ ] Schema read from the game's own definitions, overrides file only for hints
- [ ] Every existing file round-trips byte for byte; unknown fields and raw values preserved
- [ ] An untouched form reads back as exactly the entry's data, for every entry
- [ ] Hash conflict (409), diff preview, undo backups outside the repo, delete refused while referenced
- [ ] Game's own validator runs headless after saves; results mapped to entries
- [ ] Drafts survive polling; "used by" links; pixel-art pictures at integer zoom
- [ ] Self-test wired into the project's check; one running instance; start script; agent instructions updated
