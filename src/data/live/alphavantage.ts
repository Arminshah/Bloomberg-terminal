import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * Alpha Vantage's earnings data for one US-listed company, with the owner's key (ALPHA_VANTAGE_API_KEY), asked by the
 * main process and kept there on disk for three days (electron/alphavantage.cjs): every reported quarter's date,
 * session, EPS expected and reported, and the analysts' EPS and revenue estimates of each fiscal quarter and year,
 * past and coming. They fill the expected revenue of reported quarters, which Yahoo drops at the report.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface AvReport {
  /** Fiscal quarter end, YYYY-MM-DD. */
  end: string;
  /** Report date, YYYY-MM-DD. */
  date: string;
  timing: 'Bef-mkt' | 'Aft-mkt' | '--';
  epsEst: number;
  epsActual: number;
}

export interface AvEstimate {
  /** Fiscal period end, YYYY-MM-DD. */
  end: string;
  period: 'quarter' | 'year';
  epsEst: number;
  epsLow: number;
  epsHigh: number;
  epsAnalysts: number;
  revEst: number;
  revLow: number;
  revHigh: number;
  revAnalysts: number;
}

export interface AvEarnings {
  /** Reported quarters, newest first. */
  reports: AvReport[];
  /** Estimates by fiscal period, oldest first. */
  estimates: AvEstimate[];
}

type Parsed<T> = { data: T } | { error: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() && v !== 'None' ? Number(v) : NaN);

/** Alpha Vantage answers HTTP 200 with {"Information" | "Note" | "Error Message": ...} when it refuses. */
function body(text: string): Json | { error: string } {
  let j: Json;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Alpha Vantage returned a page that is not JSON.' };
  }
  const refusal = j?.['Error Message'] ?? j?.Information ?? j?.Note;
  return refusal ? { error: `Alpha Vantage: ${String(refusal).slice(0, 200)}` } : j;
}

/** EARNINGS: {quarterlyEarnings: [{fiscalDateEnding, reportedDate, reportedEPS, estimatedEPS, surprise, reportTime}]}. */
export function parseAvReports(text: string): Parsed<AvReport[]> {
  const j = body(text);
  if ('error' in j && typeof j.error === 'string') return { error: j.error };
  const rows: Json[] = Array.isArray(j?.quarterlyEarnings) ? j.quarterlyEarnings : [];
  const data = rows
    .map((r) => ({
      end: String(r?.fiscalDateEnding ?? ''),
      date: String(r?.reportedDate ?? ''),
      timing: r?.reportTime === 'pre-market' ? 'Bef-mkt' : r?.reportTime === 'post-market' ? 'Aft-mkt' : '--',
      epsEst: num(r?.estimatedEPS),
      epsActual: num(r?.reportedEPS),
    }) as AvReport)
    .filter((r) => ISO.test(r.end) && ISO.test(r.date) && r.date > r.end)
    .sort((a, b) => b.end.localeCompare(a.end));
  return { data };
}

/** EARNINGS_ESTIMATES: {estimates: [{date, horizon, eps_estimate_average, ..., revenue_estimate_average, ...}]}. */
export function parseAvEstimates(text: string): Parsed<AvEstimate[]> {
  const j = body(text);
  if ('error' in j && typeof j.error === 'string') return { error: j.error };
  const rows: Json[] = Array.isArray(j?.estimates) ? j.estimates : [];
  const data = rows
    .map((r) => ({
      end: String(r?.date ?? ''),
      period: /year/i.test(String(r?.horizon ?? '')) ? 'year' : 'quarter',
      epsEst: num(r?.eps_estimate_average),
      epsLow: num(r?.eps_estimate_low),
      epsHigh: num(r?.eps_estimate_high),
      epsAnalysts: num(r?.eps_estimate_analyst_count),
      revEst: num(r?.revenue_estimate_average),
      revLow: num(r?.revenue_estimate_low),
      revHigh: num(r?.revenue_estimate_high),
      revAnalysts: num(r?.revenue_estimate_analyst_count),
    }) as AvEstimate)
    .filter((r) => ISO.test(r.end) && (Number.isFinite(r.epsEst) || Number.isFinite(r.revEst)))
    .sort((a, b) => a.end.localeCompare(b.end));
  return { data };
}

// ------------------------------------------------------------------ loading

export interface AvEntry {
  state: 'loading' | 'ok' | 'error' | 'needs-key';
  data?: AvEarnings;
  message?: string;
  at?: number;
  /** An earlier answer kept because the latest request failed (a spent allowance, a refusal). */
  stale?: boolean;
}

export const alphaVantageData = createStore<{ v: number; by: Record<string, AvEntry> }>({ v: 0, by: {} });

export function alphaVantageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.alphavantage === 'function';
}

/** Alpha Vantage's ticker for a US-listed stock (BRK-B), or null. */
export const avSymbol = (def: SecurityDef | undefined): string | null => secTicker(def);

const inflight = new Map<string, Promise<AvEntry>>();
const asked = new Map<string, number>();

/** Both answers for a ticker (one company's screens only: the free key allows 25 requests a day). */
export function loadAlphaVantage(symbol: string): Promise<AvEntry> {
  const have = alphaVantageData.get().by[symbol];
  // The main process keeps answers on disk for three days; asking it again within an hour only repeats them.
  if (have && have.state !== 'loading' && Date.now() - (asked.get(symbol) ?? 0) < (have.state === 'needs-key' ? 5 * 60_000 : 3_600_000)) return Promise.resolve(have);
  if (inflight.has(symbol)) return inflight.get(symbol)!;
  asked.set(symbol, Date.now());
  const put = (e: AvEntry) => alphaVantageData.set((s) => ({ v: s.v + 1, by: { ...s.by, [symbol]: e } }));
  if (!have) put({ state: 'loading' });
  const run = (async (): Promise<AvEntry> => {
    const api = window.arminDesktop!.alphavantage!;
    let entry: AvEntry;
    try {
      const reports = await api('earnings', symbol);
      if (reports.missing || reports.refused) entry = { state: 'needs-key', message: reports.refused ? 'The configured ALPHA_VANTAGE_API_KEY has the wrong format.' : 'Needs ALPHA_VANTAGE_API_KEY on PROVIDERS.' };
      else {
        const estimates = await api('estimates', symbol);
        const r = reports.text ? parseAvReports(reports.text) : { error: reports.error ?? 'Alpha Vantage did not answer.' };
        const e = estimates.text ? parseAvEstimates(estimates.text) : { error: estimates.error ?? 'Alpha Vantage did not answer.' };
        const data: AvEarnings = { reports: 'data' in r ? r.data : [], estimates: 'data' in e ? e.data : [] };
        const problems = ['error' in r ? r.error : '', 'error' in e ? e.error : ''].filter(Boolean);
        entry = data.reports.length || data.estimates.length ? { state: 'ok', data, at: Math.min(reports.at ?? Date.now(), estimates.at ?? Date.now()), ...(reports.stale || estimates.stale ? { stale: true } : {}), ...(problems.length ? { message: problems.join(' ') } : {}) } : { state: 'error', message: problems.join(' ') || 'Alpha Vantage has no earnings data for this company.', at: Date.now() };
      }
    } catch {
      entry = { state: 'error', message: 'The Alpha Vantage request could not be completed.', at: Date.now() };
    }
    if (entry.state === 'error' && have?.state === 'ok') entry = { ...have, message: entry.message };
    put(entry);
    return entry;
  })().finally(() => inflight.delete(symbol));
  inflight.set(symbol, run);
  return run;
}

/** What arrived for a ticker (no request). */
export function alphaVantageFor(symbol: string | null): AvEarnings | undefined {
  const e = symbol ? alphaVantageData.get().by[symbol] : undefined;
  return e?.state === 'ok' ? e.data : undefined;
}
