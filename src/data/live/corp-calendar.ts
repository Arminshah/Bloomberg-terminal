import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import { companyName } from './earnings-calendar';
import { usDate } from './ipo';

/**
 * Corporate actions across the market from Nasdaq's public calendars (desktop app, no key): each day's dividends
 * going ex, with their amount, record and payment dates and the announcement, and the recent and coming stock
 * splits. Nasdaq lists the dividends it has an announcement for, not every one.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DividendEvent {
  symbol: string;
  name: string;
  /** Ex-dividend, record, payment and announcement dates (epoch ms, UTC midnight); NaN when not given. */
  ex: number;
  record: number;
  pay: number;
  announced: number;
  /** Per share, in dollars. */
  amount: number;
  /** Nasdaq's historical annual dividend; NaN when it gives none (or zero). */
  annual: number;
}

export interface SplitEvent {
  symbol: string;
  name: string;
  /** New shares for old: 3 for 1 is a split, 1 for 10 a reverse split. */
  newShares: number;
  oldShares: number;
  effective: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : NaN;
};

/** The rows of a Nasdaq calendar; none when Nasdaq answers that the day has nothing ("rows": null). */
function rowsOf(text: string, where: (j: any) => { rows?: unknown } | null | undefined): { rows: any[] } | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Nasdaq returned a page that is not JSON.' };
  }
  const table = where(j);
  if (Array.isArray(table?.rows)) return { rows: table.rows };
  if (j?.status?.rCode === 200 && table && table.rows === null) return { rows: [] };
  return { error: j?.message || 'Nasdaq returned no calendar.' };
}

/** One day of Nasdaq's dividend calendar. */
export function parseNasdaqDividends(text: string): { data: DividendEvent[] } | { error: string } {
  const r = rowsOf(text, (j) => j?.data?.calendar);
  if ('error' in r) return r;
  const out: DividendEvent[] = [];
  for (const x of r.rows) {
    const symbol = String(x?.symbol ?? '').trim().toUpperCase();
    const ex = usDate(x?.dividend_Ex_Date);
    const amount = num(x?.dividend_Rate);
    if (!symbol || !Number.isFinite(ex) || !Number.isFinite(amount)) continue;
    const annual = num(x?.indicated_Annual_Dividend);
    out.push({ symbol, name: companyName(String(x?.companyName ?? '')), ex, record: usDate(x?.record_Date), pay: usDate(x?.payment_Date), announced: usDate(x?.announcement_Date), amount, annual: annual > 0 ? annual : NaN });
  }
  return { data: out };
}

/** "3 : 1", "1:20". */
export function splitRatio(v: unknown): [number, number] | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/-]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a > 0 && b > 0 && a !== b ? [a, b] : null;
}

/** Nasdaq's split calendar. */
export function parseNasdaqSplits(text: string): { data: SplitEvent[] } | { error: string } {
  const r = rowsOf(text, (j) => j?.data);
  if ('error' in r) return r;
  const out: SplitEvent[] = [];
  for (const x of r.rows) {
    const symbol = String(x?.symbol ?? '').trim().toUpperCase();
    const ratio = splitRatio(x?.ratio);
    const effective = usDate(x?.executionDate);
    if (!symbol || !ratio || !Number.isFinite(effective)) continue;
    out.push({ symbol, name: companyName(String(x?.name ?? '')), newShares: ratio[0], oldShares: ratio[1], effective });
  }
  return { data: out };
}

interface Part<T> {
  state: 'loading' | 'ok' | 'error';
  data?: T;
  message?: string;
}

export const corpCalendar = createStore<{ v: number; days: Record<string, Part<DividendEvent[]>>; splits?: Part<SplitEvent[]> }>({ v: 0, days: {} });

export function corpCalendarAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.earningsCalendar === 'function';
}

const bump = (f: (s: ReturnType<typeof corpCalendar.get>) => Partial<ReturnType<typeof corpCalendar.get>>) => corpCalendar.set((s) => ({ ...s, ...f(s), v: s.v + 1 }));
const asked = new Map<string, number>();
const queue: { key: string; run: () => Promise<void> }[] = [];
let running = 0;

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    void job.run().finally(() => {
      running--;
      pump();
    });
  }
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function askDay(date: string) {
  const key = `div:${date}`;
  const past = Date.parse(`${date}T00:00:00Z`) < Date.now() - 3 * DAY_MS;
  if (Date.now() - (asked.get(key) ?? 0) < (past ? 12 * 3_600_000 : 30 * 60_000) || queue.some((j) => j.key === key)) return;
  asked.set(key, Date.now());
  if (!corpCalendar.get().days[date]) bump((s) => ({ days: { ...s.days, [date]: { state: 'loading' } } }));
  queue.push({
    key,
    run: async () => {
      try {
        const res = await window.arminDesktop!.earningsCalendar!('nasdaq-dividends', date, date);
        const parsed = res.text ? parseNasdaqDividends(res.text) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
        if ('error' in parsed) asked.delete(key);
        bump((s) => ({ days: { ...s.days, [date]: 'error' in parsed ? { state: 'error', message: `Nasdaq: ${parsed.error}`, data: s.days[date]?.data } : { state: 'ok', data: parsed.data } } }));
      } catch {
        asked.delete(key);
        bump((s) => ({ days: { ...s.days, [date]: { state: 'error', message: 'Nasdaq: the request could not be made.' } } }));
      }
    },
  });
}

async function loadSplits() {
  if (Date.now() - (asked.get('splits') ?? 0) < 60 * 60_000) return;
  asked.set('splits', Date.now());
  if (!corpCalendar.get().splits) bump(() => ({ splits: { state: 'loading' } }));
  try {
    const res = await window.arminDesktop!.earningsCalendar!('nasdaq-splits', '', '');
    const parsed = res.text ? parseNasdaqSplits(res.text) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
    if ('error' in parsed) asked.delete('splits');
    bump((s) => ({ splits: 'error' in parsed ? { state: 'error', message: `Nasdaq: ${parsed.error}`, data: s.splits?.data } : { state: 'ok', data: parsed.data } }));
  } catch {
    asked.delete('splits');
    bump(() => ({ splits: { state: 'error', message: 'Nasdaq: the request could not be made.' } }));
  }
}

/** The days from `from` to `to` (YYYY-MM-DD), weekdays only: no dividend goes ex on a weekend. */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) out.push(isoDay(t));
  }
  return out;
}

export interface CorpCalendar {
  dividends: DividendEvent[];
  splits: SplitEvent[];
  days: number;
  loading: number;
  problems: string[];
  splitsState?: Part<SplitEvent[]>['state'];
}

/** The dividends going ex from `from` to `to` and Nasdaq's split calendar, loading them while a screen shows them. */
export function useCorpCalendar(from: string, to: string): CorpCalendar {
  corpCalendar.use((s) => s.v);
  useEffect(() => {
    if (!corpCalendarAvailable()) return;
    const ask = () => {
      const now = Date.now();
      // Nearest days first.
      for (const d of weekdays(from, to).sort((a, b) => Math.abs(Date.parse(a) - now) - Math.abs(Date.parse(b) - now))) askDay(d);
      pump();
      void loadSplits();
    };
    ask();
    const t = setInterval(ask, 30 * 60_000);
    return () => clearInterval(t);
  }, [from, to]);
  const s = corpCalendar.get();
  const parts = weekdays(from, to).map((d) => s.days[d]);
  return {
    dividends: parts.flatMap((p) => p?.data ?? []),
    splits: s.splits?.data ?? [],
    days: parts.length,
    loading: parts.filter((p) => !p || p.state === 'loading').length,
    problems: [...new Set([...parts, s.splits].filter((p) => p?.state === 'error' && p.message).map((p) => p!.message!))],
    splitsState: s.splits?.state,
  };
}
