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

describe("FINANCIALS graph mode's measuring line, as FA labels it", () => {
  it('gives the total change and the compound annual change over the calendar days between the period ends', async () => {
    const { measureChange } = await import('../src/functions/FA');
    // Two fiscal years that include a 29 February: 731 days.
    const m = measureChange(100, 194.41, Date.parse('2014-12-31T00:00:00Z'), Date.parse('2016-12-31T00:00:00Z'));
    expect(m.total).toBeCloseTo(94.41, 9);
    expect(m.annual).toBeCloseTo((Math.pow(1.9441, 365 / 731) - 1) * 100, 9);
    expect(m.text).toBe('+94.41% (+39.37%ann.)');
    expect(measureChange(100, 80, Date.parse('2024-12-31T00:00:00Z'), Date.parse('2025-12-31T00:00:00Z')).text).toBe('-20.00% (-20.00%ann.)');
    expect(measureChange(-5, 10, 0, 365 * 86_400_000).text).toBe('');
  });
});

describe("FINANCIALS' past market value takes the shares outstanding at the period end", () => {
  it('uses the balance-sheet count dated at the end, else the cover count nearest it, in today\'s shares', async () => {
    const { sharesAtPeriodEnd } = await import('../src/data/marketcap');
    const { BALANCE_SHARES, COVER_SHARES } = await import('../src/data/live/sec');
    const facts = (balance: { end: string; val: number; filed: string }[], cover: { end: string; val: number; filed: string }[]) =>
      ({ facts: { [BALANCE_SHARES]: { shares: balance }, [COVER_SHARES]: { shares: cover } } }) as never;
    const cf = facts(
      [{ end: '2024-12-31', val: 1_000, filed: '2025-02-20' }, { end: '2025-12-31', val: 980, filed: '2026-02-19' }],
      [{ end: '2026-02-10', val: 975, filed: '2026-02-19' }, { end: '2025-10-20', val: 985, filed: '2025-10-30' }],
    );
    // The balance sheet's count at 31 December 2025, not the cover filed before it (985 on 20 October).
    expect(sharesAtPeriodEnd(cf, '2025-12-31', [])).toBe(980);
    // A period with no balance-sheet count takes the cover dated nearest it within 100 days.
    expect(sharesAtPeriodEnd(cf, '2026-03-31', [])).toBe(975);
    expect(sharesAtPeriodEnd(cf, '2023-06-30', [])).toBeNaN();
    // A 4-for-1 split after the period end puts the count in today's shares.
    expect(sharesAtPeriodEnd(cf, '2024-12-31', [{ day: Date.parse('2025-06-02T00:00:00Z') / 86_400_000, numerator: 4, denominator: 1 }])).toBe(4_000);
  });
});
