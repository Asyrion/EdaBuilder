# The core loop, by hand (10 minutes)

Walk this when an iteration of the scope reset changes the UI or the loop (`docs/RESET_PLAN.md`). Use the deployed build
or `npm run dev`, in a fresh browser profile or after Menu → Back to title. Tick each line. Write a failure into
`docs/RESET_LOG.md` with what you saw.

**`node scripts/handwalk.mjs`** (phase 2-10) walks every line with a real mouse and keys against
`npx vite preview --port 4173` and prints `HANDWALK OK` or the lines that failed. It checks what a machine can check;
its shots (`shots/handwalk_*.png`) must still be looked at for what only an eye can judge: whether each view's colours
read (line 11), the night's lights (line 13), and the reach rings while placing (line 8). Line 10 is fast-forwarded once
the real-time pace at 3× is noted (a day is 30 s), with the bot zoning where the walk's small town runs short.

1. [ ] The title screen shows. **New charter** in the open valley (Vellish) starts the game, and the Founding Stake
       stands by a ley node.
2. [ ] **Roads:** `R` and drag lay a Dirt Track. The cost shows while dragging, and Ctrl+Z takes it back.
3. [ ] **Zones:** `Z` and drag paint Hearth beside the road, then Market and Craft. Zones away from a road do not grow.
       With Select, hovering a lot says why it does or does not grow; the Growth view (`N`) colours every lot by it.
4. [ ] **Mana:** a Ley Spire within 6 tiles of the node lights the tiles around it (Mana view, key `1`).
5. [ ] **Water:** a Well waters its radius (Water view).
6. [ ] **Growth:** at speed 3, houses rise on lit, watered Hearth tiles within a day or two, and builders walk to the sites.
7. [ ] **Demand:** the four bars bottom left move, and hovering a bar lists its factors, where it is heading and how
       many lots of the zone can grow (and why the rest cannot).
8. [ ] **Services:** a Watch Post and a Shrine of Aume can be placed, and their reach shows while placing.
9. [ ] **Budget:** the Budget panel opens. Moving the Hearth tax changes the daily net and, after a day, the Hearth bar.
10. [ ] **Milestone:** Hamlet (40 folk) arrives with its message and grant; the Healer's Shrine it unlocks can be placed.
11. [ ] **Info views:** every view in the Views list (`V`) draws and has a readable colour ramp. Its key works right
       after a mouse click on any button (the speed bar, a toolbar tab).
12. [ ] **Save/load:** F5 saves and F9 loads the same city (folk, treasury, day). Reloading the page offers Continue.
13. [ ] **Night:** at dusk, windows, spires and lanterns light up, and nothing flickers black at dawn or dusk.
14. [ ] **Console:** the browser console shows no errors.
