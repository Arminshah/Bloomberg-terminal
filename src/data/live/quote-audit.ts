import type { Quote, SecurityDef } from '../types';
import { observedShareBasis } from './share-basis';
import { yahooSymbolFor } from './yahoo';

/** Exact inputs to the displayed quote and price × shares; no inferred publisher timestamps. */
export function quoteAuditState(def: SecurityDef, q: Quote, displayedMarketCap: number | undefined, capturedAt: number) {
  const basis = observedShareBasis(def);
  return {
    schema: 1, domain: 'quote', security: def.id, ticker: yahooSymbolFor(def) ?? def.yahoo ?? def.ticker.split(' ')[0], capturedAt,
    displayed: { last: q.last, open: q.open, high: q.high, low: q.low, prevClose: q.prevClose, volume: q.volume },
    quote: { provider: q.provider ?? null, time: q.time, fetched: q.fetched ?? null, dayProvider: q.dayProvider ?? null, volumeSource: q.volumeSource ?? null, src: q.src, session: q.session ?? null, dayOnly: !!q.dayOnly, tz: q.tz ?? null },
    marketCap: def.eq ? {
      value: displayedMarketCap ?? null,
      currency: def.ccy === 'GBp' ? 'GBP' : def.ccy,
      price: q.last / (def.minor ? 100 : 1), priceQuoted: q.last, priceTime: q.time, priceFetched: q.fetched ?? null, priceProvider: q.provider ?? null,
      shares: def.eq.shares * 1e6,
      shareBasis: basis ? { ...basis, shares: basis.shares * 1e6, sourceTime: basis.sourceTime ?? null, currency: basis.currency ?? null } : null,
      equityScope: basis?.method === 'current-market-cap-pair' ? 'Provider market-cap equivalent shares' : basis?.method === 'reported' ? 'Reported count; class and receipt equivalence unverified' : 'Unknown share basis',
    } : null,
  };
}
