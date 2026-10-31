import { describe, expect, it } from 'vitest';
import { cusipCheckDigit, cusipValid, isinCheckDigit, isinValid, sedolValid, US_STATES, usIsin } from '../src/core/identifiers';
import { fundIdentifiers, type SpdrHoldings } from '../src/data/live/index-members';

// Public identifiers of well-known listings (each company's own investor pages and the exchanges publish them).
describe('identifier check digits', () => {
  it("derives a US issuer's ISIN from its CUSIP", () => {
    expect(usIsin('037833100')).toBe('US0378331005'); // Apple
    expect(usIsin('594918104')).toBe('US5949181045'); // Microsoft
    expect(usIsin('67066G104')).toBe('US67066G1040'); // NVIDIA: a letter inside
    expect(usIsin('084670702')).toBe('US0846707026'); // Berkshire Hathaway class B
    expect(usIsin('037833101')).toBe('');
    expect(usIsin('03783310')).toBe('');
  });

  it('checks CUSIP, ISIN and SEDOL check digits', () => {
    expect(cusipCheckDigit('02079K30')).toBe('5');
    expect(cusipValid('02079K305')).toBe(true);
    expect(cusipValid('02079K306')).toBe(false);
    expect(isinCheckDigit('GB000989529')).toBe('2'); // AstraZeneca
    expect(isinValid('IE00B4BNMY34')).toBe(true); // Accenture
    expect(isinValid('US0378331006')).toBe(false);
    expect(sedolValid('2046251')).toBe(true); // Apple
    expect(sedolValid('B929F46')).toBe(true); // ASML
    expect(sedolValid('2046252')).toBe(false);
    expect(sedolValid('A046251')).toBe(false); // no vowels in a SEDOL
  });

  it("knows the SEC's codes for US states from its codes for countries", () => {
    expect(US_STATES.has('DE')).toBe(true);
    expect(US_STATES.has('DC')).toBe(true);
    expect(US_STATES.has('L2')).toBe(false); // Ireland
    expect(US_STATES.size).toBe(51);
  });
});

describe("codes from SPY's holdings", () => {
  const file: SpdrHoldings = { fund: 'SPY', asOf: '2026-10-29', at: 0, holdings: [
    { name: 'APPLE INC', ticker: 'AAPL', cusip: '037833100', sedol: '2046251', weight: 7, shares: 1, currency: 'USD' },
    { name: 'BAD CODES INC', ticker: 'BAD', cusip: '037833101', sedol: '2046251', weight: 1, shares: 1, currency: 'USD' },
    { name: 'NO SEDOL INC', ticker: 'NOS', cusip: '594918104', sedol: '-', weight: 1, shares: 1, currency: 'USD' },
  ] };

  it('gives a held stock its CUSIP and SEDOL with the file date, and nothing for codes that fail their checks', () => {
    expect(fundIdentifiers(file, 'AAPL')).toEqual({ cusip: '037833100', sedol: '2046251', asOf: '2026-10-29' });
    expect(fundIdentifiers(file, 'BAD')).toBeUndefined();
    expect(fundIdentifiers(file, 'NOS')).toEqual({ cusip: '594918104', sedol: '', asOf: '2026-10-29' });
    expect(fundIdentifiers(file, 'ZZZ')).toBeUndefined();
    expect(fundIdentifiers(undefined, 'AAPL')).toBeUndefined();
  });
});
