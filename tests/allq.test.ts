import { describe, expect, it } from 'vitest';
import { lineSecond, nearestBenchmark, onTheRun, type Benchmark, type QuoteLine } from '../src/functions/ALLQ';
import { yieldFromClean } from '../src/finance/bonds';

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

describe("ALLQ's lines of another day", () => {
  // The desktop fixture's prices: the note 4 5/8 08/15/36 against the 5% of 09/30/33, on 29 and 30 October 2026.
  const terms = { coupon: 4.625, maturity: new Date('2036-08-15T00:00:00Z'), freq: 2 as const };
  const benchTerms = { coupon: 5, maturity: new Date('2033-09-30T00:00:00Z'), freq: 2 as const };
  const bench: Benchmark = { id: 'T 5 09/30/33 Govt', tenor: 7, maturity: '2033-09-30', bid: 100.96875, ask: 101, eod: 100.953125, prev: { bid: 100.921875, ask: 100.953125 } };
  const settle = new Date('2026-11-02T00:00:00Z');
  const prevSettle = new Date('2026-10-30T00:00:00Z');

  it("measures the Previous Day line to its own settlement, against the benchmark's prices of that day", () => {
    const line: QuoteLine = { pcs: '', firm: 'Previous Day', bid: 97.3125, ask: 97.34375, vs: 'prev', settle: prevSettle };
    const r = lineSecond(line, 'bid', terms, bench, benchTerms, settle);
    const want = (yieldFromClean(terms, prevSettle, 97.3125) - yieldFromClean(benchTerms, prevSettle, 100.921875)) * 100;
    expect(r.spd).toBeCloseTo(want, 9);
    expect(r.yld).toBeCloseTo(yieldFromClean(terms, prevSettle, 97.3125), 12);
    // Not against today's benchmark price: that would carry the benchmark's own move over the day.
    const stale = (yieldFromClean(terms, prevSettle, 97.3125) - yieldFromClean(benchTerms, prevSettle, 100.96875)) * 100;
    expect(Math.abs(r.spd - stale)).toBeGreaterThan(0.3);
  });

  it("measures the End of Day line against the benchmark's end-of-day price, and the latest against Sell and Buy", () => {
    const eod: QuoteLine = { pcs: '', firm: 'End of Day', bid: 97.5, ask: NaN, vs: 'eod' };
    expect(lineSecond(eod, 'bid', terms, bench, benchTerms, settle).spd).toBeCloseTo((yieldFromClean(terms, settle, 97.5) - yieldFromClean(benchTerms, settle, 100.953125)) * 100, 9);
    const latest: QuoteLine = { pcs: 'TSY', firm: 'FedInvest', bid: 97.515625, ask: 97.53125 };
    expect(lineSecond(latest, 'ask', terms, bench, benchTerms, settle).spd).toBeCloseTo((yieldFromClean(terms, settle, 97.53125) - yieldFromClean(benchTerms, settle, 101)) * 100, 9);
  });

  it('has no spread for a day the benchmark has no price', () => {
    const line: QuoteLine = { pcs: '', firm: 'Previous Day', bid: 97.3125, ask: 97.34375, vs: 'prev', settle: prevSettle };
    expect(lineSecond(line, 'bid', terms, { ...bench, prev: undefined }, benchTerms, settle).spd).toBeNaN();
  });
});
