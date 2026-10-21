import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { yahooGet } from './yahoo';

/**
 * IPO, capital raisings: US initial public offerings from Nasdaq's IPO calendar (desktop app, no key), month by
 * month: deals priced (with the offer price, shares and amount), expected, filed and withdrawn. The performance
 * since the offer and on the first day comes from Yahoo's daily closes for the new listings.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type IpoStatus = 'priced' | 'upcoming' | 'filed' | 'withdrawn';

export interface IpoDeal {
  id: string;
  status: IpoStatus;
  symbol: string;
  name: string;
  exchange: string;
  /** Offer price; for an expected deal the middle of its range. */
  price?: number;
  priceLow?: number;
  priceHigh?: number;
  shares?: number;
  /** Amount offered, USD. */
  amount?: number;
  /** Priced, expected, filed or withdrawn date (epoch ms, UTC midnight). */
  date: number;
  /** For a withdrawn deal, when it was filed. */
  filed?: number;
  /** A blank-cheque company (SPAC) selling units at $10, which IPO screens usually leave out. */
  spac: boolean;
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : NaN;
};

/** "10/16/2026" → epoch ms. */
export function usDate(v: unknown): number {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? '').trim());
  return m ? Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : NaN;
}

const SPAC = /\b(acquisition|merger)\s+(corp|corporation|company|co|ltd|limited|inc|holdings?)\b|\bSPAC\b|\bblank check\b/i;

export function isSpac(name: string, symbol: string, price?: number): boolean {
  return SPAC.test(name) || (/U$/.test(symbol) && price === 10);
}

function deal(r: any, status: IpoStatus): IpoDeal | null {
  const name = String(r?.companyName ?? '').trim();
  if (!name) return null;
  const symbol = String(r?.proposedTickerSymbol ?? '').trim().toUpperCase();
  const range = String(r?.proposedSharePrice ?? '').split('-').map(num).filter(Number.isFinite);
  const priceLow = range.length ? Math.min(...range) : undefined;
  const priceHigh = range.length ? Math.max(...range) : undefined;
  const price = priceLow != null && priceHigh != null ? (priceLow + priceHigh) / 2 : undefined;
  const date = status === 'priced' ? usDate(r?.pricedDate) : status === 'upcoming' ? usDate(r?.expectedPriceDate) : status === 'withdrawn' ? usDate(r?.withdrawDate) : usDate(r?.filedDate);
  if (!Number.isFinite(date)) return null;
  const shares = num(r?.sharesOffered);
  const amount = num(r?.dollarValueOfSharesOffered);
  return {
    id: String(r?.dealID ?? `${status}:${symbol}:${name}`),
    status,
    symbol,
    name: name.replace(/\s+/g, ' '),
    exchange: String(r?.proposedExchange ?? '').trim(),
    ...(price != null ? { price } : {}),
    ...(range.length > 1 ? { priceLow, priceHigh } : {}),
    ...(Number.isFinite(shares) ? { shares } : {}),
    ...(Number.isFinite(amount) ? { amount } : Number.isFinite(shares) && price != null ? { amount: shares * price } : {}),
    date,
    ...(status === 'withdrawn' && Number.isFinite(usDate(r?.filedDate)) ? { filed: usDate(r?.filedDate) } : {}),
    spac: isSpac(name, symbol, price),
  };
}

/** One month of the calendar: the deals in each section. */
export function parseNasdaqIpo(text: string): { data: IpoDeal[] } | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Nasdaq returned a page that is not JSON.' };
  }
  const d = j?.data;
  if (!d || typeof d !== 'object') return { error: 'Nasdaq returned no IPO calendar.' };
  const rows = (x: any): any[] => (Array.isArray(x?.rows) ? x.rows : Array.isArray(x?.upcomingTable?.rows) ? x.upcomingTable.rows : []);
  const out: IpoDeal[] = [];
  for (const [status, part] of [['priced', d.priced], ['upcoming', d.upcoming], ['filed', d.filed], ['withdrawn', d.withdrawn]] as [IpoStatus, any][]) {
    for (const r of rows(part)) {
      const x = deal(r, status);
      if (x) out.push(x);
    }
  }
  return { data: out };
}

/** Months from `from` to `to` (YYYY-MM), both included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface IpoTrading {
  /** First close after the pricing date. */
  first?: number;
  last?: number;
}

export const ipoData = createStore<{ v: number; months: Record<string, { state: 'loading' | 'ok' | 'error'; deals?: IpoDeal[]; message?: string }>; trading: Record<string, IpoTrading> }>({ v: 0, months: {}, trading: {} });

export function ipoAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.earningsCalendar === 'function';
}

const asked = new Map<string, number>();

async function loadMonth(month: string) {
  const current = new Date().toISOString().slice(0, 7);
  if (Date.now() - (asked.get(month) ?? 0) < (month < current ? 6 * 3_600_000 : 30 * 60_000)) return;
  asked.set(month, Date.now());
  if (!ipoData.get().months[month]) ipoData.set((s) => ({ ...s, v: s.v + 1, months: { ...s.months, [month]: { state: 'loading' } } }));
  try {
    const res = await window.arminDesktop!.earningsCalendar!('nasdaq-ipo', month, month);
    const parsed = res.text ? parseNasdaqIpo(res.text) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
    if ('error' in parsed) asked.delete(month);
    ipoData.set((s) => ({ ...s, v: s.v + 1, months: { ...s.months, [month]: 'error' in parsed ? { state: 'error', message: `Nasdaq: ${parsed.error}`, deals: s.months[month]?.deals } : { state: 'ok', deals: parsed.data } } }));
  } catch {
    asked.delete(month);
    ipoData.set((s) => ({ ...s, v: s.v + 1, months: { ...s.months, [month]: { state: 'error', message: 'Nasdaq: the request could not be made.' } } }));
  }
}

/** The first close on or after the day after pricing, and the latest close, from a spark answer. */
export function tradingFrom(x: any, pricedAt: number): IpoTrading {
  const ts: number[] = Array.isArray(x?.timestamp) ? x.timestamp : [];
  const close: (number | null)[] = Array.isArray(x?.close) ? x.close : [];
  let first: number | undefined;
  let last: number | undefined;
  for (let i = 0; i < Math.min(ts.length, close.length); i++) {
    const c = close[i];
    if (typeof c !== 'number' || !(c > 0)) continue;
    if (first == null && ts[i] * 1000 >= pricedAt + 12 * 3_600_000) first = c;
    last = c;
  }
  return { ...(first != null ? { first } : {}), ...(last != null ? { last } : {}) };
}

const tradingAsked = new Map<string, number>();

/** Daily closes for the priced deals, 20 symbols a request. */
async function loadTrading(deals: IpoDeal[]) {
  const want = deals.filter((d) => d.status === 'priced' && /^[A-Z][A-Z0-9.]{0,6}$/.test(d.symbol) && Date.now() - (tradingAsked.get(d.symbol) ?? 0) > 30 * 60_000);
  for (const d of want) tradingAsked.set(d.symbol, Date.now());
  const oldest = Math.min(...want.map((d) => d.date));
  const range = Date.now() - oldest > 360 * 86_400_000 ? '5y' : '1y';
  for (let i = 0; i < want.length; i += 20) {
    const batch = want.slice(i, i + 20);
    try {
      const data: any = await yahooGet(`/v8/finance/spark?symbols=${batch.map((d) => encodeURIComponent(d.symbol.replace('.', '-'))).join(',')}&range=${range}&interval=1d`);
      const got: Record<string, IpoTrading> = {};
      for (const d of batch) {
        const x = data?.[d.symbol.replace('.', '-')];
        if (x) got[d.symbol] = tradingFrom(x, d.date);
      }
      ipoData.set((s) => ({ ...s, v: s.v + 1, trading: { ...s.trading, ...got } }));
    } catch {
      for (const d of batch) tradingAsked.delete(d.symbol);
    }
  }
}

/** The deals of the months asked for (loaded newest first), with whether any month is still loading or failed. */
export function useIpoCalendar(months: string[], trading: boolean): { deals: IpoDeal[]; loading: boolean; failed: string[]; trading: Record<string, IpoTrading> } {
  ipoData.use((s) => s.v);
  const key = months.join(',');
  useEffect(() => {
    if (!ipoAvailable()) return;
    let stopped = false;
    void (async () => {
      for (const m of [...months].reverse()) {
        if (stopped) return;
        await loadMonth(m);
      }
      if (trading && !stopped) {
        const s = ipoData.get();
        await loadTrading(months.flatMap((m) => s.months[m]?.deals ?? []));
      }
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trading]);
  const s = ipoData.get();
  const parts = months.map((m) => s.months[m]);
  const seen = new Set<string>();
  const deals = parts.flatMap((p) => p?.deals ?? []).filter((d) => (seen.has(`${d.status}:${d.id}`) ? false : (seen.add(`${d.status}:${d.id}`), true)));
  return { deals, loading: parts.some((p) => !p || p.state === 'loading'), failed: [...new Set(parts.filter((p) => p?.state === 'error').map((p) => p!.message ?? 'error'))], trading: s.trading };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
