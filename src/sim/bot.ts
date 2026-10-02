import { GRIMMEN_STONE, TALLOW_LIGHT, VELLISH_HAPPINESS, canBuild, factionKey, factionOf, litShare, milestonesOf, stoneQuarried, MOORINGS, costOf } from '../data/factions';
/**
 * A scripted "reasonable player" used for headless balance runs and the demo/perf harness.
 * It expands a street grid from the Founding Stake, zones what it can light, keeps buildings lit and
 * watered, saves for one large purchase at a time, sets its taxes and edicts, answers tales greedily and
 * buys services as they unlock. Deliberately simple; it is a test tool, not AI (DESIGN 4.86).
 */
import { buySector, canBuySector, sectorCost, sectorOf } from './sectors';
import { TERRAFORM, buildRoad, buildWall, bulldoze, paintDistrict, paintZone, placeBuilding, placeGate, previewWall, roadPath, setTax, terraform, wallTileCost } from './actions';
import { setQuarter } from './districts';
import { EDICT_BY_KEY, edictLocked, edictsFor, setEdict } from './edicts';
import { HUNT_REACH, MEAT_REACH, WILD, WILD_SPECIES, herdsInGrounds, huntFloor, quarryOf, setQuarry } from './wild';
import { BUILDING_BY_KEY, GATE_COST, GATE_UNLOCK, MILESTONES, WALL_UNLOCK, isBuildingUnlocked } from './catalog';
import { MAP_H, MAP_W, RoadType, Terrain, Zone, idx, inBounds, isWater, type Building, type GameState, type WildSpecies } from './types';
import { NODE_DEEPEN_COST, canDeepenNode, canPlaceBuilding, deepenNode, forEachBuilding, touchesTerrain } from './world';
import { resolveEvent } from './events';
import { districtMarkets, lineNest, setRole } from './wyrmcraft';
import { LOAN_INTEREST, loanLimit, repayLoan, takeLoan } from './economy';
import { chooseTale } from './botPolicy';

/** The bot zones only beside a road's side: a corner lot is a door for the player's city, but in the bot's grid it sits where
 *  the next road would go, so the planner keeps its lots on the sides (iteration 49). */
function roadOnSide(s: GameState, x: number, y: number): boolean {
  return [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)].some((j) => j >= 0 && j < s.road.length && s.road[j]);
}

export interface BotOptions {
  aggressive?: boolean; // zone more than demand asks
  choiceZero?: boolean; // answer every tale with choice 0, as the bot did before iteration 55 (for comparisons)
}

/** The one large purchase the bot is saving for: its price is held back from growth until it is bought. */
export interface BotGoal { kind: 'link' | 'font' | 'deepen' | 'mill' | 'hall' | 'cradle'; key: string; cost: number; mana: boolean }

/** Zone buildings standing, and how many of them are dark. */
function zoneLight(s: GameState): { zone: number; dark: number } {
  let zone = 0;
  let dark = 0;
  forEachBuilding(s, (b) => {
    if (b.state !== 'ok' || BUILDING_BY_KEY[b.kind].category !== 'zone') return;
    zone++;
    if (!b.lit) dark++;
  });
  return { zone, dark };
}

export class Bot {
  radius = 8; // half-size of the developed square around the stake
  private districted = false;
  private houndsSeen = 0; // the hound count when the bot last looked, and the day a pack last came (iteration 57)
  private houndDay = -99;
  quarryChanges = 0;
  private lastExpand = -99;
  /** What the bot is saving for today, and the crowns it holds back for it (DESIGN 4.86). */
  goal: BotGoal | null = null;
  reserve = 0;
  /** A goal the bot could pay for but not place: tried five days, then left for twenty (a mill with no bank, a font with no room). */
  /** The light holds the zoning today (zoneByDemand): no new lots, and no new streets for them either. */
  zoningHeld = false;
  private goalTries: Record<string, number> = {};
  private goalBlocked: Record<string, number> = {};
  /** Tales answered, and how many of them not with choice 0; loans taken; wall arcs raised. */
  tales = 0;
  talesOff0 = 0;
  loans = 0;
  wallArcs = 0;
  constructor(private s: GameState, private opts: BotOptions = {}) {}

  private get cx(): number {
    return this.s.founding.x + 2;
  }
  private get cy(): number {
    return this.s.founding.y + 1;
  }
  /** The crowns growth may spend: the treasury less what is held back for the goal. */
  private spendable(): number {
    return this.s.treasury - this.reserve;
  }

  /** Call once per day. */
  step(): void {
    const s = this.s;
    if (s.gameOver) return;
    if (s.pendingEvent) {
      const a = this.opts.choiceZero ? { choice: 0, amount: undefined } : chooseTale(s);
      resolveEvent(s, a.choice, a.amount);
      this.tales++;
      if (a.choice !== 0) this.talesOff0++;
    }
    this.tendDragons();
    this.setTaxes();
    this.setEdicts();
    this.hunt();
    this.goal = this.pickGoal();
    // the price is held back from growth only when it is urgent: a hall, or a brownout past a twentieth; a ley merely tight buys its Font when it can
    this.reserve = this.goal && (this.goal.kind === 'hall' || s.brownout > 0.05) ? this.goal.cost : 0;
    this.pursueGoal();
    // the Crown's loan goes back once the purse can carry it and nothing is being saved for; while it is out, growth waits for that
    if (s.loan > 0 && !this.goal && s.treasury >= s.loan + 2000) repayLoan(s);
    if (s.loan > 0) this.reserve = Math.max(this.reserve, s.loan);
    this.ensureGrid();
    this.charterDistricts();
    this.zoneByDemand();
    this.keepWatered();
    this.quarry();
    this.moor();
    this.brighten();
    this.keepLit();
    this.linkNodes();
    this.raiseWalls();
    this.buyServices();
    // expand when zone tiles are mostly used and demand is positive, or when a zone in demand has run out of lots (iteration 55:
    // lots of a zone nobody wants never fill, and with the purse holding back services the failed placements no longer grew the town)
    const free = this.freeZoneTiles();
    const wantMore = s.demand.hearth > 0.2 || s.demand.market > 0.3 || s.demand.craft > 0.3 || s.demand.arcane > 0.3;
    const hungry = ([[Zone.Hearth, s.demand.hearth], [Zone.Market, s.demand.market], [Zone.Craft, s.demand.craft]] as [Zone, number][]).some(([z, v]) => v > 0.15 && this.freeZoneTiles(z) < 20);
    if (!this.zoningHeld && (free < 12 && wantMore || hungry) && s.day - this.lastExpand >= 4 && s.treasury > 800 + Math.max(0, s.loan) && (s.day < 30 || s.ledger.net > 0) && this.radius < 40) { // streets are growth the goal does not hold back; none while the light holds the zoning
      this.radius += 5;
      this.lastExpand = s.day;
    }
    // extend the Charter when the purse allows and the grid is pressing on its edge
    if (s.milestone >= 1 && this.spendable() > 9000 && s.day % 5 === 0) {
      let best = -1;
      let bc = Infinity;
      for (let k = 0; k < s.sectors.length; k++) if (!s.sectors[k] && canBuySector(s, k) === null && sectorCost(s, k) < bc) { bc = sectorCost(s, k); best = k; }
      if (best >= 0 && bc < this.spendable() * 0.5) buySector(s, best);
    }
  }

  /** Dragons kept: an egg lined with eggshell; a drake wards the hearth quarter, else delves, else fights; a wyvern carries; the Ring keeps one champion. */
  private tendDragons(): void {
    const s = this.s;
    const ring = s.buildings.some((b) => b && b.kind === 'ring' && b.state === 'ok');
    let champ = s.dragons.find((d) => d.role === 'champion') ?? null;
    if (ring && !champ) {
      const grown = s.dragons.filter((d) => d.stage >= 2).sort((a, b) => b.stage - a.stage || a.id - b.id);
      if (grown.length && !setRole(s, grown[0].id, 'champion')) champ = grown[0];
    }
    const wardOf = this.districted && districtMarkets(s, 1).length ? 1 : 0;
    for (const d of s.dragons) {
      if (d.stage === 0 && !d.lined && s.materials.eggshell >= 1) lineNest(s, d.id);
      if (d === champ) continue;
      if (d.stage >= 3 && d.role !== 'courier') setRole(s, d.id, 'courier');
      else if (d.stage === 2 && d.role === 'none') {
        const mine = s.buildings.find((b) => b && b.kind === 'mine');
        if (wardOf) setRole(s, d.id, 'warden', wardOf);
        else if (mine) setRole(s, d.id, 'delver', mine.id);
        else if (ring && !champ) { setRole(s, d.id, 'champion'); champ = d; }
      }
    }
  }

  /** The tithe moves off the hearths when the Vellish gate or unrest asks; the works, shops and studios carry the difference. */
  private setTaxes(): void {
    const s = this.s;
    if (s.day % 2) return;
    let h = s.taxRates.hearth;
    const MS = milestonesOf(s);
    const next = s.milestone + 1;
    if (s.faction === 'vellish' && next < MS.length) {
      const need = VELLISH_HAPPINESS(next);
      // a cut only where it can bridge the gap: four points of tithe lift the mean about five
      if (s.happiness < need + 1 && s.happiness >= need - 5 && s.population >= MS[next].pop * 0.8) h--;
      else if (s.happiness > need + 5 || s.happiness < need - 5) h++;
      if (s.unrest > 0.25) h--;
    } else if (s.unrest > 0.25) h--;
    else if (s.unrest < 0.12) h++;
    if (s.ledger.net < 0 || s.treasury < 0) h = s.taxRates.hearth + 1; // a tithe cut cannot buy cheer on a ledger in the red
    h = Math.max(6, Math.min(10, h));
    setTax(s, 'hearth', h);
    const shift = Math.min(3, 10 - h);
    setTax(s, 'market', s.demand.market < 0 ? 10 : 10 + shift);
    setTax(s, 'craft', s.demand.craft < 0 ? 10 : 10 + shift);
    setTax(s, 'arcane', s.demand.arcane < 0 ? 10 : 10 + shift);
  }

  /** Edicts as the advisor would: the curfew past 0.35 unrest, draughts for a sick city that can pay, mail while scale lasts, imports for empty shelves. */
  private setEdicts(): void {
    const s = this.s;
    const has = (k: string) => !!EDICT_BY_KEY[k] && s.milestone >= EDICT_BY_KEY[k].unlock && edictsFor(s).some((e) => e.key === k);
    const off = (k: string) => { if (s.edicts[k] && !edictLocked(s, k) && s.treasury > 1000) setEdict(s, k, false); };
    const net = s.ledger.net;
    if (has('curfew')) { if (s.unrest > 0.35) setEdict(s, 'curfew', true); else if (s.unrest < 0.15) off('curfew'); }
    if (has('draughts')) { const cost = EDICT_BY_KEY.draughts.costPerDay(s); if (s.health < 0.45 && net > cost * 3) setEdict(s, 'draughts', true); else if (s.health > 0.6 || net < cost) off('draughts'); }
    if (has('scalemail') && s.materials.scale >= 3 && s.unrest > 0.1) setEdict(s, 'scalemail', true);
    if (has('imports')) {
      const markets = s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok').length;
      const depot = s.buildings.some((b) => b && b.kind === 'depot' && b.state === 'ok');
      if (depot && s.goodsShort > Math.max(3, markets * 0.4) && net > 200) setEdict(s, 'imports', true);
      else if (s.goodsShort === 0 || net < 0) off('imports');
    }
  }

  /**
   * The hunt (iteration 57): the first lodge stays on hounds while a pack came within 15 days; the others hunt the most
   * valuable game in their grounds, but only herds above half their cap (and the Close Season's floor), so the bot does not
   * hunt a herd out. The Close Season goes on when the herds a lodge hunts fall under half their cap and the ledger can pay.
   */
  private hunt(): void {
    const s = this.s;
    if (s.stats.houndsTotal > this.houndsSeen) { this.houndsSeen = s.stats.houndsTotal; this.houndDay = s.day; }
    const lodges = (s.buildings.filter((b) => b && b.kind === 'hunterslodge' && b.state === 'ok') as Building[]).sort((a, b) => a.id - b.id);
    const floor = huntFloor(s);
    let low = false;
    lodges.forEach((l, k) => {
      let pick: 'hounds' | WildSpecies = 'hounds';
      if (!(k === 0 && s.day - this.houndDay <= 15)) {
        let bv = 0;
        for (const sp of WILD_SPECIES) {
          const d = WILD[sp];
          if (!herdsInGrounds(s, l, sp).some((h) => h.head >= Math.max(floor + 1, h.cap * 0.5, 2))) continue;
          const v = d.take * (d.meat * 2 + d.hides * 3 + d.trophy * 35);
          if (v > bv) { bv = v; pick = sp; }
        }
      }
      if (quarryOf(l) !== pick) { setQuarry(s, l, pick); this.quarryChanges++; }
      if (pick !== 'hounds') {
        let head = 0;
        let cap = 0;
        for (const h of herdsInGrounds(s, l, pick)) { head += h.head; cap += h.cap; }
        if (cap > 0 && head < cap * 0.5) low = true;
      }
    });
    // a lodge for game: one, at the city's edge facing the nearest good herd, once the purse and the ledger allow it
    if (lodges.length <= (s.day - this.houndDay <= 15 ? 1 : 0) && canBuild(s, 'hunterslodge') && s.day >= 20 && s.day % 3 === 0) {
      const def = BUILDING_BY_KEY.hunterslodge;
      if (this.spendable() > costOf(s, def) + 1500 && s.ledger.net - def.upkeep > 200) {
        let herd: { x: number; y: number } | null = null;
        let hd = this.radius + HUNT_REACH - 2;
        for (const h of s.wild.herds) {
          if ((h.sp !== 'deer' && h.sp !== 'elk' && h.sp !== 'boar' && h.sp !== 'goat') || h.head < 4) continue;
          const d = Math.hypot(h.x - this.cx, h.y - this.cy);
          if (d < hd) { hd = d; herd = h; }
        }
        if (herd) {
          const h = herd;
          const t = Math.max(0, Math.min(this.radius, hd - 6)) / Math.max(1, hd);
          const px = Math.round(this.cx + (h.x - this.cx) * t);
          const py = Math.round(this.cy + (h.y - this.cy) * t);
          // within the herd's reach, and a market within the meat's reach (the shelves are the point)
          const markets = s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok') as Building[];
          const inReach = (x: number, y: number) => Math.hypot(x + 1 - h.x, y + 1 - h.y) <= HUNT_REACH - 2;
          // only there: a game lodge with no market in reach brings in hides a city with no depot cannot sell (iteration 57: it cost Vellish 42 a sixth of its folk)
          this.placeNear('hunterslodge', px, py, 8, false, (x, y) => inReach(x, y) && markets.some((m) => Math.hypot(m.x - x - 1, m.y - y - 1) <= MEAT_REACH - 4));
        }
      }
    }
    if (!(EDICT_BY_KEY.closeseason && s.milestone >= EDICT_BY_KEY.closeseason.unlock)) return;
    const cost = EDICT_BY_KEY.closeseason.costPerDay(s);
    if (low && s.ledger.net > cost * 3) setEdict(s, 'closeseason', true);
    else if (!low && s.edicts.closeseason && !edictLocked(s, 'closeseason') && s.treasury > 1000) setEdict(s, 'closeseason', false);
  }

  /** The one large purchase worth saving for: the cheapest mana when the ley runs short, else the people's hall. */
  private pickGoal(): BotGoal | null {
    const s = this.s;
    // the people's hall first, once: the Hall of Wicks once sworn, and the wonder of the last gate (the Lantern of Vell names the Beacon)
    for (const key of ['hallofwicks', factionKey(s, 'lantern')]) {
      if (!canBuild(s, key) || this.countKind(key) > 0 || (this.goalBlocked[key] ?? -1) >= s.day) continue;
      if (key !== 'hallofwicks' && s.milestone < 7) continue;
      return { kind: 'hall', key, cost: costOf(s, BUILDING_BY_KEY[key]) + 500, mana: key === 'greatweir' };
    }
    // the first cradle, once, when the ley and the ledger can carry it: the Crown answers it with an egg (a cradle in a brownout
    // starved the town that raised it in the first draft, and a dragon that cannot be fed leaves and comes back for a tribute)
    const cradle = factionKey(s, 'cradle');
    const def = BUILDING_BY_KEY[cradle];
    if (canBuild(s, cradle) && this.countKind(cradle) === 0 && (this.goalBlocked.cradle ?? -1) < s.day && s.manaSupply - s.manaDemand >= def.manaUse + 5 && s.ledger.net >= 300) return { kind: 'cradle', key: cradle, cost: costOf(s, def) + 200, mana: false };
    // then the cheapest mana when the ley runs short
    const short = s.brownout > 0.02 || s.manaDemand > s.manaSupply * 0.9;
    if (!short) return null;
    const opts: BotGoal[] = [];
    const node = this.linkCandidate();
    if (node >= 0) {
      const n = s.nodes[node];
      const sec = sectorOf(n.x, n.y);
      opts.push({ kind: 'link', key: 'spire', cost: (s.sectors[sec] ? 0 : Math.round(sectorCost(s, sec) * 1.3)) + 2000, mana: true });
    }
    if (canBuild(s, 'font')) opts.push({ kind: 'font', key: 'font', cost: costOf(s, BUILDING_BY_KEY.font) + 200, mana: true });
    const f = s.nodes.findIndex((n) => n.x === s.founding.x && n.y === s.founding.y);
    if (f >= 0 && s.milestone >= 6 && (s.nodes[f].depth ?? 0) < NODE_DEEPEN_COST.length && (!s.nodeLinked.length || s.nodeLinked[f])) opts.push({ kind: 'deepen', key: 'node', cost: NODE_DEEPEN_COST[s.nodes[f].depth ?? 0], mana: true });
    if (factionOf(s).rules.millMana > 1 && canBuild(s, 'torrentmill')) opts.push({ kind: 'mill', key: 'torrentmill', cost: costOf(s, BUILDING_BY_KEY.torrentmill) + 200, mana: true });
    const open = opts.filter((g) => (this.goalBlocked[g.kind] ?? -1) < s.day);
    return open.length ? open.sort((a, b) => a.cost - b.cost)[0] : null;
  }

  /** Buy the goal once the purse holds it; for a goal far off, the Crown's loan brings it forward when the ledger can carry the interest. */
  private pursueGoal(): void {
    const s = this.s;
    const g = this.goal;
    if (!g) return;
    if (g.kind === 'hall' && s.treasury < g.cost && s.loan <= 0 && s.milestone >= 1) {
      // a bridge to a people's hall, not a habit: the hall ten days of the ledger away, and the ledger carrying twice the interest
      // (a loan for the Fonts sank Vellish seed 44 into debt in the first draft: the cash bought upkeep, the interest ate the ledger)
      const net = s.ledger.net;
      const interest = loanLimit(s) * LOAN_INTEREST;
      if (g.cost - s.treasury > net * 10 && net > interest * 2 && !takeLoan(s)) this.loans++;
    }
    if (s.treasury < g.cost) return;
    let done = false;
    if (g.kind === 'link') return; // linkNodes buys the sector and raises the spire
    if (g.kind === 'font' || g.kind === 'hall' || g.kind === 'cradle') done = g.key === 'greatweir' ? this.placeNear(g.key, this.cx, this.cy, this.radius) : this.placeService(g.key);
    else if (g.kind === 'deepen') { const f = s.nodes.findIndex((n) => n.x === s.founding.x && n.y === s.founding.y); done = f >= 0 && !canDeepenNode(s, f) && !deepenNode(s, f); }
    else if (g.kind === 'mill') done = this.placeNear('torrentmill', this.cx, this.cy, this.radius);
    const tag = g.kind === 'hall' ? g.key : g.kind;
    if (done) { this.goal = null; this.reserve = 0; this.goalTries[tag] = 0; return; }
    this.goalTries[tag] = (this.goalTries[tag] ?? 0) + 1;
    if (this.goalTries[tag] >= 5) { this.goalBlocked[tag] = s.day + 20; this.goalTries[tag] = 0; this.goal = null; this.reserve = 0; }
  }

  /** Walls at 30 hounds: an arc on the side of the nearest Gloam, two tiles past the grid, a Belregi gate where a road crosses; again each 30 more, three at most. */
  private raiseWalls(): void {
    const s = this.s;
    if (s.milestone < WALL_UNLOCK || this.wallArcs >= 3 || s.stats.houndsTotal < 30 * (this.wallArcs + 1)) return;
    let gx = -1;
    let gy = -1;
    let bd = Infinity;
    for (let i = 0; i < s.gloam.length; i++) {
      if (!s.gloam[i]) continue;
      const x = i % MAP_W;
      const y = (i / MAP_W) | 0;
      const d = Math.hypot(x - this.cx, y - this.cy);
      if (d < bd) { bd = d; gx = x; gy = y; }
    }
    if (gx < 0) return;
    const alongX = Math.abs(gy - this.cy) >= Math.abs(gx - this.cx); // the Gloam lies north or south: the wall runs east-west
    // 21 tiles centred on the Gloam's bearing: the stretch the packs come over, not the whole side (half a mana a tile)
    const mid = alongX ? Math.max(-this.radius, Math.min(this.radius, gx - this.cx)) : Math.max(-this.radius, Math.min(this.radius, gy - this.cy));
    const lineAt = (off: number) => {
      const line: number[] = [];
      for (let k = mid - 10; k <= mid + 10; k++) {
        const x = alongX ? this.cx + k : this.cx + Math.sign(gx - this.cx) * off;
        const y = alongX ? this.cy + Math.sign(gy - this.cy) * off : this.cy + k;
        if (inBounds(x, y)) line.push(idx(x, y));
      }
      return line;
    };
    // two tiles past the grid, or its own last row when that lies beyond the Charter or in the grey; a side with no room waits
    let line = lineAt(this.radius + 2);
    if (line.filter((i) => wallTileCost(s, i) > 0).length < 6) line = lineAt(this.radius + 1);
    const tiles = line.filter((i) => wallTileCost(s, i) > 0);
    const roads = s.milestone >= GATE_UNLOCK ? line.filter((i) => s.road[i] && !s.wall[i]) : [];
    if (tiles.length < 6) return;
    const cost = previewWall(s, tiles).cost + roads.length * GATE_COST[2];
    if (this.spendable() < cost + 1500) return; // a wall draws WALL_MANA a tile: the bot walls even a tight ley, as the packs will not wait
    if (!buildWall(s, tiles).ok) return;
    for (const i of roads) placeGate(s, 2, i % MAP_W, (i / MAP_W) | 0);
    this.wallArcs++;
  }
  private freeZoneTiles(z?: Zone): number {
    let n = 0;
    const s = this.s;
    for (let i = 0; i < s.zone.length; i++) if (s.zone[i] && s.bIndex[i] < 0 && (z === undefined || s.zone[i] === z)) n++;
    return n;
  }

  /** Streets every 5 tiles in both directions within the current radius. */
  private ensureGrid(): void {
    const s = this.s;
    const r = this.radius;
    for (let k = -r; k <= r; k += 5) {
      const type = s.milestone >= 1 && Math.abs(k) % 10 === 0 ? RoadType.Cobble : RoadType.Track;
      buildRoad(s, type, roadPath(this.cx - r, this.cy + k, this.cx + r, this.cy + k, false));
      buildRoad(s, type, roadPath(this.cx + k, this.cy - r, this.cx + k, this.cy + r, true));
    }
  }

  private zoneByDemand(): void {
    const s = this.s;
    const r = this.radius;
    const d = s.demand;
    // the light first, for the two peoples whose gate it is: the Vellish paint no new lots while the ley cannot carry them (a brownout
    // past a tenth, with a tenth of the zone buildings dark) unless their happiness clears the gate by four; the Tallowkin hold zoning
    // while the lit share is under the next gate and a point and a half. Homes dark for want of a spire in reach are keepLit's to fix.
    const { zone, dark } = zoneLight(s);
    const MS = milestonesOf(s);
    const next = s.milestone + 1;
    const cheerful = s.faction === 'vellish' && next < MS.length && s.happiness >= VELLISH_HAPPINESS(next) + 4;
    const tallowGate = factionOf(s).rules.gateHold ? TALLOW_LIGHT[next] : undefined;
    this.zoningHeld = (s.faction === 'vellish' && zone >= 20 && dark > zone * 0.1 && s.brownout > 0.1 && !cheerful) || (zone >= 20 && tallowGate !== undefined && litShare(s) < tallowGate + 0.015);
    if (this.zoningHeld) return;
    // lots the light and a well already reach are painted first, so new homes start lit and watered
    const near = (i: number, layer: Uint8Array) => layer[i] || layer[i - 1] || layer[i + 1] || layer[i - MAP_W] || layer[i + MAP_W];
    const tier = (i: number) => (near(i, s.lit) ? 0 : 2) + (s.watered[i] ? 0 : 1);
    // pick the zone with the highest demand above a threshold
    const cands: [Zone, number][] = [[Zone.Hearth, d.hearth], [Zone.Market, d.market], [Zone.Craft, d.craft], [Zone.Arcane, d.arcane]];
    cands.sort((a, b) => b[1] - a[1]);
    let painted = 0;
    for (const [z, v] of cands) {
      if (v < (this.opts.aggressive ? 0 : 0.15)) continue;
      if (z === Zone.Arcane && s.milestone < 4) continue;
      // find unzoned road-adjacent tiles inside the radius, paint a few strips (2 rows beside a street);
      // a people that builds on hills takes the hill tiles first (stone for its milestones)
      const hillOK = factionOf(s).rules.hillBuildable;
      outer: for (const hillPass of hillOK ? [true, false] : [false]) for (const want of [0, 1, 2, 3]) for (let y = this.cy - r; y <= this.cy + r; y++) {
        for (let x = this.cx - r; x <= this.cx + r; x++) {
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          if (tier(i) !== want) continue;
          if (s.zone[i] || s.road[i] || s.bIndex[i] >= 0 || s.gloam[i]) continue;
          const t = s.terrain[i];
          if (isWater(t) || (t === Terrain.Hills && !hillOK) || t === Terrain.LeyNode || t === Terrain.Ruins) continue;
          if (hillPass !== (t === Terrain.Hills && hillOK)) continue;
          if (!roadOnSide(s, x, y)) continue;
          // craft away from the centre, hearth near
          const dist = Math.max(Math.abs(x - this.cx), Math.abs(y - this.cy));
          if (z === Zone.Craft && dist < 8) continue;
          if (z === Zone.Hearth && dist > r) continue;
          paintZone(s, z, x, y, x, y);
          painted++;
          if (painted >= 14) break outer;
        }
      }
      if (painted >= 14) break;
    }
  }

  /** Place wells (or cisterns) near unwatered zone buildings. */
  private keepWatered(): void {
    const s = this.s;
    const dry: { x: number; y: number }[] = [];
    forEachBuilding(s, (b) => {
      if (!b.watered && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok') dry.push({ x: b.x, y: b.y });
    });
    if (!dry.length) return;
    // a few dry homes wait for the next well; a well a day unless a twelfth are dry (iteration 55: seventy wells ate 280 a day on seed 44)
    const zone = zoneLight(s).zone;
    if (dry.length < Math.max(3, zone * 0.02)) return;
    const most = dry.length > zone * 0.08 ? 3 : 1;
    let placed = 0;
    for (let k = 0; k < dry.length && placed < most; k += Math.max(1, Math.floor(dry.length / 6))) {
      const d = dry[k];
      const key = factionKey(s, s.milestone >= 2 && this.spendable() > 4000 && s.manaSupply - s.manaDemand > 12 ? 'cistern' : 'well');
      const well = factionKey(s, 'well');
      if (this.placeNear(key, d.x, d.y, 4) || this.placeNear(well, d.x, d.y, 6, true) || (well !== 'well' && (this.placeNear(well, d.x, d.y, 10) || (BUILDING_BY_KEY[well].nearWater && this.placeNear(well, d.x, d.y, 14)) || (canBuild(s, 'cistern') && s.manaSupply - s.manaDemand > 10 && this.placeNear('cistern', d.x, d.y, 6))))) placed++;
    }
  }

  /** A people gated on light: Wick-Towers beside the dark buildings when a lit spire or node is in reach, else a spire. */
  private brighten(): void {
    const s = this.s;
    const gate = factionOf(s).rules.milestoneGate;
    if (!gate || !canBuild(s, 'wicktower')) return;
    const next = s.milestone + 1;
    if (next >= milestonesOf(s).length || gate(s, next)) return;
    const reach = 6 + factionOf(s).rules.spireReach;
    const lit: { x: number; y: number }[] = s.nodes.map((n) => ({ x: n.x, y: n.y }));
    forEachBuilding(s, (b) => { if (b.lit && (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'stake')) lit.push({ x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2 }); });
    let done = 0;
    // never more than two towers standing unlit: a tower that cannot link is upkeep for nothing (iteration 52)
    let unlitTowers = 0;
    forEachBuilding(s, (b) => { if (b.kind === 'wicktower' && b.state === 'ok' && !b.lit) unlitTowers++; });
    forEachBuilding(s, (b) => {
      if (done >= 3 || b.lit || b.state !== 'ok' || BUILDING_BY_KEY[b.kind].category !== 'zone') return;
      if (s.treasury < BUILDING_BY_KEY.wicktower.cost + 400) return;
      const near = lit.some((l) => Math.hypot(l.x - b.x, l.y - b.y) <= reach + 2);
      // a tower only where it will link: a lit source within reach of the tower's own tile
      const links = (x: number, y: number) => lit.some((l) => Math.hypot(l.x - x, l.y - y) <= reach - 0.5);
      if (near && unlitTowers < 2 ? this.placeNear('wicktower', b.x, b.y, 3, false, links) : !near ? this.placeNear('spire', b.x, b.y, 3) : false) done++;
    });
  }

  /** A node's flow counts only while a spire links it: when the ley runs short, link the nearest unlinked node in reach (never a sleeping wyrm's). */
  /** The nearest unlinked node in reach that is not a sleeping wyrm's, or −1. */
  private linkCandidate(): number {
    const s = this.s;
    if (!s.nodeLinked.length) return -1;
    const f = s.founding;
    let best = -1;
    let bd = Infinity;
    s.nodes.forEach((n, k) => {
      if (s.nodeLinked[k]) return;
      if (k === s.wyrm.node && s.wyrm.state === 'sleeping') return;
      const d = Math.hypot(n.x - f.x, n.y - f.y);
      if (d <= this.radius + 16 && d < bd) { bd = d; best = k; }
    });
    return best;
  }

  private linkNodes(): void {
    const s = this.s;
    if (!s.nodeLinked.length || s.manaDemand < s.manaSupply * 0.85) return;
    const best = this.linkCandidate();
    if (best < 0) return;
    const n = s.nodes[best];
    // beyond the Charter: buy the node's sector first when the purse can bear it
    const sec = sectorOf(n.x, n.y);
    if (!s.sectors[sec]) {
      if (canBuySector(s, sec) === null && s.treasury > sectorCost(s, sec) * 1.3) buySector(s, sec);
      return;
    }
    // a spire must touch a road: a track from the city to the node's side, then the spire beside it
    if (this.placeNear(factionKey(s, 'spire'), n.x, n.y, 5, true)) return;
    const path = roadPath(this.cx, this.cy, n.x + 2, n.y + 2, false).filter((i) => s.bIndex[i] < 0 && !s.road[i] && s.terrain[i] !== Terrain.LeyNode);
    if (path.length && s.treasury > path.length * 12 + 2000) buildRoad(s, RoadType.Track, path);
  }

  /** Place spires near unlit buildings, chained to the lit network. */
  private keepLit(): void {
    const s = this.s;
    if (s.manaDemand > s.manaSupply * 0.95) return; // no point lighting more
    // the dark zone buildings nearest the centre first; up to six are tried for a spire that links (iteration 55: the first alone often had none)
    const darks: { x: number; y: number; r: number }[] = [];
    forEachBuilding(s, (b) => {
      if (!b.lit && BUILDING_BY_KEY[b.kind].category === 'zone' && b.state === 'ok') darks.push({ x: b.x, y: b.y, r: Math.abs(b.x - this.cx) + Math.abs(b.y - this.cy) });
    });
    if (!darks.length) return;
    darks.sort((a, b) => a.r - b.r);
    for (const d of darks.slice(0, 6)) if (this.lightNear(d)) return;
    this.lightNear(darks[0], true);
  }

  /** A spire within 5 of the dark building that links to the lit network; with `relay`, a spire chained toward it from the nearest lit source. */
  private lightNear(d: { x: number; y: number }, relay = false): boolean {
    const s = this.s;
    // candidate spots within 5 of the dark building that are within 6 of a lit spire/node
    const reach = 6 + factionOf(s).rules.spireReach;
    const lit: { x: number; y: number; link: number }[] = s.nodes.map((n) => ({ x: n.x, y: n.y, link: reach }));
    forEachBuilding(s, (b) => {
      if (b.lit && (b.kind === 'spire' || b.kind === 'nexus' || b.kind === 'stake')) lit.push({ x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2, link: b.kind === 'spire' ? reach : b.kind === 'stake' ? 4 : 9 });
    });
    let best: { x: number; y: number; score: number } | null = null;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const x = d.x + dx;
        const y = d.y + dy;
        if (!inBounds(x, y) || canPlaceBuilding(s, 'spire', x, y)) continue;
        const dd = Math.hypot(dx, dy);
        if (dd > 5) continue;
        let linked = false;
        for (const l of lit) if (Math.hypot(l.x - x, l.y - y) <= l.link + 0.5) linked = true;
        if (!linked) continue;
        // prefer spots that light many unlit buildings
        let score = 0;
        forEachBuilding(s, (b) => {
          if (!b.lit && Math.hypot(b.x - x, b.y - y) <= 5) score++;
        });
        if (!best || score > best.score) best = { x, y, score };
      }
    if (best) return placeBuilding(s, 'spire', (best as { x: number }).x, (best as { y: number }).y).ok;
    if (!relay) return false;
    {
      // no linkable spot: chain a relay spire toward the dark building from the nearest lit source
      let near: { x: number; y: number; link: number } | null = null;
      let nd = Infinity;
      for (const l of lit) {
        const dd = Math.hypot(l.x - d.x, l.y - d.y);
        if (dd < nd) {
          nd = dd;
          near = l;
        }
      }
      if (!near) return false;
      const n = near as { x: number; y: number; link: number };
      const ux = (d.x - n.x) / nd;
      const uy = (d.y - n.y) / nd;
      const tx = Math.round(n.x + ux * (n.link - 0.5));
      const ty = Math.round(n.y + uy * (n.link - 0.5));
      return this.placeNear('spire', tx, ty, 2, true);
    }
  }

  /** At the Village: the inner square (hearths and markets; the bot keeps works 8 out) becomes a Hearth quarter.
   *  The ring beyond it is mixed, and a Craft quarter there cost the bot's hearths more than its works gained. */
  private charterDistricts(): void {
    const s = this.s;
    if (this.districted || s.milestone < 3) return;
    if (s.ledger.net < 800 || this.goal) return; // a crown a building a day: only once the ledger carries it and nothing is being saved for
    this.districted = true;
    paintDistrict(s, 1, this.cx - 7, this.cy - 7, this.cx + 7, this.cy + 7);
    setQuarter(s, 1, 'hearth');
  }

  /** Hill zone tiles with nothing built yet: the room a hill people has left for its halls. */
  private freeHillZoneTiles(): number {
    const s = this.s;
    let n = 0;
    for (let i = 0; i < s.zone.length; i++) if (s.zone[i] && s.bIndex[i] < 0 && s.terrain[i] === Terrain.Hills) n++;
    return n;
  }

  /** The nearest free tile matching `pred`, Manhattan from the centre (as the Grimmen hill track finds its hills). */
  private nearestTile(pred: (x: number, y: number) => boolean): { x: number; y: number; d: number } | null {
    const s = this.s;
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = 1; y < MAP_H - 1; y++)
      for (let x = 1; x < MAP_W - 1; x++) {
        if (s.bIndex[idx(x, y)] >= 0 || !pred(x, y)) continue;
        const d = Math.abs(x - this.cx) + Math.abs(y - this.cy);
        if (!best || d < best.d) best = { x, y, d };
      }
    return best;
  }

  /** A people gated on moorings lays a landing when its folk outrun its reach; when none can stand, a track to the water. */
  private moor(): void {
    const s = this.s;
    const gate = factionOf(s).rules.milestoneGate;
    if (!gate || !canBuild(s, 'landing')) return;
    const next = s.milestone + 1;
    // a landing for trade: works with no mooring within a barge's reach get one of their own
    if (s.treasury >= BUILDING_BY_KEY.landing.cost + 1500) {
      const moors = s.buildings.filter((b): b is NonNullable<typeof b> => !!b && MOORINGS.includes(b.kind) && b.state === 'ok');
      const works = moors.length ? s.buildings.find((b) => b && b.kind === 'craft' && b.state === 'ok' && !moors.some((m) => Math.abs(m.x - b.x) <= 8 && Math.abs(m.y - b.y) <= 8)) : null;
      if (works && this.placeNear('landing', works.x, works.y, 8)) return;
    }
    if (next >= milestonesOf(s).length || gate(s, next) || s.treasury < BUILDING_BY_KEY.landing.cost + 100) return;
    // the gate holds the milestone grants back, so a mooring is worth a home on the bank (clear mode asks before it digs)
    if (this.placeNear('landing', this.cx, this.cy, this.radius) || this.placeNear('landing', this.cx, this.cy, this.radius, true)) return;
    // no bank beside a street: find the nearest free bank tile and bring a track to the land beside it (never onto it)
    const land = (x: number, y: number) => inBounds(x, y) && !isWater(s.terrain[idx(x, y)]) && s.terrain[idx(x, y)] !== Terrain.LeyNode && s.bIndex[idx(x, y)] < 0;
    const t = this.nearestTile((x, y) => land(x, y) && !s.road[idx(x, y)] && touchesTerrain(s, x, y, 1, 1, (tt) => tt === Terrain.Water));
    if (!t || t.d > 45) return;
    if (t.d > this.radius) this.radius = Math.min(40, Math.max(this.radius, t.d + 2));
    const ends = ([[t.x - 1, t.y], [t.x + 1, t.y], [t.x, t.y - 1], [t.x, t.y + 1]] as [number, number][]).filter(([x, y]) => land(x, y));
    if (!ends.length) return;
    ends.sort((a, b) => Math.abs(a[0] - this.cx) + Math.abs(a[1] - this.cy) - (Math.abs(b[0] - this.cx) + Math.abs(b[1] - this.cy)));
    const [ex, ey] = ends[0];
    if (!s.road[idx(ex, ey)]) buildRoad(s, RoadType.Track, roadPath(this.cx, this.cy, ex, ey, false));
  }

  /** The deep game of a people gated on stone: reach the hills, delve for room or stone, cut a quarry, dig the Deep Cut.
   *  A people that cannot build on hills levels them for stone as a last resort. */
  private quarry(): void {
    const s = this.s;
    const gate = factionOf(s).rules.milestoneGate;
    const hillOK = factionOf(s).rules.hillBuildable;
    const next = s.milestone + 1;
    const stoneShort = !!gate && next < milestonesOf(s).length && !gate(s, next);
    const delve = TERRAFORM.delve;
    const canDelve = s.milestone >= delve.unlock && !!delve.faction?.includes(s.faction);
    if (!gate) return;
    if (!hillOK && !delve.faction?.includes(s.faction)) return; // a people gated on something other than stone never levels hills for it
    if (!canDelve) {
      if (!stoneShort) return;
      if (hillOK) {
        // no Delve yet: reach the nearest hills with a road and widen the grid so the hill pass can zone them
        let bx = -1; let by = -1; let bd = Infinity;
        for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
          if (s.terrain[idx(x, y)] !== Terrain.Hills || s.bIndex[idx(x, y)] >= 0) continue;
          const d = Math.abs(x - this.cx) + Math.abs(y - this.cy);
          if (d < bd) { bd = d; bx = x; by = y; }
        }
        if (bx < 0 || bd > 45 || s.treasury < 600) return;
        if (bd > this.radius) { this.radius = Math.min(40, Math.max(this.radius, bd + 2)); }
        if (!s.road[idx(bx, by)]) buildRoad(s, RoadType.Track, roadPath(this.cx, this.cy, bx, by, false));
        return;
      }
      if (s.milestone < 4 || s.treasury < 2500 || s.population < milestonesOf(s)[next].pop * 0.8) return;
      let done = 0;
      for (let r = 2; r <= this.radius + 8 && done < 3; r++)
        for (let dy = -r; dy <= r && done < 3; dy++)
          for (let dx = -r; dx <= r && done < 3; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = this.cx + dx;
            const y = this.cy + dy;
            if (!inBounds(x, y) || s.terrain[idx(x, y)] !== Terrain.Hills) continue;
            if (terraform(s, 'level', x, y).ok) done++;
          }
      return;
    }
    // delve for room or stone: grass beside the streets, nearest the centre first, four a day
    const roomShort = this.freeHillZoneTiles() < 10 && s.demand.hearth > 0.15;
    if ((roomShort || stoneShort) && s.treasury > 2000) {
      const r = this.radius;
      const cands: { x: number; y: number; d: number }[] = [];
      for (let y = this.cy - r; y <= this.cy + r; y++)
        for (let x = this.cx - r; x <= this.cx + r; x++) {
          if (!inBounds(x, y)) continue;
          const i = idx(x, y);
          const t = s.terrain[i];
          if ((t !== Terrain.Grass && t !== Terrain.Meadow) || s.road[i] || s.bIndex[i] >= 0 || s.gloam[i]) continue;
          if (!roadOnSide(s, x, y)) continue;
          cands.push({ x, y, d: Math.max(Math.abs(x - this.cx), Math.abs(y - this.cy)) });
        }
      cands.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
      let done = 0;
      for (const c of cands) {
        if (done >= 4 || s.treasury <= 2000) break;
        if (terraform(s, 'delve', c.x, c.y).ok) done++;
      }
    }
    // a quarry on the hill when the works cannot keep the shelves full
    if (canBuild(s, 'quarry') && (s.demand.craft > 0.15 || s.goodsShort > 0) && this.countKind('quarry') < Math.floor(this.countKind('market') / 2) + 1 && s.treasury > 2900) {
      this.placeNear('quarry', this.cx, this.cy, this.radius);
    }
    // the Deep Cut once an Academy stands
    if (hillOK && !s.edicts.deepcut && s.milestone >= EDICT_BY_KEY.deepcut.unlock && this.countKind('academy') > 0) { s.edicts.deepcut = true; s.edictSince.deepcut = s.day; }
    void GRIMMEN_STONE; void stoneQuarried;
  }

  private countKind(key: string): number {
    let n = 0;
    forEachBuilding(this.s, (b) => {
      if (b.kind === key) n++;
    });
    return n;
  }

  private buyServices(): void {
    const s = this.s;
    const buildings = s.buildings.filter((b) => b && BUILDING_BY_KEY[b.kind].category === 'zone').length;
    const buffer = 1500;
    const want = (key0: string, target: number, nearGloam = false) => {
      const key = factionKey(s, key0);
      if (!canBuild(s, key)) return;
      const def = BUILDING_BY_KEY[key];
      if (this.countKind(key) >= target) return;
      if (this.spendable() < costOf(s, def) + buffer) return; // growth spends only what the goal leaves
      if (s.day >= 30 && s.ledger.net - def.upkeep < 200) return; // and buys nothing that leaves the ledger under 200 a day (iteration 55: upkeep outran income on seed 44)
      if (def.needsMana && s.manaDemand + def.manaUse > s.manaSupply) return;
      if (!this.placeService(key, nearGloam) && !nearGloam && this.radius < 40 && !this.zoningHeld) this.radius += 5; // no room: grow the town
    };
    want('watchpost', 1 + Math.floor(buildings / 60));
    want('shrine', 1 + Math.floor(buildings / 80));
    want('boneyard', 1 + Math.floor(s.population / 700));
    want('healer', 1 + Math.floor(buildings / 90));
    want('garden', 1 + Math.floor(buildings / 50));
    want('cradle', 1); // a cradle early: the Crown answers the first one with an egg (iteration 55)
    want('tamerslodge', this.countKind(factionKey(s, 'cradle')));
    want('veshari', 1 + Math.floor(buildings / 120));
    want('wardlantern', 1 + Math.floor(s.day / 30), true);
    want('academy', 1 + Math.floor(buildings / 200));
    want('square', 1);
    want('watchhouse', Math.floor(buildings / 150));
    want('ossuary', Math.floor(s.population / 1200));
    want('hospice', Math.floor(buildings / 250));
    want('guildhall', 1);
    want('depot', 1);
    want('ring', 1);
    want('hunterslodge', 1 + Math.floor(s.stats.houndsTotal / 30), true);
    want('nexus', Math.floor(buildings / 220));
    if (isBuildingUnlocked(s.milestone, 'mine') && this.countKind('mine') < 1 + Math.floor(s.buildings.filter((b) => b && b.kind === 'arcane').length / 15) && this.spendable() > 4500) this.buildMine();
    want('temple', 1);
    want('grandacademy', 1);
    // the Fonts, the deepening, the mills and the halls are the goal's (pickGoal), bought from a purse saved for them
    void MILESTONES;
  }

  /** Place a service: toward the Gloam for a ward, else beside the zone buildings farthest from one of its kind; a cradle on a node of its gift's line first. */
  private placeService(key: string, nearGloam = false): boolean {
    const s = this.s;
    const def = BUILDING_BY_KEY[key];
    if (nearGloam) {
      // place toward the nearest gloam tile from the city centre
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < s.gloam.length; i++) {
        if (!s.gloam[i]) continue;
        const x = i % MAP_W;
        const y = (i / MAP_W) | 0;
        const dd = Math.hypot(x - this.cx, y - this.cy);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best < 0) return false;
      const gx = best % MAP_W;
      const gy = (best / MAP_W) | 0;
      // spot on the city edge toward the gloam
      const ux = (gx - this.cx) / bd;
      const uy = (gy - this.cy) / bd;
      const r = Math.min(this.radius, bd - 6);
      return this.placeNear(key, Math.round(this.cx + ux * r), Math.round(this.cy + uy * r), 4);
    }
    const clear = key === 'font' || key === 'nexus' || key === 'academy' || key === 'boneyard' || key === 'veshari' || key === 'cradle' || key === 'hatchery' || key === 'tidepool' || key === 'tamerslodge' || key === 'hallofwicks' || key === 'lantern';
    // a cradle beside the markets that feed its dragons (within twelve tiles): a hungry dragon leaves
    if (def.key === factionKey(s, 'cradle')) {
      const m = s.buildings.find((b) => b && BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok');
      if (m && this.placeNear(key, m.x, m.y, 6, true)) return true;
    }
    // spread services: beside the zone buildings farthest from one of the same kind; with none standing, every distance ties,
    // so the outer ring is tried too (a 2×2 hall finds no room among the packed old homes: the depot of iteration 43)
    const spots: { x: number; y: number; d: number; r: number }[] = [];
    forEachBuilding(s, (b) => {
      if (BUILDING_BY_KEY[b.kind].category !== 'zone') return;
      let dmin = Infinity;
      forEachBuilding(s, (o) => {
        if (o.kind === key) dmin = Math.min(dmin, Math.hypot(o.x - b.x, o.y - b.y));
      });
      spots.push({ x: b.x, y: b.y, d: dmin, r: Math.max(Math.abs(b.x - this.cx), Math.abs(b.y - this.cy)) });
    });
    spots.sort((a, b) => b.d - a.d);
    const tries = spots.slice(0, 6);
    if (def.w >= 2) for (const sp of [...spots].sort((a, b) => b.d - a.d || b.r - a.r).slice(0, 12)) if (!tries.includes(sp)) tries.push(sp);
    for (const sp of tries) if (this.placeNear(key, sp.x, sp.y, 4, clear)) return true;
    return this.placeNear(key, this.cx, this.cy, Math.min(this.radius, 12)); // no homes to stand beside yet: anywhere near the stake
  }

  /** Find hills near the town, connect them by road and dig a mine. */
  private buildMine(): void {
    const s = this.s;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = 2; y < MAP_H - 3; y++)
      for (let x = 2; x < MAP_W - 3; x++) {
        let hills = true;
        for (let dy = 0; dy < 2 && hills; dy++) for (let dx = 0; dx < 2; dx++) if (s.terrain[idx(x + dx, y + dy)] !== Terrain.Hills || s.bIndex[idx(x + dx, y + dy)] >= 0) hills = false;
        if (!hills) continue;
        const d = Math.hypot(x - this.cx, y - this.cy);
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    if (!best || bd > 45) return;
    // road from the town edge toward the tile just below the mine
    const [mx, my] = best;
    const tx = mx - 1; // left of the footprint, touching it
    const ty = my + 1;
    // start on a grid street inside the town
    let sx = Math.max(this.cx - this.radius, Math.min(this.cx + this.radius, tx));
    let sy = Math.max(this.cy - this.radius, Math.min(this.cy + this.radius, ty));
    sx = this.cx + Math.round((sx - this.cx) / 5) * 5;
    sy = this.cy + Math.round((sy - this.cy) / 5) * 5;
    const verticalFirst = !(sx >= mx && sx <= mx + 1);
    const r = buildRoad(s, RoadType.Track, roadPath(sx, sy, tx, ty, verticalFirst));
    if (r.ok || s.road[idx(tx, ty)]) placeBuilding(s, 'mine', mx, my);
  }

  /** Try to place a building near (x,y) within a search radius. */
  private placeNear(key: string, x: number, y: number, r: number, allowClear = false, ok?: (x: number, y: number) => boolean): boolean {
    const s = this.s;
    const def = BUILDING_BY_KEY[key];
    if (s.treasury < costOf(s, def)) return false;
    let best: { x: number; y: number; d: number } | null = null;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (!inBounds(px, py) || px < 1 || py < 1 || px >= MAP_W - 3 || py >= MAP_H - 3) continue;
        if (canPlaceBuilding(s, key, px, py)) continue;
        if (ok && !ok(px, py)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { x: px, y: py, d };
      }
    if (!best) {
      if (!allowClear) return false;
      // dense city: sacrifice zoned buildings to clear a w×h footprint beside a road
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (!inBounds(px, py) || !inBounds(px + def.w, py + def.h)) continue;
          let ok = true;
          const victims: [number, number][] = [];
          for (let fy = 0; fy < def.h && ok; fy++)
            for (let fx = 0; fx < def.w; fx++) {
              const i = idx(px + fx, py + fy);
              const t = s.terrain[i];
              if (isWater(t) || (t === Terrain.Hills && !factionOf(s).rules.hillBuildable) || t === Terrain.LeyNode || t === Terrain.Ruins || s.road[i] || s.gloam[i]) {
                ok = false;
                break;
              }
              const bi = s.bIndex[i];
              if (bi >= 0) {
                const b = s.buildings[bi];
                if (!b || b.w !== 1 || BUILDING_BY_KEY[b.kind].category !== 'zone') {
                  ok = false;
                  break;
                }
                victims.push([px + fx, py + fy]);
              }
            }
          if (!ok) continue;
          // ask before digging: a seep still needs its hill, a service its road; the victims are not restored on failure
          if (canPlaceBuilding(s, key, px, py, true)) continue;
          for (const [vx, vy] of victims) bulldoze(s, vx, vy);
          if (placeBuilding(s, key, px, py).ok) return true;
        }
      return false;
    }
    return placeBuilding(s, key, (best as { x: number }).x, (best as { y: number }).y).ok;
  }
}
