import { blackScholes, type Greeks, type OptType } from './options';

export interface StrategyLeg {
  type: OptType;
  strike: number;
  quantity: number; // signed contracts
  premium: number; // entry price per share, always nonnegative
  volatility: number; // decimal
}
export interface StrategyInputs {
  spot: number;
  days: number;
  rate: number;
  dividend: number;
  multiplier: number;
  shares: number;
  stockCost: number;
  legs: StrategyLeg[];
}

/** Compact, editable legs; blank/missing cells never silently become zero. */
export function parseStrategyLegs(text: string): StrategyLeg[] {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length || lines.length > 12) throw new RangeError('Enter between 1 and 12 option legs.');
  return lines.map((line, k) => {
    const cells = line.split(/[,;]/).map((v) => v.trim());
    const [type, ...values] = cells;
    const [strike, quantity, premium, vol] = values.map(Number);
    if (cells.length !== 5 || cells.some((v) => !v) || !['C', 'P'].includes(type.toUpperCase()) ||
        ![strike, quantity, premium, vol].every(Number.isFinite) || strike <= 0 || !Number.isInteger(quantity) ||
        quantity === 0 || Math.abs(quantity) > 1e6 || premium < 0 || vol < 0 || vol > 1000) {
      throw new RangeError(`Leg ${k + 1}: use C or P, positive strike, nonzero integer quantity, nonnegative premium and volatility % (at most 1000).`);
    }
    return { type: type.toUpperCase() as OptType, strike, quantity, premium, volatility: vol / 100 };
  });
}

export function strategyValue(i: StrategyInputs) {
  if (![i.spot, i.days, i.rate, i.dividend, i.multiplier, i.shares, i.stockCost].every(Number.isFinite) ||
      i.spot <= 0 || i.days < 0 || i.days > 36600 || i.multiplier <= 0 || i.stockCost < 0 ||
      !i.legs.length || i.legs.length > 12 || i.legs.some((l) => !['C', 'P'].includes(l.type) ||
        ![l.strike, l.quantity, l.premium, l.volatility].every(Number.isFinite) || l.strike <= 0 ||
        !Number.isInteger(l.quantity) || l.quantity === 0 || Math.abs(l.quantity) > 1e6 || l.premium < 0 || l.volatility < 0 || l.volatility > 10)) {
    throw new RangeError('Enter valid spot, days (0–36600), rates, multiplier, stock position and option legs.');
  }
  const optionDebit = i.legs.reduce((sum, l) => sum + l.quantity * i.multiplier * l.premium, 0);
  const entryDebit = optionDebit + i.shares * i.stockCost;
  const atExpiry = (spot: number) => spot < 0 || !Number.isFinite(spot) ? NaN : i.shares * spot - entryDebit +
    i.legs.reduce((sum, l) => sum + l.quantity * i.multiplier * Math.max(0, l.type === 'C' ? spot - l.strike : l.strike - spot), 0);
  const marks = i.legs.map((l) => ({ ...l, greeks: blackScholes(l.type, i.spot, l.strike, i.days / 365, i.rate, i.dividend, l.volatility) }));
  const total = (key: keyof Greeks) => marks.reduce((sum, l) => sum + l.quantity * i.multiplier * l.greeks[key], 0);
  const modelValue = i.shares * i.spot + total('price');
  if (![entryDebit, modelValue].every(Number.isFinite)) throw new RangeError('These inputs exceed the calculator’s numerical range.');
  const greeks = { delta: i.shares + total('delta'), gamma: total('gamma'), theta: total('theta'), vega: total('vega'), rho: total('rho') };
  // Common expiry payoff is piecewise linear for nonnegative terminal spot. Every
  // finite extremum is at zero/a strike; the right-tail slope detects unlimited risk.
  const knots = [...new Set([0, ...i.legs.map((l) => l.strike)])].sort((a, b) => a - b);
  const payoffs = knots.map(atExpiry);
  const tailSlope = i.shares + i.legs.filter((l) => l.type === 'C').reduce((sum, l) => sum + l.quantity * i.multiplier, 0);
  if (!Number.isFinite(tailSlope) || !payoffs.every(Number.isFinite)) throw new RangeError('These payoffs exceed the calculator’s numerical range.');
  const minPnl = tailSlope < 0 ? -Infinity : Math.min(...payoffs);
  const maxPnl = tailSlope > 0 ? Infinity : Math.max(...payoffs);
  const roots: number[] = [];
  const zeroRanges: [number, number][] = [];
  const epsilon = 32 * Number.EPSILON * Math.max(1, Math.abs(entryDebit), ...payoffs.map(Math.abs));
  for (let k = 0; k < knots.length; k++) {
    const left = knots[k];
    const right = k + 1 < knots.length ? knots[k + 1] : Infinity;
    const a = payoffs[k];
    const slope = Number.isFinite(right) ? (payoffs[k + 1] - a) / (right - left) : tailSlope;
    if (Math.abs(a) <= epsilon) roots.push(left);
    if (slope === 0) {
      if (Math.abs(a) <= epsilon) zeroRanges.push([left, right]);
    } else {
      const root = left - a / slope;
      if (root >= left && root <= right && Number.isFinite(root)) roots.push(root);
    }
  }
  const breakEvens = [...new Set(roots.map((v) => Number(v.toPrecision(13))))].sort((a, b) => a - b);
  const scenario = (spot: number, daysForward = 0, volShift = 0) => {
    if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(daysForward) || daysForward < 0 || daysForward > i.days ||
        !Number.isFinite(volShift) || i.legs.some((l) => l.volatility + volShift < 0 || l.volatility + volShift > 10)) return NaN;
    return i.shares * spot - entryDebit + i.legs.reduce((sum, l) => sum + l.quantity * i.multiplier *
      blackScholes(l.type, spot, l.strike, (i.days - daysForward) / 365, i.rate, i.dividend, l.volatility + volShift).price, 0);
  };
  return { optionDebit, entryDebit, modelValue, modelPnl: modelValue - entryDebit, greeks, marks, atExpiry, scenario,
    minPnl, maxPnl, maxLoss: Math.max(0, -minPnl), maxProfit: Math.max(0, maxPnl), breakEvens, zeroRanges };
}
