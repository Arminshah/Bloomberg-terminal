import { engine } from '../market';
import { dayNum } from '../calendar';
import type { ExtBar, ExtQuote } from '../engine';
import type { SecurityDef } from '../types';
import { CURRENCY_DEFS } from '../universe';
import { settings } from '../../terminal/settings';
import { terminal } from '../../terminal/state';
import { watchlists } from '../../terminal/userdata';
import { setFeed } from './status';
import { TREASURY_IDS, treasuryAvailable } from './ust';

/**
 * Real market data for the desktop app from Yahoo Finance, fetched by the
 * Electron main process (no key, no browser cross-origin limits). Every line
 * with a Yahoo symbol switches from the simulator to real daily history, real
 * quotes and real intraday bars, and stops moving while its market is closed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export function desktopData(): boolean {
  return typeof window !== 'undefined' && !!window.arminDesktop?.yahoo;
}

export async function yahooGet(path: string): Promise<Json> {
  const res = await window.arminDesktop!.yahoo(path);
  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('Yahoo rate limit');
  if (res.status !== 200) throw new Error(`Yahoo ${res.status}`);
  return res.data;
}

interface Target {
  id: string;
  symbol: string;
  /** Yahoo quotes the currency per dollar; the engine keeps dollars per currency. */
  invert: boolean;
  /** Failed history requests so far. */
  tries?: number;
}

/** Futures with a continuous Yahoo contract; the rest keep their fair value to the real index. */
const FUTURES: Record<string, string> = { 'ES1 Index': 'ES=F', 'NQ1 Index': 'NQ=F', 'DM1 Index': 'YM=F', 'RTY1 Index': 'RTY=F' };

/** The Yahoo symbol for a security, or undefined when it has none. */
export function yahooSymbolFor(d: SecurityDef): string | undefined {
  if (d.dynamic) return d.dynamic.source === 'yahoo' ? d.dynamic.symbol : d.ticker.split(' ')[0].replace('/', '-');
  if (d.fut) return FUTURES[d.id];
  if (d.cls === 'fx' && d.fx) return undefined; // crosses are derived from the currencies below
  if (d.cls === 'bond') return undefined;
  if (treasuryAvailable() && TREASURY_IDS.has(d.id)) return undefined; // official Treasury curve instead
  if (d.cls === 'crypto' && settings.get().liveCrypto) return undefined; // Coinbase streams these
  return d.yahoo;
}

function targets(): Target[] {
  const out: Target[] = [];
  for (const d of engine.securities) {
    const symbol = yahooSymbolFor(d);
    if (symbol) out.push({ id: d.id, symbol, invert: false });
  }
  for (const c of CURRENCY_DEFS) out.push({ id: c.id, symbol: `${c.ticker}=X`, invert: true });
  return out;
}

const inv = (x: number) => (x ? 1 / x : NaN);

/** Exchange-local date of a Unix timestamp (seconds). */
const localDay = (ts: number, gmtOffset: number) => dayNum((ts + gmtOffset) * 1000);

export interface Dividend {
  day: number;
  amount: number;
}

/** Real dividends per security, from the history request. */
export const realDividends = new Map<string, Dividend[]>();
/** Latest raw Yahoo quote per security (ratios, market cap, earnings date). */
export const yahooQuotes = new Map<string, Json>();

export function barsFromChart(chart: Json, invert = false): { bars: ExtBar[]; dividends: Dividend[]; gmtOffset: number } {
  const r = chart?.chart?.result?.[0];
  const gmtOffset = Number(r?.meta?.gmtoffset ?? 0);
  if (!r?.timestamp) return { bars: [], dividends: [], gmtOffset };
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: ExtBar[] = [];
  r.timestamp.forEach((ts: number, i: number) => {
    let c = q.close?.[i];
    if (c == null || !Number.isFinite(c) || c === 0) return;
    let o = q.open?.[i] ?? c;
    let h = q.high?.[i] ?? c;
    let l = q.low?.[i] ?? c;
    if (invert) {
      [c, o, h, l] = [inv(c), inv(o), inv(l), inv(h)];
    }
    const day = localDay(ts, gmtOffset);
    const bar = { day, o, h, l, c, v: invert ? 0 : (q.volume?.[i] ?? 0) };
    if (bars.length && bars[bars.length - 1].day === day) bars[bars.length - 1] = bar;
    else bars.push(bar);
  });
  const dividends: Dividend[] = Object.values(r.events?.dividends ?? {})
    .map((x: Json) => ({ day: localDay(x.date, gmtOffset), amount: Number(x.amount) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => a.day - b.day);
  return { bars, dividends, gmtOffset };
}

/**
 * Share count in millions implied by the provider's market cap and price, so
 * market cap here matches the provider's across share classes and ADRs. A
 * result about 100 times off the current count is a pence/pounds mix-up and
 * is scaled back.
 */
export function impliedShares(d: SecurityDef, cap: number, px: number): number {
  if (!d.eq || !(cap > 0) || !(px > 0)) return NaN;
  let sh = cap / (d.minor ? px / 100 : px) / 1e6;
  const seed = d.eq.shares;
  if (seed > 0) {
    if (sh / seed > 30) sh /= 100;
    else if (seed / sh > 30) sh *= 100;
  }
  return sh;
}

/** Engine quote from a Yahoo v7 quote. */
export function extQuote(q: Json, invert: boolean): ExtQuote | null {
  const last = Number(q.regularMarketPrice);
  const t = Number(q.regularMarketTime);
  if (!Number.isFinite(last) || last === 0 || !Number.isFinite(t)) return null;
  const off = Number(q.gmtOffSetMilliseconds ?? 0);
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x !== 0 ? x : undefined;
  };
  const base: ExtQuote = {
    last,
    prevClose: n(q.regularMarketPreviousClose),
    open: n(q.regularMarketOpen),
    high: n(q.regularMarketDayHigh),
    low: n(q.regularMarketDayLow),
    volume: Number.isFinite(Number(q.regularMarketVolume)) ? Number(q.regularMarketVolume) : undefined,
    time: t * 1000,
    day: dayNum(t * 1000 + off),
    bid: n(q.bid),
    ask: n(q.ask),
    marketOpen: q.marketState === 'REGULAR',
  };
  if (!invert) return base;
  return {
    ...base,
    last: inv(base.last),
    prevClose: base.prevClose && inv(base.prevClose),
    open: base.open && inv(base.open),
    high: base.low && inv(base.low),
    low: base.high && inv(base.high),
    bid: base.ask && inv(base.ask),
    ask: base.bid && inv(base.bid),
    volume: 0,
  };
}

// ------------------------------------------------------------------ service

class YahooData {
  private stopped = false;
  private bySymbol = new Map<string, Target>();
  private loaded = new Set<string>();
  private pendingQuote = new Map<string, Json>();
  private historyQueue: Target[] = [];
  private historyActive = 0;
  private intradayAt = new Map<string, number>();
  private intradayWanted = new Map<string, number>();
  private intradayActive = 0;
  private quoteTimer: ReturnType<typeof setTimeout> | null = null;
  private intradayTimer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private known = 0;

  start() {
    setFeed('market', 'connecting', 'Yahoo Finance: loading history');
    engine.demand = (id) => this.wantIntraday(id);
    this.sync();
    // Whatever a panel opens loads ahead of the rest of the queue.
    this.unsubTerminal = terminal.subscribe(() => this.prioritize());
    void this.pollQuotes();
    this.intradayTimer = setInterval(() => this.refreshIntraday(), 20_000);
  }

  private unsubTerminal: (() => void) | null = null;

  private prioritize() {
    const want = new Set<string>();
    const st = terminal.get();
    for (const p of st.panels) {
      const r = p.history[p.idx];
      if (r?.sec) want.add(r.sec);
    }
    if (!want.size) return;
    const front = this.historyQueue.filter((t) => want.has(t.id));
    if (!front.length) return;
    this.historyQueue = [...front, ...this.historyQueue.filter((t) => !want.has(t.id))];
  }

  stop() {
    this.stopped = true;
    this.unsubTerminal?.();
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    if (this.intradayTimer) clearInterval(this.intradayTimer);
    engine.demand = undefined;
  }

  /** Picks up securities added at runtime (online lookups). */
  sync() {
    if (engine.securities.length === this.known) return;
    this.known = engine.securities.length;
    const fresh: Target[] = [];
    for (const t of targets()) {
      if (this.bySymbol.has(t.symbol)) continue;
      this.bySymbol.set(t.symbol, t);
      fresh.push(t);
    }
    // Lines on screen first, then watchlists, then everything else.
    const shown = new Set<string>();
    for (const p of terminal.get().panels) for (const r of p.history) if (r.sec) shown.add(r.sec);
    for (const l of watchlists.get().lists) for (const id of l.ids) shown.add(id);
    fresh.sort((a, b) => Number(shown.has(b.id)) - Number(shown.has(a.id)));
    this.historyQueue.push(...fresh);
    this.prioritize();
    this.pumpHistory();
  }

  /** History already fetched elsewhere (an online lookup) can be adopted directly. */
  adopt(id: string, symbol: string, bars: ExtBar[], dividends: Dividend[]) {
    const t: Target = { id, symbol, invert: false };
    this.bySymbol.set(symbol, t);
    this.historyQueue = this.historyQueue.filter((x) => x.id !== id);
    this.applyHistory(t, bars, dividends);
    this.known = engine.securities.length;
  }

  private pumpHistory() {
    while (!this.stopped && this.historyActive < 6 && this.historyQueue.length) {
      const t = this.historyQueue.shift()!;
      this.historyActive++;
      void this.loadHistory(t).finally(() => {
        this.historyActive--;
        this.pumpHistory();
        if (!this.historyQueue.length && !this.historyActive) setFeed('market', 'live', `Yahoo Finance · ${this.loaded.size} securities on real data`);
      });
    }
  }

  private async loadHistory(t: Target) {
    try {
      const chart = await yahooGet(`/v8/finance/chart/${encodeURIComponent(t.symbol)}?range=10y&interval=1d&events=div%2Csplit&includePrePost=false`);
      const { bars, dividends } = barsFromChart(chart, t.invert);
      // Too little history from the source: the line stays simulated and marked SIM.
      if (bars.length < 2) return;
      this.applyHistory(t, bars, dividends);
    } catch {
      // A network error or rate limit: try again later, three times at most.
      const tries = (t.tries ?? 0) + 1;
      if (tries <= 3 && !this.stopped) {
        setTimeout(() => {
          if (this.stopped || this.loaded.has(t.id)) return;
          this.historyQueue.push({ ...t, tries });
          this.pumpHistory();
        }, 5_000 * 2 ** tries);
      }
    }
  }

  private applyHistory(t: Target, bars: ExtBar[], dividends: Dividend[]) {
    engine.setExternalDaily(t.id, bars);
    if (dividends.length) realDividends.set(t.id, dividends);
    this.loaded.add(t.id);
    const q = this.pendingQuote.get(t.id);
    if (q) {
      const eq = extQuote(q, t.invert);
      if (eq) engine.setExternalQuote(t.id, eq);
      this.pendingQuote.delete(t.id);
    }
    engine.flush([t.id]);
    setFeed('market', this.historyQueue.length || this.historyActive > 1 ? 'connecting' : 'live', `Yahoo Finance · ${this.loaded.size} securities on real data`);
  }

  private async pollQuotes() {
    if (this.stopped) return;
    this.sync();
    const all = [...this.bySymbol.values()];
    const changed: string[] = [];
    let ok = 0;
    for (let i = 0; i < all.length; i += 50) {
      const batch = all.slice(i, i + 50);
      try {
        const res = await yahooGet(`/v7/finance/quote?symbols=${batch.map((b) => encodeURIComponent(b.symbol)).join(',')}`);
        for (const q of (res?.quoteResponse?.result ?? []) as Json[]) {
          const t = this.bySymbol.get(q.symbol);
          if (!t) continue;
          ok++;
          yahooQuotes.set(t.id, q);
          const def = engine.get(t.id);
          const shares = def ? impliedShares(def, Number(q.marketCap), Number(q.regularMarketPrice)) : NaN;
          if (def?.eq && Number.isFinite(shares)) def.eq.shares = shares;
          if (!this.loaded.has(t.id)) {
            this.pendingQuote.set(t.id, q);
            continue;
          }
          const eq = extQuote(q, t.invert);
          if (eq) {
            engine.setExternalQuote(t.id, eq);
            changed.push(t.id);
          }
        }
      } catch {
        this.failures++;
      }
    }
    if (changed.length) engine.flush(changed);
    if (ok) this.failures = 0;
    else if (!this.loaded.size) setFeed('market', 'error', 'Yahoo Finance unreachable; using the simulator');
    // Every 10 s while the window is in front, once a minute behind; back off on errors.
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const delay = Math.min(120_000, (hidden ? 60_000 : 10_000) * 2 ** Math.min(3, this.failures));
    this.quoteTimer = setTimeout(() => void this.pollQuotes(), delay);
  }

  private wantIntraday(id: string) {
    this.intradayWanted.set(id, Date.now());
    const at = this.intradayAt.get(id) ?? 0;
    if (Date.now() - at > 60_000) void this.loadIntraday(id);
  }

  private refreshIntraday() {
    const now = Date.now();
    for (const [id, t] of this.intradayWanted) {
      if (now - t > 120_000) this.intradayWanted.delete(id);
      else if (now - (this.intradayAt.get(id) ?? 0) > 60_000) void this.loadIntraday(id);
    }
  }

  private async loadIntraday(id: string) {
    const t = [...this.bySymbol.values()].find((x) => x.id === id);
    if (!t || !this.loaded.has(id) || this.intradayActive >= 3) return;
    this.intradayAt.set(id, Date.now());
    this.intradayActive++;
    try {
      const chart = await yahooGet(`/v8/finance/chart/${encodeURIComponent(t.symbol)}?range=1d&interval=1m&includePrePost=false`);
      const r = chart?.chart?.result?.[0];
      if (!r?.timestamp) return;
      const gmt = Number(r.meta?.gmtoffset ?? 0);
      const q = r.indicators?.quote?.[0] ?? {};
      const bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
      r.timestamp.forEach((ts: number, i: number) => {
        let c = q.close?.[i];
        if (c == null || !Number.isFinite(c) || c === 0) return;
        let o = q.open?.[i] ?? c;
        let h = q.high?.[i] ?? c;
        let l = q.low?.[i] ?? c;
        if (t.invert) [c, o, h, l] = [inv(c), inv(o), inv(l), inv(h)];
        bars.push({ t: ts * 1000, o, h, l, c, v: t.invert ? 0 : (q.volume?.[i] ?? 0) });
      });
      if (!bars.length) return;
      engine.setExternalIntraday(id, bars, 60_000, localDay(r.timestamp[r.timestamp.length - 1], gmt));
      engine.flush([id]);
    } catch {
      /* try again on the next request */
    } finally {
      this.intradayActive--;
    }
  }
}

let service: YahooData | null = null;

/** Starts real market data in the desktop app; a no-op in the browser. */
export function startYahooData(): () => void {
  if (!desktopData()) return () => undefined;
  service = new YahooData();
  service.start();
  const unsub = engine.subscribe(() => service?.sync());
  return () => {
    unsub();
    service?.stop();
    service = null;
  };
}

/** Hands a looked-up security's history straight to the real-data service. */
export function adoptYahooHistory(id: string, symbol: string, bars: ExtBar[], dividends: Dividend[] = []) {
  service?.adopt(id, symbol, bars, dividends);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
