import { describe, expect, it } from 'vitest';
import * as main from '../electron/supply-chain.cjs';
import {
  buildDirectory, filerIdentity, listingEvents, listingLabel, mergeRelations, ownRelations, relationEnding, relationshipView, relationStatus, runChain,
  targetNames, targetPattern, type Chain, type ChainIO, type FtsHit, type Relation,
} from '../src/data/live/supply-chain';
import { appendRelationshipHistory, endingAssertion } from '../src/data/live/supply-chain-history';
import type { SecCompany } from '../src/data/live/sec';

/**
 * The filing-by-filing review of 30 October 2026 (Eli Lilly, Pfizer, Merck, Exxon Mobil, Chevron, Ford, General Motors
 * and Northrop Grumman; docs/splc-review-2026-10-30.md). Each case is the sentence, filing list or record the review
 * found misread, as the SEC or USAspending.gov gives it.
 */

// The SEC's list of listed companies (www.sec.gov/files/company_tickers.json) as of October 2026, for these companies.
const SEC: SecCompany[] = [
  { cik: 34088, ticker: 'XOM', title: 'EXXON MOBIL CORP' },
  { cik: 1467858, ticker: 'GM', title: 'GENERAL MOTORS CO' },
  { cik: 310158, ticker: 'MRK', title: 'Merck & Co., Inc.' },
  // The ticker Aris Water Solutions (CIK 1865187) filed under now belongs to a gold miner.
  { cik: 1964504, ticker: 'ARIS', title: 'Aris Mining Corp' },
  // The ticker of Avidity Biosciences (CIK 1599901) now belongs to its spin-off; ELEV of Elevation Oncology (CIK
  // 1783032) to a blank-check company.
  { cik: 2093101, ticker: 'RNA', title: 'Atrium Therapeutics, Inc.' },
  { cik: 2131124, ticker: 'ELEV', title: 'Elevation Acquisition Group Inc.' },
  // American Axle is Dauch under the same CIK; New Era Helium is New ERA Energy & Digital.
  { cik: 1062231, ticker: 'DCH', title: 'Dauch Corp' },
  { cik: 2028336, ticker: 'NUAI', title: 'New ERA Energy & Digital, Inc.' },
  { cik: 2028336, ticker: 'NUAIW', title: 'New ERA Energy & Digital, Inc.' },
  // An ADR facility listed under its depositary's name, and the bank's own group.
  { cik: 1472033, ticker: 'JTGEY', title: 'Citibank,N.A./ADR' },
  { cik: 1472033, ticker: 'JTGLF', title: 'Citibank,N.A./ADR' },
  { cik: 831001, ticker: 'C', title: 'CITIGROUP INC' },
  { cik: 2071868, ticker: 'JHPCY', title: 'Jiangsu Hengrui Pharmaceuticals Co., Ltd./ADR' },
];
const dir = buildDirectory(SEC);

describe('SPLC review of 30 October 2026: who a related company is', () => {
  it("names a filer by its own CIK's entry, never by the ticker its filing carried", () => {
    // Exxon's screen showed Aris Water's 10-K as "Aris Mining Corp, ARIS" (finding X1).
    expect(filerIdentity(dir, 1865187, 'Aris Water Solutions, Inc.', ['ARIS'])).toEqual({ name: 'Aris Water Solutions, Inc.', listing: { listed: false, was: 'ARIS' } });
    // Lilly's: Avidity Biosciences' 10-K as "Atrium Therapeutics, Inc., RNA" (LLY-7), Elevation Oncology's 10-Q as
    // "Elevation Acquisition Group Inc., ELEV" (LLY-8).
    expect(filerIdentity(dir, 1599901, 'Avidity Biosciences, Inc.', ['RNA'])).toMatchObject({ name: 'Avidity Biosciences, Inc.', listing: { was: 'RNA' } });
    expect(filerIdentity(dir, 1599901, 'Avidity Biosciences, Inc.', ['RNA']).ticker).toBeUndefined();
    expect(filerIdentity(dir, 1783032, 'Elevation Oncology, Inc.', ['ELEV'])).toMatchObject({ name: 'Elevation Oncology, Inc.' });
    // One CIK reads the same on every screen: GM showed "American Axle, AXL" and Ford "Dauch Corp, DCH" (GM-9); Exxon
    // the old "NEW ERA HELIUM INC., NEHC" (X5).
    expect(filerIdentity(dir, 1062231, 'AMERICAN AXLE & MANUFACTURING HOLDINGS INC', ['AXL'])).toEqual({ name: 'Dauch Corp', ticker: 'DCH' });
    expect(filerIdentity(dir, 2028336, 'NEW ERA HELIUM INC.', ['NEHC'])).toEqual({ name: 'New ERA Energy & Digital, Inc.', ticker: 'NUAI' });
  });

  it("says why a company has no listing, from its own filing list (Aris Water's of October 2025)", () => {
    // EDGAR: an 8-K on 2025-10-15 (items 1.02, 2.01, 3.01, 3.03, 5.01, 5.02, 5.07), a 25-NSE the same day and a 15-12G on
    // 2025-10-27: "the Company became a wholly owned subsidiary of WES".
    const filings = [
      { form: '15-12G', filed: '2025-10-27' },
      { form: '25-NSE', filed: '2025-10-15' },
      { form: '8-K', filed: '2025-10-15', items: ['1.02', '2.01', '3.01', '3.03', '5.01', '5.02', '5.07'] },
      { form: '10-Q', filed: '2025-08-06' },
      { form: '8-K', filed: '2025-08-06', items: ['1.01', '9.01'] },
    ];
    expect(listingEvents(filings).map((e) => [e.form, e.date, e.what])).toEqual([
      ['15-12G', '2025-10-27', 'deregistered'],
      ['25-NSE', '2025-10-15', 'delisted'],
      ['8-K', '2025-10-15', 'change in control'],
    ]);
    expect(listingLabel({ listed: false, was: 'ARIS', events: listingEvents(filings) })).toBe('Acquired Oct 2025 (was ARIS)');
    // Superior Industries filed Form 15-12G on 19 December 2025 (F-1); Zuora a 25-NSE and a 15-12G in February 2025 (GM-12).
    expect(listingLabel({ listed: false, was: 'SUP', events: listingEvents([{ form: '15-12G', filed: '2025-12-19' }]) })).toBe('Deregistered Dec 2025 (was SUP)');
    expect(listingLabel({ listed: false, was: 'ZUO' })).toBe('Not listed (was ZUO)');
    expect(listingLabel(undefined)).toBe('');
  });

  it("shows Aris Water's statement on Exxon's screen under its own name, without Aris Mining's ticker", async () => {
    const sentence = 'In July 2024, Coterra joined our beneficial reuse strategic agreement (the "Joint Industry Project" or "JIP") with Chevron U.S.A. Inc., ConocoPhillips and Exxon Mobil Corporation (collectively with us, the "alliance members") to develop and pilot technologies and processes to treat produced water for potential beneficial reuse opportunities.';
    const aris: FtsHit = { cik: 1865187, name: 'Aris Water Solutions, Inc.', tickers: ['ARIS'], form: '10-K', date: '2025-02-27', path: '1865187/000155837025001818/aris-20241231x10k.htm', score: 1, type: '10-K' };
    const io: ChainIO = {
      companies: async () => SEC,
      filings: async (cik) => (cik === 1865187 ? [
        { form: '15-12G', filed: '2025-10-27', accession: '0001193125-25-250000' },
        { form: '25-NSE', filed: '2025-10-15', accession: '0001193125-25-240244' },
        { form: '8-K', filed: '2025-10-15', accession: '0001193125-25-240243', doc: 'd918586d8k.htm', items: ['1.02', '2.01', '3.01', '3.03', '5.01', '5.02', '5.07'] },
      ] : []),
      fts: async (arg) => (arg === '|ExxonMobil|reports' ? { hits: [aris], total: 1 } : { hits: [], total: 0 }),
      text: async (kind, path) => (kind === 'mentions' && path === aris.path ? [sentence] : []),
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'XOM', name: 'Exxon Mobil Corp' }, io, (f) => { chain = f(chain); });
    const got = chain.relations.find((r) => r.key === 'cik:1865187')!;
    expect(got).toMatchObject({ role: 'partner', name: 'Aris Water Solutions, Inc.' });
    expect(got.ticker).toBeUndefined();
    expect(listingLabel(got.listing)).toBe('Acquired Oct 2025 (was ARIS)');
  });

  it('replaces a saved name and ticker with the newest reading of the same CIK', () => {
    const ev = { sentence: 'In July 2024, Coterra joined our beneficial reuse strategic agreement.', filer: 'Aris Water Solutions, Inc.', form: '10-K', date: '2025-02-27', path: '1865187/000155837025001818/aris-20241231x10k.htm' };
    const saved: Relation = { key: 'cik:1865187', name: 'Aris Mining Corp', ticker: 'ARIS', cik: 1865187, role: 'partner', side: 'theirs', evidence: [ev] };
    const now: Relation = { key: 'cik:1865187', name: 'Aris Water Solutions, Inc.', cik: 1865187, listing: { listed: false, was: 'ARIS' }, role: 'partner', side: 'theirs', evidence: [ev] };
    const [merged] = appendRelationshipHistory([saved], [now]);
    expect(merged).toMatchObject({ name: 'Aris Water Solutions, Inc.', listing: { was: 'ARIS' } });
    expect(merged.ticker).toBeUndefined();
  });

  it("reads Citibank, N.A. as Citigroup's bank, not the ADR depositary filer, and JPMorgan's bank as one lender (GM-1, GM-13)", () => {
    const gm = { cik: 1467858, names: targetNames('GM', 'GENERAL MOTORS CO').names, ticker: 'GM' };
    const ev = { filer: 'General Motors Co', form: '8-K', date: '2026-03-23', path: '1467858/000119312526119684/d114837d8k.htm' };
    const got = mergeRelations(ownRelations([
      'Eighth Amended and Restated 364-Day Revolving Credit Agreement, dated as of March 23, 2026, among General Motors Company, General Motors Financial Company, Inc., the subsidiary borrowers from time to time parties thereto, the several lenders from time to time parties thereto, JPMorgan Chase Bank, N.A., as administrative agent, and Citibank, N.A., as syndication agent',
      'On March 23, 2026, General Motors Company ("GM") entered into an Eighth Amended and Restated 364-Day Revolving Credit Agreement with JPMorgan Chase Bank, N.A., as administrative agent, Citibank, N.A., as syndication agent, the other lenders named therein, and General Motors Financial Company, Inc. (the "364-Day Facility").',
    ], dir, gm, ev));
    const lenders = got.filter((r) => r.role === 'lender');
    expect(lenders.map((r) => [r.key, r.ticker ?? ''])).toEqual([['n:jpmorgan chase bank', ''], ['cik:831001', 'C']]);
    expect(lenders.some((r) => r.ticker === 'JTGEY' || r.cik === 1472033)).toBe(false);
    expect(lenders[0].evidence).toHaveLength(2);
  });

  it("finds Hengrui under its CIK when Merck's release writes \"Pharmaceutical\" (M8)", () => {
    const mrk = { cik: 310158, names: targetNames('MRK', 'Merck & Co., Inc.').names, ticker: 'MRK' };
    const ev = { filer: 'Merck & Co., Inc.', form: '8-K', date: '2026-08-04', path: '310158/000110465926090045/tm2621496d1_ex99-1.htm', type: 'EX-99.1' };
    const got = ownRelations(['Both GAAP and non-GAAP EPS in the second quarter of 2025 include a charge of $0.07 per share for an upfront payment related to a license agreement with Jiangsu Hengrui Pharmaceutical Co., Ltd. (Hengrui Pharma).'], dir, mrk, ev);
    expect(got.map((r) => [r.role, r.key, r.ticker])).toEqual([['partner', 'cik:2071868', 'JHPCY']]);
  });
});

const MERCK = targetPattern(targetNames('MRK', 'Merck & Co., Inc.').names);
const PFIZER = targetPattern(targetNames('PFE', 'PFIZER INC').names);
const LILLY = targetPattern(targetNames('LLY', 'ELI LILLY & Co').names);
const GM = targetPattern(targetNames('GM', 'GENERAL MOTORS CO').names);
const NORTHROP = targetPattern(targetNames('NOC', 'NORTHROP GRUMMAN CORP /DE/').names);

describe('SPLC review of 30 October 2026: relations the cited filing itself says ended', () => {
  it('reads a termination, a notice of it, royalties that stopped, an assignment away and a property sold, with the date the filing gives', () => {
    // Merck (M5): Artiva, Foghorn, Aligos, Cocrystal, C4, LAVA (M4) and Enzon.
    expect(relationEnding('In October 2023, the Merck Collaboration Agreement and development thereunder was terminated by Merck.', MERCK)).toEqual({ how: 'terminated', date: '2023-10' });
    expect(relationEnding('On August 9, 2023 we received notice from Merck that it was terminating the Merck Collaboration Agreement effective November 7, 2023.', MERCK)).toEqual({ how: 'terminated', date: '2023-11-07' });
    expect(relationEnding('In February 2023 and May 2024, Merck provided us written notice of termination for both of the targets in the collaboration.', MERCK)).toEqual({ how: 'terminated', date: '2024-05' });
    expect(relationEnding('On December 15, 2023, we received written notice from Merck of Merck\'s election to terminate the Collaboration Agreement, dated January 2, 2019, by and between the Company and Merck, with respect to the collaboration with Merck on the development of influenza A/B antiviral compounds.', MERCK)).toEqual({ how: 'terminated', date: '2023-12-15' });
    expect(relationEnding('The Merck Agreement was terminated by Merck, effective late November 2025.', MERCK)).toEqual({ how: 'terminated', date: '2025-11' });
    expect(relationEnding('In connection with the discontinuation of the LAVA-1207 clinical trial, we terminated this agreement in December 2024 and will continue to fulfill all of the obligations related to the patients treated in that trial in collaboration with Merck.', MERCK)).toEqual({ how: 'terminated', date: '2024-12' });
    expect(relationEnding('We will receive no additional royalties from Merck.', MERCK)).toEqual({ how: 'expired' });
    // Lilly (LLY-12): Immunocore's, terminated in 2022, not in February 2023 when another agreement wound down.
    expect(relationEnding('Our collaboration agreement with Lilly was terminated in 2022 and in February 2023, we and Genentech agreed to wind down the co-funding arrangements and clinical trial for IMC-C103C.', LILLY)).toEqual({ how: 'terminated', date: '2022' });
    // Pfizer (PFE-7, PFE-8, PFE-11, PFE-12): Voyager's and Sangamo's agreements assigned to Alexion, Sangamo's
    // terminated, Exact's promotion ended.
    expect(relationEnding('Effective upon the closing of a transaction on September 20, 2023, Alexion (via Alexion Pharma International Operations Limited, or APIO) acquired all of Pfizer\'s rights under the Alexion Agreement and became the successor-in-interest to Pfizer thereunder.', PFIZER)).toEqual({ how: 'assigned', date: '2023-09-20' });
    expect(relationEnding('In December 2017, the Company entered into an exclusive, global collaboration and license agreement with Pfizer, subsequently assigned to Alexion, AstraZeneca Rare Disease ("Alexion") in September 2023, for the development and commercialization of potential gene therapy products that use zinc finger transcriptional regulators ("ZF-transcriptional regulators") to treat amyotrophic lateral sclerosis and frontotemporal lobar degeneration linked to mutations of the C9ORF72 gene.', PFIZER)).toEqual({ how: 'assigned', date: '2023-09' });
    expect(relationEnding('In December 2024, Pfizer notified the Company of its termination for convenience, effective April 21, 2025 (the "Pfizer Termination Date"), of the collaboration agreement.', PFIZER)).toEqual({ how: 'terminated', date: '2025-04-21' });
    expect(relationEnding('In November 2021, the Company and Pfizer entered into an amendment to the Restated Promotion Agreement (the "November 2021 Amendment"), which provided that after November 30, 2021, Pfizer will no longer promote the Cologuard test to healthcare providers.', PFIZER)).toEqual({ how: 'terminated', date: '2021-11-30' });
    // Northrop (finding 8): Modiv sold the building it leased to Northrop; while under contract to sell, it had not.
    expect(relationEnding('On May 21, 2026, the Company completed the sale of its industrial property in Melbourne, Florida leased to Northrop Grumman for $18.7 million.', NORTHROP)).toEqual({ how: 'disposed', date: '2026-05-21' });
    expect(relationEnding('We are under contract to sell our industrial property that is leased to Northrop Grumman Systems Corporation in Melbourne, Florida during the second quarter of 2026, although there can be no assurances that the transaction will be completed.', NORTHROP)).toBeNull();
  });

  it('reads the sentence after one naming the company when it refers back to the agreement (GM-7, PFE-13)', () => {
    const ses = 'In February 2021, the Company established a partnership with GM Global Technology Operations LLC ("GM Technology"), an affiliate of GM Ventures LLC ("GM Ventures"), and General Motors Holdings LLC ("GM Holdings") (collectively, "General Motors" or "GM") when it entered into a JDA to jointly research and develop the A-Sample Li-Metal batteries and build-out a prototype manufacturing line for GM Technology.';
    expect(main.mentionSentences(`${ses} The JDA concluded in September 2024. We continue our own research.`, ['General Motors', 'GM'])).toEqual([ses, '[next] The JDA concluded in September 2024.']);
    expect(relationEnding('The JDA concluded in September 2024.', GM, ses)).toEqual({ how: 'terminated', date: '2024-09' });
    const syros = 'During the three and nine months ended September 30, 2023, the Company recognized revenue of $3.8 million and $9.6 million, respectively, under a license and collaboration agreement with Global Therapeutics, Inc, now a subsidiary of Pfizer.';
    expect(relationEnding('As the agreement was terminated in October 2023, no revenue was recognized during the three and nine month periods ended September 30, 2024.', PFIZER, syros)).toEqual({ how: 'terminated', date: '2023-10' });
    // Another agreement in the next sentence is no ending of this one.
    expect(relationEnding('On March 8, 2019, the Company entered into an agreement that was later terminated.', PFIZER, syros)).toBeNull();
  });

  it("reads no ending in a right to end, a condition, part of an agreement, another company's agreement or the filer taking one over", () => {
    expect(relationEnding('Merck has the right to terminate the License and Research Collaboration Agreement in its entirety or on a target-by-target basis at any time by giving us 90 days\' written notice.', MERCK)).toBeNull();
    // LLY-6: Atrium's termination clause, and the agreement assigned to Atrium at its spin-off.
    expect(relationEnding('In such event, material licenses granted to Lilly expire, and the Company and Lilly negotiate in good faith a product reversion to Avidity.', LILLY)).toBeNull();
    expect(relationEnding('Upon the closing of the Spin-Off, the Lilly Agreement was assigned to and assumed by us.', LILLY)).toBeNull();
    expect(relationEnding('In connection with the Kineta-Yumanity Merger, the Company became the successor in interest to the Merck Neuromuscular License Agreement with Merck to support research, development and commercialization of products for treatment of neuromuscular diseases, including amyotrophic lateral sclerosis ("ALS").', MERCK)).toBeNull();
    // A trial, one program, one of two agreements, an option right or patents ended; the agreement did not.
    expect(relationEnding('The collaboration includes two clinical-stage candidates: MK-1167, which was being evaluated in a Merck-led Phase 2 trial in Alzheimer\'s disease dementia and was terminated after a planned interim analysis due to lack of efficacy, and MK-4334, which has completed Phase 1 safety and biomarker studies.', MERCK)).toBeNull();
    expect(relationEnding('On October 1, 2025, Lilly notified us of its intent to terminate the CNS disease program under the Lilly Agreement, and such termination became effective on November 30, 2025.', LILLY)).toBeNull();
    expect(relationEnding('Pursuant to Amendment No. 1 to the Second Pfizer Agreement, as described below, the Company and Pfizer terminated the Third Pfizer Agreement.', PFIZER)).toBeNull();
    expect(relationEnding('In July 2025, the Company obtained unencumbered world-wide exclusive rights to freely engage in strategic partnerships, business development, and co-development opportunities for ACR-368, inclusive of all related intellectual property, in all territories and regions, after the triggering of Lilly\'s limited right of first negotiation ("ROFN"), which the parties agreed under the terms of the agreement had expired.', LILLY)).toBeNull();
    expect(relationEnding('All patents directed to the compound sulopenem expired prior to us entering into the Pfizer License.', PFIZER)).toBeNull();
    expect(relationEnding('Certain of these Manufacturing and Supply Agreements have terminated or expired, including agreements that no are longer required following Organon\'s acquisition of the Oss Biotech manufacturing facility in the Netherlands from Merck in July 2025.', MERCK)).toBeNull();
    // Verve's notice was Vertex's; Codexis's price "no longer provides Merck material rights" is accounting.
    expect(relationEnding('During the three months ended March 31, 2025, collaboration revenue included $20.0 million related to recognition of the remaining amounts included in deferred revenue at the notice of termination date of the Vertex Agreement, $1.4 million related to research services and cost reimbursement from the Vertex Agreement, and $11.6 million related to research services and cost reimbursement from the Lilly Agreement.', LILLY)).toBeNull();
    expect(relationEnding('Pursuant to the amendment of the Sitagliptin Supply Agreement in September 2021, we have determined that the latest price per volume of sitagliptin enzyme to be purchased by Merck no longer provides Merck material rights, and as such we have recognized product revenue based on contractually stated prices effective as of February 2022.', MERCK)).toBeNull();
    expect(relationEnding('Unless Eli Lilly notifies the Company in writing that it has no interest in such an arrangement (a Discussion Termination Notice), the parties shall use commercially reasonable efforts to negotiate, in good faith, the terms of such an arrangement with Eli Lilly and Company for a period to expire on the date that is 60 days after the confirmed receipt of the Negotiation Notice (a Discussion Period), and the Company shall not enter into any such arrangement with any third party during such Discussion Period.', LILLY)).toBeNull();
  });

  it("shows Artiva's agreement with Merck as ended, not current, on Merck's screen", async () => {
    const artiva: FtsHit = { cik: 1817241, name: 'Artiva Biotherapeutics, Inc.', tickers: ['ARTV'], form: '10-K', date: '2025-03-24', path: '1817241/000095017025043837/artv-20241231.htm', score: 1, type: '10-K' };
    const io: ChainIO = {
      companies: async () => [...SEC, { cik: 1817241, ticker: 'ARTV', title: 'Artiva Biotherapeutics, Inc.' }],
      filings: async () => [],
      fts: async (arg) => (arg === '|Merck|reports' ? { hits: [artiva], total: 1 } : { hits: [], total: 0 }),
      text: async (kind, path) => (kind === 'mentions' && path === artiva.path ? [
        'In January 2021, the Company entered into the Exclusive License and Research Collaboration Agreement (the "Merck Collaboration Agreement") with Merck for the discovery, development, manufacture and commercialization of CAR-NK cells that target certain solid tumor antigens.',
        'Merck paid the Company $30.0 million upfront for two target programs under the Merck Collaboration Agreement.',
        'In October 2023, the Merck Collaboration Agreement and development thereunder was terminated by Merck.',
      ] : []),
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'MRK', name: 'Merck & Co., Inc.' }, io, (f) => { chain = f(chain); });
    expect(relationshipView(chain, 'current').filter((r) => r.key === 'cik:1817241')).toEqual([]);
    const past = relationshipView(chain, 'history').find((r) => r.key === 'cik:1817241' && r.role === 'partner')!;
    expect(relationStatus(past)).toBe('ended');
    expect(past.assertions?.find((a) => a.state === 'ended')).toMatchObject({ scope: 'relationship', effectiveTo: '2023-10', ending: 'terminated' });
  });

  it('keeps a relation a later statement says began after the ending, and settles an unscoped closure by a later ending', () => {
    const ev = (sentence: string, date: string) => ({ sentence, filer: 'X', form: '10-K', date, path: `1/000000000${date.replace(/-/g, '')}0/x.htm` });
    const end = ev('In October 2023, the Merck Collaboration Agreement and development thereunder was terminated by Merck.', '2025-03-24');
    const later = ev('In 2025, we entered into a new research agreement with Merck.', '2025-03-24');
    const r: Relation = { key: 'cik:1', name: 'X', role: 'partner', side: 'theirs', evidence: [{ ...end, assertion: endingAssertion(end, { how: 'terminated', date: '2023-10' }) }, later] };
    expect(relationStatus(r)).toBe('reported');
    expect(relationStatus({ ...r, evidence: [r.evidence[0], ev('Merck paid the Company $30.0 million upfront.', '2025-03-24')] })).toBe('ended');
    // Pfizer's own 8-K had no contract reference ("needs reconciliation"); Sangamo's 10-Q later gives the ending.
    const own = { sentence: 'Terminated a global collaboration and license agreement with Sangamo Therapeutics, Inc.', filer: 'Pfizer Inc', form: '8-K', date: '2025-02-04', path: '78003/000007800325000010/x.htm' };
    const theirs = ev('In December 2024, Pfizer notified the Company of its termination for convenience, effective April 21, 2025 (the "Pfizer Termination Date"), of the collaboration agreement.', '2026-05-14');
    const unresolved = { id: 'own', evidenceId: 'own', state: 'ended' as const, sourceDate: own.date, sourcePrecision: 'day' as const, scope: 'unresolved' as const };
    expect(relationStatus({ key: 'cik:1001233', name: 'Sangamo', role: 'partner', side: 'both', evidence: [{ ...own, assertion: unresolved }] })).toBe('unresolved');
    expect(relationStatus({ key: 'cik:1001233', name: 'Sangamo', role: 'partner', side: 'both', evidence: [{ ...own, assertion: unresolved }, { ...theirs, assertion: endingAssertion(theirs, { how: 'terminated', date: '2025-04-21' }) }] })).toBe('ended');
  });
});
