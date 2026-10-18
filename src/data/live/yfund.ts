import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { engine } from '../market';
import { DAY_MS } from '../calendar';
import type { EarningsEvent, FinPeriod, Holder } from '../fundamentals';
import type { SecurityDef } from '../types';
import { desktopData, impliedShares, realDividends, yahooGet, yahooSymbolFor } from './yahoo';

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
  annual: FinPeriod[];
  quarterly: FinPeriod[];
  ltm: FinPeriod | null;
  earnings: EarningsEvent[];
  holders: Holder[];
  breakdown: { insiders: number; institutions: number; institutionsFloat: number; count: number } | null;
  stats: Partial<Record<'pe' | 'pb' | 'ps' | 'evEbitda' | 'ev' | 'divYld' | 'payout' | 'roe' | 'roa' | 'opMargin' | 'netMargin' | 'grossMargin' | 'de' | 'beta' | 'revGrowth' | 'epsGrowth' | 'shares', number>>;
  nextDividend: { ex: number; pay: number; rate: number } | null;
}

export const realFund = new Map<string, RealFund>();
const loading = new Set<string>();
/** Bumped whenever company data arrives, so screens re-render. */
export const fundVersion = createStore<{ v: number; status: Record<string, 'loading' | 'ok' | 'error'> }>({ v: 0, status: {} });

const num = (v: Json): number => {
  const x = typeof v === 'object' && v !== null ? v.raw : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : NaN;
};

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

const INCOME = ['TotalRevenue', 'CostOfRevenue', 'GrossProfit', 'SellingGeneralAndAdministration', 'ResearchAndDevelopment', 'OperatingIncome', 'ReconciledDepreciation', 'EBITDA', 'InterestExpense', 'PretaxIncome', 'TaxProvision', 'NetIncomeCommonStockholders', 'DilutedAverageShares', 'DilutedEPS'];
const BALANCE = ['CashAndCashEquivalents', 'AccountsReceivable', 'Inventory', 'CurrentAssets', 'NetPPE', 'GoodwillAndOtherIntangibleAssets', 'TotalAssets', 'CurrentLiabilities', 'TotalDebt', 'TotalLiabilitiesNetMinorityInterest', 'StockholdersEquity'];
const CASH = ['OperatingCashFlow', 'CapitalExpenditure', 'FreeCashFlow', 'CashDividendsPaid', 'RepurchaseOfCapitalStock'];

type Row = Map<string, number>;

/** Groups a timeseries response by period end: {end -> {type -> value}}. */
export function seriesByPeriod(res: Json, prefix: string): Map<number, Row> {
  const out = new Map<number, Row>();
  for (const r of (res?.timeseries?.result ?? []) as Json[]) {
    const type: string = r?.meta?.type?.[0] ?? '';
    if (!type.startsWith(prefix)) continue;
    const key = type.slice(prefix.length);
    for (const v of (r[type] ?? []) as Json[]) {
      if (!v?.asOfDate) continue;
      const end = Date.parse(`${v.asOfDate}T00:00:00Z`);
      const row = out.get(end) ?? new Map<string, number>();
      row.set(key, num(v.reportedValue));
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
  const g = (k: string) => row.get(k) ?? (BALANCE_SET.has(k) ? balance?.get(k) : undefined);
  // A negative revenue figure is a data error in the feed, not a real quarter.
  const revRaw = M(g('TotalRevenue'));
  const rev = revRaw < 0 ? NaN : revRaw;
  const cogs = M(g('CostOfRevenue'));
  const opInc = M(g('OperatingIncome'));
  const da = M(g('ReconciledDepreciation'));
  const capex = Math.abs(M(g('CapitalExpenditure')));
  const cfo = M(g('OperatingCashFlow'));
  const fcfRaw = M(g('FreeCashFlow'));
  // Operating income plus depreciation and amortisation. The feed's own EBITDA starts from pretax income,
  // so it carries non-operating gains such as revaluations of investments.
  const ebitdaFeed = M(g('EBITDA'));
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
    interest: M(g('InterestExpense')),
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
    debt: M(g('TotalDebt')),
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
  const list = realDividends.get(id) ?? [];
  let sum = 0;
  for (const x of list) {
    const t = x.day * DAY_MS;
    if (t > from && t <= to) sum += x.amount;
  }
  return sum;
}

// -------------------------------------------------------------------- build

export function buildRealFund(def: SecurityDef, summary: Json, annualRes: Json, quarterlyRes: Json, trailingRes: Json, now: number): RealFund {
  const r = summary?.quoteSummary?.result?.[0] ?? {};
  const fye = def.eq?.fye ?? 12;
  const annualRows = seriesByPeriod(annualRes, 'annual');
  const quarterlyRows = seriesByPeriod(quarterlyRes, 'quarterly');
  const trailingRows = seriesByPeriod(trailingRes, 'trailing');
  const annual = [...annualRows.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, row]) => Number.isFinite(row.get('TotalRevenue') ?? NaN) || Number.isFinite(row.get('NetIncomeCommonStockholders') ?? NaN))
    .slice(-5)
    .map(([end, row]) => periodFrom(`FY ${new Date(end).getUTCFullYear()}`, end, row, undefined, dividendsIn(def.id, end - 365 * DAY_MS, end)));
  let quarterly = [...quarterlyRows.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, row]) => Number.isFinite(row.get('TotalRevenue') ?? NaN) || Number.isFinite(row.get('NetIncomeCommonStockholders') ?? NaN))
    .slice(-8)
    .map(([end, row]) => periodFrom(fiscalQuarter(end, fye), end, row, undefined, dividendsIn(def.id, end - 91 * DAY_MS, end)));
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
    row.set('NetIncomeCommonStockholders', num(fin.earnings));
    // No EPS until the statements have the quarter: the earnings module's EPS is the adjusted one, and net
    // income over the previous quarter's share count is not the reported figure.
    row.set('DilutedEPS', NaN);
    quarterly = [...quarterly, periodFrom(fiscalQuarter(end, fye), end, row)].slice(-8);
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
  const lastQ = [...quarterlyRows.entries()].sort((a, b) => b[0] - a[0])[0];
  const trailing = [...trailingRows.entries()].sort((a, b) => b[0] - a[0])[0];
  const ltmDividends = dividendsIn(def.id, now - 365 * DAY_MS, now);
  // Trailing twelve months: the feed's own figure when current, else the sum of the last four quarters.
  // When both exist and disagree (ASML: trailing net income 9,814 against 10,638 for the four quarters, which
  // match ASML's releases), the quarters win.
  const q4 = quarterly.slice(-4);
  const consecutive = q4.length === 4 && q4.every((p, i) => i === 0 || Math.abs(p.end - q4[i - 1].end - 91 * DAY_MS) <= 12 * DAY_MS);
  const fromTrailing = trailing && (!consecutive || trailing[0] >= q4[3].end - 5 * DAY_MS) ? periodFrom('LTM', trailing[0], trailing[1], lastQ?.[1], ltmDividends) : null;
  const summed = consecutive ? sumQuarters(q4, ltmDividends) : null;
  const agrees = (a: number, b: number) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 0.005 * Math.max(Math.abs(a), Math.abs(b));
  const ltm = fromTrailing && (!summed || (agrees(fromTrailing.ni, summed.ni) && agrees(fromTrailing.rev, summed.rev) && agrees(fromTrailing.opInc, summed.opInc))) ? fromTrailing : (summed ?? fromTrailing);
  // A quarter without its EPS in the feed (ASML's Q3 2025) leaves the sum without one: LTM net income over the
  // latest diluted share count instead, marked as worked out here.
  if (ltm && ltm === summed && !Number.isFinite(ltm.eps) && Number.isFinite(ltm.ni) && ltm.shares > 0) {
    ltm.eps = ltm.ni / ltm.shares;
    ltm.epsComputed = true;
  }
  if (ltm) ltm.basis = ltm === summed ? 'quarters' : 'trailing';

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
  // The latest report's real date and time come from its earnings call.
  const callDate = num(cal.earningsCallDate?.[0]) * 1000;
  const latest = earnings[earnings.length - 1];
  const latestEnd = quarterly.length ? quarterly[quarterly.length - 1].end : NaN;
  if (latest?.dateUnknown && callDate > latestEnd && callDate - latestEnd < 120 * DAY_MS) {
    latest.date = callDate;
    latest.dateUnknown = false;
    latest.timing = def.country === 'US' ? usTiming(callDate) : '--';
  }
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
        change: Number.isFinite(ch) && ch > -1 && ch < 1 ? shares - shares / (1 + ch) : ch >= 1 ? NaN : 0,
        newOrDoubled: ch >= 1,
        filed: num(o.reportDate) * 1000,
        source,
      };
    });
  const holders = [
    ...holdersOf(r.institutionOwnership?.ownershipList ?? [], 'Institution', '13F'),
    ...holdersOf(r.fundOwnership?.ownershipList ?? [], 'Fund', 'Fund filing'),
  ]
    .filter((h) => h.name && Number.isFinite(h.pct))
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
  return { fetched: now, annual, quarterly, ltm, earnings, holders, breakdown, stats, nextDividend };
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
  const ceo = (ap.companyOfficers ?? []).find((o: Json) => /chief executive|ceo/i.test(o?.title ?? ''));
  if (ceo?.name) eq.ceo = String(ceo.name).replace(/\s+/g, ' ').replace(/^(Mr|Ms|Mrs|Dr)\.?\s+/i, '').trim();
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
  if (bsSource && Number.isFinite(bsSource.debt)) eq.netDebt = bsSource.debt - (Number.isFinite(bsSource.cash) ? bsSource.cash : 0);
  // The source gives the annual rate in the main unit (pounds), while the line is quoted in pence.
  const dr = num(r.summaryDetail?.dividendRate);
  eq.dps = Number.isFinite(dr) ? (def.minor ? dr * 100 : dr) : NaN;
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
 * it ahead of queued peers, for the security the user is looking at.
 */
export function requestFundamentals(def: SecurityDef | undefined, front = false): void {
  if (!def?.eq || !desktopData()) return;
  const have = realFund.get(def.id);
  if (have && !fundDue(have, Date.now())) return;
  if (Date.now() - (failedAt.get(def.id) ?? -Infinity) < 10 * 60_000) return;
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
      const enc = encodeURIComponent(symbol);
      // The company summary needs Yahoo's session cookie; the statements do not. When Yahoo refuses the session
      // (EU cookies not accepted), the statements still load and the summary's parts stay empty.
      const [summary, annual, quarterly, trailing] = await Promise.all([
        yahooGet(`/v10/finance/quoteSummary/${enc}?modules=assetProfile,summaryDetail,defaultKeyStatistics,financialData,earnings,calendarEvents,institutionOwnership,fundOwnership,majorHoldersBreakdown`).catch(() => null),
        yahooGet(timeseriesPath(symbol, 'annual', [...INCOME, ...BALANCE, ...CASH], now)).catch(() => null),
        yahooGet(timeseriesPath(symbol, 'quarterly', [...INCOME, ...BALANCE, ...CASH], now)).catch(() => null),
        yahooGet(timeseriesPath(symbol, 'trailing', [...INCOME, ...CASH], now)).catch(() => null),
      ]);
      const hasStatements = [annual, quarterly].some((x) => (x?.timeseries?.result ?? []).some((r: Json) => Object.keys(r ?? {}).some((k) => k !== 'meta' && k !== 'timestamp' && Array.isArray(r[k]) && r[k].length)));
      if (!summary?.quoteSummary?.result?.[0] && !hasStatements) throw new Error('no data');
      const fund = buildRealFund(def, summary, annual, quarterly, trailing, now);
      realFund.set(def.id, fund);
      applyProfile(def, summary, fund);
      setStatus('ok');
      engine.flush([def.id]);
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

/** Loads a company's real data, re-renders when it arrives, and reloads it while the screen stays open (see fundDue). */
export function useFundamentals(def: SecurityDef | undefined): { real: RealFund | undefined; status: 'loading' | 'ok' | 'error' | 'sim' } {
  const status = fundVersion.use((x) => (def ? x.status[def.id] : undefined));
  useEffect(() => {
    requestFundamentals(def, true);
    const timer = setInterval(() => requestFundamentals(def, true), 15 * 60_000);
    return () => clearInterval(timer);
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
    return () => clearInterval(timer);
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
