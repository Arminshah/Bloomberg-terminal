// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo } from 'react';
import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import type { KeyedAnswer } from './lookup';
import type { PastReport } from './finnhub';
import { yahooGet } from './yahoo';
import { sameEpsDefinition, type EarningsMeta } from './earnings-evidence';

/**
 * Every company's quarterly reports by date, for EVENTS and the earnings screens (desktop app). Nasdaq's public
 * calendar (no key) gives each day's reports with the company's market value, the fiscal quarter, the time of the
 * report, the analysts' EPS forecast and, once reported, the EPS; for a coming report also the EPS a year earlier.
 * Finnhub's and FMP's calendars (the owner's keys) add expected and reported revenue, and companies Nasdaq leaves
 * out; Nasdaq's stock screener gives those a market value. Nasdaq's calendars of a year and a quarter earlier give
 * the EPS each report is compared with, on the same basis. FMP's earnings history per company (its key) gives the
 * revenue estimates of reported quarters for EARNINGS. Every figure keeps its source.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CalendarSource = 'Nasdaq' | 'Finnhub' | 'FMP';
export type CalendarTiming = 'Bef-mkt' | 'Aft-mkt' | 'During-mkt' | '--';

/** One company's report on Nasdaq's calendar. NaN wherever Nasdaq gives no figure. */
export interface NasdaqReport extends EarningsMeta {
  ccy?: string;
  symbol: string;
  name: string;
  /** Report day, YYYY-MM-DD. */
  date: string;
  timing: CalendarTiming;
  /** US dollars. */
  marketCap: number;
  /** The fiscal quarter's last month, YYYY-MM. */
  fiscalEnd: string;
  epsEst: number;
  epsActual: number;
  analysts: number;
  /** For a coming report: the same quarter's EPS a year earlier and its report day. */
  yearAgoEps: number;
  yearAgoDate?: string;
}

/** A report on Finnhub's or FMP's calendar: expected and reported EPS and revenue. */
export interface WindowReport extends EarningsMeta {
  ccy?: string;
  symbol: string;
  date: string;
  timing: CalendarTiming;
  /** Finnhub's fiscal label, "Q3 2026". */
  label?: string;
  epsEst: number;
  epsActual: number;
  revEst: number;
  revActual: number;
}

export interface Listing {
  cap: number;
  name: string;
  country: string;
  sector: string;
  industry?: string;
  /** The last price and the shares traded in the latest session the stock list reports; NaN when not given. */
  price?: number;
  volume?: number;
  /** The change on the previous close in that session, %; NaN when not given. */
  change?: number;
  /** The year the stock listed, as Nasdaq gives it; NaN for the many it gives none. */
  ipoYear?: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** One spelling for a US ticker across sources: BRK.B, whatever Nasdaq (BRK/B) or FMP (BRK-B) write. */
export const tickerKey = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/[/-]/g, '.');

/** "$1.08", "($0.17)", "-4.17", "$632,670,780,000", "5820952445.00"; NaN for "N/A" or nothing. */
export function nasdaqNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim();
  if (!s || /^n\/?a$/i.test(s)) return NaN;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  const digits = s.replace(/[()$,\s-]/g, '');
  if (!/^\d+(\.\d+)?$/.test(digits)) return NaN;
  const n = Number(digits);
  return negative ? -n : n;
}

const nasdaqTiming = (t: unknown): CalendarTiming => (t === 'time-pre-market' ? 'Bef-mkt' : t === 'time-after-hours' ? 'Aft-mkt' : '--');
const hourTiming = (h: unknown): CalendarTiming => (h === 'bmo' ? 'Bef-mkt' : h === 'amc' ? 'Aft-mkt' : h === 'dmh' ? 'During-mkt' : '--');

/** "Sep/2026" as 2026-09. */
function fiscalMonth(v: unknown): string {
  const m = /^([A-Z][a-z]{2})\/(\d{4})$/.exec(String(v ?? '').trim());
  const i = m ? MONTHS.indexOf(m[1]) : -1;
  return i >= 0 ? `${m![2]}-${String(i + 1).padStart(2, '0')}` : '';
}

/** "10/29/2025" (Nasdaq writes month first) as 2025-10-29. */
function usDate(v: unknown): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? '').trim());
  if (!m) return undefined;
  const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return ISO.test(iso) && isoDay(ms(iso)) === iso ? iso : undefined;
}

function json(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Whether a past line's EPS is the one reported. Nasdaq writes a report's EPS with its surprise; until it has them,
 * the field holds the year-earlier EPS (checked 21 October 2026: each of the 53 reports of the day before showed its
 * Q3 2025 EPS, GE 1.66, Netflix 0.59, surprise "N/A"). An EPS equal to the estimate is a surprise of zero, which
 * Nasdaq also writes "N/A". Days older than SETTLED_AFTER are taken as they are: Nasdaq has filled them by then.
 */
function nasdaqReported(r: any, date: string, now: number): boolean {
  if (ms(date) < now - SETTLED_AFTER) return true;
  const eps = nasdaqNumber(r?.eps);
  return Number.isFinite(nasdaqNumber(r?.surprise)) || (Number.isFinite(eps) && eps === nasdaqNumber(r?.epsForecast));
}

/** One day of Nasdaq's calendar; a day without reports is an empty list. */
export function parseNasdaqDay(text: string, date: string, now = Date.now()): { data: NasdaqReport[] } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'Nasdaq returned a page that is not JSON.' };
  if (!j || !Object.hasOwn(j, 'data') || (j.status?.rCode != null && j.status.rCode !== 200)) return { error: 'Nasdaq returned no valid earnings calendar.' };
  const rows: any[] = Array.isArray(j.data?.rows) ? j.data.rows : [];
  if (j.data != null && !Array.isArray(j.data.rows)) return { error: 'Nasdaq changed the calendar format.' };
  return {
    data: rows
      .map((r) => ({
        symbol: tickerKey(r?.symbol),
        name: String(r?.name ?? '').trim(),
        date,
        timing: nasdaqTiming(r?.time),
        marketCap: nasdaqNumber(r?.marketCap),
        fiscalEnd: fiscalMonth(r?.fiscalQuarterEnding),
        epsEst: nasdaqNumber(r?.epsForecast),
        epsActual: nasdaqReported(r, date, now) ? nasdaqNumber(r?.eps) : NaN,
        analysts: nasdaqNumber(r?.noOfEsts),
        yearAgoEps: nasdaqNumber(r?.lastYearEPS),
        ...(usDate(r?.lastYearRptDt) ? { yearAgoDate: usDate(r?.lastYearRptDt) } : {}),
      }))
      .filter((r) => /^[A-Z][A-Z0-9.]{0,9}$/.test(r.symbol)),
  };
}

/** Nasdaq's screener: every listed stock's market value, by ticker. Preferred shares (ABR^D) are left out. */
/**
 * A company's name without the share description Nasdaq's lists add to it: "FuboTV Inc. Class A Common Stock" is
 * FuboTV Inc., "Ionis Pharmaceuticals Inc. Common Stock" Ionis Pharmaceuticals Inc., "Plains GP Holdings, L.P. Class A
 * Units representing Limited Partner Interests" Plains GP Holdings, L.P.
 */
export function companyName(listed: string): string {
  const name = listed.replace(/\s+/g, ' ').trim();
  const short = name.replace(/\s+(?:Class [A-Z]\s+)?(?:(?:Common Stock|Common Shares|Ordinary Shares|Subordinate Voting Shares)(?:\s*\(.*\))?|(?:Common )?Units representing\b.*)$/i, '').trim();
  return short || name;
}

export function parseNasdaqListings(text: string): { data: Map<string, Listing> } | { error: string } {
  const j = json(text);
  const rows: any[] | undefined = j?.data?.rows ?? j?.data?.table?.rows;
  if (!Array.isArray(rows)) return { error: 'Nasdaq returned no stock list.' };
  const out = new Map<string, Listing>();
  for (const r of rows) {
    const symbol = tickerKey(r?.symbol);
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) continue;
    const ipo = String(r?.ipoyear ?? '').trim();
    out.set(symbol, {
      cap: nasdaqNumber(r?.marketCap),
      name: companyName(String(r?.name ?? '')),
      country: String(r?.country ?? ''),
      sector: String(r?.sector ?? ''),
      industry: String(r?.industry ?? ''),
      price: nasdaqNumber(r?.lastsale),
      volume: nasdaqNumber(r?.volume),
      change: nasdaqNumber(String(r?.pctchange ?? '').replace(/%$/, '')),
      ipoYear: /^\d{4}$/.test(ipo) ? Number(ipo) : NaN,
    });
  }
  return { data: out };
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Finnhub's /calendar/earnings for a window: {earningsCalendar: [{date, hour, quarter, year, epsEstimate, epsActual, revenueEstimate, revenueActual, symbol}]}. */
export function parseFinnhubWindow(text: string): { data: WindowReport[] } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'Finnhub returned a page that is not JSON.' };
  if (typeof j?.error === 'string') return { error: j.error.slice(0, 200) };
  if (!Array.isArray(j?.earningsCalendar)) return { error: 'Finnhub changed the calendar format.' };
  const rows: any[] = j.earningsCalendar;
  return {
    data: rows
      .map((r) => ({
        symbol: tickerKey(r?.symbol),
        date: String(r?.date ?? '').slice(0, 10),
        timing: hourTiming(r?.hour),
        ...(Number.isInteger(num(r?.quarter)) && num(r?.quarter) >= 1 && num(r?.quarter) <= 4 && Number.isInteger(num(r?.year)) ? { label: `Q${num(r?.quarter)} ${num(r?.year)}` } : {}),
        epsEst: num(r?.epsEstimate),
        epsActual: num(r?.epsActual),
        revEst: num(r?.revenueEstimate),
        revActual: num(r?.revenueActual),
      }))
      .filter((r) => ISO.test(r.date) && /^[A-Z][A-Z0-9.]{0,9}$/.test(r.symbol)),
  };
}

/** FMP's earnings-calendar or earnings: [{symbol, date, epsActual, epsEstimated, revenueActual, revenueEstimated}]. */
export function parseFmpEarnings(text: string): { data: WindowReport[] } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'FMP returned a page that is not JSON.' };
  if (!Array.isArray(j)) return { error: String(j?.['Error Message'] ?? j?.error ?? j?.message ?? 'FMP returned no list.').slice(0, 200) };
  return {
    data: j
      .map((r: any) => ({
        symbol: tickerKey(r?.symbol),
        date: String(r?.date ?? '').slice(0, 10),
        timing: '--' as CalendarTiming,
        epsEst: num(r?.epsEstimated ?? r?.epsEstimate),
        epsActual: num(r?.epsActual ?? r?.eps),
        revEst: num(r?.revenueEstimated ?? r?.revenueEstimate),
        revActual: num(r?.revenueActual ?? r?.revenue),
      }))
      .filter((r: WindowReport) => ISO.test(r.date) && /^[A-Z][A-Z0-9.]{0,9}$/.test(r.symbol)),
  };
}

// ------------------------------------------------------------------ merging

export interface CalendarFigure extends EarningsMeta {
  ccy?: string;
  est: number;
  actual: number;
  /** The calendar that gave the figure, or (completed for one company) the source of its own history. */
  estFrom?: CalendarSource | string;
  actualFrom?: CalendarSource | string;
  analysts?: number;
  /** Incomplete alternative pairs stay inspectable; they are not combined across unknown definitions. */
  alternatives?: (EarningsMeta & { ccy?: string; source: CalendarSource; est: number; actual: number })[];
}

export interface CalendarReport {
  symbol: string;
  name: string;
  date: string;
  timing: CalendarTiming;
  /** US dollars; NaN when no source gives it. */
  marketCap: number;
  /**
   * US dollars traded in the latest session Nasdaq's stock list reports (last price times shares traded): how much
   * the market trades the company, which ranks the most relevant releases. NaN when the list does not have it.
   */
  traded: number;
  /** The fiscal quarter's last month (YYYY-MM, Nasdaq) and its fiscal label (Finnhub), when given. */
  fiscalEnd: string;
  label?: string;
  eps: CalendarFigure;
  rev: CalendarFigure;
  /**
   * The same figure for the quarter a year and a quarter earlier, on the basis of this report's (Nasdaq's EPS
   * against Nasdaq's, FMP's revenue against FMP's): growth is worked out only between figures of one source.
   */
  epsYearAgo: number;
  epsQuarterAgo: number;
  revYearAgo: number;
  revQuarterAgo: number;
  sources: CalendarSource[];
}

/** A company's name, market value and dollars traded in the latest session from Yahoo Finance's quotes. */
export interface YahooFact {
  name: string;
  /** US dollars; NaN when not given. */
  cap: number;
  /** Last price × shares traded in the latest session, US dollars; NaN when not given or not in dollars. */
  traded: number;
}

export interface CalendarInput {
  nasdaq: NasdaqReport[];
  /** Yahoo Finance's figures, asked for when Nasdaq's stock list does not load: names, market values, trading. */
  yahoo?: Record<string, YahooFact>;
  finnhub?: WindowReport[];
  fmp?: WindowReport[];
  listings?: Map<string, Listing>;
  /** Nasdaq's reports of the year-earlier and quarter-earlier windows, and FMP's of the same windows. */
  nasdaqHistory?: NasdaqReport[];
  fmpHistory?: WindowReport[];
}

/** Keep an estimate and actual in one source's comparison; unknown bases cannot justify a cross-provider join. */
function figure(options: (EarningsMeta & { ccy?: string; from: CalendarSource; est: number; actual: number; analysts?: number })[], eps = false): CalendarFigure {
  const current = options.filter((o) => !o.stale && !o.error);
  const candidates = current.length ? current : options;
  const both = candidates.find((o) => ok(o.est) && ok(o.actual));
  const selected = both ?? candidates.find((o) => ok(o.actual)) ?? candidates.find((o) => ok(o.est));
  if (!selected) return { est: NaN, actual: NaN };
  const { from, analysts, ...values } = selected;
  const estimate = !both && eps && !ok(selected.est) ? candidates.find((o) => ok(o.est) && sameEpsDefinition(selected, o)) : undefined;
  const actual = !both && eps && !ok(selected.actual) ? candidates.find((o) => ok(o.actual) && sameEpsDefinition(selected, o)) : undefined;
  return { ...values, ...(estimate ? { est: estimate.est, estFrom: estimate.from } : {}), ...(actual ? { actual: actual.actual, actualFrom: actual.from } : {}), ...(ok(selected.est) ? { estFrom: from } : {}), ...(ok(selected.actual) ? { actualFrom: from } : {}), ...(ok(analysts) ? { analysts } : {}), ...(options.length > 1 ? { alternatives: options.filter((o) => o !== selected).map(({ from, ...value }) => ({ ...value, source: from })) } : {}) };
}

const evidenceOf = (row: EarningsMeta & { ccy?: string }): EarningsMeta & { ccy?: string } => {
  const { basis, shareBasis, epsType, unit, splitBasis, scope, dataset, sourceUrl, ccy, observedAt, publishedAt, attemptedAt, lastSuccessfulAt, revisionId, stale, error, estimateProvenance, estimateObservedAt, estimatePublishedAt } = row;
  return { basis, shareBasis, epsType, unit, splitBasis, scope, dataset, sourceUrl, ccy, observedAt, publishedAt, attemptedAt, lastSuccessfulAt, revisionId, stale, error, estimateProvenance, estimateObservedAt, estimatePublishedAt };
};

/** YYYY-MM moved by `months`. */
function shiftMonth(ym: string, months: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + months;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Each company's reports in a window from every calendar, one line per report, every figure with its source. */
export function mergeCalendar(i: CalendarInput): CalendarReport[] {
  const near = (a: string, b: string, days: number) => Math.abs(ms(a) - ms(b)) <= days * DAY_MS;
  const bySymbol = (rows: WindowReport[] = []) => {
    const m = new Map<string, WindowReport[]>();
    for (const r of rows) m.set(r.symbol, [...(m.get(r.symbol) ?? []), r]);
    return m;
  };
  const fh = bySymbol(i.finnhub);
  const fm = bySymbol(i.fmp);
  const used = new Set<WindowReport>();
  const take = (m: Map<string, WindowReport[]>, symbol: string, date: string) => {
    const hit = (m.get(symbol) ?? []).filter((r) => !used.has(r) && near(r.date, date, 3)).sort((a, b) => Math.abs(ms(a.date) - ms(date)) - Math.abs(ms(b.date) - ms(date)))[0];
    if (hit) used.add(hit);
    return hit;
  };
  type Draft = { n?: NasdaqReport; f?: WindowReport; p?: WindowReport; symbol: string; date: string };
  const drafts: Draft[] = [];
  const seen = new Set<string>();
  for (const n of i.nasdaq) {
    const key = `${n.symbol}|${n.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push({ n, f: take(fh, n.symbol, n.date), p: take(fm, n.symbol, n.date), symbol: n.symbol, date: n.date });
  }
  for (const f of i.finnhub ?? []) if (!used.has(f)) {
    used.add(f);
    drafts.push({ f, p: take(fm, f.symbol, f.date), symbol: f.symbol, date: f.date });
  }
  for (const p of i.fmp ?? []) if (!used.has(p)) {
    used.add(p);
    drafts.push({ p, symbol: p.symbol, date: p.date });
  }
  const nh = new Map<string, NasdaqReport[]>();
  for (const r of i.nasdaqHistory ?? []) nh.set(r.symbol, [...(nh.get(r.symbol) ?? []), r]);
  const ph = bySymbol(i.fmpHistory);
  return drafts.map(({ n, f, p, symbol, date }) => {
    const listing = i.listings?.get(symbol);
    const yf = i.yahoo?.[symbol];
    const eps = figure([
      ...(n ? [{ ...evidenceOf(n), from: 'Nasdaq' as const, est: n.epsEst, actual: n.epsActual, analysts: n.analysts }] : []),
      ...(f ? [{ ...evidenceOf(f), from: 'Finnhub' as const, est: f.epsEst, actual: f.epsActual }] : []),
      ...(p ? [{ ...evidenceOf(p), from: 'FMP' as const, est: p.epsEst, actual: p.epsActual }] : []),
    ], true);
    // FMP's revenue first: its earlier calendars give the same figure a year and a quarter before.
    const rev = figure([...(p ? [{ ...evidenceOf(p), from: 'FMP' as const, est: p.revEst, actual: p.revActual }] : []), ...(f ? [{ ...evidenceOf(f), from: 'Finnhub' as const, est: f.revEst, actual: f.revActual }] : [])]);
    const fiscalEnd = n?.fiscalEnd ?? '';
    // Year-earlier and quarter-earlier figures from the same source as this report's.
    const earlierNasdaq = (months: number, lo: number, hi: number) => {
      const rows = (nh.get(symbol) ?? []).filter((r) => !r.stale && !r.error);
      const byQuarter = fiscalEnd ? rows.find((r) => r.fiscalEnd === shiftMonth(fiscalEnd, -months) && ok(r.epsActual)) : undefined;
      const byDate = !fiscalEnd ? rows.find((r) => ok(r.epsActual) && ms(date) - ms(r.date) >= lo * DAY_MS && ms(date) - ms(r.date) <= hi * DAY_MS) : undefined;
      return (byQuarter ?? byDate)?.epsActual ?? NaN;
    };
    const earlierFmp = (lo: number, hi: number) => (ph.get(symbol) ?? []).find((r) => !r.stale && !r.error && ok(r.revActual) && ms(date) - ms(r.date) >= lo * DAY_MS && ms(date) - ms(r.date) <= hi * DAY_MS)?.revActual ?? NaN;
    const reported = ok(eps.actual);
    // A reported EPS against the year-earlier report on Nasdaq's calendar; a coming report's estimate against the
    // year-earlier EPS on its own line.
    const epsYearAgo = reported ? (eps.actualFrom === 'Nasdaq' ? earlierNasdaq(12, 330, 400) : NaN) : eps.estFrom === 'Nasdaq' && n ? n.yearAgoEps : NaN;
    return {
      symbol,
      name: n?.name || listing?.name || yf?.name || symbol,
      date,
      timing: n && n.timing !== '--' ? n.timing : f?.timing ?? n?.timing ?? '--',
      marketCap: ok(n?.marketCap) ? n!.marketCap : ok(listing?.cap) ? listing!.cap : yf?.cap ?? NaN,
      traded: listing && ok(listing.price) && ok(listing.volume) && listing.price > 0 && listing.volume >= 0 ? listing.price * listing.volume : yf?.traded ?? NaN,
      fiscalEnd,
      ...(f?.label ? { label: f.label } : {}),
      eps,
      rev,
      epsYearAgo,
      epsQuarterAgo: reported && eps.actualFrom === 'Nasdaq' ? earlierNasdaq(3, 60, 120) : NaN,
      revYearAgo: rev.actualFrom === 'FMP' ? earlierFmp(330, 400) : NaN,
      revQuarterAgo: rev.actualFrom === 'FMP' ? earlierFmp(60, 120) : NaN,
      sources: [...new Set([n && 'Nasdaq', f && 'Finnhub', p && 'FMP'].filter(Boolean) as CalendarSource[])],
    };
  });
}

/** Change of `now` against `before` in percent; NaN to or from a loss or nothing, where growth means nothing. */
export function growthPct(now: number, before: number): number {
  return ok(now) && ok(before) && now > 0 && before > 0 ? (now / before - 1) * 100 : NaN;
}

// ------------------------------------------------------------------ loading

interface Part<T> {
  state: 'loading' | 'ok' | 'error' | 'needs-key' | 'off' | 'budget';
  data?: T;
  message?: string;
  at?: number;
  /** An earlier answer kept because the latest request failed. */
  stale?: boolean;
  attemptedAt?: number;
}

export const earningsCalendar = createStore<{
  v: number;
  days: Record<string, Part<NasdaqReport[]>>;
  windows: Record<string, Part<WindowReport[]>>;
  listings?: Part<Map<string, Listing>>;
  companies: Record<string, Part<WindowReport[]>>;
  yahoo: Record<string, YahooFact>;
}>({ v: 0, days: {}, windows: {}, companies: {}, yahoo: {} });

/** Response cache for long-past days; the evidence journal below retains corrections independently. */
type SettledRow = Pick<NasdaqReport, 'symbol' | 'fiscalEnd' | 'epsEst' | 'epsActual'> & EarningsMeta & { ccy?: string };
const settled = createStore<{ by: Record<string, { at: number; rows: SettledRow[] }> }>({ by: {} }, 'earnings-days', 1);
const SETTLED_AFTER = 20 * DAY_MS;
const KEEP_DAYS = 400;
/** Historical provider corrections are rechecked at most weekly for days a screen requests. */
export const HISTORY_RECHECK_MS = 7 * DAY_MS;

export interface CalendarDayVersion {
  /** Local knowledge time, not the issuer's publication time. */
  observedAt: number;
  rows: SettledRow[];
  origin: 'source' | 'migrated-cache';
}

export const calendarHistory = createStore<{ by: Record<string, CalendarDayVersion[]> }>({ by: {} }, 'earnings-day-observations', 1);

/** Keep the value's definition in the archive; repeated check clocks do not create corrections. */
function settledRow(row: SettledRow): SettledRow {
  const { symbol, fiscalEnd, epsEst, epsActual, basis, shareBasis, epsType, unit, splitBasis, scope, dataset, sourceUrl, ccy, publishedAt, revisionId, estimateProvenance, estimateObservedAt, estimatePublishedAt } = row;
  return { symbol, fiscalEnd, epsEst, epsActual, basis, shareBasis, epsType, unit, splitBasis, scope, dataset, sourceUrl, ccy, publishedAt, revisionId, estimateProvenance, estimateObservedAt, estimatePublishedAt };
}

/** Append changed observations; never silently rewrite a previously observed historical day. */
export function recordCalendarDay(date: string, rows: SettledRow[], observedAt: number, origin: CalendarDayVersion['origin'] = 'source'): void {
  if (!ISO.test(date) || !Number.isFinite(observedAt) || observedAt <= 0) return;
  const values = rows.map(settledRow).sort((a, b) => a.symbol.localeCompare(b.symbol));
  calendarHistory.set((s) => {
    const previous = s.by[date] ?? [];
    const last = [...previous].sort((a, b) => b.observedAt - a.observedAt)[0];
    if (last && JSON.stringify(last.rows) === JSON.stringify(values)) return s;
    if (previous.some((p) => p.observedAt === observedAt && JSON.stringify(p.rows) === JSON.stringify(values))) return s;
    return { by: { ...s.by, [date]: [...previous, { observedAt, rows: values, origin }] } };
  });
}

/** A first-observed or knowledge-as-of view never claims to reconstruct an earlier issuer release. */
export function calendarDayVersion(date: string, view: 'latest' | 'first-observed' | 'as-of' = 'latest', asOf = Infinity): CalendarDayVersion | undefined {
  const rows = (calendarHistory.get().by[date] ?? []).filter((r) => view !== 'as-of' || r.observedAt <= asOf).sort((a, b) => a.observedAt - b.observedAt);
  return view === 'first-observed' ? rows[0] : rows[rows.length - 1];
}

function keepSettled(date: string, rows: NasdaqReport[], observedAt: number) {
  recordCalendarDay(date, rows, observedAt);
  if (ms(date) > Date.now() - SETTLED_AFTER) return;
  settled.set((s) => {
    const by = { ...s.by, [date]: { at: observedAt, rows: rows.map(settledRow) } };
    const days = Object.keys(by).sort();
    for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete by[d];
    return { by };
  });
}

/** A settled day kept from an earlier start, as Nasdaq's lines (the fields growth uses). */
function settledDay(date: string): NasdaqReport[] | undefined {
  const k = settled.get().by[date];
  if (k && !calendarHistory.get().by[date]?.length) recordCalendarDay(date, k.rows, k.at, 'migrated-cache');
  return k ? k.rows.map((r) => ({ ...r, observedAt: k.at, lastSuccessfulAt: k.at, name: '', date, timing: '--', marketCap: NaN, analysts: NaN, yearAgoEps: NaN })) : undefined;
}

export function calendarAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.earningsCalendar === 'function';
}

function answerPart<T>(res: KeyedAnswer, source: CalendarSource, parse: (text: string) => { data: T } | { error: string }): Part<T> {
  const attemptedAt = Date.now();
  if (res.gated) return { state: 'off', attemptedAt, message: `${source} is switched off (${res.gated} on PROVIDERS).` };
  if (res.missing || res.refused) return { state: 'needs-key', attemptedAt, message: res.refused ? `The configured ${source} key has the wrong format.` : `Needs ${source === 'FMP' ? 'FMP_API_KEY' : 'FINNHUB_API_KEY'} (PROVIDERS).` };
  if (!res.text) return { state: res.budget ? 'budget' : 'error', attemptedAt, message: res.budget ? `Today's ${source} allowance in this app is spent.` : `${source}: ${res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer')}` };
  const parsed = parse(res.text);
  if ('error' in parsed) return { state: 'error', message: `${source}: ${parsed.error}`, at: res.at, attemptedAt };
  const failed = !!res.stale || !!res.error || res.status !== 200;
  const at = res.at ?? (!res.cached && !failed ? attemptedAt : undefined);
  const message = failed ? `${source}: ${res.error ?? (res.status ? `HTTP ${res.status}; earlier answer retained` : 'the source did not answer; earlier answer retained')}` : undefined;
  const data = Array.isArray(parsed.data) ? parsed.data.map((r) => ({ ...r, ...(at != null ? { observedAt: at, lastSuccessfulAt: at } : {}), attemptedAt, ...(failed ? { stale: true, error: message } : {}) })) as T : parsed.data;
  return { state: failed ? 'error' : 'ok', data, at, attemptedAt, ...(failed ? { stale: true, message } : {}) };
}

/** Preserve a usable old value while preserving the latest failure, rather than restoring state:ok. */
function retainPart<T>(next: Part<T>, previous: Part<T> | undefined): Part<T> {
  if (next.state === 'ok' || previous?.data === undefined) return next;
  const data = Array.isArray(previous.data) ? previous.data.map((r) => ({ ...r, stale: true, error: next.message, attemptedAt: Date.now() })) as T : previous.data;
  return { ...next, data, at: previous.at, attemptedAt: Date.now(), stale: true };
}

/**
 * Answers are stored as they arrive, but the screens are told (the version bumped) at most every 600 ms: a window
 * of Nasdaq days arrives one day at a time, and redrawing a thousand-line calendar for each froze the app.
 */
const NOTIFY_MS = 600;
let notifyPending = false;
const bump = (patch: (s: ReturnType<typeof earningsCalendar.get>) => Partial<ReturnType<typeof earningsCalendar.get>>) => {
  earningsCalendar.set((s) => ({ ...s, ...patch(s) }));
  if (notifyPending) return;
  notifyPending = true;
  setTimeout(() => {
    notifyPending = false;
    earningsCalendar.set((s) => ({ ...s, v: s.v + 1 }));
  }, NOTIFY_MS);
};

// Nasdaq's days go one after another, nearest first; a day near today is asked again after half an hour.
const queue: { key: string; run: () => Promise<void> }[] = [];
const asked = new Map<string, number>();
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    void job.run().finally(() => {
      running--;
      pump();
    });
  }
}

const again = (key: string, everyMs: number) => Date.now() - (asked.get(key) ?? 0) >= everyMs;

function askDay(date: string, now: number) {
  const key = `day:${date}`;
  const recent = Math.abs(ms(date) - now) < 4 * DAY_MS;
  if (!again(key, recent ? 30 * 60_000 : 6 * 3_600_000) || queue.some((j) => j.key === key)) return;
  // Hydrate long-past days immediately, then budget a correction check instead of freezing them forever.
  const kept = ms(date) < now - SETTLED_AFTER ? settledDay(date) : undefined;
  if (kept) {
    if (!earningsCalendar.get().days[date]?.data) bump((s) => ({ days: { ...s.days, [date]: { state: 'ok', data: kept, at: settled.get().by[date].at } } }));
    if (now - settled.get().by[date].at < HISTORY_RECHECK_MS) {
      asked.set(key, Date.now());
      return;
    }
  }
  asked.set(key, Date.now());
  if (!earningsCalendar.get().days[date]) bump((s) => ({ days: { ...s.days, [date]: { state: 'loading' } } }));
  queue.push({
    key,
    run: async () => {
      let part: Part<NasdaqReport[]>;
      try {
        part = answerPart(await window.arminDesktop!.earningsCalendar!('nasdaq', date, date), 'Nasdaq', (t) => parseNasdaqDay(t, date));
      } catch {
        part = { state: 'error', message: 'Nasdaq: the request could not be made.' };
      }
      if (part.message) part = { ...part, message: `${date} · ${part.message}` };
      if (part.state !== 'ok' && recent) asked.delete(key);
      else if (part.state === 'ok' && part.at != null) keepSettled(date, part.data ?? [], part.at);
      const kept = earningsCalendar.get().days[date];
      bump((s) => ({ days: { ...s.days, [date]: retainPart(part, kept) } }));
    },
  });
}

/** Request specific calendar days through the shared, budgeted correction queue. */
export function requestCalendarDays(dates: string[], now = Date.now()): void {
  if (!calendarAvailable()) return;
  for (const date of dates) if (ISO.test(date) && Number.isFinite(ms(date)) && isoDay(ms(date)) === date) askDay(date, now);
  pump();
}

async function askWindow(source: 'finnhub' | 'fmp', from: string, to: string) {
  const key = `${source}:${from}:${to}`;
  if (!again(key, 30 * 60_000)) return;
  asked.set(key, Date.now());
  if (!earningsCalendar.get().windows[key]) bump((s) => ({ windows: { ...s.windows, [key]: { state: 'loading' } } }));
  let part: Part<WindowReport[]>;
  try {
    part = answerPart(await window.arminDesktop!.earningsCalendar!(source, from, to), source === 'fmp' ? 'FMP' : 'Finnhub', source === 'fmp' ? parseFmpEarnings : parseFinnhubWindow);
  } catch {
    part = { state: 'error', message: `${source === 'fmp' ? 'FMP' : 'Finnhub'}: the request could not be made.` };
  }
  if (part.state === 'needs-key' || part.state === 'off' || part.state === 'error') asked.delete(key);
  const kept = earningsCalendar.get().windows[key];
  bump((s) => ({ windows: { ...s.windows, [key]: retainPart(part, kept) } }));
}

/** Every US-listed stock's market value and sector from Nasdaq's stock list, loaded once every six hours. */
export function requestListings() {
  if (calendarAvailable()) void askListings();
}

async function askListings() {
  if (!again('listings', 6 * 3_600_000)) return;
  asked.set('listings', Date.now());
  let part: Part<Map<string, Listing>>;
  try {
    part = answerPart(await window.arminDesktop!.earningsCalendar!('nasdaq-caps', '', ''), 'Nasdaq', parseNasdaqListings);
  } catch {
    part = { state: 'error', message: 'Nasdaq: the stock list could not be loaded.' };
  }
  if (part.state !== 'ok') asked.delete('listings');
  bump(() => ({ listings: part }));
}

/** Yahoo's quote answer (/v7/finance/quote): each symbol's name, market value and dollars traded today. */
export function parseYahooFacts(json: unknown): Record<string, YahooFact> {
  const out: Record<string, YahooFact> = {};
  const rows = (json as { quoteResponse?: { result?: unknown[] } } | null)?.quoteResponse?.result;
  for (const q of Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []) {
    const symbol = typeof q.symbol === 'string' ? q.symbol.replace(/-/g, '.') : '';
    if (!symbol) continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const price = num(q.regularMarketPrice);
    const volume = num(q.regularMarketVolume);
    const usd = q.currency === 'USD';
    out[symbol] = {
      name: companyName(String(q.longName ?? q.shortName ?? '')),
      cap: usd ? num(q.marketCap) : NaN,
      traded: usd && price > 0 && volume >= 0 ? price * volume : NaN,
    };
  }
  return out;
}

const yahooAsked = new Set<string>();

/**
 * When Nasdaq's stock list does not load, the week's companies are named and ranked from Yahoo Finance's quotes
 * instead: 50 symbols a request, one request at a time, each symbol once a session.
 */
export function requestYahooFacts(symbols: string[]) {
  if (!calendarAvailable() || typeof window.arminDesktop?.yahoo !== 'function') return;
  const fresh = [...new Set(symbols)].filter((x) => /^[A-Z][A-Z0-9.]{0,9}$/.test(x) && !yahooAsked.has(x));
  if (!fresh.length) return;
  for (const x of fresh) yahooAsked.add(x);
  void (async () => {
    for (let i = 0; i < fresh.length; i += 50) {
      const batch = fresh.slice(i, i + 50);
      try {
        const facts = parseYahooFacts(await yahooGet(`/v7/finance/quote?symbols=${batch.map((x) => encodeURIComponent(x.replace(/\./g, '-'))).join(',')}`));
        bump((s) => ({ yahoo: { ...s.yahoo, ...facts } }));
      } catch {
        // Asked again on the next request for the week.
        for (const x of batch) yahooAsked.delete(x);
        return;
      }
    }
  })();
}

/** The days from `from` to `to`, both YYYY-MM-DD and included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = ms(from); t <= ms(to); t += DAY_MS) out.push(isoDay(t));
  return out;
}

/** Windows of at most 45 days covering `from` to `to`, as Finnhub and FMP take them. */
function chunks(from: string, to: string): [string, string][] {
  const out: [string, string][] = [];
  for (let t = ms(from); t <= ms(to); t += 45 * DAY_MS) out.push([isoDay(t), isoDay(Math.min(ms(to), t + 44 * DAY_MS))]);
  return out;
}

/** The windows a year and a quarter before a window, a week wider on each side: where the earlier reports fall. */
export function historyWindows(from: string, to: string): [string, string][] {
  return [[isoDay(ms(from) - 371 * DAY_MS), isoDay(ms(to) - 357 * DAY_MS)], [isoDay(ms(from) - 98 * DAY_MS), isoDay(ms(to) - 84 * DAY_MS)]];
}

/**
 * The days on which a window's reported quarters were most likely reported a year and a quarter earlier: 52 and 13
 * weeks before each day up to today first (companies tend to keep their weekday), then a day further each way, up to
 * a week. The latest reports' days come first, as the window's own days do: a long season's last week waited behind
 * its first.
 */
export function historyDays(from: string, to: string, today: string): string[] {
  const last = to < today ? to : today;
  if (last < from) return [];
  const reported = daysBetween(from, last).reverse();
  const out = new Set<string>();
  for (let off = 0; off <= 7; off++) {
    for (const sign of off ? [-1, 1] : [0]) {
      for (const back of [364, 91]) for (const d of reported) out.add(isoDay(ms(d) - (back - sign * off) * DAY_MS));
    }
  }
  return [...out];
}

export interface MarketCalendar {
  reports: CalendarReport[];
  /** Nasdaq's days asked for and those still loading. */
  days: number;
  loading: number;
  /** Which revenue sources answered, and why the others did not. */
  revenueFrom: CalendarSource[];
  problems: string[];
  /** Why Nasdaq's calendar days or stock list did not load: the dates and companies themselves. */
  calendarProblems: string[];
  /** When Nasdaq's stock list (market values, trading) was read; NaN before it is. */
  listingsAt: number;
  /** Why Nasdaq's stock list did not load, when it did not; empty otherwise or while it loads. */
  listingsProblem: string;
}

/** Every company's reports from `from` to `to` (desktop app); with `history`, the year- and quarter-earlier ones too. */
export function useMarketCalendar(from: string, to: string, history: boolean, enabled = true): MarketCalendar {
  const v = earningsCalendar.use((s) => s.v);
  useEffect(() => {
    if (!enabled || !calendarAvailable()) return;
    const ask = () => {
      const now = Date.now();
      void askListings();
      // Nearest days first: today's and yesterday's reports before last week's.
      requestCalendarDays(daysBetween(from, to).sort((a, b) => Math.abs(ms(a) - now) - Math.abs(ms(b) - now)), now);
      for (const [a, b] of chunks(from, to)) {
        void askWindow('finnhub', a, b);
        void askWindow('fmp', a, b);
      }
      if (history) {
        for (const d of historyDays(from, to, isoDay(now))) askDay(d, now);
        for (const [a, b] of historyWindows(from, to)) for (const [c, e] of chunks(a, b)) void askWindow('fmp', c, e);
      }
      pump();
    };
    ask();
    const t = setInterval(ask, 15 * 60_000);
    return () => clearInterval(t);
  }, [from, to, history, enabled]);
  return useMemo(() => {
    const s = earningsCalendar.get();
    const dayParts = daysBetween(from, to).map((d) => s.days[d]);
    const windows = (source: string, a: string, b: string) => chunks(a, b).map(([c, e]) => s.windows[`${source}:${c}:${e}`]);
    const rows = <T,>(parts: (Part<T[]> | undefined)[]) => parts.flatMap((p) => p?.data ?? []);
    const hist = history ? historyWindows(from, to) : [];
    const finnhub = windows('finnhub', from, to);
    const fmp = windows('fmp', from, to);
    const nasdaqHistoryParts = history ? historyDays(from, to, isoDay(Date.now())).map((d) => s.days[d]) : [];
    const fmpHistoryParts = hist.flatMap(([a, b]) => windows('fmp', a, b));
    const reports = mergeCalendar({
      nasdaq: rows(dayParts),
      finnhub: rows(finnhub),
      fmp: rows(fmp),
      listings: s.listings?.data,
      yahoo: s.listings?.state === 'ok' ? undefined : s.yahoo,
      nasdaqHistory: rows(nasdaqHistoryParts),
      fmpHistory: rows(fmpHistoryParts),
    });
    const answered = (parts: (Part<unknown> | undefined)[]) => parts.length > 0 && parts.every((p) => p?.state === 'ok');
    const failed = (parts: (Part<unknown> | undefined)[]) => [...new Set(parts.filter((p) => p && p.state !== 'ok' && p.state !== 'loading' && p.message).map((p) => p!.message!))];
    const problems = failed([...dayParts, ...nasdaqHistoryParts, ...finnhub, ...fmp, ...fmpHistoryParts, s.listings]);
    return {
      reports,
      days: dayParts.length,
      loading: dayParts.filter((p) => !p || p.state === 'loading').length,
      revenueFrom: [...(answered(finnhub) ? ['Finnhub' as const] : []), ...(answered(fmp) ? ['FMP' as const] : [])],
      problems,
      calendarProblems: failed([...dayParts, ...nasdaqHistoryParts, s.listings]),
      listingsAt: s.listings?.state === 'ok' && s.listings.at ? s.listings.at : NaN,
      listingsProblem: s.listings && s.listings.state !== 'ok' && s.listings.state !== 'loading' ? s.listings.message ?? 'no answer' : '',
    };
  }, [v, from, to, history]); // eslint-disable-line react-hooks/exhaustive-deps
}

// --------------------------------------------- one company's reports (EARNINGS)

/** FMP's earnings history for one company (its key), for the revenue estimates of reported quarters. */
export function requestCompanyEarnings(symbol: string | null) {
  if (!symbol || typeof window === 'undefined' || typeof window.arminDesktop?.analysts !== 'function') return;
  const key = `company:${symbol}`;
  if (!again(key, 10 * 60_000)) return;
  asked.set(key, Date.now());
  void (async () => {
    let part: Part<WindowReport[]>;
    try {
      part = answerPart(await window.arminDesktop!.analysts!('earnings', symbol), 'FMP', parseFmpEarnings);
    } catch {
      part = { state: 'error', message: 'FMP: the request could not be made.' };
    }
    if (part.state !== 'ok') asked.delete(key);
    const kept = earningsCalendar.get().companies[symbol];
    bump((s) => ({ companies: { ...s.companies, [symbol]: retainPart(part, kept) } }));
  })();
}

/**
 * Everything the calendars hold for one company: FMP's reports (its history, then any calendar window) and
 * Finnhub's market calendar lines in the shape of its per-company history.
 */
export interface CompanyReports {
  fmp: WindowReport[];
  finnhub: (PastReport & EarningsMeta)[];
  fmpMeta?: EarningsMeta & { at?: number };
  finnhubMeta?: EarningsMeta & { at?: number };
}

export function companyReports(symbol: string | null): CompanyReports {
  if (!symbol) return { fmp: [], finnhub: [] };
  const s = earningsCalendar.get();
  const key = tickerKey(symbol);
  const fromWindows = (source: string) => Object.entries(s.windows).filter(([k]) => k.startsWith(`${source}:`)).flatMap(([, p]) => (p.data ?? []).filter((r) => r.symbol === key).map((r) => ({ ...r, ...(p.at != null ? { observedAt: p.at } : {}), ...(p.stale || p.state !== 'ok' ? { stale: true, error: p.message } : {}), ...(p.attemptedAt ? { attemptedAt: p.attemptedAt } : {}) })));
  const companyPart = s.companies[symbol];
  const fmp = [...(companyPart?.data ?? [])].map((r) => ({ ...r, ...(companyPart?.at != null ? { observedAt: companyPart.at, lastSuccessfulAt: companyPart.at } : {}), ...(companyPart?.attemptedAt ? { attemptedAt: companyPart.attemptedAt } : {}), ...(companyPart?.stale || (companyPart && companyPart.state !== 'ok') ? { stale: true, error: companyPart.message } : {}) }));
  for (const r of fromWindows('fmp')) if (!fmp.some((x) => x.date === r.date)) fmp.push(r);
  const finnhub = fromWindows('finnhub')
    .filter((r) => ok(r.epsActual) || ok(r.revActual))
    .map((r) => {
      const m = /^Q([1-4]) (\d{4})$/.exec(r.label ?? '');
      return { ...evidenceOf(r), date: r.date, hour: r.timing === 'Bef-mkt' ? 'bmo' : r.timing === 'Aft-mkt' ? 'amc' : r.timing === 'During-mkt' ? 'dmh' : '', quarter: m ? Number(m[1]) : NaN, year: m ? Number(m[2]) : NaN, epsEstimate: r.epsEst, epsActual: r.epsActual, revenueEstimate: r.revEst, revenueActual: r.revActual };
    });
  const metadata = (rows: EarningsMeta[]): EarningsMeta & { at?: number } => {
    const latest = [...rows].filter((r) => r.observedAt != null).sort((a, b) => (b.observedAt ?? 0) - (a.observedAt ?? 0))[0];
    return { ...(latest ? { observedAt: latest.observedAt, at: latest.observedAt, lastSuccessfulAt: latest.lastSuccessfulAt ?? latest.observedAt } : {}), ...(rows.some((r) => r.stale) ? { stale: true, error: rows.find((r) => r.error)?.error } : {}) };
  };
  return { fmp: fmp.sort((a, b) => b.date.localeCompare(a.date)), finnhub, ...(fmp.length || companyPart ? { fmpMeta: { ...metadata(fmp), ...(companyPart?.attemptedAt ? { attemptedAt: companyPart.attemptedAt } : {}), ...(companyPart && companyPart.state !== 'ok' ? { stale: true, error: companyPart.message } : {}) } } : {}), ...(finnhub.length ? { finnhubMeta: metadata(finnhub) } : {}) };
}
