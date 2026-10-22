# Wardlight: design (the core, after the scope reset)

This is the design of the game as it stands after phase 1 of the scope reset (2026-10-22): one people, the Vellish, and
the city-builder loop at its core. The numbers are read from the code; when the code and this file disagree, the code
is right and this file is fixed. The full design before the reset, with its 130 `### 4.NN` iteration sections and the
decision log, is `docs/archive/DESIGN.md`. A `§4.NN` in a code comment or an old note points there.

- **The plan:** `docs/RESET_PLAN.md` (the phases and the user's decisions in its §9).
- **What each phase did:** `docs/RESET_LOG.md`.
- **What was parked, and how it comes back:** `docs/PARKED.md` (only with the user's approval).
- **The open list:** `docs/NEXT_STEPS.md`.

## 1. Vision

A small city-builder in the world of Eda, after Cities: Skylines 1 and played in 30 to 60 minutes. The player founds a
wardlight in a valley at the edge of the Gloam: lays roads, zones homes, markets, crafts and arcane shops, keeps the
light burning with ley spires, and grows a hamlet into the Beacon of Eda. The magic of Eda is the city's utilities:
mana is power and light, the Gloam is the edge's pressure, miasma is industry's pollution, and the restless dead are
deathcare failing.

The user's rule for every mechanic (from the archive's §15): it exists only if the player can see it, decide about it and
lose by it. Depth over breadth.

## 2. The core loop

Road → zone → demand → growth → services and supply → budget → happiness, and around again.

1. **Roads** (`src/data/content/roads.json`): Dirt Track (10 crowns, speed 1, capacity 60), Cobbled Road (45, speed 1.4,
   capacity 160, land value +6, at the Hamlet), Lantern-way (130, speed 1.7, capacity 300, land value +14, 1 mana, at the
   Township). Track turns to mud in the Thaw.
2. **Zones** (1×1, grown, not built): Hearth (homes), Market, Craft and, from the Township, Arcane. Each grows through
   three levels with four looks a level.
3. **Demand** (`growth.ts`): four bars, one a zone, from jobs, homes, goods and shelves; each bar says why
   (`demandReasons`). **Growth** (phase 2-1): every 10 ticks three draws among the lots that can grow (empty, a road
   touching, out of the Gloam, schooled for Arcane, demand for their zone above zero), each growing with chance
   min(1, demand) × 0.45. `growthBlock` names why any zoned tile does or does not grow; the hover tooltip and the Growth
   view (`6`) show it.
4. **Supply:** mana from Ley Spires (and later the Nexus, the Thrum Font, the Crystal Mine), water from Wells and the
   Cistern. A zone needs both, and a road, to grow.
5. **Services** (eight coverage layers: watch, health, fire, faith, school, death, ward, leisure), each from its
   buildings' reach.
6. **Goods:** Craft works make goods, carts carry them to Markets over the roads (`agents.ts`); empty shelves and gluts
   feed the demand.
7. **Budget** (`economy.ts`): taxes and tithes in, upkeep out. Start with 15,000 crowns. A debt pays 1 % a day (the
   ways to lose, §5); the Crown lends 10,000 a milestone at 0.5 % a day. The Crown's levy each Thaw takes 5 % of
   a treasury over 10,000. Crown favour (neutral 50) exists but stands still since phase 1c (a known issue).
8. **Happiness:** the services, land value, miasma, the Gloam and the edicts; the inspector shows the terms.

**Time:** 900 ticks a day (90 s at 1×), 30 days a season, four seasons (the Thaw, Bloom, Ember, the Hush). Each day runs,
in order: buildings, social, traffic, agents, fire, surge, death, Gloam, economy, Gloam pressure, construction,
milestones (`src/sim/sim.ts`).

## 3. Buildings

27 buildings (`src/data/content/buildings.json`; "at" is the milestone that unlocks it):

| Kind | Buildings (cost, at) |
|---|---|
| Ley | Ley Spire (400, 0), Ley Nexus 2×2 (5,000, 4), Crystal Mine 2×2 (2,600, 4), Thrum Font 2×2 (6,500, 4) |
| Water | Well (300, 0), Cistern of Vesh 2×2 (1,800, 2) |
| Services | Watch Post (800, 0), Shrine of Aume (500, 0), Healer's Shrine (1,200, 1), Boneyard 2×2 (700, 1), Water-Mages' Hall 2×2 (1,600, 2), Ward Lantern (900, 2), Watch House 2×2 (2,600, 3), Academy of the Ley 2×2 (3,200, 3), Ossuary 2×2 (3,800, 5), Hospice of Vesh 2×2 (4,200, 5), Temple of the Four Vigils 3×3 (7,000, 6), Grand Academy 3×3 (9,000, 6) |
| Leisure | Garden of Aume (250, 1), Market Square 2×2 (1,400, 3), Trade Depot 2×2 (2,200, 3) |
| Wonder | Lantern of Vell 3×3 (22,000, 7) |
| Special | Founding Stake 2×2: the founding, it grows through four stages with the city |

## 4. Milestones and the Ledger

Nine milestones by folk (`milestones.json`), each with a Crown grant: Founding Stake (0), Hamlet (40, 2,000), Thorp (100,
3,000), Village (220, 4,500), Township (400, 6,000), Market Town (650, 8,000), Burgh (1,000, 11,000), Free City (1,500,
16,000), Beacon of Eda (2,200, 25,000). The Ledger holds 21 Charter tasks (`src/data/content/text/quests.json`); seven
edicts (`edicts.json`): Night Curfew, Free Healing Draughts, Rite Subsidy, Herb Garden Edict, Lantern Levy, Import Goods,
Scholars' Stipend, settable per district.

## 5. Hazards (the ways to lose)

- **Fire**, held by the fire coverage.
- **The wild surge:** a ley overload that twists buildings.
- **The restless dead:** deathcare failing (Boneyard, Ossuary, the Rite Subsidy).
- **The Gloam:** the dark at the map's edge, pushed back by light and Ward Lanterns; it greys and takes tiles.
- **Miasma** from crafts, which spoils land value and health.

The charter is lost three ways (the help's "Ways to lose"): the treasury below −8,000 × (1 + milestone ÷ 2) for five
days, the Gloam reaching the founding ley node, or forty restless dead walking the streets.

## 6. The world and the views

One valley map from the seed (`terrain.ts`): meadow, forest, hills, ruins, a river, a lake and the ley node. Eight
districts with per-district edicts. Info views: growth, mana, water, land value, happiness, traffic, ward, goods, district, miasma.

## 7. Art direction

2:1 dimetric pixel art, lit from the front right, crisp pixels and a dark 1 px outline on everything, so the set reads as
one. Sprites are the user's paintings from eda-lore's `inspirations/` through `npm run art` (`art/sources.json`,
hand-set anchors), shipped as one packed sheet (`public/art/sheets/`, `sprites.json`), or drawn in code
(`src/render/sprites.ts`, `painted.ts`, `drawn.ts`). Every building needs a sprite (a test holds it). The pipelines are
in `docs/ART_PIPELINES.md`. Day and night: the light pass and the lamps (`lights.ts`).

## 8. Tech

TypeScript + Vite, Canvas 2D, no engine. A deterministic fixed-tick sim in `src/sim` (no `Math.random`: `rngOf`,
`commitRng`), the renderer never changes the sim. Saves are version 8 and hold every layer; older ones are refused with a
message. Commands go through a command layer with replays (format 2). Content is data in `src/data/content/`, edited on
the dev board (`npm run devboard`). Tests are 15 themed suites in `tests/`; the browser checks are `scripts/smoke.mjs`,
`scripts/checklist.mjs` (`docs/CORE_CHECKLIST.md`), `scripts/playtest-ui.mjs` and `scripts/playtest-keyboard.mjs`.
