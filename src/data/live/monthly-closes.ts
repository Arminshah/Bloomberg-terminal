import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { byMonth, type MonthCloses } from '../backtest';
import { desktopData, yahooGet, YahooDisabled } from './yahoo';

/**
 * Ten years of month-end closes from Yahoo's spark answers (desktop app), 20 symbols a request, two requests at a
 * time, kept 12 hours: the backtests' prices (EQBT). Yahoo's closes are adjusted for splits, not for dividends.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const monthlyCloses = createStore<{ v: number; by: Record<string, MonthCloses | null>; problem?: string }>({ v: 0, by: {} });
const asked = new Map<string, number>();

async function load(symbols: string[]) {
  const due = symbols.filter((s) => Date.now() - (asked.get(s) ?? 0) > 12 * 3_600_000);
  for (const s of due) asked.set(s, Date.now());
  const batches: string[][] = [];
  for (let i = 0; i < due.length; i += 20) batches.push(due.slice(i, i + 20));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const data: any = await yahooGet(`/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=10y&interval=1mo`);
        const got: Record<string, MonthCloses | null> = {};
        for (const s of batch) {
          const x = data?.[s];
          const t: number[] = Array.isArray(x?.timestamp) ? x.timestamp.map((v: number) => v * 1000) : [];
          const c: number[] = Array.isArray(x?.close) ? x.close.map((v: unknown) => (typeof v === 'number' ? v : NaN)) : [];
          got[s] = t.length ? byMonth(t, c) : null;
        }
        monthlyCloses.set((st) => ({ v: st.v + 1, by: { ...st.by, ...got }, problem: undefined }));
      } catch (err) {
        // No closes this time, and the screen says why; the next time the screen opens asks again.
        for (const s of batch) asked.delete(s);
        const problem = err instanceof YahooDisabled ? 'Yahoo Finance prices are switched off (YAHOO_PRICES_ENABLED).' : `Yahoo Finance did not answer: ${String((err as Error)?.message ?? err)}`;
        monthlyCloses.set((st) => ({ v: st.v + 1, by: { ...st.by, ...Object.fromEntries(batch.map((s) => [s, null])) }, problem }));
      }
    }
  };
  await Promise.all([worker(), worker()]);
}

/** The symbols' month-end closes, loading them while a screen shows them; `pending` counts those not answered yet. */
export function useMonthlyCloses(symbols: string[]): { by: Record<string, MonthCloses | null>; pending: number; problem?: string } {
  monthlyCloses.use((s) => s.v);
  const key = symbols.join(',');
  useEffect(() => {
    if (desktopData() && symbols.length) void load(symbols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const { by, problem } = monthlyCloses.get();
  return { by, pending: symbols.filter((s) => !(s in by)).length, problem };
}
