// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * ASIC's daily aggregated short positions for ASX products (electron/asic.cjs; CC BY 4.0, "© Australian Securities &
 * Investments Commission"): each product's reported short position, the product in issue and the share short, as of
 * four trading days before publication. One file a day covers every product, so the files are kept and shared by
 * every ASX stock on screen. SI shows the latest day and two days a month over two years: the last published on or
 * before the 15th and at the month's end.
 */
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';

export interface AsicDay { date: string; version: string }
export interface AsicPosition { short: number; issued: number; pct: number }
export interface AsicRow extends AsicPosition { date: string }

/** The index of published days, newest first. */
export function parseAsicIndex(text: string): AsicDay[] {
  let rows: unknown;
  try { rows = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  const out: AsicDay[] = [];
  for (const r of rows) {
    const date = String((r as { date?: unknown })?.date ?? '');
    const version = String((r as { version?: unknown })?.version ?? '');
    if (/^\d{8}$/.test(date) && /^\d{3}$/.test(version)) out.push({ date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, version });
  }
  // A day republished under a later version keeps only that version.
  const latest = new Map<string, AsicDay>();
  for (const d of out) if (!latest.has(d.date) || d.version > latest.get(d.date)!.version) latest.set(d.date, d);
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** One day's file: product code → position. Names may hold commas, so the figures are read from the line's end. */
export function parseAsicDay(text: string): Map<string, AsicPosition> {
  const out = new Map<string, AsicPosition>();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!/^Product,Product Code,Reported Short Positions,Total Product in Issue,/.test(lines[0] ?? '')) return out;
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length < 5) continue;
    const [code, short, issued, pct] = cells.slice(-4).map((c) => c.trim());
    const n = [Number(short), Number(issued), Number(pct)];
    if (/^[A-Z0-9]{2,6}$/.test(code) && n.every(Number.isFinite) && n[1] > 0) out.set(code, { short: n[0], issued: n[1], pct: n[2] });
  }
  return out;
}

/** The days SI asks for: the latest, then the last published on or before each 15th and month end, two years back. */
export function asicSampleDays(index: AsicDay[], months = 24): AsicDay[] {
  if (!index.length) return [];
  const picked = new Map<string, AsicDay>([[index[0].date, index[0]]]);
  const [y, m] = index[0].date.split('-').map(Number);
  for (let k = 0; k <= months; k++) {
    const month = new Date(Date.UTC(y, m - 1 - k, 1));
    const ym = month.toISOString().slice(0, 7);
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    for (const cutoff of [`${ym}-15`, end]) {
      const day = index.find((d) => d.date <= cutoff);
      if (day && day.date >= `${ym}-01`) picked.set(day.date, day);
    }
  }
  return [...picked.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** An ASX line's product code ("BHP AU" → BHP). */
export function asxCode(def: SecurityDef | undefined): string | null {
  const m = def?.cls === 'equity' && def.country === 'AU' ? /^([A-Z0-9]{2,6}) AU$/.exec(def.ticker) : null;
  return m ? m[1] : null;
}

const store = createStore<{ v: number; index?: AsicDay[]; days: Record<string, Map<string, AsicPosition>>; problem?: string; loading: boolean }>({ v: 0, days: {}, loading: false });
let asked = 0;

async function load(): Promise<void> {
  const request = window.arminDesktop?.asic;
  if (!request || store.get().loading || Date.now() - asked < 3 * 3_600_000) return;
  asked = Date.now();
  store.set((s) => ({ ...s, loading: true }));
  try {
    const answer = await request('index');
    const index = answer.text ? parseAsicIndex(answer.text) : [];
    if (!index.length) {
      store.set((s) => ({ ...s, loading: false, problem: answer.error ?? 'ASIC gave no list of published days.', v: s.v + 1 }));
      asked = 0;
      return;
    }
    store.set((s) => ({ ...s, index, v: s.v + 1 }));
    const wanted = asicSampleDays(index).filter((d) => !store.get().days[d.date]);
    // Four at a time: the files are small and ASIC publishes no limit.
    for (let i = 0; i < wanted.length; i += 4) {
      const got = await Promise.all(wanted.slice(i, i + 4).map(async (d) => {
        const a = await request('day', d.date.replace(/-/g, ''), d.version).catch(() => null);
        return [d.date, a?.text ? parseAsicDay(a.text) : new Map<string, AsicPosition>()] as const;
      }));
      store.set((s) => ({ ...s, days: { ...s.days, ...Object.fromEntries(got.filter(([, m]) => m.size)) }, v: s.v + 1 }));
    }
    store.set((s) => ({ ...s, loading: false, problem: undefined, v: s.v + 1 }));
  } catch {
    store.set((s) => ({ ...s, loading: false, problem: 'ASIC did not answer.', v: s.v + 1 }));
    asked = 0;
  }
}

/** An ASX stock's short positions on the sampled days, newest first. */
export function useAsicShort(def: SecurityDef | undefined): { available: boolean; code: string | null; rows: AsicRow[]; loading: boolean; problem?: string } {
  store.use((s) => s.v);
  const code = asxCode(def);
  const available = typeof window !== 'undefined' && typeof window.arminDesktop?.asic === 'function';
  useEffect(() => {
    if (code && available) void load();
  }, [code, available]);
  const s = store.get();
  const rows = code ? Object.entries(s.days).flatMap(([date, m]) => (m.has(code) ? [{ date, ...m.get(code)! }] : [])).sort((a, b) => b.date.localeCompare(a.date)) : [];
  return { available, code, rows, loading: s.loading, problem: s.problem };
}
