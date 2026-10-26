import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { fredAvailable, parseFredObservations, type Obs } from './fred';

/**
 * Any FRED series for the economic data chart (ECOW, ECWB), with the owner's FRED key (desktop app): FRED's search,
 * each series' description (title, frequency, units, seasonal adjustment, the period it covers, when it was updated)
 * and its observations, transformed by FRED itself (change, % change, on a year ago, compounded annual rate). FRED
 * republishes each agency's figures; nothing is worked out here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FredSeriesInfo {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonal: string;
  start: string;
  end: string;
  updated: string;
  /** FRED's notes say the owner holds copyright on the figures (personal use only). */
  copyrighted: boolean;
}

export type FredUnits = 'lin' | 'chg' | 'ch1' | 'pch' | 'pc1' | 'pca';

export const UNITS: { key: FredUnits; label: string; short: string }[] = [
  { key: 'lin', label: 'Level', short: '' },
  { key: 'chg', label: 'Change', short: 'chg' },
  { key: 'ch1', label: 'Change on a year ago', short: 'chg 1y' },
  { key: 'pch', label: '% change', short: '%' },
  { key: 'pc1', label: '% change on a year ago', short: '% 1y' },
  { key: 'pca', label: 'Compounded annual rate %', short: '% ann.' },
];

function info(s: any): FredSeriesInfo | null {
  const id = String(s?.id ?? '');
  if (!/^[A-Z0-9_]{1,30}$/.test(id)) return null;
  return {
    id,
    title: String(s?.title ?? ''),
    frequency: String(s?.frequency ?? s?.frequency_short ?? ''),
    units: String(s?.units ?? s?.units_short ?? ''),
    seasonal: String(s?.seasonal_adjustment_short ?? ''),
    start: String(s?.observation_start ?? ''),
    end: String(s?.observation_end ?? ''),
    updated: String(s?.last_updated ?? '').slice(0, 10),
    copyrighted: /copyright/i.test(String(s?.notes ?? '')),
  };
}

/** fred/series/search and fred/series: {seriess: [...]}. */
export function parseFredSeriess(text: string): FredSeriesInfo[] | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(j?.seriess)) return null;
  return j.seriess.map(info).filter((x: FredSeriesInfo | null): x is FredSeriesInfo => !!x);
}

type Answer<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

export const fredChart = createStore<{ v: number; series: Record<string, Answer<FredSeriesInfo>>; obs: Record<string, Answer<Obs>>; searches: Record<string, Answer<FredSeriesInfo[]>> }>({ v: 0, series: {}, obs: {}, searches: {} });

const bump = (f: (s: ReturnType<typeof fredChart.get>) => Partial<ReturnType<typeof fredChart.get>>) => fredChart.set((s) => ({ ...s, ...f(s), v: s.v + 1 }));

async function call(kind: 'search' | 'series' | 'chart', arg: string, from?: string): Promise<{ text: string } | { error: string }> {
  try {
    const res = await window.arminDesktop!.fred!(kind, arg, from);
    if (res.missing) return { error: 'FRED needs your free API key: set FRED_API_KEY on PROVIDERS.' };
    if (res.refused) return { error: `FRED refused the key: ${res.refused}` };
    if (res.throttled) return { error: 'FRED asked the app to slow down; try again in a minute.' };
    return res.status === 200 ? { text: res.text } : { error: `FRED answered HTTP ${res.status}.` };
  } catch (err) {
    return { error: `FRED did not answer: ${String((err as Error)?.message ?? err)}` };
  }
}

const asked = new Map<string, number>();
const due = (key: string, ms: number) => {
  if (Date.now() - (asked.get(key) ?? 0) < ms) return false;
  asked.set(key, Date.now());
  return true;
};

async function loadSeries(id: string) {
  if (!due(`s:${id}`, 6 * 3_600_000)) return;
  bump((s) => (s.series[id]?.state === 'ok' ? {} : { series: { ...s.series, [id]: { state: 'loading' } } }));
  const r = await call('series', id);
  const list = 'text' in r ? parseFredSeriess(r.text) : null;
  if (!list?.length) asked.delete(`s:${id}`);
  bump((s) => ({ series: { ...s.series, [id]: list?.length ? { state: 'ok', data: list[0] } : { state: 'error', message: 'error' in r ? r.error : `FRED has no series ${id}.` } } }));
}

export const obsKey = (id: string, units: FredUnits, from: string) => `${id}|${units}|${from}`;

async function loadObs(id: string, units: FredUnits, from: string) {
  const key = obsKey(id, units, from);
  if (!due(`o:${key}`, 30 * 60_000)) return;
  bump((s) => (s.obs[key]?.state === 'ok' ? {} : { obs: { ...s.obs, [key]: { state: 'loading' } } }));
  const r = await call('chart', `${id}|${units}`, from);
  if ('error' in r) asked.delete(`o:${key}`);
  bump((s) => ({ obs: { ...s.obs, [key]: 'error' in r ? { state: 'error', message: r.error } : { state: 'ok', data: parseFredObservations(r.text) } } }));
}

/** FRED's search for some words (30 series, the most popular first). */
export async function searchFred(words: string) {
  const key = words.trim().toLowerCase();
  if (key.length < 2 || !due(`q:${key}`, 30 * 60_000)) return;
  bump((s) => ({ searches: { ...s.searches, [key]: { state: 'loading' } } }));
  const r = await call('search', words.trim());
  const list = 'text' in r ? parseFredSeriess(r.text) : null;
  if (!list) asked.delete(`q:${key}`);
  bump((s) => ({ searches: { ...s.searches, [key]: list ? { state: 'ok', data: list } : { state: 'error', message: 'error' in r ? r.error : 'FRED answered in a format the app does not recognise.' } } }));
}

export interface ChartLine {
  id: string;
  units: FredUnits;
}

/** The lines' descriptions and observations from `from`, loading them while a screen shows them. */
export function useFredChart(lines: ChartLine[], from: string) {
  fredChart.use((s) => s.v);
  const key = lines.map((l) => `${l.id}|${l.units}`).join(',');
  useEffect(() => {
    if (!fredAvailable()) return;
    for (const l of lines) {
      void loadSeries(l.id);
      void loadObs(l.id, l.units, from);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, from]);
  const s = fredChart.get();
  return { series: s.series, obs: (l: ChartLine) => s.obs[obsKey(l.id, l.units, from)], searches: s.searches };
}
