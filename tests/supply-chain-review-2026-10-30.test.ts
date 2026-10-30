import { describe, expect, it } from 'vitest';
import {
  buildDirectory, filerIdentity, listingEvents, listingLabel, mergeRelations, ownRelations, runChain, targetNames,
  type Chain, type ChainIO, type FtsHit, type Relation,
} from '../src/data/live/supply-chain';
import { appendRelationshipHistory } from '../src/data/live/supply-chain-history';
import type { SecCompany } from '../src/data/live/sec';

/**
 * The filing-by-filing review of 30 October 2026 (Eli Lilly, Pfizer, Merck, Exxon Mobil, Chevron, Ford, General Motors
 * and Northrop Grumman; docs/splc-review-2026-10-30.md). Each case is the sentence, filing list or record the review
 * found misread, as the SEC or USAspending.gov gives it.
 */

// The SEC's list of listed companies (www.sec.gov/files/company_tickers.json) as of October 2026, for these companies.
const SEC: SecCompany[] = [
  { cik: 34088, ticker: 'XOM', title: 'EXXON MOBIL CORP' },
  { cik: 1467858, ticker: 'GM', title: 'GENERAL MOTORS CO' },
  { cik: 310158, ticker: 'MRK', title: 'Merck & Co., Inc.' },
  // The ticker Aris Water Solutions (CIK 1865187) filed under now belongs to a gold miner.
  { cik: 1964504, ticker: 'ARIS', title: 'Aris Mining Corp' },
  // The ticker of Avidity Biosciences (CIK 1599901) now belongs to its spin-off; ELEV of Elevation Oncology (CIK
  // 1783032) to a blank-check company.
  { cik: 2093101, ticker: 'RNA', title: 'Atrium Therapeutics, Inc.' },
  { cik: 2131124, ticker: 'ELEV', title: 'Elevation Acquisition Group Inc.' },
  // American Axle is Dauch under the same CIK; New Era Helium is New ERA Energy & Digital.
  { cik: 1062231, ticker: 'DCH', title: 'Dauch Corp' },
  { cik: 2028336, ticker: 'NUAI', title: 'New ERA Energy & Digital, Inc.' },
  { cik: 2028336, ticker: 'NUAIW', title: 'New ERA Energy & Digital, Inc.' },
  // An ADR facility listed under its depositary's name, and the bank's own group.
  { cik: 1472033, ticker: 'JTGEY', title: 'Citibank,N.A./ADR' },
  { cik: 1472033, ticker: 'JTGLF', title: 'Citibank,N.A./ADR' },
  { cik: 831001, ticker: 'C', title: 'CITIGROUP INC' },
  { cik: 2071868, ticker: 'JHPCY', title: 'Jiangsu Hengrui Pharmaceuticals Co., Ltd./ADR' },
];
const dir = buildDirectory(SEC);

describe('SPLC review of 30 October 2026: who a related company is', () => {
  it("names a filer by its own CIK's entry, never by the ticker its filing carried", () => {
    // Exxon's screen showed Aris Water's 10-K as "Aris Mining Corp, ARIS" (finding X1).
    expect(filerIdentity(dir, 1865187, 'Aris Water Solutions, Inc.', ['ARIS'])).toEqual({ name: 'Aris Water Solutions, Inc.', listing: { listed: false, was: 'ARIS' } });
    // Lilly's: Avidity Biosciences' 10-K as "Atrium Therapeutics, Inc., RNA" (LLY-7), Elevation Oncology's 10-Q as
    // "Elevation Acquisition Group Inc., ELEV" (LLY-8).
    expect(filerIdentity(dir, 1599901, 'Avidity Biosciences, Inc.', ['RNA'])).toMatchObject({ name: 'Avidity Biosciences, Inc.', listing: { was: 'RNA' } });
    expect(filerIdentity(dir, 1599901, 'Avidity Biosciences, Inc.', ['RNA']).ticker).toBeUndefined();
    expect(filerIdentity(dir, 1783032, 'Elevation Oncology, Inc.', ['ELEV'])).toMatchObject({ name: 'Elevation Oncology, Inc.' });
    // One CIK reads the same on every screen: GM showed "American Axle, AXL" and Ford "Dauch Corp, DCH" (GM-9); Exxon
    // the old "NEW ERA HELIUM INC., NEHC" (X5).
    expect(filerIdentity(dir, 1062231, 'AMERICAN AXLE & MANUFACTURING HOLDINGS INC', ['AXL'])).toEqual({ name: 'Dauch Corp', ticker: 'DCH' });
    expect(filerIdentity(dir, 2028336, 'NEW ERA HELIUM INC.', ['NEHC'])).toEqual({ name: 'New ERA Energy & Digital, Inc.', ticker: 'NUAI' });
  });

  it("says why a company has no listing, from its own filing list (Aris Water's of October 2025)", () => {
    // EDGAR: an 8-K on 2025-10-15 (items 1.02, 2.01, 3.01, 3.03, 5.01, 5.02, 5.07), a 25-NSE the same day and a 15-12G on
    // 2025-10-27: "the Company became a wholly owned subsidiary of WES".
    const filings = [
      { form: '15-12G', filed: '2025-10-27' },
      { form: '25-NSE', filed: '2025-10-15' },
      { form: '8-K', filed: '2025-10-15', items: ['1.02', '2.01', '3.01', '3.03', '5.01', '5.02', '5.07'] },
      { form: '10-Q', filed: '2025-08-06' },
      { form: '8-K', filed: '2025-08-06', items: ['1.01', '9.01'] },
    ];
    expect(listingEvents(filings).map((e) => [e.form, e.date, e.what])).toEqual([
      ['15-12G', '2025-10-27', 'deregistered'],
      ['25-NSE', '2025-10-15', 'delisted'],
      ['8-K', '2025-10-15', 'change in control'],
    ]);
    expect(listingLabel({ listed: false, was: 'ARIS', events: listingEvents(filings) })).toBe('Acquired Oct 2025 (was ARIS)');
    // Superior Industries filed Form 15-12G on 19 December 2025 (F-1); Zuora a 25-NSE and a 15-12G in February 2025 (GM-12).
    expect(listingLabel({ listed: false, was: 'SUP', events: listingEvents([{ form: '15-12G', filed: '2025-12-19' }]) })).toBe('Deregistered Dec 2025 (was SUP)');
    expect(listingLabel({ listed: false, was: 'ZUO' })).toBe('Not listed (was ZUO)');
    expect(listingLabel(undefined)).toBe('');
  });

  it("shows Aris Water's statement on Exxon's screen under its own name, without Aris Mining's ticker", async () => {
    const sentence = 'In July 2024, Coterra joined our beneficial reuse strategic agreement (the "Joint Industry Project" or "JIP") with Chevron U.S.A. Inc., ConocoPhillips and Exxon Mobil Corporation (collectively with us, the "alliance members") to develop and pilot technologies and processes to treat produced water for potential beneficial reuse opportunities.';
    const aris: FtsHit = { cik: 1865187, name: 'Aris Water Solutions, Inc.', tickers: ['ARIS'], form: '10-K', date: '2025-02-27', path: '1865187/000155837025001818/aris-20241231x10k.htm', score: 1, type: '10-K' };
    const io: ChainIO = {
      companies: async () => SEC,
      filings: async (cik) => (cik === 1865187 ? [
        { form: '15-12G', filed: '2025-10-27', accession: '0001193125-25-250000' },
        { form: '25-NSE', filed: '2025-10-15', accession: '0001193125-25-240244' },
        { form: '8-K', filed: '2025-10-15', accession: '0001193125-25-240243', doc: 'd918586d8k.htm', items: ['1.02', '2.01', '3.01', '3.03', '5.01', '5.02', '5.07'] },
      ] : []),
      fts: async (arg) => (arg === '|ExxonMobil|reports' ? { hits: [aris], total: 1 } : { hits: [], total: 0 }),
      text: async (kind, path) => (kind === 'mentions' && path === aris.path ? [sentence] : []),
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'XOM', name: 'Exxon Mobil Corp' }, io, (f) => { chain = f(chain); });
    const got = chain.relations.find((r) => r.key === 'cik:1865187')!;
    expect(got).toMatchObject({ role: 'partner', name: 'Aris Water Solutions, Inc.' });
    expect(got.ticker).toBeUndefined();
    expect(listingLabel(got.listing)).toBe('Acquired Oct 2025 (was ARIS)');
  });

  it('replaces a saved name and ticker with the newest reading of the same CIK', () => {
    const ev = { sentence: 'In July 2024, Coterra joined our beneficial reuse strategic agreement.', filer: 'Aris Water Solutions, Inc.', form: '10-K', date: '2025-02-27', path: '1865187/000155837025001818/aris-20241231x10k.htm' };
    const saved: Relation = { key: 'cik:1865187', name: 'Aris Mining Corp', ticker: 'ARIS', cik: 1865187, role: 'partner', side: 'theirs', evidence: [ev] };
    const now: Relation = { key: 'cik:1865187', name: 'Aris Water Solutions, Inc.', cik: 1865187, listing: { listed: false, was: 'ARIS' }, role: 'partner', side: 'theirs', evidence: [ev] };
    const [merged] = appendRelationshipHistory([saved], [now]);
    expect(merged).toMatchObject({ name: 'Aris Water Solutions, Inc.', listing: { was: 'ARIS' } });
    expect(merged.ticker).toBeUndefined();
  });

  it("reads Citibank, N.A. as Citigroup's bank, not the ADR depositary filer, and JPMorgan's bank as one lender (GM-1, GM-13)", () => {
    const gm = { cik: 1467858, names: targetNames('GM', 'GENERAL MOTORS CO').names, ticker: 'GM' };
    const ev = { filer: 'General Motors Co', form: '8-K', date: '2026-03-23', path: '1467858/000119312526119684/d114837d8k.htm' };
    const got = mergeRelations(ownRelations([
      'Eighth Amended and Restated 364-Day Revolving Credit Agreement, dated as of March 23, 2026, among General Motors Company, General Motors Financial Company, Inc., the subsidiary borrowers from time to time parties thereto, the several lenders from time to time parties thereto, JPMorgan Chase Bank, N.A., as administrative agent, and Citibank, N.A., as syndication agent',
      'On March 23, 2026, General Motors Company ("GM") entered into an Eighth Amended and Restated 364-Day Revolving Credit Agreement with JPMorgan Chase Bank, N.A., as administrative agent, Citibank, N.A., as syndication agent, the other lenders named therein, and General Motors Financial Company, Inc. (the "364-Day Facility").',
    ], dir, gm, ev));
    const lenders = got.filter((r) => r.role === 'lender');
    expect(lenders.map((r) => [r.key, r.ticker ?? ''])).toEqual([['n:jpmorgan chase bank', ''], ['cik:831001', 'C']]);
    expect(lenders.some((r) => r.ticker === 'JTGEY' || r.cik === 1472033)).toBe(false);
    expect(lenders[0].evidence).toHaveLength(2);
  });

  it("finds Hengrui under its CIK when Merck's release writes \"Pharmaceutical\" (M8)", () => {
    const mrk = { cik: 310158, names: targetNames('MRK', 'Merck & Co., Inc.').names, ticker: 'MRK' };
    const ev = { filer: 'Merck & Co., Inc.', form: '8-K', date: '2026-08-04', path: '310158/000110465926090045/tm2621496d1_ex99-1.htm', type: 'EX-99.1' };
    const got = ownRelations(['Both GAAP and non-GAAP EPS in the second quarter of 2025 include a charge of $0.07 per share for an upfront payment related to a license agreement with Jiangsu Hengrui Pharmaceutical Co., Ltd. (Hengrui Pharma).'], dir, mrk, ev);
    expect(got.map((r) => [r.role, r.key, r.ticker])).toEqual([['partner', 'cik:2071868', 'JHPCY']]);
  });
});
