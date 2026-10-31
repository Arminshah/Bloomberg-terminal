import { describe, expect, it } from 'vitest';
import { blendedForwardEps, surpriseTally } from '../src/data/earnings-summary';
import { parseCommand } from '../src/terminal/commands';
import { primaryMnemonic } from '../src/terminal/legacy';
import { lookupFn } from '../src/terminal/registry';

describe('EE, the earnings and estimates page', () => {
  it('is EARNINGSSUMMARY, while ERN stays the earnings history', () => {
    // A July 2024 screenshot shows EE as its own page, with ERN, EEO, ANR, EM and EEG as boxes on it.
    expect(parseCommand('NVDA EE', lookupFn)).toMatchObject({ kind: 'route', fn: 'EARNINGSSUMMARY', sec: { id: 'NVDA US Equity' } });
    expect(parseCommand('NVDA ERN', lookupFn)).toMatchObject({ kind: 'route', fn: 'EARNINGS' });
    expect(primaryMnemonic('EARNINGSSUMMARY')).toBe('EE');
    expect(primaryMnemonic('EARNINGS')).toBe('ERN');
  });

  it('blends the current and next fiscal years over the next twelve months', () => {
    const current = { end: '2027-01-31', eps: 4 };
    const next = { end: '2028-01-31', eps: 6 };
    // 96 days of the current year left: 96/365 of its EPS and the rest of next year's.
    expect(blendedForwardEps(current, next, '2026-10-27')).toBeCloseTo((96 / 365) * 4 + (269 / 365) * 6, 12);
    // On the year's first day it is the current year's EPS; once it has ended, the next year's.
    expect(blendedForwardEps(current, next, '2026-01-31')).toBe(4);
    expect(blendedForwardEps(current, next, '2027-02-10')).toBe(6);
    expect(blendedForwardEps(current, undefined, '2026-10-27')).toBeNaN();
    expect(blendedForwardEps(current, { end: '2028-01-31', eps: NaN }, '2026-10-27')).toBeNaN();
  });

  it('counts the reports above, at and below the estimate, leaving out those without one', () => {
    expect(surpriseTally([4.94, 5.16, 0, -2.1, NaN, 3])).toEqual({ above: 3, met: 1, below: 1, count: 5 });
    expect(surpriseTally([])).toEqual({ above: 0, met: 0, below: 0, count: 0 });
  });
});
