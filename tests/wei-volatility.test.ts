import { describe, expect, it } from 'vitest';
import { DAYS_A_YEAR, historicalVol } from '../src/functions/WEI';

const DAY = 86_400_000;
const series = (closes: number[]) => ({ t: Float64Array.from(closes.map((_, i) => i * DAY)), c: Float64Array.from(closes), length: closes.length });

describe("WEI's 10D Vol and 30D Vol (TE04 01:21)", () => {
  it('is the sample standard deviation of the daily log returns, annualised with 261 trading days, in percent', () => {
    const closes = [100, 101, 99.5, 102, 101.2, 103, 102.4, 104.1, 103.3, 105, 104.2];
    const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
    expect(DAYS_A_YEAR).toBe(261);
    expect(historicalVol(series(closes), 10, 99 * DAY)).toBeCloseTo(sd * Math.sqrt(261) * 100, 10);
  });

  it("uses only the sessions before today, and none without enough closes", () => {
    const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 150];
    // Today's bar (the 150) is left out: before it, the last 11 closes rise by one a day.
    expect(historicalVol(series(closes), 10, 11 * DAY)).toBeCloseTo(historicalVol(series(closes.slice(0, 11)), 10, 99 * DAY), 12);
    expect(historicalVol(series(closes.slice(0, 10)), 10, 99 * DAY)).toBeNaN();
  });
});
