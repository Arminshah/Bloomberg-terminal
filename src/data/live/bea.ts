// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { KeyedAnswer } from './lookup';

/**
 * Two of the Bureau of Economic Analysis's national accounts tables for NIPA (desktop app, the owner's BEA_API_KEY):
 * Table 1.1.2, the contributions of each part of the economy to the growth of real GDP (quarterly), and Table 2.6,
 * personal income and its disposition (monthly). FRED already gives GDP growth and the PCE price indexes one series
 * at a time (MACRO); BEA gives the whole table, consistent and revised together, with its revision date.
 */

export type BeaKind = 'gdp-contributions' | 'personal-income';

export interface BeaLine {
  line: number;
  series: string;
  label: string;
  /** "Percent change, annual rate", "Level" and so on, as BEA names the metric and unit. */
  metric: string;
  /** Values in BEA's units times 10^mult (6: millions of dollars); NaN where BEA gives none. */
  mult: number;
  values: Map<string, number>;
}

export interface BeaTable {
  title: string;
  /** YYYY-MM-DD, from BEA's "LastRevised" note. */
  revised: string;
  /** "2026Q2", "2026M08", in date order. */
  periods: string[];
  lines: BeaLine[];
}

const MONTHS: Record<string, string> = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A BEA GetData answer as a table; BEA's own error ("Invalid API UserId") comes back as such. */
export function parseBeaTable(text: string): BeaTable | { error: string } {
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    return { error: 'BEA answered with something other than its data.' };
  }
  const r = d?.BEAAPI?.Results;
  const err = r?.Error ?? d?.BEAAPI?.Error;
  if (err) return { error: `BEA: ${err.APIErrorDescription ?? 'error'}${err.APIErrorCode ? ` (code ${err.APIErrorCode})` : ''}` };
  const rows = Array.isArray(r?.Data) ? r.Data : null;
  if (!rows) return { error: 'BEA answered without data rows.' };
  const note = String((Array.isArray(r.Notes) ? r.Notes : []).find((n: any) => /LastRevised/.test(String(n?.NoteText ?? '')))?.NoteText ?? '');
  const rev = /LastRevised:\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(note);
  const byLine = new Map<number, BeaLine>();
  const periods = new Set<string>();
  for (const x of rows) {
    const line = Number(x?.LineNumber);
    const period = String(x?.TimePeriod ?? '');
    if (!Number.isInteger(line) || !/^\d{4}(?:Q[1-4]|M\d{2})?$/.test(period)) continue;
    const raw = String(x?.DataValue ?? '').replace(/,/g, '');
    const value = raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : NaN;
    const l = byLine.get(line) ?? { line, series: String(x?.SeriesCode ?? ''), label: String(x?.LineDescription ?? '').trim(), metric: `${x?.METRIC_NAME ?? ''} ${x?.CL_UNIT ?? ''}`.trim(), mult: Number(x?.UNIT_MULT ?? 0), values: new Map() };
    l.values.set(period, value);
    byLine.set(line, l);
    periods.add(period);
  }
  if (!byLine.size) return { error: 'BEA answered with no rows of the table.' };
  return {
    title: note.replace(/\s*-\s*LastRevised:.*$/, '').trim(),
    revised: rev && MONTHS[rev[1]] ? `${rev[3]}-${MONTHS[rev[1]]}-${rev[2].padStart(2, '0')}` : '',
    periods: [...periods].sort(),
    lines: [...byLine.values()].sort((a, b) => a.line - b.line),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "2026Q2" as Q2 2026, "2026M08" as Aug 2026. */
export function periodLabel(p: string): string {
  const q = /^(\d{4})Q([1-4])$/.exec(p);
  if (q) return `Q${q[2]} ${q[1]}`;
  const m = /^(\d{4})M(\d{2})$/.exec(p);
  return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]} ${m[1]}` : p;
}

/** The GDP lines NIPA shows from Table 1.1.2, with their depth in BEA's table. */
export const GDP_LINES: { line: number; depth: number }[] = [
  { line: 1, depth: 0 }, // Gross domestic product: percent change, annual rate
  { line: 2, depth: 1 }, // Personal consumption expenditures
  { line: 3, depth: 2 }, // Goods
  { line: 6, depth: 2 }, // Services
  { line: 7, depth: 1 }, // Gross private domestic investment
  { line: 8, depth: 2 }, // Fixed investment
  { line: 14, depth: 2 }, // Change in private inventories
  { line: 15, depth: 1 }, // Net exports of goods and services
  { line: 16, depth: 2 }, // Exports
  { line: 19, depth: 2 }, // Imports
  { line: 22, depth: 1 }, // Government consumption expenditures and gross investment
];

/** The lines NIPA shows from Table 2.6 (billions of dollars at annual rates, and the saving rate). */
export const INCOME_LINES: { line: number; depth: number }[] = [
  { line: 1, depth: 0 }, // Personal income
  { line: 2, depth: 1 }, // Compensation of employees
  { line: 27, depth: 0 }, // Disposable personal income
  { line: 29, depth: 1 }, // Personal consumption expenditures
  { line: 34, depth: 0 }, // Personal saving
  { line: 35, depth: 0 }, // Saving rate, percent of disposable income
];

// ------------------------------------------------------------------ loading

export interface BeaPart {
  state: 'loading' | 'ok' | 'error' | 'needs-key';
  text?: string;
  at?: number;
  stale?: boolean;
  cached?: boolean;
  message?: string;
}

export const beaData = createStore<{ v: number; by: Partial<Record<BeaKind, BeaPart>> }>({ v: 0, by: {} });

export function beaAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.bea === 'function';
}

/** What an answer without data means, in a few words, without the key. */
export function beaProblem(res: KeyedAnswer): { state: BeaPart['state']; message: string } {
  if (res.missing) return { state: 'needs-key', message: 'Needs BEA_API_KEY on PROVIDERS (a free UserID from apps.bea.gov/api/signup).' };
  if (res.refused) return { state: 'needs-key', message: 'The configured BEA UserID has the wrong format, so it was not sent.' };
  if (/invalid api userid/i.test(res.error ?? '') || res.status === 401 || res.status === 403) return { state: 'error', message: 'BEA refused the UserID (invalid API UserId). Check BEA_API_KEY on PROVIDERS.' };
  if (res.status === 429 || /quota|exceeded/i.test(res.error ?? '') || res.throttled) return { state: 'error', message: "BEA asked the app to wait (its limit of requests or errors a minute); it asks again later." };
  if (res.status >= 500) return { state: 'error', message: `BEA's service failed (HTTP ${res.status}).` };
  if (!res.status) return { state: 'error', message: res.error ? `BEA: ${res.error.slice(0, 100)}` : 'BEA did not answer (network or service).' };
  return { state: 'error', message: `BEA answered HTTP ${res.status}${res.error ? `: ${res.error.slice(0, 100)}` : ''}.` };
}

const asked = new Map<BeaKind, number>();

async function load(kind: BeaKind) {
  const api = window.arminDesktop;
  if (!api?.bea) return;
  asked.set(kind, Date.now());
  const put = (p: BeaPart) => beaData.set((s) => ({ v: s.v + 1, by: { ...s.by, [kind]: p } }));
  if (!beaData.get().by[kind]) put({ state: 'loading' });
  try {
    const res = await api.bea(kind);
    if (res.text) put({ state: 'ok', text: res.text, at: res.at ?? Date.now(), stale: res.stale, cached: res.cached });
    else put(beaProblem(res));
  } catch {
    put({ state: 'error', message: 'The BEA request could not be completed.' });
  }
}

/** One BEA table while a screen shows it: asked on opening, then every six hours (the main process keeps answers). */
export function useBea(kind: BeaKind): BeaPart | undefined {
  beaData.use((s) => s.v);
  useEffect(() => {
    if (!beaAvailable()) return;
    if (Date.now() - (asked.get(kind) ?? 0) > 60_000) void load(kind);
    const t = setInterval(() => void load(kind), 6 * 3_600_000);
    return () => clearInterval(t);
  }, [kind]);
  return beaData.get().by[kind];
}
