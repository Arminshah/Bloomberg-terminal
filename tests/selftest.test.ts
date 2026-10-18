import { describe, expect, it } from 'vitest';
import * as selftest from '../electron/selftest.cjs';

// Made-up answers in each provider's documented layout; no request leaves the test.
const test = (id: string) => selftest.TESTS.find((t) => t.id === id)!;

describe('provider self-test', () => {
  it('reads each kind of answer into a short sample', () => {
    expect(test('nyfed').read('{"refRates":[{"effectiveDate":"2026-10-16","type":"EFFR","percentRate":3.58}]}')).toBe('EFFR 3.58% on 2026-10-16');
    expect(test('ecb').read('KEY,FREQ,TIME_PERIOD,OBS_VALUE\nFM.D,D,2026-10-16,2.00\n')).toBe('2.00% on 2026-10-16');
    expect(test('kraken').read('{"error":[],"result":{"XXBTZUSD":{"c":["67000.1","0.1"]}}}')).toBe('BTC/USD 67000.1');
    expect(() => test('kraken').read('{"error":["EGeneral:Too many requests"]}')).toThrow('EGeneral:Too many requests');
    expect(test('fred').read('{"observations":[{"date":"2026-10-16","value":"4.05"}]}')).toBe('4.05% on 2026-10-16');
    expect(test('fmp').read('[{"symbol":"AAPL","targetHigh":300,"targetLow":200,"targetConsensus":250.5}]')).toBe('consensus 250.5, high 300, low 200');
    expect(test('finnhub-quote').read('{"c":343.46,"t":1792180800}')).toBe('AAPL 343.46 at 2026-10-16 20:00 UTC');
    expect(() => test('finnhub-quote').read('{"c":0,"t":0}')).toThrow('empty quote');
    expect(test('alpaca').read('{"AAPL":{"latestTrade":{"p":343.4,"t":"2026-10-16T19:59:59.1Z"}}}')).toBe('AAPL 343.4 on IEX at 2026-10-16 19:59 UTC');
    expect(test('massive').read('{"results":[{"c":343.46,"t":1792180800000}]}')).toBe('close 343.46 on 2026-10-16');
    expect(() => test('alphavantage').read('{"Information":"25 requests per day"}')).toThrow('25 requests per day');
  });

  it('builds requests with keys only in headers or the query the provider documents', () => {
    const now = Date.parse('2026-10-18T10:00:00Z');
    expect(test('finnhub-quote').request(['k'], now)).toEqual({ url: 'https://finnhub.io/api/v1/quote?symbol=AAPL', headers: { 'X-Finnhub-Token': 'k' } });
    expect(test('tiingo').request(['k'], now).url).toBe('https://api.tiingo.com/tiingo/daily/aapl/prices?startDate=2026-10-08&endDate=2026-10-18&format=json');
    expect(test('alpaca').request(['id', 's'], now).url).toBe('https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL&feed=iex');
    // Every keyed test names the credentials it needs.
    for (const t of selftest.TESTS) if (/KEY|TOKEN|AGENT/.test(JSON.stringify(t.credentials ?? []))) expect(t.credentials!.length).toBeGreaterThan(0);
  });

  it('writes a report with states and samples, never a key', () => {
    const text = selftest.reportText({
      at: Date.parse('2026-10-18T10:00:00Z'),
      version: '2.5.0',
      platform: 'win32 x64',
      results: [
        { label: 'Yahoo crumb', state: 'fail', status: 401, ms: 120, detail: 'Invalid Cookie' },
        { label: 'FRED', state: 'pass', status: 200, ms: 300, detail: '4.05% on 2026-10-16' },
        { label: 'Tiingo', state: 'skip', detail: 'no TIINGO_API_KEY set' },
      ],
    });
    expect(text).toBe(
      [
        'Armin Terminal 2.5.0 self-test, 2026-10-18 10:00:00 UTC, win32 x64',
        '1 passed, 1 failed, 1 skipped or switched off',
        '',
        'FAIL Yahoo crumb HTTP 401 120 ms: Invalid Cookie',
        'PASS FRED HTTP 200 300 ms: 4.05% on 2026-10-16',
        'SKIP Tiingo: no TIINGO_API_KEY set',
      ].join('\n'),
    );
  });
});
