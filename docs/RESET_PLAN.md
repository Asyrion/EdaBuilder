# Scope-Reset & Polish-Plan — Wardlight (Eda City Builder)

Stand: 2026-10-21 · Basis: `main` @ `ac4e05f` (Iteration 96) · Status: **Entscheidungen vom 2026-10-21 eingearbeitet (§9); jede Phase wartet auf Freigabe**

Dieses Dokument ist das Ergebnis einer reinen Analyse. Es wurde kein Code geändert. Jede Phase startet erst nach
ausdrücklicher Freigabe.

---

## 0. Kurzfassung

- **Tech-Stack:** TypeScript 5.6 + Vite 5, Canvas 2D (kein WebGL, keine Engine), deterministische Fixed-Tick-Simulation
  (`src/sim`, 10 Ticks/s, 900 Ticks/Tag), prozedurales WebAudio, vitest, Playwright-Playtests, Deploy auf GitHub Pages.
- **Basis-Volk:** die **Vellish** (Default in `createGame`, `createScenario`, Save-Migration und `factionOf`-Fallback;
  vor Iteration 34 gab es überhaupt keine Völker). Siehe §2.2.
- **Wo der Scope gekippt ist:** zweimal.
  1. **Mechaniken:** nach Iteration 5. Mit dem „Fantasy-Roadmap“-Commit `79fe727` und Iteration 6 (`69f304b`, Kreaturen)
     ging es von „City Builder mit Magie“ zu „Kreaturen-, Drachen- und Wunder-Sammlung“. Der Code wuchs von 8,7k auf 25,4k Zeilen.
  2. **Völker:** ab Iteration 34 (`0826a06`, Völker-Gerüst). Danach kamen Grimmen (35–38), Veshari (39–40), Tallowkin (41, 52)
     und Fen-Nex (96).
- **Gesunder Kern:** Iteration 1–4 (`88fcdc2` … `283a3fc`). Danach kamen aber viele *gute* Dinge dazu: Pixel-Scale,
  importierte Gemälde, Tastatur-Fokus, Command-Layer/Replays, Packed Sheet und Dev-Board. Deshalb ist **kein Revert** geplant,
  sondern ein **gezielter Rückbau** auf dem aktuellen Stand.
- **Größenordnung:** Kern-Sim ≈ 4,6k Zeilen. Add-ons ≈ 9k+ Zeilen Sim, dazu UI, Bot, Tests (97 Dateien, 622 Tests,
  davon 59 `iterationNN`-Dateien) und 89 Playtest-Skripte.

---

## 1. Bestandsaufnahme

### 1.1 Tech-Stack & Architektur

| Bereich | Stand |
|---|---|
| Sprache/Build | TypeScript, Vite 5 (`base: './'`, `__BUILD__` = Git-Hash), `tsc --noEmit && vite build` |
| Rendering | Canvas 2D, eigener Renderer (`src/render/renderer.ts`, 1422 Z.). Boden in 8×8-Chunk-Canvases gecacht, Objekte pro Frame tiefensortiert (`x+y`), Lightmap (½ Auflösung) + Emissive-Layer + Bloom (¼ Auflösung), Partikel (9 Arten, max. 900) |
| Projektion | 2:1-Isometrie, Tile 32×16, Karte 128×128, Integer-Zoom 1–4, Back-Buffer in nativer Auflösung, Blit ohne Smoothing, `image-rendering: pixelated` |
| Simulation | `src/sim` (50 Dateien, 14,7k Z.), fixed-step, seeded RNG (`rngOf`/`commitRng`), Tagesschleife mit ~45 Systemaufrufen in `sim.ts` |
| Daten | `src/data/content/*.json` (85 Gebäude, 4 Straßentypen, 9 Meilensteine, Relikt-Sets) und `content/text/*.json` (52 Events, 141 Quests, 15 Edikte, 4 Gilden) |
| UI | DOM-Overlay, eine `UI`-Klasse (`src/ui/ui.ts`, 2009 Z.): Topbar mit 8 Knöpfen, Toolbar mit 9 Tabs, Ledger, Advisor, Forecast, Inspector, Nachfragebalken, Minimap, Log, 11 Modals |
| Audio | `src/audio/audio.ts`, komplett synthetisch (Ambience, Musik, UI-Blips, positionale Cues) |
| Save | JSON in `localStorage` (`wardlight.save.v1`), Autosave täglich, Export/Import, `SAVE_VERSION 7` mit Migration 6→7, danach unversionierte Fallbacks |
| Replays | `src/sim/commands.ts`: jede Spieleraktion als Op (~40 Ops), Replay-Datei mit Checkpoints, Headless-Verifier |
| Tests | vitest: 97 Dateien, 13,3k Z., 622 Tests. Playwright: 89 `playtestNN.mjs` |
| Balance | Bot-Spieler (`bot.ts`, 1087 Z.), `scripts/table.ts` (Völker × Seeds × Draws, mit Cache in `balance/cache`) |
| Tools | `tools/devboard` (3,6k Z.): Content-Editor, Tracker, „Send to Claude“, Art-Pipelines (Importer, Tripo, Aseprite) |
| Assets | `inspirations/` 148 MB Referenzgemälde (committet). `public/art` 5,1 MB: 1075 Einzel-PNGs **und** ein gepacktes Sheet. 753 prozedurale Sprites werden beim Boot pro Pixel gemalt |
| Doku | `DESIGN.md` 514 KB/7040 Z. (ein Abschnitt pro Iteration), `NEXT_STEPS.md` 1169 Z., `HANDOFF.md` 658 Z., `AUDIT.md` 356 Z. |

**Baseline-Checks (2026-10-21):** `tsc` sauber, vitest 622/622 grün (Details §7).

### 1.2 Git-Historie: wie das Projekt gewachsen ist

| Abschnitt | Iterationen / Commits | Inhalt | src-Zeilen |
|---|---|---|---|
| **Gesunder Kern** | 1 `88fcdc2` | Straßen, 4 Zonen, Nachfrage, Mana/Spires, Wasser, Dienste, Steuern, Meilensteine, Gefahren, Bot, Overlays | 7,0k |
| | 2 `3eb459b` | Warenfluss (Karren), Jahreszeiten, Story-Events, Edikte | 7,5k |
| | 3 `b205a93` | Distrikte, Leystone-Minen, Event-Ketten, Ambience, Barrierefreiheit | 7,9k |
| | 4 `283a3fc` | Handelsdepot, Feste, Wellspring vertiefen, Undo | 8,3k |
| Art-Pass | 5 `4b61531` | Fantasy-Art-Pass, **Fantasy-Roadmap** (`79fe727`) | 8,7k |
| **Kippunkt Mechaniken** | 6–16 | Kreaturen, Gloam-Hounds, Wall, Wyrmcraft I/II, Wyrm-Ring, Gates of the Pass, Quests/Ledger, Sleeping Wyrm, magische Gebäude, Portale, Ruinen, Weltbaum, Golems, Skyrays, Fahrzeuge (Luftschiff, Barken, Drachenreiter), War-Tigers, Fen-Nex-Viertel, Mana-Stürme | 13,2k |
| | 17–33 | Szenarien, Tochter-Charter, Terraforming, Daily Challenge, Sektoren, „Interconnection Deep Dive“ (6 Phasen), Bau-NPCs, Dev-Panel, 11 Walker-Arten | 15,8k |
| **Kippunkt Völker** | 34 `0826a06` | Faction-Gerüst (Vellish + Grimmen-Stub) | 15,8k |
| | 35–41, 52 | Grimmen, Veshari, Tallowkin inkl. eigener Quests, Events, Walker, Wunder, Bot-Strategien | |
| | 44–55 (M14) | „Depth Pass“: Ley-Limits, Boden-Limits, Personal, Unruhen, Drachen-Reife, „die Welt schlägt zurück“, der Bot spielt alles | |
| | 56–84 | Art: Gemälde-Import, Facing, Skalierung, eda-lore-Swap (viel davon wertvoll) | |
| | 57–61, 85–86, 95 | Wildnis/Jagd, Fischerei/Wasser, Marsch, Marsch-Wyrms, Patagoi-Atoll | |
| | 62–64, 71 | Balance-Tabelle, „wide bar“, Cache | |
| | 87–91 | Dev-Board (Content als Daten, Tracker, Art-Pipelines) | |
| | 96 `fa7b510` | Fen-Nex als fünftes Volk | 25,4k |

**Befund:** Die Mechaniken sind ab Iteration 6 ausgeufert, die Völker ab Iteration 34. Die Kernschleife wurde dabei
nie neu poliert. Stattdessen kamen „Depth“-Schichten (Personal, Unruhe, Ley-Limits) für alle fünf Völker hinzu und mussten
jeweils für alle balanciert werden. Das ist der eigentliche Komplexitätstreiber, und er ist im Prozess verankert
(CLAUDE.md: „wide balance bar“ pro Volk bei jeder Sim-Änderung).

**Referenzpunkte zum Vergleichen (nicht zum Zurücksetzen):**
- `283a3fc` (Iteration 4): der letzte Stand „nur City Builder“.
- `4b61531` (Iteration 5): Kern plus Fantasy-Art-Pass, letzter Stand vor Kreaturen.

### 1.3 Basis-Volk: Vellish

Belege:
- `src/data/factions.ts`: `factionOf()` fällt auf `FACTIONS.vellish` zurück. Die Vellish haben `NEUTRAL_RULES`, `deny: []`
  und `replaces: {}`. Alle anderen Völker definieren sich als Ersetzungen von Vellish-Gebäuden (`replaces: Vellish-Key → eigener Key`).
- `world.ts:36` hat `createGame(..., faction = 'vellish')`, dazu `scenario.ts:31`, `save.ts:102` (`state.faction ?? 'vellish'`)
  und den Titelbildschirm-Default (`ui.ts:1437`).
- Commit `0826a06` beschreibt sich als „A FACTIONS table with the Vellish default and a Grimmen stub … Seed 42 bit-identical
  to main“. Das Spiel *vor* Iteration 34 ist also das Vellish-Spiel.
- Lore: Die Startgeschichte („The Ashen Crown of Vell … granted you a Charter“) und das Wunder „Lantern of Vell“ stammen
  aus dem ersten Commit.

**Hinweis (offene Frage, §8):** Im Kanon von `eda-lore` (INDEX.md) gibt es nur die **Huruhui** und die **Drygefolk** als Völker.
„Vellish“, „Grimmen“, „Veshari“, „Tallowkin“ und „Fen-Nex“ sind nicht kanonisch. Für Fen-Nex liegt ein Proposal-Entwurf vor.

### 1.4 Inventar der Systeme

Spalte **Verflechtung** = wie stark das System mit Völker- oder Add-on-Code verwoben ist (gering / mittel / hoch).

| System | Dateien (Zeilen) | Zustand | Verflechtung | Befunde |
|---|---|---|---|---|
| Terrain/Kartengenerator | `terrain.ts` (343), `atoll.ts` (208) | gut | mittel: Volk-Starts (underhill, riverside, twinnode, fen), Marsch, Atoll | Volks-Optionen müssen raus. Prüfen, dass Vellish-Karten bit-identisch bleiben |
| Straßen | `roads.ts` (54), `actions.ts` | gut | gering | 3 Stufen + Glowvine Lane. `roads.ts` liest Marsch-Wyrm-Höhlen lokal (Zyklusvermeidung) |
| Zonen & Wachstum | `growth.ts` (750) | funktioniert | mittel: `noCraft`, `marketStock`, `darkAbandon`, `faction`-Faktoren | Spawn per Zufallsstichprobe (3 Tiles/10 Ticks): kleine positive Nachfrage wächst kaum |
| Nachfrage | `growth.ts:443-549` | funktioniert, teils undurchsichtig | gering | Erklärung in `demandExplain` vorhanden. Feste Verhältnisse (1 Markt-Job/5 Einw.) für Spieler unsichtbar |
| Mana (= Strom) | `networks.ts` (466) | funktioniert | mittel: `nodeMana`, `hillMana`, `millMana`, Wick-Tower, Sluice | O(spires²) in der Spire-Kette. Irreführender Header-Kommentar |
| Wasser (Brunnen) | `networks.ts` | gut | mittel: Seep/Tidewell als Ersatz | |
| Dienste-Abdeckung | `services.ts` (293) | gut | mittel: Ward-Multiplikatoren, Gates | **Feuerwehr heißt „Veshari Hall“** (Key `veshari`), Namenskollision mit einem Volk. Allokiert alle 6 Ticks ein neues 16k-Array |
| Landwert, Miasma | `services.ts` | gut | gering | `updateLandValue` erzeugt 16.384 `{label,v}`-Objekte pro Lauf (GC-Druck) |
| Verkehr & Agenten | `agents.ts` (584) | funktioniert | gering | A* mit Stau-Kosten, aber Pfad-Cache nur per `roadVersion` invalidiert. **Bug:** `agents.ts:496` `return` statt `continue` bricht den Agenten-Tick ab |
| Warenfluss (Karren) | `agents.ts`, `economy.ts` | funktioniert | mittel: Golem-Hauler, Barken, Hounds | |
| Wirtschaft/Budget | `economy.ts` (189) | funktioniert | mittel: Meilenstein-Gates pro Volk, Crown Favour, Levy | Kredit und Gunst der Krone als Zusatzschicht |
| Meilensteine | `milestones.json`, `economy.ts:156` | funktioniert | hoch: Volksgates (Stein, Liegeplätze, Licht, Routen), `lantern_wonder`-Slot | Vellish-Gate: Glück + leuchtende Lantern of Vell |
| Zufriedenheit/Gesundheit/Unruhe | `growth.ts`, `services.ts` | funktioniert, viele Terme | mittel | M14 hat Unruhe „mit Zähnen“ ergänzt (Krawalle), Glück hat ~10 Terme |
| Gefahren | `hazards.ts` (483) | Kern | mittel | Feuer, Wild Surge, Gloam-Kriechen, Ruhelose Tote. Das ist die **Magie in der Kernschleife** und passt zur Vision |
| Distrikte | `districts.ts` (137) | funktioniert | gering | CS1-nah, behalten |
| Edikte | `edicts.ts` (217), 15 Edikte | funktioniert | mittel: Deep Cut (Grimmen), Zähmungs-Edikte, Drainage | Auf CS1-artige Policies reduzieren |
| Sektoren/Charter-Linie | `sectors.ts` (90) | funktioniert | gering | CS1-Kachelkauf, behalten |
| Bau mit Bau-NPCs | `construction.ts` (155) | funktioniert | gering | Hübsches „Juice“, behalten |
| Handel/Depot/Karawane | `trade.ts` (162), Teile `events.ts` | funktioniert | mittel: Caravanserai, Twin Road | Depot = CS1-Außenverbindung |
| Jahreszeiten | `sim.ts`, `weave.ts` | funktioniert | hoch: Hush-Belagerung, Fluten, Gales, Close Season | Vier Jahreszeiten als Stimmung behalten. Die Mechanik daran hängt fast nur an Add-ons |
| Wetter/„Weave“, Ley-Aspekte | `weave.ts` (287) | funktioniert, tragend | hoch: ~25 Importeure, Drachen-Auren, Fluten | Entkoppeln ist aufwendig. Ley-Aspekte sind ein Kandidat für „Magie organisch“ (§4) |
| Events/Tales | `events.ts` (944), 52 Events | funktioniert | hoch: Volks-Events, Drachen, Wyrm, Gilden | Pausieren das Spiel mit Entscheidungen. Kein CS1-Element |
| Quests/Ledger | `data/quests.ts` (430), 141 Quests | funktioniert | hoch: 27 `faction`-Zweige | Als Tutorial und Meilenstein-Führung wertvoll. Viel zu viele Quests |
| Advisor, Chronicle | `ui.ts` | gut | gering | Behalten |
| Annals (Statistik) | `data/annals.ts` (228) | funktioniert | hoch: ~135 Zähler, meist Add-ons | |
| Forecast (Observatorium) | `forecast.ts` (86) | funktioniert | mittel | |
| Walker (11 Arten) | `walkers.ts` (506) | funktioniert | hoch: Steinsexton, Barkenmann, Laternenanzünder … | Sichtbare Dienstrunden erzeugen Boni („walkerBonus“) |
| Kreaturen/Drachen/Wyrm | `creatures.ts` (907), `wyrmcraft.ts` (593), `wyrm.ts` (355), `breeding.ts`, `marshwyrms.ts`, `beasts.ts`, `hounds.ts`, `lore.ts`, `wild.ts` (528) | funktioniert | hoch | ≈3,8k Zeilen. Größter Einzelblock. Eigener Topbar-Knopf „Wyrms“ |
| Fischerei/Schilf/Furten | `water.ts` (538), `gales.ts`, `marsh.ts` | funktioniert | hoch | Zweite Bedeutung von „Wasser“ |
| Fahrzeuge | `vehicles.ts` (380) | funktioniert | hoch | Schwebekarren, Barken, Drachenreiter, Luftschiff |
| Gilden, Relikte, Ruinen | `guilds.ts` (288), `relics.ts` | funktioniert | mittel | |
| Wunder & Marvels | 9 Wunder + 9 Marvels | gemischt | hoch | Pro Volk eigene Wunder |
| Szenarien, Tochter-Charter, Daily Challenge | `scenario.ts`, `charter.ts` | funktioniert | mittel: Daily Challenge läuft den Bot über 4 Völker, `inherited` läuft den Bot 28 Tage | |
| Undo | `commands.ts`, `actions.ts` | gut | gering | Nur Spieleraktionen |
| Commands/Replays | `commands.ts` (194), `scripts/replay.ts` | gut | mittel: ~40 Ops, viele Add-on-Ops | Wertvolle Infrastruktur für Determinismus-Tests |
| Save/Load | `save.ts` (163) | funktioniert, unordentlich | hoch: ~30 Add-on-Felder, ~135 Stats | Nach v7 nur noch unversionierte `??`-Fallbacks |
| Bot (Balance-Spieler) | `bot.ts` (1087), `botPolicy.ts` | funktioniert | hoch: `quarry/moor/brighten/trade`, 12 `rules`-Lesungen | Bekannte Schwächen: Licht-zuerst-Regel kostet ⅓ bis ½ der Einwohner, hohe Varianz |
| Dev-Kommandos | `dev.ts` (174) | gut | mittel | Behalten, ausdünnen |
| UI | `ui.ts` (2009), `tools.ts`, `focus.ts` | funktioniert, überladen | mittel (Völker), hoch (Add-ons) | `refreshInfo` hat 310 Zeilen mit 55 `b.kind`-Zweigen. 8 Topbar-Knöpfe, 11 Modals |
| Overlays/Info-Views | `render/overlays.ts` | gut | mittel: Weave, Ward | 17 Views. Kern von Säule 3 der Vision |
| Renderer | `render/*` | gut, mit Schwächen | mittel: Drachen, Stürme, Sky-Layer | Siehe §5 (Phase 3/4) |
| Audio | `audio.ts` | gut | gering | Hooks zentral in `main.ts` |
| Art-Pipeline | `scripts/importSprites.mjs`, `art/sources.json` (807 Einträge), `tools/devboard` | funktioniert, überdimensioniert | gering | Drei Stilquellen (prozedural / im Code gezeichnet / importierte Gemälde mit eigener Palette) |
| Dev-Board | `tools/devboard` | funktioniert | gering | Nicht ausgeliefert. Ausdrücklich vom Nutzer gewünscht (2026-10-08) |
| Tests & Playtests | `tests/`, `scripts/playtestNN.mjs` | grün (siehe §7) | hoch | 59 Iterations-Testdateien, 89 Playtests: viel historischer Ballast |

**Gefundene Bugs und toter Code (Auswahl, geprüft):**
1. `src/sim/agents.ts:496`: Schlägt ein Portal-Sprung fehl, bricht `return` den gesamten `tickAgents`-Durchlauf ab.
   Alle übrigen Agenten werden übersprungen, `commitRng` ebenfalls. Fällt mit dem Portal-Rückbau weg, sonst `continue`.
2. `src/render/renderer.ts:948`: Lichter der Mana-Stürme werden *nach* `applyLighting` (Z. 933) gepusht und leuchten nie.
   Fällt mit dem Sturm-Rückbau weg.
3. Der A*-Pfad-Cache (`agents.ts:21-43`) ignoriert neue Staus bis zur nächsten Straßenänderung. `roadVersion` wird laut
   HANDOFF nicht bei jedem Straßen-Write erhöht (Bot, Dev, Undo).
4. Modul-Globals außerhalb von `GameState` (`lastDemandWhy`, `beastmastersOn`, Fen-Nex-/Quarter-Snapshots) sind ein
   Determinismus-Risiko für Replays.
5. Toter Code: `vehicles.newAirship`, `economy.totalCapacity`, `growth.tileHasLitNeighbor`, `breeding.dragonLines`,
   `lore.fenNexDistrict`, `lore.isTiger`, `networks.roadManaUse`, `scenario.scenarioDef`, `world.seedFromName`,
   `world.buildingCenter`, `world.zoneOfKey`, `wyrmcraft.marketCapFor/dragonLabel/cradleTileOf`.
6. Duplikate: zwei Fen-Nex-Konzepte (Besucherviertel `lore.ts` und Volk `factions.ts`), drei Wyrm-Systeme, zwei
   „Wasser“-Systeme, doppelte Imports in `sim.ts`.
7. Bürger-Variante 4/5 (Grimmen-/Tallowkin-Look) erscheint per `rng.int(6)` auch in Vellish-Spielen (`agents.ts:267`).
8. `devicePixelRatio` wird ignoriert (`renderer.ts:120`). Auf 125-%- oder 150-%-Displays skaliert der Browser das Canvas
   nicht ganzzahlig, dadurch ungleich breite Pixel.
9. Bekannte Balance-Probleme laut HANDOFF/NEXT_STEPS: Mana deckelt Städte bei ~3–4k Einwohnern, der Bot verliert mit der
   Licht-zuerst-Regel ⅓ bis ½ der Einwohner, Agenten schneiden Kurven, Bäume und Gebäude überlappen an Chunk-Kanten,
   Software-Rendering bei Zoom 1 braucht ~28 ms.

---

## 2. Klassifizierung

Legende: **B** = Behalten · **P** = Polieren · **Pk** = Parken (entfernen, im Archiv-Tag erhalten) · **E** = Entfernen.

### 2.1 Tabelle

| # | Feature/System | Kat. | Begründung | Betroffene Dateien | Abhängigkeiten |
|---|---|---|---|---|---|
| 1 | Straßen (3 Stufen, Brücken) | B | Kernmechanik, funktioniert | `roads.ts`, `actions.ts`, `roads.json` | Glowvine Lane hängt an Hanging Gardens → mit parken |
| 2 | Zonen Hearth/Market/Craft/Arcane, 3 Stufen | P | Kern. Spawn-Rhythmus, Feedback und Level-Anzeige brauchen Arbeit | `growth.ts`, `buildings.json` | Volksfaktoren entfernen |
| 3 | Nachfrage (RCI) | P | Kern, Erklärung vorhanden, Modell undurchsichtig | `growth.ts:443-549`, `ui.ts:714-747` | — |
| 4 | Mana-Netz (Spires, Knoten, Brownout, Surge) | P | „Magie als Infrastruktur“, der CS1-Strom. O(n²), Mana-Deckel | `networks.ts`, `hazards.ts` | Volksmultiplikatoren, Torrent Mill, Nexus |
| 5 | Wasser (Brunnen, Zisternen) | B | Kern, einfach | `networks.ts` | Seep/Tidewell raus |
| 6 | Dienste: Watch, Heiler, Feuer, Schrein, Akademie, Friedhof/Ossuarium, Ward Lantern, Gärten | P | Kern. Feuerwehr umbenennen (Namenskollision „Veshari Hall“), Abdeckung allokationsfrei | `services.ts`, `buildings.json` | Quests, Bot, `marshwyrms.ts` |
| 7 | Landwert, Miasma, Gesundheit, Bildung | B | Kern | `services.ts`, `growth.ts` | — |
| 8 | Zufriedenheit/Unruhe | P | Kern, aber ~10 Terme. Krawalle aus M14 prüfen | `growth.ts`, `hazards.ts` | Gilden, Walker |
| 9 | Verkehr/Agenten/A* | P | Kern. Cache-Bug, Portal-Bug, Kurvenschneiden | `agents.ts` | Portale, Golems raus |
| 10 | Warenfluss (Karren, Craft → Markt) | B | CS1-Industrie-Logik, gut lesbar | `agents.ts`, `economy.ts` | — |
| 11 | Leystone-Minen → Arcane-Waren | B | Kleine, klare Produktionskette | `buildings.json` (mine) | Concord Wardens (Golem-Wecken) raus |
| 12 | Budget/Steuern/Unterhalt/Kredit | P | Kern. Crown Favour und Levy vereinfachen | `economy.ts`, Budget-Modal | — |
| 13 | Meilensteine (9) | P | Kern. Nur Vellish-Liste, Gate „Lantern of Vell“ prüfen | `milestones.json`, `economy.ts:156` | `lantern_wonder`-Slot, `contentCheck` |
| 14 | Gefahren: Feuer, Wild Surge, Gloam-Kriechen, Ruhelose Tote | P | Magie *in* der Kernschleife, die Säulen der Vision. Feedback und Fairness prüfen | `hazards.ts` | Stürme, Hounds raus |
| 15 | Distrikte | B | CS1-Kern | `districts.ts` | Fen-Nex-Viertel raus |
| 16 | Edikte (15 → ~6–8 Policies) | P | CS1-Policies, aber zu viele und zu Add-on-lastig | `edicts.ts`, `edicts.json` | Deep Cut, Zähmungs-Edikte, Drainage raus |
| 17 | Sektoren/Charter-Linie | B | CS1-Kachelkauf | `sectors.ts` | — |
| 18 | Bau mit Bau-NPCs | B | Sichtbares Wachstum, Juice | `construction.ts` | Brickworks-Bonus (falls Brickworks geparkt) |
| 19 | Handelsdepot/Karawane | P | CS1-Außenverbindung. Twin Road, Caravanserai raus | `trade.ts`, Teile `events.ts` | — |
| 20 | Jahreszeiten (4 × 30 Tage) | P | Stimmung, Nachtlänge. Mechaniken daran meist Add-on | `sim.ts`, `weave.ts` | Hush-Belagerung, Fluten, Gales raus |
| 21 | Wetter/Weave (Regen, Dürre, Blizzard) | Pk | Querschnittssystem mit ~25 Importeuren, wenig Kernnutzen | `weave.ts` | Vor dem Parken entkoppeln (Phase 1c) |
| 22 | Ley-Aspekte der Knoten (Ember, Bone …) | Pk | Entschieden 2026-10-21: parken. Später ggf. schlank zurück (eigene Freigabe) | `weave.ts`, `world.ts:assignAspects` | Entscheidung offen (§8) |
| 23 | Wellspring vertiefen | B | Einfaches Mana-Upgrade | `world.ts` | — |
| 24 | Story-Events/Tales (52) | Pk | Pausieren das Spiel. Kein CS1-Element, stark verflochten | `events.ts`, `events.json`, `botPolicy.ts` | Feste, Karawane, Krawall-Auslöser |
| 25 | Quests/Charter's Ledger (141) | P | Als **Tutorial + Meilenstein-Führung** auf ~15–20 Aufgaben kürzen, Rest parken | `data/quests.ts`, `quests.json`, `ui.ts:506` | 27 Volkszweige |
| 26 | Advisor, Chronicle | B | Feedback, klein | `ui.ts` | — |
| 27 | Annals (135 Statistiken) | Pk | Fast nur Add-on-Zähler | `data/annals.ts`, `types.ts` stats | Kernzähler in einfache Statistik überführen |
| 28 | Forecast/Astral Observatory | Pk | Add-on | `forecast.ts` | — |
| 29 | Walker (11 Arten) | Pk | Bonus-System mit Volks-Walkern. Sichtbare Dienste → später ggf. als reine Optik | `walkers.ts` | `walkerBonus` in Abdeckung |
| 30 | Kreaturen (Glimmoths, Thrumhares, Wisps) | Pk | Atmosphäre ohne Kernnutzen. Ggf. als reine Deko-Partikel später zurück | `creatures.ts` | — |
| 31 | Drachen/Wyrmcraft/Brut/Wyrm-Ring/Mews | Pk | Größter Add-on-Block, eigenes Spiel im Spiel | `wyrmcraft.ts`, `breeding.ts`, `creatures.ts`, UI-Modal „Wyrms“ | Events, Quests, Gebäude, Auren in `weave.ts` |
| 32 | Sleeping Wyrm/Wyrm-Court | Pk | Add-on, eigene Niederlage | `wyrm.ts` | `economy`, Renderer |
| 33 | Marsch, Marsch-Wyrms | Pk | Add-on (M17) | `marsh.ts`, `marshwyrms.ts`, `terrain.ts` | `roads.ts`-Lookup |
| 34 | Gloam-Hounds, Hush-Belagerung, Warding Wall, Gates | Pk | Zweite Gloam-Schicht. Kern-Gloam = Kriechen + Ward Lantern | `hounds.ts`, `creatures.ts`, `gate.ts`, Wall in `actions.ts` | Niederlage „hounds“ |
| 35 | Great Gate, Pass, Pilger | Pk | Lore-Add-on | `gate.ts`, `walkers.ts` | — |
| 36 | Golems (Concord Wardens, Foundry, Hauler), Skyrays, Ley Beacon | Pk | Add-on | `beasts.ts` | Minen-Wecken |
| 37 | War-Tigers, Fen-Nex-Besucherviertel, Mana-Stürme | Pk | Add-on, Duplikat zum Volk Fen-Nex | `lore.ts` | `setFenNex` in jedem Tick |
| 38 | Wildnis, Jagd (Lodge, Herden, Wölfe) | Pk | Add-on (M16) | `wild.ts` | Markt-Fleisch |
| 39 | Fischerei, Schilf, Räucherei, Furten, Weir, Hochwasser | Pk | Add-on (M16) | `water.ts` | Bot |
| 40 | Fahrzeuge: Schwebekarren, Barken/Quays, Drachenreiter, Luftschiff/Sky-Dock | Pk | Add-on | `vehicles.ts` | Wyvern-Ersatz für Luftschiff |
| 41 | Magische Gebäude: Torrent Mill, Glimhouse, Observatory, Hanging Gardens, Glowvine Lane | Pk | Entschieden 2026-10-21: parken (auch die Torrent Mill) | `buildings.json`, `networks.ts` | — |
| 42 | Portal Arches, Ruinen von Lukuku/Ruin Delve, Relikte, Weltbaum | Pk | Add-on | `relics.ts`, `agents.ts` (Portale) | Portal-Bug |
| 43 | Gilden (4) | Pk | Add-on | `guilds.ts` | Unruhe-Treiber |
| 44 | Wunder: Lantern of Vell | P | Das eine Wunder des Basis-Volks, Meilenstein-Ziel | `buildings.json`, `drawn.ts` | `WONDER_HALLS` |
| 45 | Übrige Wunder und 9 Marvels | Pk | Völker- oder Add-on-gebunden | `buildings.json` | — |
| 46 | Brickworks | Pk | Entschieden 2026-10-21: parken (Gemälde bleiben in `inspirations`) | `buildings.json` | Entscheidung offen (§8) |
| 47 | **Völker Grimmen, Veshari, Tallowkin, Fen-Nex** | **Pk** | Vorgabe des Nutzers | `factions.ts`, 17 Gebäude, 26 Quests, 9 Events, 4 Walker, Terrain-Optionen, Bot-Strategien, `ZONE_LOOKS`, 9 Testdateien | siehe §3 Phase 1a |
| 48 | Faction-Gerüst (`factionOf`, `FactionRules`) | B (dünn) | Entschieden 2026-10-21: als dünne Nahtstelle behalten (nur Vellish, neutrale Regeln) | `factions.ts` + ~16 Leser | Kann als Nahtstelle bleiben, falls Völker zurückkommen (§8) |
| 49 | Szenarien: Valley | B | Standardspiel | `scenario.ts` | — |
| 50 | Szenarien: One-Node, Island | Pk | Entschieden 2026-10-21: parken. Nur das Valley bleibt | `scenario.ts` | — |
| 51 | Szenarien: Atoll, Inherited Collapse | Pk | Atoll = M17-Add-on. Inherited läuft den Bot | `atoll.ts`, `isles.ts`, `gales.ts` | — |
| 52 | Tochter-Charter (Endgame), Daily Challenge | Pk | Endgame-Add-on. Challenge hängt am Bot über 4 Völker | `charter.ts`, `scenario.ts` | — |
| 53 | Terraforming (Land-Tab) | Pk | Entschieden 2026-10-21: parken | `actions.ts` | — |
| 54 | Undo | B | Kern-Komfort | `commands.ts` | — |
| 55 | Command-Layer/Replays | B | Determinismus-Sicherheitsnetz für den Rückbau. UI-Teil „Watch a replay“ optional | `commands.ts`, `scripts/replay.ts` | Add-on-Ops entfernen |
| 56 | Save/Load | P | Sauberer Schnitt: neue Version, klare Migration | `save.ts`, `types.ts` | §8 |
| 57 | Bot (Balance-Spieler) | P | Als Test-Werkzeug behalten, auf ein Volk und den Kern reduzieren | `bot.ts`, `botPolicy.ts` | — |
| 58 | Balance-Tabelle/„wide bar“/Cache | P | Auf ein Volk umstellen, Laufzeit drastisch senken | `scripts/table.ts`, `balance/cache` | CLAUDE.md-Prozess |
| 59 | Dev-Kommandos/Dev-Panel | B | Für Tests nützlich, Add-on-Kommandos raus | `dev.ts` | — |
| 60 | UI-Shell (Topbar, Toolbar, Ledger, Inspector, Minimap, Modals) | P | Entrümpeln: Wyrms, Annals und Edikt-Gildenblock raus, Inspector aufteilen | `ui.ts`, `tools.ts` | alles |
| 61 | Tastatur-Fokus, Key-Bindings, Farbenblind-Ramps, UI-Scale | B | Gute Barrierefreiheit | `focus.ts`, `keys.ts` | — |
| 62 | Info-Views/Overlays | P | Säule der Vision. Add-on-Views (Weave, Goods?) raus, Legenden ergänzen | `overlays.ts` | — |
| 63 | Renderer-Kern (Chunks, Tiefensortierung, Lightmap, Bloom, Partikel) | P | Gute Basis, Hotspots in §5 | `render/*` | — |
| 64 | Audio | B | Klein und gut | `audio.ts` | Add-on-Cues raus |
| 65 | Art-Pipeline (Importer, `sources.json`) | P | Ein Stil, eine Palette (Phase 3) | `scripts/importSprites.mjs`, `art/` | — |
| 66 | Tripo-/Aseprite-Pipelines im Dev-Board | B | Entschieden 2026-10-21: behalten (wie das ganze Dev-Board) | `tools/devboard/tripo.ts`, `pipelines.*` | §8 |
| 67 | Dev-Board (Content-Editor, Tracker) | B | Vom Nutzer gewünscht. `kinds.ts` mit dem Rückbau abgleichen | `tools/devboard` | Content-Schema |
| 68 | 1075 Einzel-PNGs neben dem gepackten Sheet | E | Doppelt ausgeliefert (4,3 MB). Fallback per Sheet-Hash reicht | `public/art/sprites` | Importer |
| 69 | `inspirations/` (148 MB im Repo) | E (verschieben) | Entschieden 2026-10-21: nach `eda-lore/inspirations` verschieben, Importer liest den Sibling-Checkout | `inspirations/` | Importer-Pfade, §8 |
| 70 | 59 `iterationNN`-Testdateien, 89 Playtests | E/P | Historischer Ballast. In thematische Suiten überführen, ~5 Playtests behalten | `tests/`, `scripts/` | — |
| 71 | Doku: DESIGN.md (514 KB), NEXT_STEPS (1169 Z.), HANDOFF, AUDIT | P | Ins Archiv verschieben, schlankes neues DESIGN (Kern) schreiben | `docs/` | CLAUDE.md |
| 72 | Toter Code (Liste §1.4) | E | Ballast | diverse | — |

### 2.2 Zahlen in der Übersicht

- **Behalten:** Straßen, Wasser, Landwert/Miasma, Warenfluss, Minen, Distrikte, Sektoren, Bau-NPCs, Wellspring, Advisor/Chronicle,
  Undo, Replays, Dev, Barrierefreiheit, Audio, Dev-Board.
- **Polieren:** Zonen, Nachfrage, Mana, Dienste, Zufriedenheit, Verkehr, Budget, Meilensteine, Gefahren, Edikte, Handel,
  Jahreszeiten, Ledger, Lantern of Vell, Save, Bot, Balance-Tabelle, UI, Overlays, Renderer, Art-Pipeline, Doku.
- **Parken:** 4 Völker, Kreaturen/Drachen/Wyrms, Hounds/Wall/Gates, Golems, Wildnis, Fischerei, Marsch, Fahrzeuge, magische
  Gebäude, Portale/Ruinen/Relikte/Weltbaum, Gilden, Events, Annals, Forecast, Walker, Weave/Wetter, Atoll, Inherited,
  Tochter-Charter, Daily Challenge, übrige Wunder/Marvels.
- **Entfernen:** toter Code, doppelte PNGs, historische Test-/Playtest-Dateien, später das Faction-Gerüst.

Geschätzt bleiben **≈ 30–35 von 85 Gebäuden**. Die Sim schrumpft von 14,7k auf **≈ 6–7k Zeilen**.

---

## 3. Phasenplan

Jede Phase endet mit einem lauffähigen, spielbaren Build auf `main` (bzw. dem Reset-Branch, §8) und denselben Prüfungen:
`npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`, Smoke-Playtest, manuelle Checkliste (Phase 0).

**Begründete Anpassungen gegenüber der vorgeschlagenen Reihenfolge:**
1. **Phase 1 in vier Unterphasen (1a–1d).** Der Rückbau ist zu groß für einen Schritt. Jede Unterphase bleibt spielbar,
   und die Reihenfolge entkoppelt zuerst die Querschnitte (Völker → Kreaturen → Querschnittsysteme → Aufräumen).
2. **Performance-Baseline schon in Phase 0 messen** (nicht erst in Phase 6). So lässt sich zeigen, dass der Rückbau
   schneller macht, und Phase 6 hat Vergleichszahlen.
3. **Renderer-Entscheidung (Canvas 2D bleibt / WebGL-Pfad) am Ende von Phase 3**, nicht in Phase 4. Die Wahl beeinflusst die
   Sprite-Pipeline (Palette-Indizes für einen LUT-Shader). Phase 4 setzt dann nur um.
4. **Die Lesbarkeit der Kernschleife** (Nachfrage, Gründe für Nicht-Wachstum, Overlays mit Legende) ist Teil von **Phase 2**.
   Ohne Feedback lässt sich Balancing nicht beurteilen. Phase 5 übernimmt Juice, Tooltips und Sound.
5. **Der Arbeitsprozess (CLAUDE.md) wird in Phase 0 angepasst.** Die „wide bar“ über fünf Völker und ein Playtest-Skript
   pro Iteration sind mit dem Reset nicht mehr sinnvoll (§8: Entscheidung des Nutzers).

### Phase 0: Absicherung (Aufwand: S, ½ Tag)

**Ziel:** Nichts geht verloren, Regressionen fallen auf, Ausgangswerte sind gemessen.

**Aufgaben:**
1. Archiv anlegen:
   - Tag `archive/full-scope-2026-10-21` auf `main` (`ac4e05f`)
   - Branch `archive/full-scope` (gleicher Commit)
   - Referenz-Tags `ref/core-iter4` (`283a3fc`) und `ref/core-iter5-art` (`4b61531`)
2. Arbeitsbranch `reset/main` von `main` anlegen (oder direkt auf `main` in kleinen PRs, §8).
3. `docs/PARKED.md` anlegen: pro geparktem Feature die Einführungs-Commits, Dateien und DESIGN-Abschnitte, damit sich
   ein Feature gezielt aus dem Archiv zurückholen lässt.
4. **Kern-Smoke-Tests** (vitest, headless), neue Datei `tests/core-loop.test.ts`:
   - neues Spiel, Straße, Zone, 30 Tage: Einwohner > 0, Schatzkammer plausibel
   - Spire bei Knoten: Gebäude beleuchtet; Brunnen: bewässert
   - Steuern ändern: Nachfrage reagiert
   - Save → Load → 10 Tage weiter = identischer Hash wie ohne Save (Determinismus)
   - Bot-Lauf Seed 42/100 Tage: Einwohner in einem Korridor (Golden-Range)
5. **Manuelle Testcheckliste** `docs/CORE_CHECKLIST.md` (10 Minuten): Titel → neues Spiel → Straße → Zonen → Wachstum →
   Spire/Brunnen → Dienste → Budget → Meilenstein Hamlet → Overlays durchschalten → Save/Load → Nacht ansehen.
6. **Ein Smoke-Playtest** `scripts/smoke.mjs` (Playwright): Spiel starten, Kernaktionen, Screenshots Tag/Nacht, keine
   Konsolenfehler.
7. **Baselines messen:** Boot-Zeit, Frame-Zeit bei Zoom 1/2 (`scripts/perf.mjs`), Sim-Zeit pro Tag headless, Bundle-Größe,
   Bot-Ergebnis Seed 42/150 (Vellish).
8. CLAUDE.md-Prozess an den Reset anpassen (nach Freigabe des Nutzers, §8).

**Risiken:** gering. Die Golden-Range für den Bot darf nicht zu eng sein (Varianz laut HANDOFF hoch).
**Abnahme:** Tags/Branch auf `origin` sichtbar. Smoke-Tests und Playtest grün. Checkliste existiert. Baseline-Zahlen
stehen in `docs/RESET_LOG.md`.

### Phase 1: Scope-Reduktion

Grundregel: **zuerst entkoppeln, dann löschen.** Jede Unterphase hat einen eigenen PR, alle Checks grün, und das Spiel
ist danach spielbar. Saves: siehe §8 (Empfehlung: `SAVE_VERSION 8`, alte Saves migrieren auf Vellish und unbekannte
Gebäude verwerfen, oder sauber ablehnen).

#### 1a: Völker auf Vellish reduzieren (Aufwand: M, 1–2 Tage)

1. **Kopplungen lösen:**
   - Feuerwehr „Veshari Hall“ umbenennen, z. B. „Brigade Hall“, Key `firehall`, mit Save-Migration `kind`.
   - `WONDER_HALLS`, `CRADLE_KINDS`/`CRADLE_LINES`, `MOORINGS`, Pilger-Quellen und `contentCheck`
     (`PEOPLES`, `SLOTS`) auf Vellish-Einträge reduzieren.
2. `FACTIONS` auf `vellish` reduzieren. `factionOf()` bleibt vorerst als Nahtstelle und gibt die neutralen Regeln zurück.
   Damit bleiben die ~16 Leser unverändert, und Seed 42 sollte bit-identisch bleiben (wie bei Iteration 34).
3. Entfernen:
   - 17 Volksgebäude in `buildings.json`, ihre Sprites in `sources.json`/`sprites.ts`, `ZONE_LOOKS` (4 Kopien jedes
     Zonensprites) und die Bürger-Varianten 4–6 (bzw. nur Vellish-Varianten würfeln)
   - Terrain-Optionen underhill/riverside/twinnode/fen
   - Volks-Quests (`u_*`, `v_*`, `t_*`, `x_*`, `notFor`), Volks-Events, Edikt Deep Cut, Terraform Delve
   - Volks-Walker (Steinsexton, Barkenmann, Laternenanzünder)
   - Bot-Strategien `quarry/moor/brighten/trade`, `CHALLENGE_PEOPLES`
   - Volksauswahl im Titelbildschirm, Volksname in der Topbar, `nextGate`-Zweige
4. Tests: die 9 Volks-Testdateien löschen (bleiben im Archiv), die 16 gemischten anpassen.
   `table.ts` auf ein Volk umstellen, `balance/cache` neu aufbauen.
5. Save: `faction` ≠ `vellish` → Migration oder Ablehnung (§8).

**Risiken:**
- Volks-Werte stecken versteckt in gemeinsamen Pfaden, z. B. `economy.ts:163` Lantern-Gate und `botPolicy.ts:36`.
- Text-JSONs nennen Völker (18 gemeinsame Gebäudebeschreibungen). Muss die Lore-Texte entscheiden.

**Abnahme:**
- `grep -ri "grimmen\|veshari\|tallowkin\|fennex" src` liefert nur noch Lore-Text, den der Nutzer bewusst behält.
- Seed 42 (Vellish) bleibt bit-identisch zu vor der Phase, außer durch die Feuerwehr-Umbenennung (dann identische Zahlen).
- Alle Checks grün.

#### 1b: Kreaturen, Drachen, Wyrms und Beasts parken (Aufwand: L, 2–3 Tage)

1. Entkoppeln:
   - Drachen-Auren aus `weave.ts`, Wyrm-Ward aus `services.ts`
   - Golem-Hände aus der Arbeitskraft, Mews-Bonus aus der Watch-Reichweite
   - Ward/Hounds aus `agents.ts` (Karren scheuen)
   - Niederlagen „wyrm“ und „hounds“ aus Game-Over
2. Entfernen:
   - `creatures.ts`, `wyrmcraft.ts`, `breeding.ts`, `wyrm.ts`, `marshwyrms.ts`, `beasts.ts`, `hounds.ts`
   - `lore.ts` (Tiger, Stürme, Fen-Nex-Viertel)
   - zugehörige Gebäude, Edikte (Zähmung), Events, Quests, UI-Modal „Wyrms“, Inspector-Zeilen
   - Renderer-Zweige (Sky-Layer-Flieger, Drachen, Stürme), Sprites, Sound-Cues, Dev-Kommandos, Ops in `commands.ts`
3. Warding Wall und Gates mitparken (Gloam bleibt als Kriechen + Ward Lantern).

**Risiken:**
- `weave.ts` und `events.ts` haben ~25 bzw. viele Importeure. Kompilierfehler sind der Wegweiser, aber stille
  Balance-Änderungen sind möglich.
- Gloam wird ohne Hounds eventuell zu harmlos. Das wird in Phase 2 bewertet.

**Abnahme:**
- Keine Kreaturen- oder Drachen-Symbole mehr in `src/`.
- Spiel spielbar über 150 Tage (Bot und manuell).
- Balance-Lauf Seed 42 dokumentiert, mit erklärter Abweichung.

#### 1c: Querschnitts-Add-ons parken (Aufwand: L, 2–3 Tage)

1. Story-Events/Tales:
   - Ein minimales Ereignis-Interface bleibt, falls Phase 2 Kern-Ereignisse will, z. B. „Surge droht“ als Toast statt Pause.
   - Der Rest wird geparkt.
2. Weave/Wetter, Ley-Aspekte (geparkt, Kandidat für Phase 2), Forecast, Annals, Gilden, Relikte/Ruinen/Portale/Weltbaum.
3. Wildnis, Fischerei/Schilf/Furten/Weir, Marsch, Gales, Fahrzeuge (Schwebekarren, Barken, Luftschiff).
4. Walker (Bonus-System) und Pilger/Great Gate.
5. Szenarien Atoll und Inherited, Tochter-Charter, Daily Challenge.
6. Übrige Wunder und Marvels, magische Gebäude (Torrent Mill als Kandidat für Phase 2).
7. Quests auf ~15–20 Kern-Aufgaben kürzen (Tutorial + Meilensteine).
8. Edikte auf ~6–8 CS1-artige Policies kürzen.

**Risiken:**
- Jahreszeiten-Mechanik dünnt aus. Bewusst so; die Neubewertung kommt in Phase 2.
- Die Zahl der Quests bestimmt die Onboarding-Qualität. Die Kürzung wird mit der manuellen Checkliste geprüft.

**Abnahme:**
- `sim.ts`-Tagesschleife mit ≤ 15 Systemen.
- Topbar ≤ 5 Knöpfe.
- Spielbar, Checkliste grün.

#### 1d: Aufräumen (Aufwand: M, 1–2 Tage)

1. Faction-Gerüst inline auflösen, falls entschieden (§8). Toten Code entfernen (Liste §1.4). Doppelte Imports.
   Modul-Globals in `GameState` oder in abgeleitete Caches.
2. Save:
   - `SAVE_VERSION 8`, eine klare Migration, Stats auf Kernzähler reduziert
   - unversionierte `??`-Fallbacks in die Versionsmigration überführen
3. `public/art/sprites/` (1075 Einzel-PNGs) entfernen, nur das Sheet ausliefern. Unbenutzte Einträge in `sources.json` löschen.
4. Tests in thematische Suiten (`core-loop`, `networks`, `growth`, `hazards`, `save`, `render-atlas`) zusammenführen.
   Historische `iterationNN`-Dateien entfernen, wenn ihr Kerninhalt übernommen ist. Playtests auf ~5 reduzieren.
5. Doku:
   - `DESIGN.md`, `NEXT_STEPS.md`, `AUDIT.md` und den alten `HANDOFF.md`-Inhalt nach `docs/archive/` verschieben
   - neues schlankes `docs/DESIGN.md` (Vision, Kernschleife, Systeme mit Zahlen, Art-Direction), neues `NEXT_STEPS.md`
   - README und In-Game-Hilfe an den Kern anpassen
6. Dev-Board: `kinds.ts`/Schema an den reduzierten Content anpassen, `devboard:selftest`.

**Risiken:** Verlust von Wissen aus der Doku. Gegenmittel: Archivordner und `PARKED.md`.

**Abnahme:**
- Zielgrößen: Sim ≈ 6–7k Zeilen, ≤ 40 Testdateien, Bundle kleiner als die Baseline.
- Boot und Frame-Zeit gleich gut oder besser als die Baseline.
- Alle Checks grün.

### Phase 2: Kernmechaniken schärfen (Aufwand: L, 3–5 Tage, in 2–3 Iterationen)

**Ziel:** Die CS1-Schleife (Straße → Zone → Nachfrage → Wachstum → Dienste/Versorgung → Budget → Zufriedenheit) ist
konsistent, lesbar und fair.

**Prüfpunkte und Vorschläge, nach Priorität:**

| Prio | Bereich | Vorschlag |
|---|---|---|
| **P1** | Wachstum | Spawn-Rhythmus deterministischer machen (Kandidaten nach Nachfrage gewichten statt 3 Zufallstiles). Kleine positive Nachfrage muss sichtbar wachsen |
| P1 | „Warum wächst das nicht?“ | Pro Zonen-Tile ein Grund: kein Straßenzugang, kein Mana, kein Wasser, keine Nachfrage, Miasma, Gloam. Im Hover und als Overlay. Das ist der größte Spielspaß-Hebel in CS1 |
| P1 | Nachfrage | Formeln vereinfachen, Faktoren sichtbar machen („Hearth +32 %: 40 freie Jobs“). Glättung (60/40 alle 50 Ticks) prüfen |
| P1 | Mana | O(spires²) beheben, Mana-Deckel bei ~3–4k Einwohnern auflösen. Überlast und Surge-Warnung klar zeigen (Countdown statt Überraschung) |
| P1 | Verkehr | Pfad-Cache bei Staus invalidieren, `roadVersion` bei allen Writes bumpen, Kurvenschneiden beheben. Portal-Bug entfällt mit 1c |
| P2 | Dienste | Abdeckungsradien und Kosten neu balancieren (ohne Walker-Bonus). Feuer: Ausbreitung fair, Brigade-Reichweite sichtbar |
| P2 | Budget | Unterhalt pro Kategorie im Budget, Kredit beibehalten, Crown Favour/Levy streichen oder vereinfachen |
| P2 | Zufriedenheit | Terme auf ~6 reduzieren und im Inspector als Liste zeigen |
| P2 | Meilensteine | Schwellen (40 … 2200) auf eine 30–60-Minuten-Session prüfen. Lantern-of-Vell-Gate prüfen |
| P2 | Gefahren | Ruhelose Tote, Gloam und Surge: je ein klarer Vorbote, ein Gegenmittel und ein Overlay. Mindestens drei faire Niederlagen (Vision §1) |
| P3 | Jahreszeiten | Nur Stimmung + 1 Effekt pro Jahreszeit (z. B. Hush: längere Nächte, mehr Mana-Bedarf für Laternen) |
| P3 | Bot | Licht-zuerst-Regel überarbeiten, Varianz senken. Der Bot ist Messinstrument, kein Ziel |

**Wo die Magie von Eda organisch in die Schleife passt (ohne neue Großsysteme):**
1. **Mana = Strom + Licht.** Das ist schon da und bleibt das Herzstück. Ley-Linien als sichtbares Netz, Brownout als „Flackern“.
2. **Ley-Knoten-Aspekte light** (zurück aus dem Archiv, schlank): Jeder Knoten hat *einen* Bonus in seinem Umkreis,
   z. B. Ember +Craft-Ausstoß, Bone +Friedhofskapazität, Glim +Bildung. Das gibt Standortentscheidungen wie Rohstoffe in
   CS1, ohne neues System.
3. **Wild Surge statt Blackout:** Überlast hat eine magische Konsequenz (verzerrte Gebäude). Ist schon da und braucht
   nur Vorwarnung und Overlay.
4. **Ruhelose Tote = Deathcare-Versagen**, **Gloam = Rand-Druck/Verschmutzung**, **Miasma = Industrie-Verschmutzung**.
   Das sind die CS1-Probleme in Eda-Gewand. Polieren, nicht erweitern.
5. **Arcane-Zone = Büros**, braucht Bildung und viel Mana. Ein guter „Late-Game“-Treiber.
6. Optional: **Torrent Mill** als zweite Mana-Quelle (CS1-Wasserkraftwerk) aus dem Archiv zurückholen.

**Risiken:** Balancing-Änderungen kaskadieren. Deshalb eine Änderung pro Iteration, Bot-Korridor und manuelle Session.
**Abnahme:**
- Eine neue Spielerin erreicht ohne Anleitung „Village“ (220) in ≤ 20 Minuten und versteht jederzeit, warum etwas
  (nicht) wächst.
- Bot-Korridor stabil.
- Keine bekannte P1-Schwäche offen.

### Phase 3: Grafik-Fundament & Pixel-Art (Aufwand: L, 3–5 Tage plus Art-Produktion)

**Ziel:** Eine verbindliche Art-Direction, ein konsistenter Sprite-Satz, pixelgenaue Darstellung.

**Ist-Zustand:**
- 2:1-Iso, Tile 32×16, Integer-Zoom, Smoothing aus, Kamera auf ganze Pixel gerundet: gut.
- Drei Stilquellen:
  - 753 prozedurale Sprites auf `PAL` (~120 Farben)
  - ~14 im Code gezeichnete
  - 834 importierte Gemälde mit **eigener 12–24-Farbpalette pro Sprite**, nicht auf `PAL` gesnappt
- Die Lichtrichtung hängt am Quellgemälde.

**Aufgaben:**
1. **Art-Bible** `docs/ART_BIBLE.md`:
   - Tile 32×16, 2:1, Bürger 12 px als Maßstab (bestehende Regel aus §4.109)
   - Licht von vorne rechts, linke Fläche dunkler
   - 1-px-Outline `#1a1420` (außen), innen selektiv
   - **eine Master-Palette** mit ~48–64 Farben in Rampen (Gras, Wasser, Stein, Holz, Dach ×3, Ley-Blau, Glut, Gloam)
2. **Pixel-Perfect:**
   - `devicePixelRatio` berücksichtigen: Backing-Store = CSS-Größe × DPR, Zoom so wählen, dass `zoom × dpr` ganzzahlig ist
   - Schatten- und Nebel-Ellipsen als Pixel-Sprites statt Vektor-Pfaden
   - Bloom-Blit auf ganze Pixel
3. **Pipeline aufräumen:**
   - Importer snappt auf die Master-Palette (statt Median-Cut pro Sprite)
   - `painted.ts`/`drawn.ts` zusammenführen
   - Prozedurale Sprites bei Build-Zeit statt Boot-Zeit erzeugen (ins Sheet backen), das senkt die Boot-Zeit
4. **Sprite-Liste** (nach dem Rückbau), mit Status „vorhanden ok / überarbeiten / neu“:
   - Zonen: 4 Zonen × 3 Stufen × 4 Varianten = 48 (größtenteils aus eda-lore vorhanden, Palette angleichen) + Ruinen 1×1/2×2/3×3
   - Dienste/Versorgung (~20): Watch Post/House, Heiler/Hospiz, Brigade Hall, Schrein, Tempel ×3, Akademie ×2,
     Friedhof/Ossuarium, Ward Lantern, Garten, Marktplatz, Brunnen, Zisterne, Spire, Nexus, Mine, Font, Depot,
     Founding Stake ×4, Lantern of Vell. Laut HANDOFF sind noch prozedural: Watch House, Veshari Hall, Tempel, Ward Lantern,
     Garten, Marktplatz, Font, Mine
   - Straßen: 3–4 Typen × 16 Verbindungen (prozedural, überarbeiten), Brücken
   - Terrain: Gras/Wiese/Wald/Hügel/Ufer (vorhanden), Wasser/Tiefwasser (4 Frames, prozedural → neu), Gloam ×3,
     Ley-Knoten, Felsen
   - Bäume/Büsche/Pilze (vorhanden, Palette angleichen)
   - Bürger (24 Frames), Bauarbeiter (12), Karren (Esel vorhanden)
   - UI-Icons: 9 Problem-Icons, Werkzeug-Icons, Overlay-Legenden
5. **Renderer-Entscheidung** (Ende Phase 3): Canvas 2D behalten, oder WebGL2-Pfad (z. B. PixiJS v8 oder ein eigener
   Batch-Renderer) für Palette-LUT, Wasser-Shader und echten Bloom. Empfehlung siehe Phase 4.

**Risiken:** Art-Produktion ist der Engpass (Nutzer-Gemälde, eda-lore-Sheets). Das Palette-Snapping kann Gemälde
verflachen, deshalb vorher A/B-Bögen.
**Abnahme:**
- Art-Bible beschlossen.
- Alle Sprites im Sheet auf der Master-Palette (Test prüft das).
- Kein Vektor-Antialiasing im Spielbild.
- Pixel-Raster auf 100/125/150-%-Displays gleichmäßig (Screenshots).
- Boot-Zeit unter Baseline.

### Phase 4: Shader & VFX (Aufwand: M–L, je nach Renderer-Entscheidung)

**Technischer Rahmen:** Canvas 2D kann Multiply-Lightmap, additive Lichter, Emissive mit Verdeckung und billigen
Downscale-Bloom (alles schon da). Für echtes Palette-Shifting, Wasser-Shader und sauberen Bloom braucht es WebGL.
**Empfehlung:**
- Zuerst die Canvas-2D-Varianten umsetzen (vorberechnete Tageszeit-Atlanten, Wasser-Frames).
- Einen **WebGL2-Renderer erst dann**, wenn Phase 3 die Palette indiziert hat und Profiling (Phase 6) Bedarf zeigt.
  Die Renderer-Schnittstelle ist dafür vorbereitet (DESIGN §6).

| Effekt | Nutzen | Aufwand Canvas 2D / WebGL | Perf-Kosten | Prio |
|---|---|---|---|---|
| Tag/Nacht mit Palette-Shift (handgewählte Nacht-/Dämmerungspaletten statt Multiply-Grau) | hoch: größter Stimmungsgewinn, behebt „matschiges Nacht-Blaugrau“ | M (4–6 vorgebackene Atlanten + Crossfade) / M (LUT-Shader) | gering (Speicher ×4–6 bzw. 1 Textur-Lookup) | **1** |
| Dynamische Lichtquellen (Fenster, Laternen, Spires, magische Gebäude) | hoch: vorhanden, nur verfeinern (Flackern, Farbe pro Typ) | S / S | vorhanden, ~160 Partikellichter budgetiert | **1** |
| Wasser (animiert, Glitzern, Uferschaum) | hoch: Fluss und See sind überall sichtbar, Wasser ist noch prozedural | M (8–16-Frame-Streifen, eigener Layer statt Chunk-Rebuild 3×/s) / M (UV-Shader) | Canvas: **senkt** Kosten ggü. heute | **1** |
| Partikel: Rauch, Baustaub, magische Funken/Glyphen an Spires | mittel–hoch: Juice beim Bauen, Magie sichtbar | S (vorhanden, um Baustaub/Glyphen ergänzen, Batching nach Farbe) | gering, wenn nach `fillStyle` gruppiert | **2** |
| Dezenter Bloom nur auf Magie-Emissiven | mittel | S (vorhanden, Integer-Blit) / M (Threshold + Blur) | mittel bei WebGL, gering in Canvas | **2** |
| Wind in Bäumen | mittel: Lebendigkeit | S (vorhanden: Sway, ggf. 2–3 Frames pro Baum) / S (Vertex-Shear) | gering | **3** |
| Wetter (Regen, Schnee in der Hush, Nebel) | mittel: Stimmung, aber Weave ist geparkt | M (Partikel + Tint) | mittel (viele Partikel) | **3**, nur Optik ohne Sim-Effekt |
| Gloam-Rand (wabernder Nebel, Motes) | mittel: Lesbarkeit der Gefahr | S | gering | **2** |

**Abnahme:**
- Frame-Zeit bei Zoom 1 auf einem Referenzrechner ≤ Baseline. Nacht-Screenshots im Palettenstil.
- Effekte einzeln abschaltbar (Settings: „Effekte niedrig/hoch“).
- Kein Effekt verwischt Pixel (Pixel-Raster-Test aus Phase 3).

### Phase 5: UX & Feedback (Aufwand: M, 2–3 Tage)

1. **Overlays:**
   - jedes mit Legende und Wertebereich
   - Nachfrage-Overlay (neu: Zonen-Tiles nach Wachstumsgrund, aus Phase 2)
   - Verkehr mit Stau-Stufen
   - Dienst-Abdeckung beim Platzieren automatisch (CS1-Verhalten)
2. **Tooltips:** einheitliches Tooltip-Panel statt nativer `title`. Kosten, Unterhalt, Reichweite und Voraussetzungen vor dem Bau.
3. **Inspector:** `refreshInfo` (310 Zeilen, 55 Zweige) in Abschnitte pro Gebäudetyp aufteilen. Problemzeilen oben.
4. **Juice:** Baustaub und kleiner „Pop“ beim Fertigstellen, Straßen-Ziehen mit Längen-/Kostenanzeige, Zonen-Pinsel mit
   Vorschau, Meilenstein-Banner, Geldbewegungen als schwebende Zahlen (abschaltbar).
5. **Sound-Hooks:** vorhandene Blips auf alle Bauaktionen. Ambient nach Kameraposition ist vorhanden. Ein Event-Bus
   (`sim → effects`) statt verstreuter Aufrufe in `main.ts`.
6. **Onboarding:** gekürzter Ledger als geführte Lektion (Straße → Zone → Spire → Brunnen → erste Dienste → Budget).

**Abnahme:** Checkliste mit einer Testperson (oder dem Nutzer) ohne Erklärung bestanden. Keine Aktion ohne
visuelles und akustisches Feedback.

### Phase 6: Performance & Stabilität (Aufwand: M, 2–3 Tage)

1. **Profiling:**
   - `scripts/perf.mjs` und die Renderer-`stats` als festen Messlauf (Zoom 1/2/4, Stadt mit 2k/5k Einwohnern, Tag/Nacht)
   - Headless-Sim-Benchmark (Ticks/s)
   - Chrome-Performance-Trace für GC
2. **Rendering:**
   - Props statisch pro Chunk vorsortieren statt jede Frame neu pushen
   - keine Closures pro Item (flache Arrays/Struct-of-Arrays)
   - Wasser als eigener Layer
   - Partikel nach Farbe batchen
   - Agenten-LOD (bei Zoom 1 Agenten ausdünnen)
   - Culling ist vorhanden (Chunks)
   - Dirty-Frame-Skip bei Pause ohne Kamerabewegung
3. **Simulation:**
   - Abdeckung, Landwert und Miasma allokationsfrei (Puffer wiederverwenden)
   - `updateLandValue` ohne Objekt pro Tile
   - Gebäude-Indizes pro Typ statt wiederholter `forEachBuilding`-Scans
   - Mana-BFS mit räumlichem Index
   - Sim optional in einen Web Worker (deterministisch, nur bei Bedarf)
4. **Speicherstände:**
   - Versionierung mit Tests pro Migration
   - Save-Größe messen (Typed Arrays base64), optional komprimieren (`CompressionStream`)
   - Autosave in zwei rotierenden Slots (Absturz beim Schreiben)
   - Import validiert das Schema
5. **Stabilität:** globaler Fehler-Handler mit „Letzten Autosave laden“. Determinismus-Test (Replay MATCH) in CI.

**Abnahme:**
- Zoom 1 ≤ 16 ms/Frame auf dem Referenzrechner (heute ~28 ms laut NEXT_STEPS).
- Sim ≥ 10× Echtzeit headless bei 5k Einwohnern.
- Kein Speicherwachstum über 30 Minuten.
- Save/Load- und Replay-Tests in CI grün.

### Aufwand gesamt (grob)

| Phase | Aufwand |
|---|---|
| 0 Absicherung | S (½ Tag) |
| 1a–1d Rückbau | L (6–10 Tage) |
| 2 Kernmechanik | L (3–5 Tage) |
| 3 Grafik-Fundament | L (3–5 Tage + Art) |
| 4 VFX | M–L (2–5 Tage) |
| 5 UX | M (2–3 Tage) |
| 6 Performance | M (2–3 Tage) |

Die Tage sind Arbeits-Iterationen mit Claude, gerechnet in der bisherigen Taktung von ~1–3 Iterationen pro Tag.

---

## 4. Top-5-Empfehlungen

1. **Rückbau statt Revert.** Auf dem aktuellen Stand gezielt entfernen und alles im Tag `archive/full-scope-2026-10-21`
   plus `docs/PARKED.md` sichern. Ein Revert auf Iteration 4 würde ~60 Iterationen Art-, UX- und Infrastrukturarbeit wegwerfen.
2. **Zuerst Völker (1a), dann Kreaturen/Drachen (1b), dann Querschnitte (1c), dann Aufräumen (1d)**, mit
   „bit-identisch“ als Messlatte in 1a (das Gerüst war ursprünglich so gebaut). So bleibt jeder Schritt überprüfbar.
3. **„Warum wächst das nicht?“ ist der wichtigste Polish-Punkt** (Phase 2/5). Wachstumsgrund pro Tile, Nachfrage mit
   sichtbaren Faktoren, Abdeckung beim Platzieren. Das ist die Seele von CS1.
4. **Eine Palette, ein Stil.** Importierte Gemälde auf eine Master-Palette snappen, prozedurale Sprites zur Build-Zeit
   backen, DPR-sauberes Integer-Scaling. Danach lohnen sich Palette-Shift-Nacht und Wasser-Animation am meisten.
5. **Den Arbeitsprozess verschlanken.** Fünf-Völker-„wide bar“, ein Playtest-Skript pro Iteration und eine 514-KB-DESIGN.md
   haben die Komplexität mitgetrieben. Vorschlag: ein Volk, ein Bot-Korridor, eine thematische Testsuite, ein schlankes
   DESIGN, und neue Features nur über eine „Parkplatz → Freigabe“-Liste.

---

## 5. Risiken über alle Phasen

- **Stille Balance-Verschiebungen** durch entfernte Querschnitte (Weave, Walker-Bonus, Events). Gegenmittel: Bot-Korridor,
  Seed-42-Vergleich je PR, manuelle Session.
- **Saves:** Alte Spielstände werden mit großer Wahrscheinlichkeit unbrauchbar. Bewusste Entscheidung nötig (§8).
- **Parallel-Sessions:** Die Historie zeigt viele Merge-Renummerierungen. Während des Resets nur eine Session auf
  dem Reset-Branch.
- **Lore-Konsistenz mit eda-lore:** „Vellish“ ist nicht kanonisch. Eine Umbenennung des Basis-Volks wäre ein eigenes Thema
  (Proposal in eda-lore), nicht Teil des Resets.
- **Art-Engpass:** Phase 3/4 hängen an Nutzer-Gemälden. Prozedurale Platzhalter bleiben gültig, bis Art kommt.

---

## 6. Abhängigkeitsreihenfolge für das Herauslösen (Kurzreferenz)

1. Umbenennen/Abkoppeln gemeinsamer Namen: Veshari Hall → Brigade Hall, `WONDER_HALLS`, `MOORINGS`, `CRADLE_*`.
2. Völkerdaten und -zweige (`factions.ts` → nur Vellish, `factionOf` bleibt als Nahtstelle).
3. Kreaturen und Drachen (Auren aus `weave`, Ward aus `services`, Hounds aus `agents`, Golem-Arbeit aus `growth`).
4. Querschnitte: `events` → `weave` → `walkers` → `trade`-Extras → `vehicles` → `water`/`wild`/`marsh`.
5. Content-JSON, Quests, Edikte, Annals, Stats.
6. UI (Topbar, Modals, Inspector-Zweige), Renderer-Zweige, Audio-Cues, Dev-Ops, Command-Ops.
7. Save-Version 8 und Migration.
8. Tests, Skripte, Balance-Cache, Dev-Board-Kinds, Doku.

---

## 7. Baseline-Prüfungen bei der Analyse

- `npx tsc --noEmit -p .`: **Exit 0** (sauber).
- `npx vitest run`: **95 Dateien, 622 Tests, alle grün**, 265 s Laufzeit. Allein `iteration93.test.ts` braucht 111 s,
  weil es jede Aufgabe für jedes Volk prüft. Der Rückbau verkürzt die Suite deutlich.
- Nicht ausgeführt: `npm run build`, Playwright-Playtests und die Balance-Tabelle (für eine reine Analyse nicht nötig).

---

## 8. Offene Fragen und Entscheidungen (vor Phase 0/1)

1. **Basis-Volk bestätigen:** Vellish? Und bleibt der Name „Vellish/Vell“, obwohl er nicht im eda-lore-Kanon steht
   (dort: Huruhui, Drygefolk)? Umbenennen ist ein späteres Lore-Thema, nicht Teil des Resets.
2. **Grenzfälle der Klassifizierung:**
   - Ley-Aspekte und Torrent Mill: parken und in Phase 2 schlank zurückholen?
   - Brickworks (Nutzer-Gemälde): behalten oder parken?
   - Szenarien One-Node/Island: behalten?
   - Terraforming: behalten?
   - Story-Events: komplett parken, oder 3–5 Kern-Ereignisse (Surge-Warnung, Feuer, Gloam-Vorstoß) als Toasts ohne Pause?
   - Gloam-Hounds/Warding Wall: parken (Empfehlung) oder als zweite Gloam-Schicht behalten?
   - Walker: parken (Empfehlung) oder als reine Optik (ohne Bonus) behalten?
3. **Savegames:** alte Saves (a) migrieren (Volk → Vellish, unbekannte Gebäude verwerfen) oder (b) mit klarer Meldung
   ablehnen? Empfehlung: (b). Weniger Code, und es ist ein Prototyp.
4. **Branch-Strategie:** Rückbau auf einem langen `reset/main`-Branch mit einem großen Merge am Ende, oder phasenweise
   kleine PRs direkt nach `main` (GitHub Pages zeigt jeden Zwischenstand)? Empfehlung: phasenweise nach `main`, denn
   jeder Zwischenstand ist spielbar.
5. **Prozess (CLAUDE.md):** Darf ich für den Reset die Regeln anpassen?
   - „wide balance bar“ → ein Volk, Bot-Korridor
   - Playtest pro Iteration → ein Smoke-Playtest
   - DESIGN-Abschnitt pro Iteration → schlankes Reset-Log
   - Übrigens: Die CLAUDE.md-Regel „ein Plan pro Continue über das Plan-Panel“ gilt weiter.
6. **Faction-Gerüst:** nach 1a komplett inline auflösen (schlanker), oder als dünne Nahtstelle für spätere Völker behalten?
7. **Dev-Board:** Tripo/Aseprite/„Send to Claude“ parken oder behalten (vom Nutzer gewünscht am 2026-10-08)?
8. **`inspirations/` (148 MB):** im Repo lassen, oder nach `eda-lore/inspirations` verschieben (laut eda-lore-CLAUDE.md der
   vorgesehene Ort) und den Importer auf eine Sibling-Checkout lesen lassen?
9. **Offene GitHub-Issues 101–124 und NEXT_STEPS-Liste (M18/M19):** Alle als „geparkt“ markieren/schließen?
10. **eda-lore PR 5 (Fen-Nex-Proposal):** offen lassen, schließen oder als „geparkt“ markieren?

---

## 9. Entscheidungen des Nutzers (2026-10-21)

Diese Antworten gelten und gehen §8 und den „?“-Zeilen von §2.1 vor.

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Basis-Volk | **Vellish**, Name bleibt |
| 2.1 | Ley-Aspekte, Torrent Mill | parken |
| 2.2 | Brickworks | parken |
| 2.3 | Szenarien One-Node/Island, Terraforming | parken (nur das Valley bleibt) |
| 2.4 | Story-Events | komplett parken (kein Ersatz durch Toasts in Phase 1) |
| 2.5 | Gloam-Hounds, Warding Wall | parken |
| 2.6 | Walker | parken (auch nicht als reine Optik) |
| 3 | Alte Spielstände | **ablehnen** mit klarer Meldung (`SAVE_VERSION 8`, keine Migration aus 7) |
| 4 | Branch-Strategie | **phasenweise kleine PRs nach `main`** |
| 5 | Prozessregeln (CLAUDE.md) | anpassen (Phase 0) |
| 6 | Faction-Gerüst | als **dünne Nahtstelle behalten** (Phase 1d löst es nicht auf) |
| 7 | Dev-Board inkl. Tripo/Aseprite/„Send to Claude“ | behalten |
| 8 | `inspirations/` | nach `eda-lore/inspirations` verschieben. `eda-lore` hat schon 9 der 15 Ordner (102 MB). Es fehlen `trade_houses`, `trees`, `wells`, `wooden_houses`, `wyrm` und die Kopien der eda-lore-Sheets. Umsetzung in Phase 1d |
| 9 | Issues 101–124, M18/M19-Liste, eda-lore PR 5 | als **geparkt** markieren (Phase 0) |

Folgen für den Plan:
- **Phase 1c** parkt zusätzlich: Ley-Aspekte, Torrent Mill, Brickworks (und damit den Baubonus in `construction.ts`),
  die Szenarien One-Node/Island, Terraforming (Land-Tab) und alle Story-Events.
- **Phase 1d:** Das Faction-Gerüst bleibt (`factionOf` → Vellish), `docs/PARKED.md` notiert es als Nahtstelle.
  `inspirations/` wandert nach eda-lore.
- **Save:** Version 8 lehnt jede ältere Version mit einer Meldung im Titelbildschirm ab. Das gilt auch für Import und Replays.
