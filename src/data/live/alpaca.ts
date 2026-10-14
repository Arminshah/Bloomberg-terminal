import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * IEX quotes from Alpaca's market data API, asked by the desktop app's main process with the owner's keys
 * (electron/alpaca.cjs). On Alpaca's free plan the real-time feed is IEX: the trades and quotes of one
 * exchange, not the whole US market. So the last trade here is the last trade on IEX, the bid and offer are
 * IEX's own, and the day's volume and range count IEX trades only; every screen labels them "IEX only".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface IexSnapshot {
  /** Last trade on IEX: price, shares and time (ms). */
  last: number;
  lastSize: number;
  lastAt: number;
  /** IEX's own best bid and offer, with sizes, and when they were quoted. */
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  quoteAt: number;
  /** Today's bar from IEX trades only. */
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** The session the daily bar belongs to (ms at its start, as Alpaca stamps it). */
  dayAt: number;
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Alpaca stamps times in RFC 3339 with up to nine decimals; Date.parse wants three at most. */
export function alpacaTime(t: unknown): number {
  if (typeof t !== 'string') return NaN;
  return Date.parse(t.replace(/(\.\d{3})\d+/, '$1'));
}

/**
 * /v2/stocks/snapshots: {"AAPL": {latestTrade: {t, p, s, x}, latestQuote: {t, bp, bs, ap, as}, minuteBar,
 * dailyBar: {t, o, h, l, c, v}, prevDailyBar}, ...}. A symbol Alpaca does not know is left out or null.
 */
export function parseSnapshots(text: string): { data: Record<string, IexSnapshot> } | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'The answer was not JSON' };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { error: 'No snapshots in the answer' };
  if (typeof j.message === 'string' && !j.latestTrade) return { error: j.message.slice(0, 200) };
  // Some versions of the API wrap the map in "snapshots".
  const map = j.snapshots && typeof j.snapshots === 'object' ? j.snapshots : j;
  const out: Record<string, IexSnapshot> = {};
  for (const [symbol, s] of Object.entries<any>(map)) {
    if (!s || typeof s !== 'object') continue;
    const t = s.latestTrade ?? {};
    const q = s.latestQuote ?? {};
    const d = s.dailyBar ?? {};
    const snap: IexSnapshot = {
      last: num(t.p),
      lastSize: num(t.s),
      lastAt: alpacaTime(t.t),
      bid: num(q.bp),
      bidSize: num(q.bs),
      ask: num(q.ap),
      askSize: num(q.as),
      quoteAt: alpacaTime(q.t),
      open: num(d.o),
      high: num(d.h),
      low: num(d.l),
      close: num(d.c),
      volume: num(d.v),
      dayAt: alpacaTime(d.t),
    };
    if (snap.last > 0 && Number.isFinite(snap.lastAt)) out[symbol] = snap;
  }
  return { data: out };
}

/** Alpaca's symbol for a security: US-listed stocks only, class shares with a dot ("BRK.B"). */
export function alpacaSymbol(def: SecurityDef | undefined): string | null {
  return secTicker(def)?.replace(/-/g, '.') ?? null;
}

export interface IexState {
  state: 'loading' | 'ok' | 'error' | 'needs-key' | 'off' | 'none';
  data?: IexSnapshot;
  message?: string;
  /** When Alpaca's answer arrived. */
  at?: number;
  stale?: boolean;
}

export const iex = createStore<{ v: number; by: Record<string, IexState> }>({ v: 0, by: {} });

export function alpacaAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.alpaca === 'function';
}

/** How many screens want each symbol. */
const wanted = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
/** A screen asked for a symbol while a request was out: ask again as soon as it returns. */
let added = false;
/** Set when the keys are missing or the switch is off: no more asking until a screen opens again. */
let halted = false;

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void poll(), ms);
}

function setAll(symbols: string[], f: (old: IexState | undefined) => IexState) {
  iex.set((s) => {
    const by = { ...s.by };
    for (const sym of symbols) by[sym] = f(by[sym]);
    return { v: s.v + 1, by };
  });
}

/** One request for every symbol a screen shows (up to 20), every 5 seconds while IEX trades. */
async function poll() {
  timer = null;
  if (inflight) {
    added = true;
    return;
  }
  const symbols = [...wanted.keys()].slice(0, 20);
  if (!symbols.length || halted) return;
  inflight = true;
  added = false;
  let next = 5_000;
  try {
    const res = await window.arminDesktop!.alpaca!('snapshots', symbols.join(','));
    if (res.gated || res.missing || res.refused) {
      halted = true;
      const message = res.gated ? `Alpaca is switched off (${res.gated} on PROVIDERS).` : res.refused ? 'A configured Alpaca key has the wrong format.' : `Needs ${res.missing} (PROVIDERS).`;
      setAll(symbols, () => ({ state: res.gated ? 'off' : 'needs-key', message }));
    } else if (!res.text) {
      next = 30_000;
      setAll(symbols, (old) => ({ ...old, state: old?.data ? 'ok' : 'error', stale: !!old?.data, message: res.error ?? `Alpaca answered HTTP ${res.status}` }));
    } else {
      const parsed = parseSnapshots(res.text);
      if ('error' in parsed) {
        next = 30_000;
        setAll(symbols, (old) => ({ ...old, state: old?.data ? 'ok' : 'error', stale: !!old?.data, message: parsed.error }));
      } else {
        iex.set((s) => {
          const by = { ...s.by };
          for (const sym of symbols) {
            const snap = parsed.data[sym];
            by[sym] = snap ? { state: 'ok', data: snap, at: res.at, stale: res.stale } : { state: 'none', message: `No IEX trades for ${sym} in what Alpaca returned.`, at: res.at };
          }
          return { v: s.v + 1, by };
        });
        // Outside trading hours nothing new prints on IEX: ask once a minute instead of every 5 seconds.
        const newest = Math.max(0, ...symbols.map((sym) => parsed.data[sym]?.lastAt ?? 0));
        if (Date.now() - newest > 5 * 60_000) next = 60_000;
      }
    }
  } catch (err) {
    next = 30_000;
    setAll(symbols, (old) => ({ ...old, state: old?.data ? 'ok' : 'error', stale: !!old?.data, message: String((err as Error)?.message ?? err) }));
  } finally {
    inflight = false;
  }
  if (wanted.size && !halted) schedule(added ? 50 : next);
}

/** IEX's last trade, bid and offer for a US stock while a screen shows it; null for anything else. */
export function useIex(def: SecurityDef | undefined): IexState | null {
  const symbol = alpacaSymbol(def);
  const st = iex.use((s) => (symbol ? s.by[symbol] : undefined));
  useEffect(() => {
    if (!symbol || !alpacaAvailable()) return;
    wanted.set(symbol, (wanted.get(symbol) ?? 0) + 1);
    if (!iex.get().by[symbol]) setAll([symbol], () => ({ state: 'loading' }));
    // A screen opening asks again, also after the keys were missing: they may be set now.
    halted = false;
    schedule(50);
    return () => {
      const n = (wanted.get(symbol) ?? 1) - 1;
      if (n > 0) wanted.set(symbol, n);
      else wanted.delete(symbol);
      if (!wanted.size && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [symbol]);
  if (!symbol || !alpacaAvailable()) return null;
  return st ?? { state: 'loading' };
}
