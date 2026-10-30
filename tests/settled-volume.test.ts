import { describe, expect, it } from 'vitest';
import * as nasdaqMain from '../electron/nasdaq.cjs';
import { dayNum } from '../src/data/calendar';
import { MarketEngine } from '../src/data/engine';
import { securityFields } from '../src/data/fields';
import { extQuote } from '../src/data/live/yahoo';
import { parseNasdaqDays, settleDue, SETTLED_OPEN_SOURCE, SETTLED_SOURCE } from '../src/data/live/settled-volume';

// Apple on 27 October 2026, read the next morning: Yahoo's quote kept 39,051,747 shares, its daily bar 39,949,500;
// Nasdaq's historical prices and Massive's daily bar gave 39,984,400 and 39,984,395.
const NASDAQ = JSON.stringify({
  data: {
    symbol: 'AAPL',
    totalRecords: 2,
    tradesTable: {
      headers: { date: 'Date', close: 'Close/Last', volume: 'Volume', open: 'Open', high: 'High', low: 'Low' },
      rows: [
        { date: '10/27/2026', close: '$347.10', volume: '39,984,400', open: '$343.165', high: '$347.78', low: '$342.39' },
        { date: '10/26/2026', close: '$343.91', volume: '42,743,580', open: '$343.92', high: '$347.09', low: '$341.03' },
      ],
    },
  },
  status: { rCode: 200 },
});
const D = (iso: string) => dayNum(Date.parse(`${iso}T00:00:00Z`));
const ID = 'AAPL US Equity';

describe("a finished session's volume, settled from the consolidated tape", () => {
  it("reads Nasdaq's historical rows by session", () => {
    expect(parseNasdaqDays(NASDAQ)).toEqual([
      { day: D('2026-10-27'), volume: 39_984_400, close: 347.1, open: 343.165 },
      { day: D('2026-10-26'), volume: 42_743_580, close: 343.91, open: 343.92 },
    ]);
    expect(parseNasdaqDays('{"data":null}')).toEqual([]);
    expect(parseNasdaqDays('<html>')).toEqual([]);
  });

  it('asks only once the closing auction and the late reports are in, by New York time', () => {
    const day = D('2026-10-27');
    expect(settleDue(day, Date.parse('2026-10-27T19:59:00Z'))).toBe(false); // 15:59 New York
    expect(settleDue(day, Date.parse('2026-10-27T20:09:00Z'))).toBe(false);
    expect(settleDue(day, Date.parse('2026-10-27T20:10:00Z'))).toBe(true);
    expect(settleDue(day, Date.parse('2026-10-28T06:52:00Z'))).toBe(true);
    expect(settleDue(D('2026-10-28'), Date.parse('2026-10-28T14:00:00Z'))).toBe(false);
  });

  it('asks Nasdaq for the last two weeks of sessions', () => {
    expect(nasdaqMain.nasdaqCompanyRequest('historical', 'AAPL', Date.parse('2026-10-28T06:52:00Z'))!.url).toBe(
      'https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=2026-10-14&todate=2026-10-29&limit=15',
    );
  });

  it("replaces the quote's shorter volume, keeps it against the next poll, and starts a new session afresh", () => {
    const now = Date.parse('2026-10-28T06:52:00Z');
    const engine = new MarketEngine(() => now);
    engine.setExternalDaily(ID, [
      { day: D('2026-10-26'), o: 343.92, h: 347.09, l: 341.03, c: 343.91, v: 42_743_600 },
      { day: D('2026-10-27'), o: 343.165, h: 347.78, l: 342.39, c: 347.1, v: 39_949_500 },
    ]);
    const quote = { regularMarketPrice: 347.1, regularMarketChange: 3.19, regularMarketPreviousClose: 343.91, regularMarketVolume: 39_051_747, regularMarketTime: 1793131201, gmtOffSetMilliseconds: -14_400_000, exchangeTimezoneName: 'America/New_York', marketState: 'CLOSED' };
    engine.setExternalQuote(ID, extQuote(quote, false)!);
    expect(engine.quote(ID)!.volume).toBe(39_051_747);
    expect(engine.settleVolume(ID, D('2026-10-26'), 42_743_580, SETTLED_SOURCE)).toBe(false);
    expect(engine.settleVolume(ID, D('2026-10-27'), 39_984_400, SETTLED_SOURCE)).toBe(true);
    let q = engine.quote(ID)!;
    expect(q.volume).toBe(39_984_400);
    expect(q.volumeSource).toBe(SETTLED_SOURCE);
    expect(engine.daily(ID).v[1]).toBe(39_984_400);
    const field = securityFields(engine.get(ID)!, q, now).find((f) => f.id === 'PX_VOLUME')!;
    expect(field.value).toBe(39_984_400);
    expect(field.source).toBe(SETTLED_SOURCE);
    // Yahoo repeats its figure on the next poll; a line reloaded with bars (as IEX's are every few seconds) too.
    engine.setExternalQuote(ID, extQuote(quote, false)!);
    expect(engine.quote(ID)!.volume).toBe(39_984_400);
    engine.setExternalDaily(ID, [
      { day: D('2026-10-26'), o: 343.92, h: 347.09, l: 341.03, c: 343.91, v: 42_743_600 },
      { day: D('2026-10-27'), o: 343.165, h: 347.78, l: 342.39, c: 347.1, v: 39_051_747 },
    ]);
    expect(engine.quote(ID)!.volume).toBe(39_984_400);
    // The next session's volume is its own.
    engine.setExternalQuote(ID, extQuote({ ...quote, regularMarketPrice: 348, regularMarketVolume: 1_250_000, regularMarketTime: Date.parse('2026-10-28T13:40:00Z') / 1000, marketState: 'REGULAR' }, false)!);
    q = engine.quote(ID)!;
    expect(q.volume).toBe(1_250_000);
    expect(q.volumeSource).toBeUndefined();
  });
});

describe("a finished session's official open, settled with its volume", () => {
  // Walmart on 29 October 2026, as the data audit of the next morning (run 41028233779) captured it: Yahoo's quote
  // gave an open of 120.83 and about 15.84M shares; Nasdaq's historical prices, Tiingo and Massive gave the official
  // open, 120.74, and 16,048,290 shares (Nasdaq; Tiingo 16,048,288). Yahoo's own daily bar later read 120.74.
  const WMT = 'WMT US Equity';
  const ROW = JSON.stringify({ data: { tradesTable: { rows: [{ date: '10/29/2026', close: '$121.25', volume: '16,048,290', open: '$120.74', high: '$121.97', low: '$120.33' }] } } });

  it("replaces the price source's provisional open with the official one, says so, and keeps it", () => {
    const now = Date.parse('2026-10-30T08:00:00Z');
    const engine = new MarketEngine(() => now);
    engine.setExternalDaily(WMT, [
      { day: D('2026-10-28'), o: 118.425, h: 119.4, l: 117.9, c: 118.77, v: 14_456_440 },
      { day: D('2026-10-29'), o: 120.83, h: 121.97, l: 120.33, c: 121.25, v: 15_840_000 },
    ]);
    const quote = { regularMarketPrice: 121.25, regularMarketOpen: 120.83, regularMarketDayHigh: 121.97, regularMarketDayLow: 120.33, regularMarketPreviousClose: 118.77, regularMarketVolume: 15_840_000, regularMarketTime: Date.parse('2026-10-29T20:00:00Z') / 1000, gmtOffSetMilliseconds: -14_400_000, exchangeTimezoneName: 'America/New_York', marketState: 'CLOSED' };
    engine.setExternalQuote(WMT, extQuote(quote, false)!);
    expect(engine.quote(WMT)!.open).toBe(120.83);
    const row = parseNasdaqDays(ROW)[0];
    expect(row).toEqual({ day: D('2026-10-29'), volume: 16_048_290, close: 121.25, open: 120.74 });
    expect(engine.settleVolume(WMT, row.day, row.volume, SETTLED_SOURCE, { price: row.open, source: SETTLED_OPEN_SOURCE })).toBe(true);
    let q = engine.quote(WMT)!;
    expect([q.open, q.volume]).toEqual([120.74, 16_048_290]);
    expect([q.openSource, q.volumeSource]).toEqual([SETTLED_OPEN_SOURCE, SETTLED_SOURCE]);
    expect(engine.daily(WMT).o[1]).toBe(120.74);
    const open = securityFields(engine.get(WMT)!, q, now).find((f) => f.id === 'PX_OPEN')!;
    expect([open.value, open.source]).toEqual([120.74, SETTLED_OPEN_SOURCE]);
    // Yahoo's next poll and a reload of its bars repeat the provisional open; the official one stays.
    engine.setExternalQuote(WMT, extQuote(quote, false)!);
    expect(engine.quote(WMT)!.open).toBe(120.74);
    engine.setExternalDaily(WMT, [
      { day: D('2026-10-28'), o: 118.425, h: 119.4, l: 117.9, c: 118.77, v: 14_456_440 },
      { day: D('2026-10-29'), o: 120.83, h: 121.97, l: 120.33, c: 121.25, v: 15_840_000 },
    ]);
    q = engine.quote(WMT)!;
    expect([q.open, q.openSource]).toEqual([120.74, SETTLED_OPEN_SOURCE]);
    // The next session's open is its own.
    engine.setExternalQuote(WMT, extQuote({ ...quote, regularMarketPrice: 122.5, regularMarketOpen: 123.15, regularMarketVolume: 900_000, regularMarketTime: Date.parse('2026-10-30T13:35:00Z') / 1000, marketState: 'REGULAR' }, false)!);
    q = engine.quote(WMT)!;
    expect(q.open).toBe(123.15);
    expect(q.openSource).toBeUndefined();
  });

  it('settles the open alone when the volume is already in, and leaves a missing open as the price source gave it', () => {
    const now = Date.parse('2026-10-30T08:00:00Z');
    const engine = new MarketEngine(() => now);
    engine.setExternalDaily(WMT, [{ day: D('2026-10-28'), o: 118.425, h: 119.4, l: 117.9, c: 118.77, v: 14_456_440 }, { day: D('2026-10-29'), o: 120.83, h: 121.97, l: 120.33, c: 121.25, v: 16_048_290 }]);
    expect(engine.settleVolume(WMT, D('2026-10-29'), 16_048_290, SETTLED_SOURCE, { price: 120.74, source: SETTLED_OPEN_SOURCE })).toBe(true);
    expect(engine.quote(WMT)!.open).toBe(120.74);
    const other = new MarketEngine(() => now);
    other.setExternalDaily(WMT, [{ day: D('2026-10-28'), o: 118.425, h: 119.4, l: 117.9, c: 118.77, v: 14_456_440 }, { day: D('2026-10-29'), o: 120.83, h: 121.97, l: 120.33, c: 121.25, v: 16_048_290 }]);
    expect(other.settleVolume(WMT, D('2026-10-29'), 16_048_290, SETTLED_SOURCE, { price: NaN, source: SETTLED_OPEN_SOURCE })).toBe(false);
    expect([other.quote(WMT)!.open, other.quote(WMT)!.openSource]).toEqual([120.83, undefined]);
  });
});

describe('30-day average volume: the finished session counts once settled', () => {
  // The audit of 28 October 2026: DES's 30-day average left out the last bar even after the close, so the session
  // just finished (and its settled volume) never counted until the next day's bar appeared.
  const bars = (last: number) => Array.from({ length: 31 }, (_, i) => ({ day: last - 30 + i, o: 10, h: 10, l: 10, c: 10, v: i === 30 ? 5_000_000 : 1_000_000 }));

  it("leaves out today's session while it trades, and counts it with Nasdaq's settled volume after the close", async () => {
    const { engine } = await import('../src/data/market');
    const { rangeStats } = await import('../src/data/analytics');
    const id = 'MSFT US Equity';
    engine.setExternalDaily(id, bars(engine.today));
    expect(engine.lastSessionDone(id)).toBe(false);
    expect(rangeStats(id).avgVol30).toBe(1_000_000);
    engine.settleVolume(id, engine.today, 7_000_000, SETTLED_SOURCE);
    expect(engine.lastSessionDone(id)).toBe(true);
    expect(rangeStats(id).avgVol30).toBeCloseTo((29 * 1_000_000 + 7_000_000) / 30, 6);
  });

  it("counts an earlier day's last bar: that session is over", async () => {
    const { engine } = await import('../src/data/market');
    const { rangeStats } = await import('../src/data/analytics');
    const id = 'GOOGL US Equity';
    engine.setExternalDaily(id, bars(engine.today - 1));
    expect(engine.lastSessionDone(id)).toBe(true);
    expect(rangeStats(id).avgVol30).toBeCloseTo((29 * 1_000_000 + 5_000_000) / 30, 6);
  });
});
