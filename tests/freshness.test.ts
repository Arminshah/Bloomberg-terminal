import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { DAILY_STALE_AFTER, freshnessOf, isOfficialProvider, sessionLabel, staleAfter } from '../src/data/freshness';
import { extQuote, marketStateOf } from '../src/data/live/yahoo';
import type { Quote } from '../src/data/types';

const MIN = 60_000;
const NOW = Date.parse('2026-10-13T15:00:00Z');
const equity = { cls: 'equity' as const };
const index = { cls: 'index' as const };
const crypto = { cls: 'crypto' as const };
const quote = (over: Partial<Quote>): Quote => ({ id: 'X', last: 1, bid: NaN, ask: NaN, open: 1, high: 1, low: 1, prevClose: 1, volume: 0, chg: 0, pct: 0, time: NOW, tick: 0, src: 'LIVE', ...over });
const label = (q: Partial<Quote>, def: { cls: 'equity' | 'index' | 'crypto' } = equity, now = NOW) => freshnessOf(quote(q), def, now)?.label ?? null;

describe('freshness labels', () => {
  it('does not infer market freshness from missing, invalid, or future source timestamps', () => {
    for (const src of ['LIVE', 'DELAYED', 'UNCONFIRMED', 'EOD', 'CLOSE'] as const) {
      for (const time of [NaN, Infinity, 0, NOW + 5_001]) expect(label({ src, time, fetched: NOW })).toBe('UNKNOWN FRESHNESS');
    }
    expect(label({ src: 'LIVE', time: NOW + 4_000 })).toBe('REAL-TIME');
    expect(label({ src: 'LIVE', provider: 'Alpaca · IEX only', time: NOW + 5_001 })).toBe('STALE');
  });
  it('calls a price real time only when the source labels it so and its timestamp is recent', () => {
    expect(label({ src: 'LIVE', time: NOW - 20_000 })).toBe('REAL-TIME');
    // Fetching often does not make an old price real time.
    expect(label({ src: 'LIVE', time: NOW - 31 * MIN })).toBe('STALE');
    expect(label({ src: 'LIVE', time: NOW - 11 * MIN }, index)).toBe('STALE');
    expect(label({ src: 'LIVE', time: NOW - 5 * MIN }, crypto)).toBe('REAL-TIME');
    expect(freshnessOf(quote({ src: 'LIVE', sourceName: 'Nasdaq Real Time Price', time: NOW - 2_000 }), equity, NOW)!.why).toMatch(/Nasdaq Real Time Price/);
  });

  it('keeps a stated delay apart from staleness', () => {
    expect(label({ src: 'DELAYED', delay: 15, time: NOW - 16 * MIN })).toBe('DELAYED');
    // The threshold counts from the stated delay: 15 + 30 minutes for a stock.
    expect(label({ src: 'DELAYED', delay: 15, time: NOW - 44 * MIN })).toBe('DELAYED');
    expect(label({ src: 'DELAYED', delay: 15, time: NOW - 46 * MIN })).toBe('STALE');
    expect(freshnessOf(quote({ src: 'DELAYED', delay: 20 }), equity, NOW)!.why).toMatch(/20 minutes/);
  });

  it('says when the source does not state its timing', () => {
    expect(label({ src: 'UNCONFIRMED', time: NOW - MIN })).toBe('UNKNOWN FRESHNESS');
    // Only a daily bar so far: its date is not a trade time, so it is not called stale either.
    expect(label({ src: 'UNCONFIRMED', dayOnly: true, time: NOW - 3 * 86_400_000 })).toBe('UNKNOWN FRESHNESS');
  });

  it('labels a closed market as end of day, whatever its age', () => {
    // Friday's close read on Monday morning before the open.
    expect(label({ src: 'CLOSE', time: Date.parse('2026-10-09T20:00:00Z') }, equity, Date.parse('2026-10-12T12:00:00Z'))).toBe('END OF DAY');
  });

  it('labels official once-a-day values as reference values, and old ones as stale', () => {
    expect(label({ src: 'EOD', provider: 'US Treasury', time: NOW - 86_400_000 })).toBe('REFERENCE');
    expect(label({ src: 'EOD', provider: 'Deutsche Bundesbank', time: NOW - 2 * 86_400_000 })).toBe('REFERENCE');
    expect(label({ src: 'EOD', provider: 'Yahoo Finance', time: NOW - 86_400_000 })).toBe('END OF DAY');
    expect(label({ src: 'EOD', provider: 'US Treasury', time: NOW - DAILY_STALE_AFTER - MIN })).toBe('STALE');
  });

  it('marks demo, failed and missing values', () => {
    expect(label({ src: 'SIM' })).toBe('DEMO DATA');
    expect(label({ src: 'STALE', time: NOW })).toBe('STALE');
    expect(label({ src: 'NONE', time: NaN })).toBeNull();
  });

  it('sets thresholds by instrument', () => {
    expect(staleAfter(crypto)).toBeLessThan(staleAfter(equity));
    expect(staleAfter(undefined)).toBe(30 * MIN);
    expect(isOfficialProvider('US Treasury')).toBe(true);
    expect(isOfficialProvider('Yahoo Finance')).toBe(false);
    expect(isOfficialProvider('Kraken')).toBe(false);
    expect(isOfficialProvider(undefined)).toBe(false);
  });
});

describe('market session, apart from freshness', () => {
  it('reads Yahoo market states', () => {
    expect(marketStateOf({ marketState: 'PRE' })).toEqual({ state: 'pre' });
    expect(marketStateOf({ marketState: 'PREPRE' })).toEqual({ state: 'pre' });
    expect(marketStateOf({ marketState: 'POSTPOST' })).toEqual({ state: 'post' });
    expect(marketStateOf({ marketState: 'CLOSED' })).toEqual({ state: 'closed' });
    expect(marketStateOf({ marketState: 'REGULAR' })).toEqual({});
    expect(sessionLabel('pre')).toBe('PRE-MARKET');
    expect(sessionLabel(undefined)).toBeNull();
  });

  it('carries the session and the exchange time zone from the quote to the line', () => {
    const id = 'AAPL US Equity';
    const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
    engine.setExternalDaily(id, [
      { day: day('2026-10-09'), o: 250, h: 252, l: 249, c: 251, v: 1 },
      { day: day('2026-10-12'), o: 251, h: 253, l: 250, c: 252, v: 1 },
    ]);
    const base = { regularMarketPrice: 252, regularMarketChange: 1, regularMarketPreviousClose: 251, regularMarketTime: Date.parse('2026-10-12T20:00:00Z') / 1000, gmtOffSetMilliseconds: -14_400_000, exchangeTimezoneName: 'America/New_York' };
    engine.setExternalQuote(id, extQuote({ ...base, marketState: 'POST' }, false)!);
    let q = engine.quote(id)!;
    expect(q.session).toBe('post');
    expect(q.tz).toBe('America/New_York');
    expect(q.src).toBe('CLOSE');
    engine.setExternalQuote(id, extQuote({ ...base, marketState: 'REGULAR', regularMarketTime: Date.parse('2026-10-13T14:00:00Z') / 1000, regularMarketPrice: 253 }, false)!);
    q = engine.quote(id)!;
    expect(q.session).toBe('open');
  });
});
