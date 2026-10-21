import { describe, expect, it } from 'vitest';
import { ALLOWED } from '../electron/yahoo-scope.cjs';
import { moverOf, parseScreener, parseSparkPaths, parseTrending } from '../src/data/live/stock-movers';
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
