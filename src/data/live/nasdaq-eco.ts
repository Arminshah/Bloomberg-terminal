import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';

/**
 * The economic calendar from Nasdaq's site (desktop app, no key): each day's releases in every country with the time,
 * the actual value, the consensus forecast and the previous value, as Nasdaq's data partner publishes them. The time
 * field is UTC-4 all year, New York's summer time: the app reads it so, which is New York time from March to
 * November and an hour later than New York in winter (US payrolls at 08:30 New York read 09:30 from November).
 * Values stay as published (with their units: 1.0%, A$5.5B); a number is read from them only to compare actual and
 * consensus.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NasdaqEcoEvent {
  id: string;
  /** Epoch ms of the release (GMT time on the day). */
  time: number;
  /** ISO-style code: US, EZ, GB, DE... */
  country: string;
  countryName: string;
  name: string;
  actual: string;
  consensus: string;
  previous: string;
  description: string;
  /** 1 to 3: how much markets watch it (a heuristic on the event's name: Nasdaq gives no importance). */
  relevance: number;
}

const COUNTRY: Record<string, string> = {
  'United States': 'US', 'Euro Zone': 'EZ', Eurozone: 'EZ', 'European Union': 'EU', Germany: 'DE', France: 'FR', Italy: 'IT', Spain: 'ES',
  'United Kingdom': 'GB', Japan: 'JP', China: 'CN', Canada: 'CA', Australia: 'AU', 'New Zealand': 'NZ', Switzerland: 'CH', Sweden: 'SE',
  Norway: 'NO', Denmark: 'DK', India: 'IN', Brazil: 'BR', Mexico: 'MX', 'South Africa': 'ZA', 'South Korea': 'KR', Korea: 'KR', Singapore: 'SG',
  'Hong Kong': 'HK', Russia: 'RU', Turkey: 'TR', Netherlands: 'NL', Belgium: 'BE', Austria: 'AT', Ireland: 'IE', Portugal: 'PT', Poland: 'PL',
  Indonesia: 'ID', Taiwan: 'TW', Chile: 'CL', Colombia: 'CO', Argentina: 'AR', Israel: 'IL', 'Saudi Arabia': 'SA', Greece: 'GR', Finland: 'FI',
};

const KEY = /nonfarm|non-farm|payrolls|\bcpi\b|consumer price|core pce|pce price|\bgdp\b|gross domestic|interest rate decision|rate decision|fomc|unemployment rate|retail sales|ism manufacturing|ism non-manufacturing|ism services|jolts|employment change/i;
const MID = /pmi|ppi|producer price|industrial production|trade balance|consumer confidence|business confidence|sentiment|housing starts|building permits|durable goods|jobless claims|existing home|new home|ifo|zew|tankan|current account|speaks|speech|minutes/i;

/** "1.0%", "-4.10", "A$5.5B", "&nbsp;", " " into clean text. */
export function ecoValue(v: unknown): string {
  const s = String(v ?? '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return s === '-' ? '' : s;
}

/** The number in a published value, for comparing actual and consensus (units must match); NaN when none. */
export function ecoNumber(v: string): number {
  const m = /-?\d+(?:[.,]\d+)?/.exec(v.replace(/,(?=\d{3}\b)/g, ''));
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

const nyParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** A New York wall-clock time on a date as epoch ms (the calendar's times are New York's, whatever its heading says). */
export function newYorkTime(date: string, hour: number, minute: number): number {
  const wall = Date.parse(`${date}T00:00:00Z`) + (hour * 60 + minute) * 60_000;
  // The offset at that moment: format the wall time read as UTC in New York and see how far it moved.
  const at = (t: number) => {
    const p = Object.fromEntries(nyParts.formatToParts(t).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  };
  let t = wall + (wall - at(wall));
  // Once more for a time near a daylight-saving change.
  t += wall - at(t);
  return t;
}

/**
 * Nasdaq lists a day's releases under the next day's date, at their New York times: date=2026-10-23 (a Friday) gives
 * Thursday's jobless claims, date=2026-10-24 Friday's Michigan survey, date=2026-10-29 the Fed's decision of the 28th,
 * and date=2026-10-19 China's GDP released at 10:00 in Beijing that Monday (22:00 on Sunday in New York). The date to
 * ask for a day's releases, and the day a request's releases fall on.
 */
export const nasdaqEcoRequestDate = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
export const nasdaqEcoDay = (requestDate: string): string => new Date(Date.parse(`${requestDate}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

export function parseNasdaqEco(text: string, date: string): { data: NasdaqEcoEvent[] } | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Nasdaq returned a page that is not JSON.' };
  }
  const rows: any[] | null | undefined = j?.data?.rows;
  if (rows === null || (j?.data === null && j?.status?.rCode === 200)) return { data: [] };
  if (!Array.isArray(rows)) return { error: 'Nasdaq returned no economic calendar.' };
  // `date` is the request's; its releases are the day before's (see nasdaqEcoRequestDate).
  const day = nasdaqEcoDay(date);
  const base = Date.parse(`${day}T00:00:00Z`);
  return {
    data: rows
      .map((r, i): NasdaqEcoEvent | null => {
        const name = ecoValue(r?.eventName);
        const countryName = ecoValue(r?.country);
        const hm = /^(\d{1,2}):(\d{2})$/.exec(ecoValue(r?.gmt));
        if (!name || !Number.isFinite(base)) return null;
        // The "gmt" field is UTC-4 whatever the season: China's 10:00 GDP release (02:00 UTC) reads 22:00 the evening
        // before; checked on 31 October 2026 against the BLS's schedule (payrolls of 6 November at 08:30 New York,
        // listed at 09:30) and Germany's PMI at 09:55 Frankfurt, listed 03:55 in October and 04:55 in November.
        const time = hm ? base + ((Number(hm[1]) + 4) * 60 + Number(hm[2])) * 60_000 : base;
        return {
          id: `${date}:${i}:${name}`,
          time,
          country: COUNTRY[countryName] ?? countryName.slice(0, 2).toUpperCase(),
          countryName,
          name,
          actual: ecoValue(r?.actual),
          consensus: ecoValue(r?.consensus),
          previous: ecoValue(r?.previous),
          description: ecoValue(r?.description),
          relevance: KEY.test(name) ? 3 : MID.test(name) ? 2 : 1,
        };
      })
      .filter((e): e is NasdaqEcoEvent => !!e),
  };
}

export const nasdaqEco = createStore<{ v: number; days: Record<string, { state: 'ok' | 'error' | 'loading'; events?: NasdaqEcoEvent[]; message?: string; at?: number }> }>({ v: 0, days: {} });

export function nasdaqEcoAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.earningsCalendar === 'function';
}

const asked = new Map<string, number>();

async function loadDay(date: string, now: number) {
  const t = Date.parse(`${date}T00:00:00Z`);
  // Days around today are asked again every quarter of an hour; settled days once.
  const again = Math.abs(t - now) < 2 * DAY_MS ? 15 * 60_000 : 6 * 3_600_000;
  if (Date.now() - (asked.get(date) ?? 0) < again) return;
  asked.set(date, Date.now());
  const have = nasdaqEco.get().days[date];
  if (!have) nasdaqEco.set((s) => ({ v: s.v + 1, days: { ...s.days, [date]: { state: 'loading' } } }));
  try {
    const res = await window.arminDesktop!.earningsCalendar!('nasdaq-eco', date, date);
    const parsed = res.text ? parseNasdaqEco(res.text, date) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
    const next = 'error' in parsed ? { state: 'error' as const, message: `Nasdaq: ${parsed.error}`, events: have?.events } : { state: 'ok' as const, events: parsed.data, at: res.at ?? Date.now() };
    if (next.state === 'error') asked.delete(date);
    nasdaqEco.set((s) => ({ v: s.v + 1, days: { ...s.days, [date]: next } }));
  } catch {
    asked.delete(date);
    nasdaqEco.set((s) => ({ v: s.v + 1, days: { ...s.days, [date]: { state: 'error', message: 'Nasdaq: the request could not be made.', events: have?.events } } }));
  }
}

/** The week's events from Nasdaq (loaded day by day, today first), with whether any day is still loading or failed. */
export function useNasdaqEco(start: number, days: number, now: number): { events: NasdaqEcoEvent[]; loading: boolean; failed: boolean; any: boolean } {
  nasdaqEco.use((s) => s.v);
  // The request dates whose releases fall on the days shown (each a day later).
  const list = Array.from({ length: days }, (_, i) => nasdaqEcoRequestDate(new Date(start + i * DAY_MS).toISOString().slice(0, 10)));
  const key = list.join(',');
  useEffect(() => {
    if (!nasdaqEcoAvailable()) return;
    const today = nasdaqEcoRequestDate(new Date(now).toISOString().slice(0, 10));
    const order = [...list].sort((a, b) => Number(b === today) - Number(a === today));
    let stopped = false;
    void (async () => {
      for (const d of order) {
        if (stopped) return;
        await loadDay(d, now);
      }
    })();
    const timer = setInterval(() => void loadDay(today, Date.now()), 5 * 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const s = nasdaqEco.get().days;
  const parts = list.map((d) => s[d]);
  return {
    events: parts.flatMap((p) => p?.events ?? []).sort((a, b) => a.time - b.time),
    loading: parts.some((p) => !p || p.state === 'loading'),
    failed: parts.every((p) => p?.state === 'error'),
    any: parts.some((p) => p?.state === 'ok'),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
