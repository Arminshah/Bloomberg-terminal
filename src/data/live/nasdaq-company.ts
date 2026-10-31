// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * One US-listed company's figures from nasdaq.com's quote and company pages, asked by the desktop app's main process
 * without a key (electron/nasdaq.cjs): market value, sector and industry, the dividend and its dates, short interest,
 * institutional ownership, the analysts' price target and ratings, the consensus EPS of the coming quarters and years,
 * and the next report date. They fill what Yahoo leaves empty, above all when Yahoo refuses its session; Yahoo's own
 * figures are never replaced. Nasdaq writes dates US style (MM/DD/YYYY) and amounts as text ("$1.08", "4,968,807").
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export type NasdaqKind = 'summary' | 'dividends' | 'short-interest' | 'holdings' | 'target' | 'ratings' | 'forecast' | 'earnings-date' | 'profile';

export interface NasdaqSummary {
  marketCap: number;
  sector?: string;
  industry?: string;
  exchange?: string;
  /** The one-year price target on the quote page. */
  target1y: number;
  annualDividend: number;
  /** Ex-dividend and payment dates of the latest declared dividend (ms, NaN when not given). */
  exDividend: number;
  payDate: number;
  /** Dividend yield in percent. */
  yieldPct: number;
  avgVolume: number;
}

export interface NasdaqDividend {
  ex: number;
  declared: number;
  record: number;
  pay: number;
  /** As Nasdaq gives it: the amount paid at the time, not adjusted for later splits. */
  amount: number;
  type: string;
  currency?: string;
}

export interface NasdaqShort {
  /** Settlement date (ms). */
  date: number;
  shares: number;
  avgVolume: number;
  daysToCover: number;
}

export interface NasdaqHolder {
  name: string;
  /** The date of the holder's latest filing (ms). */
  date: number;
  shares: number;
  change: number;
  /** Change in percent of the earlier holding. */
  changePct: number;
  /** Value in dollars. */
  value: number;
}

export interface NasdaqHoldings {
  /** Share of the company held by institutions, in percent. */
  institutionalPct: number;
  sharesOutstanding: number;
  holders: number;
  top: NasdaqHolder[];
}

export interface NasdaqTarget {
  mean: number;
  low: number;
  high: number;
  buy: number;
  hold: number;
  sell: number;
}

export interface NasdaqRatings {
  /** Nasdaq's word for the analysts' mean rating (Buy, Hold, ...). */
  mean: string;
  analysts: number;
}

export interface NasdaqForecastRow {
  /** Last day of the fiscal period's final month, YYYY-MM-DD. */
  end: string;
  est: number;
  high: number;
  low: number;
  analysts: number;
}

export interface NasdaqForecast {
  quarterly: NasdaqForecastRow[];
  yearly: NasdaqForecastRow[];
}

export interface NasdaqNextReport {
  /** Report date (ms, midnight UTC). */
  date: number;
  timing: 'Bef-mkt' | 'Aft-mkt' | '--';
  /** Nasdaq marks the date as expected (not confirmed by the company). */
  estimated: boolean;
  /** Last day of the fiscal quarter reported, YYYY-MM-DD, when the text names it. */
  end?: string;
}

export interface NasdaqProfile {
  description?: string;
  url?: string;
  sector?: string;
  industry?: string;
}

type Parsed<T> = { data: T | null } | { error: string };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "$4,968,807.20", "76.59%", "3.03", 3.03 → number; "N/A", "", "--" → NaN. */
export function nasdaqNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const t = v.replace(/[$,%\s]/g, '').replace(/\(m\)$/i, '');
  return /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
}

/** "08/10/2026" or "Aug 10, 2026" → midnight UTC (ms); anything else → NaN. */
export function nasdaqDate(v: unknown): number {
  if (typeof v !== 'string') return NaN;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  const named = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(v.trim());
  const [y, m, d] = us ? [Number(us[3]), Number(us[1]), Number(us[2])] : named ? [Number(named[3]), MONTHS.indexOf(named[1].toLowerCase()) + 1, Number(named[2])] : [NaN, NaN, NaN];
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return NaN;
  const t = Date.UTC(y, m - 1, d);
  return new Date(t).getUTCDate() === d ? t : NaN;
}

/** "Sep 2026" → "2026-09-30" (the month's last day); else ''. */
export function monthEnd(label: unknown): string {
  const m = /^([A-Za-z]{3})[a-z]* (\d{4})$/.exec(String(label ?? '').trim());
  const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return m && i >= 0 ? new Date(Date.UTC(Number(m[2]), i + 1, 0)).toISOString().slice(0, 10) : '';
}

const value = (o: Json) => (o && typeof o === 'object' && 'value' in o ? o.value : o);
const text = (v: unknown) => (typeof v === 'string' && v.trim() && !/^(?:N\/A|NA|--)$/i.test(v.trim()) ? v.trim() : undefined);

/** Nasdaq's envelope: {data, status: {rCode, bCodeMessage}}; no record is an empty answer, not an error. */
function envelope(t: string): { data: Json } | { error: string } {
  let j: Json;
  try {
    j = JSON.parse(t);
  } catch {
    return { error: 'Nasdaq returned a page that is not JSON.' };
  }
  const code = j?.status?.rCode;
  if (code !== undefined && code !== 200) return { error: `Nasdaq refused the request (${String(j?.status?.bCodeMessage?.[0]?.errorMessage ?? code).slice(0, 120)}).` };
  return { data: j?.data ?? null };
}

export function parseNasdaqSummary(t: string): Parsed<NasdaqSummary> {
  const e = envelope(t);
  if ('error' in e) return e;
  const s = e.data?.summaryData;
  if (!s || typeof s !== 'object') return { data: null };
  const f = (k: string) => value(s[k]);
  const out: NasdaqSummary = {
    marketCap: nasdaqNumber(f('MarketCap')),
    sector: text(f('Sector')),
    industry: text(f('Industry')),
    exchange: text(f('Exchange')),
    target1y: nasdaqNumber(f('OneYrTarget')),
    annualDividend: nasdaqNumber(f('AnnualizedDividend')),
    exDividend: nasdaqDate(f('ExDividendDate')),
    payDate: nasdaqDate(f('DividendPaymentDate')),
    yieldPct: nasdaqNumber(f('Yield')),
    avgVolume: nasdaqNumber(f('AverageVolume')),
  };
  return { data: out };
}

export function parseNasdaqDividends(t: string): Parsed<NasdaqDividend[]> {
  const e = envelope(t);
  if ('error' in e) return e;
  const rows: Json[] = Array.isArray(e.data?.dividends?.rows) ? e.data.dividends.rows : [];
  const out = rows
    .map((r) => ({ ex: nasdaqDate(r?.exOrEffDate), declared: nasdaqDate(r?.declarationDate), record: nasdaqDate(r?.recordDate), pay: nasdaqDate(r?.paymentDate), amount: nasdaqNumber(r?.amount), type: text(r?.type) ?? 'Cash', currency: text(r?.currency) }))
    .filter((r) => Number.isFinite(r.ex))
    .sort((a, b) => b.ex - a.ex);
  return { data: out };
}

export function parseNasdaqShort(t: string): Parsed<NasdaqShort[]> {
  const e = envelope(t);
  if ('error' in e) return e;
  const rows: Json[] = Array.isArray(e.data?.shortInterestTable?.rows) ? e.data.shortInterestTable.rows : [];
  const out = rows
    .map((r) => ({ date: nasdaqDate(r?.settlementDate), shares: nasdaqNumber(r?.interest), avgVolume: nasdaqNumber(r?.avgDailyShareVolume), daysToCover: nasdaqNumber(r?.daysToCover) }))
    .filter((r) => Number.isFinite(r.date) && r.shares > 0)
    .sort((a, b) => b.date - a.date);
  // Nasdaq answers "not available" for stocks listed elsewhere: no data, not an empty record.
  return { data: out.length ? out : null };
}

export function parseNasdaqHoldings(t: string): Parsed<NasdaqHoldings> {
  const e = envelope(t);
  if ('error' in e) return e;
  const d = e.data;
  if (!d || typeof d !== 'object') return { data: null };
  const sum = d.ownershipSummary ?? {};
  const total = (Array.isArray(d.activePositions?.rows) ? d.activePositions.rows : []).find((r: Json) => /total institutional/i.test(String(r?.positions ?? '')));
  const rows: Json[] = Array.isArray(d.holdingsTransactions?.table?.rows) ? d.holdingsTransactions.table.rows : [];
  const out: NasdaqHoldings = {
    institutionalPct: nasdaqNumber(value(sum.SharesOutstandingPCT)),
    // "Total Shares Outstanding (millions)".
    sharesOutstanding: nasdaqNumber(value(sum.ShareoutstandingTotal)) * 1e6,
    holders: nasdaqNumber(total?.holders),
    top: rows
      .map((r) => ({ name: text(r?.ownerName) ?? '', date: nasdaqDate(r?.date), shares: nasdaqNumber(r?.sharesHeld), change: nasdaqNumber(r?.sharesChange), changePct: nasdaqNumber(r?.sharesChangePCT), value: nasdaqNumber(r?.marketValue) * 1000 }))
      .filter((r) => r.name && r.shares > 0),
  };
  return { data: Number.isFinite(out.institutionalPct) || out.top.length ? out : null };
}

export function parseNasdaqTarget(t: string): Parsed<NasdaqTarget> {
  const e = envelope(t);
  if ('error' in e) return e;
  const c = e.data?.consensusOverview;
  if (!c) return { data: null };
  const out = { mean: nasdaqNumber(c.priceTarget), low: nasdaqNumber(c.lowPriceTarget), high: nasdaqNumber(c.highPriceTarget), buy: nasdaqNumber(c.buy), hold: nasdaqNumber(c.hold), sell: nasdaqNumber(c.sell) };
  return { data: out.mean > 0 || out.buy + out.hold + out.sell > 0 ? out : null };
}

export function parseNasdaqRatings(t: string): Parsed<NasdaqRatings> {
  const e = envelope(t);
  if ('error' in e) return e;
  const mean = text(e.data?.meanRatingType);
  if (!mean) return { data: null };
  const n = /based on (\d+) analysts/i.exec(String(e.data?.ratingsSummary ?? ''));
  return { data: { mean, analysts: n ? Number(n[1]) : NaN } };
}

export function parseNasdaqForecast(t: string): Parsed<NasdaqForecast> {
  const e = envelope(t);
  if ('error' in e) return e;
  const rows = (x: Json): NasdaqForecastRow[] =>
    (Array.isArray(x?.rows) ? x.rows : [])
      .map((r: Json) => ({ end: monthEnd(r?.fiscalEnd), est: nasdaqNumber(r?.consensusEPSForecast), high: nasdaqNumber(r?.highEPSForecast), low: nasdaqNumber(r?.lowEPSForecast), analysts: nasdaqNumber(r?.noOfEstimates) }))
      .filter((r: NasdaqForecastRow) => r.end && Number.isFinite(r.est))
      .sort((a: NasdaqForecastRow, b: NasdaqForecastRow) => a.end.localeCompare(b.end));
  const out = { quarterly: rows(e.data?.quarterlyForecast), yearly: rows(e.data?.yearlyForecast) };
  return { data: out.quarterly.length || out.yearly.length ? out : null };
}

/** "... is expected* to report earnings on 11/02/2026 after market close. The report will be for the fiscal Quarter ending Sep 2026." */
export function parseNasdaqEarningsDate(t: string): Parsed<NasdaqNextReport> {
  const e = envelope(t);
  if ('error' in e) return e;
  const said = String(e.data?.reportText ?? '').replace(/\s+/g, ' ');
  const m = /(expected(\*)?|scheduled) to report earnings on (\d{1,2}\/\d{1,2}\/\d{4})(?: (before market open|after market close))?/i.exec(said);
  if (!m) return { data: null };
  const date = nasdaqDate(m[3]);
  if (!Number.isFinite(date)) return { data: null };
  const q = /fiscal quarter ending ([A-Za-z]{3} \d{4})/i.exec(said);
  const when = (m[4] ?? '').toLowerCase();
  return { data: { date, timing: when.startsWith('before') ? 'Bef-mkt' : when.startsWith('after') ? 'Aft-mkt' : '--', estimated: !!m[2] || /^expected/i.test(m[1]), ...(q && monthEnd(q[1]) ? { end: monthEnd(q[1]) } : {}) } };
}

export function parseNasdaqProfile(t: string): Parsed<NasdaqProfile> {
  const e = envelope(t);
  if ('error' in e) return e;
  const d = e.data;
  const description = text(value(d?.CompanyDescription));
  const url = text(value(d?.CompanyUrl));
  return { data: description ? { description, sector: text(value(d?.Sector)), industry: text(value(d?.Industry)), ...(url && /^https?:\/\//i.test(url) ? { url } : {}) } : null };
}

/** FINRA's consolidated short interest: [{settlementDate, currentShortPositionQuantity, averageDailyVolumeQuantity, daysToCoverQuantity}]. */
export function parseFinraShort(t: string): Parsed<NasdaqShort[]> {
  let j: Json;
  try {
    j = JSON.parse(t);
  } catch {
    return { error: 'FINRA returned a page that is not JSON.' };
  }
  if (!Array.isArray(j)) return { error: String(j?.message ?? 'FINRA returned no list.').slice(0, 200) };
  const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : NaN);
  const out = j
    .map((r: Json) => ({ date: iso(r?.settlementDate), shares: nasdaqNumber(r?.currentShortPositionQuantity), avgVolume: nasdaqNumber(r?.averageDailyVolumeQuantity), daysToCover: nasdaqNumber(r?.daysToCoverQuantity) }))
    .filter((r: NasdaqShort) => Number.isFinite(r.date) && r.shares > 0)
    .sort((a: NasdaqShort, b: NasdaqShort) => b.date - a.date);
  return { data: out.length ? out : null };
}

/** Short interest from FINRA, for a stock Nasdaq's page does not cover (one listed elsewhere). */
export async function loadFinraShort(symbol: string): Promise<NasdaqShort[] | null> {
  if (typeof window === 'undefined' || typeof window.arminDesktop?.finra !== 'function') return null;
  try {
    const res = await window.arminDesktop.finra('short-interest', symbol);
    if (!res.text) return null;
    const parsed = parseFinraShort(res.text);
    return 'error' in parsed ? null : parsed.data;
  } catch {
    return null;
  }
}

const PARSE: Record<NasdaqKind, (t: string) => Parsed<unknown>> = {
  summary: parseNasdaqSummary,
  dividends: parseNasdaqDividends,
  'short-interest': parseNasdaqShort,
  holdings: parseNasdaqHoldings,
  target: parseNasdaqTarget,
  ratings: parseNasdaqRatings,
  forecast: parseNasdaqForecast,
  'earnings-date': parseNasdaqEarningsDate,
  profile: parseNasdaqProfile,
};

// ------------------------------------------------------------------ loading

export interface NasdaqPart<T = unknown> {
  state: 'loading' | 'ok' | 'error';
  data?: T | null;
  message?: string;
  at?: number;
  /** An earlier answer kept because the latest request failed. */
  stale?: boolean;
}

export const nasdaqData = createStore<{ v: number; by: Record<string, Partial<Record<NasdaqKind, NasdaqPart>>> }>({ v: 0, by: {} });

export function nasdaqAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.nasdaq === 'function';
}

/** Nasdaq's ticker for a US-listed stock (BRK.B), or null. */
export function nasdaqSymbol(def: SecurityDef | undefined): string | null {
  const t = secTicker(def);
  return t ? t.replace(/-/g, '.') : null;
}

const inflight = new Map<string, Promise<NasdaqPart>>();
const REASK_MS = 30 * 60_000;
const RETRY_MS = 5 * 60_000;

/** A kind of company data, from what arrived recently or asked for now; resolves with the part. */
export function loadNasdaq<T = unknown>(symbol: string, kind: NasdaqKind): Promise<NasdaqPart<T>> {
  const have = nasdaqData.get().by[symbol]?.[kind];
  const age = Date.now() - (have?.at ?? 0);
  if (have && have.state !== 'loading' && age < (have.state === 'ok' ? REASK_MS : RETRY_MS)) return Promise.resolve(have as NasdaqPart<T>);
  const key = `${symbol}:${kind}`;
  if (inflight.has(key)) return inflight.get(key) as Promise<NasdaqPart<T>>;
  const put = (p: NasdaqPart) => nasdaqData.set((s) => ({ v: s.v + 1, by: { ...s.by, [symbol]: { ...s.by[symbol], [kind]: p } } }));
  if (!have) put({ state: 'loading' });
  const run = (async (): Promise<NasdaqPart> => {
    let part: NasdaqPart;
    try {
      const res = await window.arminDesktop!.nasdaq!(kind, symbol);
      if (!res.text) part = { state: 'error', message: res.error ?? (res.status ? `Nasdaq answered HTTP ${res.status}.` : 'Nasdaq did not answer.'), at: Date.now() };
      else {
        const parsed = PARSE[kind](res.text);
        part = 'error' in parsed ? { state: 'error', message: parsed.error, at: Date.now() } : { state: 'ok', data: parsed.data, at: res.at ?? Date.now(), ...(res.stale ? { stale: true } : {}) };
      }
    } catch {
      part = { state: 'error', message: 'The Nasdaq request could not be completed.', at: Date.now() };
    }
    // A failed refresh keeps the earlier answer.
    if (part.state === 'error' && have?.state === 'ok') part = { ...have, at: Date.now() - REASK_MS + RETRY_MS };
    put(part);
    return part;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run as Promise<NasdaqPart<T>>;
}

/** The data of a part that arrived (null when Nasdaq has none or it has not arrived). */
export function nasdaqPart<T>(symbol: string | null, kind: NasdaqKind): T | null {
  const p = symbol ? nasdaqData.get().by[symbol]?.[kind] : undefined;
  return p?.state === 'ok' ? ((p.data as T) ?? null) : null;
}

/** Asks for some kinds of a stock's Nasdaq data while a screen shows it; re-renders as they arrive (a new object each time). */
export function useNasdaq(def: SecurityDef | undefined, kinds: NasdaqKind[]): Partial<Record<NasdaqKind, NasdaqPart>> | undefined {
  const symbol = nasdaqSymbol(def);
  const v = nasdaqData.use((s) => (symbol ? s.by[symbol] : undefined));
  const want = kinds.join(',');
  useEffect(() => {
    if (!symbol || !nasdaqAvailable()) return;
    for (const k of want.split(',') as NasdaqKind[]) void loadNasdaq(symbol, k);
  }, [symbol, want]);
  return v;
}

// ------------------------------------------------- Yahoo-shaped company summary

/** Nasdaq's figures in the shape of Yahoo's quoteSummary result, for the fields the app reads from it. */
export function nasdaqSummaryPatch(p: { summary?: NasdaqSummary | null; short?: NasdaqShort[] | null; holdings?: NasdaqHoldings | null; profile?: NasdaqProfile | null }): Json {
  const s = p.summary;
  const h = p.holdings;
  const last = p.short?.[0];
  // The settlement about a month before the latest one (Nasdaq lists two a month).
  const prior = last ? p.short!.find((r) => last.date - r.date >= 25 * 86_400_000 && last.date - r.date <= 40 * 86_400_000) : undefined;
  const pos = (v: number | undefined) => (v != null && Number.isFinite(v) && v > 0 ? v : undefined);
  const sec = (ms: number | undefined) => (ms != null && Number.isFinite(ms) ? Math.round(ms / 1000) : undefined);
  const out: Json = {
    summaryDetail: { marketCap: pos(s?.marketCap), dividendRate: s && Number.isFinite(s.annualDividend) ? s.annualDividend : undefined, dividendYield: s && Number.isFinite(s.yieldPct) ? s.yieldPct / 100 : undefined, averageVolume: pos(s?.avgVolume) },
    price: { marketCap: pos(s?.marketCap) },
    defaultKeyStatistics: {
      sharesOutstanding: pos(h?.sharesOutstanding),
      sharesShort: pos(last?.shares),
      shortRatio: pos(last?.daysToCover),
      dateShortInterest: sec(last?.date),
      sharesShortPriorMonth: pos(prior?.shares),
      sharesShortPreviousMonthDate: sec(prior?.date),
    },
    assetProfile: { industry: s?.industry ?? p.profile?.industry, sector: s?.sector ?? p.profile?.sector, longBusinessSummary: p.profile?.description, website: p.profile?.url },
    calendarEvents: { exDividendDate: sec(s?.exDividend), dividendDate: sec(s?.payDate) },
  };
  if (h) {
    out.majorHoldersBreakdown = { institutionsPercentHeld: Number.isFinite(h.institutionalPct) ? h.institutionalPct / 100 : undefined, institutionsCount: pos(h.holders) };
    const shares = h.sharesOutstanding;
    out.institutionOwnership = {
      ownershipList: h.top.map((x) => ({
        organization: x.name,
        position: x.shares,
        pctHeld: shares > 0 ? x.shares / shares : undefined,
        pctChange: Number.isFinite(x.changePct) ? x.changePct / 100 : undefined,
        reportDate: sec(x.date),
        value: pos(x.value),
      })),
    };
  }
  return out;
}

/**
 * Yahoo's summary without its short interest when FINRA's latest settlement (Nasdaq's page or FINRA's own) is newer:
 * Yahoo's lags a settlement or more (Apple on 28 October 2026: 120.76M at 30 September against 131.59M at 15 October),
 * and the profile then disagreed with the short interest page. Its ratio to the float goes with it, worked out again
 * from the newer count. Returns the summary unchanged otherwise.
 */
export function preferNewerShort(summary: Json, short: NasdaqShort[] | null | undefined): Json {
  const r0 = summary?.quoteSummary?.result?.[0];
  const ks = r0?.defaultKeyStatistics;
  const last = short?.[0];
  if (!r0 || !ks || !last || !Number.isFinite(last.date)) return summary;
  const raw = (v: Json) => (typeof v === 'object' && v !== null ? v.raw : v);
  const theirs = Number(raw(ks.dateShortInterest)) * 1000;
  if (Number.isFinite(theirs) && theirs > 0 && theirs >= last.date) return summary;
  const keep = { ...ks };
  for (const k of ['sharesShort', 'shortRatio', 'dateShortInterest', 'sharesShortPriorMonth', 'sharesShortPreviousMonthDate', 'shortPercentOfFloat', 'sharesPercentSharesOut']) delete keep[k];
  return { ...summary, quoteSummary: { ...summary.quoteSummary, result: [{ ...r0, defaultKeyStatistics: keep }, ...summary.quoteSummary.result.slice(1)] } };
}

const missing = (v: unknown): boolean =>
  v == null ||
  (typeof v === 'number' && !Number.isFinite(v)) ||
  (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && (Object.keys(v as object).length === 0 || ('raw' in (v as object) && missing((v as { raw: unknown }).raw))));

/**
 * Yahoo's summary with the gaps filled from `patch` (same shape): a field Yahoo gives is kept, one it leaves out,
 * empty or not a number takes the patch's value. Returns a new object; neither input changes. Also returns the
 * top-level sections that took at least one value.
 */
export function fillSummary(summary: Json, patch: Json): { summary: Json; filled: string[] } {
  const base = summary?.quoteSummary?.result?.[0] ?? {};
  const filled = new Set<string>();
  const merge = (a: Json, b: Json, section: string): Json => {
    if (b == null) return a;
    if (missing(a)) {
      if (!missing(b) && !(typeof b === 'object' && !Array.isArray(b) && Object.values(b).every(missing))) filled.add(section);
      return b;
    }
    if (typeof a !== 'object' || Array.isArray(a) || 'raw' in a || typeof b !== 'object' || Array.isArray(b)) return a;
    const out: Json = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v, section);
    return out;
  };
  const result: Json = { ...base };
  for (const [section, v] of Object.entries(patch ?? {})) result[section] = merge(base[section], v, section);
  return { summary: { ...(summary ?? {}), quoteSummary: { ...(summary?.quoteSummary ?? {}), result: [result] } }, filled: [...filled] };
}
