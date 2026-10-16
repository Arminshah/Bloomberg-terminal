import { describe, expect, it } from 'vitest';
import * as alpacaMain from '../electron/alpaca.cjs';
import { alpacaSymbol, alpacaTime, parseSnapshots } from '../src/data/live/alpaca';
import type { SecurityDef } from '../src/data/types';

// Made-up answers in the layout of Alpaca's snapshots endpoint; no request leaves the test.

describe('Alpaca requests (main process)', () => {
  it('asks only the market data host, for the IEX feed', () => {
    expect(alpacaMain.alpacaRequest('snapshots', 'AAPL,BRK.B')).toBe('https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL,BRK.B&feed=iex');
    const url = new URL(alpacaMain.alpacaRequest('snapshots', 'AAPL')!);
    expect(url.host).toBe('data.alpaca.markets');
    expect(alpacaMain.TRADING_HOSTS).not.toContain(url.host);
  });

  it('builds nothing else: no orders, accounts or positions, no odd symbols', () => {
    for (const kind of ['orders', 'account', 'positions', 'trades', '']) expect(alpacaMain.alpacaRequest(kind, 'AAPL')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', 'aapl')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', 'AAPL&feed=sip')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', '')).toBeNull();
    // Twenty symbols at most in one request.
    const symbols = Array.from({ length: 21 }, (_, i) => `T${i}`);
    expect(alpacaMain.alpacaRequest('snapshots', symbols.slice(0, 20).join(','))).not.toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', symbols.join(','))).toBeNull();
    expect(alpacaMain.alpacaHeaders('id', 'secret')).toEqual({ 'APCA-API-KEY-ID': 'id', 'APCA-API-SECRET-KEY': 'secret' });
  });
});

describe('Alpaca answers', () => {
  it('reads times with nanoseconds', () => {
    expect(alpacaTime('2026-10-14T19:59:59.123456789Z')).toBe(Date.parse('2026-10-14T19:59:59.123Z'));
    expect(alpacaTime('2026-10-14T04:00:00Z')).toBe(Date.parse('2026-10-14T04:00:00Z'));
    expect(alpacaTime(undefined)).toBeNaN();
  });

  it('reads IEX snapshots keyed by symbol', () => {
    const text = JSON.stringify({
      ABC: {
        latestTrade: { t: '2026-10-14T19:59:59.123456789Z', x: 'V', p: 101.25, s: 100, c: ['@'], i: 1, z: 'C' },
        latestQuote: { t: '2026-10-14T19:59:59.5Z', ax: 'V', ap: 101.3, as: 2, bx: 'V', bp: 101.2, bs: 3, c: ['R'], z: 'C' },
        minuteBar: { t: '2026-10-14T19:59:00Z', o: 101, h: 101.3, l: 101, c: 101.25, v: 900, n: 12, vw: 101.1 },
        dailyBar: { t: '2026-10-14T04:00:00Z', o: 99, h: 102, l: 98.5, c: 101.25, v: 250000, n: 3000, vw: 100.4 },
        prevDailyBar: { t: '2026-10-13T04:00:00Z', o: 98, h: 99.5, l: 97, c: 99.1, v: 210000, n: 2800, vw: 98.6 },
      },
      NOPE: null,
    });
    const r = parseSnapshots(text);
    expect(r).toEqual({
      data: {
        ABC: {
          last: 101.25,
          lastSize: 100,
          lastAt: Date.parse('2026-10-14T19:59:59.123Z'),
          bid: 101.2,
          bidSize: 3,
          ask: 101.3,
          askSize: 2,
          quoteAt: Date.parse('2026-10-14T19:59:59.5Z'),
          open: 99,
          high: 102,
          low: 98.5,
          close: 101.25,
          volume: 250000,
          dayAt: Date.parse('2026-10-14T04:00:00Z'),
        },
      },
    });
  });

  it('leaves out a symbol without a trade and reports a refusal', () => {
    expect(parseSnapshots('{"ABC":{"latestQuote":{"bp":1,"ap":2}}}')).toEqual({ data: {} });
    expect(parseSnapshots('{"message":"forbidden."}')).toEqual({ error: 'forbidden.' });
    expect(parseSnapshots('[]')).toEqual({ error: 'No snapshots in the answer' });
    expect(parseSnapshots('oops')).toEqual({ error: 'The answer was not JSON' });
  });

  it("names US stocks the way Alpaca does, and nothing else", () => {
    const def = (ticker: string, cls = 'equity') => ({ id: ticker, ticker, cls }) as unknown as SecurityDef;
    expect(alpacaSymbol(def('AAPL US'))).toBe('AAPL');
    expect(alpacaSymbol(def('BRK/B US'))).toBe('BRK.B');
    expect(alpacaSymbol(def('ASML NA'))).toBeNull();
    expect(alpacaSymbol(def('BTC USD', 'crypto'))).toBeNull();
  });
});
