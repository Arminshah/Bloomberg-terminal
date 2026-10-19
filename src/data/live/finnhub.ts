import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * Company data from Finnhub's free plan, asked by the desktop app's main process with the owner's key
 * (electron/finnhub.cjs), for US-listed stocks: the profile, key ratios, analysts' recommendation counts by
 * month, the last four quarters' EPS against the estimate, and the next report with its estimates.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FinnhubKind = 'profile' | 'metric' | 'recommendation' | 'earnings' | 'calendar' | 'history' | 'peers';

export interface FinnhubProfile {
  name: string;
  industry: string;
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  website: string;
  /** Millions of shares, as Finnhub gives it. */
  sharesOutstanding: number;
  /** Millions of the trading currency. */
  marketCap: number;
}

/** Ratios from "basic financials". Percentages are in percent (25 means 25%), as Finnhub gives them. */
export interface FinnhubMetric {
  pe: number;
  pb: number;
  ps: number;
  beta: number;
  roe: number;
  roa: number;
  grossMargin: number;
  opMargin: number;
  netMargin: number;
  debtToEquity: number;
  revGrowth: number;
  epsGrowth: number;
  payout: number;
  dividendYield: number;
  high52: number;
  low52: number;
}

export interface RecommendationMonth {
  /** YYYY-MM-DD, the month the counts are for. */
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface EpsSurprise {
  /** Fiscal quarter end, YYYY-MM-DD. */
  period: string;
  quarter: number;
  year: number;
  actual: number;
  estimate: number;
  surprise: number;
  surprisePct: number;
}

export interface NextReport {
  date: string;
  /** bmo (before the open), amc (after the close), dmh (during market hours) or empty. */
  hour: string;
  quarter: number;
  year: number;
  epsEstimate: number;
  revenueEstimate: number;
}

type Parsed<T> = { data: T } | { error: string };
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

function json(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
const refusal = (j: any) => (j && typeof j === 'object' && typeof j.error === 'string' ? j.error.slice(0, 200) : null);

/** /stock/profile2: {country, currency, exchange, finnhubIndustry, ipo, marketCapitalization, name, shareOutstanding, weburl, ...}; {} for an unknown ticker. */
export function parseProfile(text: string): Parsed<FinnhubProfile | null> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (refusal(j)) return { error: refusal(j)! };
  if (!j?.name) return { data: null };
  return {
    data: {
      name: String(j.name),
      industry: String(j.finnhubIndustry ?? ''),
      country: String(j.country ?? ''),
      currency: String(j.currency ?? ''),
      exchange: String(j.exchange ?? ''),
      ipo: String(j.ipo ?? ''),
      website: String(j.weburl ?? ''),
      sharesOutstanding: num(j.shareOutstanding),
      marketCap: num(j.marketCapitalization),
    },
  };
}

/** /stock/metric?metric=all: {metric: {...}, series: {...}}. The first field present wins where Finnhub has variants. */
export function parseMetric(text: string): Parsed<FinnhubMetric | null> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (refusal(j)) return { error: refusal(j)! };
  const m = j?.metric;
  if (!m || typeof m !== 'object' || !Object.keys(m).length) return { data: null };
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = num(m[k]);
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  };
  return {
    data: {
      pe: pick('peTTM', 'peBasicExclExtraTTM', 'peExclExtraTTM'),
      pb: pick('pbQuarterly', 'pbAnnual'),
      ps: pick('psTTM', 'psAnnual'),
      beta: pick('beta'),
      roe: pick('roeTTM', 'roeRfy'),
      roa: pick('roaTTM', 'roaRfy'),
      grossMargin: pick('grossMarginTTM', 'grossMarginAnnual'),
      opMargin: pick('operatingMarginTTM', 'operatingMarginAnnual'),
      netMargin: pick('netProfitMarginTTM', 'netProfitMarginAnnual'),
      debtToEquity: pick('totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual'),
      revGrowth: pick('revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy'),
      epsGrowth: pick('epsGrowthTTMYoy', 'epsGrowthQuarterlyYoy'),
      payout: pick('payoutRatioTTM', 'payoutRatioAnnual'),
      dividendYield: pick('currentDividendYieldTTM', 'dividendYieldIndicatedAnnual'),
      high52: pick('52WeekHigh'),
      low52: pick('52WeekLow'),
    },
  };
}

/** /stock/recommendation: [{period, strongBuy, buy, hold, sell, strongSell, symbol}], newest first after sorting. */
export function parseRecommendation(text: string, symbol?: string): Parsed<RecommendationMonth[]> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (!Array.isArray(j)) return { error: refusal(j) ?? 'No list in the answer' };
  const rows = j
    .filter((r: any) => !symbol || String(r?.symbol).replace(/-/g, '.') === symbol.replace(/-/g, '.'))
    .map((r: any) => ({ period: String(r?.period ?? '').slice(0, 10), strongBuy: num(r?.strongBuy), buy: num(r?.buy), hold: num(r?.hold), sell: num(r?.sell), strongSell: num(r?.strongSell) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.period) && Number.isFinite(Date.parse(`${r.period}T00:00:00Z`)) && new Date(`${r.period}T00:00:00Z`).toISOString().slice(0, 10) === r.period && [r.strongBuy, r.buy, r.hold, r.sell, r.strongSell].every((n) => Number.isInteger(n) && n >= 0))
    .sort((a, b) => b.period.localeCompare(a.period));
  return { data: rows };
}

/** /stock/earnings: [{actual, estimate, period, quarter, surprise, surprisePercent, year}], newest first after sorting. */
export function parseEarnings(text: string): Parsed<EpsSurprise[]> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (!Array.isArray(j)) return { error: refusal(j) ?? 'No list in the answer' };
  const rows = j
    .map((r: any) => ({ period: String(r?.period ?? '').slice(0, 10), quarter: num(r?.quarter), year: num(r?.year), actual: num(r?.actual), estimate: num(r?.estimate), surprise: num(r?.surprise), surprisePct: num(r?.surprisePercent) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.period) && (Number.isFinite(r.actual) || Number.isFinite(r.estimate)))
    .sort((a, b) => b.period.localeCompare(a.period));
  return { data: rows };
}

/** /calendar/earnings: {earningsCalendar: [{date, hour, quarter, year, epsEstimate, revenueEstimate, ...}]}: the next report. */
export function parseCalendar(text: string, today = new Date().toISOString().slice(0, 10)): Parsed<NextReport | null> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (refusal(j)) return { error: refusal(j)! };
  const rows = (Array.isArray(j?.earningsCalendar) ? j.earningsCalendar : [])
    .map((r: any) => ({ date: String(r?.date ?? '').slice(0, 10), hour: String(r?.hour ?? ''), quarter: num(r?.quarter), year: num(r?.year), epsEstimate: num(r?.epsEstimate), revenueEstimate: num(r?.revenueEstimate) }))
    .filter((r: NextReport) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= today)
    .sort((a: NextReport, b: NextReport) => a.date.localeCompare(b.date));
  return { data: rows[0] ?? null };
}

/** A past report in Finnhub's calendar: the estimates and the reported figures (non-GAAP EPS, as Finnhub gives them). */
export interface PastReport {
  date: string;
  hour: string;
  quarter: number;
  year: number;
  epsEstimate: number;
  epsActual: number;
  revenueEstimate: number;
  revenueActual: number;
}

/** /calendar/earnings over the past months: the reports with a reported EPS or revenue, newest first. */
export function parseCalendarHistory(text: string): Parsed<PastReport[]> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (refusal(j)) return { error: refusal(j)! };
  const rows = (Array.isArray(j?.earningsCalendar) ? j.earningsCalendar : [])
    .map((r: any) => ({ date: String(r?.date ?? '').slice(0, 10), hour: String(r?.hour ?? ''), quarter: num(r?.quarter), year: num(r?.year), epsEstimate: num(r?.epsEstimate), epsActual: num(r?.epsActual), revenueEstimate: num(r?.revenueEstimate), revenueActual: num(r?.revenueActual) }))
    .filter((r: PastReport) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && (Number.isFinite(r.epsActual) || Number.isFinite(r.revenueActual)))
    .sort((a: PastReport, b: PastReport) => b.date.localeCompare(a.date));
  return { data: rows };
}

/** /stock/peers: the tickers in the same sub-industry, the company's own among them. */
export function parsePeers(text: string): Parsed<string[]> {
  const j = json(text);
  if (j === undefined) return { error: 'The answer was not JSON' };
  if (!Array.isArray(j)) return { error: refusal(j) ?? 'No list in the answer' };
  return { data: j.filter((x: unknown): x is string => typeof x === 'string' && /^[A-Z][A-Z0-9.]{0,9}$/.test(x)) };
}

const PARSE: Record<FinnhubKind, (t: string) => Parsed<unknown>> = { profile: parseProfile, metric: parseMetric, recommendation: parseRecommendation, earnings: parseEarnings, calendar: (t) => parseCalendar(t), history: parseCalendarHistory, peers: parsePeers };

export interface FinnhubPart<T = unknown> {
  state: 'loading' | 'ok' | 'error' | 'needs-key' | 'budget' | 'off';
  data?: T;
  message?: string;
  at?: number;
  stale?: boolean;
}

type ByKind = Partial<Record<FinnhubKind, FinnhubPart>>;
export const finnhubData = createStore<{ v: number; by: Record<string, ByKind>; retry: number }>({ v: 0, by: {}, retry: 0 });
const asked = new Map<string, number>();

export function finnhubAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.finnhub === 'function';
}

/** Finnhub's ticker for a security: US-listed stocks only, class shares with a dot (BRK.B). */
export function finnhubSymbol(def: SecurityDef | undefined): string | null {
  return secTicker(def)?.replace(/-/g, '.') ?? null;
}

function put(symbol: string, kind: FinnhubKind, part: FinnhubPart) {
  finnhubData.set((s) => ({ ...s, v: s.v + 1, by: { ...s.by, [symbol]: { ...s.by[symbol], [kind]: part } } }));
}

/** A replaced key must take effect immediately and invalidate in-flight old-account updates. */
export function retryFinnhub() {
  asked.clear();
  finnhubData.set((s) => ({ ...s, by: {}, retry: s.retry + 1 }));
}

/** Asks for one kind of data at most every ten minutes per company (the main process keeps answers for hours). */
export async function loadFinnhub(symbol: string, kind: FinnhubKind): Promise<FinnhubPart | undefined> {
  const key = `${symbol}:${kind}`;
  if (!finnhubAvailable()) return undefined;
  if (Date.now() - (asked.get(key) ?? 0) < 10 * 60_000) return finnhubData.get().by[symbol]?.[kind];
  asked.set(key, Date.now());
  const generation = finnhubData.get().retry;
  if (!finnhubData.get().by[symbol]?.[kind]) put(symbol, kind, { state: 'loading' });
  let part: FinnhubPart;
  try {
    const res = await window.arminDesktop!.finnhub!(kind, symbol);
    if (res.gated || res.missing || res.refused) asked.delete(key);
    if (res.gated) part = { state: 'off', message: `Finnhub is switched off (${res.gated} on PROVIDERS).` };
    else if (res.missing || res.refused) part = { state: 'needs-key', message: res.refused ? 'The configured FINNHUB_API_KEY has the wrong format.' : 'Needs FINNHUB_API_KEY (PROVIDERS).' };
    else if (!res.text) {
      if (!(res.status >= 400 && res.status < 500 && res.status !== 429)) asked.delete(key);
      part = { state: res.budget ? 'budget' : 'error', message: res.error ?? (res.status ? `Finnhub answered HTTP ${res.status}` : 'Finnhub did not answer') };
    } else {
      const parsed = kind === 'recommendation' ? parseRecommendation(res.text, symbol) : PARSE[kind](res.text);
      part = 'error' in parsed ? { state: 'error', message: parsed.error, at: res.at } : { state: 'ok', data: parsed.data, at: res.at, stale: res.stale, message: res.stale ? res.error : undefined };
    }
  } catch (err) {
    asked.delete(key);
    part = { state: 'error', message: String((err as Error)?.message ?? err) };
  }
  if (generation !== finnhubData.get().retry) return undefined;
  put(symbol, kind, part);
  return part;
}

/** Asks for the parts a screen shows; they arrive in finnhubData. */
export function useFinnhub(def: SecurityDef | undefined, kinds: FinnhubKind[]): ByKind {
  const symbol = finnhubSymbol(def);
  const parts = finnhubData.use((s) => (symbol ? s.by[symbol] : undefined));
  const retry = finnhubData.use((s) => s.retry);
  const want = kinds.join(',');
  useEffect(() => {
    if (!symbol || !finnhubAvailable()) return;
    for (const k of want.split(',') as FinnhubKind[]) void loadFinnhub(symbol, k);
  }, [symbol, want, retry]);
  return parts ?? {};
}
