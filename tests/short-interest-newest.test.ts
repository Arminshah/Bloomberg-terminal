import { describe, expect, it } from 'vitest';
import { fillSummary, nasdaqSummaryPatch, preferNewerShort, type NasdaqShort } from '../src/data/live/nasdaq-company';
import { floatStats } from '../src/data/live/yfund';

// From the data audit of 28 October 2026, checked against FINRA's figures on Nasdaq's page.

describe('DES short interest: the newest settlement, as SI shows it', () => {
  // Apple: Yahoo's key statistics still had the 30 September settlement; FINRA (Nasdaq's page) had 15 October's.
  const D = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const yahoo = {
    quoteSummary: {
      result: [
        {
          defaultKeyStatistics: {
            floatShares: { raw: 14_568_000_000 },
            sharesShort: { raw: 120_763_539 },
            shortRatio: { raw: 2.8 },
            shortPercentOfFloat: { raw: 0.0083 },
            dateShortInterest: { raw: D('2026-09-30') / 1000 },
            sharesShortPriorMonth: { raw: 139_749_097 },
            sharesShortPreviousMonthDate: { raw: D('2026-08-31') / 1000 },
          },
        },
      ],
    },
  };
  const finra: NasdaqShort[] = [
    { date: D('2026-10-15'), shares: 131_591_865, avgVolume: 35_498_663, daysToCover: 3.706953 },
    { date: D('2026-09-30'), shares: 120_763_539, avgVolume: 39_858_260, daysToCover: 3.029825 },
    { date: D('2026-09-15'), shares: 128_753_092, avgVolume: 45_135_477, daysToCover: 2.852592 },
  ];
  const ks = (summary: unknown) => (summary as typeof yahoo).quoteSummary.result[0].defaultKeyStatistics;

  it("takes FINRA's settlement when it is newer than Yahoo's", () => {
    const merged = fillSummary(preferNewerShort(yahoo, finra), nasdaqSummaryPatch({ short: finra })).summary;
    const f = floatStats(ks(merged));
    expect(f.short).toBe(131_591_865);
    expect(f.asOf).toBe(D('2026-10-15'));
    expect(f.daysToCover).toBeCloseTo(3.71, 2);
    // The share of the float is worked out again from the newer count (and marked as calculated).
    expect(f.shortPctFloatCalculated).toBe(true);
    expect(f.shortPctFloat).toBeCloseTo(0.903, 3);
  });

  it("keeps Yahoo's when it is as new or newer, and leaves the summary alone without FINRA's", () => {
    expect(preferNewerShort(yahoo, finra.slice(1))).toBe(yahoo);
    expect(preferNewerShort(yahoo, [])).toBe(yahoo);
    expect(preferNewerShort(yahoo, null)).toBe(yahoo);
  });
});
