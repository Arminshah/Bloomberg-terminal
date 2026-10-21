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
    expect(targetNames('NBIS', 'Nebius Group N.V.')).toEqual({ legal: ['Nebius Group N.V.'], names: ['Nebius Group', 'Nebius'] });
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

  it('a reseller of its products is a customer', () => {
    expect(c('For example, sales of Apple Inc. products and services comprised approximately 12%, 12%, and 11% of our total revenue for fiscal years 2025, 2024, and 2023, respectively and sales from HP, Inc. comprised approximately 10% of our total revenue for fiscal year 2025.', apple)).toMatchObject({ role: 'customer', share: 12, basis: 'their-product-sales' });
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
      'https://efts.sec.gov/LATEST/search-index?q=%22NVIDIA%20Corporation%22%20%22accounted%20for%22&forms=10-K,20-F,40-F&dateRange=custom&startdt=2025-04-20&enddt=2026-10-20',
    );
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

  it("collects a report's list of competitors", () => {
    const text = 'Competition\nOur current competitors include:\nsuppliers of GPUs, such as Advanced Micro Devices, Inc., or AMD, and Intel Corporation;\nnetworking products include such as Arista Networks and Broadcom; and\nWe believe we compete well.';
    const own = main.ownSentences(text);
    expect(own.filter((s) => s.startsWith('[competitors]'))).toEqual([
      '[competitors] suppliers of GPUs, such as Advanced Micro Devices, Inc., or AMD, and Intel Corporation;',
      '[competitors] networking products include such as Arista Networks and Broadcom; and',
    ]);
  });

  it('keeps extracted sentences a month', () => {
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
