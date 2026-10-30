import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketValueConflict } from '../src/components/MarketValue';
import { dayNum } from '../src/data/calendar';
import { engine } from '../src/data/market';
import { shareCountConflict } from '../src/data/live/share-check';
import { observedShareBasis, setObservedShares } from '../src/data/live/share-basis';
import type { CompanyFacts } from '../src/data/live/sec';

const now = Date.parse('2026-10-29T20:00:00Z');
const id = 'LLY US Equity';
const day = dayNum(now);
const facts = { cik: 59478, name: 'Synthetic issuer', facts: { 'dei:EntityCommonStockSharesOutstanding': { shares: [
  { end: '2026-10-26', filed: '2026-10-29', form: '10-Q', val: 1500, accn: 'one' },
] } } } as unknown as CompanyFacts;
const candidates = (html: string) => JSON.parse(/data-source-candidates="([^"]+)"/.exec(html)![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

afterEach(() => vi.restoreAllMocks());

describe('market-value conflict evidence', () => {
  it('retains the conflict while exposing numeric candidates in the measure actually displayed', () => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, eq: { ...engine.get(id)!.eq!, shares: 0.0012 } };
    const evidence = shareCountConflict(sec.eq.shares, facts, now)!;
    const cap = renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence }));
    expect(cap).toContain('Sources disagree');
    expect(cap).toContain('data-source-conflict="shares-outstanding"');
    expect(candidates(cap)).toMatchObject([
      { value: 126_000, shares: 1200, currency: 'USD', measure: 'market-cap', price: 105 },
      { value: 157_500, shares: 1500, currency: 'USD', measure: 'market-cap', sharesAsOf: '2026-10-26', filed: '2026-10-29', sourceUrl: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000059478.json' },
    ]);
    const shares = candidates(renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence, measure: 'shares' })));
    expect(shares.map((row: { value: number }) => row.value)).toEqual([1200, 1500]);
    expect(shares.every((row: { currency?: string }) => row.currency == null)).toBe(true);
  });

  it('normalizes minor-unit prices and the requested valuation currency without changing raw share counts', () => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, ccy: 'GBp', minor: true };
    vi.spyOn(engine, 'usdValue').mockImplementation((ccy) => ccy === 'GBP' ? 1.25 : 1);
    const evidence = shareCountConflict(0.0012, facts, now)!;
    const values = candidates(renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence, currency: 'USD' })));
    expect(values).toMatchObject([{ value: 1575, shares: 1200, price: 1.05, currency: 'USD' }, { value: 1968.75, shares: 1500, price: 1.05, currency: 'USD' }]);
  });

  it('excludes future-dated disclosures while retaining an eligible earlier cover observation', () => {
    const future = structuredClone(facts);
    future.facts['dei:EntityCommonStockSharesOutstanding'].shares.push({ end: '2026-11-01', filed: '2026-11-02', form: '10-Q', val: 1700, accn: 'future' } as never);
    expect(shareCountConflict(0.0012, future, now)?.cover).toBe(1500);
  });

  it('labels an observed current-market-cap pair with its actual provider and original clocks', () => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, eq: { ...engine.get(id)!.eq! } };
    setObservedShares(sec, { shares: 0.0012, source: 'Yahoo Finance quote', method: 'current-market-cap-pair', observedAt: now - 1000, sourceTime: now - 5000, marketCap: 120000, price: 100, currency: 'USD' });
    const evidence = shareCountConflict(sec.eq.shares, facts, now, observedShareBasis(sec))!;
    const html = renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence }));
    expect(evidence.message).toContain("Yahoo Finance quote's market value counts 1,200 shares");
    expect(candidates(html)[0]).toMatchObject({ source: 'Yahoo Finance quote market-implied shares', method: 'current-market-cap-pair', shares: 1200, value: 126000, observedAt: now - 1000, sourceTime: now - 5000, sourceMarketCap: 120000, sourcePriceQuoted: 100, sourceCurrency: 'USD' });
  });

  it.each(['Yahoo Finance reported-share series', 'Nasdaq holdings', 'Finnhub company summary'])('retains the reported provenance of %s without calling it market-implied', (source) => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, eq: { ...engine.get(id)!.eq! } };
    setObservedShares(sec, { shares: 0.0012, source, method: 'reported', observedAt: now - 86400_000 });
    const evidence = shareCountConflict(sec.eq.shares, facts, now, observedShareBasis(sec))!;
    const html = renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence }));
    expect(evidence.message).toContain(`${source} reports 1,200 shares`);
    expect(evidence.message).not.toContain('market value counts');
    const first = candidates(html)[0];
    expect(first).toMatchObject({ source: `${source} reported shares`, method: 'reported', observedAt: now - 86400_000, sourceTime: null, shares: 1200, value: 126000 });
    expect(first).not.toHaveProperty('sourceMarketCap');
    expect(first).not.toHaveProperty('sourcePriceQuoted');
  });

  it('keeps an untracked count explicit instead of assigning it a provider', () => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, eq: { ...engine.get(id)!.eq!, shares: 0.0012 } };
    const evidence = shareCountConflict(sec.eq.shares, facts, now, observedShareBasis(sec))!;
    const html = renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence }));
    expect(evidence.message).toContain('The current app count is 1,200 shares (source unknown)');
    expect(evidence.message).not.toContain('Yahoo');
    expect(candidates(html)[0]).toMatchObject({ source: 'Current app share count (source unknown)', method: 'unknown', observedAt: null, sourceTime: null, shares: 1200, value: 126000 });
  });

  it('does not reuse an earlier source after the actual count has been replaced', () => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, eq: { ...engine.get(id)!.eq! } };
    const previous = { shares: 0.0012, source: 'Nasdaq holdings', method: 'reported' as const, observedAt: now - 1000 };
    setObservedShares(sec, previous);
    sec.eq.shares = 0.0013;
    expect(observedShareBasis(sec)).toBeUndefined();
    const evidence = shareCountConflict(sec.eq.shares, facts, now, previous)!;
    const html = renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence }));
    expect(evidence.current).toBe(1300);
    expect(evidence.basis).toBeUndefined();
    expect(candidates(html)[0]).toMatchObject({ source: 'Current app share count (source unknown)', method: 'unknown', shares: 1300, value: 136500 });
  });

  it.each([
    { observedAt: now + 1000 },
    { observedAt: NaN },
    { observedAt: Infinity },
    { observedAt: now - 1000, sourceTime: now + 1000 },
    { observedAt: now - 1000, sourceTime: NaN },
  ])('does not attribute a count to an observation unavailable at the explicit cutoff: %o', (clocks) => {
    engine.setExternalDaily(id, [{ day, o: 100, h: 110, l: 95, c: 105, v: 1000 }]);
    const sec = { ...engine.get(id)!, eq: { ...engine.get(id)!.eq! } };
    setObservedShares(sec, { shares: 0.0012, source: 'Yahoo Finance quote', method: 'current-market-cap-pair', ...clocks });
    const evidence = shareCountConflict(sec.eq.shares, facts, now, observedShareBasis(sec))!;
    const html = renderToStaticMarkup(createElement(MarketValueConflict, { sec, evidence }));
    expect(evidence).toMatchObject({ current: 1200, cover: 1500 });
    expect(evidence.basis).toBeUndefined();
    expect(evidence.message).toContain('source unknown');
    expect(candidates(html)[0]).toMatchObject({ source: 'Current app share count (source unknown)', method: 'unknown', shares: 1200, value: 126000, observedAt: null, sourceTime: null });
  });
});
