// Test entrypoint only; desktop-e2e is excluded from the packaged application's build.files.
// Install isolation before importing production main: even its first provider/status request is local.
const { app, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const profile = process.env.ARMIN_DESKTOP_TEST_PROFILE;
if (!profile || !path.isAbsolute(profile) || !fs.statSync(profile).isDirectory()) throw new Error('Desktop tests require an existing disposable ARMIN_DESKTOP_TEST_PROFILE directory.');
const sessionData = path.join(profile, 'session');
fs.mkdirSync(sessionData, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', sessionData);
// Provider .env discovery is the sole production caller. Assets/preload still resolve from main's __dirname.
app.getAppPath = () => profile;

const researchTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/yahoo-research.json'), 'utf8'));
// APLD's research as Yahoo answered it: the earningsTrend with the consensus 7 to 90 days before and the revisions
// (EEG), and its reported quarters (EM).
const apldSummary = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/yahoo-apld-summary.json'), 'utf8')).quoteSummary.result[0];
const trendTemplate = apldSummary.earningsTrend.trend;
// Nasdaq's dividend calendar of 30 Oct 2026 and its split calendar, as answered (CACT, fixtures.corpCalendar).
const dividendTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/nasdaq-dividends-2026-10-30.json'), 'utf8'));
const splitsTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/nasdaq-splits-2026-10-26.json'), 'utf8'));
// FINRA's short interest settlement of 30 Sep 2026, trimmed to 43 listings (SIA, fixtures.marketShorts).
// FRED's answers as given: housing starts' description and 2025-26 values, and a search for consumer prices (ECOW,
// fixtures.fredChart).
// Yahoo's daily closes of two crude oil contract months, 28 September to 26 October 2026 (CCRV, fixtures.futuresCurve).
const crudeSpark = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/yahoo-spark-cl-2026-10.json'), 'utf8'));
// Yahoo's month-end closes of the Dow and the 30 members the app keeps for it, ten years to 23 October 2026 (EQBT,
// fixtures.monthly).
// Congress.gov's answers of 26 October 2026: the latest bills, the 119th Congress's laws and H.R. 7831 with its
// parts (BILL, fixtures.congressGov).
const congressGov = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/congressgov-2026-10.json'), 'utf8'));
const dowMonthly = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/yahoo-monthly-dow-2026-10.json'), 'utf8'));
const fredFixture = (name) => fs.readFileSync(path.join(__dirname, `../tests/fixtures/${name}.json`), 'utf8');
// The IMF's October 2026 World Economic Outlook as the DataMapper answered it: GDP growth for 24 economies and groups,
// with the names and the indicators' descriptions (ECFC, fixtures.imf).
const imfWeo = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/imf-weo-2026-10.json'), 'utf8'));
// The IMF's answers for United States goods trade with eight partners and groups by year, and with China by month,
// with its codelist trimmed to the codes used (ECTR, fixtures.imfTrade). Any other economy has no figures.
// Rows of Nasdaq's stock list as it answered on 26 October 2026 (SCREEN over the US list, fixtures.nasdaqList).
const nasdaqList = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/nasdaq-screener-2026-10.json'), 'utf8'));
const imfTrade = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/imf-imts-usa-2026-10.json'), 'utf8'));
const imfNoSeries = { data: { dataSets: [{ structure: 0, action: 'Replace' }], structures: [{}] } };
// OpenFIGI's answers for Alphabet's class A shares: the ticker's share class, and its listings (RELS, fixtures.related).
const googlFigi = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/openfigi-googl.json'), 'utf8'));
const settlementTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/finra-settlement-2026-09-30.json'), 'utf8'));
const currencyTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/sec-currency-change.json'), 'utf8'));
const chartTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/yahoo-sofi-chart.json'), 'utf8'));
const tipranksTools = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/tipranks-tools.json'), 'utf8')).tools;
const fullFinnhubKey = 'abcd1234efgh5678ij90abcd1234efgh5678kl12';
const fixtures = { tradeAgeMs: 0, optionPageFailure: false, optionMalformed: false, optionContractCount: 1, researchPartial: false, researchBlocked: false, profileMissing: false, mixedEstimateCurrencies: false, equiblesRefusal: false, newsStories: false, newsAgeMs: 3_600_000, calls: { fmp: 0, marketaux: 0, alpaca: [], options: [], alpacaNews: [], google: [], finnhub: [], equibles: [], yahoo: [], tipranks: [] } };
globalThis.__desktopFixtures = fixtures;
// With fixtures.listingsDown, Nasdaq's stock list fails and Yahoo's quotes carry the week's trading instead: last price
// and shares traded as the stock list would give them (fixtures.weekCalendar).
const WEEK_QUOTES = { BFST: [31.94, 176841], KO: [70.1, 17000000], SOFI: [14.77, 41048438], GOOG: [250, 20000000], GOOGL: [251, 30000000] };

/** A ZIP archive holding one file, stored without compression, as the House Clerk's index archives hold their list. */
function storedZip(name, data) {
  const zlib = require('node:zlib');
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const end = Buffer.alloc(22);
  const centralAt = local.length + nameBuf.length + data.length;
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(centralAt, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, end]);
}
fixtures.dataAccuracy = false;
fixtures.extendedHours = false;
net.fetch = async (input, init) => {
  const url = new URL(String(input));
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  // With fixtures.supplyChain, SPLC's full-text search and three annual reports (electron/supply-chain.cjs).
  if (fixtures.supplyChain && url.hostname === 'www.sec.gov' && url.pathname === '/files/company_tickers.json') return json({ 0: { cik_str: 1513845, ticker: 'NBIS', title: 'Nebius Group N.V.' } });
  if (fixtures.fredChart && url.hostname === 'api.stlouisfed.org') {
    fixtures.calls.fred = [...(fixtures.calls.fred ?? []), url.pathname + url.search.replace(/([?&]api_key=)[^&]*/, '$1<key>')];
    const text = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    const id = url.searchParams.get('series_id');
    if (url.pathname === '/fred/series/search') return text(fredFixture('fred-search-cpi'));
    if (url.pathname === '/fred/series' && id === 'HOUST') return text(fredFixture('fred-series-houst'));
    if (url.pathname === '/fred/series/observations' && id === 'HOUST' && url.searchParams.get('units') === 'lin') return text(fredFixture('fred-houst-2025'));
    if (url.pathname === '/fred/series/observations') return json({ count: 0, observations: [] });
    return json({ seriess: [] });
  }
  if (fixtures.imf && url.hostname === 'www.imf.org') {
    fixtures.calls.imf = [...(fixtures.calls.imf ?? []), url.pathname];
    const part = url.pathname.replace('/external/datamapper/api/v1/', '');
    if (part === 'NGDP_RPCH') return json(imfWeo.values);
    if (part === 'countries' || part === 'groups' || part === 'indicators') return json(imfWeo[part]);
    // The fixture holds GDP growth only: the other indicators answer with no figures.
    return json({ values: {} });
  }
  if (fixtures.congressGov && url.hostname === 'api.congress.gov') {
    const h = init?.headers;
    const key = typeof h?.get === 'function' ? h.get('X-Api-Key') : (h?.['X-Api-Key'] ?? h?.['x-api-key']);
    fixtures.calls.congressGov = [...(fixtures.calls.congressGov ?? []), { path: url.pathname + url.search, keyed: !!key }];
    const p = url.pathname.replace(/^\/v3/, '');
    if (p === '/bill') return json(congressGov.bills);
    if (p === '/law/119') return json(congressGov.laws);
    if (p === '/bill/119/hr/7831') return json(congressGov.bill.detail);
    const part = /^\/bill\/119\/hr\/7831\/(actions|summaries|subjects|committees|cosponsors|text)$/.exec(p);
    if (part) return json(congressGov.bill[part[1]]);
    return new Response(JSON.stringify({ error: 'Unknown resource' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  if (fixtures.imfTrade && url.hostname === 'api.imf.org') {
    fixtures.calls.imf = [...(fixtures.calls.imf ?? []), url.pathname + url.search];
    if (url.pathname.endsWith('/codelist/IMF.STA/CL_IMTS_COUNTRY/+')) return json(imfTrade.areas);
    const key = url.pathname.split('/IMTS/+/')[1] ?? '';
    if (key === 'USA.XG_FOB_USD%2BMG_CIF_USD.*.A') return json(imfTrade.annual);
    if (key === 'USA.XG_FOB_USD%2BMG_CIF_USD.CHN.M') return json(imfTrade.monthly);
    return json(imfNoSeries);
  }
  // With fixtures.thirteenF, EDGAR's search for 13F filings (FLNG) finds the fixture's June 2026 report.
  if (fixtures.thirteenF && url.hostname === 'efts.sec.gov' && url.searchParams.get('forms') === '13F-HR') {
    fixtures.calls.sec13f = [...(fixtures.calls.sec13f ?? []), `efts?${url.searchParams}`];
    const hit = { _id: '0001513845-26-000065:primary_doc.xml', _source: { adsh: '0001513845-26-000065', ciks: ['0001513845'], display_names: ['NVIDIA CORP  (CIK 0001513845)'], form: '13F-HR', root_forms: ['13F-HR'], file_date: '2026-08-14', period_ending: '2026-06-30' } };
    return json({ hits: { total: { value: 1, relation: 'eq' }, hits: [hit] } });
  }
  if (fixtures.supplyChain && url.hostname === 'efts.sec.gov') {
    fixtures.calls.fts = [...(fixtures.calls.fts ?? []), url.searchParams.get('q')];
    const hit = (cik, adsh, file, display, date) => ({ _id: `${adsh}:${file}`, _score: 5, _source: { ciks: [cik], display_names: [display], form: '10-K', file_date: date } });
    return json({ hits: { total: { value: 2 }, hits: [hit('0001408710', '0001408710-26-000028', 'fn-20260626.htm', 'Fabrinet  (FN)  (CIK 0001408710)', '2026-08-18'), hit('0002222222', '0002222222-26-000004', 'excl-20251231.htm', 'Example Cloud Inc.  (EXCL)  (CIK 0002222222)', '2026-03-02')] } });
  }
  if (fixtures.supplyChain && url.hostname === 'www.sec.gov' && url.pathname.startsWith('/Archives/edgar/data/')) {
    const docs = {
      '/Archives/edgar/data/1408710/000140871026000028/fn-20260626.htm': '<p>During fiscal year 2026, Cisco Systems, Inc., Nebius Group N.V. and Amazon.com, Inc. contributed 19.9%, 12.5% and 10.5%, respectively, of our revenues.</p>',
      '/Archives/edgar/data/2222222/000222222226000004/excl-20251231.htm': '<p>We currently rely on Nebius for the GPU capacity we rent to our customers.</p>',
      '/Archives/edgar/data/1513845/000151384526000001/synthetic-annual.htm': '<p>Our key suppliers include NVIDIA Corporation and Dell Technologies Inc. for servers.</p><p>Our competitors include Microsoft Corporation and CoreWeave, Inc. in AI cloud services.</p><p>For fiscal year 2025, sales to one customer represented 12% of total revenue.</p>',
    };
    const body = docs[url.pathname];
    if (body) return new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }
  // With fixtures.related, Alphabet's tickers as the SEC lists them under its CIK.
  if (fixtures.related && url.hostname === 'www.sec.gov' && url.pathname === '/files/company_tickers.json') return json({ 0: { cik_str: 1652044, ticker: 'GOOGL', title: 'Alphabet Inc.' }, 1: { cik_str: 1652044, ticker: 'GOOG', title: 'Alphabet Inc.' }, 2: { cik_str: 1513845, ticker: 'NBIS', title: 'Synthetic currency-switch fixture' }, 3: { cik_str: 1652044, ticker: 'GOOGN', title: 'Alphabet Inc.' }, 4: { cik_str: 1652044, ticker: 'GOOGM', title: 'Alphabet Inc.' } });
  if (url.hostname === 'www.sec.gov' && url.pathname === '/files/company_tickers.json') return json({ 0: { cik_str: 1513845, ticker: 'NBIS', title: 'Synthetic currency-switch fixture' } });
  if (url.hostname === 'data.sec.gov') {
    if (url.pathname.includes('/companyfacts/')) return json(currencyTemplate);
    // With fixtures.insiders, two Form 4 filings of the last weeks (electron/sec.cjs ownership-xml).
    const recent = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const four = fixtures.insiders ? { accessionNumber: ['0001513845-26-000011', '0001513845-26-000010'], form: ['4', '4'], filingDate: [recent(3), recent(20)], reportDate: [recent(5), recent(22)], primaryDocument: ['xslF345X05/form4-sale.xml', 'xslF345X05/form4-award.xml'] } : { accessionNumber: [], form: [], filingDate: [], reportDate: [], primaryDocument: [] };
    // With fixtures.thirteenF, two 13F-HR filings: NVIDIA's for the first two quarters of 2026, as filed (tests/fixtures/13f).
    if (fixtures.thirteenF) {
      four.accessionNumber.push('0001513845-26-000065', '0001513845-26-000042');
      four.form.push('13F-HR', '13F-HR');
      four.filingDate.push('2026-08-14', '2026-05-15');
      four.reportDate.push('2026-06-30', '2026-03-31');
      four.primaryDocument.push('xslForm13F_X02/primary_doc.xml', 'xslForm13F_X02/primary_doc.xml');
    }
    return json({ cik: 1513845, name: 'Synthetic currency-switch fixture', tickers: ['NBIS'], exchanges: ['Nasdaq'], fiscalYearEnd: '1231', filings: { recent: {
      accessionNumber: [...four.accessionNumber, '0001513845-26-000002', '0001513845-26-000001'], form: [...four.form, '6-K', '20-F'], filingDate: [...four.filingDate, '2026-10-01', '2026-04-30'], reportDate: [...four.reportDate, '2026-10-01', '2025-12-31'], primaryDocument: [...four.primaryDocument, 'synthetic-current.htm', 'synthetic-annual.htm'],
    }, files: [] } });
  }
  // With fixtures.ecbFx, the ECB's reference rates as published for 25 to 30 June 2026 (tests/fixtures/ecb-exr-2026-06.csv).
  if (fixtures.ecbFx && url.hostname === 'data-api.ecb.europa.eu' && url.pathname.startsWith('/service/data/EXR/')) {
    fixtures.calls.ecbFx = [...(fixtures.calls.ecbFx ?? []), url.pathname + url.search];
    return new Response(fs.readFileSync(path.join(__dirname, '../tests/fixtures/ecb-exr-2026-06.csv'), 'utf8'), { status: 200, headers: { 'Content-Type': 'text/csv' } });
  }
  // With fixtures.congress: the House Clerk's member list, index and reports and the Senate's member list, from the
  // documents as published (tests/fixtures/congress), and FMP's latest trades of each chamber.
  if (fixtures.congress) {
    const dir = path.join(__dirname, '../tests/fixtures/congress');
    const year = new Date().getUTCFullYear();
    const ago = (days) => new Date(Date.now() - days * 86_400_000);
    const us = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
    const iso = (d) => d.toISOString().slice(0, 10);
    const xml = (file) => new Response(fs.readFileSync(path.join(dir, file), 'utf8'), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    if (url.hostname === 'clerk.house.gov' && url.pathname === '/xml/lists/MemberData.xml') return xml('house-members-excerpt.xml');
    if (url.hostname === 'www.senate.gov' && url.pathname === '/general/contact_information/senators_cfm.xml') return xml('senators-excerpt.xml');
    if (url.hostname === 'disclosures-clerk.house.gov') {
      fixtures.calls.congress = [...(fixtures.calls.congress ?? []), url.pathname];
      const zip = /^\/public_disc\/financial-pdfs\/(\d{4})FD\.zip$/.exec(url.pathname);
      if (zip) {
        const y = Number(zip[1]);
        const line = (last, first, type, seat, yr, filed, doc) => ['Hon.', last, first, '', type, seat, yr, filed, doc].join('\t');
        const lines = ['Prefix\tLast\tFirst\tSuffix\tFilingType\tStateDst\tYear\tFilingDate\tDocID'];
        if (y === year) lines.push(line('Fields', 'Cleo', 'P', 'LA06', year, us(ago(3)), '20035669'), line('McCaul', 'Michael T.', 'P', 'TX10', year, us(ago(5)), '9116378'), line('Pelosi', 'Nancy', 'P', 'CA11', year, us(ago(10)), '20035143'));
        if (y === year - 1) lines.push(line('Pelosi', 'Nancy', 'O', 'CA11', year - 1, us(ago(150)), '10075701'), line('Mast', 'Brian', 'O', 'FL21', year - 1, us(ago(100)), '10076430'));
        return new Response(storedZip(`${y}FD.txt`, Buffer.from(lines.join('\r\n'), 'utf8')), { status: 200, headers: { 'Content-Type': 'application/x-zip-compressed' } });
      }
      const pdf = /^\/public_disc\/(ptr-pdfs|financial-pdfs)\/\d{4}\/(\d+)\.pdf$/.exec(url.pathname);
      const file = pdf && (pdf[1] === 'ptr-pdfs' ? `${pdf[2]}.pdf` : `annual-${pdf[2]}.pdf`);
      if (file && fs.existsSync(path.join(dir, file))) return new Response(fs.readFileSync(path.join(dir, file)), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      return new Response('', { status: 404 });
    }
    if (url.hostname === 'financialmodelingprep.com' && (url.pathname === '/stable/senate-latest' || url.pathname === '/stable/house-latest')) {
      const row = (o) => ({ firstName: '', lastName: '', office: '', district: '', owner: '', assetType: 'Stock', comment: '', ...o });
      if (url.pathname === '/stable/senate-latest') {
        return json([
          row({ symbol: 'NVDA', senateID: 'B001236', disclosureDate: iso(ago(4)), transactionDate: iso(ago(20)), firstName: 'John', lastName: 'Boozman', owner: 'Joint', assetDescription: 'NVIDIA Corporation - Common Stock', type: 'Purchase', amount: '$1,001 - $15,000', link: 'https://efdsearch.senate.gov/search/view/ptr/fixture-boozman/' }),
          row({ symbol: 'WMB', senateID: 'A000383', disclosureDate: iso(ago(6)), transactionDate: iso(ago(40)), firstName: 'Alan', lastName: 'Armstrong', owner: 'Joint', assetDescription: 'Williams Companies, Inc. (The) Common Stock', type: 'Sale (Full)', amount: '$250,001 - $500,000', link: 'https://efdsearch.senate.gov/search/view/ptr/fixture-armstrong/' }),
        ]);
      }
      return json([
        // A report the app reads itself: FMP's line of it is left out.
        row({ symbol: 'NVDA', senateID: 'F000110', disclosureDate: iso(ago(3)), transactionDate: '2026-10-01', firstName: 'Cleo', lastName: 'Fields', district: 'LA06', assetDescription: 'NVIDIA Corporation', type: 'Purchase', amount: '$1,001 - $15,000', link: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/20035669.pdf` }),
        // A report filed on paper: FMP's line of it is the only one.
        row({ symbol: 'MSFT', senateID: 'M001157', disclosureDate: iso(ago(5)), transactionDate: iso(ago(30)), firstName: 'Michael', lastName: 'McCaul', district: 'TX10', owner: 'Spouse', assetDescription: 'Microsoft Corporation', type: 'Sale', amount: '$15,001 - $50,000', link: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/9116378.pdf` }),
      ]);
    }
  }
  if (fixtures.thirteenF && url.hostname === 'www.sec.gov') {
    const m = /^\/Archives\/edgar\/data\/1513845\/0001513845260000(65|42)\/(primary_doc\.xml|index\.json|information_table\.xml)$/.exec(url.pathname);
    if (m) {
      fixtures.calls.sec13f = [...(fixtures.calls.sec13f ?? []), url.pathname];
      const quarter = m[1] === '65' ? 'nvda-2026q2' : 'nvda-2026q1';
      if (m[2] === 'index.json') return json({ directory: { item: [{ name: `0001513845-26-0000${m[1]}-index.html` }, { name: 'information_table.xml' }, { name: 'primary_doc.xml' }] } });
      const file = path.join(__dirname, '../tests/fixtures/13f', `${quarter}-${m[2] === 'primary_doc.xml' ? 'primary' : 'infotable'}.xml`);
      return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }
  }
  // OpenFIGI's tickers for the CUSIPs in those filings, as OpenFIGI answered them on 25 October 2026.
  if (fixtures.related && url.hostname === 'api.openfigi.com' && url.pathname === '/v3/mapping') {
    const jobs = JSON.parse(String(init?.body ?? '[]'));
    fixtures.calls.openfigi = [...(fixtures.calls.openfigi ?? []), { jobs, keyed: new Headers(init?.headers).has('X-OPENFIGI-APIKEY') }];
    if (jobs[0]?.idType === 'TICKER') return json(jobs[0].idValue === 'GOOGL' ? googlFigi.ticker : [{ warning: 'No identifier found.' }]);
    if (jobs[0]?.idType === 'ID_BB_GLOBAL_SHARE_CLASS_LEVEL' && jobs[0].idValue === 'BBG009S39JY5') return json(googlFigi.shareClass);
    return json(jobs.map(() => ({ warning: 'No identifier found.' })));
  }
  if (fixtures.thirteenF && url.hostname === 'api.openfigi.com' && url.pathname === '/v3/mapping') {
    const jobs = JSON.parse(String(init?.body ?? '[]'));
    const keyed = new Headers(init?.headers).has('X-OPENFIGI-APIKEY');
    fixtures.calls.openfigi = [...(fixtures.calls.openfigi ?? []), { jobs, keyed }];
    const tickers = { '037833100': 'AAPL', '19247G107': 'COHR', '21873S108': 'CRWV', '370920100': 'GENB', '458140100': 'INTC', N97284108: 'NBIS', '654902204': 'NOK', '84615Q103': 'SPCX', '871607107': 'SNPS' };
    return json(jobs.map((j) => {
      const ticker = tickers[j.idValue];
      // A foreign issue's code answers only when asked for as a CINS.
      if (!ticker || (/^[A-Z]/.test(j.idValue) && j.idType !== 'ID_CINS')) return { warning: 'No identifier found.' };
      return { data: [{ figi: 'BBG000000000', name: ticker, ticker, exchCode: 'US', compositeFIGI: 'BBG000000000', securityType: 'Common Stock', marketSector: 'Equity', securityType2: 'Common Stock' }] };
    }));
  }
  if (fixtures.insiders && url.hostname === 'www.sec.gov' && /^\/Archives\/edgar\/data\/1513845\/\d{18}\/form4-(sale|award)\.xml$/.test(url.pathname)) {
    const day = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const line = (date, code, shares, price, ad, after) => `<nonDerivativeTransaction><securityTitle><value>Class A Ordinary Shares</value></securityTitle><transactionDate><value>${date}</value></transactionDate><transactionCoding><transactionFormType>4</transactionFormType><transactionCode>${code}</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>${shares}</value></transactionShares><transactionPricePerShare>${price === null ? '<footnoteId id="F1"/>' : `<value>${price}</value>`}</transactionPricePerShare><transactionAcquiredDisposedCode><value>${ad}</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>${after}</value></sharesOwnedFollowingTransaction></postTransactionAmounts><ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction>`;
    const owner = (cik, name, title) => `<reportingOwner><reportingOwnerId><rptOwnerCik>${cik}</rptOwnerCik><rptOwnerName>${name}</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>${title}</officerTitle></reportingOwnerRelationship></reportingOwner>`;
    const sale = url.pathname.endsWith('sale.xml');
    const body = sale
      ? `<aff10b5One>1</aff10b5One>${owner('0001900002', 'VOLOZH ARKADY', 'Chief Executive Officer')}<nonDerivativeTable>${line(day(6), 'S', 25000, 160.4, 'D', 1475000)}${line(day(5), 'P', 1000, 158, 'A', 1476000)}</nonDerivativeTable>`
      : `${owner('0001900003', 'BOYNTON OPHIR', 'Chief Financial Officer')}<nonDerivativeTable>${line(day(22), 'A', 12000, null, 'A', 212000)}</nonDerivativeTable>`;
    return new Response(`<?xml version="1.0"?><ownershipDocument><schemaVersion>X0508</schemaVersion><documentType>4</documentType>${body}</ownershipDocument>`, { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }
  if (url.hostname === 'fc.yahoo.com') return new Response(null, { status: 404 });
  if (url.hostname === 'query2.finance.yahoo.com') {
    fixtures.calls.yahoo.push(url.pathname + url.search.replace(/([?&]crumb=)[^&]*/g, '$1<session>'));
    if (url.pathname === '/v1/test/getcrumb') return new Response('synthetic-session-crumb', { headers: { 'Content-Type': 'text/plain' } });
    if (url.pathname === '/v1/finance/search') {
      const symbol = fixtures.dataAccuracy && url.searchParams.get('q') === 'NBIS' ? 'NBIS' : 'APLD';
      // A company's name typed in the command line: the search answers with the company of that name.
      if (/acme\s+widgets/i.test(url.searchParams.get('q') ?? '')) return json({ quotes: [{ symbol: 'WXYZ', quoteType: 'EQUITY', exchange: 'NMS', longname: 'Acme Widgets Inc.' }] });
      return json({ quotes: [{ symbol, quoteType: 'EQUITY', exchange: 'NMS', longname: `Synthetic ${symbol} fixture` }] });
    }
    if (fixtures.dataAccuracy && url.pathname.startsWith('/ws/fundamentals-timeseries/') && url.searchParams.get('type')?.startsWith('quarterly')) {
      return json({ timeseries: { result: [
        ['TotalRevenue', 250000000], ['NetIncomeCommonStockholders', -50000000], ['DilutedEPS', -0.5], ['TotalDebt', 150000000],
      ].map(([key, value]) => ({ meta: { type: [`quarterly${key}`] }, [`quarterly${key}`]: [{ asOfDate: '2026-06-30', periodType: '3M', currencyCode: 'USD', reportedValue: { raw: value } }] })) } });
    }
    if (url.pathname.startsWith('/v10/finance/quoteSummary/')) {
      const symbol = decodeURIComponent(url.pathname.split('/').at(-1));
      if ((url.searchParams.get('modules') ?? '').includes('earningsTrend')) {
        const research = structuredClone(researchTemplate);
        research.quoteSummary.result[0].price.symbol = symbol;
        if (fixtures.mixedEstimateCurrencies) for (const row of research.quoteSummary.result[0].earningsTrend.trend) {
          if (row.revenueEstimate) row.revenueEstimate.revenueCurrency = 'JPY';
          if (row.earningsEstimate) row.earningsEstimate.earningsCurrency = 'USD';
        }
        if (fixtures.apldEarnings) for (const k of ['earningsHistory', 'earnings', 'calendarEvents', 'earningsTrend']) research.quoteSummary.result[0][k] = structuredClone(apldSummary[k]);
        if (fixtures.estimateTrend) for (const row of research.quoteSummary.result[0].earningsTrend.trend) {
          const apld = trendTemplate.find((t) => t.period === row.period);
          if (apld) Object.assign(row, { epsTrend: apld.epsTrend, epsRevisions: apld.epsRevisions });
        }
        return json(research);
      }
      if (fixtures.dataAccuracy) return json({ quoteSummary: { result: [{
        assetProfile: { industry: 'Synthetic fixture industry', companyOfficers: [
          { name: 'Dr. Synthetic Chief', title: 'Chief Executive Officer', age: 50, fiscalYear: 2025, totalPay: { raw: 0 } },
        ] },
        defaultKeyStatistics: { sharesOutstanding: { raw: 100000000 }, floatShares: { raw: 80000000 }, sharesShort: { raw: 12000000 }, dateShortInterest: { raw: 1790899200 } },
        institutionOwnership: { ownershipList: [
          { organization: 'Older Synthetic Holder', position: { raw: 1000000 }, pctHeld: { raw: 0.01 }, pctChange: { raw: 0.1 }, reportDate: { raw: 1743379200 } },
          { organization: 'Recent Synthetic Holder', position: { raw: 2000000 }, pctHeld: { raw: 0.02 }, pctChange: { raw: 0.1 }, reportDate: { raw: 1751241600 } },
        ] },
      }], error: null } });
      return json({ quoteSummary: { result: [fixtures.profileMissing ? {} : { assetProfile: { industry: 'Synthetic fixture industry' }, summaryDetail: { trailingPE: { raw: 20 } } }], error: null } });
    }
    if (url.pathname.startsWith('/v8/finance/chart/')) {
      const chart = structuredClone(chartTemplate);
      const symbol = decodeURIComponent(url.pathname.split('/').at(-1));
      const meta = chart.chart.result[0].meta;
      Object.assign(meta, { symbol, currency: 'USD', exchangeName: 'NMS', instrumentType: 'EQUITY', longName: `Synthetic ${symbol} fixture`, regularMarketPrice: symbol === 'APLD' ? 18 : 123.45, regularMarketTime: Math.floor(Date.now() / 1000) });
      return json(chart);
    }
    // With fixtures.futuresCurve, the first two crude oil months asked for trade at the fixture's last closes (December
    // and January as recorded), expiring 24 and 52 days ahead; the later months have no price.
    const crude = (url.searchParams.get('symbols') ?? '').split(',').filter((x) => /^CL[FGHJKMNQUVXZ]\d\d\.NYM$/.test(x));
    if (fixtures.futuresCurve && crude.length && url.pathname === '/v7/finance/quote') {
      fixtures.crudeMonths ??= crude.slice(0, 2);
      return json({ quoteResponse: { result: crude.map((symbol) => {
        const i = fixtures.crudeMonths.indexOf(symbol);
        return i < 0 ? { symbol, currency: 'USD' } : { symbol, currency: 'USD', regularMarketPrice: [100.9, 98.77][i], regularMarketChange: [-2.37, -2.17][i], expireIsoDate: new Date(Date.now() + [24, 52][i] * 86_400_000).toISOString(), openInterest: [250000, 180000][i], regularMarketVolume: [90000, 40000][i] };
      }) } });
    }
    if (fixtures.monthly && url.pathname === '/v8/finance/spark' && url.searchParams.get('interval') === '1mo') {
      const out = {};
      for (const symbol of (url.searchParams.get('symbols') ?? '').split(',')) if (dowMonthly[symbol]) out[symbol] = dowMonthly[symbol];
      return json(out);
    }
    if (fixtures.futuresCurve && url.pathname === '/v8/finance/spark') {
      const asked = (url.searchParams.get('symbols') ?? '').split(',');
      const out = {};
      for (const symbol of asked) {
        const i = (fixtures.crudeMonths ?? []).indexOf(symbol);
        if (i >= 0) out[symbol] = crudeSpark[['CLZ26.NYM', 'CLF27.NYM'][i]];
      }
      return json(out);
    }
    if (url.pathname === '/v7/finance/quote') return json({ quoteResponse: { result: (url.searchParams.get('symbols') ?? '').split(',').map((symbol) => ({ symbol, regularMarketPrice: symbol === 'APLD' ? 18 : 123.45, regularMarketTime: Math.floor(Date.now() / 1000), currency: 'USD', quoteSourceName: 'Synthetic Real Time Price', exchangeDataDelayedBy: 0,
      ...(fixtures.listingsDown && (WEEK_QUOTES[symbol] || /^AC[A-L]$/.test(symbol)) ? (() => {
        const [price, volume] = WEEK_QUOTES[symbol] ?? [10, (symbol.charCodeAt(2) - 64) * 100000];
        return { regularMarketPrice: price, regularMarketVolume: volume, marketCap: 5e10 };
      })() : {}),
      ...(fixtures.extendedHours ? {
        regularMarketPrice: 123.45, regularMarketTime: Date.parse('2026-10-19T20:00:00Z') / 1000,
        preMarketPrice: 125, preMarketTime: Date.parse('2026-10-20T11:55:00Z') / 1000,
        preMarketChangePercent: (125 / 123.45 - 1) * 100,
        postMarketPrice: 124, postMarketTime: Date.parse('2026-10-19T21:00:00Z') / 1000,
        postMarketChangePercent: (124 / 123.45 - 1) * 100,
        hasPrePostMarketData: true, marketState: 'PRE', exchangeTimezoneName: 'America/New_York',
      } : {}),
    })) } });
  }
  // The market earnings calendar (fixtures.marketCalendar): 3M reported eight days ago, as on an earnings card, with
  // its year- and quarter-earlier reports; a small company below $2B; Meta reports tomorrow; a company only Finnhub
  // lists. Eight days back is before the latest trading day whatever the weekday, so the test reads the same any day.
  const shift = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  // The week EVTS opens on (fixtures.weekCalendar): New York's Monday of this week, or of the coming one at a weekend.
  const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  const nyWeekday = new Date(`${nyDay}T00:00:00Z`).getUTCDay();
  const weekDay = (k) => new Date(Date.parse(`${nyDay}T00:00:00Z`) + ((nyWeekday === 0 ? 1 : nyWeekday === 6 ? 2 : 1 - nyWeekday) + k) * 86_400_000).toISOString().slice(0, 10);
  // Tuesday: three before the open, twelve after the close (two more than are shown); Wednesday: both Alphabet classes.
  const weekRow = (symbol, name, time) => ({ time, symbol, name, marketCap: '$50,000,000,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$1.00', noOfEsts: '5' });
  const lateTuesday = Array.from({ length: 12 }, (_, i) => weekRow(`AC${String.fromCharCode(65 + i)}`, `After Close ${String.fromCharCode(65 + i)} Inc.`, 'time-after-hours'));
  const weekRows = {
    [weekDay(1)]: [weekRow('BFST', 'Business First Bancshares, Inc.', 'time-pre-market'), weekRow('KO', 'Coca-Cola Company (The)', 'time-pre-market'), weekRow('SOFI', 'SoFi Technologies, Inc.', 'time-pre-market'), ...lateTuesday],
    [weekDay(2)]: [weekRow('GOOG', 'Alphabet Inc.', 'time-after-hours'), weekRow('GOOGL', 'Alphabet Inc.', 'time-after-hours')],
  };
  const traded = [['BFST', '31.94', '176841'], ['KO', '70.10', '17000000'], ['SOFI', '14.77', '41048438'], ['GOOG', '250.00', '20000000'], ['GOOGL', '251.00', '30000000'], ...lateTuesday.map((r, i) => [r.symbol, '10.00', String((i + 1) * 100000)])];
  const quarterEnd = (back) => {
    const d = new Date();
    const t = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) - 1 - back;
    return { label: `${['Mar', 'Jun', 'Sep', 'Dec'][t % 4]}/${Math.floor(t / 4)}`, q: (t % 4) + 1, y: Math.floor(t / 4) };
  };
  // FINRA's short interest (fixtures.marketShorts): the latest settlement 26 days back and the one before, whatever
  // the day the test runs; Apple's own record names them.
  if (fixtures.marketShorts && url.hostname === 'api.finra.org') {
    const filters = JSON.parse(String(init?.body ?? '{}')).compareFilters ?? [];
    const latest = shift(-26);
    if (filters.some((f) => f.fieldName === 'symbolCode')) return json([shift(-26), shift(-41)].map((settlementDate) => ({ settlementDate, symbolCode: 'AAPL', currentShortPositionQuantity: 120000000, averageDailyVolumeQuantity: 50000000, daysToCoverQuantity: 2.4 })));
    const date = filters.find((f) => f.fieldName === 'settlementDate')?.fieldValue;
    return json(date === latest ? settlementTemplate.map((r) => ({ ...r, settlementDate: latest })) : []);
  }
  if (url.hostname === 'api.nasdaq.com') {
    fixtures.calls.nasdaq = (fixtures.calls.nasdaq ?? 0) + 1;
    // The dividends go ex on the first weekday two days or more ahead, whatever the day the test runs; two splits fall
    // in the coming fortnight, the others two months back.
    const usDay = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
    if (fixtures.corpCalendar && url.pathname === '/api/calendar/dividends') {
      let exDay = 2;
      while ([0, 6].includes(new Date(Date.now() + exDay * 86_400_000).getUTCDay())) exDay++;
      if (url.searchParams.get('date') !== shift(exDay)) return json({ data: { calendar: { asOf: '', headers: null, rows: null } }, message: 'There are no dividends to show for this date.', status: { rCode: 200 } });
      const out = structuredClone(dividendTemplate);
      for (const r of out.data.calendar.rows) r.dividend_Ex_Date = usDay(shift(exDay));
      return json(out);
    }
    if (fixtures.corpCalendar && url.pathname === '/api/calendar/splits') {
      const out = structuredClone(splitsTemplate);
      for (const r of out.data.rows) r.executionDate = usDay(shift(r.symbol === 'EFG' ? 5 : r.symbol === 'SXTC' ? 6 : -60));
      return json(out);
    }
    if (url.pathname === '/api/screener/stocks' && fixtures.listingsDown) return new Response('', { status: 503 });
    if (url.pathname === '/api/screener/stocks' && fixtures.nasdaqList) return json(nasdaqList);
    // A bank with its industry (CCB); it reports nothing in the calendars above.
    const bank = [{ symbol: 'JPM', name: 'JP Morgan Chase & Co. Common Stock', marketCap: '800000000000.00', lastsale: '$290.00', country: 'United States', sector: 'Finance', industry: 'Major Banks' }];
    if (url.pathname === '/api/screener/stocks') return json({ data: { rows: [{ symbol: 'MMM', name: '3M Company', marketCap: '83552188778.00', country: 'United States', sector: 'Industrials' }, { symbol: 'XYZW', name: 'Synthetic Finnhub-only Co', marketCap: '6100000000.00', country: 'United States', sector: 'Technology' }, ...traded.map(([symbol, lastsale, volume]) => ({ symbol, name: symbol, lastsale: `$${lastsale}`, volume, marketCap: '50000000000.00', country: 'United States', sector: 'Technology' })), ...bank] }, status: { rCode: 200 } });
    const date = url.searchParams.get('date');
    const mmm = (back, eps) => ({ eps, surprise: '5.04', time: 'time-pre-market', symbol: 'MMM', name: '3M Company', marketCap: '$83,552,188,778', fiscalQuarterEnding: quarterEnd(back).label, epsForecast: '$2.38', noOfEsts: '6' });
    const rows = fixtures.weekCalendar ? weekRows[date] ?? null
      : !fixtures.marketCalendar ? null
      : date === shift(-8) ? [mmm(0, '$2.50'), { eps: '($0.17)', surprise: 'N/A', time: 'time-not-supplied', symbol: 'TINY', name: 'Tiny Synthetic Corp', marketCap: '$410,000,000', fiscalQuarterEnding: quarterEnd(0).label, epsForecast: '', noOfEsts: 'N/A' }]
        : date === shift(1) ? [{ lastYearRptDt: '10/29/2025', lastYearEPS: '$7.25', time: 'time-after-hours', symbol: 'META', name: 'Meta Platforms, Inc.', marketCap: '$1,807,009,840,000', fiscalQuarterEnding: quarterEnd(0).label, epsForecast: '$6.54', noOfEsts: '11' }]
          // 52 weeks before the report, the same weekday: the app asks the year-ago calendar for that day and the
          // days around it, never a weekend (373 days fell on a Sunday whenever the report was on a Monday).
          : date === shift(-372) ? [mmm(4, '$2.19')]
            : date === shift(-100) ? [mmm(1, '$2.40')]
              : null;
    return json(rows ? { data: { rows }, status: { rCode: 200 } } : { data: null, message: null, status: { rCode: 200, bCodeMessage: [{ code: 1002, errorMessage: 'Earnings Calendar: No record found.' }] } });
  }
  if (fixtures.marketCalendar && url.hostname === 'financialmodelingprep.com' && url.pathname === '/stable/earnings-calendar') {
    fixtures.calls.fmp++;
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    return json([
      { symbol: 'MMM', date: shift(-8), epsActual: 2.5, epsEstimated: 2.38, revenueActual: 6.584e9, revenueEstimated: 6.61e9 },
      { symbol: 'MMM', date: shift(-372), epsActual: 2.19, epsEstimated: 2.1, revenueActual: 6.33e9, revenueEstimated: 6.3e9 },
      { symbol: 'MMM', date: shift(-100), epsActual: 2.4, epsEstimated: 2.3, revenueActual: 6.52e9, revenueEstimated: 6.4e9 },
    ].filter((r) => r.date >= from && r.date <= to));
  }
  if (fixtures.marketCalendar && url.hostname === 'finnhub.io' && url.pathname === '/api/v1/calendar/earnings' && !url.searchParams.has('symbol')) {
    fixtures.calls.finnhub.push(url.href);
    const q = quarterEnd(0);
    return json({ earningsCalendar: [
      { symbol: 'MMM', date: shift(-8), hour: 'bmo', quarter: q.q, year: q.y, epsEstimate: 2.38, epsActual: 2.5, revenueEstimate: 6.6e9, revenueActual: 6.584e9 },
      { symbol: 'XYZW', date: shift(-9), hour: 'amc', quarter: q.q, year: q.y, epsEstimate: 0.5, epsActual: 0.6, revenueEstimate: 1e9, revenueActual: 1.1e9 },
    ].filter((r) => r.date >= url.searchParams.get('from') && r.date <= url.searchParams.get('to')) });
  }
  if (url.hostname === 'financialmodelingprep.com') {
    fixtures.calls.fmp++;
    if (fixtures.researchBlocked) return new Response(JSON.stringify({ 'Error Message': 'Premium subscription required for this symbol.' }), { status: 402 });
    if (fixtures.researchPartial) {
      if (url.pathname.endsWith('/analyst-estimates')) return json([{ date: '2027-12-31', revenueAvg: 500000000, epsAvg: 1.25, numAnalystsEps: 7 }]);
      return new Response(JSON.stringify({ 'Error Message': 'Premium subscription required for this symbol.' }), { status: 402 });
    }
    return json({ 'Error Message': 'Invalid API key. Deterministic FMP refusal.' });
  }
  if (url.hostname === 'finnhub.io') {
    fixtures.calls.finnhub.push(url.href);
    if (new Headers(init?.headers).get('X-Finnhub-Token') !== fullFinnhubKey) return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401 });
    return json([{ symbol: url.searchParams.get('symbol'), period: '2026-10-01', strongBuy: 2, buy: 4, hold: 1, sell: 0, strongSell: 0 }]);
  }
  if (url.hostname === 'mcp.tipranks.com') {
    const body = JSON.parse(init.body);
    fixtures.calls.tipranks.push({ method: body.method, name: body.params?.name, keyed: url.searchParams.has('apikey') });
    const sse = (reply) => new Response(`event: message\ndata: ${JSON.stringify(reply)}\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    if (body.method === 'initialize') return sse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return sse({ jsonrpc: '2.0', id: body.id, result: { tools: tipranksTools } });
    const name = body.params.name;
    const data = name === 'get_my_usage' ? { used: 3, limit: 50, remaining: 47 }
      : name === 'get_assets_data' ? { assetsData: [{ ticker: body.params.arguments.tickers, companyName: 'Synthetic TipRanks fixture', url: 'https://www.tipranks.com/stocks/aapl', price: 200, smartScore: 8, analystConsensus: 'Moderate Buy', bestAnalystConsensus: 'Strong Buy', priceTarget: 240, priceTargetUpside: 0.2 }] }
      : [{ recommendationDate: '10/14/2026', analystName: 'Synthetic Analyst', firm: 'Fixture Securities', rating: 'Buy', action: 'reiterated', priceTarget: 250, numOfStars: 4.5 }];
    return sse({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } });
  }
  if (url.hostname === 'mcp.equibles.com') {
    const body = JSON.parse(init.body);
    fixtures.calls.equibles.push(body);
    if (body.method === 'initialize') return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return json({ jsonrpc: '2.0', id: body.id, result: { tools: [
      { name: 'GetAnalystEstimates', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { ticker: { type: 'string' }, limit: { type: 'integer' } }, required: ['ticker'] } },
      { name: 'GetInsiderTransactions', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { ticker: { type: 'string' }, maxResults: { type: 'integer' } }, required: ['ticker'] } },
    ] } });
    return json({ jsonrpc: '2.0', id: body.id, result: fixtures.equiblesRefusal ? { isError: true, content: [{ type: 'text', text: 'Subscription does not include this research.' }] } : { content: [{ type: 'text', text: `${body.params.arguments.ticker} · ${body.params.name}\nSYNTHETIC TEST REPORT · reported source date 2026-10-01 · USD\nProvider coverage and accounting qualifications retained. <script>throw new Error('Do not execute')</script>` }] } });
  }
  if (url.hostname === 'api.marketaux.com') {
    fixtures.calls.marketaux++;
    return json({ error: { code: 'invalid_api_token', message: 'Invalid API token. Deterministic Marketaux refusal.' } });
  }
  if (url.hostname === 'news.google.com') {
    fixtures.calls.google.push(url.href);
    const item = '<item><title>Synthetic Google story about the company - Reuters</title><link>https://news.google.com/rss/articles/SYNTHETIC?oc=5</link><pubDate>' + new Date(Date.now() - 2 * 3_600_000).toUTCString() + '</pubDate><description>Synthetic Google story about the company Reuters</description><source url="https://www.reuters.com">Reuters</source></item>';
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Google News</title>${fixtures.newsStories ? item : ''}</channel></rss>`, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
  }
  if (url.hostname === 'data.alpaca.markets') {
    if (url.pathname === '/v1beta1/news') {
      fixtures.calls.alpacaNews.push(url.href);
      const at = new Date(Date.now() - fixtures.newsAgeMs).toISOString();
      return json({ news: fixtures.newsStories ? [{ id: 1, headline: 'Synthetic Benzinga story about the company', author: 'Fixture', created_at: at, updated_at: at, summary: 'A synthetic summary.', content: '', images: [], symbols: (url.searchParams.get('symbols') ?? 'AAPL').split(','), source: 'benzinga', url: 'https://www.benzinga.com/synthetic-story' }] : [], next_page_token: null });
    }
    if (url.pathname.startsWith('/v1beta1/options/snapshots/')) {
      fixtures.calls.options.push(url.href);
      if (fixtures.optionMalformed) return json({ snapshots: [] });
      if (url.searchParams.has('page_token') && fixtures.optionPageFailure) return new Response(JSON.stringify({ code: 40310000, message: 'Deterministic option entitlement refusal.' }), { status: 403 });
      const snapshot = {
        latestQuote: { t: new Date(Date.now() - 30 * 60_000).toISOString(), bp: 5, ap: 5.2, bs: 2, as: 3 },
        latestTrade: { t: new Date(Date.now() - 35 * 60_000).toISOString(), p: 5.1, s: 1 },
        impliedVolatility: 0.25, greeks: { delta: 0.5, gamma: 0.03, theta: -0.02, vega: 0.12, rho: 0.01 },
      };
      const second = url.searchParams.has('page_token');
      const first = Object.fromEntries(Array.from({ length: fixtures.optionContractCount }, (_, k) => [`AAPL261120C${String((100 + k) * 1000).padStart(8, '0')}`, snapshot]));
      return json({ snapshots: second ? { AAPL261120P00100000: snapshot, AAPL1261120C00100000: snapshot } : first, next_page_token: second ? null : 'second-page' });
    }
    fixtures.calls.alpaca.push(url.href);
    const now = Date.now();
    const tradeAt = now - fixtures.tradeAgeMs;
    const date = new Date(tradeAt).toISOString().slice(0, 10);
    const previous = new Date(tradeAt - 86_400_000).toISOString().slice(0, 10);
    return json(Object.fromEntries((url.searchParams.get('symbols') ?? '').split(',').filter(Boolean).map((symbol) => [symbol, {
      latestTrade: { t: new Date(tradeAt).toISOString(), p: 123.45, s: 10, x: 'V' },
      latestQuote: { t: new Date(now).toISOString(), bp: 123.4, bs: 2, ap: 123.5, as: 3, bx: 'V', ax: 'V' },
      dailyBar: { t: `${date}T04:00:00Z`, o: 120, h: 125, l: 119, c: 123.45, v: 1000 },
      prevDailyBar: { t: `${previous}T04:00:00Z`, o: 118, h: 121, l: 117, c: 120, v: 900 },
    }])));
  }
  // Unneeded background providers get an empty fixture; the real transport is never called.
  return json([]);
};

// Production main installs its Yahoo listener before constructing BrowserWindow. Install this later,
// during construction, so every renderer HTTP/WebSocket request is blocked before loadFile starts.
app.on('web-contents-created', (_event, contents) => {
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, done) => done({ cancel: true }));
});

// Exercise the real window, preload, provider storage/reporting, IPC validation and request broker.
require('../electron/main.cjs');
