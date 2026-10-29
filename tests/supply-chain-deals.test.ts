import { describe, expect, it } from 'vitest';
import {
  buildDirectory, classify, currentDocs, dealClause, definesOther, findCompanies, mergeRelations, ownRelations, ownStatements, rankFilers, runChain, searchNames,
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

describe('SPLC: the period of a share', () => {
  it('reads the quarter, fiscal year or months a share is stated for', async () => {
    const { sharePeriod } = await import('../src/data/live/supply-chain');
    expect(sharePeriod('For the second quarter of fiscal year 2027, one direct customer represented 16% of total revenue.')).toBe('Q2 FY2027');
    expect(sharePeriod('For fiscal year 2026, sales to one direct customer represented 22% of total revenue.')).toBe('FY2026');
    expect(sharePeriod('For the three months ended August 31, 2026, CoreWeave accounted for 62% of revenue.')).toBe('3M to Aug 2026');
    // Emerson Radio's 10-Q of 14 November 2025 gives Costco's share for one quarter, not for 2025.
    expect(sharePeriod('For the three month period ended September 30, 2025, the Company\'s three largest customers accounted for approximately 77% of the Company\'s net revenues, of which Amazon accounted for approximately 56%, Costco accounted for approximately 11% and Variety accounted for approximately 10%.')).toBe('3M to Sep 2025');
    expect(sharePeriod('For the six-month period ended June 30, 2026, Walmart accounted for 21% of net sales.')).toBe('6M to Jun 2026');
    expect(sharePeriod('For the years ended December 31, 2025 and 2024, Microsoft accounted for 71% and 62% of revenue.')).toBe('Year to Dec 2025');
    expect(sharePeriod('During 2025, Apple accounted for 18% of net sales.')).toBe('2025');
    expect(sharePeriod('Apple accounted for 18% of net sales.')).toBe('');
  });
});

describe('SPLC: what the accuracy review found', () => {
  const T = (names: string[]) => targetPattern(names);
  const MSFT = T(['Microsoft', 'Microsoft Corporation']);
  const BA = T(['Boeing', 'The Boeing Company']);

  it('keeps a share to the company it is stated for, never a group figure', () => {
    expect(classify('Sales to our five largest customers during the fiscal year ended March 31, 2026, accounted for 80.6% of our net revenue, with Apple, Sony, Google, and Microsoft each accounting for more than 10.0% of our net revenue.', MSFT)).toEqual({ role: 'supplier', share: 10, qualifier: '>', basis: 'their-revenue' });
    // 13% is sales to Boeing together with its subcontractors: no share for Boeing alone, and never Airbus's 39%.
    expect(classify('For the years ended December 31, 2025 and December 31, 2024, approximately 39% and 40% of our total consolidated sales, respectively, were to Airbus, and its related subcontractors and approximately 13% and 15% of our total consolidated sales, respectively, were to Boeing and its related subcontractors.', BA)).toMatchObject({ role: 'supplier', share: undefined });
    expect(classify('Revenues from our top 10 customers, including Boeing and RTX, were 61% of total net revenues during 2025.', BA)).toEqual({ role: 'supplier', share: undefined, qualifier: undefined, basis: 'their-revenue' });
    expect(classify("In the past, we derived most of our revenue from the sale of products made for consoles manufactured by third parties, such as Sony Interactive Entertainment Inc.'s PlayStation and Microsoft Corporation's (\"Microsoft\") Xbox consoles, which comprised approximately 2% and 45% of our total revenue for the years ended December 31, 2025 and 2024, respectively.", MSFT)?.share).toBeUndefined();
    expect(classify('In 2025, our sales volume represented approximately 12.3% of the total sales volume of the Coca-Cola system in the world.', T(['Coca-Cola']))?.share).toBeUndefined();
  });

  it('reads who sells to whom', () => {
    const CRWV = T(['CoreWeave']);
    expect(classify('We currently depend on a single customer, CoreWeave, for substantially all of our hosting revenue.', CRWV)?.role).toBe('supplier');
    expect(classify('Air Lease was the launch customer for Boeing on several aircraft programs.', BA, targetPattern(['Air Lease']))?.role).toBe('customer');
    expect(classify('In September 2026, we received a purchase order from Boeing for our sensor systems.', BA)?.role).toBe('supplier');
    expect(classify('Our products are sold through retail partners, including Walmart, Target and Amazon.', T(['Walmart']))?.role).toBe('supplier');
    expect(classify('Our largest manufacturing partners, ASE, Intel and TSMC, produce our wafers.', T(['Intel']))?.role).toBe('customer');
    expect(classify('In 2024, we entered into a Supply Agreement with Intel Corporation for the purchase of chips for our miners.', T(['Intel']))?.role).not.toBe('supplier');
  });

  it('reads licences and research collaborations as partnerships', () => {
    expect(classify('Lilly granted us an exclusive worldwide license to develop the compound, and we pay Lilly royalties on net sales.', T(['Lilly', 'Eli Lilly']))?.role).toBe('partner');
  });

  it('leaves out negations, hedges, takeovers, biographies and third parties', () => {
    const apple = T(['Apple']);
    expect(classify('We do not compete directly with Apple in the market for refurbished devices.', apple)).toBeNull();
    expect(classify('Publicly traded competitors may include companies like Core Scientific and Applied Digital.', APLD)).toBeNull();
    expect(classify('Pursuant to the Merger Agreement, Merger Sub will merge with and into the Company, with the Company surviving as a wholly owned subsidiary of Eli Lilly.', T(['Eli Lilly']))).toBeNull();
    expect(classify('He served in senior finance roles for Boeing Commercial Airplanes before joining us.', BA)).toBeNull();
    expect(classify("Pegatron's customers include Tesla, Apple and Microsoft.", T(['Tesla']))).toBeNull();
    expect(classify('Apple iSports Group operates a sports betting platform.', apple)).toBeNull();
    expect(classify('The termination of our partnership with Walmart in 2024 reduced our revenue.', T(['Walmart']))).toBeNull();
  });

  it("knows names that also mean something else", () => {
    expect(new RegExp(targetNames('AMD', 'ADVANCED MICRO DEVICES INC').exclude!).test('a gene therapy for wet AMD')).toBe(true);
    expect(new RegExp(targetNames('TSLA', 'Tesla, Inc.').exclude!).test('Ericsson Nikola Tesla d.d.')).toBe(true);
    expect(new RegExp(targetNames('F', 'FORD MOTOR CO').exclude!).test('our acreage in the Eagle Ford shale')).toBe(true);
    expect(new RegExp(targetNames('F', 'FORD MOTOR CO').exclude!).test('The Ford Motor Company is our largest customer')).toBe(false);
  });

  it("reads the company's own top customer share and leaves others' suppliers out", () => {
    const crwv = buildDirectory([...COMPANIES, { cik: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' }]);
    const own = ownRelations(
      [
        'We recognized an aggregate of approximately 67% of our revenue from our top customer, Microsoft, for the year ended December 31, 2025.',
        'For example, NVIDIA relies on suppliers such as Taiwan Semiconductor Manufacturing Company for semiconductor fabrication.',
        'In addition, global clients often rely on ESG rating systems for bids and buying practices.',
      ],
      crwv,
      { cik: 1769628, names: ['CoreWeave'] },
      ev,
    );
    expect(own.map((r) => [r.role, r.name, r.share])).toEqual([['customer', 'Microsoft', 67]]);
  });
});

describe('SPLC: shares as companies state them', () => {
  const share = (sentence: string, names: string[]) => {
    const c = classify(sentence, targetPattern(names));
    return c ? [c.role, c.share, c.basis] : null;
  };
  it('reads each company\'s figure in a list, the latest year, and figures given per year', () => {
    expect(share('In the fiscal year ended September 30, 2025, our three largest customers, Lockheed Martin, Pilatus, and Boeing accounted for 36%, 8% and 5% of total revenue, respectively.', ['Boeing'])).toEqual(['supplier', 5, 'their-revenue']);
    expect(share('In fiscal 2026, our three largest customers, General Motors Company, Ford Motor Company and Stellantis, accounted for 27%, 21% and 16%, respectively, of our annual sales.', ['Ford Motor', 'Ford'])).toEqual(['supplier', 21, 'their-revenue']);
    expect(share('The loss of any large customer, such as Shell Trading (US) Company, Exxon Mobil Corporation and Chevron Corporation, which represent 35%, 23% and 12% of our oil, natural gas and NGL revenues for the year ended December 31, 2025, respectively, could have a material adverse effect on our business.', ['ExxonMobil', 'Exxon Mobil', 'Exxon'])).toEqual(['supplier', 23, 'their-revenue']);
    expect(share("For the three month period ended September 30, 2025, the Company's three largest customers accounted for approximately 77% of the Company's net revenues, of which Amazon accounted for approximately 56%, Costco accounted for approximately 11% and Variety accounted for approximately 10%.", ['Costco'])).toEqual(['supplier', 11, 'their-revenue']);
    expect(share('In 2025, our largest distributor by net sales accounted for less than 10% of our net sales and our largest customers, Walmart and Costco, accounted for 25% and 10% of our net sales, respectively.', ['Costco'])).toEqual(['supplier', 10, 'their-revenue']);
    expect(share('Our largest customer, Walmart Inc., represented approximately 16% in 2025 and 2024 and 15% in 2023 of our net sales from continuing operations.', ['Walmart'])).toEqual(['supplier', 16, 'their-revenue']);
    expect(share('Walmart Inc., including its subsidiary Sam\'s West, Inc. (collectively "Walmart"), is a customer of our Packaged Meats and Fresh Pork segments and accounted for approximately 15%, 16% and 15% of our consolidated sales in fiscal years 2025, 2024 and 2023, respectively.', ['Walmart'])).toEqual(['supplier', 15, 'their-revenue']);
    expect(share('Our two largest customers are Target® and Walmart®, which accounted for 26.6% and 26.1%, respectively, of our net sales in 2025.', ['Walmart'])).toEqual(['supplier', 26.1, 'their-revenue']);
    expect(share('Walmart Inc. and its affiliates together accounted for approximately 13% and 18% of our consolidated net sales for the fiscal years ended June 30, 2026 and 2025, respectively.', ['Walmart'])).toEqual(['supplier', 13, 'their-revenue']);
    expect(share('Walmart Inc. and subsidiaries ("Walmart"), the Company\'s second largest customer in 2025, accounted for approximately 13%, 14% and 15% of net sales in 2025, 2024 and 2023, respectively.', ['Walmart'])).toEqual(['supplier', 13, 'their-revenue']);
    expect(share('Our direct sales to Sony and Microsoft represented approximately 39 percent and 16 percent of total net revenue, respectively, in fiscal year 2026.', ['Microsoft'])).toEqual(['supplier', 16, 'their-revenue']);
    expect(share("During fiscal 2025, we purchased merchandise from approximately 1,500 vendors, with Nike, our largest vendor, representing approximately 31% of our consolidated merchandise purchases within the DICK'S and Foot Locker Businesses.", ['Nike'])).toEqual(['customer', 31, 'their-purchases']);
  });
});

describe('SPLC: what the second review found', () => {
  const T = (names: string[]) => targetPattern(names);
  const role = (sentence: string, names: string[], filer?: string[]) => classify(sentence, T(names), filer ? T(filer) : undefined)?.role ?? null;

  it('reads clinical supply, licences and accounting "customers" in pharma as partnerships', () => {
    expect(role('In 2024, we entered into a Clinical Trial Collaboration and Supply Agreement with Pfizer to evaluate our candidate with its drug.', ['Pfizer'])).toBe('partner');
    expect(role('In 2025, we received from Pfizer an exclusive U.S. license to the compound.', ['Pfizer'])).toBe('partner');
    expect(role('We concluded that Lilly is a customer for purposes of the research services.', ['Lilly', 'Eli Lilly'])).toBe('partner');
  });

  it('reads retail partnerships as sales through the retailer, and partnering to deploy as buying', () => {
    expect(role('Our Costco partnership continues to accelerate, with our products now in over 450 clubs.', ['Costco'])).toBe('supplier');
    expect(role('We are partnering with Palantir to deploy Palantir\'s Foundry platform across our plants.', ['Palantir'])).toBe('customer');
  });

  it('leaves out market talk, equity, asset deals, notices and technical fits', () => {
    expect(role('We face fierce competition from major GPU vendors such as NVIDIA and AMD.', ['AMD'])).toBe('competitor');
    expect(role('The market sees fierce competition from major GPU vendors such as NVIDIA and AMD.', ['AMD'])).toBeNull();
    expect(role('In 2026, we agreed to issue and sell 215 million shares of our common stock to NVIDIA.', ['NVIDIA'], ['Intel'])).toBe('investment');
    expect(role('In 2025, we sold a 40% undivided interest in the pipeline to ExxonMobil.', ['ExxonMobil'])).toBeNull();
    expect(role('We agreed to provide calendar quarter updates to Pfizer on the program.', ['Pfizer'])).toBeNull();
    expect(role("Surf Air Mobility's platform, powered by Palantir, will support our operations.", ['Palantir'])).toBeNull();
    expect(role('Our sales to subtier suppliers of GE Aerospace were 39.3% of net sales.', ['GE Aerospace'])).toBeNull();
    expect(role('Your competitors that primarily source engines from Caterpillar have higher costs.', ['Caterpillar'])).toBeNull();
    expect(role('In 2025, we issued a warrant to Walmart to purchase shares of our common stock.', ['Walmart'])).not.toBe('investment');
  });

  it('reads competitor lists of the filer and suppliers to the company', () => {
    expect(role('Competitors of our retail assets include large chains such as Exxon and Chevron.', ['Exxon'])).toBe('competitor');
    expect(role('We are a supplier of mission critical systems to major OEMs including Boeing and Airbus.', ['Boeing'])).toBe('supplier');
  });

  it('reads dependence by what it is for', () => {
    expect(role('We are highly dependent on NVIDIA for our success.', ['NVIDIA'])).toBe('supplier');
    // The success of a project of the filer's gives no direction.
    expect(role('We are highly dependent on NVIDIA for the success of our campus.', ['NVIDIA'])).toBeNull();
    expect(role('We rely on Micron for the memory in our modules.', ['Micron'])).toBe('customer');
    expect(role('Our business is highly dependent on Ford.', ['Ford'])).toBeNull();
  });
});

describe('SPLC: what the third review found', () => {
  const T = (names: string[]) => targetPattern(names);
  const role = (sentence: string, names: string[]) => classify(sentence, T(names))?.role ?? null;

  it('reads who acts for whom', () => {
    expect(role('Lilly manufactures and distributes Adcirca on our behalf.', ['Lilly'])).toBe('customer');
    expect(role('Under the agreement, Microsoft has committed to pay the Group approximately $17.4 billion over five years.', ['Microsoft'])).toBe('supplier');
    expect(role('Our accelerators are being deployed by leading cloud providers including Oracle and Microsoft.', ['Oracle'])).toBe('supplier');
    expect(role('Upon transfer of the license to Pfizer, we recognized revenue.', ['Pfizer'])).toBe('partner');
  });

  it('leaves out plans, exhibits, other parties\' ventures, generic lists and contracts without a direction', () => {
    expect(role('We plan to rely on another major supplier, AMD, for future GPUs.', ['AMD'])).toBeNull();
    expect(role('Changzhou Almaden Co., Ltd. (we refer to it as "AMD") supplied 95% of our panels in 2019.', ['AMD'])).toBeNull();
    expect(role('Master Supply Agreement with Microsoft Corporation (incorporated by reference to Exhibit 10.1 to our Form 8-K).', ['Microsoft'])).toBeNull();
    expect(role('Customers can choose cloud providers, such as Microsoft, Amazon and Google, to host the software.', ['Microsoft'])).toBeNull();
    expect(role('Azule is a joint venture between BP and Eni, and ExxonMobil is our other major client.', ['ExxonMobil'])).not.toBe('partner');
    expect(role('In 2025, we entered into an equipment supply contract with Caterpillar for $801 million.', ['Caterpillar'])).toBeNull();
  });

  it('skips parents, former names and architectures in a list of names', () => {
    const d = buildDirectory([{ cik: 1, ticker: 'SHI', title: 'Shandong Heavy Industry Group' }, { cik: 2, ticker: 'ARM', title: 'Arm Holdings plc' }]);
    expect(findCompanies('Shantui Construction Machinery Co., Ltd. (part of Shandong Heavy Industry Group)', d).map((f) => f.ticker ?? f.name)).toEqual(['Shantui Construction Machinery']);
    expect(findCompanies('competitors using alternative computing architectures, such as Arm', d)).toEqual([]);
  });
});

describe('SPLC: what the fourth check found', () => {
  const share = (sentence: string, names: string[]) => {
    const c = classify(sentence, targetPattern(names));
    return c ? [c.role, c.share ?? null] : null;
  };

  it('gives no share from a figure several companies make up together', () => {
    expect(share("Our largest customers, Walmart (which includes its affiliates, including Sam's Club), Costco and Amazon, accounted for approximately 74.0% of our net sales in our year ended September 30, 2025.", ['Costco'])).toEqual(['supplier', null]);
    expect(share("Together with Costco, Lowe's and Amazon these major retailers represented approximately 54% of total net sales in fiscal 2025 and 2024.", ['Costco'])).toEqual(['supplier', null]);
    expect(share("Costco, Lowe's and Amazon are also significant customers, and together with Walmart and Home Depot, accounted for approximately 54% of our net sales in fiscal 2025 and 2024.", ['Costco'])).toEqual(['supplier', null]);
    // One company's own figure still counts.
    expect(share('During the years ended December 31, 2025, 2024 and 2023, sales to Costco accounted for 11% of consolidated net sales, respectively.', ['Costco'])).toEqual(['supplier', 11]);
  });

  it('reads no share from a range or from the sales of a product', () => {
    const c = classify('The 2018 Amendment also provided the Group rights to promote Elunate in provinces that represent 30% to 40% of the sales of Elunate in China upon the occurrence of certain commercial milestones by Lilly.', targetPattern(['Eli Lilly', 'Lilly']));
    expect(c?.share).toBeUndefined();
  });

  it('reads "the U.S.-McKesson Corporation" as McKesson', () => {
    const d = buildDirectory([{ cik: 927653, ticker: 'MCK', title: 'MCKESSON CORP' }, { cik: 1140859, ticker: 'COR', title: 'Cencora, Inc.' }, { cik: 36104, ticker: 'USB', title: 'US BANCORP \\DE\\' }]);
    const found = findCompanies('three wholesale distributors in the U.S.-McKesson Corporation, Cencora, Inc., and Cardinal Health, Inc.-each accounted for a significant percentage', d);
    expect(found.map((f) => f.ticker ?? f.name)).toEqual(['MCK', 'COR', 'CAH']);
    expect(findCompanies('a credit facility with U.S. Bancorp', d).map((f) => f.ticker)).toEqual(['USB']);
  });
});

describe('SPLC: fees and consent', () => {
  const role = (sentence: string, names: string[]) => classify(sentence, targetPattern(names));
  it('reads platform fees as paid to the company, a group with affiliates as a group, and consent as no licence', () => {
    expect(role('Platform providers, such as Apple, Google, and Amazon, charge transactional payment processing fees, which generally represent approximately 30% of our revenue, for accepting payments from players.', ['Apple'])).toEqual({ role: 'customer' });
    expect(role("Our largest customers, Walmart and its affiliates (which includes Sam's Club), Costco and Amazon, accounted for approximately 74.0% of our net sales in our year ended September 30, 2025.", ['Costco'])?.share).toBeUndefined();
    expect(role("Walmart Inc. and its affiliates together accounted for approximately 13% of our consolidated net sales.", ['Walmart'])?.share).toBe(13);
    expect(role('We expect to deliver the opt-in package for the PCSK9 program to Lilly in the second half of 2025.', ['Lilly'])?.role).toBe('partner');
    expect(role("In April 2021, Apple started implementing its application tracking transparency framework that requires users' opt-in consent for certain types of tracking.", ['Apple'])).toBeNull();
  });
});

describe('SPLC: purchases of the filer\'s products, names defined as another company, past years', () => {
  it('reads a purchase agreement for the filer\'s own products as a sale to the party', () => {
    const d = buildDirectory([{ cik: 2488, ticker: 'AMD', title: 'ADVANCED MICRO DEVICES INC' }]);
    const amd = targetPattern(['AMD', 'Advanced Micro Devices']);
    const got = ownStatements('In October 2025, we entered into a product purchase agreement with OpenAI OpCo, LLC, (OpenAI) to deploy 6 gigawatts of AMD GPUs, with the first gigawatt powered by our AMD Instinct MI450 series products.', d, amd);
    expect(got.map((x) => [x.role, x.party.name])).toEqual([['customer', 'OpenAI']]);
  });

  it('knows a sentence that gives the target\'s name to another company', () => {
    const amd = targetPattern(['AMD', 'Advanced Micro Devices']);
    expect(definesOther('Approximately 95% of our China revenue in 2019 was generated from Changzhou Almaden Co., Ltd., which was a related party that we refer to in this annual report as AMD.', amd)).toBe(true);
    expect(definesOther('Changzhou Almaden Co., Ltd. (we refer to it as "AMD") supplied our panels.', amd)).toBe(true);
    expect(definesOther('Advanced Micro Devices, Inc. ("AMD") is our largest customer.', amd)).toBe(false);
  });
});

describe('SPLC: what checking the fifth round for losses found', () => {
  const T = (names: string[]) => targetPattern(names);
  const role = (sentence: string, names: string[], filer: string[]) => classify(sentence, T(names), T(filer))?.role ?? null;

  it('reads retailer lists that name Target the retailer', () => {
    expect(role('BARK products are currently sold in over 50,000 retail doors, including Target, TJ Maxx, Costco, Walmart, and PetSmart.', ['Costco'], ['Bark'])).toBe('supplier');
    expect(role('Honest products are available nationwide at major retailers, including Amazon, Target and Walmart.', ['Walmart'], ['Honest Company', 'Honest'])).toBe('supplier');
  });

  it("reads the filer's purchases and lists written without \"we\"", () => {
    expect(role('Syrup for frozen beverages is purchased primarily from The Coca-Cola Company, Keurig Dr. Pepper, Inc., the Pepsi Cola Company, and Jogue, Inc.', ['Coca-Cola'], ['J&J Snack Foods'])).toBe('customer');
    expect(role('Representative customers include Costco, Intermountain Health, Honda, and the Louisiana Office of Group Benefits.', ['Costco'], ['Omada Health'])).toBe('supplier');
  });

  it("keeps a licence with a company's subsidiary, and notes and shares issued to it", () => {
    expect(role('In December 2020, the Company entered into an exclusive license agreement with Dermira, Inc., a wholly owned subsidiary of Eli Lilly and Company ("Dermira") to develop and commercialize EVO756.', ['Eli Lilly', 'Lilly'], ['Evommune'])).toBe('partner');
    expect(role('Interest expense consists of coupon interest accrued on the convertible note that we issued to Eli Lilly and Company in May 2023.', ['Eli Lilly', 'Lilly'], ['Scribe Therapeutics'])).toBe('lender');
    expect(role('On October 27, 2025, the Company issued to AMD an aggregate of 1,151,052 shares of its Common Stock at $0.01 par value per share.', ['AMD', 'Advanced Micro Devices'], ['Sanmina'])).toBe('investment');
  });

  it('reads who supplies whom in dependence and appositions', () => {
    expect(role('We are substantially dependent on NVIDIA Corporation as a supplier of graphics processing units ("GPUs"), and any disruption in our ability to obtain NVIDIA GPUs could materially and adversely affect our business.', ['NVIDIA'], ['SharonAI'])).toBe('customer');
    expect(role("This status was granted following NVIDIA's assessment of our position as a specialized provider of GPU compute in the Australian public cloud environment.", ['NVIDIA'], ['SharonAI'])).not.toBe('customer');
    expect(role('We and OpenAI are highly dependent on NVIDIA for the success of our PORTS-Pike Technology Campus', ['NVIDIA'], ['SB Energy'])).toBeNull();
    expect(role("Core Scientific's extensive portfolio of AI-ready data centers expands access to the infrastructure our customers need to deploy AMD AI solutions at scale.", ['AMD', 'Advanced Micro Devices'], ['Core Scientific'])).not.toBe('customer');
    expect(role('In October 2025, we entered into a purchase commitment of $128.7 million, payable in the next 12 months, for the development of HPC data center projects with Vertiv, a large publicly-traded American multinational provider of critical infrastructure and services for data centers.', ['Vertiv'], ['Bitfarms'])).toBe('customer');
  });
});

describe('SPLC: relations the fifth review found missing', () => {
  const T = (names: string[]) => targetPattern(names);
  it("reads the company's own announcements by what the other party does", () => {
    const d = buildDirectory([{ cik: 1, ticker: 'MSFT', title: 'MICROSOFT CORP' }, { cik: 2, ticker: 'META', title: 'Meta Platforms, Inc.' }]);
    const of = (sentence: string, self: string[]) => ownStatements(sentence, d, T(self)).map((x) => [x.role, x.party.name]);
    expect(of('Announced a multiyear, multigenerational strategic partnership with Meta spanning on-premises, cloud and AI infrastructure, including the large-scale deployment of NVIDIA CPUs.', ['NVIDIA'])).toEqual([['customer', 'Meta Platforms']]);
    expect(of('Expanded collaboration with Microsoft to deploy AMD Helios racks at scale on Azure to power frontier model inference.', ['AMD', 'Advanced Micro Devices'])).toEqual([['customer', 'Microsoft']]);
    expect(of('We announced a new collaboration with Samsung to manufacture advanced semiconductors for AI inference and training in the U.S.', ['Tesla'])).toEqual([['supplier', 'Samsung Electronics']]);
    expect(of('Commercial Airplanes booked 246 net orders including orders from Korean Air, Delta Air Lines, and SMBC Capital.', ['Boeing'])).toEqual([['customer', 'Korean Air Lines'], ['customer', 'SMBC Aviation Capital']]);
  });
  it('reads a parent in parentheses when the name before it is no company of its own', () => {
    const d = buildDirectory([{ cik: 315189, ticker: 'DE', title: 'DEERE & CO' }, { cik: 1567094, ticker: 'CNH', title: 'CNH Industrial N.V.' }, { cik: 3, ticker: 'SHI', title: 'Shandong Heavy Industry Group' }]);
    expect(findCompanies('Examples of global competitors include CASE (part of CNH Industrial N.V.), Deere Construction & Forestry (part of Deere & Company)', d).map((f) => f.ticker ?? f.name)).toEqual(['CNH', 'DE']);
    expect(findCompanies('Shantui Construction Machinery Co., Ltd. (part of Shandong Heavy Industry Group)', d).map((f) => f.ticker ?? f.name)).toEqual(['Shantui Construction Machinery']);
  });
  it('reads chips brought into the filer\'s product and orders from an affiliate', () => {
    expect(classify("We expanded our strategic collaboration with Qualcomm Technologies, Inc. to bring their industry-leading Snapdragon system-on-a-chip (SoC) to future generations of Specs.", T(['Qualcomm']), T(['Snap']))?.role).toBe('customer');
    expect(classify('Revenues arising from the purchase order received from Esso Nederland B.V. ("Esso"), an affiliate of EMTEC and Exxon Mobil Corporation, related to the project were recognized.', T(['ExxonMobil', 'Exxon Mobil', 'Exxon']), T(['FuelCell Energy', 'FuelCell']))?.role).toBe('supplier');
  });
});

describe("SPLC: the company's own report — competitors and stakes", () => {
  const ev = { filer: 'Own', form: '10-K', date: '2026-07-15', path: 'x' };
  const d = buildDirectory([{ cik: 1, ticker: 'NKE', title: 'NIKE, Inc.' }, { cik: 2, ticker: 'UAA', title: 'Under Armour, Inc.' }, { cik: 3, ticker: 'LULU', title: 'lululemon athletica inc.' }, { cik: 4, ticker: 'VFC', title: 'V F CORP' }, { cik: 5, ticker: 'INTC', title: 'INTEL CORP' }, { cik: 6, ticker: 'MNST', title: 'Monster Beverage Corp' }]);
  const own = (sentences: string[], names: string[]) => ownRelations(sentences, d, { names }, ev).map((r) => [r.role, r.ticker ?? r.name]);
  it('reads competitors after "compete internationally with" and "competition in ... from", lower-case names included', () => {
    const got = own(['We compete internationally with a significant number of athletic and leisure footwear companies, including adidas, Anta, ASICS, Li Ning, lululemon athletica, New Balance, Puma, Under Armour and V.F. Corporation, among others.'], ['NIKE', 'Nike']);
    expect(got).toEqual(expect.arrayContaining([['competitor', 'adidas'], ['competitor', 'ANTA Sports'], ['competitor', 'ASICS'], ['competitor', 'Li Ning'], ['competitor', 'LULU'], ['competitor', 'UAA']]));
    expect(own(['We face intense competition in the semiconductor memory and storage markets from a number of companies, including Kioxia Holdings Corporation, Samsung Electronics Co., Ltd., and SK hynix Inc.'], ['Micron'])).toEqual(expect.arrayContaining([['competitor', 'Kioxia Holdings'], ['competitor', 'Samsung Electronics'], ['competitor', 'SK Hynix']]));
  });
  it('reads the companies it holds a stake in', () => {
    expect(own(['Upon closing the transaction, we retained a 49% minority investment in Altera, which is accounted for under the equity method of accounting.'], ['Intel'])).toEqual([['investment', 'Altera']]);
    expect(own(['We own approximately 19% of Monster Beverage Corporation, which we account for under the equity method.'], ['Coca-Cola'])).toEqual([['investment', 'MNST']]);
    expect(own(['The Company holds a 15% equity interest in two joint ventures (collectively, the ATMP JV) with affiliates of Tongfu Microelectronics Co., Ltd, a Chinese joint stock company.'], ['AMD'])).toEqual([['investment', 'Tongfu Microelectronics']]);
  });
  it('more competitors by their usual names', () => {
    expect(own(['We compete internationally with companies including Deckers, New Balance and Puma.'], ['NIKE'])).toEqual([['competitor', 'DECK'], ['competitor', 'New Balance'], ['competitor', 'PUMA']]);
  });
  it('"ASICs" and "GPUs" are products, not ASICS the company', () => {
    expect(own(['We also compete with Intel in the custom ASICs development market.'], ['Broadcom'])).toEqual([['competitor', 'INTC']]);
    expect(own(['Other competitors include manufacturers of low-cost FPGAs as programmable replacements for ASICs and ASSPs.'], ['AMD'])).toEqual([]);
  });
  it('a company it owns more than half of is a subsidiary, and a name further on is not the stake', () => {
    const d2 = buildDirectory([{ cik: 7, ticker: 'CHRN', title: 'ChronoScale Holdings Corp' }, { cik: 8, ticker: 'NDAQ', title: 'NASDAQ, INC.' }]);
    const own2 = (s: string[]) => ownRelations(s, d2, { names: ['Applied Digital'] }, ev).map((r) => [r.role, r.ticker ?? r.name]);
    expect(own2(["As a result of the transaction, at closing, the Company owned approximately 97% of ChronoScale's outstanding common stock, and legacy shareholders retained approximately 3%, which represents a noncontrolling interest in ChronoScale."])).toEqual([]);
    expect(own2(['Applied Digital is expected to own approximately 97% of the combined company, which is expected to be listed on the Nasdaq upon closing.'])).toEqual([]);
  });
  it('a stake it sold, or held only in the past, is no relation now', () => {
    const d2 = buildDirectory([{ cik: 9, ticker: 'COKE', title: 'Coca-Cola Consolidated, Inc.' }, { cik: 10, ticker: 'CCEP', title: 'COCA-COLA EUROPACIFIC PARTNERS plc' }, { cik: 11, ticker: 'HLN', title: 'Haleon plc' }]);
    const own2 = (s: string[], names: string[]) => ownRelations(s, d2, { names }, ev).map((r) => [r.role, r.ticker ?? r.name]);
    expect(own2([
      'The Company recognized a gain of $1,952 million related to the sale of our ownership interest in Coca-Cola Consolidated, Inc. ("Coke Consolidated"), an equity method investee.',
      'During 2024, the company recorded a net gain of $338 million related to the sale of a portion of our interest in Coca-Cola Consolidated, Inc., an equity method investee.',
      'In March 2025, the Company sold a portion of our ownership interest in Coca-Cola Europacific Partners plc ("CCEP"), an equity method investee, for cash proceeds of $741 million.',
    ], ['Coca-Cola'])).toEqual([['investment', 'CCEP']]);
    expect(own2([
      'The following table summarizes the change in the carrying value of our investment in Haleon while subject to the equity method during 2024:',
      'The final carrying value of our equity-method investment in Haleon was reclassified to Short-term investments, until its disposition in the first quarter of 2025.',
    ], ['Pfizer'])).toEqual([]);
  });
  it('a stake one filing says was sold stays out when another filing names it', () => {
    const d2 = buildDirectory([{ cik: 9, ticker: 'COKE', title: 'Coca-Cola Consolidated, Inc.' }]);
    const ended = { sold: new Set<string>(), subsidiaries: new Set<string>() };
    ownRelations(['The Company recognized a gain related to the sale of our ownership interest in Coca-Cola Consolidated, Inc., an equity method investee.'], d2, { names: ['Coca-Cola'] }, ev, ended);
    expect(ownRelations(['During 2024 the Company sold a portion of our interest in Coca-Cola Consolidated, Inc., an equity method investee.'], d2, { names: ['Coca-Cola'] }, ev, ended)).toEqual([]);
  });
});

describe('SPLC: the sixth check — lists, short names, ventures and second roles', () => {
  const ev = { filer: 'Own', form: '10-K', date: '2026-07-15', path: 'x' };
  const d = buildDirectory([
    { cik: 1, ticker: 'WMT', title: 'Walmart Inc.' }, { cik: 2, ticker: 'TGT', title: 'TARGET CORP' }, { cik: 3, ticker: 'KR', title: 'KROGER CO' },
    { cik: 4, ticker: 'AMZN', title: 'AMAZON COM INC' }, { cik: 5, ticker: 'CCEP', title: 'COCA-COLA EUROPACIFIC PARTNERS plc' }, { cik: 6, ticker: 'KOF', title: 'COCA COLA FEMSA SAB DE CV' },
    { cik: 7, ticker: 'KO', title: 'COCA COLA CO' }, { cik: 8, ticker: 'UBER', title: 'Uber Technologies, Inc' }, { cik: 9, ticker: 'TMUS', title: 'T-Mobile US, Inc.' },
  ]);
  const own = (sentences: string[], names: string[]) => ownRelations(sentences, d, { cik: names.includes('Coca-Cola') ? 7 : undefined, names }, ev).map((r) => [r.role, r.ticker ?? r.name]);
  it('a company whose name is also a word counts inside a list of companies, not alone', () => {
    expect(own(['Walmart, Target, Kroger, and Amazon are among our significant general merchandise retail competitors in the U.S.'], ['Costco'])).toEqual([['competitor', 'WMT'], ['competitor', 'TGT'], ['competitor', 'KR'], ['competitor', 'AMZN']]);
    expect(findCompanies('Target customers include large retailers.', d)).toEqual([]);
  });
  it('knows Uber and T-Mobile by their short names, and several partnerships in one bullet', () => {
    expect(own(['Expanded partnership with Kia for autonomous driving, and expanded partnership with Uber to launch a fleet of autonomous vehicles.'], ['NVIDIA'])).toContainEqual(['partner', 'UBER']);
    expect(own(['Announced collaboration with T-Mobile and Nokia to integrate physical AI applications on AI-RAN-ready infrastructure.'], ['NVIDIA'])).toContainEqual(['partner', 'TMUS']);
  });
  it('an investment and partnership is both', () => {
    expect(own(['Announced an investment and deep technology partnership with Anthropic, which is scaling its model on Azure.'], ['NVIDIA'])).toEqual([['partner', 'Anthropic'], ['investment', 'Anthropic']]);
  });
  it("reads the filing's short names and a full list of equity-method investees; bottlers named after the company are others", () => {
    const got = own([
      'In March 2025, the Company sold a portion of our ownership interest in Coca-Cola Europacific Partners plc ("CCEP"), an equity method investee, for cash proceeds of $741 million.',
      'In October 2025, the Company agreed to sell a portion of our interest in our bottling operations in Africa to Coca-Cola HBC AG ("CCHBC"), an equity method investee.',
      "The Company's equity method investments include, but are not limited to, our ownership interests in CCEP; Monster; AC Bebidas, S. de R.L. de C.V.; Coca-Cola FEMSA; CCHBC; and Coca-Cola Bottlers Japan Holdings Inc. As of December 31, 2025, we owned 18%, 21%, 20%, 28%, 22% and 24%, respectively, of these companies' outstanding shares.",
    ], ['Coca-Cola']);
    expect(got).toEqual(expect.arrayContaining([['investment', 'CCEP'], ['investment', 'MNST'], ['investment', 'KOF'], ['investment', 'Coca-Cola HBC'], ['investment', 'Coca-Cola Bottlers Japan']]));
    expect(got.some(([, t]) => t === 'KO')).toBe(false);
  });
  it('a joint venture is a stake, its other owner a partner', () => {
    expect(own(['This includes engines sold by joint venture partners, the most significant of which is CFM International, a 50-50 non-consolidated joint venture with Safran Aircraft Engines, a subsidiary of Safran Group of France.'], ['GE Aerospace', 'General Electric'])).toEqual([['investment', 'CFM International'], ['partner', 'Safran']]);
  });
  it('another company: a rival that is also a partner, a builder of the filer\'s site, a partnership to provide, a stake taken', () => {
    const t = (target: string, filer: string, s: string) => classify(s, targetPattern(targetNames(target, target).names), targetPattern(targetNames(undefined, filer).names));
    expect(t('MSFT', 'eGain Corp', 'However, we occasionally compete with some of our platform partners where some of our product capabilities overlap, including Five9, Genesys, Microsoft, NICE, and Salesforce.')).toEqual({ role: 'competitor', also: 'partner' });
    expect(t('VRT', 'Hut 8 Corp', 'We have partnered with Jacobs and Vertiv to build the data center at a cost of $9-$11 million per MW.')).toEqual({ role: 'customer' });
    expect(t('ORCL', 'Bloom Energy Corp', 'The increase was primarily in connection with our partnership with Oracle Corporation ("Oracle") to provide on-site solid state power for AI data centers.')).toEqual({ role: 'supplier' });
    expect(t('BA', 'Archer Aviation Inc.', 'Boeing to take stake and become a strategic partner to Archer')).toEqual({ role: 'investment' });
  });
  it('keeps those rules to what they say', () => {
    const t = (target: string, filer: string, s: string) => classify(s, targetPattern(targetNames(target, target).names), targetPattern(targetNames(undefined, filer).names));
    // "who is also our partner" is Microsoft only, not Oracle earlier in the text.
    const s = 'We compete with large enterprise technology providers, including Microsoft Corporation (Microsoft), Oracle Corporation (Oracle) and ServiceNow, Inc. In certain markets, Open Text competes with Microsoft, who is also our partner.';
    expect(t('MSFT', 'Open Text Corp', s)).toEqual({ role: 'competitor', also: 'partner' });
    expect(t('ORCL', 'Open Text Corp', s)).toEqual({ role: 'competitor' });
    // A partnership that "continues to deliver value" is no supply.
    expect(t('MSFT', 'Intapp Inc', 'Our partnership with Microsoft continues to deliver value in the form of joint innovation and joint marketing.')).toEqual({ role: 'partner' });
  });
  it("a short name is not written out inside a longer name, and documents obtained from an agent are no purchase", () => {
    const d2 = buildDirectory([{ cik: 11, ticker: 'JPM', title: 'JPMORGAN CHASE & CO' }, { cik: 12, ticker: 'C', title: 'CITIGROUP INC' }]);
    const got = ownRelations(['On August 24, 2026, the Company entered into a $3.0 billion revolving credit agreement with Citibank, N.A. ("Citibank") and JPMorgan Chase Bank, N.A. ("JPMorgan") as joint lead arrangers, Citibank as administrative agent and JPMorgan as syndication agent.'], d2, { names: ['Boeing'] }, ev);
    expect(got.every((r) => !/Chase Bank Bank|& CO Chase/.test(r.name))).toBe(true);
    expect(got.map((r) => r.role)).toEqual(got.map(() => 'lender'));
    expect(ownStatements('Copies of the offer to purchase may be obtained from D.F. King & Co., Inc., the information agent.', d2)).toEqual([]);
  });
  it("a figure's cited source and a glossary's definition are no supplier (JPMorgan's 10-K of February 2026)", () => {
    const d3 = buildDirectory([
      { cik: 21, ticker: 'MORN', title: 'Morningstar, Inc.' },
      { cik: 22, ticker: 'NMR', title: 'NOMURA HOLDINGS INC' },
      { cik: 23, ticker: 'FICO', title: 'FAIR ISAAC CORP' },
      { cik: 24, ticker: 'LMT', title: 'LOCKHEED MARTIN CORP' },
      { cik: 25, ticker: 'HNHPF', title: 'HON HAI PRECISION INDUSTRY CO LTD' },
    ]);
    const of = (s: string) => ownStatements(s, d3).map((x) => [x.role, x.party.name]);
    expect(of('(b)Quartile ranking sourced from Morningstar, Lipper and Nomura based on country of domicile.')).toEqual([]);
    expect(of('FICO score: A measure of consumer credit risk based on information in consumer credit reports produced by Fair Isaac Corporation.')).toEqual([]);
    // RTX's 10-K: the aircraft Lockheed Martin makes, not something it makes for RTX.
    expect(of("Pratt & Whitney produces and sustains the F135 engine for the U.S. government's F-35 Joint Program Office to exclusively power the single-engine F-35 Lightning II fifth generation aircraft (commonly known as the Joint Strike Fighter) produced by Lockheed Martin.")).toEqual([]);
    // What the company itself buys or has made still counts.
    expect(of('We purchase scoring models from Fair Isaac Corporation.')).toEqual([['supplier', 'FAIR ISAAC CORP']]);
    expect(of('Substantially all of our products are manufactured by Hon Hai Precision Industry.').map((r) => r[0])).toEqual(['supplier']);
  });
});
