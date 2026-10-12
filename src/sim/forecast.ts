/** The Astral Observatory's forecast: what the ley says is coming in the next five days. */
import { GALE_DAYS, galeIn, galeToday } from './gales';
import { boutOdds, nextBoutDay, ringChampion } from './wyrmcraft';
import { wyrmEats } from './wyrm';
import { DAYS_PER_SEASON, SEASON_NAMES, type GameState } from './types';
import { seasonOf } from './world';
import { fontsRunHot } from './hazards';
import { CALENDAR, RIOT_DAYS } from './events';
import { spiresAtWyrm, WYRM_WAKE_PER_SPIRE, WYRM_SULK_AFTER } from './wyrm';
import { WEATHER_WORD, blizzard, hasMarvel, pressureWord, weatherAt } from './weave';
import { factionOf } from '../data/factions';

export const FORECAST_DAYS = 5;

export interface ForecastLine { text: string; kind: 'info' | 'warn' | 'bad' | 'good' }

export function hasObservatory(s: GameState): boolean {
  return s.buildings.some((b) => b && (b.kind === 'observatory' || b.kind === 'chartroom') && b.state === 'ok' && b.lit);
}

/** Pure: lines about the next FORECAST_DAYS days. Empty without a lit Observatory. */
export function forecast(s: GameState): ForecastLine[] {
  if (!hasObservatory(s)) return [];
  const out: ForecastLine[] = [];
  const dayOfSeason = s.day % DAYS_PER_SEASON;
  const toSeason = DAYS_PER_SEASON - dayOfSeason;
  const season = seasonOf(s);
  if (toSeason <= FORECAST_DAYS) {
    const next = (season + 1) % 4;
    out.push({ text: `${SEASON_NAMES[next]} begins in ${toSeason} day${toSeason === 1 ? '' : 's'}.${next === 3 ? ' Long nights: hearths drink more mana; the Gloam and its hounds grow bold.' : ''}`, kind: next === 3 ? 'warn' : 'info' });
  }
  if (s.overdrawDays > 0) {
    const d = 5 - s.overdrawDays;
    out.push({ text: d <= 0 ? 'A wild surge breaks loose today.' : `A wild surge in ${d} day${d === 1 ? '' : 's'} unless mana demand falls below 1.25× the flow or a Nexus store holds.`, kind: 'bad' });
  } else if (s.manaDemand > s.manaSupply * 0.95) out.push({ text: 'Mana demand is at the edge of the flow; a brownout is one building away.', kind: 'warn' });
  if (s.unrestHigh >= 3 && s.unrestHigh < RIOT_DAYS) out.push({ text: `Unrest has stood above half for ${s.unrestHigh} days: a riot in the least-watched market in ${RIOT_DAYS - s.unrestHigh} unless it falls.`, kind: 'bad' });
  if (fontsRunHot(s)) out.push({ text: 'The Fonts run hot: past nine tenths of the flow a lit Thrum Font may flare (one chance in fifty a day each): fire at the shaft and ten days of smoke.', kind: 'warn' });
  // the weather: today's spell, and the next within reach (a pure function of the seed, so the ley reads it exactly)
  if (s.weather) { const left = s.weather.until - s.day; out.push({ text: `${WEATHER_WORD[s.weather.kind][0].toUpperCase() + WEATHER_WORD[s.weather.kind].slice(1)} today${left > 1 ? ` and for ${left - 1} more day${left === 2 ? '' : 's'}` : ''}: ${s.weather.kind === 'rain' ? 'fires sleep, the works run sweet, the smoke is washed down' : s.weather.kind === 'drought' ? 'fires catch twice as easily, the wells shrink, unwatered gardens wilt, the World Tree waits' : 'the hearths drink a tenth more, the hounds keep to their dens'}.`, kind: s.weather.kind === 'rain' ? 'good' : 'warn' }); }
  for (let k = 1; k <= FORECAST_DAYS; k++) {
    const w = weatherAt(s, s.day + k);
    if (!w || (s.weather && s.weather.kind === w.kind && s.weather.until === w.until) || (k > 1 && weatherAt(s, s.day + k - 1)?.until === w.until)) continue;
    out.push({ text: `${WEATHER_WORD[w.kind][0].toUpperCase() + WEATHER_WORD[w.kind].slice(1)} in ${k} day${k === 1 ? '' : 's'}, ${w.until - s.day - k} day${w.until - s.day - k === 1 ? '' : 's'} of it.`, kind: w.kind === 'rain' ? 'info' : 'warn' });
    break;
  }
  // the sea-gales of the Patagoi Atoll (iteration 95): a pure function of the seed, so the ley reads them exactly
  if (s.scenario === 'atoll') {
    if (galeToday(s)) out.push({ text: 'A sea-gale blows: the barges stay in port and the plain track bridges are under the surf. Cobbled bridges and any bridge within six tiles of a Quay or a Weir hold.', kind: 'warn' });
    else { const g = galeIn(s, FORECAST_DAYS); if (g !== null) out.push({ text: `A sea-gale in ${g} day${g === 1 ? '' : 's'}, for ${GALE_DAYS}: cobble the bridges you cannot do without, or raise a Quay beside them.`, kind: 'warn' }); }
  }
  // the river: the freeze or the flood from the fifth day of the Hush, the open sluice's flood from the fifth of the Thaw
  { const freezes = factionOf(s).rules.riverFreezes; const hushFive = (Math.floor(s.day / DAYS_PER_SEASON) + (season === 3 && dayOfSeason < 5 ? 0 : 4 - season)) * DAYS_PER_SEASON + 5; const d5 = hushFive - s.day; if (season === 3 && dayOfSeason < 5 && d5 > 0 && d5 <= FORECAST_DAYS || (season !== 3 && d5 > 0 && d5 <= FORECAST_DAYS)) out.push(freezes ? { text: `The river freezes in ${d5} day${d5 === 1 ? '' : 's'}: the mills slow and the barges stop.`, kind: 'warn' } : hasMarvel(s, 'greatweir') ? { text: `The Sable rises in ${d5} day${d5 === 1 ? '' : 's'}; the Great Weir holds it.`, kind: 'info' } : { text: `The Sable rises in ${d5} day${d5 === 1 ? '' : 's'}: the homes on the bank lose heart and the bank wells foul. A Great Weir would hold it.`, kind: 'warn' });
    if (season === 0 && dayOfSeason < 5 && 5 - dayOfSeason <= FORECAST_DAYS && s.buildings.some((b) => b && b.kind === 'greatweir' && b.state === 'ok' && b.sluice)) out.push({ text: `The open sluice floods the bank within 30 of the Weir in ${5 - dayOfSeason} day${5 - dayOfSeason === 1 ? '' : 's'}: close it, or take the double mana and the flooded bank.`, kind: 'warn' }); }
  if (s.stats.gloamTiles > 0 && s.day >= 6) {
    const hush = season === 3;
    out.push(blizzard(s) ? { text: 'The blizzard keeps the hounds in their dens.', kind: 'good' } : { text: hush ? 'Hound packs will hunt every night this Hush.' : 'Hound packs likely at the grey edge on some nights this week.', kind: hush ? 'warn' : 'info' });
  }
  // the calendar's festivals within reach, those the city is eligible for today (iteration 54: read from CALENDAR, the Lantern Fair included)
  for (const e of CALENDAR) {
    if (!e.when(s)) continue;
    const fday = e.season * DAYS_PER_SEASON + e.seasonDay;
    const year = Math.floor(s.day / (DAYS_PER_SEASON * 4)) * DAYS_PER_SEASON * 4;
    for (const base of [year, year + DAYS_PER_SEASON * 4]) {
      const at = base + fday;
      const dd = at - s.day;
      if (dd > 0 && dd <= FORECAST_DAYS && at >= 30) out.push({ text: `${e.title} in ${dd} day${dd === 1 ? '' : 's'}.`, kind: 'info' });
    }
  }
  if (dayOfSeason < 15 && 15 - dayOfSeason <= FORECAST_DAYS && s.buildings.some((b) => b && b.kind === 'ring') && s.dragons.some((d) => d.role === 'champion')) { const ch = ringChampion(s); out.push({ text: `A bout in the Wyrm-Ring in ${15 - dayOfSeason} day${15 - dayOfSeason === 1 ? '' : 's'}${ch ? `: ${ch.name}'s odds are ${Math.round(boutOdds(s, ch, nextBoutDay(s)).chance * 100)} %` : ''}.`, kind: 'info' }); }
  const w = s.wyrm;
  if (w.state === 'sleeping' && w.waking > 0) {
    const rate = Math.min(6, spiresAtWyrm(s) * WYRM_WAKE_PER_SPIRE);
    if (rate > 0) {
      const d = Math.ceil((100 - w.waking) / rate);
      out.push({ text: d <= FORECAST_DAYS ? `The Sleeping Wyrm wakes in ${d} day${d === 1 ? '' : 's'}.` : `The Sleeping Wyrm stirs: about ${d} days to waking at this rate.`, kind: d <= FORECAST_DAYS ? 'bad' : 'warn' });
    }
  } else if (w.state === 'awake' && w.tributeDay >= 0) {
    const d = w.tributeDay - s.day;
    if (d <= FORECAST_DAYS) out.push({ text: d <= 0 ? 'The wyrm wants its tribute today.' : `The wyrm asks its tribute in ${d} day${d === 1 ? '' : 's'}.`, kind: 'warn' });
  } else if (w.state === 'bound' && w.unfed > 0) {
    out.push({ text: `The guardian has gone ${w.unfed} day${w.unfed === 1 ? '' : 's'} without its ${wyrmEats(s)} goods; it sulks after ${WYRM_SULK_AFTER}.`, kind: w.unfed >= WYRM_SULK_AFTER - 3 ? 'bad' : 'warn' });
  }
  out.push({ text: `The Gloam is ${pressureWord(s.gloamPressure)}${s.gloamPressure >= 0.45 ? ': quiet the dead and spread faith coverage to ease it' : ''}.`, kind: s.gloamPressure >= 0.65 ? 'bad' : s.gloamPressure >= 0.45 ? 'warn' : 'info' });
  if (!out.length) out.push({ text: 'Clear skies in the ley. Nothing stirs this week.', kind: 'good' });
  return out;
}
