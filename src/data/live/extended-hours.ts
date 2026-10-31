// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { zonedParts } from '../../core/format';
import { engine } from '../market';
import type { SessionPrice } from '../watchlist-columns';
import { createWants, registerRefresh } from '../../terminal/refresh';
import { desktopData, extendedSessions, withSessionChart, yahooGet, yahooQuotes, yahooSymbolFor } from './yahoo';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;
/** `eveningFrom`: when the latest after-hours period that has begun opened (ms). */
type Sessions = { pre?: SessionPrice; post?: SessionPrice; eveningFrom?: number };
const updates = createStore({ v: 0 });
const wanted = createWants<string[]>();
const asked = new Map<string, number>();
const pending = new Map<string, Promise<void>>();
const answered = new Map<string, boolean>();
const REFRESH_MS = 60_000;
const FIELDS = ['ARMIN_PRE_MARKET', 'ARMIN_AFTER_HOURS', 'ARMIN_PRE_PX', 'ARMIN_POST_PX'];
export const hasSessionColumns = (ids: readonly string[]) => ids.some((id) => FIELDS.includes(id));

/** Only US-listed equities have these sessions; a foreign issuer may still be US-listed. */
function symbolFor(id: string): string | undefined {
  const d = engine.get(id);
  return d?.cls === 'equity' && / US Equity$/.test(id) ? yahooSymbolFor(d) : undefined;
}

/** Chart intervals are source-defined, so holidays, DST and early closes need no guessed hours. */
export function chartExtendedSessions(chart: Json, now = Date.now()): Sessions {
  const r = chart?.chart?.result?.[0];
  if (!r) return {};
  const flatten = (v: Json): Json[] => Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' && Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start ? [v] : [];
  const periods = (kind: string) => {
    const all = [...flatten(r.meta?.tradingPeriods?.[kind]), ...flatten(r.tradingPeriods?.[kind]), ...flatten(r.meta?.currentTradingPeriod?.[kind])];
    return [...new Map(all.map((p) => [p.start, p])).values()].sort((a, b) => a.start - b.start);
  };
  const regular = periods('regular');
  const stamps: unknown[] = Array.isArray(r.timestamp) ? r.timestamp : [];
  const prices: unknown[] = r.indicators?.quote?.[0]?.close ?? [];
  const last = (start: number, end: number) => {
    let hit: { price: number; time: number } | undefined;
    for (let i = 0; i < stamps.length; i++) {
      const time = typeof stamps[i] === 'number' ? (stamps[i] as number) * 1000 : NaN;
      const price = prices[i];
      if (time >= start * 1000 && time < end * 1000 && time <= now && typeof price === 'number' && Number.isFinite(price) && price > 0 && time > (hit?.time ?? 0)) hit = { price, time };
    }
    return hit;
  };
  const out: Sessions = {};
  const localDate = (at: number) => {
    try {
      const p = zonedParts(at, r.meta?.exchangeTimezoneName || 'America/New_York');
      return `${p.y}-${p.mo}-${p.d}`;
    } catch { return ''; }
  };
  for (const kind of ['pre', 'post'] as const) {
    for (const period of periods(kind)) {
      if (kind === 'pre' && localDate(period.start * 1000) !== localDate(now)) continue;
      const basePeriod = regular.filter((p) => p.end <= period.start).at(-1);
      if (!basePeriod) continue;
      if (kind === 'post' && period.start * 1000 <= now) out.eveningFrom = period.start * 1000;
      const trade = last(period.start, period.end);
      const base = last(basePeriod.start, basePeriod.end);
      if (!trade || !base) continue;
      if (kind === 'pre' && now - trade.time >= 20 * 3_600_000) continue;
      // The latest evening stays, frozen, through the next morning and day, until another evening trades.
      if (kind === 'post' && now - trade.time >= 5 * 86_400_000) continue;
      out[kind] = { ...trade, pct: (trade.price / base.price - 1) * 100, source: 'Yahoo Finance chart, extended hours (bar close)' };
    }
  }
  return out;
}

/**
 * Fetch supplementary sessions even when Alpaca owns regular prices. This never writes an engine quote or
 * history. Full quotes are batched; charts provide an independent fallback when Yahoo refuses its quote cookie.
 */
export async function refreshExtendedQuotes(ids: readonly string[], force = false): Promise<void> {
  if (!desktopData()) return;
  const eligible = [...new Set(ids)].filter((id) => symbolFor(id));
  const joined = eligible.flatMap((id) => pending.get(id) ? [pending.get(id)!] : []);
  const due = eligible.filter((id) => !pending.has(id) && (force || Date.now() - (asked.get(id) ?? 0) >= REFRESH_MS));
  for (let i = 0; i < due.length; i += 50) {
    const batch = due.slice(i, i + 50);
    const symbols = batch.map((id) => symbolFor(id)!);
    for (const id of batch) { asked.set(id, Date.now()); answered.set(id, false); }
    const work = (async () => {
      let quotes: Json[] = [];
      try {
        const res = await yahooGet(`/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(',')}`);
        quotes = res?.quoteResponse?.result ?? [];
      } catch { /* Chart needs no accepted cookie; keep TLS and the existing transport controls. */ }
      const missing: string[] = [];
      for (const id of batch) {
        const symbol = symbolFor(id)!;
        const q = quotes.find((q) => q?.symbol === symbol);
        if (q) {
          answered.set(id, true);
          yahooQuotes.set(id, withSessionChart(id, q));
        }
        const sessions = extendedSessions(id);
        // Yahoo's quote drops the previous evening once the pre-market opens; its chart keeps both sessions. The
        // morning's pre-market is not asked for once it is over.
        if (!q || (q.hasPrePostMarketData !== false && (!sessions.post || (!sessions.pre && !sessions.preOver)))) missing.push(id);
      }
      // Bound concurrency for long lists and stay inside the main process's provider request budgets.
      for (let k = 0; k < missing.length; k += 3) await Promise.all(missing.slice(k, k + 3).map(async (id) => {
        try {
          const chart = await yahooGet(`/v8/finance/chart/${encodeURIComponent(symbolFor(id)!)}?range=5d&interval=5m&includePrePost=true`);
          const meta = chart?.chart?.result?.[0]?.meta;
          if (!meta) return;
          answered.set(id, true);
          const old = yahooQuotes.get(id);
          const quote = quotes.find((q) => q?.symbol === symbolFor(id));
          // A chart response must supersede stale raw session fields when the quote request failed.
          const chartOnly = !quote ? { marketState: undefined, regularMarketTime: meta.regularMarketTime, regularMarketPrice: meta.regularMarketPrice, preMarketPrice: undefined, preMarketTime: undefined, postMarketPrice: undefined, postMarketTime: undefined } : {};
          yahooQuotes.set(id, { ...meta, ...old, ...chartOnly, arminSessionChart: chartExtendedSessions(chart) });
        } catch { /* The missing session stays unavailable; a price from IEX is never substituted. */ }
      }));
      updates.set((s) => ({ v: s.v + 1 }));
    })().finally(() => { for (const id of batch) pending.delete(id); });
    for (const id of batch) pending.set(id, work);
    joined.push(work);
  }
  await Promise.all(joined);
}

/** Mount only for visible monitors with session columns selected. Regular price ownership stays unchanged. */
export function useExtendedSessionQuotes(ids: readonly string[]): void {
  updates.use((s) => s.v);
  const key = ids.join(',');
  useEffect(() => {
    if (!desktopData() || !ids.length) return;
    const off = wanted.add(key, [...ids]);
    void refreshExtendedQuotes(ids);
    const timer = setInterval(() => void refreshExtendedQuotes(ids), REFRESH_MS);
    return () => { off(); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

registerRefresh({
  source: 'Yahoo extended-hours quotes',
  available: desktopData,
  run: async () => {
    const ids = [...new Set(wanted.values().flat())].filter((id) => symbolFor(id));
    if (!ids.length) return [];
    await refreshExtendedQuotes(ids, true);
    const got = ids.filter((id) => answered.get(id)).length;
    const observations = ids.filter((id) => {
      const q = yahooQuotes.get(id);
      return q?.preMarketPrice > 0 || q?.postMarketPrice > 0 || q?.arminSessionChart?.pre || q?.arminSessionChart?.post;
    }).length;
    return { source: 'Yahoo extended-hours quotes', state: got ? 'asked' : 'failed', detail: `${got} of ${ids.length} equities answered; ${observations} have extended-session observations; unavailable sessions remain blank` };
  },
});
/* eslint-enable @typescript-eslint/no-explicit-any */
