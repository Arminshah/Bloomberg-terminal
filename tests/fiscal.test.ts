import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as main from '../electron/fiscal.cjs';
import { debtProfile, fiscalData, parseAvgRates, parseMspd, type PublicDebt } from '../src/data/live/fiscal';
import { namesTreasury } from '../src/functions/CREDIT';
import { TreasuryDebt } from '../src/functions/TreasuryDebt';
// Fiscal Data's answers of 28 October 2026: the Monthly Statement of the Public Debt for 30 September 2026 (table 3,
// marketable securities) and the average interest rates.
import MSPD from './fixtures/fiscal/mspd-table3-2026-10-28.json?raw';
import RATES from './fixtures/fiscal/avg-rates-2026-10-28.json?raw';

const debt = (() => {
  const d = parseMspd(MSPD);
  if ('error' in d) throw new Error(d.error);
  return d;
})();

describe('Fiscal Data requests', () => {
  it('asks only the statement of the public debt and the average interest rates, newest first', () => {
    const m = new URL(main.fiscalRequest('mspd')!.url);
    expect(m.origin + m.pathname).toBe('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/debt/mspd/mspd_table_3_market');
    expect(m.searchParams.get('sort')).toBe('-record_date');
    expect(m.searchParams.get('fields')).toBe('record_date,security_class1_desc,security_class2_desc,interest_rate_pct,yield_pct,issue_date,maturity_date,outstanding_amt');
    expect(new URL(main.fiscalRequest('avg-rates')!.url).pathname).toBe('/services/api/fiscal_service/v2/accounting/od/avg_interest_rates');
    expect(main.fiscalRequest('debt_to_penny')).toBeNull();
  });
});

describe("the Treasury's marketable debt", () => {
  it('reads the latest statement only, each CUSIP once with all its issues', () => {
    expect(debt.recordDate).toBe('2026-09-30');
    expect(debt.securities).toHaveLength(463);
    expect(new Set(debt.securities.map((s) => s.cusip)).size).toBe(463);
    // The bill maturing on 1 October 2026: four issues, 334,135.4294 million outstanding together, first issued on
    // 2 October 2025 (the line that carries the amount; the reopenings follow it).
    expect(debt.securities.find((s) => s.cusip === '912797SA6')).toEqual({ cusip: '912797SA6', cls: 'Bills', rate: NaN, maturity: '2026-10-01', outstanding: 334_135.4294, issue: '2025-10-02' });
    // A TIPS with its inflation adjustment.
    expect(debt.securities.find((s) => s.cusip === '91282CDC2')).toMatchObject({ cls: 'TIPS', rate: 0.125, outstanding: 46_746.30949112 });
    expect(debt.statedTotal).toBeCloseTo(31_834_878.4434023, 6);
  });

  it("adds up to the statement's own total for every class, to the cent", () => {
    const p = debtProfile(debt);
    expect(p.mismatches).toEqual([]);
    expect(p.byClass.Bills.amount).toBeCloseTo(7_118_144.89910001, 4);
    expect(p.byClass.Notes.amount).toBeCloseTo(16_281_473.051, 4);
    expect(p.byClass.Bonds.amount).toBeCloseTo(5_550_990.6094, 4);
    expect(p.byClass.TIPS.amount).toBeCloseTo(2_172_641.57170234, 4);
    expect(p.byClass.FRN.amount).toBeCloseTo(707_975.4515, 4);
    expect(p.total).toBeCloseTo(31_831_225.5827, 3);
    // Bills mature within the year after the statement; nothing beyond 30 years.
    expect(p.years[0].year).toBe(2026);
    expect(p.years[p.years.length - 1].year).toBeLessThanOrEqual(2056);
    expect(p.years.reduce((s, y) => s + y.amount, 0)).toBeCloseTo(p.total, 3);
    expect(p.averageYears).toBeGreaterThan(4);
    expect(p.averageYears).toBeLessThan(8);
  });

  it('says so when the listed securities do not add up to the stated total', () => {
    const short: PublicDebt = { ...debt, securities: debt.securities.filter((s) => s.cusip !== '912797SA6') };
    expect(debtProfile(short).mismatches).toEqual([{ cls: 'Bills', listed: expect.closeTo(7_118_144.89910001 - 334_135.4294, 4), stated: 7_118_144.89910001 }]);
  });

  it("refuses an answer cut short before the month's total, and reads the platform's errors", () => {
    const j = JSON.parse(MSPD);
    const cut = JSON.stringify({ data: j.data.filter((r: { security_class1_desc: string }) => r.security_class1_desc !== 'Total Marketable') });
    expect(parseMspd(cut)).toEqual({ error: "Fiscal Data's answer did not hold the whole statement." });
    expect(parseMspd('<html>')).toEqual({ error: 'Fiscal Data answered with something other than its data.' });
    expect(parseMspd('{"error":"Invalid Query Param","message":"Invalid query parameter \'sort\' with value \'x\'"}')).toEqual({ error: "Fiscal Data: Invalid query parameter 'sort' with value 'x'" });
  });

  it("gives the Treasury's own average interest rates for the statement's month", () => {
    const r = parseAvgRates(RATES, '2026-09-30');
    expect(r).toMatchObject({ recordDate: '2026-09-30', rates: { 'Total Marketable': 3.518, 'Treasury Bills': 3.87, 'Treasury Notes': 3.383, 'Treasury Floating Rate Notes (FRN)': 4.141 } });
  });
});

describe('DEBTPROFILE', () => {
  it("shows the Treasury's debt for T GOVT, UST or TREASURY, never for AT&T's T", () => {
    for (const a of ['T GOVT', 'UST', 'us treasury', 'TREASURY GOVT']) expect(namesTreasury(a)).toBe(true);
    for (const a of ['T', 'AAPL', 'JPM CORP', '', undefined]) expect(namesTreasury(a)).toBe(false);
  });

  it("draws the statement: totals, classes with the Treasury's rates, and the years", () => {
    fiscalData.set((st) => ({ v: st.v + 1, by: { mspd: { state: 'ok', text: MSPD }, 'avg-rates': { state: 'ok', text: RATES } } }));
    const html = renderToStaticMarkup(createElement(TreasuryDebt));
    expect(html).toContain('U.S. Treasury: marketable debt outstanding');
    expect(html).toContain('30/09/26');
    // 31,834,878 million: 31,834.9 billion.
    expect(html).toContain('31,834.9bn USD');
    expect(html).toContain('3.518%');
    expect(html).toMatch(/Notes<\/td><td class="num white">16,281\.5<\/td>/);
    expect(html).toContain('3.383%');
    expect(html).toContain('data-testid="debt-years"');
    expect(html).not.toContain('debt-mismatch');
    expect(html).toContain('They add up to the statement&#x27;s own total for each class.');
    fiscalData.set((st) => ({ v: st.v + 1, by: {} }));
  });
});
