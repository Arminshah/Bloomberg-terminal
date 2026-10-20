// SEC EDGAR for the main process: the SEC's list of companies with their
// tickers, each company's filing history and the financial facts tagged in its
// XBRL filings, from the SEC's own JSON files, and a proxy statement's XBRL
// for executive pay. The page names what it wants (a kind and a CIK or a
// filing); the URL is built here from fixed patterns.
//
// The SEC's fair-access rules (sec.gov "Accessing EDGAR Data" and the
// Webmaster FAQ): automated clients declare a User-Agent naming themselves and
// a contact email, and stay under 10 requests a second. The app sends only the
// User-Agent its owner configured, at most 5 requests a second, and keeps each
// answer for a while so that reopening a screen does not ask again.

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const DATA = 'https://data.sec.gov';
const ARCHIVES = 'https://www.sec.gov/Archives/edgar/data';
// A filing's folder: the filer's CIK without leading zeros and the accession number without dashes.
const FOLDER = /^([1-9]\d{0,9})\/(\d{18})$/;
// The XBRL instance EDGAR extracts from an inline XBRL document (name_htm.xml).
const INSTANCE = /^([1-9]\d{0,9})\/(\d{18})\/([A-Za-z0-9][A-Za-z0-9._-]{0,150}_htm\.xml)$/;
// An ownership filing's own XML (Forms 3, 4 and 5), at the top of its folder.
const OWNERSHIP = /^([1-9]\d{0,9})\/(\d{18})\/([A-Za-z0-9][A-Za-z0-9._-]{0,150}\.xml)$/;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A CIK as the SEC's file names write it: ten digits with leading zeros; null if it is not a CIK. */
function cik10(cik) {
  const s = String(cik ?? '').trim().replace(/^CIK/i, '');
  if (!/^\d{1,10}$/.test(s) || /^0+$/.test(s)) return null;
  return s.padStart(10, '0');
}

/**
 * What each kind of request fetches and how long its answer is kept. Filing
 * lists change whenever a company files, so they are kept for minutes; the
 * company list and older filing pages change rarely.
 */
const KINDS = {
  tickers: { url: () => TICKERS_URL, ttl: 24 * HOUR },
  submissions: {
    url: (arg) => {
      const c = cik10(arg);
      return c ? `${DATA}/submissions/CIK${c}.json` : null;
    },
    ttl: 5 * MINUTE,
  },
  // Older filings, in the extra files a company's submissions name (CIK##########-submissions-###.json).
  'submissions-page': { url: (arg) => (/^CIK\d{10}-submissions-\d{3}\.json$/.test(String(arg)) ? `${DATA}/submissions/${arg}` : null), ttl: 24 * HOUR },
  facts: {
    url: (arg) => {
      const c = cik10(arg);
      return c ? `${DATA}/api/xbrl/companyfacts/CIK${c}.json` : null;
    },
    ttl: HOUR,
  },
  // A filing's list of files, and its XBRL instance: for the pay-versus-performance table of a proxy statement
  // (DEF 14A), which company facts do not include. A filing never changes once made.
  'filing-index': { url: (arg) => (FOLDER.test(arg) ? `${ARCHIVES}/${arg}/index.json` : null), ttl: 24 * HOUR },
  'filing-xbrl': { url: (arg) => (INSTANCE.test(arg) ? `${ARCHIVES}/${arg}` : null), ttl: 7 * 24 * HOUR },
  // An insider's Form 4: the shares bought, sold, received and exercised, and the holdings after.
  'ownership-xml': { url: (arg) => (OWNERSHIP.test(arg) ? `${ARCHIVES}/${arg}` : null), ttl: 7 * 24 * HOUR },
};

/** The URL and keep time for a request from the page, or null when it is not one the app makes. */
function secRequest(kind, arg) {
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return null;
  if (arg != null && (typeof arg !== 'string' || arg.length > 200)) return null;
  const url = KINDS[kind].url(arg ?? '');
  return url ? { url, ttl: KINDS[kind].ttl } : null;
}

/**
 * Answers kept in memory, by URL, up to a total size; the oldest go first.
 * An entry past its keep time is still returned by `get` so a failed refresh
 * can show it, labelled stale, with the time it was fetched.
 */
class SecCache {
  constructor(maxChars) {
    this.maxChars = maxChars;
    this.map = new Map();
    this.size = 0;
  }
  get(url) {
    return this.map.get(url);
  }
  set(url, text, at) {
    const old = this.map.get(url);
    if (old) {
      this.size -= old.text.length;
      this.map.delete(url);
    }
    this.map.set(url, { text, at });
    this.size += text.length;
    for (const [k, v] of this.map) {
      if (this.size <= this.maxChars || k === url) break;
      this.map.delete(k);
      this.size -= v.text.length;
    }
  }
}

/** Requests the app allows itself per second; the SEC's ceiling is 10. */
const PER_SECOND = 5;

/** Why the SEC refused a request, for the status screen. */
function refusalReason(status) {
  if (status === 403) return 'HTTP 403: the SEC refused the request. It refuses requests without a declared User-Agent and clients that exceed its rate limit.';
  if (status === 429) return 'HTTP 429: the SEC asked the app to slow down.';
  return `HTTP ${status}`;
}

module.exports = { cik10, secRequest, SecCache, PER_SECOND, refusalReason, TICKERS_URL, KINDS };
