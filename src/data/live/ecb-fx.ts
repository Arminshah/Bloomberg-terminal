import { official, officialAvailable } from './official';

/**
 * The ECB's euro foreign exchange reference rates (desktop app): each business day at 14:15 CET the ECB publishes about
 * thirty currencies against the euro (data-api.ecb.europa.eu, dataset EXR, series D.{currency}.EUR.SP00.A). PORTFOLIO
 * uses them for a lot bought on a past date: the rate between the position's currency and the portfolio's base on that
 * day, crossed through the euro. No rates are published on weekends and TARGET holidays: a date then takes the last
 * day before it that has rates, and says which. A currency the ECB does not publish has no rate, never a guessed one.
 */

/** Rates by date (YYYY-MM-DD), each a map of currency to units per euro. */
export type EcbRates = Map<string, Map<string, number>>;

/** The ECB's CSV (format=csvdata): a header line, then one observation a line with CURRENCY, TIME_PERIOD and OBS_VALUE. */
export function parseEcbRates(csv: string): EcbRates | null {
  const lines = String(csv ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const head = lines[0].split(',');
  const at = (name: string) => head.indexOf(name);
  const [cc, cd, tp, ov] = [at('CURRENCY'), at('CURRENCY_DENOM'), at('TIME_PERIOD'), at('OBS_VALUE')];
  if ([cc, cd, tp, ov].some((i) => i < 0)) return null;
  const out: EcbRates = new Map();
  for (const line of lines.slice(1)) {
    // Titles further along hold quoted commas; the fields read here come before them.
    const c = line.split(',');
    const ccy = c[cc];
    const date = c[tp];
    const v = Number(c[ov]);
    if (c[cd] !== 'EUR' || !/^[A-Z]{3}$/.test(ccy) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(v > 0)) continue;
    const day = out.get(date) ?? new Map<string, number>();
    day.set(ccy, v);
    out.set(date, day);
  }
  return out;
}

/** Units per euro of a currency on a day: the euro is 1. */
const perEuro = (day: Map<string, number>, ccy: string) => (ccy === 'EUR' ? 1 : day.get(ccy));

/**
 * Units of `to` per unit of `from` on `date`, crossed through the euro, from the last day on or before it that has
 * rates; `asOf` is that day. `missing` names a currency the ECB does not publish; null when no day has rates.
 */
export function ecbCross(rates: EcbRates, date: string, from: string, to: string): { rate: number; asOf: string } | { missing: string } | null {
  const days = [...rates.keys()].filter((d) => d <= date).sort().reverse();
  if (!days.length) return null;
  const latest = rates.get(days[0])!;
  for (const ccy of [from, to]) if (perEuro(latest, ccy) === undefined) return { missing: ccy };
  for (const d of days) {
    const day = rates.get(d)!;
    const a = perEuro(day, from);
    const b = perEuro(day, to);
    if (a && b) return { rate: b / a, asOf: d };
  }
  return null;
}

/** The ECB publishes from 4 January 1999. */
export const ECB_FIRST_DAY = '1999-01-04';

/** The cross rate on a past date from the ECB, through the main process; or why there is none. */
export async function ecbRateOn(date: string, from: string, to: string, today = new Date().toISOString().slice(0, 10)): Promise<{ rate: number; asOf: string } | { error: string }> {
  if (from === to) return { rate: 1, asOf: date };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < ECB_FIRST_DAY || date > today) return { error: `The ECB's reference rates run from 4 January 1999 to today.` };
  if (!officialAvailable()) return { error: "The ECB's reference rates are read by the desktop app." };
  const rates = parseEcbRates(await official('ecbFx', date));
  if (!rates) return { error: 'The ECB did not answer; try again.' };
  const r = ecbCross(rates, date, from, to);
  if (!r) return { error: `The ECB has no reference rates in the ten days to ${date}.` };
  if ('missing' in r) return { error: `The ECB publishes no reference rate for ${r.missing}.` };
  return r;
}
