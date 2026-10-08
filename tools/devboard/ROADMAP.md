# Dev board roadmap (EdaBuilder)

Written 2026-10-08. Part 1 is built (iteration 87, DESIGN §4.118): the content as data, and the board's content tabs,
sprites, art status and safe editing. Part 2 is built (iteration 88, DESIGN §4.119), and part 3 (iteration 89, DESIGN §4.120).
The phases below are what may come next.
Phases C to E are a brainstorm: nothing there is decided, and each idea becomes an iteration only when the user puts
it on the list. Every iteration follows the standing process in CLAUDE.md: a plan first, the verification bar, docs,
ship. `NEXT_STEPS.md` holds the proposed order.

Size: S (part of an iteration), M (one iteration), L (more than one).

## Part 2 · The tracker and Send to Claude (built, iteration 88)
- **NEXT_STEPS tab:** the ordered list and the iterations done, each linked to its DESIGN `§4.NN` section, shown in a
  side panel.
- **GitHub tab:** milestones and issues on Asyrion/EdaBuilder through `gh` (list, add, edit, comment, close).
- **Balance tab:** `balance/cache` as tables and charts per people and seed: folk, gates, verdicts.
- **Send to Claude:** a "new game element" composer and a button on every card. The task goes to Claude Code on the
  user's PC (the `claude-cli://` link or a new terminal) or becomes a GitHub issue.

## Part 3 · Asset prompts and pipelines (built, iteration 89)
- **Prompt studio:** a brief, a draft from the house art rules, "Refine with Claude" (`claude -p` on the user's PC), and
  the prompts kept in `art/prompts/`.
- **Pipeline registry:**
  - the paintings importer runs from the board: drop a painting on a card, it gets its `art/sources.json` entry, then
    `npm run art` and the check sheet;
  - Tripo Studio and Aseprite start as hand-offs to Claude, and become buttons once the user writes those pipelines into
    the docs.
- **Text to JSON:** the text of edicts, events, quests and guilds moves to JSON, with the logic kept in code by id.

## Phase C · See the city before you play it
1. **Footprint and yardstick check on every card (S).** Each sprite drawn over its footprint diamond with a citizen
   beside it, the yardstick of §4.109 and the facing rule of §4.90. A building too tall, too small or fronted on the
   wrong side gets a mark. This is today's `playtest78`/`81` sheets, live on the board.
2. **Islands picker for a new sheet (M).** Drop a sheet of paintings. The board runs `--islands`, shows each island
   numbered on the sheet, and lets the user click one to make an `art/sources.json` entry (footprint, `targetHeight`
   from the yardstick, anchor, flip). The check sheet follows before anything is marked `checked`.
   *Part 3 built one island at a time on a sprite's Art panel; what remains is a whole sheet into many named entries.*
3. **Coverage preview (M).** A building placed on a sample map in the headless sim, with its radii drawn: service
   coverage, light from spires, water from wells, miasma, land value. A new building's numbers are seen as areas, not
   just figures.
4. **Map and seed preview (M).** Terrain generation for a seed and a scenario (valley, marsh, the atoll to come) drawn
   small: water, hills, marsh, ruins, ley nodes, the founding stake. "Reroll" tries the next seed.

## Phase D · The sim's numbers in sight
5. **Unlock tree (S).** The milestones as a timeline per people, with what each one opens after the people's swap
   tables (the Seep for the Well, each people's own wonder in the `lantern_wonder` slot). A building no milestone ever
   opens, or one opened twice, stands out.
6. **Bar runs on the board (M).** A quick table or the wide bar started from a button and followed live. While it runs,
   the board refuses content edits, which is the lesson of iteration 87. The finished table goes straight into the
   iteration's DESIGN section draft.
7. **Gate timeline (S).** For each people, the median day each gate is reached, from the bar's cache over the last
   iterations. A change that slows a people shows as a shifted line, beside the verdict.
8. **Quest reachability report (M).** Bot games of every people on several maps, listing each quest's completion rate
   and median day. It directly serves the open item "The quests that never complete".
9. **Save inspector (M).** A save or replay file (`.wardlight-replay.json`) opened read-only: treasury, folk, districts,
   relics, the Annals counters. "Load in game" opens it in the preview build.

## Phase E · The world and its words
10. **Lore glossary and check (S).** The names in `docs/EDA_LORE.md`, `EDA_CITY_LORE.md` and the eda-lore folders as
    a glossary, checked against every name and text in the content: unknown proper nouns, spelling drift ("Belregi" or
    "Belregian"), canon against Wardlight's proposals.
11. **Help and Ledger preview (S).** An entry's in-game help, tooltip and Ledger quest text rendered as the game shows
    them (the panel's width, the fonts), so long text is caught before a playtest.
12. **People's swap editor (M).** The `SWAP` tables of `data/factions.ts` (which building each people builds instead)
    moved to JSON and edited as a grid of peoples × buildings, checked against the catalogue.
13. **Daily challenge and scenario charters (M).** The scenario charters (goals, starts, rules) as content: browse,
    edit and add charters, each validated and playable with one click in the preview build.
14. **Entry history (S).** The git log of a building's own lines (cost changes over the iterations, with each commit's
    iteration number and DESIGN section), and one click to bring an old value back as a normal, undoable edit.
