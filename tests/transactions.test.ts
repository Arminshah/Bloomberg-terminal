import { describe, expect, it } from 'vitest';
import { replay, type SecInfo, type Txn } from '../src/finance/ledger';
import { addTxn, adoptTransactions, mismatches, needingRates, positionFromLots, removeTxn, setRates, txnsOf, validTxn } from '../src/terminal/transactions';
import { emptyPortfolio, type Portfolio } from '../src/terminal/userdata';

let n = 0;
const txn = (t: Partial<Txn> & Pick<Txn, 'kind' | 'date'>): Txn => ({ id: `t${n++}`, sec: 'AAPL US Equity', qty: 0, price: 0, fee: 0, fx: 1, fxNote: 'same currency', base: 'USD', ...t });
const plain: SecInfo = { unit: 1, splits: [] };
const info = (s: SecInfo = plain) => () => s;
const empty = (base = 'USD'): Portfolio => ({ ...emptyPortfolio('Test'), base });

/** Applies transactions one by one as the screen does, failing the test on a refusal. */
function record(p: Portfolio, txns: Txn[], i: (sec: string) => SecInfo | undefined = info()): Portfolio {
  for (const t of txns) {
    const r = addTxn(p, t, i);
    if (!r.ok) throw new Error(r.error);
    p = r.change.portfolio;
  }
  return p;
}

describe('recording transactions on a portfolio', () => {
  it('opens the holding from the lots: quantity, cost a share with the buy fees, entry rate weighted by cost', () => {
    const p = record(empty('EUR'), [
      txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100, fee: 5, fx: 0.9, fxNote: 'ECB reference rate of 2026-01-05', base: 'EUR' }),
      txn({ kind: 'buy', date: '2026-02-02', qty: 30, price: 120, fee: 6, fx: 0.95, fxNote: 'ECB reference rate of 2026-02-02', base: 'EUR' }),
    ]);
    expect(p.transactions).toHaveLength(2);
    const [pos] = p.positions;
    expect(pos.id).toBe('AAPL US Equity');
    expect(pos.qty).toBe(40);
    // (10 × 100 + 5 + 30 × 120 + 6) / 40 = 115.275 a share.
    expect(pos.cost).toBeCloseTo((1000 + 5 + 3600 + 6) / 40, 12);
    // Rates weighted by each lot's cost with its fee: 1005 at 0.90 and 3606 at 0.95.
    expect(pos.entryFx).toBeCloseTo((0.9 * 1005 + 0.95 * 3606) / (1005 + 3606), 12);
    expect(pos.entryBase).toBe('EUR');
    expect(pos.entryFxNote).toBe("average of the open lots' rates, weighted by cost");
  });

  it('reduces the holding with a sale, oldest shares first, and closes it when everything is sold', () => {
    let p = record(empty(), [
      txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100 }),
      txn({ kind: 'buy', date: '2026-02-02', qty: 10, price: 120 }),
      txn({ kind: 'sell', date: '2026-03-02', qty: 15, price: 130 }),
    ]);
    // Five of the second lot are left, at 120.
    expect(p.positions).toEqual([expect.objectContaining({ qty: 5, cost: 120 })]);
    p = record(p, [txn({ kind: 'sell', date: '2026-04-01', qty: 5, price: 140 })]);
    expect(p.positions).toEqual([]);
    expect(p.transactions).toHaveLength(4);
  });

  it('refuses a sale larger than the shares held on its day, including one dated before the buy', () => {
    const p = record(empty(), [txn({ kind: 'buy', date: '2026-02-02', qty: 10, price: 100 })]);
    const big = addTxn(p, txn({ kind: 'sell', date: '2026-03-02', qty: 11, price: 120 }), info());
    expect(big).toEqual({ ok: false, error: 'The sale of AAPL US Equity on 2026-03-02 would be 1 more than the shares held then.' });
    const early = addTxn(p, txn({ kind: 'sell', date: '2026-01-15', qty: 5, price: 120 }), info());
    expect(early.ok).toBe(false);
    // Nothing changed.
    expect(p.transactions).toHaveLength(1);
  });

  it('leaves a holding typed on Holdings alone when it differs, says so, and adopts the transactions when asked', () => {
    const typed: Portfolio = { ...empty(), positions: [{ id: 'AAPL US Equity', qty: 100, cost: 90 }] };
    const r = addTxn(typed, txn({ kind: 'buy', date: '2026-02-02', qty: 10, price: 100 }), info());
    expect(r.ok && r.change.holding).toBe('kept');
    const p = r.ok ? r.change.portfolio : typed;
    expect(p.positions).toEqual([{ id: 'AAPL US Equity', qty: 100, cost: 90 }]);
    expect(mismatches(p, info())).toEqual([{ sec: 'AAPL US Equity', holding: 100, ledger: 10 }]);
    const adopted = adoptTransactions(p, 'AAPL US Equity', info());
    expect(adopted.positions).toEqual([expect.objectContaining({ id: 'AAPL US Equity', qty: 10, cost: 100 })]);
    expect(mismatches(adopted, info())).toEqual([]);
    // Agreed again, the next trade moves the holding.
    const next = addTxn(adopted, txn({ kind: 'buy', date: '2026-03-02', qty: 5, price: 130 }), info());
    expect(next.ok && next.change.holding).toBe('updated');
    expect(next.ok && next.change.portfolio.positions[0].qty).toBe(15);
  });

  it("counts shares bought before a split on today's basis, so a holding typed before it shows as different", () => {
    // Two for one, first traded split on 2026-06-10 (day number of that date).
    const split: SecInfo = { unit: 1, splits: [{ day: Date.parse('2026-06-10T00:00:00Z') / 86_400_000, ratio: 2 }] };
    const p = record(empty(), [txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100, fee: 4 })], info(split));
    expect(p.positions).toEqual([expect.objectContaining({ qty: 20, cost: 50.2 })]);
    const typed: Portfolio = { ...p, positions: [{ id: 'AAPL US Equity', qty: 10, cost: 100 }] };
    expect(mismatches(typed, info(split))).toEqual([{ sec: 'AAPL US Equity', holding: 10, ledger: 20 }]);
  });

  it('values a pence-quoted lot with its fee in pounds: the cost a share stays in pence', () => {
    const pence: SecInfo = { unit: 0.01, splits: [] };
    const p = record(empty('GBP'), [txn({ sec: 'HSBA LN Equity', kind: 'buy', date: '2026-06-29', qty: 100, price: 1000, fee: 10, base: 'GBP' })], info(pence));
    // 1000p a share and £10 over 100 shares: 10p a share.
    expect(p.positions).toEqual([expect.objectContaining({ id: 'HSBA LN Equity', qty: 100, cost: 1010 })]);
  });

  it('leaves the holding alone for a dividend', () => {
    const p = record(empty(), [txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100 })]);
    const r = addTxn(p, txn({ kind: 'dividend', date: '2026-02-12', price: 2.6 }), info());
    expect(r.ok && r.change.holding).toBe('unchanged');
    expect(r.ok && r.change.portfolio.positions).toEqual(p.positions);
  });

  it('deletes a transaction, moving the holding back, but not a buy a later sale needs', () => {
    const buy1 = txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100 });
    const buy2 = txn({ kind: 'buy', date: '2026-02-02', qty: 10, price: 120 });
    const sale = txn({ kind: 'sell', date: '2026-03-02', qty: 15, price: 130 });
    const p = record(empty(), [buy1, buy2, sale]);
    expect(removeTxn(p, buy2.id, info())).toEqual({ ok: false, error: 'The sale of AAPL US Equity on 2026-03-02 would be 5 more than the shares held then. Delete that sale first.' });
    const r = removeTxn(p, sale.id, info());
    expect(r.ok && r.change.portfolio.positions).toEqual([expect.objectContaining({ qty: 20, cost: 110 })]);
    expect(removeTxn(p, 'gone', info()).ok).toBe(false);
  });

  it('marks the rates of another portfolio currency as missing and takes new ones', () => {
    const p = record(empty('USD'), [txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100 })]);
    const inEur: Portfolio = { ...p, base: 'EUR' };
    const missing = needingRates(inEur);
    expect(missing.map((t) => t.date)).toEqual(['2026-01-05']);
    expect(replay(txnsOf(inEur), info(), 'EUR').problems).toEqual(['1 transaction has no exchange rate into EUR: amounts in EUR that need it are unknown.']);
    const fixed = setRates(inEur, new Map([[missing[0].id, { fx: 0.92, note: 'ECB reference rate of 2026-01-05' }]]));
    expect(needingRates(fixed)).toEqual([]);
    expect(txnsOf(fixed)[0]).toMatchObject({ fx: 0.92, base: 'EUR', fxNote: 'ECB reference rate of 2026-01-05' });
  });

  it('reads stored transactions back: a rate saved as null is unknown, damaged entries are left out', () => {
    const good = txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100 });
    const stored = JSON.parse(JSON.stringify({ ...empty(), transactions: [{ ...good, fx: NaN }, { ...good, id: 'x', qty: -1 }, { ...good, id: 'y', date: '5/1/2026' }, null, 'buy'] })) as Portfolio;
    const back = txnsOf(stored);
    expect(back).toHaveLength(1);
    expect(back[0].fx).toBeNaN();
    expect(validTxn({ ...good, kind: 'short' })).toBe(false);
    expect(txnsOf({ ...empty(), transactions: undefined })).toEqual([]);
  });

  it('makes no holding from closed or empty lots', () => {
    expect(positionFromLots('AAPL US Equity', [], 1, 'USD', [])).toBeNull();
  });
});
