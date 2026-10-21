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
const currencyTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/sec-currency-change.json'), 'utf8'));
const chartTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/yahoo-sofi-chart.json'), 'utf8'));
const tipranksTools = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/tipranks-tools.json'), 'utf8')).tools;
const fullFinnhubKey = 'abcd1234efgh5678ij90abcd1234efgh5678kl12';
const fixtures = { tradeAgeMs: 0, optionPageFailure: false, optionMalformed: false, optionContractCount: 1, researchPartial: false, researchBlocked: false, profileMissing: false, mixedEstimateCurrencies: false, equiblesRefusal: false, newsStories: false, newsAgeMs: 3_600_000, calls: { fmp: 0, marketaux: 0, alpaca: [], options: [], alpacaNews: [], google: [], finnhub: [], equibles: [], yahoo: [], tipranks: [] } };
globalThis.__desktopFixtures = fixtures;
fixtures.dataAccuracy = false;
fixtures.extendedHours = false;
net.fetch = async (input, init) => {
  const url = new URL(String(input));
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  // With fixtures.supplyChain, SPLC's full-text search and three annual reports (electron/supply-chain.cjs).
  if (fixtures.supplyChain && url.hostname === 'www.sec.gov' && url.pathname === '/files/company_tickers.json') return json({ 0: { cik_str: 1513845, ticker: 'NBIS', title: 'Nebius Group N.V.' } });
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
  if (url.hostname === 'www.sec.gov' && url.pathname === '/files/company_tickers.json') return json({ 0: { cik_str: 1513845, ticker: 'NBIS', title: 'Synthetic currency-switch fixture' } });
  if (url.hostname === 'data.sec.gov') {
    if (url.pathname.includes('/companyfacts/')) return json(currencyTemplate);
    // With fixtures.insiders, two Form 4 filings of the last weeks (electron/sec.cjs ownership-xml).
    const recent = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const four = fixtures.insiders ? { accessionNumber: ['0001513845-26-000011', '0001513845-26-000010'], form: ['4', '4'], filingDate: [recent(3), recent(20)], reportDate: [recent(5), recent(22)], primaryDocument: ['xslF345X05/form4-sale.xml', 'xslF345X05/form4-award.xml'] } : { accessionNumber: [], form: [], filingDate: [], reportDate: [], primaryDocument: [] };
    return json({ cik: 1513845, name: 'Synthetic currency-switch fixture', tickers: ['NBIS'], exchanges: ['Nasdaq'], fiscalYearEnd: '1231', filings: { recent: {
      accessionNumber: [...four.accessionNumber, '0001513845-26-000002', '0001513845-26-000001'], form: [...four.form, '6-K', '20-F'], filingDate: [...four.filingDate, '2026-10-01', '2026-04-30'], reportDate: [...four.reportDate, '2026-10-01', '2025-12-31'], primaryDocument: [...four.primaryDocument, 'synthetic-current.htm', 'synthetic-annual.htm'],
    }, files: [] } });
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
    if (url.pathname === '/v7/finance/quote') return json({ quoteResponse: { result: (url.searchParams.get('symbols') ?? '').split(',').map((symbol) => ({ symbol, regularMarketPrice: symbol === 'APLD' ? 18 : 123.45, regularMarketTime: Math.floor(Date.now() / 1000), currency: 'USD', quoteSourceName: 'Synthetic Real Time Price', exchangeDataDelayedBy: 0,
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
  // The market earnings calendar (fixtures.marketCalendar): 3M reported yesterday, as on an earnings card, with its
  // year- and quarter-earlier reports; a small company below $2B; Meta reports tomorrow; a company only Finnhub lists.
  const shift = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const quarterEnd = (back) => {
    const d = new Date();
    const t = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) - 1 - back;
    return { label: `${['Mar', 'Jun', 'Sep', 'Dec'][t % 4]}/${Math.floor(t / 4)}`, q: (t % 4) + 1, y: Math.floor(t / 4) };
  };
  if (url.hostname === 'api.nasdaq.com') {
    fixtures.calls.nasdaq = (fixtures.calls.nasdaq ?? 0) + 1;
    if (url.pathname === '/api/screener/stocks') return json({ data: { rows: [{ symbol: 'MMM', name: '3M Company', marketCap: '83552188778.00', country: 'United States', sector: 'Industrials' }, { symbol: 'XYZW', name: 'Synthetic Finnhub-only Co', marketCap: '6100000000.00', country: 'United States', sector: 'Technology' }] }, status: { rCode: 200 } });
    const date = url.searchParams.get('date');
    const mmm = (back, eps) => ({ eps, surprise: '5.04', time: 'time-pre-market', symbol: 'MMM', name: '3M Company', marketCap: '$83,552,188,778', fiscalQuarterEnding: quarterEnd(back).label, epsForecast: '$2.38', noOfEsts: '6' });
    const rows = !fixtures.marketCalendar ? null
      : date === shift(-1) ? [mmm(0, '$2.50'), { eps: '($0.17)', surprise: 'N/A', time: 'time-not-supplied', symbol: 'TINY', name: 'Tiny Synthetic Corp', marketCap: '$410,000,000', fiscalQuarterEnding: quarterEnd(0).label, epsForecast: '', noOfEsts: 'N/A' }]
        : date === shift(1) ? [{ lastYearRptDt: '10/29/2025', lastYearEPS: '$7.25', time: 'time-after-hours', symbol: 'META', name: 'Meta Platforms, Inc.', marketCap: '$1,807,009,840,000', fiscalQuarterEnding: quarterEnd(0).label, epsForecast: '$6.54', noOfEsts: '11' }]
          : date === shift(-365) ? [mmm(4, '$2.19')]
            : date === shift(-92) ? [mmm(1, '$2.40')]
              : null;
    return json(rows ? { data: { rows }, status: { rCode: 200 } } : { data: null, message: null, status: { rCode: 200, bCodeMessage: [{ code: 1002, errorMessage: 'Earnings Calendar: No record found.' }] } });
  }
  if (fixtures.marketCalendar && url.hostname === 'financialmodelingprep.com' && url.pathname === '/stable/earnings-calendar') {
    fixtures.calls.fmp++;
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    return json([
      { symbol: 'MMM', date: shift(-1), epsActual: 2.5, epsEstimated: 2.38, revenueActual: 6.584e9, revenueEstimated: 6.61e9 },
      { symbol: 'MMM', date: shift(-365), epsActual: 2.19, epsEstimated: 2.1, revenueActual: 6.33e9, revenueEstimated: 6.3e9 },
      { symbol: 'MMM', date: shift(-92), epsActual: 2.4, epsEstimated: 2.3, revenueActual: 6.52e9, revenueEstimated: 6.4e9 },
    ].filter((r) => r.date >= from && r.date <= to));
  }
  if (fixtures.marketCalendar && url.hostname === 'finnhub.io' && url.pathname === '/api/v1/calendar/earnings' && !url.searchParams.has('symbol')) {
    fixtures.calls.finnhub.push(url.href);
    const q = quarterEnd(0);
    return json({ earningsCalendar: [
      { symbol: 'MMM', date: shift(-1), hour: 'bmo', quarter: q.q, year: q.y, epsEstimate: 2.38, epsActual: 2.5, revenueEstimate: 6.6e9, revenueActual: 6.584e9 },
      { symbol: 'XYZW', date: shift(-2), hour: 'amc', quarter: q.q, year: q.y, epsEstimate: 0.5, epsActual: 0.6, revenueEstimate: 1e9, revenueActual: 1.1e9 },
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
