import { describe, expect, it } from 'vitest';
import * as main from '../electron/supply-chain.cjs';
import {
  buildDirectory, classify, findCompanies, mergeRelations, normalizeName, ownRelations, parseFts, percentRuns, rankFilers, shareInRun, statementYear,
  targetNames, targetPattern, unnamedShares, type Relation,
} from '../src/data/live/supply-chain';
import type { SecCompany } from '../src/data/live/sec';

// Sentences as companies wrote them in their annual reports filed in 2025-2026.
const COMPANIES: SecCompany[] = [
  { cik: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  { cik: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  { cik: 858877, ticker: 'CSCO', title: 'CISCO SYSTEMS, INC.' },
  { cik: 2488, ticker: 'AMD', title: 'ADVANCED MICRO DEVICES INC' },
  { cik: 50863, ticker: 'INTC', title: 'INTEL CORP' },
  { cik: 1408710, ticker: 'FN', title: 'Fabrinet' },
  { cik: 924613, ticker: 'NOK', title: 'NOKIA CORP' },
  { cik: 1018724, ticker: 'AMZN', title: 'AMAZON COM INC' },
  { cik: 1046179, ticker: 'TSM', title: 'TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD' },
  { cik: 1280263, ticker: 'AMBA', title: 'AMBARELLA INC' },
  { cik: 1730168, ticker: 'AVGO', title: 'Broadcom Inc.' },
  { cik: 804328, ticker: 'QCOM', title: 'QUALCOMM INC/DE' },
  { cik: 1596532, ticker: 'ANET', title: 'Arista Networks, Inc.' },
  { cik: 1645590, ticker: 'HPE', title: 'Hewlett Packard Enterprise Co' },
  { cik: 1652044, ticker: 'GOOGL', title: 'Alphabet Inc.' },
  { cik: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' },
  { cik: 1318605, ticker: 'TSLA', title: 'Tesla, Inc.' },
  { cik: 1769628, ticker: 'CRWV', title: 'CoreWeave, Inc.' },
];
const dir = buildDirectory(COMPANIES);
const nvda = targetPattern(targetNames('NVDA', 'NVIDIA CORP').names);
const apple = targetPattern(targetNames('AAPL', 'Apple Inc.').names);

describe('SPLC: names', () => {
  it('reads company names without their legal form or case', () => {
    expect(normalizeName('ADVANCED MICRO DEVICES INC')).toBe('advanced micro devices');
    expect(normalizeName('Cisco Systems, Inc.')).toBe('cisco systems');
    expect(normalizeName('QUALCOMM INC/DE')).toBe('qualcomm');
    expect(normalizeName('Huawei Technologies Co. Ltd.')).toBe('huawei technologies');
    expect(normalizeName('ELI LILLY & Co')).toBe('eli lilly');
  });

  it('searches the legal name and reads the short ones', () => {
    expect(targetNames('NVDA', 'NVIDIA CORP')).toEqual({ legal: ['NVIDIA Corporation'], names: ['NVIDIA'] });
    expect(targetNames('CSCO', 'CISCO SYSTEMS, INC.').legal).toEqual(['Cisco Systems']);
    expect(targetNames('XYZ', 'ACME WIDGETS CORP')).toEqual({ legal: ['Acme Widgets Corporation'], names: ['Acme Widgets', 'Acme'] });
    expect(targetNames('XYZ', 'Fabrinet')).toEqual({ legal: ['Fabrinet'], names: ['Fabrinet'] });
    expect(targetNames('NBIS', 'Nebius Group N.V.')).toEqual({ legal: ['Nebius Group N.V.'], names: ['Nebius'] });
    expect(targetNames('BA', 'BOEING CO').names).toEqual(['Boeing']);
    // "Eli Lilly and Company" is searched as "Eli Lilly", not "Eli Lilly and"; the legal name keeps its "&".
    expect(targetNames('LLY', 'ELI LILLY & Co').names).not.toContain('Eli Lilly and');
    expect(targetNames('ZZZZ', 'ACME & Co')).toEqual({ legal: ['Acme & Company'], names: ['Acme'] });
    expect(targetPattern(targetNames('KO', 'COCA COLA CO').names).test('The Coca-Cola Company and Coca Cola bottlers')).toBe(true);
  });

  it("finds Bank of America and The New York Times as reports write them, whatever the SEC's capitals", () => {
    // SPLC BAC read 268 filings on 28 October 2026 and found nothing: it looked for "Bank OF America".
    expect(targetNames('BAC', 'BANK OF AMERICA CORP /DE/')).toEqual({ legal: ['Bank of America Corporation'], names: ['Bank of America'] });
    const bac = targetPattern(targetNames('BAC', 'BANK OF AMERICA CORP /DE/').names);
    expect('a credit agreement with Bank of America, N.A., as administrative agent'.match(bac)).toEqual(['Bank of America']);
    expect('BANK OF AMERICA, N.A.'.match(bac)).toEqual(['BANK OF AMERICA']);
    // Words of three letters or fewer keep the SEC's capitals (IBM, AMD) but are found as written too.
    for (const [t, title, text] of [
      ['NYT', 'NEW YORK TIMES CO', 'The New York Times Company'],
      ['JACK', 'JACK IN THE BOX INC', 'Jack in the Box restaurants'],
      ['RY', 'ROYAL BANK OF CANADA', 'Royal Bank of Canada'],
      // A word the SEC gives in capitals, written with capitals inside it.
      ['MTZ', 'MASTEC INC', 'MasTec, Inc.'],
      ['AZO', 'AUTOZONE INC', 'AutoZone stores'],
    ]) {
      const p = targetPattern(targetNames(t, title).names);
      p.lastIndex = 0;
      expect(p.test(text)).toBe(true);
    }
  });

  it('finds companies a passage names, with or without their legal form', () => {
    const found = findCompanies('such as Ambarella, Inc., AMD, Broadcom, Intel, Qualcomm Incorporated, Renesas Electronics Corporation, and Samsung', dir);
    expect(found.map((f) => f.ticker ?? f.name)).toEqual(['AMBA', 'AMD', 'AVGO', 'INTC', 'QCOM', 'Renesas Electronics', 'Samsung Electronics']);
    expect(findCompanies('such as Advanced Micro Devices, Inc., or AMD, Huawei Technologies Co. Ltd., or Huawei, and Intel Corporation, or Intel;', dir).map((f) => f.ticker ?? f.name)).toEqual(['AMD', 'Huawei Technologies', 'INTC']);
  });
});

describe('SPLC: shares', () => {
  const run = (s: string) => percentRuns(s).find((r) => r.length > 1)!;
  it("maps a list of companies to its percentages and a list of years to the latest year's", () => {
    const fn = 'During fiscal year 2026, Cisco Systems, Inc., NVIDIA Corporation, Nokia Corporation and Amazon.com, Inc. contributed 19.9%, 16.3%, 10.7% and 10.5%, respectively, of our revenues.';
    expect(shareInRun(fn, run(fn), nvda)).toBe(16.3);
    const crus = 'For fiscal years 2026, 2025, and 2024, we had one end customer, Apple Inc., who purchased through multiple contract manufacturers and represented approximately 91 percent, 89 percent, and 87 percent, of the Company\'s total net sales, respectively.';
    expect(shareInRun(crus, run(crus), apple)).toBe(91);
    const qrvo = 'We provide products to our largest end customer, Apple Inc. ("Apple"), through sales to multiple contract manufacturers, which in the aggregate accounted for 50% and 47% of total revenue in fiscal years 2026 and 2025, respectively.';
    expect(shareInRun(qrvo, run(qrvo), apple)).toBe(50);
  });

  it('reads the unnamed customers behind a share of revenue', () => {
    expect(unnamedShares('For fiscal year 2026, sales to one direct customer represented 22% of total revenue and sales to another direct customer represented 14% of total revenue, all of which were primarily attributable to the Compute & Networking segment.')).toEqual([
      { count: 1, kind: 'direct', share: 22 },
      { count: 1, kind: 'direct', share: 14 },
    ]);
    expect(unnamedShares('For fiscal year 2025, sales to one direct customer represented 12% of total revenue and sales to two direct customers each represented 11% of total revenue.')).toEqual([
      { count: 1, kind: 'direct', share: 12 },
      { count: 2, kind: 'direct', share: 11 },
    ]);
    expect(unnamedShares('Three direct customers accounted for 25%, 18%, and 13% of our accounts receivable balance as of January 25, 2026.')).toEqual([]);
    // Applied Digital's wording (10-K for fiscal 2026).
    expect(unnamedShares('During fiscal year 2026, this business segment was comprised of one customer accounting for 59% of our total revenue from continuing operations.')).toEqual([{ count: 1, kind: '', share: 59 }]);
  });

  it('takes the year a statement speaks of', () => {
    expect(statementYear('During fiscal year 2025, NVIDIA Corporation and Cisco Systems, Inc. contributed 27.6% and 18.2%', Date.parse('2026-10-21'))).toBe(2025);
    expect(statementYear('no year here')).toBe(0);
  });
});

describe("SPLC: what another company's report says", () => {
  const c = (s: string, p = nvda) => classify(s, p);
  it('a supplier with the share of its revenue', () => {
    expect(c('During fiscal year 2026, Cisco Systems, Inc., NVIDIA Corporation, Nokia Corporation and Amazon.com, Inc. contributed 19.9%, 16.3%, 10.7% and 10.5%, respectively, of our revenues.')).toEqual({ role: 'supplier', share: 16.3, qualifier: undefined, basis: 'their-revenue' });
    expect(c('Sales attributable to Apple, our largest end customer accounted for approximately 17%, 22%, and 21% of our revenue for the years ended December 31, 2025, 2024, and 2023, respectively.', apple)).toMatchObject({ role: 'supplier', share: 17 });
    expect(c('In fiscal 2025, revenue (in descending order) from Samsung, Apple, and vivo each comprised 10% or more of our consolidated revenue.', apple)).toMatchObject({ role: 'supplier', share: 10, qualifier: '>' });
  });

  it("a segment's figure is no share of the company's sales (Edgewell's 10-K of November 2025)", () => {
    const target = targetPattern(targetNames('TGT', 'TARGET CORP').names);
    // Target bought 9.2% of one segment's sales; SPLC TGT showed "Rev: 9.2%" of Edgewell's.
    expect(c('Target Corporation represented approximately 9.2% of net sales for our Sun and Skin Care segment and 10.1% for our Feminine Care segment, respectively.', target)).toEqual({ role: 'supplier', basis: 'their-revenue' });
    expect(c('Additionally, in fiscal 2025, Target Corporation represented approximately 9.2% of consolidated net sales for the Sun and Skin Care segment and 10.1% of consolidated net sales for the Feminine Care segment, respectively.', target)).toEqual({ role: 'supplier', basis: 'their-revenue' });
    expect(c('Target accounted for approximately 14% of our Consumer segment net sales in fiscal 2025.', target)).toEqual({ role: 'supplier', basis: 'their-revenue' });
    // The company's own total still gives the share, even when a segment is named after it.
    expect(c('Target accounted for approximately 12% of our consolidated net sales in fiscal 2025, primarily in our Consumer segment.', target)).toMatchObject({ role: 'supplier', share: 12 });
  });

  it('a contractor building for it is a supplier; a stake it took is apart (Babcock & Wilcox, Applied Digital)', () => {
    const apld = targetPattern(['Applied Digital', 'Applied Digital Corporation']);
    expect(classify('On November 4, 2025, we entered into a limited notice to proceed ("LNTP") with Applied Digital for a project to design and install four 300-megawatt natural gas-fired power plants consisting of boilers and associated steam turbines to deliver power for an AI factory.', apld)).toEqual({ role: 'supplier' });
    // The counterparty is another company, only backed by the target: no relation read.
    expect(classify('Effective February 26, 2026, we entered into an agreement with Base Electron, an IPP backed by Applied Digital, to complete the design and installation of four 300-megawatt natural gas-fired power plants.', apld)).toBeNull();
  });

  it('a reseller of its products is a customer', () => {
    expect(c('For example, sales of Apple Inc. products and services comprised approximately 12%, 12%, and 11% of our total revenue for fiscal years 2025, 2024, and 2023, respectively and sales from HP, Inc. comprised approximately 10% of our total revenue for fiscal year 2025.', apple)).toMatchObject({ role: 'customer', share: 12, basis: 'their-product-sales' });
    // What a filer sold through Apple's store is no revenue from Apple (Signing Day Sports in AIB Data Centers' 8-K/A of
    // May 2026): it was read as Apple buying 41% of its revenue.
    expect(c('Revenue Concentration Apple For the year ended December 31, 2025, 5,759 Apple units sold accounted for approximately 41% of the annual revenue recorded.', apple)).toMatchObject({ role: 'customer', share: 41, basis: 'their-product-sales' });
  });

  it('an order a retailer places to sell its products makes it a supplier; an order placed with a maker, a customer', () => {
    const hd = targetPattern(targetNames('HD', 'HOME DEPOT, INC.').names);
    const ba = targetPattern(targetNames('BA', 'BOEING CO').names);
    // Axil Brands' press release of 8 April 2026: SPLC HD listed Axil as Home Depot's customer.
    expect(c('Announced new order with Home Depot to distribute three high performance products through its on-line platform', hd)).toEqual({ role: 'supplier' });
    expect(c('We have 42 aircraft on order with Boeing for delivery through 2030.', ba)).toEqual({ role: 'customer' });
    // American Woodmark's 10-K of June 2025: Home Depot is what it competes for, not a rival.
    expect(c("We compete with numerous large national and regional home products companies for, among other things, customers, orders from Home Depot and Lowe's, raw materials, skilled management, and labor resources.", hd)).toBeNull();
    expect(c('We compete with Home Depot and Lowe\'s for professional customers.', hd)).toEqual({ role: 'competitor' });
  });

  it("reads a reseller's group figure, a support provider's revenue and a list of products' shares as their filings mean them", () => {
    const msft = targetPattern(targetNames('MSFT', 'MICROSOFT CORP').names);
    const oracle = targetPattern(targetNames('ORCL', 'Oracle Corp').names);
    // Insight Enterprises' 10-K of February 2026: five makers' products together, not Microsoft buying half its sales
    // (it was read as Insight supplying Microsoft, 50% of its revenue).
    expect(classify('Sales of product from our top five manufacturers/publishers as a group (Microsoft, Dell, Cisco Systems, HP Inc. and Lenovo) accounted for approximately 50% of our consolidated net sales during 2025.', msft)).toEqual({ role: 'customer', share: undefined, qualifier: undefined, basis: 'their-product-sales' });
    expect(classify('During 2025, sales of Microsoft products accounted for approximately 17% of our consolidated net sales.', msft)).toMatchObject({ role: 'customer', share: 17, basis: 'their-product-sales' });
    // Rimini Street's 10-Q of July 2026: it supports Oracle's software in Oracle's place; it neither resells it nor buys
    // from Oracle (it was read as an Oracle customer with 3%).
    expect(classify('Revenue related to providing services for Oracle PeopleSoft products accounted for approximately 3% and 6% of revenue for the six months ended June 30, 2026 and 2025, respectively.', oracle)).toBeNull();
    // Its 10-K of February 2025: SAP's own figure, not a share of Rimini's revenue from Oracle.
    expect(classify('For example, for fiscal year 2024, SAP reported that support revenue represented approximately 33% of its total revenue and, for fiscal year 2024, Oracle reported a margin of 76% for cloud services and license support.', oracle)).toBeNull();
    // What businesses buy, not Rimini's supplier.
    expect(classify('In a composable ERP strategy, we believe that businesses can take advantage of a modular functionality approach by selecting a mix of best-of-breed vendors, products and technologies to achieve their strategic, operational and financial goals - instead of being confined to the conventional architecture, technology, products and capabilities of a single ERP software vendor like SAP or Oracle.', oracle)).toBeNull();
    // Black Titan's 20-F of November 2025: Oracle's products were 78.9% of revenue in 2024 and 70.5% in 2025; only
    // 2024's figure was read.
    const list = 'The contributions to revenue of the products, in 2024 and 2025, respectively, are as follows: Oracle PeopleSoft HCM/ Oracle PeopleSoft Financials, 78.9% and 70.5%; Dayforce HCM, 0.2% and 0.1%; Sunfish Workplaze HR, 14.5% and 15.0%; MiHCM Cloud, 5.6% and 5.5%.';
    expect(classify(list, oracle)).toEqual({ role: 'customer', share: 70.5, basis: 'their-product-sales' });
    expect(classify(list, targetPattern(['Dayforce']))).toEqual({ role: 'customer', share: 0.1, basis: 'their-product-sales' });
    const ev = (sentence: string, share: number): Relation => ({ key: 'cik:2034400', name: 'Black Titan Corp', role: 'customer', share, basis: 'their-product-sales', side: 'theirs', evidence: [{ sentence, filer: 'Black Titan Corp', form: '20-F', date: '2025-11-28', path: '' }] });
    const merged = mergeRelations([ev("In particular, maintenance, implementation, and licensing of Oracle Corporation's PeopleSoft HCM and PeopleSoft Financials products accounted for 78.9% of the Company's Group's revenues in fiscal year 2024.", 78.9), ev(list, 70.5)]);
    expect(merged[0].share).toBe(70.5);
  });

  it('buyers that name it as their supplier', () => {
    expect(c('We currently rely on Nvidia for the GPU chips we use and on a limited number of other suppliers for other key components in our infrastructure.')).toEqual({ role: 'customer' });
    expect(c('Additionally, our current customers have contractually specified our use of NVIDIA GPUs.')).toEqual({ role: 'customer' });
    expect(c('Key suppliers of single and limited source components include NVIDIA Corporation, Ouster, Inc., and other vendors providing cameras.')).toEqual({ role: 'customer' });
    expect(c('We source GPU hardware primarily from NVIDIA Corporation, which is currently the dominant supplier of GPUs.')).toEqual({ role: 'customer' });
    expect(c('In 2025 we entered into a multi-year Volume Supply Agreement with Fabrinet, a leading global electronics manufacturing services provider.', targetPattern(['Fabrinet']))).toEqual({ role: 'customer' });
  });

  it('sellers that name it as their customer', () => {
    expect(c('Our key customers include Amazon, Apple Inc. ("Apple"), Arcadyan, Arris, Bose.', apple)).toEqual({ role: 'supplier' });
    expect(c('We provide certain services to Apple Inc. (the "Customer") pursuant to a service agreement.', apple)).toEqual({ role: 'supplier' });
    expect(c('Apple limits our access to its application marketplace because our application provides mobile messaging services similar to Apple; or', apple)).toBeNull();
  });

  it("a bank leading the filer's credit facility is its lender, not a partner; a licence's quoted bank is neither (SPLC BAC, 28 October 2026)", () => {
    const bac = targetPattern(targetNames('BAC', 'BANK OF AMERICA CORP /DE/').names);
    const f = (ticker: string, title: string) => targetPattern(targetNames(ticker, title).names);
    // Alliance Laundry's S-1: the filer's own name is no "alliance".
    expect(classify('(i) "Credit Agreement: means that certain Amended and Restated Credit Agreement, dated as of February 28, 2019, among Alliance Laundry Systems LLC, Alliance Laundry Holdings LLC, the lenders from time to time party thereto, Bank of America, N.A., as administrative agent and swing line lender, Bank of Montreal, as an issuing lender.', bac, f('ALH', 'Alliance Laundry Holdings Inc.'))).toEqual({ role: 'lender' });
    // MasTec writes its name "MasTec"; the SEC's title is "MASTEC INC".
    expect(classify('Term Loan Agreement, dated as of June 26, 2025, by and among MasTec, Inc. and MasTec North America, Inc., as Borrowers, Bank of America, N.A., as Administrative Agent, and the other lenders party thereto', bac, f('MTZ', 'MASTEC INC'))).toEqual({ role: 'lender' });
    expect(classify('On August 13, 2021, the Company amended and restated its Credit Agreement, originally dated December 7, 2016, with Bank of America, N.A. ("Bank of America"), as administrative agent, swing line lender and letter of credit issuer.', bac)).toEqual({ role: 'lender' });
    expect(classify('On June 12, 2024, Moove Brazil, our wholly owned subsidiary, entered into an export prepayment facility in the aggregate principal amount of US$100 million with Bank of America, N.A., as lender, and Moove UK, as guarantor.', bac)).toEqual({ role: 'lender' });
    expect(classify('We are grateful for the ongoing partnership with Bank of America and our lender group, who unanimously approved the amendment.', bac, f('HELE', 'HELEN OF TROY LTD'))).toEqual({ role: 'lender' });
    // Beta Bionics' licence: the bank only publishes the quotes it refers to.
    expect(classify('In the event that the Bank of America (or its successor) ceases to publish currency quotes, Licensee will use currency quotes from another US headquartered multinational bank.', bac, f('BBNX', 'Beta Bionics, Inc'))).toBeNull();
    // SPLC JPM, 29 October 2026: a facility obtained from the bank is borrowed; a notice provided to the underwriters is
    // no sale; a REIT's "Special Limited Partner" is a legal form, not a partnership.
    const jpm = targetPattern(targetNames('JPM', 'JPMORGAN CHASE & CO').names);
    expect(classify('Effective July 7, 2021, we obtained from JPMorgan Chase our $5.00 million cash collateralized JPMorgan Chase Credit Facility.', jpm, f('CTHR', 'CHARLES & COLVARD LTD'))).toEqual({ role: 'lender' });
    expect(classify('This authorization shall remain in effect until the Issuer has provided to J.P. Morgan, Morgan Stanley and Piper Sandler a written notice revoking this authorization.', jpm, f('HTFL', 'Heartflow, Inc.'))).toBeNull();
    expect(classify('J.P. Morgan REIT OP Special Limited Partner, L.P. (the "Special Limited Partner"), an affiliate of J.P. Morgan Investment Management Inc. (the "Adviser" or "JPMIM" and together with its affiliates "J.P. Morgan"), owns a special limited partner interest in the Operating Partnership.', jpm, f('JPMREIT', 'J.P. Morgan Real Estate Income Trust, Inc.'))).toBeNull();
    // A long list of names in capitals reads at once: an earlier form of the "and the other lenders" rule backtracked
    // for 68 seconds on four such names and held SPLC BAC.
    const caps = `CREDIT AGREEMENT among MASTEC, INC., as Borrower, BANK OF AMERICA, N.A., ${'JPMORGANCHASEBANK, '.repeat(4)}AS AGENT.`;
    const t0 = Date.now();
    classify(caps, bac, f('MTZ', 'MASTEC INC'));
    expect(Date.now() - t0).toBeLessThan(500);
    // A bank leaving the facility is no lender.
    expect(classify('"Exiting Lenders" means each of (i) First-Citizens Bank & Trust Company, and (ii) Bank of America, N.A., each in its capacity as a Lender, and in each case who is a signatory hereto as an "Exiting Lender".', bac)).not.toEqual({ role: 'lender' });
  });

  it('competitors, stakes, products, careers and lawsuits', () => {
    expect(c('Our principal competitors include NVIDIA Corporation and new well-funded entrants for our in-place associative computing solutions.')).toEqual({ role: 'competitor' });
    expect(c('Apple, Lenovo, Dell, HP, Cherry, and Amazon Basics are our main competitors worldwide for pointing devices.', apple)).toEqual({ role: 'competitor' });
    expect(c("In January 2026, NVIDIA Corporation invested $2 billion in the Company's Class A common stock at a purchase price of $87.20 per share.")).toEqual({ role: 'investment' });
    expect(c('shares were delivered to NVIDIA Corporation in the form of American Depositary Shares in')).toBeNull();
    expect(c('The firm issues credit cards and raises deposits from Apple Card customers.', apple)).toBeNull();
    expect(c('Prior to his tenure at Apple, he served as a partner at McKinsey & Company.', apple)).toBeNull();
    expect(c('The ITC determined that the appropriate relief is an exclusion order prohibiting the entry of infringing devices manufactured by or on behalf of Apple.', apple)).toBeNull();
    expect(c('For example, NVIDIA relies on suppliers such as Taiwan Semiconductor Manufacturing Company for semiconductor fabrication.')).toBeNull();
  });
});

describe("SPLC: the company's own report", () => {
  const ev = { filer: 'NVIDIA CORP', form: '10-K', date: '2026-02-25', path: '1045810/000104581026000021/nvda-20260125.htm' };
  it('suppliers, competitors and unnamed customers', () => {
    const rel = ownRelations(
      [
        'We utilize foundries, such as Taiwan Semiconductor Manufacturing Company Limited, or TSMC, and Samsung Electronics Co., Ltd., or Samsung, to produce our semiconductor wafers.',
        'We engage with independent subcontractors and contract manufacturers such as Hon Hai Precision Industry Co., Ltd., Wistron Corporation, and Fabrinet to perform assembly, testing and packaging of our final products.',
        '[competitors] networking products consisting of switches, network adapters (including DPUs), and cable solutions (including optical modules) include such as AMD, Arista Networks, Broadcom, Cisco Systems, Inc., Hewlett Packard Enterprise Company, Huawei, Intel;',
        'For fiscal year 2026, sales to one direct customer represented 22% of total revenue and sales to another direct customer represented 14% of total revenue.',
        'For fiscal year 2025, sales to one direct customer represented 12% of total revenue and sales to two direct customers each represented 11% of total revenue.',
      ],
      dir,
      { cik: 1045810, names: ['NVIDIA'] },
      ev,
    );
    const of = (role: string) => rel.filter((r) => r.role === role).map((r) => r.ticker ?? r.name);
    expect(of('supplier')).toEqual(['TSM', 'Samsung Electronics', 'Hon Hai Precision', 'Wistron Corp', 'FN']);
    expect(of('competitor')).toEqual(['AMD', 'ANET', 'AVGO', 'CSCO', 'HPE', 'Huawei Technologies', 'INTC']);
    expect(rel.filter((r) => r.role === 'customer').map((r) => [r.name, r.share])).toEqual([
      ['Unnamed direct customer 1', 22],
      ['Unnamed direct customer 2', 14],
    ]);
  });

  it('the tenants of its leases and its unnamed customers (Applied Digital)', () => {
    const rel = ownRelations(
      [
        'During fiscal year 2026, this business segment was comprised of one customer accounting for 59% of our total revenue from continuing operations.',
        'During fiscal year 2026, this business segment was comprised of one customer accounting for 25% of our revenue from continuing operations.',
        'On May 28, 2025, our subsidiaries APLD ELN-02 LLC and APLD ELN-03 LLC each entered into a data center lease (the "ELN-02 Lease" and the "ELN-03 Lease") with CoreWeave, Inc. ("CoreWeave") to deliver an aggregate of 250 MW of capacity to host CoreWeave\'s HPC operations at Polaris Forge 1.',
      ],
      dir,
      { cik: 1144879, names: ['Applied Digital'] },
      { ...ev, filer: 'Applied Digital Corp.' },
    );
    expect(rel.map((r) => [r.role, r.ticker ?? r.name, r.share])).toEqual([
      ['customer', 'Unnamed customer 1', 59],
      ['customer', 'Unnamed customer 2', 25],
      ['customer', 'CRWV', undefined],
    ]);
  });

  it('named customers with their shares', () => {
    const rel = ownRelations(
      ['During fiscal year 2026, Cisco Systems, Inc., NVIDIA Corporation, Nokia Corporation and Amazon.com, Inc. contributed 19.9%, 16.3%, 10.7% and 10.5%, respectively, of our revenues.'],
      dir,
      { cik: 1408710, names: ['Fabrinet'] },
      { ...ev, filer: 'Fabrinet' },
    );
    expect(rel.map((r) => [r.ticker, r.share, r.basis])).toEqual([
      ['CSCO', 19.9, 'target-revenue'],
      ['NVDA', 16.3, 'target-revenue'],
      ['NOK', 10.7, 'target-revenue'],
      ['AMZN', 10.5, 'target-revenue'],
    ]);
  });

  it("a customer named for a segment's revenue, without the company's share", () => {
    const rel = ownRelations(['For fiscal year 2026, NVIDIA Corporation accounted for 31% of our Optical segment revenue.'], dir, { cik: 1408710, names: ['Fabrinet'] }, { ...ev, filer: 'Fabrinet' });
    expect(rel.map((r) => [r.ticker, r.role, r.share])).toEqual([['NVDA', 'customer', undefined]]);
  });

  it('merges the statements about one company, the latest share first', () => {
    const base = { key: 'cik:1408710', name: 'Fabrinet', role: 'supplier' as const, basis: 'their-revenue' as const, side: 'theirs' as const };
    const at = (sentence: string) => [{ sentence, filer: 'Fabrinet', form: '10-K', date: '2026-08-18', path: 'x' }];
    const merged = mergeRelations([
      { ...base, share: 16.3, evidence: at('During fiscal year 2026, ... contributed 16.3% of our revenues.') },
      { ...base, share: 27.6, evidence: at('During fiscal year 2025, ... contributed 27.6% of our revenues.') },
      { ...base, share: undefined, basis: undefined, side: 'own', evidence: [{ sentence: 'contract manufacturers such as Fabrinet', filer: 'NVIDIA', form: '10-K', date: '2026-02-25', path: 'y' }] },
    ] as Relation[]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ share: 16.3, side: 'both' });
    expect(merged[0].evidence[0].sentence).toContain('2026');
    expect(merged[0].evidence).toHaveLength(3);
  });
});

describe('SPLC: the search', () => {
  it("reads the SEC full-text search's hits and keeps each company's latest report", () => {
    const hit = (cik: string, adsh: string, file: string, display: string, date: string, score: number) => ({ _id: `${adsh}:${file}`, _score: score, _source: { ciks: [cik], display_names: [display], form: '10-K', file_date: date } });
    const text = JSON.stringify({
      hits: {
        hits: [
          hit('0001408710', '0001408710-26-000028', 'fn-20260626.htm', 'Fabrinet  (FN)  (CIK 0001408710)', '2026-08-18', 9),
          hit('0001408710', '0001408710-25-000039', 'fn-20250627.htm', 'Fabrinet  (FN)  (CIK 0001408710)', '2025-08-19', 11),
          hit('0001375365', '0001375365-26-000022', 'smci-20260630.htm', 'Super Micro Computer, Inc.  (SMCI, SMCIP)  (CIK 0001375365)', '2026-08-31', 5),
          hit('0001045810', '0001045810-26-000021', 'nvda-20260125.htm', 'NVIDIA CORP  (NVDA)  (CIK 0001045810)', '2026-02-25', 12),
          { _id: 'bad', _source: {} },
        ],
      },
    });
    const hits = parseFts(text)!;
    expect(hits).toHaveLength(4);
    expect(hits[2]).toMatchObject({ cik: 1375365, name: 'Super Micro Computer, Inc.', tickers: ['SMCI', 'SMCIP'], path: '1375365/000137536526000022/smci-20260630.htm' });
    const filers = rankFilers([hits, hits.slice(0, 1)], 1045810, 10);
    expect(filers.map((f) => [f.cik, f.date, f.terms])).toEqual([
      [1408710, '2026-08-18', 2],
      [1375365, '2026-08-31', 1],
    ]);
    expect(parseFts('not json')).toBeNull();
  });
});

describe('SPLC: the main process', () => {
  it('builds only the searches and documents the app makes', () => {
    expect(main.ftsUrl('accounted for|NVIDIA Corporation', Date.parse('2026-10-20T12:00:00Z'))).toBe(
      'https://efts.sec.gov/LATEST/search-index?q=%22NVIDIA%20Corporation%22%20%22accounted%20for%22&forms=10-K,20-F,40-F,10-Q&dateRange=custom&startdt=2024-10-20&enddt=2026-10-20',
    );
    // IPO prospectuses over three years, and the second page of hits.
    expect(main.ftsUrl('customer|NVIDIA Corporation|prospectus|100', Date.parse('2026-10-20T12:00:00Z'))).toBe(
      'https://efts.sec.gov/LATEST/search-index?q=%22NVIDIA%20Corporation%22%20customer&forms=S-1,F-1,424B4&dateRange=custom&startdt=2023-10-20&enddt=2026-10-20&from=100',
    );
    expect(main.ftsUrl('customer|NVIDIA Corporation|other')).toBeNull();
    expect(main.ftsUrl('customer|NVIDIA Corporation|reports|500')).toBeNull();
    expect(main.ftsUrl('customer|NVIDIA Corporation|reports|150')).toBeNull();
    // The name alone; two years of current reports (8-K and their exhibits); one filer's documents.
    expect(main.ftsUrl('|Applied Digital|reports', Date.parse('2026-10-20T12:00:00Z'))).toContain('q=%22Applied%20Digital%22&forms=10-K,20-F,40-F,10-Q&');
    expect(main.ftsUrl('|Applied Digital|current|0|1144879', Date.parse('2026-10-20T12:00:00Z'))).toBe(
      'https://efts.sec.gov/LATEST/search-index?q=%22Applied%20Digital%22&forms=8-K&dateRange=custom&startdt=2024-10-20&enddt=2026-10-20&ciks=0001144879',
    );
    expect(main.ftsUrl('lease|Applied Digital|current|200', Date.parse('2026-10-20T12:00:00Z'))).toContain('&from=200');
    expect(main.ftsUrl('|Applied Digital|current|0|0123')).toBeNull();
    expect(main.ftsUrl('|Applied Digital|current|0|1144879|x')).toBeNull();
    expect(main.ftsUrl('suppliers|Apple Inc', Date.parse('2026-10-20'))).toContain('q=%22Apple%20Inc%22%20suppliers');
    expect(main.ftsUrl('anything|NVIDIA')).toBeNull();
    expect(main.ftsUrl('suppliers|"NVIDIA" OR x')).toBeNull();
    expect(main.docUrl('1408710/000140871026000028/fn-20260626.htm')).toBe('https://www.sec.gov/Archives/edgar/data/1408710/000140871026000028/fn-20260626.htm');
    expect(main.docUrl('../../etc/passwd')).toBeNull();
    expect(main.docUrl('1408710/000140871026000028/fn.exe')).toBeNull();
    expect(main.cleanNames(['NVIDIA', 'NVIDIA Corporation', '<script>', 7])).toEqual(['NVIDIA', 'NVIDIA Corporation']);
    expect(main.cleanNames([])).toBeNull();
  });

  it('turns a filing into sentences that keep "Inc." and "U.S." inside', () => {
    const html = '<html><head><style>p{}</style></head><body><p>During fiscal year 2026, Cisco Systems, Inc., NVIDIA&#160;Corporation and Amazon.com, Inc. contributed 19.9%, 16.3% and 10.5%, respectively, of our revenues. We sell in the U.S. and Europe.</p><table><tr><td>NVIDIA Corporation</td><td>16.3 %</td></tr></table><p>Apple Pay is mentioned here, and our competitors include Apple&#8217;s products.</p></body></html>';
    const text = main.htmlToText(html);
    const sentences = main.splitSentences(text);
    expect(sentences[0]).toBe('During fiscal year 2026, Cisco Systems, Inc., NVIDIA Corporation and Amazon.com, Inc. contributed 19.9%, 16.3% and 10.5%, respectively, of our revenues.');
    expect(sentences[1]).toBe('We sell in the U.S. and Europe.');
    expect(main.mentionSentences(text, ['NVIDIA'])).toEqual([sentences[0]]);
    expect(main.mentionSentences(text, ['Apple'])).toEqual(["Apple Pay is mentioned here, and our competitors include Apple's products."]);
  });

  it("keeps a report's concentration sentences with two-digit shares and its tenants' leases", () => {
    const text = [
      'HPC Hosting Business',
      'During fiscal year 2026, this business segment was comprised of one customer accounting for 59% of our total revenue from continuing operations. No other customers accounted for more than 10% of revenue.',
      'On May 28, 2025, our subsidiaries APLD ELN-02 LLC and APLD ELN-03 LLC each entered into a data center lease with CoreWeave, Inc. ("CoreWeave") to deliver an aggregate of 250 MW of capacity to host CoreWeave\'s HPC operations at Polaris Forge 1.',
      'We lease our headquarters in Dallas.',
    ].join('\n');
    const own = main.ownSentences(text);
    expect(own.some((x) => x.includes('accounting for 59%'))).toBe(true);
    expect(own.some((x) => x.includes('lease with CoreWeave'))).toBe(true);
    expect(own.some((x) => x.includes('headquarters'))).toBe(false);
  });

  it("collects a report's list of competitors", () => {
    const text = 'Competition\nOur current competitors include:\nsuppliers of GPUs, such as Advanced Micro Devices, Inc., or AMD, and Intel Corporation;\nnetworking products include such as Arista Networks and Broadcom; and\nWe believe we compete well.';
    const own = main.ownSentences(text);
    expect(own.filter((s) => s.startsWith('[competitors]'))).toEqual([
      '[competitors] suppliers of GPUs, such as Advanced Micro Devices, Inc., or AMD, and Intel Corporation;',
      '[competitors] networking products include such as Arista Networks and Broadcom; and',
    ]);
  });

  it('reads a paragraph wrapped over several source lines as one', () => {
    const html = '<P>today announced it has entered into a new long-term lease agreement\nat Delta Forge 2, a purpose-built AI Factory campus. The lease is with a U.S. based high investment-grade\nhyperscaler.</P><pre>First line of a\nwrapped paragraph.\n\nSecond paragraph.</pre>';
    const sentences = main.splitSentences(main.htmlToText(html));
    expect(sentences).toContain('The lease is with a U.S. based high investment-grade hyperscaler.');
    expect(sentences).toContain('First line of a wrapped paragraph.');
    expect(sentences).toContain('Second paragraph.');
  });

  it("keeps a company's own agreements, purchases and dependencies", () => {
    const text = [
      'On October 22, 2025, we entered into an approximately 15-year lease with a U.S.-based investment-grade hyperscaler for 200 MW of critical IT load at the campus.',
      'In addition, through our partnership with Base Electron Corporation ("Base Electron"), an independent power producer, we are pursuing the development of approximately 1.2 GW of generation.',
      'We purchase substantially all of our GPUs from NVIDIA.',
      'We rely on TSMC to manufacture our wafers.',
      'We lease our headquarters in Dallas.',
    ].join('\n');
    const own = main.ownSentences(text);
    expect(own).toHaveLength(4);
    expect(own.some((x) => x.includes('headquarters'))).toBe(false);
  });

  it('keeps extracted sentences a month, reading them again after the extraction changes', () => {
    expect(new main.SentenceStore().key('own', 'p')).toBe(`${main.EXTRACTION}|own|p|`);
    const store = new main.SentenceStore(2);
    const now = Date.parse('2026-10-21');
    store.set('a', { at: now, sentences: ['x'] });
    store.set('b', { at: now, sentences: ['y'] });
    store.set('c', { at: now, sentences: ['z'] });
    expect(store.get('a', now)).toBeUndefined();
    expect(store.get('c', now)?.sentences).toEqual(['z']);
    expect(store.get('c', now + 31 * 86_400_000)).toBeUndefined();
    const copy = new main.SentenceStore();
    copy.load(JSON.parse(JSON.stringify(store)), now);
    expect(copy.get('b', now)?.sentences).toEqual(['y']);
  });
});
