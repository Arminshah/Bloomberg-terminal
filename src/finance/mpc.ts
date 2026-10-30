import { solveQP, type QPResult } from './qp';

/**
 * The dissertation's back-test (model predictive control applied to portfolio management, after Boyd et al., 2017):
 * a self-financing portfolio of stocks and cash, traded at each day's close by a policy, then held to the next close.
 *
 * Costs: half the bid-ask spread on every dollar traded; a borrow fee on short positions for each calendar day held
 * (so Friday to Monday is three days, as the dissertation says). Cash earns the risk-free rate (FRED's DTB3, %, a
 * year) by calendar day on an actual/360 basis; negative cash pays it.
 *
 * Policies: Hold (no trades), and MPC, which at each close maximises the forecast return less risk aversion × w′Σw,
 * trading aversion × transaction cost and holding aversion × holding cost over a horizon of H periods, subject to the
 * constraints, and makes the first period's trades. Every forecast uses only returns up to that close: the mean and
 * sample covariance of the last `window` daily returns. With the same forecast for each period ahead and costs linear
 * in the trade, the best H-period plan trades once and then holds: for any plan, the average of its weights earns at
 * least the plan's average reward (the reward is concave) and is no further from today's weights than the plan's
 * total trading (the triangle inequality). So the H-period problem is solved exactly as one step that values the new
 * weights H times against one trading cost.
 */

export interface Costs {
  /** Half the bid-ask spread, a fraction of the value traded (0.05% is 0.0005). */
  halfSpread: number;
  /** Borrow fee on short positions, a fraction of their value per calendar day (0.01% is 0.0001). */
  borrowPerDay: number;
}

export type Policy =
  | { kind: 'hold' }
  | {
      kind: 'mpc';
      /** Periods planned ahead; 0 is single-period optimisation, as 1. */
      horizon: number;
      riskAversion: number;
      tradingAversion: number;
      holdingAversion: number;
      /** Largest sum of absolute stock weights. */
      leverage?: number;
      longOnly?: boolean;
      /** Stock weights summing to zero (the rest in cash). */
      dollarNeutral?: boolean;
    };

/** Calendar days in a planned period: a year's 365 days over its 250 trading days. */
export const PLANNING_DAYS = 365 / 250;
/** Periods a year, for the annual figures, as the dissertation counts them. */
export const PERIODS_PER_YEAR = 250;

export interface StepProblem {
  /** Today's stock weights (positions over portfolio value). */
  w: number[];
  /** Forecast return per period of each stock less the cash's. */
  excess: number[];
  sigma: number[][];
  costs: Costs;
  policy: Extract<Policy, { kind: 'mpc' }>;
  warm?: QPResult;
}

/** The new stock weights an MPC policy chooses today (cash is the rest), with the solver's answer for a warm start. */
export function mpcWeights(p: StepProblem): { y: number[]; qp: QPResult } {
  const n = p.w.length;
  const { policy: pol, costs } = p;
  const H = Math.max(1, Math.round(pol.horizon));
  // Scaled so the risk term's diagonal is about one: the daily figures are small and the solver likes unit scale.
  const meanVar = p.sigma.reduce((s, row, i) => s + row[i], 0) / n;
  const scale = 1 / Math.max(1e-12, 2 * H * Math.max(pol.riskAversion, 1e-6) * meanVar);
  const N = 4 * n; // y, buys p, sells m, short part r
  const P = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P[i][j] = 2 * H * pol.riskAversion * p.sigma[i][j] * scale;
  const q = new Array<number>(N).fill(0);
  for (let i = 0; i < n; i++) {
    q[i] = -H * p.excess[i] * scale;
    q[n + i] = pol.tradingAversion * costs.halfSpread * scale;
    q[2 * n + i] = pol.tradingAversion * costs.halfSpread * scale;
    q[3 * n + i] = H * pol.holdingAversion * costs.borrowPerDay * PLANNING_DAYS * scale;
  }
  const A: number[][] = [];
  const l: number[] = [];
  const u: number[] = [];
  const row = (cells: [number, number][], lo: number, hi: number) => {
    const r = new Array<number>(N).fill(0);
    for (const [j, v] of cells) r[j] = v;
    A.push(r);
    l.push(lo);
    u.push(hi);
  };
  for (let i = 0; i < n; i++) row([[i, 1], [n + i, -1], [2 * n + i, 1]], p.w[i], p.w[i]); // y = w + p − m
  for (let i = 0; i < 3 * n; i++) row([[n + i, 1]], 0, Infinity); // p, m, r ≥ 0
  for (let i = 0; i < n; i++) row([[i, 1], [3 * n + i, 1]], 0, Infinity); // r ≥ −y
  if (pol.leverage !== undefined && Number.isFinite(pol.leverage)) {
    // Σ|y| ≤ L, with |y| = y + 2r at the solution (r is y's short part).
    row([...Array.from({ length: n }, (_, i): [number, number] => [i, 1]), ...Array.from({ length: n }, (_, i): [number, number] => [3 * n + i, 2])], -Infinity, pol.leverage);
  }
  if (pol.longOnly) for (let i = 0; i < n; i++) row([[i, 1]], 0, Infinity);
  if (pol.dollarNeutral) row(Array.from({ length: n }, (_, i): [number, number] => [i, 1]), 0, 0);
  const qp = solveQP({ P, q, A, l, u }, { warm: p.warm && p.warm.x.length === N && p.warm.z.length === A.length ? p.warm : undefined });
  return { y: qp.x.slice(0, n), qp };
}

export interface BacktestInput {
  /** Trading days, YYYY-MM-DD, ascending. */
  dates: string[];
  /** prices[k][t]: stock k's close on day t, adjusted for splits and dividends. */
  prices: number[][];
  /** The risk-free rate, % a year, in force on each day (DTB3, carried forward over its gaps). */
  rf: number[];
  /** First and last days of the back-test. */
  start: string;
  end: string;
  /** Daily returns in each forecast: 250, a year. */
  window: number;
  /** Dollars in each stock at the start; cash starts at zero. */
  initial: number[];
  costs: Costs;
  policy: Policy;
}

export interface Metrics {
  /** Mean daily return × 250, %. */
  annualReturn: number;
  /** Mean daily return less the cash return × 250, %. */
  annualExcessReturn: number;
  /** Standard deviation of the daily excess return × √250, %. */
  annualExcessRisk: number;
  sharpe: number;
  /** Largest fall from a peak in value, %. */
  maxDrawdown: number;
  /** Mean daily (Σ|trades| / value) × 250, %. */
  annualTurnover: number;
  periods: number;
}

export interface BacktestResult {
  /** The day each value is struck: the start, every trading day, then the end. */
  days: string[];
  value: number[];
  /** Stock weights after each day's trades. */
  weights: number[][];
  cash: number[];
  returns: number[];
  excess: number[];
  turnover: number[];
  metrics: Metrics;
  /** Days on which the solver stopped short of its tolerance (its best answer was traded). */
  unsolved: string[];
}

const DAY = 86_400_000;
const calendarDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function metricsOf(value: number[], returns: number[], excess: number[], turnover: number[]): Metrics {
  const n = returns.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const me = mean(excess);
  const sd = Math.sqrt(excess.reduce((s, x) => s + (x - me) ** 2, 0) / (n - 1));
  let peak = -Infinity;
  let dd = 0;
  for (const v of value) {
    peak = Math.max(peak, v);
    dd = Math.max(dd, 1 - v / peak);
  }
  return {
    annualReturn: mean(returns) * PERIODS_PER_YEAR * 100,
    annualExcessReturn: me * PERIODS_PER_YEAR * 100,
    annualExcessRisk: sd * Math.sqrt(PERIODS_PER_YEAR) * 100,
    sharpe: (Math.sqrt(PERIODS_PER_YEAR) * me) / sd,
    maxDrawdown: dd * 100,
    annualTurnover: mean(turnover) * PERIODS_PER_YEAR * 100,
    periods: n,
  };
}

/** Runs the back-test; null when the dates leave no day with a full forecast window before the end. */
export function backtest(b: BacktestInput): BacktestResult | null {
  const run = backtestSteps(b);
  for (;;) {
    const s = run.next();
    if (s.done) return s.value;
  }
}

/**
 * The back-test in slices, so a screen can draw between them: runs for about `sliceMs` at a time, reports the share
 * done, and stops early when `signal` is aborted (null then).
 */
export async function backtestAsync(b: BacktestInput, onProgress?: (done: number) => void, signal?: AbortSignal, sliceMs = 40): Promise<BacktestResult | null> {
  const run = backtestSteps(b);
  for (;;) {
    const t0 = Date.now();
    let s = run.next();
    while (!s.done && Date.now() - t0 < sliceMs) s = run.next();
    if (s.done) return s.value;
    onProgress?.(s.value);
    await new Promise((r) => setTimeout(r, 0));
    if (signal?.aborted) return null;
  }
}

/** The back-test one day at a time: yields the share of days done, returns the result. */
export function* backtestSteps(b: BacktestInput): Generator<number, BacktestResult | null, void> {
  const k = b.prices.length;
  const T = b.dates.length;
  let s = b.dates.findIndex((d) => d >= b.start);
  if (s < 0) return null;
  s = Math.max(s, b.window);
  let e = T - 1;
  while (e > s && b.dates[e] > b.end) e--;
  if (e <= s) return null;
  const h = [...b.initial];
  let cash = 0;
  const days: string[] = [];
  const value: number[] = [];
  const weights: number[][] = [];
  const cashW: number[] = [];
  const returns: number[] = [];
  const excess: number[] = [];
  const turnover: number[] = [];
  const unsolved: string[] = [];
  let warm: QPResult | undefined;
  for (let t = s; t < e; t++) {
    const v = h.reduce((a, x) => a + x, cash);
    let trades = new Array<number>(k).fill(0);
    if (b.policy.kind === 'mpc') {
      const rets = b.prices.map((p) => Array.from({ length: b.window }, (_, j) => p[t - b.window + 1 + j] / p[t - b.window + j] - 1));
      const mu = rets.map((r) => r.reduce((a, x) => a + x, 0) / b.window);
      const sigma = rets.map((ri, i) => rets.map((rj, j) => ri.reduce((a, x, m) => a + (x - mu[i]) * (rj[m] - mu[j]), 0) / (b.window - 1)));
      const cashForecast = (b.rf[t] / 100 / 360) * PLANNING_DAYS;
      const step = mpcWeights({ w: h.map((x) => x / v), excess: mu.map((m) => m - cashForecast), sigma, costs: b.costs, policy: b.policy, warm });
      warm = step.qp;
      if (step.qp.status !== 'solved') unsolved.push(b.dates[t]);
      if (step.y.every(Number.isFinite)) trades = step.y.map((y, i) => y * v - h[i]);
    }
    const traded = trades.reduce((a, x) => a + Math.abs(x), 0);
    for (let i = 0; i < k; i++) h[i] += trades[i];
    cash -= trades.reduce((a, x) => a + x, 0) + b.costs.halfSpread * traded;
    const gap = calendarDays(b.dates[t], b.dates[t + 1]);
    cash -= b.costs.borrowPerDay * gap * h.reduce((a, x) => a + Math.max(-x, 0), 0);
    days.push(b.dates[t]);
    value.push(v);
    weights.push(h.map((x) => x / v));
    cashW.push(cash / v);
    turnover.push(traded / v);
    const rf = (b.rf[t] / 100 / 360) * gap;
    for (let i = 0; i < k; i++) h[i] *= b.prices[i][t + 1] / b.prices[i][t];
    cash *= 1 + rf;
    const next = h.reduce((a, x) => a + x, cash);
    returns.push(next / v - 1);
    excess.push(next / v - 1 - rf);
    yield (t - s + 1) / (e - s);
  }
  days.push(b.dates[e]);
  value.push(h.reduce((a, x) => a + x, cash));
  return { days, value, weights, cash: cashW, returns, excess, turnover, metrics: metricsOf(value, returns, excess, turnover), unsolved };
}
