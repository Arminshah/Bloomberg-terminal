// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * What a listed option chain implies, from its own quotes: the forward of each expiry by put-call parity, and each
 * contract's implied volatility from the middle of its bid and ask (Black's formula on that forward), with the
 * Greeks at that volatility. The forward carries the dividends and borrow cost the market expects, so no dividend
 * forecast is needed; the discount factor comes from the Treasury par curve.
 *
 * US equity options are American; Black's formula on the implied forward is the European value. Out of the money,
 * where early exercise is worth little, it matched Cboe's published volatilities on Microsoft's chain of 30 October
 * 2026 to a median 0.22 points; deep in the money, where spreads are widest and early exercise has value, any
 * vendor's figure is less reliable (Cboe's and this one differed by a median 2.6 points there).
 */
import { normCdf, normPdf, type OptType } from './options';

export interface ChainQuote {
  symbol: string;
  root: string;
  expiry: string;
  type: OptType;
  strike: number;
  bid: number;
  ask: number;
}

export interface ExpiryImplied {
  /** `${expiry}|${root}`: a root's contracts settle alike (NDX in the morning, NDXP at the close). */
  key: string;
  expiry: string;
  root: string;
  /** Years from the quotes' time to expiry, calendar days over 365. */
  years: number;
  /** The Treasury par yield at that maturity, in percent as published, and the discount factor it gives. */
  ratePct: number;
  discount: number;
  /** The implied forward, and how many call-put pairs at the money it is the median of. */
  forward: number;
  pairs: number;
}

export interface ContractImplied {
  /** Volatility from the mid, a fraction; delta and gamma per one unit of the underlying, vega per volatility point. */
  iv: number;
  delta: number;
  gamma: number;
  vega: number;
}

const two = (q: { bid: number; ask: number }) => q.bid > 0 && q.ask >= q.bid && Number.isFinite(q.ask);
export const mid = (q: { bid: number; ask: number }) => two(q) ? (q.bid + q.ask) / 2 : NaN;

/** A par yield (percent, semiannual bond-equivalent) as a continuously compounded rate. */
export const continuousRate = (parPct: number) => 2 * Math.log1p(parPct / 200);

/** Linear in maturity between the published tenors; flat before the first and after the last. */
export function rateAt(curve: { years: number; pct: number }[], years: number): number {
  const points = curve.filter((p) => Number.isFinite(p.pct) && p.years > 0).sort((a, b) => a.years - b.years);
  if (!points.length || !Number.isFinite(years)) return NaN;
  if (years <= points[0].years) return points[0].pct;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if (years <= b.years) return a.pct + ((b.pct - a.pct) * (years - a.years)) / (b.years - a.years);
  }
  return points[points.length - 1].pct;
}

/**
 * The forward by put-call parity, C − P = D(F − K): from the three strikes where the call and put mids are closest
 * (at the money, where early exercise is worth least), the median of K + (C − P) / D.
 */
export function impliedForward(pairs: { strike: number; call: number; put: number }[], discount: number): { forward: number; pairs: number } {
  const usable = pairs.filter((p) => Number.isFinite(p.call) && Number.isFinite(p.put) && p.strike > 0);
  if (!usable.length || !(discount > 0)) return { forward: NaN, pairs: 0 };
  const nearest = [...usable].sort((a, b) => Math.abs(a.call - a.put) - Math.abs(b.call - b.put) || a.strike - b.strike).slice(0, 3);
  const values = nearest.map((p) => p.strike + (p.call - p.put) / discount).sort((a, b) => a - b);
  const m = values.length >> 1;
  const forward = values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
  return forward > 0 ? { forward, pairs: values.length } : { forward: NaN, pairs: 0 };
}

/** Black's (1976) value of a European option on a forward. */
export function black76(type: OptType, forward: number, strike: number, years: number, discount: number, vol: number): number {
  if (!(forward > 0 && strike > 0 && years > 0 && discount > 0 && vol > 0)) return NaN;
  const s = vol * Math.sqrt(years);
  const d1 = (Math.log(forward / strike) + (s * s) / 2) / s;
  const d2 = d1 - s;
  return type === 'C' ? discount * (forward * normCdf(d1) - strike * normCdf(d2)) : discount * (strike * normCdf(-d2) - forward * normCdf(-d1));
}

/** The volatility at which Black's value equals the premium, by bisection; NaN outside the no-arbitrage bounds. */
export function black76Vol(type: OptType, premium: number, forward: number, strike: number, years: number, discount: number): number {
  if (!(premium > 0 && forward > 0 && strike > 0 && years > 0 && discount > 0)) return NaN;
  const floor = discount * Math.max(0, type === 'C' ? forward - strike : strike - forward);
  const cap = discount * (type === 'C' ? forward : strike);
  if (premium <= floor || premium >= cap) return NaN;
  let lo = 1e-4;
  let hi = 10;
  if (premium <= black76(type, forward, strike, years, discount, lo) || premium >= black76(type, forward, strike, years, discount, hi)) return NaN;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (black76(type, forward, strike, years, discount, m) > premium) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

/** Delta, gamma and vega at a volatility; spot-based, so they need the underlying's price with the quotes. */
export function black76Greeks(type: OptType, forward: number, strike: number, years: number, discount: number, vol: number, spot: number): Omit<ContractImplied, 'iv'> {
  const none = { delta: NaN, gamma: NaN, vega: NaN };
  if (!(forward > 0 && strike > 0 && years > 0 && discount > 0 && vol > 0)) return none;
  const s = vol * Math.sqrt(years);
  const d1 = (Math.log(forward / strike) + (s * s) / 2) / s;
  // S·e^(−qT) is the discounted forward, so vega needs no spot; delta and gamma do.
  const vega = (discount * forward * normPdf(d1) * Math.sqrt(years)) / 100;
  if (!(spot > 0)) return { ...none, vega };
  const carry = (discount * forward) / spot;
  return { delta: carry * (type === 'C' ? normCdf(d1) : normCdf(d1) - 1), gamma: (carry * normPdf(d1)) / (spot * s), vega };
}

/** True for a standard root: the underlying's own symbol, or a PM-settled index root (NDXP). Adjusted roots (AAPL1) deliver something else. */
export function standardRoot(root: string, underlying: string): boolean {
  const base = underlying.replace(/[.\s]/g, '').toUpperCase();
  return root === base || root === `${base}P`;
}

export interface ChainImplied {
  expiries: ExpiryImplied[];
  contracts: Map<string, ContractImplied>;
}

/**
 * Every standard expiry's forward and every two-sided contract's mid volatility. `expiryAt` gives a contract's
 * expiry time; `valuedAt` is the quotes' time; `spot` is the underlying's price at that time (NaN leaves delta and
 * gamma blank). Adjusted roots, expired contracts and one-sided quotes are left out.
 */
export function chainImplied(quotes: ChainQuote[], { underlying, valuedAt, spot, curve, expiryAt }: {
  underlying: string; valuedAt: number; spot: number; curve: { years: number; pct: number }[]; expiryAt: (expiry: string, root: string) => number;
}): ChainImplied {
  const groups = new Map<string, ChainQuote[]>();
  for (const q of quotes) {
    if (!standardRoot(q.root, underlying)) continue;
    const key = `${q.expiry}|${q.root}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const expiries: ExpiryImplied[] = [];
  const contracts = new Map<string, ContractImplied>();
  for (const [key, list] of groups) {
    const { expiry, root } = list[0];
    const years = (expiryAt(expiry, root) - valuedAt) / (365 * 86_400_000);
    if (!(years > 0)) continue;
    const ratePct = rateAt(curve, years);
    const discount = Number.isFinite(ratePct) ? Math.exp(-continuousRate(ratePct) * years) : NaN;
    const byStrike = new Map<number, { call?: ChainQuote; put?: ChainQuote }>();
    for (const q of list) byStrike.set(q.strike, { ...byStrike.get(q.strike), [q.type === 'C' ? 'call' : 'put']: q });
    const { forward, pairs } = impliedForward([...byStrike].map(([strike, p]) => ({ strike, call: p.call ? mid(p.call) : NaN, put: p.put ? mid(p.put) : NaN })), discount);
    expiries.push({ key, expiry, root, years, ratePct, discount, forward, pairs });
    if (!Number.isFinite(forward)) continue;
    for (const q of list) {
      const iv = black76Vol(q.type, mid(q), forward, q.strike, years, discount);
      if (Number.isFinite(iv)) contracts.set(q.symbol, { iv, ...black76Greeks(q.type, forward, q.strike, years, discount, iv, spot) });
    }
  }
  expiries.sort((a, b) => a.expiry.localeCompare(b.expiry) || a.root.localeCompare(b.root));
  return { expiries, contracts };
}
