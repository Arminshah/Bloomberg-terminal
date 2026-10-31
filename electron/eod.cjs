// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Optional end-of-day history providers, each with the owner's own key: Massive
// (formerly Polygon.io), Alpha Vantage, Tiingo and Twelve Data. The app uses them to
// check the daily closes it shows against a second and third source (the
// CROSSCHECK screen); none of them is asked unless its key is set.
//
// Each provider's free plan has its own budget, and the app keeps under it:
// Massive Stocks Basic allows 5 calls a minute; Alpha Vantage's free tier is a
// small daily allowance and its full history is premium, so the app asks for
// the latest 100 sessions only; Twelve Data's free plan counts credits per
// minute and per day and describes its use as internal and non-display, so
// the app sends nothing to it until the owner confirms display rights
// (TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED).

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const PROVIDERS = {
  massive: {
    credential: 'MASSIVE_API_KEY',
    perMinute: 5,
    perDay: Infinity,
    // Massive takes the key as a query parameter or a Bearer header; the header keeps it out of the URL.
    url: (t, from, to) => `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(t)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000`,
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  alphavantage: {
    credential: 'ALPHA_VANTAGE_API_KEY',
    perMinute: 1,
    // Kept well under the free daily allowance; a day's budget resets at midnight UTC.
    perDay: 20,
    url: (t, _from, _to, key) => `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(t)}&outputsize=compact&apikey=${encodeURIComponent(key)}`,
    headers: () => ({}),
  },
  tiingo: {
    credential: 'TIINGO_API_KEY',
    // Twenty a minute lets the MPC back-test read its 20 stocks at once; the hourly cap below stays under the plan's 50.
    perMinute: 20,
    // Tiingo's free plan: 50 requests an hour and 1,000 a day; its data may not be stored on disk, and the app
    // keeps it in memory only.
    perHour: 40,
    perDay: 500,
    // Tiingo writes class shares with a dash (BRK-B); its token goes in the Authorization header.
    url: (t, from, to) => `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(t.toLowerCase().replace(/\./g, '-'))}/prices?startDate=${from}&endDate=${to}&format=json`,
    headers: (key) => ({ Authorization: `Token ${key}` }),
    gate: 'TIINGO_ENABLED',
  },
  twelvedata: {
    credential: 'TWELVE_DATA_API_KEY',
    perMinute: 6,
    perDay: 600,
    // The key goes in the Authorization header, as Twelve Data recommends, not in the URL.
    url: (t, from, to) => `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t)}&interval=1day&start_date=${from}&end_date=${to}&order=asc`,
    headers: (key) => ({ Authorization: `apikey ${key}` }),
    gate: 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED',
  },
};

/** The request for a provider, a ticker and a date range, or null when it is not one the app makes. */
function eodRequest(provider, ticker, from, to, key) {
  if (typeof provider !== 'string' || !Object.prototype.hasOwnProperty.call(PROVIDERS, provider)) return null;
  if (typeof ticker !== 'string' || !TICKER.test(ticker) || !ISO.test(String(from)) || !ISO.test(String(to)) || from > to) return null;
  const p = PROVIDERS[provider];
  return { url: p.url(ticker, from, to, key), headers: p.headers(key) };
}

/** Requests sent per provider and UTC day, for the daily budgets. */
const daily = new Map();

/** Counts a request against the day's budget; false when the budget is spent. */
function takeDaily(provider, now = Date.now()) {
  const p = PROVIDERS[provider];
  if (!p || !Number.isFinite(p.perDay)) return true;
  const day = new Date(now).toISOString().slice(0, 10);
  const d = daily.get(provider);
  if (!d || d.day !== day) {
    daily.set(provider, { day, count: 1 });
    return true;
  }
  if (d.count >= p.perDay) return false;
  d.count++;
  return true;
}

/**
 * Massive's dividend record for one US ticker (declared, ex, record and payable dates, cash amount as declared), newest
 * first: the second dividend source for stocks Nasdaq's record does not cover (NYSE listings). Key in the header.
 */
function massiveDividendsRequest(ticker, key) {
  if (typeof ticker !== 'string' || !TICKER.test(ticker)) return null;
  const q = new URLSearchParams({ ticker, order: 'desc', sort: 'ex_dividend_date', limit: '1000' });
  return { url: `https://api.massive.com/v3/reference/dividends?${q.toString()}`, headers: { Authorization: `Bearer ${key}` } };
}

module.exports = { PROVIDERS, eodRequest, takeDaily, massiveDividendsRequest };
