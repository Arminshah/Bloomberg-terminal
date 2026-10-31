// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { engine } from './market';
import { curveAt, interp } from './curves';
import { centralBanks } from './eco';

/**
 * Indicative money-market and swap rates used by FRD, OVML and SWPM. Short
 * ends start from the policy rate and blend into the government curve where
 * the universe has one; other currencies use a flat policy-rate curve.
 */

const BANK_FOR: Record<string, string> = {
  USD: 'FED', EUR: 'ECB', GBP: 'BOE', JPY: 'BOJ', CAD: 'BOC', AUD: 'RBA', CHF: 'SNB', CNH: 'PBOC', INR: 'RBI', BRL: 'BCB', MXN: 'BANXICO',
};

/** Policy rates for currencies without a modelled central bank (percent, indicative). */
const OTHER_POLICY: Record<string, number> = {
  NZD: 2.5, SEK: 1.75, NOK: 4.0, SGD: 1.6, KRW: 2.5, ZAR: 6.75, TRY: 38.0, DKK: 1.6, TWD: 2.0,
};

const CURVE_FOR: Record<string, string> = { USD: 'US', EUR: 'DE', GBP: 'GB', JPY: 'JP' };

export function policyRate(ccy: string): number {
  if (ccy === 'HKD') return engine.realOnly ? NaN : policyRate('USD') - 0.25;
  const code = BANK_FOR[ccy];
  if (code) {
    const cb = centralBanks().find((b) => b.code === code);
    if (cb) return cb.rate;
  }
  // The desktop app has no reference rates: a currency without a real policy rate has none.
  if (engine.realOnly) return NaN;
  return OTHER_POLICY[ccy] ?? 3;
}

/** Deposit rate (percent) for a currency and term in years. */
export function depoRate(ccy: string, years: number): number {
  const curve = CURVE_FOR[ccy];
  if (ccy === 'USD') return interp(curveAt('US', 0), years);
  const pol = policyRate(ccy);
  if (!curve) return pol;
  const pts = curveAt(curve, 0);
  if (!pts.length) return pol;
  const first = pts[0];
  if (years >= first.tenor) return interp(pts, years);
  // Blend from the policy rate overnight to the first curve point.
  return pol + ((first.y - pol) * years) / first.tenor;
}

const SWAP_SPREAD: [number, number][] = [
  [0, 0.02], [1, 0.04], [2, 0.05], [5, -0.08], [10, -0.22], [30, -0.48],
];

/** Monotone cubic (Fritsch-Carlson) interpolation: smooth, with no overshoot between points. */
export function pchip(points: { tenor: number; y: number }[], t: number): number {
  const n = points.length;
  if (!n) return NaN;
  if (t <= points[0].tenor) return points[0].y;
  if (t >= points[n - 1].tenor) return points[n - 1].y;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(points[i + 1].tenor - points[i].tenor);
    d.push((points[i + 1].y - points[i].y) / h[i]);
  }
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m.push(0);
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
    }
  }
  m.push(d[n - 2]);
  let k = 0;
  while (t > points[k + 1].tenor) k++;
  const s = (t - points[k].tenor) / h[k];
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  return h00 * points[k].y + h10 * h[k] * m[k] + h01 * points[k + 1].y + h11 * h[k] * m[k + 1];
}

/** USD SOFR par swap rate (percent): Treasury yield plus the swap spread, smoothly interpolated. */
export function swapRate(years: number): number {
  const spread = interp(SWAP_SPREAD.map(([tenor, y]) => ({ tenor, y })), years);
  return pchip(curveAt('US', 0), years) + spread;
}

/** Discount factors at whole years 0..n from annual-pay par swap rates (bootstrapped). */
export function bootstrap(n: number): number[] {
  const df = [1];
  let annuity = 0;
  for (let k = 1; k <= n; k++) {
    const c = swapRate(k) / 100;
    const d = (1 - c * annuity) / (1 + c);
    df.push(d);
    annuity += d;
  }
  return df;
}

/** Points scale for an FX pair: one pip in price units. */
export function pipSize(px: number): number {
  if (px >= 500) return 1;
  if (px >= 20) return 0.01;
  return 0.0001;
}

/** Money-market day-count basis for a currency. */
export function basis(ccy: string): number {
  return ['GBP', 'AUD', 'NZD', 'SGD', 'HKD', 'ZAR', 'INR'].includes(ccy) ? 365 : 360;
}

/** Outright forward by covered interest parity. */
export function fxForward(spot: number, base: string, quote: string, days: number): number {
  const t = days / 365;
  const rb = depoRate(base, t) / 100;
  const rq = depoRate(quote, t) / 100;
  if (days <= 366) return (spot * (1 + (rq * days) / basis(quote))) / (1 + (rb * days) / basis(base));
  return spot * Math.pow((1 + rq) / (1 + rb), t);
}

export function spotQuote(id: string): number {
  return engine.quote(id)?.last ?? NaN;
}
