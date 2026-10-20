import { useEffect, useMemo } from 'react';
import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import type { KeyedAnswer } from './lookup';
import type { PastReport } from './finnhub';

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
export interface NasdaqReport {
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
export interface WindowReport {
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

/** One day of Nasdaq's calendar; a day without reports is an empty list. */
export function parseNasdaqDay(text: string, date: string): { data: NasdaqReport[] } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'Nasdaq returned a page that is not JSON.' };
  const rows: any[] = Array.isArray(j?.data?.rows) ? j.data.rows : [];
  if (j?.data && j.data.rows != null && !Array.isArray(j.data.rows)) return { error: 'Nasdaq changed the calendar format.' };
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
        epsActual: nasdaqNumber(r?.eps),
        analysts: nasdaqNumber(r?.noOfEsts),
        yearAgoEps: nasdaqNumber(r?.lastYearEPS),
        ...(usDate(r?.lastYearRptDt) ? { yearAgoDate: usDate(r?.lastYearRptDt) } : {}),
      }))
      .filter((r) => /^[A-Z][A-Z0-9.]{0,9}$/.test(r.symbol)),
  };
}

/** Nasdaq's screener: every listed stock's market value, by ticker. Preferred shares (ABR^D) are left out. */
export function parseNasdaqListings(text: string): { data: Map<string, Listing> } | { error: string } {
  const j = json(text);
  const rows: any[] | undefined = j?.data?.rows ?? j?.data?.table?.rows;
  if (!Array.isArray(rows)) return { error: 'Nasdaq returned no stock list.' };
  const out = new Map<string, Listing>();
  for (const r of rows) {
    const symbol = tickerKey(r?.symbol);
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) continue;
    out.set(symbol, { cap: nasdaqNumber(r?.marketCap), name: String(r?.name ?? '').trim(), country: String(r?.country ?? ''), sector: String(r?.sector ?? ''), industry: String(r?.industry ?? '') });
  }
  return { data: out };
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Finnhub's /calendar/earnings for a window: {earningsCalendar: [{date, hour, quarter, year, epsEstimate, epsActual, revenueEstimate, revenueActual, symbol}]}. */
export function parseFinnhubWindow(text: string): { data: WindowReport[] } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'Finnhub returned a page that is not JSON.' };
  if (typeof j?.error === 'string') return { error: j.error.slice(0, 200) };
  const rows: any[] = Array.isArray(j?.earningsCalendar) ? j.earningsCalendar : [];
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

export interface CalendarFigure {
  est: number;
  actual: number;
  estFrom?: CalendarSource;
  actualFrom?: CalendarSource;
  analysts?: number;
}

export interface CalendarReport {
  symbol: string;
  name: string;
  date: string;
  timing: CalendarTiming;
  /** US dollars; NaN when no source gives it. */
  marketCap: number;
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

export interface CalendarInput {
  nasdaq: NasdaqReport[];
  finnhub?: WindowReport[];
  fmp?: WindowReport[];
  listings?: Map<string, Listing>;
  /** Nasdaq's reports of the year-earlier and quarter-earlier windows, and FMP's of the same windows. */
  nasdaqHistory?: NasdaqReport[];
  fmpHistory?: WindowReport[];
}

/** The figure from the first source that gives both numbers, else each number from the first source that has it. */
function figure(options: { from: CalendarSource; est: number; actual: number; analysts?: number }[]): CalendarFigure {
  const both = options.find((o) => ok(o.est) && ok(o.actual));
  if (both) return { est: both.est, actual: both.actual, estFrom: both.from, actualFrom: both.from, ...(ok(both.analysts) ? { analysts: both.analysts } : {}) };
  const e = options.find((o) => ok(o.est));
  const a = options.find((o) => ok(o.actual));
  return { est: e?.est ?? NaN, actual: a?.actual ?? NaN, ...(e ? { estFrom: e.from } : {}), ...(a ? { actualFrom: a.from } : {}), ...(e && ok(e.analysts) ? { analysts: e.analysts } : {}) };
}

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
    const eps = figure([
      ...(n ? [{ from: 'Nasdaq' as const, est: n.epsEst, actual: n.epsActual, analysts: n.analysts }] : []),
      ...(f ? [{ from: 'Finnhub' as const, est: f.epsEst, actual: f.epsActual }] : []),
      ...(p ? [{ from: 'FMP' as const, est: p.epsEst, actual: p.epsActual }] : []),
    ]);
    // FMP's revenue first: its earlier calendars give the same figure a year and a quarter before.
    const rev = figure([...(p ? [{ from: 'FMP' as const, est: p.revEst, actual: p.revActual }] : []), ...(f ? [{ from: 'Finnhub' as const, est: f.revEst, actual: f.revActual }] : [])]);
    const fiscalEnd = n?.fiscalEnd ?? '';
    // Year-earlier and quarter-earlier figures from the same source as this report's.
    const earlierNasdaq = (months: number, lo: number, hi: number) => {
      const rows = nh.get(symbol) ?? [];
      const byQuarter = fiscalEnd ? rows.find((r) => r.fiscalEnd === shiftMonth(fiscalEnd, -months) && ok(r.epsActual)) : undefined;
      const byDate = rows.find((r) => ok(r.epsActual) && ms(date) - ms(r.date) >= lo * DAY_MS && ms(date) - ms(r.date) <= hi * DAY_MS);
      return (byQuarter ?? byDate)?.epsActual ?? NaN;
    };
    const earlierFmp = (lo: number, hi: number) => (ph.get(symbol) ?? []).find((r) => ok(r.revActual) && ms(date) - ms(r.date) >= lo * DAY_MS && ms(date) - ms(r.date) <= hi * DAY_MS)?.revActual ?? NaN;
    const reported = ok(eps.actual);
    // A reported EPS against the year-earlier report on Nasdaq's calendar; a coming report's estimate against the
    // year-earlier EPS on its own line.
    const epsYearAgo = reported ? (eps.actualFrom === 'Nasdaq' ? earlierNasdaq(12, 330, 400) : NaN) : eps.estFrom === 'Nasdaq' && n ? n.yearAgoEps : NaN;
    return {
      symbol,
      name: n?.name || listing?.name || symbol,
      date,
      timing: n && n.timing !== '--' ? n.timing : f?.timing ?? n?.timing ?? '--',
      marketCap: ok(n?.marketCap) ? n!.marketCap : listing?.cap ?? NaN,
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
}

export const earningsCalendar = createStore<{
  v: number;
  days: Record<string, Part<NasdaqReport[]>>;
  windows: Record<string, Part<WindowReport[]>>;
  listings?: Part<Map<string, Listing>>;
  companies: Record<string, Part<WindowReport[]>>;
}>({ v: 0, days: {}, windows: {}, companies: {} });

/** The reports of long-past days, kept across starts: they do not change, and growth needs a year of them. */
type SettledRow = Pick<NasdaqReport, 'symbol' | 'fiscalEnd' | 'epsEst' | 'epsActual'>;
const settled = createStore<{ by: Record<string, { at: number; rows: SettledRow[] }> }>({ by: {} }, 'earnings-days', 1);
const SETTLED_AFTER = 20 * DAY_MS;
const KEEP_DAYS = 400;

function keepSettled(date: string, rows: NasdaqReport[]) {
  if (ms(date) > Date.now() - SETTLED_AFTER) return;
  settled.set((s) => {
    const by = { ...s.by, [date]: { at: Date.now(), rows: rows.map((r) => ({ symbol: r.symbol, fiscalEnd: r.fiscalEnd, epsEst: r.epsEst, epsActual: r.epsActual })) } };
    const days = Object.keys(by).sort();
    for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete by[d];
    return { by };
  });
}

/** A settled day kept from an earlier start, as Nasdaq's lines (the fields growth uses). */
function settledDay(date: string): NasdaqReport[] | undefined {
  const k = settled.get().by[date];
  return k ? k.rows.map((r) => ({ ...r, name: '', date, timing: '--', marketCap: NaN, analysts: NaN, yearAgoEps: NaN })) : undefined;
}

export function calendarAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.earningsCalendar === 'function';
}

function answerPart<T>(res: KeyedAnswer, source: CalendarSource, parse: (text: string) => { data: T } | { error: string }): Part<T> {
  if (res.gated) return { state: 'off', message: `${source} is switched off (${res.gated} on PROVIDERS).` };
  if (res.missing || res.refused) return { state: 'needs-key', message: res.refused ? `The configured ${source} key has the wrong format.` : `Needs ${source === 'FMP' ? 'FMP_API_KEY' : 'FINNHUB_API_KEY'} (PROVIDERS).` };
  if (!res.text) return { state: res.budget ? 'budget' : 'error', message: res.budget ? `Today's ${source} allowance in this app is spent.` : `${source}: ${res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer')}` };
  const parsed = parse(res.text);
  return 'error' in parsed ? { state: 'error', message: `${source}: ${parsed.error}`, at: res.at } : { state: 'ok', data: parsed.data, at: res.at };
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
  // A long-past day read on an earlier start is not asked again.
  const kept = ms(date) < now - SETTLED_AFTER ? settledDay(date) : undefined;
  if (kept) {
    asked.set(key, Date.now());
    if (earningsCalendar.get().days[date]?.state !== 'ok') bump((s) => ({ days: { ...s.days, [date]: { state: 'ok', data: kept, at: settled.get().by[date].at } } }));
    return;
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
      if (part.state !== 'ok') asked.delete(key);
      else keepSettled(date, part.data ?? []);
      const kept = earningsCalendar.get().days[date];
      bump((s) => ({ days: { ...s.days, [date]: part.state === 'ok' || !kept?.data ? part : { ...kept, message: part.message } } }));
    },
  });
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
  bump((s) => ({ windows: { ...s.windows, [key]: part.state === 'ok' || !kept?.data ? part : { ...kept, message: part.message } } }));
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
 * a week.
 */
export function historyDays(from: string, to: string, today: string): string[] {
  const last = to < today ? to : today;
  if (last < from) return [];
  const reported = daysBetween(from, last);
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
      for (const d of daysBetween(from, to).sort((a, b) => Math.abs(ms(a) - now) - Math.abs(ms(b) - now))) askDay(d, now);
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
    const reports = mergeCalendar({
      nasdaq: rows(dayParts),
      finnhub: rows(finnhub),
      fmp: rows(fmp),
      listings: s.listings?.data,
      nasdaqHistory: history ? rows(historyDays(from, to, isoDay(Date.now())).map((d) => s.days[d])) : [],
      fmpHistory: rows(hist.flatMap(([a, b]) => windows('fmp', a, b))),
    });
    const answered = (parts: (Part<unknown> | undefined)[]) => parts.length > 0 && parts.every((p) => p?.state === 'ok');
    const problems = [...new Set([...dayParts, ...finnhub, ...fmp, s.listings].filter((p) => p && p.state !== 'ok' && p.state !== 'loading' && p.message).map((p) => p!.message!))];
    return {
      reports,
      days: dayParts.length,
      loading: dayParts.filter((p) => !p || p.state === 'loading').length,
      revenueFrom: [...(answered(finnhub) ? ['Finnhub' as const] : []), ...(answered(fmp) ? ['FMP' as const] : [])],
      problems,
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
    bump((s) => ({ companies: { ...s.companies, [symbol]: part.state === 'ok' || !kept?.data ? part : kept } }));
  })();
}

/**
 * Everything the calendars hold for one company: FMP's reports (its history, then any calendar window) and
 * Finnhub's market calendar lines in the shape of its per-company history.
 */
export function companyReports(symbol: string | null): { fmp: WindowReport[]; finnhub: PastReport[] } {
  if (!symbol) return { fmp: [], finnhub: [] };
  const s = earningsCalendar.get();
  const key = tickerKey(symbol);
  const fromWindows = (source: string) => Object.entries(s.windows).filter(([k]) => k.startsWith(`${source}:`)).flatMap(([, p]) => (p.data ?? []).filter((r) => r.symbol === key));
  const fmp = [...(s.companies[symbol]?.data ?? [])];
  for (const r of fromWindows('fmp')) if (!fmp.some((x) => x.date === r.date)) fmp.push(r);
  const finnhub = fromWindows('finnhub')
    .filter((r) => ok(r.epsActual) || ok(r.revActual))
    .map((r) => {
      const m = /^Q([1-4]) (\d{4})$/.exec(r.label ?? '');
      return { date: r.date, hour: r.timing === 'Bef-mkt' ? 'bmo' : r.timing === 'Aft-mkt' ? 'amc' : r.timing === 'During-mkt' ? 'dmh' : '', quarter: m ? Number(m[1]) : NaN, year: m ? Number(m[2]) : NaN, epsEstimate: r.epsEst, epsActual: r.epsActual, revenueEstimate: r.revEst, revenueActual: r.revActual };
    });
  return { fmp: fmp.sort((a, b) => b.date.localeCompare(a.date)), finnhub };
}
