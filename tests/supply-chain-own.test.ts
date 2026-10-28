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
