import { engine } from '../market';
import { dayNum } from '../calendar';
import type { ExtBar } from '../engine';
import { setFeed } from './status';

/**
 * Kraken's own market data for the crypto lines in the desktop app: the
 * exchange's last trade, best bid and offer, the UTC day's open, high, low and
 * volume, daily and intraday candles, and the order book. Every value is
 * Kraken's, for its USD pair, and is labelled as Kraken's: it is one
 * exchange's market, not a market-wide price.
 *
 * Kraken's tickers carry no time of their own, so a snapshot is timed by
 * Kraken's Date header: when the exchange answered. Kraken's day runs from
 * midnight UTC, and the previous close is the close of its previous daily
 * candle.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const KRAKEN_PROVIDER = 'Kraken';

export interface KrakenPair {
  /** The line in the app. */
  id: string;
  /** Kraken's pair name in requests. */
  pair: string;
  /** Names Kraken may use for the pair in its answers. */
  keys: string[];
  /** The base asset: what the volume counts. */
  base: string;
}

export const KRAKEN_PAIRS: KrakenPair[] = [
  { id: 'XBTUSD Curncy', pair: 'XBTUSD', keys: ['XXBTZUSD', 'XBTUSD'], base: 'BTC' },
  { id: 'XETUSD Curncy', pair: 'ETHUSD', keys: ['XETHZUSD', 'ETHUSD'], base: 'ETH' },
  { id: 'SOLUSD Curncy', pair: 'SOLUSD', keys: ['SOLUSD'], base: 'SOL' },
  { id: 'XRPUSD Curncy', pair: 'XRPUSD', keys: ['XXRPZUSD', 'XRPUSD'], base: 'XRP' },
  { id: 'ADAUSD Curncy', pair: 'ADAUSD', keys: ['ADAUSD'], base: 'ADA' },
  { id: 'DOGEUSD Curncy', pair: 'XDGUSD', keys: ['XDGUSD', 'XXDGZUSD'], base: 'DOGE' },
  { id: 'AVAXUSD Curncy', pair: 'AVAXUSD', keys: ['AVAXUSD'], base: 'AVAX' },
  { id: 'LINKUSD Curncy', pair: 'LINKUSD', keys: ['LINKUSD'], base: 'LINK' },
  { id: 'LTCUSD Curncy', pair: 'LTCUSD', keys: ['XLTCZUSD', 'LTCUSD'], base: 'LTC' },
  { id: 'DOTUSD Curncy', pair: 'DOTUSD', keys: ['DOTUSD'], base: 'DOT' },
];

const BY_ID = new Map(KRAKEN_PAIRS.map((p) => [p.id, p]));

export function krakenAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.kraken === 'function';
}

/** Kraken feeds this line: the desktop app with Kraken switched on (KRAKEN_ENABLED, read when the page loaded). */
export function krakenOwns(id: string): boolean {
  return BY_ID.has(id) && krakenAvailable() && window.arminDesktop?.settings?.KRAKEN_ENABLED !== false;
}

export function krakenPairFor(id: string): KrakenPair | undefined {
  return BY_ID.get(id);
}

// ------------------------------------------------------------------ parsing

const num = (v: unknown): number => {
  const x = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : NaN;
};

/** The entry for a pair in Kraken's result object, under whichever name Kraken used. */
function entryFor(result: any, p: KrakenPair): any {
  for (const k of [...p.keys, p.pair]) if (result?.[k] != null) return result[k];
  return undefined;
}

export interface KrakenTicker {
  last: number;
  bid: number;
  ask: number;
  /** The UTC day's first trade price ("Today's prices start at midnight UTC"). */
  open: number;
  high: number;
  low: number;
  /** Today's volume in the base asset. */
  volume: number;
  /** Today's volume-weighted average price. */
  vwap: number;
  trades: number;
}

/** Kraken's Ticker answer: per pair a: ask, b: bid, c: last trade, v, p, t, l, h: [today, last 24 hours], o: today's open. */
export function parseTicker(text: string, pairs: KrakenPair[] = KRAKEN_PAIRS): Map<string, KrakenTicker> {
  const out = new Map<string, KrakenTicker>();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return out;
  }
  for (const p of pairs) {
    const e = entryFor(json?.result, p);
    if (!e) continue;
    const t: KrakenTicker = { last: num(e.c?.[0]), bid: num(e.b?.[0]), ask: num(e.a?.[0]), open: num(e.o), high: num(e.h?.[0]), low: num(e.l?.[0]), volume: num(e.v?.[0]), vwap: num(e.p?.[0]), trades: num(e.t?.[0]) };
    if (t.last > 0) out.set(p.id, t);
  }
  return out;
}

export interface KrakenBar {
  /** Candle start (epoch ms). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vwap: number;
  v: number;
  count: number;
}

/** Kraken's OHLC answer: [time, open, high, low, close, vwap, volume, count] per candle, oldest first; the last candle is still forming. */
export function parseOhlc(text: string, p: KrakenPair): KrakenBar[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = entryFor(json?.result, p);
  if (!Array.isArray(rows)) return [];
  const out: KrakenBar[] = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const b: KrakenBar = { t: num(r[0]) * 1000, o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), vwap: num(r[5]), v: num(r[6]), count: num(r[7]) };
    if (Number.isFinite(b.t) && b.c > 0 && b.o > 0 && b.h > 0 && b.l > 0) out.push(b);
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface BookLevel {
  price: number;
  volume: number;
  /** When Kraken last changed the level (epoch ms). */
  time: number;
}

export interface KrakenBook {
  bids: BookLevel[];
  asks: BookLevel[];
}

/** Kraken's Depth answer: asks and bids as [price, volume, timestamp], best first. */
export function parseDepth(text: string, p: KrakenPair): KrakenBook | null {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const e = entryFor(json?.result, p);
  if (!e || !Array.isArray(e.bids) || !Array.isArray(e.asks)) return null;
  const side = (rows: any[]): BookLevel[] => rows.map((r) => ({ price: num(r?.[0]), volume: num(r?.[1]), time: num(r?.[2]) * 1000 })).filter((l) => l.price > 0 && l.volume >= 0);
  return { bids: side(e.bids).sort((a, b) => b.price - a.price), asks: side(e.asks).sort((a, b) => a.price - b.price) };
}

/** Daily candles as the engine's bars, by UTC day. */
export function dailyBars(bars: KrakenBar[]): ExtBar[] {
  return bars.map((b) => ({ day: dayNum(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
}

// ------------------------------------------------------------------ service

type Answer = { status: number; text: string; serverTime?: number; disabled?: boolean };

async function ask(kind: 'ticker' | 'ohlc' | 'depth', arg: string, n?: number): Promise<Answer> {
  return window.arminDesktop!.kraken!(kind, arg, n);
}

/** The order book for a line, best levels first; null when Kraken does not cover it or does not answer. */
export async function loadKrakenBook(id: string, levels = 15): Promise<(KrakenBook & { at: number }) | null> {
  const p = BY_ID.get(id);
  if (!p || !krakenOwns(id)) return null;
  const res = await ask('depth', p.pair, levels);
  if (!res.text) return null;
  const book = parseDepth(res.text, p);
  return book ? { ...book, at: res.serverTime ?? Date.now() } : null;
}

const POLL_MS = 5_000;

class KrakenData {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Per line: the UTC day its daily candles end on, and the close of the day before. */
  private prev = new Map<string, { day: number; close: number }>();
  private loading: Promise<void> | null = null;
  private failures = 0;
  private intradayAt = new Map<string, number>();
  private offDemand?: () => void;

  start() {
    setFeed('crypto', 'connecting', 'Kraken: loading daily candles');
    this.offDemand = engine.onDemand((id) => {
      if (BY_ID.has(id)) this.wantIntraday(id);
    });
    this.loading = this.loadDaily().finally(() => {
      this.loading = null;
    });
    void this.loading.then(() => this.poll());
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.offDemand?.();
  }

  /** Two years of daily candles per pair, one request a second. */
  private async loadDaily() {
    let ok = 0;
    for (const p of KRAKEN_PAIRS) {
      if (this.stopped) return;
      try {
        const res = await ask('ohlc', p.pair, 1440);
        const bars = res.text ? parseOhlc(res.text, p) : [];
        if (bars.length < 2) continue;
        engine.setExternalDaily(p.id, dailyBars(bars), { provider: KRAKEN_PROVIDER });
        const last = bars[bars.length - 1];
        this.prev.set(p.id, { day: dayNum(last.t), close: bars[bars.length - 2].c });
        ok++;
      } catch {
        /* this pair stays without history; the others go on */
      }
    }
    engine.flush(KRAKEN_PAIRS.map((p) => p.id));
    if (!ok) setFeed('crypto', 'error', 'Kraken: no daily candles (PROVIDERS shows why)');
  }

  private async poll() {
    if (this.stopped) return;
    try {
      const res = await ask('ticker', KRAKEN_PAIRS.map((p) => p.pair).join(','));
      if (res.disabled) {
        setFeed('crypto', 'off', 'Kraken is switched off (KRAKEN_ENABLED)');
        return;
      }
      const tickers = res.text ? parseTicker(res.text) : new Map();
      if (!tickers.size) throw new Error(res.status ? `HTTP ${res.status}` : 'no answer');
      const at = res.serverTime ?? Date.now();
      const day = dayNum(at);
      let rolled = false;
      for (const p of KRAKEN_PAIRS) {
        const t = tickers.get(p.id);
        if (!t) continue;
        const prev = this.prev.get(p.id);
        // The candles end on an earlier day: a new UTC day has begun and they are reloaded.
        if (prev && prev.day < day) rolled = true;
        engine.setExternalQuote(p.id, {
          last: t.last,
          prevClose: prev && prev.day === day ? prev.close : undefined,
          full: true,
          open: t.open,
          high: t.high,
          low: t.low,
          volume: t.volume,
          volumeUnit: p.base,
          time: at,
          day,
          bid: t.bid > 0 ? t.bid : NaN,
          ask: t.ask > 0 ? t.ask : NaN,
          marketOpen: true,
          timing: 'realtime',
          sourceName: 'Kraken exchange',
          tz: 'UTC',
          fetched: Date.now(),
        });
      }
      engine.flush(KRAKEN_PAIRS.map((p) => p.id));
      this.failures = 0;
      setFeed('crypto', 'live', `Kraken: ${tickers.size} of ${KRAKEN_PAIRS.length} pairs, snapshot ${new Date(at).toISOString().slice(11, 19)} UTC`);
      if (rolled && !this.loading) {
        this.loading = this.loadDaily().finally(() => {
          this.loading = null;
        });
      }
    } catch (err) {
      this.failures++;
      engine.setStale(KRAKEN_PAIRS.map((p) => p.id), true);
      setFeed('crypto', 'error', `Kraken did not answer (${String((err as Error)?.message ?? err)}); prices marked stale`);
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.poll(), Math.min(60_000, POLL_MS * 2 ** Math.min(3, this.failures)));
    }
  }

  /** Five-minute candles of the current UTC day, at most once a minute per line. */
  private wantIntraday(id: string) {
    const p = BY_ID.get(id);
    if (!p || Date.now() - (this.intradayAt.get(id) ?? 0) < 60_000) return;
    this.intradayAt.set(id, Date.now());
    void ask('ohlc', p.pair, 5)
      .then((res) => {
        const day = dayNum(res.serverTime ?? Date.now());
        const bars = (res.text ? parseOhlc(res.text, p) : []).filter((b) => dayNum(b.t) === day);
        if (!bars.length) return;
        engine.setExternalIntraday(id, bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), 300_000, day);
        engine.flush([id]);
      })
      .catch(() => undefined);
  }
}

let service: KrakenData | null = null;

/** Starts Kraken for the crypto lines; a no-op outside the desktop app or with Kraken switched off. */
export function startKraken(): () => void {
  if (!krakenAvailable() || !KRAKEN_PAIRS.some((p) => krakenOwns(p.id))) return () => undefined;
  service = new KrakenData();
  service.start();
  return () => {
    service?.stop();
    service = null;
  };
}
