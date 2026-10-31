// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * Analysts' rating actions on a US-listed stock with the analyst, the firm and the price target before and after, as
 * MarketBeat's forecast page lists them (desktop app, no key; electron/analyst-actions.cjs).
 */

export interface AnalystAction {
  /** YYYY-MM-DD. */
  date: string;
  firm: string;
  analyst: string;
  /** As MarketBeat words it: "Lower Target", "Reiterated Rating", "Upgrade"... */
  action: string;
  rating: string;
  /** The price target before and after; NaN where the action set none. */
  from: number;
  to: number;
}

export type Position = 'BUY' | 'HOLD' | 'SELL' | '';

/** Buy, hold or sell, from the firm's own rating words. */
export function position(rating: string): Position {
  const r = rating.toLowerCase();
  if (/\b(strong[- ]?sell|sell|underperform|underweight|reduce|negative)\b/.test(r)) return 'SELL';
  if (/\b(hold|neutral|equal[- ]?weight|market perform|sector perform|peer perform|in[- ]line|perform|mixed|fair value)\b/.test(r) && !/outperform/.test(r)) return 'HOLD';
  if (/\b(strong[- ]?buy|buy|outperform|overweight|accumulate|positive|add|top pick|conviction)\b/.test(r)) return 'BUY';
  return '';
}

/** A short form of the action: Upgraded, Downgraded, Initiated, Raised target, Lowered target, Set target, Reiterated. */
export function actionLabel(a: AnalystAction): string {
  const s = a.action.toLowerCase();
  if (/upgrade/.test(s)) return 'Upgraded';
  if (/downgrade/.test(s)) return 'Downgraded';
  if (/initiat|coverage/.test(s)) return 'Initiated';
  if (Number.isFinite(a.from) && Number.isFinite(a.to) && a.from !== a.to) return a.to > a.from ? 'Raised target' : 'Lowered target';
  if (/boost|raise/.test(s)) return 'Raised target';
  if (/lower|cut/.test(s)) return 'Lowered target';
  if (/set target/.test(s)) return 'Set target';
  if (/reiterat|maintain|reaffirm/.test(s)) return 'Reiterated';
  return a.action;
}

export function parseActions(text: string): AnalystAction[] | null {
  try {
    const list = JSON.parse(text) as unknown;
    if (!Array.isArray(list)) return null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const out = list
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { date?: unknown }).date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((r as { date: string }).date) && typeof (r as { firm?: unknown }).firm === 'string')
      .map((r) => ({ date: String(r.date), firm: String(r.firm), analyst: typeof r.analyst === 'string' ? r.analyst : '', action: typeof r.action === 'string' ? r.action : '', rating: typeof r.rating === 'string' ? r.rating : '', from: num(r.from), to: num(r.to) }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

interface Entry {
  state: 'loading' | 'ok' | 'error';
  rows?: AnalystAction[];
  message?: string;
  at: number;
  /** An earlier answer kept because the latest request failed. */
  stale?: boolean;
}

export const actionsData = createStore<{ v: number; by: Record<string, Entry> }>({ v: 0, by: {} });

export function actionsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.analystActions === 'function';
}

async function load(symbol: string) {
  const have = actionsData.get().by[symbol];
  if (have && (have.state === 'loading' || Date.now() - have.at < (have.state === 'ok' && !have.stale ? 6 * 3_600_000 : 15 * 60_000))) return;
  const set = (e: Entry) => actionsData.set((s) => ({ v: s.v + 1, by: { ...s.by, [symbol]: e } }));
  set({ ...(have ?? {}), state: 'loading', at: have?.at ?? 0 });
  try {
    const res = await window.arminDesktop!.analystActions!(symbol);
    const rows = res.text ? parseActions(res.text) : null;
    set(rows ? { state: 'ok', rows, at: res.at ?? Date.now(), ...(res.stale ? { stale: true } : {}) } : { state: 'error', rows: have?.rows, message: res.error ?? (res.status ? `MarketBeat answered ${res.status}` : 'no answer'), at: Date.now() });
  } catch {
    set({ state: 'error', rows: have?.rows, message: 'the request could not be made', at: Date.now() });
  }
}

/** A US-listed stock's rating actions while a screen shows them. */
export function useAnalystActions(def: SecurityDef | undefined): Entry | undefined {
  const symbol = def && actionsAvailable() ? secTicker(def) : null;
  const entry = actionsData.use((s) => (symbol ? s.by[symbol] : undefined));
  useEffect(() => {
    if (symbol) void load(symbol);
  }, [symbol]);
  return entry;
}

/** One firm's standing view, as an analyst table lists its sources: its latest rating and target and their date. */
export interface FirmRating {
  firm: string;
  analyst: string;
  /** The firm's own words for its latest rating; empty when its actions set none. */
  rating: string;
  /** Its latest price target; NaN when it set none. */
  target: number;
  /** YYYY-MM-DD of its latest action. */
  date: string;
  /** Its latest rating came with an upgrade or a downgrade. */
  upgraded: boolean;
  downgraded: boolean;
}

/**
 * Each firm once, newest action first: the latest rating it gave, the latest target it set and the analyst on its latest
 * action. A target-only action keeps the rating given before it, as the firm's rating stands until it changes.
 */
export function latestByFirm(rows: AnalystAction[]): FirmRating[] {
  const newest = rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.date.localeCompare(a.r.date) || a.i - b.i).map((x) => x.r);
  const by = new Map<string, FirmRating>();
  for (const r of newest) {
    const key = r.firm.trim().toLowerCase();
    if (!key) continue;
    let f = by.get(key);
    if (!f) {
      f = { firm: r.firm.trim(), analyst: r.analyst.trim(), rating: '', target: NaN, date: r.date, upgraded: false, downgraded: false };
      by.set(key, f);
    }
    if (!f.rating && r.rating.trim()) {
      f.rating = r.rating.trim();
      const act = actionLabel(r);
      f.upgraded = act === 'Upgraded';
      f.downgraded = act === 'Downgraded';
    }
    if (!Number.isFinite(f.target) && Number.isFinite(r.to)) f.target = r.to;
    if (!f.analyst && r.analyst.trim()) f.analyst = r.analyst.trim();
  }
  return [...by.values()];
}

/**
 * The colour ANR gives a rating word, as a class: green for buys, yellow for holds, red for sells, and orange (the app's
 * amber) for a rating suspended, restricted or under review.
 */
export function ratingTone(rating: string): 'up' | 'yellow' | 'dn' | 'amber' | 'muted' {
  if (/suspend|restrict|under review|not rated/i.test(rating)) return 'amber';
  const p = position(rating);
  return p === 'BUY' ? 'up' : p === 'HOLD' ? 'yellow' : p === 'SELL' ? 'dn' : 'muted';
}
