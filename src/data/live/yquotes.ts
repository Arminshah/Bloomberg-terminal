import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { desktopData, yahooGet } from './yahoo';

/**
 * Quotes for symbols outside the universe, on demand (desktop app): futures
 * contract months for strips, fed funds futures for the rate path. Each
 * symbol is fetched at most once a minute while a screen asks for it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const cache = new Map<string, { q: Json | null; at: number }>();
const inflight = new Set<string>();
export const extraQuotes = createStore({ v: 0 });

async function fetchBatch(symbols: string[]) {
  for (const s of symbols) inflight.add(s);
  try {
    for (let i = 0; i < symbols.length; i += 50) {
      const batch = symbols.slice(i, i + 50);
      const res = await yahooGet(`/v7/finance/quote?symbols=${batch.map(encodeURIComponent).join(',')}`);
      const got = new Map<string, Json>(((res?.quoteResponse?.result ?? []) as Json[]).map((q) => [q.symbol, q]));
      const now = Date.now();
      // A symbol the source does not know is remembered as missing, so it is not asked for again soon.
      for (const s of batch) cache.set(s, { q: got.get(s) ?? null, at: now });
    }
  } catch {
    /* tried again on the next refresh */
  } finally {
    for (const s of symbols) inflight.delete(s);
    extraQuotes.set((x) => ({ v: x.v + 1 }));
  }
}

/** Latest quotes for the symbols, refreshed while the calling screen is open. */
export function useYahooQuotes(symbols: string[], refreshMs = 60_000): Map<string, Json> {
  extraQuotes.use((x) => x.v);
  const key = symbols.join(',');
  useEffect(() => {
    if (!desktopData() || !symbols.length) return;
    const refresh = () => {
      const now = Date.now();
      const due = symbols.filter((s) => !inflight.has(s) && now - (cache.get(s)?.at ?? 0) > refreshMs);
      if (due.length) void fetchBatch(due);
    };
    refresh();
    const timer = setInterval(refresh, Math.min(refreshMs, 60_000));
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs]);
  const out = new Map<string, Json>();
  for (const s of symbols) {
    const q = cache.get(s)?.q;
    if (q) out.set(s, q);
  }
  return out;
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** Futures contract symbols for the next `n` listed months: CLX26.NYM, GCZ26.CMX and so on. */
export function contractSymbols(root: string, exch: string, listed: string, n: number, from = new Date()): { symbol: string; month: number; year: number }[] {
  const months = listed === 'All months' ? MONTH_CODES.split('') : listed.split(',').map((x) => x.trim());
  const out: { symbol: string; month: number; year: number }[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  for (let k = 0; k < 48 && out.length < n; k++) {
    const code = MONTH_CODES[m];
    if (months.includes(code)) out.push({ symbol: `${root}${code}${String(y).slice(2)}.${exch}`, month: m, year: y });
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The contract behind a continuous futures quote, as the source names it
 * ("E-Mini S&P 500 Dec 26", expiring 18 Dec): month code, expiry and open interest.
 */
export function frontContract(q: { shortName?: unknown; expireIsoDate?: unknown; expireDate?: unknown; openInterest?: unknown } | undefined): { code: string; month: string; expiry: number; openInterest: number } | null {
  if (!q) return null;
  const m = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]+(?:20)?(\d{2})\s*$/.exec(String(q.shortName ?? '').trim());
  const expiry = typeof q.expireIsoDate === 'string' ? Date.parse(q.expireIsoDate) : Number(q.expireDate) * 1000;
  if (!m || !Number.isFinite(expiry)) return null;
  const k = MONTH_NAMES.indexOf(m[1]);
  return { code: `${MONTH_CODES[k]}${m[2]}`, month: `${m[1]} ${m[2]}`, expiry, openInterest: Number(q.openInterest) || NaN };
}
