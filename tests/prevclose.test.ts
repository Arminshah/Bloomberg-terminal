import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { choosePrevClose } from '../src/data/engine';
import { cleanBar, extQuote } from '../src/data/live/yahoo';

// Yahoo Finance quotes and daily bars captured on 13 Oct 2026 around 09:00 UTC.

describe('previous close: Yahoo field against the change it implies', () => {
  it('takes the reading that matches the daily bars', () => {
    // Hang Seng: the field is 9 Oct's close; the change is from 12 Oct's (24,271.20 in the bars).
    expect(choosePrevClose(24211.3, 24345.22 - 74.0215, 24271.19921875)).toBeCloseTo(24271.2, 2);
    // ASX 200: flat on the day (+0.70), not +67.30 from 9 Oct's close.
    expect(choosePrevClose(8716.6, 8783.9 - 0.7002, 8783.2001953125)).toBeCloseTo(8783.2, 2);
    // Dow: the field is rounded to one decimal; the change gives the exact close (+195.60).
    expect(choosePrevClose(51654.9, 51850.55 - 195.6016, 51654.94921875)).toBeCloseTo(51654.95, 2);
    // Bitcoin: here the change is the odd one out and the field matches the previous UTC day's bar.
    expect(choosePrevClose(81754.484, 83418.68 - 3.6797, 81762.5625)).toBe(81754.484);
  });

  it('gives no previous close when the readings disagree and the bars cannot decide', () => {
    // Lean hogs after the roll: the quote is December, the bars still October (75.05 on 9 Oct).
    expect(choosePrevClose(68.375, 68.35 - 0.5250015, 75.05000305175781)).toBeNaN();
    // Live cattle: neither reading is within 0.1% of the October bar.
    expect(choosePrevClose(226.6, 226.575 + 0.4750061, 224.975006103515)).toBeNaN();
    // No bars at all: two readings that disagree are not guessed between.
    expect(choosePrevClose(24211.3, 24271.2, NaN)).toBeNaN();
  });

  it('keeps readings that agree, and a single reading', () => {
    expect(choosePrevClose(100, 100.01, NaN)).toBe(100);
    expect(choosePrevClose(100, 100.01, 90)).toBe(100);
    expect(choosePrevClose(4287.98, undefined, 4300)).toBe(4287.98);
    expect(choosePrevClose(undefined, 7811.54, NaN)).toBe(7811.54);
    expect(choosePrevClose(undefined, undefined, 100)).toBeUndefined();
    expect(choosePrevClose(0, NaN, 100)).toBeUndefined();
  });
});

describe('daily changes on the real feed', () => {
  const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

  it('shows the Hang Seng up 74.02 (0.31%), not 133.92 from a stale previous close', () => {
    const id = 'HSI Index';
    engine.setExternalDaily(id, [
      { day: day('2026-10-08'), o: 24100, h: 24200, l: 23700, c: 23785.7890625, v: 0 },
      { day: day('2026-10-09'), o: 23800, h: 24300, l: 23780, c: 24211.349609375, v: 0 },
      { day: day('2026-10-12'), o: 24200, h: 24330, l: 24150, c: 24271.19921875, v: 0 },
    ]);
    const q = extQuote(
      { regularMarketPrice: 24345.22, regularMarketChange: 74.0215, regularMarketPreviousClose: 24211.3, regularMarketTime: 1_791_878_880, gmtOffSetMilliseconds: 28_800_000, marketState: 'POSTPOST', regularMarketDayHigh: 24345.22, regularMarketDayLow: 23987.77 },
      false,
    )!;
    engine.setExternalQuote(id, q);
    const out = engine.quote(id)!;
    expect(out.last).toBe(24345.22);
    expect(out.chg).toBeCloseTo(74.02, 2);
    expect(out.pct).toBeCloseTo(0.305, 3);
  });

  it('shows no change, rather than a wrong one, for lean hogs across the roll, and the quote day range', () => {
    const id = 'LH1 Comdty';
    engine.setExternalDaily(id, [
      { day: day('2026-10-08'), o: 76.625, h: 76.7, l: 75.75, c: 75.825, v: 7089 },
      { day: day('2026-10-09'), o: 75.275, h: 75.35, l: 74.975, c: 75.05000305175781, v: 5607 },
      { day: day('2026-10-12'), o: 75.625, h: 75.675, l: 75.075, c: 75.6, v: 5607 },
    ]);
    const q = extQuote(
      { regularMarketPrice: 68.35, regularMarketChange: 0.5250015, regularMarketPreviousClose: 68.375, regularMarketOpen: 68.1, regularMarketDayHigh: 69, regularMarketDayLow: 67.825, regularMarketTime: 1_791_828_240, gmtOffSetMilliseconds: -18_000_000, marketState: 'REGULAR' },
      false,
    )!;
    engine.setExternalQuote(id, q);
    const out = engine.quote(id)!;
    expect(out.last).toBe(68.35);
    expect(out.chg).toBeNaN();
    expect(out.pct).toBeNaN();
    // October's bar went up to 75.675; the December contract traded 67.825-69.00.
    expect(out.high).toBe(69);
    expect(out.low).toBe(67.825);
  });
});

describe('daily bars', () => {
  it('reads a zero or missing open, high or low as the close', () => {
    expect(cleanBar(80.43, 80.2, 81.07, 0)).toEqual([80.43, 80.2, 81.07, 80.2]);
    expect(cleanBar(80.43, null, null, null)).toEqual([80.43, 80.43, 80.43, 80.43]);
    // A high below the close is widened to hold it.
    expect(cleanBar(10, 9.5, 9.8, 9.4)).toEqual([10, 9.5, 10, 9.4]);
    // Negative prices are prices (WTI on 20 Apr 2020), not gaps.
    expect(cleanBar(-37.63, 17.73, 17.85, -40.32)).toEqual([-37.63, 17.73, 17.85, -40.32]);
  });
});
