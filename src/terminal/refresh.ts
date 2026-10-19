import { useEffect, useRef } from 'react';
import { createStore } from '../core/store';
import { fmtTime } from '../core/format';

/**
 * The top bar's REFRESH (Alt+R). Each data module registers what it can ask for again now, instead of waiting for
 * its timer or its throttle; the button runs them all at once and reports what each did. Before they run, the
 * desktop app's main process is told, so answers it kept from before the click count as expired there too
 * (electron/refresh.cjs), except where a daily or monthly allowance would pay for asking again.
 */

/** What one source did when fresh data was asked for. */
export interface RefreshOutcome {
  /** The source as the report names it: "Yahoo quotes". */
  source: string;
  /**
   * asked: it was asked again and answered; failed: it was asked and did not answer; skipped: left alone on
   * purpose (an allowance, a switch that is off, a missing key); waiting: still loading when the report was made.
   */
  state: 'asked' | 'failed' | 'skipped' | 'waiting';
  /** A few words: "412 symbols", "HTTP 503", "daily allowance". */
  detail?: string;
}

type RunResult = RefreshOutcome | RefreshOutcome[] | void;

export interface Refresher {
  source: string;
  /** False where the source cannot be asked (the browser build, a feed not started): left out of a refresh. */
  available?: () => boolean;
  /** Asks again now and resolves when the answers are in. An empty list means there was nothing to ask. */
  run: () => Promise<RunResult> | RunResult;
}

const refreshers = new Map<number, Refresher>();
let seq = 0;

/** Adds a refresher; returns the function that takes it away again. */
export function registerRefresh(r: Refresher): () => void {
  const id = ++seq;
  refreshers.set(id, r);
  return () => void refreshers.delete(id);
}

const usable = (r: Refresher) => {
  try {
    return r.available?.() ?? true;
  } catch {
    return false;
  }
};

/** Whether anything here can be asked again: the browser build has no data source, and no button. */
export function canRefresh(): boolean {
  return [...refreshers.values()].some(usable);
}

/**
 * Keeps a refresher registered while a screen is mounted; `run` may change on every render and the latest one is
 * used. With `run` null nothing is registered.
 */
export function useRefresh(source: string, run: Refresher['run'] | null) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  const on = run != null;
  useEffect(() => {
    if (!on) return;
    return registerRefresh({ source, run: () => latest.current?.() });
  }, [source, on]);
}

/** Things screens show, counted while they are mounted, for a refresh to ask for again. */
export function createWants<T>() {
  const wants = new Map<string, { value: T; n: number }>();
  return {
    /** Counts `key` as wanted until the returned function is called. */
    add(key: string, value: T): () => void {
      const w = wants.get(key);
      wants.set(key, { value, n: (w?.n ?? 0) + 1 });
      let on = true;
      return () => {
        if (!on) return;
        on = false;
        const now = wants.get(key);
        if (!now) return;
        if (now.n > 1) wants.set(key, { ...now, n: now.n - 1 });
        else wants.delete(key);
      };
    },
    values: (): T[] => [...wants.values()].map((w) => w.value),
    get size() {
      return wants.size;
    },
  };
}

/** Provider names for the desktop app's list of sources whose kept answers survive a refresh. */
const KEPT_NAMES: Record<string, string> = {
  alphavantage: 'Alpha Vantage',
  twelvedata: 'Twelve Data',
  fmp: 'Financial Modeling Prep',
  equibles: 'Equibles',
  marketaux: 'Marketaux',
  tiingo: 'Tiingo',
  tipranks: 'TipRanks',
};

/** What the main process keeps through a refresh, as report lines. */
export function keptOutcomes(mark: { keepMs: number; kept: string[] }): RefreshOutcome[] {
  const minutes = Math.round(mark.keepMs / 60_000);
  const age = minutes === 60 ? 'an hour' : `${minutes} minutes`;
  const daily = mark.kept.filter((p) => p !== 'tipranks').map((p) => KEPT_NAMES[p] ?? p);
  const out: RefreshOutcome[] = [];
  if (daily.length) out.push({ source: daily.join(', '), state: 'skipped', detail: `answers younger than ${age} kept (daily allowance)` });
  if (mark.kept.includes('tipranks')) out.push({ source: 'TipRanks', state: 'skipped', detail: 'asked only when you ask on ANALYSTS (monthly allowance)' });
  return out;
}

const RANK: Record<RefreshOutcome['state'], number> = { failed: 3, waiting: 2, asked: 1, skipped: 0 };

/** One line per source: a source reported twice (two screens) keeps its worst state and both details. */
export function mergeOutcomes(list: RefreshOutcome[]): RefreshOutcome[] {
  const by = new Map<string, RefreshOutcome>();
  for (const o of list) {
    const had = by.get(o.source);
    if (!had) {
      by.set(o.source, { ...o });
      continue;
    }
    const details = [...new Set([had.detail, o.detail].filter((d): d is string => !!d))];
    by.set(o.source, { source: o.source, state: RANK[o.state] > RANK[had.state] ? o.state : had.state, ...(details.length ? { detail: details.join('; ') } : {}) });
  }
  return [...by.values()];
}

export interface RefreshReport {
  /** When the refresh finished, and how long it took. */
  at: number;
  took: number;
  outcomes: RefreshOutcome[];
}

export const refreshState = createStore<{ running: boolean; last: RefreshReport | null }>({ running: false, last: null });

/** A refresher's outcome, or "still loading" once `ms` have passed; a refresher that throws has failed. */
async function settle(r: Refresher, ms: number): Promise<RefreshOutcome[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<RefreshOutcome[]>((resolve) => {
    timer = setTimeout(() => resolve([{ source: r.source, state: 'waiting', detail: `no answer within ${Math.round(ms / 1000)} s; it shows when it arrives` }]), ms);
  });
  const done = Promise.resolve()
    .then(r.run)
    .then(
      (res): RefreshOutcome[] => (res === undefined ? [{ source: r.source, state: 'asked' }] : Array.isArray(res) ? res : [res]),
      (err: unknown): RefreshOutcome[] => [{ source: r.source, state: 'failed', detail: err instanceof Error ? err.message : String(err) }],
    );
  try {
    return await Promise.race([done, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks every source the open screens and the background use for fresh data now. Does nothing while a refresh is
 * running (null). Resolves with the report, which `refreshState` also holds for the top bar.
 */
export async function refreshAll({ timeoutMs = 45_000 }: { timeoutMs?: number } = {}): Promise<RefreshReport | null> {
  if (refreshState.get().running) return null;
  refreshState.set((s) => ({ ...s, running: true }));
  const started = Date.now();
  const outcomes: RefreshOutcome[] = [];
  try {
    // The main process first: answers it kept from before this moment then count as expired.
    const desktop = typeof window !== 'undefined' ? window.arminDesktop : undefined;
    if (desktop?.refresh) {
      try {
        outcomes.push(...keptOutcomes(await desktop.refresh()));
      } catch (err) {
        outcomes.push({ source: 'Desktop app', state: 'failed', detail: `kept answers were not marked out of date (${err instanceof Error ? err.message : String(err)})` });
      }
    }
    const list = [...refreshers.values()].filter(usable);
    for (const r of await Promise.all(list.map((r) => settle(r, timeoutMs)))) outcomes.push(...r);
  } finally {
    const at = Date.now();
    const report = { at, took: at - started, outcomes: mergeOutcomes(outcomes) };
    refreshState.set({ running: false, last: report });
  }
  return refreshState.get().last;
}

/** The report as the button's tooltip: when, then what was asked, what failed and what was left alone. */
export function refreshSummary(report: RefreshReport | null, shortcut = 'Alt+R'): string {
  if (!report) return `Ask every source the open screens and the background use for fresh data now (${shortcut}). Sources with a daily allowance keep answers younger than an hour.`;
  const line = (o: RefreshOutcome) => `  ${o.source}${o.detail ? `: ${o.detail}` : ''}`;
  const group = (title: string, state: RefreshOutcome['state']) => {
    const rows = report.outcomes.filter((o) => o.state === state);
    return rows.length ? [title, ...rows.map(line)] : [];
  };
  return [
    `Refreshed at ${fmtTime(report.at)}, in ${Math.max(1, Math.round(report.took / 1000))} s. Click or ${shortcut} to refresh again.`,
    ...group('Asked again:', 'asked'),
    ...group('Failed:', 'failed'),
    ...group('Still loading:', 'waiting'),
    ...group('Not asked again:', 'skipped'),
  ].join('\n');
}
