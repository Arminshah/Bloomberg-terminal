import { describe, expect, it } from 'vitest';
import * as main from '../electron/fiscal.cjs';
import { auctionName, auctionsFrom, mergeAuctions, parseAuctions, parseTreasuryDirect, share, type Auction } from '../src/data/live/auctions';
import { isUpcoming } from '../src/functions/AUCTIONS';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import type { KeyedAnswer } from '../src/data/live/lookup';
// The Treasury's answers of 31 October 2026, trimmed to a few auctions: Fiscal Data's auction records (its 5-Year TIPS
// of 22 October and 20-year reopening of 21 October still without results) and TreasuryDirect's securities service
// (the last 30 days' results, and auctions on the schedule).
import HISTORY from './fixtures/fiscal/auctions-2026-10-31.json?raw';
import RECENT from './fixtures/fiscal/treasurydirect-auctioned-2026-10-31.json?raw';
import UPCOMING from './fixtures/fiscal/treasurydirect-upcoming-2026-10-31.json?raw';

const ok = (text: string): KeyedAnswer => ({ status: 200, text, at: Date.UTC(2026, 9, 31) }) as KeyedAnswer;
const list = (r: Auction[] | { error: string }) => {
  if ('error' in r) throw new Error(r.error);
  return r;
};
const history = list(parseAuctions(HISTORY));
const recent = list(parseTreasuryDirect(RECENT));
const upcoming = list(parseTreasuryDirect(UPCOMING));
const find = (rows: Auction[], date: string, term: string) => rows.find((a) => a.auction === date && a.term === term)!;

describe('auction requests', () => {
  it("asks Fiscal Data for its latest 600 auctions and TreasuryDirect for the last 30 days and the schedule, nothing else", () => {
    const h = new URL(main.fiscalRequest('auctions')!.url);
    expect(h.origin + h.pathname).toBe('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query');
    expect(h.searchParams.get('sort')).toBe('-auction_date');
    expect(h.searchParams.get('page[size]')).toBe('600');
    expect(h.searchParams.get('fields')!.split(',')).toEqual(main.AUCTION_FIELDS);
    expect(main.AUCTION_FIELDS).toContain('spread');
    expect(main.fiscalRequest('auctions')!.provider).toBeUndefined();
    expect(main.fiscalRequest('auctions-recent')).toEqual({ url: 'https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&days=30', ttl: 15 * 60_000, provider: 'treasurydirect' });
    expect(main.fiscalRequest('auctions-upcoming')).toEqual({ url: 'https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json', ttl: 3_600_000, provider: 'treasurydirect' });
    expect(main.fiscalRequest('auctions-all')).toBeNull();
  });
});

describe("Fiscal Data's auction records", () => {
  it('reads a note: the high yield, price, allotment, bid-to-cover and the bidder groups, as the Treasury published them', () => {
    const a = find(history, '2026-10-06', '3-Year');
    expect(a).toMatchObject({ cusip: '91282CRQ6', kind: 'coupon', coupon: 4.875, high: 4.932, price: 99.84284, allottedAtHigh: 8.35, bidToCover: 2.62, offering: 58e9, issue: '2026-10-15', maturity: '2029-10-15', upcoming: false, source: 'Fiscal Data' });
    // The competitive award is the three groups' sum.
    expect(a.competitive).toBe(a.dealers + a.direct + a.indirect);
    expect(share(a.dealers, a)).toBeCloseTo(10.7402, 4);
    expect(share(a.direct, a)).toBeCloseTo(31.665, 3);
    expect(share(a.indirect, a)).toBeCloseTo(57.5948, 4);
    expect(a.resultsUrl).toBe('https://www.treasurydirect.gov/instit/annceresult/press/preanre/2026/R_20261006_2.pdf');
    expect(auctionName(a)).toBe('3-Year Note');
  });

  it('reads a bill by its discount and investment rates, a cash management bill as a CMB, an FRN by its margin with its spread', () => {
    expect(find(history, '2026-10-15', '8-Week')).toMatchObject({ kind: 'bill', high: 4.05, investmentRate: 4.132, price: 99.37, coupon: NaN });
    expect(auctionName(find(history, '2026-10-15', '8-Week'))).toBe('8-Week Bill (reopening)');
    expect(auctionName(find(history, '2026-05-21', '27-Day'))).toBe('27-Day CMB (reopening)');
    // A reopened FRN keeps the original spread (0.05) whatever margin the reopening clears at (0.04).
    const frn = find(history, '2026-09-23', '1-Year 10-Month');
    expect(frn).toMatchObject({ kind: 'frn', high: 0.04, coupon: 0.05, price: 100.015499 });
    expect(auctionName(frn)).toBe('1-Year 10-Month FRN (reopening)');
  });

  it('marks an auction without results as having none, a blank and not a zero', () => {
    const tips = find(history, '2026-10-22', '5-Year');
    expect(tips).toMatchObject({ kind: 'tips', upcoming: true, offering: 26e9 });
    expect(tips.high).toBeNaN();
    expect(tips.resultsUrl).toBeUndefined();
    expect(share(tips.dealers, tips)).toBeNaN();
  });

  it('names a page that is not the auctions answer', () => {
    expect(parseAuctions('<html>')).toEqual({ error: 'Fiscal Data returned a page that is not JSON.' });
    expect(parseAuctions('{"error":"x"}')).toEqual({ error: 'Fiscal Data changed the auctions format.' });
  });
});

describe("TreasuryDirect's securities service", () => {
  it('gives the same figures as Fiscal Data for the same auction', () => {
    const td = find(recent, '2026-10-06', '3-Year');
    const fd = find(history, '2026-10-06', '3-Year');
    for (const k of ['cusip', 'kind', 'coupon', 'high', 'price', 'allottedAtHigh', 'bidToCover', 'competitive', 'dealers', 'direct', 'indirect', 'total', 'offering', 'announced', 'issue', 'maturity', 'resultsUrl'] as const) {
      expect(td[k], k).toEqual(fd[k]);
    }
  });

  it('has the results Fiscal Data does not have yet: the 5-Year TIPS and the 20-year reopening', () => {
    const tips = find(recent, '2026-10-22', '5-Year');
    expect(tips).toMatchObject({ kind: 'tips', coupon: 2.25, high: 2.367, price: 99.607747, allottedAtHigh: 68.33, bidToCover: 2.41, upcoming: false, source: 'TreasuryDirect' });
    expect(share(tips.indirect, tips)).toBeCloseTo(62.0372, 4);
    expect(auctionName(tips)).toBe('5-Year TIPS');
    const bond = find(recent, '2026-10-21', '19-Year 10-Month');
    expect(bond).toMatchObject({ kind: 'coupon', coupon: 5.125, high: 5.469, price: 95.853363, bidToCover: 2.73, total: 13000000900 });
    expect(auctionName(bond)).toBe('19-Year 10-Month Bond (reopening)');
  });

  it('reads a bill, an FRN by its margin and spread, and the competitive award inside and outside the offering', () => {
    const bill = find(recent, '2026-10-29', '4-Week');
    expect(bill).toMatchObject({ kind: 'bill', high: 3.91, investmentRate: 3.976, allottedAtHigh: 16.96, bidToCover: 3.1, competitive: 107332678000 });
    expect(bill.competitive).toBe(bill.dealers + bill.direct + bill.indirect);
    const frn = find(recent, '2026-10-28', '2-Year');
    expect(frn).toMatchObject({ kind: 'frn', high: 0.038, coupon: 0.038, allottedAtHigh: 11.37, competitive: 29969027100, total: 33333576500 });
  });

  it('reads the schedule: announced and tentative auctions, with what is not yet announced left blank', () => {
    expect(upcoming.map((a) => [a.auction, auctionName(a)])).toEqual([
      ['2026-11-12', '30-Year Bond'], ['2026-11-10', '10-Year Note'], ['2026-11-09', '3-Year Note'], ['2026-11-02', '13-Week Bill (reopening)'],
    ]);
    expect(upcoming.every((a) => a.upcoming)).toBe(true);
    expect(find(upcoming, '2026-11-02', '13-Week')).toMatchObject({ offering: 95e9, announced: '2026-10-29', issue: '2026-11-05', maturity: '2027-02-04' });
    const ten = find(upcoming, '2026-11-10', '10-Year');
    expect(ten.offering).toBeNaN();
    expect(ten.maturity).toBe('');
  });

  it('names a page that is not the securities answer', () => {
    expect(parseTreasuryDirect('<html>')).toEqual({ error: 'TreasuryDirect returned a page that is not JSON.' });
    expect(parseTreasuryDirect('{}')).toEqual({ error: 'TreasuryDirect changed its securities format.' });
  });
});

describe('the auctions together', () => {
  it("puts TreasuryDirect's results over Fiscal Data's blanks, one row per auction, newest first", () => {
    const all = mergeAuctions(history, recent, upcoming);
    expect(all.filter((a) => a.cusip === '91282CRR4')).toHaveLength(1);
    expect(find(all, '2026-10-22', '5-Year')).toMatchObject({ high: 2.367, source: 'TreasuryDirect' });
    expect(find(all, '2026-10-21', '19-Year 10-Month')).toMatchObject({ high: 5.469 });
    expect(all.map((a) => a.auction)).toEqual([...all.map((a) => a.auction)].sort().reverse());
    // A record without a result never replaces one with.
    const blank = { ...find(history, '2026-10-06', '3-Year'), high: NaN, bidToCover: NaN, upcoming: true, source: 'TreasuryDirect' as const };
    expect(find(mergeAuctions(history, [blank]), '2026-10-06', '3-Year')).toMatchObject({ high: 4.932, source: 'Fiscal Data' });
  });

  it('shows what came through and names what did not', () => {
    const down: KeyedAnswer = { status: 0, error: 'net::ERR_TIMED_OUT' } as KeyedAnswer;
    const partial = auctionsFrom(ok(HISTORY), down, ok(UPCOMING));
    expect(partial.state).toBe('ok');
    expect(partial.problems).toEqual(['TreasuryDirect (last 30 days): TreasuryDirect: net::ERR_TIMED_OUT']);
    expect(partial.auctions).toHaveLength(10);
    const none = auctionsFrom(down, undefined, ok('<html>'));
    expect(none.state).toBe('error');
    expect(none.problems).toHaveLength(3);
    expect(auctionsFrom(ok(HISTORY), ok(RECENT), ok(UPCOMING)).problems).toEqual([]);
  });

  it('keeps a held auction whose result is not yet published with its kind, not under Upcoming', () => {
    const tips = find(history, '2026-10-22', '5-Year');
    expect(isUpcoming(tips, '2026-10-31')).toBe(false);
    expect(isUpcoming(tips, '2026-10-20')).toBe(true);
    expect(isUpcoming(find(upcoming, '2026-11-02', '13-Week'), '2026-11-02')).toBe(true);
    expect(isUpcoming(find(history, '2026-10-06', '3-Year'), '2026-10-01')).toBe(false);
  });

  it('opens from AUCTIONS and the alias AUCR', () => {
    expect(parseCommand('AUCR', lookupFn)).toEqual({ kind: 'route', fn: 'AUCTIONS' });
    expect(parseCommand('AUCTIONS', lookupFn)).toEqual({ kind: 'route', fn: 'AUCTIONS' });
  });
});
