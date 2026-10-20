import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { choosePrevClose, resolvePrevClose } from '../src/data/engine';
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

  it('keeps readings that agree when there is no bar to check, and a single reading the bar confirms', () => {
    expect(resolvePrevClose(100, 100.01, NaN)).toEqual({ value: 100, verified: false });
    expect(resolvePrevClose(undefined, 7811.54, NaN)).toEqual({ value: 7811.54, verified: false });
    expect(resolvePrevClose(4287.98, undefined, 4287.98)).toEqual({ value: 4287.98, verified: true });
    expect(resolvePrevClose(undefined, undefined, 100)).toBeUndefined();
    expect(resolvePrevClose(0, NaN, 100)).toBeUndefined();
  });

  it("takes a future's settlement over the bar's last trade, and the new contract's after a roll", () => {
    // COMEX silver on 20 Oct 2026: settled 57.273 on the 19th; Yahoo's bar for the 19th closed at 56.974.
    expect(resolvePrevClose(57.273, undefined, 56.974, undefined, { before: 56.995, futures: true })).toEqual({ value: 57.273, verified: true, settlement: true });
    // WTI after the roll: December settled 98.54; the bar for the 19th is November's 103.66.
    expect(resolvePrevClose(98.54, undefined, 103.66, undefined, { before: 101.41, futures: true })?.value).toBe(98.54);
    // A field that lags a session (it is the close before the previous one) is not a settlement: the bar is used.
    expect(resolvePrevClose(101.41, undefined, 103.66, undefined, { before: 101.41, futures: true })).toEqual({ value: 103.66, verified: true });
    // Readings that disagree with each other still give none (lean hogs after the roll), and nor does a far one.
    expect(resolvePrevClose(68.375, 68.35 - 0.5250015, 75.05, undefined, { before: 74, futures: true })?.value).toBeNaN();
    expect(resolvePrevClose(50, undefined, 103.66, undefined, { before: 101.41, futures: true })?.value).toBeNaN();
    // Not a future: no settlement is assumed.
    expect(resolvePrevClose(57.273, undefined, 56.974, undefined, { before: 56.995 })?.value).toBeNaN();
  });

  it("uses the previous bar when the source's field lags a session", () => {
    // Shanghai Composite on 20 Oct 2026: the field 3,716.28 is 16 Oct's close; 19 Oct closed at 3,730.92.
    expect(resolvePrevClose(3716.28, undefined, 3730.919921875, undefined, { before: 3716.283935546875 })).toEqual({ value: 3730.919921875, verified: true });
    // Without the bar before, nothing says the field lags.
    expect(resolvePrevClose(3716.28, undefined, 3730.919921875)?.value).toBeNaN();
  });

  it('gives no previous close when the bars contradict every reading, however many agree', () => {
    expect(choosePrevClose(100, 100.01, 90)).toBeNaN();
    // A single stale reading (two sessions old) is not used against the bar.
    expect(choosePrevClose(24211.3, undefined, 24271.19921875)).toBeNaN();
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

// The cases section 2 of the brief lists. Each line has its own instrument, so no case leans on another's state.
describe('previous close across sessions', () => {
  const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const at = (iso: string) => Date.parse(iso) / 1000;
  const bar = (iso: string, c: number) => ({ day: day(iso), o: c, h: c, l: c, c, v: 0 });
  /** A Yahoo v7 quote as the poll returns it. */
  const yq = (o: { price: number; change?: number | null; prev?: number; time: string; off: number; state?: string; delay?: number; source?: string }) => ({
    regularMarketPrice: o.price,
    regularMarketChange: o.change,
    regularMarketPreviousClose: o.prev,
    regularMarketTime: at(o.time),
    gmtOffSetMilliseconds: o.off * 3_600_000,
    marketState: o.state ?? 'REGULAR',
    exchangeDataDelayedBy: o.delay ?? 0,
    quoteSourceName: o.source ?? 'Delayed Quote',
  });
  const poll = (id: string, json: Record<string, unknown>, allDays = false) => engine.setExternalQuote(id, extQuote(json, false, allDays)!);

  it('a normal trading day: the change is against the previous session, verified, with its date', () => {
    const id = 'SPX Index';
    engine.setExternalDaily(id, [bar('2026-10-08', 7790.12), bar('2026-10-09', 7811.54), bar('2026-10-12', 7800)]);
    poll(id, yq({ price: 7807.24, change: -4.2998, prev: 7811.54, time: '2026-10-12T20:35:00Z', off: -4, state: 'POST' }));
    const q = engine.quote(id)!;
    expect(q.chg).toBeCloseTo(-4.3, 2);
    expect(q.pct).toBeCloseTo(-0.055, 3);
    expect(q.chgCheck).toBe('verified');
    expect(q.prevCloseDay).toBe(day('2026-10-09'));
  });

  it('an Asian market that has closed while Europe and the US trade keeps its own session and change', () => {
    const id = 'AS51 Index';
    engine.setExternalDaily(id, [bar('2026-10-09', 8716.6), bar('2026-10-12', 8783.2001953125), bar('2026-10-13', 8783.9)]);
    // The same closing quote, polled at 09:00, 14:00 and 20:00 UTC: the field is still 9 Oct's close.
    for (const fetched of ['09:00', '14:00', '20:00']) {
      poll(id, yq({ price: 8783.9, change: 0.7002, prev: 8716.6, time: '2026-10-13T05:57:00Z', off: 11, state: 'POSTPOST', delay: 20 }));
      const q = engine.quote(id)!;
      expect(q.chg, fetched).toBeCloseTo(0.7, 2);
      expect(q.pct, fetched).toBeCloseTo(0.008, 3);
      expect(q.chgCheck).toBe('verified');
      expect(q.prevCloseDay).toBe(day('2026-10-12'));
      expect(q.src).toBe('CLOSE');
      expect(q.time).toBe(Date.parse('2026-10-13T05:57:00Z'));
    }
    expect(engine.daily(id).length).toBeGreaterThan(0);
    expect(engine.daily(id).t[engine.daily(id).length - 1]).toBe(day('2026-10-13') * 86_400_000);
  });

  it('the first trading day after a weekend is measured against Friday', () => {
    const id = 'DAX Index';
    engine.setExternalDaily(id, [bar('2026-10-08', 25010.5), bar('2026-10-09', 25087.27)]);
    // Monday's first quote opens a new session on the Friday bars.
    poll(id, yq({ price: 25277.68, change: 190.41, prev: 25087.27, time: '2026-10-12T16:00:00Z', off: 2 }));
    const q = engine.quote(id)!;
    expect(q.chg).toBeCloseTo(190.41, 2);
    expect(q.chgCheck).toBe('verified');
    expect(q.prevCloseDay).toBe(day('2026-10-09'));
    expect(engine.daily(id).t[engine.daily(id).length - 1]).toBe(day('2026-10-12') * 86_400_000);
  });

  it('a market holiday: Friday stays the latest session, and the next day is measured against Friday', () => {
    const id = 'NKY Index';
    engine.setExternalDaily(id, [bar('2026-10-08', 69042.1), bar('2026-10-09', 69030.92)]);
    // Monday 12 Oct is a Tokyo holiday: the source still gives Friday's quote.
    poll(id, yq({ price: 69030.92, change: -11.18, prev: 69042.1, time: '2026-10-09T06:45:00Z', off: 9, state: 'CLOSED' }));
    let q = engine.quote(id)!;
    expect(q.chg).toBeCloseTo(-11.18, 2);
    expect(q.prevCloseDay).toBe(day('2026-10-08'));
    expect(q.time).toBe(Date.parse('2026-10-09T06:45:00Z'));
    // Tuesday's session: against Friday's close, not a Monday that never traded.
    poll(id, yq({ price: 67777.52, change: -1253.3984, prev: 69030.92, time: '2026-10-13T06:45:00Z', off: 9, state: 'POSTPOST' }));
    q = engine.quote(id)!;
    expect(q.chg).toBeCloseTo(-1253.4, 2);
    expect(q.pct).toBeCloseTo(-1.816, 3);
    expect(q.chgCheck).toBe('verified');
    expect(q.prevCloseDay).toBe(day('2026-10-09'));
  });

  it('an outdated cached previous close is never carried into the next session', () => {
    const id = 'SX5E Index';
    engine.setExternalDaily(id, [bar('2026-10-09', 6173.37), bar('2026-10-12', 6201.21)]);
    poll(id, yq({ price: 6201.21, change: 27.84, prev: 6173.37, time: '2026-10-12T15:50:00Z', off: 2, state: 'POSTPOST' }));
    expect(engine.quote(id)!.prevCloseDay).toBe(day('2026-10-09'));
    // Tuesday's first streamed price carries no previous close: Monday's close is used, marked unverified.
    engine.setExternalQuote(id, { last: 6214.92, time: Date.parse('2026-10-13T07:05:00Z'), day: day('2026-10-13'), marketOpen: true });
    let q = engine.quote(id)!;
    expect(q.prevClose).toBeCloseTo(6201.21, 2);
    expect(q.prevCloseDay).toBe(day('2026-10-12'));
    expect(q.chgCheck).toBe('unverified');
    // The next full quote confirms it.
    poll(id, yq({ price: 6214.92, change: 13.71, prev: 6201.21, time: '2026-10-13T08:45:00Z', off: 2 }));
    q = engine.quote(id)!;
    expect(q.chg).toBeCloseTo(13.71, 2);
    expect(q.chgCheck).toBe('verified');
  });

  it('a source field a session behind the bars gives the change against the previous bar', () => {
    const id = 'SHCOMP Index';
    engine.setExternalDaily(id, [bar('2026-10-09', 3813.791015625), bar('2026-10-12', 3797.241943359375)]);
    // Only the field, and it is 9 Oct's close: the bars say 12 Oct closed at 3797.24.
    poll(id, yq({ price: 3800.8645, change: null, prev: 3813.79, time: '2026-10-13T07:00:00Z', off: 8, state: 'POSTPOST' }));
    const q = engine.quote(id)!;
    expect(q.chg).toBeCloseTo(3.6226, 3);
    expect(q.chgCheck).toBe('verified');
    expect(q.prevCloseDay).toBe(day('2026-10-12'));
  });

  it('a stale field that matches no bar gives no change rather than a wrong one', () => {
    const id = 'SHCOMP Index';
    engine.setExternalDaily(id, [bar('2026-10-09', 3813.791015625), bar('2026-10-12', 3797.241943359375)]);
    poll(id, yq({ price: 3800.8645, change: null, prev: 3750.1, time: '2026-10-13T07:00:00Z', off: 8, state: 'POSTPOST' }));
    expect(engine.quote(id)!.chg).toBeNaN();
  });

  it('missing previous-close data gives no change', () => {
    const id = 'TWSE Index';
    engine.setExternalDaily(id, [bar('2026-10-13', 48341.31)]);
    poll(id, yq({ price: 48341.31, change: null, prev: undefined, time: '2026-10-13T05:33:00Z', off: 8, state: 'POSTPOST' }));
    const q = engine.quote(id)!;
    expect(q.prevClose).toBeNaN();
    expect(q.chg).toBeNaN();
    expect(q.pct).toBeNaN();
  });

  it('a zero or invalid previous close is treated as missing, never as 0% or infinity', () => {
    const id = 'STI Index';
    engine.setExternalDaily(id, [bar('2026-10-13', 5436.53)]);
    poll(id, yq({ price: 5436.53, change: Number.NaN, prev: 0, time: '2026-10-13T08:45:00Z', off: 8 }));
    let q = engine.quote(id)!;
    expect(q.pct).toBeNaN();
    expect(Number.isFinite(q.chg)).toBe(false);
    poll(id, yq({ price: 5436.53, change: null, prev: Number.NaN, time: '2026-10-13T08:46:00Z', off: 8 }));
    q = engine.quote(id)!;
    expect(q.pct).toBeNaN();
  });

  it('a delayed feed keeps its delay label and a verified change', () => {
    const id = 'KOSPI Index';
    engine.setExternalDaily(id, [bar('2026-10-09', 6625.93), bar('2026-10-12', 6384.24)]);
    poll(id, yq({ price: 6100, change: -284.24, prev: 6384.24, time: '2026-10-13T05:00:00Z', off: 9, delay: 20 }));
    const q = engine.quote(id)!;
    expect(q.src).toBe('DELAYED');
    expect(q.delay).toBe(20);
    expect(q.chg).toBeCloseTo(-284.24, 2);
    expect(q.chgCheck).toBe('verified');
  });

  it('overnight and session boundaries: a market that trades through midnight starts a new day at its cut-off', () => {
    const id = 'XBTUSD Curncy';
    engine.setExternalDaily(id, [bar('2026-10-11', 83679.46875), bar('2026-10-12', 81900)]);
    // Late on 12 Oct (UTC) the change is against 11 Oct.
    poll(id, yq({ price: 81750, change: -1929.47, prev: 83679.47, time: '2026-10-12T23:59:00Z', off: 0, source: 'CoinMarketCap' }), true);
    let q = engine.quote(id)!;
    expect(q.prevCloseDay).toBe(day('2026-10-11'));
    expect(q.chg).toBeCloseTo(-1929.47, 2);
    // Just after midnight: a new day, against 12 Oct's last price; Yahoo's odd crypto change is ignored.
    poll(id, yq({ price: 81800, change: 3.68, prev: 81754.48, time: '2026-10-13T00:01:00Z', off: 0, source: 'CoinMarketCap' }), true);
    q = engine.quote(id)!;
    expect(q.prevClose).toBeCloseTo(81754.48, 2);
    expect(q.prevCloseDay).toBe(day('2026-10-12'));
    expect(q.chg).toBeCloseTo(45.52, 2);
    expect(q.chgCheck).toBe('verified');
  });

  it('a reloaded history keeps a check made for the same session, and drops it for a new one', () => {
    const id = 'UKX Index';
    const bars = [bar('2026-10-09', 10552.1), bar('2026-10-12', 10656.28), bar('2026-10-13', 10703.57)];
    engine.setExternalDaily(id, bars);
    poll(id, yq({ price: 10703.57, change: 47.29, prev: 10552.1, time: '2026-10-13T13:15:00Z', off: 1 }));
    expect(engine.quote(id)!.chgCheck).toBe('verified');
    engine.setExternalDaily(id, bars);
    expect(engine.quote(id)!.chgCheck).toBe('verified');
    expect(engine.quote(id)!.chg).toBeCloseTo(47.29, 1);
    engine.setExternalDaily(id, [...bars, bar('2026-10-14', 10710)]);
    expect(engine.quote(id)!.chgCheck).toBe('unverified');
    expect(engine.quote(id)!.prevCloseDay).toBe(day('2026-10-13'));
  });
});

describe('previous close for currencies', () => {
  // EURUSD=X on 14 Oct 2026 around 05:20 UTC: Yahoo's bar for 13 Oct closed at 1.1160, the pair's price
  // at the start of that London day; the quote's 1.1203 matched the end of the day and the 14 Oct open.
  it('takes readings that agree and match the session open when the daily bar lags a day', () => {
    expect(resolvePrevClose(1.1203227, 1.1209506 - 0.0006278753, 1.1160216331481934, 1.1201972)).toEqual({ value: 1.1203227, verified: true });
    // Without the open, the bar still decides: no previous close.
    expect(choosePrevClose(1.1203227, 1.1209506 - 0.0006278753, 1.1160216331481934)).toBeNaN();
    // An open far from the readings confirms nothing.
    expect(resolvePrevClose(1.1203227, 1.1203227, 1.1160216331481934, 1.13)).toEqual({ value: NaN, verified: false });
    // Readings that disagree are not settled by the open either.
    expect(resolvePrevClose(1.1203227, 1.118, 1.1160216331481934, 1.1201972)).toEqual({ value: NaN, verified: false });
  });

  it('shows the day change of a currency pair against the confirmed close, and keeps it when the bars reload', () => {
    const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
    const id = 'EURUSD Curncy';
    const bars = [
      { day: day('2026-10-12'), o: 1.1213, h: 1.1225, l: 1.1195, c: 1.1204732656478882, v: 0 },
      { day: day('2026-10-13'), o: 1.1205, h: 1.121, l: 1.115, c: 1.1160216331481934, v: 0 },
      { day: day('2026-10-14'), o: 1.1201972, h: 1.1212, l: 1.1199, c: 1.1209506, v: 0 },
    ];
    engine.setExternalDaily(id, bars);
    const q = extQuote(
      { regularMarketPrice: 1.1209506, regularMarketChange: 0.0006278753, regularMarketPreviousClose: 1.1203227, regularMarketOpen: 1.1201972, regularMarketTime: Math.floor(Date.parse('2026-10-14T05:17:27Z') / 1000), gmtOffSetMilliseconds: 3_600_000, marketState: 'REGULAR' },
      false,
    )!;
    engine.setExternalQuote(id, { ...q, day: day('2026-10-14') });
    let out = engine.quote(id)!;
    expect(out.prevClose).toBeCloseTo(1.1203227, 7);
    expect(out.chgCheck).toBe('verified');
    expect(out.pct).toBeCloseTo(0.056, 2);
    // The history reloads for the same session: the confirmed close stays.
    engine.setExternalDaily(id, bars);
    out = engine.quote(id)!;
    expect(out.prevClose).toBeCloseTo(1.1203227, 7);
    expect(out.chgCheck).toBe('verified');
  });
});
