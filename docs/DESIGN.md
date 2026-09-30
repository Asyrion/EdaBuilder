# Wardlight — Design Document (living)

*Wardlight* is a browser city builder in the spirit of the first *Cities: Skylines*,
set in Eda, a medieval high-fantasy world where magic is everyday infrastructure.
You are a Warden-Reeve with a royal Charter: tame a ley node, light a valley, and
grow a camp into a Beacon of Eda before the Gloam, bankruptcy or the restless dead
put out your light.

This document is the source of truth for design and technical decisions. Every
non-obvious call carries a one-line rationale. Lore lives in `EDA_LORE.md`.

---

## 1. Vision

- **Feel:** the calm, tactile satisfaction of drawing a road and watching a village
  crawl along it, layered with medieval-magical texture: spires that hum, windows
  that glow amber at dusk, carts of potions rattling to market, and a grey hush at
  the map's edge that you must push back.
- **Pillars:** (1) roads and zones grow organically; (2) magic is infrastructure,
  not decoration; (3) every system is legible through info-view overlays; (4)
  modern pixel art: crisp sprites, soft light, glow, particles, day/night.
- **Session:** a new player grows a hamlet into a thriving magical town in 30–60
  minutes, with meaningful trade-offs (tax vs growth, mana vs surge risk, sprawl vs
  the Gloam) and at least three ways to fail.

## 2. Core loop

1. **Draw roads** from the founding stake. Buildings only grow next to roads.
2. **Paint zones** (Hearth / Market / Craft / Arcane) where demand bars ask for them.
3. **Light and water** them: Ley Spires spread mana from ley nodes; wells and
   cisterns give water. Unlit or dry buildings stall and complain.
4. **Serve** them: watch, healers, water-mages, shrines, schooling, deathcare, wards.
5. **Balance the tithe**: tax rates and upkeep against growth and happiness.
6. **Hit milestones** that unlock new buildings and bigger ambitions.
7. **Survive hazards** that grow out of the magic: wild surges from overdraw,
   restless dead from neglected boneyards, the Gloam creeping from unwarded edges,
   fire, unrest.

## 3. Eda translation of Cities: Skylines systems

| CS1 concept | Wardlight | Why |
|---|---|---|
| Electricity | **Mana** from **ley nodes**, distributed by **Ley Spires** (radius) and along touching buildings | Keeps CS1's "power poles + adjacency" feel; nodes make site choice matter |
| Water/sewage | **Water** from **Wells** (radius, better near rivers) and **Cisterns** (mana-driven, big radius) | One network instead of two keeps the medieval fantasy legible; no pipe-laying tedium |
| RCI zones | **Hearth** (residential), **Market** (commercial), **Craft** (alchemical industry), **Arcane** (offices: enchanters, scriptoria) | Direct mapping keeps demand-bar intuition; Craft emits *miasma*, Arcane needs schooling & mana |
| Roads | **Dirt track** → **Cobbled road** → **Lantern-way** (lit, +land value) | Three tiers give a visible upgrade path |
| Police | **Watch House** vs *unrest* | |
| Health | **Healer's Shrine** (Vesh/Aume) vs sickness; *miasma* lowers health | |
| Fire | **Veshari Hall** (water-mage brigade) | Fire is a real hazard with spread |
| Education | **Academy of the Ley**; educated share gates Arcane growth and building level 3 | |
| Deathcare | **Boneyard** → **Ossuary**; bodies over capacity become the **restless** | The dark twist the brief asked for |
| Parks | **Garden of Aume**, **Market Square** | land value / happiness |
| Disasters | **Wild surge** (mana overdraw), **Gloam creep** (unwarded edges), **restless dead**, fire | All grow out of the magic rules, none are random weather |
| Milestones | Population titles bestowed by the Crown, each unlocking buildings | |
| Budget | Daily **tithe**: taxes per zone type, upkeep per building/road | Daily (not weekly) cycle so a 30-minute session sees many cycles |
| Info views | Mana, Water, Land value, Happiness, Traffic, Services (per service), Miasma, Gloam, Unrest, Health | CS1's signature |

## 4. Systems (with numbers; balance pass adjusts them)

### 4.1 Map & terrain
- 128×128 tiles, 2:1 isometric (32×16 px diamonds at native scale).
- Terrain types: deep water, water, shore, grass, meadow, forest, hills (rock,
  unbuildable, mineable flavor), ley node (3–6 per map, one near centre), gloam
  (blight; starts on the outer ring of the map).
- Generated from fBm noise + a river carved by a random walk + a lake. Seeded and
  deterministic; the seed is shown on the title screen and in saves.
- No height offset for hills. *Rationale:* flat iso keeps chunk caching trivial and
  the map legible; hills read through texture and colour.

### 4.2 Roads
- Placed by click-drag along L-shaped paths; cost per tile (track 10, cobbled 40,
  lantern-way 120 + 1 mana each); upkeep per tile per day.
- Roads over water become bridges at 4× cost (shallow water only).
- Road tiles form a graph; buildings need a road-adjacent tile (4-neighbour).
- Traffic: each road tile counts agents per day; congestion > capacity slows agents
  and reduces the happiness of buildings alongside.

### 4.3 Zones and growth
- Zone painting is a rectangle drag. Zone tiles must touch a road (4-neighbour) to
  grow. 1×1 zoned buildings. *Rationale:* 1×1 keeps growth readable and the sprite
  set small; service buildings are the ones that get big footprints.
- Each sim second 3 random zone tiles are checked: if that zone's demand > 0 (spawn
  chance 0.45×demand), the tile is road-adjacent and not gloamed, a level-1 building
  spawns. Tuned so a competent player reaches Burgh around game day 50 (25 minutes at
  3×) and Free City near day 100.
- Levelling: a building levels up (max 3) when its land value + service score
  exceeds a threshold for long enough; levels down / is abandoned if happiness stays
  very low, or if it has no mana or water for a long while.
- Capacity per level: Hearth 4/8/14 residents; Market 3/6/10 jobs; Craft 4/8/12
  jobs; Arcane 4/8/14 jobs.

### 4.4 Demand
- Hearth demand rises with available jobs and low unemployment, falls with high
  tax and low happiness. Market demand rises with population/shoppers and goods.
  Craft demand rises with population needing jobs and falls with unemployment of
  workers. Arcane demand needs educated share > 0.25.
- Values in [-1, 1], shown as bars.

### 4.5 Mana (ley) network
- Each ley node yields 90 mana/day. A **Ley Spire** within 6 tiles of a node or
  another lit spire is lit and lights every tile within radius 5. Buildings adjacent
  to lit buildings are also lit (adjacency spread through building tiles only).
- Consumers (per day): hearth 1, market 2, craft 3, arcane 4 at level 1, ×1.5 at
  level 2 and ×2 at level 3; cisterns 8, wards 6, lantern-ways 1 per tile.
- If demand > supply: **brownout** — a proportion of buildings are unlit each day
  (deterministic ordering by distance from nodes so the far edge fails first). If
  demand > 1.25× supply for 3 days: **wild surge** — random lit buildings are
  *warped* (become ruins) and the surge produces a burst of particles. This is the
  "power outage with teeth".
- A **Ley Nexus** (Township) stores 120 mana to soak up peaks; a **Thrum Font**
  (Township, 6,500 crowns) adds 40 mana/day anywhere.

### 4.6 Water
- Wells: radius 8 (10 within 3 tiles of water). Cisterns: radius 12, need mana.
  The Founding Stake waters 5 tiles so the first houses are never dry. Coverage is by Euclidean distance. Unwatered buildings have -health and
  stop levelling.

### 4.7 Services & coverage
Each service building has a radius and a strength; coverage falls off linearly
with distance and is capped at 1. Coverage maps are recomputed incrementally (one
service type per tick slice), stored as `Uint8Array` per service.

| Service | Building(s) | Radius | Effect |
|---|---|---|---|
| Watch | Watch Post (r8), Watch House (r14) | | reduces unrest |
| Health | Healer's Shrine (r10), Hospice of Vesh (r16) | | raises health |
| Fire | Veshari Hall (r12) | | extinguishes fires |
| Faith | Shrine of Aume (r8), Temple of the Four Vigils (r18) | | happiness |
| Schooling | Academy of the Ley (r14), Grand Academy (r22) | | educated share |
| Deathcare | Boneyard (cap 200, r12), Ossuary (cap 800, r20) | | quiets the dead |
| Ward | Ward Lantern (r10) | | repels Gloam, lowers gloam-fear |
| Leisure | Garden of Aume (r6), Market Square (r8) | | land value & happiness |

### 4.8 Land value
Base 20 + road tier bonus + water proximity + leisure/faith coverage + lit +
watered − miasma − gloam proximity − traffic. Range 0–100.

### 4.9 Happiness, health, unrest, education
- Per-building happiness = f(services, land value, tax, lit, watered, miasma,
  gloam nearby, unrest, traffic). City happiness = resident-weighted mean.
- Health from healer coverage + water − miasma. Deaths per day = residents ×
  base mortality × (1.5 − health). Bodies go to deathcare capacity; excess become
  restless (see hazards).
- Unrest = base + unemployment + tax − watch coverage. High unrest lowers tax
  yield and happiness.
- Educated share drifts toward schooling coverage of residents.

### 4.10 Economy
- Start with 15,000 crowns. Daily tithe = Σ building tax (base per level × tax
  rate × happiness modifier) − upkeep (roads, services). Tax rates per zone
  adjustable 0–30 %, default 10 %.
- **Fail: Bankruptcy.** Treasury below −8,000 crowns for 5 consecutive days: "The
  Crown revokes your Charter."

### 4.11 Milestones (population)
Founding Stake 0 · Hamlet 40 · Thorp 100 · Village 220 · Township 400 · Market
Town 650 · Burgh 1000 · Free City 1500 · Beacon of Eda 2200. Each unlocks
buildings/roads and pays a Crown grant. Thresholds sized so an average player at
2–3× speed reaches Burgh around minute 40.

### 4.12 Hazards (all deterministic from state + seeded RNG)
- **Gloam creep:** every 4 days each gloam tile tries to spread to an adjacent
  non-water tile (p ≈ 0.05–0.15, rising slowly with the day count) if that tile has
  no ward coverage and no building within 2 tiles. Every 12 days a **pocket** of Gloam
  opens somewhere unlit, unbuilt and unwarded. Gloamed zone tiles lose their building. Gloam within 6
  tiles lowers happiness ("the whispering"). Ward Lanterns clear gloam in radius.
  **Fail: The Gloam takes the founding node** (any gloam tile within 2 tiles of the
  central node): "The light goes out."
- **Restless dead:** unquieted bodies accumulate; each day above 20 unquieted, a
  restless spawns near the Boneyard (or where the deaths happened) and wanders,
  scaring nearby buildings (−happiness, −land value) until Watch coverage or a Ward
  clears it. > 40 restless: "the Long Night" unrest spiral, effectively a fail
  state if the player does nothing (abandonment cascade).
- **Wild surge:** see mana.
- **Fire:** 0.025 % daily chance per building (Craft ×2.5, level 1 ×1.4, Thrum Font
  ×6, halved under full brigade coverage); spreads to touching buildings; brigade
  coverage extinguishes with p = 0.35 + 0.6×coverage per day; after 2 days a
  burning building becomes a ruin, cleared automatically after 12 days.
- **Abandonment cascade / unrest** as a soft fail: pop falls, income falls.

### 4.13 Agents (citizens, carts, restless)
- Citizens: up to 1 visible agent per 2 residents (capped at 1500 for perf). Each
  picks a trip (home→work, work→market, →home) via A* over the road graph, with a
  path cache keyed by (from,to). They walk at 1 tile/sec on tracks, 1.4 on
  cobbles; congestion slows.
- Carts: spawn from Craft buildings to Market buildings; count as 3 for traffic.
- Restless: spawn from hazards, wander randomly, removed by watch/ward.
- Spatial index: agents bucketed per road tile for traffic counting.

## 5. Art direction

- **Projection:** 2:1 isometric. **Native tile:** 32×16. Integer zoom 1–4 (scene is
  rendered to a native-resolution backbuffer then blitted with image smoothing off).
- **Palette:** one limited palette (`src/render/palette.ts`, ~40 colours) with named
  roles (grass ×3, water ×3, stone ×3, wood ×3, roof ×3, ley blue ×3, ember, gloam
  ×3, ui). All procedural sprites draw only palette colours.
- **Sprites:** generated procedurally at startup into an atlas with a JSON manifest
  (`SpriteAtlas`). If `public/art/atlas.png` + `atlas.json` exist they override the
  procedural atlas, so hand-made art can be swapped in without code changes.
- **Building growth:** each zone type has three visually distinct levels
  (sod hut → timber house → stone townhouse; stall → shop → guild-house; etc.) and a
  ruin sprite; the city visibly gains spires, lamps and glow as it levels.
- **Modern rendering:** day/night cycle (ambient colour ramp), a low-res light map
  with additive glows for windows, spires, lantern-ways and ley nodes, shimmering
  ley-lines at night, particles (chimney smoke, sparks on spires, fireflies at
  night, leaves in forests, embers on fire, grey motes over gloam), animated water
  sparkle, gentle tree sway.
- **Readability first:** roads and zones have flat, high-contrast colours; overlays
  desaturate the scene and tint tiles; hovered tiles and drag rectangles are always
  outlined.

## 6. Technical choices

- **TypeScript + Vite + Vitest.** Standard, fast, zero-config.
- **Canvas2D** rather than WebGL/PixiJS. *Rationale:* the scene is a few thousand
  sprites; Canvas2D with (a) chunk-cached ground layer, (b) a native-res backbuffer
  and (c) a quarter-res light canvas composited with `multiply`/`lighter` hits 60
  fps comfortably and keeps the whole renderer readable with no shader toolchain.
  Everything is behind a small renderer interface so a WebGL path could replace it.
- **Sim/render split.** `src/sim` is plain data + pure functions on a `GameState`
  (typed arrays for the grid, arrays of structs for buildings/agents). Fixed tick
  at 10 ticks/s of game time; speed multipliers run more ticks per frame. Seeded
  `mulberry32` RNG lives in state. `src/render` and `src/ui` only read state and
  push commands. Tests run the sim headlessly for thousands of ticks.
- **Save/load.** `serialize(state)` → JSON (typed arrays base64-encoded);
  autosave to localStorage every game day; export/import as a `.json` file.
- **Performance.** Chunks of 8×8 tiles cache terrain+roads+zones; dirty chunks are
  redrawn lazily. Buildings/agents are culled to the viewport and depth-sorted per
  frame. Coverage maps are recomputed in slices. Agents are bucketed by road tile.
- **Deployment.** GitHub Actions builds and deploys `dist/` to GitHub Pages;
  `vite.config.ts` uses a relative base so it works at any path.

## 7. Milestone plan

- **M1 Foundation** — scaffold, palette, procedural terrain, atlas, iso renderer,
  camera, picking, chunk cache. ✅
- **M2 Roads & zoning** — road tools, zone painting, building spawn & levels. ✅
- **M3 Simulation** — population, jobs, demand, tithe, happiness, land value,
  milestones/unlocks. ✅
- **M4 Networks & services** — mana, water, services, coverage, overlays. ✅
- **M5 Life** — agents, traffic, day/night, lighting, particles, audio. ✅
- **M6 Polish** — onboarding, balancing, hazards tuning, bug sweep, docs. ✅

## 8. Verification

- `npm test` runs 25 vitest cases: terrain determinism, road/zone/building rules, spire
  chains and brownouts, water coverage, a 60-day growth run, determinism, save/load
  round-trip plus continued identical simulation, bankruptcy, pathfinding, restless dead
  and the Long Night, gloam creep/wards/founding-node loss, wild surge timing, fire spread
  and extinguishing, and a 60-day bot-played town with NaN checks.
- `scripts/balance.ts` plays 150+ days with the scripted bot and prints population, jobs,
  treasury, mana, demand, hazards and milestone days.
- `scripts/perf.mjs` builds a ~500-building city in-page and measures frame times per zoom;
  `scripts/playtest.mjs` drives the real UI with mouse/keyboard; `scripts/shot.mjs`,
  `start.mjs`, `atlas.mjs` produce screenshots for art review.

## 9. Decision log

- *Game name "Wardlight":* a wardlight is what the lore calls a chartered city; the
  name states the fantasy (hold the light against the dark) in one word.
- *Daily instead of weekly budget:* more feedback per session-minute.
- *Wells as radius coverage, not pipes:* pipes are the least-loved part of CS1 and
  fit the medieval fantasy poorly.
- *Mana adjacency + spire radius:* CS1's "buildings conduct power to neighbours"
  rule is what makes power planning forgiving; spires give the map a magical
  skyline.
- *Wild surge as the overdraw penalty:* a blackout that also breaks things makes
  mana budgeting a real decision, not a chore.
- *Gloam starts on the map rim:* gives the map a threatening edge, makes ward
  placement a spatial puzzle and provides a slow, visible fail state.
- *1×1 zoned buildings:* readability and sprite budget; big footprints are reserved
  for civic buildings so they read as landmarks.
- *Procedural sprites behind a manifest:* honours "all art original" while leaving a
  clean seam for hand-made pixel art.
- *Ley node yield raised 60→90 and Thrum Font moved to Township:* the first balance runs
  hit a hard mana wall at ~450 buildings with a surge every three days; mana should be a
  budget, not a ceiling.
- *Unlit buildings never abandon, dry ones do slowly:* the "no power" case in CS1 is an
  icon and stalled growth, not a death spiral; keeping that makes the early game forgiving
  while water stays a real need.
- *Fire rate cut to a quarter:* 97 fires in 150 days drowned the log in alarms.
- *Onboarding as a checklist, not a tutorial:* seven auto-completing "Charter tasks" in the
  first two milestones teach the loop without blocking play.
- *Bot player in `src/sim`:* balance claims are only worth what can be replayed; the same
  bot runs in tests, in the headless script and in the browser perf harness.
