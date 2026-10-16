import { DAY_MS, thirdFriday } from './calendar';
import { engine } from './market';
import { centralBanks } from './eco';
import { etfDividendYield, trailingDividendYield } from './live/yahoo';
import type { SecurityDef } from './types';

/** Expiry timestamps (16:00 New York ~ 20:00/21:00 UTC). */
export function expiries(now = engine.now()): number[] {
  const out = new Set<number>();
  const d = new Date(now);
  // Weekly Fridays for the next five weeks.
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  for (let k = 0; k < 40 && out.size < 5; k++) {
    const x = new Date(day.getTime() + k * DAY_MS);
    if (x.getUTCDay() === 5) {
      const t = x.getTime() + 20 * 3600_000;
      if (t > now) out.add(t);
    }
  }
  // Monthlies (third Friday) for the next nine months.
  for (let m = 0; m < 10; m++) {
    const tf = thirdFriday(d.getUTCFullYear(), d.getUTCMonth() + m).getTime() + 20 * 3600_000;
    if (tf > now) out.add(tf);
  }
  // LEAPS: January of the next two years.
  for (let y = 1; y <= 2; y++) out.add(thirdFriday(d.getUTCFullYear() + y, 0).getTime() + 20 * 3600_000);
  return [...out].sort((a, b) => a - b);
}

export function strikeStep(spot: number): number {
  if (spot < 10) return 0.5;
  if (spot < 30) return 1;
  if (spot < 75) return 2.5;
  if (spot < 200) return 5;
  if (spot < 600) return 10;
  if (spot < 1500) return 25;
  if (spot < 5000) return 50;
  if (spot < 20000) return 100;
  return 250;
}

/** The central bank rate that stands in for a currency's short rate, and its name. */
const RATE_BY_CCY: Record<string, { bank: string; name: string }> = {
  EUR: { bank: 'ECB', name: 'ECB deposit facility rate' },
  GBP: { bank: 'BOE', name: 'Bank of England Bank Rate' },
  GBp: { bank: 'BOE', name: 'Bank of England Bank Rate' },
  CAD: { bank: 'BOC', name: 'Bank of Canada target rate' },
  AUD: { bank: 'RBA', name: 'RBA cash rate target' },
  CHF: { bank: 'SNB', name: 'SNB policy rate' },
  BRL: { bank: 'BCB', name: 'Selic target' },
  JPY: { bank: 'BOJ', name: 'Bank of Japan policy rate' },
  CNY: { bank: 'PBOC', name: '1-year loan prime rate' },
  INR: { bank: 'RBI', name: 'RBI repo rate' },
  MXN: { bank: 'BANXICO', name: 'Banxico overnight rate' },
};

/**
 * The financing rate for an option on `def`, by the currency it trades in, as
 * a fraction, with what it is: the 3-month Treasury par yield for dollars,
 * otherwise the central bank's policy rate. NaN in the desktop app when the
 * bank has no free daily source there.
 */
export function riskFreeRate(def: SecurityDef): { r: number; name: string } {
  if (def.ccy === 'USD') return { r: (engine.quote('USGG3M Index')?.last ?? (engine.realOnly ? NaN : 4)) / 100, name: 'US Treasury 3-month par yield' };
  const m = RATE_BY_CCY[def.ccy];
  const cb = m ? centralBanks().find((b) => b.code === m.bank) : undefined;
  if (cb && m) return { r: cb.rate / 100, name: m.name };
  return engine.realOnly ? { r: NaN, name: `no published ${def.ccy === 'GBp' ? 'GBP' : def.ccy} rate in this app` } : { r: 0.03, name: 'reference rate' };
}

export function riskFree(def: SecurityDef): number {
  return riskFreeRate(def).r;
}

/** Index dividend yields come from the ETF that tracks each index (desktop app). */
export const INDEX_ETF: Record<string, string> = { 'SPX Index': 'SPY', 'NDX Index': 'QQQ', 'INDU Index': 'DIA', 'RTY Index': 'IWM' };

/** Continuous dividend yield for option and futures pricing, as a fraction. */
export function dividendYield(def: SecurityDef): number {
  // On real data, the dividends paid over the past 12 months over the live price (an index's from its ETF).
  if (engine.realOnly) return def.cls === 'index' ? etfDividendYield(INDEX_ETF[def.id] ?? '') : trailingDividendYield(def.id);
  if (!def.eq) return def.cls === 'index' ? 0.013 : 0;
  const px = engine.quote(def.id)?.last ?? def.px;
  return Math.min(0.12, def.eq.dps / px);
}

export function expiryLabel(t: number, now = engine.now()): string {
  const d = new Date(t);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const days = Math.max(0, Math.ceil((t - now) / DAY_MS));
  return `${d.getUTCDate()}-${mon}-${String(d.getUTCFullYear()).slice(2)} (${days}d)`;
}
