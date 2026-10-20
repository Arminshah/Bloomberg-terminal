import { FACT_LINES, lineValues, periodColumns, standaloneQuarterValues, type CompanyFacts, type PeriodKind } from './sec';

/** SEC observations in the Yahoo statement reader's field names and raw units. */
const FIELD: Record<string, string> = {
  revenue: 'TotalRevenue', cost: 'CostOfRevenue', gross: 'GrossProfit', rnd: 'ResearchAndDevelopment',
  sga: 'SellingGeneralAndAdministration', opInc: 'OperatingIncome', interest: 'InterestExpense',
  pretax: 'PretaxIncome', tax: 'TaxProvision', netCommon: 'NetIncomeCommonStockholders',
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
      const item = out.get(end) ?? { row: new Map<string, number>(), sources: new Map<string, string>() };
      item.row.set(key, fact.val);
      item.sources.set(key, `SEC EDGAR ${fact.form}, filed ${fact.filed}${fact.derived ? ' (calculated from aligned reported totals)' : ''}`);
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
