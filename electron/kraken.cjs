// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Kraken's public market data (docs.kraken.com/api, REST): tickers, candles and
// order books for the crypto pairs the app lists. No key is needed or sent.
// Kraken's support pages say public endpoints are limited by IP address (and,
// for trades and candles, by pair) and that calling them once a second or less
// stays within the limits; the app keeps to one request a second.

const KRAKEN = 'https://api.kraken.com/0/public';

/** The pairs the app asks for, in Kraken's own names (Dogecoin is XDG on Kraken). */
const PAIRS = new Set(['XBTUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'XDGUSD', 'AVAXUSD', 'LINKUSD', 'LTCUSD', 'DOTUSD']);

/** Candle lengths in minutes the app uses: one minute to one day. */
const INTERVALS = new Set([1, 5, 15, 60, 1440]);

/** The URL for a request from the page, or null when it is not one the app makes. */
function krakenUrl(kind, arg, n) {
  if (typeof arg !== 'string' || arg.length > 200) return null;
  if (kind === 'ticker') {
    const list = arg.split(',');
    if (!list.length || list.length > PAIRS.size || !list.every((p) => PAIRS.has(p))) return null;
    return `${KRAKEN}/Ticker?pair=${list.join(',')}`;
  }
  if (kind === 'ohlc') {
    if (!PAIRS.has(arg) || !INTERVALS.has(Number(n))) return null;
    return `${KRAKEN}/OHLC?pair=${arg}&interval=${Number(n)}`;
  }
  if (kind === 'depth') {
    const count = Number(n);
    if (!PAIRS.has(arg) || !Number.isInteger(count) || count < 1 || count > 50) return null;
    return `${KRAKEN}/Depth?pair=${arg}&count=${count}`;
  }
  return null;
}

/** Kraken reports failures in the body ("EGeneral:Too many requests", "EAPI:Rate limit exceeded"). */
function krakenErrors(text) {
  try {
    const j = JSON.parse(text);
    return Array.isArray(j?.error) ? j.error.filter((e) => typeof e === 'string').map((e) => e.slice(0, 120)) : [];
  } catch {
    return ['The answer was not JSON'];
  }
}

/** The kind of a reported Kraken error, in the provider screen's categories. */
function krakenErrorKind(errors) {
  const all = errors.join(' ');
  if (/rate limit|too many|throttled/i.test(all)) return 'rate-limited';
  if (/unknown asset pair|invalid arguments/i.test(all)) return 'no-data';
  if (/not json/i.test(all)) return 'schema-changed';
  return 'provider-error';
}

module.exports = { krakenUrl, krakenErrors, krakenErrorKind, KRAKEN_PAIRS: [...PAIRS], PER_SECOND: 1 };
