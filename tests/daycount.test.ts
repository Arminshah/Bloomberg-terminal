import { describe, expect, it } from 'vitest';
import {
  accruedInterest, analytics, cleanFromYield, cleanPricer, days30360, days30E360, defaultSettlementLag, DAY_COUNTS, dirtyFromYield,
  settlementDate, yieldFromClean, type BondTerms, type DayCount,
} from '../src/finance/bonds';
import { bondSpreadValue } from '../src/finance/bond-spreads';
import { contractDate as date, parseZeroCurve } from '../src/finance/contracts';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Examples 1-3 of ISDA, "30/360 Day Count Conventions" (22 December 2008,
 * https://www.isda.org/2008/12/22/30-360-day-count-conventions/), as reproduced in QuantLib's test-suite/daycounters.cpp
 * (testThirty360_BondBasis and testThirty360_EurobondBasis). The third column is 30/360 US with the SIA end-of-month
 * rules for an end-of-month bond, the same dates as tabulated at https://en.wikipedia.org/wiki/Day_count_convention#30/360_US
 * and in QuantLib's testThirty360_USA.
 */
const ISDA_30_360: [start: string, end: string, bondBasis: number, eurobond: number, us: number][] = [
  ['2006-08-20', '2007-02-20', 180, 180, 180], ['2007-02-20', '2007-08-20', 180, 180, 180], ['2007-08-20', '2008-02-20', 180, 180, 180],
  ['2008-02-20', '2008-08-20', 180, 180, 180], ['2008-08-20', '2009-02-20', 180, 180, 180], ['2009-02-20', '2009-08-20', 180, 180, 180],
  ['2006-08-31', '2007-02-28', 178, 178, 178], ['2007-02-28', '2007-08-31', 183, 182, 180], ['2007-08-31', '2008-02-29', 179, 179, 179],
  ['2008-02-29', '2008-08-31', 182, 181, 180], ['2008-08-31', '2009-02-28', 178, 178, 178], ['2009-02-28', '2009-08-31', 183, 182, 180],
  ['2006-01-31', '2006-02-28', 28, 28, 28], ['2006-01-30', '2006-02-28', 28, 28, 28], ['2006-02-28', '2006-03-03', 5, 5, 3],
  ['2006-02-14', '2006-02-28', 14, 14, 14], ['2006-09-30', '2006-10-31', 30, 30, 30], ['2006-10-31', '2006-11-28', 28, 28, 28],
  ['2007-08-31', '2008-02-28', 178, 178, 178], ['2008-02-28', '2008-08-28', 180, 180, 180], ['2008-02-28', '2008-08-30', 182, 182, 182],
  ['2008-02-28', '2008-08-31', 183, 182, 183], ['2007-02-26', '2008-02-28', 362, 362, 362], ['2007-02-26', '2008-02-29', 363, 363, 363],
  ['2008-02-29', '2009-02-28', 359, 359, 360], ['2008-02-28', '2008-03-30', 32, 32, 32], ['2008-02-28', '2008-03-31', 33, 32, 33],
];

describe('30/360 day counts', () => {
  it.each(ISDA_30_360)('%s to %s: bond basis %i, 30E/360 %i, 30/360 US (SIA, end of month) %i', (a, b, bondBasis, eurobond, us) => {
    expect(days30360(date(a), date(b))).toBe(bondBasis);
    expect(days30E360(date(a), date(b))).toBe(eurobond);
    expect(days30360(date(a), date(b), true)).toBe(us);
  });

  it('matches the rest of ISDA’s 30E/360 end-of-February series', () => {
    // ISDA 2008, Example 2 under the Eurobond basis (QuantLib testThirty360_EurobondBasis).
    const rows: [string, string, number][] = [['2006-02-28', '2006-08-31', 182], ['2009-08-31', '2010-02-28', 178], ['2010-02-28', '2010-08-31', 182],
      ['2010-08-31', '2011-02-28', 178], ['2011-02-28', '2011-08-31', 182], ['2011-08-31', '2012-02-29', 179]];
    for (const [a, b, n] of rows) expect(days30E360(date(a), date(b)), `${a} ${b}`).toBe(n);
  });
});

describe('accrued interest and price on each basis', () => {
  it('reproduces Excel’s published 30/360 ACCRINT example', () => {
    // Microsoft Excel ACCRINT documentation: accrual from 1 Mar 2008 to settlement 1 May 2008, 10% semiannual, par 1000,
    // basis 0 (30/360) -> 16.666667; with accrual from 5 Mar 2008 -> 15.555556. Here 1 Mar is the previous coupon.
    const terms: BondTerms = { coupon: 10, maturity: date('2010-03-01'), freq: 2, basis: '30/360' };
    expect(accruedInterest(terms, date('2008-05-01')) * 10).toBeCloseTo(16.666667, 6);
    expect(analytics(terms, date('2008-05-01'), 10).accruedDays).toBe(60);
    const march5 = { ...terms, maturity: date('2010-03-05') };
    expect(accruedInterest(march5, date('2008-05-01')) * 10).toBeCloseTo(15.555556, 6);
  });

  it('reproduces Excel’s published 30/360 PRICE and YIELD examples', () => {
    // Microsoft Excel PRICE documentation: settlement 15 Feb 2008, maturity 15 Nov 2017, 5.75% semiannual, yield 6.50%,
    // redemption 100, basis 0 -> $94.63 (94.63436162 at full precision: A = 90, E = 180, DSC = 90, N = 20).
    const price: BondTerms = { coupon: 5.75, maturity: date('2017-11-15'), freq: 2, basis: '30/360' };
    const settle = date('2008-02-15');
    expect(cleanFromYield(price, settle, 6.5)).toBeCloseTo(94.63, 2);
    expect(cleanFromYield(price, settle, 6.5)).toBeCloseTo(94.63436162, 8);
    expect(cleanPricer(price, settle)(6.5)).toBeCloseTo(94.63436162, 8);
    // Excel YIELD documentation: same coupon and settlement, maturity 15 Nov 2016, price 95.04287, basis 0 -> 6.5%.
    expect(yieldFromClean({ ...price, maturity: date('2016-11-15') }, settle, 95.04287)).toBeCloseTo(6.5, 5);
  });

  it('counts Actual/Actual ICMA days like Excel’s published COUPDAYBS, COUPDAYS and COUPDAYSNC examples', () => {
    // Microsoft Excel documentation, settlement 25 Jan 2011, maturity 15 Nov 2011, semiannual, basis 1 (actual/actual):
    // COUPDAYBS 71, COUPDAYS 181, COUPDAYSNC 110.
    const terms: BondTerms = { coupon: 4, maturity: date('2011-11-15'), freq: 2, basis: 'ACT/ACT ICMA' };
    const a = analytics(terms, date('2011-01-25'), 4);
    expect([a.accruedDays, a.periodDays]).toEqual([71, 181]);
    expect(a.fraction).toBeCloseTo(110 / 181, 12);
    expect(a.accrued).toBeCloseTo(2 * 71 / 181, 12);
  });

  it('is ICMA, not ISDA: a regular period accrues a full coupon across a year end', () => {
    // ISDA, "EMU and market conventions: recent developments" (1998), regular period 1 Nov 2003 - 1 May 2004:
    // ACT/ACT ISMA year fraction 182 / (182 × 2) = 0.5; ACT/ACT ISDA gives 61/365 + 121/366 = 0.497724.
    const terms: BondTerms = { coupon: 10, maturity: date('2010-05-01'), freq: 2 };
    const start = analytics(terms, date('2003-11-01'), 10);
    // Year fraction of the whole regular period: its days / (frequency × its days).
    expect(start.fraction * start.periodDays / (2 * start.periodDays)).toBe(0.5);
    expect(accruedInterest(terms, date('2004-04-30'))).toBeCloseTo(5 * 181 / 182, 12);
    expect(accruedInterest(terms, date('2004-02-01'))).toBeCloseTo(5 * 92 / 182, 12);
    // ACT/ACT ISDA would split the accrual at the year end instead: 61/365 + 31/366 years.
    expect(accruedInterest(terms, date('2004-02-01')) / 10).not.toBeCloseTo(61 / 365 + 31 / 366, 4);
  });

  it('applies the SIA end-of-month rule to an end-of-month 30/360 bond', () => {
    // Coupons on 29 Feb and 31 Aug: settlement 31 Mar 2008 accrues 30 days (D1 last of February -> 30, then D2 31 -> 30),
    // where bond basis would count 32 and 30E/360 31.
    const eom: BondTerms = { coupon: 6, maturity: date('2011-08-31'), freq: 2, basis: '30/360' };
    const a = analytics(eom, date('2008-03-31'), 6);
    expect(iso(a.prevCoupon)).toBe('2008-02-29');
    expect(a.accruedDays).toBe(30);
    expect(a.accrued).toBeCloseTo(3 * 30 / 180, 12);
    expect(a.fraction).toBeCloseTo(150 / 180, 12);
    expect(analytics({ ...eom, basis: '30E/360' }, date('2008-03-31'), 6).accruedDays).toBe(31);
  });

  it('uses actual days over 360 or 365 for ACT/360 and ACT/365F (ISDA 2006 sections 4.16(e) and 4.16(d))', () => {
    // 15 Jan to 15 Apr 2026 is 90 actual days, 15 Apr to 15 Jul 91.
    const terms: BondTerms = { coupon: 6, maturity: date('2030-07-15'), freq: 2, basis: 'ACT/360' };
    const settle = date('2026-04-15');
    const a360 = analytics(terms, settle, 5);
    expect(a360.accrued).toBeCloseTo(6 * 90 / 360, 12);
    expect([a360.accruedDays, a360.periodDays]).toEqual([90, 180]);
    expect(a360.fraction).toBeCloseTo(91 / 180, 12);
    const a365 = analytics({ ...terms, basis: 'ACT/365F' }, settle, 5);
    expect(a365.accrued).toBeCloseTo(6 * 90 / 365, 12);
    expect(a365.fraction).toBeCloseTo(91 / 182.5, 12);
  });

  it.each(DAY_COUNTS.map((d) => d.id))('prices, accrues and solves consistently on %s', (basis: DayCount) => {
    const terms: BondTerms = { coupon: 4.375, maturity: date('2036-08-31'), freq: 2, basis };
    const settle = date('2026-10-20');
    const a = analytics(terms, settle, 4.9);
    // One accrual and one exponent drive every price.
    expect(a.accrued).toBeCloseTo(accruedInterest(terms, settle), 12);
    expect(a.dirty).toBeCloseTo(dirtyFromYield(terms, settle, 4.9), 10);
    expect(a.clean).toBeCloseTo(a.dirty - a.accrued, 12);
    expect(cleanPricer(terms, settle)(4.9)).toBeCloseTo(a.clean, 10);
    expect(yieldFromClean(terms, settle, a.clean)).toBeCloseTo(4.9, 8);
    let explicit = 0;
    for (let k = 0; k < a.remaining; k++) explicit += (4.375 / 2 + (k === a.remaining - 1 ? 100 : 0)) / (1 + 0.049 / 2) ** (a.fraction + k);
    expect(a.dirty).toBeCloseTo(explicit, 10);
    const up = cleanFromYield(terms, settle, 4.91);
    const down = cleanFromYield(terms, settle, 4.89);
    expect(a.dv01).toBeCloseTo((down - up) / 2, 7);
    // The Z-spread solver matches clean + accrued on the same basis.
    const z = bondSpreadValue(terms, settle, a.clean, parseZeroCurve('1,3\n20,3'));
    expect(z.flows.reduce((sum, f) => sum + f.pv, 0)).toBeCloseTo(a.dirty, 8);
  });

  it('prices at par on a coupon date when the yield equals the coupon on the 30-day-month bases', () => {
    for (const basis of ['30/360', '30E/360', 'ACT/ACT ICMA'] as DayCount[]) {
      expect(cleanFromYield({ coupon: 5, maturity: date('2030-01-01'), freq: 2, basis }, date('2025-07-01'), 5), basis).toBeCloseTo(100, 10);
    }
  });
});

describe('settlement lag', () => {
  it('adds business days, skipping weekends', () => {
    expect(iso(settlementDate(date('2026-10-16')))).toBe('2026-10-19'); // Friday T+1 -> Monday
    expect(iso(settlementDate(date('2026-10-15'), 2))).toBe('2026-10-19'); // Thursday T+2 -> Monday
    expect(iso(settlementDate(date('2026-10-14'), 2))).toBe('2026-10-16');
    expect(iso(settlementDate(date('2026-10-14'), 0))).toBe('2026-10-14');
  });

  it('defaults to T+1 for US bonds and T+2 for European government bonds and corporates', () => {
    expect(defaultSettlementLag()).toBe(1);
    expect(defaultSettlementLag({ country: 'US' })).toBe(1);
    expect(defaultSettlementLag({ country: 'DE' })).toBe(2);
    expect(defaultSettlementLag({ country: 'FR' })).toBe(2);
  });
});
