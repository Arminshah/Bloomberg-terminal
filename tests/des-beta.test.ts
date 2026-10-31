import { describe, expect, it } from 'vitest';
import { betaLine } from '../src/functions/DESEquity';

describe("PROFILE's beta line names the index the beta is measured against", () => {
  const none = () => NaN;

  it('gives a US stock the two-year weekly adjusted beta against the S&P 500, as DES does, not the source\'s five-year monthly one', () => {
    // A public DES capture of March 2023 shows Apple's "Beta vs SPX 1.17", BETA's adjusted figure (raw 1.258, 103 weeks).
    expect(betaLine('US', 1.069, () => 1.2, 'SPX', true)).toMatchObject({ label: 'Beta vs SPX', value: 1.2, worked: true });
    // Without enough history, the source's beta under a plain label.
    expect(betaLine('US', 1.069, () => NaN, 'SPX', true)).toMatchObject({ label: 'Beta', value: 1.069, worked: false });
  });

  it("gives a London stock the beta against the FTSE 100, not the source's", () => {
    // Yahoo gave GSK 0.28 on 31 October 2026; five years of monthly returns on the FTSE 100 give 0.95.
    const line = betaLine('GB', 0.28, () => 0.91, 'UKX', true);
    expect(line).toMatchObject({ label: 'Beta vs UKX', value: 0.91, worked: true });
    expect(line.title).toContain('adjusted (0.67 x raw + 0.33)');
  });

  it('names no index when only the source has a beta for a stock outside the US', () => {
    expect(betaLine('GB', 0.28, none, 'UKX', true)).toMatchObject({ label: 'Beta', value: 0.28, worked: false });
  });

  it('gives the worked-out beta, marked, where the source has none, and a blank where neither has one', () => {
    expect(betaLine('US', NaN, () => 1.1, 'SPX', true)).toMatchObject({ label: 'Beta vs SPX', value: 1.1, worked: true });
    expect(betaLine('GB', NaN, none, 'UKX', true).value).toBeNaN();
  });
});
