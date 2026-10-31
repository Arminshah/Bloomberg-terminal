import { describe, expect, it } from 'vitest';
import { performance, replay, splitFactor, unrealised, xirr, type PerfInput, type SecInfo, type Txn } from '../src/finance/ledger';

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
let n = 0;
const txn = (t: Partial<Txn> & Pick<Txn, 'kind' | 'date'>): Txn => ({ id: `t${n++}`, sec: 'S', qty: 0, price: 0, fee: 0, fx: 1, fxNote: 'same currency', base: 'USD', ...t });
const plain: SecInfo = { unit: 1, splits: [] };

describe('transactions matched into lots, first in first out', () => {
  it('realises the oldest lot first, with fees and the exchange rate split out', () => {
    const txns = [
      txn({ kind: 'buy', date: '2026-01-05', qty: 10, price: 100, fee: 5, fx: 0.9, base: 'EUR' }),
      txn({ kind: 'buy', date: '2026-02-02', qty: 10, price: 120, fee: 5, fx: 0.95, base: 'EUR' }),
      txn({ kind: 'sell', date: '2026-03-02', qty: 15, price: 130, fee: 6, fx: 0.92, base: 'EUR' }),
    ];
    const st = replay(txns, () => plain, 'EUR');
    expect(st.problems).toEqual([]);
    expect(st.realised).toHaveLength(2);
    const [a, b] = st.realised;
    expect(a).toMatchObject({ bought: '2026-01-05', qty: 10 });
    // Price: 10 × (130 − 100) × 0.92 = 276; FX: 10 × 100 × (0.92 − 0.90) = 20; fees: −(5 × 0.90 + 4 × 0.92).
    expect(a.price).toBeCloseTo(276, 9);
    expect(a.fx).toBeCloseTo(20, 9);
    expect(a.fees).toBeCloseTo(-(4.5 + 3.68), 9);
    expect(b).toMatchObject({ bought: '2026-02-02', qty: 5 });
    expect(b.price).toBeCloseTo(5 * 10 * 0.92, 9);
    expect(b.fx).toBeCloseTo(5 * 120 * (0.92 - 0.95), 9);
    // The total is what the cash says: proceeds less the cost of the shares sold, both with fees, in euros.
    const proceeds = (15 * 130 - 6) * 0.92;
    const cost = (10 * 100 + 5) * 0.9 + (5 * 120 + 2.5) * 0.95;
    expect(a.total + b.total).toBeCloseTo(proceeds - cost, 9);
    expect(st.lots).toEqual([expect.objectContaining({ date: '2026-02-02', qty: 5, price: 120 })]);
    expect(st.fees).toBeCloseTo(5 * 0.9 + 5 * 0.95 + 6 * 0.92, 9);
    // The open lot at 140 and 0.93.
    const u = unrealised(st.lots[0], 1, 140, 0.93);
    expect(u.total).toBeCloseTo(5 * 140 * 0.93 - (5 * 120 + 2.5) * 0.95, 9);
  });

  it("puts trades before a split on today's share basis", () => {
    // Ten for one, the shares trading split from 10 June 2024.
    const split: SecInfo = { unit: 1, splits: [{ day: at('2024-06-10') / DAY, ratio: 10 }] };
    expect(splitFactor(split.splits, at('2024-06-07') / DAY)).toBe(10);
    expect(splitFactor(split.splits, at('2024-06-10') / DAY)).toBe(1);
    const st = replay([txn({ kind: 'buy', date: '2024-01-02', qty: 10, price: 500 }), txn({ kind: 'sell', date: '2024-07-01', qty: 50, price: 120 })], () => split, 'USD');
    expect(st.realised[0]).toMatchObject({ qty: 50, buyPrice: 50, sellPrice: 120 });
    expect(st.realised[0].total).toBeCloseTo(50 * 70, 9);
    expect(st.lots[0]).toMatchObject({ qty: 50, price: 50 });
  });

  it('says when a sale is larger than the holding, or a rate is missing or in another base', () => {
    const st = replay([txn({ kind: 'buy', date: '2026-01-05', qty: 5, price: 10 }), txn({ kind: 'sell', date: '2026-01-06', qty: 8, price: 11 }), txn({ kind: 'dividend', date: '2026-01-07', price: 3, base: 'EUR' })], () => plain, 'USD');
    expect(st.problems).toEqual(['The sale of S on 2026-01-06 is 3 more than the shares held then.', '1 transaction has no exchange rate into USD: amounts in USD that need it are unknown.']);
    expect(st.income[0].base).toBeNaN();
    // The oversold sale, for the screen to refuse it: its transaction and the excess.
    expect(st.oversold).toEqual([{ txn: expect.any(String), sec: 'S', date: '2026-01-06', qty: 3 }]);
  });
});

describe('returns', () => {
  it('works out the money-weighted return of dated flows', () => {
    expect(xirr([{ t: at('2025-01-01'), amount: -1000 }, { t: at('2026-01-01'), amount: 1100 }])).toBeCloseTo(0.1, 9);
    expect(xirr([{ t: at('2025-01-01'), amount: -1000 }, { t: at('2025-07-02'), amount: -1000 }, { t: at('2026-01-01'), amount: 2200 }])).toBeGreaterThan(0.1);
    expect(xirr([{ t: 0, amount: -1 }])).toBeNaN();
  });

  it("matches the worked example in Microsoft's documentation of Excel's XIRR (365-day years): 37.34%", () => {
    // https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d
    const flows = [['2008-01-01', -10_000], ['2008-03-01', 2_750], ['2008-10-30', 4_250], ['2009-02-15', 3_250], ['2009-04-01', 2_750]] as const;
    expect(xirr(flows.map(([d, amount]) => ({ t: at(d), amount })))).toBeCloseTo(0.373362535, 8);
  });

  it('values a holding in another currency at each close and its rate: the return is the change in base value', () => {
    // A euro stock in a dollar portfolio: 100, 110 and 99 euros at 1.10, 1.05 and 1.20 dollars a euro.
    const eur = performance({
      txns: [txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100, fx: 1.1 })],
      base: 'USD',
      info: () => plain,
      closes: () => [{ date: at('2026-03-02'), value: 100 }, { date: at('2026-03-03'), value: 110 }, { date: at('2026-03-04'), value: 99 }],
      fx: () => [{ date: at('2026-03-02'), value: 1.1 }, { date: at('2026-03-03'), value: 1.05 }, { date: at('2026-03-04'), value: 1.2 }],
      now: { at: at('2026-03-05'), price: () => 99, fx: () => 1.2 },
      cutoff: at('2026-03-05'),
    });
    expect(eur.points.map((p) => p.value)).toEqual([1100, 1155, 1188.0000000000002].map((v) => expect.closeTo(v, 9)));
    // 1,100 dollars became 1,188: 8%, whichever way the price and the rate moved in between.
    expect(eur.twr).toBeCloseTo(0.08, 12);
    expect(eur.mwrPeriod).toBeCloseTo(0.08, 9);
  });

  // A stock at 100, 110 and 121 on three closes: 10% a day. Buying more at 110 changes the money-weighted
  // return, not the time-weighted one.
  const closes = [{ date: at('2026-03-02'), value: 100 }, { date: at('2026-03-03'), value: 110 }, { date: at('2026-03-04'), value: 121 }];
  const input = (txns: Txn[], extra: Partial<PerfInput> = {}): PerfInput => ({
    txns,
    base: 'USD',
    info: () => plain,
    closes: () => closes,
    fx: () => undefined,
    now: { at: at('2026-03-05') + 15 * 3_600_000, price: () => 121, fx: () => 1 },
    cutoff: at('2026-03-05'),
    ...extra,
  });

  it('chains the time-weighted return over each close, buys at the start of their day', () => {
    const once = performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100 })]));
    expect(once.twr).toBeCloseTo(0.21, 12);
    expect(once.points.map((p) => p.value)).toEqual([1000, 1100, 1210]);
    // Money added at the day's opening price earns the day's return: the time-weighted return does not move.
    const opening = performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100 }), txn({ kind: 'buy', date: '2026-03-03', qty: 90, price: 100 })]));
    expect(opening.twr).toBeCloseTo(0.21, 12);
    // Bought at the close, the money is still counted from the start of the day: that day's return is diluted.
    const twice = performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100 }), txn({ kind: 'buy', date: '2026-03-03', qty: 90, price: 110 })]));
    expect(twice.twr).toBeCloseTo((1 + 100 / 10_900) * 1.1 - 1, 12);
    expect(twice.value).toBeCloseTo(100 * 121, 9);
    // More money at work for the second day only: the money-weighted return over the period is below 21%.
    expect(twice.mwrPeriod).toBeLessThan(0.21);
    expect(twice.mwrPeriod).toBeGreaterThan(0.1);
    expect(twice.twrAnnual).toBeNaN();
    expect(twice.mwr).toBeNaN();
  });

  it('counts fees, sales and dividends as the flows they are', () => {
    // Bought at 100 with a fee of 10 on 1,000: the first day loses the fee.
    const fee = performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100, fee: 10 })]));
    expect(fee.twr).toBeCloseTo((1000 / 1010) * 1.1 * 1.1 - 1, 12);
    // Sold everything at the second close, then a dividend: the return stops at the sale, plus the dividend.
    const sold = performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100 }), txn({ kind: 'sell', date: '2026-03-03', qty: 10, price: 110 }), txn({ kind: 'dividend', date: '2026-03-04', price: 11 })]));
    expect(sold.value).toBe(0);
    // The dividend after the sale belongs to the last period's capital: (1,100 + 11 − 1,000) / 1,000.
    expect(sold.twr).toBeCloseTo(0.111, 12);
    expect(sold.mwrPeriod).toBeGreaterThan(0.1);
  });

  it('leaves out a close a holding lacks, and needs every rate and a current price', () => {
    const gap = performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100 })], { fx: () => [{ date: at('2026-03-02'), value: 1 }, { date: at('2026-03-04'), value: 1 }] }));
    expect(gap.omittedDates).toBe(1);
    expect(gap.twr).toBeCloseTo(0.21, 12);
    expect(performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100, base: 'EUR' })])).problems).toEqual(["Returns need every transaction's rate into USD."]);
    expect(performance(input([txn({ kind: 'buy', date: '2026-03-02', qty: 10, price: 100 })], { now: { at: at('2026-03-05'), price: () => NaN, fx: () => 1 } })).twr).toBeNaN();
  });
});
