import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { fillSummary, nasdaqSummaryPatch } from '../src/data/live/nasdaq-company';
import { applyProfileShares, profileShareSelection } from '../src/data/live/yfund';
import { observedShareBasis, setObservedShares } from '../src/data/live/share-basis';
import { quoteAuditState } from '../src/data/live/quote-audit';

// Structural examples, not live source observations.
const def = (id = 'AAPL US Equity') => structuredClone(engine.get(id)!);
const summary = (row: Record<string, unknown>) => ({ quoteSummary: { result: [row] } });
const NOW = Date.UTC(2026, 9, 30, 8);

describe('market-cap share counts use a current matched price', () => {
  it('retains reported shares when a current cap has only a previous close', () => {
    const s = def();
    const input = summary({ summaryDetail: { marketCap: 110e9, previousClose: 100 }, defaultKeyStatistics: { sharesOutstanding: 1e9 } });
    const selected = profileShareSelection(s, input, 'Yahoo Finance', NOW);
    applyProfileShares(s, selected);
    expect(s.eq!.shares).toBe(1000);
    // At a current price of 110 the prior-close denominator would have inflated cap to 121 billion.
    expect(110 * s.eq!.shares * 1e6).toBe(110e9);
    expect(observedShareBasis(s)).toEqual({ shares: 1000, source: 'Yahoo Finance company summary', method: 'reported', observedAt: NOW });
    expect(selected.implied).toBeUndefined();
  });

  it('leaves the existing count alone when neither a current pair nor a reported count exists', () => {
    const s = def();
    s.eq!.shares = 1000;
    applyProfileShares(s, profileShareSelection(s, summary({ summaryDetail: { marketCap: 110e9, previousClose: 100 } }), 'Yahoo Finance', NOW));
    expect(s.eq!.shares).toBe(1000);
    expect(observedShareBasis(s)).toBeUndefined();
  });

  it('freezes the Yahoo pair before missing fields are filled by another provider', () => {
    const s = def();
    const raw = summary({ financialData: { currentPrice: 110 }, defaultKeyStatistics: { sharesOutstanding: 1e9 } });
    const selected = profileShareSelection(s, raw, 'Yahoo Finance', NOW);
    const fallback = fillSummary(raw, nasdaqSummaryPatch({ summary: { marketCap: 220e9, target1y: NaN, annualDividend: NaN, exDividend: NaN, payDate: NaN, yieldPct: NaN, avgVolume: NaN } }));
    expect(fallback.summary.quoteSummary.result[0].summaryDetail.marketCap).toBe(220e9);
    applyProfileShares(s, selected);
    expect(s.eq!.shares).toBe(1000);
    expect(selected.implied).toBeUndefined();
  });

  it('uses a same-response current pair across receipt and minor-currency conventions', () => {
    // A synthetic US receipt: five ordinary shares per receipt, without a network lookup.
    const adr = { ...def(), id: 'TESTADR US Equity', ticker: 'TESTADR US', yahoo: 'TESTADR' };
    adr.eq!.shares = 5000;
    const selected = profileShareSelection(adr, summary({ summaryDetail: { marketCap: { raw: 110e9 }, previousClose: 100 }, financialData: { currentPrice: { raw: 110 } }, defaultKeyStatistics: { sharesOutstanding: 5e9 } }), 'Yahoo Finance', NOW);
    expect(selected.reported?.shares).toBe(5000);
    expect(selected.implied?.shares).toBe(1000);
    applyProfileShares(adr, selected);
    expect(adr.eq!.shares).toBe(1000);
    expect(observedShareBasis(adr)?.sourceTime).toBeUndefined();
    const pence = def();
    pence.minor = true;
    pence.ccy = 'GBp';
    pence.eq!.shares = 1000;
    applyProfileShares(pence, profileShareSelection(pence, summary({ price: { marketCap: 20e9, regularMarketPrice: 2000, regularMarketTime: NOW / 1000, currency: 'GBP' } }), 'Yahoo Finance', NOW));
    expect(pence.eq!.shares).toBe(1000);
    expect(observedShareBasis(pence)).toMatchObject({ marketCap: 20e9, price: 2000, currency: 'GBP', sourceTime: NOW });
  });

  it('uses current price across modules of one answer and rejects malformed current values', () => {
    const s = def();
    const pair = profileShareSelection(s, summary({ price: { marketCap: 110e9 }, financialData: { currentPrice: 110 } }), 'Yahoo Finance', NOW);
    expect(pair.implied).toMatchObject({ shares: 1000, marketCap: 110e9, price: 110 });
    for (const currentPrice of [null, {}, 0, -1, Infinity, '110']) {
      expect(profileShareSelection(s, summary({ summaryDetail: { marketCap: 110e9, previousClose: 100 }, financialData: { currentPrice } }), 'Yahoo Finance', NOW).implied).toBeUndefined();
    }
  });

  it('preserves whole-company ClassB share precedence and Finnhub reported counts', () => {
    const b = def('BRK/B US Equity');
    const before = b.eq!.shares;
    applyProfileShares(b, profileShareSelection(b, summary({ summaryDetail: { marketCap: 100e9 }, financialData: { currentPrice: 100 }, defaultKeyStatistics: { sharesOutstanding: 1e6 } }), 'Yahoo Finance', NOW));
    expect(b.eq!.shares).toBe(before);
    const f = def();
    applyProfileShares(f, profileShareSelection(f, summary({ summaryDetail: { marketCap: 110e9 }, financialData: { currentPrice: 100 }, defaultKeyStatistics: { sharesOutstanding: 1e9 } }), 'Finnhub', NOW));
    expect(f.eq!.shares).toBe(1000);
    expect(observedShareBasis(f)?.source).toBe('Finnhub company summary');
  });

  it('captures the actual displayed inputs and retains the original observation clock on cache reapplication', () => {
    const s = def();
    const selected = profileShareSelection(s, summary({ summaryDetail: { marketCap: 110e9 }, financialData: { currentPrice: 110 } }), 'Yahoo Finance', NOW);
    applyProfileShares(s, selected);
    applyProfileShares(s, selected);
    const q = { ...engine.quote(s.id)!, last: 111, open: 109, volume: 12345678, provider: 'Yahoo Finance', volumeSource: 'Nasdaq', dayProvider: 'Yahoo Finance', time: NOW - 1000, fetched: NOW + 1000 };
    const audit = quoteAuditState(s, q, 111e9, NOW + 2000);
    expect(audit).toMatchObject({ schema: 1, domain: 'quote', displayed: { last: 111, open: 109, volume: 12345678 }, quote: { time: NOW - 1000, fetched: NOW + 1000, volumeSource: 'Nasdaq' }, marketCap: { value: 111e9, shares: 1e9, price: 111, priceTime: NOW - 1000, shareBasis: { observedAt: NOW, sourceTime: null, currency: null, marketCap: 110e9, price: 110 } } });
    s.eq!.shares = 2000;
    expect(quoteAuditState(s, q, 222e9, NOW + 3000).marketCap?.shareBasis).toBeNull();
    setObservedShares(s, { shares: 1000, source: 'Yahoo Finance reported-share series', method: 'reported', observedAt: NOW - 86400_000 });
    expect(quoteAuditState(s, q, 111e9, NOW + 4000).marketCap?.shareBasis).toMatchObject({ method: 'reported', observedAt: NOW - 86400_000, sourceTime: null });
  });
});
