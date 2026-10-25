import { describe, expect, it } from 'vitest';
import { exchangeOfListing, usSession } from '../src/data/exchanges';
import { liveColumns, usSessionText } from '../src/components/SessionNow';

const at = (iso: string) => Date.parse(iso);

describe("US stocks' session now", () => {
  it('runs pre-market, regular, after hours and closed through a weekday (New York time)', () => {
    // Monday 26 October 2026; New York is UTC-4 until 1 November.
    expect(usSession(at('2026-10-26T07:00:00Z'))).toEqual({ phase: 'closed', closedFor: 'night', until: at('2026-10-26T08:00:00Z'), next: 'pre' }); // 03:00
    expect(usSession(at('2026-10-26T11:00:00Z'))).toEqual({ phase: 'pre', until: at('2026-10-26T13:30:00Z'), next: 'regular', from: '04:00', to: '09:30' }); // 07:00
    expect(usSession(at('2026-10-26T14:00:00Z'))).toEqual({ phase: 'regular', until: at('2026-10-26T20:00:00Z'), next: 'post', from: '09:30', to: '16:00' }); // 10:00
    expect(usSession(at('2026-10-26T21:00:00Z'))).toEqual({ phase: 'post', until: at('2026-10-27T00:00:00Z'), next: 'closed', from: '16:00', to: '20:00' }); // 17:00
    expect(usSession(at('2026-10-27T01:00:00Z'))).toEqual({ phase: 'closed', closedFor: 'night', until: at('2026-10-27T08:00:00Z'), next: 'pre' }); // 21:00
  });

  it('is closed from Friday evening to Monday 04:00, and over the weekend', () => {
    expect(usSession(at('2026-10-31T01:00:00Z'))).toMatchObject({ phase: 'closed', closedFor: 'night', until: at('2026-11-02T09:00:00Z') }); // Friday 21:00; Monday 04:00 is UTC-5
    expect(usSession(at('2026-10-24T15:00:00Z'))).toMatchObject({ phase: 'closed', closedFor: 'weekend', until: at('2026-10-26T08:00:00Z') });
  });

  it('keeps holidays closed and ends after hours at 17:00 on an early-close day', () => {
    expect(usSession(at('2026-11-26T17:00:00Z'))).toEqual({ phase: 'closed', closedFor: 'holiday', holiday: 'Thanksgiving Day', until: at('2026-11-27T09:00:00Z'), next: 'pre' });
    // Friday 27 November closes at 13:00; its after hours run to 17:00.
    expect(usSession(at('2026-11-27T17:00:00Z'))).toMatchObject({ phase: 'regular', until: at('2026-11-27T18:00:00Z'), to: '13:00' }); // 12:00
    expect(usSession(at('2026-11-27T19:00:00Z'))).toMatchObject({ phase: 'post', until: at('2026-11-27T22:00:00Z'), from: '13:00', to: '17:00' }); // 14:00
    expect(usSession(at('2026-11-27T22:30:00Z'))).toMatchObject({ phase: 'closed', closedFor: 'night', until: at('2026-11-30T09:00:00Z') }); // 17:30
  });

  it('follows New York across the change of clocks', () => {
    // 1 November 2026: New York goes to UTC-5. The open on Monday 2 November is 14:30 UTC.
    expect(usSession(at('2026-11-02T14:29:00Z')).phase).toBe('pre');
    expect(usSession(at('2026-11-02T14:30:00Z')).phase).toBe('regular');
  });
});

describe('which column is live, and what the line says', () => {
  it('marks the pre-market, last or after-hours columns', () => {
    expect(liveColumns('pre')).toEqual(['ARMIN_PRE_MARKET', 'ARMIN_PRE_PX']);
    expect(liveColumns('regular')).toEqual(['PX_LAST']);
    expect(liveColumns('post')).toEqual(['ARMIN_AFTER_HOURS', 'ARMIN_POST_PX']);
    expect(liveColumns('closed')).toEqual([]);
  });

  it('names the session, the time left and the column to read', () => {
    const pre = usSessionText(at('2026-10-26T11:00:00Z'), ['PX_LAST', 'ARMIN_PRE_MARKET']);
    expect(pre).toMatchObject({ phase: 'pre', label: 'PRE-MARKET' });
    expect(pre.text).toBe('pre-market, 04:00 to 09:30 New York · the regular session opens in 2:30:00 · Pre-mkt is live; Last is the previous close');
    // Without the column, it says how to add it; with IEX prices, the last price is IEX's latest trade.
    expect(usSessionText(at('2026-10-26T11:00:00Z'), ['PX_LAST'], true).text).toContain('Pre-mkt is live (not among the columns: 94) Columns adds it); Last is IEX\'s latest trade, outside the regular session too');
    expect(usSessionText(at('2026-10-26T14:00:00Z'), []).text).toBe('regular session, 09:30 to 16:00 New York · closes in 6:00:00 · Last is live');
    expect(usSessionText(at('2026-10-24T15:00:00Z'), []).text).toBe('closed for the weekend · pre-market opens Mon 04:00 New York (in 1d 17h 00m) · nothing is live: Last is the latest close, After hrs the last after-hours trade');
    expect(usSessionText(at('2026-11-26T17:00:00Z'), []).text).toContain('closed for Thanksgiving Day · pre-market opens Fri 04:00 New York');
  });

  it("knows a listing's exchange by its code", () => {
    expect(exchangeOfListing('AAPL US')?.id).toBe('US');
    expect(exchangeOfListing('ASML NA')?.id).toBe('EU');
    expect(exchangeOfListing('SHEL LN')?.id).toBe('GB');
    expect(exchangeOfListing('SAP GY')?.id).toBe('DE');
    expect(exchangeOfListing('7203 JT')?.id).toBe('JP');
    expect(exchangeOfListing('2330 TT')).toBeUndefined();
  });
});
