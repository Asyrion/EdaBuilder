# Parked features (scope reset, 2026-10-21)

The scope reset (`docs/RESET_PLAN.md`) takes these out of the game. Nothing is lost: **`archive/full-scope`** is `main`
before the reset (`ac4e05f`, iteration 96). Nothing here comes back without the user's approval. A row's "Back" column
says where to start.

**General way back:** `git checkout archive/full-scope -- <files>`. Then reconnect the hooks the reset cut. The phase
that parked it lists them in `docs/RESET_LOG.md`. Then add the feature's content back (buildings in
`src/data/content/buildings.json`, quests, text, sprites in `art/sources.json`), and the save fields with a new save
version. The DESIGN sections are in `docs/DESIGN.md` on the archive branch.

**The seam that stays:** `src/data/factions.ts` keeps `factionOf()`, `FactionRules` and `buildsFor()` with the Vellish
alone (neutral rules). A people that comes back plugs in there, as the Grimmen did in iteration 34 (`0826a06`).

**Reference points for the core:**
- `archive/core-iter4` (`283a3fc`, iteration 4) is the last city builder without add-ons.
- `archive/core-iter5-art` (`4b61531`, iteration 5) is the core with the fantasy art pass.

## Peoples (phase 1a)

Parked on 2026-10-21 (phase 1a, `docs/RESET_LOG.md`). A charter or replay of one of these peoples is refused with a
message (`parkedPeopleMessage`, `src/sim/save.ts`). What stays of their names in the base game: the fire hall's key
`veshari` (shown as the Water-Mages' Hall), the Fen-Nex visitor quarter, the Tallowkin warden walker, the Grimmen
boneyard tale and the grey and candle-eyed citizens (parked with their systems in 1b/1c).

| People | Introduced | Files and content | DESIGN | Back |
|---|---|---|---|---|
| Grimmen of the Underhill | `0826a06` (scaffold), `33f2ffc`, `f6a0ba3`, `61b76c5`, `89abe25` (iterations 34–38) | `factions.ts` entry; buildings seep, stoneward, quarry, hatchery, forgetemple, underkingseat; Underhill start in `terrain.ts`; Delve terraform; Deep Cut edict; stone-sexton walker; events `underking_envoy`, `collapse`, `true_leystone`; quests `u_*`; bot `quarry()`; `tests/grimmen*.test.ts` | §4.66–4.69, §14 | factions entry + buildings + start + bot policy |
| Veshari of the Sable | `b8db31b`, `d0bae22` (iterations 39–40) | buildings tidewell, landing, tidepool, greatweir; riverside start; Hush flood and sluice (`weave.ts`); bargeman walker; events `tide_net`, `storm_egg`, `bargemen_strike`; quests `v_*`; bot `moor()`; `tests/veshari*.test.ts` | §4.70–4.71 | as above; the flood needs the weave (below) |
| Tallowkin of the Wick | `fbe5b41`, `fba242d` (iterations 41, 52) | buildings wicktower, candleshrine, hallofwicks, lanternofwicks; twin-node start; light gate `litHeld`; lamplighter walker; events `wrights_strike`, `surge_wickhouses`, `candle_child`; quests `t_*`; bot `brighten()`; `tests/tallowkin*.test.ts` | §4.72, §4.83 | as above; the lamplighter needs the walkers |
| Fen-Nex of the Reach | `fa7b510` (iteration 96; M18 part 1, part 2 never built) | buildings caravanserai, foxpost, fenden; fen start; `noCraft`, `marketStock`, `stiltHomes` rules; quests `x_*`; bot `trade()`; `tests/fennex.test.ts`; eda-lore PR 5 (draft proposal, parked) | §4.127, §17.2 | as above |
| Zone looks per people | iterations 35–96, 82 | `ZONE_LOOKS` and the `_grimmen`/`_veshari`/`_tallowkin`/`_fennex` zone sprites; citizen variants 4–6 | §4.113 | sprites in `art/sources.json` via `scripts/edaLoreHouses.mjs` |

## Creatures, dragons and beasts (phase 1b)

Parked on 2026-10-21 (phase 1b, `docs/RESET_LOG.md`), in `ee5129d` and the commits after it. A save that holds a parked
building, a dragon or a stretch of the Warding Wall is refused with a message (`parkedContentIn`, `src/sim/save.ts`), and so
is a replay that uses one of their commands (`PARKED_OPS`, `src/sim/commands.ts`). Buildings: cradle (and the Great
Cradle), tamerslodge, ring, wyrmcourt, scaleward, wyrmforge, eggshellfont, raymirror, hallofmarvels, golemfoundry,
leybeacon, drakemews, mothloft, greatgate. Edicts: beastmasters, bounty, wyrmpeace, scalemail. 34 imported sprites
(`art/sources.json`) and their drawn painters in `sprites.ts`.

| Feature | Introduced | Main files | DESIGN | Back |
|---|---|---|---|---|
| Ambient creatures (glimmoths, thrumhares, wisps) | `69f304b` (iteration 6) | `src/sim/creatures.ts` (now only the wild, the boats and the airship) | §8 | `tickCreatures`, render branches in `renderer.ts`; they draw from the main rng every night tick, so they change every bot run |
| Wyrmcraft: eggs, cradles, drakes, wyverns, roles, bouts, the Wyrm-Ring, the Mews, materials, glim-dust on the roads, the Moth-Loft and the Ray Mirror | `9c10df9`, `94dd814`, `b5dfe8b` (iterations 8, 9, 53) | `wyrmcraft.ts`, `breeding.ts` (`21b8a32`); the "Wyrms" modal in `ui.ts`; `scatterDust` and `dustLit` | §8, §15 | the auras in `weave.ts`, the dragon terms in `growth.ts`/`services.ts`/`networks.ts`, the egg tales, the merchant's egg and the caravan's vault choice (both kept as no-ops at their indices) |
| The Sleeping Wyrm and the Wyrm-Court | `6517b1d` (iteration 11) | `wyrm.ts`; the "wyrm" loss | §4 (iteration 11), §4.101 | the wyrm node in `world.ts`, its tales in `events.ts`, the game-over cause |
| Marsh-wyrms | `3d657f2` (iteration 86) | `marshwyrms.ts` | §4.117 | the lair lookup in `roads.ts` |
| Concord Wardens, the Golem Foundry and haulers; skyrays and the Ley Beacon | `349e06d`, `2273779` (iterations 14, 72) | `beasts.ts`, the golem carts in `vehicles.ts` | §4.103 | labour in `growth.ts`, the mine's waking, `GOLEM_VARIANT` in `carts.ts` |
| Gloam-hounds and the Hush siege, the Warding Wall, the Belregi/Uzulim gates | `fb39972`, `b824e3d` (iterations 7, 70) | `hounds.ts`, the wall in `actions.ts`, the gates in `services.ts` | §4.101 | the "hounds" loss, fear in `growth.ts`, carts that balk in `agents.ts`, the lodge's hound quarry in `wild.ts` |
| The Great Gate, the Pass and the Heart of Belregi | `3bf742b` (iteration 69) | `gate.ts`, the Heart tales in `events.ts` | §4.100 | `nearGate` in `catalog.ts`/`world.ts`; it needs the wall's Belregi gate, so it was parked here and not in 1c |
| War-tigers, mana-storms, the Fen-Nex visitor quarter | `0dbcdee` (iteration 16) | `lore.ts`, the `fennex` tales, the fox audit | §8 | `setFenNex` in the tick, `inFenNex` in `economy.ts` |
| Drake riders, mounts, tide barges, the Sky-Dock's wyvern | `53b26f7`, iteration 73 | `vehicles.ts` | §8 | the Sky-Dock and its airship stay |
| The tamer walker | iteration 31 | `walkers.ts` | §14 (M10) | the other walkers follow in 1c |

## The tales, the weave, the guilds, the walkers, the forecast and the Annals (phase 1c-1)

Parked on 2026-10-21 (phase 1c-1, `docs/RESET_LOG.md`), from `16b8df4` on. Buildings: the Astral Observatory, the
Storm-Caller's Peak (its unlock was a tale's answer), the Guildhall and the four guild halls (Carters' Yard, Lyceum,
Wright's Lodge, Sexton's Chapel). Edict: the Spire Wardens. A save holding one of those buildings is refused
(`parkedContentIn`); a replay using the commands `tale`, `guild`, `vent` or `rain` is refused (`PARKED_OPS`).

| Feature | Introduced | Main files | DESIGN | Back |
|---|---|---|---|---|
| Story events and tales: the storyteller, chains, the calendar festivals, the Belerial caravan, the riot, the Wandering Merchant, the airship captain's tale | `159c577` (iteration 2), many since | `events.ts`, `botPolicy.ts` (the bot's answers), `content/text/events.json`, the event modal in `ui.ts` | §4 (iterations 2–4), §13 | `pendingEvent` halting the tick in `sim.ts`, the `tale` op, `maybeFire*` in the day; the depot's 1.5× caravan was most of its income (RESET_LOG) |
| Weather, the river's freeze and flood, the ley aspects of the nodes | `7b02989` (iteration 23), iteration 54 | `weave.ts`, `assignAspects` in `world.ts`, the Weave view | §13 | the aspect and weather terms in `growth`/`hazards`/`services`/`networks`/`world`; the Gloam pressure moved to `hazards.ts` and stays |
| The Astral Observatory and the forecast | `f814c57` (iteration 12) | `forecast.ts`, the Ledger's forecast strip | §8 | `hasObservatory` (the Chart Room read it too) |
| Guilds: standings, petitions, boons, strikes, wars, brawls, charters, guild halls | `c46477f` (iteration 24) | `guilds.ts`, `content/text/guilds.json`, the council block in the Edicts panel | §13.8 | `guildEffect`/`hallActive` terms (Craft rate, depot goods, mana store, surge line, deathcare, traffic), the `guild` op |
| Service walkers (11 kinds) and pilgrims; the Spire Wardens edict | `7ca40bb`, `a773bcb`, `990c40c` (iterations 31–33) | `walkers.ts`, the walker sprites | §14 (M10) | `walkerBonus` in the coverage, `blessed`/`tended`, the wardens' surge shield; `stepRoad` moved to `construction.ts` |
| The Annals (135 counters) | `584f5a0` (iteration 55) | `src/data/annals.ts`, the Annals modal and key N | §4.86 | the parked systems' stats are gone; the rest go to core counters in 1d |

## The world add-ons and the content cut (phase 1c-2)

Parked on 2026-10-22 (phase 1c-2, `docs/RESET_LOG.md`), from `760d6f1` on. Buildings (20): torrentmill, portalarch,
fishershut, smokehouse, reedcutters, weir, watergarden, hunterslodge, glimhouse, hanginggardens, brickworks, ruindelve,
worldtree, quay, skydock, fontquieting, corelantern, househall, saltfont, chartroom. Road: the Glowvine Lane. Edicts: the
Close Season and the Drainage. Ledger tasks: 47 (68 down to 21; the parked systems' and the core side tasks). A save holding
one of those buildings, a glowvine lane, a scenario other than the valley, a daughter wardlight or a daily challenge is
refused (`parkedContentIn`); a replay using `terraform`, `daughter` or `quarry`, or one of another scenario, is refused
(`PARKED_OPS`, `stateFromHeader`). Old creatures, barges and floating carts are dropped on load, and marsh turns to meadow.

| Feature | Introduced | Main files | DESIGN | Back |
|---|---|---|---|---|
| The wild: herds, wolves, hens, the Hunters' Lodge, meat and trophies, the Close Season | `f7109cb` (iteration 58) | `wild.ts`, `creatures.ts` (the wild's agents) | §4.89 | `seedWild` in `createGame`, the hunt and meat terms in `growth.ts` (happiness, `dailyTrade`), the bot's `hunt()` |
| Fishing, the smokehouse, reeds and thatch, fords, the Weir, high water, the Water Garden | `0e6b3f3` (iteration 60) | `water.ts` (now only the lake), the boats in `creatures.ts` | §4.91 | `dailyWater`, the fish and thatch terms in `growth`/`hazards`, the ford price in `actions.ts`, `fordClosed` in `agents.ts`, the bot's `fish()`/`thatch()`/`fords()` |
| The marsh and the Drainage edict | `8485f4f` (iteration 85) | `marsh.ts`, `markMarsh` in `terrain.ts` | §4.116 | the causeway price, the marsh miasma in `services.ts`, the mist and reeds in `renderer.ts` |
| The Patagoi Atoll, isles, sea-gales | `6238d8c` (iteration 95) | `atoll.ts`, `isles.ts`, `gales.ts` | §4.126 | `TerrainOptions` in `generateTerrain`, the gale dev command |
| Vehicles: floating carts, barges and Quays, the airship and the Sky-Dock | `53b26f7` (iteration 15) | `vehicles.ts` | §8 | cart variants 3 and 4 in `agents.ts`, `floatingMana` in `networks.ts`, `dailyBarges`/`dailyAirship` |
| Relics and relic sets, the Ruin Delve, Portal Arches, the World Tree | `7b8cbb1`, `21b8a32` (iterations 13, 25) | `relics.ts`, `content/relics.json`, `portalGates` in `agents.ts`, the tree in `growth.ts` | §13.9 | `relicDone` terms (happiness, mana store, sector price, deathcare), the Academy's study (`educatedFloor`), the relics' sale at the depot; the Ruins of Lukuku stay on the map as scenery |
| Marvels: the Lantern of the Cores, the Hall of the Nine Houses, the Salt Font of Morrow, the Concord Chart-Room | `9ee4948` (iteration 27), the Cores iteration 53 | `buildings.json`, `cracked`/`CORES_*` in `hazards.ts` | §13.10 | `hasMarvel`/`marvelNear` (happiness, trade ×1.15), the Marvels tab |
| Magical buildings: Torrent Mill, Glimhouse, Hanging Gardens and the Glowvine Lane, Font of Quieting | `f814c57` (iteration 12), iteration 16 | `buildings.json`, `networks.ts` (the mill, the vines), `growth.ts` (the Glimhouse), `hazards.ts` (`fontOfQuieting`) | §8 | `RoadType.Glowvine` (4) |
| The Brickworks | `9fac9e9`, `b45a3ea` (iterations 80, 83) | `buildings.json`, `drawBrickworks` in `drawn.ts` | §4.111, §4.114 | `brickworksNear` and `BRICK_SPEED` in `construction.ts` |
| Scenarios (one-node, island, inherited collapse); the daughter charter and the Twin Road; the daily challenge | `c60d405`, `5bc3920`, `170291f` (iterations 17–19) | `scenario.ts`, `charter.ts`, `trade.ts` (the Twin Road) | §4 (iterations 17–19) | `createGame`'s scenario argument, the title screen, `dailyDaughter`/`dailyTwinRoad`, the Ledger's score line |
| Terraforming (the Land tab) | `170291f` (iteration 19) | `terraform` in `actions.ts`, the terrain tool in `ui/tools.ts` | §4 (iteration 19) | |

## Open work that is parked

- NEXT_STEPS: the art still drawn in code, M18 part 2 (the Fen-Nex's game), M19 parts 1–3 (striders, the Belerial).
- GitHub issues labelled `parked` (the open ones, 105–124).
- eda-lore PR 5 (the Fen-Nex proposal), labelled `parked`.
