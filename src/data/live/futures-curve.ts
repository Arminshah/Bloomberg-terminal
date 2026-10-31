// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import type { SecurityDef } from '../types';
import { COMMODITIES } from '../universe/markets';
import { desktopData, yahooGet } from './yahoo';
import { FUTURES_EXCHANGE } from './yquotes';

/**
 * Each futures contract month's daily closes over the last three months, from Yahoo's spark answers (20 contracts a
 * request, desktop app): the forward curve a week and a month ago for CCRV, from each contract's own settlement. A
 * month's answer would start just after the day a month ago, so three are asked for.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A future's root on Yahoo: CL for CL=F. */
export function rootOf(def: SecurityDef): string {
  return (def.yahoo ?? '').replace(/=F$/, '');
}

/** The commodities with contract months on Yahoo (the rate futures are on WBF and RATEPROBS). */
export const CURVE_COMMODITIES = COMMODITIES.filter((c) => c.cmd?.group !== 'Rates' && FUTURES_EXCHANGE[rootOf(c)]);

export interface Closes {
  /** Epoch ms of each session, oldest first, with its close. */
  t: number[];
  c: number[];
}

export const curveHistory = createStore<{ v: number; by: Record<string, Closes | null> }>({ v: 0, by: {} });
const asked = new Map<string, number>();

/** A spark answer for one symbol: the sessions with a close. */
export function sparkCloses(x: any): Closes {
  const ts: number[] = Array.isArray(x?.timestamp) ? x.timestamp : [];
  const cs: (number | null)[] = Array.isArray(x?.close) ? x.close : [];
  const out: Closes = { t: [], c: [] };
  for (let i = 0; i < Math.min(ts.length, cs.length); i++) {
    const c = cs[i];
    if (typeof c === 'number' && c > 0) {
      out.t.push(ts[i] * 1000);
      out.c.push(c);
    }
  }
  return out;
}

/** The close of the last session on or before `when`; NaN when there is none. */
export function closeOnOrBefore(h: Closes | null | undefined, when: number): number {
  if (!h) return NaN;
  let v = NaN;
  for (let i = 0; i < h.t.length && h.t[i] <= when; i++) v = h.c[i];
  return v;
}

async function load(symbols: string[]) {
  const due = symbols.filter((s) => Date.now() - (asked.get(s) ?? 0) > 30 * 60_000);
  for (const s of due) asked.set(s, Date.now());
  for (let i = 0; i < due.length; i += 20) {
    const batch = due.slice(i, i + 20);
    try {
      const data: any = await yahooGet(`/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=3mo&interval=1d`);
      const got: Record<string, Closes | null> = {};
      for (const s of batch) got[s] = data?.[s] ? sparkCloses(data[s]) : null;
      curveHistory.set((st) => ({ v: st.v + 1, by: { ...st.by, ...got } }));
    } catch {
      for (const s of batch) asked.delete(s);
    }
  }
}

/** The contracts' closes over the last three months, loading them while a screen shows them. */
export function useCurveHistory(symbols: string[]): Record<string, Closes | null> {
  curveHistory.use((s) => s.v);
  const key = symbols.join(',');
  useEffect(() => {
    if (desktopData() && symbols.length) void load(symbols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return curveHistory.get().by;
}

export const WEEK = 7 * DAY_MS;
export const MONTH = 30 * DAY_MS;
