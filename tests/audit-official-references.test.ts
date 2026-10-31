import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const references = require('../scripts/live/audit/references.cjs') as {
  nasdaqOfficialRow: (json: unknown, day: string) => { day: string; open: number; high: number; low: number; close: number; volume: number } | null;
  officialRowPath: (day: string) => string;
  coverShares: (facts: unknown, day: string, maxAgeDays?: number) => { shares: number; asOf: string; form: string; filed: string; accession: string; cik: number; entity: string } | null;
  splitSince: (bars: { day: string; splitFactor?: number }[], asOf: string, day: string) => boolean;
};

/** Nasdaq's historical answer for Apple, 29 October 2026, as read on 31 October (the 30 October row not yet published). */
const appleHistorical = { data: { tradesTable: { rows: [{ date: '10/29/2026', close: '$348.91', volume: '42,582,130', open: '$348.00', high: '$351.43', low: '$347.30' }] } } };

describe("Nasdaq's official historical row decides a disputed high or low", () => {
  it('reads the row of the session asked for, as numbers', () => {
    expect(references.nasdaqOfficialRow(appleHistorical, '2026-10-29')).toEqual({ day: '2026-10-29', open: 348, high: 351.43, low: 347.3, close: 348.91, volume: 42_582_130 });
  });

  it('asks for the week ending on the session, as Nasdaq refuses a range of one day', () => {
    // fromdate=2026-10-30&todate=2026-10-30 answered HTTP 400 on 31 October 2026; the week to 30 October gave its row.
    expect(references.officialRowPath('2026-10-30')).toBe('historical?assetclass=stocks&fromdate=2026-10-23&todate=2026-10-30&limit=10');
    expect(references.officialRowPath('2026-03-02')).toBe('historical?assetclass=stocks&fromdate=2026-02-23&todate=2026-03-02&limit=10');
  });

  it('gives nothing for a session not published yet, or a row that cannot be read', () => {
    // 31 October 2026: Apple's 342.35 low for 30 October (Yahoo's bars) against Tiingo's 334.35 waits for this row.
    expect(references.nasdaqOfficialRow(appleHistorical, '2026-10-30')).toBeNull();
    expect(references.nasdaqOfficialRow({ data: { tradesTable: { rows: [{ date: '10/29/2026', high: 'N/A', low: '$347.30' }] } } }, '2026-10-29')).toBeNull();
    expect(references.nasdaqOfficialRow({ data: { tradesTable: { rows: [{ date: '10/29/2026', high: '$340.00', low: '$347.30' }] } } }, '2026-10-29')).toBeNull();
    expect(references.nasdaqOfficialRow({ data: null }, '2026-10-29')).toBeNull();
  });
});

describe('the market value from the SEC cover count', () => {
  const facts = (shares: { end: string; val: number; form?: string; filed?: string; accn?: string }[], cik = 1045810, entityName = 'NVIDIA CORP') => ({
    cik,
    entityName,
    facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: shares.map((x) => ({ form: '10-Q', filed: '2026-08-26', accn: '0001045810-26-000000', ...x })) } } } },
  });

  it("takes the latest cover count on or before the session: NVIDIA's 24.1 billion of 21 August 2026", () => {
    const f = facts([{ end: '2026-05-15', val: 24_200_000_000, filed: '2026-05-20' }, { end: '2026-08-21', val: 24_100_000_000 }]);
    expect(references.coverShares(f, '2026-10-30')).toMatchObject({ shares: 24_100_000_000, asOf: '2026-08-21', form: '10-Q', cik: 1045810, entity: 'NVIDIA CORP' });
    // 24.1 billion × 204.64 is the market value the app showed (about $4.93 trillion), not Nasdaq's $5.149 trillion.
    expect((24_100_000_000 * 204.64) / 1e12).toBeCloseTo(4.932, 3);
    // A cover dated after the session is not used for it.
    expect(references.coverShares(f, '2026-08-20')).toMatchObject({ asOf: '2026-05-15' });
  });

  it("uses the holding company's cover when the SEC files Exxon under it: 4,111,911,960 shares", () => {
    const f = facts([{ end: '2026-06-30', val: 4_111_911_960, filed: '2026-08-03', accn: '0000034088-26-000093' }], 2115436, 'ExxonMobil Holdings Corp');
    const c = references.coverShares(f, '2026-10-30')!;
    expect(c).toMatchObject({ shares: 4_111_911_960, entity: 'ExxonMobil Holdings Corp', accession: '0000034088-26-000093' });
    expect(c.shares * 187.25).toBe(769_955_514_510);
  });

  it('gives no count for several share classes on one date, a cover too old, or none at all', () => {
    expect(references.coverShares(facts([{ end: '2026-07-20', val: 5_800_000_000 }, { end: '2026-07-20', val: 860_000_000 }]), '2026-10-30')).toBeNull();
    expect(references.coverShares(facts([{ end: '2026-04-01', val: 24_100_000_000 }]), '2026-10-30')).toBeNull();
    expect(references.coverShares({ facts: {} }, '2026-10-30')).toBeNull();
  });

  it('notices a split between the cover date and the session', () => {
    const bars = [{ day: '2026-08-20', splitFactor: 1 }, { day: '2026-09-10', splitFactor: 4 }, { day: '2026-10-30', splitFactor: 1 }];
    expect(references.splitSince(bars, '2026-08-21', '2026-10-30')).toBe(true);
    expect(references.splitSince(bars, '2026-09-10', '2026-10-30')).toBe(false);
  });
});
