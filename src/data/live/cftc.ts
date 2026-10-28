import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { KeyedAnswer } from './lookup';

/**
 * The CFTC's Commitments of Traders for COT (desktop app, no key): delayed, aggregated positions of reportable
 * traders by category, held at the close on each Tuesday and published by the CFTC the following Friday (15:30 New
 * York time, later after a holiday). Disaggregated for commodities, Traders in Financial Futures for financial
 * futures, Legacy for both; each futures only or futures and options combined.
 */

export type CotReport = 'legacy' | 'disaggregated' | 'tff';
export type CotMode = 'futures' | 'combined';

export interface CotGroup {
  key: string;
  label: string;
  long: number;
  short: number;
  net: number;
}

export interface CotPosition {
  code: string;
  market: string;
  /** The Tuesday the positions were held (YYYY-MM-DD). */
  positionDate: string;
  /** When the CFTC published the row on its platform; a later update time when it was revised. */
  published: string;
  updated?: string;
  openInterest: number;
  groups: CotGroup[];
}

export const GROUP_LABEL: Record<string, string> = {
  noncomm: 'Non-commercial',
  comm: 'Commercial',
  nonrept: 'Non-reportable',
  prod: 'Producer/merchant',
  swap: 'Swap dealers',
  mmoney: 'Managed money',
  other: 'Other reportables',
  dealer: 'Dealers',
  assetmgr: 'Asset managers',
  levmoney: 'Leveraged funds',
};

/** Each report's columns (as electron/cftc.cjs asks for them). */
const COLUMNS: Record<CotReport, [string, string, string][]> = {
  legacy: [
    ['noncomm', 'noncomm_positions_long_all', 'noncomm_positions_short_all'],
    ['comm', 'comm_positions_long_all', 'comm_positions_short_all'],
    ['nonrept', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
  disaggregated: [
    ['prod', 'prod_merc_positions_long', 'prod_merc_positions_short'],
    ['swap', 'swap_positions_long_all', 'swap__positions_short_all'],
    ['mmoney', 'm_money_positions_long_all', 'm_money_positions_short_all'],
    ['other', 'other_rept_positions_long', 'other_rept_positions_short'],
    ['nonrept', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
  tff: [
    ['dealer', 'dealer_positions_long_all', 'dealer_positions_short_all'],
    ['assetmgr', 'asset_mgr_positions_long', 'asset_mgr_positions_short'],
    ['levmoney', 'lev_money_positions_long', 'lev_money_positions_short'],
    ['other', 'other_rept_positions_long', 'other_rept_positions_short'],
    ['nonrept', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
};

/** The group each report is read for first: speculators' positioning as each report classes them. */
export const MAIN_GROUP: Record<CotReport, string> = { legacy: 'noncomm', disaggregated: 'mmoney', tff: 'levmoney' };
export const SECOND_GROUP: Record<CotReport, string> = { legacy: 'comm', disaggregated: 'prod', tff: 'assetmgr' };

/**
 * The markets COT shows, in order, with the app's line for each where it carries one: commodities (Disaggregated)
 * and financial futures (Traders in Financial Futures). Lists, not an object's keys: JavaScript puts number-like keys
 * such as '111659' first, which once left seven commodities out of the table.
 */
export const COT_COMMODITIES: [code: string, id: string][] = [
  ['067651', 'CL1 Comdty'], ['023651', 'NG1 Comdty'], ['022651', 'HO1 Comdty'], ['111659', 'XB1 Comdty'], ['088691', 'GC1 Comdty'], ['084691', 'SI1 Comdty'], ['076651', 'PL1 Comdty'], ['075651', 'PA1 Comdty'], ['085692', 'HG1 Comdty'],
  ['001602', 'W 1 Comdty'], ['002602', 'C 1 Comdty'], ['005602', 'S 1 Comdty'], ['083731', 'KC1 Comdty'], ['080732', 'SB1 Comdty'], ['073732', 'CC1 Comdty'], ['033661', 'CT1 Comdty'], ['057642', 'LC1 Comdty'], ['054642', 'LH1 Comdty'],
];
export const COT_FINANCIALS: [code: string, id: string][] = [
  ['13874A', 'ES1 Index'], ['209742', 'NQ1 Index'], ['239742', 'RTY1 Index'], ['042601', 'TU1 Comdty'], ['044601', 'FV1 Comdty'], ['043602', 'TY1 Comdty'], ['043607', 'UXY1 Comdty'], ['020601', 'US1 Comdty'], ['020604', 'WN1 Comdty'],
  ['134741', 'SFR1 Comdty'], ['045601', 'FF1 Comdty'], ['099741', 'EURUSD Curncy'], ['097741', 'USDJPY Curncy'], ['096742', 'GBPUSD Curncy'], ['232741', 'AUDUSD Curncy'], ['090741', 'USDCAD Curncy'], ['092741', 'USDCHF Curncy'],
  ['095741', 'USDMXN Curncy'], ['112741', 'NZDUSD Curncy'], ['102741', 'USDBRL Curncy'], ['1170E1', 'VIX Index'], ['133741', 'XBTUSD Curncy'],
];
export const COMMODITY_CODES = COT_COMMODITIES.map(([c]) => c);
export const FINANCIAL_CODES = COT_FINANCIALS.map(([c]) => c);
/** The app's line for a CFTC contract code. */
export const COT_MARKETS = new Map<string, string>([...COT_COMMODITIES, ...COT_FINANCIALS]);

/* eslint-disable @typescript-eslint/no-explicit-any */
const int = (v: any) => (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** A report's rows, each market's weeks newest first; rows that are not one are left out. */
export function parseCot(text: string, report: CotReport): Map<string, CotPosition[]> | { error: string } {
  let rows: any;
  try {
    rows = JSON.parse(text);
  } catch {
    return { error: 'The CFTC answered with something other than its data.' };
  }
  if (!Array.isArray(rows)) return { error: rows?.message ? `CFTC: ${String(rows.message).slice(0, 120)}` : 'The CFTC answered without rows.' };
  const out = new Map<string, CotPosition[]>();
  for (const r of rows) {
    const code = String(r?.cftc_contract_market_code ?? '');
    const positionDate = String(r?.report_date_as_yyyy_mm_dd ?? '').slice(0, 10);
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(positionDate)) continue;
    const groups = COLUMNS[report].map(([key, l, s]) => {
      const long = int(r[l]);
      const short = int(r[s]);
      return { key, label: GROUP_LABEL[key], long, short, net: long - short };
    });
    const published = String(r?.[':created_at'] ?? '');
    const updated = String(r?.[':updated_at'] ?? '');
    const list = out.get(code) ?? [];
    list.push({ code, market: String(r?.market_and_exchange_names ?? '').trim(), positionDate, published, ...(updated && updated !== published ? { updated } : {}), openInterest: int(r?.open_interest_all), groups });
    out.set(code, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.positionDate.localeCompare(a.positionDate));
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CotRow {
  pos: CotPosition;
  main: CotGroup;
  second: CotGroup;
  /** The main group's net against the previous report (usually the Tuesday before; a holiday moves it a day or two). */
  change: number;
  /** That report's position date; '' without one within ten days. */
  priorDate: string;
  /** The main group's net as a share of open interest, in percent. */
  netPctOi: number;
}

/** Each market's latest week, its main group's net and the change from the week before. */
export function cotRows(byCode: Map<string, CotPosition[]>, report: CotReport, codes: string[]): CotRow[] {
  const out: CotRow[] = [];
  for (const code of codes) {
    const weeks = byCode.get(code);
    if (!weeks?.length) continue;
    const pos = weeks[0];
    // The report before, as the CFTC's own "changes from" compare: on 10 November 2025 the positions were Monday's.
    const gap = weeks[1] ? (Date.parse(`${pos.positionDate}T00:00:00Z`) - Date.parse(`${weeks[1].positionDate}T00:00:00Z`)) / 86_400_000 : NaN;
    const prior = gap >= 4 && gap <= 10 ? weeks[1] : undefined;
    const main = pos.groups.find((g) => g.key === MAIN_GROUP[report])!;
    const second = pos.groups.find((g) => g.key === SECOND_GROUP[report])!;
    const priorMain = prior?.groups.find((g) => g.key === MAIN_GROUP[report]);
    out.push({ pos, main, second, change: priorMain ? main.net - priorMain.net : NaN, priorDate: prior?.positionDate ?? '', netPctOi: pos.openInterest > 0 ? (main.net / pos.openInterest) * 100 : NaN });
  }
  return out;
}

/**
 * Whether the newest report is older than the CFTC's schedule allows: positions held on a Tuesday are published that
 * Friday, or the Monday after a holiday, so they are at most 14 days old when the next report comes. After the
 * federal shutdown of October 2025 the reports came up to 50 days late.
 */
export function reportLate(positionDate: string, now: number): boolean {
  const t = Date.parse(`${positionDate}T00:00:00Z`);
  return Number.isFinite(t) && now - t > 15 * 86_400_000;
}

// ------------------------------------------------------------------ loading

export interface CotPart {
  state: 'loading' | 'ok' | 'error';
  text?: string;
  at?: number;
  stale?: boolean;
  cached?: boolean;
  message?: string;
}

export const cotData = createStore<{ v: number; by: Record<string, CotPart> }>({ v: 0, by: {} });

export function cotAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.cftc === 'function';
}

export function cotProblem(res: KeyedAnswer): string {
  if (res.status === 429 || res.throttled) return 'The CFTC platform asked the app to wait (rate limit); it asks again later.';
  if (res.status === 401 || res.status === 403) return `The CFTC platform refused the request (HTTP ${res.status}).`;
  if (res.status >= 500) return `The CFTC platform failed (HTTP ${res.status}).`;
  if (!res.status) return res.error ? `CFTC: ${res.error.slice(0, 100)}` : 'The CFTC platform did not answer (network or service).';
  return `The CFTC platform answered HTTP ${res.status}${res.error ? `: ${res.error.slice(0, 100)}` : ''}.`;
}

const asked = new Map<string, number>();

async function load(id: string, kind: 'latest' | 'history', report: CotReport, mode: CotMode, code?: string) {
  const api = window.arminDesktop;
  if (!api?.cftc) return;
  asked.set(id, Date.now());
  const put = (p: CotPart) => cotData.set((s) => ({ v: s.v + 1, by: { ...s.by, [id]: p } }));
  if (!cotData.get().by[id]) put({ state: 'loading' });
  try {
    const res = await api.cftc(kind, report, mode, code);
    if (res.text) put({ state: 'ok', text: res.text, at: res.at ?? Date.now(), stale: res.stale, cached: res.cached });
    else put({ state: 'error', message: cotProblem(res) });
  } catch {
    put({ state: 'error', message: 'The CFTC request could not be completed.' });
  }
}

/** One report (or one market's history) while a screen shows it: asked on opening, then hourly. */
export function useCot(kind: 'latest' | 'history', report: CotReport, mode: CotMode, code?: string): CotPart | undefined {
  const id = `${kind}:${report}:${mode}:${code ?? ''}`;
  cotData.use((s) => s.v);
  useEffect(() => {
    if (!cotAvailable() || (kind === 'history' && !code)) return;
    if (Date.now() - (asked.get(id) ?? 0) > 60_000) void load(id, kind, report, mode, code);
    const t = setInterval(() => void load(id, kind, report, mode, code), 60 * 60_000);
    return () => clearInterval(t);
  }, [id, kind, report, mode, code]);
  return cotData.get().by[id];
}
