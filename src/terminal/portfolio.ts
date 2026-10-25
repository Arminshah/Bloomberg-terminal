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

/** Currencies the portfolio can be valued in. */
export const BASE_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'] as const;

/** The currency a security's price is quoted in, in major units (pence are pounds). */
export const priceCurrency = (d: SecurityDef) => (d.ccy === 'GBp' ? 'GBP' : d.ccy === 'USd' ? 'USD' : d.ccy);

/** USD value of one unit of price for one unit of quantity. */
export function usdPerPrice(d: SecurityDef): number {
  const minor = d.minor ? 0.01 : 1;
  return engine.usdValue(priceCurrency(d)) * minor * multiplier(d);
}

/** Base-currency units per unit of a currency, at the current FX marks. */
export function baseFx(ccy: string, base: string): number {
  return ccy === base ? 1 : engine.usdValue(ccy) / engine.usdValue(base);
}

/** Base-currency value of one unit of price for one unit of quantity. */
export function basePerPrice(d: SecurityDef, base: string): number {
  return baseFx(priceCurrency(d), base) * (d.minor ? 0.01 : 1) * multiplier(d);
}

/** Futures (index and commodity generics) are margined: only P&L counts toward value. */
export function isMargined(d: SecurityDef): boolean {
  return d.cls === 'future' || d.cls === 'commodity';
}

/** A position's contribution to net asset value in the base currency (USD unless given). */
export function navValue(d: SecurityDef, qty: number, px: number, cost: number, base = 'USD'): number {
  const k = basePerPrice(d, base);
  return isMargined(d) ? qty * (px - cost) * k : qty * px * k;
}

/** Net asset value in the base currency: your cash, securities at market and futures at unrealised P&L. */
export function netAssetValue(): number {
  const st = portfolio.get();
  let v = st.cash;
  for (const p of st.positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (d && q) v += navValue(d, p.qty, q.last, p.cost, st.base);
  }
  return v;
}

/** Sum of absolute position exposures in the base currency (futures at full notional). */
export function grossExposure(): number {
  const st = portfolio.get();
  let g = 0;
  for (const p of st.positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (d && q) g += Math.abs(p.qty * q.last * basePerPrice(d, st.base));
  }
  return g;
}

/**
 * A holding's unrealised P&L in the base currency, split into the local price move valued at today's FX and
 * the FX move on the entry value. The FX part is unknown (NaN) without an entry rate in the same base, and
 * for futures, whose value is only their P&L.
 */
export function pnlSplit(d: SecurityDef, p: Position, last: number, base: string): { price: number; fx: number; total: number } {
  const k = basePerPrice(d, base);
  const price = p.qty * (last - p.cost) * k;
  if (isMargined(d) || p.entryBase !== base || !(p.entryFx! > 0)) return { price, fx: NaN, total: NaN };
  const kEntry = p.entryFx! * (d.minor ? 0.01 : 1) * multiplier(d);
  const fx = p.qty * p.cost * (k - kEntry);
  return { price, fx, total: price + fx };
}

/**
 * Manual quantity adjustment, not a trade ledger. Reductions retain cost; crossing zero resets it. With an
 * entry FX rate, adding on the same side averages it by the local cost of each lot; a rate in another base,
 * or a lot without one, leaves the average unknown.
 */
export function adjustPosition(existing: Position | undefined, id: string, quantity: number, cost: number, entry?: { fx: number; base: string; note?: string }): Position | null {
  if (!id || ![quantity, cost].every(Number.isFinite) || quantity === 0 || (existing && (existing.id !== id || ![existing.qty, existing.cost].every(Number.isFinite)))) throw new Error('Invalid position adjustment.');
  const fresh = entry && entry.fx > 0 ? { entryFx: entry.fx, entryBase: entry.base, ...(entry.note ? { entryFxNote: entry.note } : {}) } : {};
  if (!existing || existing.qty === 0) return { id, qty: quantity, cost, ...fresh };
  const qty = existing.qty + quantity;
  if (!Number.isFinite(qty)) throw new Error('Position quantity exceeds the numerical range.');
  if (qty === 0) return null;
  const sameSide = Math.sign(existing.qty) === Math.sign(quantity);
  const newCost = sameSide ? existing.cost + (cost - existing.cost) * (Math.abs(quantity) / Math.abs(qty))
    : Math.sign(qty) === Math.sign(existing.qty) ? existing.cost : cost;
  if (!Number.isFinite(newCost)) throw new Error('Position cost exceeds the numerical range.');
  const kept = existing.entryFx !== undefined ? { entryFx: existing.entryFx, entryBase: existing.entryBase, ...(existing.entryFxNote ? { entryFxNote: existing.entryFxNote } : {}) } : {};
  if (!sameSide) return { id, qty, cost: newCost, ...(Math.sign(qty) === Math.sign(existing.qty) ? kept : fresh) };
  // Same side: the entry rate averaged by each lot's local cost (quantity times cost).
  const a = Math.abs(existing.qty * existing.cost);
  const b = Math.abs(quantity * cost);
  const averaged = existing.entryFx! > 0 && entry && entry.fx > 0 && existing.entryBase === entry.base && a + b > 0
    ? { entryFx: (existing.entryFx! * a + entry.fx * b) / (a + b), entryBase: entry.base, entryFxNote: existing.entryFxNote === entry.note && entry.note ? entry.note : "average of the lots' entry rates, weighted by cost" } : {};
  return { id, qty, cost: newCost, ...averaged };
}
