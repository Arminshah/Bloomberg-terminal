import { describe, expect, it } from 'vitest';
import {
  buildDirectory, classify, currentDocs, dealClause, findCompanies, mergeRelations, ownRelations, ownStatements, rankFilers, runChain, searchNames,
  targetNames, targetPattern, unnamedParty, type Chain, type ChainIO, type FtsHit, type Relation,
} from '../src/data/live/supply-chain';
import type { SecCompany } from '../src/data/live/sec';

// Sentences as Applied Digital, its suppliers and others wrote them in filings of 2025-2026.
const COMPANIES: SecCompany[] = [
  { cik: 1144879, ticker: 'APLD', title: 'Applied Digital Corp.' },
  { cik: 1769628, ticker: 'CRWV', title: 'CoreWeave, Inc.' },
  { cik: 1839341, ticker: 'CORZ', title: 'Core Scientific, Inc./tx' },
  { cik: 1964789, ticker: 'HUT', title: 'Hut 8 Corp.' },
  { cik: 931015, ticker: 'PII', title: 'POLARIS INC.' },
  { cik: 67716, ticker: 'MDU', title: 'MDU RESOURCES GROUP INC' },
  { cik: 1630805, ticker: 'BW', title: 'Babcock & Wilcox Enterprises, Inc.' },
  { cik: 1464790, ticker: 'RILY', title: 'BRC Group Holdings, Inc.' },
  { cik: 719402, ticker: 'FXNC', title: 'FIRST NATIONAL CORP /VA/' },
  { cik: 1549084, ticker: 'CHRN', title: 'ChronoScale Holdings Corp' },
  { cik: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' },
  { cik: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  { cik: 1046179, ticker: 'TSM', title: 'TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD' },
];
const dir = buildDirectory(COMPANIES);
const APLD = targetPattern(['Applied Digital', 'Applied Digital Corporation']);
const ev = { filer: 'Applied Digital Corp.', form: '10-K', date: '2026-07-29', path: '1144879/000114487926000048/apld-20260531.htm' };
const roles = (sentence: string) => ownStatements(sentence, dir, APLD).map((x) => [x.role, x.party.name]);

describe('SPLC: names in filings', () => {
  it('reads "Co" as a legal form only as a whole word, and keeps numbers in names', () => {
    const found = findCompanies('such as IREN Limited, Hut 8 Corp., HIVE Digital Technologies Ltd., Core Scientific, Inc., Bitdeer Technologies Group', dir);
    expect(found.map((f) => f.ticker ?? f.name)).toEqual(['IREN', 'HUT', 'HIVE Digital Technologies', 'CORZ']);
    expect(found[3].name).toBe('Core Scientific, Inc.');
  });

  it('takes a first word alone for a company only when it is well known or written like a brand', () => {
    expect(findCompanies('the leases at Polaris Forge 1 and Polaris Forge 2', dir)).toEqual([]);
    expect(findCompanies('servers built on NVIDIA Blackwell', dir).map((f) => f.ticker)).toEqual(['NVDA']);
  });

  it("names a subsidiary's parent: CoreWeave Compute Acquisition Co. VIII, LLC is CoreWeave", () => {
    expect(findCompanies('a new data center lease with CoreWeave Compute Acquisition Co. VIII, LLC ("CoreWeave SPV")', dir).map((f) => f.ticker)).toEqual(['CRWV']);
  });

  it('describes an unnamed party by what the filing says of it', () => {
    expect(unnamedParty('a new U.S. based high investment-grade hyperscaler at its campus')).toMatchObject({ key: 'unnamed:investment grade hyperscaler', label: 'Unnamed U.S. investment-grade hyperscaler' });
    expect(unnamedParty('a U.S.-based investment-grade hyperscaler for 200 MW')?.key).toBe('unnamed:investment grade hyperscaler');
    expect(unnamedParty('a third hyperscale tenant')?.label).toBe('Unnamed hyperscaler');
    expect(unnamedParty('a customer of ours')).toBeNull();
  });
});

describe("SPLC: agreements in the company's own filings", () => {
  it('reads tenants, partners, lenders and investors', () => {
    expect(roles('On May 28, 2025, our subsidiaries APLD ELN-02 LLC and APLD ELN-03 LLC each entered into a data center lease (the "ELN-02 Lease" and the "ELN-03 Lease") with CoreWeave, Inc. ("CoreWeave") to deliver an aggregate of 250 MW of capacity to host CoreWeave\'s HPC operations at Polaris Forge 1.')).toEqual([['customer', 'CoreWeave, Inc.']]);
    expect(roles('Applied Digital (NASDAQ: APLD) announced today that it has entered into a lease agreement with a U.S. Based Investment Grade Hyperscaler at its state-of-the-art, purpose-built Polaris Forge 2 Campus.')).toEqual([['customer', 'Unnamed U.S. investment grade hyperscaler']]);
    expect(roles('In addition, through our partnership with Base Electron Corporation ("Base Electron"), an independent power producer, we are pursuing the development of approximately 1.2 GW of front-of-the-meter generation.')).toEqual([['partner', 'Base Electron']]);
    expect(roles('On November 10, 2025, the Company entered into a loan and security agreement with First National Bank of Omaha, pursuant to which the lender agreed to make one or more revolving loans.')).toEqual([['lender', 'First National Bank of Omaha']]);
    expect(roles('This includes a development loan facility with Macquarie Equipment Capital for pre-lease sourcing, planning, and early construction.')).toEqual([['lender', 'Macquarie Group']]);
  });

  it("reads the agreement a \"with\" belongs to, not an earlier one in the sentence", () => {
    expect(dealClause('Under the terms of that preferred equity arrangement, upon lease execution ')).toBe(' upon lease execution ,');
    expect(roles('Under the terms of that preferred equity arrangement, upon lease execution with an investment-grade hyperscaler, the Company may access a preferred equity financing facility with Macquarie Asset Management, subject to mutual agreement.')).toEqual([
      ['customer', 'Unnamed investment-grade hyperscaler'],
      ['investor', 'Macquarie Group'],
    ]);
  });

  it("leaves another company's deals, risk lists and acquisitions out", () => {
    expect(roles('On August 6, 2026, ChronoScale entered into a two-year strategic partnership with Microsoft to support the planned development of approximately 50 MW of AI compute capacity.')).toEqual([]);
    expect(roles('These risks, uncertainties, and other factors include, among others: our ability to timely deliver any services required under the lease agreements with CoreWeave at Polaris Forge 1.')).toEqual([]);
    expect(roles('On May 1, 2026, we entered into a merger agreement with ChronoScale Holdings Corp.')).toEqual([]);
    expect(roles('We entered into an indenture with U.S. Bank Trust Company, National Association, as trustee.')).toEqual([]);
  });

  it('reads purchases, dependencies and manufacturers', () => {
    expect(roles('We purchase substantially all of our GPUs from NVIDIA.')).toEqual([['supplier', 'NVIDIA']]);
    expect(roles('Our chips are manufactured by TSMC.')).toEqual([['supplier', 'Taiwan Semiconductor Mfg']]);
    expect(roles('We depend on Microsoft for a significant portion of our revenue.')).toEqual([['customer', 'Microsoft']]);
    expect(roles('We repurchased shares from NVIDIA.')).toEqual([]);
    expect(roles('Adjusted revenue is total revenue excluding total revenue from ChronoScale.')).toEqual([]);
  });

  it('adds them to the relations of its own report', () => {
    const rels = ownRelations(['In addition, through our partnership with Base Electron Corporation ("Base Electron"), an independent power producer, we are pursuing 1.2 GW.'], dir, { cik: 1144879, names: ['Applied Digital'] }, { ...ev, type: 'EX-99.1' });
    expect(rels).toMatchObject([{ name: 'Base Electron', role: 'partner', side: 'own', evidence: [{ type: 'EX-99.1' }] }]);
  });
});

describe("SPLC: what another company's filing says, more", () => {
  it('reads a utility serving the company and a contractor building for it as suppliers', () => {
    expect(classify("In March 2023, the Company began to provide power for Applied Digital's data center near Ellendale, North Dakota.", APLD)?.role).toBe('supplier');
    expect(classify('An electric service agreement to serve an additional 350 MW data center load with Applied Digital in the Company\'s service territory was approved by the NDPSC.', APLD)?.role).toBe('supplier');
  });

  it('reads the filer holding the company\'s stock as an investor, in either wording', () => {
    expect(classify('$11.1 million decrease in the carrying value of our Applied Digital Corporation ("APLD") common stock was driven by dispositions during the period.', APLD)?.role).toBe('investor');
  });

  it('does not take "US" for "us", nor a slide of tickers for an investment', () => {
    expect(classify('According to data from Fundstrat, the stock has traded average daily dollar volume of $857 million, ranking #133 in the US, behind Applied Digital Corp (rank #132).', APLD)).toBeNull();
    expect(classify('What we believe the gap reflects. DarkHorse (DRK) Canaan (CAN) Soluna (SLNH) HIVE Digital (HIVE) Applied Digital (APLD) WhiteFiber (WYFI) INVESTMENT CASE INVESTOR PRESENTATION', APLD)).toBeNull();
  });

  it('reads a joint venture announced in a press release as a partnership', () => {
    const soluna = targetPattern(targetNames('SLNH', 'Soluna Holdings, Inc').names);
    expect(classify('Soluna today announced that it has entered into a definitive agreement to form a jointly owned company with Applied Digital to develop a wind-powered AI data center.', APLD, soluna)?.role).toBe('partner');
  });
});

describe('SPLC: what is searched and read', () => {
  const hit = (over: Partial<FtsHit>): FtsHit => ({ cik: 1, name: 'X', tickers: [], form: '8-K', date: '2026-01-01', path: `1/000000000000000001/${Math.random().toString(36).slice(2)}.htm`, score: 1, ...over });

  it('searches the short name, and a legal name only when the short one does not cover it', () => {
    expect(searchNames(targetNames('APLD', 'Applied Digital Corp.'))).toEqual(['Applied Digital']);
    expect(searchNames(targetNames('NBIS', 'Nebius Group N.V.'))).toEqual(['Nebius']);
    expect(searchNames({ legal: ['Google LLC', 'Alphabet Inc'], names: ['Google', 'Alphabet'] })).toEqual(['Google', 'Alphabet']);
  });

  it("reads another company's most relevant current reports, and the company's own press releases and agreements", () => {
    const B = 1630805;
    const results = [[
      hit({ cik: B, date: '2026-08-10', type: 'EX-99.1', items: ['2.02', '9.01'], score: 2 }),
      hit({ cik: B, date: '2025-11-04', type: '8-K', items: ['1.01', '3.02', '9.01'], score: 9 }),
      hit({ cik: B, date: '2025-11-04', type: 'EX-99.3', items: ['1.01', '3.02', '9.01'], score: 8 }),
      hit({ cik: B, date: '2026-03-04', type: 'EX-10.1', items: ['1.01'], score: 9 }),
      hit({ cik: B, date: '2026-04-04', type: '8-K', items: ['5.02'], score: 9 }),
      hit({ cik: 1144879, date: '2026-04-23', type: 'EX-99.1', items: ['7.01', '9.01'] }),
      hit({ cik: 1144879, date: '2026-04-23', type: '8-K', items: ['7.01', '9.01'] }),
      hit({ cik: 1144879, date: '2026-03-04', type: '8-K', items: ['1.01', '2.03', '9.01'] }),
    ]];
    expect(currentDocs(results, 1144879, 30).map((f) => [f.cik, f.date, f.type])).toEqual([
      [B, '2025-11-04', '8-K'],
      [B, '2025-11-04', 'EX-99.3'],
    ]);
    expect(currentDocs(results, 1144879, 30, 40, true).map((f) => [f.date, f.type, f.source])).toEqual([
      ['2026-04-23', 'EX-99.1', 'own'],
      ['2026-03-04', '8-K', 'own'],
    ]);
  });

  it("chooses each filer's annual report's main document", () => {
    const f = rankFilers([[hit({ cik: 5, form: '10-K', type: 'EX-10.2', date: '2026-03-01' }), hit({ cik: 5, form: '10-K', type: '10-K', date: '2026-03-01' })]], undefined, 10);
    expect(f.map((x) => x.type)).toEqual(['10-K']);
  });

  it('merges an unnamed party described loosely into the one described fully', () => {
    const r = (key: string, name: string, sentence: string): Relation => ({ key, name, role: 'customer', side: 'own', unnamed: true, evidence: [{ ...ev, sentence }] });
    const merged = mergeRelations([r('unnamed:investment grade hyperscaler', 'Unnamed U.S. investment-grade hyperscaler', 'a'), r('unnamed:hyperscaler', 'Unnamed hyperscaler', 'b')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].evidence.map((e) => e.sentence)).toEqual(['a', 'b']);
  });
});

describe('SPLC: a whole run', () => {
  it("reads the company's own filings, then the reports and press releases of others, and merges what they say", async () => {
    const fts = (hits: object[], total = hits.length) => ({ hits: hits as FtsHit[], total });
    const asked: string[] = [];
    const io: ChainIO = {
      companies: async () => COMPANIES,
      filings: async () => [
        { form: '10-Q', filed: '2026-10-07', accession: '0001144879-26-000059', doc: 'apld-20260831.htm' },
        { form: '10-K', filed: '2026-07-29', accession: '0001144879-26-000048', doc: 'apld-20260531.htm' },
      ],
      fts: async (arg) => {
        asked.push(arg);
        if (arg === '|Applied Digital|current|0|1144879') return fts([{ cik: 1144879, name: 'Applied Digital Corp.', tickers: ['APLD'], form: '8-K', date: '2026-04-23', path: '1144879/000114487926000036/apld_pr.htm', score: 5, type: 'EX-99.1', items: ['7.01'] }]);
        if (arg === '|Applied Digital|reports') return fts([{ cik: 67716, name: 'MDU RESOURCES GROUP INC', tickers: ['MDU'], form: '10-K', date: '2026-02-20', path: '67716/000006771626000014/mdu-20251231.htm', score: 3, type: '10-K' }]);
        return fts([]);
      },
      text: async (kind, path) => {
        if (kind === 'own' && path.endsWith('apld-20260531.htm')) return ['On May 28, 2025, we entered into a data center lease with CoreWeave, Inc. to host CoreWeave\'s HPC operations.'];
        if (kind === 'own' && path.endsWith('apld_pr.htm')) return ['Applied Digital today announced it has entered into a lease agreement with a new U.S. based high investment-grade hyperscaler at its 430 MW AI Factory campus.'];
        if (kind === 'own') return [];
        return ["In March 2023, the Company began to provide power for Applied Digital's data center near Ellendale, North Dakota."];
      },
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'APLD', name: 'Applied Digital Corp' }, io, (f) => {
      chain = f(chain);
    });
    expect(asked).toEqual(['|Applied Digital|current|0|1144879', '|Applied Digital|reports', '|Applied Digital|prospectus', '|Applied Digital|current']);
    expect(chain.filers.map((f) => [f.form, f.source, f.state])).toEqual([
      ['10-K', 'own', 'read'],
      ['10-Q', 'own', 'read'],
      ['8-K', 'own', 'read'],
      ['10-K', 'report', 'read'],
    ]);
    expect(chain.relations.map((r) => [r.role, r.name, r.side])).toEqual([
      ['customer', 'CoreWeave, Inc.', 'own'],
      ['customer', 'Unnamed U.S. investment-grade hyperscaler', 'own'],
      ['supplier', 'MDU RESOURCES GROUP INC', 'theirs'],
    ]);
    expect(chain.relations[1].evidence[0]).toMatchObject({ form: '8-K', type: 'EX-99.1', date: '2026-04-23' });
  });
});
