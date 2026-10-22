import { loadJson, saveJson } from '../../core/store';
import { engine } from '../market';
import { latestReportedShares } from './lookup';
import { desktopData, yahooGet, yahooSymbolFor } from './yahoo';

/**
 * Shares outstanding for the stocks the app lists, from Yahoo's fundamentals series (the last reported balance
 * sheet), which answers without Yahoo's session. Yahoo's quote endpoint gives a current count with the market
 * cap, but needs the session Yahoo refuses until its EU cookie terms are accepted; without a count a stock has
 * no market cap, and HEATMAP, MOVERS and the profiles cannot size or value it. The quote endpoint's count wins
 * whenever it arrives; reported counts are kept a week.
 */

const KEY = 'armin:reported-shares-v1';
/**
 * Lines whose reported count is in another class's units: Berkshire Hathaway reports its shares as Class A
 * equivalents, and one Class A share is 1,500 Class B shares, so the B line's count (behind its market value, the
 * whole company's) is the reported count times 1,500.
 */
export const CLASS_UNITS: Record<string, number> = { 'BRK-B': 1500 };
const WEEK = 7 * 86_400_000;
type Kept = Record<string, { shares: number; at: number }>;
let memory: Kept | undefined;

function seriesPath(symbol: string, now: number): string {
  const s = encodeURIComponent(symbol);
  const t = Math.floor(now / 1000);
  return `/ws/fundamentals-timeseries/v1/finance/timeseries/${s}?symbol=${s}&type=quarterlyOrdinarySharesNumber,annualOrdinarySharesNumber&period1=${t - 2 * 365 * 86_400}&period2=${t}`;
}

/** Stocks a screen is showing: they go before the rest of the queue. */
const wanted = new Set<string>();
const inFlight = new Set<string>();
let filling = false;

/**
 * Reads one stock's reported count: 'filled', 'none' when the source gave none, 'skipped' when nothing was asked
 * (it has a count, or a request for it is under way).
 */
async function fetchShares(id: string): Promise<'filled' | 'none' | 'skipped'> {
  const d = engine.get(id);
  const eq = d?.eq;
  const symbol = d && d.cls === 'equity' ? yahooSymbolFor(d) : null;
  // The quote endpoint may have answered meanwhile.
  if (!eq || !symbol || eq.shares > 0 || inFlight.has(id)) return 'skipped';
  inFlight.add(id);
  try {
    const kept: Kept = (memory ??= loadJson<Kept>(KEY) ?? {});
    const k = kept[symbol];
    if (k && Date.now() - k.at < WEEK && k.shares > 0) {
      eq.shares = (k.shares * (CLASS_UNITS[symbol] ?? 1)) / 1e6;
      return 'skipped';
    }
    const shares = latestReportedShares(await yahooGet(seriesPath(symbol, Date.now())).catch(() => null));
    if (!(shares && shares > 0)) return 'none';
    kept[symbol] = { shares, at: Date.now() };
    saveJson(KEY, kept);
    if (!(eq.shares > 0)) eq.shares = (shares * (CLASS_UNITS[symbol] ?? 1)) / 1e6;
    return 'filled';
  } finally {
    inFlight.delete(id);
  }
}

/**
 * A screen shows this stock: its share count is read next (at once when the queue is not running), so a profile or
 * market value opened before the queue reaches it does not wait for every other stock.
 */
export function wantShares(id: string): void {
  if (!desktopData()) return;
  const eq = engine.get(id)?.eq;
  if (!eq || eq.shares > 0) return;
  wanted.add(id);
  if (!filling && !draining) void drainWanted();
}

let draining = false;

/** Reads the stocks asked for while the queue is not running, one at a time (a heat map can ask for dozens). */
async function drainWanted(gap = 300): Promise<void> {
  draining = true;
  try {
    for (;;) {
      const next = wanted.values().next();
      if (next.done || filling) break;
      wanted.delete(next.value);
      const got = await fetchShares(next.value);
      if (got !== 'skipped' && gap) await new Promise((r) => setTimeout(r, gap));
    }
  } finally {
    draining = false;
  }
}

/** Fills missing share counts: kept ones at once, the rest one stock at a time, 1.5 seconds apart. */
export async function fillShareCounts(stopped: () => boolean = () => false, gap = 1500): Promise<number> {
  const kept: Kept = (memory ??= loadJson<Kept>(KEY) ?? {});
  const now = Date.now();
  const missing: string[] = [];
  for (const d of engine.defs) {
    if (d.cls !== 'equity' || !d.eq || d.eq.shares > 0) continue;
    const symbol = yahooSymbolFor(d);
    if (!symbol) continue;
    const k = kept[symbol];
    if (k && now - k.at < WEEK && k.shares > 0) d.eq.shares = (k.shares * (CLASS_UNITS[symbol] ?? 1)) / 1e6;
    else missing.push(d.id);
  }
  let filled = 0;
  filling = true;
  try {
    for (;;) {
      if (stopped()) break;
      const next = wanted.values().next();
      const id = next.done ? missing.shift() : next.value;
      if (id === undefined) break;
      wanted.delete(id);
      const got = await fetchShares(id);
      if (got === 'filled') filled++;
      if (got !== 'skipped' && gap) await new Promise((r) => setTimeout(r, gap));
    }
  } finally {
    filling = false;
    // Stocks asked for after the queue stopped are read now.
    if (wanted.size && !draining) void drainWanted();
  }
  return filled;
}

/** Starts filling share counts once the first quotes have had time to arrive. */
export function startShareCounts(): () => void {
  if (!desktopData()) return () => undefined;
  let stopped = false;
  const timer = setTimeout(() => void fillShareCounts(() => stopped), 15_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
