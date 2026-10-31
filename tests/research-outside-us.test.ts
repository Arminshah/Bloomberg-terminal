import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { priceInCurrency } from '../src/data/fundamentals';
import { analystSymbol, estimateInCurrency, listedOutsideUs, requestAnalysts, type Estimate } from '../src/data/live/analysts';

// A made-up answer in the layout of Yahoo's quoteSummary research modules for a euro listing; nothing leaves the test.
const trend = (period: string, endDate: string, eps: number, rev: number) => ({
  period,
  endDate,
  earningsEstimate: { avg: { raw: eps }, low: { raw: eps * 0.9 }, high: { raw: eps * 1.1 }, numberOfAnalysts: { raw: 20 }, earningsCurrency: 'EUR' },
  revenueEstimate: { avg: { raw: rev }, low: { raw: rev * 0.95 }, high: { raw: rev * 1.05 }, numberOfAnalysts: { raw: 20 }, revenueCurrency: 'EUR' },
});
const answer = {
  quoteSummary: {
    error: null,
    result: [{
      price: { symbol: 'ASML.AS', currency: 'EUR' },
      financialData: { financialCurrency: 'EUR', targetMeanPrice: { raw: 1500 }, targetMedianPrice: { raw: 1480 }, targetHighPrice: { raw: 1900 }, targetLowPrice: { raw: 1100 }, recommendationKey: 'buy' },
      recommendationTrend: { trend: [{ period: '0m', strongBuy: 8, buy: 18, hold: 6, sell: 1, strongSell: 0 }] },
      upgradeDowngradeHistory: { history: [] },
      earningsTrend: { trend: [trend('0y', '2026-12-31', 28, 34e9), trend('+1y', '2027-12-31', 33, 39e9)] },
    }],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('analyst research for stocks listed outside the US', () => {
  it("asks Yahoo alone, under the listing's own symbol, never the US-only sources", async () => {
    const yahoo = vi.fn(async (_path: string) => ({ status: 200, data: structuredClone(answer) }));
    const fmp = vi.fn(async () => ({ status: 200, text: '[]' }));
    vi.stubGlobal('window', { arminDesktop: { yahoo, analysts: fmp, settings: {} } });
    const asml = engine.get('ASML NA Equity')!;
    expect(analystSymbol(asml)).toBe('ASML.AS');
    expect(listedOutsideUs('ASML.AS')).toBe(true);
    const parts = await requestAnalysts(asml, ['estimates', 'consensus', 'summary'], 2000);
    expect(fmp).not.toHaveBeenCalled();
    expect(yahoo.mock.calls[0][0]).toContain('/v10/finance/quoteSummary/ASML.AS?');
    expect(parts.estimates).toMatchObject({ state: 'ok', source: 'Yahoo Finance', currency: 'EUR' });
    expect((parts.estimates!.data as Estimate[]).map((e) => [e.date, e.epsAvg, e.epsCurrency])).toEqual([['2026-12-31', 28, 'EUR'], ['2027-12-31', 33, 'EUR']]);
    expect(parts.consensus).toMatchObject({ state: 'ok', currency: 'EUR' });
    // Yahoo gives no history of the targets' averages: said, not filled from another source.
    expect(parts.summary).toMatchObject({ state: 'error', source: 'Yahoo Finance' });
  });

  it('keeps US listings on their own sources and gives nothing outside the desktop app', () => {
    vi.stubGlobal('window', { arminDesktop: { yahoo: vi.fn(), analysts: vi.fn(), settings: {} } });
    expect(analystSymbol(engine.get('AAPL US Equity'))).toBe('AAPL');
    expect(listedOutsideUs('AAPL')).toBe(false);
    vi.unstubAllGlobals();
    expect(analystSymbol(engine.get('ULVR LN Equity'))).toBeNull();
  });

  it('gives nothing when Yahoo research is switched off on PROVIDERS', () => {
    vi.stubGlobal('window', { arminDesktop: { yahoo: vi.fn(), analysts: vi.fn(), settings: { YAHOO_RESEARCH_ENABLED: false } } });
    expect(analystSymbol(engine.get('MC FP Equity'))).toBeNull();
  });
});

describe('estimates compared with the statements', () => {
  const e = (currency?: string, epsCurrency?: string): Estimate => ({ date: '2026-12-31', revenueAvg: 1, revenueLow: 1, revenueHigh: 1, epsAvg: 2, epsLow: 2, epsHigh: 2, netIncomeAvg: NaN, analystsRevenue: 1, analystsEps: 1, currency, epsCurrency });

  it("are used only in the statements' currency; a listing outside the US must state it", () => {
    expect(estimateInCurrency(e('EUR'), 'EUR', true)).not.toBeNull();
    expect(estimateInCurrency(e('GBP'), 'EUR', true)).toBeNull();
    expect(estimateInCurrency(e(), 'EUR', true)).toBeNull();
    // A US listing's sources give dollars without saying so.
    expect(estimateInCurrency(e(), 'USD', false)).not.toBeNull();
  });

  it('leave out only the EPS when it alone is in another currency (an ADR)', () => {
    const adr = estimateInCurrency(e('TWD', 'USD'), 'TWD', false)!;
    expect(adr.revenueAvg).toBe(1);
    expect(adr.epsAvg).toBeNaN();
  });
});

describe("a quoted price in an estimate's currency", () => {
  it('turns pence into pounds, and converts another currency at the day\'s rate', () => {
    const ulvr = engine.get('ULVR LN Equity')!;
    expect(priceInCurrency(ulvr, 4900, 'GBP')).toBeCloseTo(49, 10);
    expect(priceInCurrency(ulvr, 4900, undefined)).toBeCloseTo(49, 10);
    const eur = priceInCurrency(ulvr, 4900, 'EUR');
    expect(eur).toBeCloseTo((49 * engine.usdValue('GBP')) / engine.usdValue('EUR'), 10);
    expect(eur).not.toBeCloseTo(49, 3);
    expect(priceInCurrency(engine.get('AAPL US Equity')!, 250, 'USD')).toBe(250);
  });
});
