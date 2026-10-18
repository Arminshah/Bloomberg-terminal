import { engine } from './market';
import type { MarketEngine } from './engine';
import type { Series } from './series';
import { DAY_MS } from './calendar';
import { multiplier } from '../terminal/portfolio';
import type { Position } from '../terminal/userdata';
import { alignPortfolio, type Checked, type DailyLevel, type PortfolioHistory, type RiskPosition } from '../finance/portfolio-risk';

export const majorCurrency = (ccy: string) => ccy === 'GBp' ? 'GBP' : ccy === 'USd' ? 'USD' : ccy === 'CNY' ? 'CNH' : ccy;

export function dailyLevels(series: Series, cutoff: number): DailyLevel[] {
  const out: DailyLevel[] = [];
  for (let i = 0; i < series.length; i++) if (series.t[i] < cutoff) out.push({ date: series.t[i], value: series.c[i] });
  return out;
}

export interface PortfolioSnapshot {
  positions: RiskPosition[];
  history: Checked<PortfolioHistory>;
  cutoff: number;
}

/** Freeze the current UTC date out of history for every market; no exchange close is inferred. */
export function portfolioSnapshot(positions: Position[], cash: number, observations: number, market: MarketEngine = engine): Checked<PortfolioSnapshot> {
  const cutoff = Math.floor(market.now() / DAY_MS) * DAY_MS;
  const out: RiskPosition[] = [];
  for (const p of positions) {
    const d = market.get(p.id);
    if (!d) return { ok: false, error: `Unknown holding ${p.id}. Remove or resolve it before calculating the whole portfolio.` };
    if (d.quote === 'yield') return { ok: false, error: `${d.ticker} is a yield reference, not a priced instrument. Use a priced bond or fund for portfolio valuation.` };
    const ccy = majorCurrency(d.ccy);
    out.push({ id: p.id, quantity: p.qty, cost: p.cost, multiplier: multiplier(d) * (d.minor ? 0.01 : 1),
      margined: d.cls === 'future' || d.cls === 'commodity', price: market.quote(p.id)?.last ?? NaN, fx: market.usdValue(ccy),
      prices: dailyLevels(market.daily(p.id), cutoff), ...(ccy === 'USD' ? {} : { fxId: `CCY:${ccy}`, fxHistory: dailyLevels(market.daily(`CCY:${ccy}`), cutoff) }) });
  }
  return { ok: true, value: { positions: out, cutoff, history: alignPortfolio(out, cash, cutoff, observations) } };
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
