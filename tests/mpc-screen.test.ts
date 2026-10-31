import { describe, expect, it } from 'vitest';
import { parseTiingoAdjusted } from '../src/data/live/adjusted-history';
import { align, policyOf, STOCKS, TESTS } from '../src/data/mpc-tests';
import { longDate, turnoverText } from '../src/functions/MPC';

describe("Tiingo's adjusted closes", () => {
  it('keeps the date, the adjusted close and the close as traded, in date order', () => {
    const text = JSON.stringify([
      { date: '2012-01-04T00:00:00.000Z', close: 12.105, adjClose: 10.9288 },
      { date: '2012-01-03T00:00:00.000Z', close: 12.2, adjClose: 11.0146 },
      { date: '2012-01-05T00:00:00.000Z', close: null, adjClose: null },
    ]);
    expect(parseTiingoAdjusted(text)).toEqual([
      { date: '2012-01-03', adj: 11.0146, close: 12.2 },
      { date: '2012-01-04', adj: 10.9288, close: 12.105 },
    ]);
    expect(parseTiingoAdjusted('{"detail":"Error: Ticker \'HCP\' not found"}')).toEqual({ error: "Error: Ticker 'HCP' not found" });
    expect(parseTiingoAdjusted('not json')).toEqual({ error: 'Tiingo did not answer with JSON.' });
  });
});

describe("the dissertation's back-tests", () => {
  it('lists its 20 stocks, asking Tiingo for the renamed ones under their tickers today', () => {
    expect(STOCKS).toHaveLength(20);
    expect(STOCKS.find((s) => s.ticker === 'HCP')?.tiingo).toBe('DOC');
    expect(STOCKS.find((s) => s.ticker === 'ADS')?.tiingo).toBe('BFH');
  });

  it("has Tables 5.3 to 5.15 with the settings each varies", () => {
    expect(TESTS.map((t) => t.table.split(',')[0])).toEqual(['Table 5.3', 'Table 5.4', 'Table 5.5', 'Table 5.6', 'Table 5.7', 'Table 5.8', 'Table 5.9', 'Table 5.10', 'Table 5.11', 'Table 5.12', 'Table 5.13', 'Table 5.14', 'Table 5.15']);
    expect(policyOf(TESTS[0], 0)).toEqual({ kind: 'hold' });
    // Table 5.9: holding aversion 1 to 50 at a 10-day horizon, risk 1, trading 0.7, leverage 3.
    expect(policyOf(TESTS[6], 4)).toEqual({ kind: 'mpc', horizon: 10, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 50, leverage: 3, longOnly: undefined, dollarNeutral: undefined });
    // Table 5.13: long only, with no leverage limit.
    expect(policyOf(TESTS[10], 0)).toMatchObject({ longOnly: true, leverage: undefined, horizon: 100 });
    // Table 5.15: dollar neutral over leverage limits.
    expect(TESTS[12].values).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(policyOf(TESTS[12], 1)).toMatchObject({ dollarNeutral: true, leverage: 1.5 });
  });

  it('aligns the stocks on their trading days, carrying a missing day and giving each day the latest bill rate', () => {
    const a = [{ date: '2012-01-03', adj: 10, close: 10 }, { date: '2012-01-04', adj: 11, close: 11 }, { date: '2012-01-05', adj: 12, close: 12 }];
    const b = [{ date: '2012-01-03', adj: 20, close: 20 }, { date: '2012-01-05', adj: 22, close: 22 }];
    const x = align([a, b], [['2011-12-30', 0.01], ['2012-01-05', 0.02]]);
    expect(x.dates).toEqual(['2012-01-03', '2012-01-04', '2012-01-05']);
    expect(x.prices).toEqual([[10, 11, 12], [20, 20, 22]]);
    expect(x.filled).toEqual([0, 1]);
    expect(x.rf).toEqual([0.01, 0.01, 0.02]);
    expect(align([a, b.slice(1)], []).lateStart).toEqual([1]);
  });

  it("writes dates and turnover as the dissertation prints them", () => {
    expect(longDate('2012-01-01')).toBe('1st January 2012');
    expect(longDate('2016-12-31')).toBe('31st December 2016');
    expect(longDate('2013-01-02')).toBe('2nd January 2013');
    expect(longDate('2013-01-11')).toBe('11th January 2013');
    expect(turnoverText(1331.4)).toBe('1,331');
    expect(turnoverText(428.64)).toBe('428.6');
    expect(turnoverText(52.951)).toBe('52.95');
  });
});
