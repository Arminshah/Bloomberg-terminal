// Alpha Vantage's earnings data with the owner's key (ALPHA_VANTAGE_API_KEY), for one US-listed company's screens:
// EARNINGS gives every reported quarter's date, session (pre-market or post-market), EPS expected and reported and
// the surprise; EARNINGS_ESTIMATES gives the analysts' EPS and revenue estimates for each fiscal quarter and year,
// past and coming, with their range and the number of analysts. These fill the revenue estimates of reported
// quarters that Yahoo drops once a quarter is reported.
//
// The free key allows 25 requests a day (the app keeps to 20, shared with CROSSCHECK), so answers are kept on disk
// for three days: a company costs two requests every three days, and reopening it after a restart costs nothing.

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const AV = 'https://www.alphavantage.co/query';
// Alpha Vantage writes class shares with a hyphen (BRK-B).
const SYMBOL = /^[A-Z][A-Z0-9]{0,6}(?:-[A-Z]{1,2})?$/;
const HOUR = 3_600_000;
const TTL = 72 * HOUR;
const KINDS = { earnings: 'EARNINGS', estimates: 'EARNINGS_ESTIMATES' };

/** The request for a kind and ticker, or null when it is not one the app makes. */
function avEarningsRequest(kind, symbol, key) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return null;
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  return { url: `${AV}?function=${KINDS[kind]}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`, ttl: TTL };
}

/** The disk-cache entry for a kind and ticker, scoped to the key so a replaced key never reuses another account's answer. */
function cacheId(kind, symbol, key) {
  return `${kind}:${symbol}:${createHash('sha256').update(String(key)).digest('hex').slice(0, 16)}`;
}

/**
 * Answers kept in one JSON file: {id: {text, at}}, at most `max` entries (the oldest go first). Reads and writes
 * never throw: a missing or damaged file is an empty cache.
 */
function createDiskCache(file, max = 400) {
  let map = null;
  const load = () => {
    if (map) return map;
    map = new Map();
    try {
      const json = JSON.parse(fs.readFileSync(file(), 'utf8'));
      for (const [id, v] of Object.entries(json ?? {})) if (typeof v?.text === 'string' && Number.isFinite(v?.at)) map.set(id, { text: v.text, at: v.at });
    } catch {
      /* no cache yet */
    }
    return map;
  };
  return {
    get: (id) => load().get(id),
    set(id, text, at) {
      const m = load();
      m.delete(id);
      m.set(id, { text, at });
      while (m.size > max) m.delete(m.keys().next().value);
      try {
        const target = file();
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(`${target}.tmp`, JSON.stringify(Object.fromEntries(m)));
        fs.renameSync(`${target}.tmp`, target);
      } catch {
        /* kept in memory only */
      }
    },
  };
}

module.exports = { avEarningsRequest, cacheId, createDiskCache, KINDS, TTL };
