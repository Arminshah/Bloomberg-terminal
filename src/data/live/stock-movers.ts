// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { yahooGet } from './yahoo';
import { nasdaqTicker } from './nasdaq-book';
import { nyDay, parseNasdaqDays, settleDue } from './settled-volume';

/**
 * US stock lists as Yahoo Finance's markets pages show them (desktop app): most active, trending, the day's gainers
 * and losers, and the 52-week gainers and losers, each stock with price, change, volume against its three-month
 * average, market value, P/E, the 52-week change and range, and the day's price path.
 */

export type MoverList = 'most_actives' | 'trending' | 'day_gainers' | 'day_losers' | 'fifty_two_wk_gainers' | 'fifty_two_wk_losers';

export const MOVER_LISTS: { id: MoverList; n: number; label: string; arg: string; about: string }[] = [
  { id: 'most_actives', n: 1, label: 'Most Active', arg: 'ACTIVE', about: 'US stocks above $2B traded most today (over 5M shares), by volume' },
  { id: 'trending', n: 2, label: 'Trending Now', arg: 'TRENDING', about: 'The tickers most looked up on Yahoo Finance in the US in the last hours' },
  { id: 'day_gainers', n: 3, label: 'Top Gainers', arg: 'GAINERS', about: 'US stocks above $2B up most today' },
  { id: 'day_losers', n: 4, label: 'Top Losers', arg: 'LOSERS', about: 'US stocks above $2B down most today' },
  { id: 'fifty_two_wk_gainers', n: 5, label: '52 Week Gainers', arg: '52WG', about: 'US stocks up most over 52 weeks' },
  { id: 'fifty_two_wk_losers', n: 6, label: '52 Week Losers', arg: '52WL', about: 'US stocks down most over 52 weeks' },
];

export interface Mover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  pct: number;
  volume: number;
  avgVolume3m: number;
  marketCap: number;
  pe: number;
  /** Change over 52 weeks, in percent. */
  change52w: number;
  low52: number;
  high52: number;
  currency: string;
  /** Quote time (epoch ms) and how many minutes the exchange delays it. */
  time: number;
  delay: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v?.raw === 'number' ? v.raw : NaN);

/** One quote of a screener or quote answer as a mover; null without a symbol and a price. */
export function moverOf(q: any): Mover | null {
  const symbol = typeof q?.symbol === 'string' ? q.symbol : '';
  const price = num(q?.regularMarketPrice);
  if (!symbol || !(price > 0)) return null;
  return {
    symbol,
    name: String(q.longName ?? q.shortName ?? symbol).trim(),
    price,
    change: num(q.regularMarketChange),
    pct: num(q.regularMarketChangePercent),
    volume: num(q.regularMarketVolume),
    avgVolume3m: num(q.averageDailyVolume3Month),
    marketCap: num(q.marketCap),
    pe: num(q.trailingPE),
    // Yahoo gives the 52-week change in percent on its lists.
    change52w: num(q.fiftyTwoWeekChangePercent),
    low52: num(q.fiftyTwoWeekLow),
    high52: num(q.fiftyTwoWeekHigh),
    currency: typeof q.currency === 'string' ? q.currency : 'USD',
    time: num(q.regularMarketTime) * 1000,
    delay: num(q.exchangeDataDelayedBy),
  };
}

/** A predefined screener's answer: its stocks in Yahoo's order, and how many match in all. */
export function parseScreener(data: any): { rows: Mover[]; total: number } | null {
  const r = data?.finance?.result?.[0];
  if (!r || !Array.isArray(r.quotes)) return null;
  return { rows: r.quotes.map(moverOf).filter((m: Mover | null): m is Mover => !!m), total: num(r.total) };
}

/** Trending's symbols, in order; the quotes come from a quote request. */
export function parseTrending(data: any): string[] {
  const list = data?.finance?.result?.[0]?.quotes;
  return Array.isArray(list) ? list.map((q: any) => q?.symbol).filter((s: unknown): s is string => typeof s === 'string' && /^[A-Z0-9.^=-]{1,12}$/.test(s)) : [];
}

/** The day's closes from a spark answer, by symbol: the current answer is keyed by symbol, an older one wrapped in spark.result. */
export function parseSparkPaths(data: any): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const entries: [string, unknown][] = data?.spark?.result
    ? (data.spark.result as any[]).map((r) => [String(r?.symbol), r?.response?.[0]?.indicators?.quote?.[0]?.close])
    : Object.entries(data ?? {}).map(([k, v]: [string, any]) => [String(v?.symbol ?? k), v?.close]);
  for (const [symbol, c] of entries) {
    if (symbol && Array.isArray(c)) out[symbol] = c.filter((x: unknown): x is number => typeof x === 'number' && Number.isFinite(x));
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Entry {
  state: 'loading' | 'ok' | 'error';
  rows: Mover[];
  total: number;
  message?: string;
  at: number;
}

/** A finished session's consolidated volume, by symbol: the session (New York day number) and its volume. */
export type SettledVolumes = Record<string, { day: number; volume: number }>;

export const moverData = createStore<{ v: number; lists: Partial<Record<MoverList, Entry>>; paths: Record<string, { at: number; c: number[] }>; settled: SettledVolumes }>({ v: 0, lists: {}, paths: {}, settled: {} });

/**
 * The volume a row shows, and whose: Nasdaq's consolidated volume of all US venues for the finished session where the
 * app has settled it, else Yahoo's screener figure (after the close, often a few percent short: Apple on 27 October
 * 2026, 39.05M against 39.98M).
 */
export function moverVolume(m: Mover, settled: SettledVolumes): { volume: number; settled: boolean } {
  const s = settled[m.symbol];
  return s && m.time > 0 && s.day === nyDay(m.time) && s.volume >= (m.volume || 0) ? { volume: s.volume, settled: true } : { volume: m.volume, settled: false };
}

const settleAsked = new Map<string, { at: number; day: number; times: number }>();

/**
 * After the close (16:10 New York time), the finished session's volume of the first rows from Nasdaq's historical
 * prices: each at most every 30 minutes and four times a session, as for the stocks on screen.
 */
export async function settleMovers(rows: Mover[], now = Date.now(), max = 30): Promise<void> {
  const api = typeof window === 'undefined' ? undefined : window.arminDesktop;
  if (!api?.nasdaq) return;
  for (const m of rows.slice(0, max)) {
    if (!(m.time > 0)) continue;
    const day = nyDay(m.time);
    if (!settleDue(day, now)) continue;
    const symbol = nasdaqTicker(`${m.symbol.replace('-', '/')} US Equity`);
    const a = settleAsked.get(m.symbol);
    if (!symbol || (a && a.day === day && (a.times >= 4 || now - a.at < 30 * 60_000))) continue;
    settleAsked.set(m.symbol, { at: now, day, times: a && a.day === day ? a.times + 1 : 1 });
    try {
      const res = await api.nasdaq('historical', symbol);
      const row = res.text ? parseNasdaqDays(res.text).find((r) => r.day === day) : undefined;
      if (row) moverData.set((s) => ({ ...s, v: s.v + 1, settled: { ...s.settled, [m.symbol]: { day, volume: row.volume } } }));
    } catch {
      /* asked again on a later round */
    }
  }
}

const put = (id: MoverList, e: Entry) => moverData.set((s) => ({ ...s, v: s.v + 1, lists: { ...s.lists, [id]: e } }));

async function loadList(id: MoverList, count: number) {
  const have = moverData.get().lists[id];
  if (have?.state === 'loading') return;
  put(id, { ...(have ?? { rows: [], total: NaN }), state: 'loading', at: have?.at ?? 0 });
  try {
    let rows: Mover[];
    let total = NaN;
    if (id === 'trending') {
      const symbols = parseTrending(await yahooGet(`/v1/finance/trending/US?count=${Math.min(count, 25)}`));
      // The stocks only: trending also holds funds, futures and crypto.
      const quotes = symbols.length ? await yahooGet(`/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(',')}`) : null;
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const list: any[] = quotes?.quoteResponse?.result ?? [];
      rows = symbols.map((s) => list.find((q) => q?.symbol === s)).filter((q) => q?.quoteType === 'EQUITY').map(moverOf).filter((m): m is Mover => !!m);
      total = rows.length;
    } else {
      const got = parseScreener(await yahooGet(`/v1/finance/screener/predefined/saved?scrIds=${id}&count=${count}`));
      if (!got) throw new Error('Yahoo Finance changed its list format.');
      rows = got.rows;
      total = got.total;
    }
    put(id, { state: 'ok', rows, total, at: Date.now() });
    void loadPaths(rows.map((r) => r.symbol));
    void settleMovers(rows);
  } catch (err) {
    put(id, { state: 'error', rows: have?.rows ?? [], total: have?.total ?? NaN, message: err instanceof Error ? err.message : String(err), at: Date.now() });
  }
}

/** The day's price path of each stock, 20 to a request, kept five minutes. */
async function loadPaths(symbols: string[]) {
  const now = Date.now();
  const todo = symbols.filter((s) => now - (moverData.get().paths[s]?.at ?? 0) > 5 * 60_000);
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    try {
      const got = parseSparkPaths(await yahooGet(`/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=1d&interval=5m`));
      moverData.set((s) => ({ ...s, v: s.v + 1, paths: { ...s.paths, ...Object.fromEntries(Object.entries(got).map(([k, c]) => [k, { at: Date.now(), c }])) } }));
    } catch {
      /* the rows show without their path */
    }
  }
}

/** A list while a screen shows it, asked again every minute. */
export function useMoverList(id: MoverList, count = 100) {
  const v = moverData.use((s) => s.v);
  useEffect(() => {
    void loadList(id, count);
    const t = setInterval(() => void loadList(id, count), 60_000);
    return () => clearInterval(t);
  }, [id, count]);
  return { entry: moverData.get().lists[id], paths: moverData.get().paths, settled: moverData.get().settled, v };
}
