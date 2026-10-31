import { describe, expect, it } from 'vitest';
import { aboutCompany, companyWords, isBreaking } from '../src/data/live/breaking';

const NOW = Date.parse('2026-10-21T13:00:00Z');
const APLD = { name: 'Applied Digital Corp', ticker: 'APLD US' };
const at = (title: string, minutesAgo = 20) => ({ title, time: NOW - minutesAgo * 60_000 });

describe('BREAKING: only fresh, stock-moving news about the company', () => {
  it('tags an event that moves the shares, published in the last two hours', () => {
    expect(isBreaking(at('Applied Digital shares climb on Texas AI data center pact and bullish analyst call'), APLD, NOW)).toBe(true);
    expect(isBreaking(at('Soluna Holdings and Applied Digital Partner to Develop 50 MW AI-Focused Data Center in Texas'), APLD, NOW)).toBe(true);
    expect(isBreaking(at('Needham downgrades Applied Digital, cuts price target to $70'), APLD, NOW)).toBe(true);
    expect(isBreaking(at('Applied Digital prices $500 million convertible notes offering'), APLD, NOW)).toBe(true);
    expect(isBreaking(at('Netflix shares plunge after third-quarter results miss estimates'), { name: 'Netflix, Inc.', ticker: 'NFLX US' }, NOW)).toBe(true);
    expect(isBreaking(at('Coca-Cola raises full-year outlook as prices lift sales'), { name: 'The Coca-Cola Company', ticker: 'KO US' }, NOW)).toBe(true);
  });

  it('does not tag old stories, opinions, questions, rankings, previews or round-ups', () => {
    expect(isBreaking(at('Applied Digital shares climb on Texas AI data center pact', 150), APLD, NOW)).toBe(false);
    expect(isBreaking(at('Why is Applied Digital stock rallying today?'), APLD, NOW)).toBe(false);
    expect(isBreaking(at('IREN Limted Crashed 40% This Month: Three Wall Street Analysts Agree It’s Going to Quadruple'), APLD, NOW)).toBe(false);
    expect(isBreaking(at("Here Are Wednesday's Top Wall Street Analyst Research Calls: Applied Digital, Chipotle Mexican Grill, Cirrus Logic, Costco, Netflix"), APLD, NOW)).toBe(false);
    expect(isBreaking(at('Applied Digital to report fiscal second-quarter results on January 6'), APLD, NOW)).toBe(false);
    expect(isBreaking(at('3 AI stocks to buy now before they soar'), APLD, NOW)).toBe(false);
    expect(isBreaking(at('Applied Digital: what to expect ahead of earnings'), APLD, NOW)).toBe(false);
    // An event, but not about this company.
    expect(isBreaking(at('Core Scientific shares surge on CoreWeave deal'), APLD, NOW)).toBe(false);
    // About the company, but no event.
    expect(isBreaking(at('Applied Digital CEO discusses the AI build-out in an interview'), APLD, NOW)).toBe(false);
  });

  it("names a company by its name without the legal form, a distinctive first word, or its ticker", () => {
    expect(companyWords('Applied Digital Corp', 'APLD US')).toEqual({ name: 'Applied Digital', first: '', ticker: 'APLD' });
    expect(companyWords('NVIDIA Corporation', 'NVDA US').first).toBe('NVIDIA');
    expect(aboutCompany('Nvidia shares jump after record quarter', companyWords('NVIDIA Corporation', 'NVDA US'))).toBe(true);
    expect(aboutCompany('APLD stock soars', companyWords('Applied Digital Corp', 'APLD US'))).toBe(true);
    // "Applied" alone is too common to stand for Applied Digital.
    expect(aboutCompany('Applied Materials shares fall', companyWords('Applied Digital Corp', 'APLD US'))).toBe(false);
  });
});
