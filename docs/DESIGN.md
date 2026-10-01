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

### 4.14 Goods flow (iteration 2)
- Craft works produce goods each day: workers × 0.7 (×1.25 under the Herb Garden edict,
  ×1.15 in Bloom, ×0.5 unlit), stored up to 30 × level. Carts wait at a works until at
  least 4 goods are ready, load up to 12, and drive to a market chosen by low stock and
  distance. Markets hold 20 × level and sell workers × 0.5 + 1 per day.
- Empty shelves: market happiness −14 and a "no goods" icon; a works at 95 % storage:
  craft happiness −10. Full works push Market demand up; dry markets push Craft demand up.
  Deliveries take real road time, so congestion and layout matter.

### 4.15 Seasons (iteration 2)
- Four seasons of 30 days (a year is 120 days, ~1 hour at 3×): Thaw, Bloom (happiness +2,
  goods +15 %, gloam creeps at 0.7×), Ember, Hush (daylight 36 % of the cycle instead of
  50 %, hearths draw 25 % more mana, deaths ×1.2, gloam creeps at 1.6×). Season changes
  post a message and re-render the map.

### 4.16 Events with choices (iteration 2)
- Every 18+ days, with 12 % daily chance, one event whose condition holds and that has not
  fired in the last four fires: pilgrims, a Concord relic, the guilds' petition, a miasma
  cough, a candle-eyed child, Grimmen refugees, the Crown's collector. The simulation
  pauses until the player chooses. Choices apply immediate effects or timed modifiers
  (happiness, unrest, deaths, health, tithe, craft-tax cap) that expire on their own.

### 4.17 Edicts (iteration 2)
- City-wide policies with daily upkeep: Night Curfew, Free Healing Draughts, Rite Subsidy,
  Spire Wardens, Herb Garden Edict, Lantern Levy, Scholars' Stipend. Unlocked by
  milestone; effects are read by the systems they touch (unrest, health, quieting rate,
  surge threshold, goods/miasma, market tithe, education drift).

### 4.18 Districts and per-district edicts (iteration 3)
- A district layer (`district: Uint8Array`, 8 named districts: Hearthside, Stillward,
  Spirefield, Lanternrow, Greywall, Marketcross, Candlerow, Boneward) painted with a
  rectangle tool. Districts are free and cover any land tile.
- Every edict can be set city-wide or per district. Building-level effects (happiness,
  miasma, market tithe, quieting) read the district of the building; city-level effects
  (unrest, health, education drift) scale by the share of residents under the edict, and
  per-district upkeep scales the same way (never below a quarter of the flat cost).

### 4.19 Leystone (iteration 3)
- **Crystal Mine** (Township, 2×2, must be dug into hills, roads may now cut through hills
  at 3× cost) yields 8 leystone/day (4 unlit), stored up to 60. Each mine keeps two carts
  of its own once enchanters exist; they deliver to the Arcane building with the emptiest
  workshop. Enchanters consume workers × 0.25 leystone/day and sell artifacts for 5 crowns
  each, a new ledger line. Without leystone an Arcane building is unhappy and shows a
  no-goods icon; the Goods overlay (`o`) shows shelves, workshops, works and mines.

### 4.20 Event chains (iteration 3)
- Choices are recorded (`firedEvents` holds `id:choice`). Three one-time follow-ups fire
  when their parent choice was taken: the relic is stolen (after giving it to the
  scholars), the guilds return with a lasting pact (after accepting their bargain), and the
  Grimmen ask for a Boneyard of their own (after taking them in), which actually places one.

### 4.21 Sound and accessibility (iteration 3)
- The ambient mix now follows the camera: river noise when water is in view, fire crackle
  near burning buildings, market murmur by day near markets, ley hum near spires, crickets
  at night. Milestones play a short generative pentatonic phrase seeded by milestone and map.
- Menu settings: colour-blind overlay ramps (orange→blue instead of red→green) and a UI
  scale (85–130 %), persisted in localStorage.

### 4.22 Trade Depot (iteration 4)
- **Trade Depot** (Village, 2×2). Each day, Craft works at 80 %+ storage sell down to
  half their storage (up to 8 per depot), and mines with no enchanters sell surplus
  leystone; exports are banked on the day and shown in the ledger. Prices drift by season:
  potions 2 / 2 / 2.5 / 3 crowns (Thaw / Bloom / Ember / Hush), leystone 3 / 4 / 3 / 2.5.
  The **Import Goods** edict lets the depot stock empty markets at twice the export price.

### 4.23 Calendar festivals and the deepened Wellspring (iteration 4)
- Three calendar events fire on fixed season days, once a year, never in the founding
  Thaw: Thaw-day (feast or ward labour), the Remembrance of the Hollowing (mid-Ember) and
  the Hush vigil (mana +15 % for 10 days but the Gloam holds still). Modifiers gained two
  kinds: `mana` and `gloamHold`.
- Clicking a ley node opens a node panel. From Burgh a node can be **deepened** twice
  (8,000 then 14,000 crowns, +45 mana/day each): the lore-honest answer to the mana ceiling.
- **Undo** (Ctrl+Z, up to 12 steps) restores roads, zones, districts, buildings and crowns
  from a snapshot taken before each player action; time and agents are left alone.
- Districts show population, jobs, happiness and tithe in the Edicts panel and can be
  renamed. Autosave is now daily. The light map drops to quarter resolution at 1× zoom.

### 4.24 Creatures, first wave (iteration 6)
- Creature agents share the agent structure (`kind: Creature`, `species`, an anchor) and
  ignore roads. Populations are managed every 50 ticks against per-species caps; movement
  runs every tick with per-species behaviour.
- **Glimmoths**: two per ley source (nodes, lit spires, nexus, wards, lofts) at night,
  fluttering on wobbly orbits with glow and sparks; gone by day.
- **Thrumhares**: one per 25 free meadow tiles by day, hopping between meadow and grass
  tiles with pauses; gone at night.
- **Wisps**: one per deathcare building, one per restless (which they follow), plus one per
  8 unquieted dead: the visible early warning that the dead are stirring.
- **Moth-Loft** (Thorp, needs a node or spire within 6): Craft goods +20 % within 8 tiles.

### 4.25 Gloam-hounds, the Hunters' Lodge and the Warding Wall (iteration 7)
- **Gloam-hounds** spawn at night (from day 6) in packs of 3–5 on Gloam tiles within 22
  of a building that lies within 14 tiles of the Gloam; more packs with population and
  2.2× as often in the Hush. They stalk the nearest unlit, unwarded building, frighten
  buildings within 3 tiles (happiness −5) and, rarely, tear a level-1 building to ruin.
  Lit tiles, ward coverage and strong Watch coverage scare them back to their spawn tile;
  they slink into the grey at dawn.
- **Hunters' Lodge** (Thorp, 2×2): each day kills hounds within 12 tiles (80 %); strong
  Watch coverage clears some too. Small leisure bonus.
- **Warding Wall** (Thorp): a line tool like roads, 60 crowns/tile (120 in hills), 0.4
  upkeep and 0.5 mana per tile. Gloam creep never crosses a wall tile; hounds cannot enter
  one and slide along it. Walls draw as autotiled stone with leystone inlays that glow.
- **Bug fix:** roads (and walls) placed later left a visual gap at the join because the
  existing neighbour's autotile lived in a chunk that was never marked dirty; changes now
  dirty the four neighbours as well (`markDirtyAround`).

### 4.26 Wyrmcraft I (iteration 8)
- **Wyrm-Cradle** (Township, 2×2, needs a node or spire within 6 to raise, must be lit to
  warm; 8 mana/day) holds two eggs. **Tamer's Lodge** (Township, 2×2) within 10 tiles of a
  cradle lets hatchlings grow. Eggs arrive only through events: the Crown's gift on the
  first cradle, a warm seam in a mine that has run 20 days, a quiet boneyard with an
  Ossuary and six wisps, an old Moth-Loft, poachers at the gate.
- Growth: egg 30 warm days → hatchling → drake (20 days, fed 6 goods/day from the nearest
  stocked market, trained). Training: gentle ×0.8, hard ×1.3 (2 %/day the cradle catches
  fire), wild ×1.6 (1 %/day the dragon leaves). Unfed dragons lose mood and leave at 0.
  Wyvern and wyrm stages wait for the sky layer.
- Materials: eggshell per hatching, scale per stage (line-dependent), wyrmfire monthly from
  ember drakes (Craft +15 % while stocked, decays 0.05/day).
- Roles (drakes): **Warden** of a district (watch and fire coverage +0.5 across it, the
  drake patrols the district) and **Delver** at a Crystal Mine (+6 leystone/day for ember,
  +4 otherwise). Drakes are creature agents drawn per line (8 lines × hatchling/drake × 2
  frames) with line-specific glow and particles.
- Wyrms panel: cradles and slots, materials, each dragon's mood, hunger, growth, training
  and role selection.

### 4.27 Quests, hints and the Chronicle (iteration 10, done)

**Why here:** the game has grown from four systems to twenty; the "Charter tasks" list
only covered the first ten minutes. This milestone sits right after Wyrmcraft II and the
first lore-drop features and before the Sleeping Wyrm, so every mechanic that exists gets
a guided path before more are added.

**Quests ("the Charter's Ledger").** A data-driven list (`src/data/quests.ts`, 46 quests)
of small goals, each with: id, chapter, title, one-line hint, a `when` condition that makes
it *available*, a `done` condition, an optional *focus* (a tool to select, a building to
pick from the toolbar, a panel to open, an info view to switch on, or a place to centre
the camera) and a reward in crowns. `checkQuests` runs once a day over the whole list, so
a goal reached before it was shown still completes and pays; the reward is paid once and
the completion is written to the Chronicle. At most three quests are shown, chosen by
priority from the available set, in the left panel with a progress count (done/total), a
collapse button, and a *Show me* button per quest that carries out its focus. Chapters:

| Chapter | Quests (done condition) |
|---|---|
| Founding | draw a road · zone hearths · zone craft and market · raise a spire · dig a well · watch post and shrine · reach Hamlet |
| Light and water | light every building · water every building · build a Cistern |
| Mana | build a Nexus · raise a Thrum Font (when demand passes 80 % of flow) · deepen the Wellspring |
| The dead | build a Boneyard · lay a restless to rest · build an Ossuary |
| The grey edge | raise a Ward Lantern · burn back 50 Gloam tiles · draw 20 tiles of Warding Wall · kill 10 hounds · raise a gate of the Pass |
| Goods | first cart delivery · no market short · build a Trade Depot · sell 200 goods to caravans |
| The arcane | educate a third of the folk · first Arcane building · dig a Crystal Mine · first artifact sold |
| Districts | paint a district · set a district edict |
| Seasons | survive a Hush |
| Beasts | build a Moth-Loft |
| Wyrmcraft | raise a cradle and lodge · accept an egg · hatch it · give a drake a role · fly a courier · win a bout |
| The Crown | each milestone from Thorp to Beacon of Eda |

New stat counters back the quests: goods delivered, hounds killed, Gloam tiles burned,
restless laid, caravan goods sold, courier trips. Quests planned but not yet backed by a
counter (survive a brownout, rename a district, the Hush vigil, the Thaw feast, glimmoths
seen, a wisp ring) are the first additions for a later pass.

**Hints ("the Advisor").** Above the quests, one contextual line derived from the city's
worst current problem, in this order: mana overdrawn, treasury in debt, a quarter of
buildings unlit, a quarter dry, unquieted dead without a Boneyard, more than five restless,
markets short, hounds without a Lodge, unrest above 35 %, happiness below 40, Gloam within
6 tiles of a building without a Ward Lantern. Each has a *Show me* action. Never more than
one line, and nothing at all while the town has fewer than four zoned buildings.

**The Chronicle.** A separate log, `state.chronicle: { day, kind, text, x?, y? }[]`,
kept to the last 200 entries and saved. Only real in-world events go in: milestones,
season changes, fires and ruins, surges and their warnings, Gloam pockets, hound raids,
the restless rising, dragon hatchings, stages, bouts and departures, caravans and the
merchant, events fired and the choice made, quest completions. Citizen chatter, tips and
advisor lines stay in the bottom-right ticker. `pushMessage` gained a `world` flag and an
optional place; `milestone` and `bad` messages chronicle automatically and a "(x,y)" in
the text is picked up as the place. UI: the *Chronicle* button (or `C`) opens a modal
filtered by All / Milestones / Good tidings / Ill tidings, newest first, each entry with a
day stamp and a ⌖ button that closes the modal and centres the camera on the place.

### 4.29 The Sleeping Wyrm (iteration 11)

**Placement.** One ley node per map, the farthest from the founding node and at least 40
tiles away, is the wyrm's. Maps whose nodes all lie closer have no wyrm. The node is drawn
inside a coil of ridged grey scale (two sprites, behind and in front of the standing
stones) with runes that glow at night; a raised head when awake, a skull and ribs when
dead. `state.wyrm` holds node, state (`sleeping | awake | bound | dead | none`), the
waking meter, tribute count and due day, unfed and sulking days, fed-days, refusals and
the current flyover.

**Waking.** Each lit Ley Spire within 6 tiles of the node adds 3 waking points a day
(capped at 6 a day); without spires the meter fades half a point a day. Warnings post to
the Chronicle at 50 and 80. At 100 the wyrm wakes. Deepening the wyrm's node wakes it at
once (the node panel's button says so). Giving up that node is a legitimate strategy.

**Awake.** The tribute event fires the day it wakes and on the first day of each season
after that: pay in crowns (1,500, half again as much each time), pay in goods (150 taken
from the market shelves; fewer than half counts as a refusal), or refuse. Refused, the
wyrm flies to the city (sky layer, altitude 48, a district-sized shadow, embers), circles
for 26 seconds and sets up to four buildings under it alight with wyrmfire, then flies
home and sleeps again with the meter at 50, so the same spires wake it again in about
a fortnight.

**Binding.** The **Wyrm-Court** wonder (Free City, 18,000 crowns, 40 mana, 150 upkeep)
offers the binding event while the wyrm is awake and no tribute is due; the song needs a
third of the folk educated or it fails, costing a happiness dip and an immediate tribute
demand. Bound, the wyrm is the city's guardian:
- its lair wards 30 tiles around the node (ward coverage, and it burns back up to 40 Gloam
  tiles a day from the inside out);
- hounds never spawn or stay within the lair;
- every building gets +10 happiness;
- once a season it circles the city, scattering glimmoths, and burns nothing;
- it eats 40 goods a day from the markets, largest shelves first. Ten days without three
  quarters of that and it **sulks**: no ward, no happiness, and a sulking event every ten
  days offering leystone (60 from Arcane stock) or 3,000 crowns as an apology. Forty days
  of sulking and it **dies**; its bones quiet 80 dead a day city-wide;
- fed and content for a full season it lays a **vein egg** (Vein line, 6,000 crowns if no
  cradle has room).

**UI.** The node panel names the node "The Sleeping Wyrm" with a waking meter and a
description of its state; the Wyrms panel has a Vein-Wyrm row with *Show me*; five
Ledger quests (find, tribute, Court, bind, feed a season) and two Advisor lines (spires
waking it, guardian sulking); a hostile flyover drives the music's danger pulse.

### 4.30 Panel layout (iteration 11)

The toolbar and the Ledger sit in one left column (`#left`, a flex column) so they can
never overlap: the Ledger shrinks and scrolls under a tall toolbar. The Info views,
building info and message ticker are draggable by their heading or ⋮⋮ grip, clamped to
the window, with positions remembered per panel in localStorage.

### 4.31 Magical buildings I: Huruhui and Gekiryu craft (iteration 12)

Four buildings from §8.3 and §11, each a number on an existing system:

| Building | Unlock | Rule |
|---|---|---|
| **Torrent Mill** (Ley tab) | Township | 1×1, must touch river or lake water and a road; +30 mana a day with no Vein. 5,200 crowns, 40 upkeep. Water spray particles at 2× zoom or closer. |
| **Glimhouse** (Services) | Village | 2×2, 4 mana. Craft works within 8 tiles ignore the new **Hush penalty** (Craft output ×0.8 in the Hush) and make +10 % all year. The building inspector shows "warmed by a Glimhouse" in the Hush. |
| **Astral Observatory** (Services) | Market Town | 2×2, 6 mana. While lit, a **Forecast** block in the Ledger (and its own panel) lists the next five days: season change, surge countdown or brownout edge, hound nights, festivals, Ring bouts, the wyrm waking or asking tribute, an unfed guardian. Pure function `forecast(state)` in `src/sim/forecast.ts`. |
| **Hanging Gardens** (Services) | Township | 2×2, must touch hills and a road; no mana. Makes 6 goods a day that carts collect like a Craft works (gardens are cart homes), health coverage radius 8, land value +10, and it is **self-lit**: a light source of radius 2 that lights its neighbours by adjacency without a spire. Unlocks the Glowvine Lane. |

**Glowvine Lane** (Roads, 220 crowns a tile, 2.5 upkeep, no mana, cobble speed, land
value +12). Requires a Hanging Gardens to exist; a tile is lit only within 12 tiles of a
living Hanging Gardens, and lit tiles light adjacent buildings like a lantern-way. The
price is deliberately above the lantern-way's, since the light is free of mana forever.
Green vine-light at night; the road manifest gains `road_glowvine_0..15`.

Everything in §8.3 that the design kept is now built (the Weather Vane became the Storm-Caller's Peak).

### 4.32 Longwood and Lukuku: Portal Arches, the World Tree, the Ruins (iteration 13)

- **Portal Arch** (Ley tab, Market Town, 1×1, 4,000 crowns, 12 mana, at most two). When
  both arches are lit, the road A* gains edges from every road tile beside one arch to
  every road tile beside the other at cost 1, so carts, citizens and the restless route
  through them; an agent whose next path tile is more than 1.6 tiles away steps out of the
  far arch at once with a violet burst at both ends (`portalTrips` stat). The path cache is
  bumped whenever an arch's lit state changes.
- **Ruins of Lukuku** (terrain type 8): map generation seeds one flagstone cluster of six
  or more tiles in a forest at least 28 tiles from the founding node and 9 from any ley
  node (most seeds; some maps have none). Flagstone ground tiles with broken columns, dead
  trees and rocks as props; not zonable or buildable, roads may cross. The **Ruin Delve**
  (Services, Township, 2×2, must stand on ruins) brings up a relic a day, raises artifact
  income 15 % while it works, and disturbs half an unquieted dead a day. Its chain: *The
  first fall* (catalogue for the Academy or sell the mosaic) then *The door under the
  flagstones* (seal it with the Rite, or open it: a hoard or eight restless).
- **World Tree Sapling** (Leisure, Free City wonder, 3×3, 20,000 crowns, no mana). Grows a
  stage every 30 days from sapling to full-grown (four sprites): leisure radius 6, 12, 18,
  24; roots hold the Gloam (ward coverage 0.6, no burning) for 4, 8, 14, 20 tiles; +1
  happiness per stage everywhere; glimmoths gather at stage 2 and up; land value +20.
  Each growth is a Chronicle milestone.

### 4.33 Minimap (iteration 13)

A draggable panel beside the ticker holds a 256×128 isometric image of the map rebuilt
every 30 ticks (terrain, Gloam, roads by tier, walls, buildings by zone colour, ley, the
wyrm's node) with the camera's view box drawn on top every frame. Click or drag on it to
jump the camera there; scroll on it to zoom; a collapse button hides the image.

### 4.34 Beasts of the Concord and the sky (iteration 14)

- **Concord Wardens** (species `golem`). Each working Crystal Mine has a 3 % chance a day
  to wake one on a hills tile within 6 (cap 12). Wild wardens walk slowly, drift toward
  the city, never despawn, and frighten every building within 4 tiles (−10 happiness);
  fire, hounds and hunters ignore them. A lit **Golem Foundry** (Services, Burgh, 8 mana)
  binds any wild warden within 12 tiles: a bound warden paces by the foundry, adds 12
  hands to the workforce with no housing, and costs the foundry 10 mana a day. A wild
  surge breaks every binding. Three bound wardens open the *Concord vault* event: a grey
  egg.
- **Skyrays** (species `skyray`, sky layer at altitude 60). In Bloom and Ember a school of
  five may enter at one map edge and cross to the opposite one, casting manta shadows. A
  lit **Ley Beacon** (Ley tab, Burgh, 25 mana) within 30 tiles turns the school: the rays
  circle it for the rest of the season (phase 1), the whole city gets +3 happiness,
  **rayscale** accrues (Materials) and artifacts sell for 10 % more while any is left, and
  a *skyray nest* event can offer a sky egg. When the beacon goes dark or the season ends
  they fly off the map.
- **Drake Mews** (Services, Burgh, 6 mana): every Watch House patrols twice as far while
  the mews is lit; below 40 city happiness the mews' own fire chance is ×12.
- **Taming edicts**: *Beastmasters' Charter* (cradles and foundries draw 40 % less mana,
  hound packs 50 % more often, 40 c/day), *Hunters' Bounty* (lodges clear hounds within
  24, the Watch kills them twice as often, thrumhares vanish; 20 c/day plus 15 per lodge),
  *Wyrm-Peace* (tribute and the bound wyrm's lair ward halved, 80 c/day).

### 4.35 Ledger hygiene (iteration 14)

Quests are checked every 50 ticks instead of daily, a quest whose goal is already met is
hidden from the panel at once (the next check pays it), and several completions in one
check post a single ticker line, so the panel and the ticker stop filling with finished
tasks.

### 4.36 Vehicles (iteration 15)

- **Floating carts** (cart variant 3). Each level-3 Arcane workshop entitles the city to
  two hovering carts, spawned in place of mule carts by the daily cart quota. They ignore
  congestion, add nothing to traffic, glow at night, and each draws 1 mana while it has a
  path (`floatingMana`, added to demand).
- **Quay and barges** (Services, Village, 1×1, must touch water and a road). Every day
  each quay with works within 8 tiles holding more than 8 goods sends one barge (cart
  variant 4, at most one out per quay) along a water A* path to the quay whose nearby
  markets have the most empty shelf space, carrying up to 40 goods; on arrival it fills
  the emptiest markets and is removed. Bridges pass overhead. Barges never count toward
  the road-cart quota or traffic.
- **Drake riders** (species `rider`). A lit Drake Mews keeps two riders (cap 4). A rider
  flies (sky layer, altitude 24) to the nearest restless or burning building within 40
  tiles: a restless is laid to rest at once; a fire is doused six times in ten. Then it
  flies home and rests. `riderRescues` counts both.
- **Sky-Dock and the airship** (Leisure, Beacon of Eda wonder, 2×2, 30 mana). On day 3 of
  each season a lit dock loads up to 200 surplus goods (stock above 10 at every goods
  source) and the airship (species `airship`, altitude 70, gondola lights and smoke) flies
  to the map edge; ten days later it returns to the dock and pays goods × season price ×
  1.6. Half the time the captain brings *The captain's story*: rayscale and a goods
  modifier, thirty passengers, or happiness.
- Golem haulers from §8.4 are folded into the foundry's labour and not built separately.

### 4.37 Longwood and the Fen-Nex (iteration 16)

- **War-tigers** (species `tiger`). On maps with 220 or more forest tiles, from day 40 and
  Village up, a tiger may come out of the forest at night near a building (5 % a night in
  Ember, 8 % in the Hush, 2 % otherwise, halved under Hunters' Bounty; cap 4). By night it
  stalks the nearest hearth with fewer than full Watch coverage, unafraid of light; by day
  it mostly lies up in the trees. Each day a tiger lying beside a hearth may take a
  resident (unquieted +1). Buildings within 5 tiles lose 12 happiness. Killed by Hunters'
  Lodges within 12 (20 under the Bounty, 35 % a day), Watch coverage above 160 (25 %), or
  in a warden drake's district (50 %). A rare *Something out of Longwood* sighting lifts
  happiness on such maps.
- **The Fen-Nex** (events). *The Fen-Nex come to market* (Township, 250 folk): trade
  (honest half the time), grant them a quarter, or turn them away. The **Fen-Nex quarter**
  is the painted district with the most markets: its markets pay no tithe and hold twice
  the goods (`marketStockCap` reads a per-tick district snapshot). Twenty days later *A
  gift from the quarter*: a **fen-drake egg** (new ground line `fen`, russet cat-dragon,
  ninth sprite palette) or a basket of warm leaves, half and half.
- **Mana-storms** (`state.storms`). Every wild surge leaves one at its first ruin: a pocket
  of radius 5 that drifts up to three tiles a day for four days, and each day gives every
  zoned building under it a 35 % chance to level up or down at random. Ward coverage
  above 90 at its eye dissolves it. Rendered as a violet light with rising motes.
- **Font of Quieting** (Services, Free City, 15 mana, one only): every deathcare building
  quiets 50 % more dead and the restless are laid down with an extra 25 % a day everywhere.
- **Cameos**: *Dr. Jelly* (one potion, one of four large effects), *The Cloud Forest
  Wizard* (twelve glimwood tiles near the founding node, a season of happiness), and a
  quiet traveller who leaves a purse and a note. Descriptions only, no sprites.

### 4.38 Scenario charters, quest counters, district summaries (iteration 17)

**Scenario charters** (`src/sim/scenario.ts`, chosen on the title screen, stored as
`state.scenario`; the open valley is the default and unchanged):

| Charter | Twist | Goal (a priority-0 Ledger quest, +5,000 crowns) |
|---|---|---|
| The one-node valley | terrain generates only the founding node; it yields 180 mana a day instead of 90; no Sleeping Wyrm | reach Burgh |
| The Gloam-locked island | everything beyond about 36 tiles of the founding node (noisy edge) starts as Gloam | Township and 300 Gloam tiles burned back |
| The inherited collapse | an aggressive bot plays 28 days, then: treasury −7,000, eight buildings ruined, 30 unquieted, eight restless at the stake, overdraw at day 3 of 5; the Chronicle starts there | ten clean days in a row (treasury positive, no ruins, no restless; `cleanDays`), then Burgh |

**Quest counters.** The six goals from §4.27 that lacked a counter now have one:
`brownoutsSurvived` (an overdraw that ends without a surge; `brownoutOpen` marks a running
one), a named district (`districtNames`), the Hush vigil kept and the Thaw feast held
(`chose` on the calendar events), `mothsSeen` and `wispRing` (six or more wisps at once).
A **Done** button on the Ledger lists every completed quest by chapter.

**District summaries.** In the Districts view each label gets a second line with the
district's zoned-building problems: unlit, dry and empty-shelved counts, in red, only
when there are any.

### 4.39 The daughter charter (iteration 18)

**The daughter charter** is the endgame. At Beacon of Eda the panel of any ley node that
is not the founding node, not the wyrm's, and at least 30 tiles from the Stake offers
*Found a daughter wardlight* with a name. Founding places a second Founding Stake on a
free 2×2 beside the node (forest cleared), a three-tile track along its south edge, a
13×13 district named after it (the next free district slot), pays a 15,000-crown grant and
writes the Chronicle. Both wardlights share one treasury, one Charter and one milestone
ladder; the daughter's population is the folk living within 30 tiles of its stake. At 500
folk the **Twin Beacons** fire once: 10,000 crowns and a Chronicle milestone. Two Ledger
quests carry it. `state.daughter` holds node, stake position, name, day and the twin day.

**Platform.** Wardlight is a desktop browser game: mouse and keyboard only, by decision
(see the decision log). Touch gestures and a phone layout were tried in iterations 18 and
20 and removed again; they doubled the UI surface to test for every change.

### 4.41 Challenge results and accessibility (iteration 20)

- **Challenge results**: `challengeDay` records the day the daily goal is met; the Ledger
  shows a progress line while the challenge runs and a result line with *Copy result*
  afterwards (a one-line share text with the site link, via the clipboard).
- **Accessibility**: every titled button gets an `aria-label`, the toolbar a toolbar role,
  modals a dialog role, the ticker `aria-live="polite"`, the minimap a label.

### 4.42 Sound pass: positional cues (iteration 21)

The sim raises **sound cues** through the same effect channel as fire and surge bursts
(`SoundCue`: howl, roar, growl, horn, bell, song, storm, stomp, rain), each with a tile.
The game loop converts the tile to a stereo pan from its position across the camera view
and a volume that falls off with distance outside the view, so a hound pack howling to
the north-east of the screen is heard to the right and quietly. Sites: hound packs
spawning (howl), the wyrm taking wing (roar), a war-tiger coming out of the forest
(growl), the airship leaving and returning (horn), a barge casting off (bell), skyrays
turning on a Beacon (song), a mana-storm forming (storm), a Concord Warden waking (stomp),
Call Rain (rain). Each voice is a few oscillators and filtered noise through a
`StereoPannerNode`. Ambience gains three positional emitters: Torrent Mills in view add to
the water bed, a mana-storm in view crackles, walking golems in view thud at one-second
intervals, and skyrays in view sing every twelve seconds, panned at random.

### 4.43 Map sectors: the Charter line (iteration 22)

The 128×128 map is sixteen **sectors** of 32×32 tiles (`state.sectors`). A new game
charters the founding sector and every sector whose edge lies within 18 tiles of the
founding node (usually four, sometimes six); the daughter charter also charters its
stake's sector. Beyond the Charter nothing can be built, zoned, paved, walled, gated or
terraformed: the ground is drawn dimmed with a surveyor's hatch, the minimap dims it too,
and clicking it with the select tool opens a panel with the sector's name, its price, the
Gloam inside and *Extend the Charter*. From Hamlet a sector that touches the Charter can be
bought: price 2,500 × (1 + 0.6 × sector distance from the founding sector) × (1 + 0.2 ×
sectors already bought). On purchase the Crown's surveyors ward the ground: every Gloam
tile inside the sector that is not on the map's four-tile rim is cleared (counted in
`gloamBurned`), so the Gloam retreats as the Charter grows, the CS1 tile-purchase feel
with the setting's own reason. Saves from before sectors own the whole map; the bot buys
the cheapest touching sector when it holds more than twice the price. One quest.

### 4.28 Ambient music (iteration 9)
- **Generative, procedural, no files.** A scheduler with a 300 ms look-ahead writes notes
  into WebAudio a bar ahead, so the music never stutters with the frame rate.
- **Structure:** ~58 BPM, 4/4, a four-bar chord cycle in a mode that follows the world:
  day is Lydian-tinged major pentatonic (bright, hopeful), dusk and night are Dorian
  (soft, wistful), the Hush is Aeolian with sparser notes and a lower drone, Bloom adds a
  high counter-melody. Danger (a fire in view, hounds near, a surge warning, unrest over
  40 %) drops the melody to the drone only and adds a slow low pulse.
- **Voices:** a drone pad (two detuned triangles and a sine an octave below, through a
  slowly moving low-pass), a plucked lead (sine with a fast attack and 1.2 s decay, like a
  harp), soft bells at night (sine with a 5th overtone), a bass note on the downbeat.
  Melody notes are chosen by a seeded random walk over the current mode's pentatonic,
  with rests, so phrases repeat loosely but never exactly.
- **Mix:** music sits under the ambience and effects (0.18 of master), ducks to 0.08 for
  two seconds after alarms, and has its own toggle in the menu (persisted). Milestone
  phrases (4.21) play over it in the same key.

### 4.44 The guild council

A lit Guildhall seats the Carters, the Alchemists, the Spire-Wrights and the Sextons of
Morrow. Standing 0..100 drifts toward 50 (2% a day) and moves with daily drivers listed in
the Edicts panel. Every 20 days the least pleased guild petitions for its edict (Import,
Herb Garden, Spire Wardens, Rite Subsidy). Grant (+15; the edict becomes a 20-day promise:
+1 a day kept, −2 a day broken), pay 400 crowns (+8) or refuse (−12, happiness −2 for 8
days). Boon at 70, strike at 25: depots ×1.5 / ×0.5 export cap, Craft +8% / −10%, ley
stores +20% / −20%, deathcare +15% / −15%. The Lantern Fair and the feast also move
standings. Quests: seat the council, please a guild.

### 4.45 Trade routes

`trade.ts` lists the Gloam road, river barges, the airship, the arches and the Twin Road
with an open flag and a note; the Ledger shows them with a Show button. The Twin Road needs
a depot within 12 tiles of the daughter's stake and another at least 20 tiles away; it moves
up to 30 goods a day from works (stock above 8) near the mother depot to markets near the
daughter depot, pays a Crown toll of 1 crown a good into the day's trade income, and counts
toward goods delivered. The depot's info panel names the open routes.

### 4.46 Festival depth

Thaw feast: 300 crowns and up to 40 goods from the fullest markets (each keeps 4); +3
happiness for 15 days city-wide and +5 in every district whose markets contributed
(district-scoped modifiers via `modifierSumAt`); under 10 goods a thin feast gives +2 for
8 days. Remembrance: with an Ossuary, reading the names stirs +3 unquieted (else +12) and
the silence lays −15 (else −6). Hush vigil: draws min(120, stored mana); the Gloam holds
6 + floor(mana/12) days; under 60 drawn the spires carry it (+15% demand for 10 days).
Lantern Fair (Bloom day 12, Guildhall, 60 folk): 500 crowns for a `price` modifier of +50%
on exports for 6 days, Carters +10, Alchemists +5; or shut the gates, Carters −8.

### 4.47 The Weave view

Overlay `weave` (key W): dragon auras in their line colour (alpha fading with distance),
then the nearest node's aspect within 10 tiles, Gloam beneath. Legend lists the eight
aspects and the aura swatch.

### 4.48 Cross-line breeding

`breeding.ts`: `canBreed(s, cradle)` requires two dragons at stage ≥ 2 of different lines,
mood ≥ 60, a lit cradle whose node aspect matches one parent, and a free cradle slot
anywhere. `dailyBreeding` on day % 120 === 50 lays one egg per breeding cradle:
`line` = the attuned parent's, `second` = the other's. Effects: `dragonAuras` adds an aura
of `second` at radius −3; attunement counts either line; growth adds half the second
line's scale; wyrmfire from either Ember. Quest `k_cross`.

### 4.49 Relic sets

`relics.ts`: `RelicState { pieces, uncatalogued, complete, lastRelics }`. `dailyRelics`
turns each 12 of `stats.relics` into an uncatalogued piece; with an Academy or Grand
Academy one piece a day is catalogued into a random incomplete set (deterministic rng).
At three pieces the set completes with a chronicle line. `relicDone(s, id)` is read by
networks (lanterncores +60 storage), growth (ninehouses +3 happiness; Hall of Marvels
artifacts +5% per set), hazards (saltspoons ×1.1 quiet) and sectors (concordcharts ×0.8).
Quest `k_relics`.

### 4.50 Guild halls

`GuildState.pleasedDays` counts days at ≥ 70 with a seated council; at 10 the guild calls
`raiseHall`, which spirals 2..9 tiles from the Guildhall for a spot `canPlaceBuilding`
accepts and places the hall with `placeBuildingRaw` (cost 0, category `special`, unlock 99
so it never appears in the build menu). `hallActive(s, kind)` is false while the guild is
at or under 25; coverage, storage, the depot count, miasma scrubbing and the surge
threshold all read it. Quest `k_hall`.

### 4.51 Construction and the builders

Nothing the player places stands at once. `placeBuilding` and `trySpawnBuildings` create the
building in state `building` with `work` and `workTotal` in builder-ticks (`construction.ts`):
zone buildings take one day, others `ceil(cost / 1500)` days clamped to 1..6 and wonders
half again (cap 10), free guild halls two. A site is inert: every system reads `state ===
'ok'`, and spires, the mana graph and the quest counters skip `building` explicitly.

Zone buildings are raised by the folk who will live or work there at one work per tick (a
day, no builders). Placed buildings are raised by the Warden-Reeve's builders, a new agent
kind (`AgentKind.Builder`) hired at the Founding Stake's road: 2 + population/150, capped at
10, kept daily and topped up as soon as a site exists. Every tick idle builders take the
nearest understaffed site (at most three per site, two assignments per tick to keep A* cheap),
walk the roads to its road tile at 1.4 tiles a second, and work it: `work -= 0.25 + present`.
With no builder present the folk still raise it at a quarter pace, and a site no road reaches
from the Stake says so in its panel. At zero the building finishes (ticker line for
non-zone buildings, a bell cue), and the crew moves on.

Rendering: a site draws its sprite as a 22% ghost with the bottom `1 - work/workTotal` of
its rows at full strength, so buildings rise out of their foundations, and a 16-pixel
progress bar at 2x or closer. Builders have their own four-frame sprites (cap, plank,
hammer); at a site they swing the hammer and throw sparks, and every 120 ticks a site with
builders raises a `hammer` sound cue. `construction.instant` skips all of it for tests and
headless tools (the vitest setup file turns it on; `construction.test.ts` turns it off).

### 4.52 Bloodlines

`canBreed` reports `trueblood` when both parents carry `second`; `dailyBreeding` sets
`Dragon.trueblood`. `dragonAuras` gives the second aura the full radius; `dailyDragons`
multiplies growth by 1.25 and scale by 1.5. `stats.truebloods`; quest `k_blood`.

### 4.53 Relic buildings

`BuildingDef.relic` names the set; `isBuildingUnlocked(milestone, key, relics)` refuses
without it and `placeBuilding` says which set is needed. Buildings: `corelantern` (ward r12
0.8, selfLit, 30 storage, max 2), `househall` (faith r12 0.9, land value 15, +2 happiness via
`hasMarvel`), `saltfont` (death r14 quietRate 30), `chartroom` (leisure r6, exports ×1.15,
counts as an observatory for `forecast`). Quest `k_relicbuild`.

### 4.54 Guild rivalries

`RIVAL_OF` pairs the guilds; `guildDrivers` adds −0.4 while the rival is at or above 70;
granting a petition takes 5 from the rival. Shown in the council block and the petition text.

### 4.55 Dev tools

A playtesting panel (backtick key, or Menu → Dev tools…) built from `DEV_COMMANDS` in
`dev.ts`: pure commands on the state grouped as Purse (crowns, rare goods, next milestone,
fill homes), Time (run a day, run to the next season, toggle instant build, finish every
site, hire builders), Hazards (hound pack, restless, war-tiger, mana-storm and Gloam pocket
at the camera centre; wild surge, fire, clear all Gloam, +20 unquieted), Wyrms (lay an egg of
a line, grow every dragon a stage, dragons content, wake the wyrm, flyover), Guilds & relics
(a guild ±25, petition now, complete a relic set) and Events & map (fire any event by name,
charter the whole map, flatten here). The panel shows a live status line and copies a state
summary. Rule: anything table-driven (events, relic sets, guilds, egg lines, walker jobs)
appears in the panel by itself through its select; a mechanic that needs a bespoke action gets
its command in the same iteration. `runDev` counts every use in `stats.devUses`, writes one Chronicle line the first
time, and the daily-challenge result is marked "(dev tools used)". The game pauses after
each command so the effect can be inspected.

### 4.56 The great wyrm

`stageCap(d)` is 4 for a trueblood, else the line's cap. Stage 4: `WYRM_EATS_GOODS` 20,
auras ×1.5 in `dragonAuras`, pressure −0.1 each (cap 0.2) in `computeGloamPressure`, scale
×2 on the growth, `stats.greatWyrms`. The Wyrms panel says a trueblood wyvern may become a
great wyrm. Quest `k_wyrm`.

### 4.57 Relic trade

`relicStock` counts loose relics from the delve. `dailyTrade` sells `RELICS_PER_DAY` (2) at
`RELIC_PRICE` (60) while the stock exceeds `RELIC_KEEP` (10); `trade.relicsSold` and
`stats.relicsSold`; the Gloam road note in the Ledger names relics sold and loose relics.
Event `assessor` (pool, when relicStock ≥ 12 and a delve stands). Quest `k_assessor`.

### 4.58 The brawl

`dailyGuilds`: when a rival pair are both ≤ 25 and `WAR_SPACING` (60) days have passed
since `guilds.lastWar`, `guildwar_<guild>` fires (`WAR_EVENTS`, in `COUNCIL_EVENTS`).
`stats.guildWars`.

### 4.59 The duel

`greatWyrm(s)` finds a stage-4 dragon; `flyoverFireCap` halves `WYRM_FLYOVER_FIRES` while
one stands; `startFlyover` writes the tale and counts `stats.wyrmDuels`; `endFlyover` sets
waking 20. Quest `k_duel`.

### 4.60 The auction

Caravan choice "Auction the loose relics": price 100 + rng(0..40) per relic from
`relicStock`, `stats.relicsAuctioned`, a 34% collector purchase of one uncatalogued piece for
2,500, sextons −5.

### 4.61 The charter

`guilds.charters` lists reconciled pairs by their first guild (`pairOf`). `charterGuilds`
costs `CHARTER_COST` (2,000) at a seated council; `isChartered` switches off the rivalry
drift, the petition sting and the brawl. Buttons in the council block; `stats.guildCharters`;
quest `k_charter`.

### 4.62 The walker framework

`walkers.ts` holds `WALKER_JOBS`, a table of NPC jobs. A job names the building kinds that
field it (`from`), how many each fields today (`count`, e.g. a lit Watch House two, unlit one),
a patrol radius, a sprite prop, an `onTile` hook for every road tile entered, the agent kinds
it `meets` and an `onMeet` hook (returning true removes the other agent), and a daily `cap`
on effects counted in `a.load`. Walkers are `AgentKind.Walker` with `job`, `anchorId`
(`homeId` too, so `dailyAgents` keeps them), and a three-line `log` of what they did today.

`dailyWalkers` tops every building up to its count at its road tile, dismisses orphans and
surplus, resets counters and logs, and halves the bonus layer. `tickWalkers` runs every tick:
a walker with no path picks a random road tile within its radius (six tries, `findPath` with
800 nodes), walks it with the shared `stepRoad` step (builders use the same), calls `onTile`
on each new tile, pauses 20–60 ticks at the end of a leg, and every five ticks tests the
agents within 1.2 tiles for `onMeet`, pausing or not. The bonus layer `walkerBonus[type]` is
transient (not saved) and is added into `updateCoverage` before the final conversion, so a
patrolled street reads as covered in the overlay and in `dailyRestless`.

The watchman proves it: from Watch Posts and Watch Houses, radius = the service radius,
+0.08 watch per tile walked (cap 0.3), kills hounds and lays the restless it meets, two of
each a day, with a growl cue and a log line. Sprites `walker_<job>_<variant>_<frame>` are the
citizen painter plus a prop (`rod`: red cap and the Watch's rod). The building panel lists its
walkers and their last three log lines; the dev panel's "Walker here" lists every job in the
table. Stats `walkerKills`, `walkerLayings`; quest `w_patrol`. Balance: seed 42 reaches Free
City on day 60 (was 61) and Beacon on day 95 (was 92), inside the §14.1 tolerance.

### 4.63 Walker kinds, first set: sextons, healers, wardens (iteration 32)

Two framework additions: a job may give a `target(s, a, anchor)` that returns a road tile to
walk to (null falls back to the random patrol tile) and an `onArrive(s, a, i)` hook at the
end of a leg; `nearestRoadOf` and `buildingsAt` are the shared helpers.

- **Sexton** (Boneyard 1, Ossuary 2; prop `spoon`): paints `death` +0.06 (cap 0.25) on the
  streets it walks; lays the restless it meets and quiets one of the dead for each, three a
  day, with a bell. Quest `w_sexton`.
- **Healer** (Healer's Shrine 1, Hospice 2; prop `satchel`): targets the unhappiest hearth
  in the service radius with happiness under 55 (dry homes count 10 lower) that was not
  tended today; on arrival `Building.tended = day`, which is +4 in `computeBuildingHappiness`
  that day; six visits a day; paints `health` +0.05 (cap 0.2). `stats.healerVisits`; quest
  `w_healer`.
- **Tallowkin warden** (every lit spire and Nexus, one each, only under the Spire Wardens
  edict; prop `candle`): walks to the nearest other spire within 24 tiles and back, paints
  `ward` +0.03 (cap 0.12), and `wardenNear(s, b)` (5 tiles) removes a building from the
  wild surge's candidates in `dailySurge`. `stats.wardenRounds`; quest `w_warden`.

Balance, three seeds against main (walkers draw from the shared random stream, so single
runs diverge): seed 42 Free City day 56 vs 60 and 2,160 folk on day 120 (Beacon at 2,200, main
reached it on day 95); seed 43 stalls at Burgh on both; seed 44 Free City day 58 on both and
Beacon day 87 vs 98. No systematic shift; the rule in 14.1 is now read as the mean over three
seeds.

### 4.64 Walker kinds, second set: scholars, tamers, pilgrims (iteration 33)

One framework addition: errands. `errandTarget(s, a, anchor, away)` returns the away tile
while `a.phase` is 0 and the anchor's road tile while it is 1; the job's `onArrive` flips the
phase. `keepLoad` jobs keep `a.load` over the day (a carrier); a carrier dismissed mid-errand
puts its piece back.

- **Scholar** (Academy 1, Grand Academy 2, lit only; prop `book`): errand to the nearest Ruin
  Delve within 60 tiles; at the delve it takes one uncatalogued piece (`a.load = 1`), at home
  it names it (`catalogue`, `stats.scholarTrips`). While any scholar is fielded `dailyRelics`
  no longer catalogues by itself, so pieces are named by a walk. With no delve the scholar
  patrols the school streets. Quest `w_scholar`.
- **Tamer** (Tamer's Lodge 1; prop `leash`): errand to the nearest cradle within ten tiles
  that holds dragons and was not visited today; at the cradle `visited = day`, every dragon
  there +2 mood, and `dailyDragons` grows them ×1.1 that day; three visits a day,
  `stats.tamerVisits`. Quest `w_tamer`.
- **Pilgrim** (shrine 1, temple 2; prop `staff`): errand to another house of the Vigils or
  the Founding Stake within 30 tiles; paints `faith` +0.04 (cap 0.15) on its road and prays on
  arrival (`stats.pilgrimPrayers`). Quest `w_pilgrim`.

This completes M10: seven walker kinds, one per service, all data in `WALKER_JOBS`. Balance
over seeds 42–44 against main: Free City days 66 / stalls / 50 vs 60 / stalls / 58 (mean 58 vs
59), Beacon days 97 / – / 91 vs 95 / – / 98; within the rule.

### 4.65 The faction scaffold (iteration 34)

`src/data/factions.ts` holds `FACTIONS`: a `FactionDef` per people with a name, lore, a
`playable` flag, its own `milestones` table (same length and indices as `MILESTONES`), a
`deny` list, a `replaces` map (Vellish key → this people's key) and a `rules` block:
`hillLandValue`, `grassPenalty`, `hillBuildable`, `wallWard`, `lanternWard`, `hillMana`,
`nodeMana`, `startCrowns` and an optional `milestoneGate`. `GameState.faction` names the
people (`createGame` and `createScenario` take it; the daily challenge is always Vellish;
old saves default to Vellish). The Vellish entry has neutral rules; the Grimmen entry is a
lore stub shown disabled on the title screen until iteration 35.

Each rule is read at exactly one point: land value (`services.ts updateLandValue`),
placement and zoning on hills (`world.ts canPlaceBuilding`, `actions.ts paintZone`), the
gates' ward and the Ward Lantern's strength (`updateCoverage`), the node flow and a hill
building's `manaProduce` (`networks.ts updateMana`), the starting treasury (`createGame`),
and `checkMilestones` (which reads `milestonesOf` and the gate). `canBuild(s, key)` joins
the milestone, the relic sets and `buildsFor` (deny, replaces, `BuildingDef.faction`); the
build menu, the tools, the actions and the bot use it, and the bot's `want` goes through
`factionKey` so a people's replacement is placed instead. The title screen has a peoples
row above the scenarios; the topbar names the people after the milestone. Seed 42 is
bit-identical to main (Burgh 42, Free City 66, Beacon 97): the scaffold adds no rng call.

### 4.66 The Grimmen of the Underhill, part 1: stone (iteration 35)

The Grimmen are playable from the title screen. Rules: hills +12 land value and every other
tile −6, buildings and zones on hills, the gates' ward ×2, a third more mana from buildings on
hills and a third less from the nodes, and a milestone gate on **stone quarried**
(`stoneQuarried`: hills levelled plus two per building standing on hills) with thresholds
0, 2, 6, 12, 20, 30, 42, 56, 72. Their nine milestones keep the Vellish folk counts and grants
under depth names: Camp, Cut, Gallery, Hold, Deep Hold, Under-Market, Deephold, Underking's
Hall, Underking's Seat, with their own texts.

Three replacements (`replaces: { well: 'seep', wardlantern: 'stoneward', cradle: 'hatchery' }`,
all `faction: ['grimmen']`): the **Seep** (water, must touch hills, waters 6, no mana), the
**Stone Ward** (ward 8 at 0.9 with no mana and no light), and the **Hatchery** (a cradle for
the Bone, Grey and Ember lines only). Cradles are generalised: `CRADLE_KINDS`, `isCradle`,
`cradleAccepts(b, line)`, `freeCradle(s, line)`; every `'cradle'` literal in the sim, the UI
and the quests reads `isCradle`, so eggs, breeding, tamers, events, the Wyrms panel and the
cradle quests all take a Hatchery.

The look: `zoneSpecs(zone, level, variant, 'grimmen')` turns every zone building to stone or
dark stone walls with slate, flat or no roofs and no chimneys; the atlas holds a `_grimmen`
copy of all 48 zone sprites and the renderer picks it by the state's people. The three
buildings have dark-stone specs. The Vellish game is untouched: seed 42 is identical to main.

### 4.67 The Grimmen of the Underhill, part 2: forge, seat, tales (iteration 36)

Two more replacements (`golemfoundry → forgetemple`, `lantern → underkingseat`):

- **Forge-Temple** (service, faith r8, binds Wardens within 12 like a foundry): the golem
  houses are a list (`GOLEM_HOUSES`), and `dailyBeasts` knows them before the mines wake
  anything, so a Warden woken within `FORGE_WAKE_RADIUS` (20) of a lit Forge-Temple climbs out
  already bound, with its own message. The inspector names the forge.
- **Underking's Seat** (wonder, must touch hills, ward r30, land value 20): relays the ley
  like a Nexus (`LEY_HALLS` in networks.ts), lights like the Lantern in the renderer, and
  `stoneQuarried` counts it as ten stone.

**Quests read the people.** `has(s, kind)` resolves `factionKey` first, so the Vellish goals
for the well, the lantern, the foundry and the cradle read as the seep, the stone ward, the
forge and the hatchery; the UI's "Show me" maps the build key the same way. A quest may name
its `people`: a people's own chapter is shown, counted and paid for that people only
(`questsFor` in sim/quests.ts), which is what keeps the Vellish game identical. Chapter
**The Underhill** (eight): cut the first hill, a Seep, six halls on the hill, a Stone Ward,
reach the Gallery, hatch a stone line, bind a Warden at the forge, cut the Seat.

**Three tales** (`GRIMMEN` in events.ts, in the pool, gated on the people): the Underking's
envoy (1,500 crowns for +4 happiness, 30 goods for +2, or refuse for −4), a gallery collapse
(600 crowns to shore it, or one hill building to ruin and two stone from the rubble), and a
vein of true leystone, once (every mine +30 leystone and +3 scale, 2,500 crowns from the
Crown, or `stats.trueVeins` for +10 node mana for ever).

### 4.68 The Grimmen of the Underhill, part 3: the stone-sexton, the bot, balance (iteration 37)

This closes M11's proof of concept (§14.2): the Grimmen walker, the bot playing the Grimmen,
and balance on three seeds. The Vellish game is bit-identical to main.

**The stone-sexton** (`WALKER_JOBS.stonesexton`, prop `salt`): one from every Stone Ward and
one from the Forge-Temple, radius 10, cap 3. On the streets it walks it paints ward (+0.04,
cap 0.15); when a tile beside its road is Gloam it cuts it back, two a day, with a ward flash
and a log line ("Cut the grey back at (x,y) with salt and chisel"); the restless it meets it
lays, three a day. `a.load` counts cuts × 10 + layings, like the watchman. The sprite is a
grey hood with a salt bag at the hip and a chisel. The dev picker lists it by itself (eight
jobs now).

**An unlit ward burns.** `dailyGloam` only burned Gloam for *lit* wards, so the Stone Ward
("asks no mana") held the grey but never cut it. The gate is now
`!b.lit && (def.needsMana || def.manaUse > 0)`: a ward that draws no mana burns whether or
not a spire reaches it. Every Vellish ward draws mana, so nothing moves for them.

**The Underhill start.** Seeds 42 and 43 had no hills within reach of the founding node; the
Grimmen bot zoned grass at a penalty, never cut a seep, and collapsed at the Camp (139 folk,
−4,616 crowns by day 120). The people's own text promises a hill start, so `generateTerrain`
takes an `underhill` option (set by `createGame` for the Grimmen): after the founding
clearing, a ridge of hills five to nine tiles south of the node (Chebyshev distance ≥ 6, so
the clearing itself stays open; grass, meadow and forest become hills, water and nodes do
not). The Vellish map is untouched: the test builds both from one seed and checks that every
differing tile is a ridge tile.

**The bot plays the Grimmen** (`src/sim/bot.ts`):
- `zoneByDemand` runs two passes when the people may build on hills: hill tiles first,
  then the rest, so every hall quarries stone. `placeNear`'s clear mode allows hills the
  same way.
- `keepWatered` asks for the people's water key (`factionKey(s, 'well')`): a seep within
  10 tiles of the dry home, then a cistern when it is unlocked and the mana flow allows.
- A `quarry()` step runs every day. Before the Land tool (milestone 4) a stone gate sends a
  track to the nearest hill tile within 45 and widens the zoning radius, so the halls climb
  the ridge. From milestone 4, when folk are at 80 % of the next milestone's need and the
  treasury holds 2,500, it levels up to three hill tiles a day on a spiral from the centre
  with the real `terraform(s, 'level')`, paying for them.

**The balance bot takes a people**: `npx tsx scripts/balance.ts <seed> <days> [treasury|-]
[faction]`; milestone names come from `milestonesOf`, and a `stone` field joins the daily
line for the Grimmen.

**Balance (120 days, hill start):**

| seed | Camp | Cut | Gallery | Hold | Deep Hold | Under-Market | folk d120 |
|---|---|---|---|---|---|---|---|
| 42 | 1 | 3 | 13 | 19 | 33 | 46 | 658 |
| 43 | 1 | 3 | 10 | 20 | 51 | — | 343 |
| 44 | 1 | 4 | 9 | 19 | 43 | 59 | 714 |

All three reach Deep Hold (the fifth milestone) by day 70, as §14.2 asked. Vellish seed 42
is identical to main (Burgh 42, Free City 66, Beacon 97). What the table also shows: the
Grimmen plateau between 350 and 700 folk. Hills are their best land but the ridge is finite,
grass is poor for them, and the bot levels hills only for stone, not for room, so the Deephold
(1,000 folk) is out of its reach. That is the first item of the next iteration, not a fault of
the people: a hill people needs a hill economy past the Under-Market.

### 4.69 The Grimmen's deep game, part 1: the bulldozer, the Delve, the Quarry, the Deep Cut (iteration 38)

M12 Peoples II opens with the finding of 4.68: the bot's Grimmen towns plateau between 350
and 700 folk. The exploration found the real cause before any new mechanic.

**The bot's bulldozer asked nobody.** `Bot.placeNear` in clear mode sacrificed 1×1 zone
buildings to make room for a well, a seep or a service, then called `placeBuilding`, which
can still refuse: no road touching, no hill touching for a seep, no hills under the footprint,
the Charter. The homes were gone either way. A dry Grimmen home with no hill within six tiles
made every candidate in the 13×13 square fail, so the bot flattened the whole block, every
day, for nothing; the Vellish lost homes too, less often (a well has no hill rule).
`canPlaceBuilding` takes a `clearing` flag under which a 1×1 zone building is not a blocker
and every other rule still applies, and the clear loop asks it before it digs. With the
clear mode simply switched off in a throwaway run, the Grimmen bot reached the Deephold on
days 61, 120 and 65 instead of never. This is a change for every people, so Vellish
bit-identity does not hold for it; §14.1's rule (the mean day of Free City over seeds 42–44
against main) is the one that applies: the bot stops destroying its own homes, and the new
lines become the baseline that the faction-only changes below match bit for bit.

| Vellish, 150 days | seed 42 | seed 43 | seed 44 |
|---|---|---|---|
| main | Burgh 42, Free City 66, Beacon 97 | Burgh 36, no Free City | Burgh 37, Free City 55, Beacon 93 |
| with the bulldozer fix | Burgh 42, Free City 64, Beacon 92 | Burgh 36, no Free City (1,456 folk) | Burgh 35, Free City 50, Beacon 91 |

The mean day of Free City over the seeds that reach it moves from 60.5 to 57: the fix is a
gain of three and a half days, outside the two-day band, and it is accepted as such because
it removes a bug rather than tuning a system (the decision log).

**Stone is what is cut.** `stats.terraformed` counted forest clearings and plantings as
stone. `stats.stoneCut` counts only hills levelled, ground delved and collapse rubble;
`stoneQuarried` reads it; old saves take `terraformed` as their starting count.

**The Delve** (`TERRAFORM.delve`, 160 crowns, from the Gallery, Grimmen only): a grass or
meadow tile dug down and the rock heaped: it is hill land from then on, for land value, for
halls that count stone, for seeps that must touch a hill, and for the renderer. Terraform
ops carry a `faction`; `terraform()` refuses an op another people may not use ("The Vellish
do not delve") and the Land tab lists only this people's ops. A hill people is no longer
bounded by the hills the map happened to give it (seed 43 has 141 hill tiles in all).

**The Quarry** (Grimmen only, 1,400 crowns, from the Cut, dug into hills, touching a road):
eight cutters, 5 goods of dressed stone a day for the carts (half unlit, no mana), four
stone quarried while it works. It rides the existing goods path: a `goodsRate` service gets
carts homed at it like the Hanging Gardens and `chooseTrip` takes them to the markets. One
hook was missing: a non-zone building's `capacity` supplied no jobs, so `dailyBuildings`
keeps an `extraJobs` list (jobs and workers, not folded into the happiness average). The
inspector shows Workers and Carts for such buildings. The sprite is a dark stone cut with
a windlass and three stepped rows of blocks (`stonePile`).

**The Deep Cut** (edict, Grimmen only, from the Hold, 1.5 crowns a day per hill hearth): a
hearth standing on hills reaches its third level without schooling and holds two more folk
there. Edicts carry a `faction`: `edictOn` is false for another people's edict whatever the
flags say (a Set probe on the hot path), the panel lists `edictsFor(s)`, the upkeep skips
foreign edicts, and no guild petitions for it. `capacityOf(b, s)` adds the two.

**The bot's deep game.** `quarry()` is now: reach the hills with a track before the Delve
(as before); never level hills for a people that builds on them; **delve** up to four grass
tiles a day beside its streets, nearest the centre first, when the hill zone has fewer than
ten free tiles and hearths are wanted, or when stone is short, with 2,000 crowns kept back;
a **Quarry** on the hill when the works cannot keep the shelves full (craft demand above 0.15
or goods short), up to half the markets plus one; and the **Deep Cut** once an Academy stands.

**Balance (150 days).** Stage 1 is the bulldozer fix alone; stage 2 adds the Delve, the
Quarry, the Deep Cut and the bot's deep game.

| Grimmen | Deep Hold | Under-Market | Deephold (1,000 folk) | folk d150 | stone d150 |
|---|---|---|---|---|---|
| seed 42, iteration 37 | 33 | 46 | never | 658 (d120) | 52 |
| seed 42, stage 1 | 25 | 35 | never | 915 | 54 |
| seed 42, stage 2 | 25 | 35 | **70** | 1,359 | 175 |
| seed 43, iteration 37 | 51 | never | never | 343 (d120) | 52 |
| seed 43, stage 1 | 29 | 39 | 87 | 1,048 | 74 |
| seed 43, stage 2 | 29 | 39 | **77** | 1,244 | 268 |
| seed 44, iteration 37 | 43 | 59 | never | 714 (d120) | 192 |
| seed 44, stage 1 | 40 | 57 | never | 937 | 192 |
| seed 44, stage 2 | 40 | 57 | **87** | 1,425 | 394 |

All three seeds reach the Deephold by day 120, as the plan asked, and Deep Hold no later
than before. The bulldozer fix did most of the lifting (stage 1 doubled the folk); the deep
game turns the plateau at the Under-Market into the Deephold and keeps growing past it. The
stage-2 Vellish lines are bit-identical to stage 1 on all three seeds (seed 42: Burgh 42, Free
City 64, Beacon 92). What the table also shows for the
next iteration: a Grimmen town of 1,300 folk runs a brownout of a quarter (their node mana
is two thirds of the Vellish and the bot stops placing spires once demand nears supply), so
their mana game, Crystal Mines and the Forge-Temple early, is the next balance item.

### 4.70 The Veshari of the Sable, part 1: rules, buildings, the riverside start, the bot (iteration 39)

M12 part 2 is the second people on the scaffold, to prove it holds twice. The lore has the
Veshari as the water-mages of Vesh with river-kin in Gekiryu, and Vell as a kingdom of river
valleys ruled from Vell-on-Sable, so the people is **the Veshari of the Sable**: a wardlight
chartered by the water-mage order and their river-kin on the Sable's bank. (The faction id
`veshari` and the building key `veshari`, the fire-brigade hall every people builds, are
different namespaces; the atlas keeps `b_veshari` for the hall and `hearth_l1_v0_veshari` for
the people's look.)

**Rules** (four new fields on `FactionRules`, neutral by default, each read once):
`waterLandValue` (× the river's land-value bonus; the Veshari 2, so a bank tile is worth up to
+25), `dryPenalty` (off every tile more than 8 from water; 6), `riverFreezes` (false: the river
runs through the Hush, so barges sail and the mills keep turning), `millMana` (× a Torrent
Mill's output; 1.33), plus `nodeMana 0.8`. Their reach milestones (The Bank, Jetty, Quayside,
Harbour, Haven, River-Market, Weirhold, Vesh's Court, Sable Crown) are gated on **moorings**
(quays and landings standing): 1, 2, 3, 4, 5, 6, 8, 10. ×1 and −0 are exact, so the Vellish
and the Grimmen are bit-identical.

**Buildings** (`faction: ['veshari']`): the **Tide-Well** replaces the well (must touch water,
waters 10, no mana); the **Landing** (900 crowns, from the start) is a timber mooring that
barges sail between: the existing barge code (`vehicles.ts`) now reads `MOORINGS = ['quay',
'landing']`, so a Veshari town trades along the river from its first week; the **Tide Pool**
replaces the Wyrm-Cradle and takes only the water lines: `HATCHERY_LINES` became
`CRADLE_LINES`, a map from cradle kind to its lines (hatchery: bone, grey, ember; tide pool:
tide, storm, glim), so a third people's cradle is a row. A `_veshari` zone look (plank and
washed walls, thatch and awnings, a lantern on every market) joins the Grimmen stone through
`ZONE_LOOKS`, which drives both the atlas copies and the renderer's suffix.

**The riverside start.** Like the Grimmen's ridge, the people's start keeps its promise: when
the nearest river or lake water is more than six tiles from the founding, `generateTerrain`
cuts a two-wide channel from it toward the founding, stopping at six (never into the
clearing), with shore along the banks. No rng is drawn and the Vellish map is untouched; the
inline shore pass became a `shoreTile` rule used by both. On the way a latent bug surfaced:
`waterDist` was never saved nor recomputed on load, so a loaded game kept the fresh Vellish
valley's distances. `deserialize` now derives it from the saved terrain (identical for every
existing save).

**The bot.** `quarry()` returns for a people that neither builds on hills nor delves (the
Veshari must never level hills for their gate). A `moor()` step lays a landing when the reach
is short; when no bank lies beside a street it brings a track to the land beside the nearest
free bank tile (never onto it) and widens the grid. `keepWatered` tries a water people's well
within 14 before a cistern; `buyServices` raises Torrent Mills as the people's spires once the
mana surplus thins. `scripts/balance.ts` logs moorings and barges for them.

**Balance (150 days, riverside start):**

| Veshari | Jetty | Quayside | Harbour | Haven | River-Market | Weirhold (1,000) | folk d150 | moorings | barges |
|---|---|---|---|---|---|---|---|---|---|
| seed 42 | 4 | 11 | 42 | 43 | 45 | 53 | 1,913 | 12 | 0 |
| seed 43 | 3 | 9 | 12 | 21 | 30 | 53 | 1,190 | 8 | 114 |
| seed 44 | 4 | 13 | 24 | 31 | 40 | 55 | 1,426 | 10 | 171 |

All three reach Haven (the fifth milestone) by day 70, as the plan asked, and the Weirhold
(1,000 folk) by day 55; Vellish and Grimmen seed 42 are bit-identical to main. Two findings
for part 2: on seed 42 the bot sat at three moorings from day 11 to day 42 (the gate holds
the grants back, so the purse stayed too thin for a landing until the clear-mode mooring
was allowed), and on that seed its landings cluster at the centre where no works stand
within reach, so no barge ever sailed; a landing placed for its trade, not only its count,
is the bot's next lesson.

### 4.71 The Veshari's water: the Hush flood, the Great Weir, the Sable chapter, the tales, the bargeman (iteration 40)

Part 2b gives the people a hazard, a wonder, a story and a walker, as 4.67–4.68 did for the
Grimmen. Everything is gated on the people, so the Vellish and the Grimmen are bit-identical.

**The Hush flood.** The Sable never freezes for the Veshari; instead it rises. `flooding(s)`
holds for a people whose river does not freeze, from the fifth day of the Hush, while no
Great Weir stands. Tiles within one of water lose 10 land value and the homes on them 10
happiness (`FLOODPROOF` buildings live on the water: moorings, tide-wells, mills, the Weir).
The Hush season message warns of it, or says the Weir holds it. `stats.floodDays` counts the
days and `floodsWeathered` the Hushes come through with the river up (counted when the
season ends, as `quietHush` is), which a quest reads.

**The Great Weir** replaces the Lantern of Vell for the Veshari (in `replaces` and in the
milestone unlocks): 2×2 on the water, 22,000 crowns, no mana, 90 mana a day from the
current, a ward of 30 across the water, land value 20, a ley hall like the Lantern and the
Seat, and the flood ends while it stands. The renderer's four wonder lists became one
`WONDER_HALLS` constant in the catalog (`LEY_HALLS` reads it), so a wonder is a row.

**The Sable chapter** (eight quests, `people: 'veshari'`): a tide-well, two landings, the
first barge, a mill in the current, a Tide Pool, a water hatchling, the first flood
weathered, the Great Weir.

**Three tales** (`VESHARI` in events.ts, in the pool and in `ALL_EVENTS`): a tide egg in a
fisher's net once a Tide Pool stands (keep, sell, or keep it on the pool wall for +3
happiness), a storm egg after a mana-storm (keep, sell, or let it hatch wild and a storm
breaks over the water), and the bargemen's strike at four moorings (900 crowns of
rope-money, or a `barges` modifier that halts barges for eight days; the modifier kind
joined the union and `dailyBarges` reads it). Until now nothing laid a tide or storm egg.

**The bargeman** (`WALKER_JOBS.bargeman`, prop `pole`): one from every mooring of a people
whose river never freezes (count 0 for the others, so no rng moves), radius 10. He paints
leisure on the bank streets; in a flood he walks to the flooded homes in reach and bails
them (`tended`, the healer's +4, so a flood costs 6 rather than 10), six a day.

**The bot** lays a landing beside works that have no mooring within a barge's reach (the
finding of 4.70), and raises the Weir at Vesh's Court through its own water-side search.

**Balance (150 days).** Iteration 39's numbers in brackets.

| Veshari | Harbour | Haven | Weirhold (1,000) | folk d150 | barges d150 |
|---|---|---|---|---|---|
| seed 42 | 15 (42) | 44 (43) | 54 (53) | 1,898 (1,913) | 268 (0) |
| seed 43 | 14 (12) | 25 (21) | 59 (53) | 1,380 (1,190) | 171 (114) |
| seed 44 | 22 (24) | 31 (31) | **82** (55) | 1,207 (1,426) | 215 (171) |

Every seed sails now (the landing beside the works), and Vellish and Grimmen seed 42 are
bit-identical to main. The flood has a price: seed 44, whose town sits lowest on the bank,
reaches the Weirhold 27 days later than before and ends 220 folk smaller; the plan asked
for day 60 on all three and seed 44 misses it. That is the people's hazard doing what it
should, not a bug, and the answer is the Weir (which the bot raises only at Vesh's Court)
or a cheaper flood-work for part 3; it is recorded in NEXT_STEPS.

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
- **Fantasy pass (iteration 5):** the generator gained overhanging upper floors with carved
  braces, hanging lantern posts, glowing rune bands, potion-bottle shelves, copper alembics
  with green glass, glass domes, orbiting crystals, bell towers, gold ridge ornaments and
  wisps; walls in plaster and blue-wash, roofs in moss and verdigris copper. Ley nodes are
  standing-stone circles around a glowing pool with spiral grass; forests near nodes grow
  pale glimwood with glowing leaf tips and mushrooms; the Gloam grows twisted trees with a
  violet eye. Spires carry a floating ring of shards. At night the emissive layer is drawn
  twice, once soft at quarter resolution (bloom) and once crisp, rune rings pulse on the
  ground under lit spires and wards, and Tallowkin eyes glow. UI panels got gold corner
  marks and a serif title with a code-drawn animated sigil.
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
- **M7 The fantasy layer** — creatures, dragons, the Vein-Wyrm, magical buildings,
  vehicles, the Charter line, scenarios (iterations 7–23). ✅
- **M8 The deep dive** — aspects, auras, pressure, the council, festivals, routes, breeding,
  relics, halls, rivalries (iterations 23–29, §13). ✅ (phase 6 in progress)
- **M9 Construction and dev tools** — sites, builders, the dev panel (iterations 26, 28). ✅
- **M10 Walkers** — more NPC kinds that embody the systems: watchmen, sextons, healers,
  wardens, scholars, tamers and pilgrims on the roads, each doing a visible job (§14.1). ✅
- **M11 Peoples** — playable factions with their own buildings, progression and rules,
  one as proof of concept (the Grimmen of the Underhill), the rest designed (§14.2).
  ✅ (iterations 34–37)
- **M12 Peoples II** — part 1, the Grimmen's deep game: the bot's bulldozer fixed, the
  Delve, the Quarry, the Deep Cut (iteration 38, §4.69) ✅; part 2a, the Veshari of the Sable
  on the scaffold: rules, buildings, the riverside start, the bot (iteration 39, §4.70) ✅;
  part 2b, the Veshari's water: the Hush flood, the Great Weir, the Sable chapter, three
  tales with tide and storm eggs, the bargeman (iteration 40, §4.71) ✅. M12 is closed: the
  scaffold held twice.

## 8. Fantasy roadmap: creatures, dragons, magical buildings, vehicles

Everything below grows out of the magic rules in `EDA_LORE.md` §5 and is *proposed*
(lore in `EDA_LORE.md` §8). The aim is that the city feels inhabited by a living fantasy
world, not decorated with one: every creature is a system with a cost, a use and a
counter, and every magical building changes how the player plans.

### 8.1 Creatures (fauna, wild and tamed)

| Creature | Where / when | Behaviour | Player answer |
|---|---|---|---|
| **Glimmoths** | swarm ley nodes and lit spires at night, all seasons | harmless; luminous ambient life; shed *glim-dust* | a **Moth-Loft** near a node harvests dust: Craft goods +20 % in radius |
| **Thrumhares** | meadows by day | ambient; flee agents; a Garden makes them stay | none needed; hunters take a few for a small happiness bump |
| **Marsh-wyrms** | rivers and lakes; Bloom | eel-like; one may lair under a bridge: carts on it slow to a crawl | Veshari Hall coverage drives it off; a **Quay** keeps them away for good |
| **Gloam-hounds** | out of the Gloam at night; packs grow in the Hush | fast; harass outlying buildings (happiness, occasional damage); flee light | Ward Lanterns and Watch coverage; a **Hunters' Lodge** hunts them in radius |
| **Wisps** | over Boneyards and the restless | benign lights; multiply when unquieted dead rise; guide the Watch to restless | deathcare; too many wisps is the early warning |
| **Concord Wardens** | sleeping stone constructs in hills; woken by mining | wake and wander; hostile until *bound*; immune to fire and the Gloam | a **Golem Foundry** binds them: labour that needs no housing but drinks mana; a surge sends them mad |
| **Skyrays** | manta-like drifters on high ley currents; migrate across the map in Bloom and Ember | cast moving shadows; shed *rayscale* if lured | a **Ley Beacon** lures a school for a season: rare good for artifacts, happiness for the whole city |
| **Drakes** | dog-sized ley lizards; bred, not wild | mounts for the Watch; fire-breathing when frightened | a **Drake Mews**: mounted patrols double Watch reach; a spooked mews is a fire risk |

Creature agents reuse the agent system (kind, path, speed, timer) with a `species` field,
a per-species behaviour (wander, flock, flee light, lair), and a spatial bucket for
cheap neighbour checks. Wild populations are per-map counters seeded by terrain (meadow
tiles → hares, water → wyrms, gloam tiles → hounds) and season.

### 8.2 Dragons

Eda's dragons are **Vein-Wyrms**: creatures the Veins dreamed up before there were
people, sleeping coiled around the deepest nodes. Rules:

- Some maps generate one **Sleeping Wyrm** on a distant node (its scales visible as a
  ring of ridged stone; the node hums louder). Drawing mana from that node fills a
  **waking meter**; deepening it wakes the wyrm at once.
- **Awake and unbound**, the wyrm demands **tribute** every season (crowns, goods or
  leystone, rising each time). Refuse and it flies over the city: a fire hazard along its
  path, then it sleeps again for a season. Tribute events use the event system.
- **Binding** needs the **Wyrm-Court** wonder (Free City) and a Tallowkin *Wyrm-Singer*
  raised at the Grand Academy. A bound wyrm becomes the city's guardian: its lair burns
  back the Gloam in a 30-tile radius, Gloam-hounds never approach, happiness +10, and once
  a season it circles the city (a flyover with shadow, wind particles and a scream that
  scatters glimmoths). It eats: 40 goods a day from markets, and it grows *demanding*
  (tribute of leystone) if unfed for ten days, sulking (no ward effect) until fed.
- A wyrm may also **die** (age, or a player who starves it and refuses it): its bones
  become a **Wyrm-Bone Ossuary** site with the best deathcare in the game.
- Later: **hatchlings** raised at the Court become drakes of a higher order that can carry
  a rider across the map (see vehicles).

### 8.3 Magical buildings (new catalog entries, by unlock)

| Building | Unlock | Effect | Cost of use |
|---|---|---|---|
| **Moth-Loft** | Thorp | glim-dust: Craft goods +20 % within 8 | needs a node within 6; 2 mana |
| **Hunters' Lodge** | Thorp | clears hounds and wyrms in 12; venison: happiness +2 in 8 | upkeep |
| **Glimhouse** | Village | glasshouse: Craft works nearby ignore the Hush penalty | 4 mana |
| **Quay** | Village | river barges: markets on the same water body share stock | ships as vehicle |
| **Weather Vane of Vesh** | Township | call rain on a district for a day: fires out, miasma washed | 30 mana, 3-day cooldown |
| **Portal Arch** (pair) | Market Town | carts entering one arch leave the other: logistics across the map | 12 mana each, both lit |
| **Astral Observatory** | Market Town | forecasts surges, hounds and festivals five days ahead; reveals hidden nodes | 6 mana |
| **Golem Foundry** | Burgh | binds Concord Wardens: 12 jobs' worth of labour per golem, no housing | 10 mana per golem; surge risk |
| **Ley Beacon** | Burgh | lures skyrays for a season; rayscale | 25 mana while lit |
| **Drake Mews** | Burgh | mounted Watch: watch radius ×2 from Watch Houses | fire risk if unhappy |
| **Warding Wall** | Village | wall tiles the Gloam cannot cross; hounds path around | cost per tile, 0.5 mana/tile |
| **Font of Quieting** | Free City | city-wide deathcare +50 %; wisps become allies | 15 mana |
| **Wyrm-Court** | Free City (wonder) | binds the wyrm (see 8.2) | 40 mana, feeds the wyrm |
| **Sky-Dock** | Beacon of Eda | airships (see 8.4): trade with other wardlights | 30 mana |

### 8.4 Vehicles (future)

- **Floating carts** (Arcane districts at level 3 produce them): hover lanes above the road;
  they ignore congestion and count 0 for traffic but draw 1 mana each while moving.
- **River barges** (Quay): a barge per quay carries 40 goods along water tiles between
  quays; water becomes a road network with its own pathfinding layer.
- **Drake riders** (Drake Mews): fast Watch agents that fly straight to the restless and
  to fires; visible in the sky layer with shadows.
- **Golem haulers** (Golem Foundry): slow, tireless carts that carry 30 and are not
  scared by hounds.
- **Airships** (Sky-Dock): the late-game trade route; a ship leaves each season with the
  city's surplus and returns with crowns, rare goods and a story event.
- Rendering: a **sky layer** drawn after lighting with drop shadows on the ground; agent
  `altitude` for sorting and for lights.

### 8.5 Mechanics that tie it together

- **Rare goods:** glim-dust, rayscale and wyrm-scale sit beside potions and leystone;
  artifacts made with rare goods sell for 3× and unlock the *Marvels* row of the catalog.
- **Migrations and seasons:** skyrays in Bloom and Ember, hounds in the Hush, wyrms in
  Bloom, glimmoths every night. The Observatory turns these into forecasts.
- ✅ **Mana-storms:** after a wild surge a roaming pocket of wild magic drifts across the map
  for a few days (buildings in it level up or down at random, agents take detours); wards
  dissolve it.
- **Taming edicts:** Beastmasters' Charter (drakes and golems cost less mana, hounds more
  frequent), Hunters' Bounty (hounds cleared faster, hares vanish), Wyrm-Peace (tribute
  halved, wyrm ward halved).
- **Sky layer and shadows** for every flying thing, so the map reads at a glance which
  creatures are above the city.
- **Failure states gain teeth:** an unbound, starved wyrm that razes the Founding Stake
  ends the game ("the valley belongs to the wyrm"); a hound pack that empties three
  districts in one Hush triggers the Long Night early.

### 8.6 Wyrmcraft: eggs, hatchery, tamers and the arena

The Wyrm-Court (8.2) binds one wild adult. Wyrmcraft is the player-driven line: raise
dragons from eggs, choose what each one becomes, and build an economy and a spectacle
around them.

**Eggs come from events, never from a shop.** Several event types can pay in eggs, so a
player who keeps the city interesting keeps finding them:

| Event | Condition | Egg |
|---|---|---|
| *A seam of warm stone* | a Crystal Mine has run 20 days | **ember egg** (Ember-drake line) |
| *The wyrm's tribute* | a bound wyrm fed and content for a season | **vein egg** (Ley-wyrm line, rare) |
| *A skyray nest* | a Ley Beacon lured a school | **sky egg** (Sky-wyvern line) |
| *The Concord vault* | Concord Wardens bound at a Golem Foundry | **grey egg**, half fossil (Gloam-drake line, immune to the Gloam) |
| *A hatchling in the boneyard* | wisps ≥ 10 and an Ossuary | **bone egg** (Quiet-wyrm line, deathcare) |
| *The Crown's gift* | Beacon of Eda milestone | any egg, player's choice |
| *Poachers at the gate* | a hatchery exists | a stolen egg offered for crowns, or refuse and gain unrest |

Each event is a choice: keep the egg (needs a free cradle), sell it to the Crown (crowns
and a Crown favour), or give it to the Academy (educated share, and a future event).

**Wyrm-Cradle (hatchery)** — Township, 2×2, must be within 6 of a ley node or lit nexus,
holds 2 eggs (4 when upgraded to a **Great Cradle** at Burgh). An egg needs warmth
(8 mana/day) and 30 days; a hatchling needs a **Wyrm-Tamer** (a job at a **Tamer's
Lodge**, below) and food (10 goods/day, rising with size). Growth stages and the days they
take: **egg** (30) → **hatchling** (20, lives in the cradle) → **drake** (40, dog-sized)
→ **wyvern** (60, horse-sized, flies) → **wyrm** (only vein and grey lines, 120, the
size of a Guildhall). Unfed or unlit cradles regress a stage; a dragon that regresses
twice leaves for the Gloam (a hazard event later).

**Roles** are chosen at the drake stage and change what the dragon does each day:

| Role | Needs | Effect |
|---|---|---|
| **Courier** | wyvern | flies goods between any two markets or to the Trade Depot: 30 goods a trip, no roads, no congestion; a wyvern courier is the first flying vehicle in the game |
| **Warden** | drake or wyvern | patrols a district: Watch coverage +0.5 there, hounds flee, fires in the district are smothered by wingbeats (fire coverage +0.5) |
| **Delver** | drake, ember line | works a Crystal Mine: +6 leystone/day; ember drakes also warm a Glimhouse |
| **Ward-beast** | grey line | lairs at the city edge: Gloam creep stops within 12 tiles and the whispering ends there |
| **Quiet-wyrm** | bone line | lairs at an Ossuary: quieting +30/day, no restless rise within 15 tiles |
| **Champion** | any wyvern or wyrm | fights in the Wyrm-Ring (below) |

**Materials.** Dragons shed as they grow and the cradle collects: **scale** (every stage
change, 5–20 depending on line), **wyrmfire** (ember line, monthly, a Craft reagent:
alembics +30 % for a season), **eggshell** (once per hatching, a rare artifact reagent),
and, on a dragon's death, **wyrm-bone** (the best deathcare material, see 8.2). Scale
makes *scale-mail* for the Watch (unrest −5 % city-wide while stocked) and the
**Marvels** artifacts (8.5). Lines have colours: ember red, vein ley-blue, sky white,
grey ash, bone ivory; wyverns and wyrms show their line in the sky layer.

**Tamer's Lodge** — Thorp, 2×2. Trains Wyrm-Tamers (a job; Tallowkin fill it fastest)
and sets **taming edicts** per dragon: *gentle* (slower growth, happier dragon, no
mishaps), *hard* (faster growth, mishaps: a scorched roof, a fled hatchling), *wild*
(the dragon may leave, but if it stays it is a full wyrm sooner). An untrained dragon
is a fire risk in radius 4.

**Wyrm-Ring (arena)** — Market Town, 3×3. Once a season a bout is held: the player's
champion against a wild challenger drawn by line and stage (or, with two champions, a
tournament). Outcome is a weighted roll on stage, line, tamer edict and the champion's
*mood* (fed, gentle-trained, recently flown). Win: a purse (crowns scaling with the
challenger), happiness +8 for 10 days, pilgrims arrive (population). Lose: the champion
regresses a stage, unrest +5 %. The Ring is also a **leisure** building (land value and
happiness in radius 10) and draws carts of goods on bout day. The Ring never kills a
dragon; Vell forbids it, and the Grimmen sextons would refuse to quiet the ground.

**Dragon taxonomy: body types × lines.** Every dragon is one *body type* (its shape and
what it can physically do) and one *line* (its origin, colour, breath and calling). The
egg fixes the line; the line fixes which body types it can grow into; the player's
training and role choices pick among them. Each combination looks different in the atlas
and does a different job.

| Body type | Silhouette | Moves | Grows to |
|---|---|---|---|
| **Drake** | four-legged, wingless, a long low body with a frilled crest; dog- to pony-sized | walks roads and open ground like an agent | stage 3 of any line |
| **Wyvern** | two hind legs, wings for arms, a barbed tail; horse-sized, lean | flies in the sky layer with a ground shadow | stage 4 of winged lines |
| **Wyrm** | serpentine, no wings, a crested head and a body as long as a street; coils around its lair | never leaves its lair tile group, but its reach is a radius | stage 5 of the deep lines |

| Line | Egg from | Colour and look | Glow / particles | Body types | Calling |
|---|---|---|---|---|---|
| **Ember** | warm stone in a mine | brick red scales, black horns, orange belly | ember sparks, smoke curls | drake, wyvern | Delver in mines, warms Glimhouses, breathes *wyrmfire*; a wyvern Ember is the best Ring champion |
| **Vein** | a bound wyrm's clutch | ley-blue with white spines, runes along the flank | cyan glow like a spire, rune ring under it | drake, wyvern, wyrm | roosting on a Nexus adds 30 mana/day; a Vein wyrm is a second Wellspring |
| **Sky** | a skyray nest | white and silver, huge wing area, no horns | wind streaks, a trail of glim-dust | wyvern only | the fastest Courier; carries 40 goods and never tires |
| **Grey** | a Concord vault | ash-grey, half stone, cracked like a statue, one violet eye | grey motes, the Gloam parts around it | drake, wyrm | Ward-beast: stops Gloam creep in 12 and breaks Warding Wall siege by hounds |
| **Bone** | a quiet boneyard | ivory plates over black skin, a skull-like head | wisps follow it, faint green light | drake, wyrm | Quiet-wyrm at an Ossuary; the restless lie down in its shadow |
| **Tide** | a marsh-wyrm nest at a Quay | teal and blue-green, finned, webbed feet | water drips, ripples | drake, wyrm | swims the river: a barge that needs no crew; drinks fires out along the banks |
| **Storm** | a mana-storm that passes a cradle | violet-black with white lightning veins, ragged wings | arcs of lightning, a crackle | wyvern | roosting on a Ley Spire during the Hush generates mana from the storm; risky: a surge in radius 6 if unfed |
| **Glim** | a Moth-Loft that has stood 40 days | tiny, pale gold, translucent wings like a moth | a warm lamp glow | drake only (cat-sized) | a flock of Glim-drakes lights a district like lantern-ways, no mana; children adore them: happiness +4 in radius 8 |

*Wyverns and drakes of the same line share colours but not silhouettes; a wyrm of a line is
unmistakable at a glance.* The **Wyrm-Ring** pairs champions by body type (drakes fight
drakes, wyverns wyverns) so every line can compete.

**Sprite plan.** A `drawDragon({ body, line, stage, frame })` generator beside
`drawBuilding`: body type picks a silhouette template (drake: 20×12, wyvern: 28×20 with
two wing frames, wyrm: 3×3 coiled 96×64 with a breathing loop); line picks the palette
triplet (base, belly, accent), horn/crest shapes, eye colour and the glow layer; stage
scales the template and adds crest and horn growth. Eggs are 8×10 with a line-coloured
mottle; hatchlings reuse the drake template at half size. Every dragon gets an emissive
layer for the night pass and a particle signature (ember sparks, cyan motes, wind
streaks, grey motes, wisps, drips, lightning, lamp-glow). Flying bodies are drawn in the
sky layer with an elliptical shadow on the ground and a `altitude` offset that dips as
they land.

**Flying trade (the future).** A wyvern courier is a first vehicle. At Beacon of Eda the
**Sky-Dock** (8.3) can send a wyvern instead of an airship: faster, no mana, but the
trade event may return a *rival wardlight's* egg offer or a challenge for the Ring.

**Failure and drama.** A starved wyrm-stage dragon leaves and returns wild after a season
(tribute like 8.2). A cradle in a district that the Gloam reaches is a hazard event ("the
eggs go grey"). Two dragons of the same line at wyrm stage may **nest**: a vein egg
without an event.

### 8.7 Delivery order

1. Creature agents + glimmoths, thrumhares, wisps (ambient, cheap, visible at once). ✅
2. Gloam-hounds + Hunters' Lodge + Warding Wall (the Hush gets a real threat). ✅
3. Wyrmcraft I: egg events, Wyrm-Cradle, Tamer's Lodge, growth stages, materials,
   Warden and Delver roles (dragons on the ground first). ✅
4. Wyrmcraft II: the sky layer, wyvern Couriers (first flying vehicle), the Wyrm-Ring. ✅
5. Sleeping Wyrm, waking, tribute, flyover; Wyrm-Court binding; vein eggs. ✅
6. Moth-Loft ✅, Glimhouse ✅, Weather Vane (as Storm-Caller's Peak ✅), Observatory ✅, Portal Arch ✅ (magical buildings).
7. Concord Wardens + Golem Foundry; Drake Mews; Skyrays + Ley Beacon; grey and sky eggs. ✅
8. Vehicles: floating carts, barges, drake riders, airships. ✅

## 11. Lore-drop inspirations (from docs/Places, Characters, Civilizations, Creatures)

Content and mechanics the canon drop suggests, in the order worth building. Each is
consistent with `EDA_LORE.md` §9.

1. **Wall Gates, Belregi and Uzulim style.** A gate tile in the Warding Wall lets a road
   pass. Two styles, both from the Pass of Buluiain: a **Belregi Gate** (blue runes: ward
   coverage +0.3 within 8, pilgrims arrive, happiness +2 nearby) and an **Uzulim Gate**
   (crimson obelisks: hounds and the restless never pass within 10, unrest +3 % in its
   district). A **Great Gate** wonder later, with a Heart of Belregi event chain.
2. **Storm-Caller's Peak** (on hills, Township): a Huruhui-trained storm caller calls
   rain on a district (fires out, miasma washed, herb yields +), disperses a mana-storm,
   or, in the Hush, holds a storm off the wards. Replaces the planned Weather Vane of
   Vesh. Event: *a storm caller of the Huruhui, marked with glowing sigils, asks for a
   peak to work from*; declining sends them on to Vell-on-Sable.
3. ✅ **Hanging Gardens** (Huruhui garden-craft): a cliff-side vertical garden building
   that needs hills on one side; produces goods and health without farmland and lights
   itself with bioluminescent vines (a **Glowvine Lane** road tier lit by plants, no
   mana). Unlocked by the storm caller's visit or by an Academy exchange event.
4. **Belerial caravans.** Every season a caravan of riders on bipedal **striders** may
   reach the Trade Depot (needs a road to the map edge): sells rare goods, buys surplus
   at good prices, offers strider mounts (Watch reach +, later couriers) and, rarely, an
   egg. The **Wandering Merchant of Belerial** is a named recurring visitor with a
   memory of past deals.
5. ✅ **Fen-Nex visitors.** Fox-folk shapeshifters arrive as a trickster event chain:
   honest trades and swindles at fifty-fifty, a Fen-Nex district that pays no tithe but
   doubles market stock, and a **fen-drake**: a cat-dragon line hatched only from a
   Fen-Nex gift.
6. ✅ **Longwood escapees.** **War-tigers** as a forest predator far worse than hounds
   (Hunters' Lodge or a bound drake needed); exotic creatures of Longwood as rare
   sightings that raise happiness.
7. ✅ **Ruins of Lukuku.** Map generation can seed an ancient ruin cluster in the forest;
   a **Ruin Delve** camp on it yields relics (artifact price +), relic events (the
   Concord was not the first to fall), and occasionally wakes something.
8. ✅ **World Tree sapling** wonder: a cutting from the World Trees of Longwood, planted at
   Free City, grows over four seasons into a tree taller than the Lantern of Vell:
   happiness, land value, glimmoths and skyrays gather, and its roots hold the Gloam.
9. ✅ **Torrent Mill** (Gekiryu): a mill on river tiles that turns falling water into mana
   (a Huruhui renewable), with an animated torrent; the Veshari claim the design.
10. **Swamp biome and atoll maps.** Marsh terrain (buildable after a Drainage edict,
    marsh-wyrm home) and island maps for scenario charters (Patagoi Atoll).
11. ✅ **Cameos as events.** Dr. Jelly (an eccentric alchemist selling one strange potion:
    a random large effect), the Cloud Forest Wizard (offers a glimwood grove), and a
    guarded cameo of Asyrion (a description only, never a sprite, unless asked).

## 13. Interconnection deep dive (iteration 23)

A pass over every system with one question: what does it feed, and what feeds it? The
inspiration is the builders that last. **Anno** makes every output someone's input and
every tier hungrier than the last. **Against the Storm** and **Frostpunk** never let a
stable city rest: the hostility outside rises on a rhythm and the player's margin is the
game. **Civilization VI** makes placement a puzzle through adjacency, so two identical
buildings are not worth the same. **Dwarf Fortress** and **RimWorld** let many systems
touch many others so that stories fall out of the simulation, and RimWorld paces them with
a storyteller rather than a dice roll. Wardlight already has the parts; this section wires
them together, with magic as the medium every wire runs through.

### 13.1 Feature map: what each system feeds

| System | Feeds | Fed by (new links in **bold**) |
|---|---|---|
| Ley nodes | spires, cradles, Moth-Lofts, the wyrm, deepening | **aspects**: each node is Ember, Bone, Glim, Vein, Sky, Grey, Tide or Storm ley |
| Mana | every lit building, wards, golems, floating carts | nodes, fonts, Torrent Mills (**seasonal flow**, **Tide ley**), **Vein drakes**, **Eggshell Font** |
| Water | hearths, works, happiness | wells (**Tide ley +2 radius**), cisterns (mana) |
| Goods | markets, carts, barges, couriers, the wyrm, dragons, the airship, caravans | works (**Ember ley**, Glimhouse, **Wyrmfire Forge**, glim-dust, rain), Hanging Gardens |
| Rare goods | **Marvels row**, **caravans**, artifacts (rayscale), the Hall of Marvels | eggs (eggshell, scale), bouts and dragons (scale, wyrmfire), skyrays (rayscale), **Moth-Lofts (glim-dust)**, the delve (relics) |
| Deathcare | the restless, wisps, **Gloam pressure** | Boneyards, Ossuary, the Font, the wyrm's bones, **Bone ley**, **Bone drakes** |
| Faith | happiness, the restless, **Gloam pressure** | shrines, temple, gates, **Hall of Marvels** |
| The Gloam | hounds, pockets, land value, fear, the Long Night | **pressure** (dead, restless, overdraw, wild beasts, the Hush) minus faith, the wyrm, the Tree, **Grey ley**, **Grey drakes** |
| Dragons | roles, bouts, materials, **auras per line** | eggs from every creature system; **attuned cradles** grow faster |
| Creatures | moths (dust), rays (rayscale), golems (labour), tigers (fear) | **Glim ley doubles moths**, **Sky ley reaches rays**, **Fen drakes hide hearths from hounds** |
| Seasons | festivals, goods, mana, hounds, tigers | **the river freezes in the Hush** (barges stop, mills halve) and **floods in the Thaw** (mills +30 %, barges carry 60) |
| Events | crowns, folk, eggs, modifiers | **storyteller**: a grace week after ill tidings, and twice the chance after 25 calm days |
| Trade | crowns, imports | depot, caravans (**rare goods**), the airship, barges |

### 13.2 Ley aspects (Civ-style adjacency, in magic)

Every node carries an **aspect**, one of the eight dragon lines' elements. The founding
node is always Vein; the rest are seeded. Within 10 tiles of a node its aspect changes the
rules, so the map's magic geography decides what belongs where:

| Aspect | Within 10 tiles |
|---|---|
| Ember | Craft output +15 %; fires start ×1.5 |
| Bone | deathcare ×1.5 |
| Glim | glimmoths ×2 at the node; Moth-Lofts gather double glim-dust |
| Vein | +15 mana a day; a Nexus stores ×1.5 |
| Sky | couriers from a cradle fly +25 %; a Ley Beacon reaches 45 tiles |
| Grey | the Gloam never creeps; ward coverage 0.35 (no burning); hounds shy |
| Tide | wells +2 radius; Torrent Mills ×1.5; fires ×0.7 |
| Storm | mana-storms dissolve; the Storm-Caller's cooldown halves |

A cradle within 10 tiles of a node whose aspect matches the egg's line is **attuned**:
growth +25 % and mood +2 a day. The node panel names the aspect; the node's light and the
minimap take its colour.

### 13.3 Dragon auras (every line does something)

A drake or wyvern at stage 2 or more with no role (at its cradle, radius 8) or a warden
post (its district's centre, radius 12) radiates its line: Glim lights the neighbours
without mana, Vein adds 10 mana while it roosts, Grey wards, Tide douses fires, Bone lays
the restless down, Storm dissolves mana-storms, Fen hides hearths from hounds, Sky couriers
carry 40 a third faster, Ember keeps its wyrmfire. The Wyrms panel says what each one does.

### 13.4 Rare goods are inputs (Anno)

Five materials now have sinks. The **Marvels** row (Township to Burgh) is built from them:
the Scale Ward (10 scale: a ward lantern that needs no mana), the Wyrmfire Forge (8
wyrmfire: Craft +25 % within 8 and no Hush), the Eggshell Font (6 eggshell: +25 mana),
the Rayscale Mirror (8 rayscale: leisure within 14 and every passing skyray school turns
to circle it), and the Hall of Marvels (10 of each, one only: happiness +8, artifacts ×1.5,
faith within 12). Moth-Lofts gather **glim-dust** (0.3 a day, double on Glim ley).
Belerial caravans buy rare goods at 400, 300 and 150 crowns.

### 13.5 Gloam pressure (hostility with a rhythm)

`gloamPressure` (0..1, daily) starts at 0.3 and rises with unquieted dead, the restless,
wild golems and tigers, an overdraw, a mana-storm and the Hush; it falls with the share of
zoned buildings under faith coverage, a guarding wyrm, the World Tree's stage and Grey
nodes. Creep probability scales with (0.5 + pressure) and pockets open only above 0.3.
The Forecast and the Advisor name it in words: quiet, restless, pressing, hungry. Deathcare
and faith are now the Gloam's counterweights, not only the Ward Lanterns.

### 13.6 Seasons touch the river

From the fifth day of the Hush the river freezes: barges stay at the quay and Torrent
Mills halve; in the Thaw the flood runs mills at 130 % and barges carry 60. Ember, the
dry season, starts fires ×1.3.

### 13.7 The storyteller

Random events keep their 18-day spacing but skip the six days after any ill tiding, and
after 25 calm days the spacing drops to 10 and the chance doubles, so a stable city is
visited sooner by the world.

### 13.8 Phase 2: the council, the feasts, the routes and the Weave (iteration 24)

**The guild council (4.44).** A lit Guildhall seats four guilds, each with a standing from 0
to 100 that drifts toward 50 and moves daily with things the player already does: the
Carters want a depot, barges, open routes and clear roads; the Alchemists want five Craft
yards, the Herb Garden Edict and full shelves; the Spire-Wrights want a Nexus and Spire
Wardens and hate overdraw; the Sextons of Morrow want an Ossuary, the Rite Subsidy and fewer
than twenty unquieted dead. Every 20 days the least pleased guild (under 60, and only if its
edict is off) petitions for its edict: grant it (+15, and the edict is a promise: +1 a day
while it stays on for 20 days, −2 a day if broken), pay 400 crowns (+8), or refuse (−12 and a
small happiness dip). At 70 a guild pays a boon that touches a system it already represents:
depots sell half again as much, Craft makes 8% more, ley stores hold a fifth more, deathcare
quiets 15% more. At 25 it strikes with the mirror penalty. This is the Frostpunk/Anno
"factions as pressure on policy" loop in Eda's terms: the guilds are how the city argues with
the Warden-Reeve, and edicts stop being free toggles.

**Festival depth (4.46).** The Thaw feast now eats up to 40 goods from the fullest market
shelves (300 crowns) and pays +3 happiness everywhere plus +5 in every district whose
markets fed it (modifiers can be district-scoped now); under ten goods it is a thin feast.
The Remembrance reads the ley through the Ossuary: with one, reading the names stirs only +3
unquieted and keeping the silence lays −15; without one, +12 and −6. The Hush vigil draws
up to 120 stored mana from the Nexus rings and holds the Gloam 6 days plus one per 12 mana;
shallow stores burn the spires instead (+15% demand). A fourth festival, the Lantern Fair
(mid-Bloom, needs a Guildhall), raises export prices by half for six days and pleases the
Carters and Alchemists. Festivals thus read the city's stores, its deathcare and its
markets rather than only its treasury.

**Trade routes (4.45).** The Ledger lists every route the city has and whether it is open:
the Gloam road (depots), river barges (two quays, frozen in the Hush), the airship, the
lit arches, and the new Twin Road. A depot within 12 tiles of the daughter's stake and one
in the mother city carry 30 goods a day from the mother's works to the daughter's markets,
and the Crown pays a toll of one crown a good. The Carters count every open route.

**The Weave view (4.47).** Key W paints each node's aspect for 10 tiles in its line colour
and the auras of grown dragons on top, so the adjacency rules of 13.2 are visible on the map
rather than only in the node panel.

### 13.9 Phase 3: crossed eggs, relic sets and the guild halls (iteration 25)

**Cross-line breeding (4.48).** Two drakes of different lines, both content, in a lit cradle
attuned to one of them lay a crossed egg on Bloom day 20 into any free cradle slot. The
hatchling carries the attuned parent's line and the other as a second line: a second,
fainter aura, attunement to either node, half the second line's scale on each growth, and
wyrmfire if either line is Ember. The cradle's info panel always says why it can or cannot
breed this year. Breeding is the wyrmcraft payoff of the aspects of 13.2: a player who
built cradles on the right nodes now gets dragons no egg event can give.

**Relic sets (4.49).** Every twelfth relic the Ruin Delve brings up is a piece of one of
four sets; an Academy catalogues one piece a day, and without one the pieces wait. Three
pieces complete a set with a lasting boon: the Lantern-Cores hold 60 more mana, the Seals of
the Nine Houses add 3 happiness, the Salt Spoons quiet 10% more dead, the Concord Charts
cut sector prices by a fifth. The Hall of Marvels adds 5% to artifact prices per complete
set. The delve, the Academy and the Hall of Marvels now form one chain.

**Guild halls (4.50).** A guild at 70 or better for ten days in a row raises its own hall
by the Guildhall at its own cost, on road-touching chartered ground: the Carters' Yard
(counts as a depot for the Gloam road), the Alchemists' Lyceum (miasma −33% within 10,
schooling within 8), the Spire-Wrights' Lodge (40 mana stored, the spires bear 15% more
overdraw) and the Sextons' Chapel (quiets 15 dead within 12). A hall locks while its guild
strikes. This is the "faction builds for you" reward from Anno and Against the Storm,
scoped to each guild's own system.

### 13.10 Phase 4: bloodlines, relic buildings and rivalries (iteration 27)

**Bloodlines (4.52).** Two crossed parents (both with a second line) in a breeding cradle
lay a *trueblood* egg: both auras at full radius, growth a quarter faster, half again the
scale on each stage. The Chronicle records the bloodline. This is the third generation of
the aspect chain: node, attuned cradle, crossed egg, trueblood.

**Relic buildings (4.53).** Each complete relic set unlocks a building in the Marvels tab:
the Lantern of the Cores (a ward that lights itself), the Hall of the Nine Houses (faith
and +2 happiness), the Salt Font of Morrow (quiets 30 dead), the Concord Chart-Room
(exports +15% and a forecast). `isBuildingUnlocked` takes the complete sets, and the build
menu says which set a locked relic building needs.

**Rivalries (4.54).** Carters and Spire-Wrights, Alchemists and Sextons are rivals: a
favoured guild (70+) drags its rival −0.4 a day, and a granted petition stings the rival −5
at once. The council block names each guild's rival. Pleasing everyone is now a balancing
act rather than a checklist.

### 13.11 Phase 5: the great wyrm, the assessor and the brawl (iteration 29)

**The great wyrm (4.56).** A trueblood may grow past the wyvern stage to the wyrm stage
(120 days as a wyvern): its auras reach half again as far, the Gloam pressure drops by
0.1 for each (cap 0.2), it sheds double scale on the growth and eats 20 goods a day. The
fourth generation of the aspect chain is a guardian the city raised itself, alongside the
bound Vein-Wyrm.

**Relic trade with the Crown (4.57).** Loose relics are now a stock: the depot sells up to
two a day at 60 crowns once the camp holds more than ten, and the Crown's assessor calls
when twelve or more wait, paying 90 each in person, or 1,500 per uncatalogued set piece
(which leaves the sets), or nothing and +2% educated. The sextons mind relics leaving.

**The brawl (4.58).** When two rivals are both on strike, once per 60 days they brawl on
the square: side with either (+20 / −10), call the Watch for 300 crowns (both +5, a
happiness dip), or let them fight (a building by the Guildhall burns, happiness −6).

### 13.12 Phase 6: the duel, the auction and the charter (iteration 30)

**The duel (4.59).** A great wyrm rises to meet a hostile Vein-Wyrm flyover: the tale is
written, the fires are halved and the old wyrm sleeps deeper afterwards (waking 20, not
50). The dragon you bred now protects the city from the dragon you woke.

**The auction (4.60).** The Belerial caravan bids 100 to 140 crowns a relic, above the
Crown's 60 and 90, and one collector in three buys an uncatalogued piece for 2,500. The
player chooses between the Crown's steady price, the caravan's gamble, and the Academy's
sets; the sextons dislike all of it.

**The charter (4.61).** For 2,000 crowns at a seated council a rival pair sign a charter:
both +10, no more drag, sting or brawls. Rivalries become a cost the player can pay away
once, which is the Anno-style "settle the faction" lever without a diplomacy screen.

This closes M8, the deep dive. The next large steps are M10 Walkers and M11 Peoples (§14).

### 13.13 Later

Smaller follow-ups once walkers exist: scholars carry relic pieces, sextons attend the
brawl, and the great wyrm's duel is flown by the wyvern agent itself.

## 14. Milestones ahead: walkers and peoples

Two large steps, agreed in iteration 30. Both are "rules as data" so that each new kind
or people is cheap once the framework stands. Walkers come first: they are smaller, and a
people without its own walkers would feel thin.

### 14.1 M10 Walkers: NPC kinds that embody the systems

Today the city has citizens (who only walk), carts, builders, the restless and creatures.
Every service is a static radius. The Impressions city builders (Caesar III, Pharaoh)
showed that a walker who *does* the job makes a system legible: you see the watchman
chase the hound, the sexton walk the dead home. The plan keeps static coverage for balance
(it is tested and tuned) and adds walkers as the visible, bonus half of each service:

- **Framework (iteration 31). ✅ Built as 4.62.** `AgentKind.Walker` with a `job` (a string key into a
  `WALKER_JOBS` table) and an `anchorId` (its building). A job declares: who spawns it
  (building kind, count by level or lit state), a patrol (random road walks within the
  service radius, like citizens, or a target picker), an `onTile(state, agent)` hook run
  every few ticks, an `onMeet(state, agent, other)` hook for agent contact, a sprite set
  and a sound cue. `tickWalkers` reuses the citizen movement code (paths, congestion,
  arches). Walkers are rebuilt from their buildings daily like carts, so saves stay small.
  Dev tools: "spawn walker here". Tests: a job's hooks fire, counts follow the buildings,
  removed buildings dismiss their walkers.
- **Kinds (iterations 32–33), one per existing system, each with a small real effect** (✅ all seven: 4.63 sextons, healers, wardens; 4.64 scholars, tamers, pilgrims):
  watchmen from Watch Houses (kill a hound on contact, lay a restless, +0.1 watch on the
  tiles they pass for a day); sextons from Boneyards and Ossuaries (walk restless back to
  the boneyard: a laid restless instead of a killed one, unquieted −1 per trip); healers
  from the Veshari Hall and Healing Houses (visit unhappy or dry homes: +4 happiness for a
  day); Tallowkin wardens from spires under the Spire Wardens edict (walk spire to spire;
  a spire with a warden present cannot surge); scholars from the Academy (walk to the delve
  and back: a catalogued piece arrives when a scholar does, not by magic); tamers from
  Tamer's Lodges (visit cradles: mood +2 per visit, and a hatchling only grows on days a
  tamer came); pilgrims (spawned by events and shrines: walk to the temple, +faith on the
  road). Guild walkers come with M11 so each people can have its own.
- **Rendering.** Each job has a 4-frame sprite in the citizen style with one signature
  prop (a rod, a salt spoon, a satchel, a candle, a book, a leash, a staff) so kinds read at
  2x zoom. The info panel of a building lists its walkers; clicking a walker shows its job
  and what it did today (a tiny log of three lines).
- **Balance.** Walker effects are bonuses on top of coverage, capped per day, so a city
  without them plays as now; the balance bot's days to Free City, averaged over seeds 42–44
  against main, must not move by more than two (single seeds diverge once the random
  stream shifts).

### 14.2 M11 Peoples: playable factions

The lore has six peoples. The default city is Vellish and Hearthfolk. A people is a
`FactionDef` in `src/data/factions.ts`: a name and lore, a palette swap for zone sprites,
a building list (which catalog entries it may build, which it replaces, which are its own),
its own milestone table and names, a `rules` block read by the systems at a handful of
points, a quest chapter, and an event pool. `GameState.faction` names it; the title screen
picks it beside the scenario; the bot plays any of them.

- **Scaffold (iteration 34). ✅ Built as 4.65.** The default Vellish city becomes a faction with no rule
  changes, so nothing moves. The catalog gains `faction?: FactionId[]` (who may build) and
  `replaces?: string`; `isBuildingUnlocked` reads the faction. The `rules` block starts
  with what the Grimmen need: terrain preferences (land value and buildability on hills),
  a ward source multiplier (walls, lanterns), a mana source multiplier (mines, nodes), a
  water rule (wells vs seeps), a dragon rule (cradles or foundries), and a starting kit.
- **Proof of concept: the Grimmen of the Underhill (iterations 35–37; ✅ as 4.66, 4.67 and 4.68).** Stone folk who dig.
  Hearths are *Deep Halls* cut into hills (hills are their best land; grass is poor), water
  comes from *Seeps* in hills rather than wells by the river, the Gloam is held by stone:
  the Warding Wall wards double and the Ward Lantern is replaced by the *Stone Ward*, mana
  comes a third more from Crystal Mines and a third less from spires, golems bind at a
  *Forge-Temple* instead of a Golem Foundry and start bound, the Wyrm-Cradle is replaced by
  the *Hatchery* that only takes Bone, Grey and Ember eggs, milestones are named by depth
  (Camp, Cut, Gallery, Hold, Deephold, Underking's Seat) and advance by stone quarried as
  well as folk. Three unique buildings beyond the replacements (the Forge-Temple, the
  Stone Ward, the Underking's Seat as the wonder), a quest chapter of eight, three events
  (the Underking's envoy, a collapse, a vein of true leystone), and a Grimmen walker (the
  stone-sexton) once M10 exists. Verification: the bot reaches the fifth Grimmen milestone
  by day 70 on three seeds; every Vellish test still passes untouched. *Met in iteration 37*
  (Deep Hold on days 33, 51 and 43; the Vellish run is bit-identical), with one finding: the
  Grimmen plateau at 350–700 folk. *Iteration 38 (4.69)* found the plateau was mostly the
  bot bulldozing its own homes, and gave the Grimmen their deep game: the Delve, the Quarry
  and the Deep Cut.
- **The second people: the Veshari of the Sable (iteration 39 ✅ as 4.70, part 1).** The
  city lives on the water: tide-wells and landings, barges where the Vellish send carts,
  Torrent Mills as spires, the river never freezes for them, reach milestones gated on
  moorings, a Tide Pool for the water lines. *Iteration 40 (4.71)*: the Hush flood, the
  Great Weir, the Sable chapter, the tales and the bargeman.
- **Designed, not built (ideas for the remaining peoples).** *Tallowkin candle-folk:* light is life: every building must be lit or it is abandoned in
  a day, spires reach 7 but cost double, the Hush vigil is mandatory and cheap, their wonder
  is the Lantern of Vell rebuilt. *Fen-Nex:* a trading people with no Craft zones at all,
  goods come by caravan and route, markets hold triple, Fen cat-dragons as wardens, their
  progression is by trade routes opened. *Belerial plains-riders:* no walls, striders for
  carts (fast, no congestion), hounds are hunted for sport (bounty always on), the Gloam
  is outrun rather than warded (pressure matters more, wards less), progression by herds.
- **Cost control.** A people must not touch more than ten rule points in the systems; if a
  people needs an eleventh, the rule becomes data for all peoples first.

## 9. Verification

- `npm test` runs 59 vitest cases: terrain determinism, road/zone/building rules, spire
  chains and brownouts, water coverage, a 60-day growth run, determinism, save/load
  round-trip plus continued identical simulation, bankruptcy, pathfinding, restless dead
  and the Long Night, gloam creep/wards/founding-node loss, wild surge timing, fire spread
  and extinguishing, and a 60-day bot-played town with NaN checks.
- `scripts/balance.ts` plays 150+ days with the scripted bot and prints population, jobs,
  treasury, mana, demand, hazards and milestone days.
- `scripts/perf.mjs` builds a ~500-building city in-page and measures frame times per zoom;
  `scripts/playtest.mjs` drives the real UI with mouse/keyboard; `scripts/shot.mjs`,
  `start.mjs`, `atlas.mjs` produce screenshots for art review.

## 12. Decision log

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
- *Events pause the game:* CS1 does not, but a choice with lore consequences deserves the
  player's attention, and a paused modal is the honest way to ask for it.
- *Problem icons wait two days:* a building that just spawned or briefly browned out no
  longer flashes an alarm; only persistent problems earn an icon, and only at 2× zoom or
  closer.
- *Roads through hills at 3×:* mines must sit in hills, and a hard "no roads on hills" rule
  made half the hill patches unreachable; a costly cut keeps the terrain meaningful.
- *Mines get dedicated carts:* random cart assignment across hundreds of works starved
  the one or two mines in a city; logistics that never happens is not a system.
- *Night flicker fix:* a frame-strided budget for particle lights made every glowing mote
  strobe; the budget is now a stable per-particle subset, lights flicker gently out of
  phase instead of in unison, and brownouts keep the same buildings dark between updates.
  Measured with `scripts/flicker.mjs` (per-frame changed pixels fell from ~5,000 to ~200).
- *Art pass stays procedural:* the brief asks for original art; rather than a hand-drawn set,
  the generator was pushed toward the fantasy silhouette (overhangs, lanterns, alembics,
  rune bands, copper roofs) so every building type reads as Eda rather than as a generic
  village box. The manifest seam for hand-made art is unchanged.
- *Creatures are systems, not decoration:* every creature in the roadmap has a cost, a
  use and a counter, and dragons are a strategic choice (tribute, binding or war), not a
  boss fight; this keeps the CS1 feel of planning under pressure.
- *Bot player in `src/sim`:* balance claims are only worth what can be replayed; the same
  bot runs in tests, in the headless script and in the browser perf harness.
- *Quests are checked, not tracked:* every quest is a pure predicate over the state, checked
  daily over the whole list rather than only the three shown, so nothing a player does out
  of order is lost and the list needs no per-quest progress fields in the save.
- *The Chronicle is world-only:* the ticker mixes chatter, tips and refusals with events; the
  Chronicle takes only what happened in the world, flagged at the call site, so it reads as
  a history of the city rather than a console log.
- *The wyrm is a choice, not a boss:* every branch (leave it asleep, pay, refuse, bind) is
  a valid way to play, and every effect is a number on an existing system (ward coverage,
  happiness, market stock, deathcare) rather than a new one, so it stays a city builder.
- *Panels never overlap by construction:* the left column is a flex stack rather than two
  absolute boxes, and only the panels that float free are draggable; positions are stored
  per panel so a player's layout survives reloads.
- *Free light must cost crowns:* the Glowvine Lane lights without mana, so it is priced
  well above the lantern-way and leashed to a living Hanging Gardens within 12 tiles;
  otherwise spires would be obsolete along any road.
- *Forecasts are derived, not stored:* the Observatory reads the same numbers the sim uses
  (overdraw days, waking rate, calendar), so it can never disagree with what happens.
- *Portals are graph edges, not special agents:* adding teleport edges to the road A* means
  every walker gains them for free and the only movement change is a one-line jump when
  consecutive path tiles are not neighbours.
- *The minimap is a picture, not a second renderer:* one ImageData rebuilt every three
  seconds and a rectangle each frame keep it at a fraction of a millisecond.
- *Golems are labour, not sprites:* a bound warden is twelve hands in `workforceOf`, which
  every job and production formula already reads, so no building code changed.
- *Quest checks are cheap enough to run often:* sixty predicates every five seconds cost
  less than one path search; the daily cadence was the reason finished quests lingered.
- *Vehicles reuse the cart:* floating carts and barges are cart variants with two flags in
  the movement step, so every delivery, counter and inspector row already applies to them;
  only barges needed their own (water) path search.
- *Tigers are a map feature, not a timer:* they exist only on forest-heavy maps, so a
  player who chose a meadow valley never meets one, and a forest valley has a reason for
  its lodges and wardens.
- *The Fen-Nex quarter is one number:* a district id on the state, read by the tithe and
  the shelf cap, keeps the fox-folk a bargain rather than a system.
- *Scenarios are generation options plus a quest:* two terrain flags, one mana constant
  and a scripted collapse give three charters without a second code path; the goal is a
  normal quest with priority 0, so the Ledger and the Chronicle already handle it.
- *The daughter is a second stake, not a second state:* one treasury and one milestone
  ladder keep every system unchanged; the daughter is a place on the map plus a radius.
- *The daily seed is a hash, not a lookup:* no server, no list, the date alone fixes the
  valley, so the challenge works offline and in any time zone that agrees on UTC.
- *Sound cues ride the effect channel:* the sim stays silent and deterministic; it names a
  place and a kind, and the presentation layer decides pan, volume and voice.
- *Sectors are a gate on actions, not a second map:* one 16-byte array and one
  `inCharter` check in each action keep the whole sim unaware of the Charter line; only
  the ground tint and the purchase panel know it exists.
- *Desktop only:* the phone layout and touch gestures were removed. Every panel, tool and
  test now targets one surface, which keeps each feature cheap to add and to verify.
- *Aspects over new buildings:* the deep dive added rules to existing places rather than
  new places, so a player's map knowledge grows deeper instead of wider.
- *Pressure, not timers:* the Gloam's hostility is a function of the city's own neglect
  and care, which makes deathcare and faith matter every day rather than at the rim.
- *Guilds judge what the player already does:* standings read depots, yards, stores and
  the dead instead of new resources, so the council deepens existing systems (iteration 24).
- *Edicts as promises:* a granted petition ties a guild's standing to the edict for twenty
  days, so turning one off is a political act, not a free click.
- *Festivals spend the city, not the purse:* the feast eats shelves, the vigil drains the
  Nexus rings and the Remembrance needs the Ossuary, so each festival tests a system.
- *Breeding is gated by placement, not by a button:* a crossed egg needs an attuned
  cradle, so the aspects decide which crosses a map allows (iteration 25).
- *Guilds build for themselves:* a hall arrives as a reward that the sim places, and it
  locks on a strike, so standing stays a live stake rather than a one-time unlock.
- *Construction shows its work:* placed buildings rise over days under visible builders,
  but zone buildings raise themselves in a day so growth pacing is untouched (iteration 26).
- *Rewards unlock places, not numbers:* relic sets open buildings and bloodlines open auras,
  so late-game depth is still something to put on the map (iteration 27).
- *Dev tools are honest:* they live in the shipped build behind a key, every use is counted
  and marks the daily result, so playtesting is cheap and scores stay meaningful.
- *The late game answers the early game:* the great wyrm pays off the aspects, the assessor
  pays off the delve, and the brawl pays off neglected guilds (iteration 29).
- *Walkers before peoples (iteration 30):* NPC kinds are the smaller step and each people
  will want its own; both are built as data so the second of each is cheap.
- *Walkers are a bonus layer, never the coverage itself (iteration 31):* static radii stay
  the balance baseline; walkers paint on top and their effects are capped per day.
- *A walk replaces a timer where it can (iteration 33):* relic pieces are named when a
  scholar carries them home, not by a daily counter, because the walk is the thing the player
  sees; the counter stays only as the fallback for an Academy with no scholar.
- *One rule, one read (iteration 34):* every faction rule is read at a single point in the
  systems and proved by a throwaway people in the tests, so a new people is a table entry and
  the Vellish game cannot drift.
- *A people replaces, it does not add (iteration 35):* the Grimmen's seep, stone ward and
  hatchery stand in for the well, the lantern and the cradle, so the systems behind them are
  shared and a Hatchery is a cradle everywhere; only the rules and the look differ.
- *A people's chapter is its own (iteration 36):* the quest checker pays any met goal, so
  the Underhill quests briefly paid the Vellish and moved their balance; quests now carry a
  `people` and the shared goals read through `factionKey`, so both peoples see one Ledger.
- *A people's start keeps its promise (iteration 37):* the Grimmen text says they begin
  beside the hills, but two of three seeds founded them on open grass and the bot collapsed;
  the terrain now cuts a ridge for them rather than the bot learning to walk to the hills,
  because the first hour should read as the people's own, and the Vellish map is unchanged.
- *A description is a rule (iteration 37):* the Stone Ward "asks no mana" but only lit wards
  burned Gloam; the gate now reads the catalog's mana fields instead of the lit flag, so a
  building's text and its code cannot disagree about mana.
- *A cache key is a finite set (hotfix after iteration 37):* the light-sprite cache made a
  new canvas element for every distinct key and kept it for ever, and the particle lights
  keyed on a continuous intensity, so the first dusk created twenty thousand canvases and
  the tab died. Callers now quantize, the cache is bounded, and the Playwright night scene
  counts canvases. The same rule for saves: a transient layer (the walkers' bonus) is never
  serialized; the save was carrying eighty thousand numbers of it.
- *Ask before you dig (iteration 38):* the bot's clear mode bulldozed homes and only then
  learned the seep could not stand there; the placement check now has a `clearing` mode and
  the bulldozer asks it first. Fixing the bot moved the Vellish balance by more than the
  two-day band of §14.1 (a gain), and that is accepted: the band guards against sim drift,
  not against the bot ceasing to wreck its own town; the new lines are the baseline.
- *Stone is what is cut, not what is touched (iteration 38):* the stone count read the total
  of every terraform op; it now reads a count only cuts raise, so a forest clearing is not
  a depth milestone.
- *A people's op or edict is a field on the table (iteration 38):* terraform ops and edicts
  carry `faction` like buildings do; the table filters the UI, the action refuses, and the
  hot-path reads (`edictOn`) are gated once, so a second people adds rows, not branches.
- *A people id and a building key share no namespace (iteration 39):* the Veshari Hall is
  `veshari` in the catalog and the people is `veshari` in the factions; nothing joins the two
  strings, and the atlas names (`b_veshari`, `hearth_l1_v0_veshari`) keep them apart.
- *A multiplier where the neutral value is one (iteration 39):* the river's land-value bonus
  became `× waterLandValue`, the Torrent Mill `× millMana`, the freeze `&& riverFreezes`: ×1,
  −0 and `&& true` are exact identities, so adding a people never moves the others by a bit.
- *A derived layer is derived from the save, not the seed (iteration 39):* `waterDist` was
  rebuilt from a fresh map on load; now from the saved terrain. The Grimmen ridge got away
  with it because hills are not water; the Veshari channel would not have.
- *The start keeps the promise, again (iteration 39):* as the ridge for the Grimmen, a channel
  brings the water within six tiles of a Veshari founding rather than teaching the bot and
  the player to walk to it.
- *A people's hazard is the absence of a rule (iteration 40):* the flood is what happens
  where the freeze does not, read from the same `riverFreezes` field, so the Vellish winter
  and the Veshari winter are one season with two faces and no new rule point.
- *A walker that spawns zero is a walker that is not there (iteration 40):* the bargeman's
  `count` is 0 for a people whose river freezes, so Vellish quays field none and their rng
  stream never moves; a people-gated job is a count, not a branch in the framework.
- *A hall list is a row (iteration 40):* the renderer's four copies of "lantern or seat"
  became `WONDER_HALLS`; the third wonder cost one string.
