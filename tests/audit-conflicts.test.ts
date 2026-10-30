/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { conflictCandidates, conflictComparison } = require('../scripts/live/audit/assurance.cjs');

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
});
