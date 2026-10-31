import type { Series } from './series';
import type { Story } from './news';
import { COUNTRY_NAMES } from './eco';
import { mean, stdev } from '../finance/stats';
import { rsi } from '../finance/indicators';

/**
 * WB, World Bond Markets: the countries, their generic yield lines and the statistics its tabs show. The layout comes
 * from TE07 01:15 (Regional view, Bonds tab), the Quick Start guide's 2024 page (Developed view, Data Range YTD) and
 * the LUISS primer's October 2018 screenshot (Spreads tab: #SD/Day, Low, Range, High, Avg, +/-, #SD, RSI over a
 * Historical Data Range of 3 Months). The pack does not define the statistics; how this app computes each is written
 * beside it below.
 */

export interface WbCountry {
  /** ISO country code, as COUNTRY_NAMES keys it. */
  c: string;
  /** The row's number in the terminal's own list (TE07 01:15: 10 United States, 22 Germany, 28 Switzerland, 30 Japan). */
  n: number;
  /** Generic yield lines by tenor in years. */
  ids: Partial<Record<WbTenor, string>>;
  /** In the Developed view (the Quick Start guide's list has none of the emerging markets). */
  developed: boolean;
}

export type WbTenor = 2 | 5 | 10 | 30;
export const WB_TENORS: WbTenor[] = [2, 5, 10, 30];

/** The terminal's regions, numbered 1) to 3), with each country under its own ten (TE07 01:15). */
export const WB_REGIONS: { name: string; countries: WbCountry[] }[] = [
  {
    name: 'Americas',
    countries: [
      { c: 'US', n: 10, developed: true, ids: { 2: 'USGG2YR Index', 5: 'USGG5YR Index', 10: 'USGG10YR Index', 30: 'USGG30YR Index' } },
      { c: 'CA', n: 11, developed: true, ids: { 2: 'GCAN2YR Index', 5: 'GCAN5YR Index', 10: 'GCAN10YR Index', 30: 'GCAN30YR Index' } },
      { c: 'BR', n: 12, developed: false, ids: { 10: 'GEBR10Y Index' } },
      { c: 'MX', n: 14, developed: false, ids: { 10: 'GMXN10YR Index' } },
    ],
  },
  {
    name: 'EMEA',
    countries: [
      { c: 'GB', n: 20, developed: true, ids: { 2: 'GUKG2 Index', 5: 'GUKG5 Index', 10: 'GUKG10 Index', 30: 'GUKG30 Index' } },
      { c: 'FR', n: 21, developed: true, ids: { 10: 'GFRN10 Index' } },
      { c: 'DE', n: 22, developed: true, ids: { 2: 'GDBR2 Index', 5: 'GDBR5 Index', 10: 'GDBR10 Index', 30: 'GDBR30 Index' } },
      { c: 'IT', n: 23, developed: true, ids: { 10: 'GBTPGR10 Index' } },
      { c: 'ES', n: 24, developed: true, ids: { 10: 'GSPG10YR Index' } },
      { c: 'CH', n: 28, developed: true, ids: { 10: 'GSWISS10 Index' } },
    ],
  },
  {
    name: 'Asia/Pacific',
    countries: [
      { c: 'JP', n: 30, developed: true, ids: { 2: 'GJGB2 Index', 5: 'GJGB5 Index', 10: 'GJGB10 Index', 30: 'GJGB30 Index' } },
      { c: 'AU', n: 31, developed: true, ids: { 2: 'GACGB2 Index', 5: 'GACGB5 Index', 10: 'GACGB10 Index' } },
      { c: 'CN', n: 34, developed: false, ids: { 10: 'GCNY10YR Index' } },
      // Not in the frame's list, which stops at 34) China: the next free number.
      { c: 'IN', n: 35, developed: false, ids: { 10: 'GIND10YR Index' } },
    ],
  },
];

export const WB_COUNTRIES: WbCountry[] = WB_REGIONS.flatMap((r) => r.countries);

export type WbRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y';

/** The Data Range choices, with the short name the change column takes ("YTD Chg", Quick Start 2024). */
export const WB_RANGES: { key: WbRange; label: string; short: string }[] = [
  { key: '1M', label: '1 Month', short: '1M' },
  { key: '3M', label: '3 Months', short: '3M' },
  { key: '6M', label: '6 Months', short: '6M' },
  { key: 'YTD', label: 'YTD', short: 'YTD' },
  { key: '1Y', label: '1 Year', short: '1Y' },
  { key: '2Y', label: '2 Years', short: '2Y' },
  { key: '5Y', label: '5 Years', short: '5Y' },
];

/** The Curves tab's choices: short and long tenor. No frame shows this tab; it follows the Spreads tab's layout. */
export const WB_CURVES: { key: string; label: string; short: WbTenor; long: WbTenor }[] = [
  { key: '2-10', label: '2Y-10Y', short: 2, long: 10 },
  { key: '2-5', label: '2Y-5Y', short: 2, long: 5 },
  { key: '5-30', label: '5Y-30Y', short: 5, long: 30 },
  { key: '10-30', label: '10Y-30Y', short: 10, long: 30 },
];

/** A daily line: session times (UTC ms) and values, oldest first. */
export interface DailyLine {
  t: number[];
  v: number[];
}

/** A series' daily closes as a line, finite values only. */
export function lineOf(s: Pick<Series, 't' | 'c' | 'length'>): DailyLine {
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (!Number.isFinite(s.c[i])) continue;
    t.push(s.t[i]);
    v.push(s.c[i]);
  }
  return { t, v };
}

/** Index of the last time at or before `time`, or -1. */
function atOrBefore(t: number[], time: number): number {
  let lo = 0;
  let hi = t.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * (a − b) × scale on each of a's days, with b's value that day or its last one before (b's market may be shut that day,
 * or its source a day behind). Days before b's first value are left out. A spread in basis points between two yields
 * in percent takes scale 100.
 */
export function diffLine(a: DailyLine, b: DailyLine, scale = 100): DailyLine {
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < a.t.length; i++) {
    const j = atOrBefore(b.t, a.t[i]);
    if (j < 0) continue;
    t.push(a.t[i]);
    v.push((a.v[i] - b.v[j]) * scale);
  }
  return { t, v };
}

export interface WbStats {
  /** The latest value. */
  now: number;
  /** The value the range is measured from: the last one before it starts (the close before the year for YTD). */
  base: number;
  /** now − base. */
  chg: number;
  /** The latest day's change: the latest value less the one before. */
  dayChg: number;
  /** Lowest, highest and mean value in the range, the latest included. */
  low: number;
  high: number;
  avg: number;
  /** now − avg. */
  diff: number;
  /** #SD: (now − avg) ÷ the standard deviation of the range's values. */
  sd: number;
  /** #SD/Day: the latest day's change ÷ the standard deviation of the range's daily changes. */
  sdDay: number;
  /** Wilder's 14-day RSI of the whole line at its latest value. */
  rsi: number;
  /** The range's values, for the sparkline. */
  values: number[];
}

/**
 * WB's statistics of a line over the range that starts at `start` (UTC ms). A range holding one value is measured with
 * the value before it as well; a line with no value in the range (one whose source has not caught up) has none.
 */
export function wbStats(l: DailyLine, start: number): WbStats | null {
  const n = l.v.length;
  if (n < 2) return null;
  let from = atOrBefore(l.t, start) + 1;
  if (from >= n) return null;
  if (from === n - 1) from = n - 2;
  const values = l.v.slice(from);
  const before = from > 0 ? from - 1 : from;
  const now = l.v[n - 1];
  const base = l.v[before];
  let low = Infinity;
  let high = -Infinity;
  for (const x of values) {
    if (x < low) low = x;
    if (x > high) high = x;
  }
  const avg = mean(values);
  const sdLevel = stdev(values);
  const changes: number[] = [];
  for (let i = Math.max(1, from); i < n; i++) changes.push(l.v[i] - l.v[i - 1]);
  const sdChange = stdev(changes);
  const dayChg = now - l.v[n - 2];
  const r = rsi(l.v, 14);
  return {
    now,
    base,
    chg: now - base,
    dayChg,
    low,
    high,
    avg,
    diff: now - avg,
    sd: sdLevel > 0 ? (now - avg) / sdLevel : NaN,
    sdDay: sdChange > 0 ? dayChg / sdChange : NaN,
    rsi: r[n - 1],
    values,
  };
}

/**
 * A level in the range columns as the terminal writes it there, three decimals without the leading zero below one
 * (Quick Start 2024: "-.784", ".005", "1.385").
 */
export function fmtRangeLevel(v: number, dec = 3): string {
  if (!Number.isFinite(v)) return '';
  return v.toFixed(dec).replace(/^(-?)0\./, '$1.');
}

/** Days a line's latest value may lag before WB treats it as waiting for its source: past a long holiday such as Japan's Golden Week. */
export const WB_STALE_DAYS = 10;

/** The day (UTC ms) of a line's latest value when it is older than WB_STALE_DAYS before `today` (UTC ms), else null. */
export function staleSince(l: DailyLine, today: number): number | null {
  if (!l.t.length) return null;
  const last = l.t[l.t.length - 1];
  return today - last > WB_STALE_DAYS * 86_400_000 ? last : null;
}

/** Where a value sits between low and high, 0 to 1, for the Range column's Avg diamond and Now dot. */
export function rangePos(v: number, low: number, high: number): number {
  if (!Number.isFinite(v) || !(high > low)) return 0.5;
  return Math.min(1, Math.max(0, (v - low) / (high - low)));
}

/** The words a story about a country names it by, and its central bank and statistics office as the feeds call them. */
const COUNTRY_WORDS: Record<string, string[]> = {
  US: ['United States', 'U.S.', 'US ', 'Federal Reserve', 'Treasury', 'FOMC'],
  CA: ['Canada', 'Canadian', 'Bank of Canada'],
  BR: ['Brazil', 'Brazilian'],
  MX: ['Mexico', 'Mexican', 'Banxico'],
  GB: ['United Kingdom', 'Britain', 'British', 'UK ', 'Bank of England'],
  FR: ['France', 'French', 'Banque de France'],
  DE: ['Germany', 'German', 'Bundesbank'],
  IT: ['Italy', 'Italian', "Banca d'Italia"],
  ES: ['Spain', 'Spanish', 'Banco de España'],
  CH: ['Switzerland', 'Swiss', 'SNB'],
  JP: ['Japan', 'Japanese', 'Bank of Japan', 'BOJ'],
  AU: ['Australia', 'Australian', 'Reserve Bank of Australia', 'RBA'],
  CN: ['China', 'Chinese', "People's Bank of China", 'PBOC'],
  IN: ['India', 'Indian', 'Reserve Bank of India', 'RBI'],
};

/** The latest stories the app holds that name a country, newest first. */
export function countryStories(stories: Story[], c: string, max = 4): Story[] {
  const words = COUNTRY_WORDS[c] ?? [COUNTRY_NAMES[c]];
  const hit = (s: Story) => words.some((w) => s.headline.includes(w) || s.source.includes(w.trim()));
  return stories.filter(hit).sort((a, b) => b.time - a.time).slice(0, max);
}

