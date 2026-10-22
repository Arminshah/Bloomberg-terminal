import { describe, expect, it } from 'vitest';
import { adjustedCounts, capByYear, capSeries, coverShareCounts, splitFactorAfter } from '../src/data/marketcap';

const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const bars = (rows: [string, number][]) => ({ t: rows.map(([d]) => day(d) * DAY), c: rows.map(([, c]) => c), length: rows.length });

describe('market cap history', () => {
  it('takes the latest filing for each cover date and leaves out empty counts', () => {
    const cf = { facts: { 'dei:EntityCommonStockSharesOutstanding': { shares: [
      { end: '2025-01-20', val: 100, filed: '2025-01-30', form: '10-Q' },
      { end: '2025-01-20', val: 101, filed: '2025-03-01', form: '10-Q/A' },
      { end: '2024-10-15', val: 0, filed: '2024-11-01', form: '10-K' },
      { end: '2024-07-15', val: 98, filed: '2024-08-01', form: '10-Q' },
    ] } } } as never;
    expect(coverShareCounts(cf)).toEqual([{ end: '2024-07-15', val: 98 }, { end: '2025-01-20', val: 101 }]);
  });

  it("uses the balance sheet's count when the covers give none (a cover count by share class only)", () => {
    const cf = { facts: { 'us-gaap:CommonStockSharesOutstanding': { shares: [{ end: '2026-06-30', val: 12230e6, filed: '2026-07-24', form: '10-Q' }] } } } as never;
    expect(coverShareCounts(cf)).toEqual([{ end: '2026-06-30', val: 12230e6 }]);
  });

  it('takes the balance sheets when the covers stopped long before them, and no counts that stopped years ago', () => {
    const cf = { facts: {
      'dei:EntityCommonStockSharesOutstanding': { shares: [{ end: '2010-04-30', val: 1.5e6, filed: '2010-05-07', form: '10-Q' }] },
      'us-gaap:CommonStockSharesOutstanding': { shares: [{ end: '2026-06-30', val: 1.43e6, filed: '2026-08-01', form: '10-Q' }] },
    } } as never;
    expect(coverShareCounts(cf)).toEqual([{ end: '2026-06-30', val: 1.43e6 }]);
    const s = capSeries(bars([['2026-10-20', 10]]), 1000, [{ end: '2010-04-30', val: 900 }], []);
    expect(s.basis).toBe('held');
    expect(s.points.map((p) => p.cap)).toEqual([10000]);
  });

  it('counts a share before a split as the shares it became', () => {
    const splits = [{ day: day('2020-08-31'), numerator: 4, denominator: 1 }, { day: day('2014-06-09'), numerator: 7, denominator: 1 }];
    expect(splitFactorAfter(splits, day('2013-01-01'))).toBe(28);
    expect(splitFactorAfter(splits, day('2020-01-01'))).toBe(4);
    expect(splitFactorAfter(splits, day('2021-01-01'))).toBe(1);
  });

  it('drops a cover count that jumps away from both neighbours and back', () => {
    const counts = [{ end: '2024-01-01', val: 1000 }, { end: '2024-04-01', val: 1 }, { end: '2024-07-01', val: 990 }];
    expect(adjustedCounts(counts, []).map((c) => c.val)).toEqual([1000, 990]);
  });

  it('takes the count on the latest cover each day, splits applied, from the first cover on', () => {
    // Covers: 1,100 before a 4-for-1 split (4,400 now), then 3,960; the quote implies 4,000 today (within 5%).
    const counts = [{ end: '2020-01-15', val: 1100 }, { end: '2021-01-15', val: 3960 }];
    const splits = [{ day: day('2020-08-31'), numerator: 4, denominator: 1 }];
    const s = capSeries(bars([['2019-12-31', 50], ['2020-06-30', 25], ['2021-06-30', 30]]), 4000, counts, splits);
    expect(s.basis).toBe('filings');
    // 2019-12-31 is before the first cover: left out.
    expect(s.points.map((p) => p.cap)).toEqual([25 * 4400, 30 * 3960]);
  });

  it("covers that count one class of several only move today's count back in time", () => {
    // Class A covers (1,000 then 900) against 3,000 shares behind the quote's market value.
    const s = capSeries(bars([['2024-06-28', 10], ['2025-06-30', 12]]), 3000, [{ end: '2024-04-20', val: 1000 }, { end: '2025-04-20', val: 900 }], []);
    expect(s.basis).toBe('scaled');
    expect(s.points.map((p) => Math.round(p.cap))).toEqual([Math.round(10 * 3000 * (1000 / 900)), 12 * 3000]);
  });

  it("holds today's count without filings, and turns pence into pounds", () => {
    const s = capSeries(bars([['2024-01-02', 250], ['2024-01-03', 260]]), 1000, [], [], 0.01);
    expect(s.basis).toBe('held');
    expect(s.points.map((p) => p.cap)).toEqual([2500, 2600]);
  });

  it('gives each year-end value with the change on the year before, newest first', () => {
    const pts = [['2023-06-30', 80], ['2023-12-29', 100], ['2024-12-31', 150], ['2025-03-31', 120]].map(([d, cap]) => ({ t: day(d as string) * DAY, cap: cap as number }));
    const ys = capByYear(pts);
    expect(ys.map((y) => [y.year, y.cap])).toEqual([[2025, 120], [2024, 150], [2023, 100]]);
    expect(ys[0].change).toBeCloseTo(-20, 10);
    expect(ys[1].change).toBeCloseTo(50, 10);
    expect(ys[2].change).toBeNaN();
  });
});
