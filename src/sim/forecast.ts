/** The Astral Observatory's forecast: what the ley says is coming in the next five days. */
import { DAYS_PER_SEASON, SEASON_NAMES, type GameState } from './types';
import { seasonOf } from './world';
import { spiresAtWyrm, WYRM_WAKE_PER_SPIRE, WYRM_EATS, WYRM_SULK_AFTER } from './wyrm';
import { pressureWord } from './weave';

export const FORECAST_DAYS = 5;

export interface ForecastLine { text: string; kind: 'info' | 'warn' | 'bad' | 'good' }

export function hasObservatory(s: GameState): boolean {
  return s.buildings.some((b) => b && b.kind === 'observatory' && b.state === 'ok' && b.lit);
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
    out.push({ text: d <= 0 ? 'A wild surge breaks loose today.' : `A wild surge in ${d} day${d === 1 ? '' : 's'} unless mana demand falls below the flow.`, kind: 'bad' });
  } else if (s.manaDemand > s.manaSupply * 0.95) out.push({ text: 'Mana demand is at the edge of the flow; a brownout is one building away.', kind: 'warn' });
  if (s.stats.gloamTiles > 0 && s.day >= 6) {
    const hush = season === 3;
    out.push({ text: hush ? 'Hound packs will hunt every night this Hush.' : 'Hound packs likely at the grey edge on some nights this week.', kind: hush ? 'warn' : 'info' });
  }
  // calendar festivals within reach (Thaw-day 2 of Thaw, Remembrance 15 of Ember, vigil 1 of Hush)
  const festivals: [number, number, string][] = [[0, 2, 'Thaw-day'], [2, 15, 'the Remembrance'], [3, 1, 'the Hush vigil']];
  for (const [fs, fd, name] of festivals) {
    const fday = fs * DAYS_PER_SEASON + fd;
    const year = Math.floor(s.day / (DAYS_PER_SEASON * 4)) * DAYS_PER_SEASON * 4;
    for (const base of [year, year + DAYS_PER_SEASON * 4]) {
      const at = base + fday;
      const dd = at - s.day;
      if (dd > 0 && dd <= FORECAST_DAYS && at >= 30) out.push({ text: `${name[0].toUpperCase() + name.slice(1)} in ${dd} day${dd === 1 ? '' : 's'}.`, kind: 'info' });
    }
  }
  if (dayOfSeason < 15 && 15 - dayOfSeason <= FORECAST_DAYS && s.buildings.some((b) => b && b.kind === 'ring') && s.dragons.some((d) => d.role === 'champion')) out.push({ text: `A bout in the Wyrm-Ring in ${15 - dayOfSeason} day${15 - dayOfSeason === 1 ? '' : 's'}.`, kind: 'info' });
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
    out.push({ text: `The guardian has gone ${w.unfed} day${w.unfed === 1 ? '' : 's'} without its ${WYRM_EATS} goods; it sulks after ${WYRM_SULK_AFTER}.`, kind: w.unfed >= WYRM_SULK_AFTER - 3 ? 'bad' : 'warn' });
  }
  out.push({ text: `The Gloam is ${pressureWord(s.gloamPressure)}${s.gloamPressure >= 0.45 ? ': quiet the dead and spread faith coverage to ease it' : ''}.`, kind: s.gloamPressure >= 0.65 ? 'bad' : s.gloamPressure >= 0.45 ? 'warn' : 'info' });
  if (!out.length) out.push({ text: 'Clear skies in the ley. Nothing stirs this week.', kind: 'good' });
  return out;
}
