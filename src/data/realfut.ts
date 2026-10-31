import { engine } from './market';
import { DAY_MS } from './calendar';
import { dividendYield, riskFreeRate } from './options';
import { yahooQuotes } from './live/yahoo';
import { frontContract } from './live/yquotes';
import { eurexFront } from './live/eurex';
import type { SecurityDef } from './types';

/**
 * An index future's front contract on real data: the contract the source
 * quotes (month, last trade date, open interest) and its fair value from real
 * inputs, the 3-month Treasury rate and the index's dividend yield over the past 12 months
 * (from its ETF). Fair value is a model: F = S x e^((r - q) x days / 365).
 * Eurex's Euro Stoxx 50 and DAX lines take their contract from Eurex's
 * statistics and the euro rate the app has (the ECB's deposit rate); the DAX is
 * a performance index, its dividends reinvested, so q is 0 for it.
 */
export function realFutureContract(sec: SecurityDef) {
  const f = sec.fut!;
  const und = engine.get(f.underlying)!;
  const uq = engine.quote(und.id)!;
  const ex = eurexFront.get(sec.id);
  const fc = ex ? undefined : frontContract(yahooQuotes.get(sec.id));
  const root = sec.ticker.replace(/1$/, '').trim();
  const expiry = ex ? Math.floor(Date.parse(`${ex.expiry}T00:00:00Z`) / DAY_MS) : fc ? Math.floor(fc.expiry / DAY_MS) : NaN;
  // An end-of-day Eurex line is set against the index close Eurex gives for the same day, from that day.
  const spot = ex && ex.underlyingClose > 0 ? ex.underlyingClose : uq.last;
  const days = expiry - (ex ? Math.floor(Date.parse(`${ex.asOf}T00:00:00Z`) / DAY_MS) : engine.today);
  const rate = sec.ccy === 'USD' ? (engine.hasSource('USGG3M Index') ? engine.quote('USGG3M Index')!.last : NaN) : ex ? riskFreeRate(sec).r * 100 : NaN;
  const q = und.id === 'DAX Index' ? 0 : dividendYield(und);
  const fair = spot * Math.exp((rate / 100 - q) * (days / 365));
  const code = ex ? ex.code : fc ? `${root}${root.length === 1 ? ' ' : ''}${fc.code}` : '--';
  return { code, expiry, days, fair, carry: fair - spot, rate, q, oi: ex ? ex.openInterest : fc?.openInterest ?? NaN, spot, asOf: ex?.asOf };
}
