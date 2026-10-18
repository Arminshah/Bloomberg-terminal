/** Historical simulation of today's fixed quantities, with explicit FX and exact session-date joins. */
import { maxDrawdown, mean, regress, stdev, type Regression } from './stats';

const DAY = 86_400_000;
export interface DailyLevel { date: number; value: number }
export interface RiskPosition {
  id: string;
  quantity: number;
  cost: number;
  multiplier: number;
  margined: boolean;
  /** Current price and USD per major currency unit; multiplier includes minor quotation units. */
  price: number;
  fx: number;
  prices: DailyLevel[];
  /** Omit only for USD-denominated positions. No current-rate substitution for history. */
  fxHistory?: DailyLevel[];
  /** Source identity for historical FX provenance (for example CCY:EUR). */
  fxId?: string;
}
export interface PortfolioHistory {
  dates: number[];
  prices: number[][];
  fx: number[][];
  nav: number[];
  /** False where joining dates would bridge a session present in another input but missing here. */
  links: boolean[];
  /** Dates present in at least one input, but missing from another, within the retained range. */
  omittedDates: number;
}
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): Checked<never> => ({ ok: false, error });
const validTerms = (p: RiskPosition) => p.id && [p.quantity, p.cost, p.multiplier].every(Number.isFinite) && p.quantity !== 0 && p.multiplier > 0;
const validMarks = (p: RiskPosition) => [p.price, p.fx].every((n) => Number.isFinite(n) && n > 0);

function levels(rows: DailyLevel[], cutoff: number, requirePositive = true): Map<number, number> | null {
  if (rows.length > 25_000) return null;
  const out = new Map<number, number>();
  let previous = -Infinity;
  for (const row of rows) {
    if (!Number.isFinite(row.date) || row.date % DAY !== 0 || row.date <= previous) return null;
    previous = row.date;
    if (row.date >= cutoff) continue;
    if (!Number.isFinite(row.value) || (requirePositive && row.value <= 0)) return null;
    out.set(row.date, row.value);
  }
  return out;
}

export function positionValue(p: RiskPosition, price = p.price, fx = p.fx): number {
  return p.quantity * p.multiplier * fx * (p.margined ? price - p.cost : price);
}

export function portfolioValue(positions: RiskPosition[], cash: number): number {
  return cash + positions.reduce((sum, p) => sum + positionValue(p), 0);
}

/** No forward fills, missing-position omissions, current quotes or forming-day bars enter this path. */
export function alignPortfolio(positions: RiskPosition[], cash: number, cutoff: number, observations = 252): Checked<PortfolioHistory> {
  if (!Number.isFinite(cash) || !Number.isFinite(cutoff) || cutoff % DAY !== 0 || !Number.isInteger(observations) || observations < 2 || observations > 2520) return fail('Invalid cash, history cutoff or observation count.');
  if (!positions.length) return fail('Add a position to calculate historical portfolio risk.');
  if (positions.length > 200 || new Set(positions.map((p) => p.id)).size !== positions.length) return fail('Positions must have unique identifiers (maximum 200).');
  const paths: Map<number, number>[] = [];
  const prices: Map<number, number>[] = [];
  const fx: (Map<number, number> | undefined)[] = [];
  for (const p of positions) {
    if (!validTerms(p)) return fail(`Invalid quantity, cost or contract multiplier for ${p.id}.`);
    // Futures can have nonpositive observations in older history. Validate the
    // relative-shock price domain after selecting shared dates, not across an
    // unused ten-year source archive (for example WTI's negative April 2020 close).
    const price = levels(p.prices, cutoff, false);
    const currency = p.fxHistory === undefined ? undefined : levels(p.fxHistory, cutoff);
    if (!price || currency === null) return fail(`Invalid or duplicate daily history for ${p.id}.`);
    if (price.size < 2 || currency?.size === 0) return fail(`Missing completed price or FX history for ${p.id}. Every holding must be covered.`);
    prices.push(price);
    fx.push(currency);
    paths.push(price);
    if (currency) paths.push(currency);
  }
  const shortest = paths.reduce((a, b) => a.size < b.size ? a : b);
  const dates = [...shortest.keys()].filter((date) => paths.every((p) => p.has(date))).sort((a, b) => a - b).slice(-observations - 1);
  if (dates.length < 2) return fail('Fewer than two shared completed session dates. Missing prices and FX are never filled or omitted.');
  const priceLevels = prices.map((path) => dates.map((date) => path.get(date)!));
  if (priceLevels.some((path) => path.some((v) => v <= 0))) return fail('The selected history window contains a nonpositive price. Relative price shocks require positive prices; choose a different window or a suitable priced instrument.');
  const fxLevels = fx.map((path) => dates.map((date) => path?.get(date) ?? 1));
  const nav = dates.map((_, t) => cash + positions.reduce((sum, p, i) => sum + positionValue(p, priceLevels[i][t], fxLevels[i][t]), 0));
  if (!nav.every(Number.isFinite)) return fail('Historical portfolio values exceed the numerical range.');
  const inWindow = (date: number) => date >= dates[0] && date <= dates.at(-1)!;
  const weekend = (date: number) => { const d = new Date(date).getUTCDay(); return d === 0 || d === 6; };
  // A weekend date of a seven-day series (crypto) is not a session a stock is missing: Friday to Monday still
  // joins adjacent stock sessions. A weekend date missing from another seven-day series is a gap.
  const sevenDay = paths.map((path) => [...path.keys()].some((date) => inWindow(date) && weekend(date)));
  const shared = new Set(dates);
  const missing = [...new Set(paths.flatMap((path) => [...path.keys()].filter(inWindow)))]
    .filter((date) => !shared.has(date) && (!weekend(date) || paths.some((path, i) => sevenDay[i] && !path.has(date))))
    .sort((a, b) => a - b);
  let m = 0;
  const links = dates.slice(1).map((date, i) => {
    while (m < missing.length && missing[m] <= dates[i]) m++;
    return !(m < missing.length && missing[m] < date);
  });
  return { ok: true, value: { dates, prices: priceLevels, fx: fxLevels, nav, links, omittedDates: missing.length } };
}

/** Exact repricing of linear positions, including FX on futures' unrealised value rather than notional. */
export function positionShock(p: RiskPosition, priceMove: number, fxMove: number): number {
  if (!validTerms(p) || !validMarks(p) || ![priceMove, fxMove].every(Number.isFinite) || priceMove < -1 || fxMove <= -1) return NaN;
  return positionValue(p, p.price * (1 + priceMove), p.fx * (1 + fxMove)) - positionValue(p);
}

export interface LossTail {
  valueAtRisk: number;
  expectedShortfall: number;
  /** Fractional number of equally weighted observations in the empirical worst tail. */
  tailMass: number;
  /** Loss-observation indices and mass (0 < weight <= 1), for additive component ES. */
  weights: { index: number; weight: number }[];
}

/** Inverse empirical CDF (nearest rank) and integral of that CDF over the worst 1-confidence tail. */
export function lossTail(losses: number[], confidence: number): LossTail | null {
  if (!losses.length || !losses.every(Number.isFinite) || !Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) return null;
  const ordered = losses.map((loss, index) => ({ loss, index })).sort((a, b) => b.loss - a.loss);
  const tailMass = losses.length * (1 - confidence);
  // Boundary ties share their mass; component ES must not depend on input order.
  const weights: LossTail['weights'] = [];
  let remaining = tailMass;
  let total = 0;
  for (let i = 0; i < ordered.length && remaining > 0;) {
    let end = i + 1;
    while (end < ordered.length && ordered[end].loss === ordered[i].loss) end++;
    const mass = Math.min(remaining, end - i);
    const weight = mass / (end - i);
    for (let k = i; k < end; k++) weights.push({ index: ordered[k].index, weight });
    total += ordered[i].loss * mass;
    remaining -= mass;
    i = end;
  }
  const ascendingIndex = Math.max(0, Math.ceil(confidence * losses.length) - 1);
  return { valueAtRisk: ordered[losses.length - 1 - ascendingIndex].loss, expectedShortfall: total / tailMass, tailMass, weights };
}

function scenarioStarts(history: PortfolioHistory, horizon: number): number[] {
  return history.dates.slice(horizon).map((_, i) => i).filter((i) => history.links.slice(i, i + horizon).every(Boolean));
}

function pnlScenarios(positions: RiskPosition[], history: PortfolioHistory, horizon: number, starts: number[]): number[][] {
  return positions.map((p, i) => starts.map((k) => {
    const end = k + horizon;
    return positionShock(p, history.prices[i][end] / history.prices[i][k] - 1, history.fx[i][end] / history.fx[i][k] - 1);
  }));
}

function sampleCovariance(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  return a.reduce((sum, v, i) => sum + (v - ma) * (b[i] - mb), 0) / (a.length - 1);
}

export interface RiskAnalysis {
  nav: number;
  grossExposure: number;
  netExposure: number;
  dailyPnl: number[];
  dailyDates: { start: number; end: number }[];
  scenarioPnl: number[];
  scenarioDates: { start: number; end: number }[];
  annualVolatility: number;
  annualVolatilityUsd: number;
  tail: LossTail;
  worst: number;
  best: number;
  contributions: { id: string; exposure: number; volatilityUsd: number; volatilityShare: number; expectedShortfall: number }[];
  covariance: number[][];
  /** Max drawdown of fixed quantities/cash replay, only when all NAVs are positive. */
  drawdown: number;
}

export function historicalRisk(positions: RiskPosition[], cash: number, history: PortfolioHistory, confidence = 0.95, horizon = 1, annualSessions = 252): Checked<RiskAnalysis> {
  if (positions.some((p) => !validTerms(p) || !validMarks(p)) || !Number.isFinite(cash)) return fail('Every holding needs a finite positive current price and FX mark.');
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 60 || !Number.isInteger(annualSessions) || annualSessions < 1 || annualSessions > 366 || !Number.isFinite(confidence) || confidence < 0.5 || confidence >= 1) return fail('Invalid risk horizon, confidence or annualisation.');
  if (!positions.length || history.links.length !== history.dates.length - 1 || history.prices.length !== positions.length || history.fx.length !== positions.length || [...history.prices, ...history.fx].some((p) => p.length !== history.dates.length || !p.every((v) => Number.isFinite(v) && v > 0))) return fail('Portfolio history does not match the position set.');
  const dailyStarts = scenarioStarts(history, 1);
  const starts = horizon === 1 ? dailyStarts : scenarioStarts(history, horizon);
  if (starts.length < 20) return fail(`Need at least 20 shared ${horizon}-interval historical scenarios without missing sessions; only ${starts.length} are available.`);
  const daily = pnlScenarios(positions, history, 1, dailyStarts);
  const scenarios = horizon === 1 ? daily : pnlScenarios(positions, history, horizon, starts);
  const sumRows = (rows: number[][]) => rows[0].map((_, j) => rows.reduce((sum, p) => sum + p[j], 0));
  const dailyPnl = sumRows(daily);
  const scenarioPnl = sumRows(scenarios);
  if (![...dailyPnl, ...scenarioPnl].every(Number.isFinite)) return fail('Historical shocks exceed the numerical range.');
  const tail = lossTail(scenarioPnl.map((pnl) => -pnl), confidence)!;
  const sd = stdev(dailyPnl);
  const nav = portfolioValue(positions, cash);
  const exposures = positions.map((p) => p.quantity * p.price * p.fx * p.multiplier);
  if (!Number.isFinite(nav) || !exposures.every(Number.isFinite)) return fail('Current portfolio values exceed the numerical range.');
  const covariance = daily.map((a) => daily.map((b) => sampleCovariance(a, b)));
  if (!Number.isFinite(sd) || !covariance.flat().every(Number.isFinite) || !Number.isFinite(exposures.reduce((sum, v) => sum + Math.abs(v), 0))) return fail('Portfolio covariance exceeds the numerical range.');
  const contributions = positions.map((p, i) => {
    const cov = sampleCovariance(daily[i], dailyPnl);
    return { id: p.id, exposure: exposures[i], volatilityUsd: sd > 0 ? cov / sd * Math.sqrt(annualSessions) : 0,
      volatilityShare: sd > 0 ? cov / (sd * sd) : NaN,
      expectedShortfall: -tail.weights.reduce((sum, { index, weight }) => sum + scenarios[i][index] * weight, 0) / tail.tailMass };
  });
  return { ok: true, value: { nav, grossExposure: exposures.reduce((sum, v) => sum + Math.abs(v), 0), netExposure: exposures.reduce((a, b) => a + b, 0), dailyPnl, scenarioPnl,
    dailyDates: dailyStarts.map((i) => ({ start: history.dates[i], end: history.dates[i + 1] })),
    scenarioDates: starts.map((i) => ({ start: history.dates[i], end: history.dates[i + horizon] })),
    annualVolatilityUsd: sd * Math.sqrt(annualSessions), annualVolatility: nav > 0 ? sd / nav * Math.sqrt(annualSessions) : NaN,
    tail, worst: Math.min(...scenarioPnl), best: Math.max(...scenarioPnl), contributions, covariance,
    drawdown: history.nav.every((v) => v > 0) ? maxDrawdown(history.nav) : NaN } };
}

export interface BenchmarkRisk {
  regression: Regression;
  trackingError: number;
  informationRatio: number;
  portfolioReturns: number[];
  benchmarkReturns: number[];
  dates: number[];
}

/** Pair identical start AND end dates. A missing benchmark endpoint never shifts array alignment. */
export function benchmarkRisk(dailyDates: { start: number; end: number }[], dailyPnl: number[], currentNav: number, benchmark: DailyLevel[], cutoff: number, annualSessions = 252): BenchmarkRisk | null {
  const path = levels(benchmark, cutoff);
  if (!path || currentNav <= 0 || !Number.isFinite(currentNav) || dailyPnl.length !== dailyDates.length || !dailyPnl.every(Number.isFinite)) return null;
  const portfolioReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  const dates: number[] = [];
  for (let i = 0; i < dailyDates.length; i++) {
    const before = path.get(dailyDates[i].start);
    const after = path.get(dailyDates[i].end);
    if (before === undefined || after === undefined) continue;
    portfolioReturns.push(dailyPnl[i] / currentNav);
    benchmarkReturns.push(after / before - 1);
    dates.push(dailyDates[i].end);
  }
  if (dates.length < 20) return null;
  const active = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
  const sd = stdev(active);
  return { regression: regress(benchmarkReturns, portfolioReturns), trackingError: sd * Math.sqrt(annualSessions), informationRatio: sd > 0 ? mean(active) / sd * Math.sqrt(annualSessions) : NaN, portfolioReturns, benchmarkReturns, dates };
}
