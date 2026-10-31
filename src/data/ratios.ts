import type { FinPeriod } from './fundamentals';

/**
 * The ratios of DES's Ratios page, worked out from reported statements: the trailing twelve months (`ltm`), the
 * fiscal year before the latest (`prior`, for growth) and the market value in the statements' currency, in millions
 * as the statements are. Every figure is NaN when an input is missing or a denominator is not positive, so the
 * screen shows "--" instead of a misleading number.
 */
export interface EquityRatios {
  pcf: number;
  pfcf: number;
  cfToNi: number;
  cfoToSales: number;
  capexToSales: number;
  bookPerShare: number;
  revPerShare: number;
  cashPerShare: number;
  fcfPerShare: number;
  revGrowth: number;
  epsGrowth: number;
  bookGrowth: number;
  assetGrowth: number;
  rndToSales: number;
  retention: number;
  grossMargin: number;
  opMargin: number;
  pretaxMargin: number;
  netMargin: number;
  roa: number;
  roe: number;
  assetTurnover: number;
  currentRatio: number;
  quickRatio: number;
  debtToAssets: number;
  debtToEquity: number;
  interestCover: number;
  invTurnover: number;
  recvTurnover: number;
  /** CPS: cash from operations per share, as DES's Ratios page lists it (Apple's 9.81 against EPS of 8.66, 2016). */
  cfoPerShare: number;
  /**
   * The app's own measures for rows whose definition the provider does not publish (docs/bloomberg-parity.md):
   * cash from operations over capital spending and dividends paid; free cash flow over dividends paid; interest paid
   * over total debt (percent); the 1-year growth of debt plus equity (percent); operating income after the effective
   * tax rate over debt plus equity (percent).
   */
  cashGenToReqd: number;
  cashDividendCover: number;
  effectiveInterest: number;
  capitalGrowth: number;
  returnOnCapital: number;
}

const ok = (v: number) => Number.isFinite(v);
/** a / b when both are known and b is positive; NaN otherwise. */
function div(a: number, b: number): number {
  return ok(a) && ok(b) && b > 0 ? a / b : NaN;
}
/** Percent change from b to a, only from a positive base. */
function growth(a: number, b: number): number {
  return ok(a) && ok(b) && b > 0 ? (a / b - 1) * 100 : NaN;
}

export function equityRatios(ltm: FinPeriod, latest: FinPeriod | undefined, prior: FinPeriod | undefined, mcapRep: number): EquityRatios {
  const sh = ltm.shares;
  const pct = (v: number) => (ok(v) ? v * 100 : NaN);
  const capex = Math.abs(ltm.capex);
  const dividendsPaid = ok(ltm.dps) && sh > 0 ? ltm.dps * sh : NaN;
  const taxRate = ok(ltm.tax) && ltm.pretax > 0 ? Math.min(Math.max(ltm.tax / ltm.pretax, 0), 1) : NaN;
  const capital = (p: FinPeriod) => (ok(p.debt) && ok(p.equity) ? p.debt + p.equity : NaN);
  return {
    cfoPerShare: div(ltm.cfo, sh),
    cashGenToReqd: ok(capex) && ok(dividendsPaid) ? div(ltm.cfo, capex + dividendsPaid) : NaN,
    cashDividendCover: ok(ltm.cfo) && ok(capex) ? div(ltm.cfo - capex, dividendsPaid) : NaN,
    effectiveInterest: pct(div(Math.abs(ltm.interest), ltm.debt)),
    capitalGrowth: latest && prior ? growth(capital(latest), capital(prior)) : NaN,
    returnOnCapital: ok(ltm.opInc) && ok(taxRate) ? pct(div(ltm.opInc * (1 - taxRate), capital(ltm))) : NaN,
    pcf: div(mcapRep, ltm.cfo),
    pfcf: div(mcapRep, ltm.fcf),
    cfToNi: div(ltm.cfo, ltm.ni),
    cfoToSales: pct(div(ltm.cfo, ltm.rev)),
    capexToSales: pct(div(Math.abs(ltm.capex), ltm.rev)),
    bookPerShare: div(ltm.equity, sh),
    revPerShare: div(ltm.rev, sh),
    cashPerShare: div(ltm.cash, sh),
    fcfPerShare: ok(ltm.fcf) && sh > 0 ? ltm.fcf / sh : NaN,
    revGrowth: latest && prior ? growth(latest.rev, prior.rev) : NaN,
    epsGrowth: latest && prior ? growth(latest.eps, prior.eps) : NaN,
    bookGrowth: latest && prior ? growth(latest.equity, prior.equity) : NaN,
    assetGrowth: latest && prior ? growth(latest.totAssets, prior.totAssets) : NaN,
    // Costs are positive in the filings and negative in the generated demo statements; their size is what counts.
    rndToSales: pct(div(Math.abs(ltm.rnd), ltm.rev)),
    retention: ok(ltm.dps) && ltm.eps > 0 ? (1 - ltm.dps / ltm.eps) * 100 : NaN,
    grossMargin: pct(div(ltm.gp, ltm.rev)),
    opMargin: ok(ltm.opInc) && ltm.rev > 0 ? (ltm.opInc / ltm.rev) * 100 : NaN,
    pretaxMargin: ok(ltm.pretax) && ltm.rev > 0 ? (ltm.pretax / ltm.rev) * 100 : NaN,
    netMargin: ok(ltm.ni) && ltm.rev > 0 ? (ltm.ni / ltm.rev) * 100 : NaN,
    roa: ok(ltm.ni) && ltm.totAssets > 0 ? (ltm.ni / ltm.totAssets) * 100 : NaN,
    roe: ok(ltm.ni) && ltm.equity > 0 ? (ltm.ni / ltm.equity) * 100 : NaN,
    assetTurnover: div(ltm.rev, ltm.totAssets),
    currentRatio: div(ltm.curAssets, ltm.curLiab),
    quickRatio: ok(ltm.inv) ? div(ltm.curAssets - ltm.inv, ltm.curLiab) : NaN,
    debtToAssets: pct(div(ltm.debt, ltm.totAssets)),
    debtToEquity: pct(div(ltm.debt, ltm.equity)),
    interestCover: div(ltm.opInc, Math.abs(ltm.interest)),
    invTurnover: div(Math.abs(ltm.cogs), ltm.inv),
    recvTurnover: div(ltm.rev, ltm.recv),
  };
}
