import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { KRAKEN_PAIRS, krakenHandedBack, resetKrakenHandBack, startKraken, whenKrakenHandsBack } from '../src/data/live/kraken';

// Kraken's ticker answers while its daily candles fail: the prices still show. Its own file, so the engine
// starts with no history for any line.

const doge = KRAKEN_PAIRS.find((p) => p.pair === 'XDGUSD')!;
const ticker = JSON.stringify({
  error: [],
  result: {
    XDGUSD: { a: ['0.084283200', '1', '1'], b: ['0.084279900', '1', '1'], c: ['0.084274000', '10'], v: ['52034741.5', '6e7'], p: ['0.0830', '0.083'], t: [1000, 1200], l: ['0.079967900', '0.0799'], h: ['0.085135000', '0.0851'], o: '0.082124900' },
  },
});

describe('Kraken without its daily candles', () => {
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

  it('shows ticker prices when the daily candles fail, and fetches the candles again later', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-10-13T23:30:00Z'));
    const day = Date.parse('2026-10-13T00:00:00Z') / 1000;
    let candles = 0;
    let fail = true;
    stub(async (kind, arg) => {
      if (kind === 'ohlc') {
        candles++;
        if (fail) throw new Error('HTTP 520');
        return { status: 200, text: JSON.stringify({ error: [], result: { [arg]: [[day - 86_400, '0.08', '0.083', '0.079', '0.0821249', '0.081', '10', 5], [day, '0.0821249', '0.085135', '0.0799679', '0.084274', '0.083', '12', 6]], last: day } }) };
      }
      return { status: 200, text: ticker, serverTime: Date.now() };
    });
    let taken = 0;
    whenKrakenHandsBack(() => taken++);
    expect(engine.isExternal(doge.id)).toBe(false);
    const stop = startKraken();
    await vi.advanceTimersByTimeAsync(1);
    // Every candle request failed, yet the ticker's price is on screen; the change waits for the candles.
    const q = engine.quote(doge.id)!;
    expect(q.last).toBeCloseTo(0.084274, 9);
    expect(Number.isFinite(q.chg)).toBe(false);
    expect(krakenHandedBack()).toBeNull();
    expect(taken).toBe(0);
    // A minute on, the candles are asked for again and the previous close comes from them.
    fail = false;
    const before = candles;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(candles).toBeGreaterThan(before);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(engine.quote(doge.id)!.prevClose).toBeCloseTo(0.0821249, 9);
    stop();
  });
});
