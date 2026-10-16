// Market and company news for the MARKETNEWS and COMPANYNEWS screens, from fixed sources:
// - Finnhub: market news by category and a company's news by symbol and dates, with the owner's key in the
//   X-Finnhub-Token header (finnhub.io/docs/api).
// - Marketaux: ticker-tagged news with per-company sentiment, with the owner's token. Its free plan allows
//   100 requests a day and 3 articles a request, so the app asks for a whole list of tickers at once, keeps
//   each answer for an hour and stops at 90 requests a day (providers.cjs DAILY).
// - MarketWatch's top stories RSS feed (Dow Jones), no key, only while MARKETWATCH_RSS_ENABLED is on: Dow
//   Jones's terms bar automated access to its content, RSS included, without written consent. Its "real-time
//   headlines" and "market pulse" feeds stopped updating in 2025. CNBC is not used: its www feeds refuse
//   programs (HTTP 403), and its owner's terms bar using software to gather its content.
// - SEC EDGAR's latest 8-K filings (Atom), with the owner's SEC_USER_AGENT, under the SEC's 10 requests a
//   second (the app keeps to 5 with its other EDGAR requests).
// Only headlines, sources, times, short summaries and links are shown; no article text is fetched.

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MIN = 60_000;

const SOURCES = {
  'finnhub-market': {
    provider: 'finnhub',
    credential: 'FINNHUB_API_KEY',
    gate: 'FINNHUB_ENABLED',
    ttl: 5 * MIN,
    url: () => 'https://finnhub.io/api/v1/news?category=general',
    headers: (key) => ({ 'X-Finnhub-Token': key }),
  },
  'finnhub-company': {
    provider: 'finnhub',
    credential: 'FINNHUB_API_KEY',
    gate: 'FINNHUB_ENABLED',
    ttl: 15 * MIN,
    // arg: "AAPL|2026-10-07|2026-10-14"
    url: (arg) => {
      const [s, from, to] = String(arg).split('|');
      if (!SYMBOL.test(s ?? '') || !ISO.test(from ?? '') || !ISO.test(to ?? '') || from > to) return null;
      return `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}`;
    },
    headers: (key) => ({ 'X-Finnhub-Token': key }),
  },
  marketaux: {
    provider: 'marketaux',
    credential: 'MARKETAUX_API_TOKEN',
    gate: 'MARKETAUX_ENABLED',
    ttl: 60 * MIN,
    // arg: "AAPL,MSFT,NVDA" (up to 50 tickers in one request)
    url: (arg, key) => {
      const list = String(arg).split(',').filter(Boolean);
      if (!list.length || list.length > 50 || !list.every((s) => SYMBOL.test(s))) return null;
      return `https://api.marketaux.com/v1/news/all?symbols=${list.map(encodeURIComponent).join(',')}&filter_entities=true&language=en&limit=3&api_token=${encodeURIComponent(key)}`;
    },
    headers: () => ({}),
  },
  marketwatch: {
    provider: 'marketwatch',
    ttl: 10 * MIN,
    gate: 'MARKETWATCH_RSS_ENABLED',
    url: () => 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    headers: () => ({ Accept: 'application/rss+xml, application/xml' }),
  },
  'edgar-8k': {
    provider: 'sec',
    credential: 'SEC_USER_AGENT',
    ttl: 10 * MIN,
    url: () => 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=40&output=atom',
    headers: () => ({ Accept: 'application/atom+xml, application/xml' }),
    // The SEC wants the contact as the User-Agent itself.
    agent: true,
  },
};

/** The request for a news source, or null when it is not one the app makes. */
function newsRequest(source, arg, key) {
  if (typeof source !== 'string' || !Object.prototype.hasOwnProperty.call(SOURCES, source)) return null;
  const s = SOURCES[source];
  const url = s.url(arg ?? '', key ?? '');
  return url ? { url, headers: s.headers(key ?? ''), ttl: s.ttl, provider: s.provider } : null;
}

module.exports = { SOURCES, newsRequest };
