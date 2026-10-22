import { afterEach, describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { emptyPeriod, financials, latestDebtPeriod, priorStatementPeriod, reportCcy } from '../src/data/fundamentals';
import { buildRealFund, periodFrom, realFund, seriesByPeriod } from '../src/data/live/yfund';
import { parseCompanyFacts } from '../src/data/live/sec';
import summary from './fixtures/yahoo-apld-summary.json';
import timeseries from './fixtures/yahoo-apld-timeseries.json';

const def = engine.get('APLD US Equity')!;
const date = (s: string) => Date.parse(`${s}T00:00:00Z`);
const NOW = date('2026-10-20');
const series = (prefix: string, rows: [string, string, number | null, string?, string?][]) => ({ timeseries: { result: rows.map(([field, end, raw, periodType, currency]) => ({
  meta: { type: [`${prefix}${field}`] },
  [`${prefix}${field}`]: [{ asOfDate: end, periodType: periodType ?? (prefix === 'quarterly' ? '3M' : prefix === 'trailing' ? 'TTM' : '12M'), currencyCode: currency ?? 'USD', reportedValue: raw == null ? {} : { raw } }],
})) } });
const fund = (annual: unknown, quarter: unknown, trailing: unknown = null, company: unknown = {}) =>
  buildRealFund(def, company, annual, quarter, trailing, NOW);

afterEach(() => realFund.delete(def.id));

describe('financial statement completeness without invented periods', () => {
  it('preserves trailing TTM fields and a valid observation before an empty duplicate', () => {
    const input = series('trailing', [['TotalRevenue', '2026-08-31', 100], ['TotalRevenue', '2026-08-31', null]]);
    expect(seriesByPeriod(input, 'trailing').get(date('2026-08-31'))?.get('TotalRevenue')).toBe(100);
    expect(seriesByPeriod(series('quarterly', [['TotalRevenue', '2026-08-31', 300, '9M']]), 'quarterly').size).toBe(0);
  });

  it("reads an IFRS filer's operating cash flow (continuing operations) when the plain line is missing", () => {
    const f = fund(series('annual', [['TotalRevenue', '2025-12-31', 32667e6], ['CashFlowFromContinuingOperatingActivities', '2025-12-31', 12658.5e6], ['CapitalExpenditure', '2025-12-31', -1631.2e6]]), null);
    expect(f.annual[0].cfo).toBeCloseTo(12658.5, 6);
    const both = fund(series('annual', [['TotalRevenue', '2025-12-31', 100e6], ['OperatingCashFlow', '2025-12-31', 20e6], ['CashFlowFromContinuingOperatingActivities', '2025-12-31', 19e6]]), null);
    expect(both.annual[0].cfo).toBe(20);
  });

  it('selects the newest reporting currency and excludes obsolete monetary observations', () => {
    const annual = series('annual', [['TotalRevenue', '2025-05-31', 10e9, undefined, 'RUB'], ['TotalRevenue', '2026-05-31', 100e6]]);
    const f = fund(annual, null);
    expect(f.currency).toBe('USD');
    expect(f.annual).toHaveLength(1);
    expect(f.annual[0].rev).toBe(100);
  });

  it('fills a missing balance cell from the exact-date balance and requires both debt components', () => {
    const row = new Map([['TotalDebt', NaN], ['CurrentDebtAndCapitalLeaseObligation', 10e6], ['LongTermDebtAndCapitalLeaseObligation', 90e6]]);
    expect(periodFrom('Q1', NOW, row).debt).toBe(100);
    expect(periodFrom('LTM', NOW, new Map([['TotalDebt', NaN]]), new Map([['TotalDebt', 30e6]])).debt).toBe(30);
    row.delete('CurrentDebtAndCapitalLeaseObligation');
    expect(periodFrom('Q1', NOW, row).debt).toBeNaN();
  });

  it('keeps annual-only and quarterly-only observations on their own views', () => {
    const yearly = fund(series('annual', [['TotalRevenue', '2026-05-31', 100e6]]), null);
    realFund.set(def.id, yearly);
    expect(financials(def).quarterly).toEqual([]);
    expect(financials(def).ltm).toMatchObject({ label: 'LTM', basis: 'annual', rev: 100 });
    const quarter = fund(null, series('quarterly', [['TotalRevenue', '2026-08-31', 50e6]]));
    realFund.set(def.id, quarter);
    expect(financials(def).annual).toEqual([]);
    expect(financials(def).ltm.rev).toBeNaN();
  });

  it('fills sparse current trailing fields from four compatible consecutive quarters', () => {
    const ends = ['2025-11-30', '2026-02-28', '2026-05-31', '2026-08-31'];
    const q = series('quarterly', ends.flatMap((end): [string, string, number][] => [['TotalRevenue', end, 100e6], ['GrossProfit', end, 40e6], ['OperatingCashFlow', end, 10e6]]));
    const f = fund(null, q, series('trailing', [['TotalRevenue', '2026-08-31', 400e6]]));
    expect(f.ltm).toMatchObject({ basis: 'trailing', rev: 400, gp: 160, cfo: 40 });
  });

  it('does not use an obsolete trailing period or a newer balance inside it', () => {
    const f = fund(null, series('quarterly', [['TotalRevenue', '2026-08-31', 100e6], ['TotalDebt', '2026-08-31', 200e6]]), series('trailing', [['TotalRevenue', '2026-05-31', 300e6]]));
    expect(f.ltm).toBeNull();
  });

  it('reuses fiscal-year-end balances at the same instant and keeps the provider reporting currency', () => {
    const f = fund(series('annual', [['TotalRevenue', '2026-05-31', 100e6], ['TotalDebt', '2026-05-31', 50e6]]), series('quarterly', [['TotalRevenue', '2026-05-31', 20e6]]));
    expect(f.quarterly[0].debt).toBe(50);
    realFund.set(def.id, fund(null, null, null, { quoteSummary: { result: [{ financialData: { financialCurrency: 'EUR' } }] } }));
    expect(reportCcy(def)).toBe('EUR');
  });

  it('uses the dated current debt snapshot without assigning it to past quarters', () => {
    const company = { quoteSummary: { result: [{ defaultKeyStatistics: { mostRecentQuarter: { raw: date('2026-08-31') / 1000 } }, financialData: { totalDebt: { raw: 200e6 } } }] } };
    const f = fund(null, series('quarterly', [['TotalRevenue', '2026-05-31', 20e6], ['TotalRevenue', '2026-08-31', 50e6]]), null, company);
    expect(f.quarterly[0].debt).toBeNaN();
    expect(f.quarterly[1].debt).toBe(200);
    expect(f.quarterly[1].supplements?.[0]).toContain('31/08/2026');
    const noIncome = fund(null, null, null, company);
    expect(noIncome.quarterly).toEqual([]);
    expect(noIncome.balance).toMatchObject({ debt: 200, end: date('2026-08-31') });
  });

  it('does not call the earnings chart profit net income attributable to common stockholders', () => {
    const f = buildRealFund(def, structuredClone(summary), timeseries, timeseries, timeseries, NOW);
    expect(f.quarterly.at(-1)?.ni).toBeNaN();
    expect(f.quarterly.at(-1)?.eps).toBeNaN();
  });
});

describe('SEC statement supplements', () => {
  const row = (val: number, unit = 'USD') => ({ units: { [unit]: [{ start: '2026-06-01', end: '2026-08-31', val, accn: '0000000000-26-000001', form: '10-Q', filed: '2026-10-07', fy: 2027, fp: 'Q1' }] } });
  const cf = () => parseCompanyFacts(JSON.stringify({ cik: 1, entityName: 'Example', facts: { 'us-gaap': {
    Revenues: row(100e6), GrossProfit: row(40e6), EarningsPerShareDiluted: row(-0.82, 'USD/shares'),
    NetIncomeLoss: row(-50e6), NetIncomeLossAvailableToCommonStockholdersBasic: row(-60e6),
  } } }))!;

  it('fills only compatible exact-period cells with their real filing source and common-income basis', () => {
    const f = buildRealFund(def, { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } }, null,
      series('quarterly', [['TotalRevenue', '2026-08-31', 100e6]]), null, NOW, cf());
    expect(f.quarterly[0]).toMatchObject({ rev: 100, gp: 40, eps: -0.82, ni: -60 });
    expect(f.quarterly[0].supplements?.join()).toContain('SEC EDGAR 10-Q, filed 07/10/2026');
  });

  it('does not blend income statement bases when the primary revenue conflicts', () => {
    const f = buildRealFund(def, { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } }, null,
      series('quarterly', [['TotalRevenue', '2026-08-31', 200e6]]), null, NOW, cf());
    expect(f.quarterly[0].rev).toBe(200);
    expect(f.quarterly[0].gp).toBeNaN();
  });

  it('rejects income blending when net income conflicts even though revenues agree', () => {
    const f = buildRealFund(def, { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } }, null,
      series('quarterly', [['TotalRevenue', '2026-08-31', 100e6], ['NetIncomeCommonStockholders', '2026-08-31', -20e6]]), null, NOW, cf());
    expect(f.quarterly[0].ni).toBe(-20);
    expect(f.quarterly[0].gp).toBeNaN();
    expect(f.quarterly[0].eps).toBeNaN();
  });

  it('keeps the reported EPS when revenue was restated but net income to common shareholders agrees', () => {
    // Revenue restated for discontinued operations (200 against the filing's 100); net income and EPS unchanged.
    const f = buildRealFund(def, { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } }, null,
      series('quarterly', [['TotalRevenue', '2026-08-31', 200e6], ['NetIncomeCommonStockholders', '2026-08-31', -60e6]]), null, NOW, cf());
    expect(f.quarterly[0]).toMatchObject({ rev: 200, ni: -60, eps: -0.82 });
    expect(f.quarterly[0].gp).toBeNaN();
  });

  it('uses reported net income for the common shareholders only when diluted EPS times shares gives it back', () => {
    const facts = (ni: number) => parseCompanyFacts(JSON.stringify({ cik: 1, entityName: 'Example', facts: { 'us-gaap': {
      Revenues: row(100e6), NetIncomeLoss: row(ni), EarningsPerShareDiluted: row(0.5, 'USD/shares'), WeightedAverageNumberOfDilutedSharesOutstanding: row(40e6, 'shares'),
    } } }))!;
    const company = { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } };
    const q = series('quarterly', [['TotalRevenue', '2026-08-31', 100e6]]);
    expect(buildRealFund(def, company, null, q, null, NOW, facts(20e6)).quarterly[0].ni).toBe(20);
    // 25 million against 0.50 × 40 million shares: something (preferred dividends) comes between them.
    expect(buildRealFund(def, company, null, q, null, NOW, facts(25e6)).quarterly[0].ni).toBeNaN();
  });
});

describe('dated financial comparisons and cost of capital inputs', () => {
  it('selects the latest observed debt including zero, and never the first nonmissing historical row', () => {
    const periods = [
      { ...emptyPeriod('FY', date('2025-12-31')), debt: 100 },
      { ...emptyPeriod('Q1', date('2026-03-31')), debt: 0 },
      { ...emptyPeriod('Q2', date('2026-06-30')), debt: NaN },
    ];
    expect(latestDebtPeriod(periods)?.debt).toBe(0);
  });

  it('does not describe growth across a skipped period as quarterly or annual growth', () => {
    const current = emptyPeriod('Q2', date('2026-06-30'));
    const yearAgo = emptyPeriod('Q2', date('2025-06-30'));
    const halfAgo = emptyPeriod('Q4', date('2025-12-31'));
    expect(priorStatementPeriod([yearAgo, halfAgo, current], current, 'year')).toBe(yearAgo);
    expect(priorStatementPeriod([yearAgo, halfAgo, current], current, 'quarter')).toBeUndefined();
  });
});
