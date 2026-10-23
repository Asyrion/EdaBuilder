# Wardlight — a city of Eda

A browser city builder in the spirit of the first *Cities: Skylines*, set in **Eda**, a
medieval high-fantasy world where magic is everyday infrastructure. Draw roads, zone
hearths and markets, raise leystone spires to carry mana from the ley nodes, keep the dead
quiet, and hold back the Gloam. Grow a camp into a Beacon of Eda.

Everything runs client-side: TypeScript + Vite + Canvas2D, deterministic simulation,
procedurally generated pixel art, procedural WebAudio. No backend, no external assets.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
npm test           # vitest: terrain, actions, networks, sim, hazards, quests, save/load
npm run headless   # scripted balance run (see scripts/)
npx tsx scripts/balance.ts 42 150   # bot-played balance run, seed 42, 150 days
npx tsx scripts/balance.ts 42 150 - vellish roll=1   # the same run with one extra roll on day 10: another draw
npx tsx scripts/table.ts --compare origin/main   # the balance table: 3 seeds × 2 draws, paired, with a verdict
npx tsx scripts/table.ts --bar wide --compare origin/main   # the bar for a sim change: draws added until the floor is a tenth
                                                            # (runs cached in balance/cache by the sim's files; commit it)
npx tsx scripts/replay.ts Thornwick_day30.wardlight-replay.json   # replays an exported charter headless: MATCH, or the first day it diverged
npx tsx scripts/questCensus.ts 42 200 vellish   # which Charter tasks a bot game completes, and which never
npm run art        # reference paintings (eda-lore's inspirations/: EDA_LORE or ../eda-lore) → game sprites (art/sources.json → public/art/sheets and sprites.json; commit both)
npm run art:check  # the same, plus shots/import_check.png: every sprite over its footprint diamond
node scripts/importSprites.mjs --islands inspirations/bushes/image_3.png   # list a sheet's items by index
npm run devboard   # the dev board, http://127.0.0.1:8771: content, text, sprites and art; prompts and pipelines; next steps, GitHub, balance; Send to Claude (tools/devboard)
npm run devboard:selftest   # the board's own checks
```

**The dev board** (`tools/devboard/README.md`, DESIGN §4.118): a local page with a tab per kind of content (buildings,
roads, milestones; edicts and quests read-only). Each building shows its sprites, imported or
drawn in code, and its art status. Edits save only what changed, are checked by `validateContent` and the sprite rule, and
can be undone. Its project tabs (DESIGN §4.119) show the next steps and the iterations done with their DESIGN sections,
GitHub's milestones and issues (through `gh`) and the balance cache as charts. "Send to Claude" hands any item, issue or
card to Claude Code on your PC or files it as a GitHub issue; "New element" writes the task for a new building, road,
edict, event, quest or creature. Its art side (DESIGN §4.120) keeps an image prompt per sprite in
`art/prompts/` ("Refine with Claude" runs `claude -p`), runs the paintings importer from a card (drop a painting, pick its
island, import, judge), Tripo Studio (you in Studio, or Claude through the Tripo CLI: a round of four, measured, the pick
into the importer) and Aseprite (trace, export, an 8× review, install); `docs/ART_PIPELINES.md` has all three. The
wording of edicts and quests is edited there too (`src/data/content/text/`). Run one instance; it serves
every session.

`.github/workflows/deploy.yml` builds, tests and deploys `dist/` to GitHub Pages on every
push to `main`. The Vite base is relative, so it works from any sub-path.

## How to play

You are a **Warden-Reeve** with a royal Charter. The map is 128×128 tiles with a river, a
lake, forests, hills, several **ley nodes** (glowing springs of magic) and a grey rim of
**Gloam** (blighted wilds). You start with 15,000 crowns and a Founding Stake next to the
main node.

0. **The Charter line** — the dimmed land beyond it cannot be built on. Click it to see
   the price; from Hamlet, buy a sector that touches the Charter and the Gloam inside it
   draws back.
1. **Roads** — pick *Dirt Track* and drag. Everything grows beside a road. Bridges over
   shallow water cost 4×. Cobbles (Hamlet) raise land value; Lantern-ways (Township) also
   carry mana along their length. A market trades by the road at its door: cobbles in
   full, a dirt track a tenth less (a fifth in the mud of the Thaw and the Hush), a lit
   Lantern-way a tenth more.
2. **Zones** — drag rectangles next to roads: **Hearth** (homes), **Market** (trade),
   **Craft** (alchemy works: many jobs, emits miasma), **Arcane** (enchanters: needs
   schooling and lots of mana, unlocked at Township). Watch the **demand bars** bottom-left;
   hover one for its factors in points and how many of its lots can grow.
   Hover a lot or a house with Select to see why it does or does not grow; the **Growth**
   view (`N`) colours every lot by it (no road, no light, no water, no demand, the Gloam, no
   schooling). A lot grows only where light and water reach it.
3. **Mana** — ley nodes give 90 mana/day each (the founding Wellspring 105; click one to
   see its flow). A **Ley Spire** within 6 tiles of a node
   (or of another lit spire) lights 5 tiles around it; lit buildings light the buildings
   they touch. Draw more than the Veins give and the spires flicker; overdraw for five days
   and a **wild surge** warps buildings into ruins; the top bar counts the days down. A Thrum
   Font (100 mana a day, from Township) and a Ley Nexus help later.
4. **Water** — **Wells** water 8 tiles (10 near water); **Cisterns** water 12 but need mana.
5. **Services** — Watch (unrest, restless dead), Healer's Shrine (health), Water-Mages' Hall
   (fire brigade), Shrine of Aume (happiness), Academy (schooling), **Boneyard/Ossuary**
   (deathcare: unquieted dead rise as the **restless**), **Ward Lantern** (burns back the
   Gloam), Garden and Market Square (land value).
6. **Tithe** — taxes are collected daily per zone (Budget button). 10% is what folk
   expect. Upkeep is per building and per road tile. Milestones pay grants.
7. **Goods** — Craft works fill donkey carts; the carts feed Markets by road. Empty shelves and
   idle stills both hurt, and shortages push the demand bars. From Township, Crystal
   Mines dug into hills send leystone to Arcane districts, which sell artifacts.
8. **Districts and edicts** — paint districts from the toolbar; the *Edicts*
   button holds the policies with daily upkeep, city-wide or per district.
9. **Seasons** — Thaw, Bloom, Ember and Hush, 30 days each. The Hush brings long nights,
   hungrier hearths and a bolder Gloam.
10. **Trade and the Wellspring** — a Trade Depot sells surplus goods at seasonal prices;
    click a ley node to see its flow and, from Burgh, deepen it for more mana.
11. **The Charter's Ledger and the Chronicle** — the left panel lists the next three
    tasks with a hint, a reward and a *Show me* button that picks the tool, opens the
    panel or moves the camera, and under most a live line of what the task still needs
    (not built yet, being built and how far, built but unlit, or a count against its
    target); the *Advisor* line above it names the worst current
    problem. The *Chronicle* button (`C`) is the city's history: only things that really
    happened in the world, each with a ⌖ to go there.
12. **Info views** — keys `1`–`0`, `-`, `=`, `n`, `g`, `m` or the *Views* button: mana, water,
    land value, happiness, traffic, growth, each service, wards & gloam, miasma. The **minimap**
    (bottom right) jumps the camera where you click.

Milestones: Founding Stake → Hamlet (40) → Thorp (100) → Village (220) → Township (400) →
Market Town (650) → Burgh (1000) → Free City (1500, unlocks the Lantern of Vell wonder) →
Beacon of Eda (2200).

**Ways to lose:** treasury below −8,000 for five days; the Gloam reaches the founding
node (warned at ten tiles); forty restless dead walk the streets (the top bar counts the dead
waiting from ten, and the restless walking).

## Controls

| Input | Action |
|---|---|
| Left click / drag | use the current tool |
| Right or middle drag | pan · right click cancels a tool |
| `W A S D` / arrows | pan |
| Mouse wheel, `Shift` `+` / `-` | zoom (integer 1–4×) |
| `R` | road tool (press again to cycle type) |
| `Z` | zone tool (press again to cycle zone) |
| `B` / `X` / `Esc` | bulldoze / select / cancel |
| `Space`, `,` `.` , `Shift`+`1 2 3` | pause, slower/faster, set speed |
| `1`–`0` `-` `=` `n` `g` `m` `o` `i` | info views · `Tab` view list |
| `H` | help · `C` Chronicle · `Shift`+`G` grid · `F5` / `F9` quick save / load |
| `Ctrl`+`Z` | undo the last road, zone, district, building or bulldoze |

Every key above except `Ctrl`+`Z`, `Shift`+`G` and the view keys can be rebound in Menu → Key bindings.

Saves go to `localStorage` automatically every day; the Menu can export/import a
Charter as `.json`.

## Features

- Deterministic, seeded, fixed-tick simulation separated from rendering (`src/sim`), with
  a headless bot player for balance runs and a vitest suite. The bot plays the levers a player
  has: it saves for one goal at a time (its people's hall, a depot, the cheapest mana) and takes
  the Crown's loan as a bridge to a hall. It zones what it can light, moves the tithe off the
  hearths, and sets the curfew, draughts and imports. It saves for a depot once the Craft
  works' surplus waiting for the Gloam road would fetch half its price.
- Procedural terrain: river, lake, forests, meadows, hills, 4–6 ley nodes, Gloam rim, and
  the Ruins of Lukuku in a forest (scenery; nothing is built there).
- Roads (3 tiers, bridges), 4 zone types, buildings that level up 1→3 with visibly
  different sprites, 20+ civic buildings, a wonder.
- Mana network (spire chains, adjacency spread, brownouts, wild surges), water coverage,
  8 service coverage types, land value, happiness, health, unrest, education, demand.
- Hazards from the lore: Gloam creep and pockets, restless dead, wild surges, fire; each with a
  herald, a remedy and a view (the Fire brigade view shows the fires, the ruins and the uncovered
  buildings by risk; Wards & Gloam marks the dark buildings the grey waits at).
- Goods flow by cart (potions and leystone), four seasons, edicts city-wide or per district,
  eight paintable districts.
- Menu settings for colour-blind overlay ramps and UI scale; camera-driven ambience.
- The lake: its open water lifts the land around it and feeds its wells half again.
- The Charter's Ledger (21 guided tasks with hints, *Show me* and a live line of what each still needs), the Advisor line, and
  the Chronicle of real in-world events with jump-to-place.
- Panels never overlap: the toolbar and Ledger stack; views, info, minimap and the ticker
  drag. The minimap jumps the camera where you click.
- Every lit wonder hall delights the city and lifts the next grant a tenth; the Gloam presses
  harder as the dead go unquieted and eases under faith.
- One people, the Vellish (the scope reset, `docs/RESET_PLAN.md`): the Grimmen, the Veshari, the Tallowkin
  and the Fen-Nex are parked with everything that served only them (`docs/PARKED.md` says how they would
  come back); `src/data/factions.ts` stays as the seam another people would plug into. Phase 1b parked the
  creatures, the dragons, the wyrms, the beasts, the hounds and the Warding Wall in the same way, and phase
  1c-1 the story events, the weather and the ley aspects, the forecast, the guilds, the walkers and the Annals.
  Phase 1c-2 parked the wild and the hunt, fishing, reeds and fords, the marsh, the Patagoi Atoll, the
  vehicles, the scenarios, the daily challenge and the daughter charter, terraforming, the relics, ruins,
  portals and the World Tree, the four marvels and the Huruhui and Gekiryu craft (the Torrent Mill,
  Glimhouse, Hanging Gardens, Glowvine Lane), the Brickworks and the Font of Quieting.
- Districts: paint a district from the Hamlet and give it a charter (a Hearth, Craft, Market,
  Scholars' or Temple quarter), each a gift and a price for the buildings inside; edicts can
  still be set per district. A selected building shows its reach. A charter holds thirty
  days and costs a crown a building a day (a Craft quarter's smoke drifts past its edge, a
  Temple quarter takes a tenth of the market tithe); an edict holds ten days and costs 200
  to repeal.
- The world pushes back: the Crown's Thaw levy, interest on
  a debt and a loan from the Budget, a bankruptcy line that grows with the city; the next
  milestone's gate named in the top bar (happiness, and the Lantern of Vell lit for the Beacon).
- Services have crews filled from the city's hands and watch, heal, teach and quiet by how
  many are filled; happiness is listed in six groups (place, light & water, services,
  nuisances, the city, work & trade) with the lever of the worst, for a building and, on the
  top bar, for the city; land value shows its largest terms; a home lists what
  its next level needs; wards burn the grey on a daily budget, the nearest first.
- Unrest has teeth: an unwatched market loses a tenth of its shelves a night while the city
  is unquiet. The Hospice runs on draughts from the markets, and placing a spire, a
  well or a hall draws the reach of the ones already standing.
- The painted set: the ground, the trees, bushes and mushrooms, the spire, the wells, the
  Depot, the chapels, the homes, works, shops and markets of the zones are imported from
  the reference paintings, sharpened and outlined to sit beside the procedural set; one
  painting is the look of its building; the Stake and the Temple grow with
  the city; every building has a sprite. The painted heroes stand at the height of their
  procedural twins, centred on the tile, and the paintings fronted on the left are mirrored so
  the whole set faces lower-right; every building then turns toward its road (a mirror when the
  road runs past its left side), and the placement ghost turns with it. Every building sprite
  was surveyed over its footprint diamond beside its mirror (iteration 77): the facings hold,
  and the Stake's stage 2 hall and the Hall of Wicks now fill their tiles. The small buildings
  are scaled to the citizen (iteration 78): a well is a citizen and a half, a lamp post or a
  shrine two and a half, a shed or a cottage under three; the towers rise as they did. Since
  iteration 79 the wells, the level-2 hearths, the level-1 crafts and the depot are drawn in
  code after their paintings, and since iteration 81 each is composed by hand after its own
  painting (`src/render/painted.ts`: boxes, gables along either axis, porches, verandas,
  dormers, chimneys and props where the painting has them), crisp at the citizen scale and
  one set with the procedural buildings. Since iteration 82 the zone houses are the user's own
  houses from the eda-lore sheets (48 for the Vellish, none used twice; the other peoples' 144 are parked), and since
  iteration 84 most service buildings carry several looks from the same sheets (37 wells, 11 shrines, 11 boneyards …),
  chosen per building by its tile, with the user's trees, bushes, mushrooms and ground tiles in the wild.
- Drawn art where no painting exists: the Lantern of Vell is a leystone lighthouse (a coursed
  tower, a gallery, a lantern room whose crystal blazes at night, the keeper's house at its
  foot); the temple is a nave and portico that gains a bell tower and then a copper dome; the
  citizens have shaded cloth, belts, boots and a walk with swinging arms.
- The donkey carts: 31 painted carts (barrels, sacks, hay, stalls, covered wagons, and stone for
  the mines' leystone) drive the roads at the folk's scale, each facing the way it goes; the
  first-cart quest's Show me finds one on its way to market.
- Reach rings: placing or selecting a building draws every reach it has above the buildings,
  labelled ("water 4", "watch 14", "fed from markets 12"), with its kin's reach faintly around
  it; square reaches draw as squares, and a well's ring is the water it really gives.
- A road at a building's corner counts as its door; the zone preview hatches the tiles that
  would never grow. Districts and charters open in steps from the Hamlet to the Burgh, with
  a three-step lesson card when they arrive. The demand bars carry a zero line, a word under
  each bar and a tooltip that says the sign, the numbers and what to do. The Founding
  Stake's hall grows through four stages with the city, drawn from the reference paintings
  in eda-lore's `inspirations/` through the art import pipeline.
- The ground has limits: wells serve a capacity of homes (the nearest first), a far-from-water
  well reaches less, the Seep follows the season, mud slows tracks in the wet seasons, mine
  seams run out, a hot Font may flare, and the
  Gloam takes a dark, unwarded building after two days at its door.
- The ley has limits: an unlinked node seeps only half its flow, a spire carries 80
  mana of buildings and its farthest go dark over that (a Load row), every building has a
  brownout tier, and lantern-ways dim first when the ley runs short.
- Dev tools for playtesting behind the backtick key (uses are counted and mark the daily
  result): among them jump to a day, complete a Charter task, and reset
  the ledger history or the Chronicle.
- Saves carry their version (8 since the scope reset): a save holds every layer of the city, so a
  charter saved at any moment and loaded again runs on exactly as it would have. A save or a replay
  from before the reset, or from a newer Wardlight, is refused with the reason.
- Buildings take days to raise: builders from the Founding Stake walk to each site and the
  building rises out of its foundations under a progress bar.
- The Charter line: the map is sixteen sectors; buy the dimmed ones beyond the Charter from
  Hamlet and the Gloam inside them draws back.
- Remappable keys in the Menu.
- Aria labels and roles on the panels, and the whole UI works from the keyboard: Tab moves in
  screen order behind a *Skip to the map* link, F6 jumps between the top bar, the toolbar, the
  Ledger, the panels and the map, the arrows move along the toolbar's tabs and items, a dialog
  holds focus and gives it back on Escape, and a gold ring shows where the keyboard is. The game's
  shortcuts work while the map has focus (Info views moved from Tab to V). Desktop browsers only.
- Replays: every change the player makes goes through one command log. Menu → *Export replay*
  saves the charter's commands since its founding, title → *Watch a replay* plays it again
  (with *Skip to end*), and `scripts/replay.ts` checks a file headless and names the first day
  it diverges, so a bug report can be a file that reproduces it.
- A Done page in the Ledger; per-district problem counts in the Districts view.
- Three ways to lose, each named on the game-over screen: the Gloam at the founding node, forty
  restless walking, and the Crown's revocation.
- Citizens, carts and restless walking real paths (A* on the road graph) with congestion.
- Modern pixel art: 2:1 isometric, one palette, integer scaling, chunk-cached ground,
  day/night with a light map, emissive windows and spires, ley lines at night, particles
  (smoke, sparks, fireflies, leaves, embers, gloam motes), animated water, tree sway; the forest's trees follow the land (oaks and birches in the plain woods, spruces by hills, willows by water, the crystal trees only by a ley node), and the night's lights stay on under an info view.
- Sprites are generated at startup into an atlas with a manifest. `public/art/sprites.json`
  lists per-sprite PNG overrides (with a footprint anchor and an optional glow) that are
  merged over the procedural atlas by name; `npm run art` makes them from the reference
  paintings in eda-lore's `inspirations/` as `art/sources.json` says, and packs them into one or a few
  sheets (`public/art/sheets/`) that the page loads at once, with a loading line until the
  town is up. Drop `public/art/atlas.png` + `atlas.json` to replace the whole set instead.
- Procedural WebAudio effects, a wind / ley-hum / cricket ambience, positional cues (the
  builders' hammers) panned by where they happen, and
  generative ambient music that follows day, night, season and danger (Menu to toggle).

## Docs

- `docs/HANDOFF.md` — where the project stands and how a session works on it.
- `docs/DESIGN.md` — the design of the core after the scope reset: the loop, the systems with their numbers, the art.
- `docs/NEXT_STEPS.md` — the open list (the reset's phases 2 to 6) and the known issues.
- `docs/RESET_PLAN.md`, `docs/RESET_LOG.md`, `docs/PARKED.md` — the scope reset: the plan, what each phase did, and what
  was parked and how it comes back.
- `docs/CORE_CHECKLIST.md` — the checklist walked when the UI changes (`scripts/checklist.mjs` walks what a script can).
- `docs/ART_PIPELINES.md` — the art pipelines (paintings, Tripo Studio, Aseprite).
- `docs/EDA_LORE.md` — the world bible (history, peoples, gods, magic rules).
- `docs/EDA_CITY_LORE.md` — what was canon vs. what Wardlight proposes.
- `docs/archive/` — the docs before the reset: the full DESIGN (iterations 1 to 96, its `§4.NN` sections), NEXT_STEPS,
  the iteration 44 AUDIT and the old HANDOFF.

## Project layout

```
src/sim       simulation: types, terrain, world, actions, networks, services, growth,
              economy, agents, hazards, sim (tick), save, bot, catalog (reads the content),
              contentCheck (validateContent)
src/render    palette, painter, sprites (procedural art), atlas, iso, camera, renderer,
              overlays, particles, lights
src/ui        style.css, tools (input), ui (DOM panels)
src/audio     procedural WebAudio
src/data      flavor text, tips and the quest list; content/: buildings, roads and milestones as JSON
              (edited by hand or on the dev board); content/text/: the wording of edicts
              and quests, read by the code by id
tests         vitest suites
scripts       headless balance run, Playwright screenshot/perf/playtest harnesses,
              importSprites (the art pipeline) and its lib (png codec, sprite steps)
art           sources.json: which paintings become which sprites, with hand-set anchors;
              prompts/: the image prompt of each sprite (the dev board's prompt studio)
public/art    the imported sprite sheets and their manifest (shipped with the build)
tools/devboard  the dev board (server, lossless JSON edits, art status, checks, the tracker, Send to
              Claude, the prompt studio and the pipelines, the page)
```
