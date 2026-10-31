import { afterEach, describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { emptyPeriod, keyStats } from '../src/data/fundamentals';
import { realFund, type RealFund } from '../src/data/live/yfund';

// Yahoo's financialData revenueGrowth and earningsGrowth compare the latest quarter with the same quarter a year
// earlier. The worksheet's Rev Growth and the help desk's "revenue growth" are the latest fiscal year's on the year
// before's, from the statements.
const year = (label: string, end: string, rev: number, eps: number) => ({ ...emptyPeriod(label, Date.parse(end)), rev, eps });
const fund = (annual: ReturnType<typeof year>[], stats: RealFund['stats']): RealFund => ({
  fetched: 0, annual, quarterly: [], ltm: emptyPeriod('LTM', Date.parse('2026-09-30')), earnings: [], holders: [], breakdown: null, stats, nextDividend: null,
  float: { float: NaN, short: NaN, shortPctFloat: NaN, daysToCover: NaN, asOf: NaN, shortPrior: NaN, priorAsOf: NaN }, officers: [],
});
const def = engine.get('JPM US Equity')!;

describe("key statistics' revenue and EPS growth are the fiscal year's", () => {
  afterEach(() => realFund.delete(def.id));

  it("keeps the statements' annual growth over the source's quarterly figure", () => {
    realFund.set(def.id, fund([year('FY 2024', '2024-12-31', 100_000, 2), year('FY 2025', '2025-12-31', 110_000, 2.5)], { revGrowth: 30, epsGrowth: 45 }));
    const k = keyStats(def);
    expect(k.revGrowth).toBeCloseTo(10, 9);
    expect(k.epsGrowth).toBeCloseTo(25, 9);
  });

  it("leaves them blank without two fiscal years, rather than give the quarter's", () => {
    realFund.set(def.id, fund([year('FY 2025', '2025-12-31', 110_000, 2.5)], { revGrowth: 30, epsGrowth: 45 }));
    const k = keyStats(def);
    expect(k.revGrowth).toBeNaN();
    expect(k.epsGrowth).toBeNaN();
  });
});
