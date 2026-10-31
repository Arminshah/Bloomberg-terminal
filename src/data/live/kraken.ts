// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { engine } from '../market';
import { dayNum } from '../calendar';
import type { ExtBar } from '../engine';
import { setFeed } from './status';
import { registerRefresh, type RefreshOutcome } from '../../terminal/refresh';

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

/** Why Kraken gave its lines up in this session, or null while it keeps them. */
let handedBack: string | null = null;
/** Who takes the lines when Kraken gives them up (the Yahoo service registers itself). */
let takeOver: (() => void) | null = null;

/** Kraken feeds this line: the desktop app with Kraken switched on (KRAKEN_ENABLED, read when the page loaded) and answering. */
export function krakenOwns(id: string): boolean {
  return BY_ID.has(id) && krakenAvailable() && window.arminDesktop?.settings?.KRAKEN_ENABLED !== false && handedBack === null;
}

/** The reason Kraken did not answer, when the crypto lines went to another source for this session. */
export function krakenHandedBack(): string | null {
  return handedBack;
}

/** Registers what to do when Kraken gives its lines up: another source picks them up. */
export function whenKrakenHandsBack(fn: () => void) {
  takeOver = fn;
}

/** For tests: back to the start-up state. */
export function resetKrakenHandBack() {
  handedBack = null;
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

/** What an answer without prices says: Kraken's own errors, or the HTTP status. */
export function krakenReason(res: { status: number; text: string }): string {
  if (!res.text) return res.status ? `HTTP ${res.status}` : 'no answer';
  try {
    const j = JSON.parse(res.text);
    const errors = Array.isArray(j?.error) ? j.error.filter((e: unknown) => typeof e === 'string') : [];
    return errors.length ? errors.join('; ').slice(0, 160) : 'no prices in the answer';
  } catch {
    return 'an answer that is not JSON';
  }
}

/** Ticker attempts without a single success before the lines go to another source. */
export const HAND_BACK_AFTER = 3;

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
  /** The ticker request under way, which a refresh joins rather than doubling. */
  private polling: Promise<boolean> | null = null;
  private stopped = false;
  /** Per line: the UTC day its daily candles end on, and the close of the day before. */
  private prev = new Map<string, { day: number; close: number }>();
  private loading: Promise<void> | null = null;
  private failures = 0;
  /** A ticker has answered at least once in this session. */
  private answered = false;
  /** Pairs whose daily candles loaded; null until the first load is over. */
  private dailyOk: number | null = null;
  /** Lines whose daily candles have loaded in this session. */
  private loaded = new Set<string>();
  /** When to ask again for candles that failed, and how long to wait after that. */
  private retryAt = 0;
  private retryWait = 60_000;
  private intradayAt = new Map<string, number>();
  private offDemand?: () => void;

  start() {
    setFeed('crypto', 'connecting', 'Kraken: loading daily candles');
    this.retryAt = Date.now() + this.retryWait;
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

  /** Two years of daily candles per pair, one request a second; `pairs` limits it to those still missing. */
  private async loadDaily(pairs: KrakenPair[] = KRAKEN_PAIRS) {
    let ok = 0;
    for (const p of pairs) {
      if (this.stopped) return;
      try {
        const res = await ask('ohlc', p.pair, 1440);
        const bars = res.text ? parseOhlc(res.text, p) : [];
        if (bars.length < 2) continue;
        engine.setExternalDaily(p.id, dailyBars(bars), { provider: KRAKEN_PROVIDER });
        const last = bars[bars.length - 1];
        this.prev.set(p.id, { day: dayNum(last.t), close: bars[bars.length - 2].c });
        this.loaded.add(p.id);
        ok++;
      } catch {
        /* this pair stays without history; the others go on */
      }
    }
    engine.flush(pairs.map((p) => p.id));
    if (this.dailyOk === null) this.dailyOk = ok;
    if (!this.loaded.size) setFeed('crypto', 'error', 'Kraken: no daily candles (PROVIDERS shows why)');
  }

  /** The top bar's REFRESH: the tickers now rather than at the next five-second poll. */
  async refreshNow(): Promise<RefreshOutcome> {
    if (this.stopped) return { source: 'Kraken crypto prices', state: 'skipped', detail: 'Kraken is not answering; Yahoo has the crypto lines' };
    if (!this.polling && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ok = await this.poll();
    return { source: 'Kraken crypto prices', state: ok ? 'asked' : 'failed', detail: ok ? `${KRAKEN_PAIRS.length} pairs` : 'Kraken did not answer; prices marked stale' };
  }

  private poll(): Promise<boolean> {
    this.polling ??= this.pollOnce().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** One ticker request; true when it answered. */
  private async pollOnce(): Promise<boolean> {
    if (this.stopped) return false;
    let ok = false;
    try {
      const res = await ask('ticker', KRAKEN_PAIRS.map((p) => p.pair).join(','));
      if (res.disabled) {
        setFeed('crypto', 'off', 'Kraken is switched off (KRAKEN_ENABLED)');
        return false;
      }
      const tickers = res.text ? parseTicker(res.text) : new Map();
      if (!tickers.size) throw new Error(krakenReason(res));
      const at = res.serverTime ?? Date.now();
      const day = dayNum(at);
      let rolled = false;
      for (const p of KRAKEN_PAIRS) {
        const t = tickers.get(p.id);
        if (!t) continue;
        // Without its daily candles (they failed, or are still loading) a line starts from today's ticker, so
        // the price shows; the day's change waits for the candles, which are asked for again below.
        if (!engine.isExternal(p.id)) engine.setExternalDaily(p.id, [{ day, o: t.open, h: t.high, l: t.low, c: t.last, v: t.volume }], { provider: KRAKEN_PROVIDER });
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
      this.answered = true;
      ok = true;
      const missing = KRAKEN_PAIRS.filter((p) => !this.loaded.has(p.id));
      setFeed('crypto', 'live', `Kraken: ${tickers.size} of ${KRAKEN_PAIRS.length} pairs, snapshot ${new Date(at).toISOString().slice(11, 19)} UTC${missing.length ? `; daily candles missing for ${missing.length}, asked again` : ''}`);
      if (rolled && !this.loading) {
        this.loading = this.loadDaily().finally(() => {
          this.loading = null;
        });
      } else if (missing.length && !this.loading && Date.now() >= this.retryAt) {
        // Candles that failed are asked for again, waiting longer each time (1, 2, 4 ... up to 15 minutes).
        this.retryAt = Date.now() + this.retryWait;
        this.retryWait = Math.min(15 * 60_000, this.retryWait * 2);
        this.loading = this.loadDaily(missing).finally(() => {
          this.loading = null;
        });
      }
    } catch (err) {
      this.failures++;
      const reason = String((err as Error)?.message ?? err).replace(/^Error invoking remote method 'kraken': (Error: )?/, '');
      // Kraken has never answered in this session: the crypto lines go to Yahoo Finance rather than stay empty.
      // With no daily candles either, one failed ticker is enough to tell.
      if (!this.answered && (this.failures >= HAND_BACK_AFTER || this.dailyOk === 0) && takeOver) {
        this.handBack(reason);
        return false;
      }
      engine.setStale(KRAKEN_PAIRS.map((p) => p.id), true);
      setFeed('crypto', 'error', `Kraken did not answer (${reason}); prices marked stale`);
    } finally {
      if (!this.stopped) {
        // One timer at a time, whether this poll came from the last one or from a refresh.
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.poll(), Math.min(60_000, POLL_MS * 2 ** Math.min(3, this.failures)));
      }
    }
    return ok;
  }

  /** Gives the crypto lines to another source for the rest of the session. */
  private handBack(reason: string) {
    handedBack = reason;
    this.stop();
    setFeed('crypto', 'connecting', `Kraken did not answer (${reason}): crypto prices from Yahoo Finance for this session`);
    takeOver?.();
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
  const own = service;
  const offRefresh = registerRefresh({ source: 'Kraken crypto prices', run: () => own.refreshNow() });
  return () => {
    offRefresh();
    service?.stop();
    service = null;
  };
}
