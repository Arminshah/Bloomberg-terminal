import { replay, type LedgerState, type Lot, type SecInfo, type Txn } from '../finance/ledger';
import type { Portfolio, Position } from './userdata';

/**
 * PORTFOLIO's transactions: the store operations behind its Transactions tab. A portfolio keeps its buys, sells and
 * dividends beside its holdings. When a security's holding equals the open quantity of its transactions (or neither
 * exists), a new or deleted transaction moves the holding with it; when they differ (a holding typed on Holdings,
 * or a split the holding does not reflect), the holding is left alone and the screen says so.
 */

const EPS = 1e-9;

/** A stored transaction read back from storage, or false when anything about it is unusable. */
export function validTxn(t: unknown): t is Txn {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return typeof x.id === 'string' && !!x.id
    && (x.kind === 'buy' || x.kind === 'sell' || x.kind === 'dividend')
    && typeof x.sec === 'string' && !!x.sec
    && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Number.isFinite(Date.parse(`${x.date}T00:00:00Z`))
    && num(x.qty) && (x.qty as number) >= 0 && (x.kind === 'dividend' || (x.qty as number) > 0)
    && num(x.price) && (x.price as number) >= 0
    && num(x.fee) && (x.fee as number) >= 0
    && typeof x.fx === 'number' && (Number.isNaN(x.fx) || (x.fx as number) > 0)
    && typeof x.fxNote === 'string' && typeof x.base === 'string';
}

/** A portfolio's transactions, without any that storage damaged. A rate saved as null (JSON has no NaN) is unknown. */
export function txnsOf(p: Portfolio): Txn[] {
  if (!Array.isArray(p.transactions)) return [];
  return p.transactions.map((t) => (t && typeof t === 'object' && (t as { fx: unknown }).fx === null ? { ...t, fx: NaN } : t)).filter(validTxn);
}

/** A new transaction id: random where the platform offers it, else time and a counter. */
let counter = 0;
export function txnId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return typeof c?.randomUUID === 'function' ? c.randomUUID() : `t${Date.now().toString(36)}${(counter++).toString(36)}`;
}

/** Open quantity of each security, on today's share basis. */
export function openQuantities(state: LedgerState): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of state.lots) out.set(l.sec, (out.get(l.sec) ?? 0) + l.qty);
  return out;
}

const same = (a: number, b: number) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const holdingQty = (p: Portfolio, sec: string) => p.positions.filter((x) => x.id === sec).reduce((a, x) => a + x.qty, 0);

/**
 * A holding made from a security's open lots: their quantity, the average cost a unit with the buy fees (in the
 * price's units: pence for a pence-quoted stock), and the entry rate weighted by each lot's cost when every lot has
 * one in the portfolio's base. Null when no lot is open.
 */
export function positionFromLots(sec: string, lots: readonly Lot[], unit: number, base: string, txns: readonly Txn[]): Position | null {
  const open = lots.filter((l) => l.sec === sec && l.qty > EPS);
  const qty = open.reduce((a, l) => a + l.qty, 0);
  if (!(qty > EPS) || !(unit > 0)) return null;
  const costOf = (l: Lot) => l.price + l.feePerUnit / unit;
  const cost = open.reduce((a, l) => a + l.qty * costOf(l), 0) / qty;
  const pos: Position = { id: sec, qty: round(qty), cost };
  const weights = open.map((l) => l.qty * costOf(l));
  const total = weights.reduce((a, w) => a + w, 0);
  if (open.every((l) => l.fx > 0) && total > 0) {
    pos.entryFx = open.reduce((a, l, i) => a + l.fx * weights[i], 0) / total;
    pos.entryBase = base;
    const notes = new Set(open.map((l) => txns.find((t) => t.id === l.txn)?.fxNote ?? ''));
    pos.entryFxNote = notes.size === 1 && [...notes][0] ? [...notes][0] : "average of the open lots' rates, weighted by cost";
  }
  return pos;
}

/** Quantities summed from fractions of split lots carry float dust: kept to 1e-9 of a share. */
const round = (q: number) => Math.round(q * 1e9) / 1e9;

export type Info = (sec: string) => SecInfo | undefined;

export interface Change {
  portfolio: Portfolio;
  /** What happened to the security's holding: moved with the transactions, left alone because the two differed, or nothing to do (a dividend). */
  holding: 'updated' | 'kept' | 'unchanged';
}

/** The portfolio with `sec`'s holding set from its open lots (removed when none is open). */
function withHolding(p: Portfolio, sec: string, state: LedgerState, info: Info, txns: readonly Txn[]): Portfolio {
  const s = info(sec);
  const pos = s ? positionFromLots(sec, state.lots, s.unit, p.base, txns) : null;
  const at = p.positions.findIndex((x) => x.id === sec);
  const rest = p.positions.filter((x) => x.id !== sec);
  if (!pos) return { ...p, positions: rest };
  // The holding keeps its place in the list.
  return { ...p, positions: at < 0 ? [...rest, pos] : [...rest.slice(0, at), pos, ...rest.slice(at)] };
}

/** Sales a list of transactions leaves larger than the shares held then, as text, or null when there are none. */
function oversoldText(state: LedgerState): string | null {
  const o = state.oversold[0];
  return o ? `The sale of ${o.sec} on ${o.date} would be ${String(round(o.qty))} more than the shares held then.` : null;
}

/**
 * Adds a transaction. Refused when it leaves any sale larger than the shares held on its day (a sale too large, or a
 * sale dated before the buys). A buy or sale moves the security's holding when the holding agreed with the
 * transactions before.
 */
export function addTxn(p: Portfolio, t: Txn, info: Info): { ok: true; change: Change } | { ok: false; error: string } {
  const before = txnsOf(p);
  const after = [...before, t];
  const then = replay(after, info, p.base);
  const err = oversoldText(then);
  if (err) return { ok: false, error: err };
  const next: Portfolio = { ...p, transactions: after };
  if (t.kind === 'dividend') return { ok: true, change: { portfolio: next, holding: 'unchanged' } };
  const agreed = same(holdingQty(p, t.sec), openQuantities(replay(before, info, p.base)).get(t.sec) ?? 0);
  return { ok: true, change: agreed ? { portfolio: withHolding(next, t.sec, then, info, after), holding: 'updated' } : { portfolio: next, holding: 'kept' } };
}

/** Deletes a transaction; refused when that would leave a later sale larger than the shares held then. */
export function removeTxn(p: Portfolio, id: string, info: Info): { ok: true; change: Change } | { ok: false; error: string } {
  const before = txnsOf(p);
  const gone = before.find((t) => t.id === id);
  if (!gone) return { ok: false, error: 'That transaction is no longer there.' };
  const after = before.filter((t) => t.id !== id);
  const then = replay(after, info, p.base);
  const err = oversoldText(then);
  if (err) return { ok: false, error: `${err} Delete that sale first.` };
  const next: Portfolio = { ...p, transactions: after };
  if (gone.kind === 'dividend') return { ok: true, change: { portfolio: next, holding: 'unchanged' } };
  const agreed = same(holdingQty(p, gone.sec), openQuantities(replay(before, info, p.base)).get(gone.sec) ?? 0);
  return { ok: true, change: agreed ? { portfolio: withHolding(next, gone.sec, then, info, after), holding: 'updated' } : { portfolio: next, holding: 'kept' } };
}

/** Where a holding and the transactions disagree: the holding's quantity and the transactions' open quantity. */
export interface Mismatch {
  sec: string;
  holding: number;
  ledger: number;
}

/** Securities with transactions whose holding differs from their open quantity. Holdings with no transactions are not compared. */
export function mismatches(p: Portfolio, info: Info): Mismatch[] {
  const txns = txnsOf(p);
  if (!txns.length) return [];
  const open = openQuantities(replay(txns, info, p.base));
  const secs = [...new Set(txns.filter((t) => t.kind !== 'dividend').map((t) => t.sec))];
  return secs.flatMap((sec) => {
    const holding = holdingQty(p, sec);
    const ledger = open.get(sec) ?? 0;
    return same(holding, ledger) ? [] : [{ sec, holding, ledger: round(ledger) }];
  });
}

/** "Use the transactions": the holding of `sec` set from its open lots. */
export function adoptTransactions(p: Portfolio, sec: string, info: Info): Portfolio {
  const txns = txnsOf(p);
  return withHolding(p, sec, replay(txns, info, p.base), info, txns);
}

/** Transactions with no rate into the portfolio's current base: recorded for another base, or with none found. */
export function needingRates(p: Portfolio): Txn[] {
  return txnsOf(p).filter((t) => t.base !== p.base || !(t.fx > 0));
}

/** The portfolio with new rates for some transactions (by id), each with where it came from, into its current base. */
export function setRates(p: Portfolio, rates: ReadonlyMap<string, { fx: number; note: string }>): Portfolio {
  if (!rates.size) return p;
  return { ...p, transactions: txnsOf(p).map((t) => {
    const r = rates.get(t.id);
    return r && r.fx > 0 ? { ...t, fx: r.fx, fxNote: r.note, base: p.base } : t;
  }) };
}
