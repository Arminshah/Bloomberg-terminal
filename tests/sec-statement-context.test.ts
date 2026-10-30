import { describe, expect, it } from 'vitest';
import { BUYBACK_LINES, FACT_LINES, lineValues, parseCompanyFacts, periodColumns, reportingCurrency, standaloneQuarterValues, type FactTable, type XbrlFact } from '../src/data/live/sec';

const line = (key: string) => FACT_LINES.find((item) => item.key === key)!;
const annual: XbrlFact = { start: '2024-01-01', end: '2024-12-31', val: 70, accn: '0000000001-25-000001', fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' };

describe('financial statement document context', () => {
  it('ignores proxy compensation observations while preserving a genuine amended annual statement and its original', () => {
    const observations = [annual,
      { ...annual, val: 71.5, form: 'DEF 14A', filed: '2025-04-01', accn: '0000000001-25-000002' },
      { ...annual, val: 69.5, form: '10-K/A', filed: '2025-05-01', accn: '0000000001-25-000003' },
      { ...annual, val: 999, form: 'DEFA14A', filed: '2025-06-01', accn: '0000000001-25-000004' },
    ];
    const facts: FactTable = { 'us-gaap:NetIncomeLoss': { USD: observations } };
    expect(lineValues(facts, line('netInc'), 'USD', 'annual').get(annual.end)).toMatchObject({
      val: 69.5, form: '10-K/A', filed: '2025-05-01', orig: { val: 70, form: '10-K' }, restated: true,
    });
    expect(facts['us-gaap:NetIncomeLoss'].USD).toEqual(observations);
  });

  it('does not derive a standalone quarter from compensation-table cumulative figures', () => {
    const first: XbrlFact = { ...annual, start: '2025-01-01', end: '2025-03-31', val: 10, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-04-20' };
    const second: XbrlFact = { ...first, end: '2025-06-30', val: 35, fp: 'Q2', filed: '2025-07-20', accn: '0000000001-25-000002' };
    const facts: FactTable = { 'us-gaap:NetIncomeLoss': { USD: [first, second,
      { ...first, val: 100, form: 'DEF 14A', filed: '2025-08-01', accn: '0000000001-25-000003' },
      { ...second, val: 300, form: 'DEF 14A', filed: '2025-08-01', accn: '0000000001-25-000003' },
    ] } };
    expect(standaloneQuarterValues(facts, line('netInc'), 'USD').get(second.end)).toMatchObject({
      val: 25, start: '2025-04-01', derived: { current: second, previous: first },
    });
  });

  it('retains raw proxy data without letting it create statement periods or change the reporting currency', () => {
    const proxy = { ...annual, start: '2025-01-01', end: '2025-12-31', val: 80, fy: 2025, form: 'DEF 14A', filed: '2026-04-01', accn: '0000000001-26-000001' };
    const parsed = parseCompanyFacts(JSON.stringify({ cik: 1, facts: { 'us-gaap': { NetIncomeLoss: { units: { USD: [annual], EUR: [proxy] } } } } }))!;
    expect(parsed.facts['us-gaap:NetIncomeLoss'].EUR[0]).toMatchObject(proxy);
    expect(reportingCurrency(parsed.facts)).toBe('USD');
    expect(periodColumns(parsed, 'EUR', 'annual', 5)).toEqual([]);
  });

  it('preserves separate research disclosures outside the standard financial statement lines', () => {
    const program = BUYBACK_LINES.find((item) => item.key === 'bbValue')!;
    const proxy = { ...annual, val: 200, form: 'DEF 14A', filed: '2025-04-01' };
    const facts: FactTable = { [program.concepts[0]]: { USD: [proxy] } };
    expect(lineValues(facts, program, 'USD', 'annual').get(annual.end)).toMatchObject({ val: 200, form: 'DEF 14A' });
  });
});
