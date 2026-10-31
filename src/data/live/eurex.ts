/**
 * Euro Stoxx 50 (FESX) and DAX (FDAX) futures from Eurex's end-of-day statistics (electron/eurex.cjs): each contract
 * month's open, high, low, last, daily settlement, volume and open interest, and the index close. The generic lines
 * VG1 and GX1 take the front month's settlement as their price, against the day before's settlement, so INDEXFUTURES
 * shows them in the desktop app as end-of-day figures. Eurex's intraday quotes are licensed (FactSet), not used.
 */
import { engine } from '../market';
import { isoToDay } from '../calendar';
import { registerRefresh } from '../../terminal/refresh';

export interface EurexMonth { expiry: string; open: number; high: number; low: number; last: number; settle: number; volume: number; openInterest: number }
export interface EurexDay { product: string; underlyingClose: number; dates: string[]; months: EurexMonth[] }

/** The generic lines Eurex feeds, by product. */
export const EUREX_LINES: Record<'FESX' | 'FDAX', string> = { FESX: 'VG1 Index', FDAX: 'GX1 Index' };
export const EUREX_IDS = new Set(Object.values(EUREX_LINES));

const iso = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** Eurex's answer: trading dates newest first ("30-10-2026 12:00" as ISO), and the contract months by expiry. */
export function parseEurex(text: string): EurexDay | { error: string } {
  let j: { header?: { underlyingClosingPrice?: unknown; tradingDates?: unknown }; meta?: { productCode?: unknown }; dataRows?: unknown };
  try { j = JSON.parse(text); } catch { return { error: 'Eurex returned a page that is not JSON.' }; }
  if (!Array.isArray(j?.dataRows) || !j.header) return { error: 'Eurex changed its statistics format.' };
  const dates = (Array.isArray(j.header.tradingDates) ? j.header.tradingDates : [])
    .map((d) => /^(\d{2})-(\d{2})-(\d{4})/.exec(String(d)))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => `${m[3]}-${m[2]}-${m[1]}`);
  const months = (j.dataRows as Record<string, unknown>[])
    .map((r) => ({ expiry: iso(String(r?.date ?? '')), open: num(r?.open), high: num(r?.high), low: num(r?.low), last: num(r?.last), settle: num(r?.dSettle), volume: num(r?.volume), openInterest: num(r?.openInt) }))
    .filter((m) => m.expiry && m.settle > 0)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  return { product: String(j.meta?.productCode ?? ''), underlyingClose: num(j.header.underlyingClosingPrice), dates, months };
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** The front month on a business day (the first expiry on or after it: a contract leads until its last trading day) and its code ("VGZ6"). */
export function frontMonth(day: EurexDay, root: string, on: string): (EurexMonth & { code: string }) | undefined {
  const m = day.months.find((x) => x.expiry >= on);
  return m ? { ...m, code: `${root}${MONTH_CODES[Number(m.expiry.slice(5, 7)) - 1]}${m.expiry.slice(3, 4)}` } : undefined;
}

/** What each generic line was built from, for INDEXFUTURES' contract, days and open interest. */
export const eurexFront = new Map<string, { code: string; expiry: string; openInterest: number; asOf: string; underlyingClose: number }>();

const ROOT: Record<string, string> = { FESX: 'VG', FDAX: 'GX' };

/** Two days of one product into its generic line: the front month's settlement on each, the latest's range and volume. */
export function applyEurex(product: 'FESX' | 'FDAX', latest: EurexDay, before?: EurexDay): boolean {
  const id = EUREX_LINES[product];
  const on = latest.dates[0];
  const front = on ? frontMonth(latest, ROOT[product], on) : undefined;
  if (!front || !engine.get(id)) return false;
  // The same contract month the day before, so the change is the contract's own.
  const prev = before?.dates[0] ? before.months.find((m) => m.expiry === front.expiry) : undefined;
  const bar = (d: string, m: EurexMonth) => {
    const c = m.settle;
    const traded = m.open > 0 && m.high > 0 && m.low > 0;
    return { day: isoToDay(d), o: traded ? m.open : c, h: traded ? Math.max(m.high, c) : c, l: traded ? Math.min(m.low, c) : c, c, v: Number.isFinite(m.volume) ? m.volume : 0 };
  };
  const bars = [...(prev && before ? [bar(before.dates[0], prev)] : []), bar(on, front)];
  engine.setExternalDaily(id, bars, { eod: true, provider: 'Eurex (daily settlement)' });
  engine.flush([id]);
  eurexFront.set(id, { code: front.code, expiry: front.expiry, openInterest: front.openInterest, asOf: on, underlyingClose: latest.underlyingClose });
  return true;
}

export function eurexAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.eurex === 'function';
}

/** What REFRESH reports for Eurex: its loads take minutes, so a refresh starts one and does not wait for it. */
export const EUREX_REFRESH = {
  source: 'Eurex index futures',
  state: 'waiting',
  detail: 'end-of-day settlements, asked in the background: Eurex asks for 30 seconds between requests, so its four answers take about 90 s',
} as const;

/**
 * Loads each product's latest day and the day before, at Eurex's pace; again every six hours and on REFRESH. One
 * load at a time: the start, the timer and REFRESH share a load that is still running.
 */
export function startEurex(): () => void {
  if (!eurexAvailable()) return () => undefined;
  let stopped = false;
  let running: Promise<number> | undefined;
  const load = async (): Promise<number> => {
    const request = window.arminDesktop!.eurex!;
    let ok = 0;
    for (const product of ['FESX', 'FDAX'] as const) {
      if (stopped) break;
      try {
        const a = await request(product);
        const latest = a.text ? parseEurex(a.text) : { error: a.error ?? 'Eurex did not answer.' };
        if ('error' in latest) continue;
        const prevDate = latest.dates[1]?.replace(/-/g, '');
        const b = prevDate ? await request(product, prevDate) : undefined;
        const before = b?.text ? parseEurex(b.text) : undefined;
        if (applyEurex(product, latest, before && !('error' in before) ? before : undefined)) ok++;
      } catch {
        /* the other product still loads */
      }
    }
    return ok;
  };
  const loadOnce = () => (running ??= load().finally(() => { running = undefined; }));
  void loadOnce();
  const timer = setInterval(() => void loadOnce(), 6 * 3_600_000);
  const offRefresh = registerRefresh({ source: EUREX_REFRESH.source, run: () => { void loadOnce(); return { ...EUREX_REFRESH }; } });
  return () => {
    stopped = true;
    clearInterval(timer);
    offRefresh();
  };
}
