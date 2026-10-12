import { engine } from './market';
import { DAY_MS } from './calendar';
import { dividendYield } from './options';
import { yahooQuotes } from './live/yahoo';
import { frontContract } from './live/yquotes';
import type { SecurityDef } from './types';

/**
 * An index future's front contract on real data: the contract the source
 * quotes (month, last trade date, open interest) and its fair value from real
 * inputs, the 3-month Treasury rate and the index's trailing dividend yield
 * (from its ETF). Fair value is a model: F = S x e^((r - q) x days / 365).
 */
export function realFutureContract(sec: SecurityDef) {
  const f = sec.fut!;
  const und = engine.get(f.underlying)!;
  const uq = engine.quote(und.id)!;
  const fc = frontContract(yahooQuotes.get(sec.id));
  const root = sec.ticker.replace(/1$/, '').trim();
  const expiry = fc ? Math.floor(fc.expiry / DAY_MS) : NaN;
  const days = expiry - engine.today;
  const rate = sec.ccy === 'USD' && engine.hasSource('USGG3M Index') ? engine.quote('USGG3M Index')!.last : NaN;
  const q = dividendYield(und);
  const fair = uq.last * Math.exp((rate / 100 - q) * (days / 365));
  return { code: fc ? `${root}${root.length === 1 ? ' ' : ''}${fc.code}` : '--', expiry, days, fair, carry: fair - uq.last, rate, q, oi: fc?.openInterest ?? NaN };
}
