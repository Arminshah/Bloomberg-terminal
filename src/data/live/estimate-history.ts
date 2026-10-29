import { createStore } from '../../core/store';
import type { ReportTiming } from './consensus';
import type { EarningsMeta } from './earnings-evidence';

/**
 * A US-listed stock's earnings history (desktop app, no key): for each reported quarter, the consensus EPS and revenue
 * estimate before the report beside what the company reported, and the report date. Finviz's quote page (two years,
 * revenue only), and for EARNINGS the older quarters from Zacks' earnings page, or MarketBeat's when Zacks does not
 * answer (electron/estimate-history.cjs). It fills the expected revenue of past quarters, which Yahoo drops once a
 * quarter is reported, and the coming quarter's when no other source gives it.
 */

export type HistorySource = 'Finviz' | 'Zacks' | 'MarketBeat';

export interface HistoryQuarter extends EarningsMeta {
  ccy?: string;
  /** Scheduled event time supplied by the page; never proof of actual publication. */
  scheduledAt?: number;
  /** Report date, YYYY-MM-DD. */
  date: string;
  /** The fiscal quarter's last month, YYYY-MM (Finviz, Zacks); empty when the source names the quarter instead. */
  period: string;
  /** The quarter's end date as the source gives it (Finviz: the month's last day). */
  end?: string;
  /** The fiscal quarter, "Q1 2027" (MarketBeat). */
  label?: string;
  est: number;
  actual: number;
  timing?: ReportTiming;
}

export interface EstimateHistory {
  source: HistorySource;
  eps: HistoryQuarter[];
  /** Revenue in dollars. */
  sales: HistoryQuarter[];
  /** The diluted EPS in the company's statements, as the source gives it (Finviz, MarketBeat); no estimate. */
  gaap: HistoryQuarter[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMINGS: ReportTiming[] = ['Bef-mkt', 'Aft-mkt', 'During-mkt'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

function rows(list: unknown): HistoryQuarter[] {
  if (!Array.isArray(list)) return [];
  const out: HistoryQuarter[] = [];
  for (const r of list.slice(0, 40) as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || typeof r.date !== 'string' || !DATE.test(r.date)) continue;
    const period = typeof r.period === 'string' && /^\d{4}-\d{2}$/.test(r.period) ? r.period : '';
    const label = typeof r.label === 'string' && /^Q[1-4] \d{4}$/.test(r.label) ? r.label : undefined;
    const end = typeof r.end === 'string' && DATE.test(r.end) ? r.end : undefined;
    if (!period && !label) continue;
    const timing = TIMINGS.find((t) => t === r.timing);
    const basis = r.basis === 'gaap' || r.basis === 'adjusted' ? r.basis : 'unknown';
    const meta: EarningsMeta = { basis };
    if (r.epsType === 'basic' || r.epsType === 'diluted') meta.epsType = r.epsType;
    if (r.unit === 'per-share' || r.unit === 'currency') meta.unit = r.unit;
    for (const k of ['splitBasis', 'scope', 'dataset', 'sourceUrl'] as const) if (typeof r[k] === 'string') meta[k] = r[k];
    if (r.shareBasis === 'listing' || r.shareBasis === 'ordinary') meta.shareBasis = r.shareBasis;
    out.push({ ...meta, date: r.date, period, ...(end ? { end } : {}), ...(label ? { label } : {}), est: num(r.est), actual: num(r.actual), ...(timing ? { timing } : {}), ...(typeof r.ccy === 'string' && /^[A-Z]{3}$/.test(r.ccy) ? { ccy: r.ccy } : {}), ...(Number.isFinite(r.scheduledAt) ? { scheduledAt: r.scheduledAt as number } : {}) });
  }
  return out;
}

const SOURCES: HistorySource[] = ['Finviz', 'Zacks', 'MarketBeat'];

/** The main process's answer: each source's figures, in the order they are used. Null when none has any. */
export function parseHistory(text: string): EstimateHistory[] | null {
  try {
    const list = JSON.parse(text) as unknown;
    if (!Array.isArray(list)) return null;
    const out: EstimateHistory[] = [];
    for (const j of list.slice(0, 4) as { source?: unknown; eps?: unknown; sales?: unknown; gaap?: unknown }[]) {
      const source = SOURCES.find((x) => x === j?.source);
      if (!source || out.some((h) => h.source === source)) continue;
      const h = { source, eps: rows(j.eps), sales: rows(j.sales), gaap: rows(j.gaap).filter((r) => Number.isFinite(r.actual)) };
      if (h.eps.length || h.sales.length) out.push(h);
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** The month a quarter ends in from its end date, and the month before for an end in the first week (52/53-week years). */
export function periodMonth(end: string): string {
  const d = new Date(Date.parse(`${end}T00:00:00Z`) - (Number(end.slice(8, 10)) <= 7 ? 8 * 86_400_000 : 0));
  return d.toISOString().slice(0, 7);
}

/** 'earnings': every source (EARNINGS, the earnings card); 'calendar': Finviz's two years (EVENTS' lines). */
export type HistoryKind = 'earnings' | 'calendar';

interface HistoryEntry {
  state: 'loading' | 'ok' | 'error';
  kind: HistoryKind;
  data?: EstimateHistory[];
  message?: string;
  /** When the history was read; with `stale`, an earlier answer kept because the latest request failed. */
  at: number;
  attemptedAt?: number;
  lastSuccessfulAt?: number;
  stale?: boolean;
}

export const historyData = createStore<{ v: number; by: Record<string, HistoryEntry> }>({ v: 0, by: {} });

export function historyAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.estimateHistory === 'function';
}

/** Whether a stock's history is to be asked for: not loading, and none of this kind (or better) lately. */
function due(symbol: string, kind: HistoryKind): boolean {
  const have = historyData.get().by[symbol];
  if (!have) return true;
  if (have.state === 'loading') return false;
  const enough = have.kind === 'earnings' || kind === 'calendar';
  return !enough || Date.now() - (have.attemptedAt ?? have.at) >= (have.state === 'ok' && !have.stale ? 12 * 3_600_000 : 15 * 60_000);
}

/**
 * Loads a stock's history once every 12 hours (a failure is asked again after 15 minutes). A calendar history is
 * replaced by the full one when EARNINGS or the earnings card asks.
 */
export async function loadHistory(symbol: string | null | undefined, kind: HistoryKind = 'earnings') {
  if (!symbol || !historyAvailable() || !due(symbol, kind)) return;
  const have = historyData.get().by[symbol];
  const set = (e: HistoryEntry) => historyData.set((s) => ({ v: s.v + 1, by: { ...s.by, [symbol]: e } }));
  set({ ...(have ?? {}), state: 'loading', kind, at: have?.at ?? 0 });
  try {
    const res = await window.arminDesktop!.estimateHistory!(kind, symbol);
    const data = res.text ? parseHistory(res.text) : null;
    // A copy kept from an earlier answer keeps its own time and is asked for again after 15 minutes.
    set(data ? { state: 'ok', kind, data, at: res.at ?? Date.now(), lastSuccessfulAt: res.stale ? have?.lastSuccessfulAt ?? res.at : res.at ?? Date.now(), attemptedAt: Date.now(), ...(res.stale ? { stale: true, message: res.error ?? 'Earlier history retained after the latest source check failed.' } : {}) } : { state: 'error', kind, data: have?.data, message: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer'), at: have?.at ?? 0, lastSuccessfulAt: have?.lastSuccessfulAt, attemptedAt: Date.now(), stale: !!have?.data });
  } catch {
    set({ state: 'error', kind, data: have?.data, message: 'the request could not be made', at: have?.at ?? 0, lastSuccessfulAt: have?.lastSuccessfulAt, attemptedAt: Date.now(), stale: !!have?.data });
  }
}

/** A stock's histories, in the order they are used (Finviz, then Zacks or MarketBeat). */
export function historyFor(symbol: string | null | undefined): EstimateHistory[] | undefined {
  return symbol ? historyData.get().by[symbol]?.data : undefined;
}

// EVENTS' lines ask a few at a time, the most wanted first: the list is replaced as the calendar scrolls, so the lines
// on screen go before those scrolled past (the main process paces each source).
let wanted: string[] = [];
let inFlight = 0;
const IN_FLIGHT = 3;

function pumpWanted() {
  while (inFlight < IN_FLIGHT) {
    const symbol = wanted.find((s) => due(s, 'calendar'));
    if (!symbol) return;
    inFlight++;
    void loadHistory(symbol, 'calendar').finally(() => {
      inFlight--;
      pumpWanted();
    });
  }
}

/** The calendar lines that want a history, most wanted first (an empty list stops asking). */
export function wantHistories(symbols: string[]) {
  if (!historyAvailable()) return;
  wanted = [...new Set(symbols)];
  pumpWanted();
}
