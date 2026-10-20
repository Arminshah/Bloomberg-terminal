import { useEffect } from 'react';
import { createStore, waitFor } from '../../core/store';
import { DAY_MS } from '../calendar';
import { reportCcy, type FinPeriod } from '../fundamentals';
import type { SecurityDef } from '../types';
import { finnhubAvailable, finnhubData, finnhubSymbol, loadFinnhub, type EpsSurprise, type FinnhubPart, type NextReport, type PastReport } from './finnhub';
import { companyReports, earningsCalendar, requestCompanyEarnings, type WindowReport } from './earnings-calendar';
import { secTicker } from './sec';
import { desktopData, yahooGet, yahooSymbolFor } from './yahoo';
import { fundVersion, getRealFund, usTiming } from './yfund';
import { createWants, registerRefresh } from '../../terminal/refresh';

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

export interface Expectation {
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
  /** The report date is the source's estimate, not confirmed by the company. */
  dateEstimated?: boolean;
  /** Session of the announcement; absent when the provider gives only a date. */
  timing?: ReportTiming;
  /** Another provider's EPS comparison, kept separate because reporting bases may differ. */
  alternativeEps?: Expectation;
  eps: Expectation;
  rev: Expectation;
  /** For a quarter not reported yet, the same quarter a year earlier, as the source gives it. */
  yearAgoEps?: number;
  yearAgoRev?: number;
}

export interface Consensus {
  /** Reported quarters, newest first. */
  past: QuarterView[];
  /** The quarter reported next, and the one after. */
  next: QuarterView | null;
  following: QuarterView | null;
  /** Why figures are missing, in the sources' words. */
  problems: string[];
  /** A source has not answered yet. */
  loading: boolean;
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

export interface YahooEarnings {
  past: { end: string; label: string; date?: number; epsEst: number; epsActual: number; epsCcy?: string; revActual: number }[];
  /** The currency of the reported revenue (the statements'). */
  revCcy?: string;
  next: YahooAhead | null;
  following: YahooAhead | null;
}

export const YAHOO_EARNINGS_MODULES = 'earningsHistory,earningsTrend,calendarEvents,earnings';
export const yahooEarningsPath = (symbol: string) => `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${YAHOO_EARNINGS_MODULES}`;

/** Yahoo's quoteSummary with the earnings modules, as figures; NaN wherever Yahoo gives none. */
export function parseYahooEarnings(answer: unknown): { data: YahooEarnings } | { error: string } {
  const row = (answer as Json)?.quoteSummary?.result?.[0];
  if (!row || typeof row !== 'object') return { error: 'Yahoo returned no earnings data.' };
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
    past.push({ end, label: canonicalQuarter(c.fiscalQuarter ?? c.date) ?? end, ...(reported > ms(end) ? { date: reported } : {}), epsEst: number(c.estimate), epsActual: number(c.actual), epsCcy: undefined, revActual: revByLabel.get(String(c.date)) ?? NaN });
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
      eps: { est: number(e.avg), low: number(e.low), high: number(e.high), analysts: number(e.numberOfAnalysts), actual: NaN, ccy: ccyOf(e.earningsCurrency), estFrom: 'Yahoo Finance' },
      rev: { est: number(r.avg), low: number(r.low), high: number(r.high), analysts: number(r.numberOfAnalysts), actual: NaN, ccy: ccyOf(r.revenueCurrency), estFrom: 'Yahoo Finance' },
      yearAgoEps: number(e.yearAgoEps),
      yearAgoRev: number(r.yearAgoRevenue),
    };
    return ok(out.eps.est) || ok(out.rev.est) ? out : null;
  };
  let next = ahead('0q');
  let following = ahead('+1q');
  // Just after a report, Yahoo can still name the reported quarter as the current one.
  if (next && past[0] && next.end <= past[0].end) [next, following] = [following, null];
  const cal = row.calendarEvents?.earnings;
  const date = number(cal?.earningsDate?.[0]) * 1000;
  if (next && date > 0 && date > ms(next.end)) {
    next.date = date;
    next.dateEstimated = cal?.isEarningsDateEstimate === true;
  }
  return { data: { past, revCcy: ccyOf(row.earnings?.financialCurrency), next, following } };
}

// ------------------------------------------------- estimates kept by the app

/** A coming quarter's estimates as the app last saw them, kept after Yahoo drops them at the report. */
export interface KeptEstimate {
  epsEst: number;
  epsCcy?: string;
  revEst: number;
  revCcy?: string;
  revAnalysts: number;
  /** When they were read (ms). */
  at: number;
}

/** By security id, then quarter end. */
export const keptEstimates = createStore<{ by: Record<string, Record<string, KeptEstimate>> }>({ by: {} }, 'earnings-expectations', 1);
const KEEP_QUARTERS = 6;
const KEEP_SECURITIES = 400;

/** Keeps the estimates of the coming quarters (the latest reading of each), for when the quarter is reported. */
export function keepEstimates(id: string, y: YahooEarnings, now = Date.now()) {
  const ahead = [y.next, y.following].filter((a): a is YahooAhead => !!a && (ok(a.eps.est) || ok(a.rev.est)));
  if (!ahead.length) return;
  keptEstimates.set((s) => {
    const mine = { ...(s.by[id] ?? {}) };
    for (const a of ahead) mine[a.end] = { epsEst: a.eps.est, epsCcy: a.eps.ccy, revEst: a.rev.est, revCcy: a.rev.ccy, revAnalysts: a.rev.analysts, at: now };
    const ends = Object.keys(mine).sort().reverse();
    for (const e of ends.slice(KEEP_QUARTERS)) delete mine[e];
    const by = { ...s.by, [id]: mine };
    const ids = Object.keys(by);
    if (ids.length > KEEP_SECURITIES) {
      const latest = (x: string) => Math.max(...Object.values(by[x]).map((k) => k.at));
      for (const old of ids.sort((a, b) => latest(a) - latest(b)).slice(0, ids.length - KEEP_SECURITIES)) delete by[old];
    }
    return { by };
  });
}

// ------------------------------------------------------------------ merging

export interface ConsensusInput {
  yahoo?: YahooEarnings;
  finnhubEps?: EpsSurprise[];
  finnhubPast?: PastReport[];
  finnhubNext?: NextReport | null;
  kept?: Record<string, KeptEstimate>;
  /** FMP's reports (expected and reported EPS and revenue), newest first. */
  fmpReports?: WindowReport[];
  /** The company's quarterly statements (revenue in millions) and their currency. */
  statements?: FinPeriod[];
  statementCcy?: string;
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
  const y = i.yahoo;
  const quarters: QuarterView[] = (y?.past ?? []).map((q) => ({
    end: q.end,
    label: canonicalQuarter(q.label) ?? q.label,
    ...(q.date ? { date: q.date } : {}),
    eps: { ...NONE, est: q.epsEst, actual: q.epsActual, ccy: q.epsCcy, estFrom: ok(q.epsEst) ? 'Yahoo Finance' : undefined, actualFrom: ok(q.epsActual) ? 'Yahoo Finance' : undefined },
    rev: { ...NONE },
  }));
  const at = (end: string, label?: string) => quarters.find((q) => {
    const sameLabel = label && canonicalQuarter(q.label) === label;
    const noConflict = !label || !canonicalQuarter(q.label) || sameLabel;
    return (sameLabel && daysApart(q.end, end) <= 45) || (noConflict && daysApart(q.end, end) <= 20);
  });
  // Finnhub's EPS comparisons, for quarters Yahoo leaves out or gives without an estimate.
  for (const f of i.finnhubEps ?? []) {
    if (!ok(f.actual) && !ok(f.estimate)) continue;
    const eps: Expectation = { ...NONE, est: f.estimate, actual: f.actual, estFrom: 'Finnhub', actualFrom: 'Finnhub' };
    const label = reportLabel(f);
    const q = at(f.period, label);
    if (!q) quarters.push({ end: f.period, label: label ?? f.period, eps, rev: { ...NONE } });
    else if ((!ok(q.eps.est) || !ok(q.eps.actual)) && ok(f.estimate) && ok(f.actual)) q.eps = eps;
    else if (ok(f.estimate) && ok(f.actual) && (q.eps.est !== f.estimate || q.eps.actual !== f.actual)) q.alternativeEps = eps;
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
  const fiscalOrder = (q: QuarterView) => {
    const label = canonicalQuarter(q.label);
    return label ? Number(label.slice(3)) * 4 + Number(label[1]) : NaN;
  };
  quarters.sort((a, b) => ok(fiscalOrder(a)) && ok(fiscalOrder(b)) ? fiscalOrder(b) - fiscalOrder(a) : b.end.localeCompare(a.end));
  const statements = i.statements ?? [];
  const usedReports = new Set<PastReport>();
  const usedFmp = new Set<WindowReport>();
  for (const q of quarters) {
    const f = finnhubReport(i.finnhubPast ?? [], q, usedReports);
    if (f) {
      usedReports.add(f);
      q.timing = reportTiming(f.hour);
      if (!q.date) q.date = ms(f.date);
      if ((!ok(q.eps.est) || !ok(q.eps.actual)) && ok(f.epsEstimate) && ok(f.epsActual)) q.eps = { ...NONE, est: f.epsEstimate, actual: f.epsActual, estFrom: 'Finnhub', actualFrom: 'Finnhub' };
      // Finnhub names no currency, so its revenue is compared only with its own estimate.
      if (ok(f.revenueEstimate) || ok(f.revenueActual)) q.rev = { ...NONE, est: f.revenueEstimate, actual: f.revenueActual, estFrom: ok(f.revenueEstimate) ? 'Finnhub' : undefined, actualFrom: ok(f.revenueActual) ? 'Finnhub' : undefined };
    }
    // Otherwise the reported revenue in the statements' currency, and the estimate the app kept in the same currency.
    const yq = y?.past.find((p) => p.end === q.end);
    const st = statements.find((p) => ok(p.end) && Math.abs(p.end - ms(q.end)) <= 20 * DAY_MS && ok(p.rev));
    const actual = yq && ok(yq.revActual) ? { v: yq.revActual, ccy: y?.revCcy, from: 'Yahoo Finance' } : st ? { v: st.rev * 1e6, ccy: i.statementCcy, from: 'statements' } : ok(q.rev.actual) ? { v: q.rev.actual, ccy: undefined, from: q.rev.actualFrom } : null;
    const keptEnd = Object.keys(i.kept ?? {}).find((e) => daysApart(e, q.end) <= 20);
    const saved = keptEnd ? i.kept![keptEnd] : undefined;
    const k = saved && (!q.date || saved.at < q.date) ? saved : undefined;
    const estOk = k && ok(k.revEst) && actual?.from !== 'Finnhub' && (!actual || !k.revCcy || !actual.ccy || k.revCcy === actual.ccy);
    if (!ok(q.rev.est)) {
      q.rev = {
        ...NONE,
        ...(estOk ? { est: k!.revEst, analysts: k!.revAnalysts, estFrom: `Yahoo Finance, read ${new Date(k!.at).toISOString().slice(0, 10)}` } : {}),
        ...(actual ? { actual: actual.v, actualFrom: actual.from } : {}),
        ccy: (estOk ? k!.revCcy : undefined) ?? actual?.ccy,
      };
    }
    // A kept EPS estimate fills a quarter no source compares, against Yahoo's reported EPS.
    if (!ok(q.eps.est) && k && ok(k.epsEst) && yq && ok(yq.epsActual) && (!k.epsCcy || !yq.epsCcy || k.epsCcy === yq.epsCcy)) q.eps = { ...NONE, est: k.epsEst, actual: yq.epsActual, ccy: k.epsCcy, estFrom: 'Yahoo Finance (kept)', actualFrom: 'Yahoo Finance' };
    // FMP's history fills what is still without an estimate: its revenue estimate with its own reported revenue when
    // it gives one (one basis for the surprise), else against the reported revenue already shown.
    const p = fmpReport(i.fmpReports ?? [], q, usedFmp);
    if (p) {
      usedFmp.add(p);
      if (!q.date) q.date = ms(p.date);
      if ((!ok(q.eps.est) || !ok(q.eps.actual)) && ok(p.epsEst) && ok(p.epsActual)) q.eps = { ...NONE, est: p.epsEst, actual: p.epsActual, estFrom: 'FMP', actualFrom: 'FMP' };
      if (!ok(q.rev.est) && ok(p.revEst)) {
        q.rev = ok(p.revActual)
          ? { ...NONE, est: p.revEst, actual: p.revActual, estFrom: 'FMP', actualFrom: 'FMP' }
          : { ...q.rev, est: p.revEst, estFrom: 'FMP' };
      }
    }
  }
  const view = (a: YahooAhead | null | undefined): QuarterView | null =>
    a ? { end: a.end, label: a.label ?? a.end, ...(a.date ? { date: a.date, dateEstimated: a.dateEstimated } : {}), eps: a.eps, rev: a.rev, yearAgoEps: a.yearAgoEps, yearAgoRev: a.yearAgoRev } : null;
  let next = view(y?.next);
  const fn = i.finnhubNext;
  if (fn) {
    const fromFinnhub: QuarterView = {
      end: '',
      label: ok(fn.quarter) && ok(fn.year) ? `Q${fn.quarter} ${fn.year}` : fn.date,
      date: ms(fn.date),
      timing: reportTiming(fn.hour),
      eps: { ...NONE, est: fn.epsEstimate, estFrom: ok(fn.epsEstimate) ? 'Finnhub' : undefined },
      rev: { ...NONE, est: fn.revenueEstimate, estFrom: ok(fn.revenueEstimate) ? 'Finnhub' : undefined },
    };
    if (!next) next = fromFinnhub;
    else if ((!canonicalQuarter(next.label) || !reportLabel(fn) || canonicalQuarter(next.label) === reportLabel(fn)) && (!next.end || (fn.date > next.end && ms(fn.date) - ms(next.end) <= 120 * DAY_MS)) && (!next.date || Math.abs(ms(fn.date) - next.date) <= 10 * DAY_MS)) {
      next.timing = fromFinnhub.timing;
      if (!canonicalQuarter(next.label) && reportLabel(fn)) next.label = reportLabel(fn)!;
      // Finnhub's calendar names the report date when Yahoo has none, and fills an estimate Yahoo leaves out.
      if (!next.date) next.date = fromFinnhub.date;
      if (!ok(next.eps.est) && ok(fn.epsEstimate)) next.eps = fromFinnhub.eps;
      if (!ok(next.rev.est) && ok(fn.revenueEstimate)) next.rev = fromFinnhub.rev;
    }
  }
  // FMP's coming report, for an estimate the others leave out.
  const ahead = (i.fmpReports ?? []).filter((r) => !ok(r.epsActual) && !ok(r.revActual) && (ok(r.epsEst) || ok(r.revEst)) && (!quarters[0]?.date || ms(r.date) > quarters[0].date + 20 * DAY_MS)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (ahead && next && (!next.date || Math.abs(ms(ahead.date) - next.date) <= 10 * DAY_MS)) {
    if (!next.date) next.date = ms(ahead.date);
    if (!ok(next.eps.est) && ok(ahead.epsEst)) next.eps = { ...NONE, est: ahead.epsEst, estFrom: 'FMP' };
    if (!ok(next.rev.est) && ok(ahead.revEst)) next.rev = { ...NONE, est: ahead.revEst, estFrom: 'FMP' };
  } else if (ahead && !next) {
    next = { end: '', label: ahead.date, date: ms(ahead.date), eps: { ...NONE, est: ahead.epsEst, estFrom: ok(ahead.epsEst) ? 'FMP' : undefined }, rev: { ...NONE, est: ahead.revEst, estFrom: ok(ahead.revEst) ? 'FMP' : undefined } };
  }
  return { past: quarters, next, following: view(y?.following) };
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
  const own = (k: 'eps' | 'rev') => ({ from: basis[k] ?? '', points: c.past.filter((q) => q[k].actualFrom === basis[k]).map((q) => ({ end: q.end, value: q[k].actual })) });
  const st = (k: 'eps' | 'rev') => ({ from: 'statements', points: statements.filter((p) => ok(p.end)).map((p) => ({ end: new Date(p.end).toISOString().slice(0, 10), value: k === 'eps' ? p.eps : p.rev })) });
  return { eps: [own('eps'), st('eps')], rev: [own('rev'), st('rev')] };
}

// ------------------------------------------------------------------ loading

interface Entry {
  state: 'loading' | 'ok' | 'error' | 'off';
  yahoo?: YahooEarnings;
  message?: string;
  at: number;
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
  if (e.state !== 'ok') return now - e.at > 10 * 60_000;
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
  // FMP's history, for one company's screens only: its daily allowance is too small for a calendar's rows.
  if (finnhub) requestCompanyEarnings(secTicker(def));
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
      const parsed = parseYahooEarnings(await yahooGet(yahooEarningsPath(symbol)));
      if ('error' in parsed) throw new Error(parsed.error);
      keepEstimates(def.id, parsed.data);
      put(def.id, { state: 'ok', yahoo: parsed.data, at: Date.now() });
    } catch (err) {
      put(def.id, { state: 'error', yahoo: have?.yahoo, message: `Yahoo: ${err instanceof Error ? err.message : String(err)}`, at: Date.now() });
    }
  };
  if (front) queue.unshift({ id: def.id, run });
  else queue.push({ id: def.id, run });
  pump();
}

const partData = <T,>(p: FinnhubPart | undefined): T | undefined => (p?.state === 'ok' ? (p.data as T) : undefined);

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
    statements: real?.quarterly,
    statementCcy: reportCcy(def),
  });
  // Yahoo timestamps have session meaning only for US-listed securities.
  if (def.id.endsWith(' US Equity')) {
    for (const q of [...merged.past, merged.next].filter((q): q is QuarterView => !!q)) {
      if ((!q.timing || q.timing === '--') && q.date) q.timing = usTiming(q.date);
    }
  }
  const problems: string[] = [];
  if (e?.message && e.state !== 'loading') problems.push(e.message);
  for (const k of ['earnings', 'history'] as const) {
    const p = fparts?.[k];
    if (p && p.state !== 'ok' && p.state !== 'loading' && p.message && !problems.includes(`Finnhub: ${p.message}`)) problems.push(`Finnhub: ${p.message}`);
  }
  const loading = !e || e.state === 'loading' || ['earnings', 'history'].some((k) => fparts?.[k as 'earnings']?.state === 'loading');
  return { ...merged, problems, loading };
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
  return def?.eq ? consensusFor(def) : null;
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
