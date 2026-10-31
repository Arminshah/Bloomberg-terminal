import { describe, expect, it } from 'vitest';
import { compRange, monthChange } from '../src/functions/RV';
import { makeSeries } from '../src/data/series';

describe("RV's comp range", () => {
  it('takes the low and high among the subject and its peers, and their median, leaving missing figures out', () => {
    expect(compRange([12, 30, NaN, 18, 25], 12)).toEqual({ low: 12, high: 30, median: 21.5, subject: 12 });
    expect(compRange([NaN, NaN], NaN)).toBeNull();
  });
});

describe("RV's 1-month change", () => {
  it('counts from the close on or before the same date a calendar month before today, not before the latest session', () => {
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    // Closes on 14, 15 (a Friday) and 18 September and on 16 October; today is Monday 19 October, the latest bar 16 October.
    const s = makeSeries(4, 86_400_000);
    ([['2026-09-14', 100], ['2026-09-15', 110], ['2026-09-18', 120], ['2026-10-16', 132]] as const).forEach(([d, c], i) => {
      s.t[i] = day(d);
      s.c[i] = c;
    });
    s.length = 4;
    // A month before 19 October is 19 September: the close on or before it is 18 September's 120.
    expect(monthChange(s, 132, day('2026-10-19'))).toBeCloseTo(10, 9);
    expect(monthChange(makeSeries(0, 86_400_000), 132, day('2026-10-19'))).toBeNaN();
  });
});
