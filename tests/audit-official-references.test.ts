import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const references = require('../scripts/live/audit/references.cjs') as {
  nasdaqOfficialRow: (json: unknown, day: string) => { day: string; open: number; high: number; low: number; close: number; volume: number } | null;
};

/** Nasdaq's historical answer for Apple, 29 October 2026, as read on 31 October (the 30 October row not yet published). */
const appleHistorical = { data: { tradesTable: { rows: [{ date: '10/29/2026', close: '$348.91', volume: '42,582,130', open: '$348.00', high: '$351.43', low: '$347.30' }] } } };

describe("Nasdaq's official historical row decides a disputed high or low", () => {
  it('reads the row of the session asked for, as numbers', () => {
    expect(references.nasdaqOfficialRow(appleHistorical, '2026-10-29')).toEqual({ day: '2026-10-29', open: 348, high: 351.43, low: 347.3, close: 348.91, volume: 42_582_130 });
  });

  it('gives nothing for a session not published yet, or a row that cannot be read', () => {
    // 31 October 2026: Apple's 342.35 low for 30 October (Yahoo's bars) against Tiingo's 334.35 waits for this row.
    expect(references.nasdaqOfficialRow(appleHistorical, '2026-10-30')).toBeNull();
    expect(references.nasdaqOfficialRow({ data: { tradesTable: { rows: [{ date: '10/29/2026', high: 'N/A', low: '$347.30' }] } } }, '2026-10-29')).toBeNull();
    expect(references.nasdaqOfficialRow({ data: { tradesTable: { rows: [{ date: '10/29/2026', high: '$340.00', low: '$347.30' }] } } }, '2026-10-29')).toBeNull();
    expect(references.nasdaqOfficialRow({ data: null }, '2026-10-29')).toBeNull();
  });
});
