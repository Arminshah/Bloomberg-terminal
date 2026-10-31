// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { cusipValid, sedolValid } from '../../core/identifiers';
import { createStore } from '../../core/store';
import { engine } from '../market';
import { desktopData, yahooGet } from './yahoo';
import { earningsCalendar, nasdaqNumber, requestListings, tickerKey, type Listing } from './earnings-calendar';
import type { KeyedAnswer } from './lookup';

/**
 * The full membership of the indices the monitors analyse (MOV, MEMB, MOST, IMAP, MRR), with every member's price
 * from Yahoo (its regular session, as everywhere else in the app), its share volume from Nasdaq and its market
 * value and sector from Nasdaq's stock list. The S&P 500's members and GICS sectors come from the public list kept
 * from the index's published membership; the Nasdaq-100's from Nasdaq; the Dow's from Yahoo, else the list below.
 *
 * Weights are estimates: market values (not the index provider's float-adjusted ones) for the S&P 500 and the
 * Nasdaq-100, previous closes for the price-weighted Dow. Each screen says so.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type IndexKey = 'SPX' | 'NDX' | 'INDU';

export interface BoardIndex {
  key: IndexKey;
  id: string;
  weighting: 'cap' | 'price';
  /** Where the membership comes from, for the screens' notes. */
  from: string;
}

export const BOARD_INDICES: Record<string, BoardIndex> = {
  'SPX Index': { key: 'SPX', id: 'SPX Index', weighting: 'cap', from: 'the S&P 500 member list (public dataset)' },
  'NDX Index': { key: 'NDX', id: 'NDX Index', weighting: 'cap', from: "Nasdaq's Nasdaq-100 list" },
  'INDU Index': { key: 'INDU', id: 'INDU Index', weighting: 'price', from: "Yahoo's Dow membership" },
};

/**
 * The Dow's members when Yahoo gives no membership (its last known composition; Yahoo's list wins when it answers).
 * Alphabet (GOOGL) replaced Verizon before trading on 29 June 2026 (S&P Dow Jones Indices, 23 June 2026); checked
 * against State Street's DIA holdings of 29 October 2026.
 */
export const DOW_FALLBACK = ['AAPL', 'AMGN', 'AMZN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS', 'GOOGL', 'GS', 'HD', 'HON', 'IBM', 'JNJ', 'JPM', 'KO', 'MCD', 'MMM', 'MRK', 'MSFT', 'NKE', 'NVDA', 'PG', 'SHW', 'TRV', 'UNH', 'V', 'WMT'];

export interface MemberInfo {
  /** Nasdaq's style: BRK.B. */
  symbol: string;
  name: string;
  sector: string;
  industry: string;
}

export interface MemberQuote {
  last: number;
  prevClose: number;
  /** Epoch ms of the last price. */
  time: number;
}

export interface Member extends MemberInfo {
  yahoo: string;
  /** Country of the company, as Nasdaq's stock list gives it. */
  country: string;
  /** The line in the app's universe, when there is one (opens its screens). */
  id?: string;
  last: number;
  prevClose: number;
  chg: number;
  pct: number;
  time: number;
  volume: number;
  /** Market value now, USD. */
  cap: number;
  /** Share of the index, 0 to 1 (estimated; see the module note). */
  weight: number;
  /** Index points this member added today (estimated for cap-weighted indices). */
  points: number;
}

/** State Street's holdings file for one SPDR fund, as electron/spdr.cjs reads it. */
export interface SpdrHoldings {
  fund: string;
  /** The holdings' date ("As of 29-Oct-2026"), ISO. */
  asOf: string;
  holdings: { name: string; ticker: string; cusip: string; sedol: string; weight: number; shares: number; currency: string }[];
  at: number;
  stale?: boolean;
  error?: string;
}
export type SpdrAnswer = SpdrHoldings | { error: string };

export interface ListState {
  state: 'loading' | 'ok' | 'error';
  members?: MemberInfo[];
  message?: string;
  at?: number;
}

export const indexData = createStore<{
  v: number;
  lists: Partial<Record<IndexKey, ListState>>;
  quotes: Record<string, MemberQuote>;
  volumes: Record<string, number>;
  quotesAt: Partial<Record<IndexKey, number>>;
  volumesAt: Partial<Record<IndexKey, number>>;
  history: Record<string, { t: number[]; c: number[] }>;
  historyAt: Partial<Record<IndexKey, number>>;
  problems: Partial<Record<IndexKey, string>>;
  /** SPY's and DIA's holdings (State Street), and why a file is missing. */
  holdings: Partial<Record<'SPY' | 'DIA', SpdrHoldings>>;
  holdingsProblem: Partial<Record<'SPY' | 'DIA', string>>;
}>({ v: 0, lists: {}, quotes: {}, volumes: {}, quotesAt: {}, volumesAt: {}, history: {}, historyAt: {}, problems: {}, holdings: {}, holdingsProblem: {} });

/** Answers are stored as they arrive; screens redraw at most every half second while a refresh runs. */
let notifyPending = false;
function bump(patch: (s: ReturnType<typeof indexData.get>) => Partial<ReturnType<typeof indexData.get>>) {
  indexData.set((s) => ({ ...s, ...patch(s) }));
  if (notifyPending) return;
  notifyPending = true;
  setTimeout(() => {
    notifyPending = false;
    indexData.set((s) => ({ ...s, v: s.v + 1 }));
  }, 500);
}

export function membersAvailable(): boolean {
  return desktopData() && typeof window !== 'undefined' && typeof window.arminDesktop?.indexMembers === 'function';
}

/** One CSV line into fields, with quoted fields ("Saint Paul, Minnesota"). */
export function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The S&P 500 member list: Symbol, Security, GICS Sector, GICS Sub-Industry, ... */
export function parseSp500(text: string): { data: MemberInfo[] } | { error: string } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = csvFields(lines[0] ?? '');
  const col = (name: string) => head.indexOf(name);
  const [s, n, sec, ind] = [col('Symbol'), col('Security'), col('GICS Sector'), col('GICS Sub-Industry')];
  if (s < 0 || n < 0) return { error: 'The S&P 500 member list has no Symbol or Security column.' };
  const out: MemberInfo[] = [];
  for (const line of lines.slice(1)) {
    const f = csvFields(line);
    const symbol = tickerKey(f[s]);
    if (!/^[A-Z][A-Z0-9]{0,6}(?:\.[A-Z]{1,2})?$/.test(symbol)) continue;
    out.push({ symbol, name: (f[n] ?? '').trim(), sector: (f[sec] ?? '').trim(), industry: (f[ind] ?? '').trim() });
  }
  // The index has about 500 members (503 with share classes); far fewer means a broken answer.
  return out.length >= 400 ? { data: out } : { error: `The S&P 500 member list has only ${out.length} members.` };
}

/** Nasdaq's Nasdaq-100 list: {data: {data: {rows: [{symbol, companyName, marketCap}]}}}. */
export function parseNasdaq100(text: string): { data: MemberInfo[] } | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Nasdaq returned a page that is not JSON.' };
  }
  const rows: any[] | undefined = j?.data?.data?.rows ?? j?.data?.rows;
  if (!Array.isArray(rows)) return { error: 'Nasdaq returned no Nasdaq-100 list.' };
  const out = rows
    .map((r) => ({ symbol: tickerKey(r?.symbol), name: String(r?.companyName ?? '').replace(/\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares|American Depositary Shares).*$/i, '').trim(), sector: '', industry: '' }))
    .filter((m) => /^[A-Z][A-Z0-9]{0,6}(?:\.[A-Z]{1,2})?$/.test(m.symbol));
  return out.length >= 90 ? { data: out } : { error: `The Nasdaq-100 list has only ${out.length} members.` };
}

/** Yahoo's spark answer (range=1d, interval=1d): each symbol's latest regular-session price and previous close. */
export function parseSpark(data: any): Record<string, MemberQuote> {
  const out: Record<string, MemberQuote> = {};
  const entries: [string, any][] = data && typeof data === 'object' && !data.spark ? Object.entries(data) : [];
  for (const [symbol, x] of entries) {
    const ts: number[] = Array.isArray(x?.timestamp) ? x.timestamp : [];
    const close: (number | null)[] = Array.isArray(x?.close) ? x.close : [];
    let i = Math.min(ts.length, close.length) - 1;
    while (i >= 0 && !(typeof close[i] === 'number' && (close[i] as number) > 0)) i--;
    const prev = Number(x?.chartPreviousClose ?? x?.previousClose);
    if (i < 0 || !(prev > 0)) continue;
    out[symbol] = { last: close[i] as number, prevClose: prev, time: ts[i] * 1000 };
  }
  return out;
}

/** Nasdaq's quotes: each stock's share volume today. */
export function parseNasdaqVolumes(text: string): Record<string, number> {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return {};
  }
  const out: Record<string, number> = {};
  for (const r of Array.isArray(j?.data) ? j.data : []) {
    const v = nasdaqNumber(r?.volume);
    if (Number.isFinite(v)) out[tickerKey(r?.symbol)] = v;
  }
  return out;
}

/** A member's symbol on Yahoo: BRK-B for BRK.B. */
export const yahooOf = (symbol: string) => symbol.replace('.', '-');

async function answer(kind: 'sp500' | 'nasdaq100' | 'nasdaq-quotes', arg = ''): Promise<KeyedAnswer> {
  return window.arminDesktop!.indexMembers!(kind, arg);
}

const listAsked = new Map<IndexKey, number>();
const holdingsAsked = new Map<'SPY' | 'DIA', number>();

/** One fund's holdings, asked at most every six hours (State Street updates them once a business day). */
async function loadHoldings(fund: 'SPY' | 'DIA'): Promise<SpdrHoldings | undefined> {
  const have = indexData.get().holdings[fund];
  const request = window.arminDesktop?.spdrHoldings;
  if (!request || Date.now() - (holdingsAsked.get(fund) ?? 0) < 6 * 3_600_000) return have;
  holdingsAsked.set(fund, Date.now());
  try {
    const got = await request(fund);
    if ('holdings' in got && got.holdings.length) bump((s) => ({ holdings: { ...s.holdings, [fund]: got }, holdingsProblem: { ...s.holdingsProblem, [fund]: got.stale ? got.error : undefined } }));
    else bump((s) => ({ holdingsProblem: { ...s.holdingsProblem, [fund]: got.error ?? 'No holdings.' } }));
  } catch {
    bump((s) => ({ holdingsProblem: { ...s.holdingsProblem, [fund]: 'State Street did not answer.' } }));
  }
  return indexData.get().holdings[fund];
}

/**
 * A US stock's CUSIP and SEDOL as SPY's holdings file lists them (S&P 500 members), loading the file once; undefined
 * when SPY does not hold the stock or its codes fail their check digits.
 */
export function useFundIdentifiers(symbol: string | null): { cusip: string; sedol: string; asOf: string } | undefined {
  indexData.use((s) => s.v);
  useEffect(() => {
    if (symbol && membersAvailable()) void loadHoldings('SPY');
  }, [symbol]);
  return symbol ? fundIdentifiers(indexData.get().holdings.SPY, symbol) : undefined;
}

/** A holding's CUSIP and SEDOL (blank when its check digit fails), with the file's date. */
export function fundIdentifiers(file: SpdrHoldings | undefined, symbol: string): { cusip: string; sedol: string; asOf: string } | undefined {
  const h = file?.holdings.find((x) => x.ticker === symbol);
  if (!file || !h || !cusipValid(h.cusip)) return undefined;
  return { cusip: h.cusip, sedol: sedolValid(h.sedol) ? h.sedol : '', asOf: file.asOf };
}

/** The Dow's members from DIA's holdings: its stock tickers, when the file lists 28 to 32 of them. */
export function dowFromDia(h: SpdrHoldings | undefined): string[] {
  const tickers = (h?.holdings ?? []).filter((x) => x.currency === 'USD' && /^[A-Z]{1,5}$/.test(x.ticker)).map((x) => x.ticker);
  return tickers.length >= 28 && tickers.length <= 32 ? [...new Set(tickers)].sort() : [];
}

async function loadList(key: IndexKey) {
  const have = indexData.get().lists[key];
  if (have?.state === 'ok' && Date.now() - (listAsked.get(key) ?? 0) < 12 * 3_600_000) return;
  if (have?.state === 'loading') return;
  listAsked.set(key, Date.now());
  if (!have) bump((s) => ({ lists: { ...s.lists, [key]: { state: 'loading' } } }));
  let next: ListState;
  try {
    if (key === 'INDU') {
      // Yahoo's membership when it answers (it needs its session), else the list kept here.
      let list: string[] = [];
      try {
        const res: any = await yahooGet('/v10/finance/quoteSummary/%5EDJI?modules=components');
        const got = res?.quoteSummary?.result?.[0]?.components?.components;
        if (Array.isArray(got)) list = got.map((x: unknown) => tickerKey(x)).filter((x: string) => /^[A-Z]{1,5}$/.test(x));
      } catch {
        /* the list below */
      }
      const fromYahoo = list.length >= 28;
      // Without Yahoo, DIA's holdings (the fund holds the 30 members) before the list kept here.
      const dia = fromYahoo ? undefined : await loadHoldings('DIA');
      const fromDia = dowFromDia(dia);
      const members = fromYahoo ? list : fromDia.length ? fromDia : DOW_FALLBACK;
      const message = fromYahoo ? undefined : fromDia.length ? `Membership from State Street's DIA holdings as of ${dia!.asOf} (Yahoo gave none).` : 'Membership as kept in the app (Yahoo gave none).';
      next = { state: 'ok', members: members.map((symbol) => ({ symbol, name: '', sector: '', industry: '' })), at: Date.now(), ...(message ? { message } : {}) };
    } else {
      const res = await answer(key === 'SPX' ? 'sp500' : 'nasdaq100');
      const parsed = res.text ? (key === 'SPX' ? parseSp500(res.text) : parseNasdaq100(res.text)) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
      next = 'error' in parsed ? { state: 'error', message: parsed.error, members: have?.members } : { state: 'ok', members: parsed.data, at: res.at ?? Date.now() };
    }
  } catch {
    next = { state: 'error', message: 'The member list could not be loaded.', members: have?.members };
  }
  if (next.state !== 'ok') listAsked.delete(key);
  bump((s) => ({ lists: { ...s.lists, [key]: next } }));
}

const running = new Set<string>();

/** Runs `fn` on each group of `size` items, three groups at a time. */
async function inGroups<T>(items: T[], size: number, fn: (group: T[]) => Promise<void>, concurrency = 3) {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  let next = 0;
  const worker = async () => {
    while (next < groups.length) await fn(groups[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, worker));
}

/** Prices for every member, 20 symbols a request (Yahoo's limit). */
async function refreshQuotes(key: IndexKey) {
  const members = indexData.get().lists[key]?.members;
  if (!members?.length || running.has(`q:${key}`)) return;
  running.add(`q:${key}`);
  let failures = 0;
  try {
    const symbols = members.map((m) => yahooOf(m.symbol));
    await inGroups(symbols, 20, async (batch) => {
      try {
        const data = await yahooGet(`/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=1d&interval=1d`);
        const got = parseSpark(data);
        bump((s) => ({ quotes: { ...s.quotes, ...got } }));
      } catch {
        failures++;
      }
    });
    bump((s) => ({ quotesAt: { ...s.quotesAt, [key]: Date.now() }, problems: { ...s.problems, [key]: failures ? `Yahoo did not answer for ${failures} of ${Math.ceil(symbols.length / 20)} groups of members.` : undefined } }));
  } finally {
    running.delete(`q:${key}`);
  }
}

/** Share volumes for every member from Nasdaq, 20 a request. */
async function refreshVolumes(key: IndexKey) {
  const members = indexData.get().lists[key]?.members;
  if (!members?.length || running.has(`v:${key}`)) return;
  running.add(`v:${key}`);
  try {
    await inGroups(members.map((m) => m.symbol), 20, async (batch) => {
      try {
        const res = await answer('nasdaq-quotes', batch.join(','));
        if (res.text) {
          const got = parseNasdaqVolumes(res.text);
          bump((s) => ({ volumes: { ...s.volumes, ...got } }));
        }
      } catch {
        /* the next refresh asks again */
      }
    });
    bump((s) => ({ volumesAt: { ...s.volumesAt, [key]: Date.now() } }));
  } finally {
    running.delete(`v:${key}`);
  }
}

/** A year of daily closes for every member (MRR's returns), 20 symbols a request, kept six hours. */
async function refreshHistory(key: IndexKey) {
  const members = indexData.get().lists[key]?.members;
  if (!members?.length || running.has(`h:${key}`)) return;
  running.add(`h:${key}`);
  try {
    const symbols = members.map((m) => yahooOf(m.symbol));
    await inGroups(symbols, 20, async (batch) => {
      try {
        const data: any = await yahooGet(`/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=1y&interval=1d`);
        const got: Record<string, { t: number[]; c: number[] }> = {};
        for (const [sym, x] of Object.entries<any>(data && typeof data === 'object' ? data : {})) {
          const ts: number[] = Array.isArray(x?.timestamp) ? x.timestamp : [];
          const cl: (number | null)[] = Array.isArray(x?.close) ? x.close : [];
          const t: number[] = [];
          const c: number[] = [];
          for (let k = 0; k < Math.min(ts.length, cl.length); k++) {
            if (typeof cl[k] === 'number' && (cl[k] as number) > 0) {
              t.push(ts[k] * 1000);
              c.push(cl[k] as number);
            }
          }
          if (c.length) got[sym] = { t, c };
        }
        bump((s) => ({ history: { ...s.history, ...got } }));
      } catch {
        /* the next refresh asks again */
      }
    });
    bump((s) => ({ historyAt: { ...s.historyAt, [key]: Date.now() } }));
  } finally {
    running.delete(`h:${key}`);
  }
}

/**
 * Loads the index's members and keeps their prices (every minute) and volumes (every two minutes) current while a
 * screen shows them. `history` also loads a year of daily closes.
 */
export function useIndexMembers(indexId: string | undefined, opts: { history?: boolean } = {}) {
  indexData.use((s) => s.v);
  earningsCalendar.use((s) => s.v);
  const b = indexId ? BOARD_INDICES[indexId] : undefined;
  useEffect(() => {
    if (!b || !membersAvailable()) return;
    const key = b.key;
    let stopped = false;
    const tick = async () => {
      if (stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      requestListings();
      if (key === 'SPX') void loadHoldings('SPY');
      await loadList(key);
      const s = indexData.get();
      if (Date.now() - (s.quotesAt[key] ?? 0) > 55_000) void refreshQuotes(key);
      if (Date.now() - (s.volumesAt[key] ?? 0) > 115_000) void refreshVolumes(key);
      if (opts.history && Date.now() - (s.historyAt[key] ?? 0) > 6 * 3_600_000) void refreshHistory(key);
    };
    void tick();
    const timer = setInterval(() => void tick(), 15_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [b, opts.history]);
  return b ? indexBoard(b.id) : null;
}

/** The index's member list only, loaded while a screen shows it, without the members' prices (EQBT). */
export function useIndexList(indexId: string | undefined): ListState | null {
  indexData.use((s) => s.v);
  const b = indexId ? BOARD_INDICES[indexId] : undefined;
  useEffect(() => {
    if (b && membersAvailable()) void loadList(b.key);
  }, [b]);
  return b ? (indexData.get().lists[b.key] ?? { state: 'loading' }) : null;
}

export interface Board {
  index: BoardIndex;
  state: 'loading' | 'ok' | 'error';
  message?: string;
  members: Member[];
  /** Members with a price so far. */
  priced: number;
  /** Members' points added up, against the index's own change. */
  explained: number;
  quotesAt?: number;
  volumesAt?: number;
  /** When the weights come from SPY's holdings: the file's date, and members it does not hold (added since). */
  weightsFrom?: { fund: 'SPY'; asOf: string; missing: string[] };
}

/**
 * A company with two share classes in the index (Alphabet, Fox, News Corp) has the company's whole value under each
 * class in Nasdaq's list; it is shared between its classes so the company is not counted twice.
 */
export function shareClassCaps(rows: { symbol: string; name: string; cap: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const firstWord = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0] ?? '';
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!Number.isFinite(r.cap)) continue;
    const k = `${firstWord(r.name)}:${Math.round(Math.log(r.cap) * 20)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const g of groups.values()) {
    const same = g.length > 1 && g.every((r) => Math.abs(r.cap / g[0].cap - 1) < 0.05);
    for (const r of g) out.set(r.symbol, same ? r.cap / g.length : r.cap);
  }
  return out;
}

/** The members with their prices, volumes, weights and points, from what has arrived (no request). */
export function indexBoard(indexId: string): Board | null {
  const b = BOARD_INDICES[indexId];
  if (!b) return null;
  const s = indexData.get();
  const list = s.lists[b.key];
  const listings: Map<string, Listing> | undefined = earningsCalendar.get().listings?.data;
  const infos = list?.members ?? [];
  const iq = engine.quote(b.id);
  const base = infos.map((m) => {
    const l = listings?.get(m.symbol);
    const q = s.quotes[yahooOf(m.symbol)];
    return { m, l, q, name: m.name || l?.name.replace(/\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares).*$/i, '').trim() || m.symbol };
  });
  const caps = shareClassCaps(base.map((x) => ({ symbol: x.m.symbol, name: x.name, cap: x.l?.cap ?? NaN })));
  // SPY holds the S&P 500 in full, so its shares of each member are in proportion to the index's float-adjusted
  // shares; at each member's previous close they give the index's weights. Used when the file covers the list.
  const spy = b.key === 'SPX' ? s.holdings.SPY : undefined;
  const held = spy ? new Map(spy.holdings.map((h) => [h.ticker, h.shares])) : undefined;
  const fromFund = !!held && base.length > 0 && base.filter((x) => held.has(x.m.symbol)).length >= 0.95 * base.length;
  const weightBase = base.map((x) => (b.weighting === 'price' ? x.q?.prevClose ?? NaN : fromFund ? (held!.get(x.m.symbol) ?? NaN) * (x.q?.prevClose ?? NaN) : caps.get(x.m.symbol) ?? NaN));
  const total = weightBase.reduce((a, w) => a + (Number.isFinite(w) ? w : 0), 0);
  const divisor = b.weighting === 'price' && iq && iq.prevClose > 0 ? total / iq.prevClose : NaN;
  const members: Member[] = base.map((x, i) => {
    const last = x.q?.last ?? NaN;
    const prevClose = x.q?.prevClose ?? NaN;
    const chg = last - prevClose;
    const pct = prevClose > 0 ? (chg / prevClose) * 100 : NaN;
    const weight = total > 0 && Number.isFinite(weightBase[i]) ? weightBase[i] / total : NaN;
    const points = b.weighting === 'price' ? chg / divisor : iq && iq.prevClose > 0 ? iq.prevClose * weight * (pct / 100) : NaN;
    const id = `${x.m.symbol.replace('.', '/')} US Equity`;
    const capNow = (caps.get(x.m.symbol) ?? NaN) * (prevClose > 0 ? last / prevClose : 1);
    return {
      ...x.m,
      name: x.name,
      sector: x.m.sector || x.l?.sector || '',
      industry: x.m.industry || x.l?.industry || '',
      country: x.l?.country || '',
      yahoo: yahooOf(x.m.symbol),
      ...(engine.get(id) ? { id } : {}),
      last,
      prevClose,
      chg,
      pct,
      time: x.q?.time ?? NaN,
      volume: s.volumes[x.m.symbol] ?? NaN,
      cap: capNow,
      weight,
      points,
    };
  });
  const priced = members.filter((m) => Number.isFinite(m.pct)).length;
  return {
    index: b,
    state: list?.state ?? 'loading',
    message: list?.message ?? s.problems[b.key],
    members,
    priced,
    explained: members.reduce((a, m) => a + (Number.isFinite(m.points) ? m.points : 0), 0),
    quotesAt: s.quotesAt[b.key],
    volumesAt: s.volumesAt[b.key],
    ...(fromFund ? { weightsFrom: { fund: 'SPY' as const, asOf: spy!.asOf, missing: base.filter((x) => !held!.has(x.m.symbol)).map((x) => x.m.symbol) } } : {}),
  };
}

/** A member's return over a period from its daily closes (1D uses the latest price); NaN when not covered. */
export function memberReturn(indexKey: IndexKey, m: Member, period: '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y'): number {
  if (period === '1D') return m.pct;
  const h = indexData.get().history[m.yahoo];
  if (!h?.c.length) return NaN;
  const last = Number.isFinite(m.last) ? m.last : h.c[h.c.length - 1];
  const end = h.t[h.t.length - 1];
  const d = new Date(end);
  const from =
    period === 'YTD'
      ? Date.UTC(d.getUTCFullYear(), 0, 1) - 1
      : end - { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 }[period] * 86_400_000;
  // The close on or before the start.
  let k = -1;
  for (let i = 0; i < h.t.length; i++) if (h.t[i] <= from) k = i;
  if (k < 0) return period === '1Y' && h.t[0] - from < 7 * 86_400_000 ? (last / h.c[0] - 1) * 100 : NaN;
  void indexKey;
  return (last / h.c[k] - 1) * 100;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
