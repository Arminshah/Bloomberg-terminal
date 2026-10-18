import { accruedInterest, couponSchedule, type BondTerms } from './bonds';
import { actualDays, discountAt, type ZeroNode } from './contracts';

/** Settlement-relative ACT/365F times; log-linear continuous-zero discount curve. */
export function bondSpreadValue(terms: BondTerms, settle: Date, clean: number, nodes: ZeroNode[]) {
  const dates = couponSchedule(terms, settle).slice(1);
  if (!dates.length || !Number.isFinite(clean) || clean <= 0) throw new RangeError('Enter valid bond terms and a positive clean price.');
  if (!nodes.length || nodes.some((n, k) => ![n.years, n.discountPct].every(Number.isFinite) || n.years <= 0 ||
      Math.abs(n.discountPct) > 100 || k > 0 && n.years <= nodes[k - 1].years)) throw new RangeError('Enter a valid ordered continuous zero curve.');
  const accrued = accruedInterest(terms, settle);
  const dirty = clean + accrued;
  if (!Number.isFinite(dirty) || dirty <= 0) throw new RangeError('These inputs exceed the calculator’s numerical range.');
  const flows = dates.map((date, k) => {
    const years = actualDays(settle, date) / 365;
    const amount = terms.coupon / (terms.freq ?? 2) + (k === dates.length - 1 ? 100 : 0);
    const df = discountAt(nodes, years);
    if (!Number.isFinite(df) || df <= 0) throw new RangeError('The zero curve must cover every payment date; extrapolation is disabled.');
    return { date, years, amount, df };
  });
  const pv = (z: number) => flows.reduce((sum, f) => f.amount === 0 ? sum : sum + f.amount * f.df * Math.exp(-z * f.years), 0);
  let lo = -0.01;
  let hi = 0.01;
  for (let k = 0; k < 20 && pv(lo) < dirty; k++) lo *= 2;
  for (let k = 0; k < 20 && pv(hi) > dirty; k++) hi *= 2;
  if (!(pv(lo) >= dirty) || !(pv(hi) <= dirty)) throw new RangeError('The spread exceeds this calculator’s numerical range.');
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > dirty) lo = mid; else hi = mid;
    if (hi - lo < 1e-13 * Math.max(1, Math.abs(mid))) break;
  }
  const spread = (lo + hi) / 2;
  const z01 = (pv(spread - 0.0001) - pv(spread + 0.0001)) / 2;
  const zeroSpreadClean = pv(0) - accrued;
  const spreadDuration = z01 / dirty / 0.0001;
  if (![spread, z01, zeroSpreadClean, spreadDuration].every(Number.isFinite)) throw new RangeError('These inputs exceed the calculator’s numerical range.');
  const scenarios = [-100, -50, -25, 0, 25, 50, 100].map((bp) => ({ bp, clean: pv(spread + bp / 10000) - accrued }));
  if (!scenarios.every((s) => Number.isFinite(s.clean))) throw new RangeError('These scenarios exceed the calculator’s numerical range.');
  return { spreadBp: spread * 10000, z01, spreadDuration, zeroSpreadClean,
    flows: flows.map((f) => ({ ...f, pv: f.amount * f.df * Math.exp(-spread * f.years) })),
    scenarios,
  };
}
