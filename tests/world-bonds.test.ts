import { describe, expect, it } from 'vitest';
import { WB_COUNTRIES, WB_REGIONS, countryStories, diffLine, fmtRangeLevel, rangePos, staleSince, wbStats, type DailyLine } from '../src/data/world-bonds';
import type { Story } from '../src/data/news';

const DAY = 86_400_000;
const day = (n: number) => Date.UTC(2026, 0, 1) + n * DAY;

describe('WB rows', () => {
  it('numbers the countries as the terminal does, each under its region (TE07 01:15)', () => {
    const n = Object.fromEntries(WB_COUNTRIES.map((k) => [k.c, k.n]));
    expect(n).toMatchObject({ US: 10, CA: 11, BR: 12, MX: 14, GB: 20, FR: 21, DE: 22, IT: 23, ES: 24, CH: 28, JP: 30, AU: 31, CN: 34 });
    expect(new Set(WB_COUNTRIES.map((k) => k.n)).size).toBe(WB_COUNTRIES.length);
    WB_REGIONS.forEach((r, i) => r.countries.forEach((k) => expect(Math.floor(k.n / 10)).toBe(i + 1)));
  });

  it('leaves the emerging markets out of the Developed view', () => {
    expect(WB_COUNTRIES.filter((k) => !k.developed).map((k) => k.c)).toEqual(['BR', 'MX', 'CN', 'IN']);
  });
});

describe('diffLine', () => {
  it("takes the other line's value that day, or its last before when its market is shut", () => {
    const a: DailyLine = { t: [day(0), day(1), day(2), day(3)], v: [4.0, 4.1, 4.2, 4.3] };
    const b: DailyLine = { t: [day(1), day(3)], v: [2.5, 2.6] };
    const d = diffLine(a, b);
    expect(d.t).toEqual([day(1), day(2), day(3)]);
    expect(d.v.map((x) => Math.round(x * 1e6) / 1e6)).toEqual([160, 170, 170]);
  });
});

describe('wbStats', () => {
  const l: DailyLine = { t: [day(-2), day(-1), day(1), day(2), day(3), day(4)], v: [3.0, 3.2, 3.4, 3.1, 3.5, 3.3] };
  const s = wbStats(l, day(0))!;

  it('measures the range from the last value before it starts (the year-end close for YTD)', () => {
    expect(s.base).toBe(3.2);
    expect(s.now).toBe(3.3);
    expect(s.chg).toBeCloseTo(0.1, 12);
    expect(s.values).toEqual([3.4, 3.1, 3.5, 3.3]);
  });

  it('gives the range low, high and mean, the latest value included', () => {
    expect(s.low).toBe(3.1);
    expect(s.high).toBe(3.5);
    expect(s.avg).toBeCloseTo(3.325, 12);
    expect(s.diff).toBeCloseTo(-0.025, 12);
  });

  it('gives #SD against the sample standard deviation of the levels', () => {
    const sd = Math.sqrt([3.4, 3.1, 3.5, 3.3].reduce((a, x) => a + (x - 3.325) ** 2, 0) / 3);
    expect(s.sd).toBeCloseTo(-0.025 / sd, 10);
  });

  it("gives #SD/Day as the day's change over the standard deviation of the range's daily changes", () => {
    // Changes from the value before the range: +0.2, -0.3, +0.4, -0.2.
    const ch = [0.2, -0.3, 0.4, -0.2];
    const m = ch.reduce((a, x) => a + x, 0) / 4;
    const sd = Math.sqrt(ch.reduce((a, x) => a + (x - m) ** 2, 0) / 3);
    expect(s.dayChg).toBeCloseTo(-0.2, 12);
    expect(s.sdDay).toBeCloseTo(-0.2 / sd, 10);
  });

  it('has no 14-day RSI until the line has fifteen values', () => {
    expect(Number.isNaN(s.rsi)).toBe(true);
    const rising: DailyLine = { t: Array.from({ length: 20 }, (_, i) => day(i)), v: Array.from({ length: 20 }, (_, i) => 1 + i * 0.01) };
    expect(wbStats(rising, day(0))!.rsi).toBe(100);
  });

  it('measures a range holding one value with the value before it, and gives nothing for a range with none', () => {
    expect(wbStats(l, day(3))!.values).toEqual([3.5, 3.3]);
    // A source that has not caught up: its latest value is before the range starts.
    expect(wbStats(l, day(10))).toBeNull();
    expect(wbStats({ t: [day(0)], v: [1] }, day(0))).toBeNull();
  });

  it('treats a line as waiting for its source once its latest value is more than ten days old', () => {
    expect(staleSince(l, day(14))).toBeNull();
    expect(staleSince(l, day(15))).toBe(day(4));
    expect(staleSince({ t: [], v: [] }, day(15))).toBeNull();
  });
});

describe('range columns', () => {
  it('drop the leading zero below one, as the Quick Start page writes them', () => {
    expect(fmtRangeLevel(-0.784)).toBe('-.784');
    expect(fmtRangeLevel(0.005)).toBe('.005');
    expect(fmtRangeLevel(1.385)).toBe('1.385');
    expect(fmtRangeLevel(12.689)).toBe('12.689');
    expect(fmtRangeLevel(NaN)).toBe('');
  });

  it('place the Avg diamond and Now dot between the low and the high', () => {
    expect(rangePos(3.1, 3.1, 3.5)).toBe(0);
    expect(rangePos(3.5, 3.1, 3.5)).toBe(1);
    expect(rangePos(3.3, 3.1, 3.5)).toBeCloseTo(0.5, 12);
    expect(rangePos(2, 2, 2)).toBe(0.5);
  });
});

describe('Security Analysis headlines', () => {
  const story = (id: string, headline: string, source: string, time: number): Story => ({ id, headline, source, time, body: [], tickers: [], topics: [] });
  const all = [
    story('a', 'Bundesbank monthly report: German economy stalls', 'Deutsche Bundesbank', 3),
    story('b', 'Bank of Japan keeps policy rate', 'Bank of Japan', 5),
    story('c', 'Euro area inflation 2.1%', 'Eurostat', 4),
    story('d', 'Germany: industrial production', 'Destatis', 6),
  ];

  it("lists a country's stories newest first, by its name, its adjective or its central bank", () => {
    expect(countryStories(all, 'DE').map((s) => s.id)).toEqual(['d', 'a']);
    expect(countryStories(all, 'JP').map((s) => s.id)).toEqual(['b']);
    expect(countryStories(all, 'AU')).toEqual([]);
  });
});
