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
npm test           # vitest: terrain, actions, networks, sim, hazards, creatures, wyrmcraft, quests, save/load
npm run headless   # scripted balance run (see scripts/)
npx tsx scripts/balance.ts 42 150   # bot-played balance run, seed 42, 150 days
npx tsx scripts/balance.ts 42 120 - grimmen   # the same bot playing the Grimmen
```

`.github/workflows/deploy.yml` builds, tests and deploys `dist/` to GitHub Pages on every
push to `main`. The Vite base is relative, so it works from any sub-path.

## How to play

The title screen offers four charters: the open valley (the standard game), the one-node
valley (one deep Vein and nothing else), the Gloam-locked island (grey on every side) and
the inherited collapse (a month-old town in debt, with ruins, the dead walking and a surge
two days out). Each has a goal that sits at the top of the Ledger.

You are a **Warden-Reeve** with a royal Charter. The map is 128×128 tiles with a river, a
lake, forests, hills, several **ley nodes** (glowing springs of magic) and a grey rim of
**Gloam** (blighted wilds). You start with 15,000 crowns and a Founding Stake next to the
main node.

0. **The Charter line** — the dimmed land beyond it cannot be built on. Click it to see
   the price; from Hamlet, buy a sector that touches the Charter and the Gloam inside it
   draws back.
1. **Roads** — pick *Dirt Track* and drag. Everything grows beside a road. Bridges over
   shallow water cost 4×. Cobbles (Hamlet) raise land value; Lantern-ways (Township) also
   carry mana along their length.
2. **Zones** — drag rectangles next to roads: **Hearth** (homes), **Market** (trade),
   **Craft** (alchemy works: many jobs, emits miasma), **Arcane** (enchanters: needs
   schooling and lots of mana, unlocked at Township). Watch the **demand bars** bottom-left.
3. **Mana and the ley-weave** — ley nodes give 90 mana/day each and each carries an
   **aspect** (click it): Ember, Bone, Glim, Vein, Sky, Grey, Tide or Storm ley changes the
   rules within 10 tiles, so where you build matters. A **Ley Spire** within 6 tiles of a node
   (or of another lit spire) lights 5 tiles around it; lit buildings light the buildings
   they touch. Draw more than the Veins give and the spires flicker; overdraw for five days
   and a **wild surge** warps buildings into ruins. Thrum Fonts and a Ley Nexus help later.
4. **Water** — **Wells** water 8 tiles (10 near water); **Cisterns** water 12 but need mana.
5. **Services** — Watch (unrest, restless dead), Healer's Shrine (health), Veshari Hall
   (fire brigade), Shrine of Aume (happiness), Academy (schooling), **Boneyard/Ossuary**
   (deathcare: unquieted dead rise as the **restless**), **Ward Lantern** (burns back the
   Gloam), Garden and Market Square (land value).
6. **Tithe** — taxes are collected daily per zone (Budget button). 10% is what folk
   expect. Upkeep is per building and per road tile. Milestones pay grants.
7. **Goods** — Craft works fill carts; carts feed Markets by road. Empty shelves and
   idle stills both hurt, and shortages push the demand bars. From Township, Crystal
   Mines dug into hills send leystone to Arcane districts, which sell artifacts.
8. **Districts, edicts and events** — paint districts from the toolbar; the *Edicts*
   button holds seven policies with daily upkeep, city-wide or per district.
   Every few weeks an event pauses the game and asks you to choose; consequences last
   for days.
9. **Seasons** — Thaw, Bloom, Ember and Hush, 30 days each. The Hush brings long nights,
   hungrier hearths and a bolder Gloam. Festivals on fixed days ask for a choice.
10. **Trade and the Wellspring** — a Trade Depot sells surplus goods at seasonal prices;
    click a ley node to see its flow and, from Burgh, deepen it for more mana.
11. **The Sleeping Wyrm** — one distant node is ringed with scale. Spires there wake it;
    awake it wants tribute each season (crowns or goods) or it flies over the city with
    wyrmfire. A **Wyrm-Court** (Free City) binds it as the city's guardian: a 30-tile
    ward, no hounds, +10 happiness, 40 goods a day to eat, and a vein egg each content
    season. Starve it and it sulks, then dies; its bones quiet the dead.
12. **Huruhui and Gekiryu craft** — a **Torrent Mill** on the riverbank makes mana from
    falling water; **Hanging Gardens** against hills make goods, health and light with no
    mana and unlock the **Glowvine Lane**; a **Glimhouse** keeps Craft works warm through
    the Hush (works otherwise make 20% less); the **Astral Observatory** forecasts the
    week ahead in the Ledger.
13. **Longwood and Lukuku** — two **Portal Arches** (Market Town), both lit, let carts and
    folk step across the map. Somewhere in a forest lie the **Ruins of Lukuku**: a **Ruin
    Delve** there brings up relics (artifacts sell for more) and opens old doors. At Free
    City plant the **World Tree Sapling**: four seasons later its shade reaches 24 tiles and
    the Gloam will not cross it. The **minimap** (bottom right) jumps the camera where you click.
14. **Beasts of the Concord and the sky** — mining wakes **Concord Wardens** in the hills;
    a **Golem Foundry** (Burgh) binds them into twelve hands of labour each, no housing,
    ten mana a day; a surge sets them loose. In Bloom and Ember **skyrays** cross the sky;
    a lit **Ley Beacon** keeps a school for the season (happiness, rayscale for the
    enchanters). A **Drake Mews** doubles Watch House reach. Three taming edicts trade
    one beast for another.
15. **Vehicles** — a level-3 Arcane workshop puts two **floating carts** on the roads
    (no congestion, a little mana). Two **Quays** on the same water send **barges** with
    goods from works to markets. A lit **Drake Mews** flies **riders** to the restless and
    to fires. At Beacon of Eda the **Sky-Dock** launches an **airship** each season with
    your surplus; it returns with crowns and sometimes a story.
16. **Longwood and the Fen-Nex** — on forest-heavy maps **war-tigers** stalk hearths by
    night; hunters, strong Watch or a warden drake's district kill them. The **Fen-Nex**
    fox-folk trade honestly half the time and may take a market district as their
    tithe-free, double-shelved quarter. Every wild surge leaves a drifting **mana-storm**
    that warps buildings until wards dissolve it. The **Font of Quieting** (Free City)
    makes the dead easy to lay down.
17. **The Charter's Ledger and the Chronicle** — the left panel lists the next three
    tasks with a hint, a reward and a *Show me* button that picks the tool, opens the
    panel or moves the camera; the *Advisor* line above it names the worst current
    problem. The *Chronicle* button (`C`) is the city's history: only things that really
    happened in the world, each with a ⌖ to go there.
18. **Info views** — keys `1`–`0`, `-`, `=`, `g`, `m` or the *Views* button: mana, water,
   land value, happiness, traffic, each service, wards & gloam, miasma.

Milestones: Founding Stake → Hamlet (40) → Thorp (100) → Village (220) → Township (400) →
Market Town (650) → Burgh (1000) → Free City (1500, unlocks the Lantern of Vell wonder) →
Beacon of Eda (2200). At Beacon of Eda, click a far ley node to found a **daughter
wardlight**: a second stake, a district and a grant, sharing one treasury. Five hundred folk
there makes the **Twin Beacons**.

**Ways to lose:** treasury below −8,000 for five days; the Gloam reaches the founding
node; forty restless dead walk the streets.

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
| `1`–`0` `-` `=` `g` `m` `o` `i` | info views · `Tab` view list |
| `H` | help · `C` Chronicle · `Shift`+`G` grid · `F5` / `F9` quick save / load |
| `Ctrl`+`Z` | undo the last road, zone, district, building, bulldoze or land change |

Every key above except `Ctrl`+`Z`, `Shift`+`G` and the view keys can be rebound in Menu → Key bindings.

Saves go to `localStorage` automatically every day; the Menu can export/import a
Charter as `.json`.

## Features

- Deterministic, seeded, fixed-tick simulation separated from rendering (`src/sim`), with
  a headless bot player for balance runs and a vitest suite.
- Procedural terrain: river, lake, forests, meadows, hills, 4–6 ley nodes, Gloam rim.
- Roads (3 tiers, bridges), 4 zone types, buildings that level up 1→3 with visibly
  different sprites, 20+ civic buildings, a wonder.
- Mana network (spire chains, adjacency spread, brownouts, wild surges), water coverage,
  8 service coverage types, land value, happiness, health, unrest, education, demand.
- Hazards from the lore: Gloam creep and pockets, restless dead, wild surges, fire.
- Goods flow by cart (potions and leystone), four seasons, ten story events with choices
  and chains, seven edicts city-wide or per district, eight paintable districts.
- Menu settings for colour-blind overlay ramps and UI scale; camera-driven ambience.
- Creatures: glimmoths swarm the ley at night, thrumhares graze the meadows, wisps rise
  over boneyards when the dead are restless; a Moth-Loft harvests glim-dust. Gloam-hounds
  hunt at the edge of the light, bolder in the Hush: raise a Hunters' Lodge or draw a
  Warding Wall (Services tab) that hounds and the Gloam cannot cross.
- Wyrmcraft: raise a Wyrm-Cradle near the ley and a Tamer's Lodge; dragon eggs arrive
  through events; hatch and train them into drakes and wyverns, set them as district
  wardens, mine delvers, flying couriers or champions of the Wyrm-Ring, and collect scale
  and wyrmfire in the Wyrms panel.
- Gates of the Pass in the Warding Wall, Storm-Caller's Peak (call rain), Belerial
  caravans and the Wandering Merchant.
- The Charter's Ledger (51 guided quests with hints and *Show me*), the Advisor line, and
  the Chronicle of real in-world events with jump-to-place.
- The Sleeping Wyrm: a Vein-Wyrm on the farthest node that wakes, demands tribute, burns,
  or is bound at the Wyrm-Court as the city's guardian.
- Huruhui and Gekiryu craft: the Torrent Mill (river mana), Glimhouse (warm works through
  the Hush), Astral Observatory (a five-day forecast in the Ledger), Hanging Gardens
  (goods, health and light with no mana) and the vine-lit Glowvine Lane.
- Panels never overlap: the toolbar and Ledger stack; views, info, minimap and the ticker
  drag. The minimap jumps the camera where you click.
- The ley-weave: every node has an aspect that changes the rules around it (Ember works,
  Bone deathcare, Glim moths, Vein mana, Sky couriers, Grey stillness, Tide water, Storm
  calm); cradles attune to matching eggs; grown dragons radiate their line's aura; rare
  goods build the Marvels tab or sell to caravans; the Gloam presses harder as the dead go
  unquieted and eases under faith; the river freezes in the Hush.
- The guild council: a lit Guildhall seats carters, alchemists, spire-wrights and sextons,
  who petition for edicts every 20 days and pay boons or strike; festivals spend the city
  (the feast eats shelves, the vigil drains the Nexus rings, the Remembrance needs the
  Ossuary, the Lantern Fair raises prices); the Ledger lists every trade route including the
  Twin Road to a daughter wardlight; the Weave view (W) paints ley aspects and auras.
- Peoples: the city belongs to a people chosen on the title screen. The Vellish are the
  default; the Grimmen of the Underhill build in stone on the hills, drink from seeps, hold
  the Gloam with standing stones, hatch only the stone lines, bind the Concord Wardens at a
  Forge-Temple, cut the Underking's Seat as their wonder, follow their own Underhill chapter
  and tales, start beside a hill ridge, field stone-sextons who cut the Gloam back with salt
  and chisel, delve grass into hill land, cut stone at Quarries for the carts, dig the Deep
  Cut, and climb milestones cut by depth that need stone quarried as well as folk.
- Walkers: watchmen, sextons, healers, Tallowkin wardens, scholars, tamers, pilgrims and
  the Grimmen's stone-sextons walk the roads from their buildings and do their jobs where
  they go; the streets they walk
  count as covered.
- Dev tools for playtesting behind the backtick key (uses are counted and mark the daily
  result).
- Buildings take days to raise: builders from the Founding Stake walk to each site and the
  building rises out of its foundations under a progress bar.
- Crossed eggs from attuned cradles (two auras in one dragon) and trueblood eggs from two
  crossed parents; relic sets catalogued by the Academy from the Ruin Delve, each unlocking
  a building; guild halls that pleased guilds raise for themselves, guild rivalries and
  brawls and charters; great wyrms from trueblood lines that meet the Vein-Wyrm in the
  air; relics sold to the Crown's assessor or auctioned to the caravans.
- The Charter line: the map is sixteen sectors; buy the dimmed ones beyond the Charter from
  Hamlet and the Gloam inside them draws back.
- Land tools (clear forest, plant glimwood, level hills), a daily challenge seeded from the
  date with a copyable result, and remappable keys in the Menu.
- Aria labels and roles on the panels. Desktop browsers only (mouse and keyboard).
- The daughter charter: at Beacon of Eda found a second wardlight on a far node, and grow
  it to 500 folk for the Twin Beacons.
- Scenario charters on the title screen: the one-node valley, the Gloam-locked island and
  the inherited collapse, each with a goal; a Done page in the Ledger; per-district
  problem counts in the Districts view.
- Longwood and the Fen-Nex: war-tigers on forest-heavy maps, the Fen-Nex fox-folk and
  their tithe-free quarter (and fen-drake eggs), mana-storms after every surge, the Font
  of Quieting, and cameo visitors.
- Vehicles: floating carts from level-3 Arcane workshops, barges between Quays, drake
  riders from the Drake Mews, and the Sky-Dock's airship that trades the season's surplus
  beyond the Gloam.
- Beasts of the Concord and the sky: Concord Wardens woken by mining and bound at the
  Golem Foundry into tireless labour, skyray schools kept by a Ley Beacon, the Drake
  Mews, and three taming edicts.
- Longwood and Lukuku: a pair of Portal Arches carts step through, the Ruins of Lukuku
  with a Ruin Delve and its relic chain, and the World Tree Sapling wonder that grows over
  four seasons.
- Citizens, carts and restless walking real paths (A* on the road graph) with congestion.
- Modern pixel art: 2:1 isometric, one palette, integer scaling, chunk-cached ground,
  day/night with a light map, emissive windows and spires, ley lines at night, particles
  (smoke, sparks, fireflies, leaves, embers, gloam motes), animated water, tree sway.
- Sprites are generated at startup into an atlas with a manifest. Drop
  `public/art/atlas.png` + `atlas.json` (same manifest format) to replace them with
  hand-made art without code changes.
- Procedural WebAudio effects, a wind / ley-hum / cricket ambience, positional cues (hounds
  howl, the wyrm roars, barges ring, skyrays sing) panned by where they happen, and
  generative ambient music that follows day, night, season and danger (Menu to toggle).

## Docs

- `docs/DESIGN.md` — design, systems, numbers, tech choices, decision log.
- `docs/EDA_LORE.md` — the world bible (history, peoples, gods, magic rules).
- `docs/EDA_CITY_LORE.md` — what was canon vs. what Wardlight proposes.
- `docs/NEXT_STEPS.md` — known issues and the prioritized next iteration.

## Project layout

```
src/sim       simulation: types, terrain, world, actions, networks, services, growth,
              economy, agents, hazards, sim (tick), save, bot, catalog (all game data)
src/render    palette, painter, sprites (procedural art), atlas, iso, camera, renderer,
              overlays, particles, lights
src/ui        style.css, tools (input), ui (DOM panels)
src/audio     procedural WebAudio
src/data      flavor text, tips and the quest list
tests         vitest suites
scripts       headless balance run, Playwright screenshot/perf/playtest harnesses
```
