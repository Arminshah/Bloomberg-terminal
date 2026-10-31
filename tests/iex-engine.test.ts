import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayNum } from '../src/data/calendar';
import { MarketEngine } from '../src/data/engine';
import { engine } from '../src/data/market';
import { rangeStats } from '../src/data/analytics';
import { freshnessOf, isOfficialProvider } from '../src/data/freshness';
import { iex, type IexSnapshot, type IexState } from '../src/data/live/alpaca';
import { CONSOLIDATED_PROVIDER, IEX_PROVIDER, iexDay, iexOwns, iexPricesEnabled, iexReading, keepOwnDays, setIexBackfill, startIexPrices, withBackfill, withConsolidatedDay } from '../src/data/live/iex-engine';
import { adoptYahooHistory, realDividends, startYahooData, trailingDividendYield, yahooSymbolFor } from '../src/data/live/yahoo';

const NOW = Date.parse('2026-10-14T15:00:00Z');
const ID = 'AAPL US Equity';
const day = dayNum(NOW);
const snapshot = (over: Partial<IexSnapshot> = {}): IexSnapshot => ({
  last: 101, lastSize: 20, lastAt: NOW - 1_000,
  bid: 100.99, bidSize: 30, ask: 101.01, askSize: 40, quoteAt: NOW - 500,
  open: 100, high: 102, low: 99, close: 100.9, volume: 2400, dayAt: Date.parse('2026-10-14T04:00:00Z'),
  prevOpen: 98, prevHigh: 100, prevLow: 97, prevClose: 99, prevVolume: 1800, prevDayAt: Date.parse('2026-10-13T04:00:00Z'),
  ...over,
});
const state = (over: Partial<IexSnapshot> = {}): IexState => ({ state: 'ok', data: snapshot(over), at: NOW });
const stops: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('window', { arminDesktop: { alpaca: vi.fn(async () => ({ status: 200, text: '{}' })), settings: { ALPACA_IEX_PRICES_ENABLED: true } } });
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  iex.set((s) => ({ v: s.v + 1, by: {} }));
  realDividends.delete(ID);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('explicit IEX price selection', () => {
  it('requires the source switch and leaves non-US equities with their normal providers', () => {
    expect(iexPricesEnabled()).toBe(true);
    expect(iexOwns(ID)).toBe(true);
    expect(iexOwns('ASML NA Equity')).toBe(false);
    expect(iexOwns('SPX Index')).toBe(false);
    window.arminDesktop!.settings!.ALPACA_IEX_PRICES_ENABLED = false;
    expect(iexOwns(ID)).toBe(false);
    window.arminDesktop!.settings!.ALPACA_IEX_PRICES_ENABLED = true;
    window.arminDesktop!.settings!.ALPACA_ENABLED = false;
    expect(iexPricesEnabled()).toBe(false);
  });

  it('keeps symbol lookup available for Yahoo company fundamentals', () => {
    expect(yahooSymbolFor(engine.get(ID)!)).toBe('AAPL');
    const dynamic = { ...engine.get(ID)!, yahoo: undefined, dynamic: { source: 'yahoo' as const, symbol: 'CUSTOM', loaded: NOW, anchors: [] } };
    expect(yahooSymbolFor(dynamic)).toBe('CUSTOM');
  });

  it('dates trades and venue daily bars by New York, including daylight saving time', () => {
    expect(iexDay(Date.parse('2026-10-14T03:59:00Z'))).toBe(day - 1);
    expect(iexDay(Date.parse('2026-10-14T04:00:00Z'))).toBe(day);
    expect(iexDay(Date.parse('2026-12-14T04:59:00Z'))).toBe(dayNum(Date.parse('2026-12-13')));
    expect(iexDay(Date.parse('2026-12-14T05:00:00Z'))).toBe(dayNum(Date.parse('2026-12-14')));
  });
});

describe("the session's open, range and volume of all venues beside IEX's last price", () => {
  it("takes Yahoo's figures for the same session, keeps IEX's last price, and names both sources", () => {
    const own = iexReading(state(), NOW)!;
    // APLD on 27 October 2026: IEX counted 892K shares, all venues about 15M.
    const got = withConsolidatedDay(own, { day, open: 99.5, high: 101.5, low: 98.2, volume: 15_000_000, time: NOW - 2_000 });
    expect(got.quote).toMatchObject({ last: 101, volume: 15_000_000, open: 99.5, low: 98.2, dayProvider: CONSOLIDATED_PROVIDER });
    // The range always holds the last trade: Yahoo's high of 101.5 stands; a high below IEX's 101 is raised to it.
    expect(got.quote.high).toBe(101.5);
    expect(withConsolidatedDay(own, { day, open: 99.5, high: 100.5, low: 98.2, volume: 1, time: NOW }).quote.high).toBe(101);
    expect(got.bars.at(-1)).toMatchObject({ day, o: 99.5, h: 101.5, l: 98.2, v: 15_000_000 });
    expect(got.quote.sourceName).toContain('IEX');
    expect(got.quote.sourceName).toContain(CONSOLIDATED_PROVIDER);
    // Another session's figures (Yahoo still on yesterday before the open) are not today's.
    expect(withConsolidatedDay(own, { day: day - 1, open: 1, high: 2, low: 1, volume: 5, time: NOW })).toBe(own);
    // A figure Yahoo leaves out stays IEX's.
    expect(withConsolidatedDay(own, { day, open: NaN, high: NaN, low: NaN, volume: 15_000_000, time: NOW }).quote).toMatchObject({ open: 100, high: 102, low: 99, volume: 15_000_000 });
  });
});

describe('IEX snapshot provenance and event time', () => {
  it('uses only IEX previous close, ranges and volumes and never claims a market session', () => {
    const reading = iexReading(state(), NOW)!;
    expect(reading.bars).toEqual([
      { day: day - 1, o: 98, h: 100, l: 97, c: 99, v: 1800 },
      { day, o: 100, h: 102, l: 99, c: 100.9, v: 2400 },
    ]);
    expect(reading.quote).toMatchObject({ last: 101, prevClose: 99, volume: 2400, time: NOW - 1000, fetched: NOW, sessionKnown: false, aggregateTrades: false });
    expect(reading.stale).toBe(false);
  });

  it('keeps absent or mismatched-session daily data missing instead of borrowing another day', () => {
    const reading = iexReading(state({ dayAt: NOW - 86_400_000, prevDayAt: NOW, quoteAt: NOW - 61_000 }), NOW)!;
    expect(reading.bars).toHaveLength(1);
    expect(reading.quote.open).toBeNaN();
    expect(reading.quote.high).toBeNaN();
    expect(reading.quote.volume).toBeNaN();
    expect(reading.quote.prevClose).toBeNaN();
    expect(reading.quote.bid).toBeNaN();
    expect(reading.quote.ask).toBeNaN();
  });

  it('does not let receipt time upgrade old or cached data to real time', () => {
    expect(iexReading(state({ lastAt: NOW - 61_000 }), NOW)!.stale).toBe(true);
    expect(iexReading({ ...state(), stale: true }, NOW)!.stale).toBe(true);
    expect(iexReading(state({ lastAt: NOW + 60_000 }), NOW)).toBeNull();
    expect(iexReading(state({ last: NaN, lastAt: NaN }), NOW)).toBeNull();
    expect(freshnessOf({ src: 'LIVE', time: NOW - 61_000, provider: IEX_PROVIDER }, { cls: 'equity' }, NOW)?.label).toBe('STALE');
    expect(isOfficialProvider(IEX_PROVIDER)).toBe(false);
  });
});

describe('IEX lines in the market engine', () => {
  it('resets old-provider quotes, history, extended hours and tape on a venue change', () => {
    const e = new MarketEngine(() => NOW);
    e.setExternalDaily(ID, [{ day: day - 1, o: 500, h: 600, l: 400, c: 550, v: 10_000_000 }, { day, o: 550, h: 650, l: 500, c: 600, v: 20_000_000 }], { provider: 'Yahoo Finance' });
    e.setExternalQuote(ID, { last: 600, time: NOW, volume: 20_000_100, bid: 599, ask: 601, marketOpen: true, timing: 'delayed', delay: 15 });
    e.setExtended(ID, { price: 601, time: NOW, session: 'post' });
    expect(e.trades(ID)).toHaveLength(1);
    const reading = iexReading(state(), NOW)!;
    e.setExternalDaily(ID, reading.bars, { provider: IEX_PROVIDER });
    expect(e.quote(ID)).toMatchObject({ provider: IEX_PROVIDER, src: 'UNCONFIRMED' });
    expect(e.quote(ID)?.bid).toBeNaN();
    expect(e.quote(ID)?.extended).toBeUndefined();
    expect(e.quote(ID)?.delay).toBeUndefined();
    e.setExternalQuote(ID, reading.quote);
    const q = e.quote(ID)!;
    expect(q).toMatchObject({ last: 101, high: 102, low: 99, prevClose: 99, volume: 2400, chg: 2, chgCheck: 'verified', src: 'LIVE' });
    expect(q.session).toBeUndefined();
    expect(e.trades(ID)).toHaveLength(0);
    expect(Array.from(e.daily(ID).c).slice(0, e.daily(ID).length)).toEqual([99, 101]);
  });

  it('publishes app-wide prices and observed samples, ages them out, and takes only earlier days from Yahoo', async () => {
    const yahoo = vi.fn(async (_path: string) => ({ status: 200, data: null }));
    window.arminDesktop!.yahoo = yahoo;
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('disabled in this test'); } });
    stops.push(startIexPrices());
    const update = (value: IexState) => iex.set((s) => ({ v: s.v + 1, by: { ...s.by, AAPL: value } }));
    update(state());
    expect(engine.quote(ID)).toMatchObject({ provider: IEX_PROVIDER, last: 101, src: 'LIVE', chgCheck: 'verified' });
    expect(engine.intraday(ID).length).toBe(1);
    expect(engine.intraday(ID).t[0]).toBe(NOW - 1000);
    vi.setSystemTime(NOW + 30_000);
    update({ ...state({ last: 101.5, lastAt: NOW + 29_000, quoteAt: NOW + 29_000 }), at: NOW + 30_000 });
    expect(engine.intraday(ID).length).toBe(2);
    expect(engine.intraday(ID).t[1]).toBe(NOW + 29_000);
    expect(engine.intraday(ID).v[1]).toBeNaN();
    expect(engine.trades(ID)).toHaveLength(0);
    expect(rangeStats(ID).hi52).toBeNaN();
    expect(rangeStats(ID).avgVol30).toBeNaN();
    expect(trailingDividendYield(ID)).toBeNaN();

    stops.push(startYahooData());
    // Yahoo's bars for IEX's own sessions (yesterday and today) are ignored; earlier days fill the history.
    adoptYahooHistory(ID, 'AAPL', [
      { day: day - 3, o: 90, h: 120, l: 85, c: 95, v: 9e7 },
      { day: day - 1, o: 999, h: 999, l: 999, c: 999, v: 9e9 },
      { day, o: 999, h: 999, l: 999, c: 999, v: 9e9 },
    ]);
    await Promise.resolve();
    expect(engine.quote(ID)?.provider).toBe(IEX_PROVIDER);
    expect(engine.quote(ID)?.last).toBe(101.5);
    expect(engine.quote(ID)?.prevClose).toBe(99);
    const daily = engine.daily(ID);
    expect(Array.from(daily.c).slice(0, daily.length)).toEqual([95, 99, 101.5]);
    expect(rangeStats(ID).hi52).toBe(120);

    // The shared transport can keep answering, but the trade's own time ages independently.
    vi.setSystemTime(NOW + 95_000);
    update({ ...state({ last: 101.5, lastAt: NOW + 29_000, quoteAt: NOW + 29_000 }), at: NOW + 95_000 });
    expect(engine.quote(ID)?.src).toBe('STALE');
    expect(engine.quote(ID)?.bid).toBeNaN();
    expect(engine.quote(ID)?.time).toBe(NOW + 29_000);
  });
});

describe('IEX history backfill', () => {
  it('keeps IEX bars and takes only strictly earlier, positive consolidated days', () => {
    const own = [{ day: 10, o: 1, h: 1, l: 1, c: 1, v: 1 }, { day: 11, o: 2, h: 2, l: 2, c: 2, v: 2 }];
    const earlier = [
      { day: 7, o: 5, h: 5, l: 5, c: 0, v: 5 },
      { day: 8, o: 5, h: 5, l: 5, c: 5, v: 5 },
      { day: 10, o: 9, h: 9, l: 9, c: 9, v: 9 },
    ];
    expect(withBackfill(earlier, own).map((b) => [b.day, b.c])).toEqual([[8, 5], [10, 1], [11, 2]]);
    expect(withBackfill(undefined, own)).toBe(own);
    expect(withBackfill(earlier, [])).toEqual([]);
  });

  it('keeps every IEX session seen while the window stays open for several days', () => {
    const kept = new Map<number, { day: number; o: number; h: number; l: number; c: number; v: number }>();
    expect(keepOwnDays(kept, [{ day: 10, o: 1, h: 1, l: 1, c: 1, v: 1 }, { day: 11, o: 2, h: 2, l: 2, c: 2, v: 2 }]).map((b) => b.day)).toEqual([10, 11]);
    // The next session's reading gives day 11 in full (its previous session) and day 12.
    expect(keepOwnDays(kept, [{ day: 11, o: 2, h: 3, l: 2, c: 2.5, v: 5 }, { day: 12, o: 3, h: 3, l: 3, c: 3, v: 3 }]).map((b) => [b.day, b.c])).toEqual([[10, 1], [11, 2.5], [12, 3]]);
  });

  it('does not lose the days between the backfill and IEX previous session at a later reading', () => {
    stops.push(startIexPrices());
    const update = (value: IexState) => iex.set((s) => ({ v: s.v + 1, by: { ...s.by, AAPL: value } }));
    const ny = (iso: string) => Date.parse(`${iso}T04:00:00Z`);
    // Yahoo's backfill ends with Wednesday 14 Oct, the session the app was started in.
    setIexBackfill(ID, [
      { day: dayNum(ny('2026-10-09')), o: 90, h: 91, l: 89, c: 90, v: 1e6 },
      { day: dayNum(ny('2026-10-12')), o: 91, h: 92, l: 90, c: 91, v: 1e6 },
      { day: dayNum(ny('2026-10-13')), o: 92, h: 93, l: 91, c: 92, v: 1e6 },
      { day: dayNum(ny('2026-10-14')), o: 93, h: 94, l: 92, c: 93, v: 1e6 },
    ]);
    // The window stays open: a reading in each session, Wednesday to the next Monday (after the
    // trade the test above left on this line, so the first reading is not taken for an older one).
    const sessions: [string, string, number][] = [['2026-10-13', '2026-10-14', 100], ['2026-10-14', '2026-10-15', 101], ['2026-10-15', '2026-10-16', 102], ['2026-10-16', '2026-10-19', 103]];
    for (const [prev, today, px] of sessions) {
      const at = Date.parse(`${today}T15:05:00Z`);
      vi.setSystemTime(at);
      update({ state: 'ok', at, data: snapshot({ last: px, close: px, lastAt: at - 1_000, quoteAt: at - 500, dayAt: ny(today), prevDayAt: ny(prev), prevClose: px - 1 }) });
    }
    const daily = engine.daily(ID);
    const days = Array.from(daily.t.subarray(0, daily.length), (t) => new Date(t).toISOString().slice(0, 10));
    expect(days).toEqual(['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19']);
    // IEX's own closes for the sessions it saw, never Yahoo's for the same days.
    expect(Array.from(daily.c.subarray(0, daily.length))).toEqual([90, 91, 99, 100, 101, 102, 103]);
    expect(engine.quote(ID)?.prevClose).toBe(102);
  });
});
