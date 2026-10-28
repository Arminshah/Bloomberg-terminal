import { engine } from './market';
import { indexAtOrBefore, type Series } from './series';
import { correlation, regress, stdev } from '../finance/stats';
import { DAY_MS } from './calendar';
import { IEX_PROVIDER } from './live/iex-engine';
import { adjustedBeta, defaultBenchmark, lookbackStart, pairedReturns, periodCloses } from '../finance/beta';

export type Horizon = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y';

/** Close at or before `t` (UTC). */
export function closeAt(s: Series, t: number): number {
  const i = indexAtOrBefore(s, t);
  return i >= 0 ? s.c[i] : NaN;
}

export function horizonStart(h: Horizon, now = engine.today * DAY_MS): number {
  const d = new Date(now);
  switch (h) {
    case '1D':
      return now - DAY_MS;
    case '5D':
      return now - 7 * DAY_MS;
    case '1M':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, d.getUTCDate());
    case '3M':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3, d.getUTCDate());
    case '6M':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 6, d.getUTCDate());
    case 'YTD':
      return Date.UTC(d.getUTCFullYear(), 0, 0);
    case '1Y':
      return Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate());
    case '2Y':
      return Date.UTC(d.getUTCFullYear() - 2, d.getUTCMonth(), d.getUTCDate());
    case '5Y':
      return Date.UTC(d.getUTCFullYear() - 5, d.getUTCMonth(), d.getUTCDate());
  }
}

/**
 * Percent return (or yield change in % points for rates) over a horizon. A day's
 * change counts only against a previous close confirmed for the right session:
 * while it is unconfirmed this gives NaN, so rankings, maps and averages leave
 * the line out (DayChg shows such a change greyed, with a "?").
 */
export function periodChange(id: string, h: Horizon): number {
  const def = engine.get(id);
  const q = engine.quote(id);
  if (!def || !q) return NaN;
  if (h === '1D') {
    if (q.chgCheck === 'unverified') return NaN;
    return def.quote === 'yield' ? q.chg : q.pct;
  }
  const s = engine.daily(id);
  const base = closeAt(s, horizonStart(h));
  if (!Number.isFinite(base)) return NaN;
  return def.quote === 'yield' ? q.last - base : (q.last / base - 1) * 100;
}

export interface RangeStats {
  hi52: number;
  lo52: number;
  hi52t: number;
  lo52t: number;
  avgVol30: number;
  vol30: number;
  vol90: number;
  vol260: number;
}

const statsCache = new Map<string, { key: string; v: RangeStats }>();

export function rangeStats(id: string): RangeStats {
  // The opt-in IEX snapshot source has two daily bars of its own; without earlier consolidated days
  // there is no 30/90/260-day or 52-week record.
  if (engine.quote(id)?.provider === IEX_PROVIDER && engine.daily(id).length < 3) {
    return { hi52: NaN, lo52: NaN, hi52t: NaN, lo52t: NaN, avgVol30: NaN, vol30: NaN, vol90: NaN, vol260: NaN };
  }
  const s = engine.daily(id);
  const key = `${engine.version}:${engine.today}:${s.length}`;
  const hit = statsCache.get(id);
  const def = engine.get(id);
  const q = engine.quote(id);
  if (hit && hit.key === key) {
    if (q) {
      hit.v.hi52 = Math.max(hit.v.hi52, q.high);
      hit.v.lo52 = Math.min(hit.v.lo52, q.low);
    }
    return hit.v;
  }
  const n = s.length;
  // 52 weeks by date, not a count of sessions: 252 sessions can reach back past a year.
  const cutoff = n ? s.t[n - 1] - 365 * DAY_MS : 0;
  let from = Math.max(0, n - 400); // more than a year of bars, for markets that trade every day
  while (from < n - 1 && s.t[from] <= cutoff) from++;
  let hi = -Infinity;
  let lo = Infinity;
  let hiT = 0;
  let loT = 0;
  for (let i = from; i < n; i++) {
    if (s.h[i] > hi) {
      hi = s.h[i];
      hiT = s.t[i];
    }
    if (s.l[i] < lo) {
      lo = s.l[i];
      loT = s.t[i];
    }
  }
  let v30 = 0;
  for (let i = Math.max(0, n - 31); i < n - 1; i++) v30 += s.v[i];
  v30 /= Math.min(30, n - 1);
  const rv = (bars: number) => {
    const rets: number[] = [];
    for (let i = Math.max(1, n - bars); i < n; i++) {
      rets.push(def?.quote === 'yield' ? s.c[i] - s.c[i - 1] : Math.log(s.c[i] / s.c[i - 1]));
    }
    const sd = stdev(rets) * Math.sqrt(def?.cls === 'crypto' ? 365 : 252);
    return def?.quote === 'yield' ? sd * 100 : sd * 100;
  };
  const v: RangeStats = { hi52: hi, lo52: lo, hi52t: hiT, lo52t: loT, avgVol30: v30, vol30: rv(30), vol90: rv(90), vol260: rv(260) };
  statsCache.set(id, { key, v });
  return v;
}

/** Daily returns aligned by date for a set of securities over the last `bars` days. */
export function alignedReturns(ids: string[], bars: number): { dates: number[]; rets: number[][] } {
  if (!ids.length || !Number.isInteger(bars) || bars < 1) return { dates: [], rets: ids.map(() => []) };
  const series = ids.map((id) => engine.daily(id));
  const isYield = ids.map((id) => engine.get(id)?.quote === 'yield');
  // Use the first business-calendar series as the date spine.
  const spineIdx = Math.max(0, ids.findIndex((id) => engine.get(id)?.cls !== 'crypto'));
  const spine = series[spineIdx];
  const n = spine.length;
  const dates: number[] = [];
  const levels: number[][] = ids.map(() => []);
  for (let i = Math.max(0, n - bars - 1); i < n; i++) {
    const t = spine.t[i];
    const vals = series.map((s) => closeAt(s, t + 12 * 3600_000));
    if (vals.some((v, k) => !Number.isFinite(v) || (!isYield[k] && v <= 0))) continue;
    dates.push(t);
    vals.forEach((v, k) => levels[k].push(v));
  }
  const rets = levels.map((lv, k) => {
    const out: number[] = [];
    for (let i = 1; i < lv.length; i++) out.push(isYield[k] ? lv[i] - lv[i - 1] : lv[i] / lv[i - 1] - 1);
    return out;
  });
  return { dates: dates.slice(1), rets };
}

export interface CorrelationHit {
  id: string;
  /** Pearson correlation of the two daily return series. */
  corr: number;
  /** Return intervals the two have in common. */
  n: number;
  /** The security's beta to the one searched from: the slope of its returns on that one's. */
  beta: number;
}

/**
 * How closely each candidate's daily returns moved with `target`'s over the last `bars` days, each pair aligned on its
 * own dates as CORRELATION aligns them (yield changes for rates). A candidate with less than `minShare` of the period
 * in common (and at least 20 intervals) is not ranked and is counted in `short`.
 */
export function correlationSearch(target: string, candidates: readonly string[], bars: number, minShare = 0.6): { hits: CorrelationHit[]; short: number } {
  const hits: CorrelationHit[] = [];
  let short = 0;
  const need = Math.max(20, Math.floor(bars * minShare));
  for (const id of candidates) {
    if (id === target) continue;
    const { rets } = alignedReturns([target, id], bars);
    const corr = rets[0].length >= need ? correlation(rets[0], rets[1]) : NaN;
    if (!Number.isFinite(corr)) {
      short++;
      continue;
    }
    hits.push({ id, corr, n: rets[0].length, beta: regress(rets[0], rets[1]).beta });
  }
  return { hits, short };
}

/** Beta of `id` to `bench` from daily returns. */
export function betaTo(id: string, bench: string, bars = 252) {
  const { rets } = alignedReturns([bench, id], bars);
  return regress(rets[0], rets[1]);
}

export interface DefaultBeta {
  /** Regression slope of the security's weekly returns on the benchmark's; NaN without 52 weeks in common. */
  raw: number;
  /** 0.67 × raw + 0.33. */
  adjusted: number;
  bench: string;
  /** Weekly returns in the regression. */
  weeks: number;
}

const betaCache = new Map<string, { key: string; v: DefaultBeta }>();

/**
 * Beta as BETA works it out by default, so every screen shows the same one: two years of weekly returns (weeks ending
 * Friday) against the security's local index. NaN until both price histories cover a year (52 weeks in common).
 */
export function defaultBeta(id: string): DefaultBeta {
  const none = (bench = '', weeks = 0): DefaultBeta => ({ raw: NaN, adjusted: NaN, bench, weeks });
  const def = engine.get(id);
  if (!def) return none();
  const bench = defaultBenchmark(def, (x) => !!engine.get(x));
  const b = engine.daily(bench);
  const y = engine.daily(id);
  if (bench === id || !b.length || !y.length) return none(bench);
  const key = `${bench}|${b.length}|${b.t[b.length - 1]}|${y.length}|${y.t[y.length - 1]}`;
  const hit = betaCache.get(id);
  if (hit?.key === key) return hit.v;
  const to = Math.min(b.t[b.length - 1], y.t[y.length - 1]);
  const from = lookbackStart(to, 24);
  const r = pairedReturns(periodCloses(b, 'W', from, to), periodCloses(y, 'W', from, to));
  const raw = r.x.length >= 52 ? regress(r.x, r.y).beta : NaN;
  const v = Number.isFinite(raw) ? { raw, adjusted: adjustedBeta(raw), bench, weeks: r.x.length } : none(bench, r.x.length);
  betaCache.set(id, { key, v });
  return v;
}

/** The adjusted beta of `defaultBeta`. */
export function localBeta(id: string): number {
  return defaultBeta(id).adjusted;
}

export function marketCap(id: string): number {
  const def = engine.get(id);
  const q = engine.quote(id);
  if (!def?.eq || !q) return NaN;
  const px = def.minor ? q.last / 100 : q.last;
  return px * def.eq.shares * 1e6;
}

/** Converts an amount in `ccy` to USD at current rates. */
export function toUsd(amount: number, ccy: string): number {
  return amount * engine.usdValue(ccy);
}

export function marketCapUsd(id: string): number {
  const def = engine.get(id);
  if (!def) return NaN;
  return toUsd(marketCap(id), def.ccy === 'GBp' ? 'GBP' : def.ccy);
}

/**
 * Average daily volume over the last `sessions` completed sessions of the daily history (63, about three months);
 * today's forming session is left out. NaN without that many sessions with volume (indices and currencies trade none).
 */
export function averageVolume(id: string, sessions = 63): number {
  const s = engine.daily(id);
  const today = Math.floor(engine.now() / DAY_MS) * DAY_MS;
  const vols: number[] = [];
  for (let i = s.length - 1; i >= 0 && vols.length < sessions; i--) if (s.t[i] < today) vols.push(s.v[i]);
  if (vols.length < sessions || !vols.every((v) => Number.isFinite(v) && v >= 0) || !vols.some((v) => v > 0)) return NaN;
  return vols.reduce((a, v) => a + v, 0) / vols.length;
}

/** The lowest low and highest high of the last 52 weeks of the daily history, today's session included; null without a year of it. */
export function range52w(id: string): { low: number; high: number } | null {
  const s = engine.daily(id);
  const now = engine.now();
  if (!s.length || s.t[0] > now - 358 * DAY_MS) return null;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < s.length; i++) {
    if (s.t[i] < now - 365 * DAY_MS) continue;
    if (s.l[i] > 0) low = Math.min(low, s.l[i]);
    if (s.h[i] > 0) high = Math.max(high, s.h[i]);
  }
  const q = engine.quote(id);
  if (q && q.low > 0) low = Math.min(low, q.low);
  if (q && q.high > 0) high = Math.max(high, q.high);
  return Number.isFinite(low) && Number.isFinite(high) && high >= low ? { low, high } : null;
}
