import { describe, expect, it } from 'vitest';
import { amountRange as mainRange, assetParts, docRef, FmpTradeLog, filingYear, labelOf, parseAnnual, parseHouseIndex, parseHouseMembers, parsePtr, parseSenators, unzipFile } from '../electron/congress.cjs';
import { fmpCongressRequest } from '../electron/fmp.cjs';
import { pdfLines } from '../electron/pdf-text.cjs';
import {
  amountRange,
  daysToDisclose,
  fmpDocId,
  fmpTrade,
  houseTrades,
  latestAnnuals,
  memberFinder,
  mostOwned,
  rangeSum,
  recentFilings,
  type AnnualReport,
  type HouseFiling,
  type Member,
  type TradeReport,
} from '../src/data/live/congress';
import { fixture } from './fixtures/congress/files.cjs';
import houseXml from './fixtures/congress/house-members-excerpt.xml?raw';
import senateXml from './fixtures/congress/senators-excerpt.xml?raw';

// The House Clerk's documents as published: the 2026 index, periodic transaction reports by Nancy Pelosi (stocks and
// options), Cleo Fields (NVIDIA bought in three accounts on one day), Sheri Biggs (two pages) and Michael McCaul (filed on
// paper: a scan), and the 2025 annual reports of Brian Mast and Nancy Pelosi. Member lists: excerpts of the Clerk's and
// the Senate's.
const read = async (name: string) => pdfLines(fixture(name));

describe("the House Clerk's documents", () => {
  it('reads the yearly index from its ZIP', () => {
    const txt = unzipFile(fixture('2026FD.zip'), '2026FD.txt');
    const filings = parseHouseIndex(txt!.toString('utf8'))!;
    // 1,800 lines; the 37 left out are withdrawn candidate filings without a date.
    expect(filings).toHaveLength(1763);
    expect(filings.filter((f) => f.type === 'P')).toHaveLength(437);
    expect(filings.find((f) => f.docId === '20035669')).toEqual({ prefix: '', last: 'Fields', first: 'Cleo', suffix: '', type: 'P', stateDst: 'LA06', year: 2026, filed: '2026-10-22', docId: '20035669' });
    expect(unzipFile(fixture('2026FD.zip'), 'other.txt')).toBeNull();
    expect(parseHouseIndex('not an index')).toBeNull();
  });

  it("reads a trade report's transactions: owner, asset, ticker, type, dates, amount range", async () => {
    const p = parsePtr(await read('20035143.pdf'));
    expect(p).toMatchObject({ name: 'Hon. Nancy Pelosi', stateDst: 'CA11', filingId: '20035143', scanned: false });
    expect(p.transactions.map((t) => [t.ticker, t.code, t.type, t.date, t.min, t.max, t.owner])).toEqual([
      ['BE', 'ST', 'P', '2026-07-24', 1000001, 5000000, 'SP'],
      ['BE', 'OP', 'P', '2026-07-24', 1000001, 5000000, 'SP'],
      ['BE', 'ST', 'P', '2026-07-28', 500001, 1000000, 'SP'],
      ['BE', 'OP', 'P', '2026-07-28', 500001, 1000000, 'SP'],
      ['INTC', 'OP', 'P', '2026-07-24', 250001, 500000, 'SP'],
      ['INTC', 'ST', 'P', '2026-07-24', 500001, 1000000, 'SP'],
      ['', 'AB', 'P', '2026-07-27', 500001, 1000000, 'SP'],
    ]);
    expect(p.transactions[0]).toMatchObject({ name: 'Bloom Energy Corporation Class A Common Stock', status: 'New', description: 'Purchased 10,000 shares.' });
    expect(p.transactions[1].description).toBe('Purchased 100 call options with a strike price of $100 and an expiration date of 6/17/27.');
  });

  it('keeps three purchases of one stock in three accounts as three, each with its account', async () => {
    const f = parsePtr(await read('20035669.pdf'));
    expect(f.transactions.map((t) => [t.ticker, t.date, t.amount, t.subholding])).toEqual([
      ['NVDA', '2026-10-01', '$1,001 - $15,000', 'Morgan Stanley - E*TRADE #2'],
      ['NVDA', '2026-10-01', '$1,001 - $15,000', 'Morgan Stanley - E*TRADE - Fields Law Firm 2, LLC'],
      ['NVDA', '2026-10-01', '$1,001 - $15,000', 'Morgan Stanley - E*TRADE IRA'],
      ['TSM', '2026-10-09', '$1,001 - $15,000', 'Morgan Stanley - E*TRADE #2'],
    ]);
    // The name wraps across three lines in the form.
    expect(f.transactions[3].name).toBe('Taiwan Semiconductor Manufacturing Company Ltd.');
  });

  it('reads a report across pages, and knows a scanned paper report has no text', async () => {
    const b = parsePtr(await read('20033800.pdf'));
    expect(b.transactions).toHaveLength(19);
    expect(b.transactions.at(-1)).toMatchObject({ name: 'US TSY NOTE 11/15/33', code: 'GS', type: 'P', date: '2025-12-02', notified: '2026-01-12', owner: 'SP' });
    const m = parsePtr(await read('9116378.pdf'));
    expect(m.scanned).toBe(true);
    expect(m.transactions).toEqual([]);
  });

  it("reads an annual report's assets (Schedule A) with their value ranges", async () => {
    const a = parseAnnual(await read('annual-10076430.pdf'));
    expect(a).toMatchObject({ name: 'Hon. Brian Mast', stateDst: 'FL21', filingType: 'Annual Report', filingYear: '2025', filed: '2026-08-13' });
    expect(a.assets.map((x) => [x.name, x.code, x.owner, x.min, x.max])).toEqual([
      ['4M Properties of South Florida, LLC', 'RP', '', 500001, 1000000],
      ['Stay Salty Studios, LLC, 100% Interest', 'OL', 'SP', 1, 1000],
      ['USAA Checking and Savings Accounts', 'BA', '', 100001, 250000],
    ]);
    const p = parseAnnual(await read('annual-10075701.pdf'));
    expect(p.assets).toHaveLength(68);
    expect(rangeSum(p.assets)).toEqual({ min: 85944060, max: 412412000, unknown: 1, count: 68 });
    expect(p.assets.find((x) => x.min == null)).toMatchObject({ name: 'The Art of Power Book Contract', value: 'Undetermined' });
    // The liabilities and transactions schedules that follow are not assets.
    expect(p.assets.every((x) => x.code)).toBe(true);
  });

  it("reads the forms' labels, ranges and asset names", () => {
    expect(labelOf('F      S     : New')).toEqual({ key: 'status', value: 'New' });
    expect(labelOf('S          O : Schwab')).toEqual({ key: 'subholding', value: 'Schwab' });
    expect(labelOf('Description: Purchased 10 shares.')).toEqual({ key: 'description', value: 'Purchased 10 shares.' });
    expect(labelOf('Apple Inc. (AAPL) [ST]')).toBeNull();
    for (const range of [mainRange, amountRange]) {
      expect(range('$1,001 - $15,000')).toEqual({ min: 1001, max: 15000 });
      expect(range('Over $50,000,000')).toEqual({ min: 50000000, max: null });
      expect(range('Spouse/DC Over $1,000,000')).toEqual({ min: 1000000, max: null });
      expect(range('None')).toEqual({ min: 0, max: 0 });
      expect(range('Undetermined')).toBeNull();
      expect(range('$1,001 -')).toBeNull();
    }
    expect(assetParts('150 Main Street Trust ⇒ Bank of America ⇒ Chevron Corporation (CVX) [ST]')).toEqual({ name: 'Chevron Corporation', ticker: 'CVX', code: 'ST', account: '150 Main Street Trust › Bank of America' });
    expect(assetParts('Berkshire Hathaway Inc. New Common Stock (BRK.B) [ST]')).toMatchObject({ ticker: 'BRK/B' });
    expect(assetParts('REOF XXV, LLC [AB]')).toEqual({ name: 'REOF XXV, LLC', ticker: '', code: 'AB' });
  });

  it('asks only for documents it knows how to name', () => {
    const now = new Date('2026-10-25T00:00:00Z');
    expect(docRef('2026/20035669', now)).toEqual({ year: 2026, docId: '20035669' });
    expect(docRef('2026/../x', now)).toBeNull();
    expect(docRef('1999/20035669', now)).toBeNull();
    expect(filingYear('2028', now)).toBeNull();
    expect(fmpCongressRequest('senate', 'k')!.url).toBe('https://financialmodelingprep.com/stable/senate-latest?page=0&limit=25&apikey=k');
    expect(fmpCongressRequest('president', 'k')).toBeNull();
  });
});

describe('members, trades and holdings', () => {
  const house = parseHouseMembers(houseXml)!;
  const senate = parseSenators(senateXml)!;

  it('reads both member lists with party and seat, without vacant seats', () => {
    expect(house.map((m) => [m.name, m.party, m.stateDst, m.bioguide])).toEqual([
      ['Nancy Pelosi', 'D', 'CA11', 'P000197'],
      ['Brian J. Mast', 'R', 'FL21', 'M001199'],
      ['Cleo Fields', 'D', 'LA06', 'F000110'],
      ['Daniel Meuser', 'R', 'PA09', 'M001204'],
    ]);
    expect(senate.map((m) => [m.name, m.party, m.state, m.bioguide])).toEqual([
      ['Alan Armstrong', 'R', 'OK', 'A000383'],
      ['John Boozman', 'R', 'AR', 'B001236'],
    ]);
  });

  it("finds a filing's member by seat and name, and each member's latest annual report", () => {
    const find = memberFinder(house);
    expect(find({ last: 'Pelosi', stateDst: 'CA11' })?.bioguide).toBe('P000197');
    // A district renumbered since: the one member of the state with that name.
    expect(find({ last: 'PELOSI', stateDst: 'CA12' })?.bioguide).toBe('P000197');
    expect(find({ last: 'Smith', stateDst: 'CA11' })).toBeUndefined();
    const f = (docId: string, type: string, year: number, filed: string, last = 'Mast', stateDst = 'FL21'): HouseFiling => ({ prefix: 'Hon.', last, first: '', suffix: '', type, stateDst, year, filed, docId });
    const latest = latestAnnuals([f('1', 'O', 2024, '2025-05-15'), f('2', 'O', 2025, '2026-08-13'), f('3', 'A', 2025, '2026-09-01'), f('4', 'P', 2026, '2026-10-01'), f('5', 'C', 2026, '2026-10-02')], house);
    expect(latest.get(house[1])?.docId).toBe('3');
    expect(latest.has(house[0])).toBe(false);
  });

  it("lists a House report's trades with its member, and a FMP row with the member's party", async () => {
    const report = parsePtr(await read('20035669.pdf')) as TradeReport;
    const filing: HouseFiling = { prefix: '', last: 'Fields', first: 'Cleo', suffix: '', type: 'P', stateDst: 'LA06', year: 2026, filed: '2026-10-22', docId: '20035669' };
    const rows = houseTrades(filing, report, memberFinder(house));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ chamber: 'House', member: 'Cleo Fields', party: 'D', seat: 'LA06', ticker: 'NVDA', type: 'P', date: '2026-10-01', filed: '2026-10-22', min: 1001, max: 15000, account: 'Morgan Stanley - E*TRADE #2', link: 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035669.pdf', source: 'House Clerk' });
    expect(daysToDisclose(rows[0])).toBe(21);
    const fmp = fmpTrade({ chamber: 'senate', symbol: 'WMB', senateID: 'A000383', disclosureDate: '2026-10-22', transactionDate: '2026-09-08', firstName: 'Alan', lastName: 'Armstrong', owner: 'Joint', assetDescription: 'Williams Companies, Inc. (The) Common Stock', assetType: 'Stock Option', type: 'Sale (Full)', amount: '$250,001 - $500,000', link: 'https://efdsearch.senate.gov/search/view/ptr/6aa5ccb2-ff27-491a-9314-778b9ab37964/' }, 0, [...house, ...senate]);
    expect(fmp).toMatchObject({ chamber: 'Senate', member: 'Alan Armstrong', party: 'R', seat: 'OK', owner: 'JT', ticker: 'WMB', type: 'S', min: 250001, max: 500000, source: 'FMP' });
    expect(fmpDocId('https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035669.pdf')).toBe('20035669');
    expect(fmpDocId('https://efdsearch.senate.gov/search/view/ptr/x/')).toBe('');
  });

  it('takes the trade reports filed in a period, newest first', () => {
    const f = (docId: string, type: string, filed: string): HouseFiling => ({ prefix: '', last: 'X', first: '', suffix: '', type, stateDst: 'CA11', year: 2026, filed, docId });
    const index = { 2026: [f('1', 'P', '2026-10-20'), f('2', 'P', '2026-07-01'), f('3', 'O', '2026-10-21'), f('4', 'P', '2026-10-22')], 2025: [f('4', 'P', '2026-10-22')] };
    expect(recentFilings(index, 'P', 30, new Date('2026-10-25T00:00:00Z')).map((x) => x.docId)).toEqual(['4', '1']);
  });

  it('ranks the securities owned by the most members, adding up each member’s accounts', async () => {
    const pelosi = parseAnnual(await read('annual-10075701.pdf')) as AnnualReport;
    const mast = parseAnnual(await read('annual-10076430.pdf')) as AnnualReport;
    const other: AnnualReport = { ...mast, assets: [{ owner: '', asset: 'Apple Inc. (AAPL) [ST]', name: 'Apple Inc.', ticker: 'AAPL', code: 'ST', value: '$1,001 - $15,000', min: 1001, max: 15000 }, { owner: 'SP', asset: 'IRA ⇒ Apple Inc. (AAPL) [ST]', name: 'Apple Inc.', ticker: 'AAPL', code: 'ST', account: 'IRA', value: '$15,001 - $50,000', min: 15001, max: 50000 }, { owner: '', asset: 'Local Bank stock [ST]', name: 'Local Bank stock', ticker: '', code: 'ST', value: '$1,001 - $15,000', min: 1001, max: 15000 }] };
    const m = (i: number): Member => house[i];
    const { owned, withoutTicker } = mostOwned([{ member: m(0), report: pelosi }, { member: m(1), report: mast }, { member: m(3), report: other }], ['ST']);
    const aapl = owned.find((o) => o.ticker === 'AAPL')!;
    expect(aapl.holders.map((h) => [h.member.last, h.range.min, h.range.max])).toEqual([['Pelosi', 5000001, 25000000], ['Meuser', 16002, 65000]]);
    expect(aapl.total).toEqual({ min: 5016003, max: 25065000, unknown: 0, count: 2 });
    expect(withoutTicker).toBeGreaterThanOrEqual(1);
    // Options on Apple are not shares of it.
    expect(mostOwned([{ member: m(0), report: pelosi }], ['OP']).owned.find((o) => o.ticker === 'AAPL')?.holders[0].range).toEqual({ min: 250001, max: 500000, unknown: 0, count: 1 });
  });
});

describe("keeping FMP's latest lists", () => {
  const row = (date: string, symbol: string) => ({ disclosureDate: date, transactionDate: date, symbol, senateID: 'B001236', assetDescription: symbol, type: 'Purchase', amount: '$1,001 - $15,000', owner: 'Joint', link: `https://efdsearch.senate.gov/search/view/ptr/${symbol}/` });

  it('keeps every row it has seen once, and notes when a new list does not reach back to the ones it had', () => {
    const log = new FmpTradeLog();
    expect(log.add('senate', [row('2026-10-21', 'A'), row('2026-10-20', 'B')], 1)).toBe(2);
    expect(log.add('senate', [row('2026-10-22', 'C'), row('2026-10-21', 'A')], 2)).toBe(1);
    expect(log.gaps).toEqual([]);
    expect(log.since).toEqual({ senate: '2026-10-20' });
    // A list wholly newer than what was kept: trades in between may have been missed.
    expect(log.add('senate', [row('2026-11-30', 'Z')], 3)).toBe(1);
    expect(log.gaps).toEqual([{ chamber: 'senate', from: '2026-10-22', to: '2026-11-30', at: 3 }]);
    const again = new FmpTradeLog();
    again.load(JSON.parse(JSON.stringify(log)));
    expect(again.rows).toHaveLength(4);
    expect(again.add('senate', [row('2026-11-30', 'Z')], 4)).toBe(0);
  });
});
