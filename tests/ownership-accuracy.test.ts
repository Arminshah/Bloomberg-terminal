import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import type { Holder } from '../src/data/fundamentals';
import { filterHoldings, holdingDates, holdingPercent } from '../src/data/ownership';
import { buildRealFund, floatStats, officersFrom, realFund } from '../src/data/live/yfund';
import { HDS } from '../src/functions/HDS';
import { MGMT } from '../src/functions/MGMT';
import { floatItems } from '../src/functions/DESEquity';

// The quote strip subscribes to browser-only price ticks; these checks exercise the ownership/management tables.
vi.mock('../src/components/QuoteStrip', () => ({ QuoteStrip: () => null }));

const end = (month: number) => Date.UTC(2026, month, 0);
const holder = (name: string, date: number, pct = 1): Holder => ({ name, filed: date, shares: 1e6, pct, change: NaN, source: '13F', type: 'Institution' });

describe('holder report dates', () => {
  const positions = [holder('Older manager', end(6)), holder('Latest manager', end(9)), holder('Same latest period', end(9)), holder('Undated manager', NaN)];

  it('filters to the most recent holding date and keeps missing dates out of that filter', () => {
    expect(holdingDates(positions)).toEqual([end(9), end(6)]);
    expect(filterHoldings(positions, 'latest').map((h) => h.name)).toEqual(['Latest manager', 'Same latest period']);
    expect(filterHoldings(positions, String(end(6))).map((h) => h.name)).toEqual(['Older manager']);
    expect(filterHoldings(positions, 'all')).toBe(positions);
    expect(filterHoldings([holder('Undated', NaN)], 'latest')).toEqual([]);
  });

  it('recomputes percentages only with a valid count and denominator', () => {
    expect(holdingPercent(holder('Count only', end(9), NaN), 100)).toBe(1);
    expect(holdingPercent({ ...holder('Percent only', end(9), 1.2), shares: NaN }, 100)).toBe(1.2);
    expect(holdingPercent(holder('Reported percent', end(9), 1.2), NaN)).toBe(1.2);
  });

  it('renders a sortable date header, newest positions first, and an accessible period filter', () => {
    const sec = engine.get('AAPL US Equity')!;
    const old = realFund.get(sec.id);
    const fund = buildRealFund(sec, {}, null, null, null, end(10));
    fund.holders = positions;
    realFund.set(sec.id, fund);
    try {
      const html = renderToStaticMarkup(createElement(HDS, { sec, route: { fn: 'HOLDERS', sec: sec.id } }));
      expect(html).toContain('aria-sort="descending"');
      expect(html).toContain('Holdings as of');
      expect(html).toContain('Latest reported period');
      expect(html).toContain('Sort by the date of the holding');
      expect(html.indexOf('Latest manager')).toBeLessThan(html.indexOf('Older manager'));
      expect(html.indexOf('Older manager')).toBeLessThan(html.indexOf('Undated manager'));
    } finally {
      if (old) realFund.set(sec.id, old);
      else realFund.delete(sec.id);
    }
  });
});

describe('short float coverage and provenance', () => {
  it('uses the supplied ratio when present, even if the latest float count gives another result', () => {
    const f = floatStats({ sharesShort: 20e6, floatShares: 100e6, shortPercentOfFloat: 0.18 });
    expect(f.shortPctFloat).toBe(18);
    expect(f.shortPctFloatCalculated).toBeUndefined();
  });

  it('fills a missing ratio from available counts and labels the differing float basis', () => {
    const sec = engine.get('AAPL US Equity')!;
    const fund = buildRealFund(sec, {}, null, null, null, end(10));
    fund.float = floatStats({ sharesShort: { raw: 20e6 }, floatShares: { raw: 100e6 }, shortPercentOfFloat: {} });
    expect(fund.float.shortPctFloat).toBe(20);
    expect(fund.float.shortPctFloatCalculated).toBe(true);
    expect(floatItems(fund, 200)).toContainEqual(['Short interest, % of float (calculated)', '20.00%']);
    expect(floatStats({ sharesShort: 20e6 }).shortPctFloat).toBeNaN();
  });
});

describe('management source accuracy', () => {
  it('preserves reported zero pay and exercised options and rejects malformed identity/demographics', () => {
    const officers = officersFrom({ companyOfficers: [
      { name: { raw: 'Fake name' }, title: 'CEO' },
      { name: ' Dr.  Ann  Lee ', title: { raw: 'CEO' }, age: 500, yearBorn: -1, fiscalYear: 3, totalPay: { raw: 0 }, exercisedValue: { raw: 0 }, unexercisedValue: { raw: 1_250_000 } },
      { name: 'Pat Chen', age: 55.5, totalPay: -5, exercisedValue: {}, unexercisedValue: { raw: -1 } },
    ] });
    expect(officers).toHaveLength(2);
    expect(officers[0]).toEqual({ name: 'Ann Lee', title: '', age: NaN, yearBorn: NaN, fiscalYear: NaN, totalPay: 0, exercised: 0, unexercised: 1_250_000 });
    expect(officers[1].unexercised).toBeNaN();
    expect(officers[1].age).toBeNaN();
    expect(officers[1].totalPay).toBeNaN();
  });

  it('distinguishes source title and pay year and never guesses the pay currency', () => {
    const sec = engine.get('AAPL US Equity')!;
    const old = realFund.get(sec.id);
    const fund = buildRealFund(sec, {}, null, null, null, end(10));
    fund.officers = officersFrom({ companyOfficers: [{ name: 'Ann Lee', title: 'CEO', age: 50, fiscalYear: 2025, totalPay: 0, exercisedValue: 0 }] });
    realFund.set(sec.id, fund);
    try {
      const html = renderToStaticMarkup(createElement(MGMT, { sec, route: { fn: 'MANAGEMENT', sec: sec.id } }));
      expect(html).toContain('Reported title');
      expect(html).toContain('Reported age');
      expect(html).toContain('Pay fiscal year');
      expect(html).toContain('profile received');
      expect(html).toContain('does not supply its currency');
      expect(html).toContain('not when those facts became effective');
      expect(html).not.toContain('Salary &amp; bonus (USD)');
    } finally {
      if (old) realFund.set(sec.id, old);
      else realFund.delete(sec.id);
    }
  });
});
