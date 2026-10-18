import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { portfolio } from './userdata';
import type { Position } from './userdata';

/**
 * Valuation helpers for the portfolio monitor. The portfolio holds only the
 * positions and cash you enter: there is no order entry, no simulated fill and
 * no paper-trading account (the master prompt keeps paper trading disabled).
 */

/** Units of underlying per quantity unit (contract size for futures, 1/100 for bond face). */
export function multiplier(d: SecurityDef): number {
  if (d.cls === 'commodity') {
    const m = /([\d,]+)/.exec(d.cmd!.size);
    return m ? Number(m[1].replace(/,/g, '')) : 1;
  }
  if (d.cls === 'bond') return 0.01;
  if (d.fut) return d.fut.multiplier;
  return 1;
}

/** USD value of one unit of price for one unit of quantity. */
export function usdPerPrice(d: SecurityDef): number {
  const ccy = d.ccy === 'GBp' ? 'GBP' : d.ccy === 'USd' ? 'USD' : d.ccy;
  const minor = d.minor ? 0.01 : 1;
  return engine.usdValue(ccy) * minor * multiplier(d);
}

/** Futures (index and commodity generics) are margined: only P&L counts toward value. */
export function isMargined(d: SecurityDef): boolean {
  return d.cls === 'future' || d.cls === 'commodity';
}

/** A position's contribution to net asset value in USD. */
export function navValue(d: SecurityDef, qty: number, px: number, cost: number): number {
  const k = usdPerPrice(d);
  return isMargined(d) ? qty * (px - cost) * k : qty * px * k;
}

/** Net asset value in USD: the cash you entered, securities at market and futures at unrealised P&L. */
export function netAssetValue(): number {
  const st = portfolio.get();
  let v = st.cash;
  for (const p of st.positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (d && q) v += navValue(d, p.qty, q.last, p.cost);
  }
  return v;
}

/** Sum of absolute position exposures in USD (futures at full notional). */
export function grossExposure(): number {
  let g = 0;
  for (const p of portfolio.get().positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (d && q) g += Math.abs(p.qty * q.last * usdPerPrice(d));
  }
  return g;
}

/** Manual quantity adjustment, not a trade ledger. Reductions retain cost; crossing zero resets it. */
export function adjustPosition(existing: Position | undefined, id: string, quantity: number, cost: number): Position | null {
  if (!id || ![quantity, cost].every(Number.isFinite) || quantity === 0 || (existing && (existing.id !== id || ![existing.qty, existing.cost].every(Number.isFinite)))) throw new Error('Invalid position adjustment.');
  if (!existing || existing.qty === 0) return { id, qty: quantity, cost };
  const qty = existing.qty + quantity;
  if (!Number.isFinite(qty)) throw new Error('Position quantity exceeds the numerical range.');
  if (qty === 0) return null;
  const sameSide = Math.sign(existing.qty) === Math.sign(quantity);
  const newCost = sameSide ? existing.cost + (cost - existing.cost) * (Math.abs(quantity) / Math.abs(qty))
    : Math.sign(qty) === Math.sign(existing.qty) ? existing.cost : cost;
  if (!Number.isFinite(newCost)) throw new Error('Position cost exceeds the numerical range.');
  return { id, qty, cost: newCost };
}
