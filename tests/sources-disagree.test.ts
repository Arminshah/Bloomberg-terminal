import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NextEarnings } from '../src/components/NextEarnings';
import { dividendDisagreement, nextEarningsDisagreement, type EarningsEvent } from '../src/data/fundamentals';
import { shareCountDisagreement } from '../src/data/live/share-check';
import type { CompanyFacts } from '../src/data/live/sec';
import { mergeConsensus, parseYahooEarnings } from '../src/data/live/consensus';
import { nasdaqData } from '../src/data/live/nasdaq-company';
import { engine } from '../src/data/market';
import tsm from './fixtures/yahoo-earnings-tsm.json';

// Where two sources give the same figure and differ, the screens say "Sources disagree" instead of picking one.
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe('Sources disagree: the next report date', () => {
  const yahoo = (() => {
    const r = parseYahooEarnings(tsm);
    if ('error' in r) throw new Error(r.error);
    return r.data;
  })();
  const now = day('2026-10-28') + 15 * 3_600_000;
  // Yahoo confirms 15 January 2027 before the open (06:30 in New York); Nasdaq the day before.
  const confirmed = { ...yahoo, next: { ...yahoo.next!, date: Date.parse('2027-01-15T11:30:00Z'), dateEstimated: false } };

  it("flags the consensus's next date when Yahoo and Nasdaq confirm different days for the same report", () => {
    const next = mergeConsensus({ yahoo: confirmed, nasdaqNext: { date: day('2027-01-14'), estimated: false, timing: 'Bef-mkt', end: '2026-12-31' }, now } as never).next!;
    expect(next.dateFrom).toBe('Yahoo Finance');
    expect(next.dateDisagree).toBe('Yahoo Finance confirms 2027-01-15; Nasdaq confirms 2027-01-14.');
  });

  it('says nothing when they agree, when either is an estimate, or when Nasdaq speaks of another report', () => {
    const merged = (nasdaqNext: object, y = confirmed) => mergeConsensus({ yahoo: y, nasdaqNext, now } as never).next!.dateDisagree;
    // The same New York day: a time stamp against a calendar date.
    expect(merged({ date: day('2027-01-15'), estimated: false, timing: 'Bef-mkt' })).toBeUndefined();
    expect(merged({ date: day('2027-01-14'), estimated: true, timing: '--' })).toBeUndefined();
    expect(merged({ date: day('2027-01-14'), estimated: false, timing: '--' }, { ...confirmed, next: { ...confirmed.next!, dateEstimated: true } })).toBeUndefined();
    expect(merged({ date: day('2027-04-16'), estimated: false, timing: '--', end: '2027-03-31' })).toBeUndefined();
  });

  it("flags BQ's and DES's next date the same way, from the quote's date and Nasdaq's", () => {
    const def = engine.get('AAPL US Equity')!;
    const ne: EarningsEvent = { period: 'Next', date: Date.parse('2026-11-02T21:30:00Z'), actual: null, timing: 'Aft-mkt', revAct: null };
    const set = (data: object) => nasdaqData.set((s) => ({ v: s.v + 1, by: { ...s.by, AAPL: { 'earnings-date': { state: 'ok', data } } } }));
    set({ date: day('2026-10-30'), estimated: false, timing: 'Aft-mkt' });
    expect(nextEarningsDisagreement(def, ne)).toBe('Yahoo Finance confirms 02/11/26 Aft-mkt; Nasdaq says 30/10/26 Aft-mkt.');
    // The same day, Nasdaq's estimate, Yahoo's estimate, Nasdaq's own date shown: nothing to flag.
    set({ date: day('2026-11-02'), estimated: false, timing: 'Aft-mkt' });
    expect(nextEarningsDisagreement(def, ne)).toBeUndefined();
    set({ date: day('2026-10-30'), estimated: true, timing: '--' });
    expect(nextEarningsDisagreement(def, ne)).toBeUndefined();
    set({ date: day('2026-10-30'), estimated: false, timing: '--' });
    expect(nextEarningsDisagreement(def, { ...ne, approx: true })).toBeUndefined();
    expect(nextEarningsDisagreement(def, { ...ne, from: 'Nasdaq' })).toBeUndefined();
    // On screen: "Sources disagree" with both dates on hover, in place of either date.
    set({ date: day('2026-10-30'), estimated: false, timing: 'Aft-mkt' });
    const html = renderToStaticMarkup(createElement(NextEarnings, { sec: def, ne }));
    expect(html).toContain('>Sources disagree<');
    expect(html).toContain('title="Yahoo Finance confirms 02/11/26 Aft-mkt; Nasdaq says 30/10/26 Aft-mkt."');
    expect(html).not.toContain('02/11/26 Aft-mkt<');
    nasdaqData.set((s) => ({ v: s.v + 1, by: {} }));
    expect(nextEarningsDisagreement(def, ne)).toBeUndefined();
    expect(renderToStaticMarkup(createElement(NextEarnings, { sec: def, ne }))).toBe('02/11/26 Aft-mkt');
  });
});

describe('Sources disagree: a dividend', () => {
  const row = { ex: day('2026-08-11'), pay: day('2026-08-14'), amount: 0.26 };
  it("lists what Yahoo's price history and Nasdaq's record say differently about one dividend", () => {
    expect(dividendDisagreement(row, { ex: day('2026-08-11'), pay: day('2026-08-14'), amount: 0.26 })).toBeUndefined();
    // Yahoo stores some amounts as single-precision floats: 29.179998 for 29.18 is the same amount.
    expect(dividendDisagreement({ ...row, amount: 29.179998 }, { ...row, amount: 29.18 })).toBeUndefined();
    expect(dividendDisagreement(row, { ex: day('2026-08-12'), pay: day('2026-08-15'), amount: 0.25 })).toBe(
      'The sources disagree: ex-date 11/08/26 (Yahoo Finance) against 12/08/26 (Nasdaq); payable 14/08/26 (Yahoo Finance) against 15/08/26 (Nasdaq); amount 0.26 (Yahoo Finance) against 0.25 (Nasdaq).',
    );
    // A date one source leaves out is no disagreement.
    expect(dividendDisagreement({ ...row, pay: NaN }, { ...row, pay: day('2026-08-20') })).toBeUndefined();
  });

  it("compares amounts on today's share basis after a split: Broadcom's March 2018 dividend", () => {
    // Broadcom paid $1.75 a share on 21 March 2018 (Nasdaq's record); after its 10:1 split of July 2024 that is 0.175.
    // Yahoo's price history gave 0.35 on 28 October 2026, twice the dividend: the screen now says the sources disagree.
    const mar18 = { ex: day('2018-03-21'), pay: day('2018-03-29') };
    expect(dividendDisagreement({ ...mar18, amount: 0.35 }, { ...mar18, amount: 1.75 }, 10)).toBe("The sources disagree: amount 0.35 (Yahoo Finance) against 0.175 (Nasdaq's 1.75 as paid, on today's share basis).");
    expect(dividendDisagreement({ ...mar18, amount: 0.175 }, { ...mar18, amount: 1.75 }, 10)).toBeUndefined();
    // A split's adjustment rounded by Yahoo: 0.40 after a 3:1 split, 0.133333.
    expect(dividendDisagreement({ ...row, amount: 0.133333 }, { ...row, amount: 0.4 }, 3)).toBeUndefined();
  });
});

describe('Sources disagree: the share count behind a market value', () => {
  const now = Date.parse('2026-10-28T20:00:00Z');
  const facts = (rows: { end: string; val: number; accn: string; form?: string; filed?: string }[]): CompanyFacts =>
    ({ cik: 59478, name: 'ELI LILLY & Co', facts: { 'dei:EntityCommonStockSharesOutstanding': { shares: rows.map((r) => ({ form: '10-Q', filed: '2026-08-05', ...r })) } } }) as unknown as CompanyFacts;
  it("flags Eli Lilly: Yahoo's 891.4M shares against 941.4M on its 10-Q's cover", () => {
    const lly = facts([{ end: '2026-04-27', val: 941_741_406, accn: 'a', filed: '2026-04-30' }, { end: '2026-08-03', val: 941_357_065, accn: 'b' }]);
    expect(shareCountDisagreement(891.357065, lly, now)).toBe("Yahoo Finance's market value counts 891.36M shares; the company's 10-Q filed 05/08/26 gives 941.36M on its cover, as of 03/08/26.");
    // Within 2%: the same count on different dates.
    expect(shareCountDisagreement(935, lly, now)).toBeUndefined();
  });

  it('says nothing for several classes on one cover, an old cover, or no count', () => {
    const classes = facts([{ end: '2026-07-20', val: 5_800_000_000, accn: 'g' }, { end: '2026-07-20', val: 5_400_000_000, accn: 'g' }]);
    expect(shareCountDisagreement(12_100, classes, now)).toBeUndefined();
    expect(shareCountDisagreement(891, facts([{ end: '2026-01-02', val: 941_000_000, accn: 'x' }]), now)).toBeUndefined();
    expect(shareCountDisagreement(NaN, facts([{ end: '2026-08-03', val: 941_000_000, accn: 'b' }]), now)).toBeUndefined();
    expect(shareCountDisagreement(891, null, now)).toBeUndefined();
  });
});
