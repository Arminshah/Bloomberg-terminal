import { describe, expect, it } from 'vitest';
import { rangeStats } from '../src/data/analytics';
import { dayNum, DAY_MS } from '../src/data/calendar';
import { engine } from '../src/data/market';

const id = 'LLY US Equity';
const day = dayNum(Date.parse('2026-10-29T00:00:00Z'));
const quote = { day, time: day * DAY_MS + 15 * 3_600_000, last: 105, open: 100, high: 110, low: 98, volume: 1_000_000, marketOpen: true, full: true, sessionKnown: true };
const history = () => [
  { day: day - 2, o: 100, h: 120, l: 95, c: 100, v: 1_000_000 },
  { day: day - 1, o: 100, h: 115, l: 96, c: 100, v: 1_000_000 },
  { day, o: 100, h: 110, l: 98, c: 105, v: 1_000_000 },
];

describe('same-session quote corrections', () => {
  it('removes superseded extrema and restores the actual extreme dates without a history rebuild', () => {
    engine.setExternalDaily(id, history(), { provider: 'Yahoo Finance' });
    engine.setExternalQuote(id, { ...quote, high: 200, low: 40 });
    const version = engine.version;
    const original = rangeStats(id);
    expect(original).toMatchObject({ hi52: 200, lo52: 40, hi52t: day * DAY_MS, lo52t: day * DAY_MS });

    engine.setExternalQuote(id, { ...quote, time: quote.time + 1_000 });
    expect(engine.version).toBe(version);
    expect(rangeStats(id)).toMatchObject({ hi52: 120, lo52: 95, hi52t: (day - 2) * DAY_MS, lo52t: (day - 2) * DAY_MS });
    expect(original).toMatchObject({ hi52: 200, lo52: 40 });

    engine.setExternalQuote(id, { ...quote, time: quote.time + 2_000, high: 130, low: 90 });
    expect(rangeStats(id)).toMatchObject({ hi52: 130, lo52: 90, hi52t: day * DAY_MS, lo52t: day * DAY_MS });
  });

  it('recomputes forming-session return volatility when the current close changes', () => {
    engine.setExternalDaily(id, history(), { provider: 'Yahoo Finance' });
    engine.setExternalQuote(id, quote);
    const before = rangeStats(id).vol30;
    const version = engine.version;
    engine.setExternalQuote(id, { ...quote, time: quote.time + 1_000, last: 107 });
    expect(engine.version).toBe(version);
    expect(Number.isFinite(before)).toBe(true);
    expect(rangeStats(id).vol30).not.toBe(before);
  });
});
