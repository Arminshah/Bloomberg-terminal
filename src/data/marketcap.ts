import { BALANCE_SHARES, COVER_SHARES, type CompanyFacts } from './live/sec';
import { DAY_MS } from './calendar';

/**
 * A company's market value over time: each day's closing price times the shares outstanding as last published: the
 * count on the cover of the latest SEC filing filed before that day, in today's shares (later stock splits applied,
 * as the price history is split adjusted). A count filed later, a revision included, never reaches an earlier day.
 * Counts change between filings without showing, so this is the count known then, not each day's exact count.
 * Without usable filings (a company outside the SEC), today's share count is held: an estimate, and said so.
 */

export interface ShareCount {
  /** The date the count is as of (ISO). */
  end: string;
  val: number;
  /** The date the filing giving it was filed (ISO); taken as the count's own date when not known. */
  filed?: string;
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
  /** The shares the day's value takes, in today's shares. */
  shares?: number;
  /** The filed count behind it (in today's shares), when the filings give one. */
  count?: ShareCount;
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

type FiledRow = { end: string; val: number; filed: string };

/** Each date's latest filing, oldest date first. */
function latestPerEnd(rows: FiledRow[]): ShareCount[] {
  const by = new Map<string, FiledRow>();
  for (const r of rows) {
    if (!(r.val > 0)) continue;
    const have = by.get(r.end);
    if (!have || r.filed > have.filed) by.set(r.end, r);
  }
  return [...by.values()].map((r) => ({ end: r.end, val: r.val })).sort((a, b) => a.end.localeCompare(b.end));
}

/**
 * The share-count rows to use: those on the filings' covers, or, for a company that gives its cover count by share
 * class only, those on its balance sheets.
 */
function shareRows(cf: Pick<CompanyFacts, 'facts'> | null | undefined): FiledRow[] {
  const cover = (cf?.facts[COVER_SHARES]?.shares ?? []) as FiledRow[];
  const balance = (cf?.facts[BALANCE_SHARES]?.shares ?? []) as FiledRow[];
  // The covers, unless they stopped long before the balance sheets did (a company that went on to give its cover
  // count by share class only).
  const last = (xs: ShareCount[]) => (xs.length ? dayOf(xs[xs.length - 1].end) : -Infinity);
  const c = latestPerEnd(cover);
  return c.length && last(c) >= last(latestPerEnd(balance)) - 400 ? cover : balance;
}

/** Share counts by date (the latest filing's count for each date, a revision included), oldest first. */
export function coverShareCounts(cf: Pick<CompanyFacts, 'facts'> | null | undefined): ShareCount[] {
  return latestPerEnd(shareRows(cf));
}

/** Every filed share count with its filing date (revisions as separate rows), oldest filing first. */
/**
 * The market value at a period's end, as a financial statement's market capitalisation line: the value on the last
 * trading day on or before that date (the end counts in full), none when no close falls in the ten days before it.
 */
export function capAtPeriodEnd(points: CapPoint[], end: number): CapPoint | undefined {
  const until = end + 86_400_000;
  let lo = 0;
  let hi = points.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < until) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return at >= 0 && points[at].t >= end - 10 * 86_400_000 ? points[at] : undefined;
}

export function shareFilings(cf: Pick<CompanyFacts, 'facts'> | null | undefined): ShareCount[] {
  return shareRows(cf)
    .filter((r) => r.val > 0)
    .map((r) => ({ end: r.end, val: r.val, filed: r.filed }))
    .sort((a, b) => a.filed.localeCompare(b.filed) || a.end.localeCompare(b.end));
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
 * `scale` turns a quoted price into the currency unit (0.01 for a price in pence). `counts` are the filed counts, with
 * their filing dates (each date's latest filing when given as one row per date). With counts that agree with today's
 * (within 5%), each day takes the latest count filed before it; counts far from it count part of the shares (one class
 * of several), so they only move today's count back in time, an estimate. Days before the first filing are left out.
 */
export function capSeries(bars: { t: ArrayLike<number>; c: ArrayLike<number>; length: number }, sharesNow: number, counts: ShareCount[], splits: SplitEvent[], scale = 1): CapSeries {
  const filedDay = (c: ShareCount) => dayOf(c.filed ?? c.end);
  const byEnd = latestPerEnd(counts.map((c) => ({ end: c.end, val: c.val, filed: c.filed ?? c.end })));
  // Counts that stopped more than two years before the prices end say nothing of the shares since: none are used.
  const lastBar = bars.length ? Math.floor(bars.t[bars.length - 1] / DAY_MS) : 0;
  const fresh = byEnd.length > 0 && lastBar - dayOf(byEnd[byEnd.length - 1].end) <= 730;
  const adj = fresh ? adjustedCounts(byEnd, splits) : [];
  const kept = new Set(adj.map((c) => c.end));
  // Every filing of a kept date, in today's shares, in the order they were filed.
  const filings = fresh
    ? counts
        .filter((c) => kept.has(c.end) && c.val > 0)
        .map((c) => ({ end: c.end, val: c.val * splitFactorAfter(splits, dayOf(c.end)), filed: c.filed ?? c.end }))
        .sort((a, b) => filedDay(a) - filedDay(b) || a.end.localeCompare(b.end))
    : [];
  const latest = adj[adj.length - 1];
  const points: CapPoint[] = [];
  const direct = !!latest && sharesNow > 0 && Math.abs(latest.val / sharesNow - 1) <= 0.05;
  const basis: CapSeries['basis'] = !latest ? 'held' : direct ? 'filings' : 'scaled';
  if (!(sharesNow > 0)) return { points, basis, counts: adj };
  let k = 0;
  let cur: ShareCount | undefined;
  for (let i = 0; i < bars.length; i++) {
    const t = bars.t[i];
    const c = bars.c[i];
    if (!(c > 0)) continue;
    let shares = sharesNow;
    let count: ShareCount | undefined;
    if (latest) {
      const day = Math.floor(t / DAY_MS);
      // Filings published before this day's session; the latest-dated count among them (a later revision replaces).
      while (k < filings.length && filedDay(filings[k]) < day) {
        if (!cur || filings[k].end >= cur.end) cur = filings[k];
        k++;
      }
      if (!cur) continue;
      count = cur;
      shares = direct ? cur.val : sharesNow * (cur.val / latest.val);
    }
    points.push({ t, cap: c * scale * shares, shares, ...(count ? { count } : {}) });
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
  /** The shares and the filed count behind the value. */
  shares?: number;
  count?: ShareCount;
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
      return { year, cap: p.cap, t: p.t, change: prev && years[i - 1] === year - 1 ? (p.cap / prev.cap - 1) * 100 : NaN, ...(p.shares ? { shares: p.shares } : {}), ...(p.count ? { count: p.count } : {}) };
    })
    .reverse();
}
