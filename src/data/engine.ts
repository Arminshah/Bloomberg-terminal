import { hashString, normal } from '../core/rng';
import { cleanPricer, settlementDate, type BondTerms } from '../finance/bonds';
import { buildGrid, businessDayOnOrBefore, DAY_MS, dayNum, dayStart, dayToIso, frontFuture, isBusinessDay, isoToDay, MINUTE_MS, prevBusinessDay } from './calendar';
import { factorLoadings, idioWeight, type Loadings } from './factors';
import { indexAtOrBefore, makeSeries, type Series } from './series';
import type { Quote, SecurityDef, Trade } from './types';
import { ANCHORS, buildUniverse, CURRENCY_DEFS, CURRENCY_INFO } from './universe';

const HIST_YEARS = 10;
const MINUTES = 1440;
const TRADE_BUFFER = 400;

type Kind = 'base' | 'pair' | 'dxy' | 'bond' | 'fut';

interface Intra {
  day: number;
  /** Deterministic path points: x[k] is the level at the start of minute k. */
  x: Float64Array;
  filled: number;
  series: Series;
  /** Minute index of the bar currently forming (sim) or -1 for live series. */
  cur: number;
  totalVol: number;
}

interface LiveBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface State {
  def: SecurityDef;
  kind: Kind;
  seed: number;
  load: Loadings;
  idio: number;
  additive: boolean;
  allDays: boolean;
  drift: number;
  revert?: { target: number; kappa: number };
  daily: Series | null;
  dailyKey: string;
  intra: Intra | null;
  /** Externally supplied closes (day -> level) that the history must pass through. */
  extAnchors: Map<number, number>;
  /** Externally supplied full daily bars. */
  extBars: Map<number, LiveBar>;
  live: boolean;
  liveIntraday: boolean;
  trades: Trade[];
  last: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  /** Day number of the session `prevClose` closed, when the daily bars give it. */
  prevCloseDay?: number;
  /** Real lines: whether the daily bars confirm `prevClose` (verified) or nothing has checked it yet (unverified). */
  chgCheck?: 'verified' | 'unverified';
  /** `prevClose` is a futures settlement taken from the quote, not the daily bar's close. */
  prevSettle?: boolean;
  volume: number;
  pair?: { base: string; quote: string };
  bond?: { terms: BondTerms; legs: { id: string; w: number }[]; spread: number; issueDay: number; issuer?: string; issuerRef?: number };
  fut?: { underlying: string; rateId?: string; rate: number; q: number; tick: number; monthly: boolean };
  /** Real data from an external source; when present it replaces the simulation for this line. */
  ext?: ExtData;
}

interface ExtData {
  /** Real daily bars; the last one is the latest session, which is earlier than today while the market has not opened. */
  daily: Series;
  /**
   * A finished session's volume of all venues from a second source; a later reading of that session never lowers it.
   * With it, the session's official open from the same source, which a later provisional reading never replaces.
   */
  settled?: { day: number; volume: number; source: string; open?: { price: number; source: string }; range?: { high: number; low: number; source: string } };
  /** Intraday bars of the latest session. */
  intra: Series;
  session: number;
  /** Market currently in its regular session. */
  open: boolean;
  /** False when a feed carries trades but no exchange session status. */
  sessionKnown?: boolean;
  /** Outside the regular session: which part of the day the source says it is, when it says. */
  state?: 'pre' | 'post' | 'closed';
  /** The exchange's time zone (IANA name), for showing times as the exchange keeps them. */
  tz?: string;
  /** What the volume counts: coins of the base asset, or dollars ("USD"). */
  volumeUnit?: string;
  bid: number;
  ask: number;
  seq: number;
  /** End-of-day values only (no quotes during the session). */
  eod: boolean;
  /** Minutes the source says it delays prices for this market (0 when it gives none). */
  delay: number;
  /** What the source says about timing: real time, delayed, or nothing either way. */
  timing: Timing;
  /** The source's own name for its quotes. */
  sourceName?: string;
  /** Who supplies the session's open, high, low and volume when another source than the last price's does. */
  dayProvider?: string;
  /** Who supplies this line ("Yahoo Finance", "US Treasury"), shown with every value. */
  provider?: string;
  /** When the app received the latest value (epoch ms). */
  fetched: number;
  /** The source has stopped answering: prices may be out of date. */
  stale: boolean;
  extended?: ExtendedPrice;
  /** When the latest value was set by the market: the last trade, or the date of an end-of-day value. */
  time: number;
  /** No quote has given a time yet: `time` is only the date of the latest daily bar. */
  dayOnly: boolean;
}

export interface ExtBar {
  day: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ExtQuote {
  last: number;
  prevClose?: number;
  /** The previous close implied by the source's own change (last - change): a second reading to check prevClose against. */
  prevCloseAlt?: number;
  /** A full quote (the poll): its open, high and low are the day's, replacing the bar's; a streamed tick only extends them. */
  full?: boolean;
  open?: number;
  /** A chart summary's first price of the session, when it gives no open (a currency's price at the start of its day). */
  firstPrice?: number;
  high?: number;
  low?: number;
  volume?: number;
  /** Time of the last trade (ms). */
  time: number;
  /** Session date in the exchange's own time zone (defaults to the UTC date of `time`). */
  day?: number;
  /** Best bid and offer; undefined leaves the current ones, NaN clears them. */
  bid?: number;
  ask?: number;
  /** The market is in its regular session. */
  marketOpen: boolean;
  /** False when the source does not publish whether the exchange is open. */
  sessionKnown?: boolean;
  /** False for snapshots that cannot supply a complete trade tape. */
  aggregateTrades?: boolean;
  /** Outside the regular session: pre-market, after hours or closed, as the source states it. */
  state?: 'pre' | 'post' | 'closed';
  /** The exchange's time zone (IANA name). */
  tz?: string;
  /** What the volume counts, when it is not shares or contracts: "BTC", "USD". */
  volumeUnit?: string;
  /** Minutes the source says it delays this market's prices. */
  delay?: number;
  /** What the source says about timing; left as it was when not given. */
  timing?: Timing;
  sourceName?: string;
  /** Who supplies the session's open, high, low and volume, when not the last price's source. */
  dayProvider?: string;
  /** When the app received this value (epoch ms); defaults to now. */
  fetched?: number;
}

/** A previous close and whether the daily bars confirm it. */
export interface PrevCloseReading {
  /** NaN when nothing settles which reading is right: the change is then shown as missing. */
  value: number;
  /** It matches the close of the previous daily bar (within 0.1%), so that bar's date is the session it closed. */
  verified: boolean;
  /** A futures settlement: the exchange's price for the previous session, which the daily bar's last trade need not match. */
  settlement?: boolean;
}

/**
 * The previous session's close for a quote, from the two readings a source
 * gives: its previous-close field and the close its own change implies. Yahoo's
 * field can lag a session (the Hang Seng, Shanghai, TAIEX, ASX 200, Sensex and
 * Nifty on 13 Oct 2026) or already hold the new settlement (CME livestock after
 * the close), while for crypto its change is the odd one out. A reading that
 * matches the close of the previous bar in the daily history is verified. When
 * the bars contradict every reading (they can be a contract behind after a
 * futures roll) there is no previous close (NaN) rather than a guess. With no
 * previous bar to check against, readings that agree are kept as unverified.
 * Undefined means the quote carried neither reading.
 */
export function resolvePrevClose(field: number | undefined, implied: number | undefined, histPrev: number, sessionOpen?: number, opts: { before?: number; futures?: boolean; gap?: boolean; fx?: boolean; first?: number } = {}): PrevCloseReading | undefined {
  const ok = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x) && x !== 0;
  const c = [field, implied].filter(ok);
  if (!c.length) return undefined;
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
  if (ok(histPrev)) {
    const best = c.length > 1 && rel(c[1], histPrev) < rel(c[0], histPrev) ? c[1] : c[0];
    if (rel(best, histPrev) <= 1e-3) return { value: best, verified: true };
    // Every reading is the close of the session before the previous one (Yahoo's field for Shanghai, Taiwan and
    // the ASX 200 on 20 Oct 2026 was 16 Oct's close; the bars had 19 Oct's): the field lags a session, which the
    // bars confirm, so the previous bar's close is the previous close.
    const lagging = ok(opts.before) && c.every((x) => rel(x, opts.before!) <= 1e-4);
    if (lagging) return { value: histPrev, verified: true };
    // A future's previous close is the exchange's settlement, set at a fixed time, while the daily bar ends on
    // the session's last trade (COMEX silver on 19 Oct 2026: settled 57.273, last bar close 56.974). After a roll
    // the quote and its settlement are the new contract's while the bar is still the old one (WTI on 20 Oct 2026:
    // December settled 98.54, the November bar 103.66). A settlement is used when the quote's readings agree,
    // it is not the close of the session before (a lagging field), and it is within 20% of the bar.
    if (opts.futures && (c.length === 1 || rel(c[0], c[1]) <= 2e-4) && rel(c[0], histPrev) <= 0.2) {
      return { value: c[0], verified: true, settlement: true };
    }
    // A market that trades through the change of day (currencies) opens where it closed, so the session's
    // open confirms readings that agree with each other when the daily bar cannot: Yahoo's currency bars
    // carry the close of the day before (EURUSD's bar for 13 Oct 2026 closed at 1.1160, its price at the
    // start of that day; the quote's 1.1203 matched the end of the day and the next day's open, 1.1202).
    if (ok(sessionOpen) && (c.length === 1 || rel(c[0], c[1]) <= 2e-4) && rel(c[0], sessionOpen) <= 1e-3) return { value: c[0], verified: true };
    // The bars miss the previous session (Yahoo's currency bars for 21 Oct 2026 had no close), so they cannot check
    // the reading: it is used, marked unverified, rather than compared with an older day's close.
    if (opts.gap) return { value: c.length === 1 || rel(c[0], c[1]) <= 2e-4 ? c[0] : NaN, verified: false };
    // A currency's quoted previous close and its daily bar's close are taken at different hours (NZD/USD on 22 Oct
    // 2026: 0.5689 against 0.56778). The session's first price in a chart summary settles it: a reading within 0.5%
    // of it is used, marked unverified (USD/MXN on 22 Oct 2026: 18.6632, first price 18.6995, while the bar had
    // 18.4244 after the peso fell 1.5% on the 21st). Without one, a reading within 1% of the bar is used, unverified.
    const agree = c.length === 1 || rel(c[0], c[1]) <= 2e-4;
    if (opts.fx && agree && ok(opts.first)) return { value: rel(c[0], opts.first) <= 5e-3 ? c[0] : NaN, verified: false };
    if (opts.fx && agree && rel(c[0], histPrev) <= 0.01) return { value: c[0], verified: false };
    return { value: NaN, verified: false };
  }
  if (c.length === 1) return { value: c[0], verified: false };
  return { value: rel(c[0], c[1]) <= 2e-4 ? c[0] : NaN, verified: false };
}

/** The weekday before a day number (day 0, 1 January 1970, was a Thursday). */
export function previousWeekday(day: number): number {
  let d = day - 1;
  while ((d + 4) % 7 === 0 || (d + 4) % 7 === 6) d--;
  return d;
}

/** The value part of resolvePrevClose. */
export function choosePrevClose(field: number | undefined, implied: number | undefined, histPrev: number): number | undefined {
  return resolvePrevClose(field, implied, histPrev)?.value;
}

/** Timing as the source labels it: real time, delayed, or not stated (never inferred). */
export type Timing = 'realtime' | 'delayed' | 'unknown';

/** A price from outside the regular session (pre-market, after hours, overnight). */
export interface ExtendedPrice {
  price: number;
  time: number;
  session: 'pre' | 'post' | 'overnight';
}

type Field = 'o' | 'h' | 'l' | 'c';

/** Exchange codes shown in Time & Sales for futures. */
const FUT_VENUE: Record<string, string> = {
  CME: 'CME', CBOT: 'CBT', Eurex: 'EUX', 'ICE Futures Europe': 'ICE', Euronext: 'ENX', 'Osaka Exchange': 'OSE', HKEX: 'HKF', ASX: 'ASX',
};

export type EngineListener = (changed: Set<string>) => void;

const DXY_WEIGHTS: [string, number][] = [
  ['EUR', -0.576], ['JPY', 0.136], ['GBP', -0.119], ['CAD', 0.091], ['SEK', 0.042], ['CHF', 0.036],
];
const DXY_CONST = 50.14348112;

const VENUES_US = ['Q', 'N', 'Z', 'P', 'K', 'D', 'V', 'J'];
const VENUES: Record<string, string[]> = {
  US: VENUES_US, GB: ['L', 'B', 'X'], DE: ['X', 'F', 'B'], FR: ['P', 'B', 'X'], NL: ['A', 'B'], CH: ['S', 'B'],
  JP: ['T', 'J'], HK: ['H'], TW: ['T'], KR: ['K'], IN: ['N', 'B'], AU: ['A', 'C'], CA: ['T', 'A', 'O'], DK: ['C', 'B'],
};

/**
 * How a line on real data is marked: end of day, stale, market closed, or, while
 * its market trades, live or delayed as the source labels it, else unconfirmed.
 */
function extSrc(e: ExtData): Quote['src'] {
  if (e.eod) return 'EOD';
  // Only history so far: the price is real, but whether the market is open is not known yet.
  if (e.dayOnly) return 'UNCONFIRMED';
  if (e.stale && e.open) return 'STALE';
  if (!e.open) return 'CLOSE';
  return e.timing === 'realtime' ? 'LIVE' : e.timing === 'delayed' ? 'DELAYED' : 'UNCONFIRMED';
}

/** What a line shows before (or without) real data: no price at all. */
function emptyQuote(id: string): Quote {
  return { id, last: NaN, bid: NaN, ask: NaN, open: NaN, high: NaN, low: NaN, prevClose: NaN, volume: 0, chg: NaN, pct: NaN, time: NaN, tick: 0, src: 'NONE' };
}

export class MarketEngine {
  readonly defs: SecurityDef[];
  readonly byId = new Map<string, SecurityDef>();
  private states = new Map<string, State>();
  private defsGen = 0;
  private quotes = new Map<string, Quote>();
  private listeners = new Set<EngineListener>();
  private minuteFactor = new Map<string, Float64Array>();
  private minuteFactorDay = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private derivedCache = new Map<string, { key: string; series: Series }>();
  today: number;
  /** Bumps whenever histories are rebuilt (live anchors, day rollover). */
  version = 0;
  tickCount = 0;
  tickMs = 1000;
  now: () => number;
  /** Told when a line with external data is asked for its intraday bars; each source ignores lines it does not feed. */
  private demandHandlers = new Set<(id: string, what: 'intraday') => void>();

  /** Registers a source's intraday loader; returns the function that removes it. */
  onDemand(fn: (id: string, what: 'intraday') => void): () => void {
    this.demandHandlers.add(fn);
    return () => this.demandHandlers.delete(fn);
  }
  /**
   * Desktop app: the simulator never publishes a value. A line shows nothing
   * until a real source fills it, and lines no source covers are left out of
   * lists (see sourceFilter).
   */
  realOnly = false;
  /** In real-only mode, which securities have a real source and are listed. */
  sourceFilter?: (d: SecurityDef) => boolean;
  private listed: SecurityDef[] | null = null;

  constructor(now: () => number = Date.now) {
    this.now = now;
    const t = now();
    this.today = dayNum(t);
    this.defs = buildUniverse(new Date(dayStart(this.today)));
    for (const d of this.defs) this.byId.set(d.id, d);
    for (const c of CURRENCY_DEFS) this.addState(c, 'base');
    for (const d of this.defs) {
      if (d.fx && d.cls === 'fx') this.addState(d, 'pair');
      else if (d.id === 'DXY Curncy') this.addState(d, 'dxy');
      else if (d.bond) this.addState(d, 'bond');
      else if (d.fut) {
        // A future moves like its index; px is filled in from the first fair value.
        d.vol = this.byId.get(d.fut.underlying)?.vol ?? d.vol;
        this.addState(d, 'fut');
      } else this.addState(d, 'base');
    }
    this.refreshAll(t, false);
    for (const st of this.states.values()) if (st.kind === 'fut') st.def.px = st.last;
  }

  private addState(def: SecurityDef, kind: Kind) {
    const info = def.id.startsWith('CCY:') ? CURRENCY_INFO.get(def.ticker) : undefined;
    const load = kind === 'base' ? factorLoadings(def, info?.risk ?? 0) : [];
    const st: State = {
      def,
      kind,
      seed: hashString(def.id),
      load,
      idio: kind === 'base' ? idioWeight(load) : 0,
      additive: def.quote === 'yield',
      allDays: def.cls === 'crypto',
      drift: def.cls === 'equity' || def.cls === 'index' ? 0.07 : def.cls === 'crypto' ? (def.ticker === 'XBTUSD' ? 0.8 : 0.6) : 0,
      daily: null,
      dailyKey: '',
      intra: null,
      extAnchors: new Map(),
      extBars: new Map(),
      live: false,
      liveIntraday: false,
      trades: [],
      last: def.px,
      dayHigh: def.px,
      dayLow: def.px,
      dayOpen: def.px,
      prevClose: def.px,
      volume: 0,
    };
    if (def.ticker === 'VIX') st.revert = { target: Math.log(17), kappa: 0.025 };
    if (def.ticker === 'HKD') st.revert = { target: Math.log(1 / 7.82), kappa: 0.08 };
    if (def.cls === 'rate') st.revert = { target: Math.max(def.px * 0.6, 0.5), kappa: 0.0015 };
    if (kind === 'pair') {
      const id = (c: string) => (c === 'USD' ? 'USD' : `CCY:${c}`);
      st.pair = { base: id(def.fx!.base), quote: id(def.fx!.quote) };
    }
    if (kind === 'bond') {
      const b = def.bond!;
      st.bond = {
        terms: { coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: b.freq },
        legs: b.legs,
        spread: b.spread,
        issueDay: isoToDay(b.issue),
        issuer: b.issuer,
        issuerRef: b.issuerRef,
      };
    }
    if (kind === 'fut') {
      const f = def.fut!;
      st.fut = {
        underlying: f.underlying,
        rateId: typeof f.rate === 'string' ? f.rate : undefined,
        rate: typeof f.rate === 'number' ? f.rate : 0,
        q: f.divYield,
        tick: f.tick,
        monthly: !!f.monthly,
      };
    }
    this.states.set(def.id, st);
  }

  // ---------------------------------------------------------------- queries

  get(id: string): SecurityDef | undefined {
    return this.byId.get(id);
  }

  quote(id: string): Quote | undefined {
    return this.quotes.get(id);
  }

  isLive(id: string): boolean {
    const st = this.states.get(id);
    return !!st && st.live;
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Daily bars including today's forming bar as the last element. */
  daily(id: string): Series {
    const st = this.states.get(id);
    if (!st) return makeSeries(0, DAY_MS);
    if (st.ext) return st.ext.daily;
    if (this.realOnly) return makeSeries(0, DAY_MS);
    if (st.kind === 'base') {
      this.ensureDaily(st);
      return st.daily!;
    }
    return this.derivedDaily(st);
  }

  /** Today's intraday bars (1 minute for simulated lines). */
  intraday(id: string): Series {
    const st = this.states.get(id);
    if (!st) return makeSeries(0, MINUTE_MS);
    if (st.ext) {
      for (const fn of this.demandHandlers) fn(id, 'intraday');
      return st.ext.intra;
    }
    if (this.realOnly) return makeSeries(0, MINUTE_MS);
    if (st.kind === 'base') {
      this.ensureIntra(st, this.now());
      return st.intra!.series;
    }
    return this.derivedIntraday(st);
  }

  trades(id: string): Trade[] {
    return this.states.get(id)?.trades ?? [];
  }

  /** USD value of one unit of a currency (live simulated). */
  usdValue(code: string): number {
    if (code === 'USD') return 1;
    if (code === 'GBp') return this.usdValue('GBP') / 100;
    if (code === 'USd') return 0.01;
    // CNY (onshore) and CNH (offshore) are each their own line: one is never shown under the other's name.
    const st = this.states.get(`CCY:${code}`);
    if (!st || (this.realOnly && !st.ext)) return NaN;
    return st.last;
  }

  /** Previous close (last completed daily bar). */
  prevClose(id: string): number {
    const st = this.states.get(id);
    if (!st || (this.realOnly && !st.ext)) return NaN;
    return st.prevClose;
  }

  lastHistDay(allDays: boolean): number {
    return allDays ? this.today - 1 : prevBusinessDay(this.sessionDay(false));
  }

  /**
   * The session a simulated line shows: today, or for markets that trade on weekdays only, the latest weekday.
   * On a Saturday or Sunday a stock shows Friday's finished session; crypto trades every day.
   */
  private sessionDay(allDays: boolean): number {
    return allDays ? this.today : businessDayOnOrBefore(this.today);
  }

  /** The line's market does not trade today: its session is an earlier day's, and finished. */
  private closed(st: State): boolean {
    return this.sessionDay(st.allDays) !== this.today;
  }

  /**
   * A finished session's day while the market is closed (NaN otherwise). A real close given for that day ends
   * the session (sessionClose) and is not an anchor of the history before it.
   */
  private closedSessionDay(st: State): number {
    return this.closed(st) ? this.sessionDay(st.allDays) : NaN;
  }

  /** The real open and close a source or the calibration snapshot gives for a finished session's day. */
  private sessionClose(st: State, day: number): { o?: number; c: number } | undefined {
    const ok = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > (st.additive ? -50 : 0);
    const bar = st.extBars.get(day);
    if (bar && ok(bar.c)) return ok(bar.o) ? { o: bar.o, c: bar.c } : { c: bar.c };
    const ext = st.extAnchors.get(day);
    if (ok(ext)) return { c: ext };
    const iso = dayToIso(day);
    const snap = ANCHORS.get(st.def.id)?.find(([d]) => d === iso)?.[1];
    return ok(snap) ? { c: snap } : undefined;
  }

  // ------------------------------------------------------------ simulation

  start(intervalMs = this.tickMs) {
    this.stop();
    this.tickMs = intervalMs;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const t = this.now();
    if (dayNum(t) !== this.today) {
      this.rollover(t);
      return;
    }
    this.refreshAll(t, true);
  }

  private rollover(t: number) {
    this.today = dayNum(t);
    this.version++;
    this.derivedCache.clear();
    for (const st of this.states.values()) {
      // Lines on real data keep their sessions; the source moves them on.
      if (st.ext) continue;
      st.daily = null;
      st.dailyKey = '';
      // Rolling feed windows (e.g. 24h of 5-minute crypto bars) survive midnight.
      const rolling = st.liveIntraday && st.intra && st.intra.series.span !== MINUTE_MS;
      if (rolling) {
        st.intra!.day = this.sessionDay(st.allDays);
      } else {
        st.intra = null;
        st.live = false;
        st.liveIntraday = false;
        st.trades = [];
      }
    }
    this.refreshAll(t, false);
  }

  private refreshAll(t: number, jitter: boolean) {
    const changed = new Set<string>();
    this.tickCount++;
    if (this.realOnly) {
      // Nothing is simulated: the tick only lets screens refresh their clocks.
      for (const fn of this.listeners) fn(changed);
      return;
    }
    for (const st of this.states.values()) {
      if (st.kind !== 'base' || st.ext) continue;
      // A market closed for the weekend neither ticks nor trades.
      if (jitter && (st.live || this.closed(st))) continue;
      if (jitter && Math.random() > this.tickProbability(st)) continue;
      this.updateBase(st, t, jitter);
      changed.add(st.def.id);
    }
    for (const st of this.states.values()) {
      if (st.kind === 'base' || st.ext) continue;
      if (jitter && this.closed(st)) continue;
      if (jitter && Math.random() > this.tickProbability(st)) continue;
      this.updateDerived(st, t);
      changed.add(st.def.id);
    }
    for (const id of changed) {
      const st = this.states.get(id)!;
      if (id.startsWith('CCY:')) continue;
      this.publishQuote(st, t);
      if (jitter) this.maybeTrade(st, t);
    }
    for (const fn of this.listeners) fn(changed);
  }

  private tickProbability(st: State): number {
    switch (st.def.cls) {
      case 'fx':
        return 0.85;
      case 'crypto':
        return 0.9;
      case 'equity':
        return 0.55 + Math.min(0.35, (st.def.adv ?? 0) / 1e8);
      case 'index':
        return 0.9;
      case 'commodity':
        return 0.6;
      case 'rate':
        return 0.45;
      case 'bond':
        return 0.45;
      case 'future':
        return 0.9;
      default:
        return 0.5;
    }
  }

  private enc(st: State, v: number) {
    return st.additive ? v : Math.log(v);
  }

  private dec(st: State, x: number) {
    return st.additive ? x : Math.exp(x);
  }

  private sigmaDaily(st: State) {
    return st.def.vol / Math.sqrt(st.allDays ? 365 : 252);
  }

  private regimeCache = new Map<number, number>();

  /** Smooth volatility regime: quiet and turbulent stretches. */
  private regime(st: State, day: number): number {
    let g = this.regimeCache.get(day);
    if (g === undefined) {
      g = 0.2 * valueNoise(0x51ed, day / 23);
      this.regimeCache.set(day, g);
    }
    return Math.exp(g + 0.08 * valueNoise(st.seed, day / 37) - 0.015);
  }

  /** Shock for one daily step (excluding drift and mean reversion). */
  private dayShock(st: State, day: number, reg = this.regime(st, day)): number {
    let z = 0;
    for (const [f, l] of st.load) z += l * normal(f, day, 1);
    z += st.idio * normal(st.seed, day, 2);
    return this.sigmaDaily(st) * reg * z;
  }

  /**
   * Previous close without building the full history: walk forward from the
   * most recent anchor. Must agree with ensureDaily (tested).
   */
  private fastPrevClose(st: State): number {
    const lastDay = this.lastHistDay(st.allDays);
    const session = this.closedSessionDay(st);
    const onGrid = (d: number) => {
      if (d === session) return -Infinity;
      let x = Math.min(d, lastDay);
      if (!st.allDays) while (!isBusinessDay(x)) x--;
      return x;
    };
    let best = -Infinity;
    let level = NaN;
    for (const [d, v] of st.extAnchors) {
      const g = onGrid(d);
      if (g > best) {
        best = g;
        level = v;
      }
    }
    const snap = ANCHORS.get(st.def.id);
    if (snap) {
      for (const [iso, v] of snap) {
        const g = onGrid(isoToDay(iso));
        if (g > best) {
          best = g;
          level = v;
        }
      }
    }
    if (!Number.isFinite(best)) return st.def.px;
    let x = this.enc(st, level);
    const perDayDrift = st.drift / (st.allDays ? 365 : 252);
    for (let d = best + 1; d <= lastDay; d++) {
      if (!st.allDays && !isBusinessDay(d)) continue;
      x = x + this.dayShock(st, d) + perDayDrift + this.revertStep(st, x, 1);
    }
    return this.floor(st, this.dec(st, x));
  }

  /** Soft floor for series that should not print absurd lows (VIX). */
  private floor(st: State, v: number): number {
    if (st.def.ticker !== 'VIX' || v >= 10) return v;
    return 10 - (10 - v) * 0.3;
  }

  private minuteFactors(f: number, day: number): Float64Array {
    if (this.minuteFactorDay !== this.today) {
      this.minuteFactor.clear();
      this.minuteFactorDay = this.today;
    }
    // At a weekend crypto runs on today's factors and the other markets on Friday's.
    const key = `${day}:${f}`;
    let arr = this.minuteFactor.get(key);
    if (!arr) {
      arr = new Float64Array(MINUTES);
      for (let m = 0; m < MINUTES; m++) arr[m] = normal(f, day, 10_000 + m);
      this.minuteFactor.set(key, arr);
    }
    return arr;
  }

  private revertStep(st: State, x: number, perDay: number): number {
    if (!st.revert) return 0;
    return st.revert.kappa * perDay * (st.revert.target - x);
  }

  // ---------------------------------------------------------------- history

  private anchorsFor(st: State, grid: Int32Array): Map<number, number> {
    const out = new Map<number, number>();
    const first = grid[0];
    const last = grid[grid.length - 1];
    const indexOf = (day: number) => {
      // Largest grid index with grid[i] <= day.
      let lo = 0;
      let hi = grid.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (grid[mid] <= day) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans;
    };
    const session = this.closedSessionDay(st);
    const add = (day: number, level: number, override: boolean) => {
      if (day < first || day === session || !Number.isFinite(level) || level <= (st.additive ? -50 : 0)) return;
      const idx = indexOf(Math.min(day, last));
      if (idx < 0) return;
      if (!override && out.has(idx)) return;
      out.set(idx, this.enc(st, level));
    };
    for (const [d, v] of st.extAnchors) add(d, v, true);
    const snap = ANCHORS.get(st.def.id);
    if (snap) for (const [iso, v] of snap) add(isoToDay(iso), v, false);
    if (out.size === 0) out.set(grid.length - 1, this.enc(st, st.def.px));
    return out;
  }

  private ensureDaily(st: State) {
    const key = `${this.today}:${this.version}`;
    if (st.daily && st.dailyKey === key) return;
    const lastDay = this.lastHistDay(st.allDays);
    const n = Math.round(HIST_YEARS * (st.allDays ? 365 : 261));
    const grid = buildGrid(lastDay, n, st.allDays);
    const r = new Float64Array(n);
    const reg = new Float64Array(n);
    const perDayDrift = st.drift / (st.allDays ? 365 : 252);
    for (let i = 0; i < n; i++) reg[i] = this.regime(st, grid[i]);
    for (let i = 1; i < n; i++) r[i] = this.dayShock(st, grid[i], reg[i]) + perDayDrift;
    const anchors = this.anchorsFor(st, grid);
    const idx = [...anchors.keys()].sort((a, b) => b - a);
    const x = new Float64Array(n);
    const a0 = idx[0];
    x[a0] = anchors.get(a0)!;
    for (let i = a0 + 1; i < n; i++) x[i] = x[i - 1] + r[i] + this.revertStep(st, x[i - 1], 1);
    for (let j = 0; j < idx.length - 1; j++) {
      const hi = idx[j];
      const lo = idx[j + 1];
      x[lo] = anchors.get(lo)!;
      let sum = 0;
      for (let k = lo + 1; k <= hi; k++) sum += r[k];
      const c = (x[hi] - x[lo] - sum) / (hi - lo);
      for (let k = lo + 1; k < hi; k++) x[k] = x[k - 1] + r[k] + c;
    }
    const aLast = idx[idx.length - 1];
    for (let i = aLast - 1; i >= 0; i--) x[i] = x[i + 1] - r[i + 1] + this.revertStep(st, x[i + 1], 1);

    const s = makeSeries(n + 1, DAY_MS);
    const sd = this.sigmaDaily(st);
    const adv = this.advFor(st);
    for (let i = 0; i < n; i++) {
      const day = grid[i];
      const c = this.floor(st, this.dec(st, x[i]));
      const prev = i > 0 ? this.floor(st, this.dec(st, x[i - 1])) : c;
      const rg = reg[i];
      const gap = sd * rg * 0.22 * normal(st.seed, day, 3);
      const o = this.floor(st, st.additive ? prev + gap : prev * Math.exp(gap));
      const up = sd * rg * 0.55 * Math.abs(normal(st.seed, day, 4));
      const dn = sd * rg * 0.55 * Math.abs(normal(st.seed, day, 5));
      s.t[i] = dayStart(day);
      s.o[i] = o;
      s.c[i] = c;
      s.h[i] = st.additive ? Math.max(o, c) + up : Math.max(o, c) * Math.exp(up);
      s.l[i] = st.additive ? Math.min(o, c) - dn : Math.min(o, c) * Math.exp(-dn);
      const move = Math.min(3, Math.abs(i > 0 ? x[i] - x[i - 1] : 0) / (sd * rg || 1));
      s.v[i] = adv > 0 ? Math.round((adv * Math.exp(0.3 * normal(st.seed, day, 6) - 0.045) * (0.7 + 0.6 * move)) / 1.18) : 0;
      const ext = st.extBars.get(day);
      if (ext) {
        s.o[i] = ext.o;
        s.h[i] = ext.h;
        s.l[i] = ext.l;
        s.c[i] = ext.c;
        if (ext.v > 0) s.v[i] = ext.v;
      }
    }
    s.length = n + 1;
    st.daily = s;
    st.dailyKey = key;
    st.prevClose = s.c[n - 1];
    this.writeTodayBar(st);
  }

  private advFor(st: State): number {
    const adv = st.def.adv ?? 0;
    if (st.def.cls === 'crypto') return adv / Math.max(st.def.px, 1e-9);
    if (st.def.cls === 'index' && st.def.ticker === 'VIX') return 0;
    return adv;
  }

  /** Today's forming bar (at a weekend, Friday's finished one) mirrors the intraday state. */
  private writeTodayBar(st: State) {
    const s = st.daily;
    if (!s) return;
    const n = s.length - 1;
    s.t[n] = dayStart(this.sessionDay(st.allDays));
    s.o[n] = st.dayOpen;
    s.h[n] = st.dayHigh;
    s.l[n] = st.dayLow;
    s.c[n] = st.last;
    s.v[n] = st.volume;
  }

  // --------------------------------------------------------------- intraday

  private ensureIntra(st: State, t: number) {
    const day = this.sessionDay(st.allDays);
    if (!st.intra || st.intra.day !== day) {
      const key = `${this.today}:${this.version}`;
      const prev = st.daily && st.dailyKey === key ? st.daily.c[st.daily.length - 2] : this.fastPrevClose(st);
      st.prevClose = prev;
      const sd = this.sigmaDaily(st);
      const gap = sd * this.regime(st, day) * 0.22 * normal(st.seed, day, 3);
      const real = this.closed(st) ? this.sessionClose(st, day) : undefined;
      const open = real?.o ?? (st.additive ? prev + gap : prev * Math.exp(gap));
      const x = new Float64Array(MINUTES + 1);
      x[0] = this.enc(st, open);
      st.intra = { day, x, filled: 1, series: makeSeries(MINUTES + 1, MINUTE_MS), cur: -1, totalVol: 0 };
      if (real) {
        // The finished session ends at its real close: the simulated path is bent to meet it.
        this.fillPath(st, MINUTES);
        const miss = this.enc(st, real.c) - x[MINUTES];
        for (let k = 1; k <= MINUTES; k++) x[k] += (miss * k) / MINUTES;
      }
      st.dayOpen = open;
      st.dayHigh = open;
      st.dayLow = open;
      st.volume = 0;
      st.last = open;
      st.liveIntraday = false;
    }
    if (st.liveIntraday) return;
    // A finished session (a weekend's Friday) runs to its last minute.
    const m = Math.min(MINUTES - 1, Math.floor((t - dayStart(day)) / MINUTE_MS));
    this.fillPath(st, m + 1);
    const it = st.intra!;
    const s = it.series;
    const sm = (this.sigmaDaily(st) * this.regime(st, day)) / Math.sqrt(MINUTES);
    const advMin = this.advFor(st) / MINUTES;
    // Finalise completed minutes and open the current one.
    for (let k = Math.max(0, it.cur); k <= m; k++) {
      const o = this.dec(st, it.x[k]);
      const c = this.dec(st, it.x[k + 1]);
      const up = sm * 0.6 * Math.abs(normal(st.seed, day, 30_000 + k));
      const dn = sm * 0.6 * Math.abs(normal(st.seed, day, 40_000 + k));
      const vol = advMin > 0 ? Math.round(advMin * Math.exp(0.5 * normal(st.seed, day, 50_000 + k) - 0.125)) : 0;
      const complete = k < m;
      const hi = st.additive ? Math.max(o, c) + up : Math.max(o, c) * Math.exp(up);
      const lo = st.additive ? Math.min(o, c) - dn : Math.min(o, c) * Math.exp(-dn);
      if (k === it.cur && complete) {
        // The bar that was forming: keep observed extremes, settle the close.
        s.c[k] = c;
        s.h[k] = Math.max(s.h[k], hi, c);
        s.l[k] = Math.min(s.l[k], lo, c);
        it.totalVol += vol - s.v[k];
        s.v[k] = vol;
      } else if (k !== it.cur) {
        s.t[k] = dayStart(day) + k * MINUTE_MS;
        s.o[k] = o;
        s.c[k] = complete ? c : o;
        s.h[k] = complete ? hi : o;
        s.l[k] = complete ? lo : o;
        s.v[k] = complete ? vol : 0;
        it.totalVol += s.v[k];
      }
      if (complete) {
        st.dayHigh = Math.max(st.dayHigh, s.h[k]);
        st.dayLow = Math.min(st.dayLow, s.l[k]);
      }
    }
    it.cur = m;
    s.length = m + 1;
  }

  private fillPath(st: State, upto: number) {
    const it = st.intra!;
    if (it.filled > upto) return;
    const sm = (this.sigmaDaily(st) * this.regime(st, it.day)) / Math.sqrt(MINUTES);
    const fs = st.load.map(([f, l]) => [this.minuteFactors(f, it.day), l] as const);
    for (let k = it.filled; k <= upto; k++) {
      const minute = k - 1;
      let z = 0;
      for (const [arr, l] of fs) z += l * arr[minute];
      z += st.idio * normal(st.seed, it.day, 20_000 + minute);
      it.x[k] = it.x[k - 1] + sm * z + this.revertStep(st, it.x[k - 1], 1 / MINUTES);
    }
    it.filled = upto + 1;
  }

  /** Simulated level at time t, with optional Brownian-bridge jitter inside the minute. */
  private simLevel(st: State, t: number, jitter: boolean): number {
    const it = st.intra!;
    const pos = (t - dayStart(it.day)) / MINUTE_MS;
    const m = Math.min(MINUTES - 1, Math.floor(pos));
    const f = Math.min(1, pos - m);
    let x = it.x[m] + f * (it.x[m + 1] - it.x[m]);
    if (jitter) {
      const sm = (this.sigmaDaily(st) * this.regime(st, it.day)) / Math.sqrt(MINUTES);
      x += sm * 0.45 * Math.sqrt(f * (1 - f)) * gaussianRandom();
    }
    return this.dec(st, x);
  }

  private updateBase(st: State, t: number, jitter: boolean) {
    this.ensureIntra(st, t);
    if (st.live) {
      this.writeTodayBar(st);
      return;
    }
    const it = st.intra!;
    const px = this.simLevel(st, t, jitter);
    const s = it.series;
    const m = it.cur;
    s.c[m] = px;
    s.h[m] = Math.max(s.h[m], px);
    s.l[m] = Math.min(s.l[m], px);
    const advMin = this.advFor(st) / MINUTES;
    if (advMin > 0) {
      const frac = (t - s.t[m]) / MINUTE_MS;
      const target = Math.round(advMin * Math.exp(0.5 * normal(st.seed, it.day, 50_000 + m) - 0.125) * Math.min(1, frac));
      if (target > s.v[m]) {
        it.totalVol += target - s.v[m];
        s.v[m] = target;
      }
    }
    st.last = px;
    st.dayHigh = Math.max(st.dayHigh, px);
    st.dayLow = Math.min(st.dayLow, px);
    st.volume = it.totalVol;
    this.writeTodayBar(st);
  }

  // ---------------------------------------------------------------- derived

  private dailyOf(st: State): Series {
    if (st.ext) return st.ext.daily;
    this.ensureDaily(st);
    return st.daily!;
  }

  private intraOf(st: State, t: number): Series {
    if (st.ext) return st.ext.intra;
    this.ensureIntra(st, t);
    return st.intra!.series;
  }

  private componentValue(id: string): number {
    if (id === 'USD') return 1;
    return this.states.get(id)!.last;
  }

  /** Value of a derived line given its component levels, on a settlement/pricing day. */
  private derivedValue(st: State, val: (id: string) => number, day = this.sessionDay(false)): number {
    switch (st.kind) {
      case 'pair':
        return val(st.pair!.base) / val(st.pair!.quote);
      case 'dxy': {
        let ln = Math.log(DXY_CONST);
        for (const [c, w] of DXY_WEIGHTS) {
          // Weights apply to USD-quoted pairs (EURUSD, USDJPY...): EUR/GBP pairs are EURUSD, others USDxxx.
          const usdPer = val(`CCY:${c}`);
          const pair = c === 'EUR' || c === 'GBP' ? usdPer : 1 / usdPer;
          ln += w * Math.log(pair);
        }
        return Math.exp(ln);
      }
      case 'bond':
        return this.bondPrice(st, this.bondYield(st, val), day);
      case 'fut':
        return this.futurePrice(st, val, day);
      default:
        return NaN;
    }
  }

  /**
   * Bond yield: interpolated benchmark yield plus the credit spread. The
   * spread widens when the issuer's shares fall and tightens when they rally.
   */
  private bondYield(st: State, val: (id: string) => number): number {
    const b = st.bond!;
    let y = 0;
    for (const l of b.legs) y += l.w * val(l.id);
    let mult = 1;
    if (b.issuer && b.issuerRef) {
      const px = val(b.issuer);
      if (px > 0) mult = Math.exp(-0.6 * Math.max(-0.7, Math.min(0.7, Math.log(px / b.issuerRef))));
    }
    return y + (b.spread * mult) / 100;
  }

  private pricers = new Map<string, { day: number; fn: (y: number) => number }>();

  private bondPrice(st: State, yieldPct: number, day: number): number {
    const b = st.bond!;
    let p = this.pricers.get(st.def.id);
    if (!p || p.day !== day) {
      const settle = settlementDate(new Date(dayStart(day)));
      p = { day, fn: settle.getTime() >= b.terms.maturity.getTime() ? () => 100 : cleanPricer(b.terms, settle) };
      this.pricers.set(st.def.id, p);
    }
    return p.fn(yieldPct);
  }

  /** Fair value of the front contract: index carried at (r - q) to expiry, on the tick grid. */
  private futurePrice(st: State, val: (id: string) => number, day: number): number {
    const f = st.fut!;
    const und = val(f.underlying);
    const r = f.rateId ? val(f.rateId) : f.rate;
    const T = (frontFuture(day, f.monthly).expiry - day) / 365;
    const px = und * Math.exp((r / 100 - f.q) * T);
    return Math.round(px / f.tick) * f.tick;
  }

  /** A bond's market yield now and at the previous close (percent). */
  bondYields(id: string): { last: number; prev: number; spread: number } | undefined {
    const st = this.states.get(id);
    if (!st || st.kind !== 'bond') return undefined;
    const last = this.bondYield(st, (c) => this.componentValue(c));
    const prev = this.bondYield(st, (c) => this.states.get(c)!.prevClose);
    let bench = 0;
    for (const l of st.bond!.legs) bench += l.w * this.componentValue(l.id);
    return { last, prev, spread: (last - bench) * 100 };
  }

  /** Front contract details for a generic future. */
  futureContract(id: string): { code: string; expiry: number; days: number; fair: number; carry: number; rate: number; q: number } | undefined {
    const st = this.states.get(id);
    if (!st || st.kind !== 'fut') return undefined;
    const f = st.fut!;
    const front = frontFuture(this.today, f.monthly);
    const und = this.componentValue(f.underlying);
    const rate = f.rateId ? this.componentValue(f.rateId) : f.rate;
    const fair = und * Math.exp((rate / 100 - f.q) * ((front.expiry - this.today) / 365));
    const root = st.def.ticker.replace(/1$/, '').trim();
    // Single-letter roots keep Bloomberg's space: "Z Z6".
    return { code: `${root}${root.length === 1 ? ' ' : ''}${front.code}`, expiry: front.expiry, days: front.expiry - this.today, fair, carry: fair - und, rate, q: f.q };
  }

  /** Open/high/low/close of a derived line from component bars. */
  private derivedBar(st: State, get: (id: string, f: Field) => number, day: number, up: number, dn: number): [number, number, number, number] {
    const at = (pick: (id: string) => Field) => this.derivedValue(st, (id) => (id === 'USD' ? 1 : get(id, pick(id))), day);
    const o = at(() => 'o');
    const c = at(() => 'c');
    let h: number;
    let l: number;
    if (st.kind === 'bond') {
      // Price is inverse to yield: the yield low is the price high.
      const legs = new Set(st.bond!.legs.map((x) => x.id));
      h = at((id) => (legs.has(id) ? 'l' : 'c'));
      l = at((id) => (legs.has(id) ? 'h' : 'c'));
    } else if (st.kind === 'fut') {
      const und = st.fut!.underlying;
      h = at((id) => (id === und ? 'h' : 'c'));
      l = at((id) => (id === und ? 'l' : 'c'));
    } else {
      h = Math.max(o, c) * (1 + up);
      l = Math.min(o, c) * (1 - dn);
    }
    return [o, Math.max(h, o, c), Math.min(l, o, c), c];
  }

  private updateDerived(st: State, t: number) {
    const isNew = !st.intra || st.intra.day !== this.today;
    const px = this.derivedValue(st, (id) => this.componentValue(id));
    // Set before rebuilding today's bars: the forming bar closes at the current level.
    st.last = px;
    if (isNew) {
      st.intra = { day: this.today, x: new Float64Array(0), filled: 0, series: makeSeries(0, MINUTE_MS), cur: -1, totalVol: 0 };
      const comps = this.componentIds(st);
      const prevVals = new Map(comps.map((c) => [c, c === 'USD' ? 1 : this.states.get(c)!.prevClose]));
      const openVals = new Map(comps.map((c) => [c, c === 'USD' ? 1 : this.states.get(c)!.dayOpen]));
      st.prevClose = this.derivedValue(st, (id) => prevVals.get(id)!, this.lastHistDay(false));
      st.dayOpen = this.derivedValue(st, (id) => openVals.get(id)!);
      const intra = this.derivedIntraday(st);
      st.dayHigh = st.dayOpen;
      st.dayLow = st.dayOpen;
      for (let i = 0; i < intra.length; i++) {
        st.dayHigh = Math.max(st.dayHigh, intra.h[i]);
        st.dayLow = Math.min(st.dayLow, intra.l[i]);
      }
    }
    st.last = px;
    st.dayHigh = Math.max(st.dayHigh, px);
    st.dayLow = Math.min(st.dayLow, px);
    if (st.kind === 'fut') {
      const day = this.sessionDay(false);
      const frac = Math.min(1, (t - dayStart(day)) / DAY_MS);
      st.volume = Math.round(this.advFor(st) * frac * Math.exp(0.25 * normal(st.seed, day, 6) - 0.03));
    }
  }

  /**
   * A cross is as real as its currencies. Bonds and futures without their own
   * feed are model prices (curve plus spread, or fair value), so they stay SIM.
   */
  private derivedSrc(st: State): Quote['src'] {
    if (st.kind !== 'pair' && st.kind !== 'dxy') return 'SIM';
    const comps = this.componentIds(st).filter((c) => c !== 'USD').map((c) => this.states.get(c));
    if (!comps.length || comps.some((c) => !c?.ext)) return 'SIM';
    return comps.some((c) => c!.ext!.open) ? 'LIVE' : 'CLOSE';
  }

  private componentIds(st: State): string[] {
    switch (st.kind) {
      case 'pair':
        return [st.pair!.base, st.pair!.quote];
      case 'dxy':
        return DXY_WEIGHTS.map(([c]) => `CCY:${c}`);
      case 'bond': {
        const b = st.bond!;
        return [...b.legs.map((l) => l.id), ...(b.issuer ? [b.issuer] : [])];
      }
      case 'fut': {
        const f = st.fut!;
        return [f.underlying, ...(f.rateId ? [f.rateId] : [])];
      }
      default:
        return [];
    }
  }

  private derivedDaily(st: State): Series {
    const comps = this.componentIds(st).filter((c) => c !== 'USD');
    const bases = comps.map((c) => this.dailyOf(this.states.get(c)!));
    const key = `D:${this.today}:${this.version}:${comps.map((c) => this.states.get(c)!.dailyKey).join('|')}`;
    const cached = this.derivedCache.get(`D:${st.def.id}`);
    if (cached && cached.key === key) {
      this.writeDerivedToday(st, cached.series);
      return cached.series;
    }
    const primary = bases[0];
    const n = primary.length;
    const out = makeSeries(n, DAY_MS);
    const sd = st.def.vol / Math.sqrt(252);
    const adv = this.advFor(st);
    const issueDay = st.bond?.issueDay ?? -Infinity;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const tm = primary.t[i];
      const day = dayNum(tm);
      if (day < issueDay) continue;
      // Business-day calendars line up by index; anything else is matched by time.
      const idx = bases.map((b) => (b.length === n && b.t[i] === tm ? i : indexAtOrBefore(b, tm)));
      const get = (id: string, f: Field) => {
        const j = comps.indexOf(id);
        const k = idx[j];
        return k >= 0 ? bases[j][f][k] : this.componentValue(id);
      };
      const up = sd * 0.5 * Math.abs(normal(st.seed, day, 4));
      const dn = sd * 0.5 * Math.abs(normal(st.seed, day, 5));
      const [o, h, l, c] = this.derivedBar(st, get, day, Math.expm1(up), -Math.expm1(-dn));
      out.t[w] = tm;
      out.o[w] = o;
      out.h[w] = h;
      out.l[w] = l;
      out.c[w] = c;
      out.v[w] = adv > 0 ? Math.round(adv * Math.exp(0.3 * normal(st.seed, day, 6) - 0.045)) : 0;
      w++;
    }
    out.length = w;
    this.derivedCache.set(`D:${st.def.id}`, { key, series: out });
    this.writeDerivedToday(st, out);
    return out;
  }

  private writeDerivedToday(st: State, s: Series) {
    const n = s.length - 1;
    if (n < 0 || dayNum(s.t[n]) !== this.sessionDay(false)) return;
    s.o[n] = st.dayOpen;
    s.h[n] = Math.max(st.dayHigh, st.dayLow);
    s.l[n] = Math.min(st.dayLow, st.dayHigh);
    s.c[n] = st.last;
    if (st.kind === 'fut') s.v[n] = st.volume;
  }

  private derivedIntraday(st: State): Series {
    const comps = this.componentIds(st).filter((c) => c !== 'USD');
    const t = this.now();
    const bases = comps.map((c) => this.intraOf(this.states.get(c)!, t));
    const key = `I:${this.tickCount}:${this.version}:${bases.map((b) => b.length).join(',')}`;
    const cached = this.derivedCache.get(`I:${st.def.id}`);
    if (cached && cached.key === key) return cached.series;
    const primary = bases[0];
    const n = primary.length;
    const out = makeSeries(n, primary.span);
    const sm = st.def.vol / Math.sqrt(252) / Math.sqrt(MINUTES);
    const advMin = this.advFor(st) / MINUTES;
    const day = this.sessionDay(false);
    for (let i = 0; i < n; i++) {
      const tm = primary.t[i];
      const idx = bases.map((b) => (b.t[i] === tm && i < b.length ? i : indexAtOrBefore(b, tm)));
      const get = (id: string, f: Field) => {
        const j = comps.indexOf(id);
        const k = idx[j];
        return k >= 0 ? bases[j][f][k] : this.componentValue(id);
      };
      const up = sm * 0.5 * Math.abs(normal(st.seed, day, 30_000 + i));
      const dn = sm * 0.5 * Math.abs(normal(st.seed, day, 40_000 + i));
      const [o, h, l, c] = this.derivedBar(st, get, day, up, dn);
      out.t[i] = tm;
      out.o[i] = o;
      out.h[i] = h;
      out.l[i] = l;
      out.c[i] = c;
      out.v[i] = advMin > 0 ? Math.round(advMin * Math.exp(0.5 * normal(st.seed, day, 50_000 + i) - 0.125)) : 0;
    }
    if (n > 0) {
      out.c[n - 1] = st.last;
      out.h[n - 1] = Math.max(out.h[n - 1], st.last);
      out.l[n - 1] = Math.min(out.l[n - 1], st.last);
    }
    out.length = n;
    this.derivedCache.set(`I:${st.def.id}`, { key, series: out });
    return out;
  }

  // ----------------------------------------------------------------- quotes

  private spread(st: State, px: number): number {
    const d = st.def;
    const tick = 10 ** -d.dec;
    switch (d.cls) {
      case 'equity':
        return Math.max(tick, Math.round((px * 0.00012) / tick) * tick);
      case 'fx':
        return tick * (['EURUSD', 'USDJPY', 'GBPUSD'].includes(d.ticker) ? 1 : 2);
      case 'crypto':
        return Math.max(tick, px * 0.00004);
      case 'commodity':
        return tick * 2;
      case 'rate':
        return 0.004;
      case 'bond':
        // Treasuries quote in 1/128ths; investment-grade corporates about an eighth wide.
        return d.yk === 'Corp' ? 0.125 : 1 / 128;
      case 'future':
        return d.fut!.tick;
      default:
        return 0;
    }
  }

  private publishQuote(st: State, t: number) {
    if (this.realOnly && !st.ext) {
      this.quotes.set(st.def.id, emptyQuote(st.def.id));
      return;
    }
    const prev = this.quotes.get(st.def.id);
    const last = st.last;
    const sp = this.spread(st, last);
    const tick: -1 | 0 | 1 = prev ? (last > prev.last ? 1 : last < prev.last ? -1 : prev.tick) : 0;
    const chg = last - st.prevClose;
    let bid = sp > 0 ? (st.additive ? last + sp / 2 : last - sp / 2) : NaN;
    let ask = sp > 0 ? (st.additive ? last - sp / 2 : last + sp / 2) : NaN;
    if (st.ext) {
      // The source's own bid and offer, or none: a real line never shows an invented spread.
      bid = Number.isFinite(st.ext.bid) && st.ext.bid > 0 ? st.ext.bid : NaN;
      ask = Number.isFinite(st.ext.ask) && st.ext.ask > 0 ? st.ext.ask : NaN;
    } else if (st.kind === 'fut') {
      // One tick wide, with the last trade on the side that was lifted or hit.
      bid = tick > 0 ? last - sp : last;
      ask = bid + sp;
    }
    const q: Quote = {
      id: st.def.id,
      last,
      bid,
      ask,
      open: st.dayOpen,
      high: st.dayHigh,
      low: st.dayLow,
      prevClose: st.prevClose,
      volume: st.volume,
      chg,
      // No previous close (or zero) gives no percentage, never 0%.
      pct: Number.isFinite(st.prevClose) && st.prevClose !== 0 ? (chg / Math.abs(st.prevClose)) * 100 : NaN,
      // A real line carries the market's own time, not the moment it was redrawn; a closed market's ends with its session.
      time: st.ext ? st.ext.time : Math.min(t, dayStart(this.sessionDay(st.allDays) + 1) - 1),
      tick,
      src: st.ext ? extSrc(st.ext) : st.kind !== 'base' ? this.derivedSrc(st) : st.live ? 'LIVE' : 'SIM',
    };
    if (st.ext?.delay) q.delay = st.ext.delay;
    if (st.ext?.sourceName) q.sourceName = st.ext.sourceName;
    if (st.ext?.dayProvider) q.dayProvider = st.ext.dayProvider;
    if (st.ext?.settled && st.ext.settled.day === st.ext.session) q.sessionSettled = true;
    if (st.ext?.settled && st.ext.settled.day === st.ext.session && st.ext.settled.volume >= st.volume) q.volumeSource = st.ext.settled.source;
    if (st.ext?.settled?.open && st.ext.settled.day === st.ext.session && st.dayOpen === st.ext.settled.open.price) q.openSource = st.ext.settled.open.source;
    if (st.ext?.settled?.range && st.ext.settled.day === st.ext.session && st.dayHigh === st.ext.settled.range.high && st.dayLow === st.ext.settled.range.low) q.rangeSource = st.ext.settled.range.source;
    if (st.ext?.provider) q.provider = st.ext.provider;
    if (st.ext) {
      if (st.prevCloseDay !== undefined) q.prevCloseDay = st.prevCloseDay;
      if (st.chgCheck) q.chgCheck = st.chgCheck;
      if (st.prevSettle) q.prevSettle = true;
    }
    if (st.ext) q.fetched = st.ext.fetched;
    if (st.ext?.extended) q.extended = st.ext.extended;
    if (st.ext?.dayOnly && !st.ext.eod) q.dayOnly = true;
    if (st.ext?.tz) q.tz = st.ext.tz;
    if (st.ext?.volumeUnit) q.volumeUnit = st.ext.volumeUnit;
    // The trading session apart from the data's freshness: unknown for end-of-day series and before the first quote.
    if (st.ext && !st.ext.eod && !st.ext.dayOnly && st.ext.sessionKnown !== false) q.session = st.ext.open ? 'open' : (st.ext.state ?? st.ext.extended?.session ?? 'closed');
    else if (!st.ext && this.closed(st)) q.session = 'closed';
    this.quotes.set(st.def.id, q);
  }

  private venuesFor(st: State): string[] {
    switch (st.def.cls) {
      case 'equity':
        return VENUES[st.def.country] ?? VENUES_US;
      case 'crypto':
        return ['CB', 'BS', 'KR'];
      case 'future':
        return [FUT_VENUE[st.def.fut!.exch] ?? 'E'];
      default:
        return ['E'];
    }
  }

  private maybeTrade(st: State, t: number) {
    const cls = st.def.cls;
    if (cls !== 'equity' && cls !== 'commodity' && cls !== 'crypto' && cls !== 'future') return;
    if (st.live) return;
    const q = this.quotes.get(st.def.id)!;
    const n = Math.random() < 0.35 ? 0 : 1 + Math.floor(Math.random() * 3);
    const adv = this.advFor(st);
    const venues = this.venuesFor(st);
    for (let i = 0; i < n; i++) {
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const px = side > 0 ? q.ask : q.bid;
      const base = Math.max(1, adv / 23_400 / 3);
      let size = Math.max(1, Math.round(base * Math.exp(gaussianRandom() * 0.9)));
      if (cls === 'equity') size = size >= 100 ? Math.round(size / 100) * 100 : size;
      if (cls === 'crypto') size = Math.max(0.0001, Number((base * Math.exp(gaussianRandom() * 1.1)).toPrecision(3)));
      const cond = cls === 'equity' && size < 100 ? 'I' : Math.random() < 0.06 ? 'F' : '';
      this.pushTrade(st, { t: t - Math.floor(Math.random() * 900), px: Number.isFinite(px) ? px : q.last, size, side, venue: venues[Math.floor(Math.random() * venues.length)], cond });
    }
  }

  private pushTrade(st: State, tr: Trade) {
    st.trades.unshift(tr);
    if (st.trades.length > TRADE_BUFFER) st.trades.length = TRADE_BUFFER;
  }

  /** Seeds a recent tape so Time & Sales is never empty on open. */
  backfillTrades(id: string) {
    const st = this.states.get(id);
    // Lines on real or live data show only the source's prints, never an invented tape.
    if (!st || this.realOnly || st.ext || st.live || st.trades.length >= 100) return;
    const s = this.intraday(id);
    const q = this.quotes.get(id);
    if (!q || s.length === 0) return;
    const now = this.now();
    const adv = this.advFor(st);
    const cls = st.def.cls;
    if (cls !== 'equity' && cls !== 'commodity' && cls !== 'crypto' && cls !== 'future') return;
    const venues = this.venuesFor(st);
    const sp = this.spread(st, q.last);
    const out: Trade[] = [];
    // A market closed for the weekend printed its last trades at the end of its session.
    let t = st.trades.length ? st.trades[st.trades.length - 1].t : this.closed(st) ? q.time : now;
    for (let i = 0; i < 150 - st.trades.length; i++) {
      t -= 400 + Math.random() * 2500;
      const idx = Math.max(0, Math.min(s.length - 1, Math.floor((t - s.t[0]) / s.span)));
      const mid = s.c[idx];
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const base = Math.max(1, adv / 23_400 / 3);
      let size = Math.max(1, Math.round(base * Math.exp(gaussianRandom() * 0.9)));
      if (cls === 'equity') size = size >= 100 ? Math.round(size / 100) * 100 : size;
      if (cls === 'crypto') size = Number((base * Math.exp(gaussianRandom() * 1.1)).toPrecision(3));
      out.push({ t, px: cls === 'future' ? (side > 0 ? mid : mid - sp) : mid + (side * sp) / 2, size, side, venue: venues[i % venues.length], cond: size < 100 && cls === 'equity' ? 'I' : '' });
    }
    st.trades = [...st.trades, ...out];
  }

  // ------------------------------------------------------------ live feeds

  /** Feeds a live quote; the line stops simulating and follows the feed. */
  applyLive(id: string, u: { last: number; time?: number; prevClose?: number; open?: number; high?: number; low?: number; volume?: number; size?: number }) {
    const st = this.states.get(id);
    if (!st || this.realOnly || st.ext || st.kind !== 'base' || !Number.isFinite(u.last) || u.last <= 0) return;
    const t = u.time ?? this.now();
    if (u.prevClose && Number.isFinite(u.prevClose)) {
      const lastDay = this.lastHistDay(st.allDays);
      if (st.extAnchors.get(lastDay) !== u.prevClose) {
        st.extAnchors.set(lastDay, u.prevClose);
        st.dailyKey = '';
        this.version++;
      }
    }
    this.ensureIntra(st, t);
    if (!st.live) {
      st.live = true;
      // From here the tape holds only the feed's own prints.
      st.trades = [];
      if (!st.liveIntraday) this.bridgeIntradayTo(st, u.last, u.open);
    }
    if (u.open && Number.isFinite(u.open)) st.dayOpen = u.open;
    if (u.high && Number.isFinite(u.high)) st.dayHigh = Math.max(u.high, u.last);
    if (u.low && Number.isFinite(u.low)) st.dayLow = Math.min(u.low, u.last);
    st.dayHigh = Math.max(st.dayHigh, u.last);
    st.dayLow = Math.min(st.dayLow, u.last);
    if (u.volume != null && Number.isFinite(u.volume)) st.volume = u.volume;
    if (u.prevClose && Number.isFinite(u.prevClose)) st.prevClose = u.prevClose;
    this.appendLiveBar(st, t, u.last, u.size ?? 0);
    st.last = u.last;
    this.ensureDaily(st);
    this.writeTodayBar(st);
    if (u.size) {
      const q = this.quotes.get(id);
      const side: -1 | 0 | 1 = q ? (u.last > q.last ? 1 : u.last < q.last ? -1 : 0) : 0;
      this.pushTrade(st, { t, px: u.last, size: u.size, side, venue: st.def.cls === 'crypto' ? 'CB' : 'Q', cond: '' });
    }
    this.publishQuote(st, t);
  }

  /** Notifies listeners after a batch of live updates. */
  /**
   * A finished session's volume of all venues from a second source (Nasdaq's historical prices), for the line's latest
   * session only. It replaces a smaller volume and stays when the price source repeats its shorter one; a new session
   * starts from the price source's own. Returns whether the line changed.
   */
  /**
   * Whether the line's last daily bar is a finished session with its full volume: a day before today, or today's once
   * its volume has been settled from the consolidated tape (settleVolume). A session still trading is not.
   */
  lastSessionDone(id: string): boolean {
    const s = this.daily(id);
    const n = s.length - 1;
    if (n < 0) return false;
    const day = dayNum(s.t[n]);
    return day < this.today || this.states.get(id)?.ext?.settled?.day === day;
  }

  settleVolume(id: string, day: number, volume: number, source: string, open?: { price: number; source: string }, range?: { high: number; low: number; source: string }): boolean {
    const st = this.states.get(id);
    const ext = st?.ext;
    if (!st || !ext || ext.session !== day || !(volume > 0)) return false;
    const s = ext.daily;
    const n = s.length - 1;
    if (n < 0 || dayNum(s.t[n]) !== day) return false;
    const official = open && Number.isFinite(open.price) && open.price > 0 ? open : undefined;
    const officialRange = range && Number.isFinite(range.high) && Number.isFinite(range.low) && range.low > 0 && range.high >= range.low ? range : undefined;
    const wasSettled = ext.settled?.day === day;
    ext.settled = { day, volume, source, ...(official ? { open: official } : {}), ...(officialRange ? { range: officialRange } : {}) };
    // The price source's open of a finished session can be its first print, not the official opening price (Yahoo's
    // Tesla on 29 October 2026: 405.94 against the official 405.625).
    const reopened = !!official && s.o[n] !== official.price;
    if (reopened) this.applyOpen(st, s, n, official!.price);
    // Its high and low can miss a print the consolidated tape has (Yahoo's quote for Apple on 30 October 2026: a low of
    // 342.35 against the official 334.35, which Yahoo's own daily bar later gave).
    const reranged = !!officialRange && (s.h[n] !== officialRange.high || s.l[n] !== officialRange.low);
    if (reranged) this.applyRange(st, s, n, officialRange!);
    const louder = volume > st.volume;
    if (!louder && !reopened && !reranged) {
      // Nothing to correct, but a session checked for the first time says so on its quote (no longer provisional).
      if (!wasSettled) {
        this.version++;
        this.publishQuote(st, this.now());
      }
      return false;
    }
    if (louder) {
      s.v[n] = volume;
      st.volume = volume;
    }
    this.version++;
    this.derivedCache.clear();
    this.publishQuote(st, this.now());
    return true;
  }

  /** Puts a session's official high and low on its daily bar and quote. */
  private applyRange(st: State, s: Series, n: number, r: { high: number; low: number }) {
    s.h[n] = r.high;
    s.l[n] = r.low;
    st.dayHigh = r.high;
    st.dayLow = r.low;
  }

  /** Puts a session's official open on its daily bar and quote; the day's range takes it in. */
  private applyOpen(st: State, s: Series, n: number, price: number) {
    s.o[n] = price;
    s.h[n] = Math.max(s.h[n], price);
    s.l[n] = Math.min(s.l[n], price);
    st.dayOpen = price;
    st.dayHigh = s.h[n];
    st.dayLow = s.l[n];
  }

  flush(ids: Iterable<string>) {
    const set = new Set(ids);
    for (const fn of this.listeners) fn(set);
  }

  private bridgeIntradayTo(st: State, last: number, open?: number) {
    const it = st.intra!;
    const s = it.series;
    const m = it.cur;
    if (m < 0) return;
    const x0 = this.enc(st, open && Number.isFinite(open) ? open : this.dec(st, it.x[0]));
    const xm = this.enc(st, last);
    const startDelta = x0 - it.x[0];
    const endDelta = xm - it.x[m + 1] - startDelta;
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = 0; k <= m; k++) {
      const shift = (k2: number) => startDelta + (endDelta * k2) / (m + 1);
      const conv = (v: number, k2: number) => (st.additive ? v + shift(k2) : v * Math.exp(shift(k2)));
      s.o[k] = conv(s.o[k], k);
      s.c[k] = conv(s.c[k], k + 1);
      s.h[k] = Math.max(conv(s.h[k], k), s.o[k], s.c[k]);
      s.l[k] = Math.min(conv(s.l[k], k), s.o[k], s.c[k]);
      hi = Math.max(hi, s.h[k]);
      lo = Math.min(lo, s.l[k]);
    }
    s.c[m] = last;
    st.dayOpen = s.o[0];
    st.dayHigh = Math.max(hi, last);
    st.dayLow = Math.min(lo, last);
    st.liveIntraday = true;
  }

  private appendLiveBar(st: State, t: number, px: number, size: number) {
    const it = st.intra!;
    const s = it.series;
    if (s.length === 0) return;
    let n = s.length - 1;
    while (t >= s.t[n] + s.span) {
      if (s.length >= s.t.length) this.growSeries(it);
      const prevClose = it.series.c[n];
      const ns = it.series;
      ns.t[n + 1] = ns.t[n] + ns.span;
      ns.o[n + 1] = prevClose;
      ns.h[n + 1] = prevClose;
      ns.l[n + 1] = prevClose;
      ns.c[n + 1] = prevClose;
      ns.v[n + 1] = 0;
      ns.length = n + 2;
      n++;
    }
    const ns = it.series;
    ns.c[n] = px;
    ns.h[n] = Math.max(ns.h[n], px);
    ns.l[n] = Math.min(ns.l[n], px);
    ns.v[n] += size;
  }

  private growSeries(it: Intra) {
    const s = it.series;
    const bigger = makeSeries(Math.max(16, s.t.length * 2), s.span);
    for (const k of ['t', 'o', 'h', 'l', 'c', 'v'] as const) bigger[k].set(s[k]);
    bigger.length = s.length;
    it.series = bigger;
  }

  /** Replaces today's intraday bars with feed bars (any span). */
  setIntradayBars(id: string, bars: { t: number; o: number; h: number; l: number; c: number; v: number }[], span: number) {
    const st = this.states.get(id);
    if (!st || st.ext || st.kind !== 'base' || bars.length === 0) return;
    this.ensureIntra(st, this.now());
    const s = makeSeries(bars.length + 64, span);
    bars.forEach((b, i) => {
      s.t[i] = b.t;
      s.o[i] = b.o;
      s.h[i] = b.h;
      s.l[i] = b.l;
      s.c[i] = b.c;
      s.v[i] = b.v;
    });
    s.length = bars.length;
    const it = st.intra!;
    it.series = s;
    it.cur = -1;
    st.liveIntraday = true;
    st.live = true;
    st.last = bars[bars.length - 1].c;
    this.version++;
  }

  /** External daily closes the simulated history must pass through. */
  setDailyAnchors(id: string, points: [day: number, level: number][]) {
    const st = this.states.get(id);
    if (!st || st.ext || st.kind !== 'base') return;
    for (const [d, v] of points) st.extAnchors.set(d, v);
    st.dailyKey = '';
    this.version++;
    this.derivedCache.clear();
  }

  /** External full daily bars (also used as anchors). */
  setDailyBars(id: string, bars: { day: number; o: number; h: number; l: number; c: number; v: number }[]) {
    const st = this.states.get(id);
    if (!st || st.ext || st.kind !== 'base') return;
    for (const b of bars) {
      st.extBars.set(b.day, b);
      st.extAnchors.set(b.day, b.c);
    }
    st.dailyKey = '';
    this.version++;
  }

  /** Re-derives prevClose/open/intraday after anchors changed (e.g. FX fixings). */
  rebaseSimulated(id: string) {
    const st = this.states.get(id);
    if (!st || st.ext || st.kind !== 'base' || st.live) return;
    st.intra = null;
    st.dailyKey = '';
    this.derivedCache.clear();
    this.updateBase(st, this.now(), false);
    this.publishQuote(st, this.now());
    for (const other of this.states.values()) {
      if (other.kind === 'base') continue;
      if (this.componentIds(other).includes(id)) {
        other.intra = null;
        this.updateDerived(other, this.now());
        this.publishQuote(other, this.now());
      }
    }
  }

  /** Hands a line back to the simulator (feed switched off or lost). */
  unlive(id: string) {
    const st = this.states.get(id);
    if (!st || st.ext || st.kind !== 'base' || !st.live) return;
    st.live = false;
    st.liveIntraday = false;
    st.intra = null;
    st.dailyKey = '';
    this.version++;
    const t = this.now();
    this.updateBase(st, t, false);
    this.publishQuote(st, t);
  }

  // ------------------------------------------------------------ external data

  /**
   * Switches the simulator off (desktop app): every line without real data
   * publishes an empty quote and no history, and `filter` decides which
   * securities appear in lists.
   */
  setRealOnly(filter: (d: SecurityDef) => boolean) {
    this.realOnly = true;
    this.sourceFilter = filter;
    this.listed = null;
    for (const st of this.states.values()) {
      if (st.ext) continue;
      st.trades = [];
      st.live = false;
      this.publishQuote(st, this.now());
    }
    this.version++;
    this.derivedCache.clear();
    for (const fn of this.listeners) fn(new Set(this.states.keys()));
  }

  /** A pre-market, after-hours or overnight price, shown beside the regular-session last. */
  setExtended(id: string, x: ExtendedPrice) {
    const st = this.states.get(id);
    if (!st?.ext) return;
    st.ext.extended = x;
    this.publishQuote(st, this.now());
  }

  /** Marks real lines whose market is open as stale while their source is unreachable. */
  setStale(ids: Iterable<string>, stale: boolean) {
    for (const id of ids) {
      const st = this.states.get(id);
      if (!st?.ext || st.ext.stale === stale) continue;
      st.ext.stale = stale;
      this.publishQuote(st, this.now());
    }
  }

  /** In real-only mode: whether a security has a real source (listed securities). */
  hasSource(id: string): boolean {
    const d = this.byId.get(id);
    return !!d && (!this.realOnly || !this.sourceFilter || this.sourceFilter(d));
  }

  /** True when the line follows real data from an external source. */
  isExternal(id: string): boolean {
    return !!this.states.get(id)?.ext;
  }

  /**
   * Switches a line to real daily history. From here on the simulation leaves
   * it alone: quotes, intraday bars and prints come from setExternalQuote and
   * setExternalIntraday, and nothing moves while its market is closed.
   */
  setExternalDaily(id: string, bars: ExtBar[], opts: { eod?: boolean; provider?: string } = {}) {
    const st = this.states.get(id);
    if (!st || bars.length === 0) return;
    const s = makeSeries(bars.length + 16, DAY_MS);
    bars.forEach((b, i) => {
      s.t[i] = dayStart(b.day);
      s.o[i] = b.o;
      s.h[i] = Math.max(b.h, b.o, b.c);
      s.l[i] = Math.min(b.l, b.o, b.c);
      s.c[i] = b.c;
      s.v[i] = b.v;
    });
    s.length = bars.length;
    const last = bars[bars.length - 1];
    // Another provider starts with its own history, touch, timing and tape. Keeping any of the
    // old provider's metadata would relabel values from a different venue as this one's.
    const prev = opts.provider !== undefined && opts.provider !== st.ext?.provider ? undefined : st.ext;
    const flat = makeSeries(512, MINUTE_MS);
    flat.t[0] = dayStart(last.day);
    flat.o[0] = flat.h[0] = flat.l[0] = flat.c[0] = last.c;
    flat.length = 1;
    st.ext = {
      daily: s,
      intra: prev && prev.session === last.day ? prev.intra : flat,
      session: last.day,
      open: prev?.open ?? false,
      sessionKnown: prev?.sessionKnown,
      tz: prev?.tz,
      volumeUnit: prev?.volumeUnit,
      bid: prev?.bid ?? NaN,
      ask: prev?.ask ?? NaN,
      seq: (prev?.seq ?? 0) + 1,
      eod: opts.eod ?? prev?.eod ?? false,
      provider: opts.provider ?? prev?.provider,
      delay: prev?.delay ?? 0,
      timing: prev?.timing ?? 'unknown',
      sourceName: prev?.sourceName,
      dayProvider: prev?.dayProvider,
      settled: prev?.settled,
      fetched: prev?.fetched ?? Date.now(),
      stale: false,
      extended: prev?.extended,
      // A quote already received for this session is newer than the daily bar.
      time: prev && prev.session === last.day && Number.isFinite(prev.time) && prev.time > dayStart(last.day) ? prev.time : dayStart(last.day),
      dayOnly: !(prev && prev.session === last.day && Number.isFinite(prev.time) && prev.time > dayStart(last.day)),
    };
    st.live = true;
    st.liveIntraday = true;
    st.last = last.c;
    // With a single session of history the previous close comes from the first quote, never a guess.
    // From the bars alone it is unverified until a quote's readings match it; a check already made
    // for this session stays when the reloaded bar agrees.
    const before = bars.length > 1 ? bars[bars.length - 2] : undefined;
    // A currency's check rests on the session's open, not on the bar (see resolvePrevClose).
    // So does a settlement the quote gave for the same session.
    const kept = prev?.session === last.day && st.chgCheck === 'verified' && before !== undefined && (st.def.cls === 'fx' || !!st.prevSettle || Math.abs(st.prevClose / before.c - 1) <= 1e-3);
    if (!(kept && (st.def.cls === 'fx' || st.prevSettle))) {
      st.prevClose = before ? before.c : NaN;
      st.prevCloseDay = before?.day;
      st.prevSettle = false;
    }
    // A once-a-day official series has no quote to check against: its change is between two values the same
    // publisher gave for consecutive dates, which is what the change means.
    st.chgCheck = kept || (before !== undefined && (opts.eod ?? prev?.eod)) ? 'verified' : 'unverified';
    st.dayOpen = last.o;
    st.dayHigh = s.h[s.length - 1];
    st.dayLow = s.l[s.length - 1];
    const officialOpen = st.ext.settled?.day === last.day ? st.ext.settled.open?.price : undefined;
    if (officialOpen !== undefined) this.applyOpen(st, s, s.length - 1, officialOpen);
    const officialRange = st.ext.settled?.day === last.day ? st.ext.settled.range : undefined;
    if (officialRange) this.applyRange(st, s, s.length - 1, officialRange);
    const settled = st.ext.settled?.day === last.day ? st.ext.settled.volume : NaN;
    if (settled > (s.v[s.length - 1] || 0)) s.v[s.length - 1] = settled;
    st.volume = s.v[s.length - 1];
    if (!prev) st.trades = [];
    st.dailyKey = `ext:${st.ext.seq}`;
    this.version++;
    this.derivedCache.clear();
    this.resetDependents(st.def.id);
    this.publishQuote(st, this.now());
  }

  /** Applies a real quote to a line already on external history. */
  setExternalQuote(id: string, q: ExtQuote) {
    const st = this.states.get(id);
    const ext = st?.ext;
    if (!st || !ext || !Number.isFinite(q.last) || !Number.isFinite(q.time)) return;
    const day = q.day ?? dayNum(q.time);
    let s = ext.daily;
    let n = s.length - 1;
    const lastDay = dayNum(s.t[n]);
    if (day < lastDay) return;
    const newSession = day > lastDay;
    if (newSession) {
      if (s.length >= s.t.length) {
        const bigger = makeSeries(s.t.length + 64, DAY_MS);
        for (const k of ['t', 'o', 'h', 'l', 'c', 'v'] as const) bigger[k].set(s[k]);
        bigger.length = s.length;
        ext.daily = s = bigger;
      }
      n++;
      s.t[n] = dayStart(day);
      s.o[n] = q.open && Number.isFinite(q.open) ? q.open : q.last;
      s.h[n] = s.o[n];
      s.l[n] = s.o[n];
      s.v[n] = 0;
      s.length = n + 1;
      const fresh = makeSeries(512, MINUTE_MS);
      fresh.t[0] = Math.floor(q.time / MINUTE_MS) * MINUTE_MS;
      fresh.o[0] = fresh.h[0] = fresh.l[0] = fresh.c[0] = s.o[n];
      fresh.length = 1;
      ext.intra = fresh;
      st.trades = [];
      st.volume = 0;
    }
    if (q.open && Number.isFinite(q.open)) s.o[n] = q.open;
    // A settled session keeps its official open against the price source's repeated provisional one.
    if (ext.settled?.day === day && ext.settled.open) s.o[n] = ext.settled.open.price;
    // A full quote's high and low are the day's own. The bar's can be another contract's after a futures roll
    // (Yahoo's lean hogs on 12 Oct 2026: a quote on December, 67.825-69.00, and a bar on October up to 75.675).
    const hi = q.high && Number.isFinite(q.high) ? q.high : NaN;
    const lo = q.low && Number.isFinite(q.low) ? q.low : NaN;
    const keepHi = newSession || (q.full && Number.isFinite(hi)) ? -Infinity : s.h[n];
    const keepLo = newSession || (q.full && Number.isFinite(lo)) ? Infinity : s.l[n];
    s.h[n] = Math.max(Number.isFinite(hi) ? hi : -Infinity, keepHi, q.last, s.o[n]);
    s.l[n] = Math.min(Number.isFinite(lo) ? lo : Infinity, keepLo, q.last, s.o[n]);
    // A settled session keeps its official high and low against the price source's provisional ones.
    if (ext.settled?.day === day && ext.settled.range) {
      s.h[n] = ext.settled.range.high;
      s.l[n] = ext.settled.range.low;
    }
    s.c[n] = q.last;
    const read = q.volume != null && Number.isFinite(q.volume) ? q.volume : s.v[n];
    // A quote taken at the close leaves the session's volume short of what all venues reported (Yahoo's for Apple on
    // 27 October 2026: 39.05M against 39.98M on the consolidated tape).
    const vol = ext.settled?.day === day && ext.settled.volume > read ? ext.settled.volume : read;
    const dv = vol - st.volume;
    s.v[n] = vol;
    // Time and sales on real data: one aggregated print per change in cumulative volume. Kraken's crypto
    // volume counts the UTC day, so it rises only with trades; Yahoo's crypto volume is a rolling 24 hours,
    // which also falls as old trades drop out, so it gives no prints.
    const krakenCrypto = st.def.cls === 'crypto' && ext.provider === 'Kraken';
    if (q.aggregateTrades !== false && dv > 0 && !newSession && (st.def.cls === 'equity' || st.def.cls === 'future' || st.def.cls === 'commodity' || krakenCrypto)) {
      this.pushTrade(st, { t: q.time, px: q.last, size: dv, side: q.last > st.last ? 1 : q.last < st.last ? -1 : 0, venue: krakenCrypto ? 'KRAKEN' : 'CONS', cond: 'AGG' });
    }
    st.last = q.last;
    // The previous close, checked against the previous daily bar. A partial update (a streamed tick)
    // leaves what it does not carry as it was, and does not undo a check already made for this session.
    const histPrev = n > 0 ? s.c[n - 1] : NaN;
    const histDay = n > 0 ? dayNum(s.t[n - 1]) : undefined;
    const reading = resolvePrevClose(q.prevClose, q.prevCloseAlt, histPrev, st.def.cls === 'fx' ? q.open : undefined, {
      before: n > 1 ? s.c[n - 2] : NaN,
      futures: st.def.cls === 'future' || st.def.cls === 'commodity',
      // Currencies trade every weekday: a previous bar older than the weekday before is a hole in the history.
      gap: st.def.cls === 'fx' && histDay !== undefined && histDay < previousWeekday(day),
      fx: st.def.cls === 'fx',
      first: st.def.cls === 'fx' ? q.firstPrice : undefined,
    });
    if (reading && (reading.verified || q.full || newSession || st.chgCheck !== 'verified')) {
      st.prevClose = reading.value;
      st.prevCloseDay = reading.verified ? histDay : undefined;
      st.chgCheck = reading.verified ? 'verified' : 'unverified';
      st.prevSettle = !!reading.settlement;
    } else if (!reading && newSession) {
      st.prevClose = histPrev;
      st.prevCloseDay = histDay;
      st.chgCheck = 'unverified';
      st.prevSettle = false;
    }
    st.dayOpen = s.o[n];
    st.dayHigh = s.h[n];
    st.dayLow = s.l[n];
    st.volume = vol;
    if (q.bid !== undefined) ext.bid = q.bid;
    if (q.ask !== undefined) ext.ask = q.ask;
    if (q.delay !== undefined) ext.delay = q.delay;
    if (q.timing !== undefined) ext.timing = q.timing;
    if (q.sourceName !== undefined) ext.sourceName = q.sourceName;
    if (q.dayProvider !== undefined) ext.dayProvider = q.dayProvider || undefined;
    ext.fetched = q.fetched ?? Date.now();
    ext.open = q.marketOpen;
    if (q.sessionKnown !== undefined) ext.sessionKnown = q.sessionKnown;
    if (q.marketOpen) ext.state = undefined;
    else if (q.state) ext.state = q.state;
    if (q.tz) ext.tz = q.tz;
    if (q.volumeUnit) ext.volumeUnit = q.volumeUnit;
    ext.session = day;
    ext.stale = false;
    ext.time = q.time;
    ext.dayOnly = false;
    // A regular-session trade supersedes an earlier pre-market or after-hours price.
    if (q.marketOpen) ext.extended = undefined;
    // Keep the intraday series current between bar refreshes.
    let it = ext.intra;
    if (it.length > 0 && q.marketOpen) {
      let k = it.length - 1;
      while (q.time >= it.t[k] + it.span) {
        if (it.length >= it.t.length) {
          const bigger = makeSeries(it.t.length * 2, it.span);
          for (const f of ['t', 'o', 'h', 'l', 'c', 'v'] as const) bigger[f].set(it[f]);
          bigger.length = it.length;
          ext.intra = it = bigger;
        }
        it.t[k + 1] = it.t[k] + it.span;
        it.o[k + 1] = it.h[k + 1] = it.l[k + 1] = it.c[k + 1] = it.c[k];
        it.v[k + 1] = 0;
        it.length = k + 2;
        k++;
      }
      it.c[k] = q.last;
      it.h[k] = Math.max(it.h[k], q.last);
      it.l[k] = Math.min(it.l[k], q.last);
      if (dv > 0) it.v[k] += dv;
    }
    if (newSession) {
      st.dailyKey = `ext:${++ext.seq}`;
      this.version++;
      this.derivedCache.clear();
      this.resetDependents(st.def.id);
    }
    this.publishQuote(st, q.time);
  }

  /** Replaces the latest session's intraday bars with real ones. */
  setExternalIntraday(id: string, bars: { t: number; o: number; h: number; l: number; c: number; v: number }[], span: number, day = dayNum(bars[bars.length - 1]?.t ?? 0)): boolean {
    const st = this.states.get(id);
    if (!st?.ext || bars.length === 0) return false;
    // Only bars from the session the line is on; a newer session arrives through quotes first.
    if (day !== st.ext.session) return false;
    const s = makeSeries(bars.length + 512, span);
    bars.forEach((b, i) => {
      s.t[i] = b.t;
      s.o[i] = b.o;
      s.h[i] = Math.max(b.h, b.o, b.c);
      s.l[i] = Math.min(b.l, b.o, b.c);
      s.c[i] = b.c;
      s.v[i] = b.v;
    });
    s.length = bars.length;
    // The latest quote is newer than the last completed bar.
    s.c[s.length - 1] = st.last;
    s.h[s.length - 1] = Math.max(s.h[s.length - 1], st.last);
    s.l[s.length - 1] = Math.min(s.l[s.length - 1], st.last);
    st.ext.intra = s;
    this.derivedCache.clear();
    return true;
  }

  /** Derived lines (crosses, futures fair value, bonds) recompute their session when a component's changes. */
  private resetDependents(id: string) {
    for (const other of this.states.values()) {
      if (other.kind === 'base' || other.ext) continue;
      if (this.componentIds(other).includes(id)) other.intra = null;
    }
  }

  /**
   * Registers a security found at runtime (online lookup). Daily bars or
   * anchors, when given, calibrate its history before the first quote.
   */
  addSecurity(def: SecurityDef, init: { bars?: { day: number; o: number; h: number; l: number; c: number; v: number }[]; anchors?: [day: number, level: number][] } = {}, notify = true): boolean {
    if (this.byId.has(def.id)) return false;
    this.defsGen++;
    this.defs.push(def);
    this.byId.set(def.id, def);
    this.listed = null;
    this.addState(def, 'base');
    const st = this.states.get(def.id)!;
    for (const b of init.bars ?? []) {
      if (b.day >= this.today) continue;
      st.extBars.set(b.day, b);
      st.extAnchors.set(b.day, b.c);
    }
    for (const [d, v] of init.anchors ?? []) if (d < this.today) st.extAnchors.set(d, v);
    const t = this.now();
    this.updateBase(st, t, false);
    this.publishQuote(st, t);
    this.version++;
    if (notify) for (const fn of this.listeners) fn(new Set([def.id]));
    return true;
  }

  /**
   * Adds many securities and tells the screens once: FedInvest's 400-odd Treasuries one at a time would re-render
   * every subscribed screen 400 times. Returns the ids added.
   */
  addSecurities(defs: SecurityDef[]): string[] {
    const added = defs.filter((d) => this.addSecurity(d, {}, false)).map((d) => d.id);
    if (added.length) this.flush(added);
    return added;
  }

  /**
   * Puts each def in place of the security of the same id, history and all, or adds it. FedInvest's Treasury takes
   * the place of the simulator's on-the-run note of the same name, whose terms, aliases and prices are its own.
   * Tells the screens once; returns the ids.
   */
  replaceSecurities(defs: SecurityDef[]): string[] {
    for (const def of defs) {
      const old = this.byId.get(def.id);
      if (!old) continue;
      this.defs.splice(this.defs.indexOf(old), 1);
      this.byId.delete(def.id);
      this.states.delete(def.id);
      this.resetDependents(def.id);
    }
    const ids = defs.filter((d) => this.addSecurity(d, {}, false)).map((d) => d.id);
    if (ids.length) this.flush(ids);
    return ids;
  }

  /** Changes whenever a security is added or replaced (the registry's index rebuilds on it). */
  get defsGeneration(): number {
    return this.defsGen;
  }

  /** Every security that should appear in search and monitors. */
  get securities(): SecurityDef[] {
    if (!this.realOnly || !this.sourceFilter) return this.defs;
    if (!this.listed) this.listed = this.defs.filter(this.sourceFilter);
    return this.listed;
  }

  isBusinessToday(): boolean {
    return isBusinessDay(this.today);
  }
}

function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return normal(seed, i, 77) * (1 - s) + normal(seed, i + 1, 77) * s;
}

let spare: number | null = null;
function gaussianRandom(): number {
  if (spare != null) {
    const s = spare;
    spare = null;
    return s;
  }
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const r = Math.sqrt(-2 * Math.log(u));
  spare = r * Math.sin(2 * Math.PI * v);
  return r * Math.cos(2 * Math.PI * v);
}
