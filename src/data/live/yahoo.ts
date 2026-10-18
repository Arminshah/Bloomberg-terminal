import { engine } from '../market';
import { createStore } from '../../core/store';
import { DAY_MS, dayNum } from '../calendar';
import type { ExtBar, ExtendedPrice, ExtQuote, Timing } from '../engine';
import type { SecurityDef } from '../types';
import { CURRENCY_DEFS } from '../universe';
import { settings } from '../../terminal/settings';
import { terminal } from '../../terminal/state';
import { watchlists } from '../../terminal/userdata';
import { setFeed } from './status';
import { YahooStream, type Tick } from './ystream';
import { TREASURY_IDS, treasuryAvailable } from './ust';
import { krakenOwns, whenKrakenHandsBack } from './kraken';
import { iexOwns } from './iex-engine';

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

/** How every Yahoo-sourced value is labelled. */
export const YAHOO_PROVIDER = 'Yahoo Finance';

/** Yahoo prices are switched off in the provider settings (YAHOO_PRICES_ENABLED). */
export class YahooDisabled extends Error {
  constructor() {
    super('Yahoo Finance prices are switched off');
  }
}

/**
 * Whether Yahoo refuses this computer's session for its quote and company endpoints (no cookie it accepts,
 * as in the EU until its cookies are accepted). Charts, history, statements and search work either way.
 */
export const yahooSession = createStore({ refused: false, at: 0 });

export async function yahooGet(path: string): Promise<Json> {
  const res = await window.arminDesktop!.yahoo(path);
  if (res.disabled) throw new YahooDisabled();
  if (res.session === false) {
    if (!yahooSession.get().refused) yahooSession.set({ refused: true, at: Date.now() });
    throw new Error('Yahoo refused the session');
  }
  if (res.status === 200 && yahooSession.get().refused && (path.startsWith('/v7/') || path.startsWith('/v10/'))) yahooSession.set({ refused: false, at: Date.now() });
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
  /** Minutes the source says it delays this market. */
  delay?: number;
  /** What the source says about timing, from the latest full quote. */
  timing?: Timing;
  sourceName?: string;
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
  if (krakenOwns(d.id)) return undefined; // the exchange's own prices instead
  if (!engine.realOnly) {
    if (d.cls === 'fx' && d.fx) return undefined; // the browser derives crosses from the currencies
    if (d.cls === 'crypto' && settings.get().liveCrypto) return undefined; // Coinbase streams these
  }
  return d.yahoo;
}

function targets(): Target[] {
  const out: Target[] = [];
  for (const d of engine.securities) {
    if (iexOwns(d.id)) continue;
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

/**
 * What Yahoo's quote says about its timing, and nothing more: real time when
 * the quote's source name says so ("Nasdaq Real Time Price", "Free Realtime
 * Quote"), delayed by the minutes it gives in exchangeDataDelayedBy, and
 * unknown otherwise (a "Delayed Quote" with no minutes, or no metadata).
 */
export function timingOf(q: Json): { timing: Timing; delay: number; sourceName?: string } {
  const name = typeof q?.quoteSourceName === 'string' ? q.quoteSourceName : undefined;
  const d = Number(q?.exchangeDataDelayedBy);
  if (name && /real ?time/i.test(name)) return { timing: 'realtime', delay: 0, sourceName: name };
  if (Number.isFinite(d) && d > 0) return { timing: 'delayed', delay: d, sourceName: name };
  return { timing: 'unknown', delay: 0, sourceName: name };
}

export interface Dividend {
  day: number;
  amount: number;
}

/** Real dividends per security, from the history request. */
export const realDividends = new Map<string, Dividend[]>();
/** Latest raw Yahoo quote per security (ratios, market cap, earnings date). */
export const yahooQuotes = new Map<string, Json>();
/** Quotes of the ETFs that track the main indices, for index dividend yields. */
export const etfQuotes = new Map<string, Json>();
/** Dividends those ETFs paid, by symbol. */
export const etfDividends = new Map<string, Dividend[]>();
const ETFS = ['SPY', 'QQQ', 'DIA', 'IWM'];

/** Dividends that went ex in the year to `today` (a day number), summed, in the units the price is quoted in. */
export function paidInYear(list: Dividend[] | undefined, today: number): number {
  let sum = 0;
  for (const x of list ?? []) if (x.day > today - 365 && x.day <= today) sum += x.amount;
  return sum;
}

/**
 * Dividend yield over the past 12 months, as a fraction: the dividends that
 * went ex in the year to today over the live price, both as the shares are
 * quoted (pence in London). Zero when the record shows none; NaN until the
 * line's history has loaded. The provider's own yield fields are not used:
 * they divide by an old price or mix currencies (Shell's dollar dividend over
 * its price in pence).
 */
export function trailingDividendYield(id: string): number {
  if (!engine.isExternal(id) || !realDividends.has(id)) return NaN;
  const px = engine.quote(id)?.last ?? NaN;
  return px > 0 ? paidInYear(realDividends.get(id), engine.today) / px : NaN;
}

/** The same for an index, from the ETF that tracks it (SPY for the S&P 500). */
export function etfDividendYield(symbol: string): number {
  const px = Number(etfQuotes.get(symbol)?.regularMarketPrice);
  return etfDividends.has(symbol) && px > 0 ? paidInYear(etfDividends.get(symbol), engine.today) / px : NaN;
}

/**
 * A bar's close, open, high and low with a missing or zero open, high or low
 * read as the close (Yahoo gave a cotton low of 0.00 on 12 Oct 2026), and the
 * high and low widened to hold the open and close.
 */
export function cleanBar(c: number, o: unknown, h: unknown, l: unknown): [number, number, number, number] {
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x !== 0;
  const oo = ok(o) ? o : c;
  return [c, oo, Math.max(ok(h) ? h : c, oo, c), Math.min(ok(l) ? l : c, oo, c)];
}

export function barsFromChart(chart: Json, invert = false, allDays = false): { bars: ExtBar[]; dividends: Dividend[]; gmtOffset: number } {
  const r = chart?.chart?.result?.[0];
  const gmtOffset = Number(r?.meta?.gmtoffset ?? 0);
  if (!r?.timestamp) return { bars: [], dividends: [], gmtOffset };
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: ExtBar[] = [];
  r.timestamp.forEach((ts: number, i: number) => {
    const close = q.close?.[i];
    if (close == null || !Number.isFinite(close) || close === 0) return;
    let [c, o, h, l] = cleanBar(close, q.open?.[i], q.high?.[i], q.low?.[i]);
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
/** Yahoo's marketState outside the regular session: PRE and PREPRE, POST and POSTPOST, CLOSED. */
export function marketStateOf(q: Json): { state?: 'pre' | 'post' | 'closed' } {
  const m = String(q?.marketState ?? '');
  if (m === 'PRE' || m === 'PREPRE') return { state: 'pre' };
  if (m === 'POST' || m === 'POSTPOST') return { state: 'post' };
  if (m === 'CLOSED') return { state: 'closed' };
  return {};
}

/**
 * Quotes from Yahoo's chart summaries (/v8/finance/spark), which need no session cookie: for each symbol the
 * latest one-minute close and its time, and the previous close. No bid, offer, day range or volume, and no
 * statement of delay, so these quotes are not full and their timing is unknown.
 */
export function sparkToQuotes(data: Json): Json[] {
  const out: Json[] = [];
  // The current answer is keyed by symbol; an older layout wrapped charts in spark.result[].response[].
  const entries: [string, Json][] = data?.spark?.result
    ? (data.spark.result as Json[]).map((r) => [String(r?.symbol), { ...(r?.response?.[0]?.meta ?? {}), timestamp: r?.response?.[0]?.timestamp, close: r?.response?.[0]?.indicators?.quote?.[0]?.close }])
    : Object.entries(data ?? {});
  for (const [symbol, x] of entries) {
    const ts: number[] = Array.isArray(x?.timestamp) ? x.timestamp : [];
    const close: (number | null)[] = Array.isArray(x?.close) ? x.close : [];
    let i = Math.min(ts.length, close.length) - 1;
    while (i >= 0 && !(Number.isFinite(close[i]) && (close[i] as number) > 0)) i--;
    if (i < 0) continue;
    const prev = Number(x.previousClose ?? x.chartPreviousClose);
    out.push({ symbol: x.symbol ?? symbol, regularMarketPrice: close[i], regularMarketTime: ts[i], ...(prev > 0 ? { regularMarketPreviousClose: prev } : {}), sparkOnly: true });
  }
  return out;
}

async function sparkQuotes(symbols: string[]): Promise<Json[]> {
  const out: Json[] = [];
  for (let i = 0; i < symbols.length; i += 20) {
    const batch = symbols.slice(i, i + 20);
    const data = await yahooGet(`/v8/finance/spark?symbols=${batch.map((b) => encodeURIComponent(b)).join(',')}&range=1d&interval=1m`).catch(() => null);
    out.push(...sparkToQuotes(data));
  }
  return out;
}

export function extQuote(q: Json, invert: boolean, allDays = false): ExtQuote | null {
  const last = Number(q.regularMarketPrice);
  const t = Number(q.regularMarketTime);
  if (!Number.isFinite(last) || last === 0 || !Number.isFinite(t)) return null;
  const off = Number(q.gmtOffSetMilliseconds ?? 0);
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x !== 0 ? x : undefined;
  };
  const change = Number(q.regularMarketChange);
  const base: ExtQuote = {
    last,
    prevClose: n(q.regularMarketPreviousClose),
    // The engine checks the two readings against the daily bars (choosePrevClose): either can be off.
    prevCloseAlt: Number.isFinite(change) && q.regularMarketChange != null ? n(last - change) : undefined,
    // A chart summary has no bid, offer or day range: it does not replace them.
    full: !q.sparkOnly,
    open: n(q.regularMarketOpen),
    high: n(q.regularMarketDayHigh),
    low: n(q.regularMarketDayLow),
    volume: Number.isFinite(Number(q.regularMarketVolume)) ? Number(q.regularMarketVolume) : undefined,
    time: t * 1000,
    day: sessionDay(t * 1000, off, allDays),
    // A full quote without a bid or offer means there is none now.
    bid: n(q.bid) ?? NaN,
    ask: n(q.ask) ?? NaN,
    // A chart summary does not say whether the market is open: a price from the last half hour counts as
    // trading (delays included), an older one as closed, and the session is marked as not known.
    marketOpen: q.sparkOnly ? Date.now() - t * 1000 < 30 * 60_000 : q.marketState === 'REGULAR',
    ...(q.sparkOnly ? { sessionKnown: false } : {}),
    ...marketStateOf(q),
    ...(typeof q.exchangeTimezoneName === 'string' && q.exchangeTimezoneName ? { tz: q.exchangeTimezoneName } : {}),
    // Yahoo gives crypto volume in dollars, not coins.
    ...(q.quoteType === 'CRYPTOCURRENCY' ? { volumeUnit: 'USD' } : {}),
    ...timingOf(q),
    fetched: Date.now(),
  };
  [base.bid, base.ask] = saneTouch(base.bid, base.ask, last);
  if (!invert) return base;
  return {
    ...base,
    last: inv(base.last),
    prevClose: base.prevClose && inv(base.prevClose),
    prevCloseAlt: base.prevCloseAlt && inv(base.prevCloseAlt),
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
  /** Lines fed by each Yahoo symbol: one symbol can feed several (JPY=X is USDJPY and, inverted, the yen's dollar value). */
  private bySymbol = new Map<string, Target[]>();
  private byId = new Map<string, Target>();
  private loaded = new Set<string>();
  private pendingQuote = new Map<string, Json>();
  private historyQueue: Target[] = [];
  private historyActive = 0;
  private intradayAt = new Map<string, number>();
  private intradayWanted = new Map<string, number>();
  private intradayActive = 0;
  private offDemand?: () => void;
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
  private etfTimer: ReturnType<typeof setInterval> | null = null;
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
    this.offDemand = engine.onDemand((id) => this.wantIntraday(id));
    // When Kraken does not answer, its crypto lines come here for the rest of the session.
    whenKrakenHandsBack(() => {
      this.known = -1;
      this.sync();
    });
    this.stream = new YahooStream(
      (t) => this.applyTick(t),
      (up) => this.status(up),
    );
    this.stream.start();
    this.sync();
    // Whatever a panel opens loads ahead of the rest of the queue.
    this.unsubTerminal = terminal.subscribe(() => this.prioritize());
    void this.pollQuotes();
    void this.loadEtfDividends();
    this.intradayTimer = setInterval(() => this.refreshIntraday(), 20_000);
    this.staleTimer = setInterval(() => this.checkStale(), 15_000);
    this.etfTimer = setInterval(() => void this.loadEtfDividends(), 12 * 3600_000);
  }

  /** The index ETFs' dividends over the past year or so, for index dividend yields; tried again in two minutes if missing. */
  private async loadEtfDividends() {
    let missing = 0;
    for (const sym of ETFS) {
      try {
        const chart = await yahooGet(`/v8/finance/chart/${sym}?range=13mo&interval=1mo&events=div`);
        if (chart?.chart?.result?.[0]) etfDividends.set(sym, barsFromChart(chart).dividends);
        else missing++;
      } catch {
        missing++;
      }
    }
    if (missing && !this.stopped) setTimeout(() => void this.loadEtfDividends(), 120_000);
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
    const owned = [...this.loaded].filter((id) => !iexOwns(id));
    engine.setStale(owned, stale);
    engine.flush(owned);
    if (stale) setFeed('market', 'error', 'Connection to Yahoo Finance lost: open markets show their last price, marked STALE');
    else this.status(streamOk);
  }

  /** Applies one streamed price to every line its symbol feeds. */
  private applyTick(tick: Tick) {
    for (const t of this.bySymbol.get(tick.id) ?? []) this.applyTickTo(t, tick);
  }

  /** Applies one streamed price to one line, after the bad-tick check. */
  private applyTickTo(t: Target, tick: Tick) {
    if (iexOwns(t.id)) return;
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
      prevCloseAlt: tick.change != null && Number.isFinite(tick.change) && tick.price - tick.change !== 0 ? inverted(tick.price - tick.change) : undefined,
      open: inverted(tick.openPrice),
      high: t.invert ? inverted(tick.dayLow) : tick.dayHigh,
      low: t.invert ? inverted(tick.dayHigh) : tick.dayLow,
      volume: t.invert ? undefined : tick.dayVolume,
      bid,
      ask,
      marketOpen: true,
      delay: t.delay,
      timing: t.timing,
      sourceName: t.sourceName,
      fetched: Date.now(),
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
    if (this.etfTimer) clearInterval(this.etfTimer);
    this.offDemand?.();
  }

  /** Picks up securities added at runtime (online lookups). */
  sync() {
    if (engine.securities.length === this.known) return;
    this.known = engine.securities.length;
    const fresh: Target[] = [];
    for (const t of targets()) {
      if (this.byId.has(t.id)) continue;
      this.register(t);
      fresh.push(t);
    }
    this.stream?.subscribe([...new Set(fresh.map((t) => t.symbol))]);
    // Lines on screen first, then watchlists, then everything else.
    const shown = new Set<string>();
    for (const p of terminal.get().panels) for (const r of p.history) if (r.sec) shown.add(r.sec);
    for (const l of watchlists.get().lists) for (const id of l.ids) shown.add(id);
    fresh.sort((a, b) => Number(shown.has(b.id)) - Number(shown.has(a.id)));
    this.historyQueue.push(...fresh);
    this.prioritize();
    this.pumpHistory();
  }

  /** Adds a line under its symbol, replacing an earlier entry for the same line. */
  private register(t: Target) {
    const old = this.byId.get(t.id);
    if (old) this.bySymbol.set(old.symbol, (this.bySymbol.get(old.symbol) ?? []).filter((x) => x.id !== t.id));
    this.byId.set(t.id, t);
    this.bySymbol.set(t.symbol, [...(this.bySymbol.get(t.symbol) ?? []), t]);
  }

  /** History already fetched elsewhere (an online lookup) can be adopted directly. */
  adopt(id: string, symbol: string, bars: ExtBar[], dividends: Dividend[]) {
    // Company/dividend data can be shared; the selected venue owns all price history.
    realDividends.set(id, dividends);
    if (iexOwns(id)) return;
    const t: Target = { id, symbol, invert: false, allDays: engine.get(id)?.cls === 'crypto' };
    this.register(t);
    this.stream?.subscribe([symbol]);
    this.historyQueue = this.historyQueue.filter((x) => x.id !== id);
    this.applyHistory(t, bars, dividends);
    this.known = engine.securities.length;
  }

  private pumpHistory() {
    // Three at a time keeps the start-up load gentle; what panels show is loaded first.
    while (!this.stopped && this.historyActive < 3 && this.historyQueue.length) {
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
      // A network error or rate limit: try again later, waiting longer each time (10 minutes at most).
      const tries = (t.tries ?? 0) + 1;
      if (!this.stopped) {
        setTimeout(() => {
          if (this.stopped || this.loaded.has(t.id)) return;
          this.historyQueue.push({ ...t, tries });
          this.pumpHistory();
        }, Math.min(600_000, 5_000 * 2 ** tries));
      }
    }
  }

  private applyHistory(t: Target, bars: ExtBar[], dividends: Dividend[]) {
    if (iexOwns(t.id)) return;
    engine.setExternalDaily(t.id, bars, { provider: YAHOO_PROVIDER });
    realDividends.set(t.id, dividends);
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
    const all = [...this.bySymbol.keys()].filter((sym) => this.bySymbol.get(sym)!.length);
    const changed: string[] = [];
    let ok = 0;
    for (let i = 0; i < all.length; i += 50) {
      const batch = all.slice(i, i + 50);
      const extra = i === 0 ? ETFS.filter((x) => !this.bySymbol.has(x)) : [];
      try {
        let list: Json[];
        try {
          const res = await yahooGet(`/v7/finance/quote?symbols=${[...batch.map((b) => encodeURIComponent(b)), ...extra].join(',')}`);
          list = (res?.quoteResponse?.result ?? []) as Json[];
        } catch (err) {
          // Yahoo refuses the session for full quotes (EU cookies not accepted): prices come from its chart
          // summaries instead, which need no cookie. They carry the price, its time and the previous close.
          if (!yahooSession.get().refused) throw err;
          list = await sparkQuotes(batch);
        }
        for (const q of list) {
          if (ETFS.includes(q.symbol)) etfQuotes.set(q.symbol, q);
          const lines = this.bySymbol.get(q.symbol) ?? [];
          if (lines.length) ok++;
          for (const t of lines) {
            if (iexOwns(t.id)) continue;
            yahooQuotes.set(t.id, q);
            if (Number.isFinite(Number(q.gmtOffSetMilliseconds))) t.gmtOffset = Number(q.gmtOffSetMilliseconds);
            const timing = timingOf(q);
            t.delay = timing.delay;
            t.timing = timing.timing;
            t.sourceName = timing.sourceName;
            const def = engine.get(t.id);
            const shares = def ? impliedShares(def, Number(q.marketCap), Number(q.regularMarketPrice)) : NaN;
            if (def?.eq && Number.isFinite(shares)) def.eq.shares = shares;
            if (def?.cry && Number(q.circulatingSupply) > 0) def.cry.supply = Number(q.circulatingSupply);
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
    if (iexOwns(id)) return;
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
    if (iexOwns(id)) return;
    const t = this.byId.get(id);
    if (!t || !this.loaded.has(id) || this.intradayActive >= 3) return;
    this.intradayAt.set(id, Date.now());
    this.intradayActive++;
    try {
      const chart = await yahooGet(`/v8/finance/chart/${encodeURIComponent(t.symbol)}?range=1d&interval=1m&includePrePost=false`);
      const r = chart?.chart?.result?.[0];
      if (!r?.timestamp || iexOwns(id)) return;
      const gmt = Number(r.meta?.gmtoffset ?? 0);
      const q = r.indicators?.quote?.[0] ?? {};
      const bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
      r.timestamp.forEach((ts: number, i: number) => {
        const close = q.close?.[i];
        if (close == null || !Number.isFinite(close) || close === 0) return;
        let [c, o, h, l] = cleanBar(close, q.open?.[i], q.high?.[i], q.low?.[i]);
        if (t.invert) [c, o, h, l] = [inv(c), inv(o), inv(l), inv(h)];
        bars.push({ t: ts * 1000, o, h, l, c, v: t.invert ? 0 : (q.volume?.[i] ?? 0) });
      });
      if (!bars.length) return;
      dropVolumeSpikes(bars, Number(r.meta?.regularMarketVolume));
      engine.setExternalIntraday(id, bars, 60_000, localDay(r.timestamp[r.timestamp.length - 1], gmt));
      engine.flush([id]);
    } catch {
      /* try again on the next request */
    } finally {
      this.intradayActive--;
    }
  }
}

/**
 * Minute bars whose volumes add up to clearly more than the day's volume carry a bad print
 * (Nebius on 12 Oct 2026: one minute of 10.6M shares in a 13.9M-share day). The volume of a
 * bar more than 50 times the median minute is dropped then; its prices stay. Returns how many.
 */
export function dropVolumeSpikes(bars: { v: number }[], dayVolume: number): number {
  const total = bars.reduce((a, b) => a + (b.v || 0), 0);
  if (!(dayVolume > 0) || total <= dayVolume * 1.1) return 0;
  const sorted = bars.map((b) => b.v || 0).filter((v) => v > 0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  let dropped = 0;
  for (const b of bars) {
    if (median > 0 && b.v > median * 50) {
      b.v = 0;
      dropped++;
    }
  }
  return dropped;
}

let service: YahooData | null = null;

/** Starts real market data in the desktop app; a no-op in the browser, or when Yahoo prices are switched off. */
export function startYahooData(): () => void {
  if (!desktopData()) return () => undefined;
  let stopped = false;
  let unsub = () => undefined as void;
  const begin = () => {
    if (stopped) return;
    service = new YahooData();
    service.start();
    unsub = engine.subscribe(() => service?.sync());
  };
  const report = window.arminDesktop?.providersStatus?.();
  if (!report) begin();
  else
    void report
      .then((r) => {
        if (r.settings?.YAHOO_PRICES_ENABLED?.value === false) {
          setFeed('market', 'off', `Yahoo Finance prices are switched off (YAHOO_PRICES_ENABLED, ${r.settings.YAHOO_PRICES_ENABLED.source}): no market prices until a source is on`);
          return;
        }
        begin();
      })
      .catch(begin);
  return () => {
    stopped = true;
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
