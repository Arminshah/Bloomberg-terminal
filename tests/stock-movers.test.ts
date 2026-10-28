import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED } from '../electron/yahoo-scope.cjs';
import { moverData, moverOf, moverVolume, parseScreener, parseSparkPaths, parseTrending, settleMovers } from '../src/data/live/stock-movers';
import { nyDay } from '../src/data/live/settled-volume';
import { argsWith } from '../src/terminal/legacy';

// Yahoo's most-active list (SpaceX, 21 October 2026), as its screener returns it.
const SPCX = { symbol: 'SPCX', quoteType: 'EQUITY', longName: 'Space Exploration Technologies Corp.', shortName: 'Space Exploration Technologies ', regularMarketPrice: 164.735, regularMarketChange: 16.945007, regularMarketChangePercent: 11.465598, regularMarketVolume: 75246120, averageDailyVolume3Month: 95611018, marketCap: 2171500494848, fiftyTwoWeekChangePercent: -8.176452, fiftyTwoWeekLow: 104.83, fiftyTwoWeekHigh: 225.64, currency: 'USD', regularMarketTime: 1792591921, exchangeDataDelayedBy: 15 };

describe('TOPMOVERS: Yahoo Finance stock lists', () => {
  it('reads each stock of a list with its price, volumes, value and 52-week figures', () => {
    const got = parseScreener({ finance: { result: [{ total: 33, quotes: [SPCX, { symbol: 'X' }] }] } })!;
    expect(got.total).toBe(33);
    expect(got.rows).toHaveLength(1);
    expect(got.rows[0]).toMatchObject({ symbol: 'SPCX', name: 'Space Exploration Technologies Corp.', price: 164.735, pct: 11.465598, volume: 75_246_120, avgVolume3m: 95_611_018, marketCap: 2_171_500_494_848, change52w: -8.176452, low52: 104.83, high52: 225.64, delay: 15 });
    expect(moverOf(SPCX)!.pe).toBeNaN();
    expect(parseScreener({ finance: { result: [] } })).toBeNull();
  });

  it("reads trending symbols and the day's price paths", () => {
    expect(parseTrending({ finance: { result: [{ quotes: [{ symbol: 'SPCX' }, { symbol: 'NFLX' }, { symbol: 'BTC-USD' }, { bad: 1 }] }] } })).toEqual(['SPCX', 'NFLX', 'BTC-USD']);
    expect(parseSparkPaths({ spark: { result: [{ symbol: 'NFLX', response: [{ indicators: { quote: [{ close: [68.7, null, 68.5] }] } }] }] } })).toEqual({ NFLX: [68.7, 68.5] });
    expect(parseSparkPaths({ NFLX: { symbol: 'NFLX', timestamp: [1, 2], close: [68.7, 68.5] } })).toEqual({ NFLX: [68.7, 68.5] });
  });

  it('asks Yahoo only for the predefined lists and US trending, and opens a list from its word', () => {
    expect(ALLOWED.test('/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=100')).toBe(true);
    expect(ALLOWED.test('/v1/finance/trending/US?count=25')).toBe(true);
    expect(ALLOWED.test('/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=100&formatted=true')).toBe(false);
    expect(ALLOWED.test('/v1/finance/screener')).toBe(false);
    expect(argsWith('GAINERS')).toBe('GAINERS');
    expect(argsWith('LOSERS', 'X')).toBe('LOSERS X');
  });
});

describe("TOPMOVERS: the finished session's volume, settled from Nasdaq", () => {
  // Apple on 27 October 2026: Yahoo's figure 39,051,747 after the close; Nasdaq's historical prices 39,984,400.
  const close = Date.parse('2026-10-27T20:00:01Z');
  const aapl = moverOf({ symbol: 'AAPL', longName: 'Apple Inc.', regularMarketPrice: 347.1, regularMarketVolume: 39_051_747, regularMarketTime: close / 1000 })!;
  const nasdaq = JSON.stringify({ data: { tradesTable: { rows: [{ date: '10/27/2026', close: '$347.10', volume: '39,984,400' }, { date: '10/26/2026', close: '$343.91', volume: '42,743,580' }] } } });
  afterEach(() => vi.unstubAllGlobals());

  it("shows Yahoo's figure, marked as Yahoo's, until the session is settled", () => {
    expect(moverVolume(aapl, {})).toEqual({ volume: 39_051_747, settled: false });
    // A settled figure for another session is not this one's.
    expect(moverVolume(aapl, { AAPL: { day: nyDay(close) - 1, volume: 42_743_580 } })).toEqual({ volume: 39_051_747, settled: false });
  });

  it("asks Nasdaq only from 16:10 New York time, and then shows its consolidated volume", async () => {
    const ask = vi.fn(async () => ({ status: 200, text: nasdaq }));
    vi.stubGlobal('window', { arminDesktop: { nasdaq: ask } });
    await settleMovers([aapl], Date.parse('2026-10-27T20:05:00Z'));
    expect(ask).not.toHaveBeenCalled();
    await settleMovers([aapl], Date.parse('2026-10-27T20:11:00Z'));
    expect(ask).toHaveBeenCalledWith('historical', 'AAPL');
    expect(moverVolume(aapl, moverData.get().settled)).toEqual({ volume: 39_984_400, settled: true });
    // Asked again only after 30 minutes.
    await settleMovers([aapl], Date.parse('2026-10-27T20:20:00Z'));
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

