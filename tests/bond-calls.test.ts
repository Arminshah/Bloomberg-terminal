import { describe, expect, it } from 'vitest';
import { cleanFromYield, cleanToRedemption, parseCallSchedule, redemptionFlows, workouts, yieldToRedemption, type BondTerms } from '../src/finance/bonds';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('yield to call and yield to worst', () => {
  it("matches the textbook example: 10% semiannual, priced 117.50, callable in five years at 110, yields 7.43% to the call", () => {
    // Investopedia's yield-to-call example ($1,175 for $1,000 face, call at $1,100 in five years), per 100 face,
    // settled on a coupon date. Reference values from a separate solver: 7.4332997367% to the call, 7.4832179927% to
    // maturity in ten years.
    const terms: BondTerms = { coupon: 10, maturity: d('2036-01-15'), freq: 2 };
    const settle = d('2026-01-15');
    const call = { date: d('2031-01-15'), price: 110 };
    expect(yieldToRedemption(terms, settle, call, 117.5)).toBeCloseTo(7.4332997367, 8);
    const w = workouts(terms, settle, [call], 117.5, 7.4832179927);
    expect(w.rows.map((r) => r.kind)).toEqual(['call', 'maturity']);
    expect(w.rows[1].yield).toBeCloseTo(7.4832179927, 8);
    // Priced above the call price, the call is the worst case for the holder.
    expect(w.toWorst?.kind).toBe('call');
    expect(w.toWorst?.date).toEqual(d('2031-01-15'));
    // At the yield to maturity the price to maturity is 117.50, and the price to the call is lower: the price to worst.
    expect(w.rows[1].cleanAtYield).toBeCloseTo(117.5, 8);
    expect(w.priceToWorst?.kind).toBe('call');
    expect(w.priceToWorst!.cleanAtYield).toBeLessThan(117.5);
  });

  it("prices a redemption at maturity at 100 exactly as the price to maturity (Excel's 30/360 PRICE example, 94.63436162)", () => {
    const terms: BondTerms = { coupon: 5.75, maturity: d('2017-11-15'), freq: 2, basis: '30/360' };
    const settle = d('2008-02-15');
    expect(cleanToRedemption(terms, settle, { date: terms.maturity, price: 100 }, 6.5)).toBeCloseTo(94.63436162, 7);
    expect(cleanToRedemption(terms, settle, { date: terms.maturity, price: 100 }, 6.5)).toBeCloseTo(cleanFromYield(terms, settle, 6.5), 10);
  });

  it("solves the yield to a call on a coupon date as Excel's YIELD example does to its maturity: 6.5%", () => {
    // Excel's YIELD example: settled 15 Feb 2008, 5.75%, 95.04287, redeemed at 100 on 15 Nov 2016, 30/360. Here the
    // bond runs to 2020 and 15 Nov 2016 is a call at 100.
    const terms: BondTerms = { coupon: 5.75, maturity: d('2020-11-15'), freq: 2, basis: '30/360' };
    expect(yieldToRedemption(terms, d('2008-02-15'), { date: d('2016-11-15'), price: 100 }, 95.04287)).toBeCloseTo(6.5, 5);
  });

  it('pays a call between coupon dates its price and the coupon accrued since the last coupon date', () => {
    // 6% semiannual to 15 Jun 2030, Actual/Actual, settled 10 Mar 2026, called on 1 Sep 2027 at 101: coupons on
    // 15 Jun 2026, 15 Dec 2026 and 15 Jun 2027, then 101 and 78/183 of a coupon. Reference from a separate calculation.
    const terms: BondTerms = { coupon: 6, maturity: d('2030-06-15'), freq: 2 };
    const settle = d('2026-03-10');
    const call = { date: d('2027-09-01'), price: 101 };
    const flows = redemptionFlows(terms, settle, call)!;
    expect(flows.map((f) => f.date.toISOString().slice(0, 10))).toEqual(['2026-06-15', '2026-12-15', '2027-06-15', '2027-09-01']);
    expect(flows[3].cf).toBeCloseTo(101 + 3 * (78 / 183), 12);
    expect(flows[3].t - flows[2].t).toBeCloseTo(78 / 183, 12);
    expect(cleanToRedemption(terms, settle, call, 5)).toBeCloseTo(102.3380235518, 9);
    expect(yieldToRedemption(terms, settle, call, 102.3380235518)).toBeCloseTo(5, 8);
    // A call before the next coupon: one flow, the price and the coupon accrued to it.
    const early = redemptionFlows(terms, settle, { date: d('2026-05-01'), price: 100 })!;
    expect(early).toHaveLength(1);
    expect(early[0].cf).toBeCloseTo(100 + 3 * ((Date.parse('2026-05-01') - Date.parse('2025-12-15')) / 86_400_000 / 182), 12);
  });

  it('takes maturity as the worst case for a bond priced below par', () => {
    const terms: BondTerms = { coupon: 3, maturity: d('2034-06-15'), freq: 2 };
    const w = workouts(terms, d('2026-06-15'), [{ date: d('2028-06-15'), price: 100 }, { date: d('2030-06-15'), price: 100 }], 92, 4);
    expect(w.toWorst?.kind).toBe('maturity');
    expect(w.rows.every((r) => Number.isFinite(r.yield))).toBe(true);
    expect(w.toWorst!.yield).toBe(Math.min(...w.rows.map((r) => r.yield)));
  });

  it('refuses a redemption not after settlement or after maturity', () => {
    const terms: BondTerms = { coupon: 5, maturity: d('2030-01-01'), freq: 2 };
    expect(redemptionFlows(terms, d('2026-01-01'), { date: d('2026-01-01'), price: 100 })).toBeNull();
    expect(redemptionFlows(terms, d('2026-01-01'), { date: d('2031-01-01'), price: 100 })).toBeNull();
    expect(yieldToRedemption(terms, d('2026-01-01'), { date: d('2027-01-01'), price: 100 }, -1)).toBeNaN();
  });
});

describe('the call schedule typed in', () => {
  const settle = d('2026-03-10');
  const maturity = d('2030-06-15');
  it('reads one call a line, sorted, and counts the calls already past or at maturity', () => {
    expect(parseCallSchedule('2028-06-15, 101\n2027-06-15;102.5\n\n2025-06-15 103\n2030-06-15\t100', settle, maturity)).toEqual({
      calls: [{ date: d('2027-06-15'), price: 102.5 }, { date: d('2028-06-15'), price: 101 }],
      past: 1,
      late: 1,
    });
  });
  it('says what is wrong with a line', () => {
    expect(parseCallSchedule('15/06/2028, 101', settle, maturity)).toEqual({ error: 'Write each call as a date and a price per 100, such as 2028-06-15, 101.5: "15/06/2028, 101" is not.' });
    expect(parseCallSchedule('2028-02-30, 101', settle, maturity)).toHaveProperty('error');
    expect(parseCallSchedule('2028-06-15, 0', settle, maturity)).toEqual({ error: 'The call on 2028-06-15 needs a price above zero.' });
    expect(parseCallSchedule('2028-06-15, 101\n2028-06-15, 100', settle, maturity)).toEqual({ error: '2028-06-15 is in the schedule twice.' });
  });
});
