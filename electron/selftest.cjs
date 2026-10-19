// The provider self-test on PROVIDERS: one small request to each source with the owner's own keys, from the
// owner's own computer and network, so a failure shows where it happens and why. The report names each test,
// its HTTP status, how long it took and a short sample of the answer (a price, a date, a count); it never
// contains a key, a URL with a key in it, or a whole answer. Kept free of Electron so tests can load it.

const today = (now) => new Date(now).toISOString().slice(0, 10);
const daysAgo = (now, n) => new Date(now - n * 86_400_000).toISOString().slice(0, 10);

function json(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A number with up to four significant decimals, or '?' */
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10_000) / 10_000) : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? v.trim() : '?');

/**
 * Each test: the provider it counts against, the credentials and switch it needs, the request it makes and how
 * to read the answer. `read` returns a short sample when the answer is usable, or throws with what is wrong.
 * Requests that spend a small daily allowance say so in `cost`.
 */
const TESTS = [
  {
    id: 'nyfed',
    provider: 'nyfed',
    label: 'New York Fed reference rates',
    request: () => ({ url: 'https://markets.newyorkfed.org/api/rates/all/latest.json' }),
    read: (text) => {
      const rows = json(text)?.refRates;
      const valid = Array.isArray(rows) ? rows.filter((r) => r && Number.isFinite(r.percentRate) && /^\d{4}-\d{2}-\d{2}$/.test(r.effectiveDate)) : [];
      const r = valid.find((r) => r.type === 'EFFR') ?? valid[0];
      if (!r) throw new Error('no usable percentage rates in the answer');
      return `${r.type} ${n(r.percentRate)}% on ${r.effectiveDate}`;
    },
  },
  {
    id: 'ecb',
    provider: 'ecb',
    label: 'ECB deposit facility rate',
    request: () => ({ url: 'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&lastNObservations=1', accept: 'text/csv' }),
    read: (text) => {
      const lines = String(text).trim().split(/\r?\n/);
      if (lines.length < 2) throw new Error('no observation in the answer');
      const head = lines[0].replace(/^\uFEFF/, '').split(',').map((s) => s.replace(/^"|"$/g, '').trim());
      const row = lines[lines.length - 1].split(',');
      const value = row[head.indexOf('OBS_VALUE')]?.replace(/^"|"$/g, '').trim();
      const date = row[head.indexOf('TIME_PERIOD')]?.replace(/^"|"$/g, '').trim();
      if (!value || !Number.isFinite(Number(value)) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('no usable rate observation in the answer');
      return `${value}% on ${date}`;
    },
  },
  {
    id: 'fed-rss',
    provider: 'fedboard',
    label: 'Federal Reserve press releases (RSS)',
    request: () => ({ url: 'https://www.federalreserve.gov/feeds/press_all.xml', accept: 'application/rss+xml, application/xml' }),
    read: (text) => {
      const items = (String(text).match(/<item\b/gi) ?? []).length;
      if (!items) throw new Error('no items in the feed');
      return `${items} items`;
    },
  },
  {
    id: 'kraken',
    provider: 'kraken',
    label: 'Kraken bitcoin ticker',
    setting: 'KRAKEN_ENABLED',
    request: () => ({ url: 'https://api.kraken.com/0/public/Ticker?pair=XXBTZUSD' }),
    read: (text) => {
      const j = json(text);
      if (j?.error?.length) throw new Error(j.error.join('; '));
      const t = Object.values(j?.result ?? {})[0];
      if (!t?.c?.[0]) throw new Error('no price in the answer');
      return `BTC/USD ${n(t.c[0])}`;
    },
  },
  {
    id: 'coingecko',
    provider: 'coingecko',
    label: 'CoinGecko (Demo key)',
    credentials: ['COINGECKO_API_KEY'],
    request: ([key]) => ({ url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', headers: { 'x-cg-demo-api-key': key } }),
    read: (text) => {
      const v = json(text)?.bitcoin?.usd;
      if (v == null) throw new Error('no price in the answer');
      return `BTC ${n(v)} USD`;
    },
  },
  {
    id: 'fred',
    provider: 'fred',
    label: 'FRED 10-year Treasury yield',
    credentials: ['FRED_API_KEY'],
    request: ([key]) => ({ url: `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json&sort_order=desc&limit=1&api_key=${encodeURIComponent(key)}` }),
    read: (text) => {
      const o = json(text)?.observations?.[0];
      if (!o) throw new Error('no observation in the answer');
      return `${n(o.value)}% on ${o.date}`;
    },
  },
  {
    id: 'sec',
    provider: 'sec',
    label: 'SEC EDGAR filings (Apple)',
    credentials: ['SEC_USER_AGENT'],
    agent: true,
    request: () => ({ url: 'https://data.sec.gov/submissions/CIK0000320193.json' }),
    read: (text) => {
      const j = json(text);
      const n2 = j?.filings?.recent?.form?.length;
      if (!n2) throw new Error('no filings in the answer');
      return `${j.name}: ${n2} recent filings, latest ${j.filings.recent.filingDate?.[0] ?? '?'}`;
    },
  },
  {
    id: 'fmp',
    provider: 'fmp',
    label: 'Financial Modeling Prep price targets (Apple)',
    credentials: ['FMP_API_KEY'],
    setting: 'FMP_ENABLED',
    request: ([key]) => ({ url: `https://financialmodelingprep.com/stable/price-target-consensus?symbol=AAPL&apikey=${encodeURIComponent(key)}` }),
    read: (text) => {
      const j = json(text);
      if (!Array.isArray(j)) throw new Error('no list in the answer');
      if (!j[0]) throw new Error('empty list');
      return `consensus ${n(j[0].targetConsensus)}, high ${n(j[0].targetHigh)}, low ${n(j[0].targetLow)}`;
    },
  },
  {
    id: 'finnhub-quote',
    provider: 'finnhub',
    label: 'Finnhub quote (Apple)',
    credentials: ['FINNHUB_API_KEY'],
    setting: 'FINNHUB_ENABLED',
    request: ([key]) => ({ url: 'https://finnhub.io/api/v1/quote?symbol=AAPL', headers: { 'X-Finnhub-Token': key } }),
    read: (text) => {
      const j = json(text);
      if (!j || typeof j.c !== 'number') throw new Error('no price in the answer');
      if (j.c === 0 && j.t === 0) throw new Error('empty quote (symbol not covered)');
      return `AAPL ${n(j.c)} at ${new Date(j.t * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    },
  },
  {
    id: 'finnhub-metric',
    provider: 'finnhub',
    label: 'Finnhub key ratios (Apple)',
    credentials: ['FINNHUB_API_KEY'],
    setting: 'FINNHUB_ENABLED',
    request: ([key]) => ({ url: 'https://finnhub.io/api/v1/stock/metric?symbol=AAPL&metric=all', headers: { 'X-Finnhub-Token': key } }),
    read: (text) => {
      const m = json(text)?.metric;
      if (!m || !Object.keys(m).length) throw new Error('no ratios in the answer');
      return `P/E ${n(m.peTTM ?? m.peBasicExclExtraTTM)}, beta ${n(m.beta)}, ${Object.keys(m).length} fields`;
    },
  },
  {
    id: 'finnhub-earnings',
    provider: 'finnhub',
    label: 'Finnhub EPS surprises and recommendations (Apple)',
    credentials: ['FINNHUB_API_KEY'],
    setting: 'FINNHUB_ENABLED',
    request: ([key]) => ({ url: 'https://finnhub.io/api/v1/stock/earnings?symbol=AAPL', headers: { 'X-Finnhub-Token': key } }),
    read: (text) => {
      const j = json(text);
      if (!Array.isArray(j)) throw new Error('no list in the answer');
      const q = j[0];
      return q ? `${j.length} quarters, latest ${q.period}: actual ${n(q.actual)} vs estimate ${n(q.estimate)}` : 'no quarters';
    },
  },
  {
    id: 'finnhub-news',
    provider: 'finnhub',
    label: 'Finnhub market news',
    credentials: ['FINNHUB_API_KEY'],
    setting: 'FINNHUB_ENABLED',
    request: ([key]) => ({ url: 'https://finnhub.io/api/v1/news?category=general', headers: { 'X-Finnhub-Token': key } }),
    read: (text) => {
      const j = json(text);
      if (!Array.isArray(j)) throw new Error('no list in the answer');
      return `${j.length} stories`;
    },
  },
  {
    id: 'marketaux',
    provider: 'marketaux',
    label: 'Marketaux news (Apple)',
    credentials: ['MARKETAUX_API_TOKEN'],
    setting: 'MARKETAUX_ENABLED',
    cost: 'uses 1 of 100 daily requests',
    request: ([key]) => ({ url: `https://api.marketaux.com/v1/news/all?symbols=AAPL&filter_entities=true&language=en&limit=1&api_token=${encodeURIComponent(key)}` }),
    read: (text) => {
      const j = json(text);
      if (!Array.isArray(j?.data)) throw new Error('no stories in the answer');
      return `${j.meta?.found ?? j.data.length} stories found`;
    },
  },
  {
    id: 'alpaca-news',
    provider: 'alpaca',
    label: 'Alpaca news, Benzinga (Apple)',
    credentials: ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY'],
    setting: 'ALPACA_ENABLED',
    request: ([id, secret], now) => ({ url: `https://data.alpaca.markets/v1beta1/news?symbols=AAPL&start=${daysAgo(now, 7)}&sort=desc&limit=5`, headers: { 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': secret } }),
    read: (text) => {
      const list = json(text)?.news;
      if (!Array.isArray(list)) throw new Error('no news list in the answer');
      return list.length ? `${list.length} stories, latest at ${String(list[0].created_at).slice(0, 16).replace('T', ' ')} UTC` : 'no stories this week';
    },
  },
  {
    id: 'massive-news',
    provider: 'massive',
    label: 'Massive ticker news (Apple)',
    credentials: ['MASSIVE_API_KEY'],
    setting: 'MASSIVE_NEWS_ENABLED',
    request: ([key]) => ({ url: 'https://api.massive.com/v2/reference/news?ticker=AAPL&order=desc&sort=published_utc&limit=5', headers: { Authorization: `Bearer ${key}` } }),
    read: (text) => {
      const list = json(text)?.results;
      if (!Array.isArray(list)) throw new Error('no results in the answer');
      return list.length ? `${list.length} stories, latest at ${String(list[0].published_utc).slice(0, 16).replace('T', ' ')} UTC` : 'no stories';
    },
  },
  {
    id: 'google-news',
    provider: 'google-news',
    label: 'Google News market search (RSS)',
    setting: 'GOOGLE_NEWS_RSS_ENABLED',
    request: () => ({ url: 'https://news.google.com/rss/search?q=(stocks%20OR%20%22stock%20market%22%20OR%20%22Wall%20Street%22%20OR%20earnings%20OR%20bonds%20OR%20%22central%20bank%22)%20when%3A1d&hl=en-US&gl=US&ceid=US:en', accept: 'application/rss+xml, application/xml' }),
    read: (text) => {
      if (!/<rss\b/i.test(String(text))) throw new Error('Google answered with a web page, not the feed');
      const items = (String(text).match(/<item\b/gi) ?? []).length;
      if (!items) throw new Error('no items in the feed');
      return `${items} items`;
    },
  },
  {
    id: 'alpaca',
    provider: 'alpaca',
    label: 'Alpaca IEX snapshot (Apple)',
    credentials: ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY'],
    setting: 'ALPACA_ENABLED',
    request: ([id, secret]) => ({ url: 'https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL&feed=iex', headers: { 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': secret } }),
    read: (text) => {
      const t = json(text)?.AAPL?.latestTrade;
      if (!t) throw new Error('no trade in the answer');
      return `AAPL ${n(t.p)} on IEX at ${String(t.t).slice(0, 16).replace('T', ' ')} UTC`;
    },
  },
  {
    id: 'tiingo',
    provider: 'tiingo',
    label: 'Tiingo daily closes (Apple)',
    credentials: ['TIINGO_API_KEY'],
    setting: 'TIINGO_ENABLED',
    request: ([key], now) => ({ url: `https://api.tiingo.com/tiingo/daily/aapl/prices?startDate=${daysAgo(now, 10)}&endDate=${today(now)}&format=json`, headers: { Authorization: `Token ${key}` } }),
    read: (text) => {
      const j = json(text);
      if (!Array.isArray(j) || !j.length) throw new Error('no prices in the answer');
      const last = j[j.length - 1];
      return `close ${n(last.close)} on ${String(last.date).slice(0, 10)}`;
    },
  },
  {
    id: 'massive',
    provider: 'massive',
    label: 'Massive previous close (Apple)',
    credentials: ['MASSIVE_API_KEY'],
    request: ([key]) => ({ url: 'https://api.massive.com/v2/aggs/ticker/AAPL/prev?adjusted=true', headers: { Authorization: `Bearer ${key}` } }),
    read: (text) => {
      const r = json(text)?.results?.[0];
      if (!r) throw new Error('no bar in the answer');
      return `close ${n(r.c)} on ${new Date(r.t).toISOString().slice(0, 10)}`;
    },
  },
  {
    id: 'alphavantage',
    provider: 'alphavantage',
    label: 'Alpha Vantage quote (IBM)',
    credentials: ['ALPHA_VANTAGE_API_KEY'],
    cost: 'uses 1 of 25 daily requests',
    request: ([key]) => ({ url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${encodeURIComponent(key)}` }),
    read: (text) => {
      const j = json(text);
      const q = j?.['Global Quote'];
      if (!q || !q['05. price']) throw new Error(String(j?.Note ?? j?.Information ?? j?.['Error Message'] ?? 'no quote in the answer').slice(0, 160));
      return `IBM ${n(q['05. price'])} on ${q['07. latest trading day']}`;
    },
  },
  {
    id: 'twelvedata',
    provider: 'twelvedata',
    label: 'Twelve Data quote (Apple)',
    credentials: ['TWELVE_DATA_API_KEY'],
    setting: 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED',
    request: ([key]) => ({ url: 'https://api.twelvedata.com/quote?symbol=AAPL', headers: { Authorization: `apikey ${key}` } }),
    read: (text) => {
      const j = json(text);
      if (j?.status === 'error') throw new Error(String(j.message ?? 'error').slice(0, 160));
      if (!j?.close) throw new Error('no quote in the answer');
      return `AAPL ${n(j.close)} on ${j.datetime}`;
    },
  },
];

/** One line of the report for a result. */
function reportLine(r) {
  const state = r.state === 'pass' ? 'PASS' : r.state === 'fail' ? 'FAIL' : r.state === 'off' ? 'OFF ' : 'SKIP';
  const status = r.status ? ` HTTP ${r.status}` : '';
  const ms = Number.isFinite(r.ms) ? ` ${r.ms} ms` : '';
  return `${state} ${r.label}${status}${ms}: ${r.detail}`;
}

/** The whole report as plain text, safe to paste anywhere: names, states and samples, no keys. */
function reportText(run) {
  const head = [`Armin Terminal ${run.version} self-test, ${new Date(run.at).toISOString().replace('T', ' ').slice(0, 19)} UTC, ${run.platform}`];
  const passed = run.results.filter((r) => r.state === 'pass').length;
  const failed = run.results.filter((r) => r.state === 'fail').length;
  head.push(`${passed} passed, ${failed} failed, ${run.results.length - passed - failed} skipped or switched off`);
  return [...head, '', ...run.results.map(reportLine)].join('\n');
}

module.exports = { TESTS, reportLine, reportText };
