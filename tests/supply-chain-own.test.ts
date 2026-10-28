import { describe, expect, it } from 'vitest';
import * as main from '../electron/supply-chain.cjs';
import { buildDirectory, exhibitStatements, mergeRelations, ownRelations, runChain, stillHeld, subsidiaryNames, targetNames, targetPattern, type Chain, type ChainIO, type EndedStakes, type Relation } from '../src/data/live/supply-chain';
import type { SecCompany } from '../src/data/live/sec';

// Sentences as Applied Digital (APLD) and Coca-Cola wrote them in their filings of 2025 and 2026.
const COMPANIES: SecCompany[] = [
  { cik: 1144879, ticker: 'APLD', title: 'Applied Digital Corp.' },
  { cik: 1769628, ticker: 'CRWV', title: 'CoreWeave, Inc.' },
  { cik: 18230, ticker: 'CAT', title: 'CATERPILLAR INC' },
  { cik: 1091587, ticker: 'ABBNY', title: 'ABB' },
  { cik: 886982, ticker: 'GS', title: 'GOLDMAN SACHS GROUP INC' },
  { cik: 719402, ticker: 'FXNC', title: 'FIRST NATIONAL CORP' },
  { cik: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' },
  { cik: 21344, ticker: 'KO', title: 'COCA COLA CO' },
  { cik: 910631, ticker: 'KOF', title: 'COCA COLA FEMSA SAB DE CV' },
];
const dir = buildDirectory(COMPANIES);
const APLD = { cik: 1144879, names: targetNames('APLD', 'Applied Digital Corp.').names, ticker: 'APLD' };
const EV = { filer: 'Applied Digital Corp.', form: '10-K', date: '2026-07-29', path: '1144879/000114487926000048/apld-20260531.htm' };
const read = (sentences: string[], ended: EndedStakes = { sold: new Set(), subsidiaries: new Set() }) =>
  mergeRelations(ownRelations(main.ownSentences(sentences.join('\n')), dir, APLD, EV, ended).filter((r) => stillHeld(r, ended)));
const roles = (rels: Relation[]) => rels.map((r) => `${r.role}:${r.name}`).sort();

describe("SPLC: what a company's own filings say of its lenders, investors and suppliers", () => {
  it('reads a capitalised agreement and the bank named as its agent', () => {
    const s = 'On May 1, 2026, APLD ComputeCo 3 LLC, a subsidiary of the Company, entered into a Credit and Guaranty Agreement with Goldman Sachs Bank USA, as administrative agent and as collateral agent, providing for a bridge loan facility in an aggregate principal amount of $300 million.';
    expect(main.ownSentences(s)).toHaveLength(1);
    expect(roles(read([s]))).toEqual(['lender:Goldman Sachs Bank USA']);
  });

  it('lists the suppliers named for its purchasing', () => {
    const s = 'Because power distribution, cooling architecture, and data hall layouts are standardized across our campuses, we are able to consolidate purchasing around a common set of trusted, qualified partners-including ABB for electrical equipment, BASX for mechanical and cooling systems, and Caterpillar for backup generation.';
    expect(roles(read([s]))).toEqual(['supplier:ABB', 'supplier:CATERPILLAR INC']);
  });

  it('takes the buyer of units it issued, and the manager behind the vehicle, as investors', () => {
    const s = 'During the fiscal year ended May 31, 2026, TopCo 2 completed four closings under its Amended and Restated Unit Purchase Agreement, issuing 1,825,000 preferred units and 144,593 corresponding common units for proceeds of approximately $1.8 billion to MIP HPC Holdings, LLC, which is an affiliate of funds and investment vehicles managed by entities within Macquarie Asset Management.';
    const got = roles(read([s]));
    expect(got).toContain('investor:MIP HPC Holdings');
    expect(got.some((r) => /^investor:Macquarie/.test(r))).toBe(true);
    // Selling a stake it holds in another company is not an investment in itself.
    const ko = 'In March 2025, the Company sold a portion of our ownership interest in Coca-Cola Europacific Partners plc to a third party.';
    expect(ownRelations([ko], dir, { cik: 21344, names: ['Coca-Cola'], ticker: 'KO' }, EV).filter((r) => r.role === 'investor')).toEqual([]);
  });

  it('drops a lender whose loan the filings say was repaid in full', () => {
    const ended: EndedStakes = { sold: new Set(), subsidiaries: new Set() };
    const loan = 'On February 11, 2025, APLD HPC Holdings LLC, our subsidiary, entered into a credit and guaranty agreement with Sumitomo Mitsui Banking Corporation, as administrative agent, providing for a delayed draw term loan.';
    const repaid = 'Concurrently with the closing of the 2030 9.250% Notes Offering, we repaid in full the aggregate principal balance plus accrued interest under the Credit and Guaranty Agreement, dated as of February 11, 2025, by and among APLD HPC Holdings LLC, the lenders party thereto and Sumitomo Mitsui Banking Corporation ("SMBC"), as administrative agent.';
    expect(roles(read([loan]))).toEqual(['lender:Sumitomo Mitsui Banking']);
    expect(roles(read([repaid, loan], ended))).toEqual([]);
  });

  it("reads an exhibit list's agreement by its parties: banks as written, the company's own entities left out", () => {
    const s = 'Credit Agreement, dated as of May 29, 2026, by and between Applied Digital Corporation, APLD Intermediate Holdco LLC, the lenders party thereto, First National Bank of Omaha and Goldman Sachs Lending Partners LLC.';
    const self = targetPattern(APLD.names);
    const own = (n: string) => /^APLD\b/.test(n);
    // First National Bank of Omaha is not First National Corp, the listed bank of Virginia.
    expect(exhibitStatements(s, dir, self, own, '2026-10-07').map((x) => `${x.role}:${x.party.name}`)).toEqual(['lender:First National Bank of Omaha', 'lender:Goldman Sachs Lending Partners']);
    // A borrower's side and an agreement of long ago are not current lenders.
    expect(exhibitStatements('Loan and Security Agreement, dated as of May 23, 2023, by and among SAI Computing, LLC as Borrower, B. Riley Commercial Capital, LLC.', dir, self, own, '2025-07-30').map((x) => x.party.name)).toEqual(['B. Riley Commercial Capital']);
    expect(exhibitStatements('Loan Agreement, dated as of July 25, 2020, by and among APLD Hosting, LLC and Starion Bank.', dir, self, own, '2025-07-30')).toEqual([]);
  });

  it("counts a subsidiary's deals as its own, and a company named after it as another", () => {
    const subs = subsidiaryNames(['As a result of the transaction, at closing, the Company owned approximately 97% of ChronoScale\'s outstanding common stock.']);
    expect(subs).toEqual(['ChronoScale']);
    const deal = 'On August 6, 2026, ChronoScale entered into a two-year strategic partnership with Microsoft to support the planned development of approximately 50 MW of AI compute capacity.';
    const owned = 'As a result of the transaction, at closing, the Company owned approximately 97% of ChronoScale\'s outstanding common stock.';
    expect(roles(read([owned, deal]))).toEqual(['partner:Microsoft']);
    // Coca-Cola FEMSA is an investee of Coca-Cola, not Coca-Cola itself.
    const ko = "The Company's equity method investments include, but are not limited to, our ownership interests in Coca-Cola FEMSA, S.A.B. de C.V.";
    expect(ownRelations([ko], dir, { cik: 21344, names: ['Coca-Cola'], ticker: 'KO' }, EV).map((r) => `${r.role}:${r.name}`)).toEqual(['investment:COCA COLA FEMSA SAB DE CV']);
  });
});

describe("SPLC: which of the company's own filings are read", () => {
  it('reads both annual reports, the quarterly reports between, the agreement 8-Ks of two years and their press releases', async () => {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const indexed: string[] = [];
    const io: ChainIO = {
      companies: async () => COMPANIES,
      filings: async () => [
        { form: '10-Q', filed: day(20), accession: '0001144879-26-000059', doc: 'apld-20260831.htm' },
        { form: '8-K', filed: day(40), accession: '0001493152-26-030333', doc: 'form8-k.htm', items: ['1.01', '2.03', '9.01'] },
        { form: '8-K', filed: day(60), accession: '0001493152-26-017092', doc: 'form8-k.htm', items: ['5.02'] },
        { form: '10-K', filed: day(90), accession: '0001144879-26-000048', doc: 'apld-20260531.htm' },
        { form: '10-Q', filed: day(200), accession: '0001144879-26-000030', doc: 'apld-20260228.htm' },
        { form: '10-K', filed: day(455), accession: '0001144879-25-000021', doc: 'apld-20250531.htm' },
        { form: '10-Q', filed: day(500), accession: '0001144879-25-000010', doc: 'apld-20250228.htm' },
        { form: '8-K', filed: day(800), accession: '0001493152-24-000001', doc: 'form8-k.htm', items: ['1.01'] },
      ],
      index: async (_cik, accession) => {
        indexed.push(accession);
        return ['form8-k.htm', 'ex10-1.htm', 'ex99-1.htm', 'ex99-2.htm', 'ex99-3.htm'];
      },
      fts: async () => ({ hits: [], total: 0 }),
      text: async (kind, path) => {
        if (kind !== 'own') return [];
        if (path.endsWith('ex99-1.htm')) return ['Applied Digital today announced it has entered into a $500 million loan facility with Macquarie Equipment Capital, Inc. to support its new campuses.'];
        return [];
      },
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'APLD', name: 'Applied Digital Corp' }, io, (f) => {
      chain = f(chain);
    });
    expect(chain.filers.filter((f) => f.source === 'own').map((f) => [f.form, f.type ?? '', f.path.split('/').pop()])).toEqual([
      ['10-K', '', 'apld-20260531.htm'],
      ['10-Q', '', 'apld-20260831.htm'],
      ['10-Q', '', 'apld-20260228.htm'],
      ['10-K', '', 'apld-20250531.htm'],
      ['8-K', '', 'form8-k.htm'],
      ['8-K', 'EX-99.1', 'ex99-1.htm'],
      ['8-K', 'EX-99.2', 'ex99-2.htm'],
    ]);
    // A change of officers (5.02) and an agreement of more than two years ago are not read.
    expect(indexed).toEqual(['0001493152-26-030333']);
    expect(chain.relations.map((r) => [r.role, r.name])).toEqual([['lender', 'Macquarie Group']]);
    expect(chain.relations[0].evidence[0]).toMatchObject({ form: '8-K', type: 'EX-99.1' });
  });
});

describe("SPLC: Applied Digital's three tenants, as its filings name them", () => {
  // From APLD's 8-K of 4 March 2026, its press releases and its 10-K of 29 July 2026.
  const EV8K = { ...EV, form: '8-K', date: '2026-03-10' };
  const own = (sentences: string[], ev = EV) => ownRelations(main.ownSentences(sentences.join('\n')), dir, APLD, ev);
  const PF2_ORACLE = 'The Issuer intends to use the net proceeds from the offering to fund the development and construction of 200 megawatts of critical IT load at Polaris Forge 2, its AI Factory campus in Harwood, North Dakota currently leased to Oracle, as well as the "Project Accounts".';
  const PF2_UNNAMED = 'On October 22, 2025, we announced that we entered into an approximately 15-year lease agreement with a U.S. based investment grade hyperscaler for 200 MW of critical IT load at our Polaris Forge 2 campus.';
  const PLAIN_EARLY = 'On October 22, 2025, we entered into an approximately 15-year lease with a U.S.-based investment-grade hyperscaler for 200 MW of critical IT load at the campus.';
  const SECOND = 'On April 23, 2026, we entered into two approximately 15-year leases with a second U.S.-based investment-grade hyperscaler for an aggregate 300 MW of critical IT load at the campus.';
  const SAME = "On May 20, 2026, a different subsidiary of the Company entered into a data center lease with the same U.S.-based investment-grade hyperscaler to deliver a combined 300MW of critical IT load to support the second hyperscaler's AI and HPC infrastructure at Polaris Forge 3.";
  const PLAIN_LATE = "The lease is with a U.S. based high investment-grade hyperscaler, marking the company's fifth AI Factory campus overall.";
  const COUNTING = "This addition expands total contracted lease revenue to over $23 billion and further diversifies the company's customer base with a third hyperscale tenant.";

  it('takes a site "currently leased to Oracle" as Oracle being a customer', () => {
    expect(main.ownSentences(PF2_ORACLE)).toHaveLength(1);
    expect(roles(own([PF2_ORACLE], EV8K))).toEqual(['customer:Oracle']);
  });

  it('gives the statements on its sites and dates to the right tenant: Oracle, then a second hyperscaler', () => {
    const rels = mergeRelations([
      ...own([PF2_ORACLE], EV8K),
      ...own([PF2_UNNAMED, PLAIN_EARLY, SECOND, SAME]),
      ...own([PLAIN_LATE, COUNTING], { ...EV, form: '8-K', date: '2026-06-09' }),
    ]);
    const customers = rels.filter((r) => r.role === 'customer');
    expect(customers.map((r) => r.name).sort()).toEqual(['Oracle', 'Unnamed second U.S. investment-grade hyperscaler']);
    const oracle = customers.find((r) => r.name === 'Oracle')!;
    expect(oracle.evidence.map((e) => e.sentence)).toEqual([PF2_ORACLE, PF2_UNNAMED, PLAIN_EARLY]);
    const second = customers.find((r) => r.unnamed)!;
    expect(second.evidence.map((e) => e.sentence).sort()).toEqual([SECOND, SAME, PLAIN_LATE, COUNTING].sort());
  });

  it("names an unnamed customer by the segment heading its 10-K puts before it", () => {
    // The heading is a line of its own in the filing's text.
    const hpc = 'HPC Hosting Business\nDuring fiscal year 2026, this business segment was comprised of one customer accounting for 59% of our total revenue from continuing operations.';
    const dc = 'Data Center Hosting Business\nDuring fiscal year 2026, this business segment was comprised of one customer accounting for 25% of our revenue from continuing operations.';
    expect(main.ownSentences(hpc)).toEqual([hpc.replace('\n', ' ')]);
    const got = own([hpc, dc]).filter((r) => r.role === 'customer');
    expect(got.map((r) => [r.name, r.share])).toEqual([
      ['Unnamed HPC Hosting customer 1', 59],
      ['Unnamed Data Center Hosting customer 2', 25],
    ]);
  });

  it('leaves out a lease that is only a condition of something else', () => {
    const cond = 'The closing is conditioned upon, among other things, APLDH executing a lease with a hyperscaler for the first 100 MW on the Ellendale Campus, in a form acceptable to MAM.';
    const perf = 'Such performance measures are based on the Company entering into data center leases with a hyperscaler, the consummation of project financing, and receipt of sustainable revenue.';
    expect(own([cond, perf]).filter((r) => r.role === 'customer')).toEqual([]);
  });
});

describe("SPLC: unnamed customers' shares from the newest filing only", () => {
  it("drops an older filing's lettered customers when a newer one states the shares (NVIDIA, 2025 and 2026)", async () => {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const nvda: SecCompany[] = [...COMPANIES, { cik: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' }];
    const io: ChainIO = {
      companies: async () => nvda,
      filings: async () => [
        { form: '10-Q', filed: day(60), accession: '0001045810-26-000075', doc: 'nvda-20260726.htm' },
        { form: '10-Q', filed: day(425), accession: '0001045810-25-000209', doc: 'nvda-20250727.htm' },
      ],
      index: async () => [],
      fts: async () => ({ hits: [], total: 0 }),
      text: async (kind, path) => {
        if (kind !== 'own') return [];
        if (path.endsWith('nvda-20260726.htm')) return ['For the second quarter of fiscal year 2027, one direct customer represented 16% of total revenue, which was primarily attributable to the Compute & Networking segment.'];
        return ['For the second quarter of fiscal year 2026, sales to one direct customer, Customer A, represented 23% of total revenue, all of which were attributable to the Compute & Networking segment.'];
      },
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'NVDA', name: 'NVIDIA Corp' }, io, (f) => {
      chain = f(chain);
    });
    expect(chain.relations.filter((r) => r.role === 'customer').map((r) => [r.name, r.share])).toEqual([['Unnamed direct customer 1', 16]]);
  });
});

describe('SPLC: a purchase agreement under which the other party buys', () => {
  it("reads AMD's master purchase agreement with Meta as Meta buying, the party's legal form in between", () => {
    const amd = { cik: 2488, names: targetNames('AMD', 'ADVANCED MICRO DEVICES INC').names, ticker: 'AMD' };
    const amdDir = buildDirectory([...COMPANIES, { cik: 2488, ticker: 'AMD', title: 'ADVANCED MICRO DEVICES INC' }, { cik: 1326801, ticker: 'META', title: 'Meta Platforms, Inc.' }]);
    const s = 'In February 2026, we amended a master purchase agreement with Meta Platforms, Inc. (Meta) and Meta agreed to deploy up to 6 gigawatts of AMD GPUs, with the first gigawatt of capacity powered by custom AMD Instinct MI450-based GPU and 6th Gen AMD EPYC™ CPUs.';
    const got = ownRelations(main.ownSentences(s), amdDir, amd, { ...EV, filer: 'Advanced Micro Devices', form: '10-Q', date: '2026-05-06' });
    expect(got.map((r) => `${r.role}:${r.name}`)).toEqual(['customer:Meta Platforms']);
  });
});

describe('SPLC: statements read the wrong way round before the data audit of October 2026', () => {
  const listed: SecCompany[] = [
    ...COMPANIES,
    { cik: 2488, ticker: 'AMD', title: 'ADVANCED MICRO DEVICES INC' },
    { cik: 1326801, ticker: 'META', title: 'Meta Platforms, Inc.' },
    { cik: 1751788, ticker: 'DOW', title: 'Dow Inc.' },
    { cik: 936468, ticker: 'LMT', title: 'LOCKHEED MARTIN CORP' },
    { cik: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
    { cik: 1065521, ticker: 'SFTBY', title: 'SOFTBANK GROUP CORP.' },
    { cik: 1375365, ticker: 'SMCI', title: 'Super Micro Computer, Inc.' },
  ];
  const d = buildDirectory(listed);
  const read = (ticker: string, title: string, cik: number, sentences: string[]) =>
    mergeRelations(ownRelations(main.ownSentences(sentences.join('\n')), d, { cik, names: targetNames(ticker, title).names, ticker }, { ...EV, filer: title })).map((r) => `${r.role}:${r.name}`).sort();

  it("AMD's 8-K: Meta committed to buy under the purchase agreement, so it is a customer", () => {
    const s = 'Under the arrangement, the parties entered into an amendment to that certain Master Purchase Agreement dated May 23, 2023 (the "Agreement") and concurrent with the Warrant issuance, Meta Platforms, Inc. agreed to a binding commitment under the Agreement to purchase (directly or through its affiliates, or indirectly through authorized third parties ("Authorized Purchasers")) the initial one (1) gigawatt equivalent of certain AMD Instinct GPU products.';
    expect(read('AMD', 'ADVANCED MICRO DEVICES INC', 2488, [s]).filter((x) => x.startsWith('supplier'))).toEqual([]);
  });

  it("Lockheed Martin's sales as a subcontractor to the Department of War (DoW) name no supplier, nor Dow Inc.", () => {
    const s = 'During the nine months ended September 27, 2026, 70% of our $58.8 billion in sales were from the U.S. Government, either as a prime contractor or as a subcontractor (including 61% from U.S. Department of War (DoW), also known as the Department of Defense under 10 U.S.C. 113).';
    expect(read('LMT', 'LOCKHEED MARTIN CORP', 936468, [s]).filter((x) => /Dow/i.test(x))).toEqual([]);
  });

  it("NVIDIA's ended agreement to acquire Arm from SoftBank makes SoftBank no supplier", () => {
    const s = 'In February 2022, NVIDIA and SoftBank Group Corp, or SoftBank, announced the termination of the Share Purchase Agreement whereby NVIDIA would have acquired Arm from SoftBank.';
    expect(read('NVDA', 'NVIDIA CORP', 1045810, [s])).toEqual([]);
  });

  it("Super Micro's 10-K: the related companies that make its chassis are suppliers; an immaterial dealing is none", () => {
    const got = read('SMCI', 'Super Micro Computer, Inc.', 1375365, [
      'We use Ablecom Technology, Inc. ("Ablecom") and its affiliate Compuware Technology, Inc. ("Compuware"), both of which are related parties to us, for contract design and manufacturing coordination support.',
      'Ablecom manufactured approximately 95.3%, 95.4%, and 93.6% of the chassis purchased by us during fiscal years 2026, 2025, and 2024, respectively.',
      'For the fiscal year ended June 30, 2026, we had no sales to and immaterial purchases from Green Earth Liang\'s Inc. ("Green Earth"), an entity affiliated with our Chief Executive Officer.',
    ]);
    expect(got).toEqual(['supplier:Ablecom Technology', 'supplier:Compuware Technology']);
  });
});
