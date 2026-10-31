import { describe, expect, it } from 'vitest';
import { books, nasdaqTicker, parseBook, withBook } from '../src/data/live/nasdaq-book';
import type { Quote } from '../src/data/types';

// Nasdaq's quote page (APLD during the session, 21 October 2026).
const INFO = JSON.stringify({ data: { primaryData: { lastSalePrice: '$20.21', bidPrice: '$20.20', askPrice: '$20.22', bidSize: '150', askSize: '170', volume: '4,188,269.136475', isRealTime: true } } });

describe("Nasdaq's real-time bid and ask for the watchlist", () => {
  it('reads the bid, ask, sizes and volume; a crossed or empty book is not a quote', () => {
    expect(parseBook(INFO, 1)).toEqual({ bid: 20.2, ask: 20.22, bidSize: 150, askSize: 170, volume: 4_188_269, at: 1 });
    expect(parseBook(JSON.stringify({ data: { primaryData: { bidPrice: '$20.30', askPrice: '$20.20' } } }), 1)).toBeNull();
    expect(parseBook(JSON.stringify({ data: { primaryData: { bidPrice: 'N/A', askPrice: 'N/A' } } }), 1)).toBeNull();
    expect(nasdaqTicker('APLD US Equity')).toBe('APLD');
    expect(nasdaqTicker('BRK/B US Equity')).toBe('BRK.B');
    expect(nasdaqTicker('EURUSD Curncy')).toBeNull();
  });

  it("fills only what the price source leaves out, and says where the bid and ask came from", () => {
    books.set((s) => ({ v: s.v + 1, by: { ...s.by, APLD: parseBook(INFO, Date.now())! } }));
    const q = { id: 'APLD US Equity', last: 20.21, bid: NaN, ask: NaN, volume: 0 } as unknown as Quote;
    const filled = withBook('APLD US Equity', q)!;
    expect(filled).toMatchObject({ bid: 20.2, ask: 20.22, volume: 4_188_269 });
    expect(filled.bboSource).toContain('Nasdaq real-time quote');
    const own = { ...q, bid: 20.19, ask: 20.23, volume: 5e6 } as Quote;
    expect(withBook('APLD US Equity', own)).toEqual(own);
    // A stale or one-venue quote ten times wider than Nasdaq's gives way to it.
    const wide = { ...q, bid: 19.5, ask: 21, volume: 5e6 } as Quote;
    expect(withBook('APLD US Equity', wide)).toMatchObject({ bid: 20.2, ask: 20.22, volume: 5e6 });
  });
});
