import { engine } from '../market';
import { DAY_MS, dayNum } from '../calendar';
import type { ExtBar, ExtendedPrice, ExtQuote } from '../engine';
import type { SecurityDef } from '../types';
import { CURRENCY_DEFS } from '../universe';
import { settings } from '../../terminal/settings';
import { terminal } from '../../terminal/state';
import { watchlists } from '../../terminal/userdata';
import { setFeed } from './status';
import { YahooStream, type Tick } from './ystream';
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
  /** Trades every day (crypto); other markets' weekend trading belongs to Monday's session. */
  allDays: boolean;
  /** Exchange offset from UTC in ms, from the source. */
  gmtOffset?: number;
  /** Minutes the source delays this market. */
  delay?: number;
}

/** Futures with a continuous Yahoo contract; the rest keep their fair value to the real index. */
const FUTURES: Record<string, string> = { 'ES1 Index': 'ES=F', 'NQ1 Index': 'NQ=F', 'DM1 Index': 'YM=F', 'RTY1 Index': 'RTY=F' };

/**
 * The Yahoo symbol for a security, or undefined when it has none. In the
 * desktop app Yahoo is the source for every quoted line it covers: currency
 * pairs and crypto included, so each price is the market's own quote.
 */
export function yahooSymbolFor(d: SecurityDef): string | undefined {
  if (d.dynamic) return d.dynamic.source === 'yahoo' ? d.dynamic.symbol : d.ticker.split(' ')[0].replace('/', '-');
  if (d.fut) return FUTURES[d.id];
  if (d.cls === 'bond') return undefined;
  if (treasuryAvailable() && TREASURY_IDS.has(d.id)) return undefined; // official Treasury curve instead
  if (!engine.realOnly) {
    if (d.cls === 'fx' && d.fx) return undefined; // the browser derives crosses from the currencies
    if (d.cls === 'crypto' && settings.get().liveCrypto) return undefined; // Coinbase streams these
  }
  return d.yahoo;
}

function targets(): Target[] {
  const out: Target[] = [];
  for (const d of engine.securities) {
    const symbol = yahooSymbolFor(d);
    if (symbol) out.push({ id: d.id, symbol, invert: false, allDays: d.cls === 'crypto' });
  }
  for (const c of CURRENCY_DEFS) out.push({ id: c.id, symbol: `${c.ticker}=X`, invert: true, allDays: false });
  return out;
}

const inv = (x: number) => (x ? 1 / x : NaN);

/** Exchange-local date of a Unix timestamp (seconds). */
const localDay = (ts: number, gmtOffset: number) => dayNum((ts + gmtOffset) * 1000);

/**
 * The session a price belongs to: the exchange-local date, except that
 * futures and currencies trading from Sunday evening count in Monday's
 * session, as their daily history does. Crypto trades every day.
 */
export function sessionDay(ms: number, gmtOffsetMs: number, allDays: boolean): number {
  const d = dayNum(ms + gmtOffsetMs);
  if (allDays) return d;
  const wd = new Date(d * DAY_MS).getUTCDay();
  return wd === 6 ? d + 2 : wd === 0 ? d + 1 : d;
}

/**
 * A bid and offer only if they make sense: a crossed pair (bid above offer)
 * or a side far from the last price is a stale quote from the source, and is
 * dropped rather than shown. Undefined stays undefined (no information).
 */
export function saneTouch(bid: number | undefined, ask: number | undefined, last: number): [number | undefined, number | undefined] {
  const ok = (x: number | undefined) => (x === undefined ? undefined : x > 0 && Number.isFinite(x) && Math.abs(x / last - 1) <= 0.05 ? x : NaN);
  let b = ok(bid);
  let a = ok(ask);
  if (b !== undefined && a !== undefined && b > a) b = a = NaN;
  return [b, a];
}

/** Minutes the source delays a market's prices; US stocks come real time from Nasdaq. */
export function delayOf(q: Json): number {
  const d = Number(q?.exchangeDataDelayedBy);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return /real ?time/i.test(String(q?.quoteSourceName ?? '')) ? 0 : d;
}

export interface Dividend {
  day: number;
  amount: number;
}

/** Real dividends per security, from the history request. */
export const realDividends = new Map<string, Dividend[]>();
/** Latest raw Yahoo quote per security (ratios, market cap, earnings date). */
export const yahooQuotes = new Map<string, Json>();

export function barsFromChart(chart: Json, invert = false, allDays = false): { bars: ExtBar[]; dividends: Dividend[]; gmtOffset: number } {
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
    const day = sessionDay(ts * 1000, gmtOffset * 1000, allDays);
    const v = invert ? 0 : (q.volume?.[i] ?? 0);
    const prev = bars[bars.length - 1];
    if (prev && prev.day === day) {
      // A weekend bar folds into Monday's session; a repeated date is the newer of the two.
      const weekend = localDay(ts, gmtOffset) !== day;
      bars[bars.length - 1] = weekend ? { day, o: prev.o, h: Math.max(prev.h, h), l: Math.min(prev.l, l), c, v: prev.v + v } : { day, o, h, l, c, v };
    } else if (!prev || day > prev.day) {
      bars.push({ day, o, h, l, c, v });
    } else {
      // Sunday's bar (rolled to Monday) arriving before Monday's own: merge into it.
      const k = bars.findIndex((b) => b.day === day);
      if (k >= 0) bars[k] = { day, o: bars[k].o, h: Math.max(bars[k].h, h), l: Math.min(bars[k].l, l), c, v: bars[k].v + v };
    }
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
export function extQuote(q: Json, invert: boolean, allDays = false): ExtQuote | null {
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
    day: sessionDay(t * 1000, off, allDays),
    // A full quote without a bid or offer means there is none now.
    bid: n(q.bid) ?? NaN,
    ask: n(q.ask) ?? NaN,
    marketOpen: q.marketState === 'REGULAR',
    delay: delayOf(q),
  };
  [base.bid, base.ask] = saneTouch(base.bid, base.ask, last);
  if (!invert) return base;
  return {
    ...base,
    last: inv(base.last),
    prevClose: base.prevClose && inv(base.prevClose),
    open: base.open && inv(base.open),
    high: base.low && inv(base.low),
    low: base.high && inv(base.high),
    bid: base.ask !== undefined ? inv(base.ask) : undefined,
    ask: base.bid !== undefined ? inv(base.bid) : undefined,
    volume: 0,
  };
}

/** The pre-market or after-hours price of a stock while its regular session is shut. */
export function extendedFromQuote(q: Json): ExtendedPrice | null {
  const state = String(q?.marketState ?? '');
  const post = Number(q?.postMarketPrice);
  const pre = Number(q?.preMarketPrice);
  if ((state === 'PRE' || state === 'PREPRE') && pre > 0) return { price: pre, time: Number(q.preMarketTime) * 1000, session: 'pre' };
  if (state !== 'REGULAR' && post > 0) return { price: post, time: Number(q.postMarketTime) * 1000, session: 'post' };
  return null;
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
  private stream: YahooStream | null = null;
  private pendingTick = new Map<string, Tick>();
  /** A big jump waits for a second tick to confirm it before it is shown. */
  private suspect = new Map<string, Tick>();
  private lastPollOk = Date.now();
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private stale = false;
  /** Streamed changes are drawn a few times a second rather than on every tick. */
  private dirty = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private changed(id: string) {
    this.dirty.add(id);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const ids = [...this.dirty];
      this.dirty.clear();
      engine.flush(ids);
    }, 150);
  }

  start() {
    setFeed('market', 'connecting', 'Yahoo Finance: loading history');
    engine.demand = (id) => this.wantIntraday(id);
    this.stream = new YahooStream(
      (t) => this.applyTick(t),
      (up) => this.status(up),
    );
    this.stream.start();
    this.sync();
    // Whatever a panel opens loads ahead of the rest of the queue.
    this.unsubTerminal = terminal.subscribe(() => this.prioritize());
    void this.pollQuotes();
    this.intradayTimer = setInterval(() => this.refreshIntraday(), 20_000);
    this.staleTimer = setInterval(() => this.checkStale(), 15_000);
  }

  /** One place for the feed's state line: loading, streaming or polling. */
  private status(_streaming?: boolean) {
    if (this.stale) return;
    const loading = this.historyQueue.length > 0 || this.historyActive > 0;
    const how = this.stream?.connected ? 'streaming' : 'polling every 10 s';
    setFeed('market', loading ? 'connecting' : 'live', `Yahoo Finance · ${this.loaded.size} securities on real data · ${how}`);
  }

  /** If neither the stream nor the quote service has answered for 90 seconds, open markets are marked stale. */
  private checkStale() {
    const streamOk = !!this.stream?.connected && Date.now() - (this.stream?.lastMessage ?? 0) < 120_000;
    const stale = !streamOk && Date.now() - this.lastPollOk > 90_000;
    if (stale === this.stale) return;
    this.stale = stale;
    engine.setStale(this.loaded, stale);
    engine.flush(this.loaded);
    if (stale) setFeed('market', 'error', 'Connection to Yahoo Finance lost: open markets show their last price, marked STALE');
    else this.status(streamOk);
  }

  /** Applies one streamed price, after the bad-tick check. */
  private applyTick(tick: Tick) {
    const t = this.bySymbol.get(tick.id);
    if (!t) return;
    if (!this.loaded.has(t.id)) {
      this.pendingTick.set(t.id, tick);
      return;
    }
    const def = engine.get(t.id);
    const q = engine.quote(t.id);
    // Stocks: only regular-session trades move the last price; others are shown as extended hours.
    const stock = def?.cls === 'equity';
    if (stock && tick.marketHours !== 1) {
      engine.setExtended(t.id, { price: tick.price, time: tick.time, session: tick.marketHours === 0 ? 'pre' : tick.marketHours === 2 ? 'post' : 'overnight' });
      this.changed(t.id);
      return;
    }
    const price = t.invert ? inv(tick.price) : tick.price;
    if (q && Number.isFinite(q.last) && q.last > 0 && Math.abs(tick.time - q.time) < 120_000) {
      const jump = Math.abs(price / q.last - 1);
      const limit = def?.cls === 'crypto' ? 0.08 : def?.cls === 'fx' || t.id.startsWith('CCY:') ? 0.03 : 0.06;
      if (jump > limit) {
        const held = this.suspect.get(t.id);
        const heldPx = held ? (t.invert ? inv(held.price) : held.price) : NaN;
        if (!held || Math.abs(price / heldPx - 1) > 0.005) {
          this.suspect.set(t.id, tick);
          return;
        }
      }
    }
    this.suspect.delete(t.id);
    const inverted = (x: number | undefined) => (x === undefined ? undefined : t.invert ? inv(x) : x);
    const [bid, ask] = saneTouch(t.invert ? inverted(tick.ask) : tick.bid, t.invert ? inverted(tick.bid) : tick.ask, price);
    engine.setExternalQuote(t.id, {
      last: price,
      time: tick.time,
      day: sessionDay(tick.time, t.gmtOffset ?? 0, t.allDays),
      prevClose: inverted(tick.previousClose),
      open: inverted(tick.openPrice),
      high: t.invert ? inverted(tick.dayLow) : tick.dayHigh,
      low: t.invert ? inverted(tick.dayHigh) : tick.dayLow,
      volume: t.invert ? undefined : tick.dayVolume,
      bid,
      ask,
      marketOpen: true,
      delay: t.delay,
    });
    this.changed(t.id);
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
    this.stream?.stop();
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    if (this.intradayTimer) clearInterval(this.intradayTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
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
    this.stream?.subscribe(fresh.map((t) => t.symbol));
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
    const t: Target = { id, symbol, invert: false, allDays: engine.get(id)?.cls === 'crypto' };
    this.bySymbol.set(symbol, t);
    this.stream?.subscribe([symbol]);
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
        if (!this.historyQueue.length && !this.historyActive) this.status();
      });
    }
  }

  private async loadHistory(t: Target) {
    try {
      const chart = await yahooGet(`/v8/finance/chart/${encodeURIComponent(t.symbol)}?range=10y&interval=1d&events=div%2Csplit&includePrePost=false`);
      const { bars, dividends, gmtOffset } = barsFromChart(chart, t.invert, t.allDays);
      // Some lines come with no history beyond the current session; the quote still makes them real.
      if (bars.length < 1) return;
      t.gmtOffset = gmtOffset * 1000;
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
      const eq = extQuote(q, t.invert, t.allDays);
      if (eq) engine.setExternalQuote(t.id, eq);
      this.pendingQuote.delete(t.id);
    }
    const tick = this.pendingTick.get(t.id);
    this.pendingTick.delete(t.id);
    if (tick && tick.time > (engine.quote(t.id)?.time ?? 0)) this.applyTick(tick);
    engine.flush([t.id]);
    this.status();
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
          if (Number.isFinite(Number(q.gmtOffSetMilliseconds))) t.gmtOffset = Number(q.gmtOffSetMilliseconds);
          t.delay = delayOf(q);
          const def = engine.get(t.id);
          const shares = def ? impliedShares(def, Number(q.marketCap), Number(q.regularMarketPrice)) : NaN;
          if (def?.eq && Number.isFinite(shares)) def.eq.shares = shares;
          if (!this.loaded.has(t.id)) {
            this.pendingQuote.set(t.id, q);
            continue;
          }
          const eq = extQuote(q, t.invert, t.allDays);
          // A streamed price newer than the polled one stays.
          if (eq && eq.time >= (engine.quote(t.id)?.time ?? 0) - 1000) {
            engine.setExternalQuote(t.id, eq);
            changed.push(t.id);
          }
          const x = engine.get(t.id)?.cls === 'equity' ? extendedFromQuote(q) : null;
          if (x) engine.setExtended(t.id, x);
        }
      } catch {
        this.failures++;
      }
    }
    if (changed.length) engine.flush(changed);
    if (ok) {
      this.failures = 0;
      this.lastPollOk = Date.now();
    } else if (!this.loaded.size) setFeed('market', 'error', 'Yahoo Finance unreachable: no prices until it answers');
    // The stream carries prices as they change; polling fills in the rest (volume, bid and offer,
    // market state) every 30 s, or every 10 s while the stream is down. Back off on errors.
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const streaming = !!this.stream?.connected;
    const base = hidden ? 60_000 : streaming ? 30_000 : 10_000;
    const delay = Math.min(120_000, base * 2 ** Math.min(3, this.failures));
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
