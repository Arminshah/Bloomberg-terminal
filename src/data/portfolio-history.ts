import { engine } from './market';
import type { MarketEngine } from './engine';
import type { Series } from './series';
import { DAY_MS } from './calendar';
import { multiplier } from '../terminal/portfolio';
import type { Position } from '../terminal/userdata';
import type { Quote, SecurityDef } from './types';
import { freshnessOf } from './freshness';
import { alignPortfolio, type Checked, type DailyLevel, type PortfolioHistory, type RiskPosition } from '../finance/portfolio-risk';

export const majorCurrency = (ccy: string) => ccy === 'GBp' ? 'GBP' : ccy === 'USd' ? 'USD' : ccy === 'CNY' ? 'CNH' : ccy;

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

/** Freeze the current UTC date out of history for every market; no exchange close is inferred. */
export function portfolioSnapshot(positions: Position[], cash: number, observations: number, market: MarketEngine = engine): Checked<PortfolioSnapshot> {
  const capturedAt = market.now();
  const cutoff = Math.floor(capturedAt / DAY_MS) * DAY_MS;
  const out: SourcedRiskPosition[] = [];
  for (const p of positions) {
    const d = market.get(p.id);
    if (!d) return { ok: false, error: `Unknown holding ${p.id}. Remove or resolve it before calculating the whole portfolio.` };
    if (d.quote === 'yield') return { ok: false, error: `${d.ticker} is a yield reference, not a priced instrument. Use a priced bond or fund for portfolio valuation.` };
    const ccy = majorCurrency(d.ccy);
    const priceQuote = market.quote(p.id);
    const fxId = `CCY:${ccy}`;
    out.push({ id: p.id, quantity: p.qty, cost: p.cost, multiplier: multiplier(d) * (d.minor ? 0.01 : 1),
      margined: d.cls === 'future' || d.cls === 'commodity', price: priceQuote?.last ?? NaN, fx: market.usdValue(ccy),
      priceMark: captureMark(priceQuote, d, capturedAt),
      fxMark: ccy === 'USD' ? { provider: 'USD identity', state: 'IDENTITY', time: null, received: null, dateOnly: false, freshness: 'REFERENCE' } : captureMark(market.quote(fxId), market.get(fxId), capturedAt),
      quoteCurrency: d.ccy, fxCurrency: ccy, fxProxyNote: d.ccy === 'CNY' ? 'CNY translated using offshore CNH as a proxy; onshore/offshore basis is not modelled.' : '',
      prices: dailyLevels(market.daily(p.id), cutoff), ...(ccy === 'USD' ? {} : { fxId, fxHistory: dailyLevels(market.daily(fxId), cutoff) }) });
  }
  return { ok: true, value: { positions: out, cutoff, capturedAt, history: alignPortfolio(out, cash, cutoff, observations) } };
}

/** Benchmark translated to USD on exactly the dates both its price and currency have observations. */
export function benchmarkLevels(id: string, cutoff: number, market: MarketEngine = engine): DailyLevel[] {
  const d = market.get(id);
  if (!d || d.quote !== 'price') return [];
  const ccy = majorCurrency(d.ccy);
  const fx = ccy === 'USD' ? undefined : new Map(dailyLevels(market.daily(`CCY:${ccy}`), cutoff).map((r) => [r.date, r.value]));
  return dailyLevels(market.daily(id), cutoff).flatMap((r) => {
    const value = r.value * (fx ? fx.get(r.date) ?? NaN : 1) * (d.minor ? 0.01 : 1);
    return Number.isFinite(value) && value > 0 ? [{ date: r.date, value }] : [];
  });
}
