// Index memberships and member volumes without a key, for the index monitors (MOV, MEMB, MOST, IMAP, MRR) and SCREEN.
// The S&P 500's members come from the public dataset kept from the index's published list (symbol, name, GICS
// sector and sub-industry); the Nasdaq-100's from Nasdaq's own list; the FTSE 100's from Wikipedia's article on the
// index (its "Constituents" table: company, ticker, ISIN and ICB sector). Prices come from Yahoo like everywhere
// else in the app; Nasdaq's quotes add each member's share volume, up to 20 stocks per request.

const HOUR = 3_600_000;

// Wikipedia's article on the FTSE 100, through the MediaWiki API. Its sections are asked first, so the app finds the
// one titled "Constituents" by its title (on 30 October 2026 it was section 7), then that section's text.
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php?action=parse&page=FTSE_100_Index';

const LISTS = {
  sp500: { provider: 'datasets', url: 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv', ttl: 24 * HOUR, headers: { Accept: 'text/csv, text/plain, */*' } },
  nasdaq100: { provider: 'nasdaq', url: 'https://api.nasdaq.com/api/quote/list-type/nasdaq100', ttl: 6 * HOUR, headers: { Accept: 'application/json, text/plain, */*' } },
  'ftse100-sections': { provider: 'wikipedia', url: `${WIKIPEDIA}&prop=tocdata&format=json&formatversion=2`, ttl: 24 * HOUR, headers: { Accept: 'application/json' } },
};

/** The request for an index's member list, or null for a list the app does not ask for. */
function membersRequest(kind) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(LISTS, kind)) return null;
  return LISTS[kind];
}

/** One section of Wikipedia's FTSE 100 article by its number ("7"), the one its sections list titles "Constituents". */
function ftse100Request(section) {
  if (typeof section !== 'string' || !/^[1-9][0-9]?$/.test(section)) return null;
  return { provider: 'wikipedia', url: `${WIKIPEDIA}&prop=text&section=${section}&format=json&formatversion=2`, ttl: 24 * HOUR, headers: { Accept: 'application/json' } };
}

// Nasdaq's style of US ticker: BRK.B.
const SYMBOL = /^[A-Z][A-Z0-9]{0,6}(?:\.[A-Z]{1,2})?$/;

/** Nasdaq's quotes for up to 20 US stocks ("AAPL,BRK.B"), or null for anything else. */
function nasdaqQuotesRequest(symbols) {
  if (typeof symbols !== 'string') return null;
  const list = symbols.split(',');
  if (!list.length || list.length > 20 || !list.every((s) => SYMBOL.test(s)) || new Set(list).size !== list.length) return null;
  const query = list.map((s) => `symbol=${encodeURIComponent(s.toLowerCase())}%7Cstocks`).join('&');
  return { provider: 'nasdaq', url: `https://api.nasdaq.com/api/quote/watchlist?${query}`, ttl: 60_000, headers: { Accept: 'application/json, text/plain, */*' } };
}

module.exports = { membersRequest, ftse100Request, nasdaqQuotesRequest, LISTS };
