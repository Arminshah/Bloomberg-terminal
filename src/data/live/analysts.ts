import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * Analyst research from Financial Modeling Prep, asked by the desktop app's main process with the owner's
 * key (electron/fmp.cjs): the price target consensus and its recent history, the tally of broker ratings,
 * recent rating actions and annual estimates, for US-listed stocks. FMP gathers price targets from
 * published analyst notes and news; its summary names the publishers. Answers are kept for hours, and the
 * free plan allows 250 requests a day (the app keeps to 220).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AnalystKind = 'consensus' | 'summary' | 'ratings' | 'grades' | 'estimates';

export interface TargetConsensus {
  high: number;
  low: number;
  /** FMP's "targetConsensus": the average of the targets it holds. */
  mean: number;
  median: number;
}

export interface TargetPeriod {
  count: number;
  avg: number;
}

export interface TargetSummary {
  lastMonth: TargetPeriod;
  lastQuarter: TargetPeriod;
  lastYear: TargetPeriod;
  allTime: TargetPeriod;
  publishers: string[];
}

export interface RatingTally {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  /** FMP's own word for the balance: Strong Buy, Buy, Hold, Sell or Strong Sell. */
  consensus: string;
}

export interface RatingAction {
  /** YYYY-MM-DD. */
  date: string;
  firm: string;
  from: string;
  to: string;
  /** upgrade, downgrade, maintain, initialize or reiterate, as FMP gives it. */
  action: string;
}

export interface Estimate {
  /** End of the fiscal year, YYYY-MM-DD. */
  date: string;
  revenueAvg: number;
  revenueLow: number;
  revenueHigh: number;
  epsAvg: number;
  epsLow: number;
  epsHigh: number;
  netIncomeAvg: number;
  analystsRevenue: number;
  analystsEps: number;
}

type Parsed<T> = { data: T } | { error: string };

const num = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

/** FMP answers with a list, or with {"Error Message": ...} when it refuses. */
function list(text: string): any[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'The answer was not JSON' };
  }
  if (Array.isArray(j)) return j;
  return { error: String(j?.['Error Message'] ?? j?.error ?? j?.message ?? 'No list in the answer').slice(0, 200) };
}

/** price-target-consensus: [{symbol, targetHigh, targetLow, targetConsensus, targetMedian}]. */
export function parseConsensus(text: string): Parsed<TargetConsensus | null> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const r = rows[0];
  if (!r) return { data: null };
  const c = { high: num(r.targetHigh), low: num(r.targetLow), mean: num(r.targetConsensus), median: num(r.targetMedian) };
  return { data: Number.isFinite(c.mean) && c.mean > 0 ? c : null };
}

/** price-target-summary: [{lastMonthCount, lastMonthAvgPriceTarget, ..., allTimeCount, allTimeAvgPriceTarget, publishers: "[...]"}]. */
export function parseSummary(text: string): Parsed<TargetSummary | null> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const r = rows[0];
  if (!r) return { data: null };
  const period = (k: string): TargetPeriod => ({ count: num(r[`${k}Count`]), avg: num(r[`${k}AvgPriceTarget`]) });
  let publishers: string[] = [];
  try {
    const p = typeof r.publishers === 'string' ? JSON.parse(r.publishers) : r.publishers;
    if (Array.isArray(p)) publishers = p.filter((x) => typeof x === 'string');
  } catch {
    /* no publisher list */
  }
  return { data: { lastMonth: period('lastMonth'), lastQuarter: period('lastQuarter'), lastYear: period('lastYear'), allTime: period('allTime'), publishers } };
}

/** grades-consensus: [{strongBuy, buy, hold, sell, strongSell, consensus}]. */
export function parseRatings(text: string): Parsed<RatingTally | null> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const r = rows[0];
  if (!r) return { data: null };
  const t = { strongBuy: num(r.strongBuy), buy: num(r.buy), hold: num(r.hold), sell: num(r.sell), strongSell: num(r.strongSell), consensus: typeof r.consensus === 'string' ? r.consensus : '' };
  const total = t.strongBuy + t.buy + t.hold + t.sell + t.strongSell;
  return { data: Number.isFinite(total) && total > 0 ? t : null };
}

/** grades: [{date, gradingCompany, previousGrade, newGrade, action}], newest first after sorting; the latest `max`. */
export function parseGrades(text: string, max = 25): Parsed<RatingAction[]> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const out = rows
    .map((r) => ({ date: String(r?.date ?? '').slice(0, 10), firm: String(r?.gradingCompany ?? '').trim(), from: String(r?.previousGrade ?? '').trim(), to: String(r?.newGrade ?? '').trim(), action: String(r?.action ?? '').trim().toLowerCase() }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.firm && r.to)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { data: out.slice(0, max) };
}

/**
 * analyst-estimates (annual): [{date, revenueAvg, revenueLow, revenueHigh, epsAvg, epsLow, epsHigh,
 * numAnalystsRevenue, numAnalystsEps, ...}], oldest first after sorting. A field FMP does not give stays NaN and
 * shows as "--".
 */
export function parseEstimates(text: string): Parsed<Estimate[]> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const out = rows
    // The older v3 API named the same figures estimatedRevenueAvg, numberAnalystsEstimatedEps and so on.
    .map((r) => ({
      date: String(r?.date ?? '').slice(0, 10),
      revenueAvg: num(r?.revenueAvg ?? r?.estimatedRevenueAvg),
      revenueLow: num(r?.revenueLow ?? r?.estimatedRevenueLow),
      revenueHigh: num(r?.revenueHigh ?? r?.estimatedRevenueHigh),
      epsAvg: num(r?.epsAvg ?? r?.estimatedEpsAvg),
      epsLow: num(r?.epsLow ?? r?.estimatedEpsLow),
      epsHigh: num(r?.epsHigh ?? r?.estimatedEpsHigh),
      netIncomeAvg: num(r?.netIncomeAvg ?? r?.estimatedNetIncomeAvg),
      analystsRevenue: num(r?.numAnalystsRevenue ?? r?.numberAnalystEstimatedRevenue),
      analystsEps: num(r?.numAnalystsEps ?? r?.numberAnalystsEstimatedEps),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { data: out };
}

const PARSE: Record<AnalystKind, (t: string) => Parsed<unknown>> = { consensus: parseConsensus, summary: parseSummary, ratings: parseRatings, grades: (t) => parseGrades(t), estimates: parseEstimates };

export interface AnalystPart<T = unknown> {
  state: 'loading' | 'ok' | 'error' | 'needs-key' | 'budget' | 'off';
  data?: T;
  message?: string;
  /** When FMP's answer arrived. */
  at?: number;
  /** A newer request failed; this is the last answer that arrived. */
  stale?: boolean;
}

type ByKind = Partial<Record<AnalystKind, AnalystPart>>;

export const analystData = createStore<{ v: number; by: Record<string, ByKind>; retry: number }>({ v: 0, by: {}, retry: 0 });

/** After keys or switches change on PROVIDERS: open screens ask again for what needed a key. */
export function retryAnalysts() {
  analystData.set((s) => ({ ...s, retry: s.retry + 1 }));
}
const asked = new Map<string, number>();

export function analystsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.analysts === 'function';
}

/** The FMP symbol for a security: US-listed stocks only ("BRK-B"). */
export function analystSymbol(def: SecurityDef | undefined): string | null {
  return secTicker(def);
}

/** FMP's refusal in words; 402 is how it says a plan does not include something. */
export function fmpProblem(status: number, symbol: string, error?: string): string {
  const said = error?.replace(/^HTTP \d+:?\s*/, '');
  if (status === 402) return `FMP's free plan does not include this for ${symbol} (HTTP 402, payment required)${said ? `: ${said}` : '.'}`;
  if (status === 401 || status === 403) return `FMP refused the key (HTTP ${status})${said ? `: ${said}` : '.'} Check FMP_API_KEY on PROVIDERS.`;
  return error ?? (status ? `FMP answered HTTP ${status}` : 'FMP did not answer');
}

function put(symbol: string, kind: AnalystKind, part: AnalystPart) {
  analystData.set((s) => ({ ...s, v: s.v + 1, by: { ...s.by, [symbol]: { ...s.by[symbol], [kind]: part } } }));
}

async function load(symbol: string, kind: AnalystKind) {
  const key = `${symbol}:${kind}`;
  // The main process keeps answers for hours; asking again within ten minutes only repeats that.
  if (Date.now() - (asked.get(key) ?? 0) < 10 * 60_000) return;
  asked.set(key, Date.now());
  if (!analystData.get().by[symbol]?.[kind]) put(symbol, kind, { state: 'loading' });
  try {
    const res = await window.arminDesktop!.analysts!(kind, symbol);
    // No key or the switch off costs no request: the next screen asks again, in case they were set meanwhile.
    if (res.gated || res.missing || res.refused) asked.delete(key);
    if (res.gated) return put(symbol, kind, { state: 'off', message: `Financial Modeling Prep is switched off (${res.gated} on PROVIDERS).` });
    if (res.missing || res.refused) return put(symbol, kind, { state: 'needs-key', message: res.refused ? 'The configured FMP_API_KEY has the wrong format.' : 'Needs FMP_API_KEY (PROVIDERS).' });
    if (!res.text) {
      // A refusal (4xx) stands for the ten minutes; a network failure, a server error or a rate limit may pass.
      if (!(res.status >= 400 && res.status < 500 && res.status !== 429)) asked.delete(key);
      return put(symbol, kind, { state: res.budget ? 'budget' : 'error', message: res.budget ? "Today's FMP allowance in this app is spent; it resets at midnight UTC." : fmpProblem(res.status, symbol, res.error) });
    }
    const parsed = PARSE[kind](res.text);
    if ('error' in parsed) return put(symbol, kind, { state: 'error', message: parsed.error, at: res.at });
    put(symbol, kind, { state: 'ok', data: parsed.data, at: res.at, stale: res.stale });
  } catch (err) {
    asked.delete(key);
    put(symbol, kind, { state: 'error', message: String((err as Error)?.message ?? err) });
  }
}

/** Asks for the research a screen shows; parts arrive in analystData. */
export function useAnalysts(def: SecurityDef | undefined, kinds: AnalystKind[]): ByKind {
  const symbol = analystSymbol(def);
  const parts = analystData.use((s) => (symbol ? s.by[symbol] : undefined));
  const retry = analystData.use((s) => s.retry);
  const want = kinds.join(',');
  useEffect(() => {
    if (!symbol || !analystsAvailable()) return;
    for (const k of want.split(',') as AnalystKind[]) void load(symbol, k);
  }, [symbol, want, retry]);
  return parts ?? {};
}
