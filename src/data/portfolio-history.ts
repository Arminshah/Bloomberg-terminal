import { engine } from './market';
import type { MarketEngine } from './engine';
import type { Series } from './series';
import { DAY_MS } from './calendar';
import { multiplier } from '../terminal/portfolio';
import type { Position } from '../terminal/userdata';
import type { Quote, SecurityDef } from './types';
import { freshnessOf } from './freshness';
import { alignPortfolio, type Checked, type DailyLevel, type PortfolioHistory, type RiskPosition } from '../finance/portfolio-risk';

export const majorCurrency = (ccy: string) => ccy === 'GBp' ? 'GBP' : ccy === 'USd' ? 'USD' : ccy;

export function dailyLevels(series: Series, cutoff: number): DailyLevel[] {
  const out: DailyLevel[] = [];
  for (let i = 0; i < series.length; i++) if (series.t[i] < cutoff) out.push({ date: series.t[i], value: series.c[i] });
  return out;
}

export interface PortfolioSnapshot {
  positions: SourcedRiskPosition[];
  history: Checked<PortfolioHistory>;
  cutoff: number;
  capturedAt: number;
}

export interface CapturedMark {
  provider: string;
  state: string;
  time: number | null;
  received: number | null;
  dateOnly: boolean;
  freshness: string;
}
export interface SourcedRiskPosition extends RiskPosition {
  priceMark: CapturedMark;
  fxMark: CapturedMark;
  quoteCurrency: string;
  fxCurrency: string;
  fxProxyNote: string;
}
const validTime = (n: number | undefined) => n !== undefined && Number.isFinite(n) && n > 0 && n <= 8.64e15 ? n : null;
function captureMark(q: Quote | undefined, d: SecurityDef | undefined, now: number): CapturedMark {
  return { provider: q?.provider ?? (q?.src === 'SIM' ? 'Demo engine' : 'Unavailable'), state: q?.src ?? 'NONE',
    time: q?.src === 'NONE' ? null : validTime(q?.time), received: validTime(q?.fetched), dateOnly: !!q?.dayOnly || q?.src === 'EOD',
    freshness: q ? freshnessOf(q, d, now)?.label ?? 'UNAVAILABLE' : 'UNAVAILABLE' };
}
export const capturedTime = (m: CapturedMark): string => m.time === null ? '' : new Date(m.time).toISOString().slice(0, m.dateOnly ? 10 : undefined);

/**
 * Daily base-currency units per unit of a currency: the currency's USD series, divided by the base's USD
 * series on the dates both have. Undefined for the base itself.
 */
export function baseFxLevels(ccy: string, base: string, cutoff: number, market: MarketEngine = engine): DailyLevel[] | undefined {
  if (ccy === base) return undefined;
  const usd = (c: string) => dailyLevels(market.daily(`CCY:${c}`), cutoff);
  if (base === 'USD') return usd(ccy);
  const den = new Map(usd(base).map((r) => [r.date, r.value]));
  if (ccy === 'USD') return [...den].flatMap(([date, v]) => (v > 0 ? [{ date, value: 1 / v }] : []));
  return usd(ccy).flatMap((r) => {
    const v = den.get(r.date);
    return v !== undefined && v > 0 ? [{ date: r.date, value: r.value / v }] : [];
  });
}

/** The FX mark behind a conversion to the base: one currency's quote, or the older of the two for a cross. */
function fxMarkFor(ccy: string, base: string, market: MarketEngine, at: number): CapturedMark {
  if (ccy === base) return { provider: `${base} identity`, state: 'IDENTITY', time: null, received: null, dateOnly: false, freshness: 'REFERENCE' };
  const marks = [ccy, base].filter((c) => c !== 'USD').map((c) => captureMark(market.quote(`CCY:${c}`), market.get(`CCY:${c}`), at));
  if (marks.length === 1) return marks[0];
  const [a, b] = marks;
  const older = (a.time ?? -Infinity) <= (b.time ?? -Infinity) ? a : b;
  return { ...older, provider: a.provider === b.provider ? a.provider : `${a.provider} / ${b.provider}` };
}

/** Freeze the current UTC date out of history for every market; no exchange close is inferred. */
export function portfolioSnapshot(positions: Position[], cash: number, observations: number, market: MarketEngine = engine, base = 'USD'): Checked<PortfolioSnapshot> {
  const capturedAt = market.now();
  const cutoff = Math.floor(capturedAt / DAY_MS) * DAY_MS;
  const out: SourcedRiskPosition[] = [];
  for (const p of positions) {
    const d = market.get(p.id);
    if (!d) return { ok: false, error: `Unknown holding ${p.id}. Remove or resolve it before calculating the whole portfolio.` };
    if (d.quote === 'yield') return { ok: false, error: `${d.ticker} is a yield reference, not a priced instrument. Use a priced bond or fund for portfolio valuation.` };
    const ccy = majorCurrency(d.ccy);
    const priceQuote = market.quote(p.id);
    const fxId = base === 'USD' ? `CCY:${ccy}` : `${ccy}${base}`;
    const fxHistory = baseFxLevels(ccy, base, cutoff, market);
    out.push({ id: p.id, quantity: p.qty, cost: p.cost, multiplier: multiplier(d) * (d.minor ? 0.01 : 1),
      margined: d.cls === 'future' || d.cls === 'commodity', price: priceQuote?.last ?? NaN,
      fx: ccy === base ? 1 : market.usdValue(ccy) / market.usdValue(base),
      priceMark: captureMark(priceQuote, d, capturedAt),
      fxMark: fxMarkFor(ccy, base, market, capturedAt),
      quoteCurrency: d.ccy, fxCurrency: ccy, fxProxyNote: '',
      prices: dailyLevels(market.daily(p.id), cutoff), ...(fxHistory ? { fxId, fxHistory } : {}) });
  }
  return { ok: true, value: { positions: out, cutoff, capturedAt, history: alignPortfolio(out, cash, cutoff, observations) } };
}

/** Benchmark translated to the base currency on exactly the dates both its price and currency have observations. */
export function benchmarkLevels(id: string, cutoff: number, market: MarketEngine = engine, base = 'USD'): DailyLevel[] {
  const d = market.get(id);
  if (!d || d.quote !== 'price') return [];
  const levels = baseFxLevels(majorCurrency(d.ccy), base, cutoff, market);
  const fx = levels ? new Map(levels.map((r) => [r.date, r.value])) : undefined;
  return dailyLevels(market.daily(id), cutoff).flatMap((r) => {
    const value = r.value * (fx ? fx.get(r.date) ?? NaN : 1) * (d.minor ? 0.01 : 1);
    return Number.isFinite(value) && value > 0 ? [{ date: r.date, value }] : [];
  });
}
