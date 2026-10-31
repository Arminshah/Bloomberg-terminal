import { describe, expect, it } from 'vitest';
import { keyStatsEstimates } from '../src/functions/FA';
import type { Estimate } from '../src/data/live/analysts';
import type { FinPeriod } from '../src/data/fundamentals';

const est = (date: string, revenueAvg: number, netIncomeAvg: number, epsAvg: number, ebitdaAvg?: number) =>
  ({ date, revenueAvg, netIncomeAvg, epsAvg, ebitdaAvg, revenueLow: NaN, revenueHigh: NaN, epsLow: NaN, epsHigh: NaN }) as Estimate;
// The last reported year, in millions.
const reported = { label: 'FY 2025', end: Date.UTC(2025, 11, 31), rev: 20_000, eps: 2.5 } as FinPeriod;

describe("FINANCIALS Key Stats: the analysts' estimate columns", () => {
  const lines = keyStatsEstimates([est('2026-12-31', 21_000e6, 6_000e6, 2.95, 11_000e6), est('2027-12-31', 26_500e6, 6_300e6, 3.1)], reported);
  const line = (label: string, nth = 0) => lines.filter((l) => l.label === label)[nth].values;

  it('grows the first estimate year from the last reported revenue and the next from that estimate', () => {
    expect(line('Revenue')).toEqual([21_000, 26_500]);
    // On the last reported year, as the report's capture works its first estimate's growth.
    expect(line('Growth %, YoY')[0]).toBeCloseTo(5, 6);
    expect(line('Growth %, YoY')[1]).toBeCloseTo((26_500 / 21_000 - 1) * 100, 6);
  });

  it("gives the margins from the estimates' own figures, and EBITDA where the source estimates it", () => {
    expect(line('EBITDA')[0]).toBe(11_000);
    expect(line('EBITDA')[1]).toBeNaN();
    expect(line('Margin %', 1)[0]).toBeCloseTo((11_000 / 21_000) * 100, 6); // EBITDA margin
    expect(line('Margin %', 2)[1]).toBeCloseTo((6_300 / 26_500) * 100, 6); // net margin
    expect(line('Margin %', 0)).toEqual([NaN, NaN]); // no gross profit estimate
  });

  it("gives EPS growth only between estimates, as the analysts' EPS is on their own basis", () => {
    expect(line('Growth %, YoY', 1)[0]).toBeNaN();
    expect(line('Growth %, YoY', 1)[1]).toBeCloseTo((3.1 / 2.95 - 1) * 100, 6);
  });

  it('leaves the lines no estimate covers empty', () => {
    for (const label of ['Gross Profit', 'Net Income to Common Shareholders', 'Cash from Operations', 'Capital Expenditures', 'Free Cash Flow']) expect(line(label)).toEqual([NaN, NaN]);
  });
});
