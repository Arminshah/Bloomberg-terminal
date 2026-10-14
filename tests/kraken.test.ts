import { afterEach, describe, expect, it, vi } from 'vitest';
import * as krakenMain from '../electron/kraken.cjs';
import { engine } from '../src/data/market';
import { dailyBars, KRAKEN_PAIRS, krakenHandedBack, krakenOwns, krakenReason, parseDepth, parseOhlc, parseTicker, resetKrakenHandBack, startKraken, whenKrakenHandsBack } from '../src/data/live/kraken';
import { freshnessOf } from '../src/data/freshness';
import { dayNum } from '../src/data/calendar';

// Answers in the layout Kraken documents for its public REST API (Ticker, OHLC,
// Depth), with numbers of the kind it returned on 13 Oct 2026.

const btc = KRAKEN_PAIRS.find((p) => p.pair === 'XBTUSD')!;
const doge = KRAKEN_PAIRS.find((p) => p.pair === 'XDGUSD')!;

const ticker = JSON.stringify({
  error: [],
  result: {
    XXBTZUSD: { a: ['83190.70000', '1', '1.000'], b: ['83190.60000', '4', '4.000'], c: ['83190.70000', '0.00024045'], v: ['2873.56878613', '3200.1'], p: ['83030.86713', '82896.3'], t: [127600, 159727], l: ['80951.20000', '80951.2'], h: ['84053.10000', '84053.1'], o: '81737.20000' },
    XDGUSD: { a: ['0.084283200', '1', '1'], b: ['0.084279900', '1', '1'], c: ['0.084274000', '10'], v: ['52034741.5', '6e7'], p: ['0.0830', '0.083'], t: [1000, 1200], l: ['0.079967900', '0.0799'], h: ['0.085135000', '0.0851'], o: '0.082124900' },
  },
});

describe('Kraken requests (main process)', () => {
  it('builds only the requests the app makes', () => {
    expect(krakenMain.krakenUrl('ticker', 'XBTUSD,ETHUSD')).toBe('https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD');
    expect(krakenMain.krakenUrl('ohlc', 'XBTUSD', 1440)).toBe('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440');
    expect(krakenMain.krakenUrl('depth', 'XDGUSD', 15)).toBe('https://api.kraken.com/0/public/Depth?pair=XDGUSD&count=15');
    expect(krakenMain.krakenUrl('ticker', 'XBTUSD,EVIL')).toBeNull();
    expect(krakenMain.krakenUrl('ohlc', 'XBTUSD', 7)).toBeNull();
    expect(krakenMain.krakenUrl('depth', 'XBTUSD', 500)).toBeNull();
    expect(krakenMain.krakenUrl('depth', 'XBTUSD&x=1', 5)).toBeNull();
    expect(krakenMain.krakenUrl('AddOrder', 'XBTUSD')).toBeNull();
    expect(krakenMain.PER_SECOND).toBe(1);
  });

  it('reads Kraken errors from the body and sorts them', () => {
    expect(krakenMain.krakenErrors('{"error":["EGeneral:Too many requests"],"result":{}}')).toEqual(['EGeneral:Too many requests']);
    expect(krakenMain.krakenErrorKind(['EGeneral:Too many requests'])).toBe('rate-limited');
    expect(krakenMain.krakenErrorKind(['EQuery:Unknown asset pair'])).toBe('no-data');
    expect(krakenMain.krakenErrors('<html>')).toEqual(['The answer was not JSON']);
    expect(krakenMain.krakenErrorKind(krakenMain.krakenErrors('<html>'))).toBe('schema-changed');
    expect(krakenMain.krakenErrors('{"error":[],"result":{}}')).toEqual([]);
  });

  it('covers every crypto line the app lists', () => {
    expect(KRAKEN_PAIRS.map((p) => p.pair).sort()).toEqual([...krakenMain.KRAKEN_PAIRS].sort());
  });
});

describe('Kraken answers', () => {
  it('reads tickers under the names Kraken answers with', () => {
    const t = parseTicker(ticker);
    expect(t.get(btc.id)).toEqual({ last: 83190.7, bid: 83190.6, ask: 83190.7, open: 81737.2, high: 84053.1, low: 80951.2, volume: 2873.56878613, vwap: 83030.86713, trades: 127600 });
    expect(t.get(doge.id)!.last).toBe(0.084274);
    expect(t.has('XETUSD Curncy')).toBe(false);
    expect(parseTicker('nope').size).toBe(0);
  });

  it('reads daily candles by UTC day, the last one still forming', () => {
    const ohlc = JSON.stringify({
      error: [],
      result: {
        XXBTZUSD: [
          [1791763200, '83675.6', '84250.0', '81635.7', '81737.1', '83060.6', '2372.632', 147841],
          [1791849600, '81737.2', '84053.1', '80951.2', '83134.6', '83095.7', '2875.452', 146409],
          [1791849600, 'bad', '1', '1', '1', '1', '1', 1],
        ],
        last: 1791763200,
      },
    });
    const bars = parseOhlc(ohlc, btc);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ t: 1791763200_000, c: 81737.1, v: 2372.632, count: 147841 });
    const days = dailyBars(bars);
    expect(days.map((b) => new Date(b.day * 86_400_000).toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('reads the order book best first, with each level\'s time', () => {
    const depth = JSON.stringify({
      error: [],
      result: {
        XXBTZUSD: {
          asks: [['83135.30000', '0.924', 1791933844], ['83134.70000', '1.124', 1791933852]],
          bids: [['83134.40000', '0.001', 1791933832], ['83134.60000', '0.483', 1791933852]],
        },
      },
    });
    const book = parseDepth(depth, btc)!;
    expect(book.asks.map((l) => l.price)).toEqual([83134.7, 83135.3]);
    expect(book.bids.map((l) => l.price)).toEqual([83134.6, 83134.4]);
    expect(book.bids[0]).toEqual({ price: 83134.6, volume: 0.483, time: 1791933852_000 });
    expect(parseDepth('{"error":[],"result":{}}', btc)).toBeNull();
  });
});

describe('Kraken lines in the engine', () => {
  it('takes the previous close from the previous daily candle, verified, and labels the line by exchange', () => {
    const id = btc.id;
    const bars = parseOhlc(
      JSON.stringify({ error: [], result: { XXBTZUSD: [[1791763200, '83675.6', '84250.0', '81635.7', '81737.1', '83060.6', '2372.6', 1], [1791849600, '81737.2', '84053.1', '80951.2', '83134.6', '83095.7', '2875.4', 1]] } }),
      btc,
    );
    engine.setExternalDaily(id, dailyBars(bars), { provider: 'Kraken' });
    const at = Date.parse('2026-10-13T19:32:21Z');
    const t = parseTicker(ticker).get(id)!;
    engine.setExternalQuote(id, { last: t.last, prevClose: 81737.1, full: true, open: t.open, high: t.high, low: t.low, volume: t.volume, volumeUnit: 'BTC', time: at, day: dayNum(at), bid: t.bid, ask: t.ask, marketOpen: true, timing: 'realtime', sourceName: 'Kraken exchange', tz: 'UTC' });
    const q = engine.quote(id)!;
    expect(q.prevClose).toBe(81737.1);
    expect(q.chgCheck).toBe('verified');
    expect(q.chg).toBeCloseTo(83190.7 - 81737.1, 6);
    expect(q.provider).toBe('Kraken');
    expect(q.volumeUnit).toBe('BTC');
    expect(q.session).toBe('open');
    expect(freshnessOf(q, { cls: 'crypto' }, at + 6_000)!.label).toBe('REAL-TIME');
    // A snapshot that stops coming goes stale after the crypto threshold.
    expect(freshnessOf(q, { cls: 'crypto' }, at + 11 * 60_000)!.label).toBe('STALE');
  });

  it('starts a new UTC day without carrying an old close as verified', () => {
    const id = btc.id;
    const next = Date.parse('2026-10-14T00:00:05Z');
    // The candles still end on 13 Oct: the service passes no previous close until it has reloaded them.
    engine.setExternalQuote(id, { last: 83200, full: true, open: 83190.7, high: 83200, low: 83190, volume: 1, time: next, day: dayNum(next), marketOpen: true, timing: 'realtime' });
    const q = engine.quote(id)!;
    expect(q.prevClose).toBeCloseTo(83190.7, 6);
    expect(q.chgCheck).toBe('unverified');
  });
});

describe('CoinGecko market values', () => {
  it('reads market cap and supply for the listed coins only, as reference figures', async () => {
    const { parseMarkets, COINGECKO_IDS } = await import('../src/data/live/coingecko');
    const text = JSON.stringify([
      { id: 'bitcoin', symbol: 'btc', current_price: 83190, market_cap: 1_655_000_000_000, circulating_supply: 19_930_000, total_volume: 41_000_000_000, last_updated: '2026-10-13T23:20:00.000Z' },
      { id: 'dogecoin', symbol: 'doge', market_cap: 0, circulating_supply: null, total_volume: 900_000_000, last_updated: 'bad' },
      { id: 'not-listed', market_cap: 5 },
    ]);
    const out = parseMarkets(text);
    expect(Object.keys(out).sort()).toEqual(['DOGEUSD Curncy', 'XBTUSD Curncy']);
    expect(out['XBTUSD Curncy']).toEqual({ marketCap: 1_655_000_000_000, supply: 19_930_000, volume24h: 41_000_000_000, updated: Date.parse('2026-10-13T23:20:00.000Z') });
    // Missing or zero figures stay missing; nothing is filled in.
    expect(out['DOGEUSD Curncy'].marketCap).toBeNaN();
    expect(out['DOGEUSD Curncy'].supply).toBeNaN();
    expect(parseMarkets('{"error":"x"}')).toEqual({});
    expect(Object.keys(COINGECKO_IDS)).toHaveLength(KRAKEN_PAIRS.length);
  });
});

describe('Kraken hand-back to another source', () => {
  type Answer = { status: number; text: string; serverTime?: number };
  const g = globalThis as { window?: unknown };
  const stub = (kraken: (kind: string, arg: string, n?: number) => Promise<Answer>) => {
    g.window = { arminDesktop: { kraken, settings: {} } };
  };
  afterEach(() => {
    vi.useRealTimers();
    resetKrakenHandBack();
    delete g.window;
  });

  it('says why an answer carries no prices', () => {
    expect(krakenReason({ status: 0, text: '' })).toBe('no answer');
    expect(krakenReason({ status: 403, text: '' })).toBe('HTTP 403');
    expect(krakenReason({ status: 200, text: JSON.stringify({ error: ['EGeneral:Too many requests'] }) })).toBe('EGeneral:Too many requests');
    expect(krakenReason({ status: 200, text: JSON.stringify({ error: [], result: {} }) })).toBe('no prices in the answer');
    expect(krakenReason({ status: 200, text: '<html>blocked</html>' })).toBe('an answer that is not JSON');
  });

  it('gives the crypto lines up at once when neither candles nor a ticker ever answer', async () => {
    stub(async () => {
      throw new Error('HTTP 403');
    });
    let taken = 0;
    whenKrakenHandsBack(() => taken++);
    expect(krakenOwns(btc.id)).toBe(true);
    const stop = startKraken();
    await vi.waitFor(() => expect(krakenHandedBack()).toBe('HTTP 403'));
    expect(taken).toBe(1);
    expect(krakenOwns(btc.id)).toBe(false);
    stop();
  });

  it('waits for three failed tickers when the candles loaded', async () => {
    vi.useFakeTimers();
    const day = Date.parse('2026-10-13T00:00:00Z') / 1000;
    const ohlc = (pair: string) => JSON.stringify({ error: [], result: { [pair]: [[day - 86_400, '1', '2', '0.5', '1.5', '1.2', '10', 5], [day, '1.5', '2', '1', '1.8', '1.6', '12', 6]], last: day } });
    let tickers = 0;
    stub(async (kind, arg) => {
      if (kind === 'ohlc') return { status: 200, text: ohlc(arg) };
      tickers++;
      return { status: 503, text: '' };
    });
    let taken = 0;
    whenKrakenHandsBack(() => taken++);
    const stop = startKraken();
    await vi.advanceTimersByTimeAsync(1);
    expect(tickers).toBe(1);
    expect(krakenHandedBack()).toBeNull();
    // Retries back off: 10 s, then 20 s.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tickers).toBe(2);
    expect(krakenHandedBack()).toBeNull();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tickers).toBe(3);
    expect(krakenHandedBack()).toBe('HTTP 503');
    expect(taken).toBe(1);
    stop();
  });

  it('keeps the lines, marked stale, once a ticker has answered in the session', async () => {
    vi.useFakeTimers();
    let tickers = 0;
    stub(async (kind) => {
      if (kind === 'ohlc') throw new Error('HTTP 429');
      tickers++;
      return tickers === 1 ? { status: 200, text: ticker, serverTime: Date.parse('2026-10-13T23:30:00Z') } : { status: 0, text: '' };
    });
    let taken = 0;
    whenKrakenHandsBack(() => taken++);
    const stop = startKraken();
    await vi.advanceTimersByTimeAsync(1);
    expect(tickers).toBe(1);
    // Five failures after that first answer: the lines stay with Kraken.
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(60_000);
    expect(tickers).toBeGreaterThanOrEqual(5);
    expect(krakenHandedBack()).toBeNull();
    expect(taken).toBe(0);
    expect(krakenOwns(btc.id)).toBe(true);
    stop();
  });
});
