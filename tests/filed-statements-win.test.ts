import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { buildRealFund } from '../src/data/live/yfund';
import { parseCompanyFacts } from '../src/data/live/sec';
import { realSplits } from '../src/data/live/yahoo';

// The data audit of 28 October 2026 compared FINANCIALS with the companies' own filings (SEC companyfacts). Where the
// statements feed and the filing disagree on the same net income, the filing is the company's own figure.
const NOW = Date.parse('2026-10-28T00:00:00Z');
const company = { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } };
const annual = (rows: [string, string, number][]) => ({ timeseries: { result: rows.map(([field, end, raw]) => ({
  meta: { type: [`annual${field}`] },
  [`annual${field}`]: [{ asOfDate: end, periodType: '12M', currencyCode: 'USD', reportedValue: { raw } }],
})) } });
const fact = (start: string, end: string, val: number, filed: string, form = '10-K') => ({ start, end, val, accn: `0000000000-${filed}`, form, filed, fy: Number(end.slice(0, 4)), fp: 'FY' });
const facts = (tags: Record<string, { unit?: string; rows: ReturnType<typeof fact>[] }>) =>
  parseCompanyFacts(JSON.stringify({ cik: 1, entityName: 'X', facts: { 'us-gaap': Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, { units: { [v.unit ?? 'USD']: v.rows } }])) } }))!;

describe('FINANCIALS: the filing wins where the feed is on another basis', () => {
  const ids = ['JPM US Equity', 'APLD US Equity', 'CRWV US Equity'];
  beforeEach(() => ids.forEach((id) => realSplits.set(id, [])));
  afterEach(() => ids.forEach((id) => realSplits.delete(id)));

  it("shows JPMorgan's total net revenue as filed, not the feed's 169,439", () => {
    const f = buildRealFund(engine.get('JPM US Equity')!, company, annual([
      ['TotalRevenue', '2024-12-31', 169_439e6], ['NetIncomeCommonStockholders', '2024-12-31', 56_868e6], ['DilutedEPS', '2024-12-31', 19.75],
    ]), null, null, NOW, facts({
      Revenues: { rows: [fact('2024-01-01', '2024-12-31', 177_556e6, '2025-02-14')] },
      NetIncomeLossAvailableToCommonStockholdersBasic: { rows: [fact('2024-01-01', '2024-12-31', 56_868e6, '2025-02-14')] },
      EarningsPerShareDiluted: { unit: 'USD/shares', rows: [fact('2024-01-01', '2024-12-31', 19.75, '2025-02-14')] },
    }));
    expect(f.annual[0]).toMatchObject({ rev: 177_556, ni: 56_868, eps: 19.75 });
    expect(f.annual[0].supplements?.join(' ')).toContain('where the statements feed gave 169,439 million');
  });

  it("puts Applied Digital's FY2025 on the continuing basis of its latest 10-K, as its FY2026 is", () => {
    const f = buildRealFund(engine.get('APLD US Equity')!, company, annual([
      ['TotalRevenue', '2025-05-31', 228.569e6], ['GrossProfit', '2025-05-31', 11.8e6], ['OperatingIncome', '2025-05-31', -150e6], ['NetIncomeCommonStockholders', '2025-05-31', -233.68e6],
      ['TotalRevenue', '2026-05-31', 611.311e6], ['NetIncomeCommonStockholders', '2026-05-31', -250.263e6],
    ]), null, null, NOW, facts({
      // First filed with the cloud business (10-K of July 2025), then restated without it (10-K of July 2026).
      Revenues: { rows: [fact('2024-06-01', '2025-05-31', 228.569e6, '2025-07-30'), fact('2024-06-01', '2025-05-31', 144.19e6, '2026-07-29'), fact('2025-06-01', '2026-05-31', 611.311e6, '2026-07-29')] },
      OperatingIncomeLoss: { rows: [fact('2024-06-01', '2025-05-31', -120e6, '2026-07-29')] },
      NetIncomeLossAvailableToCommonStockholdersBasic: { rows: [fact('2024-06-01', '2025-05-31', -233.68e6, '2026-07-29'), fact('2025-06-01', '2026-05-31', -250.263e6, '2026-07-29')] },
    }));
    const fy25 = f.annual.find((p) => p.label === 'FY 2025')!;
    expect(fy25.rev).toBeCloseTo(144.19, 6);
    expect(fy25.opInc).toBeCloseTo(-120, 6);
    // The feed's gross profit was on the old basis and the filing tags none: blank, not mixed.
    expect(fy25.gp).toBeNaN();
    expect(fy25.ni).toBeCloseTo(-233.68, 6);
    expect(f.annual.find((p) => p.label === 'FY 2026')!.rev).toBeCloseTo(611.311, 6);
  });

  it("takes CoreWeave's diluted EPS as its 10-K reports it, not the feed's loss over its later share count", () => {
    // CoreWeave is not in the built-in list: a line like it, as a lookup adds it.
    const crwv = { ...engine.get('APLD US Equity')!, id: 'CRWV US Equity', ticker: 'CRWV', name: 'CoreWeave Inc' };
    const f = buildRealFund(crwv, company, annual([
      ['TotalRevenue', '2024-12-31', 1_915e6], ['NetIncomeCommonStockholders', '2024-12-31', -937e6], ['DilutedEPS', '2024-12-31', -2.018966], ['DilutedAverageShares', '2024-12-31', 464_099_040],
    ]), null, null, NOW, facts({
      Revenues: { rows: [fact('2024-01-01', '2024-12-31', 1_915e6, '2026-03-02')] },
      NetIncomeLossAvailableToCommonStockholdersBasic: { rows: [fact('2024-01-01', '2024-12-31', -937e6, '2026-03-02')] },
      EarningsPerShareDiluted: { unit: 'USD/shares', rows: [fact('2024-01-01', '2024-12-31', -4.3, '2026-03-02')] },
    }));
    expect(f.annual[0]).toMatchObject({ rev: 1_915, ni: -937, eps: -4.3 });
    expect(f.annual[0].supplements?.join(' ')).toContain('diluted EPS as filed, where the statements feed gave -2.018966');
  });
});
