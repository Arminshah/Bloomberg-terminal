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

  it("takes JPMorgan's filed revenue however small the feed's difference (the data audit on GitHub, 28 October)", () => {
    const f = buildRealFund(engine.get('JPM US Equity')!, company, annual([
      ['TotalRevenue', '2025-12-31', 181_847e6], ['NetIncomeCommonStockholders', '2025-12-31', 55_800e6],
    ]), null, null, NOW, facts({
      Revenues: { rows: [fact('2025-01-01', '2025-12-31', 182_447e6, '2026-02-13')] },
      NetIncomeLossAvailableToCommonStockholdersBasic: { rows: [fact('2025-01-01', '2025-12-31', 55_800e6, '2026-02-13')] },
    }));
    expect(f.annual[0]).toMatchObject({ rev: 182_447 });
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

describe("FINANCIALS: the filed diluted EPS where the filing tags only net income", () => {
  beforeEach(() => realSplits.set('LLY US Equity', []));
  afterEach(() => realSplits.delete('LLY US Equity'));

  it("takes Eli Lilly's 2022 diluted EPS as filed, 6.90, not the feed's 6.57", () => {
    // Lilly tags NetIncomeLoss but not net income to common; the feed divided 2022's 6,244.8 million by 950.2 million
    // shares (its employee benefit trust's included), the 10-Ks by 904.6 million.
    const lly = engine.get('LLY US Equity')!;
    const f = buildRealFund(lly, company, annual([
      ['TotalRevenue', '2022-12-31', 28_541.4e6], ['NetIncome', '2022-12-31', 6_244.8e6], ['NetIncomeCommonStockholders', '2022-12-31', 6_244.8e6], ['DilutedEPS', '2022-12-31', 6.572215], ['DilutedAverageShares', '2022-12-31', 950_182_000],
    ]), null, null, NOW, facts({
      Revenues: { rows: [fact('2022-01-01', '2022-12-31', 28_541.4e6, '2025-02-19')] },
      NetIncomeLoss: { rows: [fact('2022-01-01', '2022-12-31', 6_244.8e6, '2025-02-19')] },
      EarningsPerShareDiluted: { unit: 'USD/shares', rows: [fact('2022-01-01', '2022-12-31', 6.9, '2025-02-19')] },
      WeightedAverageNumberOfDilutedSharesOutstanding: { unit: 'shares', rows: [fact('2022-01-01', '2022-12-31', 904_619_000, '2025-02-19')] },
    }));
    expect(f.annual[0].eps).toBe(6.9);
    expect(f.annual[0].supplements?.join(' ')).toContain('diluted EPS as filed, where the statements feed gave 6.572215');
  });

  it("keeps the feed's EPS where its net income to common differs from its total (preferred dividends)", () => {
    const f = buildRealFund(engine.get('LLY US Equity')!, company, annual([
      ['NetIncome', '2022-12-31', 6_244.8e6], ['NetIncomeCommonStockholders', '2022-12-31', 6_000e6], ['DilutedEPS', '2022-12-31', 6.6],
    ]), null, null, NOW, facts({
      NetIncomeLoss: { rows: [fact('2022-01-01', '2022-12-31', 6_244.8e6, '2025-02-19')] },
      EarningsPerShareDiluted: { unit: 'USD/shares', rows: [fact('2022-01-01', '2022-12-31', 6.9, '2025-02-19')] },
    }));
    expect(f.annual[0].eps).toBe(6.6);
  });
});

describe('FINANCIALS: total net income and net income to common shareholders, each on its own row', () => {
  beforeEach(() => realSplits.set('JPM US Equity', []));
  afterEach(() => realSplits.delete('JPM US Equity'));
  // JPMorgan's 10-K of 13 February 2026: net income 57,048 (2025) and 58,471 (2024); to common shareholders, after
  // preferred dividends, 55,681 and 56,868. The one "Net Income" row used to show the second under the first's name.
  const filed = facts({
    NetIncomeLoss: { rows: [fact('2024-01-01', '2024-12-31', 58_471e6, '2026-02-13'), fact('2025-01-01', '2025-12-31', 57_048e6, '2026-02-13')] },
    NetIncomeLossAvailableToCommonStockholdersBasic: { rows: [fact('2024-01-01', '2024-12-31', 56_868e6, '2026-02-13'), fact('2025-01-01', '2025-12-31', 55_681e6, '2026-02-13')] },
  });

  it("keeps the feed's net income beside its net income to common", () => {
    const f = buildRealFund(engine.get('JPM US Equity')!, company, annual([
      ['NetIncome', '2025-12-31', 57_048e6], ['NetIncomeCommonStockholders', '2025-12-31', 55_681e6],
    ]), null, null, NOW, filed);
    expect(f.annual.find((p) => p.end === Date.parse('2025-12-31T00:00:00Z'))).toMatchObject({ niTotal: 57_048, ni: 55_681 });
  });

  it("takes the filing's net income where the feed gives only the common shareholders'", () => {
    const f = buildRealFund(engine.get('JPM US Equity')!, company, annual([['NetIncomeCommonStockholders', '2024-12-31', 56_868e6]]), null, null, NOW, filed);
    const fy = f.annual.find((p) => p.end === Date.parse('2024-12-31T00:00:00Z'))!;
    expect(fy).toMatchObject({ niTotal: 58_471, ni: 56_868 });
    expect(fy.supplements?.join(' ')).toContain('net income');
  });
});
