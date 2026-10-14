/**
 * Daily bars from the optional end-of-day providers, for checking the closes
 * the app shows against other sources (CROSSCHECK). Each provider is asked
 * only with the owner's key, within its free plan's budget, through the
 * desktop app's main process (electron/eod.cjs).
 *
 * What each close is: Massive's aggregates are split-adjusted ("By default,
 * results are adjusted"); Alpha Vantage's TIME_SERIES_DAILY is "raw
 * (as-traded)"; Twelve Data's time series gives the session's close. None is
 * adjusted for dividends, like the closes the app charts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type EodProvider = 'massive' | 'alphavantage' | 'twelvedata';

export interface EodBar {
  /** Session date, YYYY-MM-DD (US Eastern). */
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface EodProviderInfo {
  id: EodProvider;
  name: string;
  /** How its closes relate to splits. */
  basis: string;
  credential: string;
}

export const EOD_PROVIDERS: EodProviderInfo[] = [
  { id: 'massive', name: 'Massive', basis: 'split-adjusted', credential: 'MASSIVE_API_KEY' },
  { id: 'alphavantage', name: 'Alpha Vantage', basis: 'as traded', credential: 'ALPHA_VANTAGE_API_KEY' },
  { id: 'twelvedata', name: 'Twelve Data', basis: 'as the exchange reported', credential: 'TWELVE_DATA_API_KEY' },
];

/** A provider's answer as bars, oldest first, or the provider's own reason for giving none. */
export type EodParsed = { bars: EodBar[] } | { error: string };

const num = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN);
const valid = (b: EodBar) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && [b.o, b.h, b.l, b.c].every((x) => Number.isFinite(x) && x > 0);

/** Massive aggregates: {status, results: [{t (ms, window start), o, h, l, c, v, vw, n}]}; errors as {status: "ERROR", error}. */
export function parseMassive(text: string): EodParsed {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'not JSON' };
  }
  if (j?.status === 'ERROR' || j?.status === 'NOT_AUTHORIZED') return { error: String(j.error ?? j.message ?? j.status) };
  const rows = Array.isArray(j?.results) ? j.results : [];
  // Daily windows start at midnight US Eastern; the session date is that day.
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const bars = rows.map((r: any) => ({ date: Number.isFinite(num(r?.t)) ? day(num(r.t)) : '', o: num(r?.o), h: num(r?.h), l: num(r?.l), c: num(r?.c), v: num(r?.v) })).filter(valid);
  return { bars: bars.sort((a: EodBar, b: EodBar) => a.date.localeCompare(b.date)) };
}

/** Alpha Vantage TIME_SERIES_DAILY: {"Time Series (Daily)": {date: {"1. open", "2. high", "3. low", "4. close", "5. volume"}}}; limits and errors as Note, Information or Error Message. */
export function parseAlphaVantage(text: string): EodParsed {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'not JSON' };
  }
  const series = j?.['Time Series (Daily)'];
  if (!series || typeof series !== 'object') return { error: String(j?.['Error Message'] ?? j?.Note ?? j?.Information ?? 'no time series in the answer').slice(0, 200) };
  const bars = Object.entries(series as Record<string, any>)
    .map(([date, r]) => ({ date, o: num(r?.['1. open']), h: num(r?.['2. high']), l: num(r?.['3. low']), c: num(r?.['4. close']), v: num(r?.['5. volume']) }))
    .filter(valid);
  return { bars: bars.sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Twelve Data time_series: {meta, values: [{datetime, open, high, low, close, volume}], status: "ok"}; errors as {status: "error", code, message}. */
export function parseTwelveData(text: string): EodParsed {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'not JSON' };
  }
  if (j?.status === 'error') return { error: String(j.message ?? `code ${j.code}`).slice(0, 200) };
  const rows = Array.isArray(j?.values) ? j.values : [];
  const bars = rows.map((r: any) => ({ date: String(r?.datetime ?? '').slice(0, 10), o: num(r?.open), h: num(r?.high), l: num(r?.low), c: num(r?.close), v: num(r?.volume) })).filter(valid);
  return { bars: bars.sort((a: EodBar, b: EodBar) => a.date.localeCompare(b.date)) };
}

const PARSERS: Record<EodProvider, (t: string) => EodParsed> = { massive: parseMassive, alphavantage: parseAlphaVantage, twelvedata: parseTwelveData };

export type EodResult = { ok: true; bars: EodBar[]; at: number } | { ok: false; reason: 'desktop-only' | 'needs-key' | 'gated' | 'budget' | 'error'; message: string };

export function eodAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.eod === 'function';
}

const kept = new Map<string, { at: number; result: EodResult }>();

/** One provider's daily bars for a US ticker over the last `days` calendar days, kept for an hour. */
export async function loadEod(provider: EodProvider, ticker: string, days = 45): Promise<EodResult> {
  if (!eodAvailable()) return { ok: false, reason: 'desktop-only', message: 'Other sources are asked by the desktop app.' };
  const key = `${provider}:${ticker}`;
  const k = kept.get(key);
  if (k && k.result.ok && Date.now() - k.at < 3600_000) return k.result;
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  let res;
  try {
    res = await window.arminDesktop!.eod!(provider, ticker, from, to);
  } catch (err) {
    return { ok: false, reason: 'error', message: String((err as Error)?.message ?? err) };
  }
  let result: EodResult;
  if (res.missing) result = { ok: false, reason: 'needs-key', message: `Needs ${res.missing} (PROVIDERS).` };
  else if (res.gated) result = { ok: false, reason: 'gated', message: `Off until ${res.gated} is on: the free plan is for internal, non-display use.` };
  else if (res.budget) result = { ok: false, reason: 'budget', message: "Today's request budget for this provider is spent." };
  else if (res.refused) result = { ok: false, reason: 'error', message: 'The configured key has the wrong format.' };
  else if (!res.text) result = { ok: false, reason: 'error', message: `HTTP ${res.status}` };
  else {
    const parsed = PARSERS[provider](res.text);
    result = 'error' in parsed ? { ok: false, reason: 'error', message: parsed.error } : { ok: true, bars: parsed.bars, at: Date.now() };
  }
  kept.set(key, { at: Date.now(), result });
  return result;
}

export interface CloseCheck {
  date: string;
  app: number;
  others: Partial<Record<EodProvider, number>>;
}

/** The app's daily closes beside each provider's for the same sessions, newest first. */
export function compareCloses(app: { date: string; c: number }[], others: Partial<Record<EodProvider, EodBar[]>>, max = 20): CloseCheck[] {
  const by = Object.fromEntries(Object.entries(others).map(([p, bars]) => [p, new Map((bars ?? []).map((b) => [b.date, b.c]))])) as Partial<Record<EodProvider, Map<string, number>>>;
  return [...app]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max)
    .map((r) => ({ date: r.date, app: r.c, others: Object.fromEntries(Object.entries(by).map(([p, m]) => [p, m?.get(r.date)]).filter(([, v]) => v != null)) }));
}

/** Difference in basis points of a provider's close from the app's. */
export function diffBp(app: number, other: number | undefined): number {
  return other == null || !(app > 0) ? NaN : (other / app - 1) * 10_000;
}
