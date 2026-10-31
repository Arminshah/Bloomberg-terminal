import { describe, expect, it } from 'vitest';
import { checkRule, checkRules, limitText, newProblems, type Book, type Rule } from '../src/terminal/compliance';

// A book of 100: five stocks and cash. Weights are shares of net asset value.
const h = (label: string, exposure: number, sector: string, country = 'US', cls = 'Equity', qty = 1) => ({ id: `${label} US Equity`, label, sector, country, region: country === 'US' ? 'Americas' : 'EMEA', cls, exposure, qty });
const book: Book = {
  base: 'USD',
  cash: 10,
  nav: 100,
  holdings: [h('AAPL', 30, 'Information Technology'), h('MSFT', 20, 'Information Technology'), h('XOM', 15, 'Energy'), h('SAP', 15, 'Information Technology', 'DE'), h('JPM', 10, 'Financials')],
};
const rule = (r: Omit<Rule, 'id' | 'on'>): Rule => ({ id: 'r1', on: true, ...r });

describe('COMPLIANCE: rules on a portfolio', () => {
  it('limits each position, with a warning before the limit', () => {
    const f = checkRule(rule({ kind: 'position', max: 25, warn: 18 }), book);
    expect(f.status).toBe('breach');
    expect(f.items.map((i) => [i.key, i.value, i.status])).toEqual([['AAPL', 30, 'breach'], ['MSFT', 20, 'warn']]);
    expect(f.limit).toBe('each: ≤ 25% of NAV, warning above 18%');
    // A passing rule shows the closest item.
    const ok = checkRule(rule({ kind: 'position', max: 40 }), book);
    expect(ok).toMatchObject({ status: 'pass', items: [{ key: 'AAPL', value: 30, status: 'pass' }] });
  });

  it("adds a group's holdings: each sector, or one by name", () => {
    expect(checkRule(rule({ kind: 'sector', max: 50 }), book).items.map((i) => [i.key, i.value])).toEqual([['Information Technology', 65]]);
    expect(checkRule(rule({ kind: 'sector', max: 12, group: 'energy' }), book)).toMatchObject({ status: 'breach', items: [{ key: 'Energy', value: 15 }] });
    expect(checkRule(rule({ kind: 'sector', max: 12, group: 'Utilities' }), book).status).toBe('pass');
    expect(checkRule(rule({ kind: 'country', max: 10 }), book).items.map((i) => i.key)).toEqual(['US', 'DE']);
  });

  it('applies UCITS 5/10/40: each at most 10%, those above 5% together at most 40%', () => {
    const f = checkRule(rule({ kind: 'ucits' }), book);
    expect(f.status).toBe('breach');
    expect(f.items.map((i) => [i.key, i.value])).toEqual([['Holdings above 5%', 90], ['AAPL', 30], ['MSFT', 20], ['XOM', 15], ['SAP', 15]]);
    // Ten holdings of 9% each pass the 10% limit but not the 40%.
    const even: Book = { base: 'USD', cash: 10, nav: 100, holdings: Array.from({ length: 10 }, (_, i) => h(`S${i}`, 9, 'Industrials')) };
    expect(checkRule(rule({ kind: 'ucits' }), even).items.map((i) => [i.key, i.status])).toEqual([['Holdings above 5%', 'breach']]);
    // Twenty of 4.5% pass both.
    const wide: Book = { base: 'USD', cash: 10, nav: 100, holdings: Array.from({ length: 20 }, (_, i) => h(`S${i}`, 4.5, 'Industrials')) };
    expect(checkRule(rule({ kind: 'ucits' }), wide).status).toBe('pass');
  });

  it('checks a restricted list, short positions, the fewest holdings and cash', () => {
    expect(checkRule(rule({ kind: 'restricted', ids: ['XOM US Equity', 'TSLA US Equity'] }), book)).toMatchObject({ status: 'breach', items: [{ key: 'XOM', value: 15 }] });
    expect(checkRule(rule({ kind: 'short' }), book).status).toBe('pass');
    expect(checkRule(rule({ kind: 'short' }), { ...book, holdings: [...book.holdings, h('TSLA', -5, 'Consumer Discretionary', 'US', 'Equity', -2)] }).items[0]).toMatchObject({ key: 'TSLA', status: 'breach' });
    expect(checkRule(rule({ kind: 'count', min: 20, warn: 25 }), book)).toMatchObject({ status: 'breach', items: [{ key: 'Holdings', value: 5 }] });
    expect(checkRule(rule({ kind: 'count', min: 4, warn: 6 }), book).status).toBe('warn');
    expect(checkRule(rule({ kind: 'cash', min: 2, max: 8 }), book)).toMatchObject({ status: 'breach', items: [{ key: 'Cash', value: 10 }] });
    expect(limitText(rule({ kind: 'cash', min: 2, max: 8 }))).toBe('≥ 2% and ≤ 8% of NAV');
    // Without a net asset value a weight cannot be checked.
    expect(checkRule(rule({ kind: 'position', max: 10 }), { ...book, nav: NaN }).status).toBe('unknown');
  });

  it('says what a trade would add, before it is recorded', () => {
    const rules = [rule({ kind: 'position', max: 25, warn: 18 }), { ...rule({ kind: 'sector', max: 70 }), id: 'r2' }];
    const before = checkRules(rules, book);
    // Buying 10 more of SAP: SAP to 25% (a warning), technology to 75% (over).
    const after = checkRules(rules, { ...book, cash: 0, holdings: book.holdings.map((x) => (x.label === 'SAP' ? { ...x, exposure: 25 } : x)) });
    expect(newProblems(before, after)).toEqual(['Largest position: SAP 25.0% (warning; each: ≤ 25% of NAV, warning above 18%)', 'Sector weight: Information Technology 75.0% (over the limit; each: ≤ 70% of NAV)']);
    // Exceptions already there are not news; a rule switched off is not checked.
    expect(newProblems(before, before)).toEqual([]);
    expect(checkRules([{ ...rules[0], on: false }], book)).toEqual([]);
  });
});
