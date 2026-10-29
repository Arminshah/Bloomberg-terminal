import { afterEach, describe, expect, it, vi } from 'vitest';
import * as main from '../electron/usaspending.cjs';
import { buildDirectory, federalParty, mergeRelations, normalizeName, runChain, targetNames, targetPattern, type Chain, type ChainIO, type Relation } from '../src/data/live/supply-chain';
import { agencyName, agencyRelations, federalRelations, ownRecipients, subRelations, type FedAward, type FedRecipient, type FedSubaward, type FederalContext, type UsaspendingAnswer, type UsaspendingKind } from '../src/data/live/usaspending';
import type { SecCompany } from '../src/data/live/sec';
import { describe as relationLine, shareLabel, sourceUrl } from '../src/functions/SPLC';
import FIX from './fixtures/usaspending-2026-10.json';
// USAspending.gov's recipient entries for JPMorgan Chase and the units it files under JPMorgan Chase & Co. (29 October
// 2026): its banks and asset managers, and Clariant, Evonik, Transworld Systems, NCO Financial and two railroads.
import JPM from './fixtures/usaspending-jpm-2026-10-29.json';

// The fixture's answers (USAspending.gov's of 28 October 2026, trimmed: Palantir's records and Lockheed Martin's F-35
// subcontracts), read as the main process reads them.
const parse = <T>(kind: UsaspendingKind, body: unknown) => main.parseUsaspending(kind, JSON.stringify(body)) as T[];
const TODAY = '2026-10-28';
const NOW = Date.parse(`${TODAY}T12:00:00Z`);

const COMPANIES: SecCompany[] = [
  { cik: 1321655, ticker: 'PLTR', title: 'Palantir Technologies Inc.' },
  { cik: 936468, ticker: 'LMT', title: 'LOCKHEED MARTIN CORP' },
  { cik: 40533, ticker: 'GD', title: 'GENERAL DYNAMICS CORP' },
  { cik: 1133421, ticker: 'NOC', title: 'NORTHROP GRUMMAN CORP /DE/' },
  { cik: 1443646, ticker: 'BAH', title: 'Booz Allen Hamilton Holding Corp' },
  { cik: 12927, ticker: 'BA', title: 'BOEING CO' },
  { cik: 1501585, ticker: 'HII', title: 'HUNTINGTON INGALLS INDUSTRIES, INC.' },
  { cik: 101829, ticker: 'RTX', title: 'RTX Corp' },
  { cik: 1144879, ticker: 'APLD', title: 'Applied Digital Corp.' },
  { cik: 19617, ticker: 'JPM', title: 'JPMORGAN CHASE & CO' },
];
const dir = buildDirectory(COMPANIES);

function context(ticker: string): FederalContext {
  const me = COMPANIES.find((c) => c.ticker === ticker)!;
  const names = targetNames(ticker, me.title);
  const keys = [...new Set([normalizeName(me.title), ...names.legal.map(normalizeName)])];
  const re = new RegExp(targetPattern(names.names).source);
  return { keys, self: (n) => re.test(n) || keys.some((k) => normalizeName(n) === k || normalizeName(n).startsWith(`${k} `)), party: (n) => federalParty(n, dir), normalize: normalizeName, today: TODAY };
}

describe('USAspending requests (main process)', () => {
  it('builds the five requests SPLC makes, from fixed shapes', () => {
    expect(main.usaspendingRequest('recipients', 'palantir technologies', NOW)).toEqual({ method: 'POST', url: `${main.API}/recipient/`, body: { keyword: 'palantir technologies', award_type: 'contracts', limit: 50, page: 1, sort: 'amount', order: 'desc' } });
    expect(main.usaspendingRequest('children', 'FSY4LVSBGWB7', NOW)).toEqual({ method: 'GET', url: `${main.API}/recipient/children/FSY4LVSBGWB7/` });
    const awards = main.usaspendingRequest('awards', 'FSY4LVSBGWB7, HNN4F9JZWDY8', NOW)!;
    expect(awards.url).toBe(`${main.API}/search/spending_by_award/`);
    expect(awards.body.filters).toEqual({ recipient_search_text: ['FSY4LVSBGWB7', 'HNN4F9JZWDY8'], award_type_codes: ['A', 'B', 'C', 'D'], time_period: [{ start_date: '2024-10-28', end_date: '2026-10-28' }] });
    expect(awards.body.subawards).toBeUndefined();
    const received = main.usaspendingRequest('subawards', 'HNN4F9JZWDY8', NOW)!;
    expect(received.body).toMatchObject({ subawards: true, filters: { recipient_search_text: ['HNN4F9JZWDY8'] }, sort: 'Sub-Award Amount' });
    expect(received.body.fields).toContain('Prime Award Recipient UEI');
    const let_ = main.usaspendingRequest('subs', 'N0001917C0001,W9128Z26FA001', NOW)!;
    expect(let_.body).toMatchObject({ subawards: true, filters: { award_ids: ['N0001917C0001', 'W9128Z26FA001'], time_period: [{ start_date: '2021-10-29', end_date: '2026-10-28' }] } });
  });

  it('refuses anything else', () => {
    expect(main.usaspendingRequest('sub-of', 'CONT_AWD_N0001917C0001_9700_-NONE-_-NONE-')).toBeNull();
    expect(main.usaspendingRequest('children', 'fsy4lvsbgwb7')).toBeNull();
    expect(main.usaspendingRequest('children', '../../award')).toBeNull();
    expect(main.usaspendingRequest('awards', Array.from({ length: 26 }, (_, i) => `ABCDEFGHIJ${String(i).padStart(2, '0')}`).join(','))).toBeNull();
    expect(main.usaspendingRequest('awards', 'FSY4LVSBGWB7,bad')).toBeNull();
    expect(main.usaspendingRequest('recipients', 'ab')).toBeNull();
    expect(main.usaspendingRequest('recipients', 'name/with/slashes')).toBeNull();
    expect(main.usaspendingRequest('subs', 'N00019 17C0001')).toBeNull();
    expect(main.usaspendingRequest('recipients', 42 as unknown as string)).toBeNull();
  });

  it('reads each answer into the fields SPLC shows, and nothing from an answer of another shape', () => {
    const recipients = parse<FedRecipient>('recipients', FIX.recipients);
    expect(recipients[0]).toEqual({ id: '1ea8a9a4-3726-3491-9040-66950bb67606-P', name: 'PALANTIR TECHNOLOGIES INC.', uei: 'FSY4LVSBGWB7', level: 'P', amount: 1981443005.8 });
    expect(parse<FedRecipient>('children', FIX.children).map((c) => c.name)).toEqual(['PALANTIR USG INC', 'PALANTIR TECHNOLOGIES INC.']);
    const awards = parse<FedAward>('awards', FIX.awards);
    expect(awards[0]).toMatchObject({ id: 'CONT_AWD_W9128Z26FA001_9700_W519TC25D0039_9700', award: 'W9128Z26FA001', recipient: 'PALANTIR USG INC', uei: 'HNN4F9JZWDY8', amount: 637552404.79, agency: 'Department of Defense', subAgency: 'Department of the Army', start: '2025-10-15', end: '2029-05-31' });
    const subs = parse<FedSubaward>('subawards', FIX.subawards);
    expect(subs[0]).toMatchObject({ id: 'GDIT-68282', award: '47QFCA24F0009', recipient: 'PALANTIR USG INC', uei: 'HNN4F9JZWDY8', prime: 'GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.', primeUei: 'SMNWM6HN79X5', amount: 15480000, date: '2025-02-05' });
    expect(main.parseUsaspending('awards', '<html>busy</html>')).toBeNull();
    expect(main.parseUsaspending('awards', '{"detail":"error"}')).toBeNull();
    expect(main.parseUsaspending('children', '{"results":[]}')).toBeNull();
  });
});

describe('SPLC: the federal records of a company', () => {
  it('finds the company by its own name: Palantir.net and Applied Digital Solutions are other companies', () => {
    const recipients = parse<FedRecipient>('recipients', FIX.recipients);
    expect(ownRecipients(recipients, context('PLTR')).map((r) => `${r.name} ${r.level}`)).toEqual(['PALANTIR TECHNOLOGIES INC. P', 'PALANTIR TECHNOLOGIES INC. C']);
    expect(ownRecipients([{ name: 'APPLIED DIGITAL SOLUTIONS INC', uei: 'JD4XP94J5G94', level: 'P', amount: 14999 }], context('APLD'))).toEqual([]);
  });

  it('takes the agencies of the contracts running in the last year as customers, with the amounts obligated', () => {
    const rels = agencyRelations(parse<FedAward>('awards', FIX.awards), context('PLTR'));
    const by = Object.fromEntries(rels.map((r) => [r.name, Math.round(r.amount! / 1e3)]));
    // The Air Force's contract that ended in June 2025 and Veterans Affairs' of September 2025 are over.
    expect(by).toEqual({
      'Department of the Army': Math.round((637552404.79 + 292680689.24 + 145033091.2 + 114778648 + 103425091.06) / 1e3),
      'U.S. Immigration and Customs Enforcement': 170765,
      'Department of the Air Force': 122224,
      'Office of the Chief Financial Officer, Department of Agriculture': 94688,
    });
    const army = rels.find((r) => r.name === 'Department of the Army')!;
    expect(army).toMatchObject({ key: 'gov:department of the army', role: 'customer', side: 'records' });
    expect(army.evidence[0]).toMatchObject({ filer: 'USAspending.gov', form: 'Contract', date: '2025-10-15', url: 'https://www.usaspending.gov/award/CONT_AWD_W9128Z26FA001_9700_W519TC25D0039_9700' });
    expect(army.evidence[0].sentence).toMatch(/^Department of the Army contract W9128Z26FA001 with PALANTIR USG INC: \$637\.6M obligated, from Oct 2025 to May 2029\. /);
    expect(agencyName({ agency: 'Department of Energy', subAgency: 'Department of Energy' })).toBe('Department of Energy');
  });

  it('takes the primes that subcontract to it as customers, a report repeated word for word once', () => {
    const units = new Set(['FSY4LVSBGWB7', 'HNN4F9JZWDY8']);
    const rels = subRelations(parse<FedSubaward>('subawards', FIX.subawards), 'customer', context('PLTR'), units);
    // Northrop Grumman's report of $3.3M is in the records five times over.
    expect(rels.map((r) => [r.name, r.ticker ?? '', Math.round(r.amount! / 1e3)])).toEqual([
      ['GENERAL DYNAMICS CORP', 'GD', Math.round((15480000 + 8048488.66 + 5076554.4 + 750000 + 99805) / 1e3)],
      ['NORTHROP GRUMMAN CORP', 'NOC', 4600],
      ['MANTECH TSG-2 JOINT VENTURE', '', 2590],
      ['DELOITTE & TOUCHE LLP', '', 1330],
      ['Booz Allen Hamilton Holding Corp', 'BAH', 1287],
      ['SCIENCE APPLICATIONS INTERNATIONAL CORPORATION', '', 303],
      ['THE AEROSPACE CORPORATION', '', 125],
    ]);
    expect(rels[0].evidence[0]).toMatchObject({ form: 'Subcontract', url: 'https://www.usaspending.gov/award/CONT_AWD_47QFCA24F0009_4732_47QTCK18D0003_4732' });
  });

  it('takes the subcontractors on its own contracts as suppliers, its own units left out', () => {
    const rels = subRelations(parse<FedSubaward>('subs', FIX.subs), 'supplier', context('LMT'), new Set(['G4KDGE4JFFK7']));
    expect(rels.map((r) => [r.name, r.ticker ?? '', Math.round(r.amount! / 1e3)])).toEqual([
      ['NORTHROP GRUMMAN CORP', 'NOC', Math.round((157120101.8 + 59600185 + 30043786.8 + 23199786) / 1e3)],
      ['LEONARDO S.P.A.', '', Math.round((67946448 + 59938304) / 1e3)],
      ['BAE SYSTEMS (OPERATIONS) LIMITED', '', Math.round((46399547.7 + 44421828.62) / 1e3)],
      ['FOKKER AEROSTRUCTURES B.V.', '', Math.round((41458164 + 37505310) / 1e3)],
      ['GKN AEROSPACE TRANSPARENCY SYSTEMS INC.', '', 20680],
    ]);
    // Work under another company's contract of the same number is not the company's.
    expect(subRelations(parse<FedSubaward>('subs', FIX.subs), 'supplier', context('PLTR'), new Set(['FSY4LVSBGWB7']))).toEqual([]);
  });

  it('names a unit of a listed group by the group', () => {
    const p = (n: string) => { const f = federalParty(n, dir); return `${f.name}${f.ticker ? ` (${f.ticker})` : ''}`; };
    expect(p('NORTHROP GRUMMAN SYSTEMS CORPORATION')).toBe('NORTHROP GRUMMAN CORP (NOC)');
    expect(p('GENERAL DYNAMICS LAND SYSTEMS INC.')).toBe('GENERAL DYNAMICS CORP (GD)');
    expect(p('BOEING COMPANY, THE')).toBe('BOEING CO (BA)');
    expect(p('HUNTINGTON INGALLS INCORPORATED')).toBe('HUNTINGTON INGALLS INDUSTRIES, INC. (HII)');
    expect(p('RAYTHEON COMPANY')).toBe('RTX Corp (RTX)');
    // "Solutions" is no unit's word: Applied Digital Solutions is not Applied Digital.
    expect(p('APPLIED DIGITAL SOLUTIONS INC')).toBe('APPLIED DIGITAL SOLUTIONS INC');
    expect(federalParty('THE AEROSPACE CORPORATION', dir)).toEqual({ key: 'n:aerospace', name: 'THE AEROSPACE CORPORATION' });
  });

  it('reads the records in order and says how each step went', async () => {
    const asked: string[] = [];
    const ask = async (kind: UsaspendingKind, arg: string): Promise<UsaspendingAnswer> => {
      asked.push(`${kind} ${arg}`);
      const body = kind === 'recipients' ? FIX.recipients : kind === 'children' ? FIX.children : kind === 'awards' ? FIX.awards : kind === 'subawards' ? FIX.subawards : { results: [] };
      return { status: 200, rows: main.parseUsaspending(kind, JSON.stringify(body))! };
    };
    const marks: string[] = [];
    const got = await federalRelations(ask, context('PLTR'), (step, state, found) => marks.push(`${step} ${state}${found != null ? ` ${found}` : ''}`));
    expect(asked.map((a) => a.split(' ')[0])).toEqual(['recipients', 'children', 'awards', 'subawards', 'subs']);
    // The units largest first: the parent's own entry, then Palantir USG.
    expect(asked[2]).toBe('awards FSY4LVSBGWB7,HNN4F9JZWDY8');
    expect(asked[4].startsWith('subs W9128Z26FA001,W911QX24F0053,70CTD022FR0000170,')).toBe(true);
    expect(marks).toEqual(['awards reading', 'awards read 4', 'subawards reading', 'subawards read 7', 'subs reading', 'subs read 0']);
    expect(got.profile).toBe('https://www.usaspending.gov/recipient/1ea8a9a4-3726-3491-9040-66950bb67606-P/latest');
    expect(got.relations.filter((r) => r.role === 'customer')).toHaveLength(11);
    // A company not among the recipients: the three steps are read, none found.
    const none: string[] = [];
    const empty = await federalRelations(async () => ({ status: 200, rows: [] }), context('APLD'), (step, state, found) => none.push(`${step} ${state} ${found}`));
    expect(empty.relations).toEqual([]);
    expect(none).toEqual(['awards read 0', 'subawards read 0', 'subs read 0']);
    // Without an answer the steps failed.
    const failed: string[] = [];
    await federalRelations(async () => null, context('APLD'), (step, state) => failed.push(`${step} ${state}`));
    expect(failed).toEqual(['awards failed', 'subawards failed', 'subs failed']);
  });

  it("counts a unit named unlike the company only when the company's own filings name it", async () => {
    const asked: string[] = [];
    const ask = async (kind: UsaspendingKind, arg: string): Promise<UsaspendingAnswer> => {
      asked.push(`${kind} ${arg}`);
      const body = kind === 'recipients' ? JPM.recipients : kind === 'children' ? JPM.children : { results: [] };
      return { status: 200, rows: main.parseUsaspending(kind, JSON.stringify(body))! };
    };
    const looked: string[][] = [];
    // JPMorgan's 10-K and 10-Qs name J.P. Morgan Investment Management and J.P. Morgan Securities, not Clariant.
    const named = async (list: string[]) => {
      looked.push(list);
      return new Set(list.filter((n) => /morgan/.test(n)));
    };
    await federalRelations(ask, { ...context('JPM'), named });
    expect(looked[0]).toEqual(expect.arrayContaining(['clariant', 'transworld systems', 'evonik']));
    const units = asked.find((a) => a.startsWith('awards '))!.slice(7).split(',');
    expect(units).toEqual(expect.arrayContaining(['C2FRRGG7C699', 'FFXLNEJJJKJ7', 'J2W5NB6EDPH6']));
    // SPLC JPM listed the Defense Logistics Agency's contract with Clariant and Transworld Systems' collection work.
    for (const other of ['YNFFND612EA9', 'ME1JGD1YSJG7', 'G5U7RMFCTM75', 'CF98DGDLRC15', 'H3LHQ657VD84', 'MG5DLNJBA147']) expect(units).not.toContain(other);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the records beside the filings and joins what both say of a company', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const io: ChainIO = {
      companies: async () => COMPANIES,
      filings: async () => [],
      fts: async () => ({ hits: [], total: 0 }),
      text: async () => [],
      usaspending: async (kind) => {
        const body = kind === 'recipients' ? FIX.recipients : kind === 'children' ? FIX.children : kind === 'awards' ? FIX.awards : kind === 'subawards' ? FIX.subawards : { results: [] };
        return { status: 200, rows: main.parseUsaspending(kind, JSON.stringify(body))! };
      },
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'PLTR', name: 'Palantir Technologies' }, io, (f) => {
      chain = f(chain);
    });
    expect(chain.filers.map((f) => [f.form, f.source, f.state, f.found ?? ''])).toEqual([
      ['Federal contracts', 'federal', 'read', 4],
      ['Subcontracts received', 'federal', 'read', 7],
      ['Subcontracts let', 'federal', 'read', 0],
    ]);
    expect(chain.filers[0].url).toBe('https://www.usaspending.gov/recipient/1ea8a9a4-3726-3491-9040-66950bb67606-P/latest');
    expect(chain.relations.filter((r) => r.side === 'records').length).toBe(11);
    // A company its own filing names as a customer keeps that; the records add their amount and statements.
    const own: Relation = { key: 'cik:40533', name: 'General Dynamics', ticker: 'GD', cik: 40533, role: 'customer', side: 'own', evidence: [{ sentence: 'We work with General Dynamics.', filer: 'Palantir', form: '10-K', date: '2026-02-17', path: '1321655/x/pltr.htm' }] };
    const gd = mergeRelations([own, ...chain.relations]).find((r) => r.key === 'cik:40533' && r.role === 'customer')!;
    expect(gd.side).toBe('own');
    expect(gd.amount).toBeCloseTo(29454848.06, 1);
    expect(gd.evidence.length).toBe(6);
  });
});

describe('SPLC: how a relation from the records reads', () => {
  const army: Relation = { key: 'gov:department of the army', name: 'Department of the Army', role: 'customer', side: 'records', amount: 1_293_469_514.29, evidence: [{ sentence: 'Department of the Army contract W9128Z26FA001 with PALANTIR USG INC.', filer: 'USAspending.gov', form: 'Contract', date: '2025-10-15', path: '', url: 'https://www.usaspending.gov/award/CONT_AWD_W9128Z26FA001_9700_W519TC25D0039_9700' }] };
  it('shows the dollars and the record behind it', () => {
    expect(shareLabel(army)).toBe('Contracts $1.3B · Oct 2025');
    expect(relationLine(army, 'PLTR US')).toBe("Federal agency: $1.3B obligated on PLTR US's contracts running in the last year");
    expect(sourceUrl(army.evidence[0])).toBe('https://www.usaspending.gov/award/CONT_AWD_W9128Z26FA001_9700_W519TC25D0039_9700');
    expect(sourceUrl({ path: '1321655/000132165526000010/pltr-20251231.htm' })).toBe('https://www.sec.gov/Archives/edgar/data/1321655/000132165526000010/pltr-20251231.htm');
    const gd: Relation = { ...army, key: 'cik:40533', name: 'General Dynamics', role: 'customer', amount: 29_355_043, evidence: [{ ...army.evidence[0], form: 'Subcontract', date: '2026-03-06' }] };
    expect(shareLabel(gd)).toBe('Subcontracts $29.4M · Mar 2026');
    expect(relationLine(gd, 'PLTR US')).toBe('Prime contractor: $29.4M in subcontracts to PLTR US in two years');
    expect(relationLine({ ...gd, role: 'supplier' }, 'LMT US')).toBe("Subcontractor on LMT US's federal contracts: $29.4M reported in five years");
  });
});
