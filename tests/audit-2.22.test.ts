import { describe, expect, it } from 'vitest';
import { defFromYahoo } from '../src/data/live/lookup';
import { EU_EXCHANGES } from '../src/data/listings';
import { indicatedYield } from '../src/functions/DVD';
import { enterpriseValue } from '../src/functions/EEO';
import sofiChart from './fixtures/yahoo-sofi-chart.json';
import sofiSummary from './fixtures/yahoo-sofi-summary.json';

// Findings from the independent audit of 2.22.0, each with the case that showed it.

describe('indicated dividend yield on a line quoted in pence', () => {
  it("takes the rate and the price in the same unit (Unilever: 4 × 40.46p on 4,900.5p is 3.3%, not 330%)", () => {
    expect(indicatedYield(4 * 40.46, 4900.5)).toBeCloseTo(3.3025, 3);
    expect(indicatedYield(NaN, 4900.5)).toBeNaN();
    expect(indicatedYield(161.84, 0)).toBeNaN();
  });

  it('keeps a looked-up London stock’s rate in pence, as the price and the dividend record are', () => {
    const chart = structuredClone(sofiChart) as { chart: { result: { meta: Record<string, unknown> }[] } };
    chart.chart.result[0].meta.exchangeName = 'LSE';
    chart.chart.result[0].meta.currency = 'GBp';
    const summary = structuredClone(sofiSummary) as { quoteSummary: { result: { summaryDetail: Record<string, unknown> }[] } };
    // Yahoo gives the rate in pounds for a line quoted in pence.
    summary.quoteSummary.result[0].summaryDetail.dividendRate = { raw: 1.62, fmt: '1.62' };
    const built = defFromYahoo('ULVR', chart, summary, { root: 'ULVR', listing: EU_EXCHANGES.LSE });
    if ('error' in built) throw new Error(built.error);
    expect(built.def.minor).toBe(true);
    expect(built.def.eq!.dps).toBeCloseTo(162, 9);
  });
});

describe('enterprise value on the consensus overview', () => {
  it('is unknown when debt or cash is missing, not a market value with zeros added', () => {
    expect(enterpriseValue(1000, 200, 50)).toBe(1150);
    expect(enterpriseValue(1000, 0, 0)).toBe(1000);
    expect(enterpriseValue(1000, NaN, 50)).toBeNaN();
    expect(enterpriseValue(1000, 200, NaN)).toBeNaN();
    expect(enterpriseValue(NaN, 200, 50)).toBeNaN();
  });
});

describe('short interest against the shares at each settlement', () => {
  const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  // Covers: 100M shares as of 1 Feb, 200M as of 1 May (the company doubled its shares).
  const counts = [{ end: '2026-02-01', val: 100e6 }, { end: '2026-05-01', val: 200e6 }];

  it("divides each settlement by the count dated on or before it, not today's (AR-001)", async () => {
    const { pctOfSharesAt } = await import('../src/data/shortinterest');
    // 50M short in March against 100M then is 50%; 100M short in June against 200M then is also 50%.
    expect(pctOfSharesAt(50e6, ms('2026-03-13'), counts, []).pct).toBeCloseTo(50, 9);
    expect(pctOfSharesAt(100e6, ms('2026-06-12'), counts, []).pct).toBeCloseTo(50, 9);
    expect(pctOfSharesAt(100e6, ms('2026-06-12'), counts, []).basis).toEqual({ val: 200e6, end: '2026-05-01' });
  });

  it('applies a split between the count and the settlement, and gives nothing without a recent count', async () => {
    const { pctOfSharesAt, sharesOutAt } = await import('../src/data/shortinterest');
    // A 2-for-1 split on 1 June: the May count is 400M of June's shares.
    const splits = [{ day: day('2026-06-01'), numerator: 2, denominator: 1 }];
    expect(sharesOutAt(counts, splits, day('2026-06-12'))?.val).toBe(400e6);
    expect(sharesOutAt(counts, splits, day('2026-05-20'))?.val).toBe(200e6);
    // Before the first count, and more than 200 days after the last: unknown.
    expect(pctOfSharesAt(1e6, ms('2026-01-15'), counts, []).pct).toBeNaN();
    expect(pctOfSharesAt(1e6, ms('2026-12-31'), counts, []).pct).toBeNaN();
  });
});
