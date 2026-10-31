import { useEffect } from 'react';
import { createStore, waitFor } from '../../core/store';
import { DAY_MS } from '../calendar';
import { reportCcy, type EarningsEvent, type FinPeriod } from '../fundamentals';
import type { SecurityDef } from '../types';
import { finnhubAvailable, finnhubData, finnhubSymbol, loadFinnhub, type EpsSurprise, type FinnhubPart, type NextReport, type PastReport } from './finnhub';
import { companyReports, earningsCalendar, requestCompanyEarnings, type WindowReport } from './earnings-calendar';
import { earningsReleases, loadFiler, resolveFiler, secAvailable, secTicker, type EarningsRelease } from './sec';
import { alphaVantageAvailable, alphaVantageData, alphaVantageFor, avSymbol, loadAlphaVantage, type AvEarnings } from './alphavantage';
import { loadNasdaq, nasdaqAvailable, nasdaqData, nasdaqPart, nasdaqSymbol, type NasdaqForecast, type NasdaqNextReport } from './nasdaq-company';
import { desktopData, yahooGet, yahooSymbolFor } from './yahoo';
import { fundVersion, getRealFund, usTiming } from './yfund';
import { createWants, registerRefresh } from '../../terminal/refresh';
import { fmtDay, zonedParts } from '../../core/format';
import { historyData, historyFor, loadHistory, periodMonth, type EstimateHistory, type HistoryQuarter } from './estimate-history';
import { announcementCutoff, appendEarningsEvidence, consecutiveEps, earningsEvidence, epsBasisLabel, sameEpsDefinition, type EarningsMeta, type EpsBasis, type ObservationInput } from './earnings-evidence';
export { consecutiveEps, epsBasisLabel } from './earnings-evidence';

/**
 * What analysts expected of a company's quarterly reports, against what it reported: EPS and revenue, for the last
 * quarters and the next two. Yahoo Finance's research modules (no key, YAHOO_RESEARCH_ENABLED) give the last four
 * quarters' EPS against the estimate and the coming quarters' EPS and revenue estimates; Finnhub (FINNHUB_API_KEY,
 * US-listed stocks) gives its own EPS comparisons and the past year's reports with revenue. A reported quarter's
 * revenue estimate comes from Finnhub, or from the estimate the app kept before the report: Yahoo drops a quarter's
 * estimates once it is reported.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface Expectation extends EarningsMeta {
  /** The analysts' average; NaN when no source gives one. */
  est: number;
  low: number;
  high: number;
  analysts: number;
  /** The reported figure, on the same basis as the estimate; NaN until reported or when no source gives it. */
  actual: number;
  ccy?: string;
  estFrom?: string;
  actualFrom?: string;
}

export type ReportTiming = 'Bef-mkt' | 'Aft-mkt' | 'During-mkt' | '--';

export interface QuarterView {
  /** Fiscal quarter end, YYYY-MM-DD; empty if a calendar source gives only its fiscal label and report date. */
  end: string;
  /** Canonical fiscal quarter ("Q3 2026"), or its end date when the source gives no fiscal label. */
  label: string;
  /** The report date (ms), when a source gives it. */
  date?: number;
  /** A source's actual announcement timestamp, distinct from a date-only calendar entry. */
  announcedAt?: number;
  cutoffAt?: number;
  cutoffKind?: 'source-time' | 'session-boundary' | 'date-only';
  /** The report date is the source's estimate, not confirmed by the company. */
  dateEstimated?: boolean;
  /** Session of the announcement; absent when the provider gives only a date. */
  timing?: ReportTiming;
  /** Which source gave `date`. */
  dateFrom?: string;
  /** Where Nasdaq confirms a different day for this report than the date given: both dates in words. */
  dateDisagree?: string;
  /** Another provider's EPS comparison, kept separate because reporting bases may differ. */
  alternativeEps?: Expectation;
  /** Other normalized comparisons, including incompatible definitions; never averaged. */
  epsComparisons?: Expectation[];
  revComparisons?: Expectation[];
  eps: Expectation;
  rev: Expectation;
  /** For a quarter not reported yet, the same quarter a year earlier, as the source gives it. */
  yearAgoEps?: number;
  yearAgoRev?: number;
  /** The diluted EPS in the company's statements as an earnings history gives it, for a quarter the filings do not tag. */
  gaapEps?: { v: number; from: string };
}

export interface Consensus {
  /** Reported quarters, newest first. */
  past: QuarterView[];
  /** The quarter reported next, and the one after. */
  next: QuarterView | null;
  following: QuarterView | null;
  /** Why figures are missing, in the sources' words. */
  problems: string[];
  /** Provider records withheld because their stated reporting chronology is still in the future. */
  chronologyProblems?: string[];
  /** A source has not answered yet. */
  loading: boolean;
  /** The company's earnings releases filed with the SEC (8-K item 2.02), newest first, when loaded. */
  releases?: EarningsRelease[];
  /** Why reported quarters have no expected revenue, when a source could give it. */
  revenueHint?: string;
}

const NONE: Expectation = { est: NaN, low: NaN, high: NaN, analysts: NaN, actual: NaN };
const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const number = (v: Json): number => {
  const x = v && typeof v === 'object' ? v.raw : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : NaN;
};
const ccyOf = (v: unknown) => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : undefined);
const isoOf = (seconds: number) => (ok(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString().slice(0, 10) : '');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysApart = (a: string, b: string) => Math.abs(ms(a) - ms(b)) / DAY_MS;

const complete = (e: Expectation) => ok(e.est) && ok(e.actual);
function retainComparison(q: QuarterView, metric: 'eps' | 'rev', candidate: Expectation) {
  if (!complete(candidate)) return;
  const selected = q[metric];
  const score = (e: Expectation) => (complete(e) ? 1 : 0) + (metric === 'eps' && sameEpsDefinition(e, e) ? 2 : 0) + (e.estimateProvenance === 'pre-announcement-snapshot' ? 4 : 0);
  if (!complete(selected) || score(candidate) > score(selected)) q[metric] = candidate;
  const alternative = q[metric] === candidate ? selected : candidate;
  if (!ok(alternative.est) && !ok(alternative.actual)) return;
  const equal = (a: Expectation, b: Expectation) => a.est === b.est && a.actual === b.actual && a.estFrom === b.estFrom && a.actualFrom === b.actualFrom && a.basis === b.basis && a.ccy === b.ccy;
  if (equal(q[metric], alternative)) return;
  const field = metric === 'eps' ? 'epsComparisons' : 'revComparisons';
  const list = q[field] ?? [];
  if (!list.some((e) => equal(e, alternative))) q[field] = [...list, alternative];
  if (metric === 'eps') q.alternativeEps = q.epsComparisons?.[0];
}

// ------------------------------------------------------------------ Yahoo

export interface YahooAhead {
  end: string;
  label?: string;
  date?: number;
  dateEstimated?: boolean;
  eps: Expectation;
  rev: Expectation;
  yearAgoEps: number;
  yearAgoRev: number;
}

/**
 * Yahoo's consensus EPS for one period now and 7, 30, 60 and 90 days before, with the analysts who raised or cut
 * their estimate in the last 7 and 30 days (its earningsTrend module): how the consensus changed (EEG).
 */
export interface EstimateTrend extends EarningsMeta {
  /** 0q this quarter, +1q next quarter, 0y this fiscal year, +1y next fiscal year. */
  period: '0q' | '+1q' | '0y' | '+1y';
  end: string;
  /** Consensus EPS now and 7, 30, 60 and 90 days before. */
  eps: { now: number; d7: number; d30: number; d60: number; d90: number };
  up7: number;
  up30: number;
  down7: number;
  down30: number;
  analysts: number;
  /** The estimate against the same period a year before, as Yahoo gives it (0.12 is 12%). */
  growth: number;
  yearAgoEps: number;
  ccy?: string;
}

export interface YahooEarnings {
  past: (EarningsMeta & { end: string; label: string; date?: number; announcedAt?: number; epsEst: number; epsActual: number; epsCcy?: string; revActual: number })[];
  /** The currency of the reported revenue (the statements'). */
  revCcy?: string;
  next: YahooAhead | null;
  following: YahooAhead | null;
  /** How each period's consensus changed over 90 days; empty when Yahoo gives none. */
  trends?: EstimateTrend[];
  /** The analysts' long-term EPS growth a year, Yahoo's "next 5 years" (0.12 is 12%); NaN when it gives none. */
  ltg?: number;
}

/** The earningsTrend rows that carry a consensus history. */
export function parseEstimateTrends(trend: Json[]): EstimateTrend[] {
  const out: EstimateTrend[] = [];
  for (const t of trend) {
    const period = t?.period;
    if (!['0q', '+1q', '0y', '+1y'].includes(period) || !ISO.test(String(t?.endDate))) continue;
    const e = t.epsTrend ?? {};
    const r = t.epsRevisions ?? {};
    const eps = { now: number(e.current), d7: number(e['7daysAgo']), d30: number(e['30daysAgo']), d60: number(e['60daysAgo']), d90: number(e['90daysAgo']) };
    if (!Object.values(eps).some(ok)) continue;
    out.push({
      period, end: String(t.endDate), eps,
      up7: number(r.upLast7days), up30: number(r.upLast30days), down7: number(r.downLast7Days ?? r.downLast7days), down30: number(r.downLast30days),
      analysts: number(t.earningsEstimate?.numberOfAnalysts), growth: number(t.growth), yearAgoEps: number(t.earningsEstimate?.yearAgoEps),
      ccy: ccyOf(e.epsTrendCurrency) ?? ccyOf(t.earningsEstimate?.earningsCurrency),
    });
  }
  return out;
}

export const YAHOO_EARNINGS_MODULES = 'earningsHistory,earningsTrend,calendarEvents,earnings';
export const yahooEarningsPath = (symbol: string) => `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${YAHOO_EARNINGS_MODULES}`;

/** Yahoo's quoteSummary with the earnings modules, as figures; NaN wherever Yahoo gives none. */
export function parseYahooEarnings(answer: unknown, symbol?: string, now = Date.now()): { data: YahooEarnings } | { error: string } {
  const row = (answer as Json)?.quoteSummary?.result?.[0];
  if (!row || typeof row !== 'object') return { error: 'Yahoo returned no earnings data.' };
  const basisOf = (v: unknown): EpsBasis => /^(non.?gaap|adjusted)$/i.test(String(v)) ? 'adjusted' : /^gaap$/i.test(String(v)) ? 'gaap' : 'unknown';
  const sourceUrl = symbol ? `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis/` : 'https://finance.yahoo.com/';
  const historyBasis = basisOf(row.earningsHistory?.defaultMethodology);
  const trendBasis = basisOf(row.earningsTrend?.defaultMethodology);
  const definition = { sourceUrl, dataset: 'Yahoo earnings comparison', shareBasis: 'listing' as const, splitBasis: 'Yahoo comparison series', scope: 'issuer' };
  const chart: Json[] = Array.isArray(row.earnings?.earningsChart?.quarterly) ? row.earnings.earningsChart.quarterly : [];
  const fin: Json[] = Array.isArray(row.earnings?.financialsChart?.quarterly) ? row.earnings.financialsChart.quarterly : [];
  const revByLabel = new Map(fin.map((q) => [String(q?.date ?? ''), number(q?.revenue)]));
  const chartByEnd = new Map(chart.map((q) => [isoOf(number(q?.periodEndDate)), q]));
  const history: Json[] = Array.isArray(row.earningsHistory?.history) ? row.earningsHistory.history : [];
  const past = history
    .map((h) => {
      const historyEnd = isoOf(number(h?.quarter));
      // Some Yahoo histories use a calendar quarter end while their chart supplies the fiscal end.
      // Join only the chart's explicit calendar-quarter identity within the same quarter.
      const d = new Date(ms(historyEnd));
      const calendarLabel = Number.isFinite(d.getTime()) ? `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}` : '';
      const c = chartByEnd.get(historyEnd) ?? chart.find((q) => canonicalQuarter(q?.calendarQuarter) === calendarLabel && daysApart(isoOf(number(q?.periodEndDate)), historyEnd) <= 40);
      const end = c ? isoOf(number(c.periodEndDate)) : historyEnd;
      const reported = number(c?.reportedDate) * 1000;
      return {
        end,
        label: canonicalQuarter(c?.fiscalQuarter ?? c?.date) ?? end,
        ...(reported > ms(end) ? { date: reported } : {}),
        ...(reported > ms(end) && reported % DAY_MS !== 0 ? { announcedAt: reported } : {}),
        ...definition,
        basis: historyBasis,
        // Both EPS figures must stay on the same provider/module basis.
        epsEst: c && ok(number(c.estimate)) && ok(number(c.actual)) ? number(c.estimate) : number(h?.epsEstimate),
        epsActual: c && ok(number(c.estimate)) && ok(number(c.actual)) ? number(c.actual) : number(h?.epsActual),
        epsCcy: ccyOf(h?.currency),
        revActual: c ? (revByLabel.get(String(c.date)) ?? NaN) : NaN,
      };
    })
    .filter((q) => ISO.test(q.end) && (ok(q.epsEst) || ok(q.epsActual)))
    .sort((a, b) => b.end.localeCompare(a.end));
  // The chart can contain reports omitted by earningsHistory. Preserve those comparisons too.
  for (const c of chart) {
    const end = isoOf(number(c?.periodEndDate));
    if (!ISO.test(end) || past.some((q) => q.end === end) || (!ok(number(c?.estimate)) && !ok(number(c?.actual)))) continue;
    const reported = number(c.reportedDate) * 1000;
    past.push({ end, label: canonicalQuarter(c.fiscalQuarter ?? c.date) ?? end, ...(reported > ms(end) ? { date: reported } : {}), ...(reported > ms(end) && reported % DAY_MS !== 0 ? { announcedAt: reported } : {}), ...definition, basis: historyBasis, epsEst: number(c.estimate), epsActual: number(c.actual), epsCcy: undefined, revActual: revByLabel.get(String(c.date)) ?? NaN });
  }
  past.sort((a, b) => b.end.localeCompare(a.end));
  const trend: Json[] = Array.isArray(row.earningsTrend?.trend) ? row.earningsTrend.trend : [];
  const ahead = (period: string): YahooAhead | null => {
    const t = trend.find((x) => x?.period === period);
    if (!t || !ISO.test(String(t.endDate))) return null;
    const e = t.earningsEstimate ?? {};
    const r = t.revenueEstimate ?? {};
    const out: YahooAhead = {
      end: String(t.endDate),
      ...(period === '0q' && daysApart(isoOf(number(row.earnings?.earningsChart?.currentPeriodEndDate)), String(t.endDate)) <= 20 ? { label: canonicalQuarter(row.earnings?.earningsChart?.currentFiscalQuarter) } : {}),
      eps: { ...definition, basis: trendBasis, est: number(e.avg), low: number(e.low), high: number(e.high), analysts: number(e.numberOfAnalysts), actual: NaN, ccy: ccyOf(e.earningsCurrency), estFrom: 'Yahoo Finance' },
      rev: { sourceUrl, dataset: 'Yahoo revenue estimates', scope: 'issuer', est: number(r.avg), low: number(r.low), high: number(r.high), analysts: number(r.numberOfAnalysts), actual: NaN, ccy: ccyOf(r.revenueCurrency), estFrom: 'Yahoo Finance' },
      yearAgoEps: number(e.yearAgoEps),
      yearAgoRev: number(r.yearAgoRevenue),
    };
    return ok(out.eps.est) || ok(out.rev.est) ? out : null;
  };
  let next = ahead('0q');
  let following = ahead('+1q');
  // Just after a report, Yahoo can still name the reported quarter as the current one.
  const latestReported = past.find((q) => ms(q.end) <= now && (!q.announcedAt || q.announcedAt <= now) && (q.announcedAt || !q.date || q.date <= now));
  if (next && latestReported && next.end <= latestReported.end) [next, following] = [following, null];
  const cal = row.calendarEvents?.earnings;
  const date = number(cal?.earningsDate?.[0]) * 1000;
  if (next && date > 0 && date > ms(next.end)) {
    next.date = date;
    // Confirmed only when Yahoo says so and has the earnings call set on that date: it also marks dates the company has
    // not announced as confirmed (NVIDIA's 25 November 2026 on 28 October, before NVIDIA had set any date).
    const call = number(cal?.earningsCallDate?.[0]) * 1000;
    next.dateEstimated = cal?.isEarningsDateEstimate === true || !(call > 0 && call >= date - DAY_MS);
  }
  return { data: { past, revCcy: ccyOf(row.earnings?.financialCurrency), next, following, trends: parseEstimateTrends(trend).map((t) => ({ ...definition, basis: trendBasis, ...t })), ltg: number(trend.find((x) => x?.period === '+5y')?.growth) } };
}

// ------------------------------------------------- estimates kept by the app

/** A coming quarter's estimates as the app last saw them, kept after Yahoo drops them at the report. */
export interface KeptEstimate extends EarningsMeta {
  epsEst: number;
  epsCcy?: string;
  revEst: number;
  revCcy?: string;
  revAnalysts: number;
  /** When they were read (ms). */
  at: number;
}

/** By security id, then quarter end. */
// Keep version 1 readable: older snapshots remain explicitly without methodology/provenance.
export const keptEstimates = createStore<{ by: Record<string, Record<string, KeptEstimate>>; vintages?: Record<string, Record<string, KeptEstimate[]>> }>({ by: {}, vintages: {} }, 'earnings-expectations', 1);
const KEEP_QUARTERS = 6;
const KEEP_SECURITIES = 400;

/** Keeps the estimates of the coming quarters (the latest reading of each), for when the quarter is reported. */
export function keepEstimates(id: string, y: YahooEarnings, now = Date.now()) {
  const ahead = [y.next, y.following].filter((a): a is YahooAhead => !!a && (ok(a.eps.est) || ok(a.rev.est)));
  if (!ahead.length) return;
  keptEstimates.set((s) => {
    const mine = { ...(s.by[id] ?? {}) };
    const vintages = { ...(s.vintages?.[id] ?? {}) };
    for (const a of ahead) {
      const next: KeptEstimate = { epsType: a.eps.epsType, unit: a.eps.unit, publishedAt: a.eps.publishedAt, epsEst: a.eps.est, epsCcy: a.eps.ccy, revEst: a.rev.est, revCcy: a.rev.ccy, revAnalysts: a.rev.analysts, basis: a.eps.basis ?? 'unknown', shareBasis: a.eps.shareBasis, splitBasis: a.eps.splitBasis, scope: a.eps.scope, sourceUrl: a.eps.sourceUrl, dataset: a.eps.dataset, observedAt: now, at: now };
      // Migrate the one legacy snapshot without inventing a definition or an earlier provider publication time.
      const list = [...(vintages[a.end] ?? (mine[a.end] ? [mine[a.end]] : []))];
      const same = (x: KeptEstimate) => JSON.stringify([x.epsEst, x.epsCcy, x.revEst, x.revCcy, x.basis, x.shareBasis, x.splitBasis, x.scope, x.epsType, x.unit, x.publishedAt]) === JSON.stringify([next.epsEst, next.epsCcy, next.revEst, next.revCcy, next.basis, next.shareBasis, next.splitBasis, next.scope, next.epsType, next.unit, next.publishedAt]);
      if (!list.length || !same(list[list.length - 1])) list.push(next);
      vintages[a.end] = list;
      mine[a.end] = next;
    }
    const ends = Object.keys(mine).sort().reverse();
    for (const e of ends.slice(KEEP_QUARTERS)) delete mine[e];
    const by = { ...s.by, [id]: mine };
    const ids = Object.keys(by);
    if (ids.length > KEEP_SECURITIES) {
      const latest = (x: string) => Math.max(...Object.values(by[x]).map((k) => k.at));
      for (const old of ids.sort((a, b) => latest(a) - latest(b)).slice(0, ids.length - KEEP_SECURITIES)) delete by[old];
    }
    return { by, vintages: { ...s.vintages, [id]: vintages } };
  });
}

// ------------------------------------------------------------------ merging

export interface ConsensusInput {
  yahoo?: YahooEarnings;
  finnhubEps?: EpsSurprise[];
  finnhubPast?: PastReport[];
  finnhubNext?: NextReport | null;
  kept?: Record<string, KeptEstimate>;
  keptVintages?: Record<string, KeptEstimate[]>;
  sourceMeta?: Record<string, EarningsMeta>;
  /** FMP's reports (expected and reported EPS and revenue), newest first. */
  fmpReports?: WindowReport[];
  /** The company's quarterly statements (revenue in millions) and their currency. */
  statements?: FinPeriod[];
  statementCcy?: string;
  /** Alpha Vantage's reports and estimates (US listings, the owner's key). */
  av?: AvEarnings;
  /** Nasdaq's consensus EPS of the coming quarters, and its next report date. */
  nasdaqForecast?: NasdaqForecast | null;
  nasdaqNext?: NasdaqNextReport | null;
  /** The company's earnings releases filed with the SEC (8-K item 2.02), newest first. */
  secReleases?: EarningsRelease[];
  /**
   * Finviz's, Zacks' or MarketBeat's history of reports with the consensus before each (EPS, revenue in dollars), in
   * the order they are used.
   */
  history?: EstimateHistory[];
  /** The fiscal year's last month (1-12), for naming quarters only Alpha Vantage or Nasdaq give. */
  fye?: number;
  /** The clock (ms), for the tests. */
  now?: number;
}

/**
 * The fiscal quarter a period end falls in ("Q1 2026" for Apple's December quarter), named by the year the fiscal year
 * ends. An end in a month's first week (52/53-week years) counts in the month before.
 */
export function fiscalLabel(end: string, fye: number | undefined): string | undefined {
  if (!ISO.test(end) || !(fye != null && fye >= 1 && fye <= 12)) return undefined;
  const d = new Date(ms(end) - (Number(end.slice(8)) <= 7 ? 8 * DAY_MS : 0));
  const m = d.getUTCMonth() + 1;
  const offset = (m - fye + 12) % 12;
  if (offset % 3 !== 0) return undefined;
  const q = offset === 0 ? 4 : offset / 3;
  const fy = m > fye ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return `Q${q} ${fy}`;
}

/** The fiscal year's last month from a quarter the source names: "Q2 2026" ending in November closes its year in May. */
export function fyeFromLabels(qs: { end: string; label: string }[]): number | undefined {
  for (const q of qs) {
    const m = /^Q([1-4]) \d{4}$/.exec(canonicalQuarter(q.label) ?? '');
    if (m && ISO.test(q.end)) return ((endMonth(q.end) + (4 - Number(m[1])) * 3 - 1) % 12) + 1;
  }
  return undefined;
}

/** The month (1-12) a fiscal period end counts in: an end in a month's first week (52/53-week years) is the month before. */
function endMonth(end: string): number {
  return new Date(ms(end) - (Number(end.slice(8)) <= 7 ? 8 * DAY_MS : 0)).getUTCMonth() + 1;
}

/**
 * The end of the fiscal quarter Finnhub's /stock/earnings means by `period`. Finnhub names a quarter by the end of
 * the calendar quarter its fiscal quarter ends in: NVIDIA's quarter ended 26 Jul 2026 is "2026-09-30". The fiscal
 * quarter ends in the month of that calendar quarter that closes one of the company's quarters (`closes`: its fiscal
 * year's last month, or the month of any quarter end it reported). A period that is not a calendar quarter's end,
 * or a company whose quarters are not known, keeps the period as given.
 */
export function finnhubQuarterEnd(period: string, closes: number | undefined): string {
  if (!ISO.test(period) || !(closes != null && closes >= 1 && closes <= 12)) return period;
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  if (m % 3 !== 0 || period !== monthEnd(period.slice(0, 7))) return period;
  for (let back = 0; back < 3; back++) {
    const month = m - back;
    if ((month - closes + 12) % 3 === 0) return monthEnd(`${y}-${String(month).padStart(2, '0')}`);
  }
  return period;
}

/** A single spelling for a fiscal quarter, regardless of a provider's label style. */
export function canonicalQuarter(label: unknown): string | undefined {
  const text = String(label ?? '').trim().toUpperCase().replace(/FY\s*/g, '');
  const m = /^(?:Q([1-4])|([1-4])Q)\s*(\d{4})$/.exec(text);
  return m ? `Q${m[1] ?? m[2]} ${m[3]}` : undefined;
}

const reportLabel = (r: { quarter: number; year: number }) => Number.isInteger(r.quarter) && r.quarter >= 1 && r.quarter <= 4 && Number.isInteger(r.year) ? `Q${r.quarter} ${r.year}` : undefined;
export const reportTiming = (hour: string): ReportTiming => hour === 'bmo' ? 'Bef-mkt' : hour === 'amc' ? 'Aft-mkt' : hour === 'dmh' ? 'During-mkt' : '--';
export const timingLabel = (timing: ReportTiming | undefined): string => timing === 'Bef-mkt' ? 'Pre-market' : timing === 'Aft-mkt' ? 'After-market' : timing === 'During-mkt' ? 'During market' : 'Time not provided';

/** A calendar report is used once and must agree with the fiscal quarter when both sources name it. */
function finnhubReport(rows: PastReport[], q: QuarterView, used: Set<PastReport>): PastReport | undefined {
  const label = canonicalQuarter(q.label);
  const candidates = rows.filter((r) => !used.has(r) && (!q.end || (r.date > q.end && ms(r.date) - ms(q.end) <= 120 * DAY_MS)) && (!label || !reportLabel(r) || label === reportLabel(r)));
  if (q.date) {
    const day = new Date(q.date).toISOString().slice(0, 10);
    const hit = candidates.find((r) => daysApart(r.date, day) <= 7);
    if (hit) return hit;
  }
  // A date-only fallback without a quarter identity can bind an adjacent quarter's announcement.
  return candidates.filter((r) => label && reportLabel(r) === label).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** FMP's report of a quarter: on its report date, else the first report in the four months after its end. FMP names no fiscal quarter. */
function fmpReport(rows: WindowReport[], q: QuarterView, used: Set<WindowReport>): WindowReport | undefined {
  const free = rows.filter((r) => !used.has(r) && (ok(r.epsActual) || ok(r.revActual)));
  if (q.date) return free.find((r) => Math.abs(ms(r.date) - q.date!) <= 7 * DAY_MS);
  if (!ISO.test(q.end)) return undefined;
  return free.filter((r) => r.date > q.end && ms(r.date) - ms(q.end) <= 120 * DAY_MS).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** Expected against reported for each quarter, from every source, each figure with its source. */
export function mergeConsensus(i: ConsensusInput): Omit<Consensus, 'problems' | 'loading'> {
  const now = i.now ?? Date.now();
  const chronologyProblems: string[] = [];
  const reportedByNow = (source: string, end?: string, date?: number, announcedAt?: number): boolean => {
    const reason = end && ms(end) > now ? `fiscal period ${end} has not ended` :
      ok(announcedAt) && announcedAt > now ? `stated announcement ${new Date(announcedAt).toISOString()} is in the future` :
        !ok(announcedAt) && ok(date) && date > now ? `stated report date ${new Date(date).toISOString().slice(0, 10)} is in the future` : undefined;
    if (!reason) return true;
    const message = `${source}: reported data withheld because ${reason}.`;
    if (!chronologyProblems.includes(message)) chronologyProblems.push(message);
    return false;
  };
  const reportedHistoryRow = (source: string, rows: HistoryQuarter[], q: QuarterView) => {
    const r = historyRow(rows, q);
    return r && reportedByNow(source, r.end ?? (r.period ? monthEnd(r.period) : labelEnd(r.label, i.fye)), ms(r.date)) ? r : undefined;
  };
  // Reject a source's impossible reported rows before they can supply dates, fiscal anchors or comparisons to
  // healthy sources. Future estimates remain available in the separate upcoming-quarter path.
  i = {
    ...i,
    yahoo: i.yahoo ? { ...i.yahoo, past: i.yahoo.past.filter((q) => reportedByNow('Yahoo Finance', q.end, q.date, q.announcedAt)) } : undefined,
    finnhubPast: i.finnhubPast?.filter((r) => reportedByNow('Finnhub', undefined, ms(r.date))),
    fmpReports: i.fmpReports?.filter((r) => (!ok(r.epsActual) && !ok(r.revActual)) || reportedByNow('FMP', undefined, ms(r.date))),
    av: i.av ? { ...i.av, reports: i.av.reports.filter((r) => reportedByNow('Alpha Vantage', r.end, ms(r.date))) } : undefined,
    statements: i.statements?.filter((p) => !ok(p.end) || reportedByNow('Statements', new Date(p.end).toISOString().slice(0, 10))),
    secReleases: i.secReleases?.filter((r) => reportedByNow('SEC earnings release', undefined, ms(r.date))),
    history: i.history?.map((h) => {
      const eligible = (r: HistoryQuarter) => !ok(r.actual) || reportedByNow(h.source, r.end ?? (r.period ? monthEnd(r.period) : labelEnd(r.label, i.fye)), ms(r.date));
      return { ...h, eps: h.eps.filter(eligible), sales: h.sales.filter(eligible), gaap: h.gaap.filter(eligible) };
    }),
  };
  const y = i.yahoo;
  let quarters: QuarterView[] = (y?.past ?? []).map((q) => ({
    end: q.end,
    label: canonicalQuarter(q.label) ?? q.label,
    ...(q.date ? { date: q.date } : {}),
    ...(q.announcedAt ? { announcedAt: q.announcedAt } : {}),
    eps: { ...NONE, basis: q.basis ?? 'unknown', epsType: q.epsType, unit: q.unit, shareBasis: q.shareBasis, splitBasis: q.splitBasis, scope: q.scope, dataset: q.dataset, sourceUrl: q.sourceUrl, est: q.epsEst, actual: q.epsActual, ccy: q.epsCcy, estFrom: ok(q.epsEst) ? 'Yahoo Finance' : undefined, actualFrom: ok(q.epsActual) ? 'Yahoo Finance' : undefined },
    rev: { ...NONE },
  }));
  const at = (end: string, label?: string) => quarters.find((q) => {
    const sameLabel = label && canonicalQuarter(q.label) === label;
    const noConflict = !label || !canonicalQuarter(q.label) || sameLabel;
    return (sameLabel && daysApart(q.end, end) <= 45) || (noConflict && daysApart(q.end, end) <= 20);
  });
  // Finnhub's EPS comparisons, for quarters Yahoo leaves out or gives without an estimate. Its periods are calendar
  // quarters (see finnhubQuarterEnd); a period it gives twice (NVIDIA's April 2026 quarter, once as fiscal 2026 and
  // once as 2027) is one quarter, used once.
  const knownEnd = [...(y?.past ?? []).map((q) => q.end), ...(i.statements ?? []).filter((p) => ok(p.end)).map((p) => new Date(p.end).toISOString().slice(0, 10))].find((e) => ISO.test(e));
  const closes = i.fye ?? (knownEnd ? endMonth(knownEnd) : undefined);
  const seenPeriods = new Set<string>();
  for (const f of i.finnhubEps ?? []) {
    if (!ok(f.actual) && !ok(f.estimate)) continue;
    if (seenPeriods.has(f.period)) continue;
    seenPeriods.add(f.period);
    const eps: Expectation = { ...NONE, est: f.estimate, actual: f.actual, estFrom: 'Finnhub', actualFrom: 'Finnhub' };
    const end = finnhubQuarterEnd(f.period, closes);
    if (!reportedByNow('Finnhub', end)) continue;
    // The fiscal year names the quarter when it is known; Finnhub's own year and quarter can disagree with it.
    const label = fiscalLabel(end, i.fye) ?? reportLabel(f);
    const q = at(end, label);
    if (!q) quarters.push({ end, label: label ?? end, eps, rev: { ...NONE } });
    else retainComparison(q, 'eps', eps);
    if (q && !canonicalQuarter(q.label) && label) q.label = label;
  }
  // Calendar history can be the only available reported data. Its fiscal label and publication date are
  // known, but it does not supply the statement period end; leave that absent rather than inventing one.
  for (const f of i.finnhubPast ?? []) {
    const label = reportLabel(f);
    if (!label || quarters.some((q) => canonicalQuarter(q.label) === label)) continue;
    const byDate = quarters.find((q) => !canonicalQuarter(q.label) && q.date && Math.abs(q.date - ms(f.date)) <= 7 * DAY_MS);
    if (byDate) {
      byDate.label = label;
      continue;
    }
    quarters.push({ end: '', label, date: ms(f.date), eps: { ...NONE, est: f.epsEstimate, actual: f.epsActual, estFrom: ok(f.epsEstimate) ? 'Finnhub' : undefined, actualFrom: ok(f.epsActual) ? 'Finnhub' : undefined }, rev: { ...NONE } });
  }
  // Alpha Vantage's reports: quarters the others leave out, and the report date, session and EPS comparison of
  // those they give without one (its expected and reported EPS are one basis).
  for (const r of (i.av?.reports ?? []).slice(0, 12)) {
    const eps: Expectation = { ...NONE, ...r, est: r.epsEst, actual: r.epsActual, estFrom: ok(r.epsEst) ? 'Alpha Vantage' : undefined, actualFrom: ok(r.epsActual) ? 'Alpha Vantage' : undefined };
    const q = at(r.end);
    if (!q) {
      quarters.push({ end: r.end, label: fiscalLabel(r.end, i.fye) ?? r.end, date: ms(r.date), ...(r.timing !== '--' ? { timing: r.timing } : {}), eps, rev: { ...NONE } });
      continue;
    }
    if (!q.date && r.date > q.end) q.date = ms(r.date);
    if ((!q.timing || q.timing === '--') && r.timing !== '--' && q.date && Math.abs(q.date - ms(r.date)) <= 2 * DAY_MS) q.timing = r.timing;
    retainComparison(q, 'eps', eps);
  }
  // The histories' reported quarters that no other source gives (Finviz reaches back two years, Zacks about five,
  // MarketBeat two). Finviz and Zacks name a quarter by the month it ends in, MarketBeat by its fiscal quarter.
  for (const hs of i.history ?? []) {
    const keyOf = (r: HistoryQuarter) => r.period || r.label || '';
    const keys = [...new Set([...hs.sales, ...hs.eps].map(keyOf).filter(Boolean))];
    const picked = keys
      .map((k) => {
        const s = hs.sales.find((r) => keyOf(r) === k);
        const e = hs.eps.find((r) => keyOf(r) === k);
        return { s, e, row: (s ?? e)! };
      })
      .sort((a, b) => b.row.date.localeCompare(a.row.date))
      .slice(0, 16);
    for (const { s, e, row } of picked) {
      // Reported quarters only: the coming report has estimates only.
      if (!(ok(s?.actual) || ok(e?.actual)) || ms(row.date) > now) continue;
      const end = row.end ?? (row.period ? monthEnd(row.period) : labelEnd(row.label, i.fye));
      // A fiscal quarter is reported in the four months after it ends: a label that does not fit the company's fiscal
      // year is another basis and is not used. Without the fiscal year the quarter keeps the source's name only.
      const endOk = !!end && row.date > end && ms(row.date) - ms(end) <= 120 * DAY_MS;
      if (!endOk && (row.period || i.fye != null)) continue;
      const probe: QuarterView = { end: endOk ? end! : '', label: row.label ?? '', date: ms(row.date), eps: { ...NONE }, rev: { ...NONE } };
      if (quarters.some((q) => historyRow([row], q))) continue;
      const label = (endOk ? fiscalLabel(probe.end, i.fye) : undefined) ?? row.label;
      if (!label && !probe.end) continue;
      // A quarter already listed under its name is not listed twice.
      if (label && quarters.some((q) => canonicalQuarter(q.label) === label)) continue;
      quarters.push({
        ...probe,
        label: label ?? probe.end,
        ...(row.timing ? { timing: row.timing } : {}),
        eps: e && ok(e.est) && ok(e.actual) ? { ...NONE, ...e, estFrom: hs.source, actualFrom: hs.source } : { ...NONE },
      });
    }
  }
  const fiscalOrder = (q: QuarterView) => {
    const label = canonicalQuarter(q.label);
    return label ? Number(label.slice(3)) * 4 + Number(label[1]) : NaN;
  };
  quarters.sort((a, b) => ok(fiscalOrder(a)) && ok(fiscalOrder(b)) ? fiscalOrder(b) - fiscalOrder(a) : b.end.localeCompare(a.end));
  const statements = i.statements ?? [];
  const usedReports = new Set<PastReport>();
  const usedFmp = new Set<WindowReport>();
  const usedReleases = new Set<EarningsRelease>();
  // Alpha Vantage names no currency: its revenue estimates are used for companies reporting in dollars.
  const avRevenue = i.statementCcy === 'USD';
  for (const q of quarters) {
    // Resolve all available date/session evidence before testing estimate vintage eligibility.
    // A calendar date discovered later in the merge must not silently discard an eligible snapshot.
    const dateHistory = (i.history ?? []).flatMap((h) => [reportedHistoryRow(h.source, h.sales, q), reportedHistoryRow(h.source, h.eps, q)]).find((r) => !!r);
    const dateFmp = fmpReport(i.fmpReports ?? [], q, usedFmp);
    const dateSec = ISO.test(q.end) ? (i.secReleases ?? []).filter((r) => !usedReleases.has(r) && r.date > q.end && ms(r.date) - ms(q.end) <= 120 * DAY_MS).sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
    if (!q.date) {
      const date = dateFmp?.date ?? dateHistory?.date ?? dateSec?.date;
      if (date) q.date = ms(date);
      if (!dateFmp && !dateHistory && dateSec) usedReleases.add(dateSec);
    }
    if (!q.timing || q.timing === '--') q.timing = dateHistory?.timing ?? dateSec?.timing;
    const f = finnhubReport(i.finnhubPast ?? [], q, usedReports);
    if (f) {
      usedReports.add(f);
      q.timing = reportTiming(f.hour);
      if (!q.date) q.date = ms(f.date);
      retainComparison(q, 'eps', { ...NONE, ...f, est: f.epsEstimate, actual: f.epsActual, estFrom: 'Finnhub', actualFrom: 'Finnhub' });
      // Finnhub names no currency, so its revenue is compared only with its own estimate.
      if (ok(f.revenueEstimate) || ok(f.revenueActual)) q.rev = { ...NONE, ...(f as PastReport & EarningsMeta), est: f.revenueEstimate, actual: f.revenueActual, estFrom: ok(f.revenueEstimate) ? 'Finnhub' : undefined, actualFrom: ok(f.revenueActual) ? 'Finnhub' : undefined };
    }
    // Otherwise the reported revenue in the statements' currency, and the estimate the app kept in the same currency.
    const yq = y?.past.find((p) => p.end === q.end);
    const st = statements.find((p) => ok(p.end) && Math.abs(p.end - ms(q.end)) <= 20 * DAY_MS && ok(p.rev));
    const actual = yq && ok(yq.revActual) ? { v: yq.revActual, ccy: y?.revCcy, from: 'Yahoo Finance' } : st ? { v: st.rev * 1e6, ccy: i.statementCcy, from: 'statements' } : ok(q.rev.actual) ? { v: q.rev.actual, ccy: undefined, from: q.rev.actualFrom } : null;
    const cutoff = announcementCutoff(q.date, q.timing, q.announcedAt);
    if (cutoff) Object.assign(q, { cutoffAt: cutoff.at, cutoffKind: cutoff.kind });
    const keptEnd = [...new Set([...Object.keys(i.keptVintages ?? {}), ...Object.keys(i.kept ?? {})])].find((e) => daysApart(e, q.end) <= 20);
    const candidates = keptEnd ? i.keptVintages?.[keptEnd] ?? (i.kept?.[keptEnd] ? [i.kept[keptEnd]] : []) : [];
    // With an unknown announcement time only an estimate from before the report day is eligible.
    const k = cutoff ? candidates.filter((s) => ok(s.at) && s.at < cutoff.at && (!ok(s.publishedAt) || s.publishedAt < cutoff.at)).sort((a, b) => b.at - a.at)[0] : undefined;
    const estOk = k && ok(k.revEst) && actual?.from !== 'Finnhub' && !!k.revCcy && !!actual?.ccy && k.revCcy === actual.ccy;
    if (!ok(q.rev.est)) {
      q.rev = {
        ...NONE,
        ...(estOk ? { est: k!.revEst, analysts: k!.revAnalysts, estFrom: `Yahoo Finance, read ${fmtDay(k!.at, true)}`, estimateObservedAt: k!.at, estimateProvenance: 'pre-announcement-snapshot' as const, sourceUrl: k!.sourceUrl, dataset: 'Yahoo revenue estimates' } : {}),
        ...(actual ? { actual: actual.v, actualFrom: actual.from } : {}),
        ccy: (estOk ? k!.revCcy : undefined) ?? actual?.ccy,
      };
    }
    // A kept EPS estimate fills a quarter no source compares, against Yahoo's reported EPS.
    if (k && ok(k.epsEst) && yq && ok(yq.epsActual) && sameEpsDefinition({ ...k, ccy: k.epsCcy }, { ...yq, ccy: yq.epsCcy })) q.eps = { ...NONE, basis: k.basis, shareBasis: k.shareBasis, epsType: k.epsType, unit: k.unit, splitBasis: k.splitBasis, scope: k.scope, dataset: k.dataset, sourceUrl: k.sourceUrl, est: k.epsEst, actual: yq.epsActual, ccy: k.epsCcy, estFrom: 'Yahoo Finance (kept)', actualFrom: 'Yahoo Finance', estimateObservedAt: k.at, estimatePublishedAt: k.publishedAt, estimateProvenance: 'pre-announcement-snapshot' };
    // FMP's history fills what is still without an estimate: its revenue estimate with its own reported revenue when
    // it gives one (one basis for the surprise), else against the reported revenue already shown. FMP names no
    // currency and gives dollars even for a company reporting in another (TSM's revenue in dollars, Yahoo's in Taiwan
    // dollars), so it joins another source's reported revenue only when that is in dollars and of the same order.
    const p = fmpReport(i.fmpReports ?? [], q, usedFmp);
    if (p) {
      usedFmp.add(p);
      if (!q.date) q.date = ms(p.date);
      retainComparison(q, 'eps', { ...NONE, ...p, est: p.epsEst, actual: p.epsActual, estFrom: 'FMP', actualFrom: 'FMP' });
      if (!ok(q.rev.est) && ok(p.revEst)) {
        const dollars = (q.rev.ccy ?? i.statementCcy ?? 'USD') === 'USD';
        if (ok(p.revActual)) retainComparison(q, 'rev', { ...NONE, ...p, est: p.revEst, actual: p.revActual, estFrom: 'FMP', actualFrom: 'FMP' });
        else if (!ok(q.rev.actual) || (dollars && q.rev.ccy === 'USD' && q.rev.actualFrom === 'FMP')) q.rev = { ...q.rev, est: p.revEst, estFrom: 'FMP' };
      }
    }
    // Alpha Vantage's estimate of the quarter's revenue (US listings reporting in dollars), when it is of the same
    // order as the reported figure: a wider gap means another basis or currency.
    const ae = avQuarter(i.av, q.end);
    if (ae && ok(ae.revEst) && ok(q.rev.actual) && q.rev.actualFrom !== 'Alpha Vantage') q.revComparisons = [...(q.revComparisons ?? []), { ...NONE, ...ae, est: ae.revEst, low: ae.revLow, high: ae.revHigh, analysts: ae.revAnalysts, estFrom: 'Alpha Vantage' }];
    if (ae && !ok(q.rev.est) && ok(ae.revEst) && avRevenue && (!ok(q.rev.actual) || q.rev.actualFrom === 'Alpha Vantage')) {
      q.rev = { ...q.rev, est: ae.revEst, low: ae.revLow, high: ae.revHigh, analysts: ae.revAnalysts, estFrom: 'Alpha Vantage' };
    }
    // The history's consensus before the report: the expected revenue Yahoo drops once a quarter is reported (dollars,
    // for companies reporting in dollars, and only when it is of the same order as the reported revenue), and the EPS
    // comparison or report date the other sources leave out.
    for (const h of i.history ?? []) {
      const zs = reportedHistoryRow(h.source, h.sales, q);
      const ze = reportedHistoryRow(h.source, h.eps, q);
      if (zs && ok(zs.est)) {
        // Keep the source's own pair. Similar magnitudes cannot establish matching reporting scope.
        if (ok(zs.actual)) retainComparison(q, 'rev', { ...NONE, ...zs, est: zs.est, actual: zs.actual, ccy: zs.ccy, estFrom: h.source, actualFrom: h.source });
      }
      if (ze) retainComparison(q, 'eps', { ...NONE, ...ze, estFrom: h.source, actualFrom: h.source });
      const zg = q.gaapEps ? undefined : reportedHistoryRow(h.source, h.gaap, q);
      if (zg && ok(zg.actual)) q.gaapEps = { v: zg.actual, from: h.source };
      const zd = zs ?? ze;
      if (zd && !q.date) q.date = ms(zd.date);
      if (zd?.timing && (!q.timing || q.timing === '--') && q.date && Math.abs(q.date - ms(zd.date)) <= 2 * DAY_MS) q.timing = zd.timing;
    }
    // The report date and session from the company's own 8-K (results of operations), the first one filed in the
    // four months after the quarter ended.
    if (!q.date && ISO.test(q.end)) {
      const rel = (i.secReleases ?? []).filter((x) => !usedReleases.has(x) && x.date > q.end && ms(x.date) - ms(q.end) <= 120 * DAY_MS).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (rel) {
        usedReleases.add(rel);
        q.date = ms(rel.date);
        if (!q.timing || q.timing === '--') q.timing = rel.timing;
      }
    }
  }
  // Check the resolved chronology too, before a purported reported quarter can change the upcoming-quarter anchors.
  quarters = quarters.filter((q) => reportedByNow(q.eps.actualFrom ?? q.rev.actualFrom ?? 'Earnings source', q.end, q.date, q.announcedAt));
  // The coming quarters are named by the fiscal year the reported ones show when the security's is not known.
  const fye = i.fye ?? fyeFromLabels([...(y?.past ?? []), ...(y?.next?.label ? [{ end: y.next.end, label: y.next.label }] : [])]);
  const view = (a: YahooAhead | null | undefined): QuarterView | null =>
    a ? { end: a.end, label: a.label ?? fiscalLabel(a.end, fye) ?? a.end, ...(a.date ? { date: a.date, dateEstimated: a.dateEstimated, dateFrom: 'Yahoo Finance' } : {}), eps: a.eps, rev: a.rev, yearAgoEps: a.yearAgoEps, yearAgoRev: a.yearAgoRev } : null;
  let next: QuarterView | null = view(y?.next);
  const fn = i.finnhubNext;
  if (fn) {
    const fromFinnhub: QuarterView = {
      end: '',
      label: ok(fn.quarter) && ok(fn.year) ? `Q${fn.quarter} ${fn.year}` : fn.date,
      date: ms(fn.date),
      dateFrom: 'Finnhub',
      timing: reportTiming(fn.hour),
      eps: { ...NONE, est: fn.epsEstimate, estFrom: ok(fn.epsEstimate) ? 'Finnhub' : undefined },
      rev: { ...NONE, est: fn.revenueEstimate, estFrom: ok(fn.revenueEstimate) ? 'Finnhub' : undefined },
    };
    if (!next) next = fromFinnhub;
    else if ((!canonicalQuarter(next.label) || !reportLabel(fn) || canonicalQuarter(next.label) === reportLabel(fn)) && (!next.end || (fn.date > next.end && ms(fn.date) - ms(next.end) <= 120 * DAY_MS)) && (!next.date || Math.abs(ms(fn.date) - next.date) <= 10 * DAY_MS)) {
      next.timing = fromFinnhub.timing;
      if (!canonicalQuarter(next.label) && reportLabel(fn)) next.label = reportLabel(fn)!;
      // Finnhub's calendar names the report date when Yahoo has none, and fills an estimate Yahoo leaves out.
      if (!next.date) Object.assign(next, { date: fromFinnhub.date, dateFrom: 'Finnhub' });
      if (!ok(next.eps.est) && ok(fn.epsEstimate)) next.eps = fromFinnhub.eps;
      if (!ok(next.rev.est) && ok(fn.revenueEstimate)) next.rev = fromFinnhub.rev;
    }
  }
  // FMP's coming report, for an estimate the others leave out.
  const ahead = (i.fmpReports ?? []).filter((r) => !ok(r.epsActual) && !ok(r.revActual) && (ok(r.epsEst) || ok(r.revEst)) && (!quarters[0]?.date || ms(r.date) > quarters[0].date + 20 * DAY_MS)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (ahead && next && (!next.date || Math.abs(ms(ahead.date) - next.date) <= 10 * DAY_MS)) {
    if (!next.date) Object.assign(next, { date: ms(ahead.date), dateFrom: 'FMP' });
    if (!ok(next.eps.est) && ok(ahead.epsEst)) next.eps = { ...NONE, est: ahead.epsEst, estFrom: 'FMP' };
    if (!ok(next.rev.est) && ok(ahead.revEst)) next.rev = { ...NONE, est: ahead.revEst, estFrom: 'FMP' };
  } else if (ahead && !next) {
    next = { end: '', label: ahead.date, date: ms(ahead.date), dateFrom: 'FMP', eps: { ...NONE, est: ahead.epsEst, estFrom: ok(ahead.epsEst) ? 'FMP' : undefined }, rev: { ...NONE, est: ahead.revEst, estFrom: ok(ahead.revEst) ? 'FMP' : undefined } };
  }
  let following = view(y?.following);
  // Alpha Vantage's and Nasdaq's estimates of the coming quarters: they fill what the others leave out, and name the
  // coming quarters when no other source does.
  // Without a reported quarter, the coming ones are those ending from about a quarter ago.
  const lastEnd = quarters.find((q) => ISO.test(q.end))?.end ?? new Date((i.now ?? Date.now()) - 100 * DAY_MS).toISOString().slice(0, 10);
  const lastDate = Math.max(0, ...quarters.map((q) => q.date ?? 0));
  const comingAv = (i.av?.estimates ?? []).filter((e) => e.period === 'quarter' && e.end > lastEnd);
  const comingNq = (i.nasdaqForecast?.quarterly ?? []).filter((e) => e.end > lastEnd && (!lastEnd || daysApart(e.end, lastEnd) > 45));
  const fill = (v: QuarterView | null, k: 0 | 1): QuarterView | null => {
    const anchor = v?.end || comingAv[k]?.end || comingNq[k]?.end;
    if (!anchor) return v;
    const a = comingAv.find((e) => daysApart(e.end, anchor) <= 20);
    const n = comingNq.find((e) => daysApart(e.end, anchor) <= 20);
    if (!a && !n) return v;
    const out: QuarterView = v ?? { end: anchor, label: fiscalLabel(anchor, fye) ?? anchor, eps: { ...NONE }, rev: { ...NONE } };
    if (!ok(out.eps.est)) {
      if (a && ok(a.epsEst)) out.eps = { ...NONE, ...a, est: a.epsEst, low: a.epsLow, high: a.epsHigh, analysts: a.epsAnalysts, estFrom: 'Alpha Vantage' };
      else if (n) out.eps = { ...NONE, est: n.est, low: n.low, high: n.high, analysts: n.analysts, estFrom: 'Nasdaq (Zacks)' };
    }
    if (!ok(out.rev.est) && a && ok(a.revEst) && avRevenue) out.rev = { ...NONE, est: a.revEst, low: a.revLow, high: a.revHigh, analysts: a.revAnalysts, estFrom: 'Alpha Vantage' };
    // The same quarter a year earlier, for the growth the estimates imply.
    const ago = quarters.find((q) => ISO.test(q.end) && daysApart(q.end, anchor) >= 340 && daysApart(q.end, anchor) <= 390);
    if (ago && !ok(out.yearAgoEps) && ok(ago.eps.actual) && out.eps.estFrom === ago.eps.actualFrom) out.yearAgoEps = ago.eps.actual;
    return out;
  };
  next = fill(next, 0);
  following = fill(following, 1);
  // The coming quarter's revenue estimate from the histories (Finviz gives the next report's), when no other source
  // gives one; and the coming quarter itself when no source names it.
  const coming = (h: EstimateHistory) => h.sales.filter((r) => !ok(r.actual) && ok(r.est) && ms(r.date) >= now - DAY_MS && (!lastDate || ms(r.date) > lastDate + 20 * DAY_MS)).sort((a, b) => a.date.localeCompare(b.date))[0];
  for (const h of avRevenue ? i.history ?? [] : []) {
    const r = coming(h);
    if (!r) continue;
    const end = r.end ?? (r.period ? monthEnd(r.period) : labelEnd(r.label, i.fye));
    if (!next && end) next = { end, label: fiscalLabel(end, i.fye) ?? r.label ?? end, date: ms(r.date), dateEstimated: true, dateFrom: h.source, eps: { ...NONE }, rev: { ...NONE } };
    if (next && !ok(next.rev.est) && historyRow([r], next)) next.rev = { ...NONE, est: r.est, ccy: 'USD', estFrom: h.source };
  }
  if (following && next && following.end && next.end && following.end <= next.end) following = null;
  // A next date that is past, or the report just made, is no next date (Coca-Cola's sources still gave 27 October 2026
  // the day after it reported); the estimates stay.
  const todayStart = Math.floor((i.now ?? Date.now()) / DAY_MS) * DAY_MS;
  if (next?.date && !(next.date >= todayStart && !(lastDate && next.date <= lastDate + 20 * DAY_MS))) {
    delete next.date;
    delete next.dateEstimated;
    delete next.dateFrom;
  }
  // Nasdaq's next report date, when no other source names one: for the quarter it names, or the next one.
  const nn = i.nasdaqNext;
  if (next && !next.date && nn && nn.date > lastDate && nn.date >= todayStart && (!nn.end || !next.end || daysApart(nn.end, next.end) <= 20)) {
    next.date = nn.date;
    next.dateEstimated = nn.estimated;
    next.dateFrom = 'Nasdaq';
    if (!next.timing || next.timing === '--') next.timing = nn.timing;
  }
  // Both confirmed, for the same report, on different days: neither is shown as the date (QuarterView.dateDisagree).
  if (next?.date && next.dateFrom !== 'Nasdaq' && !next.dateEstimated && nn && !nn.estimated && (!nn.end || !next.end || daysApart(nn.end, next.end) <= 20)) {
    const given = newYorkDay(next.date);
    const theirs = Math.floor(nn.date / DAY_MS);
    if (given !== theirs && Math.abs(given - theirs) <= 45) next.dateDisagree = `${next.dateFrom ?? 'One source'} confirms ${isoDay(given)}; Nasdaq confirms ${isoDay(theirs)}.`;
  }
  const urls: Record<string, string> = {
    'Yahoo Finance': 'https://finance.yahoo.com/', Finnhub: 'https://finnhub.io/docs/api/earnings-surprises',
    FMP: 'https://site.financialmodelingprep.com/developer/docs/stable/earnings',
    'Alpha Vantage': 'https://www.alphavantage.co/documentation/#earnings', Finviz: 'https://finviz.com/',
    Zacks: 'https://www.zacks.com/', MarketBeat: 'https://www.marketbeat.com/', 'Nasdaq (Zacks)': 'https://www.nasdaq.com/market-activity/stocks',
  };
  for (const q of [...quarters, next, following].filter((p): p is QuarterView => !!p)) {
    for (const e of [q.eps, q.rev, q.alternativeEps, ...(q.epsComparisons ?? []), ...(q.revComparisons ?? [])].filter((p): p is Expectation => !!p)) {
      const source = (e.actualFrom ?? e.estFrom ?? '').replace(/ \(kept\)$|, read .+$/, '');
      const meta = i.sourceMeta?.[source];
      if (meta) for (const [field, value] of Object.entries(meta)) if (e[field as keyof Expectation] == null) Object.assign(e, { [field]: value });
      e.sourceUrl ??= urls[source];
      e.dataset ??= source ? `${source} earnings comparison` : undefined;
      if (e === q.eps || e === q.alternativeEps || q.epsComparisons?.includes(e)) e.basis ??= 'unknown';
      e.estimateProvenance ??= quarters.includes(q) ? 'provider-history' : 'unknown';
    }
    const cutoff = announcementCutoff(q.date, q.timing, q.announcedAt);
    if (cutoff) Object.assign(q, { cutoffAt: cutoff.at, cutoffKind: cutoff.kind });
  }
  return { past: quarters, next, following, ...(chronologyProblems.length ? { chronologyProblems } : {}) };
}

/** A report time's day in New York, or the day itself for a date without a time (midnight UTC). */
function newYorkDay(t: number): number {
  if (t % DAY_MS === 0) return t / DAY_MS;
  const p = zonedParts(t, 'America/New_York');
  return Math.floor(Date.UTC(p.y, p.mo - 1, p.d) / DAY_MS);
}
const isoDay = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10);

/** The last day of a month given as YYYY-MM. */
function monthEnd(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

/** The last day of fiscal quarter "Qn YYYY" for a fiscal year ending in month `fye` (1-12). */
function labelEnd(label: string | undefined, fye: number | undefined): string | undefined {
  const m = /^Q([1-4]) (\d{4})$/.exec(label ?? '');
  if (!m || !(fye != null && fye >= 1 && fye <= 12)) return undefined;
  const month = ((fye + 3 * Number(m[1]) - 1) % 12) + 1;
  const year = month > fye ? Number(m[2]) - 1 : Number(m[2]);
  return monthEnd(`${year}-${String(month).padStart(2, '0')}`);
}

/**
 * The history's row for a quarter: by the month the quarter ends in (Zacks), else by a report date within a week,
 * else by the fiscal quarter's name (MarketBeat) when the dates agree.
 */
function historyRow(rows: HistoryQuarter[] | undefined, q: QuarterView): HistoryQuarter | undefined {
  if (!rows?.length) return undefined;
  if (ISO.test(q.end)) {
    const m = periodMonth(q.end);
    const hit = rows.find((r) => r.period === m);
    if (hit) return hit;
  }
  if (q.date) {
    const hit = rows.find((r) => Math.abs(ms(r.date) - q.date!) <= 7 * DAY_MS);
    if (hit) return hit;
  }
  const label = canonicalQuarter(q.label);
  if (!label) return undefined;
  return rows.find(
    (r) =>
      !r.period &&
      r.label === label &&
      (!q.date || Math.abs(ms(r.date) - q.date) <= 30 * DAY_MS) &&
      (!ISO.test(q.end) || (r.date > q.end && ms(r.date) - ms(q.end) <= 120 * DAY_MS)),
  );
}

/** Alpha Vantage's estimate for the fiscal quarter ending near `end`. */
function avQuarter(av: AvEarnings | undefined, end: string) {
  return ISO.test(end) ? (av?.estimates ?? []).find((e) => e.period === 'quarter' && daysApart(e.end, end) <= 20) : undefined;
}

/**
 * The statements' list of reports with the report dates and sessions the expectation sources give for quarters the
 * statements leave undated, and the next report when the list has none.
 */
export function datedHistory(hist: EarningsEvent[], c: Pick<Consensus, 'past' | 'next' | 'releases'> | null): EarningsEvent[] {
  if (!c) return hist;
  const used = new Set<QuarterView>();
  const usedReleases = new Set<EarningsRelease>();
  const session = (t: ReportTiming | undefined): EarningsEvent['timing'] => (t === 'Bef-mkt' || t === 'Aft-mkt' ? t : '--');
  const out = hist.map((h) => {
    if (!h.dateUnknown) return h;
    const q = c.past.find((x) => !used.has(x) && x.date && ISO.test(x.end) && Math.abs(ms(x.end) - h.date) <= 20 * DAY_MS);
    if (!q) {
      // No source lists the quarter: the company's own results 8-K, the first filed in the four months after its end.
      const rel = (c.releases ?? []).filter((x) => !usedReleases.has(x) && ms(x.date) > h.date && ms(x.date) - h.date <= 120 * DAY_MS).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!rel) return h;
      usedReleases.add(rel);
      return { ...h, date: ms(rel.date), dateUnknown: false, timing: rel.timing };
    }
    used.add(q);
    return { ...h, date: q.date!, dateUnknown: false, timing: session(q.timing) !== '--' ? session(q.timing) : h.timing };
  });
  const latest = Math.max(0, ...out.map((h) => h.date));
  if (!out.some((h) => h.actual == null && h.revAct == null) && c.next?.date && c.next.date > latest) {
    out.push({ period: 'Next', date: c.next.date, ...(c.next.dateEstimated ? { approx: true } : {}), actual: null, timing: session(c.next.timing), revAct: null });
  }
  return out;
}

/** The quarter a report on `date` belongs to: by report date, else the quarter that ended in the four months before. */
export function quarterAt(c: Pick<Consensus, 'past' | 'next' | 'following'>, date: number): QuarterView | null {
  const near = (q: QuarterView | null, days: number) => (q?.date && Math.abs(q.date - date) <= days * DAY_MS ? q : null);
  const hit = c.past.find((q) => near(q, 7)) ?? near(c.next, 10) ?? near(c.following, 10);
  if (hit) return hit;
  const all = [c.next, c.following, ...c.past].filter((q): q is QuarterView => !!q && !q.date && ISO.test(q.end)).sort((a, b) => b.end.localeCompare(a.end));
  return all.find((q) => ms(q.end) < date && date - ms(q.end) <= 120 * DAY_MS) ?? null;
}

/** Actual against expected, in percent of the estimate's size; NaN without both. */
export function surprisePct(e: Pick<Expectation, 'est' | 'actual'>): number {
  return ok(e.est) && ok(e.actual) && e.est !== 0 ? ((e.actual - e.est) / Math.abs(e.est)) * 100 : NaN;
}

/** A numeric EPS verdict requires a stated definition. Unknown methodology remains visible as evidence. */
export function verifiedEpsSurprise(e: Expectation): number {
  return sameEpsDefinition(e, e) ? surprisePct(e) : NaN;
}

/**
 * A conflict means different values for the same stated definition. Different or unknown methodologies are
 * separate evidence, including when their beat/miss signs differ.
 */
export function epsDisagreement(q: Pick<QuarterView, 'eps' | 'alternativeEps'>): string | undefined {
  const a = q.eps, b = q.alternativeEps;
  if (!b || !sameEpsDefinition(a, b)) return undefined;
  const differs = (x: number, y: number) => [x, y].every(Number.isFinite) && Math.abs(x - y) > Math.max(0.011, Math.max(Math.abs(x), Math.abs(y)) * 0.02);
  if (!differs(a.actual, b.actual) && !differs(a.est, b.est)) return undefined;
  return `${epsBasisLabel(a.basis)} EPS differs on the same stated definition: ${a.actualFrom ?? a.estFrom} ${a.actual} against ${a.est} expected; ${b.actualFrom ?? b.estFrom} ${b.actual} against ${b.est} expected.`;
}

/** A provider comparison is retained without claiming that its historical consensus is a point-in-time archive. */
export function expectationNote(e: Expectation): string {
  return [
    `${epsBasisLabel(e.basis)}${e.ccy ? `, ${e.ccy}` : ', currency not stated'}`,
    e.estFrom ? `estimate: ${e.estFrom}` : '', e.actualFrom ? `actual: ${e.actualFrom}` : '',
    e.estimateProvenance === 'pre-announcement-snapshot' ? 'estimate captured before the announcement cutoff' : 'historical estimate as supplied by the provider; original cutoff not independently recorded',
    e.observedAt ? `received ${new Date(e.observedAt).toISOString()}` : 'retrieval time not recorded',
    e.lastSuccessfulAt ? `last successful check ${new Date(e.lastSuccessfulAt).toISOString()}` : '',
    e.dataset ? `dataset: ${e.dataset}` : '',
    e.shareBasis ? `shares: ${e.shareBasis}${e.epsType ? `, ${e.epsType}` : ''}` : '',
    e.splitBasis ? `adjustment convention: ${e.splitBasis}` : '',
    e.stale ? 'STALE: latest source check failed; earlier observation retained' : '',
  ].filter(Boolean).join(' · ');
}

export function trailingComparableEps(past: QuarterView[], end?: string) {
  return consecutiveEps(past.map((q) => ({ ...q.eps, end: q.end, value: q.eps.actual, source: q.eps.actualFrom })), end);
}

/** Sanitized screen evidence, shared by UI and audit. Nonfinite values serialize as null. */
export function earningsAuditState(c: Pick<Consensus, 'past' | 'next' | 'following'> | null, security: string, now = Date.now(), statements: FinPeriod[] = [], statementCcy?: string) {
  const observation = (e: Expectation, role: 'estimate' | 'actual') => ({
    value: role === 'estimate' ? e.est : e.actual, basis: e.basis, currency: e.ccy, shareBasis: e.shareBasis,
    epsType: e.epsType, splitBasis: e.splitBasis, scope: e.scope, source: role === 'estimate' ? e.estFrom : e.actualFrom,
    sourceUrl: e.sourceUrl, dataset: e.dataset, retrievedAt: role === 'estimate' ? e.estimateObservedAt ?? e.observedAt : e.observedAt,
    publishedAt: role === 'estimate' ? e.estimatePublishedAt : e.publishedAt, lastSuccessfulAt: e.lastSuccessfulAt,
    attemptedAt: e.attemptedAt, stale: e.stale, error: e.error,
  });
  const quarters = [...(c?.past ?? []), c?.next, c?.following].filter((q): q is QuarterView => !!q).map((q) => ({
    periodEnd: q.end, fiscalLabel: q.label, announcedAt: q.announcedAt, cutoffAt: q.cutoffAt, cutoffKind: q.cutoffKind,
    estimateProvenance: q.eps.estimateProvenance, estimate: observation(q.eps, 'estimate'), actual: observation(q.eps, 'actual'),
    surprisePct: epsDisagreement(q) ? NaN : verifiedEpsSurprise(q.eps),
    status: q.eps.stale || q.eps.error ? 'stale' : sameEpsDefinition(q.eps, q.eps) ? 'coherent' : 'definition-unresolved',
    alternatives: q.alternativeEps ? [{ estimate: observation(q.alternativeEps, 'estimate'), actual: observation(q.alternativeEps, 'actual') }] : [],
    gaapActual: (() => {
      const st = statements.find((p) => ok(p.end) && Math.abs(p.end - ms(q.end)) <= 20 * DAY_MS && ok(p.eps));
      return st ? { value: st.eps, currency: statementCcy, periodEnd: new Date(st.end).toISOString().slice(0, 10), source: 'statements', basis: 'gaap' } : q.gaapEps ? { value: q.gaapEps.v, periodEnd: q.end, source: q.gaapEps.from, basis: 'gaap' } : undefined;
    })(),
  }));
  const aggregate = trailingComparableEps(c?.past ?? []);
  return { schema: 1, domain: 'earnings', security, capturedAt: now, quarters, aggregates: Number.isFinite(aggregate.value) ? [{ metric: `${epsBasisLabel(aggregate.basis)} EPS`, value: aggregate.value, basis: aggregate.basis, currency: aggregate.ccy, periodEnds: c!.past.filter((q) => ok(q.eps.actual) && ISO.test(q.end)).sort((a, b) => b.end.localeCompare(a.end)).slice(0, 4).map((q) => q.end) }] : [] };
}

/** Immutable local observation versions. This does not backdate a newly fetched historical feed. */
export function archiveConsensus(security: string, c: Pick<Consensus, 'past' | 'next' | 'following'>, now = Date.now()) {
  const rows: ObservationInput[] = [];
  for (const q of [...c.past, c.next, c.following].filter((p): p is QuarterView => !!p)) {
    for (const [metric, e] of [['eps', q.eps], ['revenue', q.rev], ...[q.alternativeEps, ...(q.epsComparisons ?? [])].map((e) => ['eps', e] as const), ...(q.revComparisons ?? []).map((e) => ['revenue', e] as const)] as const) {
      if (!e) continue;
      for (const role of ['estimate', 'actual'] as const) {
        const value = role === 'estimate' ? e.est : e.actual;
        const source = role === 'estimate' ? e.estFrom : e.actualFrom;
        if (!ok(value) || !source) continue;
        rows.push({ ...e, security, periodEnd: q.end, fiscalLabel: q.label, metric, role, value, currency: e.ccy, source,
          observedAt: role === 'estimate' ? e.estimateObservedAt ?? e.observedAt : e.observedAt,
          ...(q.announcedAt ? { announcedAt: q.announcedAt } : {}) });
      }
    }
  }
  appendEarningsEvidence(security, rows, now);
}

/** The same definitions and freshness printed in the screen are available with exported values. */
export function earningsEvidenceExport(c: Pick<Consensus, 'past' | 'next' | 'following'> | null, security: string): (string | number | undefined)[][] {
  return [
    ['Observation evidence', 'Security', 'Period end', 'Fiscal label', 'Metric', 'Role', 'Value', 'Currency', 'Basis', 'Share basis', 'EPS type', 'Adjustment basis', 'Scope', 'Source', 'Dataset', 'Source URL', 'Observed at', 'Published at', 'Revision', 'Revises', 'Estimate provenance', 'Stale', 'Latest attempt', 'Latest successful check'],
    ...((c ? [...c.past, c.next, c.following] : []).filter((q): q is QuarterView => !!q).flatMap((q) => [q.eps, ...(q.epsComparisons ?? [])].flatMap((e) => (['estimate', 'actual'] as const).map((role) => [
      'Current selected / alternative EPS', security, q.end, q.label, 'eps', role, role === 'estimate' ? e.est : e.actual, e.ccy, e.basis, e.shareBasis, e.epsType, e.splitBasis, e.scope, role === 'estimate' ? e.estFrom : e.actualFrom, e.dataset, e.sourceUrl, role === 'estimate' ? e.estimateObservedAt ?? e.observedAt : e.observedAt, role === 'estimate' ? e.estimatePublishedAt : e.publishedAt, e.revisionId, undefined, e.estimateProvenance, e.stale ? 'yes' : '', e.attemptedAt, e.lastSuccessfulAt,
    ])))),
    ...(earningsEvidence.get().by[security] ?? []).map((o) => ['Saved immutable version', security, o.periodEnd, o.fiscalLabel, o.metric, o.role, o.value, o.currency, o.basis, o.shareBasis, o.epsType, o.splitBasis, o.scope, o.source, o.dataset, o.sourceUrl, o.observedAt, o.publishedAt, o.id, o.revisionOf, o.estimateProvenance, o.stale ? 'yes' : '', o.attemptedAt, o.lastSuccessfulAt]),
  ];
}

export interface Growth {
  /** Change against the same quarter a year earlier, and against the quarter before, in percent. */
  yoy: number;
  qoq: number;
  /** Which series each was worked out from. */
  yoyFrom?: string;
  qoqFrom?: string;
}

/**
 * Growth of a quarter's figure on the year and on the quarter, from the first series that has both quarters (each
 * series one basis: a source's reported EPS, or the statements'). No growth to or from a figure at or below zero (a loss).
 */
export function growth(end: string, series: { from: string; points: { end: string; value: number }[] }[]): Growth {
  const out: Growth = { yoy: NaN, qoq: NaN };
  for (const s of series) {
    const now = s.points.find((p) => daysApart(p.end, end) <= 20 && ok(p.value) && p.value > 0);
    if (!now) continue;
    const back = (lo: number, hi: number) => s.points.find((p) => ms(now.end) - ms(p.end) >= lo * DAY_MS && ms(now.end) - ms(p.end) <= hi * DAY_MS && ok(p.value));
    const year = back(340, 390);
    const quarter = back(70, 110);
    if (!ok(out.yoy) && year && year.value > 0) Object.assign(out, { yoy: (now.value / year.value - 1) * 100, yoyFrom: s.from });
    if (!ok(out.qoq) && quarter && quarter.value > 0) Object.assign(out, { qoq: (now.value / quarter.value - 1) * 100, qoqFrom: s.from });
  }
  return out;
}

/** The series a quarter's EPS and revenue growth are worked out from: the consensus basis first, then the statements. */
export function growthSeries(c: Pick<Consensus, 'past'>, statements: FinPeriod[], basis: Partial<Record<'eps' | 'rev', string>>) {
  const anchor = c.past.find((q) => q.eps.actualFrom === basis.eps)?.eps;
  const own = (k: 'eps' | 'rev') => ({ from: k === 'eps' ? `${epsBasisLabel(anchor?.basis)} ${basis[k] ?? ''}` : basis[k] ?? '', points: c.past.filter((q) => q[k].actualFrom === basis[k] && (k !== 'eps' || !!anchor && sameEpsDefinition(q.eps, anchor))).map((q) => ({ end: q.end, value: q[k].actual })) });
  const st = (k: 'eps' | 'rev') => ({ from: 'statements', points: statements.filter((p) => ok(p.end)).map((p) => ({ end: new Date(p.end).toISOString().slice(0, 10), value: k === 'eps' ? p.eps : p.rev })) });
  return { eps: [own('eps'), st('eps')], rev: [own('rev'), st('rev')] };
}

// ------------------------------------------------------------------ loading

interface Entry {
  state: 'loading' | 'ok' | 'error' | 'off';
  yahoo?: YahooEarnings;
  message?: string;
  at: number;
  attemptedAt?: number;
  stale?: boolean;
}

export const consensusData = createStore<{ v: number; by: Record<string, Entry> }>({ v: 0, by: {} });

const TTL = 6 * 3_600_000;
const queue: { id: string; run: () => Promise<void> }[] = [];
let active = 0;

function pump() {
  while (active < 2 && queue.length) {
    const job = queue.shift()!;
    active++;
    void job.run().finally(() => {
      active--;
      pump();
    });
  }
}

const put = (id: string, e: Entry) => consensusData.set((s) => ({ v: s.v + 1, by: { ...s.by, [id]: e } }));

/** Due again after six hours, or hourly once the next report date has passed. */
function due(e: Entry | undefined, now: number): boolean {
  if (!e) return true;
  if (e.state === 'loading') return false;
  if (e.state !== 'ok') return now - (e.attemptedAt ?? e.at) > 10 * 60_000;
  const reported = e.yahoo?.next?.date;
  return now - e.at > TTL || (!!reported && reported < now && now - e.at > 3_600_000);
}

/**
 * Loads a stock's earnings expectations (desktop app); `front` puts it ahead of the queue. A calendar of many stocks
 * leaves out Finnhub (`finnhub` false), whose 30 requests a minute are shared with the news. `force` (the top bar's
 * REFRESH) asks Yahoo again whether due or not.
 */
export function requestConsensus(def: SecurityDef | undefined, front = false, finnhub = true, force = false) {
  if (!def?.eq || !desktopData()) return;
  const fs = finnhubSymbol(def);
  if (finnhub && fs && finnhubAvailable()) {
    void loadFinnhub(fs, 'earnings');
    void loadFinnhub(fs, 'calendar');
    void loadFinnhub(fs, 'history');
  }
  // FMP's history, for one company's screens only: its daily allowance is too small for a calendar's rows. The same
  // goes for Alpha Vantage (25 requests a day), Nasdaq's forecast and report date, and the SEC's 8-K dates.
  if (finnhub) {
    requestCompanyEarnings(secTicker(def));
    const av = avSymbol(def);
    if (av && alphaVantageAvailable()) void loadAlphaVantage(av);
    const ns = nasdaqSymbol(def);
    if (ns && nasdaqAvailable()) {
      void loadNasdaq(ns, 'forecast');
      void loadNasdaq(ns, 'earnings-date');
    }
    void loadSecReleases(def);
    void loadHistory(secTicker(def));
  }
  const now = Date.now();
  const have = consensusData.get().by[def.id];
  if (have?.state === 'loading' || (!force && !due(have, now))) return;
  const symbol = yahooSymbolFor(def) ?? def.yahoo;
  if (!symbol) return;
  if (queue.some((j) => j.id === def.id)) {
    if (front) queue.unshift(...queue.splice(queue.findIndex((j) => j.id === def.id), 1));
    return;
  }
  put(def.id, { ...(have ?? {}), state: 'loading', at: have?.at ?? now });
  const run = async () => {
    if (window.arminDesktop?.settings?.YAHOO_RESEARCH_ENABLED === false) {
      put(def.id, { state: 'off', message: 'Yahoo research is switched off (YAHOO_RESEARCH_ENABLED on PROVIDERS).', at: Date.now() });
      return;
    }
    try {
      const parsed = parseYahooEarnings(await yahooGet(yahooEarningsPath(symbol)), symbol);
      if ('error' in parsed) throw new Error(parsed.error);
      keepEstimates(def.id, parsed.data);
      put(def.id, { state: 'ok', yahoo: parsed.data, at: Date.now(), attemptedAt: Date.now() });
    } catch (err) {
      put(def.id, { state: 'error', yahoo: have?.yahoo, message: `Yahoo: ${err instanceof Error ? err.message : String(err)}`, at: have?.at ?? Date.now(), attemptedAt: Date.now(), stale: !!have?.yahoo });
    }
  };
  if (front) queue.unshift({ id: def.id, run });
  else queue.push({ id: def.id, run });
  pump();
}

const partData = <T,>(p: FinnhubPart | undefined): T | undefined => (p?.state === 'ok' ? (p.data as T) : undefined);

/** Each US-listed company's earnings releases filed with the SEC (8-K item 2.02), by ticker. */
export const secReleaseData = createStore<{ v: number; by: Record<string, EarningsRelease[]> }>({ v: 0, by: {} });
const releasesAsked = new Map<string, number>();

/** Loads a company's earnings releases from its SEC filings (needs SEC_USER_AGENT); a quiet no-op otherwise. */
async function loadSecReleases(def: SecurityDef) {
  const ticker = secTicker(def);
  if (!ticker || !secAvailable() || Date.now() - (releasesAsked.get(ticker) ?? 0) < 3_600_000) return;
  releasesAsked.set(ticker, Date.now());
  try {
    const c = await resolveFiler(ticker);
    if (!c.ok) return;
    const f = await loadFiler(c.data.cik);
    if (!f.ok) return;
    const list = earningsReleases(f.data.filings);
    secReleaseData.set((s) => ({ v: s.v + 1, by: { ...s.by, [ticker]: list } }));
  } catch {
    releasesAsked.delete(ticker);
  }
}

/** A stock's expectations from what has arrived (no request). */
export function consensusFor(def: SecurityDef): Consensus {
  const e = consensusData.get().by[def.id];
  const fs = finnhubSymbol(def);
  const fparts = fs ? finnhubData.get().by[fs] : undefined;
  const real = getRealFund(def.id);
  // The market calendars' lines for this company count as its own reports (the latest ones, with revenue).
  const calendars = companyReports(secTicker(def));
  const history = partData<PastReport[]>(fparts?.history) ?? [];
  const finnhubPast = [...history, ...calendars.finnhub.filter((r) => !history.some((h) => h.date === r.date))].sort((a, b) => b.date.localeCompare(a.date));
  const merged = mergeConsensus({
    yahoo: e?.yahoo,
    finnhubEps: partData<EpsSurprise[]>(fparts?.earnings),
    finnhubPast,
    finnhubNext: partData<NextReport | null>(fparts?.calendar),
    fmpReports: calendars.fmp,
    kept: keptEstimates.get().by[def.id],
    keptVintages: keptEstimates.get().vintages?.[def.id],
    statements: real?.quarterly,
    statementCcy: reportCcy(def),
    av: alphaVantageFor(avSymbol(def)),
    nasdaqForecast: nasdaqPart<NasdaqForecast>(nasdaqSymbol(def), 'forecast'),
    nasdaqNext: nasdaqPart<NasdaqNextReport>(nasdaqSymbol(def), 'earnings-date'),
    secReleases: secReleaseData.get().by[secTicker(def) ?? ''],
    history: historyFor(secTicker(def)),
    fye: def.eq?.fye,
    sourceMeta: {
      'Yahoo Finance': { observedAt: e?.at, lastSuccessfulAt: e?.yahoo ? e.at : undefined, attemptedAt: e?.attemptedAt, stale: e?.stale, error: e?.message },
      Finnhub: { observedAt: fparts?.earnings?.at ?? fparts?.history?.at, stale: !!fparts?.earnings?.stale || !!fparts?.history?.stale, error: fparts?.earnings?.message ?? fparts?.history?.message },
      'Alpha Vantage': { observedAt: alphaVantageData.get().by[avSymbol(def) ?? '']?.at, attemptedAt: alphaVantageData.get().by[avSymbol(def) ?? '']?.attemptedAt, stale: alphaVantageData.get().by[avSymbol(def) ?? '']?.stale, error: alphaVantageData.get().by[avSymbol(def) ?? '']?.message },
      FMP: { ...calendars.fmpMeta, observedAt: calendars.fmpMeta?.observedAt ?? calendars.fmpMeta?.at },
      ...Object.fromEntries((historyFor(secTicker(def)) ?? []).map((h) => [h.source, { observedAt: historyData.get().by[secTicker(def) ?? '']?.at, stale: historyData.get().by[secTicker(def) ?? '']?.stale, error: historyData.get().by[secTicker(def) ?? '']?.message }])),
    },
  });
  // Yahoo timestamps have session meaning only for US-listed securities.
  if (def.id.endsWith(' US Equity')) {
    for (const q of [...merged.past, merged.next].filter((q): q is QuarterView => !!q)) {
      if ((!q.timing || q.timing === '--') && q.date) q.timing = usTiming(q.date);
    }
  }
  const problems: string[] = [...(merged.chronologyProblems ?? [])];
  if (e?.message && e.state !== 'loading') problems.push(e.message);
  for (const k of ['earnings', 'history'] as const) {
    const p = fparts?.[k];
    if (p && p.state !== 'ok' && p.state !== 'loading' && p.message && !problems.includes(`Finnhub: ${p.message}`)) problems.push(`Finnhub: ${p.message}`);
  }
  const loading = !e || e.state === 'loading' || ['earnings', 'history'].some((k) => fparts?.[k as 'earnings']?.state === 'loading');
  const releases = secReleaseData.get().by[secTicker(def) ?? ''];
  const revenueHint = missingRevenueHint(merged.past, avSymbol(def) ? alphaVantageData.get().by[avSymbol(def)!] : undefined, !!avSymbol(def));
  return { ...merged, problems, loading, ...(releases ? { releases } : {}), ...(revenueHint ? { revenueHint } : {}) };
}

/**
 * Yahoo drops a quarter's revenue estimate once the quarter is reported, and no source without a key keeps
 * earlier ones. Says which key fills them, or what Alpha Vantage answered. `usListing`: the stock is listed in the
 * US, the only listings the app asks Alpha Vantage, FMP and Finnhub about; for others no key helps.
 */
export function missingRevenueHint(past: QuarterView[], av: { state: string; message?: string } | undefined, usListing = true): string | undefined {
  const shown = past.slice(0, 8);
  const missing = shown.filter((q) => ok(q.rev.actual) && !ok(q.rev.est)).length;
  if (!missing) return undefined;
  const quarters = `${missing} of ${shown.length} reported quarters have no expected revenue`;
  if (!usListing) return `${quarters}: Yahoo drops a quarter's revenue estimate once it is reported, and the app asks Alpha Vantage, FMP and Finnhub for earlier estimates for US listings only.`;
  if (!alphaVantageAvailable() || av?.state === 'needs-key') return `${quarters}: Yahoo drops a quarter's revenue estimate once it is reported. Set ALPHA_VANTAGE_API_KEY (free) on PROVIDERS to fill past quarters' expected revenue.`;
  if (!av || av.state === 'loading') return undefined;
  if (av.state === 'error') return `${quarters}. Alpha Vantage: ${av.message ?? 'no answer'}`;
  return `${quarters}: Alpha Vantage gives no estimate for them.`;
}

/** The stocks open screens show, with whether Finnhub is asked for them, for the top bar's REFRESH. */
const shown = createWants<{ def: SecurityDef; finnhub: boolean }>();

registerRefresh({
  source: 'Earnings expectations (Yahoo, Finnhub)',
  available: desktopData,
  run: async () => {
    const list = shown.values().filter((x) => x.def.eq && (yahooSymbolFor(x.def) ?? x.def.yahoo));
    if (!list.length) return [];
    for (const x of list) requestConsensus(x.def, false, x.finnhub, true);
    const by = () => consensusData.get().by;
    await waitFor(consensusData, () => (list.every((x) => by()[x.def.id]?.state !== 'loading') ? true : undefined), 40_000);
    const failed = list.filter((x) => by()[x.def.id]?.state === 'error').length;
    return { source: 'Earnings expectations (Yahoo, Finnhub)', state: failed === list.length ? 'failed' : 'asked', detail: `${list.length - failed} of ${list.length} stocks answered` };
  },
});

/** Loads and keeps a stock's expectations fresh while a screen shows them. */
export function useConsensus(def: SecurityDef | undefined): Consensus | null {
  // Re-renders as Yahoo, Finnhub or a kept estimate arrives.
  consensusData.use((s) => s.v);
  fundVersion.use((s) => s.v);
  finnhubData.use((s) => s.v);
  earningsCalendar.use((s) => s.v);
  alphaVantageData.use((s) => s.v);
  nasdaqData.use((s) => s.v);
  secReleaseData.use((s) => s.v);
  historyData.use((s) => s.v);
  keptEstimates.use((s) => (def ? s.by[def.id] : undefined));
  useEffect(() => {
    requestConsensus(def, true);
    const t = setInterval(() => requestConsensus(def), 15 * 60_000);
    const off = def ? shown.add(`${def.id}|finnhub`, { def, finnhub: true }) : () => undefined;
    return () => {
      clearInterval(t);
      off();
    };
  }, [def]);
  const c = def?.eq ? consensusFor(def) : null;
  const evidenceKey = c ? JSON.stringify([c.past, c.next, c.following]) : '';
  useEffect(() => { if (def && c) archiveConsensus(def.id, c); }, [def?.id, evidenceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return c;
}

/** Loads several stocks' expectations (a calendar's rows), at most `max`; re-renders as they arrive. */
export function useConsensusFor(defs: SecurityDef[], max = 60): number {
  const v = consensusData.use((s) => s.v);
  const f = finnhubData.use((s) => s.v);
  const key = defs.slice(0, max).map((d) => d.id).join(',');
  useEffect(() => {
    const list = defs.slice(0, max);
    for (const d of list) requestConsensus(d, false, false);
    const offs = list.map((d) => shown.add(d.id, { def: d, finnhub: false }));
    return () => offs.forEach((off) => off());
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v + f;
}

/** Loads a stock's expectations and resolves once the sources have answered (or after `ms`): for the help desk. */
export async function loadConsensus(def: SecurityDef, ms = 12_000): Promise<Consensus> {
  requestConsensus(def, true);
  await waitFor(consensusData, () => (consensusData.get().by[def.id]?.state === 'loading' ? undefined : true), ms);
  const fs = finnhubSymbol(def);
  if (fs && finnhubAvailable()) {
    const settled = () => (['earnings', 'history', 'calendar'].every((k) => finnhubData.get().by[fs]?.[k as 'earnings'] && finnhubData.get().by[fs]![k as 'earnings']!.state !== 'loading') ? true : undefined);
    await waitFor(finnhubData, settled, ms);
  }
  return consensusFor(def);
}
