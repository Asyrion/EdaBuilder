/** The Sleeping Wyrm: a Vein-Wyrm coiled around the farthest ley node. See DESIGN.md 4.29 / 8.2. */
import { BUILDING_BY_KEY } from './catalog';
import { AgentKind, DAYS_PER_SEASON, Zone, idx, type Building, type GameState, type WyrmState } from './types';
import { forEachBuilding, markDirtyAround, pushMessage, illTiding } from './world';
import { edictOn } from './edicts';
import { effects } from './hazards';

export const WYRM_MIN_DIST = 40; // node must be this far from the founding node
export const WYRM_LAIR_RADIUS = 30;
export const WYRM_EATS = 40; // goods a day when bound
export const COURT_GRACE = 2; // days a courted wyrm bears a dark Court before it sulks (iteration 53)
/** What the bound wyrm eats today: half while a lit Wyrm-Court sings over its lair. */
export function wyrmEats(s: GameState): number {
  return hasCourt(s) ? WYRM_EATS / 2 : WYRM_EATS;
}
export const WYRM_SULK_AFTER = 10; // unfed days
export const WYRM_DIES_AFTER = 40; // sulking days
export const WYRM_WAKE_PER_SPIRE = 3; // waking points per lit spire per day
export const WYRM_TRIBUTE_BASE = 1500;
export const WYRM_TRIBUTE_GOODS = 150;
export const WYRM_FLYOVER_FIRES = 4;
/** Refusals in a row before the wyrm comes for the Founding Stake (iteration 70): the third ends the charter. */
export const WYRM_STARVE_LIMIT = 3;
/** A great wyrm (a trueblood at the wyrm stage) rises to meet a hostile flyover: half the fires, and the Vein-Wyrm sleeps deeper after. */
export function greatWyrm(s: GameState): { name: string } | null {
  const d = s.dragons.find((x) => x.stage >= 4);
  return d ? { name: d.name } : null;
}
export function flyoverFireCap(s: GameState): number {
  return greatWyrm(s) ? Math.ceil(WYRM_FLYOVER_FIRES / 2) : WYRM_FLYOVER_FIRES;
}
export const WYRM_VEIN_EGG_DAYS = DAYS_PER_SEASON;

export function newWyrm(node: number): WyrmState {
  return { node, state: node < 0 ? 'none' : 'sleeping', waking: 0, tributes: 0, tributeDay: -1, unfed: 0, sulking: 0, fedDays: 0, refused: 0, flyover: 0, fires: 0, bound: -1, died: -1, askedBind: -1, courted: false, courtDark: 0, starved: 0, razing: false };
}

/** Choose the wyrm's node: the farthest from the founding node, if far enough. */
export function chooseWyrmNode(nodes: { x: number; y: number }[], founding: { x: number; y: number }): number {
  let best = -1;
  let bd = WYRM_MIN_DIST;
  nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - founding.x, n.y - founding.y);
    if (d >= bd) { bd = d; best = i; }
  });
  return best;
}

export function wyrmNode(s: GameState): { x: number; y: number } | null {
  return s.wyrm.node >= 0 ? s.nodes[s.wyrm.node] ?? null : null;
}

export function wyrmTribute(s: GameState): number {
  return Math.round(WYRM_TRIBUTE_BASE * (1 + s.wyrm.tributes * 0.5) * (edictOn(s, 'wyrmpeace') ? 0.5 : 1));
}

/** True while the bound wyrm guards the city (bound, not sulking). */
export function wyrmGuards(s: GameState): boolean {
  return s.wyrm.state === 'bound' && s.wyrm.sulking === 0;
}

export function inLair(s: GameState, x: number, y: number): boolean {
  const n = wyrmNode(s);
  return !!n && Math.hypot(n.x - x, n.y - y) <= WYRM_LAIR_RADIUS;
}

/** Lit spires within 6 tiles of the wyrm's node draw from its Vein. */
export function spiresAtWyrm(s: GameState): number {
  const n = wyrmNode(s);
  if (!n) return 0;
  let c = 0;
  forEachBuilding(s, (b) => {
    if (b.kind === 'spire' && b.lit && b.state === 'ok' && Math.hypot(b.x - n.x, b.y - n.y) <= 6) c++;
  });
  return c;
}

function redraw(s: GameState): void {
  const n = wyrmNode(s);
  if (n) markDirtyAround(s, n.x, n.y);
}

/** Called when a node is deepened: deepening the wyrm's node wakes it at once. */
export function onNodeDeepened(s: GameState, ni: number): void {
  if (ni === s.wyrm.node && s.wyrm.state === 'sleeping') wake(s, 'The bore-singers strike scale, not stone.');
}

export function wake(s: GameState, why: string): void {
  const n = wyrmNode(s)!;
  s.wyrm.state = 'awake';
  s.wyrm.waking = 100;
  s.wyrm.tributeDay = s.day; // tribute event fires today
  redraw(s);
  illTiding(s);
  pushMessage(s, `${why} The Sleeping Wyrm at (${n.x},${n.y}) uncoils and lifts its head. The spires all hum flat.`, 'bad', true, { x: n.x, y: n.y });
}

/** Total goods on market shelves. */
export function marketGoods(s: GameState): number {
  let t = 0;
  forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok') t += b.stock; });
  return t;
}

/** Take up to n goods from markets, largest shelves first. Returns the amount taken. */
export function takeGoods(s: GameState, n: number): number {
  const markets: Building[] = [];
  forEachBuilding(s, (b) => { if (BUILDING_BY_KEY[b.kind].zone === Zone.Market && b.state === 'ok' && b.stock > 0) markets.push(b); });
  markets.sort((a, b) => b.stock - a.stock);
  let left = n;
  for (const m of markets) {
    if (left <= 0) break;
    const t = Math.min(m.stock, left, Math.max(1, m.stock * 0.6));
    m.stock -= t;
    left -= t;
  }
  return n - left;
}

/** Pay a tribute (crowns or goods). Returns the Chronicle line. */
export function payTribute(s: GameState, kind: 'crowns' | 'goods'): string {
  const n = wyrmNode(s)!;
  if (kind === 'crowns') {
    const c = wyrmTribute(s);
    s.treasury -= c;
    s.wyrm.tributes++;
    s.wyrm.tributeDay = nextSeasonDay(s);
    s.wyrm.starved = 0;
    s.stats.wyrmTributes++;
    pushMessage(s, `${c} crowns are carted to the wyrm's node at (${n.x},${n.y}) and melted into its hoard. It sleeps with one eye open.`, 'info', true, { x: n.x, y: n.y });
    return `${c} crowns melted into the hoard.`;
  }
  const got = takeGoods(s, WYRM_TRIBUTE_GOODS);
  if (got < WYRM_TRIBUTE_GOODS * 0.5) {
    pushMessage(s, `Only ${Math.round(got)} goods reach the wyrm. It counts them, and is not satisfied.`, 'warn', true);
    return refuse(s);
  }
  s.wyrm.tributes++;
  s.wyrm.tributeDay = nextSeasonDay(s);
  s.wyrm.starved = 0;
  s.stats.wyrmTributes++;
  pushMessage(s, `${Math.round(got)} goods are laid at the wyrm's node at (${n.x},${n.y}). Every market shelf in the city is thinner for it.`, 'info', true, { x: n.x, y: n.y });
  return `${Math.round(got)} goods laid at the node.`;
}

export function nextSeasonDay(s: GameState): number {
  return (Math.floor(s.day / DAYS_PER_SEASON) + 1) * DAYS_PER_SEASON + 1;
}

/** Refuse tribute: the wyrm flies over the city, burning, then sleeps again. The third refusal in a row, it flies for the
 *  Founding Stake (iteration 70): the warnings come at the first and the second. */
export function refuse(s: GameState): string {
  const w = s.wyrm;
  w.refused++;
  w.tributes++; // the price still rises
  w.starved++;
  s.stats.wyrmStarvedMost = Math.max(s.stats.wyrmStarvedMost, w.starved);
  if (w.starved >= WYRM_STARVE_LIMIT) {
    w.razing = true;
    startFlyover(s, true, true);
    return w.razing ? 'The wyrm rises, and it does not circle. It flies straight for the Founding Stake.' : 'The wyrm rises for the Stake, and is met.';
  }
  startFlyover(s, true);
  if (w.starved === WYRM_STARVE_LIMIT - 1) pushMessage(s, `The wyrm has been refused ${w.starved} times running. Its keeper says it is no longer hungry for coin: refuse it once more and it comes for the Founding Stake itself, and the charter ends with it.`, 'bad', true);
  else pushMessage(s, 'The wyrm will remember the refusal. Its keeper says a second would be unwise, and a third would be the last.', 'warn', true);
  return 'The wyrm rises. Ring the Veshari bells.';
}

/** The razing flight reaches the Founding Stake: the Stake burns, and the valley belongs to the wyrm. */
export function razeStake(s: GameState): void {
  const stake = s.buildings.find((b) => b && b.kind === 'stake');
  const at = stake ? { x: stake.x, y: stake.y } : s.founding;
  if (stake) { stake.state = 'ruin'; stake.stateDays = 0; markDirtyAround(s, stake.x, stake.y); }
  effects.push({ x: at.x, y: at.y, kind: 'roar', tick: s.tick });
  s.wyrm.razing = false;
  if (s.gameOver) return;
  s.gameOver = `The valley belongs to the wyrm. Refused ${s.wyrm.starved} times running, it came down on the Founding Stake on day ${s.day} and burned the Charter on its door. Nobody nails up another.`;
  s.lostTo = 'wyrm';
  pushMessage(s, s.gameOver, 'bad', true, at);
}

/** Spawn the flying wyrm agent. Hostile flyovers ignite buildings along the way. */
export function startFlyover(s: GameState, hostile: boolean, raze = false): void {
  const n = wyrmNode(s);
  if (!n) return;
  const flying = s.agents.find((a) => a.kind === AgentKind.Creature && a.species === 'wyrm');
  if (flying) { if (raze) { flying.load = 2; flying.phase = 1; flying.path = []; } return; } // a refusal while it is aloft turns the flight to the Stake
  s.agents.push({
    id: s.nextAgentId++, kind: AgentKind.Creature, x: n.x + 0.5, y: n.y + 0.5, path: [], pathIdx: 0, speed: 5, homeId: -1, targetId: -1,
    timer: 0, variant: 0, dir: 0, load: raze ? 2 : hostile ? 1 : 0, species: 'wyrm', anchorId: -1, ax: n.x + 0.5, ay: n.y + 0.5, alt: 0, phase: 1,
  });
  s.wyrm.flyover = Math.max(1, s.tick);
  s.wyrm.fires = 0;
  effects.push({ x: n.x, y: n.y, kind: 'roar', tick: s.tick });
  redraw(s);
  s.stats.wyrmFlyovers++;
  const gw = hostile ? greatWyrm(s) : null;
  if (gw) sendDuelist(s); // the great wyrm's own agent flies to meet it (iteration 73)
  if (gw && raze) {
    // a great wyrm of the city's own meets the razing flight over the Stake: it turns, and the count starts again (iteration 70)
    const a = s.agents[s.agents.length - 1];
    a.load = 1;
    s.wyrm.razing = false;
    s.wyrm.starved = 0;
    s.stats.wyrmDuels++;
    pushMessage(s, `The Vein-Wyrm flies for the Founding Stake, and ${gw.name} rises from its cradle to meet it above the Charter. The old one turns aside; the Stake stands. It will be hungry again.`, 'milestone', true, { x: n.x, y: n.y });
    return;
  }
  if (gw) { s.stats.wyrmDuels++; pushMessage(s, `${gw.name} rises from its cradle to meet the Vein-Wyrm over ${s.cityName}. Two shadows cross the valley; the old one turns first. Half the roofs it meant to burn are spared.`, 'milestone', true, { x: n.x, y: n.y }); return; }
  if (hostile) illTiding(s);
  pushMessage(s, hostile ? `The wyrm takes wing over ${s.cityName}. Its shadow is the size of a district.` : `The bound wyrm circles ${s.cityName} once, as it does each season. Glimmoths scatter like sparks.`, hostile ? 'bad' : 'info', true, { x: n.x, y: n.y });
}

/** The great wyrm's agent (a wyvern-stage flyer with its dragon's id) takes the duel: phase 4, chasing the Vein-Wyrm's agent (iteration 73). */
export function sendDuelist(s: GameState): boolean {
  const d = s.dragons.find((x) => x.stage >= 4 && x.voyage === undefined);
  if (!d) return false;
  const a = s.agents.find((o) => o.kind === AgentKind.Creature && (o.species === 'wyvern' || o.species === 'drake') && o.dragonId === d.id);
  if (!a) return false;
  a.phase = 4;
  a.load = 0;
  a.path = [];
  a.timer = 0;
  a.targetId = -1;
  return true;
}

/** Called by the creature tick when the flying wyrm lands back on its node. */
export function endFlyover(s: GameState, hostile: boolean): void {
  s.wyrm.flyover = 0;
  redraw(s);
  if (hostile) {
    s.wyrm.state = 'sleeping';
    s.wyrm.waking = greatWyrm(s) ? 20 : 50;
    s.wyrm.tributeDay = -1;
    redraw(s);
    pushMessage(s, `The wyrm settles back around its node and sleeps. ${s.wyrm.fires ? `${s.wyrm.fires} buildings burn in its wake.` : 'Nothing burned; the Veshari were quick.'} Spires near it will wake it again.`, 'warn', true);
  }
}

/** Bind the wyrm at the Wyrm-Court. */
export function bind(s: GameState): string {
  const n = wyrmNode(s)!;
  s.wyrm.state = 'bound';
  s.wyrm.bound = s.day;
  s.wyrm.unfed = 0;
  s.wyrm.sulking = 0;
  s.wyrm.fedDays = 0;
  s.wyrm.tributeDay = -1;
  s.wyrm.starved = 0;
  s.wyrm.razing = false;
  redraw(s);
  pushMessage(s, `The Wyrm-Singer's song ends at dawn and the wyrm lowers its head to the Court. ${s.cityName} has a guardian. Its lair at (${n.x},${n.y}) burns back the Gloam for 30 tiles.`, 'milestone', true, { x: n.x, y: n.y });
  return 'The wyrm is bound.';
}

export function hasCourt(s: GameState): boolean {
  return s.buildings.some((b) => b && b.kind === 'wyrmcourt' && b.state === 'ok' && b.lit);
}

/** Daily wyrm step: waking, feeding, sulking, death, seasonal flyover, vein eggs. */
export function dailyWyrm(s: GameState): void {
  const w = s.wyrm;
  const n = wyrmNode(s);
  if (!n || w.state === 'none' || w.state === 'dead') return;
  if (w.state === 'sleeping') {
    const sp = spiresAtWyrm(s);
    if (sp > 0) {
      const before = w.waking;
      w.waking = Math.min(100, w.waking + Math.min(6, sp * WYRM_WAKE_PER_SPIRE));
      if (before < 50 && w.waking >= 50) pushMessage(s, `The scales around the node at (${n.x},${n.y}) shift in their sleep. The spires there are drinking from something that dreams.`, 'warn', true, { x: n.x, y: n.y });
      if (before < 80 && w.waking >= 80) pushMessage(s, `An eye opens under the ridged stone at (${n.x},${n.y}) and closes again. Bulldoze the spires there, or prepare a tribute.`, 'warn', true, { x: n.x, y: n.y });
      if (w.waking >= 100) wake(s, 'The spires have drunk too deep.');
    } else if (w.waking > 0 && w.waking < 100) w.waking = Math.max(0, w.waking - 0.5);
    return;
  }
  if (w.state === 'awake') {
    // tribute is asked by the event system on tributeDay; nothing else while awake
    return;
  }
  if (w.state === 'bound') {
    // the Court after the binding: lit, it halves the appetite; courted once and then dark two days, the wyrm sulks until it is lit again
    if (hasCourt(s)) {
      if (!w.courted) { w.courted = true; pushMessage(s, `The Wyrm-Court sings over the lair: the bound wyrm eats ${WYRM_EATS / 2} goods a day while the Court is lit, and sulks if it goes dark.`, 'good', true, { x: n.x, y: n.y }); }
      if (w.courtDark > 0) {
        w.courtDark = 0;
        if (w.sulking > 0 && w.unfed < WYRM_SULK_AFTER) { w.sulking = 0; redraw(s); pushMessage(s, 'The Wyrm-Court is lit again and the wyrm lifts its head. Its lair wards the Gloam once more.', 'good', true, { x: n.x, y: n.y }); }
      }
    } else if (w.courted) {
      w.courtDark++;
      if (w.courtDark === 1) pushMessage(s, `The Wyrm-Court is dark. The wyrm watches the dead stones; ${COURT_GRACE} days of this and it sulks.`, 'warn', true);
      if (w.courtDark >= COURT_GRACE && w.sulking === 0) { w.sulking = 1; redraw(s); pushMessage(s, `The Court has been dark ${w.courtDark} days: the wyrm sulks and wards nothing until it is lit again.`, 'bad', true, { x: n.x, y: n.y }); }
    }
    const courtSulk = w.courted && w.courtDark >= COURT_GRACE;
    const need = wyrmEats(s);
    const eaten = takeGoods(s, need);
    if (eaten >= need * 0.75) {
      w.unfed = 0;
      if (w.sulking > 0 && !courtSulk) {
        w.sulking = 0;
        redraw(s);
        pushMessage(s, 'Fed at last, the wyrm stops sulking. The Gloam feels it and draws back.', 'good', true);
      }
      w.fedDays++;
    } else {
      w.unfed++;
      w.fedDays = 0;
      if (w.unfed === WYRM_SULK_AFTER && w.sulking === 0) {
        w.sulking = 1;
        redraw(s);
        pushMessage(s, `Unfed for ${WYRM_SULK_AFTER} days, the wyrm sulks: it will not ward the Gloam until the markets feed it ${need} goods a day. It wants leystone.`, 'bad', true, { x: n.x, y: n.y });
      } else if (w.sulking > 0) {
        w.sulking++;
        if (w.sulking >= WYRM_DIES_AFTER) {
          w.state = 'dead';
          w.died = s.day;
          redraw(s);
          pushMessage(s, `The bound wyrm dies of hunger at (${n.x},${n.y}). Its bones settle around the node: the Grimmen say no dead will rise within sight of them.`, 'bad', true, { x: n.x, y: n.y });
          return;
        }
      }
    }
    // seasonal flyover on the first day of each season
    if (s.day % DAYS_PER_SEASON === 1 && w.sulking === 0 && s.day - w.bound > 3) startFlyover(s, false);
    return;
  }
}

/** Deathcare from the wyrm's bones (per day), for dailyDeath. */
export function wyrmBoneQuiet(s: GameState): number {
  // the bones quiet the dead for a season's worth of days, then the ley forgets them
  return s.wyrm.state === 'dead' ? (s.day - s.wyrm.died <= 120 ? 80 : 20) : 0;
}

/** Ward strength at a tile from the bound wyrm's lair (0..1). */
export function lairWard(s: GameState, x: number, y: number): number {
  if (!wyrmGuards(s)) return 0;
  const n = wyrmNode(s)!;
  const d = Math.hypot(n.x - x, n.y - y);
  if (d > WYRM_LAIR_RADIUS) return 0;
  return (1 - (d / WYRM_LAIR_RADIUS) * 0.6) * (edictOn(s, 'wyrmpeace') ? 0.5 : 1);
}

export function describeWyrm(s: GameState): string {
  const w = s.wyrm;
  switch (w.state) {
    case 'none': return 'No wyrm sleeps on this map.';
    case 'sleeping': return w.waking <= 0 ? 'Asleep, coiled around a distant node. Spires near it would wake it.' : `Stirring: ${Math.round(w.waking)}% awake. ${spiresAtWyrm(s)} spires drink from its node.`;
    case 'awake': return `Awake and unbound. It wants tribute each season (${wyrmTribute(s)} crowns or ${WYRM_TRIBUTE_GOODS} goods); refused ${w.refused} times.`;
    case 'bound': return w.sulking > 0 ? (w.courted && w.courtDark >= COURT_GRACE ? `Bound but sulking: the Wyrm-Court has been dark ${w.courtDark} days. No ward from its lair until the Court is lit again.` : `Bound but sulking (${w.sulking} days): no ward from its lair until fed ${wyrmEats(s)} goods a day.`) : `Bound. Guards ${WYRM_LAIR_RADIUS} tiles around its lair, eats ${wyrmEats(s)} goods a day${hasCourt(s) ? ' (halved by the lit Wyrm-Court)' : w.courted ? ` (the Court is dark: the full ${WYRM_EATS})` : ''}; fed ${w.fedDays} days running.`;
    case 'dead': return 'Dead. Its bones quiet the dead for miles.';
  }
}

export { idx };
