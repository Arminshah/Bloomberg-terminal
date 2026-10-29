import { describe, expect, it } from 'vitest';
import {
  appendRelationshipHistory, compatibleShareTotal, contractIntervals, customerCounts, enrichRelation,
  relationStatus, relationshipView,
} from '../src/data/live/supply-chain-history';
import { mergeRelations, runChain, type Chain, type ChainIO, type Evidence, type Relation } from '../src/data/live/supply-chain';

const seen = (day: string) => Date.parse(`${day}T12:00:00Z`);
const evidence = (sentence: string, date: string, observedDate = date, path = `1/${date}/filing.htm`): Evidence => ({
  sentence, date, observedAt: seen(observedDate), path, filer: 'Example Issuer', form: '8-K',
});
const relation = (ev: Evidence, over: Partial<Relation> = {}): Relation => ({
  key: 'bank', name: 'Example Bank', role: 'lender', side: 'own', evidence: [ev], ...over,
});
const chain = (relations: Relation[], history = relations): Chain => ({ state: 'ok', filers: [], relations, history, changes: {} });
const revenue = (key: string, value: number, sentence: string, date = '2026-07-01', over: Partial<Relation> = {}) => enrichRelation(relation(evidence(sentence, date), {
  key, name: key, role: 'customer', share: value, basis: 'target-revenue', ...over,
}));

describe('SPLC contract chronology', () => {
  it('closes only the repaid facility and retains the same bank as a lender on its other loan', () => {
    const north = relation(evidence('On January 2, 2026, we entered into the "North Facility" with Example Bank.', '2026-01-03'));
    const south = relation(evidence('On February 2, 2026, we entered into the "South Facility" with Example Bank.', '2026-02-03'));
    const closed = relation(evidence('On March 2, 2026, we repaid in full the "North Facility" with Example Bank.', '2026-03-03'));
    const [bank] = appendRelationshipHistory([], [north, south, closed]);
    expect(bank.assertions?.map((a) => [a.contractKey, a.state])).toEqual([
      ['named:north facility', 'signed'], ['named:south facility', 'signed'], ['named:north facility', 'ended'],
    ]);
    expect(relationStatus(bank, '2026-04-01')).toBe('reported');
    expect(contractIntervals([bank], '2026-04-01').map((c) => [c.contractKey, c.from, c.to, c.state])).toEqual([
      ['named:north facility', '2026-01-02', '2026-03-02', 'ended'],
      ['named:south facility', '2026-02-02', undefined, 'signed'],
    ]);
    expect(relationshipView(chain([bank]), 'current', '2026-04-01', '2026-04-01')).toHaveLength(1);
    const [northOnly] = appendRelationshipHistory([], [north, closed]);
    expect(relationStatus(northOnly, '2026-04-01')).toBe('ended');
    expect(relationshipView(chain([northOnly]), 'current', '2026-04-01', '2026-04-01')).toEqual([]);
  });

  it('preserves a terminated lease and its later re-signing as separate active intervals', () => {
    const over: Partial<Relation> = { key: 'tenant', name: 'Example Tenant', role: 'customer' };
    const signed = relation(evidence('On January 2, 2026, we signed the "Campus Lease" with Example Tenant.', '2026-01-03'), over);
    const ended = relation(evidence('The "Campus Lease" with Example Tenant terminated on March 2, 2026.', '2026-03-03'), over);
    const resigned = relation(evidence('On May 2, 2026, we signed the "Campus Lease" with Example Tenant.', '2026-05-03'), over);
    const [tenant] = appendRelationshipHistory([], [signed, ended, resigned]);
    const c = chain([tenant]);
    expect(relationshipView(c, 'current', '2026-02-01', '2026-02-01')).toHaveLength(1);
    expect(relationshipView(c, 'current', '2026-04-01', '2026-04-01')).toEqual([]);
    expect(relationshipView(c, 'history', '2026-04-01', '2026-04-01')[0].assertions).toHaveLength(2);
    expect(relationshipView(c, 'current', '2026-06-01', '2026-06-01')[0].assertions).toHaveLength(3);
    const intervals = contractIntervals([tenant], '2026-06-01');
    expect(intervals.map((x) => [x.contractKey, x.from, x.to, x.state])).toEqual([
      ['named:campus lease', '2026-01-02', '2026-03-02', 'ended'],
      ['named:campus lease', '2026-05-02', undefined, 'signed'],
    ]);
    expect(new Set(intervals.map((x) => x.id)).size).toBe(2);
    expect(intervals.map((x) => x.evidence.length)).toEqual([2, 1]);
  });

  it('keeps an announced future-effective termination separate from the current relationship', () => {
    const signed = relation(evidence('We entered into the "North Facility" with Example Bank.', '2026-01-03'));
    const closed = relation(evidence('The "North Facility" with Example Bank was terminated effective July 1, 2026.', '2026-06-03'));
    const [bank] = appendRelationshipHistory([], [signed, closed]);
    expect(bank.assertions?.at(-1)?.effectiveTo).toBe('2026-07-01');
    expect(relationStatus(bank, '2026-06-30')).toBe('reported');
    expect(relationStatus(bank, '2026-07-01')).toBe('ended');
    expect(contractIntervals([bank], '2026-06-30')[0]).toMatchObject({ to: '2026-07-01', state: 'signed' });
    expect(contractIntervals([bank], '2026-07-01')[0].state).toBe('ended');
  });

  it('does not erase every bank facility when a repayment has no contract identity', () => {
    const open = relation(evidence('We entered into the "South Facility" with Example Bank.', '2026-02-03'));
    const ambiguous = relation(evidence('We repaid in full a loan with Example Bank.', '2026-03-03'));
    const [bank] = appendRelationshipHistory([], [open, ambiguous]);
    expect(bank.assertions?.at(-1)?.scope).toBe('unresolved');
    expect(relationStatus(bank)).toBe('unresolved');
    expect(relationshipView(chain([bank]), 'current')).toHaveLength(1);
  });
});

describe('SPLC recorded knowledge and immutable observations', () => {
  it('counts resolved and anonymous tenant entities separately from unassigned concentration observations', () => {
    const coreweave = relation(evidence('We signed a lease with CoreWeave.', '2026-01-03'), { key: 'coreweave', name: 'CoreWeave', role: 'customer' });
    const oracle = relation(evidence('We signed a lease with Oracle.', '2026-02-03'), { key: 'oracle', name: 'Oracle', role: 'customer' });
    const anonymous = relation(evidence('We signed a lease with an unnamed hyperscaler.', '2026-03-03'), { key: 'unnamed:hyperscaler', name: 'Unnamed hyperscaler', unnamed: true, role: 'customer' });
    const first = revenue('unnamed:1', 59, 'For fiscal year 2026, one customer represented 59% of total revenue.', '2026-07-01', { recordKind: 'concentration' });
    const second = revenue('unnamed:2', 25, 'For fiscal year 2026, another customer represented 25% of total revenue.', '2026-07-01', { recordKind: 'concentration' });
    const rows = [coreweave, oracle, anonymous, first, second];
    expect(customerCounts(rows)).toEqual({ named: 2, unnamed: 1, concentrations: 2 });
    expect(customerCounts([...rows, oracle])).toEqual({ named: 2, unnamed: 1, concentrations: 2 });
    expect(rows.filter((r) => ['coreweave', 'oracle'].includes(r.key)).every((r) => r.share == null)).toBe(true);
    expect(compatibleShareTotal(rows)).toBeUndefined();
  });

  it('does not make a later tenant identity visible in an earlier knowledge view', () => {
    const anonymous = relation(evidence('We signed a lease with an unnamed hyperscaler at Polaris Forge 2.', '2026-01-03'), {
      key: 'unnamed:hyperscaler', name: 'Unnamed hyperscaler', unnamed: true, role: 'customer',
    });
    const named = relation(evidence('Polaris Forge 2 is leased to Oracle.', '2026-05-03'), {
      key: 'oracle', name: 'Oracle', role: 'customer',
    });
    const history = appendRelationshipHistory([], [anonymous, named]);
    const current = mergeRelations([anonymous, named], { strictIdentity: true });
    const before = relationshipView(chain(current, history), 'current', '2026-04-01', '2026-04-01');
    expect(before.map((r) => r.name)).toEqual(['Unnamed hyperscaler']);
    expect(before[0].unnamed).toBe(true);
    expect(before[0].evidence.every((e) => e.date < '2026-04-01')).toBe(true);
    const after = relationshipView(chain(current, history), 'current', '2026-06-01', '2026-06-01');
    expect(after.map((r) => [r.name, r.unnamed])).toEqual([['Oracle', false]]);
    expect(after[0].evidence.map((e) => e.date).sort()).toEqual(['2026-01-03', '2026-05-03']);
    expect(current.find((r) => r.unnamed)?.evidence[0].date).toBe('2026-01-03');
  });

  it('does not resolve an anonymous tenant from generic timing or an ambiguously shared site', () => {
    const old = relation(evidence('We signed a lease with a hyperscaler at Polaris Forge 2.', '2026-01-03'), {
      key: 'unnamed:hyperscaler', name: 'Unnamed hyperscaler', unnamed: true, role: 'customer',
    });
    const oracle = relation(evidence('Polaris Forge 2 is leased to Oracle.', '2026-05-03'), { key: 'oracle', name: 'Oracle', role: 'customer' });
    const other = relation(evidence('Polaris Forge 2 is leased to Example Tenant.', '2026-05-03'), { key: 'other', name: 'Example Tenant', role: 'customer' });
    const merged = mergeRelations([old, oracle, other], { strictIdentity: true });
    expect(merged.find((r) => r.unnamed)?.identityLinks).toBeUndefined();
    expect(relationshipView(chain(merged), 'current').filter((r) => r.unnamed)).toHaveLength(1);
    const generic = relation(evidence('We signed a lease with a second hyperscaler.', '2026-05-03'), { key: 'unnamed:second hyperscaler', name: 'Second unnamed hyperscaler', unnamed: true, role: 'customer' });
    expect(mergeRelations([old, generic, oracle], { strictIdentity: true }).filter((r) => r.unnamed)).toHaveLength(2);
  });

  it('does not pretend that a historical filing was recorded before collection', () => {
    const old = relation(evidence('We signed the "North Facility" with Example Bank.', '2020-01-03', '2026-01-03'));
    const [bank] = appendRelationshipHistory([], [old]);
    expect(relationshipView(chain([bank]), 'history', '2025-12-31')).toEqual([]);
    expect(relationshipView(chain([bank]), 'history', '2026-01-03')).toHaveLength(1);
  });

  it('retains annual, quarterly and amended concentration versions without mutating the first observation', () => {
    const over: Partial<Relation> = { key: 'unnamed:1', name: 'Unnamed customer 1', recordKind: 'concentration' };
    const annual = revenue('unused', 59, 'For fiscal year 2026, one customer represented 59% of total revenue.', '2026-07-01', over);
    const quarterly = revenue('unused', 63, 'For the first quarter of fiscal year 2027, one customer represented 63% of total revenue.', '2026-10-01', over);
    const amended = revenue('unused', 58, 'For fiscal year 2026, one customer represented 58% of total revenue.', '2026-10-03', over);
    const first = appendRelationshipHistory([], [annual]);
    const original = structuredClone(first);
    const history = appendRelationshipHistory(first, [quarterly, amended]);
    expect(first).toEqual(original);
    expect(history.flatMap((r) => r.observations ?? []).map((o) => [o.period, o.value])).toEqual([
      ['FY2026', 59], ['Q1 FY2027', 63], ['FY2026', 58],
    ]);
    expect(customerCounts(history)).toEqual({ named: 0, unnamed: 0, concentrations: 3 });
  });

  it('reselects the original share in an earlier knowledge view after an amendment arrives', () => {
    const original = revenue('Oracle', 25, 'For fiscal year 2026, Oracle represented 25% of total revenue.', '2026-07-01');
    const amended = revenue('Oracle', 23, 'For fiscal year 2026, Oracle represented 23% of total revenue.', '2026-10-03');
    const rows = mergeRelations([original, amended], { strictIdentity: true });
    expect(rows[0].share).toBe(23);
    const before = relationshipView(chain(rows), 'current', '2026-09-30');
    expect(before[0].share).toBe(25);
    expect(before[0].evidence[0].date).toBe('2026-07-01');
    expect(before[0].observations?.map((o) => o.value)).toEqual([25]);
    expect(relationshipView(chain(rows), 'current', '2026-10-04')[0].share).toBe(23);
    expect(rows[0].share).toBe(23);
  });

  it('preserves independently supported supplier and customer roles for the same company', () => {
    const customer = relation(evidence('For fiscal year 2026, Oracle represented 25% of total revenue.', '2026-07-01'), { key: 'oracle', name: 'Oracle', role: 'customer', share: 25, basis: 'target-revenue', side: 'theirs' });
    const supplier = relation(evidence('We buy servers from Oracle.', '2026-07-01'), { key: 'oracle', name: 'Oracle', role: 'supplier', side: 'theirs' });
    expect(mergeRelations([customer, supplier], { strictIdentity: true, preserveRoles: true }).map((r) => r.role)).toEqual(['customer', 'supplier']);
  });
});

describe('SPLC coherent revenue denominators', () => {
  const annual = (key: string, value: number, over: Partial<Relation> = {}) => revenue(key, value, `For fiscal year 2026, ${key} represented ${value}% of total revenue.`, '2026-07-01', over);
  it('sums exact shares of distinct identified customers for one target revenue period', () => {
    expect(compatibleShareTotal([annual('CoreWeave', 59), annual('Oracle', 25)])).toBe(84);
    const a = revenue('CoreWeave', 59, 'For the year ended June 30, 2026, CoreWeave represented 59% of total revenue.');
    const b = revenue('Oracle', 25, 'For the year ended June 30, 2026, Oracle represented 25% of total revenue.');
    expect(a.observations?.[0].periodEnd).toBe('2026-06-30');
    expect(compatibleShareTotal([a, b])).toBe(84);
  });
  it('rejects incompatible periods, denominators, scope, lower bounds, anonymous records and repeated entities', () => {
    const a = annual('CoreWeave', 59);
    expect(compatibleShareTotal([a, revenue('Oracle', 25, 'For the first quarter of fiscal year 2027, Oracle represented 25% of total revenue.')])).toBeUndefined();
    expect(compatibleShareTotal([a, revenue('Oracle', 25, 'For fiscal year 2026, Oracle represented 25% of our cloud segment revenue.')])).toBeUndefined();
    expect(compatibleShareTotal([a, annual('Oracle', 25, { basis: 'their-revenue' })])).toBeUndefined();
    expect(compatibleShareTotal([a, annual('Oracle', 25, { qualifier: '>' })])).toBeUndefined();
    expect(compatibleShareTotal([a, annual('unnamed:1', 25, { recordKind: 'concentration' })])).toBeUndefined();
    expect(compatibleShareTotal([a, annual('Oracle', 25, { unnamed: true })])).toBeUndefined();
    expect(compatibleShareTotal([a, a])).toBeUndefined();
    expect(compatibleShareTotal([annual('CoreWeave', 80), annual('Oracle', 30)])).toBeUndefined();
    const june30 = revenue('CoreWeave', 59, 'For the year ended June 30, 2026, CoreWeave represented 59% of total revenue.');
    const june29 = revenue('Oracle', 25, 'For the year ended June 29, 2026, Oracle represented 25% of total revenue.');
    expect(june30.observations?.[0].period).toBe(june29.observations?.[0].period);
    expect(june29.observations?.[0].periodEnd).toBe('2026-06-29');
    expect(compatibleShareTotal([june30, june29])).toBeUndefined();
  });
});

describe('SPLC partial extraction coverage', () => {
  it('retains a positively extracted customer while exposing failed searches and documents', async () => {
    const io: ChainIO = {
      companies: async () => [{ cik: 1, ticker: 'EXAMPLE', title: 'Example Issuer' }],
      filings: async () => [
        { form: '10-K', filed: '2026-07-01', accession: '0000000001-26-000001', doc: 'annual.htm' },
        { form: '10-Q', filed: '2026-10-01', accession: '0000000001-26-000002', doc: 'quarter.htm' },
      ],
      fts: async () => { throw new Error('source unavailable'); },
      text: async (_kind, path) => {
        if (path.endsWith('quarter.htm')) throw new Error('document unavailable');
        return ['We entered into a data center lease with Oracle.'];
      },
      securities: [],
    };
    let result: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'EXAMPLE', name: 'Example Issuer' }, io, (update) => { result = update(result); });
    expect(result.relations.some((r) => r.role === 'customer' && /Oracle/i.test(r.name))).toBe(true);
    expect(result.coverage).toMatchObject({ state: 'partial', failedDocuments: 1 });
    expect(result.coverage!.failedSearches).toBeGreaterThan(0);
    expect(result.filers.some((f) => f.state === 'failed')).toBe(true);
    expect(result.coverage!.warnings.join(' ')).toContain('not evidence of no relationships');
  });

  it('marks capped searches as partial even when every request succeeds', async () => {
    const io: ChainIO = {
      companies: async () => [{ cik: 1, ticker: 'EXAMPLE', title: 'Example Issuer' }],
      filings: async () => [{ form: '10-K', filed: '2026-07-01', accession: '0000000001-26-000001', doc: 'annual.htm' }],
      fts: async (arg) => ({ hits: [], total: arg.startsWith('|') && arg.endsWith('|reports') ? 301 : 0 }),
      text: async () => ['We entered into a data center lease with Oracle.'],
      securities: [],
    };
    let result: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'EXAMPLE', name: 'Example Issuer' }, io, (update) => { result = update(result); });
    expect(result.relations.some((r) => r.role === 'customer' && /Oracle/i.test(r.name))).toBe(true);
    expect(result.coverage).toMatchObject({ state: 'partial', capReached: true, failedSearches: 0, failedDocuments: 0 });
    expect(result.coverage!.warnings.join(' ')).toContain('exceeded a search window');
  });
});
