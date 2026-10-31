import { describe, expect, it } from 'vitest';
import { nearestBenchmark, onTheRun, type Benchmark } from '../src/functions/ALLQ';

describe('ALLQ benchmarks', () => {
  // Maturities as FedInvest listed them on 30 October 2026, before the November refunding.
  const rows = [
    { id: 'old30', maturity: '2036-02-15' }, // a 30-year bond issued in 2006
    { id: '10y', maturity: '2036-08-15' },
    { id: '7y', maturity: '2033-09-30' },
    { id: '5y', maturity: '2031-09-30' },
    { id: '2y', maturity: '2028-09-30' },
    { id: '30y', maturity: '2056-08-15' },
    { id: '20y', maturity: '2046-08-15' },
  ];

  it("picks the latest issue of each tenor: the one maturing last within that tenor's years, each issue once", () => {
    const picked = Object.fromEntries(onTheRun(rows, '2026-10-30').map((b) => [b.tenor, b.row.id]));
    // No 3-year issue in the list: the 3-year slot would repeat the 2-year note, so it is left out.
    expect(picked).toEqual({ 2: '2y', 5: '5y', 7: '7y', 10: '10y', 20: '20y', 30: '30y' });
  });

  it("tells the latest issue from an older, longer one maturing the same day by its first issue date", () => {
    // FedInvest's list of 30 October 2026: two notes and two bonds share a maturity; the statement of 30 September
    // gives their first issues. The new 3-year (15 October) is not on that statement yet.
    const list = [
      { id: 'old7y', maturity: '2028-10-31' }, { id: '2y', maturity: '2028-09-30' },
      { id: 'new3y', maturity: '2029-10-15' }, { id: 'prev3y', maturity: '2029-09-15' },
      { id: 'old30y', maturity: '2046-08-15' }, { id: '20y', maturity: '2046-08-15' },
      { id: '10y', maturity: '2036-08-15' },
    ];
    const issue: Record<string, string> = { old7y: '2021-11-01', '2y': '2026-09-30', prev3y: '2026-09-15', old30y: '2016-08-15', '20y': '2026-08-31', '10y': '2026-08-15' };
    const picked = Object.fromEntries(onTheRun(list, '2026-10-30', (r) => issue[r.id]).map((b) => [b.tenor, b.row.id]));
    // The list's only 7- and 30-year issues are the old ones, so they stand for their tenors.
    expect(picked).toEqual({ 2: '2y', 3: 'new3y', 7: 'old7y', 10: '10y', 20: '20y', 30: 'old30y' });
  });

  it("measures a bond against the benchmark nearest its maturity, never against itself", () => {
    const b = (id: string, tenor: number, maturity: string): Benchmark => ({ id, tenor, maturity, bid: 100, ask: 100 });
    const benches = [b('7y', 7, '2033-09-30'), b('10y', 10, '2036-08-15'), b('30y', 30, '2056-08-15')];
    expect(nearestBenchmark(benches, 'corp', '2035-12-01')?.id).toBe('10y');
    expect(nearestBenchmark(benches, 'corp', '2035-02-05')?.id).toBe('7y');
    expect(nearestBenchmark(benches, 'corp', '2054-02-05')?.id).toBe('30y');
    expect(nearestBenchmark(benches, '10y', '2036-08-15')?.id).toBe('7y');
    expect(nearestBenchmark([], 'corp', '2035-02-05')).toBeUndefined();
  });
});
