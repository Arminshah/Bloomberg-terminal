import { createStore } from '../../core/store';
import type { NasdaqDividend } from './nasdaq-company';

/**
 * Massive's dividend record (desktop app, MASSIVE_API_KEY), the second source of dividend dates and declared dividends
 * for a stock Nasdaq's record does not cover: Nasdaq answers NYSE listings (Coca-Cola, JPMorgan, Exxon, Eli Lilly on
 * 28 October 2026) with no rows. Coca-Cola's dividend of $0.53 declared on 15 October 2026 (ex 1 December, payable 15
 * December) then had no source at all, and DIVIDENDS said "None announced". Amounts as declared, not adjusted for
 * later splits, like Nasdaq's.
 */

const TYPE: Record<string, string> = { CD: 'Cash', SC: 'Special Cash', LT: 'Long-Term Capital Gain', ST: 'Short-Term Capital Gain' };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseMassiveDividends(text: string): NasdaqDividend[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Massive answered with something other than its data.' };
  }
  if (!Array.isArray(j?.results)) return { error: j?.error || j?.message ? `Massive: ${String(j.error ?? j.message).slice(0, 120)}` : 'Massive gave no dividend list.' };
  const day = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : NaN);
  return j.results
    .map((r: any) => ({ ex: day(r?.ex_dividend_date), declared: day(r?.declaration_date), record: day(r?.record_date), pay: day(r?.pay_date), amount: typeof r?.cash_amount === 'number' ? r.cash_amount : NaN, type: TYPE[String(r?.dividend_type)] ?? 'Cash', ...(r?.currency ? { currency: String(r.currency) } : {}) }))
    .filter((d: NasdaqDividend) => Number.isFinite(d.ex))
    .sort((a: NasdaqDividend, b: NasdaqDividend) => b.ex - a.ex);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Part {
  state: 'ok' | 'error' | 'none';
  rows?: NasdaqDividend[];
  message?: string;
}

export const massiveDividendData = createStore<{ v: number; by: Record<string, Part> }>({ v: 0, by: {} });
const inflight = new Map<string, Promise<void>>();

/** Asks Massive's record once per session for a ticker (kept 12 hours in the main process). */
export function loadMassiveDividends(symbol: string): Promise<void> {
  const api = typeof window !== 'undefined' ? window.arminDesktop : undefined;
  if (!api?.massiveDividends || massiveDividendData.get().by[symbol]) return Promise.resolve();
  const running = inflight.get(symbol);
  if (running) return running;
  const put = (p: Part) => massiveDividendData.set((s) => ({ v: s.v + 1, by: { ...s.by, [symbol]: p } }));
  const job = (async () => {
    try {
      const res = await api.massiveDividends!(symbol);
      if (!res.text) return put({ state: res.missing ? 'none' : 'error', message: res.missing ? `Needs ${res.missing}` : `Massive: HTTP ${res.status || 'no answer'}` });
      const parsed = parseMassiveDividends(res.text);
      put('error' in parsed ? { state: 'error', message: parsed.error } : { state: 'ok', rows: parsed });
    } catch {
      put({ state: 'error', message: 'The Massive request could not be completed.' });
    } finally {
      inflight.delete(symbol);
    }
  })();
  inflight.set(symbol, job);
  return job;
}

/** Massive's dividends for a ticker, when it answered. */
export function massiveDividends(symbol: string | null): NasdaqDividend[] | null {
  const p = symbol ? massiveDividendData.get().by[symbol] : undefined;
  return p?.state === 'ok' ? (p.rows ?? null) : null;
}
