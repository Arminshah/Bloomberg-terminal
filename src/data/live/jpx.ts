/**
 * The Nikkei 225 future on the Osaka Exchange (NK1) from JPX's end-of-day files (electron/jpx.cjs, electron/main.cjs):
 * the front month's settlement, the index close JPX settles against, and the month's volume and open interest. JPX
 * keeps only the latest day online, so the main process keeps each day it has read; the day's change is against the
 * settlement of the previous Tokyo trading day when the app read that day too, and is blank otherwise. JPX publishes
 * no open, high or low in these files, so those are blank, never the settlement repeated.
 */
import { engine } from '../market';
import { isoToDay } from '../calendar';
import { JPX_MARKET, marketDay } from '../exchanges';
import { registerRefresh } from '../../terminal/refresh';
import type { JpxDay } from './lookup';

export const JPX_IDS = new Set(['NK1 Index']);

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** The Tokyo trading day before a date, from JPX's published holidays; undefined past the years the calendar covers. */
export function previousJpxDay(iso: string): string | undefined {
  const d = new Date(`${iso}T00:00:00Z`);
  for (let k = 0; k < 15; k++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = d.toISOString().slice(0, 10);
    const year = Number(day.slice(0, 4));
    if (year > (JPX_MARKET.through ?? 0) || year < 2026) return undefined;
    const w = d.getUTCDay();
    const holiday = marketDay(JPX_MARKET, day);
    // A holiday has no close; a day with an early close still trades.
    if (w === 0 || w === 6 || (holiday && holiday.close === undefined)) continue;
    return day;
  }
  return undefined;
}

/** What NK1 was built from, for INDEXFUTURES' contract, days and open interest. */
export const jpxFront = new Map<string, { code: string; expiry: string; openInterest: number; asOf: string; underlyingClose: number }>();

/** The latest day's front month into NK1: its settlement, the previous trading day's for the change, the month's volume. */
export function applyJpx(days: Record<string, JpxDay>): boolean {
  const id = 'NK1 Index';
  const dates = Object.keys(days).sort();
  const on = dates[dates.length - 1];
  const day = on ? days[on] : undefined;
  const front = day?.months.find((m) => m.sq > on);
  if (!day || !front || !engine.get(id)) return false;
  // The last trading day is the Tokyo trading day before the special quotation day.
  const expiry = previousJpxDay(front.sq) ?? front.sq;
  const before = previousJpxDay(on);
  const prev = before ? days[before]?.months.find((m) => m.sq === front.sq) : undefined;
  const oi = day.oi?.[front.month];
  const bar = (d: string, settle: number, volume: number) => ({ day: isoToDay(d), o: NaN, h: NaN, l: NaN, c: settle, v: volume });
  const bars = [...(prev && before ? [bar(before, prev.settle, days[before].oi?.[front.month]?.volume ?? NaN)] : []), bar(on, front.settle, oi?.volume ?? NaN)];
  engine.setExternalDaily(id, bars, { eod: true, provider: 'JPX (daily settlement)' });
  engine.flush([id]);
  jpxFront.set(id, { code: `NK${MONTH_CODES[Number(front.month.slice(5, 7)) - 1]}${front.month.slice(3, 4)}`, expiry, openInterest: oi?.openInterest ?? NaN, asOf: on, underlyingClose: day.close });
  return true;
}

export function jpxAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.jpx === 'function';
}

/** NK1 from JPX at start and every six hours; REFRESH starts a load and does not wait for JPX's 4 MB file. */
export function startJpx(): () => void {
  if (!jpxAvailable()) return () => undefined;
  let running: Promise<boolean> | undefined;
  const load = () => (running ??= window.arminDesktop!.jpx!()
    .then((a) => applyJpx(a.days ?? {}))
    .catch(() => false)
    .finally(() => { running = undefined; }));
  void load();
  const timer = setInterval(() => void load(), 6 * 3_600_000);
  const off = registerRefresh({ source: 'JPX Nikkei 225 future', run: () => { void load(); return { source: 'JPX Nikkei 225 future', state: 'waiting', detail: "end-of-day settlement, asked in the background (JPX's file is about 4 MB)" }; } });
  return () => {
    clearInterval(timer);
    off();
  };
}
