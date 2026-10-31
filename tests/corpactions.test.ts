import { describe, expect, it } from 'vitest';
import { corporateActions, filingUrl } from '../src/data/corpactions';
import { fiscalAdjEps } from '../src/functions/EEO';

const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe('corporate actions', () => {
  it('lists dividends, splits and the events SEC filings announce, newest first', () => {
    const rows = corporateActions({
      ccy: 'USD',
      cik: 1045810,
      dividends: [
        { declared: t('2026-08-27'), ex: t('2026-09-10'), record: t('2026-09-10'), pay: t('2026-10-01'), amount: 0.25, freq: 'Quarter', type: 'Cash' },
        { declared: NaN, ex: t('2026-12-04'), record: NaN, pay: NaN, amount: 0.25, freq: 'Quarter', type: 'Projected' },
      ],
      splits: [{ date: t('2024-06-10'), numerator: 10, denominator: 1 }],
      filings: [
        { accession: '0001045810-26-000001', form: '8-K', filed: '2026-06-30', items: ['5.07'], doc: 'a.htm' },
        { accession: '0001045810-26-000002', form: '8-K', filed: '2026-05-01', items: ['2.02', '9.01'] },
        { accession: '0001045810-26-000003', form: '424B5', filed: '2026-06-17' },
        { accession: '0001045810-26-000004', form: 'DEF 14A', filed: '2026-05-12' },
        { accession: '0001045810-26-000005', form: '10-Q', filed: '2026-05-28' },
      ],
    });
    expect(rows.map((r) => r.type)).toEqual(['Cash Dividend', 'Cash Dividend', 'Corp Meeting', 'Additional Offering', 'Corp Meeting', 'Stock Split']);
    expect(rows[0]).toMatchObject({ estimate: true, summary: expect.stringMatching(/Estimate$/) });
    expect(rows[1].summary).toMatch(/^Regular Cash USD 0\.25/);
    expect(rows[2].link).toBe('https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/a.htm');
    expect(rows[5].summary).toBe('Split 10:1');
    expect(filingUrl(1, { accession: '0000000001-26-000009', form: '8-K', filed: '2026-01-01' })).toBe('https://www.sec.gov/Archives/edgar/data/1/000000000126000009/');
  });
});

describe('consensus overview', () => {
  it("adds up a fiscal year's four reported quarters, and gives none when one is missing", () => {
    const q = (end: string, actual: number) => ({ end, label: end, eps: { est: NaN, low: NaN, high: NaN, analysts: NaN, actual, basis: 'adjusted' as const, ccy: 'USD', shareBasis: 'listing' as const, splitBasis: 'same normalized series', scope: 'issuer', actualFrom: 'one provider' }, rev: { est: NaN, low: NaN, high: NaN, analysts: NaN, actual: NaN } });
    const c = { past: [q('2026-01-25', 0.89), q('2025-10-26', 1.3), q('2025-07-27', 1.05), q('2025-04-27', 0.81), q('2025-01-26', 0.89)], next: null, following: null, problems: [], loading: false };
    expect(fiscalAdjEps(c, t('2026-01-25'))).toBeCloseTo(4.05, 6);
    expect(fiscalAdjEps({ ...c, past: c.past.slice(0, 3) }, t('2026-01-25'))).toBeNaN();
    expect(fiscalAdjEps({ ...c, past: c.past.filter((x) => x.end !== '2025-07-27') }, t('2026-01-25'))).toBeNaN();
    expect(fiscalAdjEps({ ...c, past: c.past.map((x, i) => i ? x : { ...x, eps: { ...x.eps, basis: 'gaap' as const } }) }, t('2026-01-25'))).toBeNaN();
  });
});
