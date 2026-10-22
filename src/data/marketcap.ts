import { BALANCE_SHARES, COVER_SHARES, type CompanyFacts } from './live/sec';
import { DAY_MS } from './calendar';

/**
 * A company's market value over time: each day's closing price times the shares outstanding that day, the count on
 * the cover of its latest SEC filing then, in today's shares (later stock splits applied, as the price history is
 * split adjusted). Without filings (a company outside the SEC), today's share count is held.
 */

export interface ShareCount {
  /** The date the count is as of (ISO). */
  end: string;
  val: number;
}

export interface SplitEvent {
  /** Day number (days since 1970-01-01, UTC). */
  day: number;
  numerator: number;
  denominator: number;
}

export interface CapPoint {
  t: number;
  cap: number;
}

export interface CapSeries {
  points: CapPoint[];
  /**
   * "filings": each day's shares are the count on the latest SEC cover then; "scaled": today's share count moved back
   * with the covers (a company whose covers count one share class only); "held": today's count throughout.
   */
  basis: 'filings' | 'scaled' | 'held';
  /** The counts used, oldest first, in today's shares. */
  counts: ShareCount[];
}

const dayOf = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/**
 * Share counts by date (the latest filing's count for each date), oldest first: those on the filings' covers, or,
 * for a company that gives its cover count by share class only, those on its balance sheets.
 */
export function coverShareCounts(cf: Pick<CompanyFacts, 'facts'> | null | undefined): ShareCount[] {
  const read = (rows: { end: string; val: number; filed: string }[]) => {
    const by = new Map<string, { val: number; filed: string }>();
    for (const r of rows) {
      if (!(r.val > 0)) continue;
      const have = by.get(r.end);
      if (!have || r.filed > have.filed) by.set(r.end, { val: r.val, filed: r.filed });
    }
    return [...by.entries()].map(([end, v]) => ({ end, val: v.val })).sort((a, b) => a.end.localeCompare(b.end));
  };
  const cover = read(cf?.facts[COVER_SHARES]?.shares ?? []);
  const balance = read(cf?.facts[BALANCE_SHARES]?.shares ?? []);
  // The covers, unless they stopped long before the balance sheets did (a company that went on to give its cover
  // count by share class only).
  const last = (xs: ShareCount[]) => (xs.length ? dayOf(xs[xs.length - 1].end) : -Infinity);
  return cover.length && last(cover) >= last(balance) - 400 ? cover : balance;
}

/** How many of today's shares one share as of `day` has become through the splits after it. */
export function splitFactorAfter(splits: SplitEvent[], day: number): number {
  let f = 1;
  for (const s of splits) if (s.day > day && s.numerator > 0 && s.denominator > 0) f *= s.numerator / s.denominator;
  return f;
}

/**
 * The counts in today's shares, without a count that jumps away from both neighbours by more than half and back (a
 * cover that gave the count in thousands, or one share class only).
 */
export function adjustedCounts(counts: ShareCount[], splits: SplitEvent[]): ShareCount[] {
  const adj = counts.map((c) => ({ end: c.end, val: c.val * splitFactorAfter(splits, dayOf(c.end)) }));
  const off = (a: number, b: number) => Math.abs(a / b - 1) > 0.5;
  return adj.filter((c, i) => {
    const prev = adj[i - 1];
    const next = adj[i + 1];
    return !(prev && next && off(c.val, prev.val) && off(c.val, next.val) && !off(prev.val, next.val));
  });
}

/**
 * Market value for each daily close. `sharesNow` is today's share count, the one behind the quote's market value;
 * `scale` turns a quoted price into the currency unit (0.01 for a price in pence). With cover counts that agree with
 * it (within 5%), each day takes the count on the latest cover then; covers far from it count part of the shares (one
 * class of several), so they only move today's count back in time. Days before the first cover are left out.
 */
export function capSeries(bars: { t: ArrayLike<number>; c: ArrayLike<number>; length: number }, sharesNow: number, counts: ShareCount[], splits: SplitEvent[], scale = 1): CapSeries {
  // Counts that stopped more than two years before the prices end say nothing of the shares since: none are used.
  const lastBar = bars.length ? Math.floor(bars.t[bars.length - 1] / DAY_MS) : 0;
  const fresh = counts.length > 0 && lastBar - dayOf(counts[counts.length - 1].end) <= 730;
  const adj = fresh ? adjustedCounts(counts, splits) : [];
  const latest = adj[adj.length - 1];
  const points: CapPoint[] = [];
  const direct = !!latest && sharesNow > 0 && Math.abs(latest.val / sharesNow - 1) <= 0.05;
  const basis: CapSeries['basis'] = !latest ? 'held' : direct ? 'filings' : 'scaled';
  if (!(sharesNow > 0)) return { points, basis, counts: adj };
  let k = -1;
  for (let i = 0; i < bars.length; i++) {
    const t = bars.t[i];
    const c = bars.c[i];
    if (!(c > 0)) continue;
    let shares = sharesNow;
    if (latest) {
      const day = Math.floor(t / DAY_MS);
      while (k + 1 < adj.length && dayOf(adj[k + 1].end) <= day) k++;
      if (k < 0) continue;
      shares = direct ? adj[k].val : sharesNow * (adj[k].val / latest.val);
    }
    points.push({ t, cap: c * scale * shares });
  }
  return { points, basis, counts: adj };
}

export interface CapYear {
  year: number;
  /** The last close of the year (or the latest, for the current year). */
  cap: number;
  t: number;
  /** Against the year before's last close, percent. */
  change: number;
}

/** The market value at the end of each calendar year, newest first, with the change on the year before. */
export function capByYear(points: CapPoint[]): CapYear[] {
  const last = new Map<number, CapPoint>();
  for (const p of points) last.set(new Date(p.t).getUTCFullYear(), p);
  const years = [...last.keys()].sort((a, b) => a - b);
  return years
    .map((year, i) => {
      const p = last.get(year)!;
      const prev = i > 0 ? last.get(years[i - 1]) : undefined;
      return { year, cap: p.cap, t: p.t, change: prev && years[i - 1] === year - 1 ? (p.cap / prev.cap - 1) * 100 : NaN };
    })
    .reverse();
}
