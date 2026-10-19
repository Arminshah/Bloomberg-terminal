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
// - Yahoo Finance headlines RSS for one ticker (any market Yahoo lists, Brussels and Paris included), no key,
//   while YAHOO_RSS_ENABLED is on. Yahoo's RSS terms: "you are only permitted to display the content that is
//   provided in the feed, without modification, and you must provide attribution to our source website and
//   link to the full article", which is what the screens do. Asked with the app's own User-Agent (Yahoo's feed
//   refuses browser-like ones with HTTP 429).
// - Euronext's company press releases RSS (the latest 10), no key, while EURONEXT_RSS_ENABLED is on.
// - Alpaca's news API (Benzinga's wire), with the owner's Alpaca market data keys, while ALPACA_ENABLED is on:
//   the latest 50 stories, or a ticker's (docs.alpaca.markets/reference/news-3). The free Basic plan has
//   historical data from 15 minutes back, so its stories arrive 15 minutes after publication.
// - Massive's ticker news (formerly Polygon.io), with the owner's MASSIVE_API_KEY, while MASSIVE_NEWS_ENABLED is
//   on. Stocks Basic allows 5 calls a minute, shared with CROSSCHECK's daily bars, and updates news hourly.
// - Google News RSS, no key, while GOOGLE_NEWS_RSS_ENABLED is on: a search for the day's market news in an
//   English edition, and a search for a company in the editions of its market's languages. Each feed says it "is
//   made available solely for the purpose of rendering Google News results within a personal feed reader for
//   personal, non-commercial use", which is what this private terminal does with it: headlines, publishers, times
//   and links.
// Only headlines, sources, times, short summaries and links are shown; no article text is fetched.

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
// A Yahoo symbol: ABI.BR, MC.PA, BRK-B, ^GSPC, EURUSD=X.
const YAHOO_SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MIN = 60_000;
const DAY = 86_400_000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

/** Finnhub's market news categories the app reads: general news, and mergers and acquisitions. */
const FINNHUB_CATEGORIES = new Set(['general', 'merger']);

/**
 * Google News editions, by the ceid Google gives them: the interface language (hl) and the language whose words
 * keep a company search to its business and its shares. Each was checked to answer on 19 October 2026.
 */
const EDITIONS = {
  'US:en': { hl: 'en-US', lang: 'en' },
  'GB:en': { hl: 'en-GB', lang: 'en' },
  'IE:en': { hl: 'en-IE', lang: 'en' },
  'CA:en': { hl: 'en-CA', lang: 'en' },
  'BE:nl': { hl: 'nl', lang: 'nl' },
  'BE:fr': { hl: 'fr', lang: 'fr' },
  'NL:nl': { hl: 'nl', lang: 'nl' },
  'FR:fr': { hl: 'fr', lang: 'fr' },
  'DE:de': { hl: 'de', lang: 'de' },
  'AT:de': { hl: 'de', lang: 'de' },
  'CH:de': { hl: 'de', lang: 'de' },
  'CH:fr': { hl: 'fr', lang: 'fr' },
  'IT:it': { hl: 'it', lang: 'it' },
  'ES:es': { hl: 'es', lang: 'es' },
  'PT:pt-150': { hl: 'pt-PT', lang: 'pt' },
  'SE:sv': { hl: 'sv', lang: 'sv' },
  'DK:da': { hl: 'da', lang: 'da' },
  'FI:fi': { hl: 'fi', lang: 'fi' },
  'NO:no': { hl: 'no', lang: 'no' },
};

/**
 * A company's name alone finds its sponsorships, sports teams and namesakes ("Target" finds ICE raids); one of
 * these words beside it keeps the search to its shares and results.
 */
const FINANCE_WORDS = {
  en: ['stock', 'shares', 'earnings'],
  nl: ['aandeel', 'aandelen', 'beurs', 'winst', 'omzet', 'resultaten'],
  fr: ['action', 'actions', 'bourse', 'bénéfice', 'résultats'],
  de: ['Aktie', 'Aktien', 'Börse', 'Gewinn', 'Umsatz'],
  it: ['azioni', 'borsa', 'utile', 'ricavi'],
  es: ['acciones', 'bolsa', 'beneficio', 'ingresos'],
  pt: ['ações', 'bolsa', 'lucro', 'receitas'],
  sv: ['aktie', 'aktien', 'börsen', 'vinst', 'omsättning'],
  da: ['aktie', 'aktier', 'børsen', 'overskud', 'omsætning'],
  fi: ['osake', 'osakkeet', 'pörssi', 'tulos', 'liikevaihto'],
  no: ['aksje', 'aksjer', 'børs', 'resultat', 'omsetning'],
};

/**
 * In an English edition, a company listed abroad is searched with its country as well: "KBC" alone finds an Indian
 * quiz show and fund pages (47 stories in a week, mostly those), "KBC" with Belgium finds KBC Group's (9 of 9).
 */
const COUNTRY_WORDS = {
  BE: ['Belgium', 'Belgian', 'Brussels'],
  NL: ['Netherlands', 'Dutch', 'Amsterdam'],
  FR: ['France', 'French', 'Paris'],
  DE: ['Germany', 'German', 'Frankfurt'],
  AT: ['Austria', 'Austrian', 'Vienna'],
  CH: ['Switzerland', 'Swiss', 'Zurich'],
  IT: ['Italy', 'Italian', 'Milan'],
  ES: ['Spain', 'Spanish', 'Madrid'],
  PT: ['Portugal', 'Portuguese', 'Lisbon'],
  SE: ['Sweden', 'Swedish', 'Stockholm'],
  DK: ['Denmark', 'Danish', 'Copenhagen'],
  FI: ['Finland', 'Finnish', 'Helsinki'],
  NO: ['Norway', 'Norwegian', 'Oslo'],
};

/**
 * Words for a security that is not a company, in English editions only: a currency pair, a commodity or an index
 * future, a coin. "Gold" (price OR prices OR futures) found Reuters, Kitco and Fortune on gold on 19 October 2026.
 */
const KIND_WORDS = {
  fx: ['currency', 'forex', '"exchange rate"'],
  commodity: ['price', 'prices', 'futures'],
  crypto: ['price', 'crypto', 'ETF'],
};

/**
 * The day's market news. Google's Business section mixes in shopping and recalls ("Halloween Candy Price Check");
 * this search returned 100 stories of the last day on 19 October 2026, from Reuters, the WSJ, Bloomberg and CNBC.
 */
const MARKETS_WORDS = '(stocks OR "stock market" OR "Wall Street" OR earnings OR bonds OR "central bank")';
const MARKETS_SEARCH = `${MARKETS_WORDS} when:1d`;
// The same search over the last hour, for BREAKING: Google ranks a day's 100 stories by relevance, not time.
const BREAKING_SEARCH = `${MARKETS_WORDS} when:1h`;
// A name as the app shortens it: letters in any script, digits, spaces, & ' ’ . - and / (EUR/USD).
const COMPANY = /^[\p{L}\p{N}][\p{L}\p{N}&'’. /-]{1,59}$/u;
const GOOGLE_TICKER = /^[A-Z][A-Z0-9]{1,9}$/;
// Your own search on NEWS: words, digits, quotes and the punctuation of tickers and prices; 2 to 80 characters.
const SEARCH_WORDS = /^["\p{L}\p{N}$][\p{L}\p{N} &'’".:$%/+-]{1,79}$/u;

function editionQuery(ceid) {
  const e = EDITIONS[ceid];
  return `hl=${e.hl}&gl=${ceid.split(':')[0]}&ceid=${ceid}`;
}

/**
 * The search for a company's news of the last week in one edition: "name" (finance words OR ticker), with its
 * country's words for a company listed abroad, when:7d. A ticker that is one of Google's operators (L'Oréal's OR)
 * or the name itself (KBC) adds nothing and is left out.
 */
function companySearch(ceid, name, ticker, country, kind) {
  const own = ticker && !/^(OR|AND|NOT)$/.test(ticker) && ticker.toLowerCase() !== name.toLowerCase();
  const words = [...(kind ? KIND_WORDS[kind] : FINANCE_WORDS[EDITIONS[ceid].lang]), ...(own ? [ticker] : [])];
  const where = country ? ` (${COUNTRY_WORDS[country].join(' OR ')})` : '';
  return `"${name}" (${words.join(' OR ')})${where} when:7d`;
}

const SOURCES = {
  'finnhub-market': {
    provider: 'finnhub',
    credential: 'FINNHUB_API_KEY',
    gate: 'FINNHUB_ENABLED',
    // BREAKING asks every 2 minutes, MARKETNEWS every 5.
    ttl: 2 * MIN,
    // arg: '' (general) or 'merger'
    url: (arg) => {
      const category = String(arg) || 'general';
      return FINNHUB_CATEGORIES.has(category) ? `https://finnhub.io/api/v1/news?category=${category}` : null;
    },
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
  'yahoo-rss': {
    provider: 'yahoo-rss',
    gate: 'YAHOO_RSS_ENABLED',
    ttl: 15 * MIN,
    url: (arg) => (YAHOO_SYMBOL.test(String(arg)) ? `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(arg)}&region=US&lang=en-US` : null),
    headers: () => ({ Accept: 'application/rss+xml, application/xml' }),
  },
  'euronext-pr': {
    provider: 'euronext',
    gate: 'EURONEXT_RSS_ENABLED',
    ttl: 10 * MIN,
    url: () => 'https://live.euronext.com/en/rss/company-pr-release',
    headers: () => ({ Accept: 'application/rss+xml, application/xml' }),
  },
  'alpaca-market': {
    // Counted apart from Alpaca's quotes and options, so a news answer never makes a broken option chain look healthy.
    provider: 'alpaca-news',
    credential: 'ALPACA_API_KEY_ID',
    credential2: 'ALPACA_API_SECRET_KEY',
    gate: 'ALPACA_ENABLED',
    ttl: 2 * MIN,
    // The latest 50 stories of the last three days; without a start Alpaca gives only today's, none early on a Monday.
    url: (arg, _key, now) => (arg === '' ? `https://data.alpaca.markets/v1beta1/news?start=${isoDay(now - 3 * DAY)}&sort=desc&limit=50` : null),
    headers: (id, secret) => ({ 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': secret }),
  },
  'alpaca-company': {
    // Counted apart from Alpaca's quotes and options, so a news answer never makes a broken option chain look healthy.
    provider: 'alpaca-news',
    credential: 'ALPACA_API_KEY_ID',
    credential2: 'ALPACA_API_SECRET_KEY',
    gate: 'ALPACA_ENABLED',
    ttl: 10 * MIN,
    // arg: "AAPL" (class shares with a dot, BRK.B): its latest 50 stories of the last 30 days.
    url: (arg, _key, now) => (SYMBOL.test(String(arg)) ? `https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(arg)}&start=${isoDay(now - 30 * DAY)}&sort=desc&limit=50` : null),
    headers: (id, secret) => ({ 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': secret }),
  },
  'massive-market': {
    provider: 'massive',
    credential: 'MASSIVE_API_KEY',
    gate: 'MASSIVE_NEWS_ENABLED',
    ttl: 15 * MIN,
    url: (arg) => (arg === '' ? 'https://api.massive.com/v2/reference/news?order=desc&sort=published_utc&limit=100' : null),
    // The Bearer header keeps the key out of the URL, as for CROSSCHECK's bars.
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  'massive-company': {
    provider: 'massive',
    credential: 'MASSIVE_API_KEY',
    gate: 'MASSIVE_NEWS_ENABLED',
    ttl: 30 * MIN,
    // arg: "AAPL" (class shares with a dot, BRK.B)
    url: (arg) => (SYMBOL.test(String(arg)) ? `https://api.massive.com/v2/reference/news?ticker=${encodeURIComponent(arg)}&order=desc&sort=published_utc&limit=50` : null),
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  'google-news-market': {
    provider: 'google-news',
    gate: 'GOOGLE_NEWS_RSS_ENABLED',
    ttl: 10 * MIN,
    // arg: an English edition, "US:en"
    url: (arg) => (Object.prototype.hasOwnProperty.call(EDITIONS, String(arg)) && EDITIONS[arg].lang === 'en' ? `https://news.google.com/rss/search?q=${encodeURIComponent(MARKETS_SEARCH)}&${editionQuery(arg)}` : null),
    headers: () => ({ Accept: 'application/rss+xml, application/xml' }),
  },
  'google-news-breaking': {
    provider: 'google-news',
    gate: 'GOOGLE_NEWS_RSS_ENABLED',
    ttl: 3 * MIN,
    // arg: an English edition, "US:en"
    url: (arg) => (Object.prototype.hasOwnProperty.call(EDITIONS, String(arg)) && EDITIONS[arg].lang === 'en' ? `https://news.google.com/rss/search?q=${encodeURIComponent(BREAKING_SEARCH)}&${editionQuery(arg)}` : null),
    headers: () => ({ Accept: 'application/rss+xml, application/xml' }),
  },
  'google-news-search': {
    provider: 'google-news',
    gate: 'GOOGLE_NEWS_RSS_ENABLED',
    ttl: 10 * MIN,
    // arg: "US:en|fed rate cut": an English edition and your own search, over the last week (NEWS <words>).
    url: (arg) => {
      const [ceid, words = '', ...rest] = String(arg).split('|');
      if (rest.length || !Object.prototype.hasOwnProperty.call(EDITIONS, ceid ?? '') || EDITIONS[ceid].lang !== 'en' || !SEARCH_WORDS.test(words)) return null;
      return `https://news.google.com/rss/search?q=${encodeURIComponent(`${words} when:7d`)}&${editionQuery(ceid)}`;
    },
    headers: () => ({ Accept: 'application/rss+xml, application/xml' }),
  },
  'google-news-company': {
    provider: 'google-news',
    gate: 'GOOGLE_NEWS_RSS_ENABLED',
    ttl: 15 * MIN,
    // arg: "BE:nl|KBC|KBC" or "GB:en|KBC|KBC|BE": an edition, the company's short name, its ticker (or nothing)
    // and, in an edition abroad, the country it is listed in; "US:en|Gold|||commodity" for a security that is not
    // a company (fx, commodity, crypto), in an English edition. An index is searched as a company is.
    url: (arg) => {
      const [ceid, name, ticker = '', country = '', kind = '', ...rest] = String(arg).split('|');
      if (rest.length || !Object.prototype.hasOwnProperty.call(EDITIONS, ceid ?? '') || !COMPANY.test(name ?? '') || (ticker && !GOOGLE_TICKER.test(ticker))) return null;
      if (country && !Object.prototype.hasOwnProperty.call(COUNTRY_WORDS, country)) return null;
      if (kind && (!Object.prototype.hasOwnProperty.call(KIND_WORDS, kind) || EDITIONS[ceid].lang !== 'en')) return null;
      return `https://news.google.com/rss/search?q=${encodeURIComponent(companySearch(ceid, name, ticker, country, kind))}&${editionQuery(ceid)}`;
    },
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

/** The request for a news source, or null when it is not one the app makes. `key2` is a second credential (Alpaca's secret). */
function newsRequest(source, arg, key, key2 = '', now = Date.now()) {
  if (typeof source !== 'string' || !Object.prototype.hasOwnProperty.call(SOURCES, source)) return null;
  const s = SOURCES[source];
  const url = s.url(arg ?? '', key ?? '', now);
  return url ? { url, headers: s.headers(key ?? '', key2 ?? ''), ttl: s.ttl, provider: s.provider } : null;
}

module.exports = { SOURCES, EDITIONS, FINANCE_WORDS, COUNTRY_WORDS, KIND_WORDS, newsRequest };
