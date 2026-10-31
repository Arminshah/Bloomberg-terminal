/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { buildRealFund } from '../src/data/live/yfund';
import { secStatementRows } from '../src/data/live/statement-supplements';
import { FACT_LINES, type CompanyFacts, type FactTable, type XbrlFact } from '../src/data/live/sec';
const require = createRequire(import.meta.url);
const { validateFinancials } = require('../scripts/live/audit/domains.cjs');
const { formatAnnotations } = require('../scripts/live/audit/annotate.cjs');

// Structural inputs exercise definitions and observation alignment, not actual issuer amounts.
const NOW = Date.parse('2026-10-30T08:00:00Z');
const START = '2026-04-01';
const END = '2026-06-30';
const fact = (start: string, end: string, val: number, filed = '2026-08-03', form = '10-Q'): XbrlFact => ({ start, end, val, filed, form, accn: `0000000001-${filed}`, fy: 2026, fp: form === '10-K' ? 'FY' : 'Q2' });
const cf = (facts: FactTable): CompanyFacts => ({ cik: 1, name: 'Structural revenue observations', facts, ownEnd: {} });
const primary = () => ({ 'us-gaap:Revenues': { USD: [fact(START, END, 100e6)] } });
const at = Date.parse(END);

describe('diagnostic SEC revenue definitions', () => {
  it('retains concept priority and the warning even when another aligned filed definition matches the feed', () => {
    const facts = cf({ ...primary(),
      'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax': { USD: [fact(START, END, 95e6, '2026-09-01')] },
      'us-gaap:NetIncomeLoss': { USD: [fact(START, END, 20e6)] },
    });
    const supplement = secStatementRows(facts, 'USD', 'quarter', NOW).get(at)!;
    expect(supplement.row.get('TotalRevenue')).toBe(100e6);
    expect(supplement.observations.get('TotalRevenue')?.concept).toBe('us-gaap:Revenues');
    expect(supplement.revenueAlternatives).toMatchObject([{ concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', value: 95e6, start: START, end: at, filed: '2026-09-01' }]);
    const quarterly = { timeseries: { result: ['TotalRevenue', 'NetIncome', 'NetIncomeCommonStockholders'].map((field) => ({
      meta: { type: [`quarterly${field}`] }, [`quarterly${field}`]: [{ asOfDate: END, periodType: '3M', currencyCode: 'USD', reportedValue: { raw: field === 'TotalRevenue' ? 95e6 : 20e6 } }],
    })) } };
    const fund = buildRealFund(engine.get('XOM US Equity')!, { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } }, null, quarterly, null, NOW, facts, []);
    expect(fund.quarterly[0]).toMatchObject({ rev: 95, niTotal: 20, niTotalBasisConflict: true });
    expect(fund.quarterly[0].niTotalBasisDetails?.[0].revenueAlternatives).toEqual(supplement.revenueAlternatives);
  });

  it('excludes different starts, currencies, future observations and proxy facts without hiding an eligible older filing', () => {
    const facts = cf({ ...primary(),
      'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax': { USD: [fact(START, END, 95e6), fact(START, END, 999e6, '2026-12-01'), fact(START, END, 888e6, '2026-09-01', 'DEF 14A')] },
      'us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax': { EUR: [fact(START, END, 95e6)] },
      'us-gaap:SalesRevenueNet': { USD: [fact('2026-03-10', END, 95e6)] },
      'ifrs-full:Revenue': { USD: [fact('2027-04-01', '2027-06-30', 95e6)] },
    });
    const supplement = secStatementRows(facts, 'USD', 'quarter', NOW).get(at)!;
    expect(supplement.row.get('TotalRevenue')).toBe(100e6);
    expect(supplement.revenueAlternatives?.map((value) => [value.concept, value.value, value.filed])).toEqual([['us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 95e6, '2026-08-03']]);
  });

  it('uses aligned cumulative disclosures to derive a standalone-quarter alternative', () => {
    const facts = cf({ ...primary(), 'us-gaap:SalesRevenueNet': { USD: [
      fact('2026-01-01', '2026-03-31', 80e6), fact('2026-01-01', END, 175e6),
    ] } });
    const alternative = secStatementRows(facts, 'USD', 'quarter', NOW).get(at)!.revenueAlternatives![0];
    expect(alternative).toMatchObject({ concept: 'us-gaap:SalesRevenueNet', value: 95e6, start: START, end: at });
    expect(alternative.source).toContain('calculated from aligned reported totals');
  });

  it('keeps annual alternatives on the exact selected annual start and rejects same-end quarterly observations', () => {
    const end = '2025-12-31';
    const facts = cf({ 'us-gaap:Revenues': { USD: [fact('2025-01-01', end, 100e6, '2026-02-01', '10-K')] },
      'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax': { USD: [fact('2025-01-02', end, 94e6, '2026-02-01', '10-K'), fact('2025-01-01', end, 95e6, '2026-02-01', '10-K')] },
      'us-gaap:SalesRevenueNet': { USD: [fact('2025-10-01', end, 25e6, '2026-02-01', '10-K')] },
    });
    const supplement = secStatementRows(facts, 'USD', 'annual', NOW).get(Date.parse(end))!;
    expect(supplement.row.get('TotalRevenue')).toBe(100e6);
    expect(supplement.revenueAlternatives).toMatchObject([{ start: '2025-01-01', value: 95e6 }]);
    expect(supplement.revenueAlternatives).toHaveLength(1);
  });

  it('keeps the selected definition, all recognized alternatives and source context visible within a public row', () => {
    const concepts = FACT_LINES.find((line) => line.key === 'revenue')!.concepts;
    const sourceUrl = 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json';
    const differences = [{ field: 'TotalRevenue', currency: 'USD', unit: 'raw monetary units', observations: [
      { source: 'Yahoo Finance statement time series', value: 95e9, end: at },
      { source: 'SEC EDGAR 10-Q, filed 03/08/2026', value: 100e9, start: START, end: at, filed: '2026-08-03', concept: concepts[0], sourceUrl },
    ], revenueAlternatives: concepts.slice(1).map((concept) => ({ source: 'SEC EDGAR 10-Q', concept, value: 95e9, start: START, end: at, filed: '2026-08-03', sourceUrl })) }];
    const rows = validateFinancials({ schema: 1, domain: 'financials', capturedAt: NOW, periods: [{ label: 'LTM', niTotalBasisConflict: true, niTotalBasisDetails: differences }] }, 'XOM', NOW);
    expect(rows).toMatchObject([{ status: 'INCOMPLETE', basisDifferences: differences }]);
    const annotations = formatAnnotations({ summary: { assurance: 'incomplete', exitCode: 3, pass: 0, fail: 0, flagged: 0, blocked: 0, incomplete: 1, skip: 0 }, rows }, {});
    for (const concept of concepts) expect(annotations).toContain(concept);
    for (const detail of [sourceUrl, `start=${START}`, 'filed=2026-08-03', 'diagnostic only; a match does not resolve the warning']) expect(annotations).toContain(detail);
    expect(annotations).not.toContain('[truncated]');
  });
});
