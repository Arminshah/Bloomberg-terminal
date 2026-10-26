import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { fmtStamp } from '../../core/format';
import { desktopData, timingOf, yahooGet } from './yahoo';
import { createWants, registerRefresh } from '../../terminal/refresh';

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
/** The symbols open screens show, for the top bar's REFRESH. */
const shown = createWants<string[]>();

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
    const off = shown.add(key, symbols);
    return () => {
      clearInterval(timer);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs]);
  const out = new Map<string, Json>();
  for (const s of symbols) {
    const q = cache.get(s)?.q;
    if (q) out.set(s, q);
  }
  return out;
}

registerRefresh({
  source: 'Yahoo quotes for contract months',
  available: desktopData,
  run: async () => {
    const symbols = [...new Set(shown.values().flat())].filter((s) => !inflight.has(s));
    if (!symbols.length) return [];
    const asked = Date.now();
    await fetchBatch(symbols);
    const got = symbols.filter((s) => cache.get(s)?.q && cache.get(s)!.at >= asked).length;
    return { source: 'Yahoo quotes for contract months', state: got ? 'asked' : 'failed', detail: `${got} of ${symbols.length} symbols answered` };
  },
});

/**
 * How the source times a table of its quotes, for the table's header: "delayed
 * 10 min per Yahoo · last trade 14:05", from the quotes' own delay and trade
 * time rather than an assumption about the exchange.
 */
export function quotesTiming(quotes: Json[]): string {
  const t = quotes.filter(Boolean).map(timingOf);
  const delays = t.filter((x) => x.timing === 'delayed').map((x) => x.delay);
  const timing = delays.length ? `delayed ${Math.max(...delays)} min per Yahoo` : t.some((x) => x.timing === 'realtime') ? 'real time per Yahoo' : 'timing not stated by Yahoo';
  const times = quotes.map((q) => Number(q?.regularMarketTime) * 1000).filter((x) => Number.isFinite(x) && x > 0);
  return times.length ? `${timing} · last trade ${fmtStamp(Math.max(...times))}` : timing;
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** Exchange suffix of each futures root on Yahoo, for its contract months (CLZ26.NYM). */
export const FUTURES_EXCHANGE: Record<string, string> = {
  CL: 'NYM', BZ: 'NYM', NG: 'NYM', HO: 'NYM', RB: 'NYM', PL: 'NYM', PA: 'NYM', GC: 'CMX', SI: 'CMX', HG: 'CMX',
  ZW: 'CBT', ZC: 'CBT', ZS: 'CBT', KC: 'NYB', SB: 'NYB', CC: 'NYB', CT: 'NYB', LE: 'CME', HE: 'CME',
};

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
 * The contract behind a continuous futures quote, as the source names it: its
 * contract symbol ("RTYZ26.CME"), else its name ("E-Mini S&P 500 Dec 26"),
 * with the expiry and open interest. Names can be cut short, so the symbol comes first.
 */
export function frontContract(
  q: { underlyingSymbol?: unknown; shortName?: unknown; expireIsoDate?: unknown; expireDate?: unknown; openInterest?: unknown } | undefined,
): { code: string; month: string; expiry: number; openInterest: number } | null {
  if (!q) return null;
  const expiry = typeof q.expireIsoDate === 'string' ? Date.parse(q.expireIsoDate) : Number(q.expireDate) * 1000;
  if (!Number.isFinite(expiry)) return null;
  const s = /([FGHJKMNQUVXZ])(\d{2})\.[A-Z]+$/.exec(String(q.underlyingSymbol ?? ''));
  const n = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]+(?:20)?(\d{2})\s*$/.exec(String(q.shortName ?? '').trim());
  const k = s ? MONTH_CODES.indexOf(s[1]) : n ? MONTH_NAMES.indexOf(n[1]) : -1;
  const yy = s ? s[2] : n?.[2];
  if (k < 0 || !yy) return null;
  return { code: `${MONTH_CODES[k]}${yy}`, month: `${MONTH_NAMES[k]} ${yy}`, expiry, openInterest: Number(q.openInterest) || NaN };
}

const components = new Map<string, { list: string[] | null; at: number }>();
const componentsInflight = new Set<string>();

/**
 * An index's current members as the source lists them (Yahoo has the Dow, the
 * Nasdaq 100, the FTSE 100 and the DAX), refreshed every six hours. Null while
 * loading, an empty list when the source has none.
 */
export function useIndexComponents(symbol: string): string[] | null {
  extraQuotes.use((x) => x.v);
  useEffect(() => {
    if (!desktopData()) return;
    const c = components.get(symbol);
    if ((c && Date.now() - c.at < 6 * 3600_000) || componentsInflight.has(symbol)) return;
    componentsInflight.add(symbol);
    void yahooGet(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=components`)
      .then((res) => {
        const list = res?.quoteSummary?.result?.[0]?.components?.components;
        components.set(symbol, { list: Array.isArray(list) ? list.map(String) : [], at: Date.now() });
      })
      .catch(() => components.set(symbol, { list: [], at: Date.now() - 6 * 3600_000 + 120_000 }))
      .finally(() => {
        componentsInflight.delete(symbol);
        extraQuotes.set((x) => ({ v: x.v + 1 }));
      });
  }, [symbol]);
  return components.get(symbol)?.list ?? null;
}
