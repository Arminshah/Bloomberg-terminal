import type { AnalystKind, AnalystPart, Estimate, RatingAction, RatingTally, TargetConsensus } from './analysts';

export const YAHOO_RESEARCH_MODULES = 'price,financialData,recommendationTrend,upgradeDowngradeHistory,earningsTrend';
export const yahooResearchPath = (symbol: string) => `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${YAHOO_RESEARCH_MODULES}`;

type YahooAnswer = { status: number; data: unknown; disabled?: boolean; session?: boolean };
export type YahooResearchApi = (path: string) => Promise<YahooAnswer>;
export interface YahooResearch {
  consensus: TargetConsensus | null;
  ratings: RatingTally | null;
  recommendations: RatingTally[];
  grades: RatingAction[];
  estimates: Estimate[];
  quoteCurrency?: string;
  estimateCurrency?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const number = (value: any): number => {
  const v = value && typeof value === 'object' ? value.raw : value;
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : NaN;
};
const currency = (value: unknown) => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : undefined;
const iso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Provider values only. Missing fields stay NaN; relative months stay relative. */
export function parseYahooResearch(answer: unknown, symbol: string, receivedAt = Date.now()): { data: YahooResearch } | { error: string } {
  const root = (answer as any)?.quoteSummary;
  const row = root?.result?.[0];
  if (root?.error || !row || typeof row !== 'object') return { error: 'Yahoo returned no readable analyst research.' };
  const returnedSymbol = row.price?.symbol;
  if (typeof returnedSymbol === 'string' && returnedSymbol.toUpperCase() !== symbol.toUpperCase()) return { error: 'Yahoo returned research for a different ticker.' };
  const fd = row.financialData ?? {};
  const positive = (v: unknown) => number(v) > 0 ? number(v) : NaN;
  const target = { mean: positive(fd.targetMeanPrice), median: positive(fd.targetMedianPrice), high: positive(fd.targetHighPrice), low: positive(fd.targetLowPrice) };
  const recommendations: RatingTally[] = [];
  for (const r of Array.isArray(row.recommendationTrend?.trend) ? row.recommendationTrend.trend : []) {
    if (!r || typeof r.period !== 'string' || !/^(0|-\d+)m$/.test(r.period)) continue;
    const values = [r.strongBuy, r.buy, r.hold, r.sell, r.strongSell].map(number);
    if (!values.every((v) => Number.isInteger(v) && v >= 0) || values.reduce((a, b) => a + b, 0) <= 0) continue;
    recommendations.push({ strongBuy: values[0], buy: values[1], hold: values[2], sell: values[3], strongSell: values[4], period: r.period, consensus: r.period === '0m' && typeof fd.recommendationKey === 'string' ? fd.recommendationKey.replace(/_/g, ' ') : '' });
  }
  recommendations.sort((a, b) => Number.parseInt(b.period!) - Number.parseInt(a.period!));
  const actions: Record<string, string> = { up: 'upgrade', down: 'downgrade', main: 'maintain', init: 'initialize', reit: 'reiterate' };
  const grades: RatingAction[] = [];
  for (const r of Array.isArray(row.upgradeDowngradeHistory?.history) ? row.upgradeDowngradeHistory.history : []) {
    const seconds = number(r?.epochGradeDate);
    if (!(seconds > 0) || seconds * 1000 > receivedAt + 300_000 || !Number.isFinite(new Date(seconds * 1000).getTime()) || typeof r.firm !== 'string' || !r.firm.trim() || typeof r.toGrade !== 'string' || !r.toGrade.trim()) continue;
    const action = typeof r.action === 'string' ? r.action.toLowerCase() : '';
    grades.push({ date: new Date(seconds * 1000).toISOString().slice(0, 10), firm: r.firm.trim(), from: typeof r.fromGrade === 'string' ? r.fromGrade.trim() : '', to: r.toGrade.trim(), action: actions[action] ?? action });
  }
  grades.sort((a, b) => b.date.localeCompare(a.date));
  const estimates: Estimate[] = [];
  for (const r of Array.isArray(row.earningsTrend?.trend) ? row.earningsTrend.trend : []) {
    if (!r || !['0y', '+1y'].includes(r.period) || !iso(r.endDate)) continue;
    const revenue = r.revenueEstimate ?? {};
    const eps = r.earningsEstimate ?? {};
    const revenueAvg = number(revenue.avg);
    const epsAvg = number(eps.avg);
    if (!Number.isFinite(revenueAvg) && !Number.isFinite(epsAvg)) continue;
    estimates.push({ date: r.endDate, revenueAvg, revenueLow: number(revenue.low), revenueHigh: number(revenue.high), epsAvg, epsLow: number(eps.low), epsHigh: number(eps.high), netIncomeAvg: NaN, analystsRevenue: number(revenue.numberOfAnalysts), analystsEps: number(eps.numberOfAnalysts), currency: currency(revenue.revenueCurrency) ?? currency(fd.financialCurrency), epsCurrency: currency(eps.earningsCurrency) });
  }
  estimates.sort((a, b) => a.date.localeCompare(b.date));
  const currencies = new Set(estimates.flatMap((r) => [r.currency, r.epsCurrency]).filter(Boolean));
  return { data: { consensus: Number.isFinite(target.mean) ? target : null, ratings: recommendations.find((r) => r.period === '0m') ?? null, recommendations, grades: grades.slice(0, 25), estimates, quoteCurrency: currency(row.price?.currency), estimateCurrency: currencies.size === 1 ? [...currencies][0] : undefined } };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type Entry = { at: number; checkedAt: number; data?: YahooResearch; error?: string };

/** One shared, bounded request supplies four sections. No polling or key in the renderer. */
export function createYahooResearchLoader(get: YahooResearchApi, now = Date.now) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<Entry>>();
  let generation = 0;
  const read = async (symbol: string): Promise<Entry> => {
    const old = cache.get(symbol);
    if (old && now() - old.checkedAt < (old.error ? 60_000 : 6 * 3_600_000)) return old;
    if (pending.has(symbol)) return pending.get(symbol)!;
    const current = generation;
    const job = (async () => {
      let entry: Entry;
      try {
        const answer = await get(yahooResearchPath(symbol));
        if (answer.disabled) throw new Error('Yahoo is switched off on PROVIDERS.');
        if (answer.session === false) throw new Error('Yahoo refused the session. Open Yahoo consent on PROVIDERS.');
        if (answer.status !== 200) throw new Error(`Yahoo research answered HTTP ${answer.status || 'unavailable'}.`);
        const parsed = parseYahooResearch(answer.data, symbol, now());
        if ('error' in parsed) throw new Error(parsed.error);
        entry = { at: now(), checkedAt: now(), data: parsed.data };
      } catch (e) {
        entry = { at: old?.at ?? now(), checkedAt: now(), data: old?.data, error: e instanceof Error ? e.message : 'Yahoo research could not be loaded.' };
      }
      if (current === generation) {
        cache.set(symbol, entry);
        if (cache.size > 100) cache.delete(cache.keys().next().value!);
      }
      return entry;
    })();
    pending.set(symbol, job);
    try { return await job; } finally { if (pending.get(symbol) === job) pending.delete(symbol); }
  };
  return {
    clear() { generation++; cache.clear(); pending.clear(); },
    async load(kind: AnalystKind, symbol: string): Promise<AnalystPart> {
      const source = 'Yahoo Finance' as const;
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || kind === 'summary') return { state: 'error', source, message: 'This dataset is not supplied by the Yahoo research adapter.' };
      const entry = await read(symbol);
      if (!entry.data) return { state: 'error', source, message: entry.error };
      return { state: 'ok', source, data: entry.data[kind], currency: kind === 'estimates' ? entry.data.estimateCurrency : entry.data.quoteCurrency, at: entry.at, stale: !!entry.error, message: entry.error, recommendations: kind === 'ratings' ? entry.data.recommendations : undefined };
    },
  };
}

const desktop = createYahooResearchLoader((path) => window.arminDesktop!.yahoo(path));
export const retryYahooAnalysts = () => desktop.clear();
export const loadYahooAnalysts = (kind: AnalystKind, symbol: string): Promise<AnalystPart> => {
  if (!window.arminDesktop?.yahoo || window.arminDesktop.settings?.YAHOO_RESEARCH_ENABLED === false) return Promise.resolve({ state: 'off', source: 'Yahoo Finance', message: 'Yahoo research is switched off on PROVIDERS.' });
  return desktop.load(kind, symbol);
};
