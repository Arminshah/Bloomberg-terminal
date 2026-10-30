import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { desktopData, yahooGet, YahooDisabled } from './yahoo';

/**
 * Month-end last prices for any window of whole months (the mean-variance screen's prices): Yahoo's daily closes from
 * its chart answers (desktop app), keeping the last close of each month in the exchange's own calendar. Yahoo's closes
 * are adjusted for splits and not for dividends, as a terminal's last price is. Kept in memory for 12 hours.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MonthEnd {
  /** The month's last trading day, YYYY-MM-DD. */
  day: string;
  close: number;
}

export interface MonthEndSeries {
  symbol: string;
  currency?: string;
  name?: string;
  /** By month, YYYY-MM. */
  months: Record<string, MonthEnd>;
}

/** The last close of each month in a Yahoo chart answer, dated in the exchange's time zone; null without closes. */
export function monthEndsOf(data: any): MonthEndSeries | null {
  const r = data?.chart?.result?.[0];
  const ts: unknown[] = Array.isArray(r?.timestamp) ? r.timestamp : [];
  const close: unknown[] = Array.isArray(r?.indicators?.quote?.[0]?.close) ? r.indicators.quote[0].close : [];
  const offset = Number.isFinite(r?.meta?.gmtoffset) ? Number(r.meta.gmtoffset) : 0;
  const months: Record<string, MonthEnd> = {};
  ts.forEach((t, i) => {
    const c = close[i];
    if (typeof t !== 'number' || typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return;
    const day = new Date((t + offset) * 1000).toISOString().slice(0, 10);
    const m = day.slice(0, 7);
    if (!months[m] || months[m].day < day) months[m] = { day, close: c };
  });
  if (!Object.keys(months).length) return null;
  const meta = r?.meta ?? {};
  return { symbol: String(meta.symbol ?? ''), currency: typeof meta.currency === 'string' ? meta.currency : undefined, name: meta.longName ?? meta.shortName ?? undefined, months };
}

/** Seconds at 00:00 UTC on a month's first day, YYYY-MM, moved by `add` months. */
export function monthStart(month: string, add = 0): number {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m - 1 + add, 1) / 1000;
}

/** The chart request for a symbol's daily closes from the first day of `from` to the last of `to`. */
export function monthEndPath(symbol: string, from: string, to: string): string {
  return `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${monthStart(from)}&period2=${monthStart(to, 1)}`;
}

type Entry = MonthEndSeries | null;
export const monthEndPrices = createStore<{ v: number; by: Record<string, Entry>; problem?: string }>({ v: 0, by: {} });
const asked = new Map<string, number>();
const keyOf = (symbol: string, from: string, to: string) => `${symbol}|${from}|${to}`;

async function load(symbols: string[], from: string, to: string) {
  const due = symbols.filter((s) => Date.now() - (asked.get(keyOf(s, from, to)) ?? 0) > 12 * 3_600_000);
  for (const s of due) asked.set(keyOf(s, from, to), Date.now());
  let next = 0;
  const worker = async () => {
    while (next < due.length) {
      const s = due[next++];
      const key = keyOf(s, from, to);
      try {
        const series = monthEndsOf(await yahooGet(monthEndPath(s, from, to)));
        monthEndPrices.set((st) => ({ v: st.v + 1, by: { ...st.by, [key]: series }, problem: st.problem }));
      } catch (err) {
        asked.delete(key);
        const problem = err instanceof YahooDisabled ? 'Yahoo Finance prices are switched off (YAHOO_PRICES_ENABLED).' : `Yahoo Finance did not answer: ${String((err as Error)?.message ?? err)}`;
        monthEndPrices.set((st) => ({ v: st.v + 1, by: { ...st.by, [key]: null }, problem }));
      }
    }
  };
  await Promise.all([worker(), worker()]);
}

/** The symbols' month-end closes over whole months `from` to `to` (YYYY-MM), loading them while a screen shows them. */
export function useMonthEndPrices(symbols: string[], from: string, to: string): { by: Record<string, Entry>; pending: number; problem?: string } {
  monthEndPrices.use((s) => s.v);
  const key = `${symbols.join(',')}|${from}|${to}`;
  useEffect(() => {
    if (desktopData() && symbols.length && from <= to) void load(symbols, from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const all = monthEndPrices.get();
  const by = Object.fromEntries(symbols.filter((s) => keyOf(s, from, to) in all.by).map((s) => [s, all.by[keyOf(s, from, to)]]));
  return { by, pending: symbols.length - Object.keys(by).length, problem: all.problem };
}
