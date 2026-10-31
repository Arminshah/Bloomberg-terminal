// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';

/**
 * The IMF's International Trade in Goods by partner country (IMTS, formerly the Direction of Trade Statistics) from
 * its SDMX API (desktop app, no key): an economy's exports (free on board) and imports (cost, insurance and freight)
 * in US dollars with each partner and group, by year for the last ten years and by month for one partner, with the
 * names of the economies and groups.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A partner's exports and imports by period ("2025", or "2026-M06"), in US dollars. */
export interface PartnerTrade {
  x: Record<string, number>;
  m: Record<string, number>;
}

/** The world as an IMTS partner: an economy's trade with every country. */
export const WORLD = 'G001';

/** An SDMX-JSON 2.0 data answer: partner -> exports and imports by period. Null when it is not one. */
export function parseImts(text: string): Record<string, PartnerTrade> | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(j?.data?.dataSets)) return null;
  // A query no figure matches is answered with a data set holding no series.
  const set = j.data.dataSets[0];
  if (!set?.series) return {};
  const st = j.data.structures?.[0];
  if (!st?.dimensions) return null;
  const dims: any[] = st.dimensions.series ?? [];
  const at = (id: string) => dims.findIndex((d) => d?.id === id);
  const ind = at('INDICATOR');
  const part = at('COUNTERPART_COUNTRY');
  const times: any[] = st.dimensions.observation?.find((d: any) => d?.id === 'TIME_PERIOD')?.values ?? [];
  if (ind < 0 || part < 0) return null;
  const out: Record<string, PartnerTrade> = {};
  for (const [key, s] of Object.entries<any>(set.series ?? {})) {
    const idx = key.split(':').map(Number);
    const indicator = dims[ind].values?.[idx[ind]]?.id;
    const partner = dims[part].values?.[idx[part]]?.id;
    const flow = indicator === 'XG_FOB_USD' ? 'x' : indicator === 'MG_CIF_USD' ? 'm' : null;
    if (!flow || typeof partner !== 'string') continue;
    const row = (out[partner] ??= { x: {}, m: {} });
    for (const [i, o] of Object.entries<any>(s?.observations ?? {})) {
      const period = times[Number(i)]?.value ?? times[Number(i)]?.id;
      const v = Number(Array.isArray(o) ? o[0] : NaN);
      if (typeof period === 'string' && Array.isArray(o) && o[0] != null && o[0] !== '' && Number.isFinite(v)) row[flow][period] = v;
    }
  }
  return out;
}

/** The IMTS codelist: code -> name, for the economies and the groups. */
export function parseAreaNames(text: string): Record<string, string> | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const codes = j?.data?.codelists?.[0]?.codes;
  if (!Array.isArray(codes)) return null;
  const out: Record<string, string> = {};
  for (const c of codes) {
    const name = typeof c?.name === 'string' ? c.name.trim() : '';
    if (typeof c?.id === 'string' && name) out[c.id] = name;
  }
  return out;
}

/** An economy's own code, not a group's (G001) or an unallocated area's (TX799). */
export const isEconomy = (code: string) => /^[A-Z]{3}$/.test(code);

/**
 * The groups of the IMF's own table of trade by area and country (its hierarchy H_IMTS_EXPORT_IMPORT_AREA_COUNTRY), in
 * its order with their depth: the world, its advanced and emerging economies and their regions, the countries not
 * allocated, then its memo groups (the EU, Africa, the Middle East, fuel and nonfuel exporters). The codelist's other
 * groups are not in that table and are not shown.
 */
export const AREA_GROUPS: [code: string, depth: number][] = [
  ['G001', 0], ['G110', 1], ['G163', 2], ['G200', 1], ['G505', 2], ['G903', 2], ['G400', 2], ['G603', 2], ['G205', 2],
  ['TX910', 0], ['TX898', 0], ['TX899', 0],
  ['G998', 0], ['GX605', 0], ['GX405', 0], ['G080', 0], ['G092', 0],
];
const GROUP_ORDER = new Map(AREA_GROUPS.map(([c], i) => [c, i]));

/** The latest year the world total has both exports and imports for; else the latest year with any figure. */
export function latestYear(trade: Record<string, PartnerTrade>): string {
  const w = trade[WORLD];
  const both = w ? Object.keys(w.x).filter((y) => y in w.m).sort() : [];
  if (both.length) return both[both.length - 1];
  const any = Object.values(trade).flatMap((p) => [...Object.keys(p.x), ...Object.keys(p.m)]).sort();
  return any[any.length - 1] ?? '';
}

export interface TradeRow {
  code: string;
  name: string;
  x: number;
  m: number;
  balance: number;
  total: number;
  /** Of the economy's trade with the world, %. */
  share: number;
  xChg: number;
  mChg: number;
}

const pct = (a: number | undefined, b: number | undefined) => (a != null && b != null && b > 0 ? (a / b - 1) * 100 : NaN);

/**
 * A year's rows matching some words in the code or name: the economies the economy traded with, by total trade, or
 * the IMF's groups in the order of its table. A flow the IMF gives no figure for is NaN, and so are the totals it
 * enters.
 */
export function tradeRows(trade: Record<string, PartnerTrade>, names: Record<string, string>, year: string, which: 'partners' | 'regions', words: string): TradeRow[] {
  const w = words.trim().toLowerCase();
  const prev = String(Number(year) - 1);
  const world = trade[WORLD];
  const worldTotal = world ? (world.x[year] ?? NaN) + (world.m[year] ?? NaN) : NaN;
  const rows: TradeRow[] = [];
  for (const [code, p] of Object.entries(trade)) {
    if (which === 'partners' ? !isEconomy(code) : !GROUP_ORDER.has(code)) continue;
    if (!(year in p.x) && !(year in p.m)) continue;
    const name = names[code] ?? code;
    if (w && !code.toLowerCase().includes(w) && !name.toLowerCase().includes(w)) continue;
    const x = p.x[year] ?? NaN;
    const m = p.m[year] ?? NaN;
    rows.push({ code, name, x, m, balance: x - m, total: x + m, share: ((x + m) / worldTotal) * 100, xChg: pct(p.x[year], p.x[prev]), mChg: pct(p.m[year], p.m[prev]) });
  }
  if (which === 'regions') return rows.sort((a, b) => GROUP_ORDER.get(a.code)! - GROUP_ORDER.get(b.code)!);
  // A partner with one flow missing goes by the other.
  const size = (r: TradeRow) => (Number.isFinite(r.total) ? r.total : Math.max(Number.isFinite(r.x) ? r.x : 0, Number.isFinite(r.m) ? r.m : 0));
  return rows.sort((a, b) => size(b) - size(a));
}

export interface MonthRow {
  /** "2026-M06". */
  period: string;
  x: number;
  m: number;
  balance: number;
  xChg: number;
  mChg: number;
}

/** "2026-M06" -> the same month a year before, "2025-M06". */
export function yearBefore(period: string): string {
  const [y, mm] = period.split('-M');
  return `${Number(y) - 1}-M${mm}`;
}

/** "2026-M06" -> "Jun 2026". */
export function monthLabel(period: string): string {
  const [y, mm] = period.split('-M');
  const m = Number(mm);
  return m >= 1 && m <= 12 ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}` : period;
}

/** A partner's months, latest first, with the change on the same month a year before. */
export function monthRows(p: PartnerTrade | undefined, count = 24): MonthRow[] {
  if (!p) return [];
  const periods = [...new Set([...Object.keys(p.x), ...Object.keys(p.m)])].filter((k) => /^\d{4}-M\d{2}$/.test(k)).sort().reverse();
  return periods.slice(0, count).map((period) => {
    const x = p.x[period] ?? NaN;
    const m = p.m[period] ?? NaN;
    return { period, x, m, balance: x - m, xChg: pct(p.x[period], p.x[yearBefore(period)]), mChg: pct(p.m[period], p.m[yearBefore(period)]) };
  });
}

type Part<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

export const imtsData = createStore<{ v: number; annual: Record<string, Part<Record<string, PartnerTrade>>>; monthly: Record<string, Part<Record<string, PartnerTrade>>>; names?: Part<Record<string, string>> }>({ v: 0, annual: {}, monthly: {} });

export function imtsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.imf === 'function';
}

const bump = (f: (s: ReturnType<typeof imtsData.get>) => Partial<ReturnType<typeof imtsData.get>>) => imtsData.set((s) => ({ ...s, ...f(s), v: s.v + 1 }));
const asked = new Map<string, number>();
const due = (key: string) => {
  if (Date.now() - (asked.get(key) ?? 0) < 6 * 3_600_000) return false;
  asked.set(key, Date.now());
  return true;
};

async function ask(kind: 'trade' | 'trade-monthly' | 'trade-areas', arg = ''): Promise<{ text: string } | { error: string }> {
  try {
    const res = await window.arminDesktop!.imf!(kind, arg);
    if (res.text && res.status >= 200 && res.status < 300) return { text: res.text };
    return { error: res.error ? `The IMF did not answer: ${res.error}` : `The IMF answered HTTP ${res.status}.` };
  } catch (err) {
    return { error: `The IMF did not answer: ${String((err as Error)?.message ?? err)}` };
  }
}

async function loadTrade(which: 'annual' | 'monthly', key: string) {
  if (!due(`${which}:${key}`)) return;
  bump((s) => (s[which][key]?.state === 'ok' ? {} : { [which]: { ...s[which], [key]: { state: 'loading' } } }));
  const r = await ask(which === 'annual' ? 'trade' : 'trade-monthly', key);
  const data = 'text' in r ? parseImts(r.text) : null;
  if (!data) asked.delete(`${which}:${key}`);
  bump((s) => ({ [which]: { ...s[which], [key]: data ? { state: 'ok', data } : { state: 'error', message: 'error' in r ? r.error : 'The IMF answered in a format the app does not recognise.' } } }));
}

async function loadNames() {
  if (!due('names')) return;
  const r = await ask('trade-areas');
  const data = 'text' in r ? parseAreaNames(r.text) : null;
  if (!data) asked.delete('names');
  bump(() => ({ names: data ? { state: 'ok', data } : { state: 'error', message: 'error' in r ? r.error : 'unrecognised answer' } }));
}

/** An economy's annual trade with every partner, one partner's monthly trade, and the names, loaded while shown. */
export function useTrade(reporter: string, partner: string, monthly: boolean) {
  imtsData.use((s) => s.v);
  useEffect(() => {
    if (!imtsAvailable()) return;
    void loadTrade('annual', reporter);
    void loadNames();
  }, [reporter]);
  useEffect(() => {
    if (imtsAvailable() && monthly) void loadTrade('monthly', `${reporter}:${partner}`);
  }, [reporter, partner, monthly]);
  const s = imtsData.get();
  return { annual: s.annual[reporter], monthly: s.monthly[`${reporter}:${partner}`], names: s.names?.state === 'ok' ? s.names.data : {} };
}
