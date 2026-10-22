import { useEffect } from 'react';
import { createStore, waitFor } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';
import type { KeyedAnswer } from './lookup';
import { loadYahooAnalysts, retryYahooAnalysts, yahooResearchAvailable } from './yahoo-research';
import { loadNasdaq, nasdaqAvailable, type NasdaqForecast, type NasdaqRatings, type NasdaqTarget } from './nasdaq-company';
import { alphaVantageAvailable, loadAlphaVantage } from './alphavantage';
import { createWants, registerRefresh, type RefreshOutcome } from '../../terminal/refresh';

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
  /** FMP only: EBITDA and EBIT estimates. */
  ebitdaAvg?: number;
  ebitAvg?: number;
  analystsRevenue: number;
  analystsEps: number;
  currency?: string;
  /** EPS can use a different currency from revenue, especially for ADRs. */
  epsCurrency?: string;
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
      ebitdaAvg: num(r?.ebitdaAvg ?? r?.estimatedEbitdaAvg),
      ebitAvg: num(r?.ebitAvg ?? r?.estimatedEbitAvg),
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
  source?: 'FMP' | 'Finnhub' | 'Yahoo Finance' | 'Nasdaq' | 'Alpha Vantage';
  currency?: string;
  recommendations?: RatingTally[];
  /** Source-specific failures retained for the expandable coverage details. */
  problems?: string[];
  /** The request failed on the way (no answer, rate limit, server error): opening the screen again retries. */
  transient?: boolean;
}

type ByKind = Partial<Record<AnalystKind, AnalystPart>>;

export const analystData = createStore<{ v: number; by: Record<string, ByKind>; retry: number }>({ v: 0, by: {}, retry: 0 });

/** After keys or switches change on PROVIDERS: open screens ask again for what needed a key. */
export function retryAnalysts() {
  asked.clear();
  retryYahooAnalysts();
  analystData.set((s) => ({ ...s, by: {}, retry: s.retry + 1 }));
}
const asked = new Map<string, number>();

export function analystsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.analysts === 'function';
}

/** Stocks listed outside the US, asked for under their Yahoo symbol: Yahoo's research is their only source. */
const outsideUs = new Set<string>();
const YAHOO_LISTING = /^[A-Z][A-Z0-9-]{0,8}\.[A-Z]{1,3}$/;

/**
 * The symbol research is asked for under: a US listing's ticker ("BRK-B"), for FMP, Finnhub, Yahoo and the keyless
 * sources; or, in the desktop app with Yahoo research on, the Yahoo symbol of a stock listed elsewhere ("ASML.AS",
 * "MC.PA"), for Yahoo alone (the others cover US listings, or give their figures in dollars).
 */
export function analystSymbol(def: SecurityDef | undefined): string | null {
  const us = secTicker(def);
  if (us) return us;
  if (!def || def.cls !== 'equity' || !yahooResearchAvailable()) return null;
  const y = def.dynamic ? (def.dynamic.source === 'yahoo' ? def.dynamic.symbol : undefined) : def.yahoo;
  if (!y || !YAHOO_LISTING.test(y)) return null;
  outsideUs.add(y);
  return y;
}

/** A research symbol of a stock listed outside the US (Yahoo's research only). */
export function listedOutsideUs(symbol: string | null | undefined): boolean {
  return !!symbol && outsideUs.has(symbol);
}

/**
 * An annual estimate in the statements' currency, for comparing with them: null when its currency is another (or, for
 * a listing outside the US, not stated); its EPS left out when only the EPS is in another currency (an ADR's per-ADR
 * figure). An unstated currency on a US listing is the statements', as its sources give it.
 */
export function estimateInCurrency(e: Estimate, ccy: string, outside: boolean): Estimate | null {
  const rev = e.currency;
  const eps = e.epsCurrency ?? e.currency;
  if (outside && !rev && !eps) return null;
  if (rev && rev !== ccy) return null;
  if (eps && eps !== ccy) return { ...e, epsAvg: NaN, epsLow: NaN, epsHigh: NaN };
  return e;
}

/** Research for a stock listed outside the US: Yahoo's, which gives no history of the targets' averages. */
async function outsideUsPart(kind: AnalystKind, symbol: string): Promise<AnalystPart> {
  if (kind === 'summary') return { state: 'error', source: 'Yahoo Finance', message: "Yahoo gives no history of the price targets' averages for this listing." };
  try {
    return await loadYahooAnalysts(kind, symbol);
  } catch {
    return { state: 'error', source: 'Yahoo Finance', message: 'Yahoo research could not be loaded.' };
  }
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
  const parsed = parseFinnhubRecommendations(text, symbol);
  return 'error' in parsed ? parsed : { data: parsed.data[0] ?? null };
}

export function parseFinnhubRecommendations(text: string, symbol: string): Parsed<RatingTally[]> {
  const rows = list(text);
  if (!Array.isArray(rows)) return rows;
  const fields = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'] as const;
  const valid = rows.filter((r) => r && String(r.symbol).replace(/\./g, '-') === symbol.replace(/\./g, '-') && /^\d{4}-\d{2}-\d{2}$/.test(r.period) && Number.isFinite(Date.parse(`${r.period}T00:00:00Z`)) && new Date(`${r.period}T00:00:00Z`).toISOString().slice(0, 10) === r.period && fields.every((k) => Number.isInteger(r[k]) && r[k] >= 0) && fields.reduce((sum, k) => sum + r[k], 0) > 0)
    .sort((a, b) => b.period.localeCompare(a.period));
  return { data: valid.map((r) => ({ strongBuy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strongSell: r.strongSell, consensus: '', period: r.period })) };
}

function responsePart(res: KeyedAnswer, kind: AnalystKind, symbol: string, source: 'FMP' | 'Finnhub'): AnalystPart {
  if (res.gated) return { state: 'off', source, message: `${source} is switched off (${res.gated} on PROVIDERS).` };
  if (res.missing || res.refused) return { state: 'needs-key', source, message: res.refused ? `${source}'s configured key has the wrong format.` : `Needs ${source === 'FMP' ? 'FMP_API_KEY' : 'FINNHUB_API_KEY'} on PROVIDERS.` };
  if (!res.text) return { state: res.budget ? 'budget' : 'error', source, ...(!res.budget && (!res.status || res.status === 429 || res.status >= 500) ? { transient: true } : {}), message: res.budget ? `Today's ${source} allowance in this app is spent; it resets at midnight UTC.` : source === 'FMP' ? fmpProblem(res.status, symbol, res.error) : `Finnhub: ${res.error ?? (res.status ? `HTTP ${res.status}` : 'did not answer')}. HTTP 401 means the REST key was rejected; the webhook secret cannot authenticate data requests.` };
  const parsed = source === 'Finnhub' ? parseFinnhubRatings(res.text, symbol) : PARSE[kind](res.text);
  if ('error' in parsed) return { state: 'error', source, message: parsed.error, at: res.at };
  const months = source === 'Finnhub' ? parseFinnhubRecommendations(res.text, symbol) : undefined;
  return { state: 'ok', source, data: parsed.data, at: res.at, stale: res.stale, message: res.stale ? res.error ?? 'The latest refresh failed; showing the earlier answer.' : undefined, ...(months && 'data' in months ? { recommendations: months.data } : {}) };
}

/** Independent requests allow one research section to fail without hiding the others. */
export async function loadAnalystPart(kind: AnalystKind, symbol: string, api: {
  analysts(kind: AnalystKind, symbol: string): Promise<KeyedAnswer>;
  finnhubResearch?(kind: 'ratings', symbol: string): Promise<KeyedAnswer>;
  yahooResearch?(kind: AnalystKind, symbol: string): Promise<AnalystPart>;
  /** Keyless last resort: Nasdaq's price target, rating counts and EPS forecasts; Alpha Vantage's annual estimates. */
  fallback?(kind: AnalystKind, symbol: string): Promise<AnalystPart | null>;
}): Promise<AnalystPart> {
  const safe = async (request: () => Promise<KeyedAnswer>) => {
    try { return await request(); } catch { return { status: 0, text: '', error: 'The research request could not be completed.' }; }
  };
  const primary = responsePart(await safe(() => api.analysts(kind, symbol)), kind, symbol, 'FMP');
  const usable = (part: AnalystPart) => part.state === 'ok' && (Array.isArray(part.data) ? part.data.length > 0 : !!part.data);
  if (usable(primary) && !primary.stale) return primary;
  const problems = [primary.message ?? `FMP has no ${kind} for this symbol.`];
  let retained = usable(primary) ? primary : undefined;
  if (kind === 'ratings' && api.finnhubResearch) {
    const fallback = responsePart(await safe(() => api.finnhubResearch!('ratings', symbol)), kind, symbol, 'Finnhub');
    if (usable(fallback) && !fallback.stale) return { ...fallback, problems, message: 'Showing Finnhub recommendation counts.' };
    if (usable(fallback) && !retained) retained = fallback;
    problems.push(fallback.message ?? 'Finnhub has no recommendation counts for this symbol.');
  }
  // Yahoo does not supply the same period-average target-history dataset. Never
  // substitute today's target or rating history for those historical averages.
  if (kind !== 'summary' && api.yahooResearch) {
    let fallback: AnalystPart;
    try { fallback = await api.yahooResearch(kind, symbol); }
    catch { fallback = { state: 'error', message: 'Yahoo research could not be loaded.' }; }
    if (usable(fallback) && (!fallback.stale || !retained)) return { ...fallback, problems };
    problems.push(fallback.message ?? `Yahoo has no ${kind} for this symbol.`);
  }
  if (!retained && api.fallback) {
    let last: AnalystPart | null = null;
    try { last = await api.fallback(kind, symbol); }
    catch { last = null; }
    if (last && usable(last)) return { ...last, problems };
  }
  if (retained) return { ...retained, problems };
  return { ...primary, problems, message: problems.join(' ') };
}

/**
 * The research no keyed source gave, from sources without a key or with the owner's Alpha Vantage key: Nasdaq's
 * consensus price target (mean, low, high) and its buy/hold/sell count with Nasdaq's mean rating, and the annual
 * estimates (Alpha Vantage's EPS and revenue, else Nasdaq's EPS). Null when none applies.
 */
export async function keylessAnalystPart(kind: AnalystKind, symbol: string): Promise<AnalystPart | null> {
  const ns = symbol.replace(/-/g, '.');
  if ((kind === 'consensus' || kind === 'ratings') && nasdaqAvailable()) {
    const t = await loadNasdaq<NasdaqTarget>(ns, 'target');
    const c = t.state === 'ok' ? t.data : null;
    if (kind === 'consensus') return c && c.mean > 0 ? { state: 'ok', source: 'Nasdaq', currency: 'USD', at: t.at, data: { mean: c.mean, low: c.low, high: c.high, median: NaN } satisfies TargetConsensus } : null;
    if (!c || !(c.buy + c.hold + c.sell > 0)) return null;
    const r = await loadNasdaq<NasdaqRatings>(ns, 'ratings');
    const word = r.state === 'ok' ? r.data?.mean ?? '' : '';
    return { state: 'ok', source: 'Nasdaq', at: t.at, data: { strongBuy: 0, buy: c.buy, hold: c.hold, sell: c.sell, strongSell: 0, consensus: word } satisfies RatingTally };
  }
  if (kind === 'estimates') {
    const now = new Date().toISOString().slice(0, 10);
    if (alphaVantageAvailable()) {
      const av = await loadAlphaVantage(symbol);
      const years = (av.state === 'ok' ? av.data?.estimates ?? [] : []).filter((e) => e.period === 'year');
      if (years.some((y) => y.end >= now)) {
        return {
          state: 'ok', source: 'Alpha Vantage', currency: 'USD', at: av.at,
          data: years.map((y) => ({ date: y.end, revenueAvg: y.revEst, revenueLow: y.revLow, revenueHigh: y.revHigh, epsAvg: y.epsEst, epsLow: y.epsLow, epsHigh: y.epsHigh, netIncomeAvg: NaN, analystsRevenue: y.revAnalysts, analystsEps: y.epsAnalysts })) satisfies Estimate[],
        };
      }
    }
    if (nasdaqAvailable()) {
      const f = await loadNasdaq<NasdaqForecast>(ns, 'forecast');
      const years = f.state === 'ok' ? f.data?.yearly ?? [] : [];
      if (years.length) {
        return {
          state: 'ok', source: 'Nasdaq', currency: 'USD', at: f.at,
          data: years.map((y) => ({ date: y.end, revenueAvg: NaN, revenueLow: NaN, revenueHigh: NaN, epsAvg: y.est, epsLow: y.low, epsHigh: y.high, netIncomeAvg: NaN, analystsRevenue: NaN, analystsEps: y.analysts })) satisfies Estimate[],
        };
      }
    }
  }
  return null;
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
    const part = listedOutsideUs(symbol)
      ? await outsideUsPart(kind, symbol)
      : await loadAnalystPart(kind, symbol, { analysts: window.arminDesktop!.analysts!, finnhubResearch: window.arminDesktop!.finnhubResearch, yahooResearch: loadYahooAnalysts, fallback: keylessAnalystPart });
    if (generation !== analystData.get().retry) return;
    if (part.state === 'needs-key' || part.state === 'off' || part.transient) asked.delete(key);
    put(symbol, kind, part);
  } catch (err) {
    if (generation !== analystData.get().retry) return;
    asked.delete(key);
    put(symbol, kind, { state: 'error', message: err instanceof Error ? 'The research request could not be completed.' : 'Research unavailable.' });
  }
}

/**
 * Asks for some research and resolves once every part has an answer, or after `ms` with what has arrived: for the
 * help desk, which answers with the figures rather than re-rendering.
 */
export async function requestAnalysts(def: SecurityDef | undefined, kinds: AnalystKind[], ms = 12_000): Promise<ByKind> {
  const symbol = analystSymbol(def);
  if (!symbol || !analystsAvailable()) return {};
  for (const k of kinds) void load(symbol, k);
  const parts = () => analystData.get().by[symbol] ?? {};
  const settled = () => (kinds.every((k) => parts()[k] && parts()[k]!.state !== 'loading') ? parts() : undefined);
  return (await waitFor(analystData, settled, ms)) ?? parts();
}

/** The research open screens show, by symbol and kind, for the top bar's REFRESH. */
const shown = createWants<{ symbol: string; kind: AnalystKind }>();

/**
 * The top bar's REFRESH: the research on screen is asked for again, keeping what is shown until the answers arrive.
 * The main process keeps FMP's answers younger than an hour, for its daily allowance; Finnhub and Yahoo are asked.
 */
export async function refreshAnalysts(): Promise<RefreshOutcome[]> {
  asked.clear();
  retryYahooAnalysts();
  const list = shown.values();
  if (!list.length) return [];
  await Promise.all(list.map((x) => load(x.symbol, x.kind)));
  const parts = list.map((x) => analystData.get().by[x.symbol]?.[x.kind]);
  const failed = parts.filter((p) => !p || p.state === 'error' || p.stale).length;
  const symbols = new Set(list.map((x) => x.symbol)).size;
  return [{ source: 'Analyst research (FMP, Finnhub, Yahoo)', state: failed === parts.length ? 'failed' : 'asked', detail: `${symbols} ${symbols === 1 ? 'stock' : 'stocks'}, ${parts.length - failed} of ${parts.length} sections current; FMP answers younger than an hour kept` }];
}

registerRefresh({ source: 'Analyst research (FMP, Finnhub, Yahoo)', available: analystsAvailable, run: refreshAnalysts });

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
  useEffect(() => {
    if (!symbol) return;
    const offs = (want.split(',') as AnalystKind[]).map((kind) => shown.add(`${symbol}:${kind}`, { symbol, kind }));
    return () => offs.forEach((off) => off());
  }, [symbol, want]);
  return parts ?? {};
}
