// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
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
  // Each report's expected and reported EPS and revenue, the past ones and the next: the revenue estimates of
  // reported quarters, which Yahoo drops and Finnhub's free calendar keeps for a month only. The free plan refuses a
  // limit above 5 (HTTP 402, checked live on 25 October 2026); 5 is the next report and the last four.
  earnings: { path: (s) => `/earnings?symbol=${s}&limit=5`, ttl: 12 * HOUR },
};

/** The request for a kind of research and a ticker, or null when it is not one the app makes. */
function fmpRequest(kind, symbol, key) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return null;
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  const k = KINDS[kind];
  return { url: `${FMP}${k.path(encodeURIComponent(symbol))}&apikey=${encodeURIComponent(key)}`, ttl: k.ttl };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 24 * HOUR;
/** A window of calendar dates, YYYY-MM-DD both, at most `maxDays` long; null otherwise. */
function dateWindow(from, to, maxDays) {
  if (typeof from !== 'string' || typeof to !== 'string' || !ISO.test(from) || !ISO.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > maxDays * DAY) return null;
  return { a, b };
}

/** Every company's reports between two dates, with expected and reported EPS and revenue (earnings-calendar). */
function fmpCalendarRequest(from, to, key, now = Date.now()) {
  const w = dateWindow(from, to, 45);
  if (!w) return null;
  // Reports of the last days and the coming ones change as they are published; older ones stay as they are.
  const ttl = w.b < now - 3 * DAY ? 24 * HOUR : 2 * HOUR;
  return { url: `${FMP}/earnings-calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`, ttl };
}

/**
 * The latest trades disclosed by senators or representatives, newest first. The free plan gives the first page of 25
 * only (a larger limit or another page answers HTTP 402, checked live on 25 October 2026); kept two hours.
 */
function fmpCongressRequest(chamber, key) {
  if (chamber !== 'senate' && chamber !== 'house') return null;
  return { url: `${FMP}/${chamber}-latest?page=0&limit=25&apikey=${encodeURIComponent(key)}`, ttl: 2 * HOUR };
}

module.exports = { KINDS, fmpRequest, fmpCalendarRequest, fmpCongressRequest, dateWindow };
