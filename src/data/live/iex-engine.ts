import { engine } from '../market';
import { dayNum } from '../calendar';
import type { ExtBar, ExtQuote } from '../engine';
import { acquireIex, alpacaAvailable, alpacaSymbol, iex, iexFreshness, type IexState } from './alpaca';
import { setFeed } from './status';

/** Every price, bar and change on these lines belongs to IEX alone. */
export const IEX_PROVIDER = 'Alpaca · IEX only';

/** Explicit selection, fixed for the page's lifetime just like the other desktop price switches. */
export function iexPricesEnabled(): boolean {
  return alpacaAvailable() && window.arminDesktop?.settings?.ALPACA_IEX_PRICES_ENABLED === true && window.arminDesktop.settings.ALPACA_ENABLED !== false;
}

/** Selected US equities never silently fall back to another venue's prices or history. */
export function iexOwns(id: string): boolean {
  return iexPricesEnabled() && alpacaSymbol(engine.get(id)) !== null;
}

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Alpaca stamps daily bars at New York midnight; trade timestamps use that same session date. */
export function iexDay(at: number): number {
  const p = nyDate.formatToParts(at);
  const value = (type: string) => Number(p.find((part) => part.type === type)?.value);
  return dayNum(Date.UTC(value('year'), value('month') - 1, value('day')));
}

const positive = (n: number) => Number.isFinite(n) && n > 0;
const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
const known = (n: number) => positive(n) ? n : NaN;

/**
 * Consolidated daily bars (Yahoo) for the days before IEX's own bars. Without them a chart, the
 * 52-week range and period returns would rest on two sessions. The last price, the previous close
 * and the day's change stay IEX's: only days IEX's snapshot does not cover are taken from here.
 */
const backfill = new Map<string, ExtBar[]>();
const backfillListeners = new Set<() => void>();

export function setIexBackfill(id: string, bars: ExtBar[]) {
  if (!bars.length) return;
  backfill.set(id, bars);
  for (const fn of backfillListeners) fn();
}

/** Earlier days from `earlier`, strictly before IEX's first bar; IEX's own bars unchanged. */
export function withBackfill(earlier: readonly ExtBar[] | undefined, own: ExtBar[]): ExtBar[] {
  if (!earlier?.length || !own.length) return own;
  const first = own[0].day;
  const before = earlier.filter((b) => b.day < first && Number.isFinite(b.c) && b.c > 0);
  return before.length ? [...before, ...own] : own;
}

/**
 * IEX's own daily bars seen while the app runs, by day, with a reading's bars over the earlier
 * ones of the same days. A snapshot names only the previous and current session, so without
 * this a window left open for three or more sessions would lose the days between the backfill's
 * last day and IEX's previous session at each new reading.
 */
export function keepOwnDays(kept: Map<number, ExtBar>, bars: readonly ExtBar[]): ExtBar[] {
  for (const b of bars) kept.set(b.day, b);
  return [...kept.values()].sort((a, b) => a.day - b.day);
}

/**
 * The session's open, high, low and volume across all US venues (Yahoo Finance), for the lines IEX prices. IEX is one
 * venue: its own volume is a small part of the market's (APLD on 27 October 2026: 892K on IEX, about 15M in all), and
 * its range only spans the trades made on it. The last price and the quote stay IEX's.
 */
export interface ConsolidatedDay {
  /** The session (day number) the figures are for. */
  day: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  time: number;
}
export const CONSOLIDATED_PROVIDER = 'Yahoo Finance · all US venues';
const consolidated = new Map<string, ConsolidatedDay>();
/** The session whose minute bars of all venues the chart holds, by line. */
const consolidatedBars = new Map<string, number>();

export function setConsolidatedDay(id: string, v: ConsolidatedDay) {
  const old = consolidated.get(id);
  if (old && old.time >= v.time && old.day === v.day) return;
  consolidated.set(id, v);
  for (const f of backfillListeners) f();
}

/** The chart of a line IEX prices holds the day's minute bars of all venues: IEX's sampled trades no longer replace them. */
export function setConsolidatedBars(id: string, day: number) {
  consolidatedBars.set(id, day);
}

/** IEX's reading with the session's open, range and volume of all venues, when they are for the same session. */
export function withConsolidatedDay(reading: { bars: ExtBar[]; quote: ExtQuote; stale: boolean }, cons: ConsolidatedDay | undefined): { bars: ExtBar[]; quote: ExtQuote; stale: boolean } {
  const q = reading.quote;
  if (!cons || cons.day !== q.day) return reading;
  const open = positive(cons.open) ? cons.open : q.open;
  const high = positive(cons.high) ? Math.max(cons.high, q.last) : q.high;
  const low = positive(cons.low) ? Math.min(cons.low, q.last) : q.low;
  const volume = nonnegative(cons.volume) ? cons.volume : q.volume;
  const n = reading.bars.length - 1;
  const bars = reading.bars.map((b, i) => (i === n && b.day === q.day ? { ...b, o: open ?? b.o, h: high ?? b.h, l: low ?? b.l, v: volume ?? b.v } : b));
  return { ...reading, bars, quote: { ...q, open, high, low, volume, dayProvider: CONSOLIDATED_PROVIDER, sourceName: `${q.sourceName} · session open, range and volume of all venues: ${CONSOLIDATED_PROVIDER}` } };
}

/**
 * The snapshot supplies only its previous/current daily bars; earlier days come from
 * withBackfill. Neither the previous close nor today's bar is ever taken from another venue.
 */
export function iexReading(state: IexState, now = Date.now()): { bars: ExtBar[]; quote: ExtQuote; stale: boolean } | null {
  const d = state.data;
  if (!d || !positive(d.last) || !Number.isFinite(d.lastAt) || d.lastAt <= 0 || d.lastAt > now + 5_000) return null;
  const day = iexDay(d.lastAt);
  const sameDay = Number.isFinite(d.dayAt) && iexDay(d.dayAt) === day;
  const before = Number.isFinite(d.prevDayAt) && iexDay(d.prevDayAt) < day;
  const bars: ExtBar[] = [];
  if (before && positive(d.prevClose)) {
    bars.push({ day: iexDay(d.prevDayAt), o: known(d.prevOpen), h: known(d.prevHigh), l: known(d.prevLow), c: d.prevClose, v: nonnegative(d.prevVolume) ? d.prevVolume : NaN });
  }
  // Missing daily fields remain missing. In particular, a lone trade is not a day's range or volume.
  const o = sameDay ? known(d.open) : NaN;
  const h = sameDay ? known(d.high) : NaN;
  const l = sameDay ? known(d.low) : NaN;
  const v = sameDay && nonnegative(d.volume) ? d.volume : NaN;
  bars.push({ day, o, h, l, c: sameDay && positive(d.close) ? d.close : d.last, v });
  const fresh = iexFreshness(d, now);
  const stale = state.state !== 'ok' || !!state.stale || fresh.tradeStale;
  const touch = !state.stale && !fresh.quoteStale && positive(d.bid) && positive(d.ask) && d.bid <= d.ask;
  return {
    bars,
    stale,
    quote: {
      last: d.last, time: d.lastAt, day, prevClose: before ? known(d.prevClose) : NaN,
      full: true, open: o, high: h, low: l, volume: v,
      bid: touch ? d.bid : NaN, ask: touch ? d.ask : NaN,
      // A timed trade establishes feed freshness, not whether the primary exchange is open.
      marketOpen: true, sessionKnown: false, aggregateTrades: false,
      timing: 'realtime', delay: 0, tz: 'America/New_York',
      sourceName: 'IEX real-time feed · one venue · snapshot observations',
      fetched: Number.isFinite(state.at) ? state.at : now,
    },
  };
}

type Observation = { t: number; o: number; h: number; l: number; c: number; v: number };

/** Shares the QUOTE snapshot subscription with app-wide US equity prices. No credentials enter the renderer. */
export function startIexPrices(): () => void {
  if (!iexPricesEnabled()) return () => undefined;
  const releases = new Map<string, () => void>();
  const seen = new Map<string, IexState>();
  const observations = new Map<string, Observation[]>();
  const ownDays = new Map<string, Map<number, ExtBar>>();
  const freshness = new Map<string, string>();
  let knownDefs = -1;
  let stopped = false;

  const apply = () => {
    if (stopped) return;
    const changed: string[] = [];
    let received = 0;
    let recent = 0;
    let message = 'Waiting for Alpaca IEX snapshots; no prices from another venue';
    for (const id of releases.keys()) {
      const symbol = alpacaSymbol(engine.get(id))!;
      const state = iex.get().by[symbol];
      if (!state) continue;
      if (state.message) message = state.message;
      const own = iexReading(state);
      if (!own) {
        const old = engine.quote(id);
        if (old?.provider === IEX_PROVIDER && (seen.get(id) !== state || freshness.get(id) !== 'unavailable')) {
          seen.set(id, state);
          freshness.set(id, 'unavailable');
          engine.setExternalQuote(id, { last: old.last, time: old.time, marketOpen: true, sessionKnown: false, aggregateTrades: false, bid: NaN, ask: NaN });
          engine.setStale([id], true);
          changed.push(id);
        }
        continue;
      }
      received++;
      const reading = withConsolidatedDay(own, consolidated.get(id));
      if (!reading.stale) recent++;
      const earlier = backfill.get(id);
      const key = `${reading.stale}:${Number.isFinite(reading.quote.bid)}:${Number.isFinite(reading.quote.ask)}:${earlier?.length ?? 0}:${consolidated.get(id)?.time ?? 0}`;
      if (seen.get(id) === state && freshness.get(id) === key) continue;
      seen.set(id, state);
      freshness.set(id, key);
      const old = engine.quote(id);
      // Cached or out-of-order answers cannot move the last trade backwards.
      if (old?.provider === IEX_PROVIDER && old.time > reading.quote.time) continue;
      let kept = ownDays.get(id);
      if (!kept) ownDays.set(id, (kept = new Map()));
      engine.setExternalDaily(id, withBackfill(earlier, keepOwnDays(kept, reading.bars)), { provider: IEX_PROVIDER });
      engine.setExternalQuote(id, reading.quote);
      engine.setStale([id], reading.stale);
      const day = reading.quote.day!;
      let points = observations.get(id) ?? [];
      if (points.length && iexDay(points[0].t) !== day) points = [];
      if (!points.length || points[points.length - 1].t < reading.quote.time) {
        const px = reading.quote.last;
        points.push({ t: reading.quote.time, o: px, h: px, l: px, c: px, v: NaN });
      }
      // Sampled observations only: gaps and volume between polls are unknown, never filled candles.
      if (points.length > 5000) points = points.slice(-5000);
      observations.set(id, points);
      // The day's minute bars of all venues, once loaded, stay the chart: the engine moves its last bar with IEX's price.
      if (consolidatedBars.get(id) !== day) engine.setExternalIntraday(id, points, 5_000, day);
      changed.push(id);
    }
    if (changed.length) engine.flush(changed);
    setFeed('equities', recent ? 'live' : received ? 'error' : 'connecting', received
      ? `${IEX_PROVIDER} · ${recent}/${received} recent last trades · previous/current daily bars and observed snapshots only; no complete trade tape`
      : `${IEX_PROVIDER} · ${message}`);
  };

  const sync = () => {
    if (stopped || knownDefs === engine.defs.length) return;
    knownDefs = engine.defs.length;
    for (const def of engine.defs) {
      if (!iexOwns(def.id) || releases.has(def.id)) continue;
      const symbol = alpacaSymbol(def)!;
      // Set before acquiring: the shared snapshot store can notify synchronously.
      releases.set(def.id, () => undefined);
      releases.set(def.id, acquireIex(symbol));
    }
  };
  const offIex = iex.subscribe(apply);
  const offEngine = engine.subscribe(sync);
  backfillListeners.add(apply);
  sync();
  apply();
  // Reevaluate event age even when requests stop, so recent data never stays labelled real time.
  const timer = setInterval(apply, 5_000);
  return () => {
    stopped = true;
    clearInterval(timer);
    offIex();
    offEngine();
    backfillListeners.delete(apply);
    for (const release of releases.values()) release();
  };
}
