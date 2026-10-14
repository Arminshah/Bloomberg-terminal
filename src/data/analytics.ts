import { engine } from './market';
import { indexAtOrBefore, type Series } from './series';
import { regress, stdev } from '../finance/stats';
import { DAY_MS } from './calendar';

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
    if (vals.some((v) => !Number.isFinite(v))) continue;
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

/** Beta of `id` to `bench` from daily returns. */
export function betaTo(id: string, bench: string, bars = 252) {
  const { rets } = alignedReturns([bench, id], bars);
  return regress(rets[0], rets[1]);
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
