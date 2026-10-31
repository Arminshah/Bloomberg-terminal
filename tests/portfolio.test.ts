import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { FUNCTIONS } from '../src/terminal/registry';
import { grossExposure, navValue, netAssetValue, usdPerPrice } from '../src/terminal/portfolio';
import { portfolio } from '../src/terminal/userdata';

// Paper trading is switched off: the portfolio holds only what the user enters, and nothing can trade.
describe('portfolio without paper trading', () => {
  it('starts empty: no sample holdings and no simulated cash', () => {
    expect(portfolio.get().positions).toEqual([]);
    expect(portfolio.get().cash).toBe(0);
    expect(netAssetValue()).toBe(0);
  });

  it('values what the user enters: securities at market, futures at unrealised P&L', () => {
    portfolio.set((s) => ({ ...s, cash: 10_000, positions: [{ id: 'AAPL US Equity', qty: 10, cost: 200 }, { id: 'ES1 Index', qty: 1, cost: 7000 }] }));
    const aapl = engine.quote('AAPL US Equity')!.last;
    const es = engine.quote('ES1 Index')!.last;
    expect(usdPerPrice(engine.get('ES1 Index')!)).toBe(50);
    expect(navValue(engine.get('ES1 Index')!, 1, es, 7000)).toBeCloseTo((es - 7000) * 50, 6);
    expect(netAssetValue()).toBeCloseTo(10_000 + 10 * aapl + (es - 7000) * 50, 6);
    expect(grossExposure()).toBeCloseTo(10 * aapl + es * 50, 6);
    portfolio.set((s) => ({ ...s, cash: 0, positions: [] }));
  });

  it('has no order entry or execution screen', () => {
    const codes = FUNCTIONS.flatMap((f) => [f.code, ...(f.aliases ?? [])]);
    for (const c of ['EMSX', 'EMS', 'TRADE', 'ORDER']) expect(codes).not.toContain(c);
  });
});
