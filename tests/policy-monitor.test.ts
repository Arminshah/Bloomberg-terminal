import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { policyRates, type PolicyRates } from '../src/data/live/policy';
import type { PolicyDecision } from '../src/data/live/policy-decisions';
import { CENB } from '../src/functions/FXRATES';

// Server rendering has no browser quote subscriptions; target and source stores stay unmocked.
vi.mock('../src/data/market', async (original) => {
  const actual = await original<typeof import('../src/data/market')>();
  return { ...actual, useTick: () => 0, useQuote: (id: string | undefined) => id ? actual.engine.quote(id) : undefined };
});

// Synthetic levels and decision replay the effective-date boundary; they are not actual Fed policy observations.
const RELEASE = Date.parse('2026-10-28T18:00:00Z');
const EFFECTIVE = Date.parse('2026-11-02T05:00:00Z');
const CUT: PolicyDecision = { id: 'FED:2026-10-28', bank: 'FED', date: '2026-10-28', announcedAt: RELEASE, effectiveDate: '2026-11-02', action: 'cut', changeBp: -25, lower: 3.5, upper: 3.75, status: 'confirmed', sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm', implementationUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a1.htm', retrievedAt: RELEASE + 60_000 };
const fixture = (): PolicyRates => ({
  fomc: ['2026-10-28', '2026-12-09'], decisions: [CUT],
  fedUpper: { changes: [['2026-01-01', 4.25], ['2026-09-17', 4]], last: 4, asOf: '2026-10-27' },
  fedLower: { changes: [['2026-01-01', 4], ['2026-09-17', 3.75]], last: 3.75, asOf: '2026-10-27' },
  health: { effr: { state: 'current', checkedAt: RELEASE + 30_000, attemptedAt: RELEASE + 30_000, sourceDate: '2026-10-27' } },
  documentHealth: {
    'fedStatement:2026-10-28': { state: 'current', checkedAt: RELEASE + 60_000, attemptedAt: RELEASE + 60_000, sourceDate: '2026-10-28' },
    'fedImplementation:2026-10-28': { state: 'current', checkedAt: RELEASE + 60_000, attemptedAt: RELEASE + 60_000, sourceDate: '2026-10-28' },
  },
});
const wasReal = engine.realOnly;
afterEach(() => { policyRates.set({}); engine.realOnly = wasReal; vi.restoreAllMocks(); });
function fedRow(now: number): string {
  engine.realOnly = true;
  vi.spyOn(engine, 'now').mockReturnValue(now);
  const html = renderToStaticMarkup(createElement(CENB, { route: { fn: 'CENTRALBANKS' } }));
  return /<tr[^>]*data-bank-code="FED"[\s\S]*?<\/tr>/.exec(html)![0];
}
const rateCell = (row: string) => /<td class="num white b">([\s\S]*?)<\/td>/.exec(row)![1];

describe('central bank monitor effective targets', () => {
  it('switches both target bounds together on the verified effective instant while daily observations lag', () => {
    policyRates.set(fixture());
    expect(rateCell(fedRow(EFFECTIVE - 1))).toBe('3.75-4.00%');
    expect(rateCell(fedRow(EFFECTIVE))).toBe('3.50-3.75%');
    expect(rateCell(fedRow(EFFECTIVE))).not.toContain('3.75-3.75%');
    expect(policyRates.get().fedLower?.last).toBe(3.75);
  });

  it('leaves a missing lower bound unavailable rather than deriving it from the upper bound', () => {
    const rates = fixture();
    delete rates.fedLower;
    policyRates.set(rates);
    const cell = rateCell(fedRow(EFFECTIVE - 1));
    expect(cell).toContain('4.00%');
    expect(cell).toContain('upper bound; lower unavailable');
    expect(cell).not.toContain('3.75');
  });

  it('shows the exact displayed statement document failure without borrowing healthy daily-source status', () => {
    const rates = fixture();
    rates.documentHealth!['fedStatement:2026-10-28'] = { ...rates.documentHealth!['fedStatement:2026-10-28'], state: 'error', attemptedAt: EFFECTIVE, error: 'Synthetic statement refresh failure' };
    policyRates.set(rates);
    const before = fedRow(EFFECTIVE - 1);
    expect(before).toContain('data-source-health="current"');
    const after = fedRow(EFFECTIVE);
    expect(after).toContain('data-source-health="error"');
    expect(after).toContain('retained; latest check failed');
    expect(after).toContain('Synthetic statement refresh failure');
    expect(after).toContain('Last successful');
    expect(rateCell(after)).toBe('3.50-3.75%');
  });

  it('uses the bank release clock and exposes schedule coverage without inventing later meetings', () => {
    policyRates.set(fixture());
    const row = fedRow(EFFECTIVE);
    expect(row).toContain('09/12/26');
    expect(row).toContain('14:00 New York (scheduled)');
    expect(row).toContain('Calendar through 2026-12-09');
    const exhausted = fedRow(Date.parse('2027-01-01T12:00:00Z'));
    expect(exhausted).toContain('Calendar exhausted');
    expect(exhausted).toContain('Calendar through 2026-12-09');
  });
});
