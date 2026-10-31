import { describe, expect, it } from 'vitest';
import { headOffice } from '../src/functions/DESEquity';

describe("PROFILE's head office line", () => {
  it('names the country once when the source already gives it', () => {
    // Yahoo's profile for a London company gives the city and the country, not a state.
    expect(headOffice('London, United Kingdom', 'GB')).toBe('London, United Kingdom');
    expect(headOffice('Basel, Switzerland', 'CH')).toBe('Basel, Switzerland');
  });

  it('adds the country code after a state', () => {
    expect(headOffice('Cupertino, CA', 'US')).toBe('Cupertino, CA, US');
    expect(headOffice('Toronto, ON', 'CA')).toBe('Toronto, ON, CA');
  });

  it('gives nothing without a city, and the city alone without a country', () => {
    expect(headOffice('', 'GB')).toBe('');
    expect(headOffice('London, United Kingdom', '')).toBe('London, United Kingdom');
  });
});
