import { FACT_LINES, lineValues, periodColumns, standaloneQuarterValues, type CompanyFacts, type PeriodKind } from './sec';
import { fmtIso } from '../../core/format';

/** SEC observations in the Yahoo statement reader's field names and raw units. */
const FIELD: Record<string, string> = {
  revenue: 'TotalRevenue', cost: 'CostOfRevenue', gross: 'GrossProfit', rnd: 'ResearchAndDevelopment',
  sga: 'SellingGeneralAndAdministration', opInc: 'OperatingIncome', interest: 'InterestExpense',
  pretax: 'PretaxIncome', tax: 'TaxProvision', netCommon: 'NetIncomeCommonStockholders', netInc: '__NetIncome',
  epsDil: 'DilutedEPS', dilShares: 'DilutedAverageShares', cfo: 'OperatingCashFlow',
  capex: 'CapitalExpenditure', divPaid: 'CashDividendsPaid', buyback: 'RepurchaseOfCapitalStock',
  da: 'ReconciledDepreciation', cash: 'CashAndCashEquivalents', curAssets: 'CurrentAssets',
  assets: 'TotalAssets', curLiab: 'CurrentLiabilities', liab: 'TotalLiabilitiesNetMinorityInterest',
  equity: 'StockholdersEquity', ppe: 'NetPPE', recv: 'AccountsReceivable', inv: 'Inventory',
  debtCurrent: '__DebtCurrent', ltDebt: '__DebtNoncurrent',
};

export interface StatementSupplement {
  row: Map<string, number>;
  sources: Map<string, string>;
  /** The filing date (ISO day) of each figure, for per-share figures that a later share split changes. */
  filed: Map<string, string>;
  /** The figures a later filing restated (its latest value differs from the first one filed). */
  restated: Set<string>;
  /** Original exact-period metadata for tracing source-basis warnings. */
  observations: Map<string, { start?: string; end: string; filed: string; concept: string; sourceUrl: string }>;
}

/**
 * Exact period and reporting-currency matches only. Missing standalone cash flows may be derived from
 * aligned cumulative filings by the SEC reader. EPS and weighted shares are never subtracted or inferred.
 */
export function secStatementRows(cf: CompanyFacts, currency: string, kind: PeriodKind): Map<number, StatementSupplement> {
  const out = new Map<number, StatementSupplement>();
  const allowed = new Set(periodColumns(cf, currency, kind, 100, true).filter((c) => c.kind === kind).map((c) => c.end));
  for (const line of FACT_LINES) {
    const key = FIELD[line.key];
    if (!key) continue;
    const values = kind === 'quarter' ? standaloneQuarterValues(cf.facts, line, currency) : lineValues(cf.facts, line, currency, kind);
    for (const [date, fact] of values) {
      if (!allowed.has(date)) continue;
      const end = Date.parse(`${date}T00:00:00Z`);
      const item = out.get(end) ?? { row: new Map<string, number>(), sources: new Map<string, string>(), filed: new Map<string, string>(), restated: new Set<string>(), observations: new Map() };
      item.row.set(key, fact.val);
      item.filed.set(key, fact.filed);
      if (fact.restated) item.restated.add(key);
      item.sources.set(key, `SEC EDGAR ${fact.form}, filed ${fmtIso(fact.filed, true)}${fact.derived ? ' (calculated from aligned reported totals)' : ''}`);
      item.observations.set(key, { ...(fact.start ? { start: fact.start } : {}), end: fact.end, filed: fact.filed, concept: fact.concept, sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cf.cik).padStart(10, '0')}.json` });
      out.set(end, item);
    }
  }
  for (const extra of out.values()) {
    const current = extra.row.get('__DebtCurrent');
    const noncurrent = extra.row.get('__DebtNoncurrent');
    if (current != null && noncurrent != null) {
      extra.row.set('TotalDebt', current + noncurrent);
      extra.sources.set('TotalDebt', `${[...new Set([extra.sources.get('__DebtCurrent'), extra.sources.get('__DebtNoncurrent')])].join('; ')}; total debt calculated as reported current + non-current borrowings (lease obligations may be reported separately)`);
    }
    extra.row.delete('__DebtCurrent');
    extra.row.delete('__DebtNoncurrent');
  }
  return out;
}

/** A split as the price history records it: `numerator` new shares for every `denominator` old ones, from `day` (days since 1970). */
export interface SplitEvent {
  day: number;
  numerator: number;
  denominator: number;
}

/**
 * How many of today's shares one share had when a figure was filed: the product of the splits that took effect
 * after the filing day. A filing already restates its per-share figures for splits made before it was issued, so
 * only later splits change them (NVIDIA's FY2022 EPS of 3.85, filed 21 Feb 2024, is 0.385 after the 10-for-1 split
 * of 10 Jun 2024). 1 when no split followed.
 */
export function splitFactorSince(splits: readonly SplitEvent[], filedIso: string): number {
  const filed = Date.parse(`${filedIso}T00:00:00Z`);
  if (!Number.isFinite(filed)) return NaN;
  let f = 1;
  for (const s of splits) if (s.day * 86_400_000 > filed && s.numerator > 0 && s.denominator > 0) f *= s.numerator / s.denominator;
  return f;
}
