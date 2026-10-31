import { describe, expect, it } from 'vitest';
import { FACT_LINES, lineValues, parseCompanyFacts, periodColumns, standaloneQuarterValues, type FactTable, type XbrlFact } from '../src/data/live/sec';

const line = (key: string) => FACT_LINES.find((l) => l.key === key)!;
const q = (end: string, val: number, fp: string, filed = `${end.slice(0, 4)}-${String(Number(end.slice(5, 7)) + 1).padStart(2, '0')}-20`, accn = `0000000001-25-${end.slice(5, 7).padStart(6, '0')}`): XbrlFact => ({ start: '2025-01-01', end, val, accn, fy: 2025, fp, form: fp === 'FY' ? '10-K' : '10-Q', filed });

describe('SEC standalone quarterly monetary flows', () => {
  it('derives Q2, Q3 and Q4 from aligned cumulative disclosures and preserves both source inputs', () => {
    const rows = [q('2025-03-31', 10, 'Q1', '2025-04-20'), q('2025-06-30', 35, 'Q2', '2025-07-20'), q('2025-09-30', 30, 'Q3', '2025-10-20'), q('2025-12-31', 80, 'FY', '2026-02-20')];
    const facts: FactTable = { 'us-gaap:NetCashProvidedByUsedInOperatingActivities': { USD: rows } };
    const values = standaloneQuarterValues(facts, line('cfo'), 'USD');
    expect([...values.values()].map((r) => [r.end, r.val])).toEqual([['2025-03-31', 10], ['2025-12-31', 50], ['2025-09-30', -5], ['2025-06-30', 25]]);
    const second = values.get('2025-06-30')!;
    expect(second.start).toBe('2025-04-01');
    expect(second.derived).toEqual({ method: 'difference', current: rows[1], previous: rows[0] });
    expect(lineValues(facts, line('cfo'), 'USD', 'quarter').size).toBe(1);
  });

  it('uses direct standalone quarters before cumulative calculations', () => {
    const facts: FactTable = { 'us-gaap:Revenues': { USD: [q('2025-03-31', 10, 'Q1'), q('2025-06-30', 35, 'Q2'), { ...q('2025-06-30', 24, 'Q2'), start: '2025-04-01' }] } };
    const second = standaloneQuarterValues(facts, line('revenue'), 'USD').get('2025-06-30')!;
    expect(second.val).toBe(24);
    expect(second.derived).toBeUndefined();
  });

  it('prefers prior cumulative figures reported alongside the current total over a differently restated filing', () => {
    const first = q('2025-03-31', 10, 'Q1', '2025-04-20');
    const current = q('2025-06-30', 35, 'Q2', '2025-07-20');
    const sameFiling = { ...first, val: 12, filed: current.filed, accn: current.accn };
    const other = { ...first, val: 99, filed: current.filed, accn: '9999999999-25-999999' };
    const facts: FactTable = { 'us-gaap:Revenues': { USD: [first, current, sameFiling, other] } };
    const second = standaloneQuarterValues(facts, line('revenue'), 'USD').get('2025-06-30')!;
    expect(second.val).toBe(23);
    expect(second.derived?.previous.accn).toBe(current.accn);
  });

  it('never subtracts EPS or weighted averages', () => {
    const facts: FactTable = {
      'us-gaap:EarningsPerShareDiluted': { 'USD/shares': [q('2025-03-31', 1, 'Q1'), q('2025-06-30', 3, 'Q2')] },
      'us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding': { shares: [q('2025-03-31', 100, 'Q1'), q('2025-06-30', 120, 'Q2')] },
    };
    expect(standaloneQuarterValues(facts, line('epsDil'), 'USD').has('2025-06-30')).toBe(false);
    expect(standaloneQuarterValues(facts, line('dilShares'), 'USD').has('2025-06-30')).toBe(false);
  });

  it('requires the same fiscal start, currency and concept and never treats a half-year as a quarter', () => {
    const facts: FactTable = {
      'us-gaap:Revenues': { USD: [q('2025-06-30', 35, 'Q2')], EUR: [q('2025-03-31', 10, 'Q1')] },
      'us-gaap:SalesRevenueNet': { USD: [q('2025-03-31', 10, 'Q1')] },
    };
    expect(standaloneQuarterValues(facts, line('revenue'), 'USD').has('2025-06-30')).toBe(false);
    facts['us-gaap:Revenues'].USD.push({ ...q('2025-03-31', 10, 'Q1'), start: '2024-12-01' });
    expect(standaloneQuarterValues(facts, line('revenue'), 'USD').has('2025-06-30')).toBe(false);
  });

  it('keeps cash-flow-only period dates available when income tags are absent', () => {
    const cf = parseCompanyFacts(JSON.stringify({ cik: 1, facts: { 'us-gaap': { NetCashProvidedByUsedInOperatingActivities: { units: { USD: [q('2025-03-31', 10, 'Q1', '2025-04-20'), q('2025-06-30', 35, 'Q2', '2025-07-20')] } } } } }))!;
    expect(periodColumns(cf, 'USD', 'quarter', 8, true).map((c) => [c.end, c.kind])).toEqual([['2025-03-31', 'quarter'], ['2025-06-30', 'quarter']]);
  });

  it('adds explicitly calculated quarter columns without changing reported-only callers', () => {
    const cf = parseCompanyFacts(JSON.stringify({ cik: 1, facts: { 'us-gaap': { Revenues: { units: { USD: [q('2025-03-31', 10, 'Q1', '2025-04-20'), q('2025-06-30', 35, 'Q2', '2025-07-20')] } } } } }))!;
    expect(periodColumns(cf, 'USD', 'quarter', 8).map((c) => c.end)).toEqual(['2025-03-31']);
    expect(periodColumns(cf, 'USD', 'quarter', 8, true).map((c) => [c.end, c.label])).toEqual([['2025-03-31', 'Q1 FY2025'], ['2025-06-30', 'Q2 FY2025']]);
  });
});
