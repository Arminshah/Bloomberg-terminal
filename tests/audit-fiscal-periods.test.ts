/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { filedEpsContext } = require('../scripts/live/audit/fiscal-periods.cjs');
const { filedQuarterEps } = require('../scripts/live/audit/domains.cjs');

// These scenarios reproduce the sanitized capture's shape. The numbers and
// facts are structural test inputs, not quotations or live publisher evidence.
const quarter = {
  periodEnd: '2026-07-31',
  gaapActual: { value: 0.8, currency: 'USD', periodEnd: '2026-07-26', source: 'statements', basis: 'gaap' },
};
const fact = { start: '2026-04-27', end: '2026-07-26', filed: '2026-08-20', form: '10-Q', val: 0.8 };
const facts = { facts: { 'us-gaap': { EarningsPerShareDiluted: { units: { 'USD/shares': [fact] } } } } };

describe('filed earnings corroboration uses the actual fiscal period', () => {
  it('joins the captured exact statement end instead of its calendar-month label', () => {
    const context = filedEpsContext(quarter);
    expect(context).toEqual({ periodEnd: '2026-07-26', currency: 'USD', value: 0.8 });
    expect(filedQuarterEps(facts, quarter.periodEnd, 'USD')).toBeNull();
    expect(filedQuarterEps(facts, context.periodEnd, context.currency)).toMatchObject(fact);
  });

  it('accepts first-week fiscal ends in the preceding fiscal-end month', () => {
    expect(filedEpsContext({ ...quarter, periodEnd: '2026-08-01' })).toMatchObject({ periodEnd: '2026-07-26' });
  });

  it('does not join another fiscal quarter, invalid dates, or an unstated currency', () => {
    for (const periodEnd of ['2026-04-30', '2026-08-31', '2026-02-30', '', null]) {
      expect(filedEpsContext({ ...quarter, periodEnd })).toBeNull();
    }
    for (const periodEnd of ['2026-06-30', '2026-02-30', '', null]) {
      expect(filedEpsContext({ ...quarter, gaapActual: { ...quarter.gaapActual, periodEnd } })).toBeNull();
    }
    for (const currency of [undefined, '', 'usd', 'US']) {
      expect(filedEpsContext({ ...quarter, gaapActual: { ...quarter.gaapActual, currency } })).toBeNull();
    }
  });

  it('keeps the captured currency and requires the filing to use the same units', () => {
    const context = filedEpsContext({ ...quarter, gaapActual: { ...quarter.gaapActual, currency: 'TWD' } });
    expect(context.currency).toBe('TWD');
    expect(filedQuarterEps(facts, context.periodEnd, context.currency)).toBeNull();
  });

  it('does not derive a quarter from annual or year-to-date per-share figures', () => {
    const cumulative = { facts: { 'us-gaap': { EarningsPerShareDiluted: { units: { 'USD/shares': [
      { ...fact, start: '2025-07-28', form: '10-K', val: 2.4 },
      { ...fact, start: '2026-01-26', val: 1.6 },
    ] } } } } };
    const context = filedEpsContext(quarter);
    expect(filedQuarterEps(cumulative, context.periodEnd, context.currency)).toBeNull();
  });

  it('falls back only when the exact actual period is absent, preserving a valid row date', () => {
    const exact = { ...quarter, periodEnd: fact.end, gaapActual: { ...quarter.gaapActual, periodEnd: undefined } };
    expect(filedEpsContext(exact)).toMatchObject({ periodEnd: fact.end });
    expect(filedEpsContext({ ...exact, gaapActual: { ...exact.gaapActual, basis: 'adjusted' } })).toBeNull();
    expect(filedEpsContext({ ...exact, gaapActual: { ...exact.gaapActual, value: NaN } })).toBeNull();
  });
});
