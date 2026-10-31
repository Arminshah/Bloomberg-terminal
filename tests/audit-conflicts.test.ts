/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { conflictCandidates, conflictComparison, isSourceWarning } = require('../scripts/live/audit/assurance.cjs');

describe('audit conflict alternatives', () => {
  it('compares numeric market values in the reference currency without confusing them with shares', () => {
    const shares = { measure: 'shares', source: 'filing', value: 10, sharesAsOf: '2026-10-26' };
    const usd = { measure: 'market-cap', currency: 'USD', source: 'filing', value: 100, basis: 'Current-price sensitivity' };
    const eur = { ...usd, currency: 'EUR', value: 90 };
    const conflicts = [{ candidates: [shares, usd, eur] }, { candidates: [usd] }];
    expect(conflictCandidates(conflicts, 'Market cap', 'USD')).toEqual([usd]);
    expect(conflictCandidates(conflicts, 'Shares out')).toEqual([shares]);
    expect(conflictCandidates(conflicts, 'EPS')).toEqual([]);
    expect(conflictComparison(conflictCandidates(conflicts, 'Market cap', 'USD'), 100)).toMatchObject({ status: 'FLAGGED', candidates: [{ status: 'PASS', value: 100 }] });
  });

  it('keeps a possible historical definition flagged even when a numeric alternative matches', () => {
    expect(isSourceWarning('Possible definitional difference')).toBe(true);
    expect(isSourceWarning(' Sources disagree ')).toBe(true);
    expect(isSourceWarning('890.75M')).toBe(false);
    expect(isSourceWarning('890.75M Possible definitional difference')).toBe(false);
    const definition = { status: 'historical-trust-holding-current-count-unconfirmed', trustAsOf: ['2025-12-31'], trustShares: 50_000_000 };
    const alternatives = conflictCandidates([{ candidates: [
      { measure: 'shares', value: 890_745_031, definition },
      { measure: 'shares', value: 940_745_031 },
    ] }], 'Shares out');
    expect(conflictComparison(alternatives, 940_745_031, { pct: 1.5 }, 'Current trust holding unconfirmed')).toMatchObject({
      status: 'FLAGGED', candidates: [{ status: 'FAIL', definition }, { status: 'PASS' }],
      detail: expect.stringContaining('Current trust holding unconfirmed'),
    });
  });
});
