// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { engine } from '../market';
import { dayNum } from '../calendar';
import type { ExtBar } from '../engine';
import { setFeed } from './status';
import { loadJson, saveJson } from '../../core/store';
import { registerRefresh } from '../../terminal/refresh';

/**
 * Official US Treasury par yields (home.treasury.gov) for the desktop app:
 * every tenor of the generic US curve, end of day, ten years of history. One
 * source and one measure for the whole curve, so its slopes and spreads
 * compare like with like. Intraday yields of the latest auctioned 5, 10 and
 * 30-year issues are separate lines (Cboe's FVX, TNX and TYX, via Yahoo).
 * The Treasury's 3-month rate is used rather than the 13-week bill index,
 * which is quoted on a discount basis and sits below the rest of the curve.
 */

const COLUMNS: Record<string, string> = {
  '3 Mo': 'USGG3M Index',
  '6 Mo': 'USGG6M Index',
  '1 Yr': 'USGG12M Index',
  '2 Yr': 'USGG2YR Index',
  '3 Yr': 'USGG3YR Index',
  '5 Yr': 'USGG5YR Index',
  '7 Yr': 'USGG7YR Index',
  '10 Yr': 'USGG10YR Index',
  '20 Yr': 'USGG20YR Index',
  '30 Yr': 'USGG30YR Index',
};

/** Lines this source owns; the Yahoo service leaves them alone. */
export const TREASURY_IDS = new Set(Object.values(COLUMNS));

/** Who publishes a US generic yield in the desktop app and how it is measured. */
export function usYieldMethod(d: { id: string; yahoo?: string }): string | undefined {
  if (TREASURY_IDS.has(d.id)) return 'US Department of the Treasury, daily par yield curve rate (end of day)';
  if (d.yahoo) return `Cboe Treasury yield index ${d.yahoo} (latest auctioned note or bond), via Yahoo Finance`;
  return undefined;
}

export function treasuryAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.treasury === 'function';
}

/** Parses one year's CSV into {line id -> {day -> yield}}. */
export function parseTreasuryCsv(text: string): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return out;
  const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const cols = head.map((h) => COLUMNS[h]);
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, '').trim());
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0]?.trim() ?? '');
    if (!m) continue;
    const date = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
    if (date.getUTCFullYear() !== Number(m[3]) || date.getUTCMonth() !== Number(m[1]) - 1 || date.getUTCDate() !== Number(m[2])) continue;
    const day = dayNum(date.getTime());
    cells.forEach((c, i) => {
      const id = cols[i];
      const v = Number(c);
      if (!id || c.trim() === '' || !Number.isFinite(v)) return;
      const series = out.get(id) ?? new Map<number, number>();
      series.set(day, v);
      out.set(id, series);
    });
  }
  return out;
}

const history = new Map<string, Map<number, number>>();

function merge(parsed: Map<string, Map<number, number>>) {
  for (const [id, days] of parsed) {
    const all = history.get(id) ?? new Map<number, number>();
    for (const [d, v] of days) all.set(d, v);
    history.set(id, all);
  }
}

function apply(): string[] {
  const changed: string[] = [];
  for (const [id, days] of history) {
    if (!engine.get(id)) continue;
    const bars: ExtBar[] = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, c]) => ({ day, o: c, h: c, l: c, c, v: 0 }));
    if (bars.length < 2) continue;
    engine.setExternalDaily(id, bars, { eod: true, provider: 'US Department of the Treasury' });
    changed.push(id);
  }
  if (changed.length) engine.flush(changed);
  return changed;
}

/**
 * Years that are over, kept on this computer: their published yields do not
 * change, and the Treasury's site answers a program like this one slowly (about
 * 18 seconds a year on 14 Oct 2026, against under a second for a browser), so
 * only the current year is fetched at each start once the rest is kept.
 */
const CACHE_KEY = 'armin:ust-years';
type YearCache = Record<string, Record<string, [number, number][]>>;

function cachedYears(): YearCache {
  const c = loadJson<{ v: number; years: YearCache }>(CACHE_KEY);
  return c && c.v === 1 && c.years && typeof c.years === 'object' ? c.years : {};
}

function keepYear(year: number, parsed: Map<string, Map<number, number>>) {
  const years = cachedYears();
  years[year] = Object.fromEntries([...parsed].map(([id, days]) => [id, [...days]]));
  saveJson(CACHE_KEY, { v: 1, years });
}

async function loadYear(year: number, keep: boolean, active: () => boolean): Promise<boolean> {
  try {
    const res = await window.arminDesktop!.treasury(year);
    if (!active() || res.status !== 200 || !res.text) return false;
    const parsed = parseTreasuryCsv(res.text);
    if (!parsed.size) return false;
    merge(parsed);
    if (keep) keepYear(year, parsed);
    return true;
  } catch {
    return false;
  }
}

/** Loads one consistent par curve; transient failures retry after 1, 2, then at most 5 minutes. */
export function startTreasury(): () => void {
  if (!treasuryAvailable()) return () => undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const active = () => !stopped;
  const year = new Date().getUTCFullYear();
  setFeed('rates', 'connecting', 'Loading the official US Treasury daily par yield curve');
  // Years kept from earlier sessions go on screen at once, as history.
  const kept = cachedYears();
  for (const [y, lines] of Object.entries(kept)) {
    if (Number(y) >= year) continue;
    merge(new Map(Object.entries(lines).map(([id, days]) => [id, new Map(days)])));
  }
  if (history.size) apply();
  let running: Promise<boolean> | null = null;
  const refreshCurrent = (): Promise<boolean> =>
    (running ??= (async () => {
      clearTimeout(timer);
      const current = await loadYear(new Date().getUTCFullYear(), false, active);
      if (stopped) return false;
      const ok = !!current && apply().length > 0;
      if (ok) {
        failures = 0;
        setFeed('rates', 'live', 'US Treasury par yields, end of day');
      } else {
        failures++;
        setFeed('rates', 'error', history.size ? 'The US Treasury did not answer for this year; earlier observations remain shown; retrying automatically' : 'US Treasury yields unavailable right now; retrying automatically');
      }
      timer = setTimeout(() => void refreshCurrent(), failures ? Math.min(5, 2 ** (failures - 1)) * 60_000 : 30 * 60_000);
      return ok;
    })().finally(() => {
      running = null;
    }));
  const offRefresh = registerRefresh({
    source: 'US Treasury yield curve',
    run: async () => ((await refreshCurrent()) ? { source: 'US Treasury yield curve', state: 'asked' } : { source: 'US Treasury yield curve', state: 'failed', detail: 'the Treasury did not answer; earlier observations stay' }),
  });
  void (async () => {
    // The current year puts today's levels on screen; last year next, for year-to-date and one-year changes.
    await refreshCurrent();
    if (stopped) return;
    const missing = Array.from({ length: 9 }, (_, i) => year - 1 - i).filter((y) => !kept[y]);
    if (missing[0] === year - 1) {
      await loadYear(year - 1, true, active);
      if (!stopped) apply();
      missing.shift();
    }
    // The rest three at a time, so ten years take a minute rather than three.
    for (let i = 0; i < missing.length && !stopped; i += 3) {
      await Promise.all(missing.slice(i, i + 3).map((y) => loadYear(y, true, active)));
      if (!stopped) apply();
    }
  })();
  return () => {
    stopped = true;
    clearTimeout(timer);
    offRefresh();
  };
}
