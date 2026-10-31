import { describe, expect, it } from 'vitest';
import { parentIncomeMargin } from '../src/data/fundamentals';
import { buildRealFund, periodFrom, sumQuarters } from '../src/data/live/yfund';
import { parseCompanyFacts } from '../src/data/live/sec';
import { engine } from '../src/data/market';

// Synthetic source observations test line definitions and joins, not live company facts.
const NOW = Date.parse('2026-10-30');
const END = '2025-12-31';
const company = engine.get('TSLA US Equity')!;
const summary = { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } };
type Input = [field: string, end: string, value: number, currency?: string];
const series = (kind: 'annual' | 'quarterly' | 'trailing', inputs: Input[]) => ({ timeseries: { result: inputs.map(([field, end, value, currency = 'USD']) => ({
  meta: { type: [`${kind}${field}`] },
  [`${kind}${field}`]: [{ asOfDate: end, periodType: kind === 'annual' ? '12M' : kind === 'quarterly' ? '3M' : 'TTM', currencyCode: currency, reportedValue: { raw: value } }],
})) } });
const rows = (end = END, standardized = 30e6, reported: number | null = 10e6): Input[] => [
  ['TotalRevenue', end, 100e6], ['NetIncome', end, 22e6], ['NetIncomeCommonStockholders', end, 22e6],
  ['OperatingIncome', end, standardized], ['ReconciledDepreciation', end, 2e6],
  ...(reported === null ? [] : [['TotalOperatingIncomeAsReported', end, reported] as Input]),
];
const facts = (periods = [{ start: '2025-01-01', end: END }], revenue = 100e6) => parseCompanyFacts(JSON.stringify({ cik: 1, entityName: 'Structural operating lines', facts: { 'us-gaap': Object.fromEntries([
  ['Revenues', revenue], ['OperatingIncomeLoss', 10e6], ['NetIncomeLoss', 20e6], ['NetIncomeLossAvailableToCommonStockholdersBasic', 22e6],
].map(([tag, val]) => [tag, { units: { USD: periods.map(({ start, end }) => ({ start, end, val, form: start === '2025-01-01' && end === END ? '10-K' : '10-Q', filed: '2026-02-15', accn: '0000000001-26-000001', fy: 2025, fp: end === END ? 'FY' : 'Q1' })) } }])) } }))!;

describe('reported and standardized operating-income lines', () => {
  it('uses the reported line for display, EBITDA and basis checks while preserving the standardized alternative', () => {
    const fund = buildRealFund(company, summary, series('annual', rows()), null, null, NOW, facts(), []);
    const period = fund.annual[0];
    expect(period).toMatchObject({ opInc: 10, ebitda: 12, niTotal: 20, ni: 22 });
    expect(period.operatingIncomeVariants).toEqual([
      { field: 'TotalOperatingIncomeAsReported', source: 'Yahoo Finance statement time series TotalOperatingIncomeAsReported', value: 10, end: Date.parse(END), selected: true },
      { field: 'OperatingIncome', source: 'Yahoo Finance statement time series OperatingIncome', value: 30, end: Date.parse(END), selected: false },
    ]);
    expect(period.niTotalBasisConflict).toBeUndefined();
    expect(parentIncomeMargin(period)).toBe(20);
  });

  it('retains a conflict when the reported line differs from SEC even if the standardized alternative matches', () => {
    const period = buildRealFund(company, summary, series('annual', rows(END, 10e6, 30e6)), null, null, NOW, facts(), []).annual[0];
    expect(period).toMatchObject({ opInc: 30, niTotalBasisConflict: true });
    expect(period.niTotalBasisDetails?.[0].observations).toMatchObject([
      { source: 'Yahoo Finance statement time series TotalOperatingIncomeAsReported', value: 30e6 },
      { value: 10e6 },
    ]);
    expect(parentIncomeMargin(period)).toBeNaN();
  });

  it('preserves the existing warning when the reported line is absent', () => {
    const period = buildRealFund(company, summary, series('annual', rows(END, 30e6, null)), null, null, NOW, facts(), []).annual[0];
    expect(period).toMatchObject({ opInc: 30, niTotalBasisConflict: true });
    expect(period.operatingIncomeVariants).toBeUndefined();
    expect(parentIncomeMargin(period)).toBeNaN();
  });

  it.each([0, -4e6])('keeps a finite reported operating result of %s instead of a positive standardized result', (reported) => {
    const period = periodFrom('FY', Date.parse(END), new Map([['OperatingIncome', 30e6], ['TotalOperatingIncomeAsReported', reported]]));
    expect(period.opInc).toBe(reported / 1e6);
  });

  it('does not use a reported line from another currency or another fiscal period to resolve a conflict', () => {
    const input = [...rows(END, 30e6, null), ['TotalOperatingIncomeAsReported', END, 10e6, 'EUR'] as Input, ['TotalOperatingIncomeAsReported', '2025-12-30', 10e6] as Input];
    const period = buildRealFund(company, summary, series('annual', input), null, null, NOW, facts(), []).annual.find((p) => p.end === Date.parse(END))!;
    expect(period).toMatchObject({ opInc: 30, niTotalBasisConflict: true });
    expect(period.operatingIncomeVariants).toBeUndefined();
  });

  it('retains individual quarterly alternatives and a separate reported trailing observation', () => {
    const quarters = [
      { start: '2025-01-01', end: '2025-03-31' }, { start: '2025-04-01', end: '2025-06-30' },
      { start: '2025-07-01', end: '2025-09-30' }, { start: '2025-10-01', end: END },
    ];
    const trailing: Input[] = [['TotalRevenue', END, 400e6], ['NetIncome', END, 88e6], ['NetIncomeCommonStockholders', END, 88e6], ['OperatingIncome', END, 120e6], ['TotalOperatingIncomeAsReported', END, 40e6]];
    const fund = buildRealFund(company, summary, null, series('quarterly', quarters.flatMap(({ end }) => rows(end))), series('trailing', trailing), NOW, facts(quarters), []);
    expect(fund.quarterly.map((p) => p.opInc)).toEqual([10, 10, 10, 10]);
    const summed = sumQuarters(fund.quarterly);
    expect(summed.opInc).toBe(40);
    expect(summed.operatingIncomeVariants).toHaveLength(8);
    expect(summed.operatingIncomeVariants?.filter((value) => value.selected).map((value) => value.end)).toEqual(quarters.map(({ end }) => Date.parse(end)));
    expect(fund.ltm).toMatchObject({ basis: 'trailing', opInc: 40 });
    expect(fund.ltm?.operatingIncomeVariants?.map((variant) => variant.value)).toEqual([40, 120]);
    expect(fund.ltm?.niTotalBasisConflict).toBeUndefined();
  });

  it('does not let a reported feed line override an existing whole-statement filed-basis selection', () => {
    const bank = engine.get('JPM US Equity')!;
    const period = buildRealFund(bank, summary, series('annual', rows()), null, null, NOW, facts(undefined, 110e6), []).annual[0];
    expect(period).toMatchObject({ rev: 110, opInc: 10 });
    expect(period.operatingIncomeVariants).toBeUndefined();
  });
});
