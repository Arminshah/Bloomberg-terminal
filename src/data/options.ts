import { hashString, normal } from '../core/rng';
import { blackScholes, type OptType } from '../finance/options';
import { DAY_MS, thirdFriday } from './calendar';
import { engine } from './market';
import { rangeStats } from './analytics';
import { centralBanks } from './eco';
import { etfQuotes, yahooQuotes } from './live/yahoo';
import type { SecurityDef } from './types';

export interface OptionQuote {
  type: OptType;
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: number;
  oi: number;
  ticker: string;
}

export interface ExpiryChain {
  expiry: number;
  days: number;
  t: number;
  fwd: number;
  atmIv: number;
  rate: number;
  div: number;
  rows: { strike: number; call: OptionQuote; put: OptionQuote }[];
}

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

export function riskFree(def: SecurityDef): number {
  if (def.ccy === 'USD') return (engine.quote('USGG3M Index')?.last ?? (engine.realOnly ? NaN : 4)) / 100;
  const country = def.country === 'NL' || def.country === 'DE' || def.country === 'FR' || def.country === 'IT' || def.country === 'ES' ? 'EZ' : def.country;
  const cb = centralBanks().find((b) => b.country === country);
  return (cb?.rate ?? (engine.realOnly ? NaN : 3)) / 100;
}

/** Index dividend yields come from the ETF that tracks each index (desktop app). */
export const INDEX_ETF: Record<string, string> = { 'SPX Index': 'SPY', 'NDX Index': 'QQQ', 'INDU Index': 'DIA', 'RTY Index': 'IWM' };

/** Continuous dividend yield for option and futures pricing, as a fraction. */
export function dividendYield(def: SecurityDef): number {
  if (engine.realOnly) {
    // The source's trailing yield (an index's from its ETF); none known means none assumed.
    const yq = def.cls === 'index' ? etfQuotes.get(INDEX_ETF[def.id] ?? '') : yahooQuotes.get(def.id);
    const y = Number(yq?.trailingAnnualDividendYield);
    return Number.isFinite(y) && y >= 0 ? Math.min(0.12, y) : NaN;
  }
  if (!def.eq) return def.cls === 'index' ? 0.013 : 0;
  const px = engine.quote(def.id)?.last ?? def.px;
  return Math.min(0.12, def.eq.dps / px);
}

/** At-the-money implied vol for a maturity in years. */
export function atmVol(def: SecurityDef, t: number): number {
  const rs = rangeStats(def.id);
  const realized = Number.isFinite(rs.vol30) && rs.vol30 > 0 ? rs.vol30 / 100 : def.vol;
  const base = 0.55 * realized + 0.45 * def.vol;
  const premium = def.cls === 'index' ? 1.12 : 1.06;
  const term = 1 + 0.12 * Math.exp(-t * 6) - 0.06 * Math.min(1, t);
  return Math.max(0.06, base * premium * term);
}

export function smileVol(def: SecurityDef, t: number, strike: number, fwd: number): number {
  const atm = atmVol(def, t);
  const k = Math.log(strike / fwd) / Math.sqrt(Math.max(t, 1 / 52));
  const skew = def.cls === 'index' ? 0.32 : 0.18;
  const curv = def.cls === 'index' ? 0.12 : 0.16;
  return Math.max(0.05, atm * (1 - skew * k + curv * k * k));
}

function tickRound(x: number): number {
  if (x < 0.05) return Math.max(0.01, Math.round(x * 100) / 100);
  if (x < 3) return Math.round(x * 100) / 100;
  return Math.round(x * 20) / 20;
}

function fmtExpiry(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
}

/** Full chain for one expiry, `count` strikes each side of the money. */
export function chainFor(def: SecurityDef, expiry: number, count = 12, now = engine.now()): ExpiryChain {
  const spot = engine.quote(def.id)?.last ?? def.px;
  const t = Math.max((expiry - now) / (365 * DAY_MS), 1 / (365 * 24));
  const r = riskFree(def);
  const q = dividendYield(def);
  const fwd = spot * Math.exp((r - q) * t);
  const step = strikeStep(spot) * (t > 0.5 ? 2 : 1);
  const atmK = Math.round(spot / step) * step;
  const seed = hashString(`opt:${def.id}`);
  const dayKey = engine.today;
  const rows: ExpiryChain['rows'] = [];
  const root = def.ticker.split(' ')[0];
  const suffix = def.cls === 'index' ? 'Index' : 'Equity';
  for (let i = -count; i <= count; i++) {
    const strike = Number((atmK + i * step).toFixed(2));
    if (strike <= 0) continue;
    const iv = smileVol(def, t, strike, fwd);
    const mk = (type: OptType): OptionQuote => {
      const g = blackScholes(type, spot, strike, t, r, q, iv);
      const m0 = Math.abs(Math.log(strike / spot));
      const width = Math.min(g.price * 0.08 + 0.02, 0.02 + g.price * 0.008 + spot * 0.0006 * (1 + m0 * 5));
      const half = Math.max(0.01, width) / 2;
      const bid = Math.max(0, tickRound(g.price - half));
      const ask = tickRound(g.price + half);
      const m = Math.abs(Math.log(strike / spot));
      const k = Math.round(strike * 100) + (type === 'C' ? 1 : 2);
      const oiBase = (def.cls === 'index' ? 25000 : Math.max(500, (def.adv ?? 1e6) / 2500)) * Math.exp(-m * 9) * (1 + 1.5 * Math.exp(-t * 3));
      const oi = Math.round(oiBase * Math.exp(0.5 * normal(seed, k, Math.round(expiry / DAY_MS))));
      const volume = Math.round(oi * (0.04 + 0.2 * Math.exp(-t * 8)) * Math.exp(0.6 * normal(seed, k, dayKey)));
      const exp = fmtExpiry(expiry);
      return {
        type,
        strike,
        bid,
        ask,
        mid: (bid + ask) / 2,
        last: tickRound(g.price * (1 + 0.01 * normal(seed, k, dayKey + 7))),
        iv: iv * 100,
        delta: g.delta,
        gamma: g.gamma,
        theta: g.theta,
        vega: g.vega,
        volume,
        oi,
        ticker: `${root} ${def.cls === 'equity' ? def.ticker.split(' ')[1] + ' ' : ''}${exp} ${type}${strike} ${suffix}`,
      };
    };
    rows.push({ strike, call: mk('C'), put: mk('P') });
  }
  return { expiry, days: Math.max(0, Math.ceil((expiry - now) / DAY_MS)), t, fwd, atmIv: atmVol(def, t) * 100, rate: r * 100, div: q * 100, rows };
}

export function expiryLabel(t: number, now = engine.now()): string {
  const d = new Date(t);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const days = Math.max(0, Math.ceil((t - now) / DAY_MS));
  return `${d.getUTCDate()}-${mon}-${String(d.getUTCFullYear()).slice(2)} (${days}d)`;
}
