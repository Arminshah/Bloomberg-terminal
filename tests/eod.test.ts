import { describe, expect, it } from 'vitest';
import * as eodMain from '../electron/eod.cjs';
import { compareCloses, diffBp, parseAlphaVantage, parseMassive, parseTwelveData } from '../src/data/live/eod';

// Answers in the layouts the providers document: Massive's custom-bars sample,
// and the shapes of Alpha Vantage's and Twelve Data's documented demo answers.

describe('end-of-day requests (main process)', () => {
  it('builds only the requests the app makes', () => {
    // Massive's and Twelve Data's keys go in a header, not the URL.
    const m = eodMain.eodRequest('massive', 'AAPL', '2026-09-01', '2026-10-13', 'secret')!;
    expect(m.url).toBe('https://api.massive.com/v2/aggs/ticker/AAPL/range/1/day/2026-09-01/2026-10-13?adjusted=true&sort=asc&limit=5000');
    expect(m.headers).toEqual({ Authorization: 'Bearer secret' });
    const td = eodMain.eodRequest('twelvedata', 'BRK.B', '2026-09-01', '2026-10-13', 'secret')!;
    expect(td.url).toBe('https://api.twelvedata.com/time_series?symbol=BRK.B&interval=1day&start_date=2026-09-01&end_date=2026-10-13&order=asc');
    expect(td.headers).toEqual({ Authorization: 'apikey secret' });
    // Alpha Vantage documents only the query parameter.
    expect(eodMain.eodRequest('alphavantage', 'IBM', '2026-09-01', '2026-10-13', 'k')!.url).toBe('https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM&outputsize=compact&apikey=k');
    expect(eodMain.eodRequest('fmp', 'AAPL', '2026-09-01', '2026-10-13', 'k')).toBeNull();
    expect(eodMain.eodRequest('massive', 'aapl', '2026-09-01', '2026-10-13', 'k')).toBeNull();
    expect(eodMain.eodRequest('massive', 'AAPL/../x', '2026-09-01', '2026-10-13', 'k')).toBeNull();
    expect(eodMain.eodRequest('massive', 'AAPL', '2026-10-13', '2026-09-01', 'k')).toBeNull();
  });

  it('keeps each free plan within its budget', () => {
    expect(eodMain.PROVIDERS.massive.perMinute).toBeLessThanOrEqual(5);
    expect(eodMain.PROVIDERS.alphavantage.perDay).toBeLessThan(25);
    expect(eodMain.PROVIDERS.twelvedata.perMinute).toBeLessThan(8);
    expect(eodMain.PROVIDERS.twelvedata.gate).toBe('TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED');
    const t = Date.parse('2026-10-14T10:00:00Z');
    let n = 0;
    while (eodMain.takeDaily('alphavantage', t)) n++;
    expect(n).toBe(eodMain.PROVIDERS.alphavantage.perDay);
    // A new UTC day starts a new budget.
    expect(eodMain.takeDaily('alphavantage', t + 86_400_000)).toBe(true);
    expect(eodMain.takeDaily('massive', t)).toBe(true);
  });
});

describe('end-of-day answers', () => {
  it('reads Massive aggregates by session date in New York', () => {
    const sample = { adjusted: true, queryCount: 2, results: [{ c: 75.0875, h: 75.15, l: 73.7975, n: 1, o: 74.06, t: 1577941200000, v: 135647456, vw: 74.6099 }, { c: 74.3575, h: 75.145, l: 74.125, n: 1, o: 74.2875, t: 1578027600000, v: 146535512, vw: 74.7026 }], resultsCount: 2, status: 'OK', ticker: 'AAPL' };
    const r = parseMassive(JSON.stringify(sample));
    expect('bars' in r && r.bars.map((b) => [b.date, b.c])).toEqual([['2020-01-02', 75.0875], ['2020-01-03', 74.3575]]);
    expect(parseMassive('{"status":"ERROR","error":"Unknown API Key"}')).toEqual({ error: 'Unknown API Key' });
  });

  it("reads Alpha Vantage's daily series and its limit notices", () => {
    const sample = { 'Meta Data': { '1. Information': 'Daily Prices (open, high, low, close) and Volumes', '2. Symbol': 'IBM' }, 'Time Series (Daily)': { '2026-10-13': { '1. open': '228.2150', '2. high': '233.5000', '3. low': '227.2770', '4. close': '230.7800', '5. volume': '5083223' }, '2026-10-12': { '1. open': '226', '2. high': '229', '3. low': '225', '4. close': '228', '5. volume': '100' } } };
    const r = parseAlphaVantage(JSON.stringify(sample));
    expect('bars' in r && r.bars.map((b) => b.date)).toEqual(['2026-10-12', '2026-10-13']);
    expect('bars' in r && r.bars[1].c).toBe(230.78);
    expect(parseAlphaVantage('{"Information":"Our standard API rate limit is 25 requests per day."}')).toEqual({ error: 'Our standard API rate limit is 25 requests per day.' });
  });

  it("reads Twelve Data's time series and its errors", () => {
    const sample = { meta: { symbol: 'AAPL', interval: '1day', currency: 'USD', exchange_timezone: 'America/New_York', exchange: 'NASDAQ' }, values: [{ datetime: '2026-10-13', open: '344.66501', high: '348.14990', low: '340.73999', close: '341.26999', volume: '38897865' }, { datetime: '2026-10-12', open: '338.22', high: '342.63', low: '337.60001', close: '340.97', volume: '25900600' }], status: 'ok' };
    const r = parseTwelveData(JSON.stringify(sample));
    expect('bars' in r && r.bars.map((b) => [b.date, b.c])).toEqual([['2026-10-12', 340.97], ['2026-10-13', 341.26999]]);
    expect(parseTwelveData('{"code":401,"message":"**apikey** parameter is incorrect","status":"error"}')).toEqual({ error: '**apikey** parameter is incorrect' });
  });
});

describe('close cross-check', () => {
  it('lines up sessions newest first and measures gaps in basis points', () => {
    const app = [{ date: '2026-10-12', c: 340.97 }, { date: '2026-10-13', c: 341.27 }];
    const rows = compareCloses(app, { twelvedata: [{ date: '2026-10-13', o: 1, h: 1, l: 1, c: 341.26999, v: 1 }] });
    expect(rows.map((r) => r.date)).toEqual(['2026-10-13', '2026-10-12']);
    expect(rows[0].others.twelvedata).toBe(341.26999);
    expect(rows[1].others.twelvedata).toBeUndefined();
    expect(diffBp(341.27, 341.26999)).toBeCloseTo(-0.0003, 3);
    expect(diffBp(100, 101)).toBeCloseTo(100, 10);
    expect(diffBp(100, undefined)).toBeNaN();
  });
});
