import { describe, expect, it } from 'vitest';
import { MarketEngine } from '../src/data/engine';
import { engine } from '../src/data/market';
import { baseFxLevels, portfolioSnapshot } from '../src/data/portfolio-history';
import { adjustPosition, baseFx, basePerPrice, pnlSplit } from '../src/terminal/portfolio';
import type { SecurityDef } from '../src/data/types';

const DAY = 86_400_000;
const CUTOFF = Date.UTC(2026, 9, 16);

describe('portfolio base currency', () => {
  it('averages the entry FX rate by each lot\'s local cost, and forgets it across bases', () => {
    const first = adjustPosition(undefined, 'A', 10, 100, { fx: 0.9, base: 'EUR' })!;
    expect(first).toEqual({ id: 'A', qty: 10, cost: 100, entryFx: 0.9, entryBase: 'EUR' });
    // 1,000 local at 0.90 and 3,000 local at 0.86: (900 + 2,580) / 4,000 = 0.87.
    const added = adjustPosition(first, 'A', 20, 150, { fx: 0.86, base: 'EUR' })!;
    expect(added.entryFx).toBeCloseTo(0.87, 12);
    expect(added.cost).toBeCloseTo(133.3333333, 6);
    // A reduction keeps cost and rate; a reversal starts again from the new lot.
    expect(adjustPosition(added, 'A', -5, 160, { fx: 0.8, base: 'EUR' })).toMatchObject({ qty: 25, entryFx: added.entryFx });
    expect(adjustPosition(added, 'A', -40, 160, { fx: 0.8, base: 'EUR' })).toEqual({ id: 'A', qty: -10, cost: 160, entryFx: 0.8, entryBase: 'EUR' });
    // A lot in another base, or an older lot without a rate, leaves the average unknown.
    expect(adjustPosition(first, 'A', 10, 100, { fx: 0.78, base: 'GBP' })).not.toHaveProperty('entryFx');
    expect(adjustPosition({ id: 'A', qty: 10, cost: 100 }, 'A', 10, 100, { fx: 0.9, base: 'EUR' })).not.toHaveProperty('entryFx');
  });

  it('splits a holding\'s P&L into the local price move at today\'s FX and the FX move on the entry value', () => {
    const usd = Object.values(engine.securities).find((d) => d.cls === 'equity' && d.ccy === 'USD')!;
    const rate = baseFx('USD', 'EUR');
    if (!(rate > 0)) return;
    const p = { id: usd.id, qty: 10, cost: 100, entryFx: rate + 0.05, entryBase: 'EUR' };
    const split = pnlSplit(usd, p, 110, 'EUR');
    // Value now 10 x 110 x rate; at entry 10 x 100 x (rate + 0.05).
    expect(split.price).toBeCloseTo(10 * 10 * rate, 9);
    expect(split.fx).toBeCloseTo(10 * 100 * (rate - (rate + 0.05)), 9);
    expect(split.total).toBeCloseTo(10 * 110 * rate - 10 * 100 * (rate + 0.05), 9);
    expect(basePerPrice(usd, 'EUR')).toBeCloseTo(rate, 12);
    // Without a rate in this base the FX part is unknown, not zero.
    expect(pnlSplit(usd, { ...p, entryBase: 'GBP' }, 110, 'EUR').fx).toBeNaN();
  });

  it('values history and risk in euros: a US stock through 1 / EURUSD, a Brussels stock as is', () => {
    const market = new MarketEngine(() => CUTOFF);
    const usd = market.defs.find((d) => d.cls === 'equity' && d.ccy === 'USD')!;
    const eur: SecurityDef = { ...market.defs.find((d) => d.cls === 'equity' && d.ccy === 'EUR')! };
    const days = Array.from({ length: 30 }, (_, i) => CUTOFF / DAY - 30 + i);
    const bars = (f: (i: number) => number) => days.map((day, i) => ({ day, o: f(i), h: f(i), l: f(i), c: f(i), v: 1 }));
    market.setExternalDaily(usd.id, bars((i) => 100 + i), { provider: 'Test' });
    market.setExternalDaily(eur.id, bars((i) => 50 + i), { provider: 'Test' });
    market.setExternalDaily('CCY:EUR', bars((i) => 1.1 + i / 1000), { provider: 'Test' });
    market.setExternalDaily('CCY:GBP', bars((i) => 1.3 + i / 1000), { provider: 'Test' });
    market.setExternalQuote('CCY:EUR', { last: 1.25, time: CUTOFF - 1000, fetched: CUTOFF, marketOpen: true, timing: 'realtime' });

    const levels = baseFxLevels('USD', 'EUR', CUTOFF, market)!;
    expect(levels[0].value).toBeCloseTo(1 / 1.1, 12);
    // A cross is the currency's USD value over the base's, date by date.
    const usdOf = (c: string) => new Map(baseFxLevels(c, 'USD', CUTOFF, market)!.map((r) => [r.date, r.value]));
    const gbp = usdOf('GBP');
    const eurUsd = usdOf('EUR');
    const cross = baseFxLevels('GBP', 'EUR', CUTOFF, market)!;
    expect(cross.length).toBeGreaterThan(0);
    for (const r of cross) expect(r.value).toBeCloseTo(gbp.get(r.date)! / eurUsd.get(r.date)!, 12);
    expect(baseFxLevels('EUR', 'EUR', CUTOFF, market)).toBeUndefined();

    const snap = portfolioSnapshot([{ id: usd.id, qty: 10, cost: 90 }, { id: eur.id, qty: 4, cost: 40 }], 1000, 20, market, 'EUR');
    if (!snap.ok) throw new Error(snap.error);
    const [u, e] = snap.value.positions;
    expect(u.fx).toBeCloseTo(1 / 1.25, 12);
    expect(u.fxId).toBe('USDEUR');
    expect(u.fxHistory![0].value).toBeCloseTo(1 / 1.1, 12);
    expect(e.fx).toBe(1);
    expect(e.fxHistory).toBeUndefined();
    expect(e.fxMark.state).toBe('IDENTITY');
    // The replayed NAV on the first shared date: euro cash, the US stock at 1 / EURUSD, the Brussels stock as is.
    const history = snap.value.history;
    if (!history.ok) throw new Error(history.error);
    const first = history.value.dates[0];
    const price = (id: string) => new Map(market.daily(id).t.subarray(0, market.daily(id).length).reduce<[number, number][]>((a, t, j) => [...a, [t, market.daily(id).c[j]]], []));
    expect(history.value.nav[0]).toBeCloseTo(1000 + 10 * price(usd.id).get(first)! / eurUsd.get(first)! + 4 * price(eur.id).get(first)!, 9);
  });
});
