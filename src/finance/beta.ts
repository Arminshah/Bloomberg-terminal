import { DAY_MS, dayNum } from '../data/calendar';
import type { Region } from '../data/types';

/** Return frequency for a beta regression: daily, weekly (weeks ending Friday) or monthly. */
export type BetaFrequency = 'D' | 'W' | 'M';

export const FREQUENCY_LABEL: Record<BetaFrequency, string> = { D: 'Daily', W: 'Weekly', M: 'Monthly' };

/** Bloomberg's adjusted beta: 0.67 × raw beta + 0.33 × 1.0, which pulls the estimate towards the market's beta of 1. */
export function adjustedBeta(raw: number): number {
  return 0.67 * raw + 0.33;
}

/**
 * Key of the calendar period containing a UTC day number. Weeks run Saturday to Friday, so each week ends on a
 * Friday and a weekend bar (a market that trades every day) belongs to the week ending the next Friday.
 * Day 2 (3 January 1970) was a Saturday.
 */
export function periodKey(day: number, freq: BetaFrequency): number {
  if (freq === 'W') return Math.floor((day - 2) / 7);
  if (freq === 'M') {
    const d = new Date(day * DAY_MS);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  }
  return day;
}

export interface PeriodClose {
  key: number;
  /** Time of the period's last available close (the session it came from). */
  t: number;
  c: number;
}

/**
 * The last available close of each calendar period from daily bars with `from <= t <= to`. A week whose Friday is a
 * holiday ends on that week's last session; a month ends on its last session. Unusable closes (not finite, or not
 * positive for a price) are skipped, so the period keeps its last usable close.
 */
export function periodCloses(
  bars: { t: ArrayLike<number>; c: ArrayLike<number>; length: number },
  freq: BetaFrequency, from: number, to: number, isYield = false,
): PeriodClose[] {
  const out: PeriodClose[] = [];
  for (let i = 0; i < bars.length; i++) {
    const t = bars.t[i];
    const c = bars.c[i];
    if (t < from || t > to || !Number.isFinite(c) || (!isYield && c <= 0)) continue;
    const key = periodKey(dayNum(t), freq);
    const last = out[out.length - 1];
    if (last && last.key === key) {
      last.t = t;
      last.c = c;
    } else if (!last || key > last.key) out.push({ key, t, c });
  }
  return out;
}

export interface PairedReturns {
  /** Period-end time of the security's close that ends each return. */
  dates: number[];
  /** Benchmark returns (x of the regression). */
  x: number[];
  /** Security returns (y of the regression). */
  y: number[];
}

/**
 * Returns of benchmark and security aligned by calendar period: only periods in which both have a close count, and
 * each return runs from one such period to the next, so both sides always cover the same interval. Prices give
 * simple returns, yields give changes.
 */
export function pairedReturns(bench: PeriodClose[], sec: PeriodClose[], benchYield = false, secYield = false): PairedReturns {
  const byKey = new Map(bench.map((p) => [p.key, p]));
  const out: PairedReturns = { dates: [], x: [], y: [] };
  let prev: { b: PeriodClose; s: PeriodClose } | undefined;
  for (const s of sec) {
    const b = byKey.get(s.key);
    if (!b) continue;
    if (prev) {
      out.dates.push(s.t);
      out.x.push(benchYield ? b.c - prev.b.c : b.c / prev.b.c - 1);
      out.y.push(secYield ? s.c - prev.s.c : s.c / prev.s.c - 1);
    }
    prev = { b, s };
  }
  return out;
}

/** Start of a lookback of `months` calendar months ending at `to` (UTC ms), keeping the day of month. */
export function lookbackStart(to: number, months: number): number {
  const d = new Date(to);
  const start = new Date(0);
  start.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth() - months, 1);
  // Clamp 31 March back six months to 30 September, not 1 October.
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(d.getUTCDate(), last));
  return start.getTime();
}

/** Local benchmark index by country of the security, as engine ids. */
export const COUNTRY_BENCHMARK: Record<string, string> = {
  US: 'SPX Index', BE: 'BEL20 Index', DE: 'DAX Index', FR: 'CAC Index', NL: 'AEX Index', GB: 'UKX Index',
  CH: 'SMI Index', ES: 'IBEX Index', IT: 'FTSEMIB Index', JP: 'NKY Index', HK: 'HSI Index',
};

/** Regional fallback for other countries (the rule before country benchmarks). */
export const REGION_BENCHMARK: Record<Region, string> = { Americas: 'SPX Index', EMEA: 'SXXP Index', APAC: 'NKY Index' };

/**
 * Default relative index for BETA: the country's benchmark, else the region's, else the S&P 500, skipping any the
 * engine does not have (BEL20 may be missing, falling back to the STOXX Europe 600) and the security itself (the S&P
 * 500 then regresses on the Dow, as before).
 */
export function defaultBenchmark(sec: { id: string; country: string; region: Region }, has: (id: string) => boolean): string {
  const candidates = [COUNTRY_BENCHMARK[sec.country], REGION_BENCHMARK[sec.region], 'SPX Index', 'INDU Index'];
  return candidates.find((id) => id && id !== sec.id && has(id)) ?? 'SPX Index';
}
