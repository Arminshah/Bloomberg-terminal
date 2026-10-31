import { describe, expect, it } from 'vitest';
import * as main from '../electron/index-members.cjs';
import { csvFields, DOW_FALLBACK, parseNasdaq100, parseNasdaqVolumes, parseSp500, parseSpark, shareClassCaps } from '../src/data/live/index-members';

const sp500 = [
  'Symbol,Security,GICS Sector,GICS Sub-Industry,Headquarters Location,Date added,CIK,Founded',
  'MMM,3M,Industrials,Industrial Conglomerates,"Saint Paul, Minnesota",1957-03-04,66740,1902',
  'BRK.B,Berkshire Hathaway,Financials,Multi-Sector Holdings,"Omaha, Nebraska",2010-02-16,1067983,1839',
  ...Array.from({ length: 450 }, (_, i) => `T${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))},Company ${i},Energy,Oil,"City, State",2000-01-01,1,1900`),
].join('\n');

describe('index members without a key', () => {
  it('reads the S&P 500 list with quoted fields, class shares and GICS sectors', () => {
    expect(csvFields('MMM,3M,"Saint Paul, Minnesota","say ""hi"""')).toEqual(['MMM', '3M', 'Saint Paul, Minnesota', 'say "hi"']);
    const r = parseSp500(`\uFEFF${sp500}`);
    if ('error' in r) throw new Error(r.error);
    expect(r.data[0]).toEqual({ symbol: 'MMM', name: '3M', sector: 'Industrials', industry: 'Industrial Conglomerates' });
    expect(r.data[1].symbol).toBe('BRK.B');
    expect(parseSp500('Symbol,Security\nAAPL,Apple')).toEqual({ error: expect.stringMatching(/only 1 members/) });
  });

  it("reads Nasdaq's Nasdaq-100 list and drops the share-class wording from names", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ symbol: `A${i}`.replace(/\d/g, (d) => String.fromCharCode(65 + Number(d))), companyName: 'Apple Inc. Common Stock' }));
    const r = parseNasdaq100(JSON.stringify({ data: { data: { rows } } }));
    if ('error' in r) throw new Error(r.error);
    expect(r.data[0].name).toBe('Apple Inc.');
    expect(parseNasdaq100('<html>')).toEqual({ error: expect.any(String) });
  });

  it("takes each symbol's regular-session price and previous close from Yahoo's spark", () => {
    const q = parseSpark({
      AAPL: { timestamp: [1792526401], close: [339.5], chartPreviousClose: 342.94, previousClose: null },
      BAD: { timestamp: [1], close: [null], chartPreviousClose: 10 },
    });
    expect(q).toEqual({ AAPL: { last: 339.5, prevClose: 342.94, time: 1792526401000 } });
  });

  it("reads Nasdaq's volumes, with its thousands separators", () => {
    expect(parseNasdaqVolumes(JSON.stringify({ data: [{ symbol: 'BRK.B', volume: '4,793,101' }, { symbol: 'BF.B', volume: '' }] }))).toEqual({ 'BRK.B': 4793101 });
  });

  it("shares a company's value between its listed share classes", () => {
    const caps = shareClassCaps([
      { symbol: 'GOOGL', name: 'Alphabet Inc.', cap: 4209e9 },
      { symbol: 'GOOG', name: 'Alphabet Inc. Class C', cap: 4160e9 },
      { symbol: 'AAPL', name: 'Apple Inc.', cap: 5000e9 },
    ]);
    expect(caps.get('GOOGL')! + caps.get('GOOG')!).toBeCloseTo(4184.5e9, -8);
    expect(caps.get('AAPL')).toBe(5000e9);
  });

  it('asks the main process only for the fixed lists and at most 20 valid tickers', () => {
    expect(main.membersRequest('sp500')?.url).toContain('s-and-p-500-companies');
    expect(main.membersRequest('nasdaq100')?.provider).toBe('nasdaq');
    expect(main.membersRequest('ftse')).toBeNull();
    expect(main.nasdaqQuotesRequest('AAPL,BRK.B')?.url).toBe('https://api.nasdaq.com/api/quote/watchlist?symbol=aapl%7Cstocks&symbol=brk.b%7Cstocks');
    expect(main.nasdaqQuotesRequest(Array.from({ length: 21 }, (_, i) => `A${String.fromCharCode(65 + i)}`).join(','))).toBeNull();
    expect(main.nasdaqQuotesRequest('AAPL,aapl')).toBeNull();
    expect(main.nasdaqQuotesRequest('AAPL,AAPL')).toBeNull();
    expect(main.nasdaqQuotesRequest('../x')).toBeNull();
  });
});

describe("the Dow's members kept in the app", () => {
  it("are the 30 of today, with Alphabet in Verizon's place since 29 June 2026", () => {
    expect(new Set(DOW_FALLBACK).size).toBe(30);
    expect(DOW_FALLBACK).toContain('GOOGL');
    expect(DOW_FALLBACK).not.toContain('VZ');
    expect(DOW_FALLBACK).toEqual([...DOW_FALLBACK].sort());
  });
});

describe('peers without Yahoo', () => {
  it("takes an S&P 500 member's GICS sub-industry, else Nasdaq's industry, largest first", async () => {
    const { classifiedPeers } = await import('../src/data/live/peers');
    const sp = [
      { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', industry: 'Technology Hardware, Storage & Peripherals' },
      { symbol: 'DELL', name: 'Dell', sector: 'Information Technology', industry: 'Technology Hardware, Storage & Peripherals' },
      { symbol: 'HPQ', name: 'HP', sector: 'Information Technology', industry: 'Technology Hardware, Storage & Peripherals' },
      { symbol: 'MSFT', name: 'Microsoft', sector: 'Information Technology', industry: 'Systems Software' },
    ];
    const listings = new Map([
      ['AAPL', { cap: 5e12, name: 'Apple Inc. Common Stock', country: 'United States', sector: 'Technology', industry: 'Computer Manufacturing' }],
      ['DELL', { cap: 3e11, name: 'Dell', country: 'United States', sector: 'Technology', industry: 'Computer Manufacturing' }],
      ['HPQ', { cap: 3e10, name: 'HP', country: 'United States', sector: 'Technology', industry: 'Computer Manufacturing' }],
      ['MSFT', { cap: 4e12, name: 'Microsoft', country: 'United States', sector: 'Technology', industry: 'Software' }],
      ['APLD', { cap: 6e9, name: 'Applied Digital Corporation Common Stock', country: 'United States', sector: 'Technology', industry: 'EDP Services' }],
      ['XYZ', { cap: 1e9, name: 'XYZ Corp Common Stock', country: 'United States', sector: 'Technology', industry: 'EDP Services' }],
    ]);
    const a = classifiedPeers('AAPL', sp, listings)!;
    expect(a.industry).toBe('Technology Hardware, Storage & Peripherals');
    expect(a.picks.map((p) => p.symbol)).toEqual(['MSFT', 'DELL', 'HPQ']); // widened to the sector, largest first
    const b = classifiedPeers('APLD', sp, listings)!;
    expect(b.picks.map((p) => [p.symbol, p.name])).toEqual([['XYZ', 'XYZ Corp']]);
    expect(classifiedPeers('NONE', sp, listings)).toBeNull();
  });
});
