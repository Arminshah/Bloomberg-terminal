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
  /** Last trade on IEX: price, shares and time (ms); NaN when the snapshot has quotes only. */
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
  /** Previous IEX daily bar, used only against a later IEX session. */
  prevOpen: number;
  prevHigh: number;
  prevLow: number;
  prevClose: number;
  prevVolume: number;
  prevDayAt: number;
}

const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;
const FRESH_FOR = 60_000;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const price = (v: unknown) => (num(v) > 0 ? num(v) : NaN);
const size = (v: unknown) => (num(v) >= 0 ? num(v) : NaN);

/** Alpaca stamps times in RFC 3339 with up to nine decimals; Date.parse wants three at most. */
export function alpacaTime(t: unknown): number {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(t)) return NaN;
  const [year, month, day] = t.slice(0, 10).split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return NaN;
  const at = Date.parse(t.replace(/(\.\d{3})\d+/, '$1'));
  // Empty API fields can carry the zero date, year 0001. It is not a market event.
  return at > 0 ? at : NaN;
}

/** Event age is independent of when an HTTP response was fetched. Quiet/closed exchanges can be old. */
export function iexFreshness(snapshot: IexSnapshot, now = Date.now()) {
  const fresh = (at: number) => Number.isFinite(at) && at <= now + 5_000 && now - at <= FRESH_FOR;
  return { tradeStale: !fresh(snapshot.lastAt), quoteStale: !fresh(snapshot.quoteAt) };
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
  if ('snapshots' in j && (!j.snapshots || typeof j.snapshots !== 'object' || Array.isArray(j.snapshots))) return { error: 'No snapshots in the answer' };
  const map = j.snapshots ?? j;
  const out: Record<string, IexSnapshot> = {};
  for (const [symbol, s] of Object.entries<any>(map)) {
    if (!SYMBOL.test(symbol) || !s || typeof s !== 'object' || Array.isArray(s)) continue;
    const t = s.latestTrade ?? {};
    const q = s.latestQuote ?? {};
    const d = s.dailyBar ?? {};
    const p = s.prevDailyBar ?? {};
    const snap: IexSnapshot = {
      last: price(t.p),
      lastSize: size(t.s),
      lastAt: alpacaTime(t.t),
      bid: price(q.bp),
      bidSize: size(q.bs),
      ask: price(q.ap),
      askSize: size(q.as),
      quoteAt: alpacaTime(q.t),
      open: price(d.o),
      high: price(d.h),
      low: price(d.l),
      close: price(d.c),
      volume: size(d.v),
      dayAt: alpacaTime(d.t),
      prevOpen: price(p.o),
      prevHigh: price(p.h),
      prevLow: price(p.l),
      prevClose: price(p.c),
      prevVolume: size(p.v),
      prevDayAt: alpacaTime(p.t),
    };
    if (!Number.isFinite(snap.lastAt) || !Number.isFinite(snap.last)) snap.last = snap.lastSize = snap.lastAt = NaN;
    if (!Number.isFinite(snap.quoteAt) || !(snap.bid > 0 || snap.ask > 0)) snap.bid = snap.bidSize = snap.ask = snap.askSize = snap.quoteAt = NaN;
    if (!Number.isFinite(snap.dayAt)) snap.open = snap.high = snap.low = snap.close = snap.volume = NaN;
    if (!Number.isFinite(snap.prevDayAt)) snap.prevOpen = snap.prevHigh = snap.prevLow = snap.prevClose = snap.prevVolume = NaN;
    // An IEX quote remains useful even if this stock has not traded on IEX.
    if (Number.isFinite(snap.lastAt) || Number.isFinite(snap.quoteAt)) out[symbol] = snap;
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
/** Rotate batches so opening more than twenty symbols never starves the later ones. */
let cursor = 0;

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
  const all = [...wanted.keys()];
  const start = cursor % Math.max(1, all.length);
  const symbols = [...all.slice(start), ...all.slice(0, start)].slice(0, 20);
  cursor = (start + symbols.length) % Math.max(1, all.length);
  if (!symbols.length || halted) return;
  inflight = true;
  added = false;
  let next = 5_000;
  try {
    const res = await window.arminDesktop!.alpaca!('snapshots', symbols.join(','));
    if (res.gated || res.missing || res.refused) {
      halted = true;
      const message = res.gated ? `Alpaca is switched off (${res.gated} on PROVIDERS).` : res.refused ? 'A configured Alpaca key has the wrong format.' : `Needs ${res.missing} (PROVIDERS).`;
      setAll([...wanted.keys()], () => ({ state: res.gated ? 'off' : 'needs-key', message }));
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
            by[sym] = snap
              ? { state: 'ok', data: snap, at: res.at ?? Date.now(), stale: res.stale, message: res.error ?? (res.budget ? "Alpaca's request budget is spent." : undefined) }
              : { state: 'none', message: `No timed IEX trades or quotes for ${sym} in what Alpaca returned.`, at: res.at };
          }
          return { v: s.v + 1, by };
        });
        // An inactive exchange can be quiet or closed. Slow down only after every watched batch fits.
        const newest = Math.max(0, ...symbols.flatMap((sym) => [parsed.data[sym]?.lastAt, parsed.data[sym]?.quoteAt]).filter((at): at is number => Number.isFinite(at)));
        if (all.length <= 20 && Date.now() - newest > 5 * 60_000) next = 60_000;
        if (res.stale || res.budget) next = Math.max(next, 30_000);
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

/** After keys or switches change on PROVIDERS: ask again if a screen is waiting. */
export function retryIex() {
  halted = false;
  if (wanted.size) schedule(50);
}

/** Keep a stock's IEX snapshot current while a screen or a quote consumer needs it. */
export function acquireIex(symbol: string): () => void {
  if (!SYMBOL.test(symbol) || !alpacaAvailable()) return () => {};
  wanted.set(symbol, (wanted.get(symbol) ?? 0) + 1);
  if (!iex.get().by[symbol]) setAll([symbol], () => ({ state: 'loading' }));
  halted = false;
  if (inflight) added = true;
  schedule(50);
  let watching = true;
  return () => {
    if (!watching) return;
    watching = false;
    const n = (wanted.get(symbol) ?? 1) - 1;
    if (n > 0) wanted.set(symbol, n);
    else wanted.delete(symbol);
    if (!wanted.size && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** IEX's last trade, bid and offer for a US stock while a screen shows it; null for anything else. */
export function useIex(def: SecurityDef | undefined): IexState | null {
  const symbol = alpacaSymbol(def);
  const st = iex.use((s) => (symbol ? s.by[symbol] : undefined));
  useEffect(() => {
    if (symbol) return acquireIex(symbol);
  }, [symbol]);
  if (!symbol || !alpacaAvailable()) return null;
  return st ?? { state: 'loading' };
}
