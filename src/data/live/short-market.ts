import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { earningsCalendar, requestListings, tickerKey } from './earnings-calendar';
import { parseFinraShort } from './nasdaq-company';

/**
 * The market's short interest at one settlement (SIA): FINRA's consolidated short interest for every US listing
 * trading over 500,000 shares a day, read by the desktop app without a key. Settlements fall twice a month (mid-month
 * and month end) and FINRA publishes each about a week and a half later; the latest one is found from a widely held
 * stock's own record. Shares outstanding, for the short interest as a share of them, come from Nasdaq's stock list
 * (market value over price).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ShortLine {
  symbol: string;
  name: string;
  /** FINRA's market: NYSE, NNM (Nasdaq Global Select and Global), SC (Nasdaq Capital Market), AMEX, ARCA, BZX, OTC. */
  market: string;
  shares: number;
  prior: number;
  /** Change on the settlement before, in percent, as FINRA gives it. */
  changePct: number;
  daysToCover: number;
  avgVolume: number;
  /** FINRA flags a settlement whose figures span a stock split. */
  split: boolean;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);

const COMPANY_END = /^(.*\b(?:Inc|Corp|Corporation|Company|Co|Ltd|Limited|Holdings|Group|Trust|plc|LLC|L\.P|N\.V|S\.A|AG|SE)\b\.?)(?:[\s,].*)?$/i;

/**
 * FINRA cuts names at 30 characters: "NVIDIA Corporation Common Stoc" is NVIDIA Corporation, "Opendoor Technologies
 * Inc Comm" Opendoor Technologies Inc. A cut name ends at its company suffix; a whole one loses its share class.
 */
export function finraName(name: unknown): string {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  const cut = n.length >= 30 ? COMPANY_END.exec(n)?.[1] : undefined;
  return cut ?? n.replace(/\s+(Class [A-Z]\s+)?(Common|Ordinary)(\s+\w*)?$/i, '');
}

/** One settlement as FINRA answers it. */
export function parseFinraSettlement(text: string): { data: ShortLine[] } | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'FINRA returned a page that is not JSON.' };
  }
  // A settlement not published yet answers with an empty list.
  if (!Array.isArray(j)) return { error: String(j?.message ?? 'FINRA returned no list.').slice(0, 200) };
  const out: ShortLine[] = [];
  for (const r of j) {
    const symbol = tickerKey(r?.symbolCode);
    const shares = num(r?.currentShortPositionQuantity);
    if (!symbol || !(shares >= 0)) continue;
    out.push({
      symbol,
      name: finraName(r?.issueName),
      market: String(r?.marketClassCode ?? ''),
      shares,
      prior: num(r?.previousShortPositionQuantity),
      changePct: num(r?.changePercent),
      daysToCover: num(r?.daysToCoverQuantity),
      avgVolume: num(r?.averageDailyVolumeQuantity),
      split: !!r?.stockSplitFlag,
    });
  }
  return { data: out };
}

interface Part<T> {
  state: 'loading' | 'ok' | 'error';
  data?: T;
  message?: string;
  at?: number;
}

export const shortMarket = createStore<{ v: number; dates?: Part<string[]>; settlements: Record<string, Part<ShortLine[]>> }>({ v: 0, settlements: {} });

export function shortMarketAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.finra === 'function';
}

const bump = (f: (s: ReturnType<typeof shortMarket.get>) => Partial<ReturnType<typeof shortMarket.get>>) => shortMarket.set((s) => ({ ...s, ...f(s), v: s.v + 1 }));
const asked = new Map<string, number>();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The settlements FINRA has published in the last 75 days, newest first, from Apple's record (then SPY's). */
async function loadDates() {
  if (Date.now() - (asked.get('dates') ?? 0) < 3 * 3_600_000) return;
  asked.set('dates', Date.now());
  if (!shortMarket.get().dates) bump(() => ({ dates: { state: 'loading' } }));
  let message = 'FINRA did not answer.';
  for (const probe of ['AAPL', 'SPY']) {
    try {
      const res = await window.arminDesktop!.finra!('short-interest', probe);
      const parsed = res.text ? parseFinraShort(res.text) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
      if ('error' in parsed) {
        message = `FINRA: ${parsed.error}`;
        continue;
      }
      if (!parsed.data?.length) continue;
      bump(() => ({ dates: { state: 'ok', data: [...new Set(parsed.data!.map((r) => iso(r.date)))] } }));
      return;
    } catch {
      message = 'FINRA: the request could not be made.';
    }
  }
  asked.delete('dates');
  bump((s) => ({ dates: { state: 'error', message, data: s.dates?.data } }));
}

async function loadSettlement(date: string) {
  const key = `s:${date}`;
  if (Date.now() - (asked.get(key) ?? 0) < 6 * 3_600_000) return;
  asked.set(key, Date.now());
  if (!shortMarket.get().settlements[date]) bump((s) => ({ settlements: { ...s.settlements, [date]: { state: 'loading' } } }));
  try {
    const res = await window.arminDesktop!.finra!('settlement', date);
    const parsed = res.text ? parseFinraSettlement(res.text) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
    if ('error' in parsed) asked.delete(key);
    bump((s) => ({ settlements: { ...s.settlements, [date]: 'error' in parsed ? { state: 'error', message: `FINRA: ${parsed.error}`, data: s.settlements[date]?.data } : { state: 'ok', data: parsed.data, at: res.at ?? Date.now() } } }));
  } catch {
    asked.delete(key);
    bump((s) => ({ settlements: { ...s.settlements, [date]: { state: 'error', message: 'FINRA: the request could not be made.' } } }));
  }
}

export interface MarketShorts {
  /** Published settlements, newest first. */
  dates: string[];
  /** The settlement shown. */
  date?: string;
  lines: ShortLine[];
  state: 'loading' | 'ok' | 'error';
  message?: string;
  /** Shares outstanding by ticker (Nasdaq's market value over its price), when its stock list has loaded. */
  outstanding: (symbol: string) => number;
  /** The company's name on Nasdaq's stock list, whole where FINRA's is cut. */
  listedName: (symbol: string) => string | undefined;
}

/**
 * A settlement's short interest (`back` settlements before the latest), loading it while a screen shows it and
 * `enabled` (a screen that plots it only on request).
 */
export function useMarketShorts(back: number, enabled = true): MarketShorts {
  shortMarket.use((s) => s.v);
  earningsCalendar.use((s) => s.v);
  const s = shortMarket.get();
  const dates = s.dates?.data ?? [];
  const date = dates[Math.min(back, dates.length - 1)];
  useEffect(() => {
    if (!enabled || !shortMarketAvailable()) return;
    requestListings();
    void loadDates();
  }, [enabled]);
  useEffect(() => {
    if (enabled && shortMarketAvailable() && date) void loadSettlement(date);
  }, [date, enabled]);
  const part = date ? s.settlements[date] : undefined;
  const listings = earningsCalendar.get().listings?.data;
  return {
    dates,
    date,
    lines: part?.data ?? [],
    state: s.dates?.state === 'error' && !dates.length ? 'error' : !part || part.state === 'loading' ? 'loading' : part.state,
    message: (s.dates?.state === 'error' ? s.dates.message : undefined) ?? part?.message,
    outstanding: (symbol) => {
      const l = listings?.get(symbol);
      return l && l.cap > 0 && (l.price ?? NaN) > 0 ? l.cap / l.price! : NaN;
    },
    listedName: (symbol) => listings?.get(symbol)?.name || undefined,
  };
}
