// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Company data from Finnhub's free plan with the owner's key (finnhub.io/docs/api), for US-listed stocks: the
// profile, key ratios ("basic financials"), analysts' recommendation counts by month, the last four quarters'
// EPS against the estimate, the next report date with its estimates, and the past year's reports with expected and
// reported EPS and revenue. The free plan allows 60 requests a
// minute; the app shares 30 a minute between these and Finnhub news, and keeps answers for hours. Price
// targets, candles, dividends and splits are premium on Finnhub and are not asked for.

const BASE = 'https://finnhub.io/api/v1';
// Finnhub writes class shares with a dot (BRK.B).
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;
const HOUR = 3_600_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const KINDS = {
  profile: { path: (s) => `/stock/profile2?symbol=${s}`, ttl: 24 * HOUR },
  metric: { path: (s) => `/stock/metric?symbol=${s}&metric=all`, ttl: 6 * HOUR },
  recommendation: { path: (s) => `/stock/recommendation?symbol=${s}`, ttl: 6 * HOUR },
  earnings: { path: (s) => `/stock/earnings?symbol=${s}`, ttl: 6 * HOUR },
  // The next report within about three months, with its estimates.
  calendar: { path: (s, now) => `/calendar/earnings?from=${iso(now)}&to=${iso(now + 100 * 24 * HOUR)}&symbol=${s}`, ttl: 6 * HOUR },
  // The reports of the last 13 months with the estimates and reported figures, revenue included.
  history: { path: (s, now) => `/calendar/earnings?from=${iso(now - 400 * 24 * HOUR)}&to=${iso(now)}&symbol=${s}`, ttl: 6 * HOUR },
  quote: { path: (s) => `/quote?symbol=${s}`, ttl: 15_000 },
  // Companies in the same sub-industry (GICS-style), for PEERS.
  peers: { path: (s) => `/stock/peers?symbol=${s}&grouping=subIndustry`, ttl: 24 * HOUR },
};

/** The request for a kind of company data and a ticker, or null when it is not one the app makes. */
function finnhubRequest(kind, symbol, now = Date.now()) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return null;
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  const k = KINDS[kind];
  return { url: `${BASE}${k.path(encodeURIComponent(symbol), now)}`, ttl: k.ttl };
}

const finnhubHeaders = (key) => ({ 'X-Finnhub-Token': key });

/**
 * Every company's reports between two dates (no symbol): expected and reported EPS and revenue. The free plan
 * covers the coming reports and about a month of past ones.
 */
function finnhubCalendarRequest(from, to, now = Date.now()) {
  const { dateWindow } = require('./fmp.cjs');
  const w = dateWindow(from, to, 45);
  if (!w) return null;
  const ttl = w.b < now - 3 * 24 * HOUR ? 24 * HOUR : 2 * HOUR;
  return { url: `${BASE}/calendar/earnings?from=${from}&to=${to}`, ttl };
}

module.exports = { KINDS, finnhubRequest, finnhubHeaders, finnhubCalendarRequest };
