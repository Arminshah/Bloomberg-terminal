import { afterEach, describe, expect, it } from 'vitest';
import { emptyPeriod, keyStats, parentIncomeMargin } from '../src/data/fundamentals';
import { buildRealFund, realFund, sumQuarters } from '../src/data/live/yfund';
import { parseCompanyFacts } from '../src/data/live/sec';
import { appCandidates } from '../src/data/screen';
import { engine } from '../src/data/market';

// Structural observations reproduce the cross-field selection gate. These are
// deliberately synthetic and do not independently corroborate any company's historical figures.
const NOW = Date.parse('2026-10-30T00:00:00Z');
const company = engine.get('TSLA US Equity')!;
const summary = { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD', profitMargins: { raw: 0.99 } } }] } };
const series = (kind: 'annual' | 'quarterly' | 'trailing', rows: [string, string, number][]) => ({ timeseries: { result: rows.map(([field, end, raw]) => ({
  meta: { type: [`${kind}${field}`] },
  [`${kind}${field}`]: [{ asOfDate: end, periodType: kind === 'annual' ? '12M' : kind === 'quarterly' ? '3M' : 'TTM', currencyCode: 'USD', reportedValue: { raw } }],
})) } });
const cf = (rows: { start: string; end: string; operating?: number }[]) => parseCompanyFacts(JSON.stringify({ cik: 1, entityName: 'Structural statement example', facts: { 'us-gaap': Object.fromEntries([
  ['Revenues', 100e6], ['NetIncomeLoss', 20e6], ['NetIncomeLossAvailableToCommonStockholdersBasic', 22e6], ['OperatingIncomeLoss', 10e6],
].map(([tag, value]) => [tag, { units: { USD: rows.map((row) => ({ start: row.start, end: row.end, val: tag === 'OperatingIncomeLoss' ? row.operating ?? value : value, form: row.start.endsWith('01-01') && row.end.endsWith('12-31') ? '10-K' : '10-Q', filed: '2026-02-15', accn: '0000000001-26-000001', fy: 2025, fp: row.end.endsWith('12-31') ? 'FY' : 'Q1' })) } }])) } }))!;
const annualRows = (operating = 10e6): [string, string, number][] => [
  ['TotalRevenue', '2025-12-31', 100e6], ['NetIncome', '2025-12-31', 22e6],
  ['NetIncomeCommonStockholders', '2025-12-31', 22e6], ['OperatingIncome', '2025-12-31', operating],
  ['DilutedEPS', '2025-12-31', 0.55], ['DilutedAverageShares', '2025-12-31', 40e6],
];

afterEach(() => realFund.delete(company.id));

describe('parent-attributable income across statement-basis conflicts', () => {
  it('selects the exact filed parent line despite a conflicting operating line, keeping common income and EPS separate', () => {
    const fund = buildRealFund(company, summary, series('annual', annualRows(30e6)), null, null, NOW,
      cf([{ start: '2025-01-01', end: '2025-12-31' }]), []);
    const period = fund.annual[0];
    expect(period).toMatchObject({ rev: 100, opInc: 30, niTotal: 20, ni: 22, eps: 0.55, niTotalBasisConflict: true });
    expect(period.niTotalFiled).toMatchObject({ end: Date.parse('2025-12-31T00:00:00Z') });
    expect(period.niTotalFiled?.source).toContain('SEC EDGAR 10-K');
    expect(parentIncomeMargin(period)).toBeNaN();
    expect(period.supplements?.join(' ')).toContain('margins are withheld');
  });

  it('computes the parent-income margin when the remaining statement lines agree', () => {
    const fund = buildRealFund(company, summary, series('annual', annualRows()), null, null, NOW,
      cf([{ start: '2025-01-01', end: '2025-12-31' }]), []);
    expect(fund.annual[0]).toMatchObject({ niTotal: 20, ni: 22 });
    expect(fund.annual[0].niTotalBasisConflict).toBeUndefined();
    expect(parentIncomeMargin(fund.annual[0])).toBe(20);
  });

  it('keeps unknown and invalid margins unknown, including a nonpositive revenue denominator', () => {
    expect(parentIncomeMargin(undefined)).toBeNaN();
    expect(parentIncomeMargin({ niTotal: 20, rev: 0 })).toBeNaN();
    expect(parentIncomeMargin({ niTotal: 20, rev: -10 })).toBeNaN();
    expect(parentIncomeMargin({ niTotal: NaN, rev: 100 })).toBeNaN();
    expect(parentIncomeMargin({ niTotal: 20, rev: Infinity })).toBeNaN();
  });

  it('withholds a margin when a later earnings-module selection changes the filed parent-income revenue basis', () => {
    const withEarnings = { quoteSummary: { result: [{
      ...summary.quoteSummary.result[0],
      earnings: { financialsChart: { yearly: [{ date: '2025', revenue: 120e6 }] } },
    }] } };
    const fund = buildRealFund(company, withEarnings, series('annual', annualRows()), null, null, NOW,
      cf([{ start: '2025-01-01', end: '2025-12-31' }]), []);
    expect(fund.annual[0]).toMatchObject({ rev: 120, niTotal: 20, niTotalBasisConflict: true });
    expect(parentIncomeMargin(fund.annual[0])).toBeNaN();
  });

  it('does not copy one quarter’s filed provenance onto a partly unfiled twelve-month total', () => {
    const periods = [1, 2, 3, 4].map((quarter) => ({ ...emptyPeriod(`Q${quarter}`), niTotal: 20, rev: 100 }));
    periods[3].niTotalFiled = { end: 4, source: 'Structural filed observation' };
    expect(sumQuarters(periods).niTotalFiled).toBeUndefined();
  });

  it('carries all four filed parent observations into a compatible trailing result without replacing common EPS inputs', () => {
    const quarters = [['2025-01-01', '2025-03-31'], ['2025-04-01', '2025-06-30'], ['2025-07-01', '2025-09-30'], ['2025-10-01', '2025-12-31']];
    const quarterly = quarters.flatMap(([, end]): [string, string, number][] => [
      ['TotalRevenue', end, 100e6], ['NetIncome', end, 22e6], ['NetIncomeCommonStockholders', end, 22e6], ['OperatingIncome', end, 10e6], ['DilutedEPS', end, 0.55], ['DilutedAverageShares', end, 40e6],
    ]);
    const trailing = series('trailing', [
      ['TotalRevenue', '2025-12-31', 400e6], ['NetIncome', '2025-12-31', 88e6], ['NetIncomeCommonStockholders', '2025-12-31', 88e6], ['OperatingIncome', '2025-12-31', 40e6], ['DilutedEPS', '2025-12-31', 2.2],
    ]);
    const fund = buildRealFund(company, summary, null, series('quarterly', quarterly), trailing, NOW,
      cf(quarters.map(([start, end]) => ({ start, end }))), []);
    expect(fund.quarterly).toHaveLength(4);
    expect(fund.ltm).toMatchObject({ basis: 'trailing', niTotal: 80, ni: 88, eps: 2.2 });
    expect(fund.ltm?.niTotalFiled?.source).toContain('Sum of four filed quarters');
    expect(parentIncomeMargin(fund.ltm!)).toBe(20);
  });

  it('keeps screener and headline margins blank even if the provider gives a numeric margin on an unresolved basis', () => {
    const fund = buildRealFund(company, summary, series('annual', annualRows(30e6)), null, null, NOW,
      cf([{ start: '2025-01-01', end: '2025-12-31' }]), []);
    realFund.set(company.id, fund);
    expect(keyStats(company).netMargin).toBeNaN();
    const candidate = appCandidates().find((item) => item.id === company.id)!;
    expect(candidate.values['netMargin@lfy']).toBeNaN();
    expect(candidate.values.netMargin).toBeNaN();
    expect(candidate.values['ni@lfy']).toBe(20);
  });

  it('preserves a conflict when a missing trailing parent value is filled from partly filed quarters', () => {
    const quarters = [['2025-01-01', '2025-03-31'], ['2025-04-01', '2025-06-30'], ['2025-07-01', '2025-09-30'], ['2025-10-01', '2025-12-31']];
    const quarterly = quarters.flatMap(([, end]): [string, string, number][] => [
      ['TotalRevenue', end, 100e6], ['NetIncome', end, 22e6], ['NetIncomeCommonStockholders', end, 22e6], ['OperatingIncome', end, 10e6],
    ]);
    const fund = buildRealFund(company, summary, null, series('quarterly', quarterly), series('trailing', [
      ['TotalRevenue', '2025-12-31', 400e6], ['NetIncomeCommonStockholders', '2025-12-31', 88e6], ['OperatingIncome', '2025-12-31', 40e6],
    ]), NOW, cf(quarters.slice(0, 3).map(([start, end]) => ({ start, end, operating: 5e6 }))), []);
    expect(fund.ltm).toMatchObject({ basis: 'trailing', niTotal: 82, niTotalBasisConflict: true });
    expect(fund.ltm?.niTotalFiled).toBeUndefined();
    expect(parentIncomeMargin(fund.ltm!)).toBeNaN();
  });
});
