/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { assess, numericComparison, conflictComparison, sanitize } = require('../scripts/live/audit/assurance.cjs');
const { validatePolicy: inspectPolicy, validateEarnings, validateSupply, compatible, fedStatement, verifyFed, quotedEvidence, evidenceUrl, filedQuarterEps } = require('../scripts/live/audit/domains.cjs');
const NOW = Date.parse('2026-10-29T12:00:00Z');
const validatePolicy = (snapshot: unknown, now = NOW) => inspectPolicy(snapshot, now);
const url = 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm';
const frame = (domain: string, fields: Record<string, unknown> = {}) => ({ schema: 1, domain, capturedAt: NOW, ...fields });
const eps = { basis: 'adjusted', currency: 'USD', shareBasis: 'listing', epsType: 'diluted', value: -0.30 };
const quarter = { periodEnd: '2026-08-31', estimate: eps, actual: { ...eps, value: -0.01 }, surprisePct: 96.6666667, status: 'coherent' };

describe('required accuracy assurance, distinct from a successful process', () => {
  it('never certifies an all-skipped run or invariants without required references', () => {
    const required = [{ area: 'policy', item: 'FED', minReferencePasses: 1, minInvariantPasses: 1 }];
    expect(assess([{ status: 'SKIP', area: 'policy', item: 'FED' }], required).exitCode).toBe(3);
    expect(assess([{ status: 'PASS', area: 'policy', item: 'FED', evidenceKind: 'invariant' }], required).exitCode).toBe(3);
  });

  it('requires both documentary corroboration and internal invariants in a critical area', () => {
    const rows = ['reference', 'invariant'].map((evidenceKind) => ({ status: 'PASS', area: 'policy', item: 'FED', evidenceKind }));
    const scope = [{ area: 'policy', item: 'FED', minReferencePasses: 1, minInvariantPasses: 1 }];
    expect(assess(rows, scope)).toMatchObject({ exitCode: 0, assurance: 'verified-required-scope' });
    expect(assess([...rows, { status: 'FLAGGED', area: 'policy', item: 'FED' }], scope).exitCode).toBe(3);
    expect(assess([...rows, { status: 'BLOCKED', area: 'policy', item: 'FED' }], scope).exitCode).toBe(2);
    expect(assess([...rows, { status: 'FAIL', area: 'policy', item: 'FED' }], scope).exitCode).toBe(1);
  });

  it('keeps optional omissions separate and rejects unrecognized statuses', () => {
    const pass = { status: 'PASS', area: 'quote', evidenceKind: 'reference' };
    expect(assess([pass, { status: 'SKIP', critical: false }]).exitCode).toBe(0);
    expect(assess([pass, { status: 'probably fine' }]).exitCode).toBe(1);
  });

  it('does not resolve a conflict just because one displayed candidate matches', () => {
    const result = conflictComparison([{ value: 100, source: 'A' }, { value: 120, source: 'B' }], 100, { abs: 1 });
    expect(result.status).toBe('FLAGGED');
    expect(result.candidates.map((c: { status: string }) => c.status)).toEqual(['PASS', 'FAIL']);
    expect(numericComparison(NaN, 100).status).toBe('SKIP');
  });

  it('removes nested authentication and redacts URL, bearer and configured secret values', () => {
    const secret = 'SyntheticAuditSecret123456';
    const result = sanitize({ headers: { Authorization: `Bearer ${secret}`, 'X-Api-Key': secret, Cookie: 'private' }, detail: `https://example.invalid/?apiKey=${secret} Bearer ${secret}`, nested: [{ message: secret }] }, { FINNHUB_API_KEY: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.headers).toEqual({});
    expect(JSON.stringify(result)).toContain('<redacted>');
  });
});

describe('central-bank audit evidence and chronology', () => {
  const policy = (patch: Record<string, unknown> = {}) => frame('policy', { banks: [{ code: 'FED', current: { upper: 4, lower: 3.75, lastSuccessfulAt: NOW - 1000, effectiveAt: Date.parse('2026-09-17T04:00:00Z') }, latestDecision: { date: '2026-10-28', announcedAt: NOW - 86_400_000, upper: 4, lower: 3.75, outcome: 'hold', changeBp: 0, sourceUrl: url }, ...patch }] });

  it('accepts a dated hold while keeping policy target distinct from the decision', () => {
    expect(validatePolicy(policy()).every((r: { status: string }) => r.status === 'PASS')).toBe(true);
    expect(validatePolicy(policy({ latestDecision: { date: '2026-10-28', outcome: 'hold', changeBp: 25, sourceUrl: url } })).some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
  });

  it('fails future effective targets and future confirmed announcements', () => {
    expect(validatePolicy(policy({ current: { upper: 4.25, lastSuccessfulAt: NOW, effectiveAt: NOW + 4 * 86_400_000 } })).some((r: { field: string; status: string }) => r.field === 'current effective date' && r.status === 'FAIL')).toBe(true);
    expect(validatePolicy(policy({ latestDecision: { outcome: 'hold', changeBp: 0, sourceUrl: url, announcedAt: NOW + 1000 } })).some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
  });

  it('cannot certify undated, stale or absent source checks and obsolete captures', () => {
    expect(validatePolicy(policy({ current: { upper: 4, error: 'source unavailable' } })).filter((r: { status: string }) => r.status === 'INCOMPLETE').length).toBeGreaterThan(0);
    expect(validatePolicy({ ...policy(), capturedAt: NOW - 7 * 3600_000 }, NOW)[0].status).toBe('BLOCKED');
    expect(validatePolicy(null, NOW)[0].status).toBe('BLOCKED');
  });

  it('independently compares a statement against captured target, outcome and date', () => {
    const html = '<p>The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.</p>';
    const reference = fedStatement(html, url);
    expect(reference).toMatchObject({ lower: 3.75, upper: 4, outcome: 'hold', date: '2026-10-28' });
    expect(verifyFed(policy(), reference).every((r: { status: string }) => r.status === 'PASS')).toBe(true);
    expect(verifyFed(policy(), { ...reference, upper: 4.25 }).some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
    expect(fedStatement(html, url.replace('federalreserve.gov', 'example.invalid'))).toBeNull();
  });
});

describe('earnings audit cannot certify incompatible or future observations', () => {
  it('checks arithmetic only for matching stated definitions', () => {
    expect(validateEarnings(frame('earnings', { quarters: [quarter] }), 'APLD', NOW).some((r: { field: string; status: string }) => r.field === 'EPS 2026-08-31' && r.status === 'PASS')).toBe(true);
    for (const patch of [{ basis: 'gaap' }, { currency: 'TWD' }, { shareBasis: 'ordinary' }, { epsType: 'basic' }, { scope: 'discontinued operations' }]) {
      expect(compatible(eps, { ...eps, ...patch })).toBe(false);
      const rows = validateEarnings(frame('earnings', { quarters: [{ ...quarter, actual: { ...quarter.actual, ...patch } }] }), 'APLD', NOW);
      expect(rows.some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
    }
  });

  it('rejects post-announcement snapshots while accepting eligible same-day estimates', () => {
    const announcedAt = Date.parse('2026-10-07T20:15:00Z');
    const q = { ...quarter, announcedAt, cutoffAt: announcedAt, estimateProvenance: 'pre-announcement-snapshot', estimate: { ...eps, retrievedAt: announcedAt - 1000 } };
    expect(validateEarnings(frame('earnings', { quarters: [q] }), 'APLD', NOW).some((r: { field: string; status: string }) => /estimate cutoff/.test(r.field) && r.status === 'PASS')).toBe(true);
    expect(validateEarnings(frame('earnings', { quarters: [{ ...q, estimate: { ...q.estimate, retrievedAt: announcedAt + 1 } }] }), 'APLD', NOW).some((r: { field: string; status: string }) => /estimate cutoff/.test(r.field) && r.status === 'FAIL')).toBe(true);
  });

  it('rejects duplicate periods, invalid dates, future actuals and nonconsecutive aggregates', () => {
    for (const quarters of [[quarter, quarter], [{ ...quarter, periodEnd: '2026-02-30' }], [{ ...quarter, periodEnd: '2027-02-28' }]]) {
      expect(validateEarnings(frame('earnings', { quarters }), 'APLD', NOW).some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
    }
    const aggregates = [{ metric: 'TTM EPS', periodEnds: ['2025-05-31', '2025-08-31', '2026-02-28', '2026-05-31'] }];
    expect(validateEarnings(frame('earnings', { quarters: [quarter], aggregates }), 'APLD', NOW).some((r: { field: string; status: string }) => /periods/.test(r.field) && r.status === 'FAIL')).toBe(true);
  });

  it('selects directly filed diluted EPS with compatible units and explicit revision history', () => {
    const row = { start: '2026-06-01', end: '2026-08-31', filed: '2026-10-07', form: '10-Q', val: -0.82, accn: 'first' };
    const facts = { facts: { 'us-gaap': { EarningsPerShareDiluted: { units: { 'USD/shares': [row, { ...row, start: '2025-09-01', val: 9 }, { ...row, form: 'DEF 14A', filed: '2026-10-29', val: 10 }, { ...row, form: '10-Q/A', filed: '2026-10-20', val: -0.80, accn: 'amended' }] } } } } };
    expect(filedQuarterEps(facts, row.end, 'USD')).toMatchObject({ val: -0.80, form: '10-Q/A', concept: 'EarningsPerShareDiluted' });
    expect(filedQuarterEps(facts, row.end, 'TWD')).toBeNull();
    expect(filedQuarterEps(facts, row.end, undefined)).toBeNull();
    expect(filedQuarterEps(facts, '2026-05-31', 'USD')).toBeNull();
  });
});

describe('supply-chain audit separates evidence, entity counts and completeness', () => {
  const evidence = [{ sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/report.htm', sentence: 'We entered into a signed lease with Example Cloud for our North Campus.' }];
  const relation = { id: 'party:1|customer', entityId: 'party:1', name: 'Example Cloud', role: 'customer', anonymous: false, evidence };
  const base = () => frame('supply-chain', { coverage: { status: 'bounded', failedRequests: 0, capReached: false }, counts: { namedCounterparties: 1, anonymousCounterparties: 0, concentrationDisclosures: 1 }, relations: [relation], concentrations: [{ id: 'disclosure:1', share: 59, period: 'FY2026', denominator: 'target revenue' }] });

  it('counts one entity with both roles without inventing extra parties from a concentration', () => {
    const snapshot = base();
    const result = validateSupply({ ...snapshot, relations: [relation, { ...relation, id: 'party:1|supplier', role: 'supplier' }] }, 'APLD', NOW);
    expect(result.every((r: { status: string }) => r.status === 'PASS')).toBe(true);
    const bad = validateSupply({ ...snapshot, counts: { namedCounterparties: 2, anonymousCounterparties: 0, concentrationDisclosures: 1 } }, 'APLD', NOW);
    expect(bad.some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
  });

  it('treats failed or capped source extraction as partial and incomplete assurance', () => {
    const failed = validateSupply({ ...base(), coverage: { status: 'bounded', failedRequests: 1 } }, 'APLD', NOW);
    expect(failed.some((r: { status: string }) => r.status === 'FAIL')).toBe(true);
    const partial = validateSupply({ ...base(), coverage: { status: 'partial', failedRequests: 1 } }, 'APLD', NOW);
    expect(partial.some((r: { status: string }) => r.status === 'INCOMPLETE')).toBe(true);
  });

  it('corroborates an exact quotation without declaring its role independently proven', () => {
    expect(quotedEvidence(`<p>${evidence[0].sentence}</p>`, evidence[0])).toBe(true);
    expect(quotedEvidence('<p>No tenant has signed a lease.</p>', evidence[0])).toBe(false);
    expect(evidenceUrl('https://www.sec.gov.evil.invalid/Archives/edgar/data/1/a.htm', 'sec')).toBe(false);
    expect(evidenceUrl(evidence[0].sourceUrl, 'sec')).toBe(true);
    expect(evidenceUrl(`${evidence[0].sourceUrl}?token=private`, 'sec')).toBe(false);
  });
});
