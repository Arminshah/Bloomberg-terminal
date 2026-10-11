import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { cancelOrder, netAssetValue, orders, positionOf, submitOrder, usdPerPrice, type Order } from '../src/terminal/oms';
import { portfolio } from '../src/terminal/userdata';

const order = (r: Order | string): Order => {
  if (typeof r === 'string') throw new Error(r);
  return r;
};

describe('EMSX paper trading', () => {
  it('fills a market buy at the offer and books it into PORT', () => {
    const cash0 = portfolio.get().cash;
    const pos0 = positionOf('AAPL US Equity');
    const ask = engine.quote('AAPL US Equity')!.ask;
    const o = order(submitOrder({ sec: 'AAPL US Equity', side: 'BUY', qty: 100, type: 'MKT', tif: 'DAY', broker: 'DMA' }));
    expect(o.status).toBe('FILLED');
    expect(o.avgPx).toBeCloseTo(ask, 8);
    expect(positionOf('AAPL US Equity')).toBe(pos0 + 100);
    expect(portfolio.get().cash).toBeCloseTo(cash0 - 100 * ask - o.commission, 6);
    expect(o.commission).toBeGreaterThan(0);
  });

  it('realises P&L when a position is reduced', () => {
    const before = portfolio.get().realised ?? 0;
    const p = portfolio.get().positions.find((x) => x.id === 'AAPL US Equity')!;
    const bid = engine.quote('AAPL US Equity')!.bid;
    const o = order(submitOrder({ sec: 'AAPL US Equity', side: 'SELL', qty: 100, type: 'MKT', tif: 'DAY', broker: 'DMA' }));
    expect(o.status).toBe('FILLED');
    expect(portfolio.get().realised).toBeCloseTo(before + 100 * (bid - p.cost) - o.commission, 6);
  });

  it('margins futures: only fees and realised P&L move cash', () => {
    const cash0 = portfolio.get().cash;
    const o = order(submitOrder({ sec: 'ES1 Index', side: 'BUY', qty: 2, type: 'MKT', tif: 'DAY', broker: 'DMA' }));
    expect(o.status).toBe('FILLED');
    expect(portfolio.get().cash).toBeCloseTo(cash0 - o.commission, 6);
    expect(usdPerPrice(engine.get('ES1 Index')!)).toBe(50);
    const nav = netAssetValue();
    expect(Number.isFinite(nav)).toBe(true);
  });

  it('rests a limit order away from the market until cancelled', () => {
    const o = order(submitOrder({ sec: 'MSFT US Equity', side: 'BUY', qty: 10, type: 'LMT', limit: 1, tif: 'GTC', broker: 'DMA' }));
    expect(o.status).toBe('WORKING');
    expect(cancelOrder(o.id)).toBe(true);
    expect(orders.get().list.find((x) => x.id === o.id)!.status).toBe('CANCELLED');
    expect(cancelOrder(o.id)).toBe(false);
  });

  it('rejects bad tickets and excessive leverage', () => {
    expect(submitOrder({ sec: 'EURUSD Curncy', side: 'BUY', qty: 1, type: 'MKT', tif: 'DAY', broker: 'DMA' })).toMatch(/cannot be traded/);
    expect(submitOrder({ sec: 'AAPL US Equity', side: 'BUY', qty: 1.5, type: 'MKT', tif: 'DAY', broker: 'DMA' })).toMatch(/multiple/);
    expect(submitOrder({ sec: 'AAPL US Equity', side: 'BUY', qty: 10_000_000, type: 'MKT', tif: 'DAY', broker: 'DMA' })).toMatch(/2x NAV/);
  });
});
