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
npm test           # vitest: terrain, actions, networks, sim, hazards, save/load
npm run headless   # scripted balance run (see scripts/)
npx tsx scripts/balance.ts 42 150   # bot-played balance run, seed 42, 150 days
```

`.github/workflows/deploy.yml` builds, tests and deploys `dist/` to GitHub Pages on every
push to `main`. The Vite base is relative, so it works from any sub-path.

## How to play

You are a **Warden-Reeve** with a royal Charter. The map is 128×128 tiles with a river, a
lake, forests, hills, several **ley nodes** (glowing springs of magic) and a grey rim of
**Gloam** (blighted wilds). You start with 15,000 crowns and a Founding Stake next to the
main node.

1. **Roads** — pick *Dirt Track* and drag. Everything grows beside a road. Bridges over
   shallow water cost 4×. Cobbles (Hamlet) raise land value; Lantern-ways (Township) also
   carry mana along their length.
2. **Zones** — drag rectangles next to roads: **Hearth** (homes), **Market** (trade),
   **Craft** (alchemy works: many jobs, emits miasma), **Arcane** (enchanters: needs
   schooling and lots of mana, unlocked at Township). Watch the **demand bars** bottom-left.
3. **Mana** — ley nodes give 90 mana/day each. A **Ley Spire** within 6 tiles of a node
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
   hungrier hearths and a bolder Gloam.
10. **Info views** — keys `1`–`0`, `-`, `=`, `g`, `m` or the *Views* button: mana, water,
   land value, happiness, traffic, each service, wards & gloam, miasma.

Milestones: Founding Stake → Hamlet (40) → Thorp (100) → Village (220) → Township (400) →
Market Town (650) → Burgh (1000) → Free City (1500, unlocks the Lantern of Vell wonder) →
Beacon of Eda (2200).

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
| `H` | help · `Shift`+`G` grid · `F5` / `F9` quick save / load |

Saves go to `localStorage` automatically every three days; the Menu can export/import a
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
- Citizens, carts and restless walking real paths (A* on the road graph) with congestion.
- Modern pixel art: 2:1 isometric, one palette, integer scaling, chunk-cached ground,
  day/night with a light map, emissive windows and spires, ley lines at night, particles
  (smoke, sparks, fireflies, leaves, embers, gloam motes), animated water, tree sway.
- Sprites are generated at startup into an atlas with a manifest. Drop
  `public/art/atlas.png` + `atlas.json` (same manifest format) to replace them with
  hand-made art without code changes.
- Procedural WebAudio effects and a wind / ley-hum / cricket ambience.

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
src/data      flavor text and tips
tests         vitest suites
scripts       headless balance run, Playwright screenshot/perf/playtest harnesses
```
