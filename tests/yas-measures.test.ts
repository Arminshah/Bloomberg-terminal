import { describe, expect, it } from 'vitest';
import { analytics, yieldFromClean } from '../src/finance/bonds';
import { afterTaxYield, currentYield, invoice, moneyMarketYield, restateYield, yasRisk } from '../src/finance/yas';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('YAS against the screen in TE07 03:47 (IBM 5.3 02/05/54, 30/360 semi-annual, 96.533 to settle 11/12/24)', () => {
  const terms = { coupon: 5.3, maturity: utc(2054, 2, 5), freq: 2, basis: '30/360' as const };
  const settle = utc(2024, 11, 12);
  const y = yieldFromClean(terms, settle, 96.533);
  const a = analytics(terms, settle, y);

  it('gives its street yield, accrued days, Equiv 1/Yr and current yield to the digits it shows', () => {
    expect(y).toBeCloseTo(5.540202, 6);
    expect(a.accruedDays).toBe(97);
    expect(restateYield(y, 2, 1)).toBeCloseTo(5.616937, 6);
    expect(currentYield(5.3, 96.533)).toBeCloseTo(5.49, 3);
  });

  it('gives the risk block it shows (cut off at the frame edge: M.Dur 14.31, Risk 14.0, Convexity 3.11)', () => {
    const r = yasRisk(a, 2, 2);
    expect(Math.floor(r.modified * 100) / 100).toBe(14.31);
    expect(Math.floor(r.risk * 10) / 10).toBe(14.0);
    expect(Math.floor(r.convexity * 100) / 100).toBe(3.11);
  });

  it('gives the after-tax yield at Inc 40.8 % and CG 23.8 % within 0.03 bp of its 3.306384', () => {
    expect(Math.abs(afterTaxYield(terms, settle, a, 40.8, 23.8) - 3.306384)).toBeLessThan(0.0003);
  });

  it('writes the invoice on a face amount, and leaves the money-market yield empty for a long bond', () => {
    const inv = invoice(a, 1_000_000);
    expect(inv.principal).toBeCloseTo(965_330, 2);
    expect(inv.accrued).toBeCloseTo(14_280.56, 2);
    expect(inv.total).toBeCloseTo(inv.principal + inv.accrued, 6);
    expect(moneyMarketYield(terms, settle, a)).toBeNaN();
  });
});

describe("YAS against the pack's published screens (METHODOLOGY.md 14, worked checks)", () => {
  it('CTX 6.5 05/01/16, 30/360 semi-annual, settle 7/30/08, price 80: yield 10.305, 89 days, Risk 4.566', () => {
    const terms = { coupon: 6.5, maturity: utc(2016, 5, 1), freq: 2, basis: '30/360' as const };
    const settle = utc(2008, 7, 30);
    const y = yieldFromClean(terms, settle, 80);
    const a = analytics(terms, settle, y);
    expect(y).toBeCloseTo(10.305, 3);
    expect(a.accruedDays).toBe(89);
    expect(yasRisk(a, 2, 2).risk).toBeCloseTo(4.566, 2);
  });

  it('GKN 7 05/14/12, annual, settle 8/15/05, price 105.68: 5.860 on the semi-annual basis, Risk 5.795', () => {
    const terms = { coupon: 7, maturity: utc(2012, 5, 14), freq: 1, basis: 'ACT/ACT ICMA' as const };
    const settle = utc(2005, 8, 15);
    const y = yieldFromClean(terms, settle, 105.68);
    const a = analytics(terms, settle, y);
    const r = yasRisk(a, 1, 2);
    expect(r.yieldPct).toBeCloseTo(5.86, 2);
    expect(r.modified).toBeCloseTo(5.39, 2);
    expect(r.risk).toBeCloseTo(5.795, 2);
  });

  it('a bond in its last coupon period has a money-market yield on Act/360', () => {
    const terms = { coupon: 4, maturity: utc(2025, 3, 1), freq: 2, basis: '30/360' as const };
    const settle = utc(2025, 1, 1);
    const a = analytics(terms, settle, yieldFromClean(terms, settle, 99.9));
    const days = 59;
    expect(moneyMarketYield(terms, settle, a)).toBeCloseTo(((102 / a.dirty - 1) * 360) / days * 100, 9);
  });
});
