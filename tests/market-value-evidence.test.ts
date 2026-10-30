import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketValueConflict } from '../src/components/MarketValue';
import { dayNum } from '../src/data/calendar';
import { engine } from '../src/data/market';
import { shareCountConflict } from '../src/data/live/share-check';
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
});
