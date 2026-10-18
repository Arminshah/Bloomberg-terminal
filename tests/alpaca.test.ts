import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as alpacaMain from '../electron/alpaca.cjs';
import { alpacaSymbol, alpacaTime, iexFreshness, parseSnapshots } from '../src/data/live/alpaca';
import type { KeyedAnswer } from '../src/data/live/lookup';
import type { SecurityDef } from '../src/data/types';

// Made-up answers in the layout of Alpaca's snapshots endpoint; no request leaves the test.

describe('Alpaca requests (main process)', () => {
  it('asks only the market data host, for the IEX feed', () => {
    expect(alpacaMain.alpacaRequest('snapshots', 'AAPL,BRK.B')).toBe('https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL,BRK.B&feed=iex');
    const url = new URL(alpacaMain.alpacaRequest('snapshots', 'AAPL')!);
    expect(url.host).toBe('data.alpaca.markets');
    expect(alpacaMain.TRADING_HOSTS).not.toContain(url.host);
    expect(alpacaMain.alpacaRequest('snapshots', 'BRK.B,AAPL,AAPL')).toBe(alpacaMain.alpacaRequest('snapshots', 'AAPL,BRK.B'));
  });

  it('builds nothing else: no orders, accounts or positions, no odd symbols', () => {
    for (const kind of ['orders', 'account', 'positions', 'trades', '']) expect(alpacaMain.alpacaRequest(kind, 'AAPL')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', 'aapl')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', 'AAPL&feed=sip')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', '')).toBeNull();
    expect(alpacaMain.alpacaRequest('snapshots', ',AAPL')).toBeNull();
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
    expect(alpacaTime('0001-01-01T00:00:00Z')).toBeNaN();
    expect(alpacaTime('2026-10-14')).toBeNaN();
    expect(alpacaTime('2026-02-31T15:00:00Z')).toBeNaN();
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
          prevOpen: 98,
          prevHigh: 99.5,
          prevLow: 97,
          prevClose: 99.1,
          prevVolume: 210000,
          prevDayAt: Date.parse('2026-10-13T04:00:00Z'),
        },
      },
    });
  });

  it('leaves out a symbol without a trade and reports a refusal', () => {
    expect(parseSnapshots('{"ABC":{"latestQuote":{"bp":1,"ap":2}}}')).toEqual({ data: {} });
    expect(parseSnapshots('{"message":"forbidden."}')).toEqual({ error: 'forbidden.' });
    expect(parseSnapshots('[]')).toEqual({ error: 'No snapshots in the answer' });
    expect(parseSnapshots('oops')).toEqual({ error: 'The answer was not JSON' });
    expect(parseSnapshots('{"snapshots":[]}')).toEqual({ error: 'No snapshots in the answer' });
  });

  it('keeps timed quotes without trades and rejects zero/invalid fields independently', () => {
    const parsed = parseSnapshots(JSON.stringify({ snapshots: {
      ABC: {
        latestTrade: { p: 'Infinity', s: -1, t: '2026-10-14T15:00:00Z' },
        latestQuote: { bp: 0, bs: -2, ap: 101.5, as: '3', t: '2026-10-14T15:01:00Z' },
        dailyBar: { o: 100, h: 103, l: 99, c: 102, v: 1000, t: '0001-01-01T00:00:00Z' },
      },
      UNTIMED: { latestTrade: { p: 10 }, latestQuote: { bp: 10, ap: 11 } },
      ZERO: { latestTrade: { p: 0, t: '2026-10-14T15:01:00Z' } },
    } }));
    expect('data' in parsed).toBe(true);
    if (!('data' in parsed)) return;
    expect(Object.keys(parsed.data)).toEqual(['ABC']);
    expect(parsed.data.ABC).toMatchObject({ last: NaN, lastAt: NaN, bid: NaN, bidSize: NaN, ask: 101.5, askSize: 3, quoteAt: Date.parse('2026-10-14T15:01:00Z'), open: NaN, volume: NaN });
  });

  it('measures trade and quote age using independent exchange timestamps', () => {
    const now = Date.parse('2026-10-14T15:01:00Z');
    const parsed = parseSnapshots(JSON.stringify({ ABC: {
      latestTrade: { p: 100, t: '2026-10-13T19:59:00Z' },
      latestQuote: { bp: 100, ap: 101, t: '2026-10-14T15:01:00Z' },
    } }));
    if (!('data' in parsed)) throw new Error(parsed.error);
    expect(iexFreshness(parsed.data.ABC, now)).toEqual({ tradeStale: true, quoteStale: false });
    expect(iexFreshness(parsed.data.ABC, now + 60_001)).toEqual({ tradeStale: true, quoteStale: true });
    expect(iexFreshness(parsed.data.ABC, now - 10_000)).toEqual({ tradeStale: true, quoteStale: true });
  });

  it("names US stocks the way Alpaca does, and nothing else", () => {
    const def = (ticker: string, cls = 'equity') => ({ id: ticker, ticker, cls }) as unknown as SecurityDef;
    expect(alpacaSymbol(def('AAPL US'))).toBe('AAPL');
    expect(alpacaSymbol(def('BRK/B US'))).toBe('BRK.B');
    expect(alpacaSymbol(def('ASML NA'))).toBeNull();
    expect(alpacaSymbol(def('BTC USD', 'crypto'))).toBeNull();
  });
});

describe('Alpaca subscriptions and polling', () => {
  let feed: typeof import('../src/data/live/alpaca');
  let request: ReturnType<typeof vi.fn<(kind: string, symbols: string) => Promise<KeyedAnswer>>>;
  let release: (() => void)[];
  const response = (symbols: string): KeyedAnswer => ({ status: 200, at: Date.now(), text: JSON.stringify(Object.fromEntries(symbols.split(',').map((symbol) => [symbol, {
    latestTrade: { p: 100, s: 1, t: new Date(Date.now() - 600_000).toISOString() },
    latestQuote: { bp: 99, bs: 1, ap: 101, as: 1, t: new Date().toISOString() },
  }]))) });

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T15:01:00Z'));
    request = vi.fn(async (_kind: string, symbols: string) => response(symbols));
    vi.stubGlobal('window', { arminDesktop: { alpaca: request } });
    feed = await import('../src/data/live/alpaca');
    release = [];
  });

  afterEach(() => {
    for (const stop of release) stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls every subscribed symbol beyond the twenty-symbol batch and follows fresh quotes', async () => {
    for (let i = 0; i < 25; i++) release.push(feed.acquireIex(`T${i}`));
    await vi.advanceTimersByTimeAsync(50);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].split(',')).toHaveLength(20);
    // The trade is ten minutes old, but the quote is current: keep the five-second cadence.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].split(',')).toContain('T24');
    expect(Object.values(feed.iex.get().by).every((state) => state.state === 'ok')).toBe(true);
  });

  it('reports a missing key to all subscribers, including those outside the current batch', async () => {
    request.mockResolvedValue({ status: 0, text: '', missing: 'ALPACA_API_KEY_ID' });
    for (let i = 0; i < 25; i++) release.push(feed.acquireIex(`T${i}`));
    await vi.advanceTimersByTimeAsync(50);
    expect(Object.values(feed.iex.get().by).every((state) => state.state === 'needs-key')).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledTimes(1);
    request.mockImplementation(async (_kind, symbols) => response(symbols));
    feed.retryIex();
    await vi.advanceTimersByTimeAsync(50);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('refreshes visible quotes every batch while making progress through background symbols', async () => {
    for (let i = 0; i < 60; i++) release.push(feed.acquireIex(`T${i}`));
    release.push(feed.acquireIex('T59', true), feed.acquireIex('AAPL', true));
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(15_000);
    const batches = request.mock.calls.map((call) => call[1].split(','));
    expect(batches).toHaveLength(4);
    for (const batch of batches) {
      expect(batch).toContain('T59');
      expect(batch).toContain('AAPL');
      expect(batch).toHaveLength(20);
      expect(new Set(batch).size).toBe(20);
    }
    expect(new Set(batches.flat()).size).toBe(61);
  });

  it('rotates excess visible panels fairly and releases foreground priority independently', async () => {
    for (let i = 0; i < 40; i++) release.push(feed.acquireIex(`T${i}`));
    for (let i = 0; i < 25; i++) release.push(feed.acquireIex(`F${i}`, true));
    const stopVisible = feed.acquireIex('T39', true);
    release.push(stopVisible);
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(new Set(request.mock.calls.flatMap((call) => call[1].split(',').filter((s) => s.startsWith('F')))).size).toBe(25);
    expect(request.mock.calls.every((call) => call[1].split(',').some((s) => s.startsWith('T') && s !== 'T39'))).toBe(true);
    stopVisible();
    stopVisible();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(feed.iex.get().by.T39.state).toBe('ok'); // Background owner remains after the panel closes.
    expect(new Set(request.mock.calls.flatMap((call) => call[1].split(','))).size).toBe(65);
  });

  it('returns a closed quote panel to background rotation without removing its engine subscription', async () => {
    for (let i = 0; i < 40; i++) release.push(feed.acquireIex(`T${i}`));
    const stopVisible = feed.acquireIex('T39', true);
    release.push(stopVisible);
    await vi.advanceTimersByTimeAsync(50);
    expect(request.mock.calls[0][1].split(',')).toContain('T39');
    stopVisible();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(request.mock.calls[1][1].split(',')).not.toContain('T39');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(request.mock.calls[2][1].split(',')).toContain('T39');
  });

  it('keeps the cached-response failure reason and backs off refreshes', async () => {
    request.mockImplementation(async (_kind, symbols) => ({ ...response(symbols), stale: true, error: 'HTTP 429: too many requests' }));
    release.push(feed.acquireIex('AAPL'));
    await vi.advanceTimersByTimeAsync(50);
    expect(feed.iex.get().by.AAPL).toMatchObject({ state: 'ok', stale: true, message: 'HTTP 429: too many requests' });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('immediately follows a pending response when another stock is added', async () => {
    let finish!: (answer: KeyedAnswer) => void;
    request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    release.push(feed.acquireIex('AAPL'));
    await vi.advanceTimersByTimeAsync(50);
    release.push(feed.acquireIex('MSFT'));
    finish(response('AAPL'));
    await vi.advanceTimersByTimeAsync(50);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toContain('MSFT');
  });

  it('keeps a shared symbol until its final consumer releases it', async () => {
    const stopFirst = feed.acquireIex('AAPL');
    const stopLast = feed.acquireIex('AAPL');
    release.push(stopFirst, stopLast);
    stopFirst();
    stopFirst(); // A cleanup is idempotent.
    await vi.advanceTimersByTimeAsync(50);
    expect(request).toHaveBeenCalledTimes(1);
    stopLast();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
