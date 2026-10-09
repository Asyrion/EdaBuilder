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
  demand > 1.25× supply for 5 days (and only while the Nexus store is empty): **wild surge** — random lit buildings are
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
| Deathcare | Boneyard (quiets 12 a day, r12), Ossuary (40 a day, r20) | | quiets the dead |
| Ward | Ward Lantern (r10) | | repels Gloam, lowers gloam-fear |
| Leisure | Garden of Aume (r6), Market Square (r8) | | land value & happiness |

### 4.8 Land value
Base 20 + road tier bonus + water proximity + leisure/faith coverage + lit +
watered − miasma − gloam proximity − traffic. Range 0–100.

### 4.9 Happiness, health, unrest, education
- Per-building happiness = f(services, land value, tax, lit, watered, miasma,
  gloam nearby, unrest, traffic). City happiness = resident-weighted mean.
- Health from healer coverage + water − miasma. Deaths per day = residents ×
  base mortality × (1.7 − health). Bodies go to deathcare capacity; excess become
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
  **Fail: The Gloam takes the founding node** (any gloam tile within 3 tiles of the
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

### 4.18 Districts and per-district edicts (iteration 3; rebuilt with charters in 4.73)
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

### 4.72 The Tallowkin of the Wick, part 1: rules, buildings, the twin-node start, the look, the bot (iteration 41)

The third people on the scaffold (M13). The lore has the Tallowkin as the small candle-eyed
people born beside the Veins, the spire-wrights of every wardlight, living in tall narrow
wickhouses and never closing a window at night: so **the Tallowkin of the Wick**, a wardlight
chartered by the spire-wrights, where a dark house is a dead house and the milestones measure
how much of the city burns bright.

**Rules** (five new fields, neutral by default, one read each): `spireReach` (+1 to a spire's
link and light radius: 7 and 6), `spireCost` (×2, through `costOf(s, def)`, the one helper
every price read now goes through: placement, the build tab and tooltip, the ghost, the bot),
`darkAbandon` (a zone building unlit for more than 3 days is abandoned "no light"; it reads
the existing `problemDays`, which also counts dry days, so a long-dry home that goes dark
falls at once, and that is in the people's spirit), `vigilCost` (the Hush vigil draws 60
stored mana, not 120) and `vigilMandatory` (sleeping through it costs −8 happiness for 30
days, not −3 for 20; a choice's `desc` may now be a function of the state so the panel
shows the people's numbers), plus `nodeMana 1.2`. Milestones by light (Wick, Taper, Candle,
Lamp, Lantern, Beacon-Street, Bright Town, Hall of Wicks, Lantern of Wicks) are gated on the
**lit share** of standing buildings: 50 % for the Taper up to 90 % for the Hall.

**Buildings.** The **Wick-Tower** (ley, 250 crowns, no mana) is a member of the spire chain
that is lit within reach of a lit spire or node and lights four tiles, but is never enqueued:
it relays nothing, so no spire and no other tower lights from it. The **Candle-Shrine**
replaces the Shrine of Aume (faith r6, `selfLit`, no mana so a brownout cannot darken a
self-lit shrine); pilgrims walk from it and pray at it. The **Lantern of Wicks** replaces the
Lantern of Vell (18,000, `selfLit`, a `WONDER_HALLS` row). The `_tallowkin` zone look is the
wickhouse: four tiles taller, an overhang, a lit window on every floor, whitewash and plaster
under cones and shingles; half the people's citizens are candle-eyed (variants 0–2 map to the
glowing variant without a new rng draw).

**The twin-node start.** A people born beside the Veins founds its city between two:
`generateTerrain`'s `twinnode` option places a second ley node on the first buildable tile
at Chebyshev distance 8, pre-set to the Vein aspect (so `assignAspects` draws nothing for it
and the clearing keeps its aspect), skipped on the one-node scenario. Two nodes a fifth
stronger each: 216 mana a day from the first morning, against a people whose spires cost
double and whose homes die in the dark.

**The bot.** A `brighten()` step before `keepLit`: when the light gate is short, a Wick-Tower
within three tiles of each dark building that has a lit spire or node in reach, else a
spire; `keepLit`, `placeNear` and `want()` read `costOf`; the reach test reads the rule.

**Also in this iteration, from a playtest report:** idle builders and citizens were drawn
with the walk cycle while standing still, and every walker marched in step on one global
frame, stacked on the same pixel. Each agent now walks at its own pace (its speed and its
id), stands still when it has no path, and keeps a lane of its own (a two-pixel sideways
offset by id), so a crowd on one road reads as a crowd.

**Balance (150 days, twin-node start):**

| Tallowkin | Taper | Candle | Lamp | Lantern (fifth) | Beacon-Street | Bright Town (1,000) | Hall of Wicks | folk d150 | lit d150 |
|---|---|---|---|---|---|---|---|---|---|
| seed 42 | 3 | 10 | 16 | 21 | 31 | 42 | — | 1,101 | 86 % |
| seed 43 | 4 | 10 | 15 | 20 | 27 | 37 | 54 | 1,644 | 99 % |
| seed 44 | 5 | 10 | 16 | 22 | 30 | 38 | — | 1,120 | 86 % |

All three reach the Lantern by day 22 (the plan asked for day 70) and Bright Town by day 42:
two nodes a fifth stronger each make the early game the fastest of the four peoples. Two
seeds then sit at 86 % lit, four points short of the Hall of Wicks, because the bot only
brightens what the gate demands and a town of a thousand has corners the Wick-Towers do
not reach; the lamplighter and the bot's late light are part 2. Vellish, Grimmen and Veshari
seed 42 are bit-identical to main.

### 4.73 Districts that do something: charters, the unlock, the painting moment (iteration 42)

From a playtest: the Districts tab was open from the first minute, nothing explained it, and
painting a district changed nothing the player could see. Districts (4.18) were a layer whose
only direct use was the *scope* of an edict, plus a few indirect readers (the Fen-Nex quarter,
a warden drake's beat, the Weather Vane, the feast). So a district is now something the player
decides, with an effect the same day, and it explains itself.

**Charters** (`src/sim/districts.ts`, the `QUARTERS` table; `GameState.districtQuarters`,
saved). A district carries none or one of five, and every effect is one read at a hook the
systems already had, as a people's rules are:

| charter | gift | price |
|---|---|---|
| Hearth quarter | land value +6; hearths +3 happiness | craft works ×0.8 |
| Craft quarter | craft works ×1.2 | hearths −4 happiness; miasma ×1.3 |
| Market quarter | markets hold ×1.5 and pay ×1.1 tithe | land value −4 |
| Scholars' quarter | arcane works ×1.2; school coverage ×1.25 | upkeep ×1.1 |
| Temple quarter | faith coverage ×1.5; hearths +2 happiness | markets pay no tithe |

`quarterAt(s, i)` resolves a tile in one lookup; `marketStockCap` reads a per-tick snapshot
like the Fen-Nex district. A district with no charter is what it was: a scope for edicts.

**The painting moment.** Painting switches the district view on and toasts "Hearthside: 7
buildings, 1 of them works. No charter yet…" with a button that opens the Edicts panel on that
district, where a **Charter** row (five buttons and None, each with its gift and price) sits
above the edicts and the stats line. The Districts tab's items carry the charter in their
label and a tooltip that says what a district is for; the district view's label shows it too.
**The unlock:** districts open at the Hamlet (`DISTRICT_UNLOCK`), the Hamlet's text says so,
and the Districts chapter of the Ledger is five quests: paint, charter, see it pay
(`stats.quarterDays`), an edict, a name. A `quarter` dev command charters the district under
the camera. **The bot** paints its hearth square at the Village and charters it a Hearth
quarter, so the balance runs carry the mechanic (below). It first chartered the mixed ring
beyond as a Craft quarter and lost a third of its folk by day 150: a charter's price lands on
whatever is inside, and a ring of works, markets and hearths pays all of it.

**Also from the playtests: a selected building shows its reach.** `influenceRadius(s, def, b)`
(a service's radius, a well's water, a spire's light with the people's reach, a Wick-Tower's
four, a Nexus or wonder's nine) draws the same ring the build ghost draws, in amber, around
the selected building.

**Balance (150 days, the bot's Hearth quarter; main in brackets):**

| | Free City | Beacon | folk d150 |
|---|---|---|---|
| Vellish seed 42 | 52 (64) | — (92) | 2,072 (3,094) |
| Vellish seed 43 | 48 (never) | — (never) | 1,910 (1,456) |
| Vellish seed 44 | 51 (50) | 83 (91) | 3,316 (3,521) |

The mean day of Free City over the three seeds falls from 57 (two seeds reached it) to 50
(all three do), inside the §14.1 rule in the right direction. The folk at day 150 move both
ways (−33 %, +31 %, −6 %): the charter is a plain gain for the hearths it covers, so the
day-150 spread is the rng path diverging once growth changes, as §14.1 expects of a single
seed; seed 42's lost Beacon is recorded in NEXT_STEPS as something to look at when the bot's
late game is next on the table. The other peoples on seed 42: Grimmen Deephold 81 (70),
Veshari Weirhold 48 (54), Tallowkin Bright Town 48 (42).

### 4.74 Two playtest findings: window light in depth order, the caravan's rhythm (iteration 43)

**Window light.** At night every lit sprite's glow (the windows of a house, the ley of a
spire, a glimmoth) was collected in one list and added after the light pass with no depth
order, so the lit windows of a house showed through the roof of the house in front of it.
The renderer now keeps an **emissive layer** the size of the back buffer, filled in the same
depth order as the sprites: each item lays its glow down at its place in the sorted draw, and
each sprite in front first cuts its own silhouette out of the layer (`destination-out`), so a
glow behind a roof is gone before the roof is drawn over it. The ward wall's inlays go down
first, under everything. The light pass then adds the layer twice as before (soft at quarter
size for bloom, crisp at full size); by day the layer is not touched. Cost: one extra
`drawImage` per visible sprite at night, nothing by day. `scripts/playtest42.mjs` draws two
overlapping rows of lit hearths at the dead of night.

**The caravan.** The Ledger's "Sell 200 goods to a Belerial caravan" could never complete:
the Trade choice sold the goods and never counted them, and the caravan was one random tale
among forty, drawn by the storyteller every ten to eighteen days with a one-in-four chance, so
a player with a depot could wait a season and never see one. It was written in §11 as "every
season a caravan *may* reach the depot"; now it does. The caravan keeps a rhythm of its own
(`maybeFireCaravan`, before the storyteller's draw): the first halts six days after the Trade
Depot stands, then **every twelve days** while a depot stands and the city is a Village; it
is never drawn as a random tale any more. Trade counts what it sells (`stats.caravanGoods`),
its description says how many surplus goods wait on the shelves, and the depot's panel has a
**Caravan** row: days until the next, the surplus it would buy, the goods sold so far. The
quest's hint says the rhythm and the rule (works' stock above ten). Saves carry
`stats.lastCaravanDay`; an old save starts the count the day it loads.

Balance: the six runs of §4.73's table (Vellish 42/43/44, Grimmen, Veshari and Tallowkin 42,
150 days) are bit-identical to iteration 42, which is a finding of its own: the bot wants a
depot (`want('depot', 1)`) and never stands one on any seed (`depot 0` at day 150
everywhere), so neither the Gloam road nor the caravan is played by the balance bot. Recorded
in NEXT_STEPS for the depth pass.

### 4.75 The sweep: seventy findings from the audit (iteration 44)

After the run of playtest bugs, five reviewers read every building and mechanic against
what its description, quest, help line and this document promise; a sixth hunted only for
broken mechanics and confirmed the worst with scripts. The whole review is **docs/AUDIT.md**:
seventy numbered findings (B1–B70), a depth rating for all 74 buildings and every system,
and the design of M14 (§15). This iteration fixed everything the audit marks "44"; what
follows is the shape of it, by group.

**Quests.** Festival tales are recorded as `id@year:choice`, and `chose()` now reads that
form, so the Hush vigil and the Thaw feast complete. Scenario goals carry `strict: true`
and complete only while their `when` holds, so a valley game no longer collects the one-node
and inherited rewards at Burgh; the failed daily leaves the Ledger after day 60. Three quests
read a thing that was never counted: `stormsDissolved` (a storm the wards end early),
`fullDays` (days in a row with no market short), and the Vein egg is a dragon of the line,
not a tale fired. "See glimmoths" needs a lit spire or loft as the moths' source; "Name a
district" ignores the daughter's; the taming-edict quest reads district edicts; the Beacon
quest sends the player to the Lantern of Vell, which the Beacon of Eda now requires lit.
Buying a sector no longer counts its Gloam as burned.

**Timing and counting.** A walker's visit is stamped for the day the daily reader sees
(`tended = day + 1`), so the healer's +4, the bargeman's bailing and the tamer's tenth land
in the stored numbers instead of only in the panel. The surge count runs only while the
Nexus store is empty, the store drains by its deficit over the eighteen updates of a day
(it drained 1.8× too fast), and the top bar shows "store 96/120". The fired-tales list is no
longer cut to forty entries, so `once` tales stay fired and chains keep their earlier choice;
the Concord relic is once. Trade is banked before the ledger copies the day. Couriers fill a
shelf to its real cap (the market quarter's, the Fen-Nex's) and carry the rest back to the
works. "Send leystone" counts before it takes; two craft-tax caps give the lower, not the
sum; the Sextons are driven by the restless walking and the dead left waiting, not by a
threshold the restless pipeline made unreachable. The Thaw's day on the wards marks chunks,
counts its burn and recomputes the Gloam distance; the Lukuku hoard holds sellable relics.
The aura cache is keyed by seed. Old saves default four more counters.

**Scope.** Five edicts are read city-wide only (Beastmasters, Bounty, Wyrm-Peace, Spire
Wardens, Imports); they are flagged `cityOnly`, hidden from the district scope and never
billed per district. The tiger bounty reads `edictOn`.

**Promises kept.** The Glowvine Lane conducts light like a lantern-way, so it lights the
hearths along it (and only a Hanging Gardens keeps a lane alive). A Market Square's markets
within 8 pay 15 % more tithe. The Lantern of Vell gives +5 happiness city-wide while lit.
A Moth-Loft's Craft bonus is 4 % per glimmoth that swarmed it the night before (its `stock`
remembers the most moths within 8), up to the 20 %. The Hall of Marvels needs light. The
caravan buys wyrmfire (500) and eggshell (200), as the Wyrms panel said. The
Storm-Caller's Peak is raised only by a city that gave the storm caller the hills (the tale
is drawn first while it is eligible, so every Township meets them); the Wyrm-Court needs a
woken wyrm. `specialLock(s, key)` is the one place such gates live, and `canBuild` reads it.

**Panels.** "No walker" shows only on a building that could field one; the advisor's Watch
focus opens the Watch view; the node's Flow row carries the people's multiplier and the Vein
bonus; the Waters row shows the dug-near-water and Tide bonuses; the Watch House shows the
Mews-doubled radius and its watchman patrols it; a trueblood's growth is a true percentage;
landings count as moorings and get rows; a building's abandonment is always told, with its
cause and a jump.

**Sim logic.** A teleport checks both arches lit; a gate is bulldozed before the road under
it; the bot deepens the founding node by its coordinates (it could deepen the wyrm's and
wake it); bred eggs go to a cradle of their line; the Crown's gift is a tide egg for the
Veshari; the poachers check room and purse before taking crowns; the Fen-Nex fallback pays
its 500; the captain's story fires on maps without a wyrm; the Academy names a piece itself
after ten days a scholar brought none; the theft tale needs an Academy; the Gloam road
carries 8 a day per depot city-wide from the fullest shelves (DESIGN 4.22, at last) and the
Quarry's and the Gardens' goods go with them; a works makes by its hands (×workers/jobs,
floor a quarter); the Carters' Yard counts as a depot for the carters and the routes list,
and landings for "a second quay"; eggshell keeps and wyrmfire leaks 0.02 a day; the wyrm's
bones quiet 80 for 120 days and 20 after; the merchant needs ten quiet days, not thirty; a
choice that names "(N crowns)" in its label is refused by a lighter purse.

Balance after the sweep, 150 days, against iteration 43 in brackets:

| run | Free City / last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | 67 (52), no Beacon | 2,824 (2,072) |
| Vellish seed 43 | never: Burgh 47 (48) | 1,312 (1,910) |
| Vellish seed 44 | 60 (51), no Beacon (83) | 2,005 (3,316) |
| Grimmen seed 42 | Deephold 53 (81) | 1,342 (1,256) |
| Veshari seed 42 | Weirhold 71 (48), Vesh's Court 103 (89) | 2,107 (2,023) |
| Tallowkin seed 42 | Bright Town 41 (48) | 1,316 (1,100) |

The Vellish bot is slower on all three seeds, and the day-by-day comparison of seed 43
names the cause: the old game paid the bot crowns it was never meant to have. "No market
short for five days" completed on its first good tick (+600 around day 20: one spire's
worth, which on seed 43 is the difference between a Township on day 20 and on day 27), and
both scenario goals paid at Burgh with ten clean days in an ordinary valley (+10,000). The
fixed game is poorer by that much and honestly so; this table is the baseline the depth
pass is measured against, and M14 part 5 (the bot's depot, taxes and edicts) is where the
bot earns it back. The Beacon of Eda now needs the Lantern lit; the bot wants one only with
30,000 crowns spare, which seeds 42 and 44 never had, so the "no Beacon" is the bot's purse,
not the gate. The Grimmen and the Tallowkin gain (the quarry's hands, the loft's moths, the
Sextons' drivers); the Veshari's Harbour came on day 57 instead of 15 on seed 42, a stall
of the bot's second landing on a poorer early purse that the three-seed rule treats as one
seed's path. The founding-node failure stays at 3 tiles (the code's number; this document
said 2).

### 4.76 M14 part 1a, the ley has limits: linked nodes, spire load, brownout tiers, lantern-ways that need their light (iteration 45)

The audit's first finding about supply was that it had none: every node's 90 mana counted
whether or not anything stood near it (the node panel even said "spires within 6 drink from
it"), one spire carried any load, a brownout darkened by distance alone, and an unlit
lantern-way was a free upgrade over cobble. Four limits, each one read in `updateMana` and
one row on a panel.

**Linked nodes.** The chain search carries each queue entry's node; a member (spire,
Wick-Tower, Nexus, hall or Stake) found straight from a node marks it linked
(`state.nodeLinked`, recomputed every update). A linked node gives its full flow, 90 plus its
depth and a Vein's 15; an unlinked node **seeps half its 90** into the ground and none of its
depth (`nodeFlow(state, linked)` in world.ts, `NODE_SEEP`); the one-node scenario's deep Vein
and the true veins left to the ley count always. The first cut gave an unlinked node nothing,
and every bot collapsed: a Village needs some 200 mana and a valley's one linked node gave 90,
so the Grimmen ran on 70 and the Tallowkin stuck at 72 % lit. Half is the number at which
the early city stands and linking a node is still worth a spire and a sector. The node panel
has a Linked row that names the seep, and the deepen button refuses an unlinked node. The bot links the nearest unlinked node in
its reach when demand passes 85 % of supply, never a sleeping wyrm's (`linkNodes`).

**Spire load.** Every lit consumer draws through its nearest lit member or node (centre
distance); a member's load is the mana of the consumers attributed to it. Caps: a spire 80,
a Wick-Tower 20, the Stake 60, a Nexus or a hall 200; nodes carry anything. Over the cap a
member sheds its farthest consumers until it fits, the already-dark first so nothing blinks,
and this happens before the city brownout. The panel shows "Load 96 / 80 mana of buildings"
and the problem "Overloaded: its farthest buildings go dark. Raise another spire among them."
The load is the figure before shedding (`Building.load`, transient), so the player sees how
far over the spire is. A dense block of level-3 shops at 8 mana each needs a spire every
ten; this is the reason spires are many and not one long chain.

**Brownout tiers.** `Building.priority` is 0 Essential, 1 Normal or 2 Dim; unset means by
category (wards and water essential, leisure dim, the rest normal: `priorityOf`). The
brownout darkens the already-dark first, then Dim, then Normal, then Essential, the farthest
from the nodes first within a tier. The building panel has a Brownout row of three buttons
for every mana user; a changed tier is judged afresh (the host marks the building lit before
recomputing, so the sort does not keep it dark by habit). Saved with the building.

**Lantern-ways that need their light.** When demand with the roads' draw exceeds supply the
lantern-ways dim first: their mana leaves the demand and every lantern tile is unlit, even
under a spire's own light, with hysteresis (`state.roadsDim` clears only when demand plus the
roads fits again) so they do not flicker across the eighteen updates of a day. They still
conduct this update. An unlit lantern tile is cobble for pathing cost, speed, congestion
capacity and land value (`roadAt` in `src/sim/roads.ts`, read at those four points), so an
unlinked lantern-way is no longer a free upgrade. A glowvine lane never draws (it was charged
a mana a tile by the old count).

Balance, 150 days, against the iteration 44 table in brackets:

| run | Free City / last gate | folk at day 150 | brownout at day 150 |
|---|---|---|---|
| Vellish seed 42 | 58 (67) | 3,039 (2,824) | 0 % |
| Vellish seed 43 | never: Burgh 47 (47) | 1,196 (1,312) | 11 % |
| Vellish seed 44 | 60 (60) | 3,032 (2,005) | 5 % |
| Grimmen seed 42 | Deephold 74 (53) | 1,472 (1,342) | 61 % |
| Veshari seed 42 | Weirhold 106 (71), Vesh's Court 133 (103) | 1,640 (2,107) | 34 % |
| Tallowkin seed 42 | Beacon-Street 55, no Bright Town (41) | 865 (1,316) | 15 % |

The Vellish bot is unharmed (two of three seeds gain), because the valley's founding node
and the Fonts it builds carry it and its `linkNodes` reaches a second node. The three peoples'
bots are not: they are poor (the Grimmen end with a few hundred crowns), so they neither buy
the sector a far node lies in nor raise the Fonts that would replace the seeped half, and
they sit in a brownout for the whole late game; the Grimmen's half-flow rule halves the seep
too. A human Grimmen player raises Thrum Fonts on the hills (×2 there) and a Tallowkin player
links the nodes along the lantern-ways; the bots will learn both in part 5. Recorded in
NEXT_STEPS as the peoples' bots' purse.

Water, mud, mine seams, Font flares, shared rivers, portal crossings and the Gloam that takes
a dark building are part 1b, the next iteration.

### 4.77 M14 part 1b, the ground has limits: wells, mud, seams, flares, rivers, crossings, the Gloam that takes (iteration 46)

The second half of part 1. Each is one read at its hook, one row on its panel, and a way to
lose.

**Wells with capacity.** A water building serves a number of zone levels: a Well 30, a Seep
20, a Tide-Well 45, a Cistern 90 (`WATER_CAP`). Every zone building inside a well's reach
draws its level from its nearest covering well; a well serves the nearest first, and the
farthest beyond its cap go dry with `dryBy = 'overdrawn'`; a home its nearest well cannot
serve draws from another well in reach with room. The panel: "Drawn 39 / 30 levels of homes
and works" and "Overdrawn: its farthest homes are dry. Dig another well among them"; a dry
home's problem names the overdrawn well. The four wells have four roles at last: a plain
Well dug more than 8 tiles from any water reaches only 4 (the Cistern lifts water anywhere
and keeps 12: its reason); the Seep swells to 9 in the Thaw and shrinks to 3 in the Ember;
a bank Well within 2 of the river is fouled while the Veshari's Hush flood is up, and the
Tide-Well is not (`waterRadiusOf` in world.ts).

**Mud.** A dirt track runs at six tenths in the Thaw and the Hush (`roadSpeedAt`, read at
the pathing cost and the carts' speed; cobble and better do not mind).

**Mine seams.** A Crystal Mine's seam holds 2,400 leystone (`Building.seam`, a full seam
when unset); the daily cut and a delver's bonus come out of it; cut out, the shaft gives 2 a
day of dust and wakes wardens three times as often (`GOLEM_WAKE_CHANCE × 3`). Panel: "Seam
61 %" and, spent, "Bulldoze it or move on."

**Font bore flares.** Past nine tenths of the flow a lit Thrum Font has one chance in fifty
a day to flare: it and the zone buildings within 2 ignite and it smokes miasma 6 within 4
for ten days (`Building.flare`, read by `updateMiasma`). The forecast and the Font's panel
say "the Fonts run hot" (`fontsRunHot`). The Font's "a little dangerous" is a sentence the
player can read a number behind.

**Mills that share a river.** A Torrent Mill with an older mill within 8 makes six tenths
(`MILL_SHARE`); its panel shows "Output 39 mana / day" and names the sharing.

**Portal crossings.** Every crossing counts on both arches (`Building.load`, reset daily),
draws a tenth of a mana, and past 60 a day the jump costs the carts like a jammed road in
the route search (`PORTAL_CAP`, `PORTAL_MANA`). Panel: "Crossings today 34 / 60".

**The Gloam that takes.** Creep never enters a building's tile, and keeps two tiles from a
lit or warded building; past a pressure of 0.65 (`GLOAM_TAKES`) it may come up to the door
of a dark, unwarded one. Such a building counts `greyDays`: on the first the Chronicle says
"the grey is at the door: light it or ward it within two days" with a jump, the panel lists
it, the renderer shows the Gloam icon over it; on the third day it is taken and its tiles
grey (`GREY_DAYS = 3`). Lit or warded again, the count resets. The swallow code the audit
found unreachable in normal play now has a path to it, and the brownout tiers of part 1a
have a reason: a Dim building at the grey edge is the one the Gloam takes.

Balance, 150 days, against the iteration 45 table in brackets:

| run | Free City / last gate | folk at day 150 | brownout |
|---|---|---|---|
| Vellish seed 42 | 68 (58) | 2,625 (3,039) | 13 % |
| Vellish seed 43 | never: Burgh 50 (47) | 1,174 (1,196) | 17 % |
| Vellish seed 44 | 83 (60) | 2,672 (3,032) | 0 % |
| Grimmen seed 42 | Deephold 107 (74) | 1,262 (1,472) | 62 % |
| Veshari seed 42 | Weirhold 54 (106), Vesh's Court 93 (133) | 1,936 (1,640) | 40 % |
| Tallowkin seed 42 | Bright Town 134 (none) | 1,051 (865) | 3 % |

The Veshari and the Tallowkin gain (their bots had been starved of water the wells now
serve by capacity, so the dry homes they dug for are the ones that count); the Vellish and
the Grimmen bots lose two to three weeks to Free City. A seed-42 run with mud switched off
reaches Free City on day 70, so mud is not the cause: it is the wells' capacity, which the
bot meets only after a home has gone dry (three wells a day, beside the dry ones), so a
capacity-limited town lags its own growth. Part 5 teaches the bot to dig ahead of its
hearths. Recorded in NEXT_STEPS.

### 4.78 M14 part 2a, services with staff and stakes: crews, the breakdowns, deathcare in the open, wards with a budget (iteration 47)

The audit's part 2 begins with the services, which employed nobody, whose strength was
cosmetic, and whose reasons the player could not read. The first half:

**Crews.** A service building has a crew (`capacity` on the def: Watch Post 4, Watch House
10, Healer 4, Hospice 16, the fire hall 8, shrines 2, Temple 6, Academy 12, Grand Academy
20, Boneyard 3, Ossuary 8, the Chapel 3, the Salt Font 3, Hunters' Lodge 6, Guildhall 4);
wards, wells, leisure and wonders need none. The `extraJobs` path that already staffed the
Quarry fills them from the city's hands, so services compete with the works for folk, and a
service radiates `strength × max(0.3, workers / crew)` (`crewFactor`, read in
`updateCoverage` and in deathcare's quieting). The panel shows "Crew 7 / 10" and a
short-handed problem under eight tenths.

**The breakdowns.** `computeBuildingHappiness` is now the clamped sum of `happinessTerms`,
each term labelled ("lit +6", "the Gloam near −12", "unrest −9", "no work −4"); the panel's
Happiness row carries a why-line with the three largest terms each way. Land value the same:
`landValueTerms` per tile (the building-bonus map computed once in `landBonusMap`), and
`updateLandValue` sums them. `levelUpNeeds` lists what the next level needs with a tick or a
cross ("land value 62 (55 now) ✗ · lit ✓ · schooling ✗"). The demand bars' tooltip carries
`demandReasons`, one line per bar from the numbers `updateDemand` just used.

**Deathcare in the open.** `dailyDeath` records `quietCap`, `quietedToday` and
`waitingDead`, and the Budget's social line reads "Dead today 7 · quieted 6 / capacity 12 ·
waiting 3". Land value is 6 lower within 4 tiles of any deathcare (`DEATHCARE_LV`, a negative
entry in the bonus map), so the dead compete with good homes for ground. The Sextons' Chapel
fields two sextons like an Ossuary. The Salt Font takes a loose relic every three days and
quiets twice as many while it lasts (`b.cooldown` as the days the relic holds; the panel says
so), the first sink for loose relics outside the Crown's purse.

**Wards with a budget.** A ward burns at most `round(12 × strength × crew × plating)` grey
tiles a day, the nearest first (`wardBurnBudget`, the wyrm's budget rule), instead of its
whole radius; its coverage still keeps the creep out of its reach, so a ward holds a circle
and clears it slowly. The Stone Ward burns nothing: it holds, and its stone-sexton cuts two
a day (the text is true now). The Scale Ward's plating wears a tenth a season
(`Building.plate`, floor 0.3), multiplies its ward and its burn, and is re-plated from the
panel for 2 scale (`replate` on the host): the second sink for scale. The panel of every
ward shows "Burns 12 grey tiles a day" and "Grey in reach: 41".

Balance, 150 days, against the iteration 46 table in brackets:

| run | Free City / last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | 61 (68) | 2,939 (2,625) |
| Vellish seed 43 | never: Burgh 36 (50) | 1,277 (1,174) |
| Vellish seed 44 | 68 (83) | 3,006 (2,672) |
| Grimmen seed 42 | Deephold 59 (107) | 1,352 (1,262) |
| Veshari seed 42 | Weirhold 86 (54), Vesh's Court 135 (93) | 1,686 (1,936) |
| Tallowkin seed 42 | Bright Town 64 (134) | 996 (1,051) |

Five of six runs gain, two of them by weeks: the crews are jobs, and a city with more work
has less idle unrest and happier hearths, which outweighs the hands the works lose; the slower
wards did not cost the bot (its Gloam counts are within a few hundred tiles of before). The
Veshari's Harbour stalls again on seed 42 (day 56), the bot's second landing on a poor early
purse, as recorded in §4.75.

### 4.79 M14 part 2b, unrest with teeth, halls with a difference, the smaller rows, the kin rings (iteration 48)

The second half of the audit's part 2: the pressures that were silent numbers get an event
and a cost, the halls that were bigger copies of smaller halls get a role, and the counters
the player never saw get a row. One addition from the playtest: the reach of the buildings
already standing is drawn while a new one is placed.

**Unrest with teeth.** `state.unrestHigh` counts the days unrest stands above `RIOT_UNREST`
(0.5), reset the day it falls. At `RIOT_DAYS` (5) `maybeFireRiot` (run before the storyteller
each day) fires *A riot in the market*: **Send the Watch** finds the market with the least
watch coverage; at half or more the Watch holds the square (+3 happiness for 5 days), under
it the market is ignited (`igniteBuilding`); **Pay the Crown's peace** costs 600 crowns and
sets unrest −0.1 for 10 days. Either resets the count and adds `stats.riots`; the
Observatory's forecast warns from the third day. Theft: a market with watch coverage under
`THEFT_WATCH` (0.3) loses a tenth of its shelves each day while unrest is over `THEFT_UNREST`
(0.3) (`theftAt`, `stats.goodsStolen`; the market's problem names its watch and the unrest).
Idle scholars: educated above half with Arcane jobs under a tenth of the folk adds
`IDLE_SCHOLARS` (0.05) to the unrest target; the Budget's social line says so.

**Halls with a difference.** The Hospice draws 2 goods a day from the fullest market within
16 onto its own shelf (`HOSPICE_DRAUGHTS` 10) and uses one; with none it heals at 0.6
(`updateCoverage`; a Draughts row and a dry problem). A pilgrim from a shrine who prays at a
Temple consecrates that shrine for `CONSECRATED_DAYS` (10, `Building.blessed`): its faith
radius is ×1.5 (a Consecrated row; the Temple's panel says what it consecrates). A Veshari
hall that is not watered works at half. Artifacts sell at +5 % per full 10 % of educated
above 0.4 while a lit Grand Academy stands (`grandAcademyBonus`; its panel shows the bonus).
Every fifth day a lit Academy or Grand Academy takes one loose relic and raises
`state.educatedFloor` by 0.01 (cap `EDUCATED_FLOOR_CAP` 0.2); the educated target is
`0.05 + educatedFloor + schoolCov × 0.85`. The depot's "ten kept for the Academy" now go
somewhere.

**The smaller rows.** Each hound a lodge kills is a pelt on the lodge's shelf (`stats.pelts`),
and the Gloam road's carts sell lodge stock like any good. The Moth-Loft's panel shows its
dust per day (0.3, doubled on Glim ley). The Guildhall's panel counts down to the next
petition from `COUNCIL_SPACING` and names the lowest guild. The Spire-Wrights' Lodge panel
has *Vent the store* (host `vent`: the store empties, `overdrawDays` resets to −4, the open
brownout count clears, 30 days' cooldown), with rows for its storage and its surge line.
Tiles within 10 of an active Carters' Yard smooth congestion at `CARTERS_EASE` (0.8).

**The kin rings.** `kinReach(state, def)` lists the reach of the buildings a new one would
join: for a spire, Wick-Tower, Nexus or hall, every node (6 + the people's spire reach) and
every lit spire, stake or hall; for a service, every standing building of the same service
type at its `influenceRadius`; for a well, every well at its current water reach. The
renderer draws them under the ghost in a fainter blue (ley) or gold (service, water) than
the ghost's own ring, so the player sees where a new spire links and where the Watch has
gaps before the crowns are spent.

Balance, 150 days, against the iteration 47 table in brackets:

| run | Free City / last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | 61 (61) | 2,939 (2,939) |
| Vellish seed 43 | never: Burgh 36 (36) | 1,285 (1,277) |
| Vellish seed 44 | 68 (68) | 3,006 (3,006) |
| Grimmen seed 42 | Deephold 59 (59) | 1,352 (1,352) |
| Veshari seed 42 | Weirhold 86 (86), Vesh's Court 135 (135) | 1,686 (1,686) |
| Tallowkin seed 42 | Bright Town 64 (64) | 996 (996) |

The runs are the iteration 47 runs to the day and, on five seeds, to the soul: no riot and
no theft in any of them, because the bot's unrest never leaves the first tenth (it staffs
its Watch and leaves the tithe alone), and the teeth are for the player who does not. That
is the shape wanted: a pressure that only bites a city that earned it. The one mover is the
Gloam road: seed 43's lodges sold 306 pelts (seed 44's 131), eight more folk on the poorest
seed. The draughts, the consecration and the Academy's relics do not move the bot either,
which builds its Hospice and its Academy late and holds no loose relics; the player will
feel them first. Riots, theft and pelts are now in the balance script's summary line.

### 4.80 The road at the corner, districts in steps, the demand explained, the Stake that grows (iteration 49)

Your playtest notes, the first batch: four things a new player trips on, and the first use of
the reference paintings in `inspirations/`.

**The road at the corner.** `touchesRoad` takes the whole 8-ring: a zone tile, a hall or a
door with a road at a diagonal corner counts as connected, where before only the four sides
did and a lot past a road's end, or on the outer corner of a bend, silently never grew.
`roadTileOf` tries the sides first and the corners after, so every door that existed keeps
its tile and older saves replay unchanged. The bot keeps zoning beside a road's sides
(`roadOnSide` in bot.ts): a corner lot is the player's door, but in the bot's grid it sits
where the next road would go, and letting the planner take corners cost it a fifth of its
folk on five seeds of six before the rule was kept to the sides.
What the player sees: the zone preview hatches the tiles with no road in their ring and the
hint counts them ("3 tiles have no road at the door and will never grow"); a building whose
road is bulldozed shows "No road at its door" and the `icon_noroad` glyph; the placement
reason reads "Must touch a road (a corner counts)". Lighting still spreads by the four
sides: that is the network, not the door.

**Districts in steps.** `DISTRICT_SLOTS` = [[1, 2], [3, 4], [5, 6], [6, 8]]: two districts at
the Hamlet, four at the Village, six at the Market Town, all eight at the Burgh
(`districtSlots`); `paintDistrict` refuses a number past the slots unless that district is
already painted (an older save keeps and may extend what it has), the toolbar greys the rest
with "at the Village", and the daughter wardlight takes the next open slot. Charters open the
same way (`charterUnlock`: Hearth and Craft at the Hamlet, Market at the Village, Scholars'
at the Township, Temple at the Market Town; `setQuarter` returns the reason and the Edicts
panel greys the locked rows). `districtUnlockNotes` adds the lines to the milestone toast and
the Chronicle ("Two more districts open: four of eight." / "The Market charter is yours.").
The lesson: at the Hamlet a card ("Districts are yours") stands under the milestone toast
with three steps, paint, charter, rule, each with a Show me that sets the tool or opens the
Edicts panel on the first painted district; closing it records `lessonsSeen` (saved), and
while it stands the Ledger pins the Districts chapter first (`activeQuests(s, max, chapter)`).
A city loaded past the Hamlet with districts painted is marked as having seen it.

**The demand bars explained.** `demandExplain(state, zone)` turns the facts `updateDemand`
keeps (`lastDemandFacts`) into a sign, a verdict, the numbers and an advice line: "Hearths
+62 %: folk want more homes." / "140 jobs for 96 hands (work to spare) · happiness 58 ·
unrest 4 %" / "New hearths grow where you zone them beside a road."; a bar within ±5 % is
"about even"; a negative bar says what will not grow and why ("Markets −30 %: more shops than
the folk can fill. New markets will not grow; wait for folk or let the works sell."; Arcane
below a fifth schooled: "an Academy"). The panel draws a zero line, a word under each bar
(▲ more / ▼ fewer / – even in the bar's colour), the game's own tooltip on hover, and a "?"
that toasts what the bars mean. `demandReasons()` keeps its four lines for the Budget.

**The Stake that grows.** `STAKE_STAGE_AT` = [0, 3, 6, 7]: the founding hall up to the
Thorp, the Village's hall from the Village (so the first change comes in the first
fortnight), the Burgh's hall, the Free City's hall (`stakeStage`, by milestone index so every
people's ladder maps; `stakeHallName` names it from the people's milestones). The renderer
names the Stake `b_stake_s{stage}` and falls back to the procedural `b_stake`
(`stakeSpriteName`); `checkMilestones` pushes "The hall at the Founding Stake is raised
anew" when the stage changes; the panel's Hall row says which hall stands. The four stages
are the four founding_stakes paintings: the half-timber hall, the stone hall with the bell
tower, the brick hall with its lawn, the clock-tower hall.

**The art import pipeline.** `npm run art` (`scripts/importSprites.mjs`) reads
`art/sources.json` and, per entry, decodes the painting (`scripts/lib/png.mjs`, a
dependency-free codec on Node's zlib), keys the white ground by flood fill from the corners
(a white window inside the walls survives), keeps the largest island (painted clouds and
loose smoke go), crops, box-scales to the footprint width ((w+h)×16+2, so a 2×2 is 66 px)
with hard alpha, median-cuts to 24 colours, derives the night glow from the warm bright
pixels of the unquantized scale, and writes `public/art/sprites/<name>.png`, `<name>_glow.png`
and `public/art/sprites.json`. **Every entry carries a hand-set footprint offset**: the
script proposes the procedural convention (`autoAnchor`: the diamond's top corner, the last
row on the diamond's bottom point) and `npm run art:check` renders every sprite over its
footprint diamond at 4× into `shots/import_check.png`; the offset is set and the entry marked
`checked` once judged by eye (the four stakes sit on the auto anchor after the island cut).
At boot `SpriteAtlas.mergeOverrides` fetches the manifest, packs each PNG and its glow below
the procedural atlas (`shelfPack`, now a pure function) and replaces the sprite of that name;
a file that fails to load leaves the generated sprite; the whole-atlas override still works.
The outputs are committed so the Pages build ships them. The paintings themselves are a
loose 3/4 view, not the strict 2:1 grid, so each sits on its tiles as a painted hall does on
a stage: close enough at 2×, judged per sprite.

Balance, 150 days, against the iteration 48 table in brackets:

| run | Free City / last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | 60 (61) | 3,067 (2,939) |
| Vellish seed 43 | never: Burgh 40 (36) | 1,182 (1,285) |
| Vellish seed 44 | 57 (68) | 3,266 (3,006) |
| Grimmen seed 42 | Deephold 58 (59), Underking's Hall 145 (never) | 1,581 (1,352) |
| Veshari seed 42 | Harbour 15 (56), Weirhold 60 (86), Vesh's Court 103 (135) | 2,137 (1,686) |
| Tallowkin seed 42 | Bright Town 70 (64) | 950 (996) |

Four of six gain, two of them by a lot: a hall may now stand with a road at its corner, so
the bot's placement search finds a spot sooner, and the Veshari's moorings most of all: the
Harbour that stalled on seed 42 from day 11 to day 56 in every table since §4.75 now comes on
day 15, and the Court forty days earlier. Seed 43 and the Tallowkin lose a few score folk
(the Tallowkin's purse dips below zero at day 150 on a net of +60: a watch item for M13 part
2). The district slots and charter steps cost the bot nothing: it charters its Hearth quarter
at the Village, which opens four. Without the bot's side rule the same code lost a fifth of
the folk on five seeds (Vellish 42 at 2,333, Grimmen 42 at 1,100 with Deephold on day 126):
the corner lots the planner took sat where its roads would go.

### 4.81 M15 part 1, the painted set: the ground, the trees, the bushes and mushrooms, the hero buildings, the nine made visible (iteration 50)

The first half of M15 (§16). Everything here is art: the sim is untouched, and the one-seed
balance check (Vellish 42) printed the iteration 49 line to the soul, 3,067 folk and the
Free City on day 60.

**The pipeline's new modes** (`scripts/lib/sprite.mjs`, `scripts/importSprites.mjs`). A
sheet is sliced into its 8-connected islands, row-major (`islands`; `--islands <src>` lists
them), and an entry picks one by `island` index or a `rect`. `kind: 'prop'` scales by
`targetHeight` and anchors at the trunk base (`propAnchor`: the x-centroid of the bottom
rows, `ay` a hand-set `baseInset` above the last row). `kind: 'ground'` folds a square
texture onto the 32×16 pixel-centre diamond (`groundDiamond`, the same rule as the
procedural `diamond()`): each pixel's (u, v) runs along the diamond's edges and samples the
texture through a mirror fold, so a tile's left edge continues its right edge and every
neighbour continues it; a `family` of variants shares one median cut (`quantizeShared`) and
is mean-matched to its first entry, so the per-tile hash shows no patchwork. Glows take a
`hue` (warm, cool, any), so ley crystals and glowing mushrooms light the night. `anchor:
'centre'` places a sprite narrower than its footprint. Every building and prop is sharpened
(an unsharp mask over the box-scaled painting) and given the procedural set's dark 1 px
outline (`sharpen`, `pad`, `outline`), which is what made the stakes of iteration 49 read
as paintings beside pixel art and now makes them read as one set: your note. The check
sheet lays its cells in rows of ten, a prop on a tile's centre with its anchor cross, a
ground tile as a 3×3 field so a seam would show.

**The ground.** Fifteen diamonds from the square sheets: `grass_0..3`, `meadow_0..2`
(flowers), `forest_0..2` (dark, leafy, ferns), `hills_0..2` (stones), `shore_0..1` (mud and
olive dirt; the golden grass tried first read as orange bands along every bank). Each is an
island of a sheet, cut 14 % from its fringed edges, folded, quantized to 20 colours per
family. `roadTile` now returns nothing outside the road band, so the painted ground shows
beside the road instead of the baked procedural grass.

**Trees, bushes, mushrooms.** The twelve tree paintings are `tree_0..11` (oaks and birches
at 30 px, pines at 36); six bushes `bush_0..5` (the procedural one is `bush_0`'s fallback);
six mushrooms `mushroom_0..5`, three woodland and three glowing. The renderer reads the
variant counts from the atlas once (`SpriteAtlas.countVariants`) instead of hard-coding
four trees and two mushrooms, and forest tiles within 9 of a node take the glowing three,
as they take glimwood.

**The hero buildings.** `b_spire` (the blue crystal tower, 64 px, centred on its tile),
`b_nexus` (the spiral tower, 90 px), `b_wicktower` (the dark rune tower); the four wells as
`b_well`, `b_seep`, `b_tidewell` (cool glow) and `b_cistern` (the runed arch well at 2×2);
`b_depot` and `b_cartersyard` from the trade houses; `b_ossuary`, `b_sextonchapel` and
`b_boneyard` from the graveyards (the hand-coded yard stays as the fallback); `b_lyceum`
from the alchemist's tower. Every one keeps its procedural sprite as the fallback.

**The nine made visible.** `SERVICE_SPECS` gained the Carters' Yard, the Chart-Room, the
Core Lantern, the House-Hall, the Lyceum, the Salt Font, the Sextons' Chapel, the Wrights'
Lodge and the Wyrm-Court (a 3×3 ring of standing stones), which had no sprite at all: the
renderer asked for `b_<key>` and drew nothing, ghost, construction bar and glow included.
`tests/sprites.test.ts` holds the line: every non-zone catalog key has a sprite.

### 4.82 M15 part 2, the painted set: the zone levels, one look for every people, halls that grow, glimwood from the birches (iteration 51)

M15 closes. Art only again: the one-seed balance check prints the iteration 49 line.

**The zone levels.** Twenty-four paintings at the 1×1 size (34 px, 36 with the outline),
four variants each: `hearth_l2` from the wooden houses, `craft_l1` from the general craft
houses, `craft_l2` from the brickmakers, `craft_l3` from the forges, `arcane_l2` from the
alchemists' houses, `market_l3` from the trade houses; the other levels stay procedural (a
painted cottage is a level-2 home; a sod hut and a stone townhouse are not in the folders).
All four variants of a level share one `targetHeight`, so a street does not jump in size;
`sharpen 0.8` and 20 colours, because fewer colours read better at 34 px.

**One look for every people.** `SpriteAtlas.imported` records what the manifest merged, and
`zoneSpriteName` (atlas.ts) returns the base name when it was imported and the people's
copy (`_grimmen`, `_veshari`, `_tallowkin`) otherwise, for the buildings and the placement
ghost alike: one painting is the look for everyone, and the procedural people copies serve
the levels without a painting.

**Halls that grow.** `stagedSpriteName(kind, stage, has)` generalises the Stake's rule
(`b_<kind>_s<stage>`, falling back to the highest lower stage, then the plain sprite) for
`GROWING_HALLS` = the Stake, the Guildhall and the Temple; `guildhall_s1/s2` and
`temple_s1/s2` are procedural specs that gain a window row and the bell tower, then a
crystal, a glass dome and banners. The panel's Hall row appears on all three; the milestone
message names them.

**Glimwood and Gloam trees.** `recolour` (an HSL shift over the opaque pixels) turns the four
birches into `glimwood_0..3` (pale ley blue, a glow on the leaf tips) and the four oaks into
`gloamtree_0..3` (dark violet); the renderer reads their counts like the trees'. The
castle on the hill (ley_spires image_0) matches no building yet and waits for the Hall of
Wicks (M13 part 2).

### 4.83 M13 part 2, the Tallowkin's light: the Wick chapter, three tales, the lamplighter, the Hall of Wicks, the late game (iteration 52)

M13 closes, eleven iterations after part 1 (§4.72). The Tallowkin were a people with rules
and buildings but no story and no late game: the bot settled at 86 % lit, four points short
of the Hall of Wicks gate, paying for Wick-Towers it could not link until its purse went
under.

**The Wick.** Eight quests with `people: 'tallowkin'`: the first spire lit, a Wick-Tower, a
Candle-Shrine, half of twenty buildings lit (`litShare`), the Hush vigil kept (`chose(s,
'vigil', 0)`), a Nexus, the Hall of Wicks, the Lantern of Wicks (5,000, priority 70).

**Three tales** (`TALLOWKIN` in events.ts). *The spire-wrights' strike* (four spires): pay 700
or let them sit, and spires and Wick-Towers cost half again for ten days (a `wrights`
modifier read in `costOf`). *A surge in the wickhouses* (once, after a surge with ten lit
hearths): snuff and relight (300 crowns, +4 happiness for six days) or let them burn bright
(+15 % mana flow for six days, two hearths catch fire). *The candle-eyed child* (once, from
the Lamp): let her read the Veins (a true vein, +10 node mana for good) or send her to the
shrine (the educated floor +2 %).

**The lamplighter.** A walker from every lit Wick-Tower (one) and the Hall of Wicks (three):
it seeks the nearest dark home, shop or works within 10 that no candle has reached today,
and lights it by candle until the day ends (`Building.relit`, saved; eight a day; the
streets it walks count as ward). `updateMana` honours `relit` after its reach, load and
brownout passes, so a candle holds through the ley's eighteen daily recomputes and draws
nothing from it: the dark-abandon rule and the lit-share gate both read `b.lit`, so a
lamplighter keeps a home and lifts the gate. The panel's Mana row says "lit by a
lamplighter's candle today".

**The Hall of Wicks.** A 3×3 Tallowkin wonder (6,000 crowns, 40 a day) from Beacon-Street,
sworn at the Hush vigil (`specialLock`: the vigil must have been kept), self-lit with a
40-mana store, a ley hall (`WONDER_HALLS`: it relays and lights nine tiles and carries two
hundred of load), a ward of 12, and three lamplighters a day. Drawn from the castle
painting (`b_hallofwicks`, the last of the ley_spires folder). Milestone 7's text now says
the Hall stands and the city is nine tenths lit before the Lantern may rise.

**The late game.** The bot places a Wick-Tower only on a tile a lit spire, Nexus, Stake, hall
or node can reach (`placeNear` takes a filter), and never while two towers stand unlit; it
raises the Hall of Wicks at Beacon-Street with 8,000 crowns. The dev command *The
lamplighters' round* relights every standing zone building for three days.

Balance, 150 days, the Tallowkin against §4.72 and §4.80 in brackets:

| seed | Bright Town | Hall of Wicks | folk at day 150 | lit at day 150 | purse at day 150 |
|---|---|---|---|---|---|
| 42 | day 42 (§4.72 42; §4.80 70) | not reached (not reached) | 1,341 (1,101; 950) | 73 % (86 %) | +107 (−866) |
| 43 | day 37 (37) | not reached (day 54) | 1,335 (1,644) | 91 % (99 %) | +2,139 |
| 44 | day 54 (38) | not reached (not reached) | 1,953 (1,120) | 73 % (86 %) | +680 |

The Vellish control (seed 42) prints the iteration 49 line exactly: the lamplighter is the
Tallowkin's alone. Bright Town comes by day 54 on all three seeds and the purse stays above
zero, which was the iteration's goal; seed 42 gains two hundred folk and a thousand crowns
over §4.80. The Hall of Wicks milestone is still not reached: the lamplighters light
thousands of windows (5,660 rounds on seed 42 by day 150), but the bot zones faster than it
lights, so the share that stood at 85 % at Bright Town falls back to 73 % as the city grows,
and the Hall itself needs 8,000 crowns the bot never holds (the peoples' bots are too poor:
the known issue that M14 part 5, the bot plays it all, owns). Seed 43 sits at 91 % lit with
2,139 crowns: the gate is open and the Hall unaffordable. The player's game is whole; the
bot's late game waits on its purse.

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
- **Reference paintings (iterations 49–50):** `inspirations/` holds fourteen folders of 1024²
  paintings: single buildings (founding stakes, ley spires, wells, graveyards, trade houses,
  wooden houses, and craft houses: forge, brickmaker, alchemist, general craft), single trees,
  and sheets of many items (grass tiles, bushes, mushrooms, animals; the animals wait for M16),
  used two ways. **As
  sprites:** `npm run art` turns a chosen painting into a game sprite with a hand-set
  footprint offset and a derived night glow (§4.80), merged over the procedural atlas by
  name; the Founding Stake's four halls are the first, M15 (§16) takes the rest. **As the
  style guide** for every procedural sprite touched from now on:
  - *Founding stakes:* civic halls that grow: half-timber with a flag on the ridge, then
    fieldstone with a bell tower, then brick with a lawn and a sign over the door, then a
    clock tower; always a sign, a flag, steps to the door.
  - *Ley spires:* tall blue-crystal towers with a spiral rib or stair, ringed balconies, rune
    bands, a glowing crystal tip and lesser crystals on the buttresses; grey stone bases.
  - *Wells:* a stone ring with a pitched roof on two posts, a windlass with rope and bucket,
    runes on the arch, moss, flowers and a lantern at the posts; the water glows blue.
  - *Graveyards:* a dark gothic chapel with violet or teal windows, iron fences, headstones,
    dead trees, wisps; a sexton's lamp at the gate.
  - *Trade houses:* half-timber over stone with a hanging sign, striped awnings, stalls,
    barrels and crates, flags on the gables, a cart at the door.
  - *Wooden houses:* log or plank walls, a stone chimney with smoke, a porch with a lantern,
    flower boxes, a small garden fence.
  - *Forge:* an open smithy side with the hearth glowing orange, the anvil, tools on the
    wall, black smoke from a stone chimney, coal and iron by the door.
  - *Brickmaker:* brick walls, a beehive kiln glowing, brick stacks and barrows, a striped
    awning.
  - *Alchemist:* a tower with a conical roof and a crescent weathervane, copper pipes,
    bottles in the windows, a cauldron and a flask sign, ivy.
  - *General craft:* a timber shop with a "Craft House" sign, a balcony, tools over the door,
    plants on the sill.
  The palette of the paintings is warmer and broader than `palette.ts`; imported sprites keep
  their own 24 colours, procedural sprites keep the palette, and the two sit together because
  both are drawn at the same pixel scale with hard edges.

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

### 4.84 M14 part 3, wyrmcraft matured: auras that act, cradles with a ceiling, roles with a price, materials with sinks, wonders with a role, the Court after the binding (iteration 53)

The audit's part 3 (AUDIT.md §4) in one iteration, under the depth pass's rule: a mechanic
exists only if the player can see it, decide about it and lose by it. Eleven bullets, each
with the audit's number; the bot is untouched (teaching it these is part 5).

**Lines that do what they say.** Two auras were text. Ember now lifts Craft a tenth wherever
`auraAt` says it reaches (8 around the cradle, 12 at a warden's district centroid, half again
for a great wyrm), added to the Craft rate beside the node's own Ember +15 %. Sky, whose text
described courier properties of a role that radiates nothing, speeds carts and couriers a
quarter inside it (`agents.ts`, `creatures.ts`). A Tide drake radiating its aura swims one
barge a day from the mooring nearest its cradle within 12 (`dailyTideBarges`): it ignores
the bargemen's strike and the one-barge-per-mooring rule, needs two moorings like any barge,
and counts in `bargeTrips` and a new `tideTrips`. Every building inside an aura now names
it ("Dragon auras: Ember (Ashvel): Craft works within its aura make 10 % more"), so the
seven auras that were already real (Bone, Grey, Tide, Glim, Vein, Storm, Fen) are shown
where they land. The Crown's gift was already a tide egg for the Veshari and an ember egg
for the rest; §8.6's "any egg, player's choice" is settled as the people's cradle line.

**Cradles with a ceiling.** A cradle of any of the three kinds becomes a **Great Cradle** at
level 2 from its panel at the people's sixth milestone for 4,000 crowns: four nests, four
more mana, its own sprite for the Vellish cradle. A Tamer's Lodge within 10 **seats four**
(`lodgeSeats`, filled in dragon-id order): a hatchling without a seat does not grow, as
before; a drake or older without one grows at half pace and, trained hard, scorches its
cradle thrice as often (0.06 a day instead of 0.02, the same rng roll). **Feeding reaches
12 tiles** of the cradle ("markets near the cradle" is now true), a warden eats from the
markets of its district at any distance, and the three-day warning says which. Unfed mood
loss falls from 12 to 6 a day so that **ten unfed days** regress a drake or older a stage
(a courier below wyvern loses the role) before mood 0 sends it into the Gloam. Every
dragon that leaves (starved, trained wild, its cradle gone) is kept in `state.departed`
and **returns after a season** as a tale of its own (`maybeFireReturn`, fired on its own
terms like the wyrm's): pay its tribute (500 crowns a stage, or 60 goods a stage off the
shelves when the purse cannot, so the bot's choice 0 always resolves), open a cradle (it
comes home at mood 40, its stage kept) or refuse it, and it screams over its old cradle for
a day as a rogue flyer (a wyvern agent, `dragonId −1`, phase 3) and sets up to its stage in
dark, unwarded roofs within 12 alight. The Vein-Wyrm's flyover is not reused: it rewrites
`state.wyrm`.

**Roles with a price.** A delver halves the chance of waking a Concord Warden at its mine
(the chance is multiplied, so the rng stream is unchanged and a run with a delver wakes a
subset of the wardens a run without would). A courier records its last trip on the Dragon
(`lastTrip`: from, to, goods delivered, day). The Ring shows a champion's **odds** before
the bout (`boutOdds`, pure: the deterministic halves and the chance over the two rolls of
40, a triangular difference) in the Wyrms panel, the Ring inspector and the forecast; the
challenger's base is now the champion's stage × 20 + 20 (plus the season's 5 and the
year's 8, capped at 16), so the stage cancels and a great wyrm at mood 70 wins 87.5 %, at
mood 30 half, and by the second year's Ember 36 %: a champion is kept content and
hard-trained, or it loses.

**Materials with sinks.** **Scale-Mail** (an edict, Township, city-wide, no crowns): −5 %
unrest while scale is in the vault, 0.05 scale a day. **Wyrmfire**: each lit Forge burns
0.1 a day and is cold without (both of its Craft reads gated); the city's +15 % is now a
toggle (`burnWyrmfire`, default on so old saves keep it) that burns 0.05 a day in place of
the 0.02 leak; an ember drake breathes a jar a month and a wyvern one a fortnight, so one
grown wyvern sustains the toggle and two the Forge. **Eggshell** lines a nest (+25 % hatch,
one per egg) and the Font costs 3. **Glim-dust** is a tool on the Land tab: one unit on a
track or cobbled tile lights it for a season (`dustLit`, a Uint16Array of end days): land
value, the overlay and a warm glow where no spire reaches, but it conducts nothing and
lights no building; bulldozing or re-tiering the road clears it. **The caravan** sells the
share of the vault a slider sets (`resolveEvent` takes an amount; a choice may carry a
`slider`; undefined still sells all, so the bot and the tests are unchanged). **Rays**
remember the lure that sang to them (`anchorId`) and shed glim-dust over a Rayscale Mirror
where a Beacon's school sheds rayscale.

**Marvels and wonders with a role.** The Hall of Marvels exhibits each rare good in the
vault for +2 happiness (up to +10, lit only) in place of a flat +8. The Lantern of the
Cores takes the first 30 of a surge's overdraw and cracks for ten days (`broken`; while
cracked it is not self-lit, stores nothing and wards nothing); a surge no bigger than that
burns nothing (`surgesAbsorbed`). Every lit wonder hall (the Lantern of Vell, the Seat, the
Weir, the Hall and Lantern of Wicks, the Court, the World Tree, the Sky-Dock) gives +5
happiness and lifts the next grant a tenth (`litWonders`). The mana spread narrows: the
Lantern of Vell draws 10 (was 20); the Great Weir makes 45 (was 90) with a **sluice** on its
panel that opens to 90 and, in the Thaw from day 5, floods the bank within 30 of the Weir
(`floodedAt` replaces the global `flooding` at the three bank reads: land value, happiness
and the wells; the Hush flood stays city-wide and the standing Weir still holds it). The
Underking's Seat warms every cradle within 30 for no mana (lit, drawing nothing, before the
consumer pass). The Lantern of Wicks halves what lit spires within 30 carry (a spire draws
nothing itself; its consumers' draw is halved when the member pass assigns them).

**The Wyrm-Court after the binding; golems assigned.** The Court's gate was already closed
(no Court without a woken wyrm); the toolbar tooltip now prints that reason. Lit, the Court
halves the bound wyrm's appetite to 20; once a lit Court has stood after the binding
(`courted`), a dark Court counts `courtDark` days and at two the wyrm sulks until the Court
is lit again (feeding does not clear this sulk; the Court defaults to the essential
brownout tier so a shortfall takes it last). Each bound Concord Warden is assigned from the
foundry's panel: labour (12 hands city-wide, as before), guard (ward 0.6 within 6 of the
foundry, holding the grey like a Stone Ward) or posted to a Craft works within 20 (12 hands
at its bench, capped by the works' capacity); a surge clears the duty with the binding.

Balance, 150 days, against §4.80 (and §4.83's Tallowkin row) in brackets:

| run | Free City / last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | 60 (60) | 3,067 (3,067) |
| Vellish seed 43 | never: Burgh 40 (40) | 1,182 (1,182) |
| Vellish seed 44 | 57 (57) | 3,266 (3,266) |
| Grimmen seed 42 | Deephold 58 (58), Underking's Hall 145 (145) | 1,581 (1,581) |
| Veshari seed 42 | Harbour 15 (15), Weirhold 60 (60), Vesh's Court 103 (103) | 2,137 (2,137) |
| Tallowkin seed 42 | Bright Town 42 (§4.83 42), 73 % lit (73 %), purse +107 (+107) | 1,341 (1,341) |

Every row is the baseline bit for bit, and that is the finding: in six runs of 150 days the
storyteller drew three to seven tales and never the Crown's gift, so no bot city holds a
dragon, none raises a wonder hall, a Forge, a Mirror or the Cores, and nothing in part 3
reaches the bot. The first draft of this iteration was not bit-identical: capping a works'
hands at its capacity (for the posted wardens) trimmed two goods on day 61 of Vellish 42,
where the Free City's new halls shrink a works' capacity below the crew assigned the day
before, and the runs drifted from there (2,881 folk and 97 fires against 3,067 and 68). The
cap now applies to the posted hands only, so a works with no warden produces exactly what
it did. The same comparison showed the Vellish bot standing a Trade Depot on day 100 of
seed 42 (8 goods exported by day 150), so the iteration 47 note that it never does is true
of the other seeds only. Teaching the bot to keep a dragon, name a champion, buy a
wonder and use the sinks is part 5's; the player's game has all of part 3 today.

### 4.85 M14 part 4, the world pushes back: weather of its own, the Crown that wants, gates and memory, edicts as commitments, charters with a price, festivals seen, a challenge that can be lost (iteration 54)

The audit's part 4 (AUDIT.md §4) in one iteration, under the depth pass's rule: a mechanic
exists only if the player can see it, decide about it and lose by it. Five bullets, each
with the audit's number unless marked *chosen*; the bot is untouched (teaching it to answer
is part 5), and for the first time in M14 the table moves on every row, because the world
now pushes on the bot too.

**Weather of its own.** The audit said "`dailyWeave` rolls it"; it is written in the seed
instead (*chosen*). `seasonWeather(seed, seasonIndex)` draws a season's spells once from
`new Rng(hashString(seed:season:weather))`, a stream of its own, so the main stream is
untouched (every run before this iteration keeps its rolls), the forecast can read five
days ahead exactly, and every player of a daily challenge gets the same sky. Bloom: each
day a 15 % chance that a two-day **rain** begins (none while one runs); Ember: a 10 %
chance of a five-day **drought**, its first day drawn from 3 to 22; Hush: a 20 % chance of
a three-day **blizzard**; the Thaw is dry. `dailyWeather` runs first in the daily block,
sets `state.weather` (`{kind, until}`, saved, `null` by default) and writes a Chronicle line
when a spell begins ('info' rain, 'warn' the others). `raining` is the sky's rain or the
Storm-Caller's `rain` modifier (the sure version of the same): fire ×0.4 beside the Ember
×1.3, Craft +15 % as the node's Ember does, miasma ×0.3 (the two existing reads, switched).
A drought: fire ×2, every well two tiles shorter (`waterRadiusOf`, floor 2), the Hanging
Gardens at half unless `watered`, and the World Tree's age pauses (the stage message fires
only when the age moved). A blizzard: hearths draw a tenth more mana in the consumer pass
(hearths only, so the works and halls are unchanged) and no new hound pack comes out of the
Gloam (the spawn gate; the forecast's hound line says so). The top bar's date carries the
word, the forecast lists today's spell and the next within five days ("Rain in 2 days, 2
days of it"), the freeze, the flood and the Weir's open sluice; the Annals count the days.

**The Crown that wants.** `crownFavour` (0–100) starts at 50, neutral (*chosen*, so sector
prices and the bot's runs start unchanged): +5 when the collector is paid, +3 when an egg
or a relic goes to the Crown's assessor, −10 a pleading. Each point from 50 is −0.3 % on
the Thaw levy and on sector prices (`favourFactor` in `sectorCost`): 100 is −15 %, 0 is
+15 %. Under 20 the next milestone grant is withheld, through `grantFor(state, grant)`,
which the sim, the toast and the Budget share (the toast showed the table's grant before,
wrong since iteration 53's halls lifted it). **The levy**: on the first day of each Thaw
(day 120, 240…) the Crown takes 5 % of the treasury above 10,000, times the favour factor
(`crownLevy`, a 'warn' line, a `levy` ledger row and `stats.levies/levied`); the Budget
shows what the next one would take as the treasury stands and in how many days. **Debt and
loans**: under zero the treasury pays 1 % of the debt a day (`interest` row); a Crown loan
of 10,000 × the milestone (at least one) at 0.5 % a day, one at a time, taken and repaid in
full from the Budget (`takeLoan`/`repayLoan`, `state.loan`). The bankruptcy line is
−8,000 × (1 + milestone/2) (`debtLine`; the three "−8,000" texts follow it). **Trade joins
the history** (B17 closed): `ledgerHistory` records net + trade, the top bar's per-day
figure and the Budget's "last 10 days" include it; new Budget rows: grants today, the levy,
interest, charters, the Temple's share, favour with its reasons, the loan with its button.

**Gates and memory.** The Vellish gate is mean happiness ≥ 45 + 3 × the milestone reached
(Hamlet 48 … Burgh 63, Free City 66, Beacon 69; `VELLISH_HAPPINESS`). The Tallowkin's lit
share must hold the next gate three days running (`litHeld`, counted in `checkMilestones`
through `rules.gateHold`, reset after a step). The top bar names the next gate under the
milestone ("next Burgh: 1,000 folk, happiness 63"; "42 stone quarried"; "6 moorings";
"85 % lit for 3 days"; the Beacon adds "the Lantern of Vell lit") and turns warn-coloured
while the people's own condition is not met (`nextGate`, `gateMet`). **Three chains**:
welcomed pilgrims (`pilgrimsDay`) come back 30 to 40 days on as a priority tale and ask for
a shrine of Aume (raise it among the hearths for 600, give them the Stake's hall on holy
days, or refuse them: −4 happiness for 10 days); each pleading with the collector is
counted (`pleadings`) and the plea's text names the next price: −15 % tithe for 15 days,
then −25 %, then a fifth of the treasury at once, −10 favour every time; a Fen-Nex quarter
is audited every season on a coin of its own (`foxAudit`, +2,000 or −1,000, a side-stream
`Rng` from the seed and the day, so the main stream keeps its rolls). B16 (the fired-tales
list is never trimmed) was already true since iteration 44 and is now held by a test.
**Ill tidings**: `pushMessage` no longer stamps `lastBadDay` on every 'bad' line; the
explicit `illTiding(state)` is called at the hazards (a bore flare, a surge, a hound raid,
the wyrm waking or a hostile flyover, tigers loose, the restless rising, the Gloam taking a
building, a riot, golems loosed), so a burnt roof or a starved drake no longer silences
the storyteller for six days in a city of a thousand roofs.

**Edicts as commitments, charters with a price.** `setEdict(s, key, on, district)` in the
sim: an edict is stamped with its day (`edictSince`, keyed like `districtEdicts`), runs at
least 10 days and costs 200 crowns to repeal (refused while it runs or when the purse
cannot pay; the panel's toast says which, each row reads "runs N more days" or "repeal
200 c"); a granted petition and the bot's deep-cut stamp the day; an edict with no stamp
(an old save) may be repealed at once. A charter is stamped too (`quarterSince`): changing
or clearing it is locked 30 days ("The charter holds N more days", the quarter buttons
disabled meanwhile, the "opens at" reason still first); it costs **a crown a building a
day** (`charterUpkeep`, a Budget row; the district line says what this district pays); and
its price spills: a Craft quarter's smoke reaches four tiles past its district's edge
(`updateMiasma` carries each works' emission beyond its radius into tiles of other
districts, fading over the spill), and a Temple quarter takes a tenth of the city's market
tithe (`charterTithe`, once, while any Temple quarter stands; the in-district exemption
stays), so a works-only or a markets-free district no longer dodges the price.

**Festivals seen, the daily challenge.** The forecast builds its festival lines from
`CALENDAR` and shows only those the city is eligible for today (the Lantern Fair included,
with its Guildhall); the Thaw feast names the districts whose markets fed it; the vigil
names its hold-until day; the Remembrance's stirred dead are counted (`remembranceDead`)
and the restless that rise from them say so in the Chronicle (a score of the dead a
walker). The daily challenge **fails on day 61** (`challengeDay = −2`, a 'bad' line, the
Ledger reads "Failed" with the copy button) and is **scored**: the days to spare (61 − the
day) plus a point a thousand crowns (*chosen*: the audit's "day + treasury/1,000" would
have scored a later day higher); the people is drawn from the date
(`challengeSeed % 4` over the four playable peoples), named on the Ledger line and in the
Chronicle's first line.

Balance, 150 days, against §4.84 (= §4.80) in brackets:

| run | Free City / last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | never: Burgh 123 (Free City 60) | 3,060 (3,067) |
| Vellish seed 43 | never: Burgh 123 (Burgh 40) | 1,481 (1,182) |
| Vellish seed 44 | never: Burgh 123 (Free City 57) | 2,739 (3,266) |
| Grimmen seed 42 | Deephold 130 (58), no Underking's Hall (145) | 1,217 (1,581) |
| Veshari seed 42 | Harbour 15 (15), Weirhold 47 (60), Vesh's Court 84 (103), Sable Crown 137 (never) | 2,271 (2,137) |
| Tallowkin seed 42 | Bright Town 105 (42), 90 % lit (73 %), purse +386 (+107) | 1,392 (1,341) |

Every row moves, and each for a reason the new rules name (the baseline's day lines were
re-run from `main` to compare). **The Vellish gate stalls the bot** on every seed, as the
plan said it would, and it bites earlier than the Burgh: a new town's happiness falls to
30 in its first days and climbs back past the Hamlet's 48 only in the second week, so the
Hamlet and its grant come on day 11, 7 and 16 on the three seeds (seed 42 had it on day 4),
and seed 42 stands at −264 crowns on day 10 where it had 1,450. From day 40 the bot's cities
sit at 52–59 happiness, under the Burgh's 63 (the baseline's seed 42 was at 63–64 from day
20 and took the Burgh on day 38); all three cross it on day 123, the day after the Thaw
feast (+3 for 15 days, +5 in the fed districts) lifts them over, and the Free City's 66 is
never met, so seeds 42 and 44 lose their Free City (60 and 57) and seed 43 gains a late
Burgh. The top bar says why ("next Burgh: 1,000 folk, happiness 63", warn-coloured); the
bot's levers (taxes, draughts, gardens, the Lantern's delight) are part 5's. **The
Tallowkin hold** does what the audit asked and the bot cannot keep it: its share hovers at
80–86 % around the Bright Town's 85 % from day 30 to day 100 (the baseline passed on day 42
on a single day at 85 % and then fell to 73 %), resetting the three-day count each time it
dips, and the gate falls on day 105 when a run of towers takes the share to 94 %; forced to
keep lighting, the bot ends better lit (90 % against 73 %) and richer (+1,714 against
+107). **The charter's price** reaches every run: the bot charters its hearth square at the
Village and pays about 80 crowns a day for it from day 30 on, a quarter to a half of its
net on the poorer seeds, so it stands fewer spires and wells; the Grimmen bot, poorest of
the four, is the one it hurts, falling from 923 folk on day 60 to 628 on day 70 at 39 % lit
(the baseline held 1,012 at day 100 where this run has 739) and reaching the Deephold on
day 130 instead of 58, with no Underking's Hall. **The rain** is a smaller hand (10 rain
days on seed 42's Bloom, 6 and 8 on 43 and 44, a drought of 5 on seed 44's Ember, a
blizzard of 3 on seed 42's Hush): the Tallowkin's fires fall from 24 to 11, the Grimmen's
stay at 24, and the larger Vellish 42 burns more (86 against 68) because it is a different
city by then. **The ill tiding** moves every run from its first week: a fire on day 6 or an
abandoned hearth used to stamp the storyteller's grace week, now a tale may fire there, and
every later roll differs. The Veshari bot, whose gates are moorings and happiness is no
gate, comes out ahead on this path: Weirhold on 47, Vesh's Court on 84 and a Sable Crown on
137 that the baseline never saw. No run went bankrupt, none paid a levy (no bot holds
10,000 at a Thaw), none pleaded, none took a loan, none built a Fen-Nex or Temple quarter:
the Crown's side of this iteration is the player's for now. The player's game has all of
part 4 today; the bot's answers are part 5.

### 4.86 M14 part 5, the bot plays it all, and the Annals: a purse, the light first, taxes and edicts, walls, a depot, dragons, a greedy tale policy; every counter shown; saves by version; five dev commands (iteration 55)

The audit's part 5 (AUDIT.md §4) closes M14. Part 4 made the world push back and the bot could
not answer it. This iteration teaches the bot the levers a player has. Three probes on Vellish seed
42 showed what held it back:

- It zoned faster than it could light. On day 45, 219 of its 362 zone buildings were dark, which
  costs 15 happiness points each against a lit home.
- It spent every crown above about 1,500 the day it had it, so it never held the 8,000 for a
  Thrum Font, a deepening or a hall.
- It took choice 0 on every tale, so it granted every petition it paid for and declined every egg.

The bot stays a test tool, not an AI (`src/sim/bot.ts`, `src/sim/botPolicy.ts`). Each behaviour is
a few lines named after the lever it pulls. The numbers are the ones the balance passes settled on
(*tuned*), and thirteen passes are recorded below.

**A purse with a spending order.** Each day the bot spends in this order:

1. Essentials: answer the tale, set taxes and edicts, light the dark, water the dry.
2. One goal (`pickGoal`), in this order:
   - the people's hall once it can be built: the Hall of Wicks once sworn, and the last gate's
     wonder from the Free City;
   - the first cradle, once, when the ley has its 8 mana and 5 to spare and the ledger makes
     300 a day (*tuned*: a cradle in a brownout starved the town that raised it, and a dragon
     that cannot be fed leaves and comes back for a tribute);
   - when the ley runs short (a brownout over 2 %, or demand over nine tenths of supply), the
     cheapest mana on offer: link a node (its sector first), a Font, the founding node's
     deepening, or a Torrent Mill for the Veshari.
3. Growth: services, sectors, walls and the depot.

A goal it can pay for but cannot place is tried for five days and then left for twenty; the
Veshari bot once held 5,400 for 120 days for a mill with no bank. The goal's price is a
**reserve** held back from growth only when it is urgent (*tuned*): always for a hall, and for
mana only in a brownout over 5 %. A ley that is merely tight still buys its Font when the purse
allows. A reserve that always held starved services, and with them the failed placements that
used to grow the grid. Streets are not held back: they grow when a zone with demand over 0.15
has fewer than 20 free lots (*tuned*), never while the light holds the zoning, and after day
30 only on a ledger in the black. From day 30 the bot buys no service that would leave the
ledger under 200 a day. Wells come only once at least 2 % of the zone buildings (and at least
three) are dry, and one a day unless more than 8 % are (*tuned*: on seed 44 seventy wells
cost 280 a day). **The Crown's loan** is a bridge to a hall and nothing else (*tuned*): the hall
must be more than ten days of the ledger away and the ledger must cover twice the interest.
While the loan is out, the reserve holds it, and it is repaid first thing once the purse holds
the loan plus 2,000 and nothing else is being saved for. The first draft also took the loan for
Fonts. That sank Vellish seed 44 into debt: the cash bought upkeep, and the interest and then
the debt's interest ate the ledger.

**The light first.** The Vellish paint no new lots while the ley browns out past a tenth with
over a tenth of the zone buildings dark, unless their happiness clears the next gate by four.
The Tallowkin paint none while the lit share is under the next gate plus 1.5 points (*tuned*:
at 3 points the 90 % gate held them at 1,200 folk). The other peoples zone as before. Homes
that are dark only because no spire reaches them are no reason to stop: `keepLit` now tries the
six dark buildings nearest the centre for a spire that links, not just the first one. Every
people paints lots that are already lit and watered first, so new homes start lit and watered.

**Taxes and edicts.** Every two days the hearth tithe moves between 6 and 10:

- The Vellish cut it by a point while happiness sits within 5 under the next gate and the folk
  are within 80 % of its count, and raise it once happiness clears the gate by 5 or falls out of
  reach (a cut cannot bridge more than about 5).
- Every people cuts it past 0.25 unrest.
- No people cuts it on a ledger in the red.

Markets, works and studios carry the difference (10 plus the cut, at most 13, and 10 while their
own demand is negative): their tithe touches only their own happiness, while the hearths are
about four fifths of the mean. The edicts follow the advisor's lines (`setEdict`; the bot checks
unlock and people itself):

- Night Curfew past 0.35 unrest, repealed under 0.15 once its ten days have run;
- Free Healing Draughts while health is under 0.45 and the ledger covers three times their price;
- Scale-Mail while three scale lie in the vault and unrest is over 0.1;
- Import Goods while the markets run dry and a depot stands, repealed when they fill or the
  ledger goes red.

The hearth charter waits for a ledger of 800 and no goal: at a crown a building it was 80 a day
for about +2 happiness.

**Walls, a depot, dragons.**

- **Walls:** every 30 hounds (three arcs at most) the bot walls 21 tiles centred on the Gloam's
  bearing, two tiles past its grid (one when that lies outside the Charter), with a Belregi gate
  on every road it crosses. It walls even a tight ley: the packs will not wait.
- **The depot.** The iteration 43 finding is solved. `want()` tried the six zone buildings
  farthest from one of the same kind. With none standing, every distance tied, so it tried the six
  oldest homes in the packed centre and gave up. On Grimmen 42 there were 81 legal spots and 9,000
  crowns. A hall of 2×2 and up now also tries the twelve outermost, and any service with nowhere
  to stand tries near the Stake.
- **Dragons.** The cradle stands beside a market. The tale policy keeps the egg. An egg is lined
  when the vault holds eggshell. A drake wards the hearth quarter when it has markets, else delves
  at a mine, else fights at the Ring. A wyvern carries goods, and the Ring keeps one champion.
- **The Crown's gift is a priority tale** (*chosen*, a sim change). Its own text says the Crown
  answers the cradle, yet it was one tale in a pool of thirty and no bot ever drew it in 150 days.
  It still waits for the storyteller's spacing and its daily chance, so it arrives one to three
  weeks after the first cradle, for the player too.

**A greedy tale policy** (`chooseTale`). Each choice is played on a copy of the state
(`structuredClone`, 2 ms on day 12; a slider at none and at all) and the copy is scored by
`worth`:

- the treasury (debt counted three times);
- ten days of the ledger (`computeLedger` draws no rng, so an edict's upkeep counts);
- each timed effect, value × days left × a weight for its kind (happiness at 0.02 crowns a folk
  a point-day, three times that for the Vellish under their gate; unrest at −15 times that);
- favour × 40, guild standings × 15, the educated share × 20,000;
- 5,000 a dragon, rare goods at the caravan's prices;
- 400 a standing roof and 3 a folk.

The best gain wins, the lowest index on a tie. The live state and its rng are never touched, and
`clearAuraCache()` runs after scoring because the aura cache is module-level. In the final table
the bot strays from choice 0 on 0 to 2 tales a run. It keeps the silence at the Remembrance (+2
happiness for ten days), blesses the pilgrims and sends them on, grants the Fen-Nex their quarter on
Vellish seed 43, and keeps the Crown's egg on the one run that stood a cradle (Veshari). It pays the
collector and takes in the refugees, as choice 0 did. In the passes it also turned down the Lantern
Fair's 500 crowns, and in the tests it does not grant the spire-wrights 60 a day.

**The Annals** (`src/data/annals.ts`, a modal on **N** and the top bar's Annals button). Thirteen
chapters plus the dev count list all 85 counters in `stats`, twenty of which were written and
never read, and the counters kept elsewhere: favour, the loan, the pleadings, the tales heard, the
tasks done, the rare goods, the relics, the departed, the days in debt and in good order. Each row
carries its note as a tooltip. Six fields are timers or streaks and sit in `ANNALS_INTERNAL` with
their reasons. A test holds it: every key of `stats` is a row or an internal timer, so a new
counter can no longer be write-only. The Chronicle's refresh is keyed on its newest line too (at
its 200-line cap its length stopped changing), Esc closes both, and the top bar's title now gives
way before the buttons do.

**Saves by version.** `SAVE_VERSION` is 7. `deserialize` reads the raw version before anything
else: a save from a newer game is refused with its reason (`SaveVersionError`, shown as a toast on
load and import). Otherwise `MIGRATIONS[v]` runs from the save's version up. Every save written
before this iteration says 6 whatever its age, because the version was written and never read, so
step 6 is the whole old forward-compat block as one step, and a missing version counts as 6. Then
a fill runs for every version: `stats` over a fresh game's, the ledger merged, the layers sized.
That replaces the 85-name list. A new field gets its default from `createGame`, and needs a step
of its own only when an old save must differ from a fresh game.

**Five dev commands.** A command's argument may be a number, its list may follow the state, and a
second argument rides beside the first (`a:b`):

- **Jump to day:** forward only and at most a year. The tick, the season and the weather (its own
  stream) follow; nothing is grown or levied in between.
- **Flood or freeze the river:** ten days, through two new modifier kinds that `flooding()` and
  `riverFrozen()` read; the Great Weir still holds a forced flood.
- **Complete a task:** this people's open tasks, rewarded as `checkQuests` does.
- **Set a standing:** a guild or the Crown's favour, 0 to 100.
- **Reset the history:** the tales (keeping the records that unlock the Storm Peak and the Hall of
  Wicks), the ledger history, or the Chronicle (keeping the dev mark). The dev count never resets.

**Bugs found on the way.**

- **The Hall of Wicks never unlocked in play.** `specialLock` looked for `vigil:0`, but the vigil
  is a festival recorded as `vigil@<year>:0`. The tests pushed the plain form by hand, which hid
  it. It now reads both forms.
- **A city in debt could answer no tale.** `resolveEvent` refused any choice whose price exceeded
  the treasury, and a choice with no price counted as 0 crowns, which exceeds a negative treasury.
  So every answer was refused, and a returning dragon asked again every day. Only a named price is
  refused now.
- **The screen went black at dawn and dusk** (shipped as a hotfix mid-iteration, PR #56). The
  light pass left the `multiply` blend set whenever it returned without an emissive layer: night
  between 0.01 and 0.05, or nothing glowing in view. The next frame's clear then multiplied onto
  the old one, about a second at 1×, twice a game day. In Playwright: 76 black frames in 60 s at 3×
  before the fix, 0 after.

Balance, 150 days, against §4.85 in brackets:

| run | last gate | folk at day 150 |
|---|---|---|
| Vellish seed 42 | Burgh 42 (123) | 1,942 (3,060) |
| Vellish seed 43 | Burgh 37, Free City 123, **Beacon of Eda 145** (Burgh 123) | 2,343 (1,481) |
| Vellish seed 44 | Burgh 40 (123) | 1,280 (2,739) |
| Grimmen seed 42 | Deephold 123 (130) | 1,454 (1,217) |
| Veshari seed 42 | Vesh's Court 86 (84), Sable Crown 135 (137) | 2,356 (2,271) |
| Tallowkin seed 42 | Bright Town 33 (105), Hall of Wicks 60 (never), **Lantern of Wicks 114** (never) | 2,637 (1,392) |

**What moved, and why.**

- **The Vellish.** The bot now answers its gate. All three seeds take the Burgh 80 days or more
  earlier, and seed 43 goes on to the Free City and to the first Beacon a bot has ever lit: it
  saved for the Lantern of Vell and bridged the last 18,000 with the Crown's loan.
- **The Tallowkin** reach both of their last gates for the first time: the Hall of Wicks milestone
  on day 60 and the Lantern of Wicks on day 114, also on a loan. Both end with 70,000 still owed
  (350 a day), seed 43's ledger at +225 and the Tallowkin's at 0. The loan is a real lever now,
  and its price shows.
- **Veshari** is level with the baseline and now keeps a tide drake from the Crown's gift, a depot
  and the Great Weir.
- **Grimmen** takes the Deephold a week earlier with a fifth more folk, but it still loses a third
  of its folk in the Ember (964 on day 60, 665 on day 70). The baseline lost them too (923 to
  628), and it is not this iteration's mechanic: no home is abandoned, mana demand falls from 340
  to 218 and happiness dips to 51. The plan's bar "the Grimmen bot keeps its folk through days
  60–80" is **not met**.
- **The cost:** Vellish seeds 42 and 44 end with a third and a half fewer folk. The light-first
  rule holds their zoning through brownouts the baseline zoned through dark, and their tithe sits
  lower. Seed 44 ends in a brownout of 0.28 with two Fonts and a ledger of 273.
- **Breadth:** a dragon reaches the bot for the first time. In the final table only the Veshari
  bot stands a cradle and keeps the Crown's egg; in the passes the Vellish 43, Grimmen and
  Tallowkin bots kept theirs too, then the cradle's gate moved to a ley with mana to spare. Walls stand only where the
  packs came (Vellish 43, 17 tiles). Only the Veshari bot stands a depot, so most bots still trade
  nothing. No run went bankrupt. The lowest treasuries were −919 (Grimmen, day 90), −217 and −78.

**How the tuning went.** Thirteen passes; the first and last are worth recording:

- **Pass 1** had the light-first rule for every people, on any darkness. It took the Tallowkin to
  Bright Town on day 38, but starved the others: Vellish 42 at 975 folk, Vellish 44 stuck at 276
  folk and −13,874 crowns.
- **The final pass** limits the rule to the two peoples whose gate it is, and to real brownouts.

### 4.87 The playtest batch: painted buildings at the procedural scale, one facing for the set, reach rings you can see (iteration 56)

Three findings from the user's playtest of iteration 55, with a screenshot of a night street, are
fixed together, as small findings go into the next iteration.

**Painted buildings at the procedural scale.** The finding was "the buildings made from the
inspiration images are a bit big next to the procedural ones". Each imported sprite was measured
against its procedural twin in the browser, opaque box against opaque box (the paintings blocked
for one atlas, merged for the other):

- The zone houses already matched (hearth, craft, market and arcane levels at 0.9–1.18× the
  procedural height).
- The hero buildings stood 1.3–2.2× taller: the wells, the spire, the Wick-Tower and the Nexus
  (2.2×), the cistern, the depot and the yard, the chapels, the Lyceum, the Hall of Wicks, and the
  Founding Stake's four stages (73 px where a house is 38).

The cause was the importer's rule: a building painting is scaled to its footprint's full width and
the height follows, so a tall painting stands tall. Each hero now has a `targetHeight` of its
procedural twin's height × 1.15, or × 1.3 for the three towers, which are meant to rise over the
roofs. The 2 px outline the importer adds is counted. The `centre` anchor stands the sprite in the
middle of its tile as the procedural ones do. The Stake's stages scale by one factor (0.8) so they
keep their growth. Measured after the change: 1.09–1.16× for the halls and wells, 1.31–1.33× for
the towers. A test holds the heights in the manifest.

**One facing for the set.** "Some of the building sprites are turned to the wrong side". No sprite
was ever mirrored. The procedural painter puts the door and the gable end on the right face, so
every procedural building faces lower-right, while most paintings show their front on the left face.
The importer's new `flip` mirrors a painting before it is scaled; the anchor and the glow follow.
Each painting was judged by eye on a sheet of procedural, imported and mirrored side by side, and
nine are mirrored: the stage 0–2 Stake halls (the timber hall in the screenshot among them), the
depot, the Carters' Yard, the Lyceum, the cistern, one hearth and one market. The rest stay as they
were:

- The symmetric ones (the wells, the towers, the Gothic chapels, the boneyard, the Hall of Wicks).
- The ones painted head-on, which no mirror can turn: most of the zone houses, and the stage 3 Stake
  hall, a flat front elevation.

A mirrored painting's light falls from the other side; at the game's scale none of the nine looked
wrong for it. Facing each building toward its own road (a per-placement mirror at render time) would
flip the light building by building, and is left for later if wanted.

**Reach rings you can see.** "Water sources should have their radius of influence shown when a new
one is built or a well is clicked; it should show on every building with a radius where it makes
sense." The rings existed, both when placing and on selection, but they were drawn before the
objects, under every house and tree, and before the night's light pass multiplied them darker, at
8–12 % fill: in a built street or at night a well's ring was all but hidden. Now:

- **The ring's outline and label** are queued and drawn after the lighting, above everything, over a
  dark under-stroke. The soft fill stays under the objects.
- **A selected building shows every reach,** labelled ("water 4", "watch 14", "fed from markets
  12"), and its kin's reach faintly, as placing already did: every well's water around a well. A
  water ring is the water the building really gives, with the near-water bonus and a drought's
  shorter reach (`waterReachOf`, which the placement rings now share).
- **`reachesOf` (`src/sim/reach.ts`)** lists the primary reach (service, water, light) and the
  secondary reaches the sim uses but the panels only named in text, each read from the constant the
  sim uses. A ring cannot disagree with what the building does:
  - the cradles' feeding markets (12) and the Tamer's Lodge's cradles (10);
  - the Golem Foundry's and the Forge-Temple's binding (12), and the Forge's wake (20);
  - the quays' and landings' works (8, a square);
  - the Hospice's draughts (16, a square) and the Carters' Yard's roads (10, a square);
  - the Hanging Gardens' glowvine (12);
  - the Great Weir's flood (30, only with its sluice open);
  - the Lantern of Wicks' spires and the Underking's Seat's cradles (30);
  - the Torrent Mill's shared river and the Glimhouse's Hush works (8, squares).
- **Square reaches draw as squares.** Five reaches the sim measures as squares are drawn as their
  diamond.
- **Named constants.** Five were bare numbers in the sim (`HOSPICE_REACH`, `GLIMHOUSE_REACH`,
  `CARTERS_REACH`, `GLOWVINE_REACH`, `MILL_SHARE_REACH`) and are now named. The control balance seed
  is bit-identical to §4.86's Vellish 42 row.
- **No Ley Beacon ring.** The beacon's `BEACON_RADIUS` is declared but never read, so it gets no
  ring.

**Verified.**

- 59 test files and 347 tests; the new `tests/iteration56.test.ts` covers every service and water
  building's ring, the water reach, the secondary constants, the Weir's sluice, the hero heights and
  the flip list.
- The art check sheet, judged by eye, and the before/after side-by-side sheets.
- `scripts/playtest56.mjs`:
  - on a midnight street, the selected well's ring shows 397 pixels, 26 of them over the houses (the
    old order could put none there);
  - a well being placed shows its ring and the standing water around it;
  - a selected cradle shows its feeding reach;
  - the browser's own atlas measures every hero inside 1.2× of its twin (1.4× for the towers);
  - the screenshot's scene is shown before (the old sprites served from git) and after;
  - no errors.

### 4.88 The donkey carts: painted carts on the roads at the folk's scale, facing the way they drive, and a Show me that finds one (iteration 57)

The user sent four sheets of painted donkey carts (45 side views) to be the carts that carry the
goods, "not too big" in the game, so that the quest *See the first cart deliver* is something the
player sees. Until now a road cart was a procedural 18×12 mule-and-box (`cart()` in
`src/render/sprites.ts`) that never turned. Art and UI only; the sim is untouched.

**The import.** The sheets are `inspirations/carts/sheet_1..4.png` (converted from the uploads).

- Sheets 2 and 3 split into islands. Sheets 1 and 4 are drawn in a grid, and its lines kept the
  background key (a flood from the corners) out of every cell, so a `rect` is now cut from the raw
  sheet and keyed after the cut. No entry used `rect` before.
- **31 carts are used:** 27 goods carts (barrels, sacks, hay, crates, market stalls, covered and
  painted wagons, firewood, pottery, a festival cart) and 4 stone and ore carts for the mines'
  leystone. Left out: sheet 3's two green tool carts, which read as modern machines, and the
  near-duplicates in sheet 3's last row and sheet 4.
- **A new `kind: 'vehicle'`** in the importer: scaled by `scale` (a fraction of the painting's
  pixels), set per sheet from the height of its donkeys (140, 182, 181 and 135 px), so **every
  donkey stands about 10 px plus the outline** and a covered wagon is taller than a flat cart,
  where a target height would have shrunk the wagons' donkeys. Anchored at the bottom centre
  (wheels and hooves on the agent's point); no glow; sharpened and outlined like the set.
- **One facing, and a twin.** Sheet 1 faces right; sheets 2–4 are flipped so every cart faces
  right. `mirrored: true` also writes `<name>_l`, the left-facing twin, its anchor at `w − ax`.

**The scale.** Measured in the browser's atlas: a citizen is 7×11 opaque, the old cart 18×12, the
painted carts 11–16 px tall and 18–24 px wide (the stone carts 19–24 × 11–14). A donkey is a
citizen's height, as it is in life; a covered wagon stands about a head over the folk. A test
holds every cart to ≤ 1.5 citizens tall and ≤ 28 px wide.

**On the road** (`src/render/carts.ts`, `cartSpriteName`):

- a goods cart (variants 1–2) draws a painting from the goods pool, a leystone cart (0) from the
  stone pool, picked by the agent's id (a multiplicative hash), so a cart keeps its look for life
  with no rng;
- it faces the way it drives, from the sim's `dir`: +x and −y go right on the screen, +y and −x
  left, and a left-going cart draws its `_l` twin. Up- and down-screen roads use the same side
  views (a side-view painting has no back);
- the floating carts and the barges stay procedural, and without the paintings (`sprites.json`
  missing) every cart falls back to its procedural `cart_<variant>`.

**The Show me.** `Focus` gains `{ center: 'cart' }`: the camera goes to a cart carrying goods to a
market (else any road cart) and zooms to 2× if it is further out; with no cart on the road yet, the
goods view opens as before. *See the first cart deliver* uses it, and its hint names the donkey
carts. The in-game help's goods line and the README say so.

**Verified.**

- 60 test files and 351 tests; the new `tests/iteration57.test.ts` covers every cart's twin (anchor
  and pixels mirrored), the scale bounds, the pick by id and heading, the procedural fallbacks and
  the quest's focus. `tests/iteration56.test.ts`'s pinned flip list now counts buildings only.
- The cart sheet judged by eye at 6× (`npm run art:check` and a montage); then `checked: true`.
- `scripts/playtest57.mjs`:
  - a noon street with works, markets and folk, carts placed going both ways on two roads, shot at
    2× and 4×: the donkeys stand a citizen's height and face their way;
  - a live run where works fill carts: the first delivery at tick 1264 (12 goods), then the
    quest's Show me lands the camera 9 world px from a cart, at 2×;
  - without the paintings the procedural carts draw; a dusk probe shows no dark frame;
  - no errors and no missing sprites.
- Art and UI only: the control seed (Vellish 42, 150 days) is **bit-identical** to the code before
  this iteration, line for line (1,942 folk at day 150, as in §4.86 and §4.87).

**Not done.** The carts show no difference between going out loaded and coming back empty, and the
covered wagons look the same in every season; both would need painted variants.

### 4.89 M16 part 1, the wild: herds that thin where the city spreads, deer that run from the light, a lodge that hunts a chosen quarry, meat on the shelves, wolves in the Hush, the Close Season, two tales, the animal sheets (iteration 58)

Part 1 of M16 (§16). Before it, the only wild thing with a use was the Gloam-hound, hunted for pelts.
§15's rule holds: the player sees the herds, chooses the quarry, and can lose by it. A herd can be
hunted out for good. Hounds raid while the hunters are after deer. Wolves come to a dark edge in the
Hush.

**Herds** (`src/sim/wild.ts`).
- **State.** `state.wild` holds the herds. A herd has a species, a home tile, a head count (a
  fraction: the young come in by the day) and a cap.
- **The cap** is the habitat within 6 tiles of home, divided by a number of tiles a head and capped
  by species (habitat in the table below).
  - A habitat tile has no Gloam, no road, and no building within 2 tiles. That last rule is the
    one that makes the city thin its herds: build over a meadow and the cap falls.
  - A herd over its cap loses a tenth of the excess a day, at least 0.2.
  - A herd under one head is gone, with a message. It "left the ground: the city stands where they
    grazed", or "the hunters took the last".

| kind | ground | most head | meat, hides a head | trophy |
|---|---|---|---|---|
| deer | Meadow, Grass | 8 | 2, 1 | – |
| elk | the woods' edge | 5 | 4, 2 | antlers, 1 in 5 |
| boar | Forest | 4 | 3, 1 | tusks, 1 in 10 |
| goats | Hills | 5 | 2, 1 | – |
| otters | Shore by water, the shallows | 2 | 0, 2 | – |
| herons | Shore, the shallows | 2 | 1, 0 | plumes, 3 in 10 |
| wolves | Forest | 5 | 0, 2 | a wolf head, 1 in 4 |

- **Breeding.** Herds breed logistically: 0.03 a day in the Thaw and the Ember, 0.06 in Bloom (the
  young), none in the Hush.
  - The rate doubles where a ward covers the home or a lit Glimhouse stands within 8 (§16: "recover
    where a Glimhouse or a ward holds the ground").
  - The Close Season adds a quarter, and the white hart let run adds half.
- **Seeding.** A new map is seeded with full herds: up to 7 of deer, 3 of elk, 4 of boar, 3 each of
  goats, otters, herons and wolf packs, where the land holds them. Each season a pair wanders in
  wherever the land holds more.
- **Side streams.** Everything wild draws from streams keyed by the seed: seeding, hunting, wolves,
  and the animals' steps. The main stream never sees the wild, only what it does: goods, happiness
  and a hen taken. Vellish 44 is the proof: its bot buys no lodge and loses no hen, and its row is
  bit-identical to §4.86's.
- **What the player sees.** Each herd shows up to six animals.
  - Deer and elk graze within 5 of home by day.
  - On lit ground, or within 2 of it, they run from the light at a run's pace.
  - At dusk they walk to their bed, the nearest forest within 8, and at dawn they come back.
  - Boar root in the woods, goats keep the hills, otters swim the shore line, and herons stand in
    the shallows for minutes at a time.
  - The animals face the way they walk.

**The hunt.**
- **The quarry.** A Hunters' Lodge's panel names its quarry: hounds (the default, and old saves
  keep it), or any game in its grounds (16 tiles).
  - A lodge on game takes one head a day from the fullest herd of its quarry in reach, with a chance
    of 0.5 (0.35 for elk and wolves, 0.4–0.45 for the rest), scaled by its crew.
  - Hides go into its store (the old pelts are hides), meat into the salting shed (30 at most) and
    trophies onto a shelf.
  - Its hunters are out: hounds within 12 die at 0.4 instead of 0.8.
  - A lodge that kills a war-tiger keeps its head as a trophy.
- **The Gloam road** buys at the hunt's own prices:
  - hides 3 / 2.5 / 3 / 4 by season, dear in the Hush;
  - salted meat, the shed's meat over 20, at 1.5 / 1.5 / 2 / 2.5;
  - trophies at 30, or 40 in the Ember (the lords' hunting season).
  - Hides and meat ride in the carts' budget of 8 a depot, so they compete with the works' surplus.
  - Trophies go like relics, two a day outside the budget.
  - The Ledger has a row for the hunt's sales; the route note gives the prices; the Annals count the
    crowns.
- **Meat on the shelves.**
  - A lodge carts its meat to the markets within 16, up to 8 on a shelf, and a market sells one a
    day.
  - A hearth within 10 of a market with meat gets **+4 "meat on the shelves"**, a term as large as a
    lit home's.
  - Meat is the reason to put a lodge between the meadows and the market, and the reason to keep
    hunting.
- **The Close Season** (an edict; 10 crowns, plus 10 a lodge, a day):
  - no game is taken in Bloom, and the hunters guard against hounds instead;
  - no lodge takes a herd below 6 head;
  - herds breed a quarter faster.
  - It is the answer to a herd hunted out. The Hunters' Bounty stays as it was.

**Wolves in the Hush.**
- **The packs** lie up in the forest. In the Hush each pack:
  - thins the nearest deer, elk or goats within 12 (0.15 head a day);
  - takes a thrumhare near its den;
  - stalks the nearest level-1 hearth within 14 that has residents, no Watch at 90 and no ward.
- **The hen.** A dark hearth loses a hen one night in two, a lit one one night in five: −6
  happiness for five days, "the wolves took a hen", and a warning that names the answers.
- **Fear.** A wolf within 3 frightens a hearth (−5), as a hound does.
- **The answers.** Watch, a ward, a lodge hunting wolves, or the wolf winter's lamps.

**Two tales.**
- **The white hart** (once, from day 20, a deer herd of 6 within 25 of the stake):
  - hunt it for 400 crowns, a trophy, two head from every deer herd and an ill omen (−3 happiness,
    20 days);
  - or let it run: the herds breed half again as fast for 60 days, and +2 happiness for 20.
- **The wolf winter** (the Hush, two packs, a hen taken in the last ten days):
  - a winter hunt (300 crowns) halves every pack within 30 of the stake, and its hides go to a lodge;
  - lamps on the folds (150) stop the hens for 30 days;
  - or let the wolves keep the deer: deer −20 %, unrest +3 % for 15 days.

**The bot learns the hunt.**
- **The game lodge.** With no lodge free for game, it raises one at the city's edge facing the
  nearest herd of 4 or more, and only where a market lies within the meat's reach. It does this
  once the purse and the ledger allow.
- **The quarry.** The first lodge stays on hounds while a pack came in the last 15 days. The others
  hunt the most valuable game in their grounds, but only herds above half their cap, so the bot
  does not hunt a herd out.
- **The Close Season** goes on when the herds a lodge hunts fall under half their cap.
- `balance.ts` prints a `wild:` line: the herds and head by kind, the herds lost and hunted out,
  the hides, meat and trophies taken, the hunt's crowns, the hens, and each lodge's quarry.

**The animal sheets** (`npm run art`; judged by eye at 5× and in the game at 3×).
- **Painted.** The deer (the flower-antlered deer), the elk (the gold-antlered stag), the wolf (the
  white howling wolf), the Gloam-hound (the rune-marked shadow wolf), the Concord Warden (the stone
  golem), the thrumhare (the moon hare), the wisp (the glowing jellyfish) and the skyray (the star
  whale) are painted.
- **The drakes.** Eight of the nine drake lines are painted at the hatchling and drake sizes:
  - ember from the fire salamander;
  - bone from the black dragon;
  - glim and fen from the two green dragons;
  - vein from the golden drake;
  - sky from the blue dragon;
  - tide from the sea serpent;
  - storm from the ice dragon.
- **Two frames from one painting.** The importer's new `hop` key lets a painting serve as both
  frames, the second a pixel higher: a gait bob.
- **Procedural, and why:**
  - the boar, the goat (the crystal ram) and the otter were blobs at 7–12 px;
  - the lynx and the panther are not a copper war-tiger;
  - no sheet has a heron or a grey drake;
  - the wyverns stay procedural, because the painted dragons stand and the wyverns fly.
- **Fallbacks.** All seven wild kinds have new procedural sprites as fallbacks, and a test holds
  every creature to two frames.

**The six-run table** (against §4.86 in brackets):

| run | last gate | folk at day 150 | the wild at day 150 |
|---|---|---|---|
| Vellish seed 42 | Burgh 42 (42) | 1,618 (1,942) | 12 hides, 3 trophies; no depot, none sold; 0 hens |
| Vellish seed 43 | Burgh 37, Free City 126, Beacon of Eda 133 (37, 123, 145) | 2,903 (2,343) | 6 hides; 11 hens |
| Vellish seed 44 | Burgh 40 (40) | 1,280 (1,280), bit-identical | no lodge; 0 hens |
| Grimmen seed 42 | Deephold 125 (123) | 1,227 (1,454) | 14 hides, 3 trophies; 7 hens |
| Veshari seed 42 | Weirhold 48, Vesh's Court 82, Sable Crown 126 (Weirhold not listed, 86, 135) | 2,728 (2,356) | 10 hides, 1 trophy; 9 hens |
| Tallowkin seed 42 | Bright Town 34, Hall of Wicks 59, Lantern of Wicks 79 (33, 60, 114) | 3,003 (2,637) | 17 hides, 2 trophies, 120 crowns; 4 hens |

**What moved the rows.** Seed 44, untouched, shows the side streams hold. Every other row moved
because the bot now buys a game lodge (1,300 crowns and 24 a day), quests and tales changed (the meat
quest's 600, the wolf winter, the white hart), and wolves took hens in the Hush. From the first such
purchase each run follows another path.

A probe isolates the bot's hunt: Vellish 42 run with the bot's `hunt()` switched off is
bit-identical to §4.86 (1,942 folk). So the wild itself costs that city nothing. The 324 folk it
lost come from the one game lodge the bot raised beside a market and the different path
the run took from there. The lodge brought in 12 hides and 24 meat, and the city has no depot to
sell the hides. This is the single-seed variance named in the known issues as much as a cost. The
rule was tightened anyway (a game lodge only with a market within the meat's reach), and the
six-run table came back identical.

**What the hunt is worth to the bot.**
- It is worth little.
- Five of six bot cities stand no depot, so their hides and trophies are never sold. Only the
  Tallowkin's 120 crowns came back.
- The bot's lodges sit at the edge facing the herds. At day 150 one city in six has meat on a
  shelf.
- The herds the bot hunts hold up: none was hunted out, because the bot leaves half the cap. The 2
  to 7 herds lost a run were the city's spread, the wolves and the winter.
- A player who puts a lodge between the meadows and a market, and stands a depot, gets the
  shelves' +4 and the Gloam road's coin. That is the design; the bot does not do it yet.

**Verified.**
- 61 test files. The new `tests/iteration58.test.ts` (18 tests) covers:
  - seeding on habitat;
  - a herd built over and lost;
  - breeding by the season;
  - a deer running from the light, and bedding at night;
  - the lodge's take and yields, and an elk's antlers;
  - the hound chance;
  - the Close Season's Bloom and floor;
  - the depot's prices;
  - meat to a market and the hearth's line;
  - the hens and the folds;
  - both tales;
  - a save from before the wild;
  - two frames for every creature;
  - a wild that is the same twice.
- `scripts/playtest58.mjs`:
  - a herd at noon;
  - six deer leave lit ground;
  - the lodge's panel with its grounds and quarry buttons, and the quarry chosen by a click;
  - meat on a market's shelf and the hearth's happiness line;
  - a hen taken and the pack out on a Hush night;
  - the dawn and dusk probe;
  - a contact sheet of every creature, painted over procedural;
  - no errors, no missing sprites.
- **Not met.** The wolves at night in the forest are hard to see under the trees at 4×.
### 4.90 Every building faces its road (iteration 59)

The user's night screenshot of a grown city showed houses turning their sides and backs to the
street, and asked to fix every building. Iteration 56 (§4.87) gave the set one facing, lower-right,
and left the road-facing mirror for later; this iteration adds it. Render only; the sim never reads
which way a building faces.

**Which way a building should face** (`src/render/facing.ts`, `faceLeft`). Every sprite faces
right at rest: its front is on the lower-right face, toward +x, as the procedural painter draws
and as iteration 56's flips left the paintings. A building is drawn mirrored when its road runs
past its left side. The rule counts road tiles along each edge of the footprint:

- the visible front edges first: +x (lower-right) keeps the sprite, +y (lower-left) mirrors it,
  and the longer road front wins when both have road (right on a tie);
- with no road in front, the back edges: −y (upper-right) keeps it, −x (upper-left) mirrors it;
- with corner roads only (iteration 49's corner door), the left corner mirrors it.

The visible fronts win over the sim's door tile (`roadTileOf` scans the back row first), because
the question is what the player sees. The rule is a few road reads per visible building each frame,
with no cache: road edits by the bot, the dev commands and undo do not all bump `roadVersion`, so
a cache could go stale. Every footprint is square (a test holds it), so a mirror about the
footprint's centre line keeps a building on its own tiles.

**Mirrored drawing.** The atlas makes one mirrored copy of its sheet on first use, and again after
the paintings merge in. `atlas.mirrored(name)` returns a rect into it (`mirrorRect`): the body and
the glow at W − x − w, the anchor at w − ax. The draw, glow, glow-occlusion and construction paths
read the rect's own sheet. A building's body, its night windows, the glow it hides behind it and
its rising scaffold all turn with it. The placement ghost turns to the road at the cursor, so a
building faces the same way while placing as once built.

**What a mirror cannot do.**

- Most of the painted zone houses (the level-2 hearths, the craft levels, the arcane level 2, two
  level-3 markets) were judged again at 5×, each beside its mirror. They are drawn head-on, front
  to the viewer, as §4.87 said. A mirror moves their door to the road's side, but it cannot turn a
  front toward a road behind them. No new import flips were made.
- The light falls from the other side on a mirrored building. At the game's scale this read as
  fine on the crossroads shots.

**Verified.**

- 62 test files and 374 tests (after merging iteration 58, the wild); the new
  `tests/iteration59.test.ts` covers the rule on a 1×1 and a
  2×2 building (each edge, both fronts, both backs, the corners), the mirrored rect, and square
  footprints.
- `scripts/playtest59.mjs` builds a crossroads with 36 zone buildings (hearth 1–3, craft 1–3,
  market 2–3, arcane 2) on all four sides of two roads, and four 2×2 services:
  - every building faces its road's side (0 wrong of 40);
  - one frame draws exactly the 20 left-facing buildings from the mirrored sheet;
  - the ghost turns to the road north of the x-road and east of the y-road;
  - day and night shots at 2× and 4×, before (the previous build served beside it) and after;
  - a dusk probe shows no dark frame; no errors and no missing sprites.
- Render only: the control seed (Vellish 42, 150 days) is bit-identical to main after §4.89 (1,618
  folk at day 150).

### 4.91 M16 part 2, the water: shoals, the Fishers' Hut and its boats, fish that spoil, the Smokehouse, reeds and thatch, the lake's land and wells, the Water Garden, the ford and the Weir, the spawning run (iteration 60)

Part 2 of M16 (§16), and the milestone closes with it. Before it, the water was a mill's flow, a barge's road, a
well's bonus and a flood. §15's rule holds: the player sees the boats and the shelves, chooses where the huts go and
which roads ford the river, and can lose by it. A shoal can be fished out, fish spoil on the racks, thatch burns,
and a ford cuts the city in two for ten days a year.

**The waters** (`src/sim/water.ts`). Worked out from the terrain, once per map (the water never changes in play):
- **bodies**, the 4-connected stretches of water and deep water, each with a **shoal** of fish
  (`state.water.fish`, one number a body, by the body's first tile, so the order is stable);
- **open water**, a water tile whose 5×5 block is all water: the lake has it, the 2–3-wide river does not
  (a wide bend of the river can, and then counts as lake there);
- **the lake shore**, land within 3 of open water.

There is no marsh terrain, so the reeds grow on the Shore, as the wild's otters and herons already use it.

**Fish.**
- **A shoal** holds 0.6 a water tile (1.0 a deep one). It regrows logistically: 0.10 of itself a day by its room,
  0.15 in Bloom (the spawn), nothing in the Hush. A Weir on its water doubles that. Each otter of a holt beside it
  eats 0.3 a day, so a lodge hunting otters guards the catch (the wild, §4.89).
- **The Fishers' Hut** (Hamlet, 600 crowns, 8 a day, a crew of 4; must touch river or lake water and a road)
  lands crew × 1.2 × the shoal's share a day, at most a sixth of its water within 8, half in the Hush, none on a
  frozen river. The catch draws from a side stream (`seed:day:fish`), so a city with no hut adds no roll to the
  main stream.
- **Fished out.** Under a fifth of its cap a shoal is fished out: the catch falls with it, and the hut's panel and
  its problem line say so. One hut with a full crew holds a shoal of 100 at about half its cap; two huts on it take
  it down. A test holds a lone hut's lake above two fifths for 300 days, and fishes a 2-wide river out with two
  huts in under 120. The plan's 0.05 a day was raised to 0.10 for this: at 0.05 one hut emptied any lake under
  about 160 tiles, and the player cannot set a hut's crew, so it was no decision.
- **Spoilage.** A hut keeps two lots: today's catch and yesterday's. Each day the markets within 12 take fish onto a
  shelf of 6 (each sells 2 a day), nearest first and the older lot first; then a Smokehouse within 6 takes what is
  left, up to 10 a day; then yesterday's lot spoils. Fish caught today can be sold tomorrow or the day after, not
  later. The Annals count fish spoiled; the panel shows last night's.
- **The Smokehouse** (Thorp, 700, 6 a day, a crew of 2) keeps what it smokes. Smoked fish fills what room the
  shelves have left, and over 10 goes down the Gloam road at 2 / 2 / 2.5 / 3 by season, inside the carts' budget of
  8 a depot, beside the hides and the salted meat.
- **On the shelves.** A hearth within 10 of a market with fish gets **+3 "fish on the shelves"**, beside the
  meat's +4; a market with both feeds both lines.
- **Boats.** A crewed hut puts one boat on its water (two at a full crew) by day; a boat rows to a spot within 8,
  lies there with its nets out for a few minutes, and rows on; at dusk it comes back to the hut's mooring. Boats
  are creature agents on the wild's side stream; the sprite is procedural (a clinker hull, a fisher, an oar that
  strokes, a bow lamp at night) and faces the way it rows.

**Reeds and thatch.**
- **The Reed-Cutters' Hut** (Hamlet, 500, 5 a day, a crew of 3; must touch the shore or the water) cuts the reed
  beds, open shore within 6: min(crew, beds ÷ 5) bundles a day in the Thaw, Bloom and Ember, none in the Hush.
- **Thatch.** Each bundle thatches the nearest level-1 home within 10 whose thatch is missing or has under ten
  days left, for 60 days: **+3 "a new thatch"**, and a thatched roof catches fire 1.5× as easily. A home that grows
  to level 2 has a proper roof and the thatch no longer counts.
- **A deviation from §16.** §16 asked for thatch as "a cheaper wall material for level-1 hearths". Homes cost no
  crowns and no upkeep in this game, so a cheaper material would change nothing. Thatch is comfort with a fire
  price instead, and the Veshari Hall is the answer to it.

**The lake.**
- **Land.** A tile within 4 of open water has **"by the lake" +6** land value, on top of the old "water near".
- **Wells.** A water building within 3 of open water serves **1.5× its cap** ("the lake feeds it"): a well 45
  levels instead of 30. The well's panel says so.
- **The Water Garden** (Market Town, 1,800, 18 a day; 2×2; leisure 10 at 0.8, land value 15) must stand within 3
  of open water: the river is too narrow for it.

**The ford and the Weir.**
- **The ford.** A Dirt Track over a narrow river tile (land within 2 on both opposite sides) is a ford and costs
  1.5× a track instead of a bridge's 4×. A cobbled road or better over water is a bridge, as before, and so is a
  track over the lake.
- **High water.** A ford is under water for the first ten days of every Thaw that follows a Hush (so not the
  charter's first), and wherever the Hush flood or the Great Weir's sluice reaches it. A frozen river is open.
  While a ford is under water the road A* treats it as no road, the paths are worked again, carts and folk on it
  turn back, the ground draws it under the river, and a message names the answer.
- **The Weir** (Thorp, 900, 6 a day; must touch the water) holds the fords within 6 open at high water, and the
  pool below it doubles its body's shoal regrowth.
- The road tool's hint says all this, with the count of fords under water today. There is no tile tooltip in the
  game, so the plan's "a ford's hover says open or closed" became the hint and the message.

**The Close Season** (the wild's edict, §4.89) now covers the fishery too: no fishing in Bloom, and no hut takes a
shoal under a third of its cap.

**A tale: the spawning run** (once, in Bloom, with a hut on a shoal at four fifths of its cap or more):
- net the run: +300 crowns, and the shoal falls to two fifths;
- or let it spawn: the shoals regrow twice as fast for 60 days, and +1 happiness for 20.

**Quests:** fish on a market's shelf (400), ten homes thatched (400), ford the river (300). **The Annals:** fish
landed, spoiled and smoked, crowns from smoked fish, homes thatched, ford days under water. **The Ledger** has a
row for smoked fish sold, and the Gloam road's note gives the price. **Reach rings:** the hut's fishing water and
markets, the smokehouse's huts, the reed beds and the thatched homes, the Weir's fords.

**The bot learns the water.** One Fishers' Hut on water whose shoal is over half its cap, with 24 water tiles in
reach (the first version took a pond of a few tiles and landed two fish in 150 days) and a market within 10, once
the purse and the ledger allow; a Smokehouse beside it once a depot stands, or when its racks spoil. It builds no
reed-cutters, no Weir and no ford on purpose; its tracks over a narrow river are fords by the rule.
`balance.ts` prints a `water:` line.

**Art.** Procedural sprites for the five buildings (new spec features: a fish rack and an upturned boat, sheaves of
reed, a smoking rack, a lily pond with stepping stones, a weir sill with white water) and for the boat. The
`inspirations/` folders have no paintings of these.

**The six-run table** (against §4.89 in brackets):

| run | last gate | folk at day 150 | the water at day 150 |
|---|---|---|---|
| Vellish seed 42 | Burgh 43, Free City 135 (Burgh 42) | 2,622 (1,618) | 2 huts, a smokehouse; 790 landed, 424 smoked, 144 spoiled; no depot |
| Vellish seed 43 | Burgh 41 (37, Free City 126, Beacon of Eda 133) | 1,118 (2,903) | a hut; 395 landed, none spoiled |
| Vellish seed 44 | Burgh 36 (40) | 1,309 (1,280) | no hut (no water in reach with a market) |
| Grimmen seed 42 | Deephold 124 (125) | 1,398 (1,227) | a hut; 100 landed |
| Veshari seed 42 | Weirhold 40, Vesh's Court 72, Sable Crown 121 (48, 82, 126) | 2,746 (2,728) | a hut, a smokehouse; 435 landed |
| Tallowkin seed 42 | Bright Town 37 (34, Hall of Wicks 59, Lantern of Wicks 79) | 1,505 (3,003) | a hut; 407 landed |

Every map's bot roads ford the river 8 to 12 times; the fords stood under water 10 days (the second year's Thaw).
No bot city thatches, and only Vellish 42 and the Veshari stand a smokehouse.

**What moved the rows, and what did not.** Two rows fell hard (Vellish 43 lost two gates, the Tallowkin two halls),
two rose (Vellish 42 reached the Free City, the Grimmen 171 folk), two held. Probes tell the water's effect apart from
the runs' variance:
- **The fords are not it.** The four worst seeds run with fords that never close (Vellish 43 and 45, Tallowkin 42
  and 43) land within 2–7 % of the full branch.
- **The bot's hut is not it.** The same seeds with the bot's fishing switched off swing both ways (Tallowkin 42
  2,546, Tallowkin 43 1,349).
- **One roll moves a run this much.** The same four seeds on the code before this iteration, changed only by one
  extra roll of the main stream on day 10, land at 1,396 (Tallowkin 42, both halls lost), 1,891, 1,579 (Vellish 43,
  Free City and Beacon lost) and 1,990. So the §4.89 rows for Tallowkin 42 and Vellish 43 were lucky paths: one roll
  sends main down the same road this iteration's rows took.
- **A wider table.** On three more seeds (Tallowkin 43 and 44, Vellish 45) the branch lands at 1,623, 1,888 and
  1,578 against main's 2,098, 1,812 and 2,203; against the one-roll main of the same seeds it is −268, (not run)
  and −412.

The honest reading: the runs cannot show a cost of the water, and cannot rule out a modest one either (about a tenth,
if the wider seeds are not noise). The single-seed table is too noisy to measure a change of this size, and a
null-calibrated table (each seed run twice, the second with one extra roll) is now in the known issues.

**Verified.**
- 63 test files, 390 tests; the new `tests/iteration60.test.ts` (16 tests) covers the bodies, the open water and
  the lake shore; the Water Garden's placement; the lake's land and wells; the shoal's regrowth by season and under
  a Weir; a lone hut holding its lake and two huts fishing a river out; spoilage on the third day; the market's
  shelf and the hearth's line; the smokehouse and the depot's sale; the Close Season; the boats on their water;
  thatch and the Hush; the ford's cost, its high water after a Hush, the paths round it and the Weir; the spawning
  run; a save from before the water; sprites; and the same water twice.
- `scripts/playtest60.mjs`, a lakeside town painted on seed 60:
  - two huts, a smokehouse, reed-cutters, a market, twelve homes and a water garden;
  - after eight days of the Ember: 28 fish landed, 8 smoked, none spoiled, fish on a market's shelf, 12 homes
    thatched, both quests done;
  - two boats on the lake at noon, both moored at midnight;
  - the hut, market and home panels; the ford under water in the second year's Thaw beside an open bridge;
  - a dawn and dusk probe; no errors, no missing sprites.
- **Not met.** The plan's ford hover (there is no tile tooltip; the road hint and the message carry it). The bot
  does not thatch, build a Weir or stand a depot for its smoked fish (Vellish 42 smoked 424 and sold none).

### 4.92 The bot's depot, the hunt and the fish (iteration 61)

NEXT_STEPS item 1, from iterations 58 and 60. Five of six bot cities stood no depot, so their hides, trophies and
smoked fish were never sold (Vellish 42 smoked 424 fish and sold none). The bot also never thatched, never built a Weir
and never bridged a ford. Only the bot changes (`src/sim/bot.ts`). The sim's rules are as they were, except that the
Weir's hold on a ford is now one function (`weirHolds` in `water.ts`, read by the high water and by the bot).

**Why there was no depot.** A probe of Vellish 42 asked, every day after the bot's step, why the depot was not bought.
- On 98 of the 139 days after its unlock the treasury lacked 2,200 plus the 1,500 buffer. On the other 41, the Font
  goal's reserve held the price back.
- It was never unplaceable and never stopped by the ledger.
- The depot was `want('depot', 1)`, seventeenth in a service queue that never emptied.

**The depot as a goal** (§4.86's purse):
- `waitingForRoad()` prices what waits for the Gloam road at today's rates: hides, salted meat over the lodge's keep and
  trophies on the lodges, smoked fish over the smokehouse's keep, full works over half their store (the share
  `dailyTrade` sells), and loose relics over ten.
- Once that reaches half the depot's price, with the ledger carrying its upkeep by 100, the depot is the goal. It comes
  after the people's hall and the first cradle and before the cheapest mana.
- Its price is held back from growth like a hall's. In the first draft it was not, and the Tallowkin wanted a depot for
  forty days while growth spent the purse each morning.

**The imports edict pays its bill.**
- With the depot standing in more cities, the bot's old rule called the Import edict on any ledger over 200. The rule:
  a third of the markets dry, with a depot.
- In the first draft's Veshari 42, a brownout dried 37 markets and the edict ran a bill of 500–2,700 crowns a day for
  ten days. The city lost the Sable Crown and 800 folk.
- The bot now reckons the bill (the dry markets × 8 goods × twice the road's price) and calls the edict only when the
  ledger carries it twice over.

**Thatch.** A Reed-Cutters' Hut where ten reed beds lie within its reach and eight level-1 homes within its thatching
reach, once the purse and the ledger allow (500, 5 a day). A second comes after day 90 for homes the first cannot
reach. It is for every people.

**The Weir.** One Weir on the hut's water once its shoal is fished under half its cap. Among the bank spots, it takes
the one that holds the most unheld fords.

**The fords.**
- In the second half of a Hush, before the Thaw's high water, a bank spot that holds five unheld fords or more gets a
  Weir, since five bridges cost what a Weir does.
- Otherwise the crossing nearest the centre is cobbled into a bridge, one crossing a day.
- A bridge is a street: it reads the treasury, as the grid does. The first draft read the purse, and the Font's reserve
  held every bridge back.

**A plan item not done.** The plan had a game lodge wait for a depot. It was dropped: the bot's lodges stand on hounds
in every run (main and branch), so no game lodge was ever built for it to delay, and a lodge's hides are one of the
things that call for a depot.

**`balance.ts`.**
- The `bot:` line prints the depot's day and the crowns the Gloam road paid over the run.
- The `water:` line prints the cutters, the Weirs and the ford tiles bridged.
- A sixth argument, `null`, draws one extra roll of the main stream on day 10. It is the yardstick of §4.91, now a flag.

**The six-run table.** Every seed was run four times: main, main with one extra roll on day 10, the branch, and the
branch with the same roll. Folk at day 150 (last gate and its day):

| run | main | main + roll | branch | branch + roll |
|---|---|---|---|---|
| Vellish 42 | 2,622 (Free City 135) | 1,288 (Burgh 51) | 2,249 (Free City 129) | 1,624 (Burgh 51) |
| Vellish 43 | 1,118 (Burgh 41) | 1,396 (Burgh 34) | 1,366 (Burgh 41) | 1,464 (Burgh 43) |
| Vellish 44 | 1,309 (Burgh 36) | 1,343 (Burgh 41) | 1,318 (Burgh 35) | 1,620 (Free City 136) |
| Grimmen 42 | 1,398 (Deephold 124) | 1,436 (Deephold 60) | 1,343 (Deephold 126) | 1,450 (Deephold 59) |
| Veshari 42 | 2,746 (Sable Crown 121) | 2,852 (Sable Crown 131) | 2,953 (Sable Crown 122) | 2,566 (Sable Crown 116) |
| Tallowkin 42 | 1,505 (Bright Town 37) | 1,196 (Bright Town 41) | 1,428 (Bright Town 40) | 1,166 (Bright Town 40) |
| **sum** | 10,698 | 9,511 | 10,657 | 9,890 |

What the bot did, on the branch and on the branch with the extra roll:

| run | depot (day) | road crowns | smoked-fish crowns | homes thatched | ford tiles bridged (days a ford stood closed) |
|---|---|---|---|---|---|
| Vellish 42 | 48 / 73 | 1,683 / 1,102 | 769 / 0 | 79 / 40 | 10 (0) / 10 (0) |
| Vellish 43 | 41 / 58 | 1,336 / 1,128 | 0 / 0 | 44 / 23 | 10 (10) / 12 (0) |
| Vellish 44 | 46 / a service | 1,126 / 1,184 | 0 / 0 | 91 / 73 | 8 (0) / 8 (0) |
| Grimmen 42 | 125 / 58 | 460 / 1,765 | 0 / 0 | 37 / 36 | 0 (10) / 4 (10) |
| Veshari 42 | 62 / 84 | 952 / 836 | 0 / 0 | 93 / 94 | 10 (0) / 0 (35) |
| Tallowkin 42 | none / none | 0 / 0 | 0 / 0 | 40 / 70 | 3 (10) / 0 (10) |

On main, two runs in twelve stood a depot, both as a service (Veshari 42, and Vellish 44 with the extra roll). On the
branch, ten of twelve did.

**The reading.**
- Every branch row lies inside the spread its own seed shows on main, or above it.
- The branch sums sit at main's (10,657 against 10,698; 9,890 against 9,511).
- The largest single move (Vellish 42) is the seed whose main row is the lucky one: main with one roll lands at 1,288.
- So the levers cost nothing measurable. Whether they gain anything cannot be told at this noise (NEXT_STEPS item 2).

**What the runs show that a table of folk does not.**
- **Corrected in iteration 63 (§4.94): this paragraph is wrong.** It counts only the road's eight goods a day. The
  Belerial caravan halts at a depot every twelve days and buys the works' surplus at 1.5×. Over these runs it paid
  23,000–39,000 crowns a city, about ten times the depot's upkeep. The reading as first written:
- **The depot does not pay its way on the road.** The road paid 460–1,765 crowns over the 65–105 days the depot
  stood, against 25 a day of upkeep (1,600–2,600) and its 2,200 price.
  - The road carries 8 goods a day a depot, at 2–3 crowns (hides 2.5–4). That is 16–32 crowns, about its upkeep.
  - Only trophies (30–40, two a day, outside the carts) and relics (60) pay more, and the bot's lodges hunt hounds, not
    game.
  - A player who stands a depot for the hunt or the fish loses a little by it. That is a sim question, not the bot's,
    and it is the next item.
- **Smoked fish sold only on Vellish 42** (769 crowns). Elsewhere the smokehouse's stock went to the shelves first, or
  the city had no smokehouse.
- **No Weir was built.** No bot hut fished its shoal under half its cap: one hut holds its water (§4.91), and the bot
  stands one. No five fords lay within one Weir's reach. The rules are held by tests, not by these runs.
- **The Tallowkin never stand a depot.** They want one from day 55 to day 95 and hold its price back. Their Wick-Towers
  and spires read the treasury, not the purse (their gate is light, and their light comes first), and they spend
  the morning's crowns before it reaches 2,500. Changing that would change the light-first rule of §4.86, so it stays.
- **Thatch on every map:** 23–166 homes thatched a run. No run shows a fire spike that could be told from noise.

**Verified.**
- `npx tsc --noEmit -p .`, and 64 test files with 399 tests.
- The new `tests/iteration61.test.ts` (9 tests) covers:
  - the depot goal on hides, trophies, smoked fish and relics, and none on an empty road or a thin ledger;
  - the depot placed from the purse, and its price held back;
  - the cutters where the beds and homes are, and none for five homes;
  - a Weir on a fished-down shoal;
  - the late Hush bridging the unheld crossing and leaving the one a Weir holds, and a Weir raised over five fords
    instead of bridges;
  - the imports bill against the ledger.
- `npm run build`.
- `scripts/playtest61.mjs`: the bot plays Vellish 42 in the browser to day 125.
  - The depot stands from day 48, and its panel and the Budget's Gloam-road rows read right.
  - Two cutters' huts have thatched 67 homes.
  - It bridged all ten of its ford tiles before high water: in the second year's Thaw no ford stands under water, and
    the cobbled bridges are open.
  - 1,510 folk at day 125.
  - The dawn and dusk probe is clean; no errors and no missing sprites.
- **Not met.** No Weir in any run (above). The Tallowkin's depot. Six of the twelve balance runs still had a ford closed
  at high water (the Grimmen and Tallowkin rows, Vellish 43 on the plain seed, and the Veshari's flood with the extra
  roll): a crossing a day, only on mornings when the treasury holds its price and 800, is not always enough.

### 4.93 A balance measure that can see a change: the balance table (iteration 62)

NEXT_STEPS item 1, from iterations 60 and 61.
- **The problem.** One extra roll of the main stream on day 10 moves a bot run by up to half its folk and two gates.
  So the six-run table, one run a seed, could not tell a change of a tenth from luck. Iteration 61 ran it four ways by
  hand.
- **The tool.** This iteration makes that the project's balance tool. It is tooling only: no `src/` change.

**Draws.**
- `balance.ts` takes a sixth argument, `roll=N`: N extra rolls of the main stream on day 10 (`scripts/rolls.ts`).
  `null` is `roll=1`.
- A seed's draws (rolls 0, 1, 2, …) are the same map and the same opening down different paths.
- The run's last line is `json: {…}`: seed, people, rolls, folk, the milestone and each gate's day, treasury, loan, the
  depot's day and the road's crowns. The table reads only that line.

**The table** (`scripts/table.ts`, statistics in `scripts/tableStats.ts`).
- **The matrix.** It runs peoples × seeds × draws as parallel child processes. The default is the four peoples ×
  seeds 42–44 × two draws: 24 runs, 11 minutes on four cores.
- **`--compare <ref>`** runs the same matrix on a git ref too. The ref runs in a detached worktree in the temp dir with
  this tree's runner copied in, removed afterwards. The report has:
  - **every row:** folk for each draw, the last gate and its day, and the spread;
  - **per people:** σ, pooled within seeds (the mean of each seed's sample variance), so a difference between maps is
    not counted as noise;
  - **the comparison:** Δ, the mean over seeds of the paired difference of the two refs' means, with SE =
    √(σ²(1/dA + 1/dB)/S) (σ pooled over both refs). Its verdict is **seen** when |Δ| > 2·SE, else **within the
    noise**. The SE of all peoples together is the root of the summed squares;
  - **the gates:** how many runs reach each gate, and the median day.
- With one ref and no compare, it reports the smallest change two such tables could see (2·SE). A "within the noise"
  then says how large a cost it rules out.
- The raw runs go to `shots/table.json`.

**Control.** On this tree, the six rows of §4.92 come back bit for bit (Vellish 42 at 2,249 and 1,624, Veshari 42 at
2,953 and 2,566, and the rest). So `roll=1` is iteration 61's `null`, and the sim did not move. A `--compare
origin/main` of 30 days reports Δ = 0 on every people and leaves no worktree behind.

**The calibration** (this tree, 24 runs, against which iteration 63 will be measured):

| people | seeds 42 / 43 / 44, folk by draw | mean | σ within seeds | smallest change seen (2·SE) |
|---|---|---|---|---|
| Vellish | 2,249·1,624 / 1,366·1,464 / 1,318·1,620 | 1,607 | 286 | 330 (21 %) |
| Grimmen | 1,343·1,450 / 763·904 / 2,360·2,134 | 1,492 | 117 | 135 (9 %) |
| Veshari | 2,953·2,566 / 2,493·2,434 / 1,625·1,650 | 2,287 | 160 | 185 (8 %) |
| Tallowkin | 1,428·1,166 / 1,291·2,170 / 1,994·2,555 | 1,767 | 439 | 507 (29 %) |
| all four | | 7,153 | | 647 (9 %) |

- **The seeds differ more than the draws.** Grimmen 43 ends at 763–904 and Grimmen 44 at 2,134–2,360. So the
  pairing by seed matters: an unpaired table would count the maps as noise.
- **The noise is the people's.** The Grimmen and the Veshari can show a change of a tenth on this table. The Vellish
  (σ 286) and the Tallowkin (σ 439, whose halls come or go with a draw: Tallowkin 43 is 1,291 or 2,170) cannot.
- **A third draw** for the Vellish (9 runs) gives σ 268 against 286, so the two-draw σ is not an accident of three
  degrees of freedom. The floor falls to 16 %.
- **Runs needed for a tenth:** the floor falls with the square root of the runs, so a people needs (floor / 10 %)² × 6
  runs. That is about 25 for the Vellish and 50 for the Tallowkin, against 6 now. One table for both at a tenth would
  take about 75 minutes of runs a ref. The default stays at 24 runs. The four peoples together can see a change of
  about 9 %, and a people's own row about 8–29 %. Whether the bar grows is the user's to say (NEXT_STEPS).
- **Gates** over the 24 runs:
  - Vellish: the Burgh 6 of 6 (median day 42), the Free City 2 of 6 (day 133).
  - Grimmen: the Deephold 4 of 6 (day 50), the Underking's Hall 2 of 6.
  - Veshari: the Sable Crown 4 of 6 (day 121).
  - Tallowkin: the Hall of Wicks 3 of 6 (day 56), the Lantern of Wicks 1 of 6.

**Verified.**
- `npx tsc --noEmit -p .` (it covers `scripts/`), 65 test files with 407 tests, and `npm run build`.
- The new `tests/iteration62.test.ts` (8 tests) covers:
  - the json line;
  - the roll argument, and `roll=N` drawing exactly N numbers;
  - σ pooled within seeds;
  - a 3σ shift seen and a 0.5σ shift not, with SE as the formula gives it;
  - the peoples' errors adding in quadrature;
  - the gate counts;
  - a report that carries every row and a verdict for each people.
- The control above, and `scripts/playtest61.mjs` with `DAYS=10` against the preview build: the bot plays; no errors
  and no missing sprites; a clean dawn and dusk.

### 4.94 The caravan in the books (iteration 63)

NEXT_STEPS item 1 after iteration 62 was "the depot's road does not pay", from §4.92. That reading was wrong, and the
item is withdrawn.
- §4.92 compared the road's eight goods a day (460–1,770 crowns a run) with the depot's upkeep.
- It missed the **Belerial caravan** (`maybeFireCaravan`, `src/sim/events.ts`). Every 12 days at a standing depot, its
  Trade buys every works' stock above ten at 1.5× the price. The bot takes it every time.
- A probe of §4.92's six runs:

| run | caravan crowns | depot upkeep paid | road's daily sales |
|---|---|---|---|
| Vellish 42 | 23,448 | 2,525 | 1,683 |
| Vellish 43 | 30,928 | 2,725 | 1,336 |
| Vellish 44 | 23,760 | 2,600 | 1,126 |
| Grimmen 42 | 3,390 (depot on day 125) | 625 | 460 |
| Veshari 42 | 39,243 | 2,175 | 952 |
| Tallowkin 42 | no depot | | |

**The real fault.** The depot pays about ten times its upkeep, but nothing a player or the bot looks at said so:
- the Budget's "Exports" row and the 10-day ledger history counted only the daily road;
- the depot's panel counted goods, not crowns;
- the bot valued a full works at half its store on the road.

§15's rule (a player must be able to see a mechanic) was broken. This iteration fixes the books, not the depot.

**The books.**
- `stats.caravanCrowns` and `stats.lastCaravanCrowns` count what the caravan pays: its Trade, the rare goods and the
  relic auction. The take is the treasury's rise as the tale is answered (`resolveEvent`). Buying striders is not a
  take, and a caravan sent on counts 0.
- The take joins the day's line of the 10-day ledger history ("exports included").
- **The Budget** has a row, *The Belerial caravan (every 12 days)*: "last: +4,829 on day 106 · this charter: +21,699 ·
  next in 12 days", or the first halt's day and the surplus waiting.
- **The depot's panel:** "5,723 sold so far for 21,699 crowns".
- **The Annals:** "Crowns from the caravan".
- An old save fills both stats from a fresh game (0). Nothing in the sim reads them, so the sim does not move.

**The bot reads the caravan.** `waitingForRoad` values the works' stock above ten at 1.5× the price (`caravanSurplus`),
in place of the road's half-store share. The hides, meat, trophies, smoked fish and relics stay as they were: the caravan
does not buy them.

**The table** (`scripts/table.ts --compare origin/main`, 48 runs, 25 minutes):

| people | this tree | main | Δ paired by seed | ± 2·SE | verdict |
|---|---|---|---|---|---|
| Vellish | 1,495 | 1,607 | −112 (−7.0 %) | 283 | within the noise |
| Grimmen | 1,557 | 1,492 | +65 (+4.3 %) | 149 | within the noise |
| Veshari | 2,259 | 2,287 | −28 (−1.2 %) | 168 | within the noise |
| Tallowkin | 1,849 | 1,767 | +81 (+4.6 %) | 451 | within the noise |
| all | 7,160 | 7,153 | +6 (+0.1 %) | 578 | within the noise |

- **Depots go up earlier** (median day 34 / 50 / 39 / 37 against 48 / 55 / 62 / 43). The Tallowkin stand one in 6 runs
  of 6, against none on §4.92's single seed.
  - Main's count in the table misses depots bought as a service: they print no depot day, and main has no caravan
    count.
- **The caravan paid** a mean of 27,646 (Vellish), 13,930 (Grimmen), 27,083 (Veshari) and 36,273 (Tallowkin) crowns
  a run. The road's daily sales were 1,063–1,444.
- **The gates move both ways.**
  - The Vellish lose the Free City (0 of 6, against 2 of 6 on main).
    *(Iteration 64's wide bar, §4.95: 22 of 48 against 21 of 48, so this was noise.)*
  - The Tallowkin reach the Hall of Wicks in 5 of 6 (against 3 of 6).
  - The Grimmen reach the Underking's Seat in 2 of 6 (against 1).
  - The Veshari's Sable Crown holds at 4 of 6.
- Neither the folk nor the gates show a change past the noise. The Vellish's −7 % would need about four times the
  runs to be told (§4.93).

**Verified.**
- `npx tsc --noEmit -p .`, 66 test files with 413 tests, and `npm run build`.
- The new `tests/iteration63.test.ts` (6 tests) covers:
  - Trade counted at the treasury's rise and joining the day's history;
  - the rare goods and the relic auction counted, a caravan sent on counting 0, and striders not a take;
  - an old save;
  - the Annals row;
  - the bot's caravan valuation and the depot goal it raises.
- `scripts/playtest63.mjs`: the bot plays Vellish 42 in the browser to day 100.
  - The caravan paid 16,870 by day 100, and 4,829 at its halt on day 106.
  - The Budget row and the depot panel read as above, and the history's last line is +5,206.
  - The Annals carry the row.
  - No errors, no missing sprites, and a clean dawn and dusk.

### 4.95 A wider balance bar (iteration 64)

NEXT_STEPS item 1, approved by the user. The table of §4.93 (24 runs a side) sees a tenth over all four peoples, but
only a fifth for the Vellish and three tenths for the Tallowkin. Iteration 63's open question (the Vellish −7 % and
a lost Free City) was that size.

**The bar** (`scripts/table.ts --bar wide`; statistics in `scripts/tableStats.ts`):
- **Seeds 42–47** (six instead of three), two draws each, then rounds.
- **Rounds.** Each people whose floor (2·SE, against the other side, or against a copy of itself with no compare) is
  over the target share of its mean (`--target`, 0.10) gets one more draw a seed on both sides. Rounds repeat until
  each people is under the target or at the cap (`--max-draws`, 8). SE = σ·√(2/(draws × seeds)), so the runs go
  where the noise is.
- **The report** opens with the bar: per people, seeds × draws, the floor, its share, and *met*, *not met*, or *not
  met: at the cap*. A cap is never rounded up.
- **The cache** (`shots/table-cache`). A run is stored by its commit, the runner's hash (`balance.ts` + `rolls.ts`),
  people, seed, roll and days.
  - A ref is always cached. The working tree is cached when nothing under `src/`, `scripts/`, `public/` or
    `package.json` differs from HEAD.
  - So a table stopped part way resumes, and a rerun after a bot fix pays only for the branch side.
  - The first real run needed this: it outran the two-hour limit of a background job in its seventh round and
    resumed from 230 cached runs (13 minutes for the last 22).
- **CLAUDE.md rule 4** names the wide bar for any sim change. The quick table is for probes, and one control seed is
  for art.

**Its first use: iteration 63 (`84dcd06`) against iteration 62 (`fc41ecc`).** 252 runs, about 2¼ hours on four cores.

| people | seeds × draws | iteration 63 | iteration 62 | Δ paired by seed | ± 2·SE (share) | verdict |
|---|---|---|---|---|---|---|
| Vellish | 6 × 8 | 1,786 | 1,651 | +135 (+8.2 %) | 175 (10.2 %, at the cap) | within the noise |
| Grimmen | 6 × 2 | 1,383 | 1,343 | +40 (+3.0 %) | 110 (8.1 %) | within the noise |
| Veshari | 6 × 3 | 2,395 | 2,322 | +73 (+3.1 %) | 213 (9.0 %) | within the noise |
| Tallowkin | 6 × 8 | 1,914 | 1,873 | +41 (+2.2 %) | 213 (11.3 %, at the cap) | within the noise |
| all | | 7,479 | 7,189 | +289 (+4.0 %) | 365 (4.9 %) | within the noise |

- **Iteration 63's Vellish −7 % was noise.** On 48 runs a side the sign turns (+8 %), and neither is past the noise.
- **The Free City** is reached in 22 of 48 Vellish runs on iteration 63 and 21 of 48 on 62. The "lost Free City" of
  §4.94's quick table was three seeds' luck.
- **The other gates:**
  - the Beacon of Eda 3 and 3;
  - the Sable Crown 12 and 12 of 18;
  - the Hall of Wicks 33 and 33 of 48 (median day 56 against 64);
  - the Lantern of Wicks 12 and 12;
  - Bright Town 45 against 48 of 48;
  - the Underking's Seat 2 against 1 of 12.
- **Depots and the caravan:**
  - on iteration 63, 48 of 48 Vellish and 48 of 48 Tallowkin runs stand a depot (median day 30 and 34; on 62, 52 and
    44);
  - the caravan paid a mean of 25,563 (Vellish), 10,591 (Grimmen), 30,917 (Veshari) and 39,493 (Tallowkin) a run.

**What the noise is.**
- σ within seeds on six seeds and many draws is higher than §4.93's three-seed, two-draw estimate:

  | people | σ (iteration 63 / iteration 62) | §4.93's estimate |
  |---|---|---|
  | Vellish | 394 / 462 | 286 |
  | Grimmen | 148 / 120 | 117 |
  | Veshari | 358 / 274 | 160 |
  | Tallowkin | 552 / 490 | 439 |

  - Two draws a seed underestimate σ: a seed's few draws often land near each other.
- That is why eight draws leave the Vellish at 10.2 % and the Tallowkin at 11.3 %. A tenth would take about 9 and
  10 draws, about 30 minutes more a comparison.
- The cap stays at 8: the bar as approved costs about 2¼ hours a comparison (67 minutes a ref), and the two misses are
  reported as misses.

**Verified.**
- `npx tsc --noEmit -p .`, 67 test files with 418 tests, and `npm run build`.
- The new `tests/iteration64.test.ts` (5 tests) covers:
  - the floor against SE's formula;
  - rounds that grow only the noisy peoples and stop at the cap;
  - a compare's floor counting both sides;
  - the cache key moving with each input;
  - the report's met / not met / at the cap.
- A 30-day wide bar with the target at 1 % ran two rounds to the cap of 3, named both peoples "at the cap", and left no
  worktree. Its rerun took the ref side from the cache: identical report, half the time.
- The working tree's cache: a committed tree's second run came wholly from the cache.
- `scripts/playtest63.mjs` with `DAYS=10`: no errors, no missing sprites, a clean dawn and dusk. No game code changed.

### 4.96 Drawn art: the Lantern of Vell, the temple and the citizens (iteration 65)

NEXT_STEPS item 1, "hand-made art beyond the paintings". No painting in `inspirations/` covers these three, and the user
chose that they be drawn by hand in code (like `drawRing`, `drawSpire` and `drawGate`). A painting uploaded later still
replaces any of them through `npm run art`, since a manifest entry wins over the procedural atlas. Art only.

**The method** (`src/render/drawn.ts`).
- A 3×3 footprint is a 24×24 unit square. A point (x, y, z) projects to (49 + 2x − 2y, ay + 48 − x − y − z), with the
  anchor at the footprint's back ground corner (49, ay), as in every 3×3 painter.
- Boxes, gables and slopes are filled as projected polygons, drawn back to front.
- Round things (the tower, the gallery, the lantern room, the drum and the domes) are solids of revolution: ellipse
  slices painted bottom up, so the highest slice covering a pixel wins.
- The set's rules hold:
  - the light comes from the right (a left face takes the darker tone, as in `WALLS`);
  - windows are `windowDark` by day and `windowLit` on the glow layer;
  - one outline closes each sprite.

**The Lantern of Vell** (was a stone cube with a pyramid roof; 98×119 → 98×169):
- **The base:** a two-step plinth of flagged stone.
- **The tower:** coursed, tapering from a radius of 15 to 10 over 78 pixels, lit on its right. It has a band of
  leystone runes a third of the way up, and six slit windows climbing in a spiral.
- **The top:**
  - a corbelled gallery with an iron rail;
  - a lantern room of ley-glass between mullions, with the great crystal inside: a halo and two beam stubs on the glow
    layer;
  - a copper cap with a verdigris rim, a gilded finial and a pennant.
- **At its foot:** the keeper's whitewashed house with a slate lean-to, a door and a lit window, and two ley lamps at
  the stair.
- It is the tallest 3×3 sprite, as the wonder of the last gate should be.

**The temple** (was a box under a dome that covered the whole roof):
- **Stage 0** (98×97):
  - a flagged plinth with three steps;
  - a whitewashed nave with stone buttresses and three arched windows on its long wall;
  - a slate roof with a lit far slope and a lead ridge;
  - the front gable with a rose window;
  - a portico of four columns under an entablature and a pediment with a gilded sun, and two ley lamps.
- **Stage 1** (98×113) adds a bell tower at the back corner, with a bronze bell in an open belfry and a pyramid cap, and
  banners on the outer columns.
- **Stage 2** (98×121) adds a dome over the crossing: a whitewashed drum with four ley-glass windows, a copper-green dome
  and a gilded lantern.
- The stages follow `STAKE_STAGE_AT`, as the Stake's do (stage 1 from milestone 3, stage 2 from milestone 6).

**The citizens** (`citizen()`, the same 8×12 canvas and anchor (4, 12)):
- two-tone cloth with a shaded left column and a lit shoulder;
- a belt, or a gilt sash on every third variant, and an apron on some;
- a face shaded on the left, and hair or a hood;
- arms that swing against the stride (the forward arm a row longer, its hand showing);
- grey hose and brown boots, the lifted foot a row short.

The Grimmen keep their grey skin and wider bone helm, and the Tallowkin their candle eyes on the glow layer. Builders and
walkers are drawn on this body and keep every prop (the Watch's rod, the pilgrim's lit staff, the lamplighter's pole).

**Judged by eye.**
- `scripts/playtest65.mjs` writes before and after sheets of the four buildings at 3× and the folk at 8×; the before
  sheet comes from a build of the previous main on port 4174.
- It also shoots, in a town painted on seed 65:
  - the temple at each stage at 3×;
  - the Lantern by day and night at 2×, its crystal and windows lit;
  - the temple by night;
  - a temple mirrored to a road on its left;
  - a street of folk at 4× beside the painted houses.
- The drawn buildings are cleaner and flatter than the paintings around them, but share their outline, their palette and
  their light, and read as one set at 2× and 3×.

**Verified.**
- `npx tsc --noEmit -p .`, 68 test files with 425 tests, and `npm run build`.
- The new `tests/iteration65.test.ts` (7 tests) covers:
  - the anchors, and the front corner on the canvas;
  - the temple growing by stage;
  - the Lantern as the tallest 3×3, with its lantern room glowing, and the temple's glow;
  - every citizen frame at 8×12 on (4, 12), the four frames differing;
  - the Tallowkin's eyes and the Grimmen's helm;
  - the walkers' props;
  - each drawn sprite closed by its outline.
- The playtest: no errors, no missing sprites, a clean dawn and dusk, and the left-road temple mirrored.
- **The control seed** (`npx tsx scripts/balance.ts 42 150`) prints the same `json:` line as iteration 63's code
  (Vellish 42: 2,130 folk). The sim did not move.

### 4.97 Keyboard focus: the toolbar, the panels and the dialogs (iteration 66)

NEXT_STEPS item 1, "keyboard focus order for the toolbar and panels". The labels were done (every titled button had an
`aria-label`), but focus was handled nowhere:
- **Tab was captured.** The Info views binding swallowed it, so focus could not move at all.
- **Shortcuts fired whatever had focus.** Space on a focused button both pressed it and paused, the arrows panned the
  map from inside a panel, and `w` both panned and toggled the Weave.
- **The dialogs** were `aria-modal` but never took focus or gave it back.
- **The toolbar** cost one Tab per button.
- **No focus ring** showed where the keyboard was.

UI only.

**Where a shortcut fires** (`src/ui/focus.ts`, `shortcutTarget`).
- The game's shortcuts and the map's keys fire only with focus on the page or the map canvas.
- A focused control keeps its own keys: Space and Enter press, the arrows move, a `select` selects.
- A dialog keeps every key but Escape.
- Escape still closes the open panels, now the Edicts, the Wyrms and the dev tools too, else it cancels the tool.
- The camera pans only from keys pressed on the page or the map.

**Tab is the browser's again.**
- Info views moved to `V` (the overlays use 1–5, g, o, i, w and m).
- A saved key table that still binds Tab is moved to `V` when the settings load (`migrateKeys`).
- The key menu refuses Tab and F6 as bindings and says why. Its rows are buttons now.

**The order.**
- Tab follows the screen:
  - a *Skip to the map* link, shown only while focused;
  - the top bar: speed, then the panel buttons;
  - the toolbar: one stop for the categories, one for the items, then Select, Bulldoze and Undo;
  - the Ledger, the building panel (moved after the Ledger in the page), the demand's ?, the minimap, and the map last.
- The map canvas moved after the UI in the page (the UI's z-index keeps it on top) and is labelled with its keys.
- **F6 / Shift+F6** move between the regions (`REGIONS`: the top bar, the toolbar, the Ledger, the building panel, the
  Info views, the minimap and the map), skipping hidden ones.

**The toolbar** (WAI-ARIA tabs and roving focus).
- The categories are a `tablist`: Left/Right (and Home/End) move between tabs and open each, and `aria-selected`
  follows.
- The items are a group with one tab stop: the arrows move through them (Up/Down by a row), and Enter picks the tool.
  `aria-pressed` marks the active tool, `aria-disabled` a locked one, and each item's label carries its price.
- A rebuilt item row keeps the focused item's place.

**Dialogs.**
- One watcher (a `MutationObserver` on every `.modal`'s `hidden` class) handles them all; no `toggleX` was edited.
  - **On open:** a dialog takes focus on its first control (a tale on its first choice).
  - **While open:** Tab and Shift+Tab cycle inside it.
  - **On close:** focus returns to the control that opened it.
- **Panels that rebuild their contents** (the Budget every refresh, the building panel, a tale's next page) would drop
  focus to the page. `keepFocusThroughRebuilds` moves it to the replacement: the same id, else the same label in the
  same panel, else the panel's first control. The playtest found this: the Budget lost focus the frame after it opened.

**The ring.**
- `:focus-visible` draws a 2px gold outline with a soft glow on buttons, selects, inputs, links and `[tabindex]`. The
  map gets a 3px gold frame drawn inside its edge.
- A mouse click shows no ring.

**The help** names Tab and Shift+Tab, F6, the toolbar's arrows, Enter, Escape, the skip link and `V`.

**Verified.**
- `npx tsc --noEmit -p .`, 69 test files with 431 tests, and `npm run build`.
- The new `tests/iteration66.test.ts` (6 tests) covers:
  - `shortcutTarget` for the page, the map, the clock canvas and the controls;
  - `nextRegion` forward, back, wrapping and skipping;
  - the default keys free of Tab and F6;
  - the migration;
  - no clashes in the key table.
- `scripts/playtest66.mjs` works the game by keyboard in Chromium:
  - the Tab order as above (and Tab never opens the Info views);
  - Space on the 1× button unpauses and does not toggle the pause;
  - Right on the tabs moves Roads to Zones and the camera stays;
  - Tab into the items, Right, and Enter picks the Market zone;
  - Enter on Budget focuses its first control, 30 Tabs stay inside, and Escape closes it and returns to the Budget
    button;
  - a tale lands on its first choice;
  - F6 cycles the top bar → the toolbar → the Ledger → the minimap → the map (the hidden panels skipped);
  - on the map, the arrows pan and `V` opens the Info views; on a button they do not pan;
  - screenshots of the ring on the skip link, a top-bar button, a toolbar tab and item, inside the Budget, a tale and
    the map;
  - no errors.
- **The control seed** (`npx tsx scripts/balance.ts 42 150`) is identical to iteration 63's `json:` line.

### 4.98 Replays: one command layer, a replay file and a verifier (iteration 67)

NEXT_STEPS item 1, the last on the list. The sim was deterministic, but the player changed it by about forty paths:
- the map tools in `tools.ts`;
- some twenty-five host methods in `main.ts`, some of which wrote fields directly;
- a direct write in `ui.ts`.

Each path ran its own `recomputeAll` and, for some, its own road-path bump. A log of what the player did could not be
replayed, because nothing recorded it in one place.

**The command layer** (`src/sim/commands.ts`).
- Every change the player makes is one op, `exec(op, ...args)`, logged as `{ t: state.tick, op, args }`.
- **The ops:**
  - the map: `bulldoze`, `terraform`, `dust`, `build`, `gate`, `road`, `zone`, `district`, `wall`;
  - the undo pair: `snap` (the snapshot a map action takes first) and `undo`;
  - the panels: `tax`, `edict`, `loan`, `repay`, `sector`, `deepen`, `daughter`, `quarter`, `guild`, `lesson`,
    `priority`, `renameDistrict`, `training`, `role`, `nest`, `cradle`, `sluice`, `golem`, `rain`, `vent`, `replate`,
    `burnWyrmfire`, `quarry`;
  - `tale` (the choice and the slider);
  - `dev`, with the tile the camera pointed at resolved to x, y.
- Each op does what its call site did, moved and not rewritten: the same sim call, its `recomputeAll` when it took, and
  its `bumpRoadVersion` for bulldoze, build, gate, road and the daughter charter.
- A drag stays one command per tile, as it was one action per tile.
- The undo stack (12 deep) lives in the runner. A replay retakes the snapshots at the same ticks, so an undo restores the
  same state. An undo does not restore the RNG, and neither does its replay.
- `tools.ts` and `main.ts` send everything through `exec`. The lodge's quarry, the last direct write in `ui.ts`, became
  the `quarry` op.

**Three determinism fixes the inventory found.**
- **The dragon-aura cache** (`weave.ts`) was keyed by the tick window and the dragon count. A role changed inside a
  50-tick window left the sim reading auras the UI had filled. The key now hashes each dragon's stage, role, target,
  cradle and line.
- **The daughter charter** builds roads and now bumps the path cache.
- **The daily challenge** takes its date as a parameter, so its replay uses the recorded date and not today's.

**The replay file.**
- The header `{ seed, name, scenario, faction, challenge? }` founds the same charter.
- `build` is the git short sha, injected by Vite (`__BUILD__`, `src/core/build.ts`).
- Then the commands.
- A checkpoint at each day's turn: `[day, rngState, treasury, population]`. The RNG state alone catches nearly any
  divergence.
- `endTick`, and the checksum (FNV-1a of `serialize(state)`).
- A log begins with a new charter. A charter loaded from a save records nothing, since a rebuilt save is not the live
  state bit for bit. *Export replay* then says that a replay begins with a new charter.

**In the game.**
- **Export:** Menu → *Export replay* downloads `<city>_day<N>.wardlight-replay.json`.
- **Watching:**
  - title → *Watch a replay* founds the header's charter again;
  - before each tick, the loop feeds every command stamped with that tick, in order;
  - a toast warns when the file came from another build.
- **During a replay:**
  - a *REPLAY* badge sits in the top bar;
  - the camera, the selection and the panels can be read, but every command is refused;
  - the autosave is off, so a replay never writes over the player's charter;
  - pause and speed work, and *Skip to end* runs up to 1,500 ticks a frame.
- **At the end,** a toast says *The replay matches its recording* with the checksum, or names the first day whose
  checkpoint differs. A tale left waiting with no answer in the log ends the replay as stuck.

**The verifier.** `npx tsx scripts/replay.ts <file>` plays the file headless and prints MATCH and the checksum, or
DIVERGED and the first day. It exits 1 on a divergence. A player's file reproduces their charter on any checkout of the
same build, so a bug report can be a file.

**Found by the playtest:** Escape did nothing while a dialog's slider or checkbox had focus (the field returned before
the key reached the handler). Escape now passes through, and the other keys stay with the field.

**Verified.**
- `npx tsc --noEmit -p .`, 70 test files with 437 tests, and `npm run build`.
- **`tests/iteration67.test.ts`** (6 tests):
  - a twelve-day Vellish charter played through the runner (roads, zones, a Well drawing from the main stream, a
    bulldoze drag and its undo, a tax, a lesson, a priority, an edict, a loan, a rename, tales answered as they come)
    replays to the same `serialize` bit for bit, with every checkpoint equal and the verifier saying match;
  - the same holds for a daily challenge with a fixed date, a Grimmen charter and a Veshari charter;
  - a dropped `build` command makes the verifier report a divergence and its day;
  - a charter from a save logs nothing and refuses to export;
  - every op runs on a fresh charter without throwing;
  - the auras follow a role change inside their window.
- **`scripts/playtest67.mjs`** plays 30 days in Chromium through the real UI:
  - roads and zones dragged with the mouse, a Well and a Ley Spire from the toolbar, a bulldoze drag undone by Ctrl+Z,
    the Hearth tithe moved by the arrow keys on the Budget's slider, tales answered by click;
  - the speed buttons at 1× and 3×, with the speed raised past 3× in stretches only to save wall time;
  - Menu → *Export replay* (25 commands, 13 folk on day 30);
  - `scripts/replay.ts` on the download says MATCH;
  - title → *Watch a replay* on the same file shows the badge; a road dragged during the replay changes nothing;
  - *Skip to end* ends on *The replay matches its recording* with the same checksum;
  - Escape closes the Budget from its slider; no errors.
- **Not covered:** no edict was open at the Founding Stake, so the playtest set none (the unit test covers the op), and
  the other-build warning was not exercised.
- **The balance table** (`scripts/table.ts --compare origin/main`, 4 peoples × 3 seeds × 2 draws, 48 runs) is the same
  run for run: Δ +0 for every people (Vellish 1,495, Grimmen 1,557, Veshari 2,259, Tallowkin 1,849), with the same gates
  and depots. The wide bar was not run because nothing moved. The aura key was also checked bit for bit against
  iteration 63's Vellish 42 and Veshari 42. The bot drives the sim directly, not through the runner, so the table holds
  the sim, and the tests and playtest hold the commands.
- **The control seed** (`npx tsx scripts/balance.ts 42 150`) is identical to iteration 63's `json:` line in all 13 fields: 2,130
  folk, the Burgh on day 41.

### 4.99 The plan's gaps written down (iteration 68)

Iteration 67 closed the last NEXT_STEPS item. The user asked whether everything planned was in the game. It was not.
NEXT_STEPS had carried only the work in hand, and nobody had read this document against the code since. An audit read
the planning sections (§7, §8, §11, §13, §14, §16 and AUDIT.md) against `src/` and checked each claim by grep.

Docs only: no code, test or art changed.

**Planned and absent:**
- the swamp biome and the Patagoi Atoll (no marsh `Terrain`, no Drainage edict, no atoll scenario);
- the Great Gate and the Heart of Belregi;
- the Fen-Nex and the Belerial as peoples (`FactionId` holds four);
- golem haulers, and marsh-wyrms as a creature (both built since: iterations 72 and 86);
- the two failure states of §8.5;
- "the eggs go grey", and the Sky-Dock's wyvern;
- hatchling riders;
- sextons at the brawl, and the duel flown by the wyvern agent.

**Partly built:**
- **Strider mounts** are a 60-day Watch bonus, not couriers.
- **The Wandering Merchant's memory** is flavour text.
- **Tide eggs** came from a Veshari tale only, not a marsh-wyrm nest, until iteration 86 (§4.117) gave them the nest by a Quay.
- **AUDIT B40** (markets and the road tier) is still open.

**Stale notes, fixed:**
- **§7:** M8 read "phase 6 in progress", but §13.12 closed it.
- **§11:** items 1, 2 and 4 lacked their ✅. Each now says what part is missing.
- **§14.2** still listed the Tallowkin as not built.
- **AUDIT.md:** the Part 1 and Part 2 headings lacked ✅. B33 was fixed in iteration 47 (§4.78: the Stone Ward holds,
  its sexton cuts) and B42 in iteration 53 (§4.84: Tide dragons swim barges), but both still read "M14".

**Where the gaps went.**
- **§17** holds the work:
  - three milestones with their parts: M17 the marsh and the atoll (3 parts), M18 the Fen-Nex (2), and M19 the
    Belerial (3, the first being striders for every people);
  - five single items: the Great Gate; two ways to lose; golem haulers; loose ends; markets and the road.
  - Every unbuilt promise in §8, §11, §13.13 and §14.2 now points to its place in §17.
- **NEXT_STEPS** lists them in the user's order: the single items, then M17, M18 and M19.
- **Dropped on the record (§17.5):** same-line nesting, which became cross-line breeding.

**Verified:**
- the claims by grep against `src/`, for example `FactionId` (`src/data/factions.ts`), and no `great gate`,
  `drainage` or `atoll` anywhere;
- `npx tsc --noEmit -p .` and `npm run build`, unchanged.

There was no playtest and no balance run, since nothing executable changed.

### 4.100 The Great Gate and the Heart of Belregi (iteration 69)

§17.4 A, the first of the single items. The Belregi and Uzulim gates have stood in the wall since iteration 9 (§11 item
1). The wonder and its tales did not exist.

**The Great Gate** (`greatgate`, `src/sim/gate.ts`):
- **What it is:** a 3×3 wonder of the Burgh. Cost 16,000, upkeep 120, mana 12. One per city.
- **Where it stands:** its footprint must touch a Belregi gate tile (wall value 2), and a corner counts (`nearGate`,
  `touchesBelregiGate`).
  - A gate in the wall has wall on two sides and road on the other two, so no 3×3 can touch it edge to edge. The
    gatehouse stands in the angle between the wall and the road.
  - It blocks hounds like every building, and the road keeps passing through the gate tile.
- **While it stands lit:**
  - **Its own ward:** 20 tiles at full strength (`GREAT_GATE_REACH`), 30 with the Heart set.
  - **The gates' reach:** every Belregi gate's faith and ward reach 12 tiles instead of 8 (16 with the Heart). This is
    `belregiReach`, read where `services.ts` lays the gates' coverage.
  - **Pilgrims:** three walk from it (the pilgrim walker's `from` gains `greatgate`) to a temple, shrine or the Stake
    within 30, painting faith on the roads.
  - **Pilgrims of the Pass:** on the 15th of each season (`dailyGatePilgrims`), 12 lodge in empty homes and pay 40
    crowns of alms each. Twice as many come while the Guardians keep the Heart, and none once it is sold. They are
    counted in the Annals (`gatePilgrims`, `gateAlms`).
  - No roll anywhere: the Gate never touches the rng.
- **The sprite** is drawn in code (`drawGreatGate` in `drawn.ts`, the §4.96 kit), since `inspirations/` holds no gate:
  - four square towers of Belregi Stone (pale grey with blue in it, the left faces darker), with slate caps and gold
    finials;
  - curtain walls between them and a parapet over a deep round arch on the right face, which the facing mirror turns
    to the road;
  - blue rune bands, lit slits, two ley lamps, and the Guardians' banner;
  - the Heart of Belregi as a glowing keystone.
  - It casts a wonder's night light (radius 100, ley blue).
  - A first draft drew two long halls with dense coursing, and read as sheds at 3×. The towers were made square and
    the coursing lightened.

**The Heart of Belregi** (`HEART_EVENTS`, `maybeFireHeart`, `state.heart`):
- **How the tales fire:** on their own terms, called beside `maybeFireWyrm`. They are not in the storyteller's pool and
  draw nothing, so a city without a Great Gate is untouched.
- **The state:** `state.heart` is `{ held, step, day }`. An old save loads as `none` from the fresh game's fill.
- **The record of the gates** (`gateRecord`) is read from earlier answers and from the wall. The tales recite it, and
  its sum is the Pass's trust:
  - **Raises trust:**
    - the pilgrims of Aume welcomed;
    - their shrine raised;
    - the Lantern Fair opened;
    - the egg poachers arrested at the gate;
    - more Belregi gates than Uzulim.
  - **Lowers trust:**
    - the shrine refused;
    - the gates kept shut on the Fair;
    - a poached egg bought;
    - more Uzulim gates than Belregi.
1. **The High Warden of Belregi** comes ten days after the Gate first stands lit. She recites the record and asks
   where the Heart goes.
   - **Set it in the arch:** the Gate wards 30 tiles and every Belregi gate 16.
   - **Let the Guardians keep it:** twice the pilgrims of the Pass, and the Crown's favour +5.
   - **Sell it to the Crown's assessor:** +6,000 crowns and favour +10. The Pass closes: no more pilgrims, and the Gate
     wards at six tenths. The tales end there.
2. **The crimson obelisks**, twenty days on, only if the Heart was set and an Uzulim gate stands.
   - **Refuse them:** unrest +5 % for 15 days.
   - **Share the Heart:** the Gate wards 20 again and the Belregi gates 12, but the Uzulim gates stop adding unrest
     while the Great Gate stands.
   - **Pay them off:** 2,500 crowns.
   - A Heart set with no Uzulim gate skips this tale, and so does a Heart the Guardians keep.
3. **The Heart wakes** in the Hush, twenty days or more after the last step, and grants one favour:
   - the Gloam cleared within 25 tiles of the Gate;
   - rain for 10 days and goods +20 % for 30;
   - or nothing asked: happiness +3 for 60 days, and the city named a friend of the Pass.
   - A trust under zero makes the Heart cold, and it gives half. The text says whether it is warm or cold, and the
     Gate's panel shows the record's sum before the tale comes.

**Where it shows:**
- two Ledger tasks: *Raise the Great Gate* (2,000 crowns) and *Answer the High Warden* (1,000), with Show me;
- two Annals rows;
- the Gate's panel: the Heart, the reaches, the next pilgrims, the record;
- the help, the Belregi gate's tooltip, its reach ring (`influenceRadius` reads `greatGateReach`), and the README.

**The bot** does not raise the Gate. No bot city meets the tales, so the balance table should show no change. Teaching
the bot a wonder it would buy only after walls is a separate decision. Walls are rare in its cities: Vellish 43 alone
builds them, and only where hounds came.

**Verified:**
- `npx tsc --noEmit -p .`, 71 test files with 451 tests, and `npm run build`.
- **`tests/iteration69.test.ts`** (14 tests):
  - **placement:** beside a Belregi gate yes; beside the wall without a gate, or beside an Uzulim gate, no;
  - **reaches:**
    - the Gate's ward reaches 20, then 30 with the Heart, is weaker once the Heart is sold, and is none when dark;
    - a Belregi gate reaches 8, then 12, then 16;
  - **pilgrims:** three walkers lit and none dark; the 15th lodges 12 and pays their alms, 24 come under the Guardians,
    and none once the Heart is sold;
  - **the record:** its lines and the trust;
  - **the tales:**
    - none fires without a Gate, and none sits in the storyteller's pool;
    - the Warden comes on the tenth lit day and recites the pilgrims;
    - the obelisks come with an Uzulim gate, and sharing works;
    - with no Uzulim gate the obelisks are skipped, the Heart wakes in the Hush, and asking for the Gloam clears it;
    - under the Guardians the word comes from the Pass;
    - a cold Heart gives +2, not +3;
    - selling pays 6,000 and ends the tales;
  - **saves:** a save without the Heart loads as none, and the Heart round-trips;
  - **the sprite:** it exists with its glow.
- **`scripts/playtest69.mjs`** in Chromium:
  - **the town:** a walled town with a Belregi and an Uzulim gate, lit by real spires (supply 330, demand 46);
  - **placement:**
    - the Gate placed through `placeBuilding`;
    - refused beside the wall with no gate ("Must stand beside a Belregi gate…");
    - a second refused ("Only one may be raised");
  - **coverage:**
    - a Belregi gate's faith at 11 tiles is 34/255 and at 13 is 0;
    - the Gate's ward at 18 tiles is 117/255 and at 23 is 0;
  - **the tales:**
    - the Warden recites "you took in the pilgrims of Aume and you raised them a shrine… you kept your gates shut on the
      Lantern Fair";
    - setting the Heart brings the obelisks;
    - sharing it brings the waking on day 100 of the Hush;
  - **the days:** three days of ticks lodge 12 pilgrims of the Pass for 480 crowns, with 3 pilgrim walkers out, and both
    Ledger tasks paid;
  - **shots:**
    - the Gate by day and night at 3×, selected with its ring and panel at 2×, and mirrored to a road on its left;
    - the three tales, and a sprite sheet at 3× and 8× beside the Belregi gate, the Lantern and the Wyrm-Court;
  - no errors, no missing sprite.
- **The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`, run from a worktree of the sim's
  commit) **stopped at its two-hour limit and was not finished.**
  - **How far it got:** 124 runs, round 1's 96 and 28 of round 2's 36.
  - **What it found:** every one of the 62 pairs it finished is identical, field by field: folk, every gate and its
    day, treasury, loan, depot day, the road's and the caravan's crowns. Δ is +0 in every pair, for every people:

    | people | pairs | mean folk (both sides) | milestones reached |
    |---|---|---|---|
    | Vellish | 18 (6 seeds × 3 draws) | 1,821 | Burgh 10, Free City 7, Beacon 1 |
    | Grimmen | 12 (6 × 2) | 1,383 | 5th 2, 6th 8, 8th 2 |
    | Veshari | 18 (6 × 3) | 2,395 | 7th 6, 8th 12 |
    | Tallowkin | 14 (6 seeds, 2–3 draws) | 1,825 | 5th 1, 6th 4, 7th 7, 8th 2 |

  - **The floors:** the bar's draw rounds were adding runs toward each people's floor (a tenth of its folk). That floor
    is **not met** for the three peoples still in round 2.
  - **Why it was not resumed:** the floor measures the noise of a Δ, and here every paired run is equal bit for bit.
    The run cache lived in the worktree, which was removed after the merge, so it is gone (corrected in iteration 70).
  - **The commit:** the runs used the sim's first commit. The later commits change the waking tale's wording, the
    sprite and the docs, none of which a bot run reaches.

### 4.101 Two ways to lose (iteration 70)

§17.4 B (§8.5). The game had three losses: the Gloam at the founding node, the Long Night of forty restless, and the
Crown's revocation. §8.5 promised two more, and every loss now names its cause.

**The probe first.** Before the plan, twelve bot cities (four peoples × seeds 42–44, 150 days) were run with a counter
of the nights hounds reached an occupied hearth's door in the Hush.
- **The wyrm** never woke: the bot keeps spires off its node.
- **The hounds** reached doors in five cities:
  - Veshari 43: one march on all 30 Hush nights, 1,995 visits, and the city still ended at 2,742 folk;
  - Grimmen 42 on 15 nights, Grimmen 44 on 9, Grimmen 43 on 6, Vellish 44 on 5.
- **What that ruled out:** hounds harry a city's Gloam edge for weeks without hurting it. A rule that emptied a whole
  district after N hound nights would have gutted healthy cities for edge harassment. So the rule works per home.

**The valley belongs to the wyrm** (`wyrm.ts`):
- **The count:** `wyrm.starved` counts refusals in a row, and goods short of half count as a refusal. A tribute paid
  in crowns or goods, the binding, or the wyrm's death resets it. The Annals keep the most refusals in a row.
- **The warnings:**
  - the first refusal: "a second would be unwise, and a third would be the last";
  - the second: a red Chronicle line, and an Advisor line while it stands;
  - the next asking is titled *The wyrm's last asking*, and its Refuse choice says the game ends.
- **The razing:** the third refusal in a row (`WYRM_STARVE_LIMIT`) sends a razing flight (`load = 2`) along the flyover's
  path, which already flew to the Founding Stake first.
  - On arrival the Stake burns to ruin and the charter ends: *"The valley belongs to the wyrm…"*.
  - A great wyrm of the city's own (a stage-4 dragon) meets the flight above the Stake instead. It turns into an
    ordinary hostile flyover, and the count starts again.
  - A refusal while a flight is already aloft turns that flight toward the Stake.
- **The bot's tale policy** scores `wyrm.razing` like a game over (`worth`), so a bot city pays the third time. No bot
  city wakes the wyrm today.

**The Long Night comes early** (`src/sim/hounds.ts`):
- **A night at the door:** in the Hush, a hound reaching an occupied hearth (the existing harass branch) counts a night
  for that home.
  - The day is the night's key, since the sim's day turns at mid-morning and a whole night lies inside one day.
  - The hounds' target filter already skips warded homes and lit, watched ones, so only dark, unwarded homes can be
    hounded.
- **Flight:** three nights (`FLEE_NIGHTS`) and the home's folk flee. It takes no move-ins until the Thaw (`b.fled`).
- **A unit emptied:** half the homes of a unit fled (`EMPTY_SHARE`, at least 4 homes) empties it.
  - A unit is a painted district, or, for homes in none, their march (`MARCH_UNIT + sector`). A city that never paints
    a district is not exempt.
  - The third unit emptied in one Hush (`LONG_NIGHT_UNITS`) ends the charter, naming the three.
- **The warnings:**
  - the Chronicle at a unit's first home on its second night;
  - a red line at a quarter fled;
  - each emptied unit says how many more the Hush can take;
  - the Advisor keeps the count.
- **The Thaw** lets the fled homes be lived in again and clears the count (`dailyHush`).
- **No roll is added:** the hounds' paths decide it all, and a city whose hounds never reach a door in the Hush is
  bit-identical.
- **What the player sees:**
  - a home's panel ("at the door 2 of 3 nights this Hush", or fled until the Thaw);
  - the Districts view's line per district ("n fled the hounds", "emptied by the hounds");
  - two Annals rows, and the help.

**Every loss names its cause.** `state.lostTo` is set by all five losses (`gloam`, `restless`, `crown`, `wyrm`, `hounds`).
The game-over screen takes its title from it, and under the old summary line it gives the cause's numbers: the refusals
and the Stake's day, or the three districts and the homes fled.

**Verified:**
- `npx tsc --noEmit -p .`, 72 test files with 462 tests, and `npm run build`.
- **`tests/iteration70.test.ts`** (11 tests):
  - **The wyrm:**
    - the warnings come at one and two refusals;
    - the Advisor speaks at two;
    - a tribute paid resets the count;
    - the last asking's title and choice text;
    - the third refusal sets `razing`, `worth` sees it at once, and the flight lands, ruins the Stake and ends the game;
    - goods short of half count as a refusal;
    - a great wyrm turns the razing back;
    - the bot's worth prefers paying the third time.
  - **The hounds:**
    - a night counts once;
    - three nights make a home flee;
    - nothing counts outside the Hush or at an empty home;
    - marches stand in for unpainted homes;
    - half fled empties a unit and the Advisor speaks;
    - three units end the game;
    - the Thaw clears it.
  - **The Annals and saves:** the Annals hold the new counters, and old saves load the defaults.
- **`scripts/playtest70.mjs`** in Chromium takes both charters to their end:
  - **The wyrm:**
    - the last asking's dialog;
    - the wyrm in flight over the town 144 ticks after the refusal;
    - the Stake in ruin and the game-over screen titled *The valley belongs to the wyrm*, with "Refusals in a row: 3".
  - **The hounds:**
    - a Hush town with three painted districts of four homes, the hounds driven through the sim's `houndAtDoor`;
    - a home's panel at two nights;
    - the Districts view with Hearthside "emptied by the hounds" and the Advisor's warning;
    - the third district emptied, and the game-over screen titled *The Long Night comes early*, naming Hearthside,
      Stillward and Spirefield;
  - the Annals rows, and no errors.
- **A quick check before the bar:** the four hounded cities, single runs on this commit against main.
  - **Grimmen 42:** unchanged, 1,254 folk.
  - **Grimmen 43:** 764 (763).
  - **Grimmen 44:** 2,665 (2,606).
  - **Veshari 43:** 2,556 (2,742).
  - None lost its charter.
- **The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main --peoples <one>`, one people per job from
  a worktree of the sim's commit, about 4½ hours in all). No bot city lost its charter on either side.

  | people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
  |---|---|---|---|---|---|---|---|
  | Vellish | 6 × 7 | 1,766 | 1,774 | −8 (−0.4 %) | 164 (9.3 %) | met | within the noise |
  | Grimmen | 6 × 2 | 1,408 | 1,383 | +25 (+1.8 %) | 115 (8.2 %) | met | within the noise |
  | Veshari | 6 × 3 | 2,352 | 2,395 | −43 (−1.8 %) | 228 (9.6 %) | met | within the noise |
  | Tallowkin | 6 × 8 | 1,913 | 1,914 | −1 (−0.1 %) | 226 (11.8 %) | **not met: at the cap of 8 draws** | within the noise |

  - **The gates** are the same, run for run, but for one run each:
    - Vellish reach the Free City in 19 of 42 runs (main 20) and the Beacon in 1 (main 2);
    - the Tallowkin raise the Hall of Wicks in 32 of 48 (main 33).
  - **The largest single change** is Veshari 43's first draw, 2,556 against 2,742: one march hounded all Hush long
    lost the homes it besieged.
  - **The Tallowkin's floor** stays above a tenth of their folk at eight draws a seed, as in iteration 64; it is not met.

### 4.102 A faster balance bar (iteration 71)

Tooling only, at the user's request after iteration 70's bar took about 4½ hours. What the bar measures is unchanged; it
runs fewer runs and uses every core.

**The waste.** Half of every bar re-ran origin/main. Those runs are deterministic, and are exactly the previous iteration's
branch runs. They were thrown away for two reasons:
- the cache was keyed by commit, so any commit moved it;
- it lived in `shots/` and in temporary worktrees, so it died with the container.

**The cache, keyed by what a run reads** (`scripts/table.ts`, `scripts/tableStats.ts`):
- **The sim key** is a hash of every file under `src/sim`, `src/data` and `src/core`, and the node major version. Those
  are the only folders a balance run reaches; a test holds the imports to them.
  - For a ref it comes from `git ls-tree`, and for the working tree from `git hash-object` of the files as they are. So
    an uncommitted tree is cached too, and the old "dirty trees are not cached" rule is gone.
  - The runner's hash (`balance.ts`, `rolls.ts`) stays in the key.
- **Where it lives:** the runs live in `balance/cache/<sim>-<runner>.json`, one file per sim version (about 50 KB for a
  four-people bar), committed with the iteration.
  - Each finished run is written at once, so a stopped table resumes.
  - The four newest files are kept, and older ones are dropped by the table.
- **The workflow:**
  - After a merge, main's sim key is the branch's, so the next bar runs only the new branch side.
  - A docs-, art- or UI-only change has the same key on both sides, and its whole bar comes from the cache.
  - The table says so when both sides share a sim.
- **The import:** `--import-cache <dir> --ref <sha>` brought in iteration 70's 120 branch runs from the old commit-keyed
  files. They are today's main, sim key `92ea7c143717`.

**All four cores:** `--jobs` now defaults to every core rather than all but one, about a third more throughput.

**Verified:**
- `npx tsc --noEmit -p .`, 73 test files with 468 tests, and `npm run build`.
- **`tests/iteration71.test.ts`** (6 tests):
  - the key moves with a file's blob, a new file and the node major version, and not with the listing's order;
  - the runs' imports stay inside the keyed folders;
  - git's tree and the files on disk give the same key;
  - the cache key's shape;
  - pruning keeps the four newest and any file in use;
  - the committed files parse.
- **`tests/iteration64.test.ts`'s** cache test now keys by the sim.
- **The end-to-end bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`) on this branch took **5 seconds**,
  with all 240 runs from the cache.
  - It reproduces §4.101's branch means: Vellish 1,766, Grimmen 1,408, Veshari 2,352, Tallowkin 1,913.
  - The same bar measured in §4.101 took about 4½ hours.
  - Both sides now share the sim, so every pair is +0.
- **The dirty-tree path:** a comment edited in `src/sim/hounds.ts` gave a new key, and its run was computed. Reverting the
  edit brought the old key back, and the same run came from the cache. The probe's leftovers were removed.
- **The control seed** (`npx tsx scripts/balance.ts 42 150`): identical in every field to the cached iteration-70 run of
  Vellish 42: 2,130 folk, the Burgh on day 41. The runner is untouched.

What the saving will be on the next sim change: the main side (half the runs) comes from the cache, and the four cores add
about a third. The estimate is under half of today's time, so about 1½–2 hours for a bar like §4.101's. The next sim
change will show it.

### 4.103 Golem haulers (iteration 72)

NEXT_STEPS item 1, §17.4 C: the Golem Foundry's promise in §8.4, "slow, tireless carts that carry 30 and are not scared by
hounds, drawn as vehicles".

**What was missing.** A bound Concord Warden had three duties (labour, guard, works; §4.84). And hounds did nothing to carts:
the hound branch in `creatures.ts` stalks buildings only, so "not scared by hounds" had nothing to bite on. This iteration
adds both halves: the donkey carts balk at hounds, and the haulers do not.

**The hauler duty** (`beasts.ts`, `vehicles.ts`, `agents.ts`):
- A fourth duty, **haul**, set from the Foundry's or Forge-Temple's panel like *works*: to a Craft works within 20 of the
  foundry that touches a road. The warden stands at the works, in harness, and a **golem cart** (cart variant 6) appears at
  the works' door, homed there, carrying the warden's id.
- It runs the ordinary cart's trip: waits for stock at its works and carries it to the hungriest market.
  - **Thirty a trip:** it loads what the market has room for, up to 30 and never under 6 (a donkey loads 12 whatever the
    room, and the market's cap throws the rest away).
  - **Slow:** 0.45 against a donkey's 0.8; congestion slows it like any cart, and it counts 3 on the road.
  - **Tireless:** 20 ticks at the market instead of 150 and up to 450 more, and it looks in at its works every 60 ticks
    instead of 120. No roll where a donkey draws one: a city without haulers is bit-identical.
  - It drinks the foundry's 10 mana like every bound warden, and is not labour.
- **It ends** when the works is lost or loses its road (the warden walks back to labour, with a message), on any other
  duty, and in a surge: the maddened warden drops its cart where it stands. A daily sync holds the carts to the wardens in
  harness, and gives a warden whose cart was lost a new one.
- **Drawn as a vehicle:** a procedural sprite at the carts' scale (28 × 17: a citizen and a half), a blue-grey stone warden
  walking right with a stone-wheeled wagon behind, its eyes and rune glowing at night; the atlas's mirror when it heads
  left. The warden itself is not drawn while in harness.

**Donkeys balk at hounds** (`agents.ts`):
- A moving donkey cart (the painted stone and goods carts, variants 0–2) with a Gloam-hound within **4 tiles** stops for
  **60 ticks**, and tries again. The hounds abroad are gathered once a tick, only when one is out (30 at most, so at most
  30 distance checks a cart).
- Floating carts (no animal), barges (on the water) and golem haulers do not balk.
- The carters complain once a day, naming the road: "The carters' donkeys balk at Gloam-hounds on the road at (x,y) and
  will not go on. A Concord Warden in harness would."
- `stats.cartsBalked` and `stats.golemHauls` are new Annals rows; the Foundry's panel shows both.

**Verified:**
- `npx tsc --noEmit -p .`, 74 test files with 476 tests, and `npm run build`.
- **`tests/iteration72.test.ts`** (8 tests):
  - the duty spawns the cart at the works' door with the warden's id, replaces rather than doubles it, and labour removes
    it; a far works, a roadless works, no works and a wild warden are refused;
  - a hauler loads 30, delivers it (the works 15 lighter, the market 30 fuller, the stat counted), rests 20 ticks, and
    loads 8 for a market with room for 8;
  - a works in ruin sends the warden back to labour with a message; a cart lost from the list comes back on the daily
    sync; a surge drops it;
  - a donkey cart and a stone cart two tiles from a hound stand for 60 ticks and count 2 balks and one message; a hauler
    and a floating cart beside them move; a hound just past 4 tiles does not count; a street without hounds sets nothing;
  - the sprite: 28 wide, 17 tall, feet and wheels on the anchor row, a glow; the name by variant and the mirror by heading;
  - the catalog descs and the Annals rows;
  - a save keeps the warden in harness and its cart; an old save without the counters loads them at zero.
- **`scripts/playtest72.mjs`** in Chromium:
  - a street with four Craft works, four Markets and a Golem Foundry, the warden put in harness through the sim;
  - a real run: the first haul of 30 arrives at tick 794, the hauler rests 20 ticks, `golemHauls` 30;
  - the street at 2× and 4× with haulers heading both ways beside donkey carts;
  - midnight with two hounds by a donkey cart: it stands (timer 49 after 12 ticks, one balk, one message) while the
    hauler beside it walks on;
  - the Foundry panel with the haul options, the Hauled row and the hands of labour;
  - a dusk brightness probe (no dark frame); no errors, no missing sprites.
- **The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main` from a worktree of the committed sim,
  main's side from the cache). The bot stands no foundry, so **no bot city has a hauler**: the bar measures the balk rule
  alone.

  240 runs, 120 from the cache, in 66 minutes on four cores. No bot city lost its charter on either side.

  | people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
  |---|---|---|---|---|---|---|---|
  | Vellish | 6 × 7 | 1,771 | 1,766 | +5 (+0.3 %) | 171 (9.7 %) | met | within the noise |
  | Grimmen | 6 × 2 | 1,430 | 1,408 | +23 (+1.6 %) | 127 (9.0 %) | met | within the noise |
  | Veshari | 6 × 3 | 2,367 | 2,352 | +15 (+0.6 %) | 234 (9.9 %) | met | within the noise |
  | Tallowkin | 6 × 8 | 1,887 | 1,913 | −26 (−1.4 %) | 223 (11.7 %) | **not met: at the cap of 8 draws** | within the noise |
  | all | | 7,455 | 7,439 | +17 (+0.2 %) | 387 | | within the noise |

  - **The gates** move by a run or two, both ways: the Vellish reach the Free City in 22 of 42 runs (main 19) and the
    Beacon in 2 (main 1); the Grimmen the Deephold in 11 of 12 (main 10); the Veshari Vesh's Court in 17 of 18 (main 18)
    and the Sable Crown in 13 (main 12); the Tallowkin's Hall and Lantern of Wicks are the same, 32 and 12 of 48.
  - **The balk rule is small in the bot's cities.** Most runs are identical to the last folk (every run whose hounds never
    crossed a cart's road), and the rest part by a few goods on one night and drift from there. The largest single
    changes are Veshari 44's third draw (1,097 against 1,545: it stops at the Weirhold) and Vellish 46's first (1,370
    against 1,572), each one run of 42 or 18.
  - **The Tallowkin's floor** is 11.7 % of their folk at eight draws a seed, as in iterations 64 and 70: not met.
  - The branch's runs are in `balance/cache/1be0f4d08811-a8d78ee53ad3.json`, committed with the iteration.

### 4.104 The loose ends (iteration 73)

NEXT_STEPS item 1, §17.4 D: five small promises this document made and the code never kept, found by iteration 68's audit
(§4.99). Each is a rule the player can see and decide about; together they were one iteration. Sim changes: the wide bar.

**1. The eggs go grey** (§8.6; `wyrmcraft.ts` `dailyGreyEggs`, `hazards.ts` `gloamAtDoor`). A cradle with the Gloam at its
door is a hazard for its eggs:
- each day the Gloam stands there, the cradle's `grey` count rises; it resets when the Gloam is cut back;
- the first day warns, naming the cradle: cut it back, three days and they turn;
- on the third, every egg in it turns to the **Grey line** (the Ward-beast of §8.6; a crossed line or a trueblood's blood is
  lost with it), counted in `eggsGreyed`. Hatchlings and older are not touched. The cradle's panel shows the count and the
  days left, with a problem line; the Annals have the row.

**2. The Sky-Dock's wyvern** (§8.6; `vehicles.ts`, `events.ts` `wyvern_tale`):
- the Dock's panel has a button: send a wyvern instead of the airship, or the airship again (`airship.wyvern`, the
  `skydock` op). It names the wyvern that would go: a wyvern-stage dragon with no role or a courier's, at home;
- on day 3 of the season a wyvern takes up to **100** surplus goods (the airship 200) for **5 days** (the airship 10) and
  **no mana**: the Dock need not be lit. With none at home the airship goes instead, if the Dock is lit;
- the dragon is away (`voyage`: the day it returns): no agent, not fed and not hungry, no growth, no new role; the Wyrms
  panel says so. The Dock gone, it finds its own way home;
- home again it pays 1.6 × the season price like the airship, and one time in two **"The wyvern's return"**: a rival
  wardlight's egg (ember, bone, glim or storm for 3,000, needs a cradle), a challenge for the Ring (a bout fought at once,
  the champion's odds at three quarters and the purse doubled; no Ring or no champion, and it goes unanswered), or only
  the story (happiness +4 for 15 days). `fightBout` is the one bout, shared with the seasonal one and drawing the same
  rolls in the same order.

**3. Hatchling riders cross the map** (§8.2; `wyrmcraft.ts` `setRole`, `creatures.ts` `mountTick`). A fourth role for a
drake or older, **mount**, once a Wyrm-Court stands ("raised at the Court"): it flies the Drake Mews' rider's errands (the
nearest restless laid, the nearest fire doused) over the **whole map**, from its cradle, at the riders' speed, and comes
home. `riderRescues` counts it like a rider and `mountRescues` as its own. It is drawn as a rider in the sky layer with a
shadow beneath.

**4a. Sextons at the brawl** (§13.13; `guilds.ts`, `walkers.ts`). The brawl sets `guilds.brawlDay`; on that day and the
next every sexton's errand is the Guildhall's square, logged and counted (`brawlsParted`) when it arrives. The brawl tale
has a fifth choice, **"Let the sextons part them"**: with a sexton abroad both guilds +5 and the sextons +10 for no crowns;
with none, nobody comes and the guilds are unmoved. The choice is last, so the four old ones keep their places in every
replay and save.

**4b. The duel flown** (§13.13; `wyrm.ts` `sendDuelist`, the wyvern branch in `creatures.ts`). A great wyrm meeting a
hostile flyover sends its own flyer: phase 4, the duel. It chases the Vein-Wyrm's agent at altitude 48; at the first
meeting a roar, and the old one is marked: it circles the city **half as long** (130 ticks for 260; a meeting during the
circling halves what is left). When the wyrm lands the duelist goes home. The messages, the duel count and the fire cap's
half are as they were.

**5. The merchant's memory** (§11 item 4; `events.ts`, `state.merchant`). Visits, crowns spent, eggs bought and evenings
of stories are kept in state, with a default for old saves. A tale may now carry a `textFn` beside its text: the
merchant's reads the record on every visit after the first ("The wagon is back, for the third time…"). Her choices read it
too: the egg is **sky** the first time, **storm** the second, **ember** after, and each egg bought takes a tenth off every
price (down to half); "Only talk" counts an evening; **"Call in the favour"** is owed after two evenings (Longwood seeds for
nothing, the evenings spent) and refused before. The Trade Depot's panel shows the record. The choice is always listed, its
line saying whether it is owed, since a tale's choices are one list.

**Verified:**
- `npx tsc --noEmit -p .`, 75 test files with 485 tests, and `npm run build`.
- **`tests/iteration73.test.ts`** (9 tests): the eggs turn on the third day and not before, a hatchling untouched, the
  count reset, the Annals row and the cradle's desc, and the daily hook; the wyvern leaves on day 3 without a lit Dock
  with 100, the dragon away, unfed and refusing a role, home in five days with the crowns, the agent back, the airship
  instead with none at home and the Dock lit, and the mode saved; the tale's three choices (the egg's line and price, the
  challenge unanswered without a Ring and fought with one, the story) and `fightBout`'s purse; the mount refused without a
  Court or at the egg, a mounted drake laying a restless 50 tiles off and coming home; the sextons' errand reaching the
  Guildhall, the fifth choice with and without a sexton abroad, the old choices in their places; the duelist's chase, the
  meeting, the halved circling and the return; the merchant's record over six visits, sky then storm, the prices, the
  favour refused and then owed; old saves' defaults and the `skydock` op.
- **`scripts/playtest73.mjs`** in Chromium, six scenes: the cradle's panel with "at the door 1 day: the eggs turn grey in
  2 days" and the warning, then both eggs grey; the Dock's button naming the wyvern, the run sent and the panel while it is
  away; a mounted drake in the air over the Court with its shadow, and the restless 28 tiles east laid; a sexton at the
  Guildhall's door on the brawl's day and the brawl tale's fifth choice ("1 sexton abroad with salt"); the Vein-Wyrm and the
  city's sky wyvern side by side over the forest, met after 59 ticks; the merchant's third-visit dialog with the ember egg
  at 3,200 and the favour owed. A dusk brightness probe, no errors, no missing sprites.
- **The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main` from a worktree of the committed sim, main's
  side from the cache). The bot raises no Sky-Dock, Court or Ring and never calls the brawl's fifth choice; the grey eggs
  and the merchant are what it can meet.

  Every pair is +0: the branch's 192 runs are bit for bit main's, so no bot city met a grey egg, a merchant's second
  visit or any of the rest in 150 days. The bar still added draws where the floors asked (the Veshari to four a seed)
  and both sides' cache files grew; both are committed.

  | people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
  |---|---|---|---|---|---|---|---|
  | Vellish | 6 × 2 | 1,725 | 1,725 | +0 | 169 (9.8 %) | met | within the noise |
  | Grimmen | 6 × 2 | 1,430 | 1,430 | +0 | 143 (10.0 %) | met | within the noise |
  | Veshari | 6 × 4 | 2,332 | 2,332 | +0 | 217 (9.3 %) | met | within the noise |
  | Tallowkin | 6 × 8 | 1,887 | 1,887 | +0 | 218 (11.6 %) | **not met: at the cap of 8 draws** | within the noise |
  | all | | 7,374 | 7,374 | +0 | 379 | | within the noise |

  - **The gates** are the same, run for run.
  - **The Tallowkin's floor** is 11.6 % of their folk at eight draws a seed, as in iterations 64, 70 and 72: not met.
  - That the bar sees nothing is the honest result of five rules the bot never reaches: the grey eggs need a bot cradle at
    the Gloam's edge (none in 192 runs), and the merchant's memory changes only her second visit's text and prices, which
    the bot's policy reads the same way. The tests and the playtest hold the rules.

### 4.105 The wyrm redrawn after the user's painting (iteration 74)

Art only, at the user's request. The user did not like the grey Vein-Wyrm and gave a painting, now in
`inspirations/wyrm/wyrm_flight.png`: a green serpentine wyrm with an orange-red belly, cream horns and claws, olive
spines and bat wings, its body thrown into an S. The form was to match, not the exact picture.

**The flight is the painting** (`wyrm_fly_0`/`_1`):
- It is imported through `npm run art` as a `prop` with `hop` (the second frame is a pixel higher) at a `targetHeight` of
  56, which gives 63×58. Today's grey shape was 60×40.
- The manifest wins over the procedural sprite by name, so the renderer did not change. It faces right like the old
  sprite and is mirrored when the wyrm flies left.
- **A new importer key, `holes`.** The key floods the background from the corners only, so the white inside the coil's
  lower loop stayed white. `holes: N` (in `scripts/lib/sprite.mjs` `keyBackground`) also keys every enclosed background
  region of at least N source pixels; smaller light patches are highlights and stay. The wyrm uses 400.

**The coil around the node is redrawn in code** (`drawWyrmCoil`, the same 104×72 and the same back/front split):
- **The ring:** green scales on the ring, the belly's orange plates on its inner edge, olive spines with cream tips
  along the far ridge, and a tail curling into a blade.
- **Asleep:** the wings lie folded along the far coil, and the head rests on the near coil with its eyes shut.
- **Awake:** the wings are half raised. An S-necked head rises from the near-right coil, with its jaw open, cream
  horns, and ember eyes on the glow layer.
- **Dead:** the bones keep their ring of ribs, now with wing fingers and a horned skull.
- **The heads** are outlined so they read against the coil they lie on.
- **The ley:** faint runes stay on the glow layer, so it is still the Vein-Wyrm at night.
- A first pass lost the sleeping and dead heads into the ring and drew the neck like a pole. The heads were outlined
  and enlarged, and the neck thickened. The awake horns were clipped at the sprite's top edge until the head was
  lowered.

**Verified:**
- `npx tsc --noEmit -p .`, 75 test files with 485 tests (after merging iterations 72–73), `npm run build`, and `npm run art:check` judged by eye (the entry
  is now `checked`).
- **`scripts/playtest74.mjs`** shoots a build of the previous main (port 4174) and this one (4173):
  - a sheet at 4× of the three coils and both flight frames;
  - in game at 3×: the wyrm asleep, awake and dead on its node, and in flight over the founding by day and by night.
  - No errors.
- **The control seed** (`npx tsx scripts/balance.ts 42 150`): identical in every field to the cached run (2,130 folk). No
  sim file changed, so the bar's sim key is unchanged too.

### 4.106 Markets want a good road (iteration 75)

NEXT_STEPS item 1, §17.4 E, AUDIT B40: the Market zone has promised since iteration 1 that it "wants shoppers, goods and a
good road", and the road tier at a market's door had never touched anything. A road upgrade bought speed, capacity and
land value; a market on a dirt track traded like one on a Lantern-way.

**The rule** (`roads.ts` `marketRoadMultAt`, read by `computeLedger` in `economy.ts`). The road at a market's door (the
tile its carts use, `roadTileOf`) scales the market's tithe by its tier as the sim reads it (`roadAt`: an unlit Lantern-way
is cobble), with the mud rule tracks already have for speed:

| at the door | trade |
|---|---|
| no road (a street bulldozed) | × 0.8 |
| Dirt Track | × 0.9; × 0.8 in the mud of the Thaw and the Hush |
| Cobbled Road | × 1.0 |
| Lantern-way, lit | × 1.1 (unlit: a cobbled road) |
| Glowvine Lane | × 1.1 |

- Only the market tithe is scaled, beside the Lantern Levy, the Market quarter and the Market Square factors already there.
  A city whose every market door is cobbled is bit-identical. Stock, carts and demand are untouched.
- **What the player sees:** the market's panel has a row, "Road: at the door, Dirt Track: trade × 0.9, × 0.8 in the mud of
  the Thaw and the Hush; a cobbled road trades in full, a lit Lantern-way a tenth more", and a problem line on a track. The
  Market zone's desc, the help's goods line and the README say the numbers.

**The bot** (`bot.ts` `paveDoors`, after `ensureGrid`): from Market Town (cobble unlocked) it cobbles the door of one
track-side market a day, the nearest its centre first, when the treasury holds the tile's cost, 500 more and the loan. A
street, so it reads the treasury and not the goal's purse. `buildRoad` draws no rng. Without the lever the rule would only have cost the bot, whose grid is tracks but for every tenth line; with it,
Vellish 42 has 20 doors paved by day 60 (24 of its 48 markets on cobbles).

**Verified:**
- `npx tsc --noEmit -p .`, 76 test files with 489 tests, and `npm run build`.
- **`tests/iteration75.test.ts`** (4 tests): the factor per tier, the two mud seasons, cobbles that do not mud, an unlit
  Lantern-way as cobbled, a lit one and a Glowvine Lane at 1.1, no road at 0.8; the panel's words for each; the Market
  desc; two markets alike, one door cobbled, pay 0.95 of both cobbled (0.9 in the mud, 1.05 with a lit Lantern-way) with
  the Craft and Hearth tithes untouched; the bot paves nothing before Market Town or when poor, then one door a day, the
  nearest first, and stops when none is left.
- **`scripts/playtest75.mjs`** in Chromium: a street with two markets, one on a track (its panel with the row and the
  problem line) and one on cobbles; the Thaw's mud ("× 0.8 in the mud of this season"); a lit Lantern-way at 1.1 with the
  Budget open (the market tithe 18.8 in the mud against 19.9 with the Lantern-way); a bot city (seed 42, Vellish) driven
  to day 60: 20 doors paved, 24 of 48 markets on cobbles, the Burgh on day 54. A dusk brightness probe, no errors, no
  missing sprites.
- **The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main` from a worktree of the committed sim, main's
  side from the cache). Every bot city meets this rule, so the bar can see it either way.

  276 runs, 96 from the cache, in 93 minutes on four cores. No bot city lost its charter on either side.

  | people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
  |---|---|---|---|---|---|---|---|
  | Vellish | 6 × 8 | 1,897 | 1,781 | +116 (+6.5 %) | 177 (9.6 %) | met | within the noise |
  | Grimmen | 6 × 3 | 1,601 | 1,418 | +183 (+12.9 %) | 112 (7.4 %) | met | **seen** |
  | Veshari | 6 × 4 | 2,339 | 2,332 | +7 (+0.3 %) | 206 (8.8 %) | met | within the noise |
  | Tallowkin | 6 × 8 | 1,986 | 1,887 | +99 (+5.2 %) | 210 (10.8 %) | **not met: at the cap of 8 draws** | within the noise |
  | all | | 7,823 | 7,418 | +405 (+5.5 %) | 361 | | **seen** |

  - **The rule pays the bot's cities.** Every bot market sits on the grid's track until the bot paves its door, and the
    paving outruns the tenth the track costs: the four peoples together grow by a twentieth, seen past the noise, and the
    Grimmen by an eighth, seen on their own row.
  - **The gates:** the Grimmen reach the Underking's Hall in 11 of 18 runs (main 3) and the Deephold in 17 (main 15); the
    Vellish the Free City in 31 of 48 (main 24); the Tallowkin the Hall of Wicks in 35 of 48 (main 32) and the Lantern of
    Wicks in 11 (main 12), a season earlier at the median (day 85 against 114); the Veshari Vesh's Court in 20 of 24 (main
    22) and the Sable Crown in 16 of 24 (main 16).
  - **The losses, named:** Veshari 44 ends at the Weirhold in all four draws (1,299 to 1,488 folk) where main reached
    Vesh's Court in three of four (1,097 to 1,760); Grimmen 44 and 47 and Veshari 45 end a little smaller. The Veshari row
    is the one the rule does not lift: their bot's crowns go to moorings and the Weir, and a paved door costs the same 45.
  - **The Tallowkin's floor** is 10.8 % of their folk at eight draws a seed, nearer a tenth than in iterations 70 to 73
    (11.6 to 11.8 %), and still not met.
  - Both cache files are committed; main's grew by the draws the floors asked for.

### 4.107 The wyrm's wings beat, and a bigger sleeping head (iteration 76)

Art only, at the user's request after §4.105: the sleeping head a bit bigger, and wings that move while the wyrm flies.
Before this, the two flight frames were the painting a pixel apart (`hop`), so only the whole body bobbed.

**The beat is cut from the painting** by a new importer key, `flap` (`flapFrame` and `dropSpecks` in
`scripts/lib/sprite.mjs`):
- **Each wing** is a hand-set polygon in the painting's pixels with a shoulder pivot:
  - the near wing over the upper-left;
  - the far wing behind the neck, marked `behind`, so it is drawn only where the background shows.
- **Each frame** turns every wing about its shoulder (`rot`, degrees) and squashes it toward the shoulder (`sy`), as a
  wing seen edge-on.
  - The place the wing leaves is painted background white, and the key takes it.
  - The wing's root (`root`, 55 source pixels) is drawn in both places, so the back under the joint is never holed.
  - Specks under 600 source pixels, left at the wing's old edge, are dropped.
- **The wyrm's frames:** up (the painting), mid (16° and 0.82, the far wing 12° and 0.85), and down (32° and 0.62,
  the far wing 24° and 0.7).
- **One box for every frame:** all frames are cropped to their common box and scaled by one factor, and they share
  frame 0's anchor. The body holds still while the wings move. A test holds the manifest to one size and anchor for
  all three.
- **The renderer** plays them up, mid, down, mid at six frames a second. Without frame 2 it falls back to two frames.
- **Tuning:** the first sign turned the wings up toward the head, and a too-tight polygon left the wing's pale edge
  behind. The polygons were widened and the sign flipped; the root and the speck filter closed the rest.

**The sleeping head** is 1.7 times the base head (it was 1.2). It lies across the near coil with its eyes shut, its horns
and outline scaled with it.

**Verified:**
- `npx tsc --noEmit -p .`, 77 test files with 491 tests after merging iteration 75 (`tests/iteration76.test.ts`: the frames' shared size and anchor,
  and `flapFrame` moving only a wing's paint), `npm run build`, and `npm run art:check`.
- **`scripts/playtest76.mjs`:**
  - the 6× sheet of the three frames;
  - the sleeping wyrm before (main, on port 4174) and after;
  - the wyrm in flight at three moments of the beat and at night;
  - the renderer's frame index over a second, which plays 0, 1 and 2.
  - No errors.
- **The sim:** `src/sim`, `src/data` and `src/core` are unchanged from main. The control seed (`npx tsx scripts/balance.ts 42 150`) is identical to the cached run (2,130 folk).

### 4.108 The sprites faced and fitted (iteration 77)

Art only, §17.4 F, the last of the single items: the user asked in iteration 72 for every building sprite, painted and
drawn, to be checked for its facing and for how it sits in its tile square, with the procedural set as the yardstick (door
and gable on the right face, the footprint diamond filled neatly).

**The survey** (`scripts/playtest77.mjs`, kept as the tool for the next art pass). From a running build it draws every
building sprite over its footprint diamond (yellow; the right face red), each painted sprite beside its mirror, on three
sheets: the 18 painted heroes at 5×, the 24 painted zone houses at 6×, and all 77 `b_` sprites at 3×; the 24 procedural
zone houses and their 144 people's copies were shot the same way in the survey. Each was judged by eye at 4×, the doubtful
ones at 10×.

- **Facing: nothing to flip.** The painted zone houses are head-on or fronted lower-right, as §4.87 and §4.90 found; the
  heroes face right (the Stake's stages, the depot, the yard, the Lyceum) or are symmetric (the wells, the towers, the
  chapels, the boneyard, the Hall of Wicks); the procedural and hand-drawn set faces right by construction. The flip list of
  `tests/iteration56.test.ts` stands.
- **Fit: two sprites looked off.**
  - **The Founding Stake at stage 2** (the brick hall on its lawn) was 55×42 where stage 1 was 55×59: the hall *shrank* at
    the Burgh and grew again at the Free City (55×66). §4.87 scaled the four stages by one factor (0.8), and the stage 2
    painting is a low, wide hall, so the factor left it small. It is now scaled to its diamond's width (`targetHeight` 48:
    65×50), the widest of the four and 8 px taller than before; it is still 10 px shorter than stage 1 by the painting's
    shape, which no scale can change without spilling past the tile. Stage 1 gains a pixel (`targetHeight` 58: 56×60) so
    it stands level with stage 0 (55×60), not under it.
  - **The Hall of Wicks** was 66×86 on a 96-wide 3×3 diamond: the castle stood on a small lawn in the middle of its tile
    while every other 3×3 fills its diamond. `targetHeight` 112 makes it 88×114, a 4 px rim of tile each side, and in the
    town it reads as the same mass as the Hall of Marvels and the Underking's Seat beside it.
- **Everything else sits as the procedural set does:** the 1×1 zone houses 36 wide on a 32 diamond (the procedural ones
  are 34), the heroes centred with their bases on the diamond's bottom edge, the towers narrow on purpose (the spire, the
  Wick-Tower, the Nexus), the flat works flat (the quay, the landing, the weir, the quarry, the hatchery, the tide pool,
  the salt font, the Ring, the square, the garden, the cradle, the Wyrm-Court).
- **Noted, not changed:** the arcane level-2 variant 3 painting reads pale beside its three siblings (a colour matter,
  not facing or fit), and the head-on paintings still cannot turn to a road behind them (§4.90).

**Verified:**
- `npx tsc --noEmit -p .`, 78 test files with 494 tests (`tests/iteration77.test.ts`: the three tall Stake halls never
  shrink and stage 2 fills its diamond's width, the Hall of Wicks fills its 3×3, no painted building spills more than 8 px
  past its diamond, every building painting is `checked` and stands on the centre anchor; `tests/iteration56.test.ts`'s
  height cap for the Hall is 116), `npm run build`, `npm run art` (three PNGs and their glows change, nothing else in the
  manifest moves).
- **`scripts/playtest77.mjs`** against the build and main's build on port 4174: the three sheets before and after; a town
  on seed 77 with the Stake at its four stages (by milestone) beside the depot, the cistern and the yard, and the Hall of
  Wicks between the two 3×3 wonders, day and night at 3×, before and after. No errors, no missing sprites.
- **The sim:** `src/sim`, `src/data` and `src/core` are unchanged from main. The control seed (`npx tsx scripts/balance.ts
  42 150`) is main's own: 2,155 folk at day 150, the Burgh on day 42, the Free City on day 125 (§4.106 moved it from
  2,130 with the market road; §4.107's "2,130" was written before that merge).

### 4.109 The scale of things: the citizen is the yardstick for the small buildings (iteration 78)

Art only, a playtest finding after §4.108: "the well is way too big in comparison to the citizens, and a lot more buildings
are". §4.108 judged every sprite against its tile; this iteration judges the small ones against a citizen (12 px tall, the
8×12 `cit_*` canvas of §4.96). Measured so, the 1×1 objects and sheds stood 2.5 to 3.3 citizens tall where life gives 1.5
to 2.5: the well 30 px, the tide-well 25, the seep 22, the ward lantern 40, the shrines and the 1×1 works 35–38, the
level-1 cottages 30–37. The two-storey houses (36–46 px), the 2×2 halls (4–5 citizens) and the towers and wonders read
right, because a tall thing may stand over the folk; a well may not.

**The yardstick** (in citizens of 12 px, the outline counted; `tests/iteration78.test.ts` holds it):

| Class | Buildings | Cap | Before → after |
|---|---|---|---|
| Objects a person reaches over | the well, the tide-well, the seep | 1.5 | 30, 25, 22 → 18, 16, 14 |
| Posts and small shrines | the ward lantern, the shrine, the candle shrine | 2.5 | 40, 35, 35 → 28, 30, 30 |
| Sheds, works and cottages (1×1) | fishers' hut, smokehouse, reed-cutters, healer, torrent mill; level-1 hearth, market, craft, arcane | 2.8 (the Tallowkin wickhouses 3.2) | 35–38 → 32–33; 30–37 → 28–33 |
| Two-storey houses (level 2–3) | unchanged | 4 | 36–46 |
| Halls (2×2) | the academy comes down a storey; the rest unchanged | 5.5 | 73 → 66 |
| Towers, fonts, spires, wonders | unchanged, meant to rise over the roofs | free | |

**How.** The painted ones are a `targetHeight` in `art/sources.json` (the well 28 → 16, the tide-well 23 → 14, the seep
20 → 12, the four level-1 craft paintings 32 → 28). A small object no longer fills its tile, so the importer's new `shift`
key moves its centre anchor up 6 px: the well stands in the middle of its tile, not at its front corner (the test holds
the shifted anchor). The drawn ones are `height` and `roofH` in `SERVICE_SPECS` and `zoneSpecs` (`src/render/sprites.ts`);
`drawBuilding` sizes the sprite from the footprint and those two numbers and places the anchor from the same, so nothing
moves on its tile, and the Grimmen, Veshari and Tallowkin copies follow through their spec functions. The ward lantern is
hand-drawn: its post lost 12 rows, the lamp and the base are as they were.

**Verified:**
- `npx tsc --noEmit -p .`, 79 test files with 501 tests (`tests/iteration78.test.ts`: every class under its cap, the
  painted from the manifest and the drawn from `generateSprites()`'s opaque rows, the citizen still 8×12, the towers still
  tall, the shifted anchors; `tests/iteration77.test.ts` allows the shift), `npm run build`, `npm run art`.
- **`scripts/playtest78.mjs`** (§4.108's survey tool with a citizen at every tile's front corner) against the build and
  main's build on port 4174: the 1×1 sheet, the level-1 houses of every people, all 77 `b_` sprites; a street on seed 78
  (the three wells, the spire, level-1 and level-2 houses, a craft, a market, a shrine, the ward lantern, the depot, the
  cistern, a watchpost, a healer, a fishers' hut, a smokehouse, sixteen folk on the road) at 2×, 4× and 6× and at night,
  before and after. No errors, no missing sprites.
- **The sim:** `src/sim`, `src/data` and `src/core` are unchanged from main; the control seed is §4.108's (2,155 folk).

### 4.110 The paintings redrawn in code, part 1: the wells, the level-2 hearths, the level-1 crafts and the depot (iteration 79)

Art only, at the user's request after §4.109: "redraw every sprite currently in the game like you made the procedural ones,
but copy our custom designs", in the same style as the procedural set. A painting scaled to a citizen and a half (the well
of §4.109, 15 px wide) is a smudge; the procedural painter is crisp at any size. So the paintings become designs for the
painter, and the painter draws the game. This is **part 1, a trial batch of twelve**, judged side by side with the paintings
so the user can settle the direction before the rest (parts 2 and 3 are on the list).

**The rule.** A redraw is a `drawBuilding` spec wherever a spec can give the shape (the same 2:1 faces, the same two-tone
walls and roofs, the same windows, doors, chimneys and lantern posts, the 1 px outline, the door on the right face), so a
redrawn hearth sits beside a Grimmen hearth as one set. Bespoke drawing only where no spec can give the shape (the wells),
with the same primitives and flat shading as `drawWell` always had. Within that style each redraw keeps the painting's
silhouette, materials, colours and the features that name it, at §4.109's citizen yardstick.

**What was added to the painter** (`src/render/sprites.ts`), each a few flat polygons in the set's colours:
- walls `log` (the timber wall with a seam under every third row and a knot now and then) and `brick` (the only new
  colours, `brick1`/`brick2` in the palette); a `brickChimney`;
- features `porch` (a lean-to roof over the door on two posts), `flowerBox` (a box of flowers under the ground-floor
  windows), `bush`, `sideTree` (round, conifer or autumn, at the left corner), `fence` (pickets along the left front edge),
  `woodpile`, `dormer` (a window on the front slope), `balcony` (a railing across the right face), `stalls` (a striped awning
  and a counter of goods along the right face).

**The twelve, from their paintings:**
- **The well** (`wells/image_2(1)`): a mossy stone ring under a shingled roof on two posts, the bucket on the rim, a coil of
  rope and a mound of earth beside it, cobbles under it. **The seep** (`image_1(1)`): the same well under a blue slate roof,
  grass and flowers at its foot. **The tide-well** (`image_3(2)`): a shrine well, its water glowing blue, a green pagoda
  roof with upturned eaves and a finial, runes on the arch, a lantern at each eave. Each 18 px (1.5 citizens), the ring's
  base at the tile's centre (`wellRing`, `wellRoof`, `drawWell`, `drawSeep`, `drawTidewell`).
- **The level-2 hearths** (`wooden_houses`): a plank house with a tile roof, a brick chimney, a porch, a lantern, a fence,
  a bush and a tree (v0); a log cabin with a shingle roof, a porch, a flower box, a woodpile and a pine (v1); a log cabin
  with a red tile roof, a brick chimney, a porch, a bush, a tree and a fence (v2); a log cabin with a dormer, a flower box, a
  porch, a lantern and a bush (v3). 37–39 px (3.1–3.3 citizens; the Tallowkin wickhouses 3.6).
- **The level-1 crafts** (`general_craft`): the tan workshop with a sign, a balcony, flower boxes, a woodpile and a round
  tree (v0); the red-roofed cottage with a sign, a porch, flower boxes, a tree, a fence and a lantern (v1); the half-timbered
  house with a green roof, a brick chimney, a dormer, a flower box, an autumn tree and a fence (v2); the stone house with a
  slate roof, a sign, a balcony, a porch, a pine and a woodpile (v3). 33 px (2.8 citizens).
- **The depot** (`trade_houses/image_0(1)`): a half-timbered hall on a slate roof with a dormer, a brick chimney, a sign, a
  banner, a lantern, flower boxes, and the striped awning and counter of goods along its front. 66×59 (4.9 citizens).
- **The peoples:** no painting is the look for everyone any more, so the Grimmen cut the four hearths and crafts in stone,
  the Veshari in plank and reed, the Tallowkin as wickhouses, each keeping the painting's porch, tree, fence and dormer.

**The paintings switched off, not deleted:** `off: true` in `art/sources.json` makes the importer skip the entry (the
painting stays in `inspirations/`, the entry keeps its flip and heights for the record); the twelve PNGs and their glows
are gone from `public/art/sprites/` and the manifest, so the atlas draws the code sprites.

**Judged side by side** (`scripts/playtest79.mjs`: painting from main's build on port 4174, redraw from the build, each over
its diamond with a citizen, at 6×): the redraws are crisp at the citizen scale and carry the paintings' materials, roof
colours, trees, chimneys and porches; what a 34 px sprite cannot carry is the paintings' detail (the signboards' lettering,
the market crowd, the picket fences' every post). The user judges whether parts 2 and 3 follow.

**Verified:**
- `npx tsc --noEmit -p .`, 80 test files with 506 tests (`tests/iteration79.test.ts`: the twelve off and out of the
  manifest, the yardstick kept, the wells' anchors, the brick, the log seams and the tide-well's glow, every zone sprite of
  every people present; `tests/iteration56`, `iteration77`, `iteration78` and `sprites.test.ts` skip the switched-off
  paintings), `npm run build`, `npm run art`.
- **`scripts/playtest79.mjs`**: the side-by-side sheet, the peoples' sheet, the street of §4.109 at 4× and 6× by day and
  at night, before and after. No errors, no missing sprites.
- **The sim:** `src/sim`, `src/data` and `src/core` are unchanged from main; the control seed is §4.108's (2,155 folk).

### 4.111 A brickworks drawn after the user's painting, not yet given to a building (iteration 80)

Art only, at the user's request: a painting of a brickworks, recreated in procedural code as close to it as the game's 2:1
view allows. The user chose "just the drawing for now", so no building uses it yet.

**`drawBrickworks()`** (in `src/render/drawn.ts`, sprite `b_brickworks`) is drawn on the 3×3 frame with the §4.96 kit.
- **The brick hall:** coursed brick, an orange tile roof with dark timber ridge and barge boards, a tie beam and corner
  posts, and a smoking brick chimney. The arch has a brick ring and the kiln burning inside under its stone hood, with
  the small oven beside it and stacked bricks.
- **The house beside it:** brick with timber posts and rails, two lit windows, a plank door on stone steps, and a stone
  chimney.
- **The clay shed:** open, with clay heaps under its lean-to roof.
- **The yard:** brick stacks and a drying rack, the bench and tools, spades against the wall, pots, a woodpile, the clay
  cart, the stone path, and the fenced garden. A grass rim surrounds the earth.
- **The night:** the kiln, the oven and the windows glow on the glow layer.
- **The layout:** the painting's front is the sprite's right face, the side a building turns to its road.

**Found while drawing:**
- A gable roof's far slope faces away from the viewer. It must go down before the walls and the gable end, or it covers
  the gable: the first draft lost both gables that way.
- Deep, narrow buildings show their side walls and roof slopes rather than their fronts in this view. The hall and the
  house were made wide and shallow, and their roofs lowered.

**What it cannot copy:** the painting is a frontal elevation, and the game's view puts every front on a diagonal. The
gables read smaller than in the painting, and the yard's small things, at 98 pixels wide, are only hints.

**Verified:**
- `npx tsc --noEmit -p .`, 80 test files with 506 tests after merging iteration 79, and `npm run build`.
- **Shown to the user:** the sprite at 8× beside the painting, at 3×, and in a running game by day and by night, standing
  in for a 3×3 building's sprite in that page only.
- The sim is unchanged.
### 4.112 The twelve redrawn again, each after its own painting (iteration 81)

Art only, after the user's verdict on §4.110's sheet: "all the remade buildings look too similar; stick as close to the
source as possible, just redraw them in your style." §4.110 built the redraws from `drawBuilding` specs, so every house
had the same box, roof line, door spot and window grid. The paintings differ in composition: which way the gable faces, a
wing or a porch, where the chimney stands, how many storeys, a veranda, a dormer, a balcony, the tree's side.

**Compose, don't spec** (`src/render/painted.ts`). An `Iso` helper maps tile coordinates (tx, ty in 0–1, z up) to the
sprite's pixels and offers the parts: a `box` with its own footprint and wall height (the left face dark, the right lit,
the set's wall textures: log, timber, plaster, half-timber with braces, stone, brick, whitewash), a `gable` roof whose
ridge runs along either axis (the gable shows on the right face for 'x', on the left face for 'y') with overhanging eaves
and the set's roof textures, lean-to roofs from either face (porches, hoods, wings), a `veranda` (a railed deck), a
`balcony`, a `dormer`, a `chimney` (stone or brick, with smoke), windows and doors (plank, arched, round) at any tile
point, and the props: sign, flower box, lantern, bush, tree (round, conifer, autumn, birch), fence, woodpile, barrel,
stepping stones, a striped awning with a counter of goods, a flag. Each of the twelve is then a short script that places
those parts where its painting has them, in the set's style: 2:1 iso, the palette, flat two-tone faces, the 1 px outline,
the front on the right face. The anchor is the tile's top corner, as `drawBuilding`'s.

**The twelve:**
- **Hearth level 2** (`wooden_houses`): v0 a tall two-storey plank house, gable to the front under a tile roof, a brick
  chimney at the back, a porch roof with a lantern, a fence and a red bush on the left, a round tree at the right (48 px,
  4 citizens); v1 a log cabin, gable to the front, a dark shingle roof with pale trim, a tall stone chimney at the left end,
  a porch, a flower box under the paired window, a woodpile and a pine (44 px); v2 a low log cabin with its eaves to the
  front and the gable to the right, a red tile roof, a brick chimney, a railed veranda with a hood over the door, a tree
  at the left and bushes (42 px); v3 a log cabin with the gable at the left end, a dark shingle roof with a dormer, a stone
  chimney, a wide flower-boxed window, a porch with two lanterns, bushes and a stone path (44 px).
- **Craft level 1** (`general_craft`), a storey and a loft at 33 px (2.8 citizens): v0 the tan timber workshop with a
  balcony over an arched door, a signboard, a stone chimney, flower boxes, a woodpile and a tree; v1 the red-roofed
  cottage with a signboard under the gable, a railed porch, flower boxes, a copper door, a tree and a picket garden; v2
  the half-timbered house with a green roof and a dormer, a brick chimney, two teal doors, a flower box, an autumn tree
  and a fence; v3 the stone-and-timber house with a dark roof, a balcony hung with cloths, a signboard, an awning over the
  door, a birch and a pine, a barrel.
- **The depot** (`trade_houses`, 66×62, 5.2 citizens): a half-timbered hall jettied over a stone ground floor, a slate
  gable to the front with a red tile cross-gable over the left wing, flags on the ridge, a stone chimney, a clock on the
  gable, the signboard over an arched door, a lantern, a red-and-white and a blue-and-white awning with stalls of goods,
  a thatched lean-to on the left face, barrels.
- **The wells** keep §4.110's drawings.

The Grimmen, Veshari and Tallowkin copies of the eight houses keep §4.110's spec builds through their own look functions:
their looks are their own, not the paintings'.

**Judged side by side** (`scripts/playtest81.mjs`: the painting from main's build on port 4174 beside the redraw, at 6×
and at 10×, a citizen at each tile's corner; the street by day and night). The four hearths now differ in silhouette as
the paintings do, and so do the crafts; what a 34 px sprite still cannot carry is the paintings' lettering, railings and
foliage detail. **The merge waits for the user's word.**

**Verified:**
- `npx tsc --noEmit -p .`, 81 test files with 512 tests (`tests/iteration81.test.ts`: the hand-drawn houses in the atlas
  for the Vellish look and the spec builds for the peoples, the four hearths unlike in height, roof and chimney, the
  yardstick, the paintings' named parts, the anchors, the outline closing every sprite), `npm run build`.
- `scripts/playtest81.mjs`: no errors, no missing sprites.
- **The sim:** `src/sim`, `src/data` and `src/core` are unchanged from main; the control seed is §4.108's (2,155 folk).

### 4.113 The eda-lore swap, batch 1: the zone houses, every people its own (iteration 82)

Art only, the user's request at the close of iteration 81: swap as many of the game's buildings as the user's own
repository `eda-lore` covers, the zone houses first. The repository's 36 unsorted sheets at its root (1024² each, several
houses to a sheet, 2:1 dimetric and lit from the front right like the set) hold about 160 houses that fit the setting and
about 20 towers; the glass boxes, igloos, the factory and the solar roofs do not, and the shrines, castles, graveyards and
ward towers wait for batch 2. Twenty-two sheets are copied into `inspirations/eda-lore/` under descriptive names.

**The user's two rules,** given while the plan was made: "every people should have different looking ones", and "no
repeats of custom assets". So 4 peoples × 4 zones × 3 levels × 4 variants = 192 slots, each holding a painting no other
slot holds. Where the sheets ran short, a slot keeps its people's drawn house (iteration 51's rule, an imported base being
the look for everyone, is gone: `zoneSpriteName` now always names the people's own sprite).

**How the houses were sorted.** By people, after their rules in `sprites.ts`: the Vellish the town (half-timber, tile,
thatch and brick); the Grimmen stone and slate (keeps, moss huts, turf houses, stone smithies, the forge in the crystals);
the Veshari plank, reed and log (the twenty wooden houses of one sheet, log cabins, turf and stilt houses, A-frames, the
round thatched houses, the treehouses and the mushroom house for arcane); the Tallowkin tall and narrow (the villas,
clock towers, the steampunk towers, the observatories, the pagodas, the glass domes). By zone, after the look: smithies,
barns and workshops are crafts; shops, stalls and the houses with goods are markets; towers, laboratories, domes and
shrines are arcane; dwellings are hearths. By level, after the shape: low and wide at level 1, two storeys at level 2,
the grandest and tallest at level 3.

**The importer** has a `maxWidth` key: a house takes its `targetHeight` unless that makes it wider than its tile (34 px);
then it takes the tile's width and the height follows. Heights: level 1 31 px (2.8 citizens with the outline; the
Tallowkin 36, 3.2), level 2 40 (3.5), level 3 45 (3.9), the arcane and the Tallowkin level 3 towers 56 (4.8).
**The glow** keeps only small lit patches (`glowLayer`'s `maxBlob: 10`): the windows and lanterns light at night, a cream
wall or a thatch roof does not (the first night shot lit whole whitewashed villas). Houses fronted on the left are
mirrored (`flip`), 73 of them, judged sheet by sheet at full size. `scripts/edaLoreHouses.mjs` holds the allocation and
writes the entries (`set: 'eda-lore-1'`); the sixteen older zone paintings are switched off (`off: true`).

**The allocation** (sheet and island in `inspirations/eda-lore/`; ′ mirrored; — the people's drawn house):

| People | Zone | Level 1 | Level 2 | Level 3 |
|---|---|---|---|---|
| Vellish | hearth | houses_12 2′, houses_12 3′, houses_12 0, houses_12 9′ | houses_labelled_16 1, plated_houses_4 0, plated_houses_4 2′, medieval_9 8 | houses_4 3′, lodges_labelled_16 2, houses_10 2, houses_4 2 |
| Vellish | craft | smithies_labelled_12 1, smithies_labelled_12 55, smithies_grey_10 2, smithies_4 5 | houses_grey_16 15′, smithies_grey_10 4, smithies_4 1, smithies_4 6′ | smithies_plated_4 2, smithies_plated_4 3, smithies_grey_10 9, lodges_labelled_12 130′ |
| Vellish | market | medieval_9 10, medieval_9 4, houses_labelled_16 125, shrines_16 3 | alchemy_towers_8 2′, lodges_labelled_12 2′, lodges_labelled_16 70′, houses_grey_16 0 | alchemy_labelled_6b 2, alchemy_labelled_6 64′, houses_12 6, lodges_labelled_16 54′ |
| Vellish | arcane | houses_labelled_16 58′, houses_labelled_16 59′, houses_labelled_16 60′, shrines_16 9 | alchemy_towers_8 9, alchemy_labelled_6 2, alchemy_labelled_6b 3, houses_grey_16 14 | alchemy_towers_8 1, alchemy_labelled_8 51′, alchemy_labelled_6 3, alchemy_towers_8 8′ |
| Grimmen | hearth | lodges_labelled_16 119′, houses_grey_16 5, houses_labelled_16 128′, plated_houses_4 3′ | houses_grey_16 13, houses_4 0, houses_labelled_16 127, houses_labelled_16 0′ | medieval_9 5, lodges_labelled_16 1, lodges_labelled_12 3′, houses_labelled_16 126 |
| Grimmen | craft | smithies_grey_10 0′, smithies_grey_10 6, smithies_labelled_12 0′, smithies_labelled_12 53 | smithies_grey_10 5, smithies_grey_10 7, smithies_grey_10 3′, smithies_labelled_12 3 | smithies_labelled_12 2′, alchemy_labelled_6 63, alchemy_towers_8 10, smithies_labelled_12 54′ |
| Grimmen | market | shrines_16 0′, shrines_16 22′, shrines_16 6, — | stone_houses_4 1′, stone_houses_4 3′, medieval_9 7, alchemy_labelled_8 52′ | towers_16 2′, lodges_labelled_16 3′, stone_houses_4 0′, houses_labelled_16 3′ |
| Grimmen | arcane | shrines_16 4′, —, —, — | alchemy_labelled_6b 1, smithies_labelled_12 101′, —, — | alchemy_labelled_8 2, towers_16 3, towers_8 0, — |
| Veshari | hearth | wooden_houses_20 0, houses_12 10, houses_12 11′, lodges_labelled_16 52′ | wooden_houses_20 9, wooden_houses_20 13, wooden_houses_20 16, wooden_houses_20 11′ | wooden_houses_20 1′, lodges_labelled_16 117, wooden_houses_20 7′, wooden_houses_20 8 |
| Veshari | craft | smithies_labelled_12 52, smithies_grey_10 1, smithies_4 2, wooden_houses_20 4′ | smithies_grey_10 8′, lodges_labelled_16 68, houses_10 8, houses_grey_16 1 | wooden_houses_20 3′, smithies_plated_4 4′, lodges_labelled_12 128′, wooden_houses_20 10 |
| Veshari | market | lodges_labelled_16 0, shrines_16 1′, alchemy_labelled_6 65′, houses_labelled_16 2 | alchemy_labelled_6b 48′, lodges_labelled_16 69′, wooden_houses_20 17, wooden_houses_20 15′ | wooden_houses_20 5, alchemy_labelled_8 53, wooden_houses_20 19′, wooden_houses_20 14 |
| Veshari | arcane | houses_labelled_16 179′, lodges_labelled_16 116′, lodges_labelled_12 1′, shrines_16 5 | alchemy_towers_8 4, lodges_labelled_16 53, lodges_labelled_12 61′, wooden_houses_20 12 | alchemy_labelled_8 3, houses_10 3, lodges_labelled_16 118, lodges_labelled_12 60′ |
| Tallowkin | hearth | houses_10 4, houses_10 7, houses_12 8′, houses_grey_16 2 | houses_labelled_16 182, houses_labelled_16 181, alchemy_towers_8 7, houses_10 9 | towers_16 7, alchemy_towers_8 3, lodges_labelled_16 55′, wooden_houses_20 2 |
| Tallowkin | craft | alchemy_labelled_6b 47′, smithies_plated_4 5, shrines_16 8′, houses_grey_16 3 | alchemy_labelled_8 1, towers_8 2′, towers_16 12′, alchemy_labelled_8 0 | alchemy_labelled_6 1, towers_8 1, towers_16 10′, — |
| Tallowkin | market | shrines_16 20′, shrines_16 10, —, — | towers_16 6, towers_8 5, alchemy_labelled_8 54′, towers_16 15 | towers_8 6, towers_16 4′, towers_8 7, medieval_9 6 |
| Tallowkin | arcane | shrines_16 7, shrines_16 2, houses_4 1, houses_10 10 | alchemy_labelled_6b 49, towers_16 5′, lodges_labelled_12 59, lodges_labelled_12 129′ | towers_8 3, wooden_houses_20 18′, —, — |

**Counts:** Vellish 48 of 48, Veshari 48, Tallowkin 43, Grimmen 41: 180 houses, none used twice. **Still to draw**
(twelve slots): Grimmen market 1 v3, arcane 1 v1–v3, arcane 2 v2–v3, arcane 3 v3; Tallowkin craft 3 v3, market 1
v2–v3, arcane 3 v2–v3.

**Judged** with `scripts/playtest82.mjs`: per people, the 48 houses over their diamonds with a citizen beside main's (port
4174), each zone at 6×, and a block of all 48 on two streets by day and night at 3× and 6×. The twisted-metal altars first
given to two Grimmen arcane slots read as scrap at 34 px and went back to batch 2.

**Verified:**
- `npx tsc --noEmit -p .`, 82 test files with 517 tests (`tests/iteration82.test.ts`: 180 houses from eda-lore, no
  sheet-and-island pair twice, the count per people, every slot the people's own sprite and present, the tile width, the
  centre anchor and the yardstick, the flip list), `npm run build`, `npm run art`.
- `scripts/playtest82.mjs`: no errors, no missing sprites.
- **The sim:** `src/sim`, `src/data` and `src/core` are unchanged; the control seed `npx tsx scripts/balance.ts 42 150`
  ends at 2,155 folk, as main.

### 4.114 The Brickworks: the drawing given a building of its own (iteration 83)

Iteration 80 drew a brickworks after the user's painting and gave it to no building (§4.111). The user then said: make it
the level-3 Craft building or a new building type, as I prefer.

**Why a new building:** a Craft lot is a 1×1 zone building at every level, and the drawing is a 3×3 hall with a house, a
shed and a yard. Shrunk to one tile it would lose everything the painting has. So it became **the Brickworks**, a 3×3
building unlocked at the Village (milestone 3), the "level 3" in the sense of when it comes.

**What it does:**
- **Bricks for the carts.** Ten hands make 6 goods a day, carted like a Craft works. It uses the `goodsRate` path the
  Quarry and the Hanging Gardens use, so it scales with its hands and halves when unlit.
- **Its own light.** The kiln lights it (`selfLit`), with no mana.
- **Bricks for the builders, its one new rule.** A building site within `BRICK_REACH` = 12 tiles (centre to centre) of a
  staffed Brickworks rises `BRICK_SPEED` = 1.5 times as fast. That covers the folk's own quarter pace as well as each
  builder's share.
  - A Brickworks still being raised, or one without hands, speeds nothing.
  - Zone lots are unchanged: they rise in a day anyway.
  - The ring "bricks for builders" shows the reach, and a site's Construction row says when the bricks reach it.
- **The figures:** it costs 3,600 crowns, upkeep 30 a day, and takes three days to build.
- **Saves:** there is no new state, so old saves load.

**The bot does not build it.** Teaching the bot to use it would be a balance change of its own. The bar's runs therefore
show what the catalog change alone does to a bot city.

**Verified:**
- `tests/iteration83.test.ts`, 5 tests: the entry and its unlock, the goods lit and unlit, the speed inside and outside
  the reach and with an empty works, a works still being built and zone lots, and the ring.
- `scripts/playtest83.mjs`:
  - the Services tab at the Village and its tip, and the placing ghost with its ring;
  - the Brickworks placed through the game's own action, by day and at night;
  - its panel and ring;
  - a site 8 tiles away against one beyond the reach, with no builders: 150 against 100 work in 400 ticks;
  - three days of goods (23 made, all hands at work);
  - no errors and no missing sprites.
- **The wide bar** (`--bar wide --compare origin/main`, 180 runs in 113 minutes): **bit-identical to main.** Every run
  matches, draw for draw, and the bot never builds it.

  | people | seeds × draws | floor (2·SE) | share of the mean | bar | this tree | origin/main | verdict |
  |---|---|---|---|---|---|---|---|
  | vellish | 6 × 5 | 196 | 9.6 % | met | 2,045 | 2,045 | +0, within the noise |
  | grimmen | 6 × 3 | 117 | 7.3 % | met | 1,601 | 1,601 | +0, within the noise |
  | veshari | 6 × 4 | 194 | 8.3 % | met | 2,339 | 2,339 | +0, within the noise |
  | tallowkin | 6 × 3 | 170 | 8.5 % | met | 1,997 | 1,997 | +0, within the noise |

  The gates are identical on both sides. The last gates reached are:
  - Vellish: Free City 21/30 and Beacon 3/30.
  - Grimmen: Underking's Hall 11/18 and Seat 3/18.
  - Veshari: Sable Crown 16/24.
  - Tallowkin: Lantern of Wicks 3/18.
### 4.115 The eda-lore swap, batch 2: every other compatible asset (iteration 84)

Art and render only, the user's request after batch 1: "use every compatible building, tree, well, bush or other asset that
can be used in this game", then list what is still drawn in code. Batches 2 (services) and 3 (props) of NEXT_STEPS merged
into this one iteration at the user's word.

**Looks for any building.** A service building had one sprite, so one painting. Now `b_<key>_v0..N-1` in the atlas are its
looks; `lookName` (`src/render/atlas.ts`) picks one per building by a hash of its tile, the same every frame and load, and
the placement ghost shows the look the tile will get. Where a building has no looks, its `b_<key>` is drawn as before. A
painting imported earlier stays its building's first look (an alias, `_v0`). The renderer counts the ground families, the
autumn trees and the new `glowcap_` pool (the glowing mushrooms near a node, split from `mushroom_`) from the atlas at boot.
The sim is untouched (`src/sim`, `src/data`, `src/core` unchanged).

**What went in** (`scripts/edaLoreAssets.mjs`, entries `set: 'eda-lore-2'`; 25 new sheets in `inspirations/eda-lore/`):
- **145 looks for 37 buildings:** wells 37, seeps 12, tide-wells 10 (the wells folder's 13 sheets, at 1.5 citizens with
  the `shift` anchor); shrines 11, Storm-Caller's Peak 2, Stone Ward 3, Candle-Shrine 1, healers 5 (the pool shrines and the
  three alchemist's houses), Eggshell Font 2, Ley Beacon 1, watch posts 2, the Wick-Tower's lantern tower; Fishers' Hut 2,
  Reed-Cutters 1, Smokehouse 1 (the wooden houses); boneyards 11 and ossuaries 6 (the cemetery dioramas, the gothic chapel),
  Sextons' Chapel 2, Water Garden 1; Hunters' Lodge 4, Tamer's Lodge 2 (the hunters' lodges); Wyrmfire Forge 2, Forge-Temple
  1, Golem Foundry 1 (the forge paintings, the user's "blacksmith houses"); depots 3 (the trade houses), Spire-Wrights'
  Lodge 4 (the general craft houses), the Brickworks 4 (the brickmaker paintings; its hand-drawn sprite of iteration 83
  stays the fallback); Academy, Drake Mews, Observatory, Ruin
  Delve, Hall of the Nine Houses, Ley Spire 2 more, the Lantern of Vell, the Great Gate, the Hall of Marvels and the Grand
  Academy one each.
- **Props:** trees 32 (20 new: oaks, pines, birch, willows, cherries, apple, redwood, cypress), autumn trees 3, glimwood 10
  (the crystal, spiral, orb and jewel trees; the four recoloured tree paintings switched off, no painting twice), gloam trees
  2 (the dark spruce and cypress, recoloured), bushes 108 (102 new), mushrooms 114 (111 new), glowing caps 60, the boar.
- **Ground:** grass 7, meadow 9, forest 7, hills 8, shore 2, ruins 7. The isometric block sheets take a new importer mode,
  `isoTop`, that samples the block's top face onto the tile (`isoTopDiamond` in `scripts/lib/sprite.mjs`); folding them as
  squares put the block's sides on the tile as white specks. The shore's old tile was grass_3's again and is off.
- **The twelve house gaps** of iteration 82 are filled (`scripts/edaLoreHouses.mjs`, sheets W–a): every people has 48 houses
  of its own.

**The mushrooms brought down** (after the merge, the user's word: "the mushrooms are all too big, a mushroom is smaller than a
human"): every mushroom and glowing cap, iteration 50's six included, stands 5 px (7 with the outline) against the
citizen's 12, about half a person; they were 10 (12), as tall as the folk. `tests/iteration84.test.ts` holds them under 0.6
citizens. The rest of the batch the user kept as it is, the Brickworks' brickmaker looks included.

**Not used, and why:** the modern houses of batch 1; potted plants, planters and shaped topiary (a heart, a spiral, tiers in
pots: no pot stands on open grass); the joke mushrooms (skull, lollipop, candy, metal, faces, clockwork, fire, ice, gold);
the palms, cactus, baobab, bonsai, candy and Christmas trees (no desert or tropic, no festivity tree in the game); the
iso tiles with paths, rings, slabs and walls (a feature placed at random); the single graves (no single-grave slot); the
fantasy beasts with no creature in the game (phoenix, unicorn, yeti, griffin, jellyfish, seahorse, owls, fox, cat, bat,
salamander, armadillo, turtle, beetle, squirrel); the crystal ram as a goat and the dark bush as a dead tree (blobs at 11 px);
the twisted-metal altars (scrap at 34 px).

**Judged** with `scripts/playtest84.mjs`: every building's main sprite beside its looks over the footprint with a citizen,
sheets of every prop pool and the ground, and a street of the new looks per people by day and night at 2× and 4×, a forest by
a node. Fixed on the way: 28 looks fronted on the left mirrored; the narrow paintings on 2×2 footprints stood up taller;
the grid-cut mushrooms keyed at 200 (the grid lines had made a frame the largest island). No errors, no missing sprites.

**Verified:**
- `npx tsc --noEmit -p .`, 84 test files with 529 tests (`tests/iteration84.test.ts`: no painting twice across the whole set,
  the pools, every look a real building from v0 without a gap and centred, the wells under 1.5 citizens, the pick stable
  per tile and spread, the earlier paintings kept as v0, the flip list), `npm run build`, `npm run art`.
- **The sim:** unchanged from main; the control seed `npx tsx scripts/balance.ts 42 150` ends at 2,155 folk, as main.

### 4.116 M17 part 1: the marsh (iteration 85)

A sim change, the first part of M17 (§17.1 item 1). NEXT_STEPS items 2 and 3 (the paintings redrawn in code) were dropped
at the user's word: they would have replaced the user's own paintings with code drawings.

**The terrain.** `Terrain.Marsh = 9`. `markMarsh` (`src/sim/terrain.ts`) runs after the ley nodes and the founding
clearing, before the Ruins.
- **Where:** land tiles (shore, grass, meadow or forest) within `MARSH_REACH` (3) of water, low in the height field (the
  nearer the water, the wetter), where its own noise passes `MARSH_NOISE`.
- **Where not:** within `MARSH_FOUNDING` (9) of the founding or 4 of a node.
- **Determinism:** no rng is drawn, so the generator's stream and every later pass are unchanged; only the marsh tiles differ.
- **Size:** patches at the lake's margins and along the river: 2.8–4.8 % of the land on seeds 42–47 and 1 and 7 (seed 42:
  638 tiles).

**The rules.**
- **Building:** nothing is built or zoned on marsh. `isBuildableTerrain` never listed it, and `paintZone` and the bot's
  hand-made filters now name it.
- **Roads and walls:** a road across it is a **causeway** at a bridge's price (`MARSH_CAUSEWAY`, ×4), drawn on the bridge's
  planks. A Warding Wall costs twice its price there, as on hills.
- **Miasma:** every marsh tile adds a small cloud (`MARSH_MIASMA` 0.4 at its centre) within 2 tiles, in `updateMiasma`. Rain
  thins it and the Lyceum damps it, like the works' smoke. It reaches health, happiness and land value through the
  existing readers: a home beside a dense patch reads 15–30 of 255.
- **Reeds:** a marsh tile counts twice as a reed bed for the Reed-Cutters (open shore once).

**The Drainage edict** (`src/sim/marsh.ts`, city-wide, from the Village):
- each day it turns the 3 marsh tiles nearest any building into meadow, ties broken by tile index, and draws no rng;
- it costs 30 crowns a day plus 2 for every 10 marsh tiles left;
- the land loses its reeds.

`marsh.ts` reads `s.edicts.drainage` directly, because `edicts.ts` imports its prices. Old saves keep their saved terrain,
which has no marsh, and the edict is off unless set. There is no new state field (only an optional `stats.marshDrained`).

**The look** (procedural; eda-lore has no marsh sheet):
- `marsh_0..2`: moss and dark standing pools with a glint;
- `reeds_0..2`: reed clumps about a citizen tall, one to three on a marsh tile;
- the dawn mist: soft pale banks drifting over the marsh, strongest at 0.27 of the day and gone 0.08 either side (`MIST_HOUR`, `MIST_SPAN`);
- a moss colour on the minimap, a help entry and the Miasma view's text.

**Verified:**
- `npx tsc --noEmit -p .`, 85 test files with 536 tests, and `npm run build`.
- `tests/iteration85.test.ts` covers:
  - generation: the share, beside water, never near the founding, deterministic;
  - not buildable or zonable;
  - the causeway and wall prices;
  - miasma from marsh only;
  - reeds counted twice;
  - drainage: the nearest tiles, the bill, nothing when off;
  - a pre-marsh save.
- Iteration 10's Chronicle test now answers tales as they come: seed 5's new map brings the white hart by day 23.
- `scripts/playtest85.mjs`, seed 42's densest marsh near the founding:
  - by day, at dawn (the mist) and at night;
  - a causeway of four marsh tiles (810 crowns for 8 tiles of cobble);
  - five days of drainage: 15 tiles drained, shot before and after;
  - no errors, no missing sprites.

**The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`): 252 runs a side, about four hours on three
cores. It was resumed once from the cache when the background job hit its two-hour limit.

| people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
|---|---|---|---|---|---|---|---|
| Vellish | 6 × 7 | 2,029 | 1,930 | +99 (+5.1 %) | 195 (9.9 %) | met | within the noise |
| Grimmen | 6 × 3 | 1,348 | 1,601 | −253 (−15.8 %) | 133 (9.0 %) | met | **seen** |
| Veshari | 6 × 3 | 2,132 | 2,282 | −150 (−6.6 %) | 211 (9.5 %) | met | within the noise |
| Tallowkin | 6 × 8 | 1,837 | 1,986 | −149 (−7.5 %) | 200 (10.5 %) | **not met: at the cap of 8 draws** | within the noise |
| all | | 7,347 | 7,799 | −452 (−5.8 %) | 375 | | **seen** |

- **The marsh costs the cities land by the water.** All four peoples together lose a seventeenth, past the noise; the
  Grimmen lose a sixth, seen on their own row.
- **The gates:**
  - the Vellish reach the Free City in 30 of 42 runs (main 28) and the Beacon of Eda in 11 (main 3);
  - the Grimmen reach the Deephold in 17 of 18 (main 17), but at a median of day 125 against 48, the Underking's Hall in
    5 (main 11) and the Seat in 2 (main 3);
  - the Veshari reach Vesh's Court in 17 of 18 (main 15) and the Sable Crown in 8 (main 11);
  - the Tallowkin reach the Hall of Wicks in 30 of 48 (main 35) and the Lantern of Wicks in 11 (main 11), later (day 113
    against 85).
- **The Grimmen loss, probed on seed 45** (1,125 folk against main's 1,650):
  - **Not the miasma, the causeway price or the missing drainage:** with the miasma set to 0 the seed ends at 1,110 folk,
    with causeways at road price at 1,052. A bot rule that drained the marsh in its square made the six Grimmen seeds
    1,405 against 1,437, so it was reverted.
  - **The map itself:** with no marsh the seed ends at 1,650.
  - **The mechanism:** the city runs short of crowns early (under 300 at days 30–40, against about 1,900), the bot stops
    spreading at radius 28 (main 33, then 43), and the 1,000 folk the Deephold asks come at day 125.
  - **A known issue for a later probe** (HANDOFF). The user chose to ship it as it is.
- **The Tallowkin's floor** is 10.5 % of their folk at the cap of eight draws a seed, not met, as since iteration 64.

### 4.117 M17 part 2: the marsh-wyrms (iteration 86)

A sim change, the second part of M17 (§17.1 item 2, the §8.1 row and the §8.6 tide row). eda-lore's canon has no
marsh-wyrm and no sheet of one, so the game's own design is the source and the sprite is drawn in code.

**The creature** (`src/sim/marshwyrms.ts`; the optional `state.marshWyrms`, so old saves need no default):
- **When:** on Bloom's first day each body of water of at least `WYRM_MIN_BODY` (60) tiles gets
  `1 + floor(tiles / WYRM_TILES)` wyrms (400 tiles a step), at most `WYRM_MAX` (3). They go back to the deep on the Ember's
  first day, and their lairs and nests go with them.
- **Each day in Bloom:** a wyrm swims up to `WYRM_SWIM` (6) tiles through its own water. A wyrm without a lair has a
  `WYRM_LAIR_CHANCE` (1 in 5) of lairing under the nearest bridge within `WYRM_LAIR_REACH` (12). A bridge is a road on
  water that is not a ford.
- **Lairs:**
  - **The crawl:** a lair tile runs at `WYRM_CRAWL` (a quarter) of its speed for the carts and the folk; `roadSpeedAt`
    reads it, so the A* routes round it where it can.
  - **Driven off:** a lair where the Veshari Hall's fire coverage is `WYRM_DRIVE` (0.3) or more is left, and the wyrm
    swims away.
  - **The Quay's ward:** no wyrm lairs within `QUAY_WARD` (10) tiles of a Quay, and a Quay raised later ends a lair in it.
- **Nests:**
  - On Bloom's 20th day each wyrm with marsh within 4 tiles nests on the nearest marsh.
  - A nest within `NEST_QUAY_REACH` (8) of a Quay gives the city a tide egg, at most one a Bloom: the bargemen bring it in.
  - With no free cradle, the Crown's assessor pays `NEST_EGG_PRICE` (1,500 crowns).
  - Tide eggs now have their second source (§8.6).
- **The rng:** every roll is a side stream, `hashString(seed:day:marshwyrm)`. The main stream never moves for the wyrms;
  only their effects do (the crawl, a tide egg, a message).

**The look and the voice:**
- **Sprites:** `marshwyrm_0..1`, a teal serpent's back in three humps with a raised, finned head and a faint eye at night;
  `marshwyrm_lair`, the wyrm coiled in the shallows beside the bridge.
- **Messages:** one when the wyrms come, one for a lair and one for a wyrm driven off, each with its place in the Chronicle.
- **Advisor:** a line while a lair stands.
- **Ledger:** the quest "Clear the bridge" (400 crowns).
- **Annals:** rows for lairs, wyrms driven off, tide eggs from nests and the marsh drained.
- **Also:** a help entry, a dev command (Hazards: "Marsh-wyrm here"), and the Quay's and the Veshari Hall's text.

**Verified:**
- `npx tsc --noEmit -p .`, 86 test files with 541 tests, and `npm run build`.
- `tests/iteration86.test.ts`:
  - the wyrms come with Bloom by the size of the water and go with the Ember;
  - a lair at a quarter speed;
  - the Veshari Hall drives a wyrm off, and a Quay refuses a lair and ends one;
  - a nest by a Quay gives a tide egg or the Crown's price, and away from one nothing;
  - ten days of wyrms leave the main rng where it was;
  - an old save loads.
- The fresh game's stats start the four new counters at 0 (the Annals test reads every counter).
- `scripts/playtest86.mjs` on seed 42 in Bloom:
  - four wyrms in the water;
  - a cobbled bridge over the river with a wyrm laired under it, by day and at night;
  - a Veshari Hall raised beside it (its crew and water given, as a grown city has them): the next day the lair is gone,
    the message says why, and "Clear the bridge" completes;
  - no errors, no missing sprites.

**The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`): 132 runs a side, resumed once from the
cache when the background job hit its two-hour limit.

| people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
|---|---|---|---|---|---|---|---|
| Vellish | 6 × 7 | 2,067 | 2,029 | +37 (+1.8 %) | 195 (9.5 %) | met | within the noise |
| Grimmen | 6 × 4 | 1,354 | 1,371 | −17 (−1.2 %) | 121 (8.9 %) | met | within the noise |
| Veshari | 6 × 3 | 2,232 | 2,132 | +100 (+4.7 %) | 178 (8.2 %) | met | within the noise |
| Tallowkin | 6 × 8 | 1,944 | 1,837 | +106 (+5.8 %) | 203 (10.7 %) | **not met: at the cap of 8 draws** | within the noise |
| all | | 7,596 | 7,369 | +226 (+3.1 %) | 354 | | within the noise |

- **The wyrms cost the bot's cities nothing the bar can see.** A lair slows one bridge for part of one season, and the bot
  builds few bridges and many Veshari Halls.
- **The gates** (this tree, main in brackets):
  - Vellish: the Free City 30 of 42 (30), the Beacon 12 (11);
  - Grimmen: the Deephold 20 of 24 (23), but at a median of day 57 against 125; the Underking's Hall 6 (6), the Seat 3 (3);
  - Veshari: Vesh's Court 18 of 18 (17), the Sable Crown 10 (8);
  - Tallowkin: the Hall of Wicks 33 of 48 (30), the Lantern of Wicks 16 (11).
- **The Tallowkin's floor** is 10.7 % at the cap, not met, as since iteration 64.
- **The marsh's Grimmen loss of iteration 85 stands:** main's Grimmen row here is iteration 85's (1,371 on four draws a seed).

### 4.118 The dev board, part 1: content as data (iteration 87)

Tooling at the user's ask (2026-10-08): a local dev webpage, like the user's Azyrion Tamer board, to add and edit game
elements, hand tasks to Claude, track the work and, later, write asset prompts and start the asset pipelines. Three
iterations (NEXT_STEPS items 1 and 2 hold the other two). It goes ahead of the milestones without reordering them. The
recipe is the `game-dev-board` skill (`.claude/skills/game-dev-board/SKILL.md`).

**Content as data:**
- The buildings (82), roads (4), milestones (9) and relic sets (4) moved from TypeScript arrays to `src/data/content/`
  (`buildings.json`, `roads.json`, `milestones.json`, `relics.json`). The zone houses' `Z(...)` helper calls are written
  out in full. `zone` and a road's `type` are stored by name (`"hearth"`, `"cobble"`) and mapped to the enums on load
  (`ZONE_OF`, `ROAD_TYPE_OF` in `catalog.ts`).
- `catalog.ts` and `relics.ts` export the same `BUILDINGS`, `BUILDING_BY_KEY`, `ROADS`, `MILESTONES` and `RELIC_SETS`,
  with the same types, so no caller changed. The loaded values were compared with the old arrays: identical, key order
  included.
- The folder is under `src/data`, so the bar's sim key (`SIM_DIRS`) covers every content edit.
- `src/sim/contentCheck.ts`'s `validateContent` checks:
  - keys: unique, lower case;
  - categories, services, peoples and relic sets: known;
  - `unlock`: a milestone, or `NEVER` (99: a guild hall comes with its charter);
  - every milestone `unlocks` entry: a building, road, zone or people, or the `lantern_wonder` slot each people's swap
    table fills;
  - milestones: rising folk;
  - zone buildings: three capacities.
- Edicts, events, quests and guilds keep their text beside their logic (`costPerDay`, `when`, `apply`, `done`). They stay
  in code; part 3 moves their text to JSON and keeps the logic by id.

**The board** (`tools/devboard/`, `npm run devboard`, http://127.0.0.1:8771; Node's standard library through tsx, a
plain HTML and JS page):
- **Tabs:** Buildings, Roads, Milestones and Relic sets are editable; Edicts, Events, Quests and Guilds are read-only,
  scanned from their TypeScript (id, title, text, line).
- **Building cards:**
  - the looks the game would show, pixelated: the zone houses by level and variant, others `b_<key>` and its `_vN`.
    Imported sprites come from `public/art/sprites.json`; the others are drawn by the painter (`art.ts` renders them to
    PNG in the temp folder);
  - an art status: `needs art`, `N imported` or `drawn in code`, the `art/sources.json` entries, unchecked ones, and
    paintings missing from `inspirations/`.
- **Forms** are built from the values, with choices from the string unions in `src/` and `tools/devboard/hints.json`.
- **Safe writes:**
  - a save rewrites only the changed span of the JSON (`jsonspan.ts`), so a one-number edit is a one-line diff;
  - a diff preview comes first;
  - a stale edit is refused (409);
  - undo restores from backups outside the repository, each entry by a stable id;
  - files are replaced atomically;
  - delete and rename are refused while a key is used in the content or quoted in `src/`.
- **After every save:** `validate.ts` runs `validateContent` and the rule of `tests/sprites.test.ts` (every non-zone
  building has a `b_<key>` drawn in code) in a fresh process. A new building shows "needs art" until it has one.
- **The guards:** 127.0.0.1 only, the Host header checked, writes need JSON and an `X-Dev-Board` header.

**Later (the plan of iteration 87):**
- Part 2 (NEXT_STEPS 1): the tracker (NEXT_STEPS, GitHub milestones and issues, the balance cache) and Send to Claude
  (Claude Code on the user's PC, or a GitHub issue).
- Part 3 (NEXT_STEPS 2): the prompt studio with "Refine with Claude", and the pipelines registry. The paintings importer
  runs from the board. Tripo Studio and Aseprite start as hand-offs and become buttons once their pipelines are written
  into the docs (the user's plan).

**Verified:**
- `npx tsc --noEmit -p .` (now including `tools/`), the unit tests with `tests/iteration87.test.ts` (the content is
  valid; the enum mapping; a duplicate key, an unknown unlock, a zone house without levels and an unknown milestone unlock
  are caught), and `npm run build`.
- `scripts/playtest87.mjs`:
  - this build's build menu against main's, every tab, for all four peoples at the last milestone: 84, 86, 85 and 86
    tools, identical in name, cost and lock;
  - a Ley Spire placed by the founding stake, with its sprite;
  - no errors.
- `npm run devboard:selftest`:
  - each of the 95 entries edited on a temp copy (one line changed) and restored byte for byte;
  - duplicate then delete leaves each file as it was;
  - the refusals (a used key, a stale hash, an existing key, a bad key, a path outside the content folder, a foreign
    Host, writes without the header);
  - undo restores.
- Playwright on the running board:
  - every form read back untouched equals its data (95 of 95);
  - a cost edit is a one-line diff, and undo restores the file;
  - a duplicated building shows "needs art" and its one problem, and its delete leaves the file clean;
  - no page errors.

**The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`): 132 runs a side, main's from the cache.

| people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
|---|---|---|---|---|---|---|---|
| Vellish | 6 × 7 | 2,067 | 2,067 | +0 (0.0 %) | 205 (9.9 %) | met | identical |
| Grimmen | 6 × 4 | 1,354 | 1,354 | +0 (0.0 %) | 126 (9.3 %) | met | identical |
| Veshari | 6 × 3 | 2,232 | 2,232 | +0 (0.0 %) | 181 (8.1 %) | met | identical |
| Tallowkin | 6 × 8 | 1,944 | 1,944 | +0 (0.0 %) | 206 (10.6 %) | **not met: at the cap of 8 draws** | identical |
| all | | 7,596 | 7,596 | +0 (0.0 %) | 365 | | identical |

- **Every run matches main, folk for folk.** The gates, depot days and road and caravan crowns match too: the move
  changed nothing the simulation reads.
- **The first bar had two Grimmen runs differ** (seed 42, draws 0 and 1: 1,385 and 1,757 against main's 1,512 and 1,386).
  - **The cause:** the board's browser test edited `buildings.json` while those runs were starting (a cost changed and
    undone, a building made and deleted), and the runs read the edited file.
  - **The fix:** run fresh on both trees, they gave main's numbers exactly. The two cached runs were dropped and run again.
  - **The lesson:** don't edit the content (on the board or by hand) while a bar runs from the same checkout. The bar
    keys a dirty tree by its files' contents when it starts, but each run reads the files when it starts.
- The Tallowkin's floor is 10.6 % at the cap, not met, as since iteration 64.

### 4.119 The dev board, part 2: the tracker and Send to Claude (iteration 88)

Tooling, NEXT_STEPS item 1 (the user's ask of 2026-10-08). The board's project side: what is planned and done, GitHub's
milestones and issues, the balance results, and a way to hand any task to Claude. No sim file changed, so the control
seed is the balance check (rule 4).

**The tracker** (`tools/devboard/tracker.ts`, read-only):
- **Next steps tab:** the open list of `docs/NEXT_STEPS.md` in order, and every "Done in iteration NN", newest first. A
  `§4.NN` chip opens that DESIGN section (`designIndex` lists the `### 4.NN` headings in the file's own order; §4.28
  sits after §4.43, so the index keeps the file's order and the self-test checks each is found once).
- **GitHub tab** (`github.ts`): milestones with their progress, issues filtered by state, milestone and label; new, edit,
  comment, close, a new milestone and closing one. Through the logged-in `gh api`, the repository from `origin`, cached
  for 12 s; on an error the last good data stays, marked stale, and a missing `gh` gives a line saying how to install it.
- **Balance tab:** each `balance/cache` file as a chart of mean folk per people with ±2·SE whiskers (the seed means) and a
  table per seed and draw (folk, last gate and its day). The file whose sim key is the working tree's is marked "this
  tree" (`simKeyOf` from `scripts/tableStats.ts`).

**Send to Claude** (`session.ts`, a port of the Azyrion Tamer board's): a dialog with the task (editable) and three ways out:
- **Claude Code on this PC:** the `claude-cli://open` link with the checkout as `cwd` when the CLI's handler is
  registered (Windows registry); else a new console running `claude "<task>"`; else the task goes to the clipboard with a
  line on installing the CLI. A task over the link's 5,000 characters, or for a `.cmd` shim, goes to a file in the temp
  folder and the prompt points at it.
- **GitHub issue:** filed with the label `dev-board` (made once), for a cloud session to start from.
- **Copy.**

It is offered on every next-steps item (the repo's own first message: "Read CLAUDE.md and docs/HANDOFF.md, then continue
with the next item …"), every issue, and every content card and editor (the entry's file, art status, checks and JSON). A
send makes no commits.

**The "New element" composer:** a kind (building, road, edict, event, quest, creature, other), a name, the idea, numbers,
peoples and whether art is wanted, written as a task in the repo's process. For a building, "Create the entry now" saves
it to `buildings.json` from the Ley Spire's data first, so the task says the data exists and what still needs code and
art; its card shows "needs art".

**Verified:**
- `npx tsc --noEmit -p .`, the unit tests, `npm run build`; the control seed (`npx tsx scripts/balance.ts 42 150`) equal to
  main's: 2,442 folk, Free City on day 124, on both trees. The unit tests: 545 of 545.
- `npm run devboard:selftest`: the NEXT_STEPS parser on a fixture and the real file, every DESIGN section indexed once,
  the four balance files read with four peoples each; `toClaude` (terminal route with its task file, link route with a
  long task's file pointer) and `toIssue` (the label) against a fake `gh`, `claude`, terminal and opener first on PATH;
  the guards on every new POST route.
- `scripts/playtest88.mjs` on the board run with the fakes: 10 open items and 85 done iterations; a DESIGN section opens;
  a send reaches the fake terminal with the first message, and an issue is filed with its label; the GitHub tab, the
  four balance charts and "this tree"; a card's task names its file; the composer creates a building that shows "needs
  art", and its delete leaves `buildings.json` byte for byte as it was; no page errors.
- Not checked here: the `claude-cli://` link and the console on Windows. The code path is the Tamer board's, which works
  on the user's PC.

### 4.120 The dev board, part 3: asset prompts, pipelines and the text as data (iteration 89)

Tooling, NEXT_STEPS item 1, the last of the board's three parts (the user's ask of 2026-10-08): "the asset prompt studio
with 'Refine with Claude', and the pipeline buttons. The paintings importer will run straight from the board. Tripo
Studio and Aseprite start as hand-offs to Claude until you write those pipelines into the docs." With it, iteration 87's
plan: the text of edicts, events, quests and guilds as data.

**The text as data:**
- `src/data/content/text/{edicts,events,quests,guilds}.json` hold every fixed string by id: 15 edicts (name, desc,
  flavor), 52 events (title, text, each choice's label and desc), 140 quests (chapter, title, hint) and 4 guilds (name,
  seal, desc, boon, strike, petition). That is 822 strings in all.
- The code reads them by id (`EVENT_TEXT.pilgrims.title`, `EVENT_TEXT.pilgrims.choices[0].label`). Each JSON is imported
  typed, so a gap fails the type check.
- Text worked out for the city stays in code, beside its logic: `textFn`, a choice's `desc` function, what `apply`
  returns, and a template that quotes a tuning constant (the Drainage edict's numbers).
- **How it moved:** a one-off script on the TypeScript AST, not kept. Every text field of the four modules was dumped
  before and after (73,339 bytes, every definition in order): **byte for byte identical**.
- `tools/devboard/textCheck.ts` reads both sides as files: every path the code reads must be a non-empty string, and
  every string must be read. It runs in the board's checks and in `tests/iteration89.test.ts`.
- **On the board:** the four kinds became editable tabs. They are text only: a new entry, a delete or a rename is
  refused, since each needs its logic in code by id (Send to Claude).

**The prompt studio** (`tools/devboard/prompts.ts`): an Art button on every building card opens its panel. The Art &
pipelines tab opens any other sprite by name (a prop, a cart).
- **The brief:** your words.
- **The draft,** composed from the house rules:
  - one subject on plain white (what the importer keys out);
  - the isometric 2:1 view;
  - the front on the right face (§4.90);
  - the footprint, and the height in citizens from the yardstick (§4.109): 1.5 for a well, 2.5 for a shrine, 2.8 for a
    one-tile shed (3.2 Tallowkin), 5.5 for a hall, free for a wonder;
  - the eda-lore sheets' look;
  - a one-people building's material.
- **Refine with Claude:** `claude -p` runs in the background with the draft, the brief, the building, its people's lore
  line and the lore paragraphs that name it (`docs/EDA_CITY_LORE.md`, `EDA_LORE.md`). The task goes on stdin, never in
  the arguments. The answer (PROMPT / NOTE) fills the prompt and is saved.
  - Without the CLI the same task opens in Send to Claude (§4.119), so a cloud session or a GitHub issue can do it.
- **Kept in `art/prompts/<sprite>.json`:** brief, draft, prompt, note, the last ten refinements, and the pipeline
  chosen. Saves are backed up and undoable (undo of a new prompt removes it). The check holds each file to a sprite or
  building that exists.

**The pipelines** (`tools/devboard/pipelines.json`, `pipelines.ts`): a registry; a pipeline runs on the board or hands
off.
- **The paintings importer runs on the board,** the steps of HANDOFF "The pipeline":
  1. Drop a PNG (saved into `inspirations/<folder>/`, never over another), or choose a painting already there.
  2. Its islands (`importSprites.mjs --islands`) are drawn as boxes over the sheet; click one, and raise `white` for a
     grey shadow.
  3. The `art/sources.json` entry: footprint, `targetHeight` from the yardstick, `anchor`, `flip`, `shift`. It is saved
     through the lossless writer as the Art sources kind, keyed by position: a sprite's switched-off entries stay
     beside its live one. A new check refuses two live entries of one name.
  4. **Import:** `importSprites.mjs --check` runs one at a time; its log streams to the page, then the new sprite shows
     beside the code one, with the check sheet.
  5. **Checked:** a button marks the entry, and Send to Claude hands over the art tests and the commit.
  - A full import takes about 90 s here, and leaves every committed sprite byte for byte as it was when nothing changed.
- **Tripo Studio and Aseprite hand off:** a button writes the task (the prompt, the sprite, the house rules, and "work
  the pipeline out with me and write it into docs/HANDOFF.md") and opens Send to Claude. Once a pipeline is written down,
  its entry in `pipelines.json` gets `runs: "board"` and its steps, with no page code.
- The importer's panel warns that the balance bar must not run while an import or an entry save does (§4.118).

**Verified:**
- `npx tsc --noEmit -p .`, the unit tests (88 files, 550 tests; `tests/iteration89.test.ts`: the text check over the
  real files, a gap and a stray caught, the definitions carry their text; the yardstick and the draft's rules), and
  `npm run build`.
- **The text dump:** every text field of the four modules, before and after the move, byte for byte identical.
- **In the game:** the Edicts panel of this build against main's build, for all four peoples at the last milestone:
  the same text, character for character (`scripts/playtest89.mjs`, `GAME=1`).
- `npm run devboard:selftest` (902 entries edited and restored, nine kinds):
  - each text kind edited and restored byte for byte, with new, delete and rename refused;
  - the text check over the real files, with a missing entry and a stray caught;
  - a prompt written, edited, refused when stale, and undone (undo of a new prompt removes it); paths outside refused;
  - paintings saved by a clean name and never overwritten, with non-PNG and paths outside `inspirations/` refused;
  - Refine against a fake `claude -p`: the task on stdin, the answer parsed;
  - the importer run on a copy with one painting and one entry: islands listed, the sprite in the manifest, a second
    run refused while one runs;
  - the guards on every new POST route.
- `scripts/playtest89.mjs` on the board, with a fake `claude`, on the Quarry:
  - a brief, the draft holding the rules, Refine (the prompt and note saved to `art/prompts/b_quarry.json`, read back
    on reopening);
  - a painting dropped (saved into `inspirations/board/`), island 0 clicked, the entry added, the import run (79 s,
    done), `b_quarry` in the manifest and on the card, marked checked;
  - the Tripo hand-off's task (the prompt, "not written into EdaBuilder's docs yet");
  - the Art & pipelines tab;
  - the Edicts tab text only (no Duplicate, no New, no Delete);
  - an edict's name edited on the board, read back by the game's code in a fresh process, then undone with the file
    clean;
  - no page errors.
  - The test art was then reverted.
- **Not checked here:** `claude -p` with the user's login, and the Windows file picker. The fake proves the call, the
  stdin and the parsing.

**The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`): 132 runs a side, main's from the cache.

| people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
|---|---|---|---|---|---|---|---|
| Vellish | 6 × 7 | 2,067 | 2,067 | +0 (0.0 %) | 205 (9.9 %) | met | identical |
| Grimmen | 6 × 4 | 1,354 | 1,354 | +0 (0.0 %) | 126 (9.3 %) | met | identical |
| Veshari | 6 × 3 | 2,232 | 2,232 | +0 (0.0 %) | 181 (8.1 %) | met | identical |
| Tallowkin | 6 × 8 | 1,944 | 1,944 | +0 (0.0 %) | 206 (10.6 %) | **not met: at the cap of 8 draws** | identical |
| all | | 7,596 | 7,596 | +0 (0.0 %) | 365 | | identical |

- **All 132 runs match main's:** folk, gates, treasury and depot day, run for run. The sim key changed (the code reads
  its text from JSON) and nothing the simulation does did.
- The Tallowkin's floor is 10.6 % at the cap, not met, as since iteration 64.

### 4.121 The slow first load: the sprites ship as one sheet (iteration 90, a hotfix)

The user's report after iteration 89: "The game does not load right now", then "after some time it loads, it just takes
ages". No sim code was involved.

**The cause:**
- `SpriteAtlas.mergeOverrides` fetched every imported sprite PNG **one after another** (`await loadImage` in a loop).
- The eda-lore swap (iterations 82 and 84) raised the count from 227 files to 1,097: 834 manifest entries, plus their
  glows and mirrored twins.
- Locally that costs about 5 s. Over the internet each file waits a full round trip, so the page stayed black for a
  minute or two before `boot()` created the game.

**The fix:**
- **Packed at build time.** `npm run art` (`scripts/importSprites.mjs`) still writes the single PNGs. It then packs every
  distinct image into sheets `public/art/sheets/sheet_N.<hash>.png`, at most 2048 × 2048 each (`packSheets` in
  `scripts/lib/sprite.mjs`). Sprites, glows and mirrored twins are all packed; aliases and hop frames share their
  source's place. Today's 1,060 images fit **one sheet, 2048 × 612, 609 KB**.
- **What the manifest gains.** `sheets: [{ file, w, h, hash }]`, and on each entry `sheet, sx, sy`, plus
  `gsheet, gx, gy, gw, gh` for its glow. `file` and `glow` stay, so the dev board and the tests that read the single PNGs
  work as before.
- **Loaded at once.** The atlas fetches the sheets together (`Promise.all`). A sheet's name carries its content hash, and
  the manifest is fetched `no-cache`, so no cache and no host can hand a new manifest an old sheet. An old manifest asks
  for a sheet that is gone, gets a 404, and falls back to the single files below.
- **The same atlas as before.** Each entry is cut from its sheet into the same 1,024-wide shelf packing as before, in the
  same order and at the same sizes, so the atlas comes out **pixel for pixel the same**.
- **The fallbacks:**
  - A manifest without sheets (an older one) loads the single files, now 24 at a time instead of one at a time. A single
    file is asked for with the hash of the sheet that holds it (`?v=`), so the browser's cache cannot hand back an old
    one.
  - A sheet that fails to load, or loads at the wrong size, sends only its own entries to the single files.
  - A single file that fails leaves its drawn sprite, as before.
- **Never a blank screen.** `index.html` shows a line ("Lighting the wards…", "Unpacking the sprites…", "Raising the
  town…") until the game exists. In the fallback it counts the sprites up ("… n %", never backwards). If the start
  fails, the line says why; if the game's script itself fails to load (a stale page after a deploy), it says to reload.
  It sits above the title screen and never takes a click.

**Verified:**
- `npx tsc --noEmit -p .`, the unit tests (89 files, 557 tests) and `npm run build`. `tests/iteration90.test.ts` checks:
  - the manifest's sheets are at most 2048 × 2048, and each hash is its file's;
  - each sheet's file name carries its hash;
  - every sprite and every glow in its sheet equals its own PNG, byte for byte;
  - files that share a name share one place in the sheet;
  - `packSheets` never overlaps two items, starts a new sheet when one is full, and refuses an item too big for a sheet;
  - in a stand-in browser:
    - with sheets, only the sheets are fetched, and every sprite and glow is cut from its own place in them;
    - a failed sheet, or no sheets at all, loads the single files at most 24 at a time, into the same rects, with a
      progress count that never goes back;
    - a sheet of the wrong size is refused like a failed one;
    - an entry whose glow sheet fails loads body and glow as single files, while the others are still cut;
    - a failed single file leaves the drawn sprite in place; a failed glow file leaves the sprite without its glow.
- `npm run art` run again: every committed sprite PNG came out byte for byte the same; only the manifest and the new
  sheet changed.
- **`scripts/playtest90.mjs`,** main's build (port 4174) against this one (4173):
  - **The load on a throttled line** (CDP: 100 ms latency, 10 Mbit/s, no cache), from navigation to the game:

    | build | time to the game | requests | transferred |
    |---|---|---|---|
    | main | 118.5 s | 1,102 | 1.2 MB |
    | this | **2.0 s** | **6** | 0.9 MB |

    (A first run, before the review fixes: 119.4 s against 2.6 s.) The pass condition requires the sheet itself, not
    the fallback: fewer than 40 requests and no failed sheet.
  - **The atlas, read back from both builds:** the same size (1024 × 3319) and the same pixels across the whole canvas.
    All 1,250 sprites (834 imported) have the same rect and the same body and glow pixels. No sprite exists in one
    build and not the other.
  - The loading line seen while the sheet arrives, and gone once the game stands. A town of 24 houses by day, all its
    sprites drawn (`shots/iter90_loading.png`, `iter90_town_2x.png`).
  - **The failure paths in a real browser:** with the sheet refused, the single files load instead (3.0 s unthrottled)
    and all 834 imported sprites arrive. With the game's script refused, the line reads "Wardlight could not load.
    Reload the page."
  - No page errors, no missing sprites.
- **The review** (a workflow, five lenses: packing, cache safety, failure paths, tests, the whole diff) raised 17
  findings, none a blocker. All 17 were fixed in this iteration:
  - the hash moved from `?v=` into the sheet's file name (GitHub Pages ignores queries, so an old manifest could cut
    from a new sheet of the same height);
  - the single files are asked for with the hash of the sheet that holds them;
  - the progress count can no longer jump back;
  - the line paints "Raising the town…", sits above the title screen, and reports a script that failed to load;
  - the tests now cover every fallback, and the playtest requires the sheet path.
  The adversarial verification was stopped part way: its verifiers read the working tree, where the fixes had already
  landed, so they judged the fixed code rather than the reviewed commit.
- **The control seed** (`npx tsx scripts/balance.ts 42 150`): 2,442 folk at milestone 7, the same as main's run, whose summary matches character for character. `src/sim` is
  untouched.
- **Not checked here:** the deployed site itself (github.io is blocked from this sandbox). The throttled run stands in
  for it.
- The single PNGs still ship in the build (4.3 MB), though the game no longer fetches them; the tools and the tests read
  them. Fifteen of them (glowcap glows from an earlier import) appear in no manifest; the importer never deletes.

### 4.122 The Tripo Studio and Aseprite pipelines, written into the docs and run from the board (iteration 91)

Tooling, at the user's ask: "Let's write the pipelines into the docs" (2026-10-09). The user chose EdaBuilder and Ossuary,
with both Tripo routes as in their Azyrion Tamer project. Until now the dev board handed Tripo Studio and Aseprite off to
Claude (§4.120). The steps come from Tamer, where they are proven: docs 06 §0 and §2b, docs 04 §2 and §11 there.

**The doc:** `docs/ART_PIPELINES.md`:
- the house rules (the yardstick, the facing rule, what is committed);
- the paintings importer;
- Tripo Studio:
  - the two routes side by side, and the prompt rules;
  - Route 1: you generate in Studio and drop the pick on the Art panel;
  - Route 2: Claude generates through the Tripo CLI on your Studio credits;
- Aseprite: trace, edit, export, review, install;
- what the board runs.

HANDOFF's art section points to it.

**Tripo, Route 2 on the board** (`tools/devboard/tripo.ts`):
- The login is yours, done once in your own terminal (`tripo auth login`); the board only asks `tripo auth whoami`.
- "Generate 4" runs `tripo image "<prompt>" -m gemini_3.1_flash_image_preview -n 4 --scale 1:1`. The CLI starts without a
  shell (on Windows the package's own entry runs under Node), so no shell ever reads the prompt.
- **The CLI's 0.8.1 bug:** the task id is read from its "Task created" line, then `tripo image get <id> --output-format
  json` is polled until success.
- The four images go to `art/tripo/<sprite>/round<n>/`, which is ignored by git.
- The page shows a contact sheet, each image measured on a canvas: how much is white, whether the corners are flat white
  (what the importer keys out), the size.
- "Use this one" saves the pick as `inspirations/tripo/<sprite>.png`. A canvas makes it a PNG, since Tripo may send WebP
  or JPEG; the project has no decoder for those, and a dependency was not worth it. Then the importer's own steps follow.
- One round runs at a time; a prompt over 1000 characters is refused.

**Aseprite** (`scripts/aseprite.ts`, `scripts/aseprite/build_sprite.lua`; ported from Tamer's `redraw.py`, one image a
sprite):
- **trace:** makes the sprite as the game has it into `art/aseprite/<sprite>.aseprite`:
  - indexed, with index 0 clear;
  - the colours cut by median cut in Lab;
  - the darkest colour is the ink, and a darkened copy is added when the sprite has no outline;
  - the silhouette's edge is in ink; specks and stray pixels are removed.
- The `.aseprite` is the source of truth from then on: it is never traced over without `--force`.
- **export:** writes the PNG and an 8× preview.
- **install:** happens only after the review. The board asks for a tick that you have seen the 8× preview.
  - The export becomes an `art/sources.json` entry with the new importer key `pixel: true`: taken as drawn (cropped and
    anchored, never keyed, scaled, sharpened, quantized or outlined).
  - The old entry is switched off and kept, and the importer runs.
- The board runs trace, export and install in the background, one at a time together with the importer, and shows the
  log.

**The prompt rules reach the draft:**
- The board's draft broke its own new rules: 1011 characters for the Quarry, over Tripo's 1000, with "no text, no drop
  shadow" in it.
- The house rules are now short and positive, and the brief gives way first, so every building's draft fits. A test
  holds all 82.
- Refine with Claude asks for under 1000 characters and positive phrasing.

**Ossuary,** the same day: `docs/assets.md` gains the Tripo CLI and Aseprite in its tools table, the two routes to the
concept images (image-to-3D, texturing and rigging stay with the owner in Studio), and an Aseprite section for drawn 2D
pixel art.

**Verified:**
- `npx tsc --noEmit -p .`, the unit tests (90 files, 568 tests; `tests/iteration91.test.ts`):
  - `pixel: true` keeps a drawing pixel for pixel through the importer, in a temp folder;
  - the trace's ink, edge, specks and palette size;
  - install switches the old entry off and replaces its own;
  - the CLI's task line in three spellings, and its result nested three ways;
  - every building's draft under 1000 characters and free of negations.
- `npm run build`.
- The control seed (`npx tsx scripts/balance.ts 42 150`): 2,442 folk, as on main. No file under `src/sim`, `src/data` or
  `src/core` changed.
- `npm run art` on this tree writes main's sheet byte for byte (the same hash, `63fbf930aed6`): no entry uses `pixel`.
- `npm run devboard:selftest`, against a fake `tripo` and a fake Aseprite:
  - whoami;
  - a round past the CLI's bug: polled, four images downloaded from a local server, kept in `round1`;
  - the arguments (Nano Banana 2, four, 1:1, then get by task id);
  - one round at a time, and over-long prompts and bad names refused;
  - trace, the `--force` guard, export;
  - the guards on the new routes.
- `scripts/playtest91.mjs` on the board with the fakes, on the Quarry:
  - logged in, Generate 4, the contact sheet measured ("white flat", 57 to 68 % white, 1024×1024), Use this one, its
    islands drawn;
  - Aseprite trace, export, the three previews; install refused before the tick, then installed (`pixel: true`, the
    importer run, `b_quarry` in the manifest);
  - no page errors. The test art was reverted.
- **Not checked here:** the real Tripo CLI with your login, and real Aseprite. Both run on your PC. The fakes answer as
  Tamer's docs say the tools do.

### 4.123 The quests that never complete (iteration 92)

NEXT_STEPS item 1, from the user's playtests: "See the Watch at work" never completed, more than once.

**The audit:**
- **The census.** `scripts/questCensus.ts` (new) plays a bot game and lists every task done, with its day, and every task
  never done, noting whether its `when` ever held. Ten games of 200 days: the four peoples on the valley, two seeds each,
  and the Vellish on the island and on one node.
- **The trace.** A workflow read all 140 tasks and followed each `done` into the sim to where its counters change. It
  sorted them: completable by deliberate play, waiting on a threat that good play prevents, fed by a shared counter,
  unreachable, or misleading. Each flag went to a second reader told to refute it.
- **The result:** 16 flagged, **13 confirmed**. Three were refuted:
  - f_hamlet: the top bar names the gate;
  - b_wisps: completable as its hint says;
  - q_rider: fires are a standing hazard that no city removes.
- A task the bot never does (a rename, an edict, a wonder) is not a defect by that alone, and stays as it was.

| task | what was wrong | the fix |
|---|---|---|
| w_patrol "See the Watch at work" | waited for a watchman to kill a hound or lay a restless, which a well-kept city prevents; sextons' layings counted too | `stats.watchRounds` (a patrol leg walked); done on a round or a kill |
| w_sexton (now "See a sexton walk the rounds") | its own Boneyard keeps the restless from rising | `stats.sextonRounds` (a round, brawl days aside, or a laying) |
| v_flood "Weather the first flood" | a Great Weir raised before the first Hush ends means no flood, ever | also done with a Weir standing once a Hush has ended (day 120) |
| k_duel | only a hostile flyover brings the duel, and paying tribute or binding the wyrm prevents it | opens only while the wyrm sleeps or wakes, never bound; the hint names the refused tribute |
| w_wyrm "Clear the bridge" | stayed open forever once any wyrm had laired | open only while a wyrm lairs; a drive-off still pays |
| v_egg | a Grimmen Hatchery or Veshari Tide Pool could never take the vein egg | the wyrm's own line nests in any people's cradle |
| k_council | counted petitions, and a contented council never petitions | done on a lit Guildhall; k_boon and k_hall open on the same |
| k_cross | `canBreed` weighed only the first two dragons; a Great Cradle of ember, ember, vein never bred | every pair is weighed |
| k_blood | two crossed dragons of one first line were refused | they breed when their second lines differ; mirror crosses breed as before; a plain dragon with a crossed one of its line does not (its egg would copy the parent) |
| o_full | done needs four markets, which the text never said; the task vanished while the shelves were full | title "Four markets, none short for five days"; open while there are four markets |
| g_burn | for the Grimmen a Stone Ward does not burn | the hint names the stone-sexton's cutting |
| v_find (now "Stir the Sleeping Wyrm") | the hint said to click the node, which records nothing, and the chain after it needs the wyrm stirred | the hint says how (a lit spire within 6) and when to stop |
| c_beacon | the hint demanded the Lantern of Vell, which three peoples cannot build | "your people's gate (the top bar)"; the "Show me" to the Lantern is gone |

- Ids are unchanged, so tasks done in a save stay done.
- The new counters have Annals rows and defaults in `world.ts` (a save fills its stats from a fresh game).
- The text lives in `src/data/content/text/quests.json`.

**The review** (a workflow, three lenses: the logic of each fix, saves and determinism, the tests; each finding checked
by a refuter) confirmed six findings, all fixed:
- the first breeding rule refused mirror crosses (vein+ember with ember+vein), the natural route to a trueblood;
- it also let a plain dragon breed a copy of a crossed one;
- the Annals coverage test and an older sexton test failed;
- the breeding tests never laid an egg;
- the bridge test's last assertion was vacuous.

**Verified:**
- `npx tsc --noEmit -p .`, the unit tests (90 files, 573 tests) and `npm run build`. `tests/iteration92.test.ts` has a
  test per fix, among them:
  - a quiet city with a Watch Post completes w_patrol in days, with no kill;
  - a Boneyard completes w_sexton with no restless;
  - the Weir; the bound wyrm; the lair ending, with a drive-off still paying;
  - every cradle takes the vein egg; a lit Guildhall seats the council;
  - eggs actually laid by `dailyBreeding` for the Great Cradle, the trueblood and the mirror cross;
  - the texts.
- `npm run devboard:selftest`: OK.
- **`scripts/playtest92.mjs`** in the browser: a new city with a Watch Post and a Boneyard on its road completes "See
  the Watch at work" and "See a sexton walk the rounds" on day 1, with no hound killed and no restless laid. The ticker
  shows both, +400 crowns each (`shots/iter92_done.png`).
- **The census again:** the same ten bot games, tasks done out of games where they apply:
  - w_patrol 4/10 → **10/10**; w_sexton 0/10 → **10/10**; v_flood 1/2 → 2/2; c_beacon 2/10 → 4/10.
  - 441 → 446 tasks done in all.
  - The others did not move: the bot never builds a Guildhall or a Veshari Hall, and never breeds or binds the wyrm, so
    the unit tests hold those fixes, not the census. g_burn 2 → 1 and k_hall 1 → 0 are runs that went differently,
    not condition changes.

**The wide bar** (`npx tsx scripts/table.ts --bar wide --compare origin/main`):

132 runs a side; main's from the cache.

| people | seeds × draws | this tree | origin/main | Δ (paired) | floor (2·SE) | bar | verdict |
|---|---|---|---|---|---|---|---|
| Vellish | 6 × 7 | 2,140 | 2,067 | +74 (+3.6 %) | 202 | met | within the noise |
| Grimmen | 6 × 4 | 1,422 | 1,354 | +68 (+5.0 %) | 125 | met | within the noise |
| Veshari | 6 × 3 | 2,287 | 2,232 | +55 (+2.5 %) | 178 | met | within the noise |
| Tallowkin | 6 × 8 | 2,085 | 1,944 | +142 (+7.3 %) | 218 (10.8 %) | **not met: at the cap of 8 draws** | within the noise |
| all | | 7,935 | 7,596 | +339 (+4.5 %) | 368 | | within the noise |

**The last gates** (runs reaching it, median day), this tree against main:

| people | gate | this tree | main |
|---|---|---|---|
| Vellish | Free City | 30/42, day 123 | 30/42, day 123 |
| Vellish | Beacon of Eda | 17/42, day 136 | 12/42, day 135 |
| Grimmen | Deephold | 20/24, day 114 | 20/24, day 57 |
| Grimmen | Underking's Hall | 8/24, day 127 | 6/24, day 120 |
| Grimmen | Underking's Seat | 3/24, day 141 | 3/24, day 142 |
| Veshari | Sable Crown | 12/18, day 133 | 10/18, day 130 |
| Tallowkin | Hall of Wicks | 37/48, day 59 | 33/48, day 66 |
| Tallowkin | Lantern of Wicks | 19/48, day 104 | 16/48, day 119 |

- Every people is within the noise, and all four are up. The likeliest cause is the crowns the newly completing tasks pay (400
  to 1,200 each, sooner); this was not measured apart from the breeding change.
- More runs reach every last gate.
- **The one loss:** the Grimmen reach Deephold in as many runs, but at a median of day 114 against main's 57. It was
  not looked into further: the folk, the later gates and the Seat all hold.
- The Tallowkin's floor is 10.8 % at the cap, not met, as since iteration 64.

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
  relics, halls, rivalries (iterations 23–29, §13). ✅ (phase 6, the duel, the auction and the charter,
  closed it: §13.12)
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
- **M13 The third people** — the Tallowkin of the Wick: part 1, rules, buildings, the
  twin-node start, the look, the bot (iteration 41, §4.72) ✅; part 2, the chapter, the
  tales, the lamplighter, the Hall of Wicks and the late game (iteration 52, §4.83) ✅. M13 is
  closed.
- **M14 The depth pass** — the audit's five parts (§15, docs/AUDIT.md): supply has limits ✅;
  services with staff and stakes ✅; wyrmcraft matured ✅; the world pushes back ✅; the bot plays
  it all ✅. Preceded by the sweep of iteration 44 (§4.75). ✅ (iterations 45–55)
- **M15 The painted set** — the reference paintings as sprites through the import pipeline
  (§4.80–4.82, §16): the ground, trees, bushes, mushrooms, the hero buildings, the zone levels,
  one look for every people, halls that grow, glimwood and Gloam trees; the nine sprite-less
  buildings drawn. ✅ (iterations 50–51)
- **M16 The wild and the water** — creatures as resources and the water put to use (§16):
  herds, boar, otters, herons, goats and wolves with hides, meat and trophies as goods;
  fishing from a bank or a lake shore, boats, reed-cutters, a water garden. ✅ Part 1, the wild
  (iteration 58, §4.89); part 2, the water (iteration 60, §4.91).
- **M17 The marsh and the atoll**: marsh terrain and the Drainage edict, marsh-wyrms, and the
  Patagoi Atoll charter (§17.1). Planned in iteration 68, after the five single items of §17.4.
- **M18 The Fen-Nex**: the fifth people, the fox-folk traders, in two parts (§17.2).
- **M19 The Belerial plains-riders**: striders for every people, then the sixth people in two parts
  (§17.3).

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
| **Marsh-wyrms** | rivers and lakes; Bloom | eel-like; one may lair under a bridge: carts on it slow to a crawl | Veshari Hall coverage drives it off; a **Quay** keeps them away for good (built in iteration 86, §4.117) |
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
- **Hatchlings** raised at the Court become drakes that carry a rider across the map (the
  mount role; built in iteration 73, §4.104).

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
  scared by hounds. Built in iteration 72 (§4.103): a warden's fourth duty, and the donkey carts balk at hounds.
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
- ✅ **Failure states gain teeth:** an unbound, starved wyrm that razes the Founding Stake
  ends the game ("the valley belongs to the wyrm"); a hound pack that empties three
  districts in one Hush triggers the Long Night early. Built in iteration 70 (§4.101).

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

**Flying trade.** A wyvern courier is a first vehicle. At Beacon of Eda the
**Sky-Dock** (8.3) can send a wyvern instead of an airship: faster, no mana, but the
trade event may return a *rival wardlight's* egg offer or a challenge for the Ring. Built in iteration 73 (§4.104).

**Failure and drama.** A starved wyrm-stage dragon leaves and returns wild after a season
(tribute like 8.2). A cradle with the Gloam at its door is a hazard ("the
eggs go grey"; built in iteration 73, §4.104: three days, and the eggs turn to the grey line). Two dragons of the same line at wyrm stage may
**nest**: a vein egg without an event. *Dropped:* breeding went cross-line instead (§4.48: the
cradle refuses two of one line, "two of one line breed nothing new"; vein eggs come from the
Sleeping Wyrm).

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

1. ✅ **Wall Gates, Belregi and Uzulim style** (the gates; the Great Gate and the Heart of
   Belregi since iteration 69, §4.100). A gate tile in the Warding Wall lets a road
   pass. Two styles, both from the Pass of Buluiain: a **Belregi Gate** (blue runes: ward
   coverage +0.3 within 8, pilgrims arrive, happiness +2 nearby) and an **Uzulim Gate**
   (crimson obelisks: hounds and the restless never pass within 10, unrest +3 % in its
   district). A **Great Gate** wonder later, with a Heart of Belregi event chain.
2. ✅ **Storm-Caller's Peak** (on hills, Township): a Huruhui-trained storm caller calls
   rain on a district (fires out, miasma washed, herb yields +), disperses a mana-storm,
   or, in the Hush, holds a storm off the wards. Replaces the planned Weather Vane of
   Vesh. Event: *a storm caller of the Huruhui, marked with glowing sigils, asks for a
   peak to work from*; declining sends them on to Vell-on-Sable.
3. ✅ **Hanging Gardens** (Huruhui garden-craft): a cliff-side vertical garden building
   that needs hills on one side; produces goods and health without farmland and lights
   itself with bioluminescent vines (a **Glowvine Lane** road tier lit by plants, no
   mana). Unlocked by the storm caller's visit or by an Academy exchange event.
4. ✅ **Belerial caravans** (the caravan and the Wandering Merchant; strider mounts are a
   season's Watch bonus only: M19 part 1; the merchant's memory is in state since iteration 73, §4.104). Every season a caravan of riders on bipedal **striders** may
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
10. **Swamp biome and atoll maps** (not built: M17, §17.1). Marsh terrain (buildable after a Drainage edict,
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

Smaller follow-ups once walkers exist: scholars carry relic pieces (✅, the scholar walker), sextons
attend the brawl, and the great wyrm's duel is flown by the wyvern agent itself (✅ both, iteration 73, §4.104).

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
- **The third people: the Tallowkin of the Wick (iteration 41 ✅ as 4.72, part 1).** Light is
  life: spires reach further and cost double, Wick-Towers light the corners, a dark house is
  abandoned in three days, the vigil is theirs, milestones by lit share, a twin-node start.
- **Designed, not built (ideas for the remaining peoples; M18 and M19, §17).** (The Tallowkin
  candle-folk, first sketched here, are built: M13, above.) *Fen-Nex:* a trading people with no Craft zones at all,
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

## 15. M14: the depth pass

The audit (docs/AUDIT.md §4) found that most buildings are a stat bump with nothing to
decide, and most systems lack a failure mode. M14 gives them depth in five parts, one
iteration each, under one rule: a mechanic exists only if the player can see it, decide
about it and lose by it. The full designs, with numbers and hooks, are in AUDIT.md §4;
this section is the table of contents and the order.

1. **Supply has limits** (ley, water, roads) ✅: 1a (iteration 45, §4.76) linked nodes only; spire load (80, Nexus 200);
   the store shown and spent, brownout priority tiers, lantern-ways that need their light; 1b (iteration 46, §4.77): wells with capacity (30 zone levels,
   cistern 90) and the dry-land reason for the cistern; roads that need their light; mine
   seams (2,400), Font bore flares, mills that share a river, portal crossings; the Gloam
   that takes an unlit, unwarded building after two days' warning.
2. **Services with staff and stakes**: 2a ✅ (iteration 47, §4.78) crews that scale coverage; happiness and land value
   breakdowns and the missing level-up condition; deathcare
   in the open with a land-value price; wards with a burn budget (strength matters; Stone
   and Scale Wards stop dominating); 2b ✅ (iteration 48, §4.79): unrest with a riot and theft; halls with a difference (draughts, consecration, the
   fire hall's water, the Grand Academy's prices, the Academy's kept relics); the smaller rows; the kin rings while placing.
3. **Wyrmcraft matured** ✅ (iteration 53, §4.84): lines that do what they say; the Great
   Cradle; lodges with capacity; feeding reach; departed dragons return; roles with a
   price; champions who can lose; materials with sinks; marvels and wonders with a role;
   the Wyrm-Court after the binding; golems assigned.
4. **The world pushes back** ✅ (iteration 54, §4.85): weather of its own; the Crown's levy, favour, debt and loans;
   gates and memory (the Vellish happiness gate, tales with an uncapped memory and three
   grown chains); edicts as commitments and charters with a price that spills; festivals
   seen; a daily challenge that can fail.
5. **The bot plays it all, and the Annals** ✅ (iteration 55, §4.86): a purse with one goal
   and the Crown's loan as a bridge to a hall; the light first; taxes and edicts; walls, a depot,
   a cradle and a warden; a greedy tale policy; an Annals page for every counter; save migrations
   by version; five dev commands. **M14 is closed.**

## 16. M15 and M16: the painted set, the wild and the water

Two milestones from the playtest notes of iteration 49, slotted after it: M15 first (the
paintings are in hand and the pipeline is built), then M14 part 3, then M16, then M14 parts
4–5 and M13 part 2.

**M15 The painted set** ✅ (iterations 50–51, §4.81–4.82). Part 1 (iteration 50, §4.81): the pipeline's sheet, prop and
ground modes, the sharpen and outline pass, the ground, the trees, the bushes and mushrooms,
the hero buildings (spire, Nexus, Wick-Tower, the four wells, the Depot, the Carters' Yard,
the Ossuary, the Sextons' Chapel, the Boneyard, the Lyceum), and a procedural sprite for the
nine buildings that had none. Part 2 (next): the zone levels (wooden houses as the Hearth
levels, forge, brickmaker, general craft and the alchemist as the Craft and Arcane levels,
trade houses as Market 3, at 34 px with care), the people suffixes (an imported base over the
procedural people copy), the Guildhall and the Temple growing with the city like the Stake,
glimwood and Gloam trees recoloured from the birches, and the procedural restyle by the guide.
The original list, for the record: (1) The pipeline over every folder, a
hand-set offset and a checked glow per sprite: the ley spires as the spire's lit and unlit
pair and the Nexus; the wells by water reach (the plain well, the Seep, the Tide-Well, the
Cistern); the graveyard chapel as the Ossuary and the Sextons' Chapel; the forge, the
brickmaker, the alchemist and the general craft as the three Craft levels and the Alchemists'
Lyceum; the trade houses as Market level 3 and the Trade Depot; the wooden houses as the
Hearth levels. Where a painting's view fights the grid (a front elevation), it is a hero
sprite for a 3×3 hall or is left out; a sprite that does not read at 2× is left out. (2) The
nine sprite-less buildings (Carters' Yard, Chart-Room, Core Lantern, House-Hall, Lyceum, Salt
Font, Sextons' Chapel, Wrights' Lodge, Wyrm-Court) drawn, procedurally by the guide or
imported. (3) The procedural generator restyled by the guide in §5: hanging signs, awnings,
smithy sides, kilns, windlass wells, rune bands. (4) More halls that grow with the city: the
Guildhall and the Temple by milestone like the Stake. Verified by a contact sheet of every
imported sprite over its diamond, day and night screenshots, and the balance table unchanged
(art only).

**M16 The wild and the water** ✅ (iterations 58 and 60, §4.89 and §4.91). Two iterations. Part 1, the wild (✅ iteration 58, §4.89; the animal sheets painted the wild, the hounds, the Warden, the thrumhare, the wisp, the skyray and eight drake lines): herds of deer and elk on
the meadows (day, flee lit ground, return at night), boar in the woods, otters on the banks,
herons in the marsh, goats on the hills, wolves in the Hush that take a hare or a hen and
frighten a hearth; the Hunters' Lodge hunts by a chosen quarry (a panel choice) and brings
hides, meat and trophies as goods with their own prices on the Gloam road and a Hearth
happiness line for meat on the shelves; herds thin where the city spreads and recover where
a Glimhouse or a ward holds the ground; a Hunters' edict and two tales. Part 2, the water: a
Fishers' Hut on a bank or a lake shore with boats on the water (walkers on water tiles,
`waterPath`), fish as goods that spoil in two days unless a market or a smokehouse takes
them; reed-cutters on the marsh for thatch (a cheaper wall material for level-1 hearths); a
water garden as leisure on a lake shore; the lake's own land value and well bonus; the river
as a resource beyond mills and barges (a weir pool, a ford). Verified by the creatures' tests
(spawn, flee, hunt, goods), a balance table with fish and hides on the depot's ledger, and a
playtest of a lakeside town.

## 17. M17–M19 and the single items: what the plan still promises (iteration 68)

An audit in iteration 68 (§4.99) compared this document with `src/`. What it planned and the game does not have is
written here as work. The order was set by the user: the five single items of §17.4 first, then M17, M18 and M19. Each
numbered part is one iteration with its own plan, and gets its own §4.NN when it is done. The bar is CLAUDE.md's:
- a sim change runs the wide balance bar;
- a new people adds its own row to the table;
- every new building or graphic is shown in screenshots.

### 17.1 M17 The marsh and the atoll (§11 item 10, §8.1)

1. **Marsh terrain.**
   - **Generation:** a new `Terrain` beside slow water (river bends, lake margins), never on the founding node.
   - **The look:** reed beds, standing pools and mist at dawn, drawn by the procedural painter or imported through
     `npm run art`.
   - **Rules:**
     - nothing is built on marsh, but a road may cross it as a causeway at a bridge's price;
     - marsh breeds miasma, which the Fen-Nex and the deathcare read;
     - reed-cutters cut it (M16).
   - **The Drainage edict:** it turns the marsh nearest the city to meadow, a few tiles a day, for a daily cost. The
     land loses its reeds.
   - Old saves load: there is no marsh in them, and the edict is off.
2. **Marsh-wyrms** (the §8.1 row).
   - **The creature:** eel-like, in rivers and lakes, out in Bloom.
   - **The lair:** one may lair under a bridge, and the carts on it slow to a crawl.
   - **The answers:** the Veshari Hall's coverage drives it off, and a Quay keeps them away.
   - **Nests:** a marsh-wyrm nest by a Quay becomes the tide eggs' second source (the §8.6 table; today only a Veshari
     tale lays them).
3. **The Patagoi Atoll** (§11 item 10). A scenario charter on the title screen:
   - a ring of islands in open water, with the founding node on the largest;
   - land scarce, barges and bridges the roads, storms in the Hush;
   - a goal and its Done page, as the other charters have;
   - the bot can play it, and the balance table can run it.

### 17.2 M18 The Fen-Nex (§14.2; the fifth people)

On the people scaffold of M11–M13 (`src/data/factions.ts`), in two parts as the Tallowkin had (§4.72, §4.83).
1. **Part 1: the people.**
   - **Rules:**
     - no Craft zones: goods come by caravan and trade route;
     - markets hold three times the stock;
     - Fen cat-dragons (the fen-drake line of §11 item 5) serve as wardens;
     - progression counts trade routes opened.
   - **The start:** a fen start on M17's marsh.
   - **Buildings:** their own, each with a sprite.
   - **The look,** and the bot playing them.
   - **The table:** the balance table gains a Fen-Nex row.
2. **Part 2: their game.** Their quest chapter, tales, walker and wonder, and their late game, like §4.83 for the
   Tallowkin.

### 17.3 M19 The Belerial plains-riders (§14.2, §11 item 4; the sixth people)

1. **Striders for every people.**
   - The caravan's strider offer, today a season's Watch bonus, becomes a strider stable.
   - Strider carts are fast and not slowed by congestion.
   - Strider couriers carry goods across the map.
   - The caravan sells and buys strider stock.
2. **Part 1: the people.**
   - **Rules:**
     - no Warding Walls;
     - Hunters' Bounty always on;
     - the Gloam is outrun rather than warded: pressure counts for more and wards for less;
     - progression is counted in herds (on M16's wild).
   - **Also:** buildings with sprites, the start, the look, the bot, and a row in the table.
3. **Part 2: their game.** Their quest chapter, tales, walker and wonder, and their late game.

### 17.4 The single items (one iteration each, in this order)

- ✅ **A. The Great Gate and the Heart of Belregi** (§11 item 1; built in iteration 69, §4.100).
  - A gate wonder in the Warding Wall: the largest of the Belregi gates, with pilgrims and a ward of its own.
  - A tale chain, the Heart of Belregi, that follows the player's earlier choices at the gates.
- ✅ **B. Two ways to lose** (§8.5; built in iteration 70, §4.101).
  - **"The valley belongs to the wyrm":** an unbound Sleeping Wyrm, starved of tribute, razes the Founding Stake and
    ends the charter, after warnings.
  - **The Long Night early:** a hound pack that empties three districts in one Hush brings the Long Night before its
    season.
  - Both show in the game-over screen and the Annals. This is a sim change, so it runs the wide bar.
- ✅ **C. Golem haulers** (§8.4; built in iteration 72, §4.103). The Golem Foundry fields slow, tireless carts that carry
  30 and are not scared by hounds. They are drawn as vehicles.
- ✅ **D. Loose ends** (built in iteration 73, §4.104).
  - "The eggs go grey": the Gloam reaches a cradle (§8.6).
  - The Sky-Dock sends a wyvern instead of the airship: faster and without mana, but it may come back with a rival's
    egg offer or a challenge for the Ring (§8.6).
  - Hatchling riders cross the map (§8.2).
  - Sextons attend the brawl, and the great wyrm's duel is flown by the wyvern agent (§13.13).
  - The Wandering Merchant remembers past deals in state, not only in words (§11 item 4).
- ✅ **E. Markets want a good road** (AUDIT B40; built in iteration 75, §4.106). The road tier at a market's door counts for
  its trade, as the Market's description promises.
- ✅ **F. The sprites faced and fitted** (the user's request in iteration 72; done in iteration 77, §4.108). Check every building sprite in the game, painted
  and drawn, for its facing and how it sits in its tile square. The procedural set is the yardstick: door and gable on the
  right face, the footprint diamond filled neatly. Correct the ones faced wrong or that look off, by a flip, a new anchor or
  `targetHeight` in `art/sources.json`, or a redraw. Screenshots of every change, before and after. Art only: the control
  seed, not the bar.

### 17.5 Dropped, on the record

- The Weather Vane of Vesh, which became the Storm-Caller's Peak (§11 item 2).
- Same-line nesting, which became cross-line breeding (§4.48, §8.6).
- The four ideas AUDIT.md §4 rejects: services that burn rare materials to run, the Stone and Scale Wards needing
  mana, rain on one district, and a weekly budget.

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
- *A price is read in one place (iteration 41):* the Tallowkin's doubled spire forced every
  cost read (placement, labels, the ghost, the bot) through `costOf`; a people's price is a
  rule, not a second catalog.
- *A member that does not relay is a member that is not enqueued (iteration 41):* the
  Wick-Tower joins the spire chain's member list and never its queue, so "lights but does
  not relay" is one `if`, not a second network.
- *What is stated is what is drawn (iteration 41):* an agent with no path stands still, and
  a crowd walks out of step; the playtester saw the sprite lie before the numbers did.
- *A layer the player paints must answer the same day (iteration 42):* districts had been a
  scope for edicts since iteration 3, and a playtester painted one and saw nothing. A charter
  with a gift and a price, chosen at the moment of painting, is the answer; a mechanic that
  only matters through another panel is a mechanic that does not exist.
- *A charter is a people's rule for a neighbourhood (iteration 42):* the five charters read
  at the same hooks the peoples' rules read, one line each, so the two systems cannot drift
  apart and a sixth charter is a row.
- *Emissive light obeys the same depth order as the sprites (iteration 43):* a glow is part
  of the sprite that casts it, so it goes down where the sprite goes down and is cut away by
  what is drawn in front; one layer, one order, no second sort.
- *A quest names a thing the player can wait for (iteration 43):* "sell to a caravan" with a
  caravan the storyteller might never draw was a quest that could not be done; a visitor a
  quest depends on keeps a rhythm the player can read off a panel.
- *A description is a contract (iteration 44):* the audit found a dozen buildings whose text
  promised what no hook did (a square's trade, a lantern's delight, a lane's light); each is
  now either done or reworded, and `specialLock` is the one place a building's own gate
  lives, so the tooltip and `canBuild` cannot disagree.
- *Read the whole catalogue against the code before adding to it (iteration 44):* seventy
  findings in one sitting is cheaper than seventy playtest reports; the audit becomes a
  standing step before every milestone that adds buildings.
- *A limit is a number on a panel (iteration 45):* a cap the player cannot read is a bug
  report waiting to happen; every limit of the ley (the link, the load, the tier, the dimmed
  road) is one row where the thing it limits is shown, and one read in `updateMana`.
- *The ground answers the season (iteration 46):* a well, a track and a seep that read the
  calendar give the four seasons a hand in the city's supply, where before only the Hush's
  mana did; a limit that moves with the year is a limit the player plans around.
- *A service is people (iteration 47):* a Watch House with nobody in it watches nothing;
  giving every service a crew that the works compete for turns "build one and forget it"
  into a labour decision, and the crew row is where the player reads it.
- *Show the terms, not the number (iteration 47):* a happiness of 42 is a verdict; "+6 lit
  · −12 the Gloam near · −9 unrest" is advice. Every summed figure the player is asked to
  raise should be able to list its terms.
- *Unrest must be able to burn something (iteration 48):* a tax on yields is a number the
  player learns to live with; a market that can burn on the fifth day is a reason to build
  a Watch Post before the fifth day. Every slow pressure needs one event the player can see
  coming and one thing it costs.
- *Show the kin while placing (iteration 48):* a spire's reach is only useful beside the
  reach it must touch; drawing every standing node's and spire's ring while the ghost is
  held turns "did that link?" into a thing seen before the crowns are spent. The same for
  wells and halls: the gaps are the plan.
- *A reference painting is a sprite, not a mood (iteration 49):* a painting that is keyed,
  cut to its largest island, scaled to its footprint, reduced to a palette and given a glow
  is a sprite the game can draw tonight; a painting kept as "inspiration" changes nothing.
  The offset onto the tiles is set by hand per sprite, because the paintings are not on the
  grid and no formula knows where a painted hall's feet are.
- *Open things in steps, and say so (iteration 49):* eight districts and five charters at
  the Hamlet were a wall of choices nobody explained; two districts and two charters, a card
  with three steps, and a line in each later milestone toast make the same system a path.
- *The ground is a texture, not a sprite (iteration 50):* a ground tile is one of thousands
  of neighbours; what matters is that its edges continue, its family shares a palette and
  nothing in it repeats loudly. A texture folded onto the diamond gives that; a painted tile
  cut out and pasted would give seams.
- *Outline everything (iteration 50):* the procedural set's dark edge is the thing that made
  the imported stakes look pasted on; the same edge, and a sharpen pass, make a painting
  and a procedural sprite one set.
- *A gate the bot cannot pass is a bug in the gate or the bot (iteration 52):* the Tallowkin
  sat at 86 % lit for eleven iterations because the bot's towers could not link and nothing
  lit the corners the ley does not reach; the lamplighter is the answer the people were
  always going to have, and the balance table is where the bug showed.
- *Finish the oldest milestone first (iteration 52):* M13 part 2 slid behind M14 and M15
  without a decision; a milestone open for ten iterations is a smell, and the order of the
  list is itself a decision to be written down.
- *One painting is the look for every people (iteration 51):* a people's copy of a sprite
  exists to restyle a procedural look; a painting already is a look, so an imported base
  shows for everyone and the copies serve only the levels without one.
- *A corner is a door (iteration 49):* the four-side rule was invisible and wrong at every
  road end and bend; a rule the player cannot see must at least be the generous one.
- *An aura is a rule, or it is not an aura (iteration 53):* two of nine lines radiated text;
  a line's calling has to change a number somewhere, and the building it changes has to say
  so, or the Weave view paints a disc that means nothing.
- *A ceiling is a seat (iteration 53):* "a lodge serves a cradle" was a boolean nobody could
  run out of; four seats a lodge, filled in order, is a thing the player counts and a reason
  for a second lodge.
- *Hunger regresses before it kills (iteration 53):* the old −12 mood a day killed a dragon
  in six days, so "ten unfed days regress a stage" would have been dead code; the number
  that mattered was the mood loss, not the threshold.
- *The departed come back as a tale, not a hazard (iteration 53):* reusing the Vein-Wyrm's
  flyover would have put the wyrm to sleep and hidden its prop; a returned dragon is a
  choice with three answers and its own agent, which is what the audit meant.
- *The stage cancels in the Ring (iteration 53):* a challenger of the champion's own weight
  makes the odds depend on mood, training and line, which the player controls, and the
  season and the year, which they cannot; the odds are printed so a loss is never a surprise.
- *A sink is a decision (iteration 53):* every rare good now has a use that competes with
  the Marvels and the caravan (mail, fire, a lined nest, a dusted lane, a share sold), and
  each use is a control the player sets, not a drain.
- *The gift matches the cradle (iteration 53):* §8.6's "any egg, player's choice" would have
  been a fourth choice on a three-choice tale; the people's cradle line is the gift, and the
  promise is struck.
- *Golems are labour, guards or hands at a bench (iteration 53):* the earlier rule "golems
  are labour, not sprites" stands for the default; a warden with a post is a sprite that
  stands somewhere for a reason.
- *The weather is written in the seed (iteration 54):* the audit had `dailyWeave` roll it on
  the main stream; a side stream keyed by seed and season keeps every earlier run's rolls,
  lets the forecast read five days ahead exactly, and gives every player of a daily
  challenge the same sky. The Storm-Caller's rain stays the sure version of the same.
- *Favour starts neutral (iteration 54):* 50 of 100, so sector prices and the levy begin
  unchanged and the player moves it both ways; the audit gave the range, not the start.
- *The Vellish gate stands though the bot stalls (iteration 54):* the audit's 45 + 3 ×
  milestone is kept and the bot loses its Free City on every seed; the bot's levers are
  part 5's, and a gate the bot cannot pass today is the point of a gate.
- *Ill tidings are hazards (iteration 54):* every 'bad' line used to stamp the storyteller's
  grace week, so a big city with a fire a day never saw a tale; now only the hazards do.
- *The challenge scores the days to spare (iteration 54):* the audit's "day + treasury/1,000"
  would have paid a slower win more; 61 − day + crowns/1,000 pays speed first.
- *The bot answers a tale by scoring a copy (iteration 55):* a hand-written answer per tale would
  be fifty tables to keep; playing each choice on a `structuredClone` and scoring purse, ledger,
  timed effects, favour, standings, dragons and roofs is one function that also covers tales not
  yet written. The live state and its rng are never touched, so runs stay deterministic.
- *The bot keeps a purse, not a wish list (iteration 55):* one goal at a time, held back from
  growth only when it is urgent (a hall, or a brownout past a twentieth). A reserve that always
  held starved the services and, with them, the grid's growth; one that never held never bought
  a Font.
- *The loan bridges a hall, never the Fonts (iteration 55):* the first draft took the Crown's
  loan for mana and sank Vellish seed 44: the cash bought upkeep, and the interest compounded with
  the debt's. As a bridge to the Lantern of Vell or the Lantern of Wicks it earned the first Beacon
  and the first Lantern of Wicks a bot has reached.
- *The light first for two peoples only (iteration 55):* holding the zoning in any darkness
  starved the Grimmen and Veshari, whose gates are stone and moorings; for the Vellish (happiness)
  and the Tallowkin (the lit share) it is the gate itself. It costs Vellish seeds 42 and 44 a third
  and a half of their folk, and that is recorded rather than hidden.
- *The Crown's gift is a priority tale (iteration 55):* its text says the Crown answers the
  cradle, and as one tale in thirty no bot ever drew it; the storyteller's spacing still applies.
- *Saves branch on their version from 7 (iteration 55):* the version was written and never read,
  so every older save says 6; the whole old block is step 6, and a fill from a fresh game replaces
  the list of 85 counters.
- *The Annals hold every counter by test (iteration 55):* like the sprite-for-every-building test,
  a counter that is on no page fails the suite, so nothing the sim counts is write-only again.
- *A painting is scaled to its procedural twin, not to its footprint (iteration 56):* filling the
  footprint's width let a tall painting stand up to twice the height of the building it replaces;
  matching the twin's height (a little over, more for towers) keeps the painted and procedural
  buildings one set.
- *The set faces lower-right (iteration 56):* the procedural painter's doors are on the right face, so
  paintings fronted on the left are mirrored at import, judged one by one; head-on paintings stay as
  they are, since a mirror cannot turn them. Facing each building toward its road came in iteration 58.
- *Rings on top (iteration 56):* a reach is a thing to see, so its outline is drawn after the light
  pass, above the buildings, with a label; and every reach a building has is read from the sim's own
  constant, so a ring never disagrees with the rule.
- *Painted carts scale by the donkey (iteration 57):* a vehicle painting is scaled by a per-sheet
  factor that makes every donkey the same height (a citizen's), not by a target height, so loads of
  different heights keep one animal; each cart faces right at import and gets a mirrored twin, and
  the renderer picks the twin from the sim's heading. A cart's look is chosen by its id, so the art
  never touches the sim.
- *The wild on side streams (iteration 58):* herds, hunts and wolves draw from streams keyed by the
  seed, so the wild adds no roll to the main stream and a city that does not hunt or lose a hen is
  bit-identical; the city feels the wild only through what it does.
- *A herd is a cap, not a census (iteration 58):* a herd's head follows the habitat within 6 tiles
  that no building stands within 2 of, so the city's spread thins it without a separate rule, and
  a ward or a Glimhouse helps it back; the animals on the map are a view of the head count.
- *Painted creatures only where they read (iteration 58):* a painting at 7–12 px that reads as a
  blob stays procedural (the boar, the goat, the otter); a painting of another beast does not stand
  in for a lore creature (the lynx and the panther for the copper war-tiger).
- *Buildings turn to their road (iteration 59):* the renderer mirrors a building whose road runs past
  its left side, reading the visible front edges before the back ones. The light on a mirrored
  building comes from the other side, which is the price of a street that faces its road. Head-on
  paintings keep their front to the viewer; only new paintings could turn them to a road behind.
- *The water from the terrain, not a new terrain (iteration 60):* bodies, open water and the lake shore are worked out
  from the map's water; reeds grow on the Shore. A marsh type would have touched the map generator, the renderer and
  every placement rule for one building.
- *Thatch is comfort with a fire price (iteration 60):* §16's "cheaper wall material" had nothing to bite on, since
  homes cost no crowns or upkeep.
- *A ford is a track's choice (iteration 60):* a Dirt Track over a narrow river fords it at a third of a bridge's price
  and goes under at high water; better roads bridge. High water follows a Hush, so the charter's first Thaw is dry.
- *Shoals regrow at 0.10 (iteration 60):* the plan's 0.05 let one hut empty any lake under about 160 tiles, and the
  player cannot set a hut's crew; at 0.10 one hut holds its water and two take it down.
- *The bot's depot is a goal, not a service (iteration 61):* in the service queue it came seventeenth and was never
  reached. As a goal it waits for goods worth half its price on the Gloam road, and its price is held back like a hall's.
- *The bot imports only what the ledger carries twice over (iteration 61):* a depot in more cities made the old rule (a
  ledger over 200) run bills of 2,700 a day in a brownout.
- *A bridge is a street (iteration 61):* the bot's bridges read the treasury, as its grid does, not the purse a goal
  leaves; a Weir instead where it would hold five fords.
- *A sim change is judged by the paired table, not by one run a seed (iteration 62):* `scripts/table.ts --compare
  origin/main` runs every seed twice (the second with one extra roll), pools σ within seeds and calls a difference seen
  only past twice its standard error. Its 24 runs see about 9 % over the four peoples; a people's own row sees 8–29 %.
- *The caravan is income, and the books say so (iteration 63):* the Belerial caravan's take joins the Budget, the
  ledger history, the depot's panel and the Annals. §4.92's "the depot does not pay" counted only the road's eight goods
  a day and is withdrawn; the depot pays about ten times its upkeep through the caravan.
- *The wide bar spends runs where the noise is (iteration 64):* six seeds a people and draws added until the floor is a
  tenth of the people's folk (capped at 8), with every run cached so a long table resumes. A people at the cap is
  reported as not met. Iteration 63's Vellish −7 % and lost Free City, a quick table's verdict, did not survive it.
- *Drawn art where the paintings have nothing (iteration 65):* the Lantern of Vell, the temple and the citizens are
  drawn by hand in code from projected boxes and solids of revolution, under the procedural set's light and outline. A
  painting uploaded later replaces any of them through the manifest; nothing waits on one.
- *Shortcuts belong to the map (iteration 66):* the game's keys fire only with focus on the page or the map; a focused
  control keeps its own keys and a dialog all but Escape. Tab moves focus, so Info views moved to V. One dialog watcher
  and one rebuild guard cover every panel, instead of editing each toggle.
- *Every player change is one command (iteration 67):* the map tools and the panels send ops through one runner that logs
  them by tick and does what the call sites did, moved and not rewritten, so live play is unchanged and a replay can apply
  the same op at the same tick. A replay begins with a new charter (a loaded save is rebuilt, not the live state), carries
  daily checkpoints of the RNG to name the first day two runs part, and is checked headless by `scripts/replay.ts`.
- *The plan's gaps become milestones (iteration 68):* what this document promised and the game lacks became three
  milestones (M17 the marsh and the atoll, M18 the Fen-Nex, M19 the Belerial) and five single items, all in §17, in
  the user's order: the single items first. NEXT_STEPS now holds every open promise, so the two lists cannot drift
  apart again. Same-line nesting is dropped for cross-line breeding.
- *The Great Gate stands in the angle of a gate (iteration 69):* a Belregi gate has wall on two sides and road on two,
  so the gatehouse counts a corner as touching it, rather than replacing wall tiles or straddling the road. Roads keep
  passing through the gate tile, and the wall's tiles stay what they are. The Heart's tales fire on their own terms with
  no draw, so a city without the Gate never meets them. They read the player's earlier answers at the gates with
  `chose()` rather than a new score kept in state. A poor record halves the Heart's favour rather than refusing it.
- *A home flees, not a district (iteration 70):* hounds at a city's Gloam edge for weeks are ordinary in bot cities (one
  Veshari march on all 30 Hush nights), so a district is emptied only when half its homes have each had the pack at
  the door three nights. Homes in no district count by their march, so not painting districts is no shelter. The wyrm
  counts refusals in a row, not in all: any tribute paid forgives the past, and a great wyrm of one's own is the one
  answer to the razing in flight.
- *Runs are cached by what they read, and the cache is committed (iteration 71):* the bar's runs are deterministic, so a
  run of the same sim files is the same run whatever the commit. Keying by the files of `src/sim`, `src/data` and
  `src/core` lets main's side of a bar be the previous iteration's branch side, and lets a change outside the sim cost
  nothing. The cost is about 50 KB of committed JSON per sim version, four versions kept.
- *The hauler is a cart with a warden's id, not a warden that carts (iteration 72):* the cart run in `agents.ts` already
  knows roads, loads, markets and traffic, so a golem cart joins it as a variant with three rules of its own (30, slow,
  tireless) and the warden stands at the works in harness. "Not scared by hounds" needed something to be scared: the
  donkey carts now balk at a hound within 4 tiles, once a tick's look at the hounds abroad, with no roll, so every city
  without hounds on its roads is bit-identical. A hauler loads what the market has room for, since 30 into a cap of 20
  would throw a third away.
- *Five loose ends in one iteration, each the smallest rule that bites (iteration 73):* the eggs turn to the grey line
  rather than dying, so the hazard costs the chosen line and not the egg; the wyvern run reuses the airship's state machine
  and books rather than a second one; a mount is a role with the rider's errands and no range, not a new creature; the
  sextons' choice is appended, not inserted, so every recorded choice keeps its index; the duel is a phase on the agent
  the great wyrm already has; the merchant's memory is four numbers in state and a text that reads them, with the owed
  favour listed always and refused until it is owed, since a tale's choices are one list.
- *The wyrm in flight is the user's painting; the coil is drawn after it (iteration 74):* the painting is a flying pose,
  so it serves the sky as it is. The coil must wrap a node and split into halves round its stones, so it is drawn in
  code in the painting's colours and parts (scales, belly, spines, horns, bat wings) rather than cut from it.
- *A market's road counts for its tithe, and the bot paves (iteration 75):* the rule is a factor on the one number the
  road at the door plainly touches, the market's trade, with the tiers the sim already reads (an unlit Lantern-way is
  cobble, a track is mud in the Thaw and the Hush), so every cobbled city is bit-identical. The bot got the lever the
  rule asks for, one door a day from the centre out, because a rule the bot can only lose by would measure its cost and
  not the game.
- *A wing beat is cut from one painting rather than painted again (iteration 76):* the importer turns each wing about its
  shoulder inside a hand-set polygon and squashes it, so the beat keeps the painting's own pixels. All frames share one
  crop, scale and anchor, so the body holds still. A second painting with the wings down would beat more cleanly, and
  could replace frame 2 by name.
- *Fit by eye over the one-factor rule for the Stake's stages (iteration 77):* §4.87 scaled the four stage paintings by one
  factor so they would keep their growth, but the stage 2 painting is low and wide, and one factor made the hall shrink at
  the Burgh. Each stage is now fitted to its diamond on its own, and a test holds what the eye settled: the tall halls
  never shrink, the wide one fills its width. A survey sheet of every sprite over its diamond, beside its mirror, is the
  check to run after any import.
- *The citizen is the yardstick for the small things, the tile for the big ones (iteration 78):* a building that fills
  its footprint is judged against its tile (§4.108); a well, a post or a shed is judged against the folk who use it, and
  may leave its tile half empty. Towers and wonders are free to rise. The survey sheet now stands a citizen beside every
  sprite, so the next import is judged both ways at once.
- *The paintings become designs for the painter; the painter draws the game (iteration 79):* a painting scaled to the
  citizen yardstick is a smudge, and a painting at the size it reads is too big against the folk. Redrawn in code after
  the painting, a building is crisp at any size and one set with the procedural buildings. The paintings stay in
  `inspirations/` as the designs; `off: true` keeps their entries on the record. Part 1 is a trial of twelve; the rest
  follows only if the user says so.
- *A building painted by the user is drawn in code, then waits for its building (iteration 80):* the brickworks is a
  registered sprite with no catalog entry, so the game is unchanged until the user names the building it belongs to.
- *Compose, don't spec, when a painting is the design (iteration 81):* a spec gives every house the same box; a painting's
  likeness is in its composition. `painted.ts` places boxes, gables along either axis, porches, verandas, dormers,
  chimneys and props where the painting has them, in the set's style. The peoples keep their own looks for the same
  houses: the painting is the Vellish look.
- *Every people its own houses, and no painting twice (iteration 82, the user's rules):* a slot with no painting of its own
  keeps its people's drawn house rather than borrow another's; the houses are sorted to a people by material, to a zone by
  what they show, and to a level by their shape (a 1×1 tile takes a wide house only low).
- *The brickworks is a building of its own, not a Craft level (iteration 83):* a Craft lot is 1×1 and the drawing is 3×3,
  so it became the Brickworks at the Village. It makes goods like the Quarry, and has one new rule: sites within 12
  tiles rise half again as fast. The bot leaves it alone, so the balance stays the bot's own.
- *A building may have many looks (iteration 84):* the user's sheets paint many wells, shrines and cemeteries; one sprite a
  building would waste them. The look is chosen by the tile, so a building never changes face and the sim never knows.
- *Marsh is land you pay for twice (iteration 85):* a causeway to cross it at a bridge's price, an edict to drain it a few
  tiles a day. It is never within nine tiles of the founding, so the first streets are dry; past that, the city meets it at
  the water's edge. The bar sees the cost (Grimmen −16 %), and the user chose to keep it.
- *A seasonal creature on its own rng (iteration 86):* the marsh-wyrms roll on a side stream keyed by the seed and the day,
  as the weather does, so adding them moves the world only through what they do. A wyrm is answered with buildings the
  player already has reasons to build (the Veshari Hall, the Quay), and the Quay's answer pays: a tide egg.
- *Content is data (iteration 87):* the buildings, roads, milestones and relic sets live in `src/data/content/*.json`, so the
  dev board (and a hand) can add and edit them without touching code; the rules stay in code. Text that sits beside logic
  (edicts, events, quests) moves later with its logic kept by id. The bar proves a pure move changes nothing.
- *Send to Claude makes no commits (iteration 88):* the board hands a task to a Claude session (on the PC or as an issue)
  and stops there; the session plans, verifies and ships by the standing process. The tracker only reads the docs and the
  balance cache; the docs stay written by the iterations.
- *Text is data, logic stays by id (iteration 89):* the fixed strings of edicts, events, quests and guilds live in JSON
  and the code reads them by id, so wording is edited without code, but a new edict or event still starts in code. Text
  worked out for the city stays beside its logic. The board's pipelines are a registry: a pipeline not yet written into
  the docs hands off to Claude, and becomes a button once it is.
- *Ship the art as sheets, not as a thousand files (iteration 90):* the browser asks for one packed sheet (by content
  hash) instead of a thousand PNGs. The single files stay as the importer's output and the tools' input. The atlas is
  cut from the sheet into the same layout as before, so the change is invisible except for the time it saves; a page
  with no sheet, or a failed one, still loads the files, 24 at a time.
- *Asset pipelines are written down before they are buttons (iteration 91):* Tripo Studio and Aseprite came from the
  user's Tamer project as proven steps, written into `docs/ART_PIPELINES.md` first; the board runs what the doc says.
  The login and the generator credits stay the user's. Every redraw is seen before it is installed, and a drawn sprite is
  taken as drawn (`pixel: true`).
- *A task opens only when good play can finish it (iteration 92):* a Charter task that waits on a threat (a hound for the
  Watch, a restless for the sexton, a flood the Weir prevents) asks the player to let the city slip. A task whose
  building answers the threat now completes on the building at work (its rounds), and a task about a threat opens only
  while the threat stands. The audit is a script and a workflow, so the next chapter of tasks can be held to it.
