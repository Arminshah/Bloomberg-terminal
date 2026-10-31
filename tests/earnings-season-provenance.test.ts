import { describe, expect, it } from 'vitest';
import { seasonLines, seasonStats, seasonOf } from '../src/functions/EA';
import type { CalendarFigure, CalendarReport } from '../src/data/live/earnings-calendar';
import type { Member } from '../src/data/live/index-members';

const member = { symbol: 'TEST', name: 'Test', sector: 'Tech', cap: 1000, last: 10 } as Member;
const report = (eps: CalendarFigure): CalendarReport => ({ symbol: 'TEST', name: 'Test', date: '2026-10-20', timing: '--', marketCap: 1000, traded: NaN, fiscalEnd: '2026-09', eps, rev: { est: NaN, actual: NaN }, epsYearAgo: 1, epsQuarterAgo: NaN, revYearAgo: NaN, revQuarterAgo: NaN, sources: ['Nasdaq'] });
const line = (eps: CalendarFigure) => seasonLines([report(eps)], [member], seasonOf('2026-10-29'))[0];

describe('earnings season comparison evidence', () => {
  it('retains a provider paired comparison with its unverified definition and cutoff explained', () => {
    const result = line({ est: 1, actual: 1.2, estFrom: 'Nasdaq', actualFrom: 'Nasdaq' });
    expect(result.surprise).toBeCloseTo(20);
    expect(result.verdict).toBe('beat');
    expect(result.comparisonNote).toContain('provider comparison is conditional');
    expect(result.comparisonNote).toContain('Historical estimate cutoff not independently recorded');
    expect(seasonStats([result])).toMatchObject({ compared: 1, conditionalComparisons: 1, excludedComparisons: 0 });
  });

  it('excludes a stale pair from verdicts and statistics while retaining its figures and failure evidence', () => {
    const result = line({ est: 1, actual: 1.2, estFrom: 'Nasdaq', actualFrom: 'Nasdaq', stale: true, error: 'Source unavailable' });
    expect(result).toMatchObject({ epsEst: 1, epsAct: 1.2, reported: true });
    expect(result.verdict).toBeUndefined();
    expect(result.surprise).toBeNaN();
    expect(result.growth).toBeNaN();
    expect(result.comparisonNote).toContain('Stale: Source unavailable');
    expect(seasonStats([result])).toMatchObject({ reported: 1, compared: 0, excludedComparisons: 1, growthCount: 0 });
  });

  it('rejects a cross-provider pair with unknown definitions and permits an explicitly compatible pair', () => {
    const unknown = line({ est: 1, actual: 1.2, estFrom: 'Nasdaq', actualFrom: 'Finnhub' });
    expect(unknown.verdict).toBeUndefined();
    expect(unknown.comparisonNote).toContain('Cross-provider definitions do not establish a comparable pair');
    const known = line({ est: 1, actual: 1.2, estFrom: 'Nasdaq', actualFrom: 'Finnhub', basis: 'adjusted', ccy: 'USD', shareBasis: 'listing', splitBasis: 'as-reported', scope: 'consolidated', epsType: 'diluted', unit: 'per-share' });
    expect(known.verdict).toBe('beat');
    expect(seasonStats([known])).toMatchObject({ compared: 1, conditionalComparisons: 0 });
  });
});
