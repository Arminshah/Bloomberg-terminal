import { useEffect } from 'react';
import { createStore, waitFor } from '../../core/store';
import { createWants, registerRefresh } from '../../terminal/refresh';
import { engine } from '../market';
import { DAY_MS } from '../calendar';
import type { EarningsEvent, FinPeriod, Holder } from '../fundamentals';
import type { SecurityDef } from '../types';
import { desktopData, impliedShares, realDividends, yahooGet, yahooSymbolFor } from './yahoo';
import { finnhubAvailable, finnhubSymbol, loadFinnhub, type FinnhubMetric, type FinnhubProfile } from './finnhub';
import { loadCompanyFacts, loadFiler, reportingCurrency, resolveFiler, secAvailable, secTicker, type CompanyFacts, type SecFiler } from './sec';
import { fillSummary, loadFinraShort, loadNasdaq, nasdaqAvailable, nasdaqSummaryPatch, nasdaqSymbol, type NasdaqHoldings, type NasdaqKind, type NasdaqProfile, type NasdaqShort, type NasdaqSummary } from './nasdaq-company';
import { secStatementRows } from './statement-supplements';
import { fmtDay } from '../../core/format';

/**
 * Company data for the desktop app from Yahoo Finance (personal
 * use): statements from the fundamentals time series, and report dates,
 * holders and the company profile from quoteSummary. Analyst data (ratings,
 * recommendations, price targets, estimates) is not requested: the main
 * process also strips it from every answer. fundamentals.ts prefers these
 * over its generated figures whenever they are loaded.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface RealFund {
  fetched: number;
  /** The statement provider's reporting currency, independent of the share's trading currency. */
  currency?: string;
  statementsFrom?: 'Yahoo Finance' | 'SEC EDGAR';
  /** Latest separately observed balance, even when no income statement exists for that date. */
  balance?: FinPeriod;
  annual: FinPeriod[];
  quarterly: FinPeriod[];
  ltm: FinPeriod | null;
  earnings: EarningsEvent[];
  holders: Holder[];
  breakdown: { insiders: number; institutions: number; institutionsFloat: number; count: number } | null;
  stats: Partial<Record<'pe' | 'pb' | 'ps' | 'evEbitda' | 'ev' | 'divYld' | 'payout' | 'roe' | 'roa' | 'opMargin' | 'netMargin' | 'grossMargin' | 'de' | 'beta' | 'revGrowth' | 'epsGrowth' | 'shares', number>>;
  nextDividend: { ex: number; pay: number; rate: number } | null;
  /** The float and short interest from Yahoo's key statistics; NaN wherever the source gives none. */
  float: FloatStats;
  /** The company's officers as Yahoo's company profile lists them, in its order. */
  officers: Officer[];
  /** Where the ratios and profile came from when Yahoo's company summary was refused. */
  statsFrom?: 'Finnhub';
  /** Sources that filled fields Yahoo's company summary left empty (Nasdaq, SEC EDGAR). */
  filledFrom?: string[];
}

/**
 * Float and short interest as Yahoo's key statistics give them (US exchanges report short interest twice a
 * month; Yahoo gives none for most other markets). Counts in shares, percentages in percent, dates in ms.
 */
export interface FloatStats {
  /** floatShares: shares available to trade. */
  float: number;
  /** sharesShort: shares sold short on the settlement date `asOf`. */
  short: number;
  /** shortPercentOfFloat, in percent. */
  shortPctFloat: number;
  /** True when the ratio is computed from sharesShort / floatShares rather than supplied by Yahoo. */
  shortPctFloatCalculated?: boolean;
  /** shortRatio: days to cover, the short interest over average daily volume, as the source works it out. */
  daysToCover: number;
  /** dateShortInterest: the settlement date of the short interest. */
  asOf: number;
  /** sharesShortPriorMonth: the short interest a month before, on `priorAsOf` (sharesShortPreviousMonthDate). */
  shortPrior: number;
  priorAsOf: number;
}

export interface Officer {
  name: string;
  title: string;
  /** Age and year of birth as the source gives them; NaN when it gives none. */
  age: number;
  yearBorn: number;
  /**
   * Yahoo's "Pay" for `fiscalYear`: salary, bonus and other cash, without stock and option awards (Yahoo's own
   * footnote: "Pay is salary, bonuses, etc."). No currency is stated.
   */
  totalPay: number;
  /** The value of options exercised in the fiscal year, as Yahoo gives it. */
  exercised: number;
  /** The value of the options held and not exercised, as Yahoo gives it. */
  unexercised: number;
  fiscalYear: number;
}

export const realFund = new Map<string, RealFund>();
const loading = new Set<string>();
/** Bumped whenever company data arrives, so screens re-render. */
export const fundVersion = createStore<{ v: number; status: Record<string, 'loading' | 'ok' | 'error'> }>({ v: 0, status: {} });

const num = (v: Json): number => {
  const x = typeof v === 'object' && v !== null ? v.raw : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : NaN;
};

/**
 * The float and short interest from defaultKeyStatistics. Yahoo answers {} for a field it has no figure for
 * (European listings have a float but no short interest); that, and a count of zero or less, stays NaN, never 0.
 */
export function floatStats(ks: Json): FloatStats {
  const pos = (v: Json) => (num(v) > 0 ? num(v) : NaN);
  const date = (v: Json) => (num(v) > 0 ? num(v) * 1000 : NaN);
  const float = pos(ks?.floatShares);
  const short = pos(ks?.sharesShort);
  const reportedPct = pos(ks?.shortPercentOfFloat) * 100;
  const calculated = !Number.isFinite(reportedPct) && Number.isFinite(short) && Number.isFinite(float);
  return {
    float,
    short,
    shortPctFloat: calculated ? (short / float) * 100 : reportedPct,
    ...(calculated ? { shortPctFloatCalculated: true } : {}),
    daysToCover: pos(ks?.shortRatio),
    asOf: date(ks?.dateShortInterest),
    shortPrior: pos(ks?.sharesShortPriorMonth),
    priorAsOf: date(ks?.sharesShortPreviousMonthDate),
  };
}

/** A name as the source writes it, without its doubled spaces or a leading Mr, Ms, Dr or Prof. */
export function cleanOfficerName(name: unknown): string {
  return (typeof name === 'string' ? name : '').replace(/\s+/g, ' ').trim().replace(/^(Mr|Ms|Mrs|Miss|Dr|Prof)\.?\s+/i, '');
}

/** assetProfile.companyOfficers: [{name, title, age, yearBorn, fiscalYear, totalPay: {raw}}], in the source's order. */
export function officersFrom(ap: Json): Officer[] {
  // Zero pay/exercises is a reported zero, not an absent value. Ages and years need plausible integer values.
  const integer = (v: Json, lo: number, hi: number) => Number.isInteger(num(v)) && num(v) >= lo && num(v) <= hi ? num(v) : NaN;
  const nonnegative = (v: Json) => num(v) >= 0 ? num(v) : NaN;
  return ((Array.isArray(ap?.companyOfficers) ? ap.companyOfficers : []) as Json[])
    .map((o) => ({
      name: cleanOfficerName(o?.name),
      title: (typeof o?.title === 'string' ? o.title : '').replace(/\s+/g, ' ').trim(),
      age: integer(o?.age, 18, 125),
      yearBorn: integer(o?.yearBorn, 1850, 2100),
      totalPay: nonnegative(o?.totalPay),
      exercised: nonnegative(o?.exercisedValue),
      unexercised: nonnegative(o?.unexercisedValue),
      fiscalYear: integer(o?.fiscalYear, 1900, 2100),
    }))
    .filter((o) => o.name);
}

/** Before or after the US session, from a report time; '--' when the time is not known. */
export function usTiming(ms: number): EarningsEvent['timing'] {
  // A stamp at exactly midnight UTC is a date without a time.
  if (ms % DAY_MS === 0) return '--';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const t = Number(parts.find((p) => p.type === 'hour')?.value) + Number(parts.find((p) => p.type === 'minute')?.value) / 60;
  if (!Number.isFinite(t) || t === 0) return '--';
  return t >= 16 ? 'Aft-mkt' : t < 9.5 ? 'Bef-mkt' : '--';
}

// ------------------------------------------------------------------ statements

const INCOME = ['TotalRevenue', 'CostOfRevenue', 'GrossProfit', 'SellingGeneralAndAdministration', 'ResearchAndDevelopment', 'OperatingIncome', 'ReconciledDepreciation', 'DepreciationAndAmortizationInIncomeStatement', 'EBITDA', 'InterestExpense', 'InterestExpenseNonOperating', 'PretaxIncome', 'TaxProvision', 'NetIncomeCommonStockholders', 'DilutedAverageShares', 'DilutedEPS'];
const BALANCE = ['CashAndCashEquivalents', 'AccountsReceivable', 'Inventory', 'CurrentAssets', 'NetPPE', 'GoodwillAndOtherIntangibleAssets', 'TotalAssets', 'CurrentLiabilities', 'TotalDebt', 'CurrentDebtAndCapitalLeaseObligation', 'LongTermDebtAndCapitalLeaseObligation', 'TotalLiabilitiesNetMinorityInterest', 'StockholdersEquity'];
const CASH = ['OperatingCashFlow', 'CapitalExpenditure', 'FreeCashFlow', 'CashDividendsPaid', 'RepurchaseOfCapitalStock'];

type Row = Map<string, number>;

/** Groups a timeseries response by period end: {end -> {type -> value}}. */
export function seriesByPeriod(res: Json, prefix: string, currency?: string): Map<number, Row> {
  const out = new Map<number, Row>();
  for (const r of (res?.timeseries?.result ?? []) as Json[]) {
    const type: string = r?.meta?.type?.[0] ?? '';
    if (!type.startsWith(prefix)) continue;
    const key = type.slice(prefix.length);
    for (const v of (r[type] ?? []) as Json[]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v?.asOfDate ?? '')) continue;
      const end = Date.parse(`${v.asOfDate}T00:00:00Z`);
      if (!Number.isFinite(end)) continue;
      if (currency && typeof v.currencyCode === 'string' && v.currencyCode !== currency) continue;
      const expected = prefix === 'quarterly' ? ['3M'] : prefix === 'trailing' ? ['TTM', '12M'] : ['12M'];
      if (v.periodType && !expected.includes(v.periodType)) continue;
      const row = out.get(end) ?? new Map<string, number>();
      // An empty duplicate must not erase a valid reported observation.
      const value = num(v.reportedValue);
      if (Number.isFinite(value)) row.set(key, value);
      out.set(end, row);
    }
  }
  return out;
}

const M = (v: number | undefined) => (v == null || !Number.isFinite(v) ? NaN : v / 1e6);

/** One statement period in the terminal's units (millions; capex and payouts as positive outflows). */
const BALANCE_SET = new Set(BALANCE);

/**
 * One period's statement lines in millions. `balance` fills in balance-sheet
 * lines only (a trailing period has no balance sheet of its own).
 */
export function periodFrom(label: string, end: number, row: Row, balance?: Row, dps = NaN): FinPeriod {
  const g = (k: string): number => {
    const own = row.get(k);
    if (Number.isFinite(own)) return own!;
    const bs = BALANCE_SET.has(k) ? balance?.get(k) : undefined;
    return Number.isFinite(bs) ? bs! : NaN;
  };
  // A negative revenue figure is a data error in the feed, not a real quarter.
  const revRaw = M(g('TotalRevenue'));
  const rev = revRaw < 0 ? NaN : revRaw;
  const cogs = M(g('CostOfRevenue'));
  const opInc = M(g('OperatingIncome'));
  const da = M(Number.isFinite(g('ReconciledDepreciation')) ? g('ReconciledDepreciation') : g('DepreciationAndAmortizationInIncomeStatement'));
  const capex = Math.abs(M(g('CapitalExpenditure')));
  const cfo = M(g('OperatingCashFlow'));
  const fcfRaw = M(g('FreeCashFlow'));
  // Operating income plus depreciation and amortisation. The feed's own EBITDA starts from pretax income,
  // so it carries non-operating gains such as revaluations of investments.
  const ebitdaFeed = M(g('EBITDA'));
  const debtReported = M(g('TotalDebt'));
  const debtCurrent = M(g('CurrentDebtAndCapitalLeaseObligation'));
  const debtNoncurrent = M(g('LongTermDebtAndCapitalLeaseObligation'));
  return {
    label,
    end,
    rev,
    cogs,
    gp: Number.isFinite(M(g('GrossProfit'))) ? M(g('GrossProfit')) : rev - cogs,
    sga: M(g('SellingGeneralAndAdministration')),
    rnd: M(g('ResearchAndDevelopment')),
    opInc,
    da,
    ebitda: Number.isFinite(opInc) && Number.isFinite(da) ? opInc + da : ebitdaFeed,
    interest: M(Number.isFinite(g('InterestExpense')) ? g('InterestExpense') : g('InterestExpenseNonOperating')),
    pretax: M(g('PretaxIncome')),
    tax: M(g('TaxProvision')),
    ni: M(g('NetIncomeCommonStockholders')),
    shares: M(g('DilutedAverageShares')),
    eps: g('DilutedEPS') ?? NaN,
    dps,
    cash: M(g('CashAndCashEquivalents')),
    recv: M(g('AccountsReceivable')),
    inv: M(g('Inventory')),
    curAssets: M(g('CurrentAssets')),
    ppe: M(g('NetPPE')),
    intang: M(g('GoodwillAndOtherIntangibleAssets')),
    totAssets: M(g('TotalAssets')),
    curLiab: M(g('CurrentLiabilities')),
    // Both components are required: one missing component never means zero debt.
    debt: Number.isFinite(debtReported) ? debtReported : debtCurrent + debtNoncurrent,
    totLiab: M(g('TotalLiabilitiesNetMinorityInterest')),
    equity: M(g('StockholdersEquity')),
    cfo,
    capex,
    fcf: Number.isFinite(fcfRaw) ? fcfRaw : cfo - capex,
    divPaid: Math.abs(M(g('CashDividendsPaid'))),
    buyback: Math.abs(M(g('RepurchaseOfCapitalStock'))),
  };
}

const FLOWS = ['rev', 'cogs', 'gp', 'sga', 'rnd', 'opInc', 'da', 'ebitda', 'interest', 'pretax', 'tax', 'ni', 'eps', 'cfo', 'capex', 'fcf', 'divPaid', 'buyback'] as const;

/** Trailing twelve months from four consecutive quarters: flows summed, balance sheet from the latest. */
export function sumQuarters(q4: FinPeriod[], dps = NaN): FinPeriod {
  const last = q4[q4.length - 1];
  const out: FinPeriod = { ...last, label: 'LTM', dps };
  for (const k of FLOWS) {
    const xs = q4.map((p) => p[k]);
    out[k] = xs.every(Number.isFinite) ? xs.reduce((a, b) => a + b, 0) : NaN;
  }
  out.shares = last.shares;
  const supplements = q4.flatMap((p) => p.supplements ?? []);
  if (supplements.length) out.supplements = [...new Set(supplements)];
  return out;
}

function fiscalQuarter(end: number, fye: number): string {
  const d = new Date(end);
  const m = d.getUTCMonth() + 1;
  const offset = (m - fye + 12) % 12;
  const q = offset === 0 ? 4 : Math.round(offset / 3);
  const fy = m > fye ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return `Q${q} ${String(fy).slice(2)}`;
}

function dividendsIn(id: string, from: number, to: number): number {
  const list = realDividends.get(id);
  if (!list) return NaN;
  let sum = 0;
  for (const x of list) {
    const t = x.day * DAY_MS;
    if (t > from && t <= to) sum += x.amount;
  }
  return sum;
}

// -------------------------------------------------------------------- build

export function buildRealFund(def: SecurityDef, summary: Json, annualRes: Json, quarterlyRes: Json, trailingRes: Json, now: number, secFacts?: CompanyFacts): RealFund {
  const r = summary?.quoteSummary?.result?.[0] ?? {};
  const fiscalEnd = num(r.defaultKeyStatistics?.lastFiscalYearEnd);
  const fye = Number.isFinite(fiscalEnd) ? new Date(fiscalEnd * 1000).getUTCMonth() + 1 : def.eq?.fye ?? 12;
  const reportedCurrency = r.financialData?.financialCurrency;
  const seriesCurrency = [quarterlyRes, annualRes].flatMap((x) => (x?.timeseries?.result ?? []) as Json[])
    .flatMap((x) => (x[x?.meta?.type?.[0]] ?? []) as Json[])
    .filter((x) => /^[A-Z]{3}$/.test(x?.currencyCode ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(x?.asOfDate ?? ''))
    .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0]?.currencyCode;
  const currency: string | undefined = typeof reportedCurrency === 'string' && /^[A-Z]{3}$/.test(reportedCurrency) ? reportedCurrency : seriesCurrency ?? (secFacts ? reportingCurrency(secFacts.facts) : undefined);
  const annualRows = seriesByPeriod(annualRes, 'annual', currency);
  const quarterlyRows = seriesByPeriod(quarterlyRes, 'quarterly', currency);
  const trailingRows = seriesByPeriod(trailingRes, 'trailing', currency);
  const statementsFrom = annualRows.size || quarterlyRows.size || trailingRows.size ? 'Yahoo Finance' : secFacts ? 'SEC EDGAR' : undefined;
  const supplements = new Map<number, Set<string>>();
  const mostRecentQuarter = num(r.defaultKeyStatistics?.mostRecentQuarter) * 1000;
  const snapshotDebt = num(r.financialData?.totalDebt);
  if (Number.isFinite(mostRecentQuarter) && mostRecentQuarter <= now && snapshotDebt >= 0) {
    const row = quarterlyRows.get(mostRecentQuarter) ?? new Map<string, number>();
    if (!Number.isFinite(row.get('TotalDebt'))) {
      row.set('TotalDebt', snapshotDebt);
      quarterlyRows.set(mostRecentQuarter, row);
      supplements.set(mostRecentQuarter, new Set([`Yahoo Finance debt snapshot as of ${fmtDay(mostRecentQuarter, true)}`]));
    }
  }
  if (secFacts && currency) {
    for (const [kind, rows] of [['annual', annualRows], ['quarter', quarterlyRows]] as const) {
      for (const [end, extra] of secStatementRows(secFacts, currency, kind)) {
        const row = rows.get(end) ?? new Map<string, number>();
        // Different restatement/continuing-operation bases must not create a hybrid income statement.
        const conflict = ['TotalRevenue', 'NetIncomeCommonStockholders', 'OperatingIncome', 'GrossProfit'].some((key) => {
          const primary = row.get(key);
          const official = extra.row.get(key);
          if (primary == null || !Number.isFinite(primary) || official == null || (key === 'TotalRevenue' && primary < 0)) return false;
          return Math.abs(primary - official) > 0.01 * Math.max(Math.abs(primary), Math.abs(official), 1);
        });
        for (const [key, value] of extra.row) {
          if (conflict && !BALANCE_SET.has(key)) continue;
          if (Number.isFinite(row.get(key)) && !(key === 'TotalRevenue' && row.get(key)! < 0)) continue;
          row.set(key, value);
          const evidence = supplements.get(end) ?? new Set<string>();
          evidence.add(extra.sources.get(key)!);
          supplements.set(end, evidence);
        }
        rows.set(end, row);
      }
    }
  }
  // Annual and quarterly balance sheets refer to the same instant at fiscal year end.
  // Reuse only those exact-date observations, never a prior quarter's stocks.
  for (const [end, row] of quarterlyRows) {
    const year = annualRows.get(end);
    if (!year) continue;
    for (const key of BALANCE_SET) if (!Number.isFinite(row.get(key)) && Number.isFinite(year.get(key))) row.set(key, year.get(key)!);
  }
  const fromRow = (label: string, end: number, row: Row, dps: number) => {
    const period = periodFrom(label, end, row, undefined, dps);
    const sources = supplements.get(end);
    if (sources?.size) period.supplements = [...sources];
    return period;
  };
  const balanceRow = [...annualRows, ...quarterlyRows]
    .filter(([, row]) => [...BALANCE_SET].some((key) => Number.isFinite(row.get(key))))
    .sort((a, b) => b[0] - a[0])[0];
  const balance = balanceRow ? periodFrom('Balance', balanceRow[0], new Map(), balanceRow[1]) : undefined;
  if (balance && supplements.has(balance.end)) balance.supplements = [...supplements.get(balance.end)!];
  const annual = [...annualRows.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, row]) => Number.isFinite(row.get('TotalRevenue') ?? NaN) || Number.isFinite(row.get('NetIncomeCommonStockholders') ?? NaN))
    .slice(-5)
    .map(([end, row]) => fromRow(`FY ${new Date(end).getUTCFullYear()}`, end, row, dividendsIn(def.id, end - 365 * DAY_MS, end)));
  let quarterly = [...quarterlyRows.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, row]) => Number.isFinite(row.get('TotalRevenue') ?? NaN) || Number.isFinite(row.get('NetIncomeCommonStockholders') ?? NaN))
    .slice(-8)
    .map(([end, row]) => fromRow(fiscalQuarter(end, fye), end, row, dividendsIn(def.id, end - 91 * DAY_MS, end)));
  // The statements feed can lag a quarter; the earnings module already has the newest quarter's revenue and profit.
  const fq = (r.earnings?.financialsChart?.quarterly ?? []) as Json[];
  // The source labels quarters its own way ("2Q2026" for NVIDIA's July quarter): its earnings chart pairs each
  // label with the period end, so a quarter is found by its end date, not by the calendar quarter it ends in.
  const chartQ = (r.earnings?.earningsChart?.quarterly ?? []) as Json[];
  const finFor = (end: number): Json | undefined => {
    const hit = chartQ.find((q) => Math.abs(num(q?.periodEndDate) * 1000 - end) < 20 * DAY_MS);
    return fq.find((x) => x?.date === (hit?.date ?? calQuarter(end)));
  };
  const calQuarter = (end: number) => `${Math.floor(new Date(end).getUTCMonth() / 3) + 1}Q${new Date(end).getUTCFullYear()}`;
  const lastEnd = quarterly.length ? quarterly[quarterly.length - 1].end : 0;
  for (const c of chartQ) {
    const end = num(c?.periodEndDate) * 1000;
    if (!(end > lastEnd)) continue;
    const fin = finFor(end);
    if (!fin) continue;
    const row: Row = new Map();
    row.set('TotalRevenue', num(fin.revenue));
    // The earnings chart's profit is not identified as attributable to common shareholders. It cannot
    // replace NetIncomeCommonStockholders or be divided by diluted shares to manufacture reported EPS.
    // No EPS until the statements have the quarter: the earnings module's EPS is the adjusted one, and net
    // income over the previous quarter's share count is not the reported figure.
    row.set('DilutedEPS', NaN);
    const newPeriod = periodFrom(fiscalQuarter(end, fye), end, row, quarterlyRows.get(end));
    const sources = supplements.get(end);
    if (sources?.size) newPeriod.supplements = [...sources];
    quarterly = [...quarterly, newPeriod].slice(-8);
  }
  // Revenue as the company reports it. The statements feed adds investment and derivative gains to some
  // companies' revenue (Berkshire 2025: 410,522 against the 371,444 it reports); where its latest yearly
  // figure differs from the earnings module's by more than 5%, the earnings module's revenue is used for
  // the years and quarters it has.
  const fy = (r.earnings?.financialsChart?.yearly ?? []) as Json[];
  const yearOf = (p: FinPeriod) => fy.find((x) => Number(x?.date) === new Date(p.end).getUTCFullYear());
  const lastYear = annual[annual.length - 1];
  const reportedRev = lastYear ? M(num(yearOf(lastYear)?.revenue)) : NaN;
  if (lastYear && reportedRev > 0 && Math.abs(reportedRev - lastYear.rev) > 0.05 * reportedRev) {
    for (const p of annual) {
      const v = M(num(yearOf(p)?.revenue));
      if (Number.isFinite(v)) p.rev = v;
    }
    for (const p of quarterly) {
      const v = M(num(finFor(p.end)?.revenue));
      if (Number.isFinite(v)) p.rev = v;
    }
  }
  const trailing = [...trailingRows.entries()].sort((a, b) => b[0] - a[0])[0];
  const ltmDividends = dividendsIn(def.id, now - 365 * DAY_MS, now);
  // Trailing twelve months: the feed's own figure when current, else the sum of the last four quarters.
  // When both exist and disagree (ASML: trailing net income 9,814 against 10,638 for the four quarters, which
  // match ASML's releases), the quarters win.
  const q4 = quarterly.slice(-4);
  const consecutive = q4.length === 4 && q4.every((p, i) => i === 0 || Math.abs(p.end - q4[i - 1].end - 91 * DAY_MS) <= 12 * DAY_MS);
  const currentEnd = quarterly.at(-1)?.end ?? annual.at(-1)?.end ?? -Infinity;
  const fromTrailing = trailing && trailing[0] >= currentEnd - 5 * DAY_MS
    ? periodFrom('LTM', trailing[0], trailing[1], quarterlyRows.get(trailing[0]) ?? annualRows.get(trailing[0]), ltmDividends)
    : null;
  const summed = consecutive ? sumQuarters(q4, ltmDividends) : null;
  const agrees = (a: number, b: number) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 0.005 * Math.max(Math.abs(a), Math.abs(b));
  const compatible = !!fromTrailing && !!summed && fromTrailing.end === summed.end && agrees(fromTrailing.ni, summed.ni) && agrees(fromTrailing.rev, summed.rev) && agrees(fromTrailing.opInc, summed.opInc);
  const ltm = fromTrailing && (!summed || compatible) ? fromTrailing : (summed ?? fromTrailing);
  // Sources often omit different lines from the same twelve-month observation. Fill individual gaps
  // only when their period ends and overlapping income figures agree.
  if (ltm && compatible) {
    const other = ltm === fromTrailing ? summed! : fromTrailing!;
    for (const key of FLOWS) if (!Number.isFinite(ltm[key]) && Number.isFinite(other[key])) ltm[key] = other[key];
    if (summed!.supplements) ltm.supplements = [...new Set([...(ltm.supplements ?? []), ...summed!.supplements])];
  }
  // A quarter without its EPS in the feed (ASML's Q3 2025) leaves the sum without one: LTM net income over the
  // latest diluted share count instead, marked as worked out here.
  if (ltm && ltm === summed && !Number.isFinite(ltm.eps) && Number.isFinite(ltm.ni) && ltm.shares > 0) {
    ltm.eps = ltm.ni / ltm.shares;
    ltm.epsComputed = true;
  }
  if (ltm) {
    ltm.basis = ltm === summed ? 'quarters' : 'trailing';
    const sameEndSources = supplements.get(ltm.end);
    if (sameEndSources) ltm.supplements = [...new Set([...(ltm.supplements ?? []), ...sameEndSources])];
  }

  // Earnings: the last four reports from the statements (reported diluted EPS and revenue), with the
  // report dates the source's earnings chart gives; a report without one keeps an unknown date (never a
  // guessed one). Analyst estimates and surprises are not shown: there is no permitted source for them.
  const reported = new Map<number, number>();
  for (const q of chartQ) {
    const end = num(q?.periodEndDate) * 1000;
    const at = num(q?.reportedDate) * 1000;
    if (Number.isFinite(end) && Number.isFinite(at)) reported.set(end, at);
  }
  const reportedAt = (end: number) => [...reported.entries()].find(([e]) => Math.abs(e - end) < 20 * DAY_MS)?.[1];
  const earnings: EarningsEvent[] = quarterly.slice(-4).map((p) => {
    const at = reportedAt(p.end);
    return {
      period: p.label,
      date: at ?? p.end,
      dateUnknown: at == null,
      actual: Number.isFinite(p.eps) ? p.eps : null,
      timing: at != null && def.country === 'US' ? usTiming(at) : ('--' as const),
      revAct: Number.isFinite(p.rev) ? p.rev : null,
    };
  });
  const cal = r.calendarEvents?.earnings ?? {};
  // A call may take place after publication in a different trading session; it does not establish the
  // report's publication time. Keep an unknown report date unknown unless the report chart supplies it.
  const callDate = num(cal.earningsCallDate?.[0]) * 1000;
  const nextDate = num(cal.earningsDate?.[0]) * 1000;
  if (Number.isFinite(nextDate)) {
    // Confirmed only when the source says so and has the earnings call on that date; the source
    // also marks dates the company has not announced as confirmed.
    const callSet = Number.isFinite(callDate) && callDate >= nextDate - DAY_MS;
    const estimated = cal.isEarningsDateEstimate === true || !callSet;
    earnings.push({
      period: 'Next',
      date: nextDate,
      approx: estimated,
      actual: null,
      timing: !estimated && def.country === 'US' ? usTiming(nextDate) : '--',
      revAct: null,
    });
  }

  const fd = r.financialData ?? {};

  // Holders
  const holdersOf = (list: Json[], type: string, source: string): Holder[] =>
    list.map((o) => {
      const shares = num(o.position);
      const ch = num(o.pctChange);
      return {
        name: String(o.organization ?? '').trim(),
        type,
        pct: num(o.pctHeld) * 100,
        shares,
        // +100% is what the source reports for a new position as well as a doubled one: no share count from it.
        change: Number.isFinite(ch) && ch > -1 && ch !== 1 ? shares - shares / (1 + ch) : NaN,
        newOrDoubled: ch === 1,
        filed: num(o.reportDate) * 1000,
        source,
      };
    });
  const holders = [
    ...holdersOf(r.institutionOwnership?.ownershipList ?? [], 'Institution', '13F'),
    ...holdersOf(r.fundOwnership?.ownershipList ?? [], 'Fund', 'Fund filing'),
  ]
    .filter((h) => h.name && (Number.isFinite(h.pct) || Number.isFinite(h.shares)))
    .sort((a, b) => b.pct - a.pct);
  const mh = r.majorHoldersBreakdown;
  const breakdown = mh
    ? { insiders: num(mh.insidersPercentHeld) * 100, institutions: num(mh.institutionsPercentHeld) * 100, institutionsFloat: num(mh.institutionsFloatPercentHeld) * 100, count: num(mh.institutionsCount) }
    : null;

  // Ratios as Yahoo reports them
  const ks = r.defaultKeyStatistics ?? {};
  const sd = r.summaryDetail ?? {};
  const pct = (v: number) => (Number.isFinite(v) ? v * 100 : NaN);
  const stats: RealFund['stats'] = {
    pe: num(sd.trailingPE),
    pb: num(ks.priceToBook),
    ps: num(sd.priceToSalesTrailing12Months),
    evEbitda: num(ks.enterpriseToEbitda),
    ev: M(num(ks.enterpriseValue)),
    payout: pct(num(sd.payoutRatio)),
    roe: pct(num(fd.returnOnEquity)),
    roa: pct(num(fd.returnOnAssets)),
    opMargin: pct(num(fd.operatingMargins)),
    netMargin: pct(num(fd.profitMargins)),
    grossMargin: pct(num(fd.grossMargins)),
    de: num(fd.debtToEquity),
    beta: num(sd.beta ?? ks.beta),
    revGrowth: pct(num(fd.revenueGrowth)),
    epsGrowth: pct(num(fd.earningsGrowth)),
    shares: M(num(ks.sharesOutstanding)),
  };
  const exDiv = num(r.calendarEvents?.exDividendDate) * 1000;
  const payDiv = num(r.calendarEvents?.dividendDate) * 1000;
  const nextDividend = Number.isFinite(exDiv) ? { ex: exDiv, pay: payDiv, rate: num(sd.dividendRate) } : null;
  return { fetched: now, ...(currency ? { currency } : {}), ...(statementsFrom ? { statementsFrom } : {}), ...(balance ? { balance } : {}), annual, quarterly, ltm, earnings, holders, breakdown, stats, nextDividend, float: floatStats(ks), officers: officersFrom(r.assetProfile) };
}

/** Writes the real profile into the security so DES, market cap and the model inputs use it. */
function applyProfile(def: SecurityDef, summary: Json, fund: RealFund) {
  const eq = def.eq;
  if (!eq) return;
  const r = summary?.quoteSummary?.result?.[0] ?? {};
  const ap = r.assetProfile ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  if (ap.industry) eq.industry = ap.industry;
  if (num(ap.fullTimeEmployees) > 0) eq.emp = num(ap.fullTimeEmployees);
  if (ap.city) eq.hq = `${ap.city}, ${ap.state ?? ap.country ?? ''}`.replace(/, $/, '');
  const ceo = fund.officers.find((o) => !/\b(?:former|retired|emeritus)\b/i.test(o.title) && /\b(?:chief executive(?: officer)?|ceo)\b/i.test(o.title));
  if (ceo) eq.ceo = ceo.name;
  if (ap.longBusinessSummary) eq.desc = String(ap.longBusinessSummary);
  const fyeRaw = num(ks.lastFiscalYearEnd);
  if (Number.isFinite(fyeRaw)) eq.fye = new Date(fyeRaw * 1000).getUTCMonth() + 1;
  const shares = impliedShares(def, num(r.summaryDetail?.marketCap ?? r.price?.marketCap), num(r.financialData?.currentPrice ?? r.summaryDetail?.previousClose));
  if (Number.isFinite(shares)) eq.shares = shares;
  else if (Number.isFinite(fund.stats.shares!) && fund.stats.shares! > 0) eq.shares = fund.stats.shares!;
  if (Number.isFinite(fund.stats.beta!)) eq.beta = fund.stats.beta!;
  if (fund.ltm && Number.isFinite(fund.ltm.rev)) eq.rev = fund.ltm.rev;
  if (fund.ltm && Number.isFinite(fund.ltm.ni)) eq.ni = fund.ltm.ni;
  const lastBs = fund.quarterly.length ? fund.quarterly[fund.quarterly.length - 1] : fund.annual[fund.annual.length - 1];
  const bsSource = [...fund.quarterly].reverse().find((p) => Number.isFinite(p.equity)) ?? lastBs;
  if (bsSource && Number.isFinite(bsSource.equity)) eq.book = bsSource.equity;
  const debtSource = [...fund.quarterly, ...fund.annual, ...(fund.balance ? [fund.balance] : [])]
    .filter((p) => Number.isFinite(p.debt)).sort((a, b) => b.end - a.end)[0];
  eq.netDebt = debtSource && Number.isFinite(debtSource.cash) ? debtSource.debt - debtSource.cash : NaN;
  // The source gives the annual rate in the main unit (pounds), while the line is quoted in pence.
  const dr = num(r.summaryDetail?.dividendRate);
  eq.dps = Number.isFinite(dr) ? (def.minor ? dr * 100 : dr) : NaN;
}

/**
 * Finnhub's profile and basic financials in the shape of Yahoo's company summary, so the same code reads them.
 * Finnhub gives percentages in percent and debt to equity as a ratio; the summary has fractions and percent.
 */
export function summaryFromFinnhub(profile: FinnhubProfile | null, metric: FinnhubMetric | null): Json | null {
  if (!profile && !metric) return null;
  const m = metric;
  const frac = (v: number | undefined) => (v != null && Number.isFinite(v) ? v / 100 : undefined);
  const val = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : undefined);
  return {
    quoteSummary: {
      result: [
        {
          assetProfile: profile ? { industry: profile.industry || undefined, website: profile.website || undefined } : {},
          summaryDetail: { trailingPE: val(m?.pe), priceToSalesTrailing12Months: val(m?.ps), payoutRatio: frac(m?.payout), beta: val(m?.beta), marketCap: profile && Number.isFinite(profile.marketCap) ? profile.marketCap * 1e6 : undefined },
          defaultKeyStatistics: { priceToBook: val(m?.pb), sharesOutstanding: profile && Number.isFinite(profile.sharesOutstanding) ? profile.sharesOutstanding * 1e6 : undefined },
          financialData: {
            returnOnEquity: frac(m?.roe),
            returnOnAssets: frac(m?.roa),
            operatingMargins: frac(m?.opMargin),
            profitMargins: frac(m?.netMargin),
            grossMargins: frac(m?.grossMargin),
            debtToEquity: m && Number.isFinite(m.debtToEquity) ? m.debtToEquity * 100 : undefined,
            revenueGrowth: frac(m?.revGrowth),
            earningsGrowth: frac(m?.epsGrowth),
          },
        },
      ],
    },
  };
}

async function finnhubSummary(def: SecurityDef): Promise<Json | null> {
  const symbol = finnhubSymbol(def);
  if (!symbol || !finnhubAvailable()) return null;
  const [p, m] = await Promise.all([loadFinnhub(symbol, 'profile'), loadFinnhub(symbol, 'metric')]);
  return summaryFromFinnhub((p?.data as FinnhubProfile | null) ?? null, (m?.data as FinnhubMetric | null) ?? null);
}

function timeseriesPath(symbol: string, prefix: string, types: string[], now: number): string {
  const t = types.map((x) => `${prefix}${x}`).join(',');
  return `/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${t}&period1=${Math.floor(now / 1000) - 7 * 365 * 86_400}&period2=${Math.floor(now / 1000)}`;
}

const queue: { id: string; run: () => Promise<void> }[] = [];
let active = 0;
const failedAt = new Map<string, number>();

/** At most three companies load at once, so a peer table does not trip Yahoo's rate limit. */
function pump() {
  while (active < 3 && queue.length) {
    const job = queue.shift()!;
    active++;
    void job.run().finally(() => {
      active--;
      pump();
    });
  }
}

/** Company data older than this is loaded again the next time a screen asks for it. */
export const FUND_TTL = 6 * 3600_000;

async function statementFacts(def: SecurityDef, force: boolean): Promise<CompanyFacts | undefined> {
  const ticker = secTicker(def);
  if (!secAvailable() || !ticker) return undefined;
  const filer = await resolveFiler(ticker, force);
  if (!filer.ok) return undefined;
  const facts = await loadCompanyFacts(filer.data.cik, force);
  return facts.ok ? facts.data : undefined;
}

const hasNum = (v: Json) => Number.isFinite(num(v));
const titleCase = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t);

/** The latest past date with the SEC's fiscal year end (MMDD), in seconds, as Yahoo's lastFiscalYearEnd. */
export function lastFiscalYearEnd(mmdd: string, now: number): number {
  const m = Number(mmdd.slice(0, 2));
  const d = Number(mmdd.slice(2));
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return NaN;
  const y = new Date(now).getUTCFullYear();
  const t = Date.UTC(y, m - 1, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()));
  return Math.floor((t <= now ? t : Date.UTC(y - 1, m - 1, Math.min(d, new Date(Date.UTC(y - 1, m, 0)).getUTCDate()))) / 1000);
}

/**
 * Fills the gaps in a US-listed stock's company summary from Nasdaq (market value, dividend, industry, short interest,
 * institutional ownership) and the SEC's company record (headquarters, fiscal year end). Only what is missing is
 * asked for; the stock on screen (`front`) also asks for short interest, holders and the dividend record, peers only
 * for the market value. Never throws.
 */
async function fillGaps(def: SecurityDef, summary: Json, front: boolean): Promise<{ summary: Json; from: string[] }> {
  const from: string[] = [];
  let out = summary;
  try {
    const r0 = summary?.quoteSummary?.result?.[0] ?? {};
    const ns = nasdaqSymbol(def);
    const secPromise: Promise<SecFiler | null> =
      front && secAvailable() && secTicker(def) && (!r0.assetProfile?.city || !hasNum(r0.defaultKeyStatistics?.lastFiscalYearEnd))
        ? resolveFiler(secTicker(def)!).then(async (c) => (c.ok ? ((await loadFiler(c.data.cik)) as { ok: boolean; data?: SecFiler }) : null)).then((f) => (f?.ok ? f.data ?? null : null)).catch(() => null)
        : Promise.resolve(null);
    if (ns && nasdaqAvailable()) {
      const kinds: NasdaqKind[] = [];
      if (!hasNum(r0.summaryDetail?.marketCap ?? r0.price?.marketCap) || !r0.assetProfile?.industry || (front && !hasNum(r0.summaryDetail?.dividendRate))) kinds.push('summary');
      if (front && !hasNum(r0.defaultKeyStatistics?.sharesShort)) kinds.push('short-interest');
      if (front && (!hasNum(r0.majorHoldersBreakdown?.institutionsPercentHeld) || !r0.institutionOwnership?.ownershipList?.length || !hasNum(r0.defaultKeyStatistics?.sharesOutstanding))) kinds.push('holdings');
      // The dividend record's declaration, record and payment dates, which Yahoo's price history does not give.
      if (front) kinds.push('dividends');
      if (front && !r0.assetProfile?.longBusinessSummary) kinds.push('profile');
      const got = await Promise.all(kinds.map((k) => loadNasdaq(ns, k)));
      const pick = <T,>(k: NasdaqKind): T | null => {
        const p = got[kinds.indexOf(k)];
        return p?.state === 'ok' ? ((p.data as T) ?? null) : null;
      };
      // Nasdaq's page has short interest for Nasdaq listings only; FINRA's covers every US-listed stock.
      const short = pick<NasdaqShort[]>('short-interest') ?? (kinds.includes('short-interest') ? await loadFinraShort(ns) : null);
      const filled = fillSummary(out, nasdaqSummaryPatch({ summary: pick<NasdaqSummary>('summary'), short, holdings: pick<NasdaqHoldings>('holdings'), profile: pick<NasdaqProfile>('profile') }));
      if (filled.filled.length) {
        out = filled.summary;
        from.push('Nasdaq');
        if (short && !pick<NasdaqShort[]>('short-interest')) from.push('FINRA');
      }
    }
    const filer = await secPromise;
    if (filer) {
      const patch: Json = {};
      if (filer.address) patch.assetProfile = { city: titleCase(filer.address.city), ...(filer.address.region ? { state: filer.address.region } : {}) };
      if (filer.fiscalYearEnd) patch.defaultKeyStatistics = { lastFiscalYearEnd: lastFiscalYearEnd(filer.fiscalYearEnd, Date.now()) };
      const filled = fillSummary(out, patch);
      if (filled.filled.length) {
        out = filled.summary;
        from.push('SEC EDGAR');
      }
    }
  } catch {
    /* the summary as it was */
  }
  return { summary: out, from };
}

/**
 * True when a company's data should be loaded again: after 6 hours, or every
 * hour once a report it was waiting for is due (statements, EPS, estimates and
 * the next report date change then).
 */
export function fundDue(fund: Pick<RealFund, 'fetched' | 'earnings'>, now: number): boolean {
  if (now - fund.fetched >= FUND_TTL) return true;
  const pending = fund.earnings.find((e) => e.actual == null && !e.dateUnknown && Number.isFinite(e.date));
  return !!pending && pending.date <= now && now - fund.fetched >= 3600_000;
}

/**
 * Loads a company's real data (desktop only), and again when it is due (see
 * fundDue); the figures already loaded stay on screen meanwhile. `front` puts
 * it ahead of queued peers, for the security the user is looking at; `force`
 * (the top bar's REFRESH) loads it again whether due or not.
 */
/** Stocks a screen opened (not only as a peer), and those whose data was loaded as such. */
const shownFront = new Set<string>();
const loadedFront = new Set<string>();

export function requestFundamentals(def: SecurityDef | undefined, front = false, force = false): void {
  if (!def?.eq || !desktopData()) return;
  const have = realFund.get(def.id);
  if (front) shownFront.add(def.id);
  // A stock first loaded as a peer is loaded again when opened, for the figures only the opened stock asks for.
  if (!force && have && !fundDue(have, Date.now()) && (!front || loadedFront.has(def.id))) return;
  if (!force && Date.now() - (failedAt.get(def.id) ?? -Infinity) < 10 * 60_000) return;
  if (loading.has(def.id)) {
    // Already queued: move it up if the user opened it.
    const i = queue.findIndex((j) => j.id === def.id);
    if (front && i > 0) queue.unshift(...queue.splice(i, 1));
    return;
  }
  const symbol = yahooSymbolFor(def) ?? def.yahoo;
  if (!symbol) return;
  const setStatus = (s: 'loading' | 'ok' | 'error') => fundVersion.set((x) => ({ v: x.v + 1, status: { ...x.status, [def.id]: s } }));
  setStatus('loading');
  loading.add(def.id);
  const run = async () => {
    const now = Date.now();
    try {
      // Independent official fallback; missing SEC identification never blocks the Yahoo path.
      const factsPromise = statementFacts(def, force).catch(() => undefined);
      const enc = encodeURIComponent(symbol);
      // The company summary needs Yahoo's session cookie; the statements do not. When Yahoo refuses the session
      // (EU cookies not accepted), the statements still load and the summary's parts stay empty.
      const [summary, annual, quarterly, trailing] = await Promise.all([
        yahooGet(`/v10/finance/quoteSummary/${enc}?modules=assetProfile,summaryDetail,defaultKeyStatistics,financialData,earnings,calendarEvents,institutionOwnership,fundOwnership,majorHoldersBreakdown`).catch(() => null),
        yahooGet(timeseriesPath(symbol, 'annual', [...INCOME, ...BALANCE, ...CASH], now)).catch(() => null),
        yahooGet(timeseriesPath(symbol, 'quarterly', [...INCOME, ...BALANCE, ...CASH], now)).catch(() => null),
        yahooGet(timeseriesPath(symbol, 'trailing', [...INCOME, ...CASH], now)).catch(() => null),
      ]);
      // Without Yahoo's summary, a US-listed company's profile and ratios come from Finnhub (the owner's key).
      let used = summary;
      let statsFrom: RealFund['statsFrom'];
      if (!summary?.quoteSummary?.result?.[0]) {
        const sub = await finnhubSummary(def).catch(() => null);
        if (sub) {
          used = sub;
          statsFrom = 'Finnhub';
        }
      }
      // What Yahoo's summary leaves empty (all of it when Yahoo refuses its session) comes from Nasdaq's quote and
      // company pages and the SEC's company record, for US-listed stocks. Yahoo's own figures are kept.
      const isFront = shownFront.has(def.id);
      const gaps = await fillGaps(def, used, isFront);
      if (isFront) loadedFront.add(def.id);
      used = gaps.summary;
      const hasStatements = [annual, quarterly].some((x) => (x?.timeseries?.result ?? []).some((r: Json) => Object.keys(r ?? {}).some((k) => k !== 'meta' && k !== 'timestamp' && Array.isArray(r[k]) && r[k].length)));
      const noProviderData = !used?.quoteSummary?.result?.[0] && !hasStatements;
      const initialFacts = noProviderData ? await factsPromise : undefined;
      if (noProviderData && !initialFacts) throw new Error('no data');
      const fund = buildRealFund(def, used, annual, quarterly, trailing, now, initialFacts);
      if (statsFrom) fund.statsFrom = statsFrom;
      if (gaps.from.length) fund.filledFrom = gaps.from;
      realFund.set(def.id, fund);
      applyProfile(def, used, fund);
      setStatus('ok');
      engine.flush([def.id]);
      if (!initialFacts) {
        const facts = await factsPromise;
        if (facts) {
          const supplemented = buildRealFund(def, used, annual, quarterly, trailing, now, facts);
          if (statsFrom) supplemented.statsFrom = statsFrom;
          if (gaps.from.length) supplemented.filledFrom = gaps.from;
          realFund.set(def.id, supplemented);
          applyProfile(def, used, supplemented);
          setStatus('ok');
          engine.flush([def.id]);
        }
      }
    } catch {
      failedAt.set(def.id, Date.now());
      setStatus('error');
    } finally {
      loading.delete(def.id);
    }
  };
  if (front) queue.unshift({ id: def.id, run });
  else queue.push({ id: def.id, run });
  pump();
}

/** The companies open screens show, for the top bar's REFRESH. */
const shown = createWants<SecurityDef>();

registerRefresh({
  source: 'Company fundamentals (Yahoo)',
  available: desktopData,
  run: async () => {
    const defs = shown.values().filter((d) => d.eq && (yahooSymbolFor(d) ?? d.yahoo));
    if (!defs.length) return [];
    for (const d of defs) requestFundamentals(d, false, true);
    const status = () => fundVersion.get().status;
    await waitFor(fundVersion, () => (defs.every((d) => status()[d.id] !== 'loading') ? true : undefined), 40_000);
    const failed = defs.filter((d) => status()[d.id] === 'error').length;
    return { source: 'Company fundamentals (Yahoo)', state: failed === defs.length ? 'failed' : 'asked', detail: `${defs.length - failed} of ${defs.length} companies answered` };
  },
});

/** Loads a company's real data, re-renders when it arrives, and reloads it while the screen stays open (see fundDue). */
export function useFundamentals(def: SecurityDef | undefined): { real: RealFund | undefined; status: 'loading' | 'ok' | 'error' | 'sim' } {
  const status = fundVersion.use((x) => (def ? x.status[def.id] : undefined));
  useEffect(() => {
    requestFundamentals(def, true);
    const timer = setInterval(() => requestFundamentals(def, true), 15 * 60_000);
    const off = def ? shown.add(def.id, def) : () => undefined;
    return () => {
      clearInterval(timer);
      off();
    };
  }, [def]);
  const real = def ? realFund.get(def.id) : undefined;
  return { real, status: real ? 'ok' : (status ?? (desktopData() && def?.eq ? 'loading' : 'sim')) };
}

/** Loads several companies (a peer table): how many have real data, and how many could not be loaded. */
export function useFundamentalsFor(defs: SecurityDef[]): { loaded: number; failed: number } {
  const status = fundVersion.use((x) => x.status);
  const key = defs.map((d) => d.id).join(',');
  useEffect(() => {
    const load = () => {
      for (const d of defs) requestFundamentals(d);
    };
    load();
    const timer = setInterval(load, 15 * 60_000);
    const offs = defs.map((d) => shown.add(d.id, d));
    return () => {
      clearInterval(timer);
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const loaded = defs.filter((d) => realFund.has(d.id)).length;
  const failed = defs.filter((d) => !realFund.has(d.id) && (status[d.id] === 'error' || !(yahooSymbolFor(d) ?? d.yahoo))).length;
  return { loaded, failed };
}

export function getRealFund(id: string): RealFund | undefined {
  return realFund.get(id);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
