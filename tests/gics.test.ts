import { describe, expect, it } from 'vitest';
import { industryGroup } from '../src/data/gics';
// The sector and sub-industry pairs in the S&P 500 member list (public dataset) on 22 October 2026.
import pairs from './fixtures/sp500-gics-subindustries.json';

const SECTOR_GROUPS: Record<string, string[]> = {
  Industrials: ['Capital Goods', 'Commercial & Professional Services', 'Transportation'],
  'Consumer Discretionary': ['Automobiles & Components', 'Consumer Durables & Apparel', 'Consumer Services', 'Consumer Discretionary Distribution & Retail'],
  'Consumer Staples': ['Consumer Staples Distribution & Retail', 'Food, Beverage & Tobacco', 'Household & Personal Products'],
  'Health Care': ['Health Care Equipment & Services', 'Pharmaceuticals, Biotechnology & Life Sciences'],
  Financials: ['Banks', 'Financial Services', 'Insurance'],
  'Information Technology': ['Software & Services', 'Technology Hardware & Equipment', 'Semiconductors & Semiconductor Equipment'],
  'Communication Services': ['Telecommunication Services', 'Media & Entertainment'],
  'Real Estate': ['Equity Real Estate Investment Trusts (REITs)', 'Real Estate Management & Development'],
  Energy: ['Energy'],
  Materials: ['Materials'],
  Utilities: ['Utilities'],
};

describe('GICS industry groups', () => {
  it("puts every sub-industry in the S&P 500 list into an industry group of its own sector", () => {
    const wrong = Object.entries(pairs as Record<string, string[]>).flatMap(([sector, subs]) =>
      subs.filter((sub) => !SECTOR_GROUPS[sector]?.includes(industryGroup(sector, sub))).map((sub) => `${sector} | ${sub} -> ${industryGroup(sector, sub)}`),
    );
    expect(wrong).toEqual([]);
  });

  it('names the groups as GICS does, and leaves an unknown sub-industry as its own group', () => {
    expect(industryGroup('Information Technology', 'Semiconductors')).toBe('Semiconductors & Semiconductor Equipment');
    expect(industryGroup('Industrials', 'Data Processing & Outsourced Services')).toBe('Commercial & Professional Services');
    expect(industryGroup('Consumer Discretionary', 'Broadline Retail')).toBe('Consumer Discretionary Distribution & Retail');
    expect(industryGroup('Energy', 'Oil & Gas Exploration & Production')).toBe('Energy');
    expect(industryGroup('Financials', 'Some New Sub-Industry')).toBe('Some New Sub-Industry');
  });
});
