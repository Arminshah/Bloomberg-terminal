import { describe, expect, it } from 'vitest';
import * as main from '../electron/supply-chain.cjs';
import * as federal from '../electron/usaspending.cjs';
import {
  buildDirectory, classify, federalParty, filerIdentity, sharePeriod, listingEvents, listingLabel, mergeRelations, normalizeName, ownRelations, relationEnding, relationshipView, relationStatus, runChain,
  speaksOfNamesake, takenOver, targetNames, targetPattern, type Chain, type ChainIO, type FtsHit, type Relation,
} from '../src/data/live/supply-chain';
import { appendRelationshipHistory, endingAssertion, enrichRelation, revenueLine, shareObservation, statedBy } from '../src/data/live/supply-chain-history';
import { agencyRelations, doubtfulSubawards, federalRelations, resolveParties, subRelations, type FedAward, type FederalContext, type FedSubaward, type UsaspendingKind } from '../src/data/live/usaspending';
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
    const ev = { sentence: 'In July 2024, Coterra joined our beneficial reuse strategic agreement (the "Joint Industry Project" or "JIP") with Chevron U.S.A. Inc., ConocoPhillips and Exxon Mobil Corporation (collectively with us, the "alliance members") to develop and pilot technologies and processes to treat produced water for potential beneficial reuse opportunities.', filer: 'Aris Water Solutions, Inc.', form: '10-K', date: '2025-02-27', path: '1865187/000155837025001818/aris-20241231x10k.htm' };
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
    // Another agreement in the next sentence is no ending of this one (Allogene's 10-K: Pfizer assigned it the agreement
    // with Cellectis that Allogene later ended).
    const allogene = 'As part of the Pfizer Agreement, Pfizer assigned to the Company a Research Collaboration and License Agreement (the Original Cellectis Agreement) with Cellectis S.A. (Cellectis).';
    expect(relationEnding('On March 8, 2019, the Company entered into a License Agreement (the Cellectis Agreement) with Cellectis and terminated the Original Cellectis Agreement.', PFIZER, allogene)).toBeNull();
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
    // A constructed statement: no reviewed filing restarts a relation it says ended.
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

describe('SPLC review of 30 October 2026: who states each statement', () => {
  it("labels Incyte's own 10-K as Incyte's, on a relation Lilly's 10-K names first (18 Lilly rows, 51 Pfizer rows, Northrop's L3Harris)", () => {
    const lilly = { sentence: 'We have a worldwide license and collaboration agreement with Incyte Corporation (Incyte), which provides us the development and commercialization rights to baricitinib, which is branded and trademarked as Olumiant, and certain follow-on compounds, for the treatment of inflammatory and autoimmune diseases.', filer: 'ELI LILLY & Co', form: '10-K', date: '2025-02-19', path: '59478/000005947825000067/lly-20241231.htm' };
    const incyte = { sentence: 'These include OLUMIANT (baricitinib), which is licensed to our collaborative partner Eli Lilly and Company ("Lilly"), and JAKAVI (ruxolitinib) and TABRECTA (capmatinib), which are licensed to Novartis.', filer: 'INCYTE CORP', form: '10-K', date: '2026-02-10', path: '879169/000087916926000010/incy-20251231.htm' };
    const own: Relation = { key: 'cik:879169', name: 'Incyte Corp', cik: 879169, role: 'partner', side: 'own', evidence: [lilly] };
    const theirs: Relation = { ...own, side: 'theirs', evidence: [incyte] };
    // Lilly's own filings are read first; the saved history kept "own" for every statement after.
    expect(appendRelationshipHistory([own], [theirs])[0].side).toBe('both');
    expect(appendRelationshipHistory([], [own, theirs])[0].side).toBe('both');
    expect(statedBy(lilly, 59478)).toBe('own');
    expect(statedBy(incyte, 59478)).toBe('theirs');
    expect(statedBy({ sentence: 'Defense Logistics Agency contract SPE2DP26F4183 with PFIZER INC: $0.2M obligated.', filer: 'USAspending.gov', form: 'Contract', date: '2026-04-01', path: '', url: 'https://www.usaspending.gov/award/CONT_AWD_SPE2DP26F4183_9700_SPE2DP26D0001_9700' }, 78003)).toBe('records');
  });
});

// Ford's 10-Q of 29 July 2026 (www.sec.gov/Archives/edgar/data/37996/000003799626000156/f-20260630.htm), as the app reads it.
const BOSK_DEFINED = 'In May 2026, we and the U.S. Department of Energy ("DOE") entered into a Loan Arrangement and Reimbursement Agreement (the "Ford DOE Loan Agreement"), and we assumed from BlueOval SK, LLC ("BOSK"), our former joint venture, all obligations under a $3.8 billion promissory note payable to the DOE for advances previously made to BOSK.';
const BOSK_REDEEMED = "Upon closing, Ford's membership interest in BOSK was redeemed in full, Ford's obligation to make further capital contributions to BOSK was terminated, and Ford was released from its 50% guarantee of BOSK's payment obligations under the BOSK DOE Loan.";
// Ford's 10-Q of 24 October 2025.
const BOSK_CAPITAL = 'Moreover, in order to secure critical materials for production of electric vehicles, we have entered into and we may, in the future, enter into offtake agreements with raw material suppliers and make investments in certain raw material and battery suppliers, including contributing up to a maximum of $6.6 billion in capital to BlueOval SK, LLC ("BOSK") over a five-year period ending in 2026.';

describe('SPLC review of 30 October 2026: companies the company took over, and stakes it no longer holds', () => {
  const lilly = targetPattern(targetNames('LLY', 'ELI LILLY & Co').names);
  it("reads its own statements of a takeover or a redeemed stake, and not purchases of shares, assets or products", () => {
    const parties = (s: string, self = lilly) => takenOver(s, dir, self);
    // LLY-11, LLY-10: Lilly's 10-K of February 2026 and its release of October 2026.
    expect(parties('In July 2025, we acquired all shares of Verve Therapeutics, Inc. (Verve) for a purchase price of $10.50 per share in cash (or an aggregate of $549 million, net of cash acquired), plus one non-tradeable contingent value right (CVR) per share that entitles the holder to receive up to an additional $3.00 per share (or an aggregate of up to approximately $300 million) payable, subject to certain terms and conditions, upon the achievement of a certain specified milestone.')).toEqual({ parties: [{ name: 'Verve Therapeutics', index: 0 }], ending: { how: 'disposed', date: '2025-07' } });
    expect(parties('Lilly completes acquisition of AtaiBeckley to advance therapies for treatment-resistant depression and other mental health conditions (announcement)')?.parties.map((p) => p.name)).toEqual(['AtaiBeckley']);
    // An agreement to acquire is no takeover yet.
    expect(parties('In addition, we have entered into an agreement to acquire AtaiBeckley Inc., subject to closing conditions.')).toBeNull();
    // PFE-6: Pfizer's 10-K of February 2025.
    expect(parties('Biohaven--On October 3, 2022, we acquired Biohaven, the maker of Nurtec ODT/Vydura (rimegepant), an innovative therapy approved for both acute treatment of migraine and prevention of episodic migraine in adults.', PFIZER)).toMatchObject({ parties: [{ name: 'Biohaven' }], ending: { date: '2022-10-03' } });
    // F-4: Ford's 10-Q of July 2026, which defines "BOSK" (see the runChain case below).
    const ford = targetPattern(targetNames('F', 'FORD MOTOR CO').names);
    expect(parties(BOSK_REDEEMED, ford)?.parties.map((p) => p.name)).toEqual(['BOSK']);
    // GM's 10-K: shares bought from SoftBank and from minority holders; Merck's 10-Q: a product bought.
    const gm = targetPattern(targetNames('GM', 'GENERAL MOTORS CO').names);
    expect(parties('Cruise Preferred Shares In March 2022, we acquired SoftBank Vision Fund (AIV M2) L.P.\'s (SoftBank) Cruise Class A-1, Class F and Class G Preferred Shares for $2.1 billion and made an additional $1.35 billion investment in Cruise in place of SoftBank.', gm)).toBeNull();
    expect(parties('In December 2024, we acquired Class F and Class G Preferred Shares from noncontrolling shareholders for an insignificant amount.', gm)).toBeNull();
    expect(parties('In September 2024, Merck acquired MK-1045 (formerly CN201), a novel investigational clinical-stage bispecific antibody for the treatment of B-cell associated diseases, from Curon Biopharmaceutical (Curon).', MERCK)).toBeNull();
  });

  it("ends Verve's relations with Lilly when Lilly's own filing says it acquired Verve (LLY-11)", async () => {
    const verve: FtsHit = { cik: 1840574, name: 'Verve Therapeutics, Inc.', tickers: ['VERV'], form: '10-K', date: '2025-03-04', path: '1840574/000095017025028376/verv-20241231.htm', score: 1, type: '10-K' };
    const io: ChainIO = {
      companies: async () => [...SEC, { cik: 59478, ticker: 'LLY', title: 'ELI LILLY & Co' }],
      filings: async (cik) => (cik === 59478 ? [{ form: '10-K', filed: '2026-02-12', accession: '0000059478-26-000013', doc: 'lly-20251231.htm' }] : []),
      fts: async (arg) => (arg === '|Lilly|reports' ? { hits: [verve], total: 1 } : { hits: [], total: 0 }),
      text: async (kind, path) => {
        if (kind === 'own' && path.endsWith('lly-20251231.htm')) return ['In July 2025, we acquired all shares of Verve Therapeutics, Inc. (Verve) for a purchase price of $10.50 per share in cash (or an aggregate of $549 million, net of cash acquired), plus one non-tradeable contingent value right (CVR) per share that entitles the holder to receive up to an additional $3.00 per share (or an aggregate of up to approximately $300 million) payable, subject to certain terms and conditions, upon the achievement of a certain specified milestone.'];
        if (kind === 'mentions' && path === verve.path) return [
          'In June 2023, we entered into an exclusive, five-year global research collaboration with Lilly focused on advancing our in vivo gene editing Lp(a) program.',
          'In July 2023, we sold and issued 1,552,795 shares of our common stock to Lilly at a price of $19.32 per share, for an aggregate purchase price of $30.0 million.',
        ];
        return [];
      },
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'LLY', name: 'Eli Lilly' }, io, (f) => { chain = f(chain); });
    expect(relationshipView(chain, 'current').filter((r) => r.key === 'cik:1840574')).toEqual([]);
    const past = relationshipView(chain, 'history').filter((r) => r.key === 'cik:1840574');
    expect(past.map((r) => [r.role, relationStatus(r)]).sort()).toEqual([['investment', 'ended'], ['partner', 'ended']]);
    expect(past[0].assertions?.find((a) => a.state === 'ended')).toMatchObject({ effectiveTo: '2025-07', scope: 'relationship' });
  });

  it("ends a stake in a company taken over since, and reads Ford's investments in its battery suppliers as stakes (PFE-10, F-4)", () => {
    // Tourmaline's 8-K of 28 October 2025 completed Novartis's merger (item 5.01); Pfizer's shares were bought for cash.
    const ev = { sentence: 'In addition, in May 2023, we issued 8,823,529 additional shares of our Series A convertible preferred stock to Pfizer pursuant to an anti-dilution provision within the Pfizer License Agreement.', filer: 'Tourmaline Bio, Inc.', form: '10-K', date: '2025-03-13', path: '1827506/000182750625000027/trml-20241231.htm' };
    const stake: Relation = { key: 'cik:1827506', name: 'Tourmaline Bio, Inc.', cik: 1827506, role: 'investment', side: 'theirs', evidence: [ev], listing: { listed: false, was: 'TRML', events: listingEvents([{ form: '15-12G', filed: '2025-11-07' }, { form: '8-K', filed: '2025-10-28', items: ['2.01', '3.01', '5.01', '5.03'] }]) } };
    expect(relationStatus(stake)).toBe('ended');
    // Its licence with Pfizer goes on with Novartis's subsidiary.
    expect(relationStatus({ ...stake, role: 'partner' })).toBe('reported');
    // Pfizer's 10-K of February 2026 (pfe-20251231.htm): the 32% it held at the end of 2023 is no stake today.
    const pfe = (sentence: string) => ({ sentence, filer: 'Pfizer Inc', form: '10-K', date: '2026-02-26', path: '78003/000007800326000026/pfe-20251231.htm' });
    const haleon: Relation = { key: 'cik:1900304', name: 'Haleon plc', ticker: 'HLN', cik: 1900304, role: 'investment', side: 'own', evidence: [
      pfe('We owned 32% of Haleon as of December 31, 2023.'),
      pfe('The change was driven mainly by $6.9 billion cash paid for the acquisition of Metsera, net of cash acquired, and $0.7 billion lower proceeds from the remaining sale of our investment in Haleon in 2025 compared with the portion sold in 2024, partially offset by a $3.8 billion increase in net proceeds from short-term investments.'),
    ] };
    expect(relationStatus(haleon)).toBe('ended');
    const ford = { cik: 37996, names: targetNames('F', 'FORD MOTOR CO').names, ticker: 'F' };
    const got = ownRelations([BOSK_CAPITAL], dir, ford, { filer: 'Ford Motor Co', form: '10-Q', date: '2025-10-24', path: '37996/000003799625000186/f-20250930.htm' });
    expect(got.map((r) => [r.role, r.name])).toEqual([['investment', 'BlueOval SK']]);
  });

  it("ends Ford's stake in BlueOval SK when a later 10-Q says its interest in \"BOSK\" was redeemed (F-4)", async () => {
    const io: ChainIO = {
      companies: async () => [...SEC, { cik: 37996, ticker: 'F', title: 'FORD MOTOR CO' }],
      filings: async (cik) => (cik === 37996 ? [
        { form: '10-Q', filed: '2026-07-29', accession: '0000037996-26-000156', doc: 'f-20260630.htm' },
        { form: '10-Q', filed: '2025-10-24', accession: '0000037996-25-000186', doc: 'f-20250930.htm' },
        { form: '10-K', filed: '2025-02-06', accession: '0000037996-25-000013', doc: 'f-20241231.htm' },
      ] : []),
      fts: async () => ({ hits: [], total: 0 }),
      text: async (kind, path) => (kind !== 'own' ? [] : path.endsWith('f-20260630.htm') ? [BOSK_DEFINED, BOSK_REDEEMED] : path.endsWith('f-20250930.htm') ? [BOSK_CAPITAL] : []),
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'F', name: 'Ford Motor Company' }, io, (f) => { chain = f(chain); });
    expect(relationshipView(chain, 'current').filter((r) => r.name === 'BlueOval SK')).toEqual([]);
    const past = relationshipView(chain, 'history').filter((r) => r.name === 'BlueOval SK');
    expect(past.map((r) => [r.role, relationStatus(r)])).toEqual([['investment', 'ended']]);
    expect(past[0].evidence.map((e) => e.sentence)).toContain(BOSK_REDEEMED);
  });
});

// USAspending.gov's answers of 30 October 2026 (api.usaspending.gov/api/v2), as the main process reads them.
const parsed = <T>(kind: UsaspendingKind, body: unknown) => federal.parseUsaspending(kind, JSON.stringify(body)) as T[];
const FED: SecCompany[] = [
  { cik: 78003, ticker: 'PFE', title: 'PFIZER INC' },
  { cik: 1133421, ticker: 'NOC', title: 'NORTHROP GRUMMAN CORP /DE/' },
  { cik: 40533, ticker: 'GD', title: 'GENERAL DYNAMICS CORP' },
  { cik: 1601548, ticker: 'VVX', title: 'V2X, Inc.' },
  { cik: 1806837, ticker: 'VERX', title: 'Vertex, Inc.' },
  { cik: 4611, ticker: 'AIR', title: 'AAR CORP' },
];
const fedDir = buildDirectory(FED);
const fedContext = (ticker: string, title: string): FederalContext => {
  const names = targetNames(ticker, title);
  const keys = [...new Set([normalizeName(title), ...names.legal.map(normalizeName)])];
  const re = new RegExp(targetPattern(names.names).source);
  return { keys, self: (n) => re.test(n) || keys.some((k) => normalizeName(n) === k || normalizeName(n).startsWith(`${k} `)), party: (n) => federalParty(n, fedDir), normalize: normalizeName, today: '2026-10-30' };
};
const SUB_ROW = (r: Record<string, unknown>) => ({ 'Awarding Agency': 'Department of Defense', ...r });

describe('SPLC review of 30 October 2026: the federal records', () => {
  it("names the Air Force, not the Defense Contract Management Agency that administers its contract, as Northrop's customer (finding 1)", () => {
    expect(federal.usaspendingRequest('awards', 'G7LEFNAN9J74', Date.parse('2026-10-30T12:00:00Z'))!.body.fields).toEqual(expect.arrayContaining(['Funding Agency', 'Funding Sub Agency']));
    const awards = parsed<FedAward>('awards', { results: [{ internal_id: 297794617, 'Award ID': 'F4261098C0001', 'Recipient Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Recipient UEI': 'G7LEFNAN9J74', 'Award Amount': 10008567439.01, 'Awarding Agency': 'Department of Defense', 'Awarding Sub Agency': 'Defense Contract Management Agency', 'Funding Agency': 'Department of Defense', 'Funding Sub Agency': 'Department of the Air Force', 'Start Date': '1998-07-01', 'End Date': '2025-11-30', generated_internal_id: 'CONT_AWD_F4261098C0001_9700_-NONE-_-NONE-' }] });
    const got = agencyRelations(awards, fedContext('NOC', 'NORTHROP GRUMMAN CORP /DE/'));
    expect(got.map((r) => [r.key, r.name, Math.round(r.amount!)])).toEqual([['gov:department of the air force', 'Department of the Air Force', 10008567439]]);
  });

  it("does not count Meridian Medical Technologies' contracts for Pfizer: USAspending files no dollars of it under Pfizer (PFE-1)", async () => {
    const asked: string[] = [];
    const children = [
      { recipient_id: 'p-c', uei: 'MHBQULRMEEJ5', name: 'PFIZER INC', amount: 1176693793.44 },
      { uei: 'ZEFHQN761XB1', name: 'MERIDIAN MEDICAL TECHNOLOGIES, INC.', amount: 0 },
      { uei: 'VBM4PLZ9VBC4', name: 'MERIDIAN MEDICAL TECHNOLOGIES, LLC', amount: 0 },
      { uei: 'J1C9WY9JYTJ6', name: 'MERIDIAN MEDICAL TECHNOLOGIES, INC.', amount: 0 },
      { uei: 'UMHBBBR5H3Z6', name: 'MYLAN INSTITUTIONAL INC', amount: 0 },
      { uei: 'V4XFAW56JGZ3', name: 'PFIZER INC.', amount: 0 },
    ];
    const answer = (kind: UsaspendingKind) => kind === 'recipients'
      ? { results: [{ id: 'aaaaaaaa-0000-0000-0000-000000000000-P', uei: 'MHBQULRMEEJ5', name: 'PFIZER INC', recipient_level: 'P', amount: 1176693793.44 }, { id: 'aaaaaaaa-0000-0000-0000-000000000000-C', uei: 'MHBQULRMEEJ5', name: 'PFIZER INC', recipient_level: 'C', amount: 1176693793.44 }] }
      : kind === 'children' ? children : { results: [] };
    await federalRelations(async (kind, arg) => {
      asked.push(`${kind} ${arg}`);
      return { status: 200, rows: federal.parseUsaspending(kind, JSON.stringify(answer(kind)))! };
    }, { ...fedContext('PFE', 'PFIZER INC'), named: async (list) => new Set(list) });
    const units = asked.find((a) => a.startsWith('awards '))!.slice(7).split(',');
    expect(units).toContain('MHBQULRMEEJ5');
    expect(units).toContain('V4XFAW56JGZ3');
    for (const meridian of ['ZEFHQN761XB1', 'VBM4PLZ9VBC4', 'J1C9WY9JYTJ6', 'UMHBBBR5H3Z6']) expect(units).not.toContain(meridian);
  });

  it("counts a subaward reported three times under one number once (Dayton T. Brown, finding 5)", () => {
    const report = (amount: number) => SUB_ROW({ 'Sub-Award ID': '5000256853', 'Sub-Awardee Name': 'DAYTON T. BROWN, INC.', 'Sub-Recipient UEI': 'GN84UHWZJMR8', 'Sub-Award Amount': amount, 'Sub-Award Date': '2022-03-31', 'Prime Recipient Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Prime Award Recipient UEI': 'PK8PM2GNVMP8', 'Prime Award ID': 'N0001913C9999', 'Sub-Award Description': 'STANDARDPARTHARDWARE', prime_award_generated_internal_id: 'CONT_AWD_N0001913C9999_9700_-NONE-_-NONE-' });
    const subs = parsed<FedSubaward>('subs', { results: [report(15020601), report(14999812), report(14999812)] });
    const got = subRelations(subs, 'supplier', fedContext('NOC', 'NORTHROP GRUMMAN CORP /DE/'), new Set(['PK8PM2GNVMP8']));
    expect(got.map((r) => [r.name, r.amount, r.evidence.length])).toEqual([['DAYTON T. BROWN, INC.', 15020601, 1]]);
  });

  it("shows Technovare's $927.0M subaward with the reason, without counting or ranking it (finding 4)", async () => {
    const row = (r: Record<string, unknown>) => SUB_ROW({ 'Prime Recipient Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Prime Award Recipient UEI': 'VSBAFMDKTWL4', 'Prime Award ID': 'FA881018C0006', prime_award_generated_internal_id: 'CONT_AWD_FA881018C0006_9700_-NONE-_-NONE-', ...r });
    const subs = parsed<FedSubaward>('subs', { results: [
      row({ 'Sub-Award ID': '5000414846', 'Sub-Awardee Name': 'TECHNOVARE SYSTEMS, INC.', 'Sub-Recipient UEI': 'PQX9B291F4V5', 'Sub-Award Amount': 927047948.0, 'Sub-Award Date': '2023-07-28', 'Sub-Award Description': 'TECHNICAL SERVICES' }),
      row({ 'Sub-Award ID': '5000299326', 'Sub-Awardee Name': 'AIRBUS US SPACE & DEFENSE INC', 'Sub-Recipient UEI': 'KDFTJG6RK5A8', 'Sub-Award Amount': 107163324.0, 'Sub-Award Date': '2022-08-04' }),
    ] });
    // The Next-Gen OPIR Polar contract: $3,485,513,539.13 obligated since June 2018. Technovare's one other subaward of
    // two years: $151,000 under FA880820C0049, March 2025.
    const asked: string[] = [];
    const doubtful = await doubtfulSubawards(subs, new Map([['FA881018C0006', 3485513539.13]]), async (kind, arg) => {
      asked.push(`${kind} ${arg}`);
      return { status: 200, rows: federal.parseUsaspending(kind, JSON.stringify({ results: [SUB_ROW({ 'Sub-Award ID': '5300033936 CO8', 'Sub-Awardee Name': 'TECHNOVARE SYSTEMS, INC.', 'Sub-Recipient UEI': 'PQX9B291F4V5', 'Sub-Award Amount': 151000.0, 'Sub-Award Date': '2025-03-17', 'Prime Recipient Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Prime Award Recipient UEI': 'VSBAFMDKTWL4', 'Prime Award ID': 'FA880820C0049' })] }))! };
    });
    // Airbus's $107.2M is 3% of the prime: not a candidate.
    expect(asked).toEqual(['subawards PQX9B291F4V5']);
    const got = subRelations(subs, 'supplier', fedContext('NOC', 'NORTHROP GRUMMAN CORP /DE/'), new Set(['VSBAFMDKTWL4']), 30, doubtful);
    expect(got.map((r) => [r.name, r.amount])).toEqual([['Airbus', 107163324], ['TECHNOVARE SYSTEMS, INC.', undefined]]);
    expect(got[1].evidence[0].sentence).toContain("Not counted: the reported $927.0M is 27% of the prime contract's $3.5B obligation and 6139 times the subcontractor's next-largest subaward of two years ($151.0K)");
  });

  it('reads Vertex Aerospace as V2X, its name now, and Electric Boat under General Dynamics, its parent in the records (findings 2 and 9)', async () => {
    const ctx = fedContext('NOC', 'NORTHROP GRUMMAN CORP /DE/');
    // First-word matching took Vertex Aerospace for Vertex, Inc., the tax software company.
    expect(federalParty('VERTEX AEROSPACE LLC', fedDir)).toMatchObject({ ticker: 'VERX', loose: true });
    const received = parsed<FedSubaward>('subawards', { results: [
      SUB_ROW({ 'Sub-Award ID': '4500003477', 'Sub-Awardee Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Sub-Recipient UEI': 'H9M6J1PND9M3', 'Sub-Award Amount': 4178357.64, 'Sub-Award Date': '2025-04-29', 'Prime Recipient Name': 'VERTEX AEROSPACE LLC', 'Prime Award Recipient UEI': 'NVC1EFKKYB93', 'Prime Award ID': 'FA702225F0011', prime_award_generated_internal_id: 'CONT_AWD_FA702225F0011_9700_FA702222D0001_9700' }),
      SUB_ROW({ 'Sub-Award ID': '4502043922', 'Sub-Awardee Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Sub-Recipient UEI': 'DJUCEANK2KP4', 'Sub-Award Amount': 239794.14, 'Sub-Award Date': '2024-11-07', 'Prime Recipient Name': 'VERTEX AEROSPACE LLC', 'Prime Award Recipient UEI': 'NVC1EFKKYB93', 'Prime Award ID': 'N0001921F0094', prime_award_generated_internal_id: 'CONT_AWD_N0001921F0094_9700_N6134019D1010_9700' }),
      SUB_ROW({ 'Sub-Award ID': '1000060443', 'Sub-Awardee Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Sub-Recipient UEI': 'LCV2N9FVV739', 'Sub-Award Amount': 157065062.0, 'Sub-Award Date': '2024-11-04', 'Prime Recipient Name': 'ELECTRIC BOAT CORPORATION', 'Prime Award Recipient UEI': 'E7BEKJ4V9528', 'Prime Award ID': 'N0002417C2117', 'Sub-Award Description': 'SEE REMARKS', prime_award_generated_internal_id: 'CONT_AWD_N0002417C2117_9700_-NONE-_-NONE-' }),
      SUB_ROW({ 'Sub-Award ID': 'GD-1', 'Sub-Awardee Name': 'NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Sub-Recipient UEI': 'DJUCEANK2KP4', 'Sub-Award Amount': 11800000, 'Sub-Award Date': '2025-06-01', 'Prime Recipient Name': 'GENERAL DYNAMICS CORP', 'Prime Award Recipient UEI': 'VF58HFRNGEL8', 'Prime Award ID': 'N0002425C0001', prime_award_generated_internal_id: 'CONT_AWD_N0002425C0001_9700_-NONE-_-NONE-' }),
    ] });
    const primes = subRelations(received, 'customer', ctx, new Set(['H9M6J1PND9M3', 'DJUCEANK2KP4', 'LCV2N9FVV739']));
    const asked: string[] = [];
    const answers: Record<string, unknown> = {
      'recipients NVC1EFKKYB93': { results: [{ id: 'fb63ba18-02ee-d557-7366-681926c60e0d-P', uei: 'NVC1EFKKYB93', name: 'V2X AEROSPACE LLC', recipient_level: 'P', amount: 1666188323.99 }, { id: 'fb63ba18-02ee-d557-7366-681926c60e0d-C', uei: 'NVC1EFKKYB93', name: 'V2X AEROSPACE LLC', recipient_level: 'C', amount: 1666188323.99 }] },
      'recipients E7BEKJ4V9528': { results: [{ id: 'd5ab5f51-db3a-a26f-96a1-1b24c3e2802c-C', uei: 'E7BEKJ4V9528', name: 'ELECTRIC BOAT CORPORATION', recipient_level: 'C', amount: 12893891635.18 }, { id: 'd5ab5f51-db3a-a26f-96a1-1b24c3e2802c-P', uei: 'E7BEKJ4V9528', name: 'ELECTRIC BOAT CORPORATION', recipient_level: 'P', amount: 7555185389.43 }] },
      'profile d5ab5f51-db3a-a26f-96a1-1b24c3e2802c-C': { name: 'ELECTRIC BOAT CORPORATION', uei: 'E7BEKJ4V9528', recipient_level: 'C', parent_name: 'GENERAL DYNAMICS CORP', parent_uei: 'VF58HFRNGEL8' },
    };
    expect(federal.usaspendingRequest('profile', 'd5ab5f51-db3a-a26f-96a1-1b24c3e2802c-C')).toEqual({ method: 'GET', url: `${federal.API}/recipient/d5ab5f51-db3a-a26f-96a1-1b24c3e2802c-C/` });
    expect(federal.usaspendingRequest('profile', '../award')).toBeNull();
    const got = await resolveParties(primes, async (kind, arg) => {
      asked.push(`${kind} ${arg}`);
      const body = answers[`${kind} ${arg}`];
      return body ? { status: 200, rows: federal.parseUsaspending(kind, JSON.stringify(body))! } : { status: 404, rows: [] };
    }, ctx);
    expect(got.map((r) => [r.key, r.name, r.ticker, Math.round(r.amount!)]).sort()).toEqual([
      ['cik:1601548', 'V2X, Inc.', 'VVX', Math.round(4178357.64 + 239794.14)],
      ['cik:40533', 'GENERAL DYNAMICS CORP', 'GD', Math.round(157065062 + 11800000)],
    ]);
    // Each record still names the party as filed.
    expect(got.find((r) => r.key === 'cik:40533')!.evidence[0].sentence).toMatch(/^ELECTRIC BOAT CORPORATION subcontract to NORTHROP GRUMMAN SYSTEMS CORPORATION/);
    expect(asked).toEqual(['recipients E7BEKJ4V9528', 'profile d5ab5f51-db3a-a26f-96a1-1b24c3e2802c-C', 'recipients NVC1EFKKYB93']);
  });
});

/** What another company's statement says of the target, read as runChain reads it (the filer's initials too). */
const theirs = (target: [string, string], filer: [string, string], sentence: string) => {
  const t = targetNames(target[0], target[1]);
  const names = targetNames(filer[0], filer[1]).names.flatMap((n) => (/^[A-Z][a-z]{2,} [A-Z][a-z]{2,}$/.test(n) ? [n, n.replace(' ', '')] : [n]));
  const words = (names[0] ?? '').split(/[\s-]+/).filter((w) => /^[A-Z]/.test(w));
  return classify(sentence, targetPattern(t.names.concat(t.legal)), targetPattern(words.length >= 3 ? [...names, words.map((w) => w[0]).join('')] : names));
};
const PFE: [string, string] = ['PFE', 'PFIZER INC'];
const MRK: [string, string] = ['MRK', 'Merck & Co., Inc.'];
const LLY: [string, string] = ['LLY', 'ELI LILLY & Co'];

describe('SPLC review of 30 October 2026: statements that are no business relation', () => {
  it('reads no partner in a lawsuit against the company, nor a supplier in slides of one (PFE-5, PFE-4)', () => {
    expect(theirs(PFE, ['ABUS', 'Arbutus Biopharma Corp'], 'The Company is also consulting closely with and supporting its exclusive licensee, Genevant Sciences, to protect and defend its intellectual property, which is the subject of on-going lawsuits against Moderna and Pfizer/BioNTech for use of Arbutus\' patented LNP technology in their COVID-19 vaccines.')).toBeNull();
    expect(theirs(PFE, ['ABUS', 'Arbutus Biopharma Corp'], 'Arbutus continues to consult closely with and support its exclusive licensee, Genevant Sciences, to protect and defend Arbutus\'s intellectual property, which is the subject of on-going lawsuits against Moderna and Pfizer/BioNTech.')).toBeNull();
  });

  it('reads no rival in an antitrust indemnity, and no partner in a list of competing products, a career or a third party\'s licence (M1, M7)', () => {
    expect(theirs(MRK, ['OGN', 'Organon & Co.'], 'Subject to certain exceptions specified in the Separation and Distribution Agreement, Organon assumed liability for all pending and threatened legal matters related to products transferred from Merck to Organon in connection with the spinoff, including competition investigations resulting from enforcement activity concerning Merck\'s conduct involving Organon\'s products.')).toBeNull();
    expect(theirs(MRK, ['CBIO', 'CRESCENT BIOPHARMA, INC.'], 'In addition, we are aware of several anti-PD-(L)1/VEGF bispecific product candidates in clinical development for solid tumor indications, including, but not limited to, ivonescimab (Summit Therapeutics Inc.), pumitamig (co-developed by BioNTech SE and Bristol Myers Squibb), LM-299 (LaNova Medicines Ltd.; in-licensed by Merck), SSGJ-707 (3SBio Inc.; in-licensed by Pfizer), and CTX-10726 (Compass Therapeutics, Inc.).')).toBeNull();
    expect(theirs(MRK, ['EIKN', 'Eikon Therapeutics, Inc.'], 'Perlmutter and Baynes previously collaborated with our current Chief Business Officer, Benjamin Thorner, during their time at both Amgen and Merck to identify, evaluate, and acquire or in-license important medicines.')).toBeNull();
    expect(theirs(MRK, ['LGND', 'LIGAND PHARMACEUTICALS INC'], 'Under the terms of the Agenus Agreement, we received (i) 18.75% of the licensed royalties and 31.875% of the future licensed milestones paid to Agenus on six-partnered oncology programs, including BMS-986442 (Bristol Myers Squibb), AGEN2373 (Gilead), INCAGN2385 and INCAGN2390 (Incyte), MK-4830 (Merck), and UGN-301 (UroGen Pharma) (collectively referred as "Agenus Partnered Programs"), and (ii) a synthetic 2.625% royalty on future global net sales of Agenus\' novel immuno-oncology botensilimab in combination with balstilimab ("BOT/BAL") program, collectively subject to certain events which may adjust the royalty and milestone percentages paid to us.')).toBeNull();
    // M3: a fund's warrants, from enGene's beneficial-ownership table.
    expect(theirs(MRK, ['ENGN', 'enGene Holdings Inc.'], 'The number of enGene Warrants reported includes warrants held by Lumira III that may be exercised to acquire 114,945 Common Shares, warrants held by Lumira III Int\'l that may be exercised to acquire 3,825 Common Shares, warrants held by Lumira IV that may be exercised to acquire 38,301 Common Shares, warrants held by Lumira IV Int\'l that may be exercised to acquire 9,207 Common Shares, warrants held by Merck-Lumira that may be exercised to acquire 145,603 Common Shares, and warrants held by Merck-Lumira B that may be exercised to acquire 20,673 Common Shares.')).toBeNull();
    // Still a rival: a product the company markets through its own venture of two (Mangoceuticals's 10-K).
    expect(theirs(LLY, ['MGRX', 'MANGOCEUTICALS, INC.'], 'We mainly compete with other companies offering men\'s wellness products, including Hims & Hers Health, Inc. and Roman, and with our Mango ED products, we compete against much larger pharmaceutical companies who offer ED branded drugs like Viagra (Pfizer) and Cialis (marketed by Lilly ICOS LLC, a joint venture between Eli Lilly and Company and ICOS Corporation) and their generic forms.')).toEqual({ role: 'competitor' });
  });

  it("reads no relation in a trademark notice, a merger's boilerplate, another company's takeover or a clause on termination (GM-6, LLY-10, LLY-9, LLY-6)", () => {
    expect(theirs(['GM', 'GENERAL MOTORS CO'], ['PHIN', 'PHINIA INC.'], '(DELCO REMY is a registered trademark of General Motors LLC, licensed to PHINIA Technologies Inc.)')).toBeNull();
    expect(theirs(LLY, ['ATAI', 'AtaiBeckley Inc.'], 'the ability of each party to consummate the Merger; the closing of the Merger might be delayed or not occur at all; Lilly\'s ability to successfully integrate AtaiBeckley and execute on the continued development of AtaiBeckley\'s programs following the closing of the Merger')).toBeNull();
    expect(theirs(LLY, ['SDGR', 'Schrodinger, Inc.'], 'For example, in 2024, we received $47.6 million for the equity stake that we owned in Morphic Holding, Inc., or Morphic, one of our drug discovery collaborators and co-founded companies, in connection with Morphic\'s acquisition by Eli Lilly and Company, or Lilly, for approximately $3.2 billion.')).toBeNull();
    expect(theirs(LLY, ['SDGR', 'Schrodinger, Inc.'], 'In June 2026, in connection with the completion of Eli Lilly and Company\'s acquisition of Ajax, the Company received a cash payment of approximately $57,180, comprised of $47,180 on account of the Company\'s equity stake in Ajax and $10,000 from a collaboration milestone payment.')).toBeNull();
    expect(theirs(LLY, ['RNA', 'Atrium Therapeutics, Inc.'], 'In such event, material licenses granted to Lilly expire, and the Company and Lilly negotiate in good faith a product reversion to Avidity.')).toBeNull();
  });

  it("reads Bristol-Myers's alliance with Pfizer as a partnership, and Hess Midstream's risk factors as no relation (PFE-9, CVX-3, CVX-4)", () => {
    expect(theirs(PFE, ['BMY', 'BRISTOL MYERS SQUIBB CO'], 'BMS and Pfizer manufacture the product in the alliance and BMS is the principal in the end customer product sales in the U.S., significant countries in Europe, as well as Canada, Australia, China, Japan and South Korea.')).toEqual({ role: 'partner' });
    const cvx: [string, string] = ['CVX', 'CHEVRON CORP'];
    expect(theirs(cvx, ['HESM', 'Hess Midstream LP'], 'Cyberattacks and events affecting our operational technology networks or other digital infrastructure and artificial intelligence technologies by us, Chevron or our business partners may materially impact our business and operations.')).toBeNull();
    expect(theirs(cvx, ['HESM', 'Hess Midstream LP'], 'If Chevron\'s production volumes decrease or if Chevron\'s customers reduce their purchases of crude oil, natural gas or NGLs from Chevron due to the increased availability of less expensive products from other suppliers or for other reasons, Chevron may meet only the minimum volume commitments of our commercial agreements (or pay the shortfall fee if it does not meet the minimum volume), which could cause a material decrease in our revenues.')).toBeNull();
  });

  it("reads no rival in a venture of several automakers, and no customer in a waiver under an asset purchase (GM-4, X4)", () => {
    expect(theirs(['GM', 'GENERAL MOTORS CO'], ['AETN', 'SHOREPOWER TECHNOLOGIES INC.'], 'We face competition from other EV charging companies, including ChargePoint, ABB, Cyber Switching, Siemens, Tesla, EVBox, BP, Shell, Hyundai, Electrify America, EVGo, the recently announced joint venture among BMW, General Motors, Honda, Hyundai, Kia, Mercedes-Benz and Stellantis and others.')).toBeNull();
    expect(theirs(['XOM', 'EXXON MOBIL CORP'], ['SOC', 'Sable Offshore Corp.'], 'Additionally, in connection with the Third Amendment, the Company obtained a limited waiver (the "Limited Waiver") from Exxon and Mobil Pacific Pipeline Company under the Sable-EM Purchase Agreement, which defers the Company\'s obligation to provide plugging and abandonment financial security under Section 11.18(c) of the Sable-EM Purchase Agreement until the earlier of (i) December 22, 2028, (ii) the date on which the new money secured financing to be entered into prior to the maturity date of Term Loan B for the primary purposes of refinancing the Senior Secured Term Loan is redeemed, repaid or otherwise refinanced, or (iii) the occurrence of an event of default.')).toBeNull();
  });

  it("takes no supplier from parts a recall names (GM-8), and cuts a long statement between words", () => {
    const gm = { cik: 1467858, names: targetNames('GM', 'GENERAL MOTORS CO').names, ticker: 'GM' };
    const got = ownRelations(['ARC Matters In May 2023, we initiated a voluntary recall covering nearly one million 2014-2017 model year Buick Enclave, Chevrolet Traverse, and GMC Acadia SUVs equipped with driver front airbag inflators manufactured by ARC Automotive, Inc. (ARC), and accrued an insignificant amount for the expected costs of the recall.'], dir, gm, { filer: 'General Motors Co', form: '10-K', date: '2026-01-27', path: '1467858/000146785826000013/gm-20251231.htm' });
    expect(got.filter((r) => r.role === 'supplier')).toEqual([]);
    // LLY-10: the statement from AtaiBeckley's 8-K of 16 July 2026 (ef20078103_ex99-1.htm) began "ry clearances for the Merger".
    const long = "These risks and uncertainties include, but are not limited to: the possibility that AtaiBeckley's shareholders may not approve the adoption of the Merger agreement; AtaiBeckley's receipt of any competing offers or acquisition proposals; a failure to (or delay in) receiving the required regulatory clearances for the Merger; a condition to closing of the Merger may not be satisfied (or waived); the ability of each party to consummate the Merger; the closing of the Merger might be delayed or not occur at all; the diversion of management time and attention from ongoing business operations and opportunities; the response of competitors to the Merger; the effect of the Merger and the public announcement of the Merger on AtaiBeckley's operations and its relationships with its suppliers, business partners, management and employees, including its ability to attract and retain key personnel; Lilly's ability to successfully integrate AtaiBeckley and execute on the continued development of AtaiBeckley's programs following the closing of the Merger; that all or any of the potential milestone payments pursuant to the CVRs will become payable on the terms described herein or at all; the outcome of any legal proceedings that could be instituted against the parties to the Merger; the risks inherent in drug research, development and commercialization; disruption in AtaiBeckley's plans and operations attributable to the Merger; changes in AtaiBeckley's business during the period between announcement and closing of the Merger; Lilly's evaluation of the accounting treatment of the potential acquisition and its potential impact on its financial results and financial guidance; the effects of the Merger (or the announcement thereof) on AtaiBeckley's stock price; relationships with key third parties or governmental entities; regulatory changes and developments; and the impact of global macroeconomic conditions, including trade and other global disputes and interruptions, including related to tariffs, trade protection measures, and similar restrictions.";
    const [cut] = main.mentionSentences(long, ['Lilly']);
    expect(cut.length).toBeLessThanOrEqual(1200);
    expect(long.includes(` ${cut}`)).toBe(true);
    expect(cut).toContain("Lilly's ability to successfully integrate AtaiBeckley");
    expect(classify(cut, targetPattern(targetNames('LLY', 'ELI LILLY & Co').names))).toBeNull();
  });
});

const XOM: [string, string] = ['XOM', 'EXXON MOBIL CORP'];
const FORD: [string, string] = ['F', 'FORD MOTOR CO'];

describe("SPLC review of 30 October 2026: shares", () => {
  it("gives ExxonMobil its own figure in a list written partly without the sign (X2)", () => {
    expect(theirs(XOM, ['MNTK', 'Montauk Renewables, Inc.'], 'In 2024, RIN sales to Valero, GE Warren, ExxonMobil and Mercuria represented approximately 17.6%, 15.7%, 13.8 and 11.8%, respectively, of our operating revenue.')).toMatchObject({ role: 'supplier', share: 13.8 });
  });

  it("keeps the line of revenue a share is of (X3): Matador's 13% is of its oil, natural gas and NGL revenues", () => {
    const matador = 'For the years ended December 31, 2025, 2024 and 2023, three significant purchasers accounted for 72%, 79% and 76%, respectively, of the Company\'s total oil, natural gas and NGL revenues: Plains Marketing, L.P. (49%, 53% and 42%, respectively), Exxon Mobil Corporation (13%, 15% and 24%, respectively) and Enterprise Products Partners L.P. (10%, 11% and 10%, respectively).';
    expect(theirs(XOM, ['MTDR', 'Matador Resources Co'], matador)).toMatchObject({ role: 'supplier', share: 13, basis: 'their-revenue' });
    expect(revenueLine(matador)).toBe('oil, natural gas and NGL');
    const ev = { sentence: matador, filer: 'Matador Resources Co', form: '10-K', date: '2026-02-26', path: '1520006/000152000626000002/mtdr-20251231.htm' };
    expect(shareObservation({ key: 'cik:1520006', name: 'Matador', role: 'supplier', side: 'theirs', share: 13, basis: 'their-revenue', evidence: [ev] }, ev)).toMatchObject({ denominator: 'line-revenue', line: 'oil, natural gas and NGL', period: 'Year to Dec 2025' });
    // "of our operating revenue" is the whole of Montauk's.
    expect(revenueLine('In 2025, RIN sales to Valero and ExxonMobil represented approximately 17.4% and 11.3%, respectively, of our operating revenue.')).toBeUndefined();
  });

  it("takes no share of a market, of a generic's own sales, or of a product line sold to many makers (PFE-2, PFE-3, PFE-4, F-1)", () => {
    expect(theirs(PFE, ['PCVX', 'Vaxcyte, Inc.'], 'The Prevnar franchise from Pfizer Inc. ("Pfizer") comprised of Prevnar 13 ("PCV13") and PCV20, was among the highest selling non-COVID vaccine products in the world in 2024, accounting for approximately 12% of global non-COVID vaccine sales.')?.share).toBeUndefined();
    expect(theirs(PFE, ['ROIV', 'Roivant Sciences Ltd.'], '150 mRNA COVID-19 Vaccines from Moderna and Pfizer/BioNTech Have Generated Over $145BN in Revenue Revenue as of 9/30/2025 Data and sales calculated from Evaluate and company docs from MRNA, PFE, and BNTX Total SpikeVax Sales account for ~1/3 of mRNA vaccine sales to date; Comirnaty sales account for remaining ~2/3 US SpikeVax Sales make up ~10% of global COVID-mRNA vaccine sales to date Genevant/ABUS continue to pursue recovery against Pfizer and BioNTech in the US, as well as against Moderna in the US and in several other major markets')).toBeNull();
    expect(theirs(PFE, ['NDOI', 'Endo, Inc.'], 'For the three months ended March 31, 2023, Varenicline tablets (Endo\'s generic version of Pfizer Inc.\'s Chantix®), which launched in September 2021, made up 15% of consolidated total revenues.')).toEqual({ role: 'competitor' });
    expect(theirs(LLY, ['HALO', 'HALOZYME THERAPEUTICS, INC.'], 'In 2020, Teva launched Teriparatide Injection, the generic version of Lilly\'s branded product Forsteo® featuring our multi-dose pen platform, for commercial sale in several countries outside of the U.S. In November 2023, Teva announced FDA approval of the generic version of Forteo, featuring our multi-dose auto-injector pen platform for the treatment of osteoporosis among certain women and men.')?.role).not.toBe('competitor');
    const superior = theirs(FORD, ['SUP', 'SUPERIOR INDUSTRIES INTERNATIONAL INC'], 'Our OEM aluminum wheels accounted for approximately 92% of our sales in 2024 and were primarily sold for factory installation on vehicle models manufactured by BMW (including Mini), Ford, GM, Jaguar-Land Rover, Lucid Motors, Mazda, Mitsubishi, Nissan, Peugeot, Renault, Stellantis, Subaru, Suzuki, Toyota, VW Group (Volkswagen, Audi, Skoda, Porsche), and Volvo.');
    expect(superior?.role).toBe('supplier');
    expect(superior?.share).toBeUndefined();
  });

  it('reads shares stated beside a group figure or with the basis first (GM-5, F-2)', () => {
    expect(theirs(['GM', 'GENERAL MOTORS CO'], ['PHIN', 'PHINIA INC.'], 'For the year ended December 31, 2025, our top five customers accounted for approximately 37% of our net sales, with General Motors Company representing 18%.')).toMatchObject({ role: 'supplier', share: 18, basis: 'their-revenue' });
    expect(theirs(FORD, ['DAN', 'DANA INC'], 'As a percentage of total sales from operations, our sales to Ford were approximately 32% in 2025, 31% in 2024 and 28% in 2023.')).toMatchObject({ role: 'supplier', share: 32, basis: 'their-revenue' });
  });

  it("labels a part year as such and shows the year's share before it (F-3)", () => {
    const half = 'Sales to Ford were approximately 11% of our consolidated net sales for the first six months of 2026, and 15% for both the first six months of 2025 and the full year 2025.';
    expect(sharePeriod(half)).toBe('6M of 2026');
    const year = 'Sales to Ford were approximately 15% of our consolidated net sales in 2025, 13% in 2024, and 12% in 2023.';
    const dauch = (sentence: string, date: string, share: number): Relation => enrichRelation({ key: 'cik:1062231', name: 'Dauch Corp', ticker: 'DCH', cik: 1062231, role: 'supplier', side: 'theirs', share, basis: 'their-revenue', evidence: [{ sentence, filer: 'Dauch Corp', form: date > '2026-03' ? '10-Q' : '10-K', date, path: `1062231/${date}/dch.htm` }] });
    const chain: Chain = { state: 'ok', filers: [], changes: {}, relations: appendRelationshipHistory([], [dauch(year, '2026-02-13', 15), dauch(half, '2026-08-07', 11)]) };
    const [shown] = relationshipView(chain, 'current');
    expect([shown.share, sharePeriod(shown.evidence[0].sentence)]).toEqual([15, '2025']);
  });
});

describe('SPLC review of 30 October 2026: who supplies whom', () => {
  it("reads Lilly as the holder of Scribe's note and BioAge's supplier, and IPO underwriting text as no trade (LLY-1 to LLY-5)", () => {
    expect(theirs(LLY, ['SCTX', 'Scribe Therapeutics, Inc.'], 'Interest expense consists of coupon interest accrued on the convertible note that we issued to Eli Lilly and Company in May 2023.')).toEqual({ role: 'investment' });
    expect(theirs(LLY, ['BIOA', 'BioAge Labs, Inc.'], 'For example, we entered into a material transfer agreement with Lilly, under which Lilly has agreed to manufacture and supply us with a certain quantity (which may be increased by mutual consent) of tirzepatide so we can sponsor a clinical trial in which azelaprag and tirzepatide are co-administered concomitantly or sequentially.')).toEqual({ role: 'customer' });
    expect(theirs(LLY, ['TRXB', 'TRex Bio, Inc.'], 'The underwriters will receive the same underwriting discounts and commissions on any of our shares of common stock purchased by Lilly as it will from any other shares of common stock sold to the public in this offering.')).toBeNull();
    expect(theirs(LLY, ['MANE', 'Veradermics, Inc'], 'The underwriters will receive the same underwriting discounts and commissions on any of our shares of common stock purchased by Eli Lilly as it will from any other shares of common stock sold to the public in this offering.')).toBeNull();
    expect(theirs(LLY, ['MANE', 'Veradermics, Inc'], 'If Eli Lilly or the cornerstone investor is allocated all or a portion of the shares it has indicated an interest in purchasing in this offering or more, and purchases any such shares, such purchases could reduce the available public float for our shares of common stock if Eli Lilly or the cornerstone investor holds such shares long-term.')).toBeNull();
  });

  it('reads Cerence and AYRO as suppliers to GM and Air Industries as a supplier to Northrop (GM-2, GM-3, NOC finding 3)', () => {
    const GMT: [string, string] = ['GM', 'GENERAL MOTORS CO'];
    expect(theirs(GMT, ['CRNC', 'Cerence Inc.'], 'Our automobile manufacturer customers, commonly referred to as OEMs, include BMW, Mercedes-Benz, the Volkswagen Group (Volkswagen, Audi, Porsche, and other brands), Stellantis, Renault, Toyota, Ford, General Motors, BYD, Great Wall Motor, NIO, and many others and represented approximately 50% of our revenue in fiscal year 2025.')?.role).toBe('supplier');
    expect(theirs(GMT, ['AYRO', 'AYRO, Inc.'], 'In December 2024, the Company was named a tier one supplier for General Motors (GM) through its partnership with GLV and has secured its first purchase order from one of the top three automotive manufacturers in the United States.')).toEqual({ role: 'supplier' });
    expect(theirs(['NOC', 'NORTHROP GRUMMAN CORP /DE/'], ['AIRI', 'AIR INDUSTRIES GROUP'], "Air Industries Group's relationship with Northrop Grumman began decades ago as a supplier to a predecessor, the Grumman Aerospace Corporation which was located just a few miles from our Bay Shore facility.")).toEqual({ role: 'supplier' });
  });

  it("reads Microsoft as Chevron's customer for the power Chevron provides (CVX-1)", () => {
    const cvx = { cik: 93410, names: targetNames('CVX', 'CHEVRON CORP').names, ticker: 'CVX' };
    const got = ownRelations(['During the quarter, Chevron signed a 20-year power purchase agreement with Microsoft to provide 2.67 gigawatts of behind-the-meter power for its data center in West Texas.'], buildDirectory([{ cik: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' }]), cvx, { filer: 'CHEVRON CORP', form: '8-K', date: '2026-07-31', path: '93410/000009341026000162/a06302026ex9918-k.htm', type: 'EX-99.1' });
    expect(got.map((r) => [r.role, r.ticker])).toEqual([['customer', 'MSFT']]);
  });
});

describe('SPLC review of 30 October 2026: which Merck', () => {
  // Recursion's 10-K of 2026-02-25 and Vera's of 2026-02-26 (finding M6), as the app reads their sentences naming Merck.
  const recursion = [
    'Merck KGaA (Darmstadt, Germany)',
    'In September 2023, we entered into a collaboration with Merck KGaA, Darmstadt, Germany.',
    'In September 2023, the Company and Merck entered into a collaboration agreement to discover novel small molecule drug candidates across oncology, neuroinflammation and immunology.',
    "The collaboration utilizes the Company's AI platform and the Company is performing drug design and discovery while Merck will be assuming responsibility for the preclinical and clinical development.",
  ];
  const vera = [
    'If we breach our license agreement with Ares Trading S.A., an affiliate of Merck KGaA, Darmstadt, Germany, related to atacicept, the license agreement with Novartis International Pharmaceutical AG related to MAU868, or the license agreement with the Board of Trustees of Leland Stanford Junior University related to VT-109, we could lose the ability to continue the development and commercialization of atacicept, MAU868, or VT-109, respectively.',
    'It was advanced by Merck KGaA (Merck), Darmstadt, Germany, in clinical trials for several autoimmune diseases, including rheumatoid arthritis (RA), multiple sclerosis, SLE, and IgAN.',
    'On October 29, 2020, we entered into the Ares Agreement with Ares, an affiliate of Merck, pursuant to which Ares granted us an exclusive worldwide license to certain patents and related know-how to research, develop, manufacture, use and commercialize therapeutic products containing atacicept or any other compound that is covered by a claim of such licensed patents.',
    'If we breach our license agreement with Ares, an affiliate of Merck related to atacicept, the license agreement with Novartis related to MAU868, or the license agreement with Stanford related to VT-109, we could lose the ability to continue the development and commercialization of atacicept, MAU868, or VT-109, respectively.',
  ];
  // Lumos's 10-Q of 2024-11-07 names Merck Serono once, among rival products; its Merck is Merck & Co.
  const lumos = [
    'There are a variety of currently marketed rhGH therapies administered by daily subcutaneous injection and used for the treatment of GHD, principally Norditropin® (Novo Nordisk A/S ("Novo Nordisk")), Humatrope® (Eli Lilly and Company), Nutropin-AQ® (F. Hoffman-La Roche Ltd./Genentech, Inc.), Genotropin® (Pfizer Inc.), Saizen® (Merck Serono S.A.), Tev-tropin® (Teva Pharmaceuticals Industries Ltd.), Omnitrope® (Sandoz GmbH), Valtropin® (LG Life Science and Biopartners GmbH) and Zomacton® (Ferring Pharmaceuticals, Inc.), as well as therapies administered by weekly subcutaneous injection by Skytrofa® (Ascendis Pharma), Ngenla® (OPKO Health, Inc. in collaboration with Pfizer Inc.) and Sogroya® (Novo Nordisk, Inc.).',
    'Under the Lumos Merck Agreement, Lumos will be required to pay Merck substantial development milestone payments for achievement of specified milestones relating to each of the first and second indications.',
  ];
  // Gauzy's 20-F of 2025-03-11 (finding M2): a maker of liquid-crystal chemicals, which Merck & Co. is not.
  const gauzy = 'Our light control technologies and products compete principally with products from electrochromic glass manufacturers such as View Inc. and Sage (owned by Saint-Gobain Glass) as well as a select group of chemicals suppliers who range from large traditional companies such as Merck and Gentex to a few small suppliers primarily located in Asia.';
  const companies: SecCompany[] = [
    ...SEC,
    { cik: 1601830, ticker: 'RXRX', title: 'Recursion Pharmaceuticals, Inc.' },
    { cik: 1831828, ticker: 'VERA', title: 'Vera Therapeutics, Inc.' },
    { cik: 1781446, ticker: 'GAUZ', title: 'Gauzy Ltd.' },
  ];
  const hit = (cik: number, name: string, ticker: string, form: string, date: string, path: string): FtsHit => ({ cik, name, tickers: ticker ? [ticker] : [], form, date, path, score: 1, type: form });
  const hits = [
    hit(1601830, 'RECURSION PHARMACEUTICALS, INC.', 'RXRX', '10-K', '2026-02-25', '1601830/000160183026000039/rxrx-20251231.htm'),
    hit(1831828, 'Vera Therapeutics, Inc.', 'VERA', '10-K', '2026-02-26', '1831828/000119312526077442/vera-20251231.htm'),
    hit(1126234, 'LUMOS PHARMA, INC.', '', '10-Q', '2024-11-07', '1126234/000112623424000097/nlnk-20240930.htm'),
    hit(1781446, 'Gauzy Ltd.', 'GAUZ', '20-F', '2025-03-11', '1781446/000121390025022437/ea0233167-20f_gauzy.htm'),
  ];
  const text: Record<string, string[]> = { 1601830: recursion, 1831828: vera, 1126234: lumos, 1781446: [gauzy] };

  it("reads a filing's bare \"Merck\" as Merck KGaA when it names only Merck KGaA, and once is not enough (M2, M6)", async () => {
    const names = targetNames('MRK', 'Merck & Co., Inc.');
    expect(speaksOfNamesake(recursion, names)).toBe(true);
    expect(speaksOfNamesake(vera, names)).toBe(true);
    expect(speaksOfNamesake(lumos, names)).toBe(false);
    // C4's 10-K of 2026-02-26 names both, and "Merck Sharp & Dohme" marks Merck & Co.
    expect(speaksOfNamesake([...recursion, 'On December 11, 2023, the Company and Merck Sharp & Dohme, LLC, or Merck, entered into an exclusive license and collaboration agreement, or the Merck Agreement, to develop degrader-antibody conjugates, or DACs, an emerging modality designed to selectively target and neutralize disease-causing proteins in cancer cells.'], names)).toBe(false);
    expect(speaksOfNamesake(recursion, targetNames('PFE', 'PFIZER INC'))).toBe(false);

    const io: ChainIO = {
      companies: async () => companies,
      filings: async () => [],
      fts: async (arg) => (arg === '|Merck|reports' ? { hits, total: hits.length } : { hits: [], total: 0 }),
      text: async (kind, path) => (kind === 'mentions' ? text[path.split('/')[0]] ?? [] : []),
      securities: [],
    };
    let chain: Chain = { state: 'loading', filers: [], relations: [], changes: {} };
    await runChain({ ticker: 'MRK', name: 'Merck & Co., Inc.' }, io, (f) => { chain = f(chain); });
    const shown = relationshipView(chain, 'history').map((r) => [r.role, r.key]);
    expect(shown).toEqual([['partner', 'cik:1126234']]);
  });
});
