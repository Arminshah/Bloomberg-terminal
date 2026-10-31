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

describe("PROFILE's market value and share counts, in millions as DES writes them", () => {
  it('gives one decimal, a separator and M at any size', async () => {
    const { inMillions } = await import('../src/functions/DESEquity');
    expect(inMillions(41_934.9)).toBe('41,934.9M');
    expect(inMillions(4_964.5)).toBe('4,964.5M');
    expect(inMillions(3_412_345.67)).toBe('3,412,345.7M');
    expect(inMillions(NaN)).toBe('--');
  });
});
