// Index memberships and member volumes without a key, for the index monitors (MOV, MEMB, MOST, IMAP, MRR).
// The S&P 500's members come from the public dataset kept from the index's published list (symbol, name, GICS
// sector and sub-industry); the Nasdaq-100's from Nasdaq's own list. Prices come from Yahoo like everywhere
// else in the app; Nasdaq's quotes add each member's share volume, up to 20 stocks per request.

const HOUR = 3_600_000;

const LISTS = {
  sp500: { provider: 'datasets', url: 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv', ttl: 24 * HOUR, headers: { Accept: 'text/csv, text/plain, */*' } },
  nasdaq100: { provider: 'nasdaq', url: 'https://api.nasdaq.com/api/quote/list-type/nasdaq100', ttl: 6 * HOUR, headers: { Accept: 'application/json, text/plain, */*' } },
};

/** The request for an index's member list, or null for a list the app does not ask for. */
function membersRequest(kind) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(LISTS, kind)) return null;
  return LISTS[kind];
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

module.exports = { membersRequest, nasdaqQuotesRequest, LISTS };
