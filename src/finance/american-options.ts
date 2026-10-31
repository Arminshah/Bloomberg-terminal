// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/** American vanilla options, continuous yields. Tian's three-moment recombining lattice (1993). */
import { blackScholes, impliedVol, type Greeks, type OptType } from './options';

const missing: Greeks = { price: NaN, delta: NaN, gamma: NaN, vega: NaN, theta: NaN, rho: NaN };
const intrinsic = (type: OptType, spot: number, strike: number) => Math.max(0, type === 'C' ? spot - strike : strike - spot);
const valid = (type: OptType, spot: number, strike: number, years: number, rate: number, dividend: number, vol: number, steps: number) =>
  ['C', 'P'].includes(type) && [spot, strike, years, rate, dividend, vol].every(Number.isFinite) && spot > 0 && strike > 0 && years >= 0 && years <= 100 && vol >= 0 && Number.isInteger(steps) && steps >= 25 && steps <= 1600;
const noEarlyExercise = (type: OptType, rate: number, dividend: number) => type === 'C' ? dividend <= 0 && rate >= 0 : rate <= 0 && dividend >= 0;

/** At zero vol, maximise the discounted deterministic exercise payoff over every exercise time. */
export function deterministicAmerican(type: OptType, spot: number, strike: number, years: number, rate: number, dividend: number): number {
  if (!valid(type, spot, strike, years, rate, dividend, 0, 100)) return NaN;
  const times = [0, years];
  if (rate !== dividend && rate !== 0 && dividend !== 0 && Math.sign(rate) === Math.sign(dividend)) {
    const stationary = Math.log((rate * strike) / (dividend * spot)) / (rate - dividend);
    if (stationary > 0 && stationary < years) times.push(stationary);
  }
  const price = Math.max(...times.map((t) => intrinsic(type, spot * Math.exp(-dividend * t), strike * Math.exp(-rate * t))));
  return Number.isFinite(price) ? price : NaN;
}

/** A single lattice. Nodes match the first three moments; probabilities remain valid at low vol. */
function tree(type: OptType, S: number, K: number, T: number, r: number, q: number, v: number, n: number): number {
  const dt = T / n;
  const variance = v * v * dt;
  const e = Math.expm1(variance);
  const root = Math.sqrt(e * (4 + e));
  const a = variance + Math.log1p((e + root) / 2);
  const jump = 2 * (a - variance);
  const down = (r - q) * dt + 2 * variance - a;
  const up = down + jump;
  const p = Math.expm1(a - 2 * variance) / Math.expm1(jump);
  const discount = Math.exp(-r * dt);
  const logS = Math.log(S);
  // Reject over/underflowing terminal grids; never silently reduce vol or time to fit the model.
  if (![p, discount, up, down].every(Number.isFinite) || p < 0 || p > 1 || Math.max(Math.abs(logS + n * up), Math.abs(logS + n * down)) > 690) return NaN;
  const step = Math.exp(jump);
  const values = new Float64Array(n);
  // Binomial Black-Scholes terminal smoothing: replace the final time interval's
  // kinked payoff grid with its European continuation value, retaining exercise
  // at this penultimate layer. It markedly improves finite-bump gamma stability.
  let node = Math.exp(logS + (n - 1) * down);
  for (let j = 0; j < n; j++, node *= step) values[j] = Math.max(intrinsic(type, node, K), blackScholes(type, node, K, dt, r, q, v).price);
  const pu = discount * p;
  const pd = discount * (1 - p);
  for (let i = n - 2; i >= 0; i--) {
    node = Math.exp(logS + i * down);
    for (let j = 0; j <= i; j++, node *= step) values[j] = Math.max(intrinsic(type, node, K), pu * values[j + 1] + pd * values[j]);
  }
  return Number.isFinite(values[0]) ? values[0] : NaN;
}

/** Average adjacent grids to reduce strike alignment oscillation; enforce analytical lower bounds. */
export function americanPrice(type: OptType, S: number, K: number, T: number, r: number, q: number, v: number, steps = 400): number {
  if (!valid(type, S, K, T, r, q, v, steps)) return NaN;
  if (T === 0) return intrinsic(type, S, K);
  if (v === 0) return deterministicAmerican(type, S, K, T, r, q);
  const european = blackScholes(type, S, K, T, r, q, v).price;
  if (noEarlyExercise(type, r, q)) return european;
  const price = (tree(type, S, K, T, r, q, v, steps) + tree(type, S, K, T, r, q, v, steps + 1)) / 2;
  return Number.isFinite(price) && Number.isFinite(european) ? Math.max(price, european, intrinsic(type, S, K)) : NaN;
}

export interface AmericanValuation extends Greeks {
  europeanPrice: number;
  earlyExercisePremium: number;
  exerciseNow: boolean;
  steps: number;
  /** Spot bump adapts to lattice spacing, bounded between 0.5% and 5%. */
  spotBumpPercent: number;
  /** Absolute change from half as many steps. A convergence diagnostic, not an error bound. */
  gridDifference: number;
}

/** Bump Greeks refer to the same bounded price; spot bump covers a lattice jump to reduce grid noise. */
export function americanOption(type: OptType, S: number, K: number, T: number, r: number, q: number, v: number, steps = 400): AmericanValuation {
  const price = americanPrice(type, S, K, T, r, q, v, steps);
  const european = blackScholes(type, S, K, T, r, q, v);
  const spotBumpPercent = Math.min(0.05, Math.max(0.005, v * Math.sqrt(T / steps))) * 100;
  const extra = { europeanPrice: european.price, earlyExercisePremium: price - european.price, exerciseNow: T > 0 && intrinsic(type, S, K) > 0 && Math.abs(price - intrinsic(type, S, K)) <= 1e-9 * Math.max(S, K), steps, spotBumpPercent, gridDifference: NaN };
  if (!Number.isFinite(price)) return { ...missing, ...extra };
  if (T === 0 || noEarlyExercise(type, r, q)) return { ...european, ...extra, gridDifference: 0 };
  const h = S * spotBumpPercent / 100;
  const up = americanPrice(type, S + h, K, T, r, q, v, steps);
  const down = americanPrice(type, S - h, K, T, r, q, v, steps);
  const dv = Math.min(0.001, v / 2);
  const vega = v > 0 ? (americanPrice(type, S, K, T, r, q, v + dv, steps) - americanPrice(type, S, K, T, r, q, v - dv, steps)) / (2 * dv) / 100 : NaN;
  const rho = (americanPrice(type, S, K, T, r + 0.0001, q, v, steps) - americanPrice(type, S, K, T, r - 0.0001, q, v, steps)) / 0.0002 / 100;
  const day = Math.min(1 / 365, T / 2);
  const theta = (americanPrice(type, S, K, T - day, r, q, v, steps) - price) / (day * 365);
  const coarse = americanPrice(type, S, K, T, r, q, v, Math.max(25, Math.floor(steps / 2)));
  const boundary = v === 0 && Math.abs(up + down - 2 * price) > 1e-8 * Math.max(1, price);
  return { price, delta: boundary ? NaN : (up - down) / (2 * h), gamma: boundary ? NaN : (up - 2 * price + down) / (h * h), vega, theta, rho,
    ...extra, gridDifference: Math.abs(price - coarse) };
}

/** An early-exercise floor can support a range of vols: do not report a spurious unique 0% IV. */
export function americanImpliedVol(type: OptType, premium: number, S: number, K: number, T: number, r: number, q: number, steps = 400): number {
  if (!valid(type, S, K, T, r, q, 0, steps) || !Number.isFinite(premium) || premium < 0 || T <= 0) return NaN;
  if (noEarlyExercise(type, r, q)) return impliedVol(type, premium, S, K, T, r, q);
  const lower = deterministicAmerican(type, S, K, T, r, q);
  const upper = type === 'C' ? S * Math.max(1, Math.exp(-q * T)) : K * Math.max(1, Math.exp(-r * T));
  const eps = 1e-9 * Math.max(1, S, K, premium);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || premium <= lower + eps || premium >= upper) return NaN;
  let lo = 0;
  let hi = 0.5;
  let price = americanPrice(type, S, K, T, r, q, hi, steps);
  while (Number.isFinite(price) && price < premium && hi < 32) { hi *= 2; price = americanPrice(type, S, K, T, r, q, hi, steps); }
  if (!Number.isFinite(price) || price < premium) return NaN;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const value = americanPrice(type, S, K, T, r, q, mid, steps);
    if (!Number.isFinite(value)) return NaN;
    if (Math.abs(value - premium) <= 1e-10 * Math.max(1, premium)) return mid;
    if (value > premium) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
