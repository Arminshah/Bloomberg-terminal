import { useEffect } from 'react';
import { createStore } from '../../core/store';

/**
 * Daily closes adjusted for splits and dividends, over a stated window, from Tiingo (desktop app, the owner's key and
 * TIINGO_ENABLED): the MPC back-test's prices, as Quandl's adjusted closes were in the dissertation. Tiingo keeps the
 * history of delisted stocks. Its data is kept in memory only, as its terms ask.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AdjustedBar {
  date: string;
  /** Close adjusted for splits and dividends. */
  adj: number;
  /** Close as traded. */
  close: number;
}

/** Tiingo's daily prices [{date, close, adjClose, ...}] as adjusted bars in date order; an error text otherwise. */
export function parseTiingoAdjusted(text: string): AdjustedBar[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Tiingo did not answer with JSON.' };
  }
  if (!Array.isArray(j)) return { error: String(j?.detail ?? j?.message ?? 'No price list in the answer.').slice(0, 200) };
  return j
    .map((r: any) => ({ date: String(r?.date ?? '').slice(0, 10), adj: Number(r?.adjClose), close: Number(r?.close) }))
    .filter((b: AdjustedBar) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.adj > 0 && b.close > 0)
    .sort((a: AdjustedBar, b: AdjustedBar) => a.date.localeCompare(b.date));
}

type Entry = { state: 'loading' } | { state: 'ok'; bars: AdjustedBar[] } | { state: 'error'; message: string };
export const adjustedHistory = createStore<{ v: number; by: Record<string, Entry> }>({ v: 0, by: {} });
const keyOf = (t: string, from: string, to: string) => `${t}|${from}|${to}`;

const inflight = new Map<string, Promise<void>>();

/** Cuts the window from a wider one already read; false when none covers it. */
function cut(ticker: string, from: string, to: string): boolean {
  const by = adjustedHistory.get().by;
  for (const [k, e] of Object.entries(by)) {
    const [t, f, until] = k.split('|');
    if (t === ticker && e.state === 'ok' && f <= from && until >= to) {
      const bars = e.bars.filter((b) => b.date >= from && b.date <= to);
      const key = keyOf(ticker, from, to);
      adjustedHistory.set((s) => ({ v: s.v + 1, by: { ...s.by, [key]: bars.length ? { state: 'ok', bars } : { state: 'error', message: `Tiingo has no prices for ${ticker} from ${from} to ${to}.` } } }));
      return true;
    }
  }
  return false;
}

async function load(ticker: string, from: string, to: string) {
  const key = keyOf(ticker, from, to);
  const have = adjustedHistory.get().by[key];
  if (have && have.state !== 'error') return;
  // A window inside one already read, or being read, is cut from it, so a shorter period asks Tiingo nothing.
  if (cut(ticker, from, to)) return;
  for (const [k, p] of inflight) {
    const [t, f, until] = k.split('|');
    if (t === ticker && f <= from && until >= to) {
      await p;
      if (cut(ticker, from, to)) return;
    }
  }
  const run = fetchWindow(ticker, from, to);
  inflight.set(key, run);
  await run;
  inflight.delete(key);
}

async function fetchWindow(ticker: string, from: string, to: string) {
  const key = keyOf(ticker, from, to);
  adjustedHistory.set((s) => ({ v: s.v + 1, by: { ...s.by, [key]: { state: 'loading' } } }));
  let entry: Entry;
  try {
    const res = await window.arminDesktop!.eod!('tiingo', ticker, from, to);
    if (res.missing) entry = { state: 'error', message: `Needs ${res.missing} (PROVIDERS).` };
    else if (res.gated) entry = { state: 'error', message: `Tiingo is switched off (${res.gated} on PROVIDERS).` };
    else if (res.budget && !res.text) entry = { state: 'error', message: "Tiingo's request budget for the hour or day is spent; try again later." };
    else if (!res.text) entry = { state: 'error', message: res.error ?? `Tiingo answered HTTP ${res.status}.` };
    else {
      const parsed = parseTiingoAdjusted(res.text);
      entry = Array.isArray(parsed) ? (parsed.length ? { state: 'ok', bars: parsed } : { state: 'error', message: `Tiingo has no prices for ${ticker} from ${from} to ${to}.` }) : { state: 'error', message: parsed.error };
    }
  } catch (err) {
    entry = { state: 'error', message: `Tiingo did not answer: ${String((err as Error)?.message ?? err)}` };
  }
  adjustedHistory.set((s) => ({ v: s.v + 1, by: { ...s.by, [key]: entry } }));
}

/** The tickers' adjusted daily closes from `from` to `to`, asked one after another while a screen shows them. */
export function useAdjustedHistory(tickers: string[], from: string, to: string, enabled: boolean): Record<string, Entry | undefined> {
  adjustedHistory.use((s) => s.v);
  const key = `${tickers.join(',')}|${from}|${to}|${enabled}`;
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.arminDesktop?.eod !== 'function') return;
    let stop = false;
    void (async () => {
      for (const t of tickers) {
        if (stop) return;
        await load(t, from, to);
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const by = adjustedHistory.get().by;
  return Object.fromEntries(tickers.map((t) => [t, by[keyOf(t, from, to)]]));
}
