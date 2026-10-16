// Analyst research from Financial Modeling Prep (its "stable" API) with the owner's own key: the price
// target consensus and summary, the tally of broker ratings, recent rating actions and annual estimates.
// Checked live on 14 October 2026 with the owner's free key: the price target, ratings and rating actions
// answered for AAPL. The free plan allows 250 requests a day; the app keeps to 220 (providers.cjs DAILY)
// and keeps each answer for hours, so a company's research costs a handful of requests a day.

const FMP = 'https://financialmodelingprep.com/stable';
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
const HOUR = 3_600_000;

const KINDS = {
  consensus: { path: (s) => `/price-target-consensus?symbol=${s}`, ttl: 6 * HOUR },
  summary: { path: (s) => `/price-target-summary?symbol=${s}`, ttl: 6 * HOUR },
  ratings: { path: (s) => `/grades-consensus?symbol=${s}`, ttl: 6 * HOUR },
  grades: { path: (s) => `/grades?symbol=${s}`, ttl: 6 * HOUR },
  estimates: { path: (s) => `/analyst-estimates?symbol=${s}&period=annual&limit=10`, ttl: 24 * HOUR },
};

/** The request for a kind of research and a ticker, or null when it is not one the app makes. */
function fmpRequest(kind, symbol, key) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return null;
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  const k = KINDS[kind];
  return { url: `${FMP}${k.path(encodeURIComponent(symbol))}&apikey=${encodeURIComponent(key)}`, ttl: k.ttl };
}

module.exports = { KINDS, fmpRequest };
