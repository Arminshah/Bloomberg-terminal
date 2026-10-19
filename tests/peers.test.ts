import { describe, expect, it } from 'vitest';
import * as finnhubMain from '../electron/finnhub.cjs';
import { ALLOWED } from '../electron/yahoo-scope.cjs';
import { parsePeers } from '../src/data/live/finnhub';
import { choosePeers, type Candidate, type Profile } from '../src/data/live/peers';

const P = (industry: string, sector: string, marketCap: number, name = industry): Profile => ({ name, industry, sector, marketCap });
const C = (symbol: string, c: Partial<Candidate> = {}): Candidate => ({ symbol, finnhub: false, score: 0.1, lists: 1, mutual: false, ...c });

describe('PEERS: companies in the same line of business', () => {
  it('keeps the same industry, largest first, and leaves out stocks only watched alongside it', () => {
    const me = P('Aerospace & Defense', 'Industrials', 1.9e12);
    const profiles = new Map<string, Profile | null>([
      ['RKLB', P('Aerospace & Defense', 'Industrials', 3.2e10)],
      ['LUNR', P('Aerospace & Defense', 'Industrials', 2e9)],
      ['MU', P('Semiconductors', 'Technology', 9.9e11)],
      ['PLTR', P('Software - Infrastructure', 'Technology', 4e11)],
      ['BA', P('Aerospace & Defense', 'Industrials', 1.5e11)],
      ['CAT', P('Farm & Heavy Construction Machinery', 'Industrials', 3e11)],
    ]);
    const picks = choosePeers(me, [C('MU', { lists: 3, score: 0.14 }), C('PLTR', { lists: 2 }), C('RKLB'), C('LUNR', { lists: 1 }), C('BA'), C('CAT', { lists: 2 })], profiles);
    // Caterpillar shares the sector and turns up twice, but does not name the stock back: not a peer.
    expect(picks.map((p) => p.symbol)).toEqual(['BA', 'RKLB', 'LUNR']);
    expect(picks.every((p) => p.basis === 'industry')).toBe(true);
  });

  it("fills with stocks Yahoo links to it repeatedly when few share its industry (AI data-centre operators)", () => {
    const me = P('Internet Content & Information', 'Communication Services', 4.5e10);
    const profiles = new Map<string, Profile | null>([
      ['CRWV', P('Software - Infrastructure', 'Technology', 3.4e10)],
      ['IREN', P('Capital Markets', 'Financial Services', 1.1e10)],
      ['APLD', P('Information Technology Services', 'Technology', 5.5e9)],
      ['RKLB', P('Aerospace & Defense', 'Industrials', 3.2e10)],
      ['GOOGL', P('Internet Content & Information', 'Communication Services', 4e12)],
    ]);
    const picks = choosePeers(me, [
      C('CRWV', { lists: 3, mutual: true, score: 0.27 }),
      C('IREN', { lists: 4, mutual: true, score: 0.24 }),
      C('APLD', { lists: 2, mutual: true, score: 0.17 }),
      // Named once, though it names the stock back: not linked enough.
      C('RKLB', { lists: 1, mutual: true, score: 0.16 }),
      C('GOOGL', { lists: 1 }),
    ], profiles);
    expect(picks.map((p) => [p.symbol, p.basis])).toEqual([['GOOGL', 'industry'], ['IREN', 'similar'], ['CRWV', 'similar'], ['APLD', 'similar']]);
  });

  it("keeps Finnhub's sub-industry picks and the app's own stocks in the industry", () => {
    const me = P('Semiconductors', 'Technology', 5e12);
    const profiles = new Map<string, Profile | null>([['ASML', P('Semiconductor Equipment & Materials', 'Technology', 3e11)], ['AMD', P('Semiconductors', 'Technology', 8.6e11)]]);
    const own = [{ symbol: 'TSM', id: 'TSM US Equity', name: 'TSMC', industry: 'Semiconductors', marketCap: 2.1e12, basis: 'industry' as const }];
    const picks = choosePeers(me, [C('ASML', { finnhub: true }), C('AMD')], profiles, own);
    expect(picks.map((p) => [p.symbol, p.basis])).toEqual([['TSM', 'industry'], ['AMD', 'industry'], ['ASML', 'sub-industry']]);
  });

  it("asks Finnhub for the sub-industry and Yahoo for its similar stocks, and nothing else new", () => {
    expect(finnhubMain.finnhubRequest('peers', 'NBIS')?.url).toBe('https://finnhub.io/api/v1/stock/peers?symbol=NBIS&grouping=subIndustry');
    expect(parsePeers('["NBIS","CRWV","bad symbol",3]')).toEqual({ data: ['NBIS', 'CRWV'] });
    expect(ALLOWED.test('/v6/finance/recommendationsbysymbol/NBIS')).toBe(true);
    expect(ALLOWED.test('/v6/finance/recommendationsbysymbol/NBIS/../../x')).toBe(false);
    expect(ALLOWED.test('/v6/finance/quote?symbols=X')).toBe(false);
  });
});
