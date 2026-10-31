import { describe, expect, it } from 'vitest';
import { parseYahooEarnings } from '../src/data/live/consensus';
import { fourWeekChange } from '../src/functions/EESummary';

const trend = (now: number, d30: number) => ({ eps: { now, d7: NaN, d30, d60: NaN, d90: NaN } });

describe("EE's 4) Company Financials (TE04 06:27)", () => {
  it('writes 4Wk Chg as the consensus against the one 30 days before, in percent of its size then', () => {
    expect(fourWeekChange(trend(31.801, 31.7))).toBeCloseTo(((31.801 - 31.7) / 31.7) * 100, 9);
    // A loss that narrows is a rise in the estimate.
    expect(fourWeekChange(trend(-0.17, -0.2))).toBeCloseTo(15, 9);
    expect(fourWeekChange(trend(1, 0))).toBeNaN();
    expect(fourWeekChange(trend(1, NaN))).toBeNaN();
    expect(fourWeekChange(undefined)).toBeNaN();
  });

  it("reads Est. LTG (EPS) from Yahoo's next-five-years growth, and none when Yahoo gives none", () => {
    const answer = (growth: unknown) => ({ quoteSummary: { result: [{ earningsTrend: { trend: [{ period: '+5y', endDate: null, growth }] } }] } });
    const read = (growth: unknown) => {
      const r = parseYahooEarnings(answer(growth));
      if ('error' in r) throw new Error(r.error);
      return r.data.ltg;
    };
    expect(read({ raw: 0.1234, fmt: '12.34%' })).toBe(0.1234);
    expect(read({})).toBeNaN();
  });
});
