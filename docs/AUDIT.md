# Wardlight audit: completeness, depth and broken mechanics (iteration 44)

After a run of playtest bugs (districts that did nothing, a quest that could never complete,
walkers animating on the spot), every building and every mechanic in the game was read
against what its description, its quest, its help line and DESIGN.md promise. Five reviewers
read the code in parallel, each over a quarter of it; a fifth hunted only for broken
mechanics and confirmed the worst with scripts. This document is the result: the bugs, a
depth rating for everything, what is fixed in iteration 44, and the design of **M14, the
depth pass**, written out in full so it can be built one part at a time.

Depth scale: **1** a stat bump with nothing to decide; **2** a choice you make once; **3**
a trade-off with feedback; **4** a loop that touches other systems; **5** a system with
trade-offs, feedback, failure and interconnection.

## 1. Bugs and broken mechanics

Grouped by what the player meets. "44" means fixed in iteration 44; "M14" means it waits
for the depth pass because the fix is a design.

### 1.1 Quests that cannot complete, or complete wrongly

| # | What is broken | Where | Fix |
|---|---|---|---|
| B1 | **Keep the Hush vigil** and **Hold a Thaw feast** never complete: calendar tales are recorded as `vigil@year:choice`, and `chose()` looks for `vigil:choice`. | events.ts `chose`, quests `s_vigil`, `s_feast` | 44 |
| B2 | **Scenario quests pay in every game**: the daily, one-node, island and inherited quests are skipped only when both `when` and `done` are false, so an ordinary valley game collects up to 18,000 crowns for reaching Burgh. | sim/quests.ts | 44 |
| B3 | **Dissolve a mana-storm with wards** counts buildings *warped*, not storms dissolved; a storm dissolved by wards does not complete it. | quests `n_storm`, lore.ts | 44 |
| B4 | **No market short for five days** completes the first good tick. | quests `o_full` | 44 |
| B5 | **See glimmoths at the node** is true the first night of every game (every node is a moth source). | quests `b_moths` | 44 |
| B6 | **Name a district** completes by founding a daughter (it names a district). | charter.ts | 44 |
| B7 | **Set a taming edict** ignores district-scoped edicts, which is where the hint sends you. | quests `e_edict` | 44 |
| B8 | **A Vein egg** completes when the tale fires, not when the egg is kept. | quests `v_egg` | 44 |
| B9 | **Sell 200 goods to a caravan**: never counted; the caravan was a random tale. | events.ts | ✅ 43 |
| B10 | **Raise the Lantern of Vell** hint vs a population-only check; "delights the whole city" is not implemented. | quests `c_beacon`, growth.ts | 44 |
| B11 | **Burn 300 Gloam tiles** and the island goal are completed by *buying a sector* (purchased Gloam counts as burned). | sectors.ts | 44 |
| B12 | The failed daily challenge sits at the top of the Ledger forever. | quests `z_daily` | 44 |

### 1.2 Timing and counting

| # | What is broken | Where | Fix |
|---|---|---|---|
| B13 | **The healer's, bargeman's and tamer's visits never count**: they stamp `tended = day`, the day rolls over, and the daily reader asks for `tended >= day`. The +4 happiness and the tamer's ×1.1 growth exist only in the info panel. | walkers.ts, growth.ts, wyrmcraft.ts | 44 |
| B14 | **The Nexus cannot avert a surge**: the surge test reads raw supply, never the store, while the warning, the quest and the advisor all say "build a Nexus". | hazards.ts | 44 |
| B15 | The Nexus store drains 1.8× too fast (per-update deficit divided by 10, run 18 times a day). | networks.ts | 44 |
| B16 | **Once-only tales come back**: the fired-events list is cut to 40 entries, so `once` flags and chain prerequisites are forgotten (true leystone's +10 mana stacks; the Fen-Nex, the cloud wizard, egg tales repeat; the Lukuku door loses its earlier choice). | events.ts, guilds.ts | 44 |
| B17 | The Twin Road toll is banked after the ledger copies the day's trade, so the Budget never shows it. | sim.ts order | 44 |
| B18 | Couriers **destroy goods**: the delivery clamps at 20×level and counts the whole load as sold; also ignores the market quarter's and Fen-Nex caps. | creatures.ts | 44 |
| B19 | "Send leystone (60)" to the sulking wyrm takes the stock and then fails if short. | events.ts | 44 |
| B20 | Craft-tax caps from a guild bargain and the pact add up instead of taking the lower. | economy.ts | 44 |
| B21 | The Sextons' "unquieted > 20" driver can never fire: every 20 unquieted become a restless earlier the same day. | guilds.ts | 44 |
| B22 | The Thaw-day "day on the wards" clears Gloam without marking chunks, counting the burn or recomputing the Gloam distance. | events.ts | 44 |
| B23 | A relic hoard gives "+8,000 crowns and relics" but no sellable relics; "A relic of the Concord" (+3,000) is not once-only. | events.ts | 44 |
| B24 | The aura cache is keyed by tick and dragon count only: a new game in the same 50-tick bucket inherits the last game's auras. | weave.ts | 44 |
| B25 | Old saves lack `firesTotal`, `surgesTotal`, `restlessTotal`, `peakPopulation` defaults (NaN on the game-over screen). | save.ts | 44 |

### 1.3 Edicts and scope

| # | What is broken | Where | Fix |
|---|---|---|---|
| B26 | **Five edicts charge per district and do nothing there**: Beastmasters, Bounty, Wyrm-Peace, Spire Wardens and Imports are read city-wide only, while the Edicts panel sells them per district at a quarter of the price. | edicts.ts and readers | 44 (city-only flag) |
| B27 | Hunters' Bounty against war-tigers ignores a district-scoped bounty. | lore.ts | 44 |
| B28 | A district-scoped Spire Wardens fields no wardens and leaves the surge line at 1.25×. | walkers.ts, hazards.ts | 44 (folds into B26) |

### 1.4 Descriptions that promise what the code does not do

| # | Building | Promise vs reality | Fix |
|---|---|---|---|
| B29 | Glowvine Lane | "lights everything along it": lights only its own tiles; no building is ever lit by it. Also kept alive by any self-lit building, not only a Hanging Gardens. | 44 |
| B30 | Market Square | "big boost to trade": no trade hook at all. | 44 (markets within 8 pay ×1.15) |
| B31 | Lantern of Vell | "delights the whole city", "marks you a true wardlight": neither exists. | 44 (+5 happiness while lit; the Beacon milestone needs it) |
| B32 | Moth-Loft | "where moths swarm": moths are never checked. | 44 (bonus scales with moths within 8) |
| B33 | Stone Ward | "holds" the Gloam; it burns it like a lantern, unlit, for no mana. | M14 (hold-only, the sexton cuts) |
| B34 | Wyrmfire Forge | says +25 %; gives +35 % (it counts as a Glimhouse too). | 44 (text) |
| B35 | Storm-Caller's Peak | "rain over the district", no fee named; the rain is city-wide and costs 300. | 44 (text) |
| B36 | Wyrm-Court | "if a wyrm has woken": buildable with no wyrm; does nothing after the binding. | 44 (gate) / 53 (lit, it halves the appetite; dark, the wyrm sulks) |
| B37 | Hall of Marvels | works unlit. | 44 |
| B38 | Wyrms panel | "caravans buy them": wyrmfire and eggshell cannot be sold. | 44 (500 / 200 crowns) |
| B39 | The Sleeping Wyrm | "half again as much each time": tribute grows linearly. | 44 (text) |
| B40 | Market | "wants a good road": the road tier never touches markets. | M14 |
| B41 | t_grown, the Mews | "four seasons": three. The airship "ten days": nine. | 44 (text / day) |
| B42 | Wyrmcraft lines | "Tide swims the river", the Ember aura: text only. | M14 |

### 1.5 Panels and views

| # | What is broken | Fix |
|---|---|---|
| B43 | "No walker: needs a road" shows on every spire without the Wardens edict, every quay when the river freezes, every unlit Academy. | 44 |
| B44 | The advisor's "Watch coverage" Show-me opens the Wards view (the `watch` focus is remapped to `ward`). | 44 |
| B45 | The node panel's Flow row ignores the people's node multiplier and the Vein bonus. | 44 |
| B46 | The Waters row shows the base radius, not the near-water or Tide bonus; the Watch House row ignores the Drake Mews doubling (and the watchman's patrol is not doubled). | 44 |
| B47 | A trueblood wyvern shows "Growth 100 %" for sixty days. | 44 |
| B48 | A quay beside a landing shows a false "single quay" problem; landings get no rows. | 44 |
| B49 | The abandonment message fires 30 % of the time and names the wrong cause. | 44 |
| B50 | The forecast says a surge comes "unless demand falls below the flow": the line is 1.25×. | 44 |

### 1.6 Sim logic

| # | What is broken | Fix |
|---|---|---|
| B51 | A darkened Portal Arch still teleports agents already routed through it. | 44 |
| B52 | Bulldozing a gated road removes the road and keeps the gate (the road branch catches the tile first). | 44 |
| B53 | The bot deepens "the founding node" by list order and can deepen the wyrm's, waking it. | 44 |
| B54 | Bred eggs are placed without the line check, so a crossed egg can land in a Hatchery or Tide Pool that rejects it. | 44 |
| B55 | The Crown's gift is always an Ember egg; every Veshari Tide Pool rejects it and the message says "the cradle is full". | 44 (the gift matches the people) |
| B56 | "Buy the egg" from the poachers charges 2,500 with no cradle room or no money. | 44 |
| B57 | The Fen-Nex fallback says "+500 crowns" and adds none. | 44 |
| B58 | The storm caller's "Give them the hills" says the Peak becomes buildable; it is buildable either way. | 44 (the Peak needs the choice; the tale is drawn first while eligible) |
| B59 | The captain's airship tale lives with the wyrm's tales and never fires on a map without a wyrm. | 44 |
| B60 | Relic cataloguing stops while any scholar exists; a scholar whose delve is more than 60 tiles away never carries a piece, so nothing is ever catalogued. | 44 (by-the-book resumes after 10 idle days) |
| B61 | "The relic was stolen from the Academy" fires with no Academy. | 44 |
| B62 | The depot export cap is per works, where DESIGN says 8 a day per depot; a second depot adds nothing. | 44 (city-wide cap, fullest works first) |
| B63 | The Quarry lists 8 jobs and ignores its workers; its goods and the Hanging Gardens' are never exported. | 44 |
| B64 | The Carters' Yard is "a second depot" for trade, but not for the carters' driver or the routes list; the carters count only `quay`, never a landing. | 44 |
| B65 | Eggshell decays "in use" and has no use; wyrmfire decays faster than one drake makes it. | 44 (no eggshell decay; wyrmfire 0.02/day) |
| B66 | The dead wyrm's bones quiet 80 a day forever: starving it beats binding it. | 44 (80 for 120 days, then 20) |
| B67 | The merchant needs 30 quiet days where the storyteller resets the clock every 10 to 18. | 44 |
| B68 | Tales that cost crowns (Plague 2,000; the Lukuku seal 1,500; Bargemen 900) have no purse check. | 44 (a generic check on "(N crowns)") |
| B69 | `inheritedClean` is dead code; `artifactsSold += 0`; the "forty days" comment on a 28-day loop; the founding-node failure radius is 3 where DESIGN said 2. | 44 (DESIGN now says 3) |
| B70 | Docs drift: Boneyard "cap 200/800" (code 12/40 a day); deaths "(1.5 − health)" (code 1.7); surge "3 days" (code 5). | 44 (docs) |

Stats written but never shown anywhere: hound raids, skyray schools, wyrm flyovers, glim-dust
total, bargeman rounds, daughters, relics auctioned. M14 part 5 gives them an Annals page.

## 2. Depth, building by building

| Building | Depth | The gap | Where it gets depth |
|---|---|---|---|
| Ley Spire | 3 | carries any load | M14.1 spire load |
| Wick-Tower | 2 | leaf-or-relay only | M13.2 |
| Ley Nexus | 2 | store hidden; cannot stop a surge | 44 (B14) + M14.1 |
| Crystal Mine | 4 | endless seam | M14.1 seams |
| Thrum Font | 2 | "dangerous" is 0.15 %/day | M14.1 bore flare |
| Torrent Mill | 3 | output never shown; stackable | M14.1 |
| Portal Arch | 3 | free teleports | M14.1 crossings |
| Well / Seep / Tide-Well / Cistern | 1–2 | unlimited; four wells, one role | M14.1 well capacity |
| Founding Stake | 1 | fixed | M14.2 the Hall |
| Dirt Track / Cobble / Lantern-way / Glowvine | 1–2 | glowvine lights nothing; unlit lantern-way is free cobble+ | 44 (B29) + M14.1 |
| Hearth / Market / Craft / Arcane | 4 | reasons hidden; water never matters to works | M14.2 breakdowns |
| Watch Post / House | 2–3 | a small house; Mews doubling hidden | 44 (B46) + M14.2 theft |
| Healer / Hospice | 2 | tending never applied; hospice = big healer | 44 (B13) + M14.2 draughts |
| Veshari (fire hall) | 3 | no quest; dry halls work | M14.2 |
| Shrine / Candle-Shrine / Temple | 2–3 | temple = far shrine | M14.2 pilgrim network |
| Academy / Grand Academy | 2–3 | scholar idle without a delve | 44 (B60) + M14.2 |
| Boneyard / Ossuary / Sextons' Chapel / Salt Font | 1–4 | capacity invisible; no placement cost | M14.2 |
| Ward Lantern / Stone Ward / Scale Ward | 1–4 | strength meaningless; Scale and Stone dominate | M14.2 burn budget |
| Garden / Square | 1–2 | square's trade missing | 44 (B30) + M14.2 |
| Guildhall and the four guild halls | 2–4 | halls are rewards with nothing to decide | M14.4 |
| Hunters' Lodge / Moth-Loft | 3 | kills unseen; moths unchecked | 44 (B32) + M14.2 |
| Quarry | 2 | workers ignored | 44 (B63) |
| Trade Depot / Carters' Yard | 3 | second depot adds nothing | 44 (B62, B64) |
| Lantern of Vell and the wonder halls | 1–2 | "delights" missing; mana spread ±90 | 44 (B31) + 53 (every lit hall +5 and a tenth on the grant; Lantern 10, Weir 45/90 by sluice) |
| Cradle / Hatchery / Tide Pool | 3 | fixed 2 slots; faction swaps | 53 (the Great Cradle, feeding reach 12, hunger regresses, the departed return) |
| Tamer's Lodge | 2 | needed 20 days | 53 (four seats; no seat halves growth and triples a hard scorch) |
| Wyrm-Ring | 2 | no panel rows; old champions always win | 53 (odds shown; a challenger of the champion's weight) |
| Scale Ward / Wyrmfire Forge / Eggshell Font / Rayscale Mirror / Hall of Marvels | 1–2 | two unbuildable; two dominate | 44 (B37, B65) + 53 (sinks: Scale-Mail, the Forge's burn, the Font at 3, the Mirror's dust, exhibits) |
| Lantern of the Cores / House-Hall / Chart-Room / Salt Font (relic builds) | 1–2 | passive | 53 (the Cores absorb a surge and crack); the rest M14.4 |
| Wyrm-Court | 2 | nothing after the binding | 53 |
| Glimhouse / Observatory / Hanging Gardens / World Tree | 2–3 | no failure modes | M14.4 weather |
| Ruin Delve | 4 | fine | — |
| Golem Foundry / Forge-Temple | 3 | no choice per golem | 53 (labour, guard or a works bench) |
| Ley Beacon / Drake Mews / Sky-Dock / Quay / Landing | 3 | fine; small rows | 44 (B48) |
| Storm-Caller's Peak | 2 | perma-rain for 100 a day | M14.4 |
| Font of Quieting | 2 | flat multiplier | M14.2 |
| Creatures (moths, hares, wisps) | 1–2 | decoration | M14.4 |
| Hounds, golems, skyrays, tigers | 3–4 | fine | — |

Systems: the storyteller 3 (chains two deep, no memory), festivals 3, guilds 4, edicts 3 (free
to toggle), charters 2 (every price avoidable by single-zone districts), seasons 2 (no
weather of their own), hazards 3 (the Gloam can never swallow a building in normal play), the
Crown 2 (money only), milestones 3 (Vellish gate is population only), the budget 2 (fixed
−8,000 line, no interest), scenarios 2 (the challenge never fails), the bot 2 (never taxes,
never edicts, always choice 0, never a depot), the save 3.

## 3. Iteration 44: the sweep

Everything marked 44 above: the bugs, the text, the small promised effects (the square's
trade, the Lantern's delight, the loft's moths, the caravan buying wyrmfire and eggshell),
the panel rows, and the guards (purse checks, the Peak's choice, the Wyrm-Court's wyrm).
Every fix carries a test. Balance is re-based after it: the healer's +4, the depot cap, the
quarry's export, the square's tithe and the Lantern's happiness all move the numbers, so the
§4.73 table is re-run and recorded as the iteration 44 baseline for the depth pass.

## 4. M14: the depth pass

Five parts, each an iteration, each with the rule that a mechanic exists only if the player
can see it, decide about it and lose by it. Numbers are the first guess; the balance bot and
the three-seed rule (§14.1) settle them.

### Part 1: supply has limits (ley, water, roads)

- **Linked nodes only.** A node's 90 mana counts only while a lit spire, stake or wonder
  hall stands within 6 of it (`networks.ts` supply loop). Nodes under the Gloam, beyond the
  charter or the wyrm's give nothing until linked. The node panel says "unlinked". The bot
  already links its founding node; the balance drift is on multi-node seeds only.
- **Spire load.** Each spire relays at most 80 mana of downstream demand (`load` per member
  in the chain search); over that, its farthest consumers go dark first, before the city
  brownout. Panel row "Load 92/80". A Nexus carries 200. This is the reason to build a
  second spire line rather than one long chain.
- **The store shown and spent.** The Nexus store is a top-bar figure ("store 96/120"); the
  surge counter runs only while the store is empty (B14 is the first half); the Hush vigil
  draws on it, as now. Brownout priority: every building has Essential / Normal / Dim (a
  panel toggle, default by category: wards and water essential, zones normal, leisure dim);
  a brownout darkens Dim first, then Normal, farthest first within a tier.
- **Wells with capacity.** A well waters 30 zone levels (a cistern 90, a Tide-Well 45, a
  Seep 20); the nearest buildings are served first; "Drawn 34/30" in the panel, a "dry:
  the well is overdrawn" problem on the ones left out. Wells more than 8 tiles from any
  water reach 4 tiles (the cistern's reason). The Seep reaches ×1.5 in the Thaw, ×0.5 in
  the Ember. During the Hush flood, ordinary wells within 2 of the river go foul for the
  flood's days; Tide-Wells do not.
- **Roads that need their light.** An unlit lantern-way has cobble's speed, capacity and
  land value; lantern-ways are the first thing a brownout dims. Glowvine tiles carry light
  within 12 of a Hanging Gardens (B29 makes this true first). Mud: dirt tracks run at ×0.6
  in the Thaw and the Hush.
- **Seams and flares.** A Crystal Mine's seam holds 2,400 leystone ("Seam 61 %"); a spent
  shaft yields 2 a day and wakes golems three times as often. A Thrum Font over 90 % of
  its flow has a 2 %-a-day bore flare: fire on the Font and its neighbours, miasma 6 within
  4; the forecast names it. Torrent Mills show "39/day, Thaw ×1.3"; a second mill within 8
  on the same water runs at ×0.6. A Portal Arch carries 60 crossings a day, then the jump
  costs like a congested road; each crossing draws 0.1 mana.
- **The Gloam that takes.** When pressure is 0.65 or more, creep may enter the tile beside
  an unlit, unwarded building; two days of "the grey is at the door" (icon, message), then
  the building is lost and the tile greys. This makes brownout edges a real loss and gives
  the swallow code a path in normal play.

### Part 2: services with staff and stakes

- **Staffed services.** Every service building has a crew (Watch Post 4, House 10, Healer
  4, Hospice 16, Academy 12, Boneyard 3, shrines 2): its strength scales with
  employed/jobs, so services compete with works for folk and a labour shortage shows up
  as thin coverage. Panel row "Crew 7/10".
- **Why a home is at 14.** `computeBuildingHappiness` returns its terms; the panel lists
  the five largest plus and minus ("Gloam near −12, no faith −8, lit +6 …"). Land value the
  same (top three bonuses and penalties). Zone bars get a tooltip naming the main driver.
  Hearths list the missing level-up condition ("Level 3 needs: land value 62 (55),
  schooling").
- **Unrest with teeth.** Unrest above 0.5 for 5 days fires a Riot tale: the market with the
  least watch coverage burns unless its coverage is 0.5 or more, or the Crown is paid 600.
  Markets with watch under 0.3 lose 10 % of their shelves a day to theft while unrest is
  over 0.3 (the Watch Post's reason). Over-schooling: educated above 0.5 with Arcane jobs
  below a tenth of the folk adds unrest 0.05 ("idle scholars").
- **Deathcare in the open.** A Ledger line "Dead today 7 · quieted 6 / capacity 12 ·
  waiting 3"; land value −6 within 4 tiles of any deathcare; the Sextons' Chapel fields 2
  sextons; the Salt Font uses one loose relic every 3 days to quiet ×2; the Sextons' guild
  is driven by restless walking and by uncovered deaths (B21's second half).
- **Wards with a budget.** A ward burns `12 × strength` tiles a day from the inside out
  (the wyrm's budget rule), so strength matters; the Stone Ward holds creep and burns
  nothing (its sexton cuts 2); the Scale Ward's plating wears 0.1 a season and is re-plated
  from its panel for 2 scale. The Ward Lantern is again the honest choice.
- **Halls with a difference.** The Hospice draws 2 goods a day (draughts) from markets
  within 16 and runs at 0.6 without them; the Temple consecrates shrines its pilgrims reach
  (+50 % radius), so a pilgrim network is a thing to build; the Veshari fire hall works at
  full strength only watered; the Grand Academy lifts artifact prices 5 % per 10 % educated
  above 0.4; a lit Academy spends one kept relic every 5 days for a lasting +1 % educated
  floor (the "ten for the Academy" the depot keeps).
- **Smaller rows.** Watch House radius with the Mews; Hunters' Lodge "pelts this season"
  with each kill a good for the depot; the Moth-Loft's dust per day; the Guildhall's "next
  petition in N days from the Carters"; the Spire-Wrights' Lodge gets a one-click Vent
  (dump the store, reset the overdraw count, 30-day cooldown); the Carters' Yard cuts
  congestion 20 % within 10.

### Part 3: wyrmcraft matured ✅ (iteration 53, DESIGN §4.84)

- **Lines that do what they say.** Ember: +10 % Craft within 8 of its cradle (the aura
  that is text now). Tide: a crewless barge trip a day from the nearest mooring. The
  Crown's gift matches the people (B55 first).
- **Cradles with a ceiling.** The Great Cradle upgrade at Burgh: 4 slots, +4 mana. A
  Tamer's Lodge serves 4 dragons; a drake with no lodge trains at ×3 fire chance. Feeding
  reaches 12 tiles ("markets near the cradle" made true); a departed dragon returns after
  a season as a wild flyer demanding tribute (reusing the flyover). Ten unfed days regress
  a stage (DESIGN 8.6).
- **Roles with a price.** A warden draws its food from its district's markets; a delver
  halves the golem-wake chance at its mine; a courier shows its last trip; champions see
  their odds before the bout and the challenger's base is the champion's stage × 20 + 20,
  so a great wyrm can lose.
- **Materials with sinks.** Scale: a Scale-Mail edict (−5 % unrest, 0.05 scale a day).
  Wyrmfire: the Forge burns 0.1 a day and goes cold when empty; a "burn wyrmfire" toggle
  for the Craft bonus. Eggshell: 1 eggshell gives one egg +25 % hatch speed; the Font costs
  3. Glim-dust: lights one road tile a season per unit; the caravan sells by slider.
  Rayscale: rays circling a Mirror shed glim-dust instead, so Mirror and Beacon differ.
- **Marvels and wonders with a role.** The Hall of Marvels exhibits each material for +2
  happiness (lit only); the Lantern of the Cores absorbs the first 30 overdraw of a surge
  then breaks for 10 days; each lit wonder hall gives +5 happiness and +10 % to the next
  grant, and the mana spread narrows (Lantern −10, Weir +45 with a sluice toggle: open is
  +90 and floods the downstream bank in the Thaw); the Underking's Seat lights Hatcheries
  within 30 without mana; the Lantern of Wicks halves the mana of lit spires within 30.
- **The Wyrm-Court after the binding.** While lit it halves the bound wyrm's appetite to
  20 goods; lose it and the wyrm sulks at once. The Court is buildable only once a wyrm
  has woken (B36 first). Golems are assigned: labour (12 hands) or guard (ward 6 where
  they stand).

### Part 4: the world pushes back

- **Weather.** `dailyWeave` rolls it: Bloom 15 %/day rain for 2 days (fire ×0.4, Craft
  +15 %, miasma ×0.3; the storm caller's rain becomes a sure version of this); Ember 10 %
  chance of a 5-day drought (fire ×2, wells −2 radius, Hanging Gardens −50 % unless
  watered, the World Tree pauses); Hush 20 % chance of a 3-day blizzard (hearth mana +10 %,
  hounds held). All of it in the forecast, with the freeze and the flood.
- **The Crown that wants.** Each Thaw the Crown levies 5 % of the treasury above 10,000.
  Crown favour (0–100) rises with relics sold and the collector paid, falls with pleading;
  each point is −0.3 % on the levy and on sector prices; below 20 an audit withholds the
  next milestone grant. Debt costs 1 % a day; a Crown loan of 10,000 × milestone at 0.5 %
  a day; the bankruptcy line is −8,000 × (1 + milestone/2). Trade joins the ledger
  history (B17 first).
- **Gates and memory.** The Vellish milestone gate is mean happiness ≥ 45 + 3 × milestone;
  the Tallowkin lit share must hold 3 days; the top bar shows the next gate. Tales keep an
  uncapped memory (B16) and three chains grow: welcomed pilgrims ask for a shrine 30 days
  on; each pleading makes the collector's next audit harsher (−15 %, −25 %, a 20 % levy);
  the Fen-Nex quarter gets a seasonal fox audit (+2,000 or −1,000). Only hazards set the
  "ill tiding" day, not every fire, so big cities see tales again.
- **Edicts as commitments, charters with a price.** An edict runs at least 10 days and
  costs 200 to repeal; city-only edicts are hidden from the district scope (B26). A
  charter locks for 30 days, costs 1 crown per building per day, and its price spills: a
  Craft quarter's smoke reaches 4 tiles past its edge, a Temple quarter takes 10 % of the
  city's market tithe, so a single-zone district no longer dodges the cost.
- **Festivals seen.** The forecast lists the Lantern Fair; a festival's Chronicle line names
  the fed districts and the vigil's hold-until day; Remembrance's dead are traced to it.
  The daily challenge fails at day 61 and is scored (day + treasury/1,000) with the people
  drawn from the date.

### Part 5: the bot plays it all, and the Annals

- The bot gets a tax controller (unrest under 0.25), turns curfew and draughts on when the
  advisor would, walls at 30 hounds, stands a depot (the iteration 43 finding), breeds,
  sets a warden, answers tales by a greedy policy instead of choice 0. Balance then
  measures these systems.
- An **Annals** page lists every counter by chapter (the write-only stats become visible);
  save migrations branch on the version; dev commands gain set-day, force flood or freeze,
  complete-quest, set-standing, reset-history.

### Rejected

- Service buildings that cost rare materials to run (too far from the fantasy of infrastructure).
- Making the Stone Ward and the Scale Ward need mana (their point is that they do not; the
  burn budget is the fairer limit).
- A per-district rain (modifiers are city-wide by design; the text is fixed instead).
- A weekly budget (decided in iteration 1; daily stays).
