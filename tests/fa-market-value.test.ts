import { describe, expect, it } from 'vitest';
import { capAtPeriodEnd, type CapPoint } from '../src/data/marketcap';
import { periodEnterpriseValue, preferredAndOther } from '../src/functions/FA';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("FINANCIALS Key Stats' market value lines at each period's end", () => {
  // Closes on the last sessions of 2025: Wednesday 31 December was a session, the weekend before was not.
  const points: CapPoint[] = [day('2025-12-24'), day('2025-12-26'), day('2025-12-29'), day('2025-12-30'), day('2025-12-31'), day('2026-01-02')].map((t, i) => ({ t: t + 21 * 3_600_000, cap: (100 + i) * 1e9 }));

  it("takes the value on the last trading day on or before the period's end", () => {
    expect(capAtPeriodEnd(points, day('2025-12-31'))?.cap).toBe(104e9);
    // A year ending on a Sunday takes the Friday before.
    expect(capAtPeriodEnd(points, day('2025-12-28'))?.cap).toBe(101e9);
  });

  it('gives none when no close falls in the ten days before the end', () => {
    expect(capAtPeriodEnd(points, day('2025-12-10'))).toBeUndefined();
    expect(capAtPeriodEnd([], day('2025-12-31'))).toBeUndefined();
  });

  it('adds preferred stock and minority interest as "Preferred & Other", none when neither is listed', () => {
    expect(preferredAndOther({ preferred: 120, minority: 80 })).toBe(200);
    expect(preferredAndOther({ preferred: NaN, minority: 80 })).toBe(80);
    expect(preferredAndOther({ preferred: NaN, minority: undefined })).toBeNaN();
  });

  it('works the enterprise value as market value plus debt and preferred and other, less cash', () => {
    expect(periodEnterpriseValue(50_000, { cash: 2_000, debt: 10_000, preferred: 100, minority: 400 })).toBe(58_500);
    // A part the source does not list adds nothing; no value without the market value, the debt or the cash.
    expect(periodEnterpriseValue(50_000, { cash: 2_000, debt: 10_000, preferred: NaN, minority: undefined })).toBe(58_000);
    expect(periodEnterpriseValue(NaN, { cash: 2_000, debt: 10_000, preferred: 0, minority: 0 })).toBeNaN();
    expect(periodEnterpriseValue(50_000, { cash: NaN, debt: 10_000, preferred: 0, minority: 0 })).toBeNaN();
  });
});

describe("FINANCIALS figures as FA writes them", () => {
  it('gives money in millions with one decimal and a separator, at any size', async () => {
    const { faNumber } = await import('../src/functions/FA');
    expect(faNumber(20_292, {})).toBe('20,292.0');
    expect(faNumber(-791, {})).toBe('-791.0');
    expect(faNumber(37.6, { ratio: true })).toBe('37.6');
    expect(faNumber(2.7, { dec: 2 })).toBe('2.70');
  });
});
