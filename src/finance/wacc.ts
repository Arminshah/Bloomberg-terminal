/**
 * WACC, its cost of debt without a fair market curve, the preferred component and Economic Value Added, as the
 * provider's WACC help page (May 2013) sets them out; the owner's reference pack collects them in METHODOLOGY.md,
 * sections 1, 3 and 4. Money in millions, rates and returns in percent.
 */

/** The adjustment factor for an unrated issuer (the BBB+ long-term equivalent); rated issuers' factors are not published. */
export const UNRATED_AF = 1.38;

export interface CapitalStructure {
  mcap: number;
  stDebt: number;
  ltDebt: number;
  preferred: number;
  total: number;
  /** Weights, 0 to 1. */
  we: number;
  wst: number;
  wlt: number;
  wd: number;
  wp: number;
}

const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Total capital = market cap + short-term debt + long-term debt + preferred equity; each part's weight of it. */
export function capitalStructure(mcap: number, stDebt: number, ltDebt: number, preferred: number): CapitalStructure {
  const parts = { mcap: pos(mcap), stDebt: pos(stDebt), ltDebt: pos(ltDebt), preferred: pos(preferred) };
  const total = Number.isFinite(mcap) && mcap > 0 ? parts.mcap + parts.stDebt + parts.ltDebt + parts.preferred : NaN;
  const w = (v: number) => (total > 0 ? v / total : NaN);
  return { ...parts, total, we: w(parts.mcap), wst: w(parts.stDebt), wlt: w(parts.ltDebt), wd: w(parts.stDebt + parts.ltDebt), wp: w(parts.preferred) };
}

/** CAPM: risk-free + adjusted beta × equity risk premium. */
export function costOfEquity(rf: number, adjBeta: number, erp: number): number {
  return rf + adjBeta * erp;
}

/**
 * Cost of debt without a fair market curve: ((ST debt × short government rate + LT debt × long government rate) /
 * total debt) × adjustment factor, then × (1 − effective tax rate) after tax.
 */
export function costOfDebtFallback(stDebt: number, ltDebt: number, kst: number, klt: number, af: number, taxRate: number): { pre: number; after: number } {
  const std = pos(stDebt);
  const ltd = pos(ltDebt);
  const td = std + ltd;
  if (!(td > 0)) return { pre: NaN, after: NaN };
  const blend = (std > 0 ? std * kst : 0) + (ltd > 0 ? ltd * klt : 0);
  const pre = (blend / td) * af;
  return { pre, after: pre * (1 - taxRate) };
}

/** Preferred dividends over preferred equity; NaN (the component is left out) when either is missing or not positive. */
export function costOfPreferred(prefDividends: number, preferred: number): number {
  return prefDividends > 0 && preferred > 0 ? (prefDividends / preferred) * 100 : NaN;
}

/** WACC = Ke × We + Kd after tax × Wd + Kp × Wp. Preferred without a cost is left out of the capital. */
export function waccOf(cap: CapitalStructure, ke: number, kdAfter: number, kp: number): { cap: CapitalStructure; wacc: number } {
  const c = cap.wp > 0 && !Number.isFinite(kp) ? capitalStructure(cap.mcap, cap.stDebt, cap.ltDebt, 0) : cap;
  const debt = c.wd > 0 ? c.wd * kdAfter : 0;
  const pref = c.wp > 0 ? c.wp * kp : 0;
  return { cap: c, wacc: c.we * ke + debt + pref };
}

export interface Eva {
  nop: number;
  cashTaxes: number;
  nopat: number;
  tic: number;
  charge: number;
  eva: number;
  /** Percent. */
  roic: number;
  /** ROIC − WACC, percentage points. */
  spread: number;
}

/** NOPAT = net operating profit − cash operating taxes; capital charge = TIC × WACC; EVA = NOPAT − charge; ROIC = NOPAT / TIC. */
export function economicValueAdded(nop: number, cashTaxes: number, tic: number, wacc: number): Eva {
  const nopat = nop - cashTaxes;
  const charge = (tic * wacc) / 100;
  const roic = tic > 0 ? (nopat / tic) * 100 : NaN;
  return { nop, cashTaxes, nopat, tic, charge, eva: nopat - charge, roic, spread: roic - wacc };
}
