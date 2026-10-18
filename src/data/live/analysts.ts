import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';
import type { KeyedAnswer } from './lookup';

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
  /** Finnhub reports a monthly recommendation period, distinct from retrieval time. */
  period?: string;
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
  source?: 'FMP' | 'Finnhub';
}

type ByKind = Partial<Record<AnalystKind, AnalystPart>>;

export const analystData = createStore<{ v: number; by: Record<string, ByKind>; retry: number }>({ v: 0, by: {}, retry: 0 });

/** After keys or switches change on PROVIDERS: open screens ask again for what needed a key. */
export function retryAnalysts() {
  asked.clear();
  analystData.set((s) => ({ ...s, by: {}, retry: s.retry + 1 }));
}
const asked = new Map<string, number>();

export function analystsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.analysts === 'function';
}

/** The FMP symbol for a security: US-listed stocks only ("BRK-B"). */
export function analystSymbol(def: SecurityDef | undefined): string | null {
  return secTicker(def);
}

/** A refusal describes this request/account, not an assumption about the user's plan. */
export function fmpProblem(status: number, symbol: string, error?: string): string {
  const said = error?.replace(/^HTTP \d+:?\s*/, '');
  if (status === 402) return `Your FMP subscription does not include this request for ${symbol} (HTTP 402)${said ? `: ${said}` : '.'}`;
  if (status === 401 || status === 403) return `FMP denied access (HTTP ${status})${said ? `: ${said}` : '.'} Check the key and endpoint permissions on PROVIDERS.`;
  return error ?? (status ? `FMP answered HTTP ${status}` : 'FMP did not answer');
}

/** Finnhub's latest valid monthly count. No target/consensus word is invented. */
export function parseFinnhubRatings(text: string, symbol: string): Parsed<RatingTally | null> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const fields = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'] as const;
  const row = rows.filter((r) => r && String(r.symbol).replace(/\./g, '-') === symbol.replace(/\./g, '-') && /^\d{4}-\d{2}-\d{2}$/.test(r.period) && Number.isFinite(Date.parse(`${r.period}T00:00:00Z`)) && new Date(`${r.period}T00:00:00Z`).toISOString().slice(0, 10) === r.period && fields.every((k) => Number.isInteger(r[k]) && r[k] >= 0))
    .sort((a, b) => b.period.localeCompare(a.period))[0];
  if (!row || fields.reduce((sum, k) => sum + row[k], 0) <= 0) return { data: null };
  return { data: { strongBuy: row.strongBuy, buy: row.buy, hold: row.hold, sell: row.sell, strongSell: row.strongSell, consensus: '', period: row.period } };
}

function responsePart(res: KeyedAnswer, kind: AnalystKind, symbol: string, source: 'FMP' | 'Finnhub'): AnalystPart {
  if (res.gated) return { state: 'off', source, message: `${source} is switched off (${res.gated} on PROVIDERS).` };
  if (res.missing || res.refused) return { state: 'needs-key', source, message: res.refused ? `${source}'s configured key has the wrong format.` : `Needs ${source === 'FMP' ? 'FMP_API_KEY' : 'FINNHUB_API_KEY'} on PROVIDERS.` };
  if (!res.text) return { state: res.budget ? 'budget' : 'error', source, message: res.budget ? `Today's ${source} allowance in this app is spent; it resets at midnight UTC.` : source === 'FMP' ? fmpProblem(res.status, symbol, res.error) : `Finnhub: ${res.error ?? (res.status ? `HTTP ${res.status}` : 'did not answer')}. HTTP 401 means the REST key was rejected; the webhook secret cannot authenticate data requests.` };
  const parsed = source === 'Finnhub' ? parseFinnhubRatings(res.text, symbol) : PARSE[kind](res.text);
  if ('error' in parsed) return { state: 'error', source, message: parsed.error, at: res.at };
  return { state: 'ok', source, data: parsed.data, at: res.at, stale: res.stale, message: res.stale ? res.error ?? 'The latest refresh failed; showing the earlier answer.' : undefined };
}

/** Independent requests allow one research section to fail without hiding the others. */
export async function loadAnalystPart(kind: AnalystKind, symbol: string, api: {
  analysts(kind: AnalystKind, symbol: string): Promise<KeyedAnswer>;
  finnhubResearch?(kind: 'ratings', symbol: string): Promise<KeyedAnswer>;
}): Promise<AnalystPart> {
  const safe = async (request: () => Promise<KeyedAnswer>) => {
    try { return await request(); } catch { return { status: 0, text: '', error: 'The research request could not be completed.' }; }
  };
  const primary = responsePart(await safe(() => api.analysts(kind, symbol)), kind, symbol, 'FMP');
  if (kind !== 'ratings' || !api.finnhubResearch || (primary.state === 'ok' && primary.data && !primary.stale)) return primary;
  const fallback = responsePart(await safe(() => api.finnhubResearch!('ratings', symbol)), kind, symbol, 'Finnhub');
  if (fallback.state === 'ok' && fallback.data && (!fallback.stale || primary.state !== 'ok' || !primary.data)) return { ...fallback, message: `FMP ratings unavailable; showing Finnhub recommendation counts${fallback.message ? `. ${fallback.message}` : '.'}` };
  if (primary.state === 'ok' && primary.data) return primary;
  return { ...primary, message: `${primary.message ?? 'FMP has no ratings for this symbol.'} ${fallback.message ?? 'Finnhub has no recommendation counts for this symbol.'}` };
}

function put(symbol: string, kind: AnalystKind, part: AnalystPart) {
  analystData.set((s) => ({ ...s, v: s.v + 1, by: { ...s.by, [symbol]: { ...s.by[symbol], [kind]: part } } }));
}

async function load(symbol: string, kind: AnalystKind) {
  const key = `${symbol}:${kind}`;
  // The main process keeps answers for hours; asking again within ten minutes only repeats that.
  if (Date.now() - (asked.get(key) ?? 0) < 10 * 60_000) return;
  asked.set(key, Date.now());
  const generation = analystData.get().retry;
  if (!analystData.get().by[symbol]?.[kind]) put(symbol, kind, { state: 'loading' });
  try {
    const part = await loadAnalystPart(kind, symbol, { analysts: window.arminDesktop!.analysts!, finnhubResearch: window.arminDesktop!.finnhubResearch });
    if (generation !== analystData.get().retry) return;
    if (part.state === 'needs-key' || part.state === 'off') asked.delete(key);
    put(symbol, kind, part);
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
