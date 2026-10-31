/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parentIncomeMargin } from '../src/data/fundamentals';
import { engine } from '../src/data/market';
import { exxonRevenueDefinition } from '../src/data/live/revenue-basis';
import { secStatementRows } from '../src/data/live/statement-supplements';
import { buildRealFund, sumQuarters } from '../src/data/live/yfund';
import type { CompanyFacts, XbrlFact } from '../src/data/live/sec';
const require = createRequire(import.meta.url);
const { validateFinancials } = require('../scripts/live/audit/domains.cjs');
const { formatAnnotations } = require('../scripts/live/audit/annotate.cjs');

// Retained primary-source review: docs/accuracy-primary-sources-2026-10-30.md, section 3.
// Revenue uses the reviewed Q2 values; net income is synthetic to exercise the selection gate.
// No new network claim is made.
const NOW = Date.parse('2026-10-30T23:00:00Z');
const END = Date.parse('2026-06-30T00:00:00Z');
const ACCESSION = '0000034088-26-000093';
const company = engine.get('XOM US Equity')!;
const fact = (val: number): XbrlFact => ({ start: '2026-04-01', end: '2026-06-30', val, filed: '2026-08-03', form: '10-Q', accn: ACCESSION, fy: 2026, fp: 'Q2' });
const facts = (cik = 34088): CompanyFacts => ({ cik, name: 'EXXON MOBIL CORP', ownEnd: { [ACCESSION]: '2026-06-30' }, facts: {
  'us-gaap:Revenues': { USD: [fact(116_017e6)] }, 'us-gaap:NetIncomeLoss': { USD: [fact(10_000e6)] },
} });
const summary = { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } };
const quarterly = { timeseries: { result: ['TotalRevenue', 'NetIncome', 'NetIncomeCommonStockholders'].map((field) => ({
  meta: { type: [`quarterly${field}`] }, [`quarterly${field}`]: [{ asOfDate: '2026-06-30', periodType: '3M', currencyCode: 'USD', reportedValue: { raw: field === 'TotalRevenue' ? 114_529e6 : 10_000e6 } }],
})) } };
const supplement = () => secStatementRows(facts(), 'USD', 'quarter', NOW).get(END)!;

describe('reviewed Exxon revenue basis', () => {
  it.each([34088, 2115436])('labels the exact reviewed filing under issuer CIK %i, keeping both amounts and withholding the mixed-basis margin', (cik) => {
    const fund = buildRealFund(company, summary, null, quarterly, null, NOW, facts(cik), []);
    const period = fund.quarterly[0];
    expect(period.rev).toBe(114_529);
    expect(period.niTotal).toBe(10_000);
    expect(period.niTotalBasisConflict).toBe(true);
    expect(parentIncomeMargin(period)).toBeNaN();
    const difference = period.niTotalBasisDetails![0];
    expect(difference.observations.map((observation) => observation.value)).toEqual([114_529e6, 116_017e6]);
    expect(difference.observations.map((observation) => observation.label)).toEqual(['Sales and other operating revenue', 'Total revenues and other income (includes equity-affiliate and other income)']);
    expect(difference.observations[1].sourceUrl).toBe(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`);
    expect(difference.definition).toMatchObject({ label: 'Revenue basis difference', accession: ACCESSION, sourceUrl: expect.stringContaining('/34088/000003408826000093/') });
    expect(difference.definition?.explanation).toContain('xom:SalesAndOtherOperatingRevenueMember');
  });

  it('does not extend the label to another issuer, source identity, currency, period or amount', () => {
    const base = facts();
    const extra = supplement();
    expect(exxonRevenueDefinition(engine.get('CVX US Equity')!, base, 'USD', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
    expect(exxonRevenueDefinition(company, { ...base, cik: 1 }, 'USD', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
    expect(exxonRevenueDefinition(company, { ...base, name: 'Other company' }, 'USD', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
    expect(exxonRevenueDefinition(company, base, 'EUR', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
    expect(exxonRevenueDefinition(company, base, 'USD', 'annual', END, 114_529e6, extra, NOW)).toBeUndefined();
    expect(exxonRevenueDefinition(company, base, 'USD', 'quarter', END + 86_400_000, 114_529e6, extra, NOW)).toBeUndefined();
    expect(exxonRevenueDefinition(company, base, 'USD', 'quarter', END, 114_530e6, extra, NOW)).toBeUndefined();
    extra.row.set('TotalRevenue', 116_018e6);
    expect(exxonRevenueDefinition(company, base, 'USD', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
  });

  it.each([
    { start: '2026-01-01' }, { end: '2026-06-29' }, { filed: '2026-11-01' }, { form: 'DEF 14A' },
    { accession: '0002115436-26-000001' }, { concept: 'us-gaap:SalesRevenueNet' }, { derived: true },
  ])('does not carry a known definition onto different filing metadata: %j', (change) => {
    const extra = supplement();
    extra.observations.set('TotalRevenue', { ...extra.observations.get('TotalRevenue')!, ...change });
    expect(exxonRevenueDefinition(company, facts(), 'USD', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
  });

  it('does not annotate a pre-filing capture or missing observation', () => {
    const extra = supplement();
    expect(exxonRevenueDefinition(company, facts(), 'USD', 'quarter', END, 114_529e6, extra, Date.parse('2026-08-02'))).toBeUndefined();
    expect(exxonRevenueDefinition(company, facts(), 'USD', 'quarter', END, 114_529e6, extra, NaN)).toBeUndefined();
    extra.observations.clear();
    expect(exxonRevenueDefinition(company, facts(), 'USD', 'quarter', END, 114_529e6, extra, NOW)).toBeUndefined();
  });

  it('keeps the Q2 definition attached to its original observations in an LTM sum and its public audit warning', () => {
    const period = buildRealFund(company, summary, null, quarterly, null, NOW, facts(), []).quarterly[0];
    const other = { ...period, niTotalBasisConflict: undefined, niTotalBasisDetails: undefined };
    const ltm = sumQuarters([other, other, other, period]);
    expect(ltm.niTotalBasisDetails).toEqual(period.niTotalBasisDetails);
    expect(ltm.niTotalBasisDetails?.[0].observations[1].start).toBe('2026-04-01');
    expect(parentIncomeMargin(ltm)).toBeNaN();
    const rows = validateFinancials({ schema: 1, domain: 'financials', capturedAt: NOW, periods: [{ ...ltm, parentIncomeMargin: null }] }, 'XOM', NOW);
    expect(rows).toMatchObject([{ status: 'INCOMPLETE', basisDifferences: period.niTotalBasisDetails }]);
    const annotations = formatAnnotations({ summary: { assurance: 'incomplete', exitCode: 3, pass: 0, fail: 0, flagged: 0, blocked: 0, incomplete: 1, skip: 0 }, rows }, {});
    for (const text of ['Sales and other operating revenue', 'Total revenues and other income', 'Revenue basis difference', '893 million', '595 million', '000003408826000093']) expect(annotations).toContain(text);
    expect(annotations).not.toContain('[truncated]');
  });
});
