import { describe, expect, it } from 'vitest';
import { easter, EU_MARKET, euronextDays, exchangeStatus, fmtCountdown, JPX_MARKET, LSE_MARKET, nyseDays, sessionAt, US_MARKET } from '../src/data/exchanges';

const dates = (days: { date: string; close?: string }[], early: boolean) => days.filter((d) => !!d.close === early).map((d) => d.date);

describe('exchange calendars', () => {
  it('finds Easter', () => {
    expect(easter(2025)).toEqual([3, 20]);
    expect(easter(2026)).toEqual([3, 5]);
    expect(easter(2027)).toEqual([2, 28]);
    expect(easter(2028)).toEqual([3, 16]);
  });

  // As nyse.com lists them ("Holidays and Trading Hours", read 14 October 2026).
  it('matches the NYSE holiday and early-close tables', () => {
    expect(dates(nyseDays(2026), false)).toEqual(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);
    expect(dates(nyseDays(2026), true)).toEqual(['2026-11-27', '2026-12-24']);
    expect(dates(nyseDays(2027), false)).toEqual(['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
    expect(dates(nyseDays(2027), true)).toEqual(['2027-11-26']);
    // 1 January 2028 is a Saturday: no New Year's Day holiday is observed.
    expect(dates(nyseDays(2028), false)).toEqual(['2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25']);
    expect(dates(nyseDays(2028), true)).toEqual(['2028-07-03', '2028-11-24']);
    expect(nyseDays(2027).find((d) => d.date === '2027-12-24')?.name).toBe('Christmas Day (observed)');
  });

  // As euronext.com lists them for Amsterdam, Brussels, Lisbon and Paris (read 14 October 2026).
  it('matches the Euronext holiday and half-day lists', () => {
    expect(dates(euronextDays(2025), false)).toEqual(['2025-01-01', '2025-04-18', '2025-04-21', '2025-05-01', '2025-12-25', '2025-12-26']);
    expect(dates(euronextDays(2025), true)).toEqual(['2025-12-24', '2025-12-31']);
    // 26 December 2026 is a Saturday.
    expect(dates(euronextDays(2026), false)).toEqual(['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-12-25']);
    expect(dates(euronextDays(2026), true)).toEqual(['2026-12-24', '2026-12-31']);
    expect(euronextDays(2026).find((d) => d.date === '2026-12-24')?.close).toBe('14:05');
  });
});

describe('market sessions', () => {
  const at = (iso: string) => Date.parse(iso);

  it('says when each market opens and closes on an ordinary day', () => {
    // Wednesday 14 October 2026, 04:41 UTC: New York is on EDT (UTC-4), Brussels on CEST (UTC+2).
    expect(sessionAt(US_MARKET, at('2026-10-14T04:41:00Z'))).toEqual({ open: false, at: at('2026-10-14T13:30:00Z') });
    expect(sessionAt(EU_MARKET, at('2026-10-14T04:41:00Z'))).toEqual({ open: false, at: at('2026-10-14T07:00:00Z') });
    expect(sessionAt(US_MARKET, at('2026-10-14T14:00:00Z'))).toEqual({ open: true, at: at('2026-10-14T20:00:00Z') });
    expect(sessionAt(EU_MARKET, at('2026-10-14T14:00:00Z'))).toEqual({ open: true, at: at('2026-10-14T15:30:00Z') });
    // The closing minute itself belongs to the next session.
    expect(sessionAt(EU_MARKET, at('2026-10-14T15:30:00Z')).open).toBe(false);
  });

  it('skips the weekend', () => {
    expect(sessionAt(US_MARKET, at('2026-10-16T21:00:00Z'))).toEqual({ open: false, at: at('2026-10-19T13:30:00Z') });
  });

  it('follows each side of the Atlantic changing clocks on different dates', () => {
    // Europe is on CET from 25 October 2026, New York stays on EDT until 1 November.
    expect(sessionAt(EU_MARKET, at('2026-10-26T07:30:00Z'))).toEqual({ open: false, at: at('2026-10-26T08:00:00Z') });
    expect(sessionAt(US_MARKET, at('2026-10-26T07:30:00Z')).at).toBe(at('2026-10-26T13:30:00Z'));
    expect(sessionAt(US_MARKET, at('2026-11-02T07:30:00Z')).at).toBe(at('2026-11-02T14:30:00Z'));
  });

  it('knows holidays and early closes', () => {
    const thanksgiving = sessionAt(US_MARKET, at('2026-11-26T15:00:00Z'));
    expect(thanksgiving.open).toBe(false);
    expect(thanksgiving.today?.name).toBe('Thanksgiving Day');
    expect(thanksgiving.at).toBe(at('2026-11-27T14:30:00Z'));
    expect(thanksgiving.earlyClose).toBe('13:00');
    expect(sessionAt(US_MARKET, at('2026-11-27T17:30:00Z'))).toMatchObject({ open: true, at: at('2026-11-27T18:00:00Z'), earlyClose: '13:00' });
    expect(sessionAt(EU_MARKET, at('2026-12-24T12:00:00Z'))).toMatchObject({ open: true, at: at('2026-12-24T13:05:00Z'), earlyClose: '14:05' });
    // Good Friday and Easter Monday: Euronext reopens on Tuesday.
    expect(sessionAt(EU_MARKET, at('2026-04-03T10:00:00Z'))).toMatchObject({ open: false, at: at('2026-04-07T07:00:00Z') });
    expect(sessionAt(US_MARKET, at('2026-04-03T15:00:00Z'))).toMatchObject({ open: false, at: at('2026-04-06T13:30:00Z') });
  });

  it('writes the time left', () => {
    expect(fmtCountdown(3_600_000)).toBe('1:00:00');
    expect(fmtCountdown(600)).toBe('0:00:01');
    expect(fmtCountdown(((2 * 24 + 17) * 60 + 5) * 60_000)).toBe('2d 17h 05m');
    expect(fmtCountdown(NaN)).toBe('--');
  });
});

describe('exchange status (EXCH)', () => {
  const at = (iso: string) => Date.parse(iso);

  it('gives the local time, whether the session is open and when that changes', () => {
    // Wednesday 14 October 2026, 14:00 UTC: 10:00 in New York, 16:00 in Brussels, 23:00 in Tokyo.
    const now = at('2026-10-14T14:00:00Z');
    expect(exchangeStatus(US_MARKET, now)).toEqual({ state: 'OPEN', localDate: '2026-10-14', localTime: '10:00', nextAt: at('2026-10-14T20:00:00Z'), uncovered: false });
    expect(exchangeStatus(EU_MARKET, now)).toMatchObject({ state: 'OPEN', localTime: '16:00', nextAt: at('2026-10-14T15:30:00Z') });
    expect(exchangeStatus(JPX_MARKET, now)).toMatchObject({ state: 'CLOSED', localDate: '2026-10-14', localTime: '23:00', nextAt: at('2026-10-15T00:00:00Z') });
  });

  it('tells a holiday from the weekend and keeps an early close', () => {
    expect(exchangeStatus(US_MARKET, at('2026-11-26T15:00:00Z'))).toMatchObject({ state: 'HOLIDAY', today: { name: 'Thanksgiving Day' }, earlyClose: '13:00' });
    expect(exchangeStatus(US_MARKET, at('2026-10-17T15:00:00Z'))).toMatchObject({ state: 'WEEKEND', nextAt: at('2026-10-19T13:30:00Z') });
    expect(exchangeStatus(LSE_MARKET, at('2026-12-24T10:00:00Z'))).toMatchObject({ state: 'OPEN', earlyClose: '12:30', nextAt: at('2026-12-24T12:30:00Z') });
  });

  it('says when a published holiday table no longer covers the next session', () => {
    expect(exchangeStatus(LSE_MARKET, at('2027-06-01T10:00:00Z')).uncovered).toBe(false);
    // The London table ends in 2027: from New Year's Eve 2027 the next session is in 2028.
    expect(exchangeStatus(LSE_MARKET, at('2027-12-31T15:00:00Z')).uncovered).toBe(true);
    // Rule-based calendars have no end.
    expect(exchangeStatus(US_MARKET, at('2031-03-03T15:00:00Z')).uncovered).toBe(false);
  });
});
