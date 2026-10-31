import type { StatementBasisDefinition } from '../fundamentals';
import type { SecurityDef } from '../types';
import type { CompanyFacts, PeriodKind } from './sec';
import type { StatementSupplement } from './statement-supplements';

/**
 * The retained primary-source review in docs/accuracy-primary-sources-2026-10-30.md establishes only
 * this quarter and filing. Company facts omits the dimensional sales line: a numerical match in another
 * quarter, issuer or accession cannot extend this annotation. This does not select a different amount.
 */
export function exxonRevenueDefinition(def: SecurityDef, facts: CompanyFacts, currency: string, kind: PeriodKind, end: number, selected: number, supplement: StatementSupplement, now: number): StatementBasisDefinition | undefined {
  const observation = supplement.observations.get('TotalRevenue');
  if (def.id !== 'XOM US Equity' || ![34088, 2115436].includes(facts.cik) || !/^EXXON\s+MOBIL\s+CORP(?:ORATION)?\.?$/i.test(facts.name.trim())) return;
  if (currency !== 'USD' || kind !== 'quarter' || end !== Date.parse('2026-06-30T00:00:00Z')) return;
  if (selected !== 114_529e6 || supplement.row.get('TotalRevenue') !== 116_017e6) return;
  if (observation?.start !== '2026-04-01' || observation.end !== '2026-06-30' || observation.filed !== '2026-08-03'
    || observation.form !== '10-Q' || observation.accession !== '0000034088-26-000093' || observation.concept !== 'us-gaap:Revenues'
    || observation.derived || !Number.isFinite(now) || now < Date.parse('2026-08-03T00:00:00Z')) return;
  return {
    label: 'Revenue basis difference',
    selectedLine: 'Sales and other operating revenue',
    filedLine: 'Total revenues and other income (includes equity-affiliate and other income)',
    explanation: 'For Q2 2026, sales and other operating revenue is USD 114,529 million; equity-affiliate income of 893 million and other income of 595 million bring total revenues and other income to 116,017 million. The sales line has the xom:SalesAndOtherOperatingRevenueMember dimension; company facts supplies the undimensioned total. These labels explain the retained Q2 source observations; parent-income margins remain withheld while statement bases differ.',
    quote: 'Sales and other operating revenue; Income from equity affiliates; Other income; Total revenues and other income',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/34088/000003408826000093/0000034088-26-000093-index.html',
    accession: '0000034088-26-000093',
  };
}
