import { describe, expect, it } from 'vitest';
import * as finnhubMain from '../electron/finnhub.cjs';
import { ALLOWED } from '../electron/yahoo-scope.cjs';
import { parsePeers } from '../src/data/live/finnhub';
import { choosePeers, listedPeers, type Candidate, type Profile } from '../src/data/live/peers';
import { finvizPeers } from '../electron/estimate-history.cjs';

const P = (industry: string, sector: string, marketCap: number, name = industry): Profile => ({ name, industry, sector, marketCap });
const C = (symbol: string, c: Partial<Candidate> = {}): Candidate => ({ symbol, finnhub: false, score: 0.1, lists: 1, mutual: false, ...c });

describe('PEERS: companies in the same line of business', () => {
  it("takes Finviz's peers first, with the stocks Yahoo links to it both ways, and not the broad industry", () => {
    // Applied Digital: Yahoo's industry ("Information Technology Services") and Finnhub's sub-industry hold software
    // companies; Finviz lists the data-centre and mining operators.
    const page = '<td><a class="tab-link" href="screener.ashx?t=APLD,CIFR,CORZ,WULF,IREN,MARA,RIOT,CLSK,GLXY,HUT,BTBT">Peers</a>:<span>x</span></td>';
    const fv = finvizPeers(page);
    expect(fv).toEqual(['CIFR', 'CORZ', 'WULF', 'IREN', 'MARA', 'RIOT', 'CLSK', 'GLXY', 'HUT', 'BTBT']);
    expect(finvizPeers('<a href="x">Holders</a>')).toEqual([]);
    const me = P('Information Technology Services', 'Technology', 5.85e9);
    const profiles = new Map<string, Profile | null>([
      ...fv.slice(0, 5).map((t, i) => [t, P('Capital Markets', 'Financial Services', 4e9 - i * 1e8, t)] as [string, Profile]),
      ['SNOW', P('Software - Application', 'Technology', 1.1e11)],
      ['NBIS', P('Internet Content & Information', 'Communication Services', 4.4e10)],
      ['GDDY', P('Software - Infrastructure', 'Technology', 1.4e10)],
    ]);
    const candidates = [
      ...fv.slice(0, 5).map((t, i) => C(t, { finviz: i })),
      C('SNOW', { finnhub: true }),
      C('NBIS', { lists: 3, mutual: true, score: 0.3 }),
      C('GDDY', { finnhub: true, lists: 2 }),
    ];
    const picks = choosePeers(me, candidates, profiles);
    expect(picks.map((p) => p.symbol)).toEqual(['CIFR', 'CORZ', 'WULF', 'IREN', 'MARA', 'NBIS']);
    expect(picks[0].basis).toBe('peer');
    expect(picks.at(-1)!.basis).toBe('similar');
    // Without Yahoo's company profiles: Finviz's peers named and sized from Nasdaq's stock list.
    const listings = new Map(fv.map((t, i) => [t, { cap: 1e9 * (i + 1), name: `${t} Inc. Common Stock`, country: 'United States', sector: 'Finance', industry: 'Finance: Consumer Services' }]));
    const group = listedPeers('APLD', fv, listings)!;
    expect(group.picks).toHaveLength(10);
    expect(group.picks[0]).toMatchObject({ symbol: 'CIFR', name: 'CIFR Inc.', basis: 'peer', marketCap: 1e9 });
    expect(listedPeers('APLD', ['CIFR', 'CORZ'], listings)).toBeNull();
  });

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
