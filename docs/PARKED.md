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

| People | Introduced | Files and content | DESIGN | Back |
|---|---|---|---|---|
| Grimmen of the Underhill | `0826a06` (scaffold), `33f2ffc`, `f6a0ba3`, `61b76c5`, `89abe25` (iterations 34–38) | `factions.ts` entry; buildings seep, stoneward, quarry, hatchery, forgetemple, underkingseat; Underhill start in `terrain.ts`; Delve terraform; Deep Cut edict; stone-sexton walker; events `underking_envoy`, `collapse`, `true_leystone`; quests `u_*`; bot `quarry()`; `tests/grimmen*.test.ts` | §4.66–4.69, §14 | factions entry + buildings + start + bot policy |
| Veshari of the Sable | `b8db31b`, `d0bae22` (iterations 39–40) | buildings tidewell, landing, tidepool, greatweir; riverside start; Hush flood and sluice (`weave.ts`); bargeman walker; events `tide_net`, `storm_egg`, `bargemen_strike`; quests `v_*`; bot `moor()`; `tests/veshari*.test.ts` | §4.70–4.71 | as above; the flood needs the weave (below) |
| Tallowkin of the Wick | `fbe5b41`, `fba242d` (iterations 41, 52) | buildings wicktower, candleshrine, hallofwicks, lanternofwicks; twin-node start; light gate `litHeld`; lamplighter walker; events `wrights_strike`, `surge_wickhouses`, `candle_child`; quests `t_*`; bot `brighten()`; `tests/tallowkin*.test.ts` | §4.72, §4.83 | as above; the lamplighter needs the walkers |
| Fen-Nex of the Reach | `fa7b510` (iteration 96; M18 part 1, part 2 never built) | buildings caravanserai, foxpost, fenden; fen start; `noCraft`, `marketStock`, `stiltHomes` rules; quests `x_*`; bot `trade()`; `tests/fennex.test.ts`; eda-lore PR 5 (draft proposal, parked) | §4.127, §17.2 | as above |
| Zone looks per people | iterations 35–96, 82 | `ZONE_LOOKS` and the `_grimmen`/`_veshari`/`_tallowkin`/`_fennex` zone sprites; citizen variants 4–6 | §4.113 | sprites in `art/sources.json` via `scripts/edaLoreHouses.mjs` |

## Creatures, dragons and beasts (phase 1b)

| Feature | Introduced | Main files | DESIGN | Back |
|---|---|---|---|---|
| Ambient creatures (glimmoths, thrumhares, wisps) | `69f304b` (iteration 6) | `src/sim/creatures.ts` | §8 | render hooks in `renderer.ts` |
| Wyrmcraft: eggs, cradles, drakes, wyverns, roles, bouts, Wyrm-Ring, Mews, materials | `9c10df9`, `94dd814`, `b5dfe8b` (iterations 8, 9, 53) | `wyrmcraft.ts`, `breeding.ts` (`21b8a32`), `creatures.ts`; the "Wyrms" modal in `ui.ts` | §8, §15 | auras in the weave, the Mews' Watch reach in `services.ts` |
| The Sleeping Wyrm and the Wyrm-Court | `6517b1d` (iteration 11) | `wyrm.ts`; the "wyrm" loss | §4 (iteration 11), §4.101 | game-over cause |
| Marsh-wyrms | `3d657f2` (iteration 86) | `marshwyrms.ts` | §4.117 | `roads.ts` lair lookup |
| Concord Wardens, the Golem Foundry and haulers; skyrays and the Ley Beacon | `349e06d`, `2273779` (iterations 14, 72) | `beasts.ts` | §4.103 | labour in `growth.ts`, the mine's waking |
| Gloam-hounds, the Hush siege, the Warding Wall, the Belregi/Uzulim gates | `fb39972`, `b824e3d` (iterations 7, 70) | `hounds.ts`, `creatures.ts`, wall in `actions.ts`, gates in `services.ts` | §4.101 | the "hounds" loss, carts that balk |
| War-tigers, mana-storms, the Fen-Nex visitor quarter | `0dbcdee` (iteration 16) | `lore.ts` | §8 | `setFenNex` in the tick |
| The wild: herds, wolves, the Hunters' Lodge, meat | `f7109cb` (iteration 58) | `wild.ts` | §4.89 | market shelves |

## Cross-cutting add-ons (phase 1c)

| Feature | Introduced | Main files | DESIGN | Back |
|---|---|---|---|---|
| Story events and tales, festivals, the caravan's tales, riots as tales | `159c577` (iteration 2), many since | `events.ts`, `content/text/events.json`, `botPolicy.ts` | §4 (iterations 2–4), §13 | the pause and the event modal in `ui.ts` |
| Weather, the weave and ley aspects | `7b02989` (iteration 23) | `weave.ts`, `world.ts` `assignAspects` | §13 | ~25 readers |
| Service walkers (11 kinds) and pilgrims | `7ca40bb`, `a773bcb`, `990c40c` (iterations 31–33) | `walkers.ts` | §14 (M10) | `walkerBonus` in the coverage |
| Fishing, reeds, the smokehouse, fords, the Weir, high water | `0e6b3f3` (iteration 60) | `water.ts` | §4.91 | the bot's hut |
| The marsh and the Drainage edict | `8485f4f` (iteration 85) | `marsh.ts`, marsh terrain in `terrain.ts` | §4.116 | |
| The Patagoi Atoll, isles, sea-gales | `6238d8c` (iteration 95) | `atoll.ts`, `isles.ts`, `gales.ts` | §4.126 | scenario `atoll` |
| Vehicles: floating carts, barges and Quays, drake riders, the airship and the Sky-Dock | `53b26f7` (iteration 15) | `vehicles.ts` | §8 | |
| Guilds | `c46477f` (iteration 24) | `guilds.ts`, `content/text/guilds.json` | §13.8 | unrest |
| Relics, the Ruins of Lukuku and the Ruin Delve, Portal Arches, the World Tree | `7b8cbb1`, `21b8a32` (iterations 13, 25) | `relics.ts`, portals in `agents.ts` | §13.9 | |
| The Great Gate, the Pass and the Heart of Belregi | `3bf742b` (iteration 69) | `gate.ts` | §4.100 | |
| Magical buildings: Torrent Mill, Glimhouse, Astral Observatory and forecast, Hanging Gardens, Glowvine Lane | `f814c57` (iteration 12) | `buildings.json`, `forecast.ts`, `networks.ts` | §8 | |
| The Brickworks | `9fac9e9`, `b45a3ea` (iterations 80, 83) | `buildings.json`, `drawn.ts`, `construction.ts` speed bonus | §4.111, §4.114 | |
| Wonders and marvels other than the Lantern of Vell | various | `buildings.json` | §8 | `WONDER_HALLS` in `catalog.ts` |
| The Annals (135 counters) | `584f5a0` (iteration 55) | `src/data/annals.ts`, `stats` in `types.ts` | §4.86 | |
| Scenarios One-Node, Island, Inherited; the daughter charter; the daily challenge | `c60d405`, `5bc3920`, `170291f` (iterations 17–19) | `scenario.ts`, `charter.ts` | §4 (iterations 17–19) | the title screen |
| Terraforming (the Land tab) | `170291f` (iteration 19) | `actions.ts` | §4 (iteration 19) | |
| Trade extras: the Twin Road toll, trade routes | `c46477f` (iteration 24) | `trade.ts` | §13.8 | the depot stays |

## Open work that is parked

- NEXT_STEPS: the art still drawn in code, M18 part 2 (the Fen-Nex's game), M19 parts 1–3 (striders, the Belerial).
- GitHub issues labelled `parked` (the open ones, 105–124).
- eda-lore PR 5 (the Fen-Nex proposal), labelled `parked`.
