// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { KeyedAnswer } from './lookup';

/**
 * The US Energy Information Administration's figures for NGAS, NATURALGAS and OILMARKET (desktop app): the weekly
 * natural gas storage report with EIA's own comparisons (ir.eia.gov, no key), and from its Open Data API (the owner's
 * EIA_API_KEY) the weekly storage history, the weekly petroleum supply estimates and the monthly natural gas
 * production and consumption. Each figure keeps its week or month and unit; nothing is estimated here.
 */

export type EiaKind = 'storage-report' | 'storage-history' | 'petroleum' | 'gas-monthly';

const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ the weekly storage report

export interface StorageRow {
  id: string;
  name: string;
  /** Billion cubic feet. */
  now: number;
  weekAgo: number;
  yearAgo: number;
  fiveYear: number;
  netChange: number;
  impliedFlow: number;
  pctYearAgo: number;
  pctFiveYear: number;
  /** EIA marks a figure revised or reclassified. */
  revised: boolean;
  reclassified: boolean;
}

export interface StorageReport {
  /** YYYY-MM-DD. */
  released: string;
  week: string;
  weekAgo: string;
  yearAgo: string;
  /** "5-year (2021-25) average", as EIA names it. */
  fiveYearLabel: string;
  rows: StorageRow[];
}

const REGION: Record<string, string> = {
  r48: 'Total Lower 48',
  r31: 'East',
  r32: 'Midwest',
  r33: 'South Central',
  r34: 'Mountain',
  r35: 'Pacific',
};
const MONTH: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/,/g, ''))) ? Number(v.replace(/,/g, '')) : NaN);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The region of a storage series ("png.nw2_epg0_sso_r33_bcf.w" is South Central's salt facilities). */
function regionName(id: string): string {
  const m = /nw2_epg0_(swo|sso|sno)_(r\d\d)_bcf/i.exec(id);
  if (!m) return '';
  const process = m[1].toLowerCase();
  if (process === 'sso') return 'Salt';
  if (process === 'sno') return 'Nonsalt';
  return REGION[m[2].toLowerCase()] ?? '';
}

/**
 * EIA's weekly storage report (wngsr.json): each region's stocks this week, a week and a year before, with the net
 * change, implied flow and five-year average as EIA states them. Its year-ago and five-year figures are EIA's own
 * (interpolated to the report's date), which the weekly series alone does not give. Null when the file is not one.
 */
export function parseStorageReport(text: string): StorageReport | null {
  let d: any;
  try {
    d = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  const rel = /^(\d{4})-([A-Z][a-z]{2})-(\d{2})/.exec(String(d?.release_date ?? ''));
  if (!rel || !MONTH[rel[2]] || !isDay(d?.current_week) || !isDay(d?.week_ago) || !isDay(d?.year_ago) || !Array.isArray(d?.series)) return null;
  const rows: StorageRow[] = [];
  for (const s of d.series) {
    const name = regionName(String(s?.series_id ?? ''));
    const c = s?.calculated ?? {};
    const at = (day: string) => {
      const hit = Array.isArray(s?.data) ? s.data.find((p: any) => Array.isArray(p) && p[0] === day) : undefined;
      return hit ? num(hit[1]) : NaN;
    };
    const flags = (key: string) => (Array.isArray(s?.[key]) ? s[key] : []).some((f: unknown) => String(f) === 'true') || Object.entries(c).some(([k, v]) => k.startsWith(`${key}_`) && String(v) === 'true');
    if (!name || String(s?.unitsshort ?? '').toLowerCase() !== 'bcf') continue;
    rows.push({
      id: String(s.series_id),
      name,
      now: at(d.current_week),
      weekAgo: at(d.week_ago),
      yearAgo: at(d.year_ago),
      fiveYear: num(c['5yr-avg']),
      netChange: num(c.net_change),
      impliedFlow: num(c.implied_flow),
      pctYearAgo: num(c['pct-change_yrago']),
      pctFiveYear: num(c['pct-chg_5yr-avg']),
      revised: flags('revision_flag'),
      reclassified: flags('reclassification_flag'),
    });
  }
  if (!rows.length) return null;
  return { released: `${rel[1]}-${MONTH[rel[2]]}-${rel[3]}`, week: d.current_week, weekAgo: d.week_ago, yearAgo: d.year_ago, fiveYearLabel: String(d['5yr_avg'] ?? 'five-year average'), rows };
}

// ------------------------------------------------------------------ the Open Data API

export interface EiaPoint {
  /** YYYY-MM-DD for a week (its last day), YYYY-MM for a month. */
  period: string;
  value: number;
}

export interface EiaSeries {
  points: EiaPoint[];
  unit: string;
}

/** An API answer as series in date order; an error EIA states ("API_KEY_INVALID") comes back as such. */
export function parseEiaData(text: string): { series: Map<string, EiaSeries> } | { error: string } {
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    return { error: 'EIA answered with something other than its data.' };
  }
  if (d?.error) return { error: `EIA: ${typeof d.error === 'string' ? d.error : d.error.message ?? d.error.code ?? 'error'}` };
  const rows = d?.response?.data;
  if (!Array.isArray(rows)) return { error: 'EIA answered without data rows.' };
  const series = new Map<string, EiaSeries>();
  for (const r of rows) {
    const id = String(r?.series ?? '');
    const value = num(r?.value);
    const period = String(r?.period ?? '');
    if (!id || !Number.isFinite(value) || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(period)) continue;
    const s = series.get(id) ?? { points: [], unit: String(r?.units ?? '') };
    s.points.push({ period, value });
    series.set(id, s);
  }
  for (const s of series.values()) s.points.sort((a, b) => a.period.localeCompare(b.period));
  return { series };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface WeeklyRow {
  id: string;
  label: string;
  group: 'Stocks' | 'Supply' | 'Demand';
  /** How the row is shown: million barrels from EIA's thousands, thousand barrels a day, or percent. */
  unit: 'million barrels' | 'thousand b/d' | '%';
  week: string;
  value: number;
  priorWeek: string;
  change: number;
  /** The same week a year before (364 days), as EIA's weekly report compares it; NaN when the series lacks it. */
  yearAgoWeek: string;
  yearAgo: number;
}

/** The weekly petroleum figures shown, in the order of EIA's weekly report. */
export const PETROLEUM_ROWS: { id: string; label: string; group: WeeklyRow['group']; unit: WeeklyRow['unit'] }[] = [
  { id: 'WCESTUS1', label: 'Commercial crude oil (excluding SPR)', group: 'Stocks', unit: 'million barrels' },
  { id: 'W_EPC0_SAX_YCUOK_MBBL', label: 'Crude oil at Cushing, Oklahoma', group: 'Stocks', unit: 'million barrels' },
  { id: 'WCSSTUS1', label: 'Strategic Petroleum Reserve', group: 'Stocks', unit: 'million barrels' },
  { id: 'WGTSTUS1', label: 'Total motor gasoline', group: 'Stocks', unit: 'million barrels' },
  { id: 'WDISTUS1', label: 'Distillate fuel oil', group: 'Stocks', unit: 'million barrels' },
  { id: 'WCRFPUS2', label: 'Crude oil production', group: 'Supply', unit: 'thousand b/d' },
  { id: 'WCRRIUS2', label: 'Refinery crude oil input', group: 'Supply', unit: 'thousand b/d' },
  { id: 'WPULEUS3', label: 'Refinery utilisation', group: 'Supply', unit: '%' },
  { id: 'WRPUPUS2', label: 'Total products supplied', group: 'Demand', unit: 'thousand b/d' },
  { id: 'WGFUPUS2', label: 'Finished motor gasoline supplied', group: 'Demand', unit: 'thousand b/d' },
  { id: 'WDIUPUS2', label: 'Distillate fuel oil supplied', group: 'Demand', unit: 'thousand b/d' },
];

const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Each weekly series' latest week against the week before and the same week a year earlier (364 days, the week EIA's
 * report sets beside it: 23 October 2026 against 24 October 2025). Stocks go from EIA's thousand barrels to millions.
 * A series EIA has not answered for is left out.
 */
export function weeklyRows(series: Map<string, EiaSeries>, spec = PETROLEUM_ROWS): WeeklyRow[] {
  const out: WeeklyRow[] = [];
  for (const r of spec) {
    const s = series.get(r.id);
    const pts = s?.points ?? [];
    if (!pts.length) continue;
    const last = pts[pts.length - 1];
    const scale = r.unit === 'million barrels' ? 1 / 1000 : 1;
    const at = (iso: string) => pts.find((p) => p.period === iso)?.value ?? NaN;
    const priorWeek = isoOf(dayMs(last.period) - 7 * DAY_MS);
    const yearAgoWeek = isoOf(dayMs(last.period) - 364 * DAY_MS);
    const prior = at(priorWeek) * scale;
    const value = last.value * scale;
    out.push({ id: r.id, label: r.label, group: r.group, unit: r.unit, week: last.period, value, priorWeek, change: value - prior, yearAgoWeek, yearAgo: at(yearAgoWeek) * scale });
  }
  return out;
}

export interface GasMonth {
  /** YYYY-MM. */
  month: string;
  /** Billion cubic feet in the month, and a day on average. */
  production: number;
  consumption: number;
  productionPerDay: number;
  consumptionPerDay: number;
}

const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** Monthly dry gas production and total consumption, from EIA's million cubic feet to billions, latest month first. */
export function gasMonths(series: Map<string, EiaSeries>): GasMonth[] {
  const prod = new Map((series.get('N9070US2')?.points ?? []).map((p) => [p.period, p.value / 1000]));
  const cons = new Map((series.get('N9140US2')?.points ?? []).map((p) => [p.period, p.value / 1000]));
  const months = [...new Set([...prod.keys(), ...cons.keys()])].sort().reverse();
  return months.map((month) => {
    const production = prod.get(month) ?? NaN;
    const consumption = cons.get(month) ?? NaN;
    return { month, production, consumption, productionPerDay: production / daysIn(month), consumptionPerDay: consumption / daysIn(month) };
  });
}

// ------------------------------------------------------------------ loading

export interface EiaPart {
  state: 'loading' | 'ok' | 'error' | 'needs-key';
  text?: string;
  /** When EIA's answer arrived. */
  at?: number;
  stale?: boolean;
  cached?: boolean;
  message?: string;
}

export const eiaData = createStore<{ v: number; by: Partial<Record<EiaKind, EiaPart>> }>({ v: 0, by: {} });

export function eiaAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.eia === 'function';
}

/** What an answer that brought no data means, in a few words, without the key or EIA's whole text. */
export function eiaProblem(res: KeyedAnswer): { state: EiaPart['state']; message: string } {
  if (res.missing) return { state: 'needs-key', message: 'Needs EIA_API_KEY on PROVIDERS (a free key from eia.gov/opendata).' };
  if (res.refused) return { state: 'needs-key', message: "The configured EIA key has the wrong format, so it was not sent." };
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|invalid api_key/i.test(res.error ?? '')) return { state: 'error', message: 'EIA refused the key (API_KEY_INVALID). Check EIA_API_KEY on PROVIDERS.' };
  if (res.status === 429 || res.budget || res.throttled) return { state: 'error', message: 'EIA asked the app to wait (rate limit); it asks again later.' };
  if (res.status >= 500) return { state: 'error', message: `EIA's service failed (HTTP ${res.status}).` };
  if (!res.status) return { state: 'error', message: 'EIA did not answer (network or service).' };
  return { state: 'error', message: `EIA answered HTTP ${res.status}${res.error ? `: ${res.error.slice(0, 100)}` : ''}.` };
}

const asked = new Map<EiaKind, number>();

async function load(kind: EiaKind) {
  const api = window.arminDesktop;
  if (!api?.eia) return;
  asked.set(kind, Date.now());
  const put = (p: EiaPart) => eiaData.set((s) => ({ v: s.v + 1, by: { ...s.by, [kind]: p } }));
  if (!eiaData.get().by[kind]) put({ state: 'loading' });
  try {
    const res = await api.eia(kind);
    if (res.text) put({ state: 'ok', text: res.text, at: res.at ?? Date.now(), stale: res.stale, cached: res.cached });
    else put(eiaProblem(res));
  } catch {
    put({ state: 'error', message: 'The EIA request could not be completed.' });
  }
}

/** One EIA dataset while a screen shows it: asked on opening, then every 30 minutes (the main process keeps answers). */
export function useEia(kind: EiaKind): EiaPart | undefined {
  eiaData.use((s) => s.v);
  useEffect(() => {
    if (!eiaAvailable()) return;
    if (Date.now() - (asked.get(kind) ?? 0) > 60_000) void load(kind);
    const t = setInterval(() => void load(kind), 30 * 60_000);
    return () => clearInterval(t);
  }, [kind]);
  return eiaData.get().by[kind];
}
